'use client';

import { useEffect, useState, useMemo, useCallback, useTransition, useRef, useLayoutEffect, useDeferredValue } from 'react';
import { Filter, Search, SlidersHorizontal, X, Database, Tv, Radio, ChevronDown, LogOut, UserPlus, KeyRound, ArrowUpDown, ArrowUp, ArrowDown, Download, Settings, DollarSign, List, Mail, Star, Tag } from 'lucide-react';

// Import the invitation modal
import InvitationModal from '../components/InvitationModal';
import CreateUserModal from '../components/CreateUserModal';
import PublicationFilters, { matchesPublication, countDrawerFilters } from '../components/PublicationFilters';
import FilterDrawer from '../components/FilterDrawer';

// Add proper type for formatHeader function
const formatHeader = (header: string): string => {
  return header
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
    .trim(); // Remove any leading/trailing spaces
};

// Only the rows you can actually see are kept in the DOM. A full table is
// ~7,000 cells, which is what made switching tables stutter.
const EST_ROW_HEIGHT = 76;   // starting guess, replaced by real measurements
const OVERSCAN_PX = 900;     // rendered above/below the viewport
const VIEWPORT_FALLBACK = 720;

// Toolbar search placeholder and result noun for each table.
const SEARCH_PLACEHOLDER: Record<string, string> = {
  publication: 'Search name or URL…',
  listicles: 'Search listicles…',
  television: 'Search call sign or program…',
  broadcast_television: 'Search call signs…',
};

const RESULT_NOUN: Record<string, string> = {
  publication: 'publications',
  listicles: 'listicles',
  television: 'TV shows',
  broadcast_television: 'stations',
};

// Define types for your data structures
interface DataItem {
  name?: string;
  price?: number | string; // Changed to accept string for listicles
  do_follow?: boolean | string;
  estimated_time?: string;
  genres?: string;
  regions?: string;
  url?: string;
  example?: string;
  logo?: string;
  // Television fields - UPDATED to match new API structure
  affiliate?: string;
  state?: string;
  calls?: string;
  market?: string;
  location?: string;
  time?: string;
  programName?: string;
  rate?: number;
  // Broadcast TV fields
  CallSign?: string;
  station?: string;
  tat?: string;
  sponsored?: string;
  indexed?: string;
  SegmentLength?: string;
  ProgramName?: string;
  InterviewType?: string;
  Example?: string;
}

interface Filters {
  publication: {
    search: string;
    minPrice: string;
    maxPrice: string;
    genres: string[];
    regions: string[];
    maxTatDays: string; // '' = any turnaround
  };
  listicles: {
    search: string;
    genre: string;
  };
  television: {
    search: string;
    affiliate: string;
    state: string;
  };
  broadcast_television: {
    callSign: string;
  };
}

type TableType = 'publication' | 'listicles' | 'television' | 'broadcast_television';
type SortDirection = 'asc' | 'desc' | null;

// Component to render genre boxes with consistent dark theme styling
const GenreBoxes = ({ genres }: { genres?: string }) => {
  if (!genres) return <span className="text-gray-500">-</span>;
  
  const genreList = genres.split(',').map(g => g.trim()).filter(g => g.length > 0);
  
  if (genreList.length === 0) return <span className="text-gray-500">-</span>;
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {genreList.map((genre, index) => (
        <span
          key={index}
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-white bg-gradient-to-r from-emerald-900 via-teal-800 to-cyan-900 border border-teal-900"
        >
          {genre}
        </span>
      ))}
    </div>
  );
};

// Component to render pricing tiers with consistent dark theme styling
const PricingTiers = ({ priceText }: { priceText?: string | number }) => {
  if (!priceText) return <span className="text-gray-500">-</span>;
  
  // If it's a number, display it normally
  if (typeof priceText === 'number') {
    return <span className="text-[#fbbf24] font-semibold">${priceText.toLocaleString()}</span>;
  }
  
  // If it's a string, parse pricing tiers
  let priceString = priceText.toString();
  
  // First, clean up the string - remove all markdown asterisks and commas
  priceString = priceString.replace(/\*\*/g, '').replace(/,/g, '');
  
  // Check if it contains "Top" (case insensitive)
  if (priceString.toLowerCase().includes('top')) {
    // Find all positions where "Top" appears (case insensitive)
    const topPositions = [];
    let searchString = priceString.toLowerCase();
    let position = searchString.indexOf('top');
    
    while (position !== -1) {
      topPositions.push(position);
      position = searchString.indexOf('top', position + 1);
    }
    
    // If we have more than one "Top", split at the second one
    if (topPositions.length > 1) {
      const tiers = [];
      for (let i = 0; i < topPositions.length; i++) {
        const start = topPositions[i];
        const end = i < topPositions.length - 1 ? topPositions[i + 1] : priceString.length;
        const tierText = priceString.substring(start, end).trim();
        if (tierText) tiers.push(tierText);
      }
      
      return (
        <div className="flex flex-wrap gap-2">
          {tiers.map((tier, index) => {
            // Extract numbers from the tier text
            const numbers = tier.match(/\d+/g) || [];
            const label = tier.match(/Top\s*\d+/i)?.[0] || `Tier ${index + 1}`;
            const price = numbers.length > 1 ? numbers[1] : (numbers[0] || '0');
            
            return (
              <div
                key={index}
                className="inline-flex flex-col items-center px-3 py-2 rounded-lg text-xs font-medium bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 hover:border-[#34d399] transition-all duration-300"
              >
                <span className="text-gray-300 text-xs font-normal mb-0.5">
                  {label}
                </span>
                <span className="text-[#fbbf24] font-bold">
                  ${parseInt(price).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
  }
  
  // If it doesn't match the tier format, display as is
  return <span className="text-[#fbbf24] font-semibold">{priceString}</span>;
};

// Component for Featured Publication Card
const FeaturedPublicationCard = ({ publication }: { publication: DataItem }) => {
  const handleExampleClick = () => {
    // PDF stored in images folder
    const pdfUrl = '/pr-blast-example.pdf';
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = 'PR-Blast-Example.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black rounded-2xl border-2 border-[#34d399] p-6 mb-6 shadow-2xl relative overflow-hidden">
      {/* Sale Badge */}
      <div className="absolute -top-2 -right-2 z-10">
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-bl-2xl rounded-tr-2xl shadow-lg flex items-center space-x-2">
          <Tag size={16} />
          <span className="font-bold text-sm">FEATURED</span>
        </div>
      </div>
      
      {/* Animated background glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#34d399]/5 via-transparent to-[#34d399]/5"></div>
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#34d399] to-[#10b981] rounded-xl flex items-center justify-center shadow-lg">
              <Star size={24} className="text-black" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{publication.name}</h3>
              <div className="flex items-center space-x-2">
                <span className="text-[#fbbf24] font-semibold text-lg">
                  ${typeof publication.price === 'number' ? publication.price.toLocaleString() : publication.price}
                </span>
                <span className="bg-[#fbbf24]/20 text-[#fbbf24] px-2 py-1 rounded-full text-xs font-medium">
                  Best Value
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {publication.genres && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Genres</h4>
              <GenreBoxes genres={publication.genres} />
            </div>
          )}
          
          {publication.regions && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Regions</h4>
              <span className="text-gray-300 text-sm">{publication.regions}</span>
            </div>
          )}
          
          {publication.estimated_time && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Estimated Time</h4>
              <span className="text-gray-300 text-sm">{publication.estimated_time}</span>
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
          <div className="flex items-center space-x-4">
            {/* Always show PDF download button */}
            <button
              onClick={handleExampleClick}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-[#34d399] to-[#10b981] text-black font-semibold rounded-lg transform hover:scale-105 transition-transform duration-200 shadow-lg hover:shadow-xl"
            >
              <Download size={16} />
              <span>Download Example PDF</span>
            </button>
            
            {publication.url && (
              <a
                href={publication.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-4 py-2 border-2 border-[#34d399] text-[#34d399] font-semibold rounded-lg hover:bg-[#34d399] hover:text-black transition-colors duration-200"
              >
                <span>Visit Website</span>
              </a>
            )}
          </div>
          
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-1">Contact for pricing & availability</p>
            <p className="text-[#34d399] font-semibold">sam@digitalnetworkingagency.com</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Page() {
  // Store data for each table type separately
  const [allData, setAllData] = useState<Record<TableType, DataItem[]>>({
    publication: [],
    listicles: [],
    television: [],
    broadcast_television: []
  });

  const [data, setData] = useState<DataItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ 
    publication: { search: '', minPrice: '', maxPrice: '', genres: [], regions: [], maxTatDays: '' },
    listicles: { search: '', genre: '' },
    television: { search: '', affiliate: '', state: '' }, 
    broadcast_television: { callSign: '' } 
  });
  
  const [activeTable, setActiveTable] = useState<TableType>('publication');
  // Read by in-flight fetches to tell whether their table is still on screen.
  const activeTableRef = useRef<TableType>('publication');
  activeTableRef.current = activeTable;
  const [loading, setLoading] = useState<boolean>(false);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [invitationModalOpen, setInvitationModalOpen] = useState<boolean>(false);
  const [createUserModalOpen, setCreateUserModalOpen] = useState<boolean>(false);
  // Rendering a 1000+ row table is heavy; mark the swap as a transition so the
  // click stays responsive instead of freezing while React rebuilds the rows.
  const [isSwitching, startSwitching] = useTransition();
  // Laying out 1000+ rows at once costs ~350ms of frozen frame on every table
  // switch, so rows are rendered in chunks and grown as the user scrolls.
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rowHeights = useRef<Map<number, number>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(VIEWPORT_FALLBACK);
  const [measureTick, setMeasureTick] = useState(0);
  const [userRole, setUserRole] = useState<string>('user');
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Check screen size for responsive behavior
  useEffect(() => {
    const checkScreenSize = () => {
      // Mobile responsive behavior can be added here if needed
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Get user role from API
  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const userData = await response.json();
          setUserRole(userData.role || 'user');
        }
      } catch (error) {
        console.error('Failed to get user role:', error);
      }
    };
    
    checkUserRole();
  }, []);

  // Function to fetch data based on table type
  const fetchData = async (tableType: TableType) => {
    // Already loaded once this session — show it immediately instead of
    // refetching, which is what made switching tabs stutter.
    const cached = allData[tableType];
    if (cached && cached.length > 0) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let endpoint: string;
      switch (tableType) {
        case 'publication':
          endpoint = '/api/data';
          break;
        case 'listicles':
          endpoint = '/api/listicles';
          break;
        case 'television':
          endpoint = '/api/television';
          break;
        case 'broadcast_television':
          endpoint = '/api/broadcast_television';
          break;
        default:
          endpoint = '/api/data';
      }
      
      const res = await fetch(endpoint);
      const fetchedData: DataItem[] = await res.json();
      
      // Always cache the response, but only show it if the user is still on
      // that table — a slow response must not overwrite a newer switch.
      setAllData(prev => ({
        ...prev,
        [tableType]: fetchedData
      }));
      if (activeTableRef.current === tableType) setData(fetchedData);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (activeTableRef.current === tableType) setData([]);
    } finally {
      if (activeTableRef.current === tableType) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTable);
    // Reset sort when changing tables
    setSortDirection(null);
  }, [activeTable]);

  // Memoize filtered and sorted data to prevent unnecessary recalculations
  // Typing updates the search box at once; filtering 1,000+ rows runs against
  // a deferred copy so keystrokes never wait on it.
  const deferredFilters = useDeferredValue(filters);

  const filteredAndSortedData = useMemo(() => {
    // Enhanced filtering logic that searches within genres
    const filtered = data.filter((item: DataItem) => {
      if (activeTable === 'publication') {
        return matchesPublication(item, deferredFilters.publication);
      } else if (activeTable === 'listicles') {
        const listFilters = deferredFilters[activeTable] as Filters['listicles'];
        const searchMatch = item.name?.toLowerCase().includes((listFilters.search || '').toLowerCase());
        
        // Enhanced genre matching for listicles too
        const genreMatch = listFilters.genre === '' || 
          (item.genres && item.genres.toLowerCase().includes(listFilters.genre.toLowerCase()));
        
        return searchMatch && genreMatch;
      } else if (activeTable === 'television') {
        const tvFilters = deferredFilters[activeTable] as Filters['television'];
        const searchMatch = tvFilters.search === '' || 
          item.calls?.toLowerCase().includes(tvFilters.search.toLowerCase()) ||
          item.programName?.toLowerCase().includes(tvFilters.search.toLowerCase());
        const affiliateMatch = tvFilters.affiliate === '' || 
          item.affiliate?.toLowerCase().includes(tvFilters.affiliate.toLowerCase());
        const stateMatch = tvFilters.state === '' ||
          item.state?.toLowerCase().includes(tvFilters.state.toLowerCase());
        return searchMatch && affiliateMatch && stateMatch;
      } else if (activeTable === 'broadcast_television') {
        const bcFilters = deferredFilters[activeTable] as Filters['broadcast_television'];
        return item.CallSign?.toLowerCase().includes((bcFilters.callSign || '').toLowerCase());
      }
      return true;
    });

    // Apply sorting to filtered data (skip for listicles)
    return [...filtered].sort((a, b) => {
      if (sortDirection === null || activeTable === 'listicles') return 0;
      
      const priceField = activeTable === 'publication' ? 'price' : 'rate';
      const aValue = a[priceField as keyof DataItem] as number || 0;
      const bValue = b[priceField as keyof DataItem] as number || 0;
      
      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
  }, [data, deferredFilters, activeTable, sortDirection]);

  // Find and separate the featured PR Blast publication
  const featuredPublication = useMemo(() => {
    if (activeTable !== 'publication') return null;
    return filteredAndSortedData.find(item => 
      item.name?.toLowerCase().includes('pr blast') && 
      item.name?.toLowerCase().includes('200') &&
      item.name?.toLowerCase().includes('affiliate')
    );
  }, [filteredAndSortedData, activeTable]);

  // Remove featured publication from regular data display
  const regularData = useMemo(() => {
    if (!featuredPublication) return filteredAndSortedData;
    return filteredAndSortedData.filter(item => item !== featuredPublication);
  }, [filteredAndSortedData, featuredPublication]);

  // Memoize visible columns - Updated to use auto width instead of fixed
  const visibleColumns = useMemo(() => {
    const dataToUse = regularData.length > 0 ? regularData : filteredAndSortedData;
    if (!dataToUse.length) return [];
    const allKeys = Object.keys(dataToUse[0]);
    
    if (activeTable === 'publication') {
      const priorityOrder = ['name', 'price', 'genres', 'regions', 'example', 'estimated_time', 'do_follow'];
      const orderedKeys = priorityOrder.filter(key => allKeys.includes(key));
      const remainingKeys = allKeys.filter(key => !priorityOrder.includes(key) && key !== 'url' && key !== 'logo');
      return [...orderedKeys, ...remainingKeys].slice(0, 6);
    } else if (activeTable === 'listicles') {
      const priorityOrder = ['name', 'price', 'genres', 'regions', 'example', 'estimated_time'];
      return priorityOrder.filter(key => allKeys.includes(key));
    } else if (activeTable === 'television') {
      const priorityOrder = ['affiliate', 'calls', 'programName', 'state', 'market', 'location', 'rate'];
      return priorityOrder.filter(key => allKeys.includes(key));
    } else {
      return allKeys.filter(key => key !== 'url' && key !== 'logo' && key !== 'example').slice(0, 5);
    }
  }, [regularData, filteredAndSortedData, activeTable]);

  // Optimize filter updates with useCallback
  const updateFilters = useCallback((newFilters: Partial<Filters[TableType]>) => {
    setFilters(prev => ({
      ...prev,
      [activeTable]: { ...prev[activeTable], ...newFilters }
    }));
  }, [activeTable]);

  // Every genre / region / price actually present in the publication data, so
  // the filter chips always reflect the real catalogue.
  const publicationFacets = useMemo(() => {
    // Only ever derived from the publication dataset. Depending on `data` too
    // made this rescan all 1,100+ rows on every table switch.
    const source = allData.publication ?? [];
    const genres = new Set<string>();
    const regions = new Set<string>();
    let min = Infinity;
    let max = 0;

    for (const item of source) {
      for (const g of String(item.genres ?? '').split(/[,/|]/)) {
        const v = g.trim();
        if (v) genres.add(v);
      }
      for (const r of String(item.regions ?? '').split(/[,/|]/)) {
        const v = r.trim();
        if (v) regions.add(v);
      }
      const price = typeof item.price === 'number' ? item.price : NaN;
      if (Number.isFinite(price)) {
        if (price < min) min = price;
        if (price > max) max = price;
      }
    }

    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    return {
      genres: [...genres].sort(collator.compare),
      regions: [...regions].sort(collator.compare),
      priceMin: Number.isFinite(min) ? Math.floor(min) : 0,
      priceMax: max > 0 ? Math.ceil(max) : 10000,
    };
  }, [allData.publication]);

  // Cmd/Ctrl+K jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A new table (or filter) starts from the top with no stale measurements.
  useEffect(() => {
    rowHeights.current.clear();
    setScrollTop(0);
    setMeasureTick((t) => t + 1);
    if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
  }, [activeTable, filteredAndSortedData]);

  // Track how tall the scroll box is so the window covers it.
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (!box) return;
    const update = () => setViewportHeight(box.clientHeight || VIEWPORT_FALLBACK);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [activeTable]);

  // Which slice of rows to actually render, plus the spacer heights that keep
  // the scrollbar honest. Heights start as an estimate and are replaced with
  // real measurements as rows are rendered.
  const virtualWindow = useMemo(() => {
    const total = regularData.length;
    const heightAt = (i: number) => rowHeights.current.get(i) ?? EST_ROW_HEIGHT;

    const top = Math.max(0, scrollTop - OVERSCAN_PX);
    let start = 0;
    let padTop = 0;
    while (start < total && padTop + heightAt(start) <= top) {
      padTop += heightAt(start);
      start++;
    }

    const budget = viewportHeight + OVERSCAN_PX * 2;
    let end = start;
    let used = 0;
    while (end < total && used < budget) {
      used += heightAt(end);
      end++;
    }

    let padBottom = 0;
    for (let i = end; i < total; i++) padBottom += heightAt(i);

    return { start, end, padTop, padBottom };
    // measureTick forces a recompute once real heights are known.
  }, [regularData, scrollTop, viewportHeight, measureTick]);

  // Measure each row once, the first time it is rendered. Re-measuring on every
  // render made scrolling ping-pong between renders and cost ~150ms a frame.
  useLayoutEffect(() => {
    const box = scrollBoxRef.current;
    if (!box) return;

    const rows = box.querySelectorAll<HTMLTableRowElement>('tr[data-row-index]');
    let drift = 0;
    rows.forEach((tr) => {
      const index = Number(tr.dataset.rowIndex);
      if (rowHeights.current.has(index)) return; // already known
      const measured = tr.offsetHeight;
      if (measured > 0) {
        rowHeights.current.set(index, measured);
        drift += Math.abs(measured - EST_ROW_HEIGHT);
      }
    });

    // Only recompute when the estimates were off by enough to shift the layout.
    if (drift > 24) setMeasureTick((t) => t + 1);
  });

  // Coalesce scroll events into one state update per frame.
  const scrollFrame = useRef<number | null>(null);
  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const next = e.currentTarget.scrollTop;
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      setScrollTop(next);
    });
  }, []);

  // Optimize table switch with useCallback
  const handleTableSwitch = useCallback((tableType: TableType) => {
    setFiltersOpen(false);
    startSwitching(() => setActiveTable(tableType));
  }, []);

  // Optimize sort handling with useCallback
  const handleSort = useCallback(() => {
    if (activeTable === 'listicles') return; // No sorting for listicles
    
    if (sortDirection === null) {
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortDirection(null);
    }
  }, [activeTable, sortDirection]);

  // Get sort icon
  const getSortIcon = () => {
    if (sortDirection === 'asc') return <ArrowUp size={16} className="text-black" />;
    if (sortDirection === 'desc') return <ArrowDown size={16} className="text-black" />;
    return <ArrowUpDown size={16} className="text-black" />;
  };

  // Get sort label
  const getSortLabel = () => {
    const priceField = activeTable === 'publication' ? 'price' : 'rate';
    const fieldName = priceField === 'price' ? 'Price' : 'Rate';
    
    if (sortDirection === 'asc') return `${fieldName} (Low to High)`;
    if (sortDirection === 'desc') return `${fieldName} (High to Low)`;
    return `Sort by ${fieldName}`;
  };

  // Get current filters based on active table
  const currentFilters = filters[activeTable];

  // The toolbar search box maps onto whichever field each table searches by.
  const searchKey = activeTable === 'broadcast_television' ? 'callSign' : 'search';
  const currentSearch = String((currentFilters as Record<string, unknown>)[searchKey] ?? '');
  const setCurrentSearch = (value: string) =>
    updateFilters({ [searchKey]: value } as Partial<Filters[TableType]>);

  // How many filters are set inside the drawer (shown as a badge on the button).
  const drawerFilterCount =
    activeTable === 'publication'
      ? countDrawerFilters(filters.publication)
      : activeTable === 'listicles'
        ? (filters.listicles.genre ? 1 : 0)
        : activeTable === 'television'
          ? (filters.television.affiliate ? 1 : 0) + (filters.television.state ? 1 : 0)
          : 0;

  const getTableIcon = (type: TableType) => {
    switch (type) {
      case 'publication': return <Database size={18} />;
      case 'listicles': return <List size={18} />;
      case 'television': return <Tv size={18} />;
      case 'broadcast_television': return <Radio size={18} />;
      default: return <Database size={18} />;
    }
  };

  const getTableLabel = (type: TableType) => {
    switch (type) {
      case 'publication': return 'Publications';
      case 'listicles': return 'Listicles';
      case 'television': return 'Television';
      case 'broadcast_television': return 'Broadcast TV';
      default: return 'Publications';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(52, 211, 153, 0.3); }
          50% { box-shadow: 0 0 30px rgba(52, 211, 153, 0.5); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
        }
        
        .animate-slideDown {
          animation: slideDown 0.5s ease-out;
        }
        
        .animate-pulse-custom {
          animation: pulse 2s infinite;
        }
        
        .animate-glow {
          animation: glow 2s infinite;
        }
        
        .table-swap {
          animation: tableSwap 0.22s ease-out;
        }

        .table-swap.is-switching {
          opacity: 0.55;
          transition: opacity 0.12s ease-out;
        }

        @keyframes tableSwap {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        
        .filter-panel-enter {
          animation: slideDown 0.3s ease-out;
        }
        
        .lime-gradient {
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
        }
        
        .hover-lift:hover {
          transform: translateY(-1px) !important;
          transition: transform 0.15s ease !important;
        }
        
        .hover-glow:hover {
          box-shadow: 0 0 15px rgba(52, 211, 153, 0.3) !important;
          transition: box-shadow 0.15s ease !important;
        }
        
        .hover-scale:hover {
          transform: scale(1.02) !important;
          transition: transform 0.15s ease !important;
        }
        
        .transition-fast {
          transition: all 0.15s ease;
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-gray-800 lime-gradient sticky top-0 z-50 animate-slideDown shimmer-effect">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3 animate-slideInLeft">
              <div className="w-24 h-16 rounded-lg flex items-center justify-center shadow-md shadow-indigo-500/10">
                <img 
                  src="/logo-money.png" 
                  alt="Digital Networking Agency Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-black">Digital Networking Agency</h1>
                <p className="text-xs text-black/70">Publication Dashboard</p>
              </div>
            </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-6">
                <div className="text-sm">
                  <span className="text-black/70">Results:</span>
                  <span className="ml-1 text-black font-bold">{filteredAndSortedData.length}</span>
                </div>
              </div>
              {/* Admin Only - Pricing Factors Button */}
              {userRole === 'admin' && (
                <button 
                  onClick={() => window.location.href = '/pricing-factors'}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <DollarSign size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Pricing</span>
                </button>
              )}
              
              {/* Admin Only - Settings Button */}
              {userRole === 'admin' && (
                <button 
                  onClick={() => window.location.href = '/users'}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <Settings size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Settings</span>
                </button>
              )}
              
              {/* Admin Only - Create User Button */}
              {userRole === 'admin' && (
                <button 
                  onClick={() => setCreateUserModalOpen(true)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <KeyRound size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Create User</span>
                </button>
              )}

              {/* Admin Only - Send Invitation Button */}
              {userRole === 'admin' && (
                <button 
                  onClick={() => setInvitationModalOpen(true)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <UserPlus size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Invite User</span>
                </button>
              )}
              
              <button 
                onClick={async () => {
                  try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/login';
                  } catch (error) {
                    console.error('Logout failed:', error);
                    window.location.href = '/login';
                  }
                }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
              >
                <LogOut size={16} className="text-black" />
                <span className="hidden sm:inline text-sm text-black font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Information Section */}
      <div className="bg-gray-900/90 backdrop-blur-sm border-b border-gray-800 animate-fadeIn">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 hover-glow">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              <div className="flex-1">
                <div className="space-y-3">
                  <p className="text-gray-300 text-sm leading-relaxed">
                    <span className="text-[#34d399] font-medium">Important Notice:</span> Once we have published the article for you, any further edits may include an extra charge.
                  </p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Digital Networking Agency will use reasonable good faith efforts to ensure that such article will remain publicly available in the applicable publication for at least 12 months.
                  </p>
                  
                  {/* Enhanced Contact Section */}
                  <div className="bg-gradient-to-r from-gray-800/80 to-gray-900/80 rounded-xl border border-[#34d399]/30 p-4 mt-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#34d399] to-[#10b981] rounded-full flex items-center justify-center shadow-lg">
                        <Mail size={18} className="text-black" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[#34d399] text-sm font-medium">For orders please contact:</p>
                        <a 
                          className="text-white hover:text-[#34d399] font-bold text-lg transition-colors duration-300 hover:underline"
                        >
                          sam@digitalnetworkingagency.com
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 lg:ml-8">
                <button
                  onClick={() => window.open('https://docs.google.com/document/d/1hFgAovf6BFj71lvEWBuj-q3I3UFxGSoWjU6KkzvUwW4/edit?usp=sharing', '_blank')}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 border border-[#34d399] text-[#34d399] hover:bg-[#34d399] hover:text-black font-medium rounded-lg transition-all hover-lift"
                >
                  <Download size={16} />
                  <span>Download PR Questionnaire</span>
                </button>
                
                <button
                  onClick={() => window.open('https://docs.google.com/document/d/1VKongYU8yeVJQq8JgAmc80c8BWp2Ditj4CrQPdR77r8/edit?addon_store&tab=t.0', '_blank')}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 border border-[#34d399] text-[#34d399] hover:bg-[#34d399] hover:text-black font-medium rounded-lg transition-all hover-lift"
                >
                  <Download size={16} />
                  <span>Download TV Questionnaire</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm animate-fadeIn">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 py-4 overflow-x-auto">
            {(['publication', 'listicles', 'television', 'broadcast_television'] as TableType[]).map((type, index) => (
              <button
                key={type}
                onClick={() => handleTableSwitch(type)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                  activeTable === type
                    ? 'lime-gradient text-black shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800 border border-gray-700'
                }`}
              >
                {getTableIcon(type)}
                <span>{getTableLabel(type)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTable === type ? 'bg-black/20 text-black' : 'bg-gray-700 text-gray-300'
                }`}>
                  {type === activeTable ? filteredAndSortedData.length : allData[type].length}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Featured Publication Card - Only show for publications tab */}
        {activeTable === 'publication' && featuredPublication && (
          <FeaturedPublicationCard publication={featuredPublication} />
        )}

        {/* Toolbar: search is always visible; everything else lives in the drawer */}
        <div className="filter-toolbar mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={currentSearch}
              onChange={(e) => setCurrentSearch(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER[activeTable]}
              className="toolbar-search"
              aria-label="Search"
            />
            {currentSearch ? (
              <button
                type="button"
                onClick={() => {
                  setCurrentSearch('');
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-white"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="toolbar-kbd">⌘K</kbd>
            )}
          </div>

          {activeTable !== 'broadcast_television' && (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={`toolbar-filters${drawerFilterCount > 0 ? ' has-filters' : ''}`}
            >
              <SlidersHorizontal size={16} />
              <span>{drawerFilterCount > 0 ? 'Filters' : 'Add filters'}</span>
              {drawerFilterCount > 0 && <span className="toolbar-badge">{drawerFilterCount}</span>}
            </button>
          )}

          {activeTable !== 'listicles' && (
            <button
              type="button"
              onClick={handleSort}
              className={`toolbar-button${sortDirection ? ' is-active' : ''}`}
            >
              {getSortIcon()}
              <span className="hidden sm:inline">{getSortLabel()}</span>
              <span className="sm:hidden">Sort</span>
            </button>
          )}

          {(drawerFilterCount > 0 || currentSearch || sortDirection) && (
            <button
              type="button"
              onClick={() => {
                if (activeTable === 'publication') {
                  updateFilters({ search: '', minPrice: '', maxPrice: '', genres: [], regions: [], maxTatDays: '' });
                } else if (activeTable === 'listicles') {
                  updateFilters({ search: '', genre: '' });
                } else if (activeTable === 'television') {
                  updateFilters({ search: '', affiliate: '', state: '' });
                } else if (activeTable === 'broadcast_television') {
                  updateFilters({ callSign: '' });
                }
                setSortDirection(null);
              }}
              className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-1"
            >
              Clear all
            </button>
          )}
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Showing{' '}
          <span className="font-semibold text-white tabular-nums">{filteredAndSortedData.length.toLocaleString()}</span>
          {' '}of{' '}
          <span className="tabular-nums">{data.length.toLocaleString()}</span>{' '}
          {RESULT_NOUN[activeTable]}
          {sortDirection && activeTable !== 'listicles' && (
            <span className="ml-2 text-[#fcd34d]">
              · {activeTable === 'publication' ? 'Price' : 'Rate'} {sortDirection === 'asc' ? 'low to high' : 'high to low'}
            </span>
          )}
        </p>

        {/* Filter drawers */}
        <PublicationFilters
          open={filtersOpen && activeTable === 'publication'}
          onClose={() => setFiltersOpen(false)}
          applied={filters.publication}
          onApply={(next) => updateFilters({ ...next, search: filters.publication.search })}
          items={allData.publication ?? []}
          genres={publicationFacets.genres}
          regions={publicationFacets.regions}
        />

        <FilterDrawer
          open={filtersOpen && (activeTable === 'listicles' || activeTable === 'television')}
          onClose={() => setFiltersOpen(false)}
          onReset={() =>
            activeTable === 'listicles'
              ? updateFilters({ genre: '' })
              : updateFilters({ affiliate: '', state: '' })
          }
          resetDisabled={drawerFilterCount === 0}
          footerLabel={`Show ${filteredAndSortedData.length.toLocaleString()} ${RESULT_NOUN[activeTable]}`}
        >
          {activeTable === 'listicles' ? (
            <section className="filter-section">
              <h3 className="filter-label">Genre</h3>
              <input
                type="text"
                placeholder="e.g. Business, Tech…"
                value={(filters.listicles as Filters['listicles']).genre}
                onChange={(e) => updateFilters({ genre: e.target.value })}
                className="filter-input"
              />
            </section>
          ) : (
            <>
              <section className="filter-section">
                <h3 className="filter-label">Affiliate</h3>
                <input
                  type="text"
                  placeholder="CBS, NBC, ABC…"
                  value={(filters.television as Filters['television']).affiliate}
                  onChange={(e) => updateFilters({ affiliate: e.target.value })}
                  className="filter-input"
                />
              </section>
              <section className="filter-section">
                <h3 className="filter-label">State</h3>
                <input
                  type="text"
                  placeholder="e.g. Texas"
                  value={(filters.television as Filters['television']).state}
                  onChange={(e) => updateFilters({ state: e.target.value })}
                  className="filter-input"
                />
              </section>
            </>
          )}
        </FilterDrawer>

        {/* Table */}
        <div key={activeTable} className={`bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-800 overflow-hidden shadow-2xl table-swap${isSwitching ? ' is-switching' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#34d399]"></div>
                <span className="text-gray-400">Loading data...</span>
              </div>
            </div>
          ) : (
            <div
              ref={scrollBoxRef}
              onScroll={handleTableScroll}
              className="overflow-auto table-scroll"
              style={{ maxHeight: 'min(72vh, 820px)' }}
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 lime-gradient">
                    {visibleColumns.map((header) => (
                      <th 
                        key={header} 
                        className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider"
                      >
                        {formatHeader(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {virtualWindow.padTop > 0 && (
                    <tr aria-hidden="true" style={{ height: virtualWindow.padTop }}>
                      <td colSpan={visibleColumns.length} className="p-0 border-0" />
                    </tr>
                  )}
                  {regularData.length > 0 ? (
                    regularData.slice(virtualWindow.start, virtualWindow.end).map((row, offset) => {
                      const idx = virtualWindow.start + offset;
                      return (
                      <tr 
                        key={idx}
                        data-row-index={idx}
                        className="hover:bg-gray-800/50 transition-colors duration-150"
                      >
                        {visibleColumns.map((key) => {
                          const cellValue = row[key as keyof DataItem];
                          return (
                            <td key={key} className="px-4 sm:px-6 py-4 text-sm">
                              {key === 'genres' ? (
                                <GenreBoxes genres={cellValue as string} />
                              ) : key === 'example' && row.example ? (
                                <a
                                  href={activeTable === 'television' ? row.example : `https://cdn.sanity.io/images/8n90kyzz/production/${row.example}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block transition-all duration-300 hover:scale-110"
                                >
                                  <div className="w-10 h-10 bg-gradient-to-br from-[#34d399] to-[#10b981] rounded-lg flex items-center justify-center shadow-lg hover:shadow-xl">
                                    <span className="text-black text-lg">🖼️</span>
                                  </div>
                                </a>
                              ) : key === 'name' || key === 'programName' ? (
                                <div className="flex items-start space-x-3">
                                  {row.logo && (
                                    <img
                                      src={`https://cdn.sanity.io/images/8n90kyzz/production/${row.logo}`}
                                      alt="logo"
                                      className="w-8 h-8 rounded-lg object-cover border border-gray-700 hover:scale-110 transition-transform duration-300 flex-shrink-0 mt-1"
                                    />
                                  )}
                                  <div className="min-w-0">
                                    {row.url ? (
                                      <a 
                                        href={row.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[#34d399] hover:text-[#10b981] font-medium transition-colors block break-words leading-5"
                                      >
                                        {cellValue}
                                      </a>
                                    ) : (
                                      <span className="text-gray-300 font-medium block break-words leading-5">{cellValue}</span>
                                    )}
                                  </div>
                                </div>
                              ) : key === 'price' ? (
                                activeTable === 'listicles' ? (
                                  <PricingTiers priceText={cellValue as string | number} />
                                ) : (
                                  <span className="text-[#fbbf24] font-semibold">
                                    ${(cellValue as number)?.toLocaleString()}
                                  </span>
                                )
                              ) : key === 'rate' ? (
                                <span className="text-[#fbbf24] font-semibold">
                                  ${(cellValue as number)?.toLocaleString()}
                                </span>
                              ) : key === 'affiliate' ? (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  cellValue === 'CBS' ? 'bg-blue-900 text-blue-200' :
                                  cellValue === 'NBC' ? 'bg-purple-900 text-purple-200' :
                                  cellValue === 'ABC' ? 'bg-red-900 text-red-200' :
                                  cellValue === 'Fox' ? 'bg-orange-900 text-orange-200' :
                                  cellValue === 'CW' ? 'bg-green-900 text-green-200' :
                                  cellValue === 'INDIE' ? 'bg-gray-900 text-gray-200' :
                                  'bg-gray-800 text-gray-300'
                                }`}>
                                  {cellValue}
                                </span>
                              ) : key === 'regions' || key === 'calls' || key === 'market' || key === 'location' || key === 'state' ? (
                                <div className="text-gray-300 break-words leading-5 max-w-xs">
                                  {cellValue}
                                </div>
                              ) : (
                                <span className="text-gray-300 break-words block leading-5">{cellValue}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={visibleColumns.length} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center space-y-3 animate-fadeIn">
                          <Database size={48} className="text-gray-600" />
                          <h3 className="text-lg font-medium text-gray-300">No results found</h3>
                          <p className="text-gray-500">Try adjusting your filters to see more data</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {virtualWindow.padBottom > 0 && (
                    <tr aria-hidden="true" style={{ height: virtualWindow.padBottom }}>
                      <td colSpan={visibleColumns.length} className="p-0 border-0" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 lime-gradient mt-12 animate-fadeIn">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
            <p className="text-sm text-black/80 font-medium">© 2025 Digital Networking Agency. All rights reserved.</p>
            <div className="flex items-center space-x-6">
              <a href="#" className="text-sm text-black/70 hover:text-black transition-colors font-medium hover-lift">Privacy</a>
              <a href="#" className="text-sm text-black/70 hover:text-black transition-colors font-medium hover-lift">Terms</a>
              <a href="#" className="text-sm text-black/70 hover:text-black transition-colors font-medium hover-lift">Support</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Admin Invitation Modal */}
      <InvitationModal 
        isOpen={invitationModalOpen}
        onClose={() => setInvitationModalOpen(false)}
        userRole={userRole}
      />

      {/* Admin Create User Modal */}
      <CreateUserModal
        isOpen={createUserModalOpen}
        onClose={() => setCreateUserModalOpen(false)}
        userRole={userRole}
      />
    </div>
  );
}