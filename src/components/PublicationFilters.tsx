'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import FilterDrawer from './FilterDrawer';

export interface PublicationFilterState {
  search: string;
  minPrice: string;
  maxPrice: string;
  genres: string[];
  regions: string[];
  maxTatDays: string; // '' = any
}

export const EMPTY_PUBLICATION_FILTERS: PublicationFilterState = {
  search: '',
  minPrice: '',
  maxPrice: '',
  genres: [],
  regions: [],
  maxTatDays: '',
};

// The fields of a publication row the filters read.
export interface PublicationLike {
  name?: string;
  url?: string;
  price?: unknown;
  genres?: unknown;
  regions?: unknown;
  estimated_time?: unknown;
}

// Turnaround slider stops, measured by the longest time a quoted range can
// take; the last stop means no limit.
export const TAT_STOPS: { days: number | null; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: null, label: 'Any' },
];

// Publications store genres/regions as a single delimited string.
export const splitList = (raw: unknown): string[] =>
  String(raw ?? '')
    .split(/[,/|]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

// "1 - 3 Weeks" -> 21, "3-5 Days" -> 5, "1 Month" -> 30. Null when unreadable.
export function turnaroundMaxDays(raw: unknown): number | null {
  const text = String(raw ?? '').toLowerCase().trim();
  if (!text) return null;

  const numbers = text.match(/\d+(?:\.\d+)?/g);
  if (!numbers) return null;

  const largest = Math.max(...numbers.map(Number));
  if (text.includes('month')) return largest * 30;
  if (text.includes('week')) return largest * 7;
  if (text.includes('hour')) return Math.max(1, Math.round(largest / 24));
  return largest; // days
}

const priceOf = (item: PublicationLike) => (typeof item.price === 'number' ? item.price : 0);

const matchSearch = (item: PublicationLike, f: PublicationFilterState) => {
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return (
    (item.name ?? '').toLowerCase().includes(q) ||
    String(item.url ?? '').toLowerCase().includes(q)
  );
};

const matchPrice = (item: PublicationLike, f: PublicationFilterState) => {
  const price = priceOf(item);
  if (f.minPrice !== '' && price < Number(f.minPrice)) return false;
  if (f.maxPrice !== '' && price > Number(f.maxPrice)) return false;
  return true;
};

// Multi-select facets match a row that has ANY of the picked values.
const matchGenres = (item: PublicationLike, f: PublicationFilterState) => {
  if (f.genres.length === 0) return true;
  const own = splitList(item.genres);
  return f.genres.some((g) => own.includes(g.toLowerCase()));
};

const matchRegions = (item: PublicationLike, f: PublicationFilterState) => {
  if (f.regions.length === 0) return true;
  const own = splitList(item.regions);
  return f.regions.some((r) => own.includes(r.toLowerCase()));
};

const matchTat = (item: PublicationLike, f: PublicationFilterState) => {
  if (f.maxTatDays === '') return true;
  const days = turnaroundMaxDays(item.estimated_time);
  return days !== null && days <= Number(f.maxTatDays);
};

export const matchesPublication = (item: PublicationLike, f: PublicationFilterState) =>
  matchSearch(item, f) &&
  matchPrice(item, f) &&
  matchGenres(item, f) &&
  matchRegions(item, f) &&
  matchTat(item, f);

// Filters set inside the drawer (search lives in the toolbar, so it's excluded).
export const countDrawerFilters = (f: PublicationFilterState) =>
  (f.minPrice !== '' || f.maxPrice !== '' ? 1 : 0) +
  (f.maxTatDays !== '' ? 1 : 0) +
  f.genres.length +
  f.regions.length;

const SCALE = 1000;

interface PublicationFiltersProps {
  open: boolean;
  onClose: () => void;
  applied: PublicationFilterState;
  onApply: (next: PublicationFilterState) => void;
  items: PublicationLike[];
  genres: string[];
  regions: string[];
}

// The publication filter sheet. Edits go to a local draft so dragging a slider
// only re-renders the sheet, never the table behind it; the draft is applied
// when the sheet closes.
export default function PublicationFilters({
  open,
  onClose,
  applied,
  onApply,
  items,
  genres,
  regions,
}: PublicationFiltersProps) {
  const [draft, setDraft] = useState<PublicationFilterState>(applied);
  const [regionsOpen, setRegionsOpen] = useState(false);
  const [regionQuery, setRegionQuery] = useState('');

  // Start every opening from what's currently applied.
  useEffect(() => {
    if (open) {
      setDraft(applied);
      setRegionsOpen(false);
      setRegionQuery('');
    }
    // Only on open; `applied` can't change while the sheet is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (p: Partial<PublicationFilterState>) => setDraft((d) => ({ ...d, ...p }));

  const close = () => {
    onApply(draft);
    onClose();
  };

  // --- price: slider positions follow the distribution of real prices, so
  // most of the travel covers the range where most publications sit. ---
  const prices = useMemo(
    () => items.map(priceOf).filter((p) => p > 0).sort((a, b) => a - b),
    [items]
  );
  const minKnown = prices[0] ?? 0;
  const maxKnown = prices[prices.length - 1] ?? 0;

  const toPrice = (pos: number) =>
    prices.length ? prices[Math.round((pos / SCALE) * (prices.length - 1))] : 0;

  const toPos = (price: number) => {
    if (!prices.length) return 0;
    let lo = 0;
    let hi = prices.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prices[mid] < price) lo = mid + 1;
      else hi = mid;
    }
    return Math.round((lo / Math.max(1, prices.length - 1)) * SCALE);
  };

  const lowPos = draft.minPrice === '' ? 0 : toPos(Number(draft.minPrice));
  const highPos = draft.maxPrice === '' ? SCALE : toPos(Number(draft.maxPrice));

  // --- live counts so the sheet answers "how many?" before you apply ---
  const total = items.length;
  const priceCount = useMemo(() => items.filter((i) => matchPrice(i, draft)).length, [items, draft]);
  const tatCount = useMemo(() => items.filter((i) => matchTat(i, draft)).length, [items, draft]);
  const matchCount = useMemo(
    () => items.filter((i) => matchesPublication(i, draft)).length,
    [items, draft]
  );

  const tatIndex =
    draft.maxTatDays === ''
      ? TAT_STOPS.length - 1
      : Math.max(0, TAT_STOPS.findIndex((s) => s.days !== null && s.days >= Number(draft.maxTatDays)));

  const toggle = (key: 'genres' | 'regions', value: string) =>
    patch({
      [key]: draft[key].includes(value)
        ? draft[key].filter((v) => v !== value)
        : [...draft[key], value],
    } as Partial<PublicationFilterState>);

  const shownRegions = useMemo(() => {
    const q = regionQuery.trim().toLowerCase();
    return q ? regions.filter((r) => r.toLowerCase().includes(q)) : regions;
  }, [regions, regionQuery]);

  const drawerFilters = countDrawerFilters(draft);

  return (
    <FilterDrawer
      open={open}
      onClose={close}
      onReset={() => patch({ minPrice: '', maxPrice: '', genres: [], regions: [], maxTatDays: '' })}
      resetDisabled={drawerFilters === 0}
      footerLabel={`Show ${matchCount.toLocaleString()} publication${matchCount === 1 ? '' : 's'}`}
    >
      {/* Price range */}
      <section className="filter-section">
        <h3 className="filter-label">Price range</h3>

        <div className="dual-range">
          <div className="dual-range-track" />
          <div
            className="dual-range-fill"
            style={{
              left: `calc(10px + (100% - 20px) * ${lowPos / SCALE})`,
              right: `calc(10px + (100% - 20px) * ${1 - highPos / SCALE})`,
            }}
          />
          <input
            type="range"
            min={0}
            max={SCALE}
            value={lowPos}
            aria-label="Minimum price"
            onChange={(e) => {
              const pos = Math.min(Number(e.target.value), highPos);
              patch({ minPrice: pos <= 0 ? '' : String(toPrice(pos)) });
            }}
          />
          <input
            type="range"
            min={0}
            max={SCALE}
            value={highPos}
            aria-label="Maximum price"
            onChange={(e) => {
              const pos = Math.max(Number(e.target.value), lowPos);
              patch({ maxPrice: pos >= SCALE ? '' : String(toPrice(pos)) });
            }}
          />
        </div>

        <div className="flex items-center gap-3 mt-3">
          <input
            type="number"
            inputMode="numeric"
            placeholder={String(minKnown)}
            value={draft.minPrice}
            onChange={(e) => patch({ minPrice: e.target.value })}
            className="filter-input tabular-nums"
            aria-label="Minimum price in dollars"
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={String(maxKnown)}
            value={draft.maxPrice}
            onChange={(e) => patch({ maxPrice: e.target.value })}
            className="filter-input tabular-nums"
            aria-label="Maximum price in dollars"
          />
        </div>
        <p className="mt-2 text-sm text-gray-400">
          <span className="font-semibold text-white tabular-nums">{priceCount.toLocaleString()}</span> of{' '}
          {total.toLocaleString()} publications in this range
        </p>
      </section>

      {/* Turnaround */}
      <section className="filter-section">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="filter-label">Turnaround</h3>
          <span className="text-sm text-gray-400">
            <span className="font-semibold text-white">{TAT_STOPS[tatIndex].label}</span>
            {' · '}
            {tatCount.toLocaleString()} publications
          </span>
        </div>

        <div className="dual-range">
          <div className="dual-range-track" />
          <div
            className="dual-range-fill"
            style={{
              left: '10px',
              right: `calc(10px + (100% - 20px) * ${1 - tatIndex / (TAT_STOPS.length - 1)})`,
            }}
          />
          <input
            type="range"
            min={0}
            max={TAT_STOPS.length - 1}
            step={1}
            value={tatIndex}
            aria-label="Maximum turnaround"
            onChange={(e) => {
              const stop = TAT_STOPS[Number(e.target.value)];
              patch({ maxTatDays: stop.days === null ? '' : String(stop.days) });
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1 day</span>
          <span>Any</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Counts a range by its longest time: 3-5 Days is within a week.
        </p>
      </section>

      {/* Regions */}
      <section className="filter-section">
        <h3 className="filter-label">Select regions</h3>

        <button
          type="button"
          onClick={() => setRegionsOpen((v) => !v)}
          aria-expanded={regionsOpen}
          className="filter-select"
        >
          <span className="flex flex-wrap gap-1.5 min-w-0 flex-1 text-left">
            {draft.regions.length === 0 ? (
              <span className="text-gray-500">Select regions</span>
            ) : (
              draft.regions.map((r) => (
                <span key={r} className="filter-token">
                  {r}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${r}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle('regions', r);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle('regions', r);
                      }
                    }}
                    className="ml-1 opacity-70 hover:opacity-100"
                  >
                    <X size={12} />
                  </span>
                </span>
              ))
            )}
          </span>
          <span className="pl-3 ml-2 border-l border-white/10 text-gray-400">
            <ChevronDown size={16} className={`transition-transform ${regionsOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {regionsOpen && (
          <div className="filter-menu">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                autoFocus
                placeholder={`Search ${regions.length} regions…`}
                value={regionQuery}
                onChange={(e) => setRegionQuery(e.target.value)}
                className="filter-input pl-9"
              />
            </div>
            <ul className="filter-menu-list">
              {shownRegions.map((r) => {
                const checked = draft.regions.includes(r);
                return (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => toggle('regions', r)}
                      className={`filter-menu-item${checked ? ' is-checked' : ''}`}
                    >
                      <span className="filter-check">{checked && <Check size={12} strokeWidth={3} />}</span>
                      {r}
                    </button>
                  </li>
                );
              })}
              {shownRegions.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">No region matches “{regionQuery}”.</li>
              )}
            </ul>
          </div>
        )}
      </section>

      {/* Genres */}
      <section className="filter-section">
        <h3 className="filter-label">Select genres</h3>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => {
            const active = draft.genres.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle('genres', g)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </section>
    </FilterDrawer>
  );
}
