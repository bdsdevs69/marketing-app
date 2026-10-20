'use client';

import { useEffect, useState, useMemo, useCallback, useTransition, useRef, useDeferredValue } from 'react';
import { Filter, Search, SlidersHorizontal, X, Mic, Database, Tv, Radio, LogOut, UserPlus, KeyRound, ArrowUpDown, ArrowUp, ArrowDown, Download, Settings, DollarSign, List, Star, Tag } from 'lucide-react';

// Import the invitation modal
import InvitationModal from '../components/InvitationModal';
import CreateUserModal from '../components/CreateUserModal';
import PublicationFilters, { matchesPublication, countDrawerFilters, CLEARED_DRAWER } from '../components/PublicationFilters';
import FilterDrawer from '../components/FilterDrawer';
import CatalogTable from '../components/CatalogTable';
import ScrollButtons from '../components/ScrollButtons';
import PortalHero from '../components/PortalHero';
import {
  broadcastColumns,
  listicleColumns,
  podcastColumns,
  publicationColumns,
  televisionColumns,
  type Row,
} from '../components/catalog-columns';

// Add proper type for formatHeader function
const formatHeader = (header: string): string => {
  return header
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
    .trim(); // Remove any leading/trailing spaces
};



// Shown first in the publication table regardless of sorting.
const PINNED_PUBLICATION = 'dna-pr-blast';

// Height of the pinned toolbar; the table's column headings stick right under it.
const TOOLBAR_STICKY_HEIGHT = 72;

// Toolbar search placeholder and result noun for each table.
const SEARCH_PLACEHOLDER: Record<string, string> = {
  publication: 'Find a publication or domain…',
  listicles: 'Search listicles…',
  television: 'Search call sign or program…',
  broadcast_television: 'Search call signs…',
  podcasts: 'Search podcast, category or outlet…',
};

const RESULT_NOUN: Record<string, string> = {
  publication: 'publications',
  listicles: 'listicles',
  television: 'TV shows',
  broadcast_television: 'stations',
  podcasts: 'podcasts',
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
    minVisits: string;
    badges: string[];
    sponsored: string[];
    doFollow: string[];
    indexed: string[];
    llm: string[];
    niches: string[];
    listiclesOnly: boolean;
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
  podcasts: {
    search: string;
  };
}

type TableType = 'publication' | 'listicles' | 'television' | 'broadcast_television' | 'podcasts';

const ROLE_CACHE_KEY = 'dna-pricing-role';

const ALL_TABLES: TableType[] = ['publication', 'listicles', 'television', 'broadcast_television', 'podcasts'];
const TABLE_ENDPOINTS: Record<TableType, string> = {
  publication: '/api/data',
  listicles: '/api/listicles',
  television: '/api/television',
  broadcast_television: '/api/broadcast_television',
  podcasts: '/api/podcasts',
};
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
    broadcast_television: [],
    podcasts: []
  });

  const [data, setData] = useState<DataItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ 
    publication: { search: '', ...CLEARED_DRAWER },
    listicles: { search: '', genre: '' },
    television: { search: '', affiliate: '', state: '' }, 
    broadcast_television: { callSign: '' },
    podcasts: { search: '' }
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
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [userRole, setUserRole] = useState<string>('user');
  // Cheapest first by default.
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Check screen size for responsive behavior
  useEffect(() => {
    const checkScreenSize = () => {
      // Mobile responsive behavior can be added here if needed
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Get user role from API. Until it answers, the admin buttons are rendered
  // but shown only if the last visit was an admin's (html[data-role], set in
  // layout.tsx before first paint), so they don't pop in on every refresh.
  // It only affects which buttons show — admin actions are checked server-side.
  const [roleKnown, setRoleKnown] = useState(false);
  const showAdminButtons = userRole === 'admin' || !roleKnown;

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const userData = await response.json();
          const role = userData.role || 'user';
          setUserRole(role);
          try { window.localStorage.setItem(ROLE_CACHE_KEY, role); } catch {}
          if (role === 'admin') document.documentElement.dataset.role = 'admin';
          else delete document.documentElement.dataset.role;
        }
      } catch (error) {
        console.error('Failed to get user role:', error);
      } finally {
        setRoleKnown(true);
      }
    };
    
    checkUserRole();
  }, []);

  // One request per table, shared: the initial load and tab switches await
  // the same promise instead of fetching the same rows twice.
  const inflight = useRef<Partial<Record<TableType, Promise<DataItem[]>>>>({});
  // Tables whose request has finished (loaded or failed).
  const [settled, setSettled] = useState<Partial<Record<TableType, boolean>>>({});
  const loadTable = useCallback((tableType: TableType) => {
    if (!inflight.current[tableType]) {
      const endpoint = TABLE_ENDPOINTS[tableType];
      inflight.current[tableType] = fetch(endpoint)
        .then(async (res) => {
          const body: unknown = await res.json();
          // A failed request returns an error object, not rows; never put
          // that into the table (it would crash the page).
          if (!res.ok || !Array.isArray(body)) throw new Error(`${endpoint} returned ${res.status}`);
          const rows = body as DataItem[];
          setAllData((prev) => ({ ...prev, [tableType]: rows }));
          return rows;
        })
        .catch((error) => {
          delete inflight.current[tableType]; // allow a retry on the next switch
          throw error;
        })
        .finally(() => setSettled((prev) => (prev[tableType] ? prev : { ...prev, [tableType]: true })));
    }
    return inflight.current[tableType]!;
  }, []);

  // Show a table: instantly from cache, otherwise once its request lands —
  // but only if the user is still on that table.
  const fetchData = async (tableType: TableType) => {
    const cached = allData[tableType];
    if (cached && cached.length > 0) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await loadTable(tableType);
      if (activeTableRef.current === tableType) setData(rows);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (activeTableRef.current === tableType) setData([]);
    } finally {
      if (activeTableRef.current === tableType) setLoading(false);
    }
  };

  // Load every table at once on arrival; the hero only waits for the two it
  // shows (publications and listicles), so a slow TV feed can't hold it up.
  useEffect(() => {
    for (const t of ALL_TABLES) loadTable(t).catch(() => {});
  }, [loadTable]);
  const heroReady = Boolean(settled.publication && settled.listicles);

  useEffect(() => {
    fetchData(activeTable);
    // Reset sort when changing tables
    setSortDirection('asc');
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
      } else if (activeTable === 'podcasts') {
        const q = (deferredFilters.podcasts.search || '').trim().toLowerCase();
        if (!q) return true;
        const pod = item as unknown as Record<string, unknown>;
        return [pod.name, pod.category, pod.companion_article].some((v) => String(v ?? '').toLowerCase().includes(q));
      }
      return true;
    });

    // Apply sorting to filtered data (listicles sort by their cheapest tier)
    const sorted = [...filtered].sort((a, b) => {
      if (sortDirection === null) return 0;
      
      const priceField = activeTable === 'television' || activeTable === 'broadcast_television' ? 'rate' : 'price';
      const aValue = a[priceField as keyof DataItem] as number || 0;
      const bValue = b[priceField as keyof DataItem] as number || 0;
      
      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    // Our own PR Blast package always leads the publication list.
    if (activeTable === 'publication') {
      const pinned = sorted.findIndex((item) => (item as { id?: string }).id === PINNED_PUBLICATION);
      if (pinned > 0) sorted.unshift(...sorted.splice(pinned, 1));
    }
    // Hot-selling listicles lead the listicles list.
    if (activeTable === 'listicles') {
      const hot = sorted.filter((item) => (item as { hot?: boolean }).hot === true);
      if (hot.length) return [...hot, ...sorted.filter((item) => (item as { hot?: boolean }).hot !== true)];
    }
    return sorted;
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
  const heroFeatured = useMemo(
    () =>
      allData.publication.find((item) => {
        const n = item.name?.toLowerCase() ?? '';
        return n.includes('pr blast') && n.includes('200') && n.includes('affiliate');
      }),
    [allData.publication]
  );

  // PR Blast is featured in the hero but stays searchable in the table too.
  const regularData = filteredAndSortedData;

  // Columns per table. Publication columns that are empty across the whole
  // catalogue (e.g. monthly visits before a data import) are left out.
  const tableColumns = useMemo(() => {
    switch (activeTable) {
      case 'publication':
        return publicationColumns((allData.publication.length ? allData.publication : data) as unknown as Row[]);
      case 'listicles':
        return listicleColumns();
      case 'television':
        return televisionColumns();
      case 'broadcast_television':
        return broadcastColumns();
      case 'podcasts':
        return podcastColumns();
    }
  }, [activeTable, allData.publication, data]);

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


  // A new table starts at the top of the list.
  useEffect(() => {
    const table = document.getElementById('catalog-table');
    if (table && table.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: window.scrollY + table.getBoundingClientRect().top - 140 });
    }
  }, [activeTable]);

  // Optimize table switch with useCallback
  const handleTableSwitch = useCallback((tableType: TableType) => {
    setFiltersOpen(false);
    startSwitching(() => setActiveTable(tableType));
  }, []);

  // Hero shortcuts: jump down to the catalogue, optionally searching for an outlet.
  const catalogRef = useRef<HTMLElement | null>(null);
  const scrollToCatalog = useCallback(() => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const pickPublication = useCallback((name: string) => {
    setFilters((prev) => ({ ...prev, publication: { ...prev.publication, search: name } }));
    handleTableSwitch('publication');
    scrollToCatalog();
  }, [handleTableSwitch, scrollToCatalog]);

  // Optimize sort handling with useCallback
  const handleSort = useCallback(() => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  }, [sortDirection]);

  // Get sort icon
  const getSortIcon = () => {
    if (sortDirection === 'asc') return <ArrowUp size={16} className="text-black" />;
    if (sortDirection === 'desc') return <ArrowDown size={16} className="text-black" />;
    return <ArrowUpDown size={16} className="text-black" />;
  };

  // Get sort label
  const getSortLabel = () => {
    const priceField = activeTable === 'television' || activeTable === 'broadcast_television' ? 'rate' : 'price';
    const fieldName = priceField === 'price' ? 'Price' : 'Rate';
    
    return sortDirection === 'desc' ? `${fieldName}: high → low` : `${fieldName}: low → high`;
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
      case 'podcasts': return <Mic size={18} />;
      default: return <Database size={18} />;
    }
  };

  const getTableLabel = (type: TableType) => {
    switch (type) {
      case 'publication': return 'Publications';
      case 'listicles': return 'Listicles';
      case 'television': return 'Television';
      case 'broadcast_television': return 'Broadcast TV';
      case 'podcasts': return 'Podcasts';
      default: return 'Publications';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideDown {
          from { opacity: 0; }
          to { opacity: 1; }
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
          animation: fadeIn 0.25s ease-out;
        }
        
        .animate-slideDown {
          animation: fadeIn 0.25s ease-out;
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
      <header className="border-b border-gray-800 lime-gradient relative z-50">
        <div className="portal-wrap">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-14 h-9 flex items-center justify-center">
                <img 
                  src="/logo-money.png" 
                  alt="Digital Networking Agency Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-black leading-tight">Digital Networking Agency</h1>
                <p className="text-xs text-black/70">Publication Dashboard</p>
              </div>
            </div>
            </div>
            
            <div className="header-actions flex items-center space-x-4">
              {/* Admin Only - Pricing Factors Button */}
              {showAdminButtons && (
                <button 
                  onClick={() => window.location.href = '/pricing-factors'}
                  className="admin-only flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <DollarSign size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Pricing</span>
                </button>
              )}
              
              {/* Admin Only - Base prices */}
              {showAdminButtons && (
                <button 
                  onClick={() => window.location.href = '/catalog'}
                  className="admin-only flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <Tag size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Base prices</span>
                </button>
              )}

              {/* Admin Only - Settings Button */}
              {showAdminButtons && (
                <button 
                  onClick={() => window.location.href = '/users'}
                  className="admin-only flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <Settings size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Settings</span>
                </button>
              )}
              
              {/* Admin Only - Create User Button */}
              {showAdminButtons && (
                <button 
                  onClick={() => setCreateUserModalOpen(true)}
                  className="admin-only flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <KeyRound size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Create User</span>
                </button>
              )}

              {/* Admin Only - Send Invitation Button */}
              {showAdminButtons && (
                <button 
                  onClick={() => setInvitationModalOpen(true)}
                  className="admin-only flex items-center space-x-2 px-3 py-1.5 bg-black/20 hover:bg-black/30 rounded-lg transition-all hover-lift hover-scale"
                >
                  <UserPlus size={16} className="text-black" />
                  <span className="hidden sm:inline text-sm text-black font-medium">Invite User</span>
                </button>
              )}
              
              <button 
                onClick={async () => {
                  try {
                    try { window.localStorage.removeItem(ROLE_CACHE_KEY); } catch {}
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

      {/* Hero: portal intro, publishing terms, resources and the catalogue tabs */}
      <section className="portal-hero">
        <PortalHero
          ready={heroReady}
          publications={allData.publication as unknown as Record<string, unknown>[]}
          counts={{ listicles: allData.listicles.length }}
          onBrowse={scrollToCatalog}
          onPickPublication={pickPublication}
        />
      </section>

      {/* Main Content — light surface, like a clean sheet under the dark hero */}
      <section className="portal-light" ref={catalogRef}>
      <div className="portal-wrap pb-10">
        {/* Catalogue switcher sits with the catalogue, not in the hero */}
        <nav className="portal-tabs" aria-label="Catalogue">
          {ALL_TABLES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTableSwitch(type)}
              className={`portal-tab${activeTable === type ? ' is-active' : ''}`}
              aria-current={activeTable === type ? 'page' : undefined}
            >
              {getTableIcon(type)}
              <span>{getTableLabel(type)}</span>
              {!settled[type] ? (
                <span className="portal-tab-count skel skel-count" aria-hidden="true" />
              ) : allData[type].length > 0 && (
                <span className="portal-tab-count">
                  {(type === activeTable ? filteredAndSortedData.length : allData[type].length).toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Toolbar: pinned while scrolling; search is always visible */}
        <div className="toolbar-sticky" style={{ height: TOOLBAR_STICKY_HEIGHT }}>
        <div className="filter-toolbar">
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

          {activeTable !== 'broadcast_television' && activeTable !== 'podcasts' && (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={`toolbar-filters${drawerFilterCount > 0 ? ' has-filters' : ''}`}
            >
              <SlidersHorizontal size={16} />
              <span>Refine</span>
              {drawerFilterCount > 0 && <span className="toolbar-badge">{drawerFilterCount}</span>}
            </button>
          )}

          <button
            type="button"
            onClick={handleSort}
            className={`toolbar-button${sortDirection ? ' is-active' : ''}`}
          >
            {getSortIcon()}
            <span className="hidden sm:inline">{getSortLabel()}</span>
            <span className="sm:hidden">Sort</span>
          </button>

          {(drawerFilterCount > 0 || currentSearch || sortDirection === 'desc') && (
            <button
              type="button"
              onClick={() => {
                if (activeTable === 'publication') {
                  updateFilters({ search: '', ...CLEARED_DRAWER });
                } else if (activeTable === 'listicles') {
                  updateFilters({ search: '', genre: '' });
                } else if (activeTable === 'television') {
                  updateFilters({ search: '', affiliate: '', state: '' });
                } else if (activeTable === 'broadcast_television') {
                  updateFilters({ callSign: '' });
                } else if (activeTable === 'podcasts') {
                  updateFilters({ search: '' });
                }
                setSortDirection('asc');
              }}
              className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-1"
            >
              Clear all
            </button>
          )}
        </div>

        </div>

        <p className="results-count">
          {loading ? (
            <>Loading {RESULT_NOUN[activeTable]}…</>
          ) : (
            <>
              Showing{' '}
              <span className="font-bold tabular-nums">{filteredAndSortedData.length.toLocaleString()}</span>
              {' '}of{' '}
              <span className="tabular-nums">{data.length.toLocaleString()}</span>{' '}
              {RESULT_NOUN[activeTable]}
              {sortDirection === 'desc' && (
                <span className="ml-2 text-[#fcd34d]">
                  · {activeTable === 'television' || activeTable === 'broadcast_television' ? 'Rate' : 'Price'} high to low
                </span>
              )}
            </>
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

        {/* Table — scrolls with the page; only rows near the viewport are rendered */}
        <div id="catalog-table" key={activeTable} className={`table-swap${isSwitching ? ' is-switching' : ''}`}>
          {loading ? (
            // Placeholder rows the size of real ones, so nothing jumps when data lands.
            <div className="catalog-skeleton" role="status" aria-label={`Loading ${RESULT_NOUN[activeTable]}`}>
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="catalog-skeleton-row">
                  <span className="skel skel-logo" />
                  <span className="skel skel-name" />
                  <span className="skel skel-cell" />
                  <span className="skel skel-cell" />
                  <span className="skel skel-cell skel-wide" />
                  <span className="skel skel-cell" />
                </div>
              ))}
            </div>
          ) : (
            <CatalogTable
              rows={regularData as unknown as Row[]}
              columns={tableColumns}
              rowKey={(row, i) => String(row.id ?? i)}
              stickyTop={TOOLBAR_STICKY_HEIGHT}
              empty={
                <div className="flex flex-col items-center gap-2 py-10">
                  <Database size={40} className="text-gray-600" />
                  <div className="text-base font-semibold text-gray-200">No results found</div>
                  <div className="text-sm text-gray-500">Try a different search or clear your filters.</div>
                </div>
              }
            />
          )}
        </div>
      </div>
      </section>

      <ScrollButtons />

      {/* Footer */}
      <footer className="border-t border-gray-800 lime-gradient mt-12">
        <div className="portal-wrap py-6">
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