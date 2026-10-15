'use client';

import { useMemo, useState } from 'react';
import { Search, X, DollarSign, Clock, Globe, Tag } from 'lucide-react';

export interface PublicationFilterState {
  search: string;
  minPrice: string;
  maxPrice: string;
  genres: string[];
  regions: string[];
  maxTatDays: string; // '' = any
}

interface Props {
  value: PublicationFilterState;
  onChange: (patch: Partial<PublicationFilterState>) => void;
  genres: string[];
  regions: string[];
  priceMin: number;
  priceMax: number;
  matchCount: number;
  totalCount: number;
}

// Turnaround buckets, measured by the longest time a range can take — so
// "3-5 Days" counts as 5 days and lands in "Up to a week".
export const TAT_BUCKETS: { label: string; days: string }[] = [
  { label: 'Any', days: '' },
  { label: '≤ 3 days', days: '3' },
  { label: '≤ 1 week', days: '7' },
  { label: '≤ 2 weeks', days: '14' },
  { label: '≤ 1 month', days: '30' },
];

// "1 - 3 Weeks" -> 21, "3-5 Days" -> 5, "1 Month" -> 30. Returns null when the
// value can't be read, so those rows are only hidden when a limit is set.
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

function Chip({
  label,
  active,
  tone = 'emerald',
  onClick,
}: {
  label: string;
  active: boolean;
  tone?: 'emerald' | 'gold';
  onClick: () => void;
}) {
  const on =
    tone === 'gold'
      ? 'bg-[#fbbf24] text-[#3b2708] border-[#fbbf24]'
      : 'bg-[#34d399] text-[#04221a] border-[#34d399]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors duration-150 ${
        active
          ? on
          : 'bg-white/[0.04] text-gray-300 border-gray-700 hover:border-gray-600 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

export default function PublicationFilters({
  value,
  onChange,
  genres,
  regions,
  priceMin,
  priceMax,
  matchCount,
  totalCount,
}: Props) {
  const [regionQuery, setRegionQuery] = useState('');

  const toggle = (key: 'genres' | 'regions', item: string) => {
    const current = value[key] ?? [];
    onChange({
      [key]: current.includes(item)
        ? current.filter((v) => v !== item)
        : [...current, item],
    } as Partial<PublicationFilterState>);
  };

  // Selected regions stay pinned to the top so they're never lost in the list.
  const shownRegions = useMemo(() => {
    const q = regionQuery.trim().toLowerCase();
    const selected = value.regions ?? [];
    const rest = regions.filter(
      (r) => !selected.includes(r) && (!q || r.toLowerCase().includes(q))
    );
    return [...selected, ...rest];
  }, [regions, regionQuery, value.regions]);

  const activeCount =
    (value.genres?.length ?? 0) +
    (value.regions?.length ?? 0) +
    (value.maxTatDays ? 1 : 0) +
    (value.minPrice ? 1 : 0) +
    (value.maxPrice ? 1 : 0) +
    (value.search ? 1 : 0);

  const sliderMax = Number(value.maxPrice || priceMax);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm">
          <span className="font-semibold text-[#fbbf24] tabular-nums">
            {matchCount.toLocaleString()}
          </span>
          <span className="text-gray-400"> of {totalCount.toLocaleString()} publications match</span>
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                search: '',
                minPrice: '',
                maxPrice: '',
                genres: [],
                regions: [],
                maxTatDays: '',
              })
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
          >
            <X size={13} />
            Reset all ({activeCount})
          </button>
        )}
      </div>

      {/* Search */}
      <div>
        <label className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#a7f3d0] mb-2">
          <Search size={13} /> Search
        </label>
        <input
          type="text"
          placeholder="Publication name…"
          value={value.search || ''}
          onChange={(e) => onChange({ search: e.target.value })}
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-500 transition-all"
        />
      </div>

      {/* Price range */}
      <div>
        <label className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#fcd34d] mb-2">
          <DollarSign size={13} /> Price range
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            placeholder={`${priceMin}`}
            value={value.minPrice || ''}
            onChange={(e) => onChange({ minPrice: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-[#fbbf24] text-white placeholder-gray-500 transition-all tabular-nums"
          />
          <span className="text-gray-500 text-sm">to</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={`${priceMax}`}
            value={value.maxPrice || ''}
            onChange={(e) => onChange({ maxPrice: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-[#fbbf24] text-white placeholder-gray-500 transition-all tabular-nums"
          />
        </div>
        <input
          type="range"
          min={priceMin}
          max={priceMax}
          step={50}
          value={Number.isFinite(sliderMax) ? sliderMax : priceMax}
          onChange={(e) =>
            onChange({ maxPrice: e.target.value === String(priceMax) ? '' : e.target.value })
          }
          className="price-range w-full mt-3"
          aria-label="Maximum price"
        />
        <div className="flex justify-between text-[11px] text-gray-500 tabular-nums">
          <span>${priceMin.toLocaleString()}</span>
          <span>${priceMax.toLocaleString()}+</span>
        </div>
      </div>

      {/* Turnaround */}
      <div>
        <label className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#a7f3d0] mb-2">
          <Clock size={13} /> Turnaround
        </label>
        <div className="flex flex-wrap gap-2">
          {TAT_BUCKETS.map((b) => (
            <Chip
              key={b.label}
              label={b.label}
              active={(value.maxTatDays || '') === b.days}
              onClick={() => onChange({ maxTatDays: b.days })}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Counts a range by its longest time — “3-5 Days” is within a week.
        </p>
      </div>

      {/* Genres */}
      <div>
        <label className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#fcd34d] mb-2">
          <Tag size={13} /> Genres
          {value.genres?.length > 0 && (
            <span className="text-gray-500 font-medium normal-case tracking-normal">
              · {value.genres.length} selected
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <Chip
              key={g}
              label={g}
              tone="gold"
              active={(value.genres ?? []).includes(g)}
              onClick={() => toggle('genres', g)}
            />
          ))}
        </div>
      </div>

      {/* Regions */}
      <div>
        <label className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#a7f3d0] mb-2">
          <Globe size={13} /> Regions
          {value.regions?.length > 0 && (
            <span className="text-gray-500 font-medium normal-case tracking-normal">
              · {value.regions.length} selected
            </span>
          )}
        </label>
        <input
          type="text"
          placeholder={`Filter ${regions.length} regions…`}
          value={regionQuery}
          onChange={(e) => setRegionQuery(e.target.value)}
          className="w-full px-4 py-2 mb-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#34d399] focus:border-[#34d399] text-white placeholder-gray-500 transition-all"
        />
        <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto pr-1 filter-scroll">
          {shownRegions.map((r) => (
            <Chip
              key={r}
              label={r}
              active={(value.regions ?? []).includes(r)}
              onClick={() => toggle('regions', r)}
            />
          ))}
          {shownRegions.length === 0 && (
            <p className="text-xs text-gray-500">No region matches “{regionQuery}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}
