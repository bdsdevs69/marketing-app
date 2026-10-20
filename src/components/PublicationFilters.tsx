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
  minVisits: string; // '' = any
  badges: string[];
  sponsored: string[];
  doFollow: string[];
  indexed: string[];
  llm: string[];
  niches: string[]; // a site must accept every picked niche
  listiclesOnly: boolean;
}

export const EMPTY_PUBLICATION_FILTERS: PublicationFilterState = {
  search: '',
  minPrice: '',
  maxPrice: '',
  genres: [],
  regions: [],
  maxTatDays: '',
  minVisits: '',
  badges: [],
  sponsored: [],
  doFollow: [],
  indexed: [],
  llm: [],
  niches: [],
  listiclesOnly: false,
};

// Everything the drawer controls (search lives in the toolbar).
export const CLEARED_DRAWER: Omit<PublicationFilterState, 'search'> = {
  minPrice: '',
  maxPrice: '',
  genres: [],
  regions: [],
  maxTatDays: '',
  minVisits: '',
  badges: [],
  sponsored: [],
  doFollow: [],
  indexed: [],
  llm: [],
  niches: [],
  listiclesOnly: false,
};

// The fields of a publication row the filters read.
export interface PublicationLike {
  name?: string;
  url?: string;
  price?: unknown;
  genres?: unknown;
  regions?: unknown;
  estimated_time?: unknown;
  monthly_visits?: unknown;
  badges?: unknown;
  sponsored?: unknown;
  do_follow?: unknown;
  indexed?: unknown;
  llm_aeo?: unknown;
  niches?: unknown;
  listicles?: unknown;
}

// Monthly-visit floor stops; the first means any.
export const VISIT_STOPS: { min: number | null; label: string }[] = [
  { min: null, label: 'Any' },
  { min: 1_000, label: '1k+' },
  { min: 10_000, label: '10k+' },
  { min: 50_000, label: '50k+' },
  { min: 100_000, label: '100k+' },
  { min: 500_000, label: '500k+' },
  { min: 1_000_000, label: '1M+' },
  { min: 5_000_000, label: '5M+' },
];

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

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();
const asList = (v: unknown) => (Array.isArray(v) ? v.map(lower) : splitList(v));

// Within one group, picking several values means "any of these".
const anyOf = (picked: string[], value: unknown) => picked.length === 0 || picked.includes(lower(value));

const matchVisits = (item: PublicationLike, f: PublicationFilterState) =>
  f.minVisits === '' || (typeof item.monthly_visits === 'number' && item.monthly_visits >= Number(f.minVisits));

const matchFlags = (item: PublicationLike, f: PublicationFilterState) =>
  anyOf(f.sponsored, item.sponsored) &&
  anyOf(f.doFollow, item.do_follow) &&
  anyOf(f.indexed, item.indexed) &&
  anyOf(f.llm, item.llm_aeo);

const matchBadges = (item: PublicationLike, f: PublicationFilterState) =>
  f.badges.length === 0 || f.badges.some((b) => asList(item.badges).includes(b.toLowerCase()));

// Niches are different: a site has to accept every niche the article touches.
const matchNiches = (item: PublicationLike, f: PublicationFilterState) =>
  f.niches.length === 0 || f.niches.every((n) => asList(item.niches).includes(n));

const matchListicles = (item: PublicationLike, f: PublicationFilterState) =>
  !f.listiclesOnly || (Array.isArray(item.listicles) && item.listicles.length > 0);

export const matchesPublication = (item: PublicationLike, f: PublicationFilterState) =>
  matchSearch(item, f) &&
  matchPrice(item, f) &&
  matchGenres(item, f) &&
  matchRegions(item, f) &&
  matchTat(item, f) &&
  matchVisits(item, f) &&
  matchFlags(item, f) &&
  matchBadges(item, f) &&
  matchNiches(item, f) &&
  matchListicles(item, f);

// Filters set inside the drawer (search lives in the toolbar, so it's excluded).
export const countDrawerFilters = (f: PublicationFilterState) =>
  (f.minPrice !== '' || f.maxPrice !== '' ? 1 : 0) +
  (f.maxTatDays !== '' ? 1 : 0) +
  (f.minVisits !== '' ? 1 : 0) +
  f.genres.length +
  f.regions.length +
  f.badges.length +
  f.sponsored.length +
  f.doFollow.length +
  f.indexed.length +
  f.llm.length +
  f.niches.length +
  (f.listiclesOnly ? 1 : 0);

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

  type ListKey = 'genres' | 'regions' | 'badges' | 'sponsored' | 'doFollow' | 'indexed' | 'llm' | 'niches';
  // Reads the latest draft, so quick successive clicks never drop a value.
  const toggle = (key: ListKey, value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));

  const shownRegions = useMemo(() => {
    const q = regionQuery.trim().toLowerCase();
    return q ? regions.filter((r) => r.toLowerCase().includes(q)) : regions;
  }, [regions, regionQuery]);

  const drawerFilters = countDrawerFilters(draft);

  // Only offer values that actually occur, most common first for badges.
  const badgeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) for (const b of Array.isArray(i.badges) ? i.badges : []) counts.set(String(b), (counts.get(String(b)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
  }, [items]);

  const present = useMemo(() => {
    const seen = (field: keyof PublicationLike) => new Set(items.map((i) => String(i[field] ?? '').toLowerCase()));
    return { sponsored: seen('sponsored'), do_follow: seen('do_follow'), indexed: seen('indexed'), llm_aeo: seen('llm_aeo') };
  }, [items]);

  const visitIndex = draft.minVisits === ''
    ? 0
    : Math.max(0, VISIT_STOPS.findIndex((s) => s.min !== null && s.min >= Number(draft.minVisits)));
  const visitCount = useMemo(
    () => items.filter((i) => draft.minVisits === '' || (typeof i.monthly_visits === 'number' && i.monthly_visits >= Number(draft.minVisits))).length,
    [items, draft.minVisits]
  );

  return (
    <FilterDrawer
      open={open}
      onClose={close}
      onReset={() => patch(CLEARED_DRAWER)}
      resetDisabled={drawerFilters === 0}
      footerLabel={`See ${matchCount.toLocaleString()} publication${matchCount === 1 ? '' : 's'}`}
    >
      {/* Price range */}
      <section className="filter-section">
        <h3 className="filter-label">Budget</h3>

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
          <span className="font-semibold text-white tabular-nums">{priceCount.toLocaleString()}</span>{' '}
          publications fit this budget
        </p>
      </section>

      {/* Monthly visits */}
      <section className="filter-section">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="filter-label">Monthly visits</h3>
          <span className="text-sm text-gray-400">
            <span className="font-semibold text-white">{VISIT_STOPS[visitIndex].label}</span>
            {' · '}
            {visitCount.toLocaleString()} match
          </span>
        </div>
        <div className="dual-range">
          <div className="dual-range-track" />
          <div
            className="dual-range-fill"
            style={{ left: `calc(10px + (100% - 20px) * ${visitIndex / (VISIT_STOPS.length - 1)})`, right: '10px' }}
          />
          <input
            type="range"
            min={0}
            max={VISIT_STOPS.length - 1}
            step={1}
            value={visitIndex}
            aria-label="Minimum monthly visits"
            onChange={(e) => {
              const stop = VISIT_STOPS[Number(e.target.value)];
              patch({ minVisits: stop.min === null ? '' : String(stop.min) });
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Any</span>
          <span>5M+</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Estimated visits a month across all sources. Sites without a figure drop out once you set a floor.
        </p>
      </section>

      {/* Turnaround */}
      <section className="filter-section">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="filter-label">Delivery time</h3>
          <span className="text-sm text-gray-400">
            <span className="font-semibold text-white">{TAT_STOPS[tatIndex].label}</span>
            {' · '}
            {tatCount.toLocaleString()} match
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
          Ranges count by their slowest day, so “3-5 days” fits inside a week.
        </p>
      </section>

      {/* Regions */}
      <section className="filter-section">
        <h3 className="filter-label">Regions</h3>

        <button
          type="button"
          onClick={() => setRegionsOpen((v) => !v)}
          aria-expanded={regionsOpen}
          className="filter-select"
        >
          <span className="flex flex-wrap gap-1.5 min-w-0 flex-1 text-left">
            {draft.regions.length === 0 ? (
              <span className="text-gray-500">Any region</span>
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
        <h3 className="filter-label">Genres</h3>
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

      <section className="filter-section">
        <h3 className="filter-label">Listing type</h3>
        <div className="flex flex-wrap gap-2">
          {badgeOptions.map((b) => [b, b] as [string, string]).map(([value, label]) => {
            const active = draft.badges.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle('badges', value)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-section">
        <h3 className="filter-label">Sponsored tag</h3>
        <div className="flex flex-wrap gap-2">
          {(['yes', 'no', 'maybe', 'discrete'] as const).filter((v) => present.sponsored.has(v)).map((v) => [v, v.charAt(0).toUpperCase() + v.slice(1)] as [string, string]).map(([value, label]) => {
            const active = draft.sponsored.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle('sponsored', value)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-gray-500">Discrete means the sponsorship is marked lightly, not with a big banner.</p>
      </section>

      <section className="filter-section">
        <h3 className="filter-label">Do-follow link</h3>
        <div className="flex flex-wrap gap-2">
          {(['yes', 'no', 'maybe', 'discrete'] as const).filter((v) => present.do_follow.has(v)).map((v) => [v, v.charAt(0).toUpperCase() + v.slice(1)] as [string, string]).map(([value, label]) => {
            const active = draft.doFollow.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle('doFollow', value)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-section">
        <h3 className="filter-label">Indexed on Google</h3>
        <div className="flex flex-wrap gap-2">
          {(['yes', 'no', 'maybe', 'discrete'] as const).filter((v) => present.indexed.has(v)).map((v) => [v, v.charAt(0).toUpperCase() + v.slice(1)] as [string, string]).map(([value, label]) => {
            const active = draft.indexed.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle('indexed', value)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-section">
        <h3 className="filter-label">Shows in AI answers (LLM/AEO)</h3>
        <div className="flex flex-wrap gap-2">
          {(['yes', 'no', 'maybe', 'discrete'] as const).filter((v) => present.llm_aeo.has(v)).map((v) => [v, v.charAt(0).toUpperCase() + v.slice(1)] as [string, string]).map(([value, label]) => {
            const active = draft.llm.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle('llm', value)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-section">
        <h3 className="filter-label">Niches they accept</h3>
        <div className="flex flex-wrap gap-2">
          {([['erotic', 'Adult (18+)'], ['health', 'Health'], ['crypto', 'Crypto'], ['cbd', 'CBD'], ['gambling', 'Gambling']] as [string, string][]).map(([value, label]) => {
            const active = draft.niches.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle('niches', value)}
                aria-pressed={active}
                className={`filter-chip${active ? ' is-active' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-gray-500">Pick several to find sites that accept all of them.</p>
      </section>

      <section className="filter-section">
        <h3 className="filter-label">Listicles</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => patch({ listiclesOnly: !draft.listiclesOnly })}
            aria-pressed={draft.listiclesOnly}
            className={`filter-chip${draft.listiclesOnly ? ' is-active' : ''}`}
          >
            Sells listicle slots
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">Only sites with Top 5 / Top 10 listicle placements.</p>
      </section>
    </FilterDrawer>
  );
}
