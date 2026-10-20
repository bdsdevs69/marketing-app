'use client';

import { ArrowUpRight, Bitcoin, Dices, Heart, Leaf } from 'lucide-react';
import type { Column } from './CatalogTable';

const SANITY = 'https://cdn.sanity.io/images/8n90kyzz/production/';

// Logos are Sanity file refs, or a path/URL for ones we host ourselves.
export const logoSrc = (ref: string) => (/^(https?:)?\//.test(ref) ? ref : `${SANITY}${ref}`);

// Loose row shape shared by all the tables; each table reads its own fields.
export type Row = Record<string, unknown> & {
  id?: string;
  name?: string;
  url?: string;
  logo?: string;
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const list = (v: unknown) =>
  Array.isArray(v) ? v.map(String) : str(v).split(',').map((s) => s.trim()).filter(Boolean);
const hasAny = (rows: Row[], key: string) =>
  rows.some((r) => {
    const v = r[key];
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '';
  });

export function compactNumber(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

function hueOf(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

// Each genre gets a stable hue; the light and dark shades are in globals.css
// (.cell-chip.is-tinted) so the chips follow the theme.
const tintedChip = (text: string) => ({ '--chip-h': hueOf(text.toLowerCase()) }) as React.CSSProperties;

// DA / DR strength: weak, decent, strong.
const strength = (n: number) => (n >= 60 ? 'is-strong' : n >= 30 ? 'is-mid' : 'is-weak');

const domainOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');

/* ----------------------------- cell pieces ----------------------------- */

function PublicationCell({ row }: { row: Row }) {
  const url = str(row.url);
  const name = str(row.name) || str(row.programName) || str(row.CallSign);
  return (
    <div className="pub-cell">
      {row.logo ? (
        <img src={logoSrc(String(row.logo))} alt="" className="pub-logo" loading="lazy" />
      ) : (
        <span className="pub-logo pub-logo-fallback">{name.slice(0, 2).toUpperCase()}</span>
      )}
      <div className="min-w-0">
        {row.hot === true && <span className="hot-tag">Hot seller</span>}
        <div className="pub-name">{name}</div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="pub-domain">
            {domainOf(url)}
            <ArrowUpRight size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

export function Price({ value }: { value: unknown }) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || value === '') return <span className="text-gray-500">—</span>;
  return <span className="price-cell">${n.toLocaleString()}</span>;
}

function Metric({ value, max = 100 }: { value: unknown; max?: number }) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) {
    // Text such as "TBA" is shown as-is; anything else missing is a dash.
    const text = typeof value === 'string' ? value.trim() : '';
    return <span className={text ? 'metric-tba' : 'text-gray-500'}>{text || '—'}</span>;
  }
  return (
    <div className={`metric ${strength(n)}`}>
      <span>{n}</span>
      <span className="metric-bar">
        <span style={{ width: `${Math.min(100, (n / max) * 100)}%` }} />
      </span>
    </div>
  );
}

function Chips({ value, tinted = false }: { value: unknown; tinted?: boolean }) {
  const items = list(value);
  if (!items.length) return <span className="text-gray-500">—</span>;
  // The first two only, with no "+N" count; hovering shows the full list.
  return (
    <div className="chip-stack" title={items.length > 2 ? items.join(', ') : undefined}>
      {items.slice(0, 2).map((g) => (
        <span key={g} className="chip-line">
          <span className={`cell-chip${tinted ? ' is-tinted' : ''}`} style={tinted ? tintedChip(g) : undefined}>{g}</span>
        </span>
      ))}
    </div>
  );
}

// Yes / No / Discrete / Maybe as a small status pill.
function Flag({ value }: { value: unknown }) {
  const v = str(value).toLowerCase();
  if (!v) return <span className="text-gray-500">—</span>;
  const tone = v === 'yes' || v === 'true' ? 'is-yes' : v === 'no' || v === 'false' ? 'is-no' : 'is-mid';
  const label = v === 'true' ? 'Yes' : v === 'false' ? 'No' : v.charAt(0).toUpperCase() + v.slice(1);
  return <span className={`flag ${tone}`}>{label}</span>;
}

function ViewLink({ href }: { href: string }) {
  if (!href) return <span className="text-gray-500">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="view-link">
      View <ArrowUpRight size={12} />
    </a>
  );
}

const NICHE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  erotic: { label: 'Adult (18+)', icon: <span className="niche-18">18+</span> },
  health: { label: 'Health', icon: <Heart size={14} /> },
  cbd: { label: 'CBD', icon: <Leaf size={14} /> },
  crypto: { label: 'Crypto', icon: <Bitcoin size={14} /> },
  gambling: { label: 'Gambling', icon: <Dices size={14} /> },
};

function Niches({ value }: { value: unknown }) {
  const accepted = new Set(list(value));
  return (
    <div className="niche-row">
      {Object.entries(NICHE_META).map(([key, meta]) => (
        <span
          key={key}
          className={`niche niche-${key}${accepted.has(key) ? ' is-on' : ''}`}
          title={`${meta.label}: ${accepted.has(key) ? 'accepted' : 'not accepted'}`}
        >
          {meta.icon}
        </span>
      ))}
    </div>
  );
}

// Listicle price tiers, e.g. [{ name: 'Top 5', price: 2500 }, ...].
function Tiers({ value }: { value: unknown }) {
  const tiers = Array.isArray(value)
    ? (value as Array<{ name?: unknown; price?: unknown }>).filter((t) => Number.isFinite(Number(t.price)))
    : [];
  if (!tiers.length) return <span className="text-gray-500">—</span>;
  return (
    <div className="tier-stack">
      {tiers.map((t) => (
        <span key={str(t.name)} className="tier">
          <span className="tier-label">{str(t.name)}</span>
          <span className="price-cell">${Number(t.price).toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}

/* ----------------------------- column sets ----------------------------- */

export function publicationColumns(rows: Row[]): Column<Row>[] {
  const cols: (Column<Row> | false)[] = [
    { key: 'name', label: 'Publication', width: 250, render: (r) => <PublicationCell row={r} /> },
    { key: 'price', label: 'Price', align: 'right', width: 90, render: (r) => <Price value={r.price} /> },
    { key: 'tat', label: 'TAT', width: 100, render: (r) => <span className="text-gray-200 whitespace-nowrap">{str(r.estimated_time) || '—'}</span> },
    hasAny(rows, 'domain_authority') && { key: 'da', label: 'DA', align: 'center', width: 70, render: (r) => <Metric value={r.domain_authority} /> },
    hasAny(rows, 'domain_rating') && { key: 'dr', label: 'DR', align: 'center', width: 70, render: (r) => <Metric value={r.domain_rating} /> },
    hasAny(rows, 'monthly_visits') && {
      key: 'mv',
      label: 'Monthly visits',
      align: 'center',
      width: 100,
      render: (r) =>
        typeof r.monthly_visits === 'number' ? (
          <div className="metric is-visits">
            <span>{compactNumber(r.monthly_visits)}</span>
            <span className="metric-bar is-wide">
              <span style={{ width: `${Math.min(100, (Math.log10(Math.max(10, r.monthly_visits)) - 1) / 7 * 100)}%` }} />
            </span>
          </div>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    { key: 'genres', label: 'Genres', align: 'center', width: 150, render: (r) => <Chips value={r.genres} tinted /> },
    { key: 'regions', label: 'Region', align: 'center', width: 150, render: (r) => <Chips value={r.regions} /> },
    hasAny(rows, 'sponsored') && { key: 'sponsored', label: 'Sponsored', align: 'center', width: 96, render: (r) => <Flag value={r.sponsored} /> },
    hasAny(rows, 'indexed') && { key: 'indexed', label: 'Indexed', align: 'center', width: 86, render: (r) => <Flag value={r.indexed} /> },
    { key: 'do_follow', label: 'Do follow', align: 'center', width: 90, render: (r) => <Flag value={r.do_follow} /> },
    hasAny(rows, 'llm_aeo') && { key: 'llm', label: 'LLM/AEO', align: 'center', width: 90, render: (r) => <Flag value={r.llm_aeo} /> },
    { key: 'example', label: 'Example', align: 'center', width: 80, render: (r) => <ViewLink href={str(r.example)} /> },
    hasAny(rows, 'listicles') && {
      key: 'listicles',
      label: 'Listicles',
      align: 'center',
      width: 100,
      render: (r) => (list(r.listicles).length ? <Chips value={r.listicles} /> : <span className="text-gray-500">—</span>),
    },
    hasAny(rows, 'niches') && { key: 'niches', label: 'Niches', align: 'center', width: 150, render: (r) => <Niches value={r.niches} /> },
  ];
  return cols.filter(Boolean) as Column<Row>[];
}

export function listicleColumns(): Column<Row>[] {
  return [
    { key: 'name', label: 'Publication', width: 260, render: (r) => <PublicationCell row={r} /> },
    { key: 'price', label: 'Price', width: 260, render: (r) => <Tiers value={r.tiers} /> },
    { key: 'genres', label: 'Genres', align: 'center', render: (r) => <Chips value={r.genres} tinted /> },
    { key: 'regions', label: 'Region', align: 'center', render: (r) => <Chips value={r.regions} /> },
    { key: 'tat', label: 'TAT', render: (r) => <span className="text-gray-200">{str(r.estimated_time) || '—'}</span> },
    { key: 'do_follow', label: 'Do follow', align: 'center', render: (r) => <Flag value={r.do_follow} /> },
    { key: 'example', label: 'Example', align: 'center', render: (r) => <ViewLink href={str(r.example)} /> },
  ];
}

export function televisionColumns(): Column<Row>[] {
  return [
    { key: 'affiliate', label: 'Affiliate', width: 110, render: (r) => <span className="cell-chip">{str(r.affiliate) || '—'}</span> },
    { key: 'calls', label: 'Station', render: (r) => <span className="pub-name">{str(r.calls) || '—'}</span> },
    { key: 'programName', label: 'Program', render: (r) => <span className="text-gray-100">{str(r.programName) || '—'}</span> },
    { key: 'rate', label: 'Price', align: 'right', render: (r) => <Price value={r.rate} /> },
    { key: 'market', label: 'Market', render: (r) => <span className="text-gray-200">{str(r.market) || '—'}</span> },
    { key: 'state', label: 'State', render: (r) => <span className="text-gray-200">{str(r.state) || '—'}</span> },
    { key: 'location', label: 'Location', render: (r) => <span className="text-gray-300">{str(r.location) || '—'}</span> },
    { key: 'example', label: 'Example', align: 'center', render: (r) => <ViewLink href={str(r.example)} /> },
  ];
}

export function broadcastColumns(): Column<Row>[] {
  return [
    { key: 'CallSign', label: 'Call sign', render: (r) => <span className="pub-name">{str(r.CallSign) || '—'}</span> },
    { key: 'ProgramName', label: 'Program', render: (r) => <span className="text-gray-100">{str(r.ProgramName) || '—'}</span> },
    { key: 'rate', label: 'Price', align: 'right', render: (r) => <Price value={r.rate} /> },
    { key: 'station', label: 'Station', render: (r) => <span className="text-gray-200">{str(r.station) || '—'}</span> },
    { key: 'InterviewType', label: 'Interview', render: (r) => <span className="text-gray-200">{str(r.InterviewType) || '—'}</span> },
    { key: 'SegmentLength', label: 'Segment', render: (r) => <span className="text-gray-200">{str(r.SegmentLength) || '—'}</span> },
    { key: 'tat', label: 'TAT', render: (r) => <span className="text-gray-200">{str(r.tat) || '—'}</span> },
    { key: 'sponsored', label: 'Sponsored', align: 'center', render: (r) => <Flag value={r.sponsored} /> },
    { key: 'indexed', label: 'Indexed', align: 'center', render: (r) => <Flag value={r.indexed} /> },
    { key: 'Example', label: 'Example', align: 'center', render: (r) => <ViewLink href={str(r.Example)} /> },
  ];
}

export function podcastColumns(): Column<Row>[] {
  return [
    { key: 'name', label: 'Podcast', width: 240, render: (r) => <PublicationCell row={r} /> },
    { key: 'price', label: 'Price', align: 'right', width: 90, render: (r) => <Price value={r.price} /> },
    {
      key: 'views',
      label: 'Views / episode',
      align: 'center',
      render: (r) =>
        typeof r.views === 'number' ? (
          <span className="tabular-nums text-gray-100 font-semibold">{compactNumber(r.views)}</span>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    { key: 'category', label: 'Category', align: 'center', render: (r) => <Chips value={r.category} tinted /> },
    { key: 'episode', label: 'Episode example', align: 'center', render: (r) => <ViewLink href={str(r.episode_example)} /> },
    { key: 'article', label: 'Companion article', render: (r) => <span className="text-gray-100">{str(r.companion_article) || '—'}</span> },
    { key: 'article_example', label: 'Article example', align: 'center', render: (r) => <ViewLink href={str(r.article_example)} /> },
  ];
}
