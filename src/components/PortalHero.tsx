'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Mail,
} from 'lucide-react';
import { logoSrc } from './catalog-columns';

type Row = Record<string, unknown>;

interface PortalHeroProps {
  // False until the catalogues it shows have loaded; placeholders hold the layout.
  ready: boolean;
  publications: Row[];
  counts: { listicles: number };
  onBrowse: () => void;
  onPickPublication: (name: string) => void;
}

const ORDERS_EMAIL = 'sam@digitalnetworkingagency.com';
const TICKER_SIZE = 22;
// Placeholder rows shown in the hot sellers card while it loads.
const HOT_PLACEHOLDERS = 3;

const num = (v: unknown) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n;
};
const money = (n: number) => `$${n.toLocaleString()}`;
const hostOf = (url: unknown) =>
  String(url ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').toLowerCase();
// "USA Today (50,000 Impressions)" -> "USA Today"
const baseName = (name: unknown) => String(name ?? '').replace(/\s*\(.*$/, '').trim();

// Upper bound of a turnaround like "1-3 Days" in days; weeks/months count as slow.
function maxDays(tat: unknown): number | null {
  const m = String(tat ?? '').trim().match(/(\d+)(?:\s*-\s*(\d+))?\s*(day|week|month)/i);
  if (!m) return null;
  const upper = Number(m[2] ?? m[1]);
  const unit = m[3].toLowerCase();
  return unit === 'day' ? upper : unit === 'week' ? upper * 7 : upper * 30;
}

interface TickerItem {
  key: string;
  name: string;
  price: number;
  from: boolean;
  logo: string;
}

export default function PortalHero({
  ready,
  publications,
  counts,
  onBrowse,
  onPickPublication,
}: PortalHeroProps) {
  const [termsOpen, setTermsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    let lowest = Infinity;
    let tierOne = 0;
    let fast = 0;
    for (const p of publications) {
      const price = num(p.price);
      if (price && price < lowest) lowest = price;
      if ((num(p.domain_authority) ?? 0) >= 80) tierOne++;
      const days = maxDays(p.estimated_time);
      if (days !== null && days <= 3) fast++;
    }
    return { total: publications.length, lowest: Number.isFinite(lowest) ? lowest : null, tierOne, fast };
  }, [publications]);

  // The most-visited outlets, one entry per site (cheapest package wins).
  const ticker = useMemo<TickerItem[]>(() => {
    const bySite = new Map<string, { rows: Row[]; visits: number }>();
    for (const p of publications) {
      const visits = num(p.monthly_visits);
      const price = num(p.price);
      const host = hostOf(p.url);
      if (!visits || !price || !host) continue;
      const entry = bySite.get(host) ?? { rows: [], visits: 0 };
      entry.rows.push(p);
      entry.visits = Math.max(entry.visits, visits);
      bySite.set(host, entry);
    }
    return [...bySite.entries()]
      .sort((a, b) => b[1].visits - a[1].visits)
      .slice(0, TICKER_SIZE)
      .map(([host, { rows }]) => {
        const cheapest = rows.reduce((a, b) => (num(b.price)! < num(a.price)! ? b : a));
        const name = rows.map((r) => baseName(r.name)).sort((a, b) => a.length - b.length)[0];
        return { key: host, name, price: num(cheapest.price)!, from: rows.length > 1, logo: String(cheapest.logo ?? '') };
      });
  }, [publications]);

  // Publications flagged as hot sellers, priciest first.
  const hot = useMemo(
    () =>
      publications
        .filter((p) => p.hot === true && num(p.price))
        .sort((a, b) => num(b.price)! - num(a.price)! || String(a.name).localeCompare(String(b.name))),
    [publications]
  );

  const copyEmail = () => {
    navigator.clipboard
      ?.writeText(ORDERS_EMAIL)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };

  const tickerRow = (hidden: boolean) =>
    ticker.map((t) => (
      <button
        key={`${hidden ? 'b' : 'a'}-${t.key}`}
        type="button"
        className="ticker-item"
        tabIndex={hidden ? -1 : undefined}
        onClick={() => onPickPublication(t.name)}
        title={`Show ${t.name} in the list`}
      >
        {t.logo ? (
          <img src={logoSrc(t.logo)} alt="" className="ticker-logo" loading="lazy" />
        ) : (
          <span className="ticker-logo ticker-logo-fallback">{t.name.slice(0, 1)}</span>
        )}
        <span className="ticker-name">{t.name}</span>
        <span className="ticker-price">
          {t.from && <small>from</small>}
          {money(t.price)}
        </span>
      </button>
    ));

  return (
    <>
      <div className="portal-wrap hero-grid">
        <div className="min-w-0">
          <h1 className="hero-title">
            <span>Sell the press.</span>
            <span className="hero-title-accent">Keep the margin.</span>
          </h1>

          {!ready ? (
            <p className="hero-lede hero-lede-skel" aria-hidden="true">
              <span className="skel skel-line" />
              <span className="skel skel-line skel-narrow-only" />
              <span className="skel skel-line skel-short" />
            </p>
          ) : (
            <p className="hero-lede hero-fade">
              <strong>{stats.total.toLocaleString()}</strong> publications
              {counts.listicles > 0 && <>, <strong>{counts.listicles.toLocaleString()}</strong> listicles</>}
              {' '}plus TV and podcast spots. Every rate here is live and set for your account — quote it today.
            </p>
          )}

          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={onBrowse}>
              Browse the catalogue
              <ArrowDown size={17} />
            </button>
            <div className="hero-mail">
              <Mail size={16} aria-hidden="true" />
              <span className="hero-mail-label">Orders</span>
              <a href={`mailto:${ORDERS_EMAIL}`}>{ORDERS_EMAIL}</a>
              <button type="button" aria-label="Copy email address" onClick={copyEmail}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          <dl className="hero-stats">
            <div className="hero-stat" data-tone="emerald">
              <dt>Outlets to quote</dt>
              <dd>{ready ? <span className="hero-fade">{stats.total ? stats.total.toLocaleString() : '—'}</span> : <span className="skel skel-num" />}</dd>
            </div>
            <div className="hero-stat" data-tone="gold">
              <dt>Articles from</dt>
              <dd>{ready ? <span className="hero-fade">{stats.lowest ? money(stats.lowest) : '—'}</span> : <span className="skel skel-num" />}</dd>
            </div>
            <div className="hero-stat" data-tone="sky">
              <dt>Tier-1 sites (DA 80+)</dt>
              <dd>{ready ? <span className="hero-fade">{stats.tierOne ? stats.tierOne.toLocaleString() : '—'}</span> : <span className="skel skel-num" />}</dd>
            </div>
            <div className="hero-stat" data-tone="rose">
              <dt>Live in 3 days or less</dt>
              <dd>{ready ? <span className="hero-fade">{stats.fast ? stats.fast.toLocaleString() : '—'}</span> : <span className="skel skel-num" />}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="hero-terms-toggle"
            aria-expanded={termsOpen}
            onClick={() => setTermsOpen((v) => !v)}
          >
            <FileText size={14} />
            The fine print
            <ChevronDown size={14} className={`transition-transform ${termsOpen ? 'rotate-180' : ''}`} />
          </button>
          {termsOpen && (
            <p className="hero-terms">
              Once we have published the article for you, any further edits may include an extra charge.
              Digital Networking Agency will use reasonable good faith efforts to ensure that such article
              will remain publicly available in the applicable publication for at least 12 months.
            </p>
          )}
        </div>

        <aside className="hero-side">
          {!ready ? (
            <section className="hot-card" aria-hidden="true">
              <div className="hot-card-top">
                <span className="skel skel-tag" />
              </div>
              <ul className="hot-list">
                {Array.from({ length: HOT_PLACEHOLDERS }, (_, i) => (
                  <li key={i} className="hot-row">
                    <span className="skel hot-row-logo" />
                    <span className="skel skel-row-title" />
                    <span className="skel skel-row-price" />
                  </li>
                ))}
              </ul>
            </section>
          ) : hot.length > 0 && (
            <section className="hot-card hero-fade" aria-label="Hot sellers">
              <div className="hot-card-top">
                <span className="hot-tag">Hot sellers</span>
                <span className="hot-card-kind">Feature articles</span>
              </div>
              <ul className="hot-list">
                {hot.map((p) => {
                  const name = String(p.name);
                  return (
                    <li key={String(p.id)} className="hot-row">
                      {p.logo ? (
                        <img src={logoSrc(String(p.logo))} alt="" className="hot-row-logo" />
                      ) : (
                        <span className="hot-row-logo ticker-logo-fallback">{name.slice(0, 1)}</span>
                      )}
                      <div className="min-w-0">
                        <button type="button" className="hot-row-name" onClick={() => onPickPublication(name)}>
                          {name} Feature
                        </button>
                        <span className="hot-row-meta">
                          {hostOf(p.url)}
                          {p.example ? (
                            <>
                              {' · '}
                              <a href={String(p.example)} target="_blank" rel="noopener noreferrer">
                                Example <ArrowUpRight size={11} />
                              </a>
                            </>
                          ) : null}
                        </span>
                      </div>
                      <strong className="hot-row-price">{money(num(p.price)!)}</strong>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="hero-toolkit">
            <span className="hero-toolkit-label">Client questionnaires</span>
            <div className="hero-toolkit-links">
              <a
                href="https://docs.google.com/document/d/1hFgAovf6BFj71lvEWBuj-q3I3UFxGSoWjU6KkzvUwW4/edit?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={15} /> PR
              </a>
              <a
                href="https://docs.google.com/document/d/1VKongYU8yeVJQq8JgAmc80c8BWp2Ditj4CrQPdR77r8/edit?addon_store&tab=t.0"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={15} /> TV
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* Always rendered so the tabs below never jump when it fills in. */}
      <div className="hero-ticker" aria-label="Most-read outlets and your price">
        <span className="hero-ticker-label">Most read</span>
        <div className="hero-ticker-viewport">
          {ready && ticker.length > 0 ? (
            <div className="hero-ticker-track hero-fade">
              <div className="hero-ticker-row">{tickerRow(false)}</div>
              <div className="hero-ticker-row" aria-hidden="true">{tickerRow(true)}</div>
            </div>
          ) : (
            <div className="hero-ticker-row" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="ticker-item">
                  <span className="skel skel-ticker" />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
