'use client';

import { use, useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import type { AuditView } from '@/lib/audit/run';

const PREPARED_BY_KEY = 'dna-audit-prepared-by';
const NICHE_LABEL: Record<string, string> = { health: 'Health', crypto: 'Crypto', cbd: 'CBD', gambling: 'Gambling', adult: 'Adult' };
const money = (n: number) => `$${n.toLocaleString()}`;
// "United States" -> "the United States"; "Canada" stays "Canada".
const placeName = (label: string) => (['United States', 'United Kingdom', 'Netherlands', 'UAE'].includes(label) ? `the ${label}` : label);

// White-label client report: no DNA branding, prices off unless the partner
// switches them on (they resell at their own margin). Printed to PDF.
export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [error, setError] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [showPrices, setShowPrices] = useState(false);

  useEffect(() => {
    try {
      setPreparedBy(window.localStorage.getItem(PREPARED_BY_KEY) ?? '');
    } catch {}
    const load = (url: string, init?: RequestInit) =>
      fetch(url, init).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.message)))));
    // The press search runs after the audit; finish it before showing the report.
    load(`/api/audit/${id}`)
      .then((d) => (d.audit.coverage.status === 'pending' ? load(`/api/audit/${id}/coverage`, { method: 'POST' }) : d))
      .then((d) => setAudit(d.audit))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the report'));
  }, [id]);

  const savePreparedBy = (value: string) => {
    setPreparedBy(value);
    try {
      window.localStorage.setItem(PREPARED_BY_KEY, value);
    } catch {}
  };

  if (error) return <div className="report-page"><p className="report-error">{error}</p></div>;
  if (!audit) return <div className="report-page"><p className="report-loading">Preparing the report… checking their press can take about 30 seconds.</p></div>;

  const { seo, profile, facts, fits, plans, featured, otherCoverage, competitorPress } = audit;
  const niche = profile.niche !== 'standard' ? NICHE_LABEL[profile.niche] : null;
  const date = new Date(audit.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="report-page">
      <div className="report-toolbar">
        <a href={`/audit?id=${audit.id}`} className="report-btn"><ArrowLeft size={15} /> Back to audit</a>
        <label>
          Prepared by
          <input value={preparedBy} onChange={(e) => savePreparedBy(e.target.value)} placeholder="Your agency name" />
        </label>
        <label className="report-check">
          <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
          Include prices
        </label>
        <button type="button" className="report-btn is-primary" onClick={() => window.print()}>
          <Printer size={15} /> Download PDF
        </button>
      </div>

      <article className="report-sheet">
        <header className="report-cover">
          <p className="report-kicker">SEO &amp; press audit</p>
          <h1>{audit.domain}</h1>
          <p className="report-meta">
            {date} · Market: {audit.market.label}
            {preparedBy ? ` · Prepared by ${preparedBy}` : ''}
          </p>
        </header>

        <section className="report-section">
          <h2>At a glance</h2>
          <p className="report-lead">
            <strong>{profile.category}.</strong> {profile.summary}
            {profile.audience ? ` Customers: ${profile.audience}.` : ''}
          </p>
          <div className="report-stats">
            <div><strong>{seo.score}/100</strong><span>SEO health ({seo.rating})</span></div>
            <div><strong>{seo.passed.length}/{seo.total}</strong><span>Checks passed</span></div>
            <div><strong>{(facts.responseMs / 1000).toFixed(1)}s</strong><span>Server response</span></div>
            <div><strong>{facts.sitemap.pages !== null ? facts.sitemap.pages.toLocaleString() : '—'}</strong><span>Pages listed</span></div>
          </div>
          {niche && <p className="report-note">As a {niche} business, only publications that accept {niche} content are recommended.</p>}
        </section>

        <section className="report-section">
          <h2>What to fix on the website</h2>
          {seo.failed.length === 0 ? (
            <p>The homepage passed every check.</p>
          ) : (
            <ol className="report-issues">
              {seo.failed.map((c) => (
                <li key={c.id}>
                  <div className="report-issue-head">
                    <strong>{c.problem}</strong>
                    <span className={`report-sev is-${c.severity}`}>{c.severity} priority</span>
                  </div>
                  <p>{c.detail}</p>
                  <p className="report-fix"><em>Fix:</em> {c.fix}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="report-section">
          <h2>Where {audit.brand} has been featured</h2>
          {featured.length === 0 && otherCoverage.length === 0 ? (
            <p>We found no press coverage yet — every placement would be new.</p>
          ) : (
            <>
              {featured.length > 0 && (
                <ul className="report-list">
                  {featured.map((f) => (
                    <li key={f.id}>
                      <strong>{f.name}</strong>
                      {f.dr !== null ? ` (DR ${f.dr})` : ''} — <a href={f.articles[0].url}>{f.articles[0].title}</a>
                    </li>
                  ))}
                </ul>
              )}
              {otherCoverage.length > 0 && (
                <p className="report-also">Also covered by: {otherCoverage.map((o) => o.source).join(', ')}.</p>
              )}
            </>
          )}
        </section>

        {competitorPress.length > 0 && (
          <section className="report-section">
            <h2>Where competitors got press</h2>
            <p>These publications have covered their competitors but not {audit.brand}.</p>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Publication</th>
                  <th>Covered</th>
                  <th>DR</th>
                  {showPrices && <th className="text-right">Price</th>}
                </tr>
              </thead>
              <tbody>
                {competitorPress.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><span>{r.articles[0].title}</span></td>
                    <td>{r.competitors.join(', ')}</td>
                    <td>{r.dr ?? '—'}</td>
                    {showPrices && <td className="text-right">{r.price !== null ? money(r.price) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {fits.length > 0 && (
          <section className="report-section">
            <h2>Publications we recommend</h2>
            <p>Chosen because their readers match {profile.category.toLowerCase()} and they reach {placeName(audit.market.label)}.</p>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Publication</th>
                  <th>Why it fits</th>
                  <th>DR</th>
                  <th>Live in</th>
                  {showPrices && <th className="text-right">Price</th>}
                </tr>
              </thead>
              <tbody>
                {fits.slice(0, 10).map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.name}</strong><span>{f.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span></td>
                    <td>{f.reasons.filter((r) => !r.startsWith('DR ')).join(' · ')}</td>
                    <td>{f.dr ?? '—'}</td>
                    <td>{f.tat || '—'}</td>
                    {showPrices && <td className="text-right">{money(f.price)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {plans.length > 0 && (
          <section className="report-section">
            <h2>Suggested plans</h2>
            <div className="report-plans">
              {plans.map((p) => (
                <div key={p.key} className="report-plan">
                  <h3>{p.name}{showPrices ? ` · ${money(p.total)}` : ''}</h3>
                  <p className="report-plan-tag">{p.tagline}</p>
                  <ul>
                    {p.items.map((i) => (
                      <li key={i.id}>{i.name}{showPrices ? ` — ${money(i.price)}` : ''}</li>
                    ))}
                  </ul>
                  <p>{p.reasoning}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="report-footer">
          {preparedBy ? `Prepared by ${preparedBy} · ` : ''}{audit.domain} · {date}
        </footer>
      </article>
    </div>
  );
}
