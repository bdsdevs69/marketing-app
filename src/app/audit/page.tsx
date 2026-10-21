'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe, Loader2, Search, AlertCircle } from 'lucide-react';
import { MARKETS } from '@/lib/audit/markets';
import type { AuditView } from '@/lib/audit/run';
import AuditResult from '@/components/AuditResult';
import ThemeToggle from '@/components/ThemeToggle';

interface Recent {
  id: number;
  domain: string;
  market: string;
}

interface Quota {
  used: number;
  limit: number | null;
}

// What the audit does while it runs, in order; shown as a progress list.
const STEPS = ['Opening the website', 'Running the SEO checks', 'Working out the industry and niche', 'Matching publications at your prices'];

export default function AuditPage() {
  const [url, setUrl] = useState('');
  const [market, setMarket] = useState('us');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const resultRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/audit');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    if (res.ok) {
      setRecent(data.recent);
      setQuota(data.quota);
    }
  }, []);

  useEffect(() => {
    loadList();
    // /audit?id=123 opens a saved audit (links from the report and elsewhere).
    const id = Number(new URLSearchParams(window.location.search).get('id'));
    if (Number.isInteger(id) && id > 0) openSaved(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadList]);

  // Walk the progress list while a run is in flight.
  useEffect(() => {
    if (!running) return;
    setStep(0);
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => window.clearInterval(timer);
  }, [running]);

  const show = (view: AuditView) => {
    setAudit(view);
    setUrl(view.domain);
    setMarket(view.market.code);
    const next = new URL(window.location.href);
    next.searchParams.set('id', String(view.id));
    window.history.replaceState(null, '', next);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const run = async (refresh = false) => {
    if (!url.trim() || running) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, market, refresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'The audit failed');
      setQuota(data.quota);
      show(data.audit);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The audit failed');
    } finally {
      setRunning(false);
    }
  };

  async function openSaved(id: number) {
    setError('');
    try {
      const res = await fetch(`/api/audit/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not open that audit');
      show(data.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that audit');
    }
  }

  const marketLabel = (code: string) => MARKETS.find((m) => m.code === code)?.code.toUpperCase() ?? code.toUpperCase();
  const left = quota?.limit != null ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <div className="min-h-screen">
      <header className="audit-top">
        <div className="portal-wrap h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="toolbar-button !h-9 !px-3" aria-label="Back to dashboard">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <img src="/logo-money.png" alt="" className="h-8 w-auto hidden sm:block" />
          </div>
          <ThemeToggle className="toolbar-button !h-9 !px-3" />
        </div>
      </header>

      <section className="portal-hero audit-hero">
        <div className="portal-wrap pb-8">
          <div className="audit-hero-row">
            <div className="min-w-0">
              <h1 className="audit-title">
                Audit a client. <span className="hero-title-accent">Pitch the right press.</span>
              </h1>
              <p className="audit-lede">
                Enter a client&apos;s website. We check their SEO, work out their industry and niche, and line up the
                publications that suit them — at your prices.
              </p>
            </div>
            {quota && (
              <div className="audit-quota">
                <div className="audit-quota-text">
                  {quota.limit == null ? (
                    <>Unlimited audits</>
                  ) : quota.limit === 0 ? (
                    <>New audits are switched off for your account</>
                  ) : (
                    <>
                      <strong>{quota.used}</strong> of {quota.limit} new audits this month
                    </>
                  )}
                </div>
                {quota.limit != null && quota.limit > 0 && (
                  <div className="audit-quota-bar">
                    <span style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
                  </div>
                )}
                <div className="audit-quota-note">Opening a saved audit is free</div>
              </div>
            )}
          </div>

          <form
            className="audit-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(false);
            }}
          >
            <Globe size={18} className="audit-form-icon" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Client's website, e.g. clientbrand.com"
              aria-label="Client's website"
              autoComplete="off"
              spellCheck={false}
            />
            <select value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Market they sell in">
              {MARKETS.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
            <button type="submit" className="audit-run" disabled={running || !url.trim() || left === 0}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {running ? 'Auditing…' : 'Run audit'}
            </button>
          </form>

          {recent.length > 0 && (
            <div className="audit-recent">
              <span>Recent</span>
              {recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openSaved(r.id)}
                  className={audit?.id === r.id ? 'is-active' : ''}
                >
                  {r.domain} <small>{marketLabel(r.market)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="portal-light audit-body" ref={resultRef}>
        <div className="portal-wrap py-8">
          {error && (
            <div className="audit-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {running ? (
            <div className="audit-progress" role="status">
              <h2>Auditing {url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}…</h2>
              <ol>
                {STEPS.map((s, i) => (
                  <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
                    <span className="audit-progress-dot" />
                    {s}
                  </li>
                ))}
              </ol>
              <p>Usually 10–30 seconds, depending on how fast their site answers.</p>
            </div>
          ) : audit ? (
            <AuditResult audit={audit} onUpdate={setAudit} onRefresh={() => run(true)} canRefresh={left !== 0} />
          ) : (
            <div className="audit-steps">
              {[
                ['Enter their website', 'Any page on their site works. Pick the market they sell in.'],
                ['We check and profile it', 'Twenty SEO checks on their homepage, plus their industry and whether they’re a niche client.'],
                ['Get placements and plans', 'Publications that fit them at your prices, three ready-made plans, and a client-ready PDF.'],
              ].map(([title, text], i) => (
                <div key={title} className="audit-step">
                  <span className="audit-step-n">{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
