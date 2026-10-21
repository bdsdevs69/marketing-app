'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  Mail,
  Minus,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type { AuditView } from '@/lib/audit/run';
import type { CheckGroup } from '@/lib/audit/seo-checks';
import { logoSrc } from './catalog-columns';

const ORDERS_EMAIL = 'sam@digitalnetworkingagency.com';
const NICHE_LABEL: Record<string, string> = { health: 'Health', crypto: 'Crypto', cbd: 'CBD', gambling: 'Gambling', adult: 'Adult' };
const MAX_COMPETITORS = 8;

const money = (n: number) => `$${n.toLocaleString()}`;
// "United States" -> "the United States"; "Canada" stays "Canada".
const placeName = (label: string) => (['United States', 'United Kingdom', 'Netherlands', 'UAE'].includes(label) ? `the ${label}` : label);
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');

function domainAge(iso: string | null) {
  if (!iso) return null;
  const years = (Date.now() - new Date(iso).getTime()) / (365.25 * 86400000);
  return years < 1 ? `${Math.max(1, Math.round(years * 12))} mo` : `${years.toFixed(years < 10 ? 1 : 0)} yrs`;
}

function Logo({ src, name }: { src: string; name: string }) {
  return src ? (
    <img src={logoSrc(src)} alt="" className="audit-fit-logo" loading="lazy" />
  ) : (
    <span className="audit-fit-logo is-fallback">{name.slice(0, 2)}</span>
  );
}

interface Props {
  audit: AuditView;
  onUpdate: (audit: AuditView) => void;
  onRefresh: () => void;
  canRefresh: boolean;
}

export default function AuditResult({ audit, onUpdate, onRefresh, canRefresh }: Props) {
  const [group, setGroup] = useState<'All' | CheckGroup>('All');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showPassed, setShowPassed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState('glance');

  const [rivalInput, setRivalInput] = useState('');
  const [checking, setChecking] = useState<string | null>(null); // domain being checked
  const [rivalError, setRivalError] = useState('');
  const [pressError, setPressError] = useState('');

  const { seo, profile, facts, fits, plans, featured, otherCoverage, competitors, competitorPress, coverage } = audit;
  const pressPending = coverage.status === 'pending';
  const niche = profile.niche !== 'standard' ? NICHE_LABEL[profile.niche] : null;

  const sections = [
    { id: 'glance', label: 'Overview', count: null },
    { id: 'seo', label: 'SEO', count: seo.failed.length },
    { id: 'featured', label: 'Already featured', count: featured.length },
    { id: 'competitors', label: 'Competitors', count: competitorPress.length },
    { id: 'fits', label: 'Industry fits', count: fits.length },
    { id: 'plans', label: 'Plans', count: plans.length },
  ];

  // Press is searched as its own step after the audit (about 30 seconds).
  useEffect(() => {
    if (!pressPending) return;
    let cancelled = false;
    setPressError('');
    fetch(`/api/audit/${audit.id}/coverage`, { method: 'POST' })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.message)))))
      .then((d) => !cancelled && onUpdate(d.audit))
      .catch((e) => !cancelled && setPressError(e instanceof Error ? e.message : 'Searching for their press failed'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, pressPending]);

  // Highlight the section in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('audit-', ''));
      },
      { rootMargin: '-120px 0px -60% 0px' }
    );
    sections.forEach((s) => {
      const el = document.getElementById(`audit-${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id]);

  const jump = (id: string) => {
    const el = document.getElementById(`audit-${id}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' });
  };

  // Everything the partner can add, from any section.
  const addable = useMemo(() => {
    const map = new Map<string, { id: string; name: string; price: number }>();
    for (const f of fits) map.set(f.id, f);
    for (const r of competitorPress) if (r.price !== null) map.set(r.id, { id: r.id, name: r.name, price: r.price });
    for (const p of plans) for (const i of p.items) if (!map.has(i.id)) map.set(i.id, i);
    return map;
  }, [fits, competitorPress, plans]);

  const selection = picked.map((id) => addable.get(id)).filter(Boolean) as { id: string; name: string; price: number }[];
  const selectionTotal = selection.reduce((sum, s) => sum + s.price, 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const addAll = (ids: string[]) => setPicked((p) => [...p, ...ids.filter((id) => !p.includes(id))]);

  const orderText = (items: { name: string; price: number }[]) =>
    [`Order for ${audit.domain} (${audit.market.label})`, '', ...items.map((i) => `• ${i.name} — ${money(i.price)}`), '', `Total: ${money(items.reduce((s, i) => s + i.price, 0))}`].join('\n');

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});

  const mailto = (items: { name: string; price: number }[]) =>
    `mailto:${ORDERS_EMAIL}?subject=${encodeURIComponent(`Order — ${audit.domain}`)}&body=${encodeURIComponent(orderText(items))}`;

  const competitorCall = async (body: { add?: string; remove?: string }) => {
    const res = await fetch(`/api/audit/${audit.id}/competitors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Checking that competitor failed');
    onUpdate(data.audit);
  };

  // Each competitor is searched across the catalogue in its own request.
  const addCompetitors = async (domains: string[]) => {
    setRivalError('');
    for (const domain of domains) {
      setChecking(domain);
      try {
        await competitorCall({ add: domain });
      } catch (e) {
        setRivalError(`${domain}: ${e instanceof Error ? e.message : 'check failed'}`);
      }
    }
    setChecking(null);
    setRivalInput('');
  };

  const removeCompetitor = async (domain: string) => {
    setChecking(domain);
    try {
      await competitorCall({ remove: domain });
    } catch (e) {
      setRivalError(e instanceof Error ? e.message : 'Removing failed');
    } finally {
      setChecking(null);
    }
  };

  const typed = rivalInput.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean);
  const current = competitors.map((c) => c.domain);
  const room = MAX_COMPETITORS - current.length;

  // Competitors saved before the accurate search get re-checked.
  useEffect(() => {
    const stale = competitors.filter((c) => !c.ready).map((c) => c.domain);
    if (stale.length && !checking) addCompetitors(stale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id]);

  const visibleIssues = seo.failed.filter((c) => group === 'All' || c.group === group);
  const groups: ('All' | CheckGroup)[] = ['All', 'Content', 'Technical', 'Sharing'];
  const age = domainAge(facts.domainCreated);
  const cheapestFit = fits.length ? Math.min(...fits.map((f) => f.price)) : null;
  const ring = 2 * Math.PI * 52;

  const addButton = (id: string) => {
    const on = picked.includes(id);
    return (
      <button type="button" className={`audit-add${on ? ' is-on' : ''}`} onClick={() => toggle(id)}>
        {on ? <Minus size={14} /> : <Plus size={14} />} {on ? 'Added' : 'Add'}
      </button>
    );
  };

  return (
    <div className="audit-result">
      {/* Jump menu — sticks while the page scrolls */}
      <div className="audit-nav">
        <nav className="audit-tabs" aria-label="Audit sections">
          {sections.map((s) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)} className={active === s.id ? 'is-active' : ''}>
              {s.label}
              {s.count !== null && <span>{s.count}</span>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="toolbar-button" onClick={onRefresh} disabled={!canRefresh} title="Run the audit again (uses one audit)">
            <RefreshCw size={15} /> <span className="hidden lg:inline">Run again</span>
          </button>
          <a href={`/audit/report/${audit.id}`} target="_blank" rel="noopener noreferrer" className="toolbar-button is-active">
            <FileText size={15} /> <span className="hidden sm:inline">Client report (PDF)</span><span className="sm:hidden">PDF</span>
          </a>
        </div>
      </div>

      {niche && (
        <div className="audit-niche">
          <AlertTriangle size={16} />
          <span>
            This looks like a <strong>{niche}</strong> client. Only publications that accept {niche} content are suggested,
            at {niche} rates.
          </span>
        </div>
      )}

      {/* 1. At a glance */}
      <section id="audit-glance" className="audit-panel">
        <h2 className="audit-h2"><span>1</span>{audit.domain} at a glance</h2>
        <p className="audit-glance">
          <strong>{profile.category}</strong>
          {profile.summary ? ` · ${profile.summary}` : ''}
          {profile.audience ? ` Customers: ${profile.audience}.` : ''} Market: {audit.market.label}.
        </p>

        <div className="audit-tiles">
          <div className="audit-tile">
            <span>SEO health</span>
            <strong>{seo.score}<small>/100</small></strong>
            <em>{seo.rating} · {seo.passed.length} of {seo.total} checks passed</em>
          </div>
          <div className="audit-tile">
            <span>Already featured in</span>
            <strong>{pressPending ? '…' : featured.length}</strong>
            <em>{pressPending ? 'Searching our publications…' : `of our publications · ${coverage.found} articles found`}</em>
          </div>
          <div className="audit-tile">
            <span>Pages listed</span>
            <strong>{facts.sitemap.pages !== null ? facts.sitemap.pages.toLocaleString() : '—'}</strong>
            <em>{facts.sitemap.found ? 'From their sitemap' : 'No sitemap found'}</em>
          </div>
          <div className="audit-tile">
            <span>Domain age</span>
            <strong>{age ?? '—'}</strong>
            <em>{facts.domainCreated ? `Registered ${new Date(facts.domainCreated).getFullYear()}` : 'Not published by the registry'}</em>
          </div>
        </div>

        <div className="audit-found">
          <h3>What stands out</h3>
          <ul>
            <li>
              <Check size={16} />
              <div>
                <strong>
                  {pressPending
                    ? 'Checking where they already appear…'
                    : featured.length
                      ? `Already featured in ${featured.length} of our publications`
                      : 'No coverage in our publications yet'}
                </strong>
                <p>
                  {pressPending
                    ? `Searching ${coverage.searchable} of our publications for articles linking to ${audit.domain}.`
                    : featured.length
                      ? `${featured.slice(0, 3).map((f) => f.name).join(', ')}${featured.length > 3 ? ' and more' : ''} — left out of the suggestions below.`
                      : 'Every placement would be new coverage for them.'}
                  {competitorPress.length ? ` ${competitorPress.length} more have covered their competitors but not them.` : ' Add competitors below to see where they got press.'}
                </p>
              </div>
            </li>
            <li>
              <Check size={16} />
              <div>
                <strong>{seo.failed.length ? `${seo.failed.length} things to fix on the homepage` : 'Homepage passes every check'}</strong>
                <p>
                  {seo.counts.high} high, {seo.counts.medium} medium and {seo.counts.low} low priority.
                  {seo.failed[0] ? ` Start with: ${seo.failed[0].problem?.toLowerCase()}.` : ''}
                </p>
              </div>
            </li>
            <li>
              <Check size={16} />
              <div>
                <strong>{fits.length} more publications suit them</strong>
                <p>
                  Matched on {profile.genres.join(', ')}
                  {niche ? `, ${niche}-friendly titles only` : ''}
                  {cheapestFit !== null ? `, from ${money(cheapestFit)}` : ''}.
                  {plans[0] ? ` Ready-made plans from ${money(Math.min(...plans.map((p) => p.total)))}.` : ''}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* 2. SEO */}
      <section id="audit-seo" className="audit-panel">
        <h2 className="audit-h2"><span>2</span>SEO health</h2>
        <p className="audit-sub">Checks on their homepage, most important first. Open any item for how to fix it.</p>

        <div className="audit-seo">
          <div className="audit-score">
            <div className="audit-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="52" className="audit-score-track" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  className={`audit-score-fill ${seo.score >= 85 ? 'is-good' : seo.score >= 65 ? 'is-fair' : 'is-poor'}`}
                  strokeDasharray={ring}
                  strokeDashoffset={ring * (1 - seo.score / 100)}
                />
              </svg>
              <div className="audit-score-num">
                <strong>{seo.score}</strong>
                <span>{seo.rating}</span>
              </div>
            </div>
            <p>{seo.passed.length} of {seo.total} checks passed</p>
            <div className="audit-score-counts">
              <div><strong>{seo.counts.high}</strong>High</div>
              <div><strong>{seo.counts.medium}</strong>Medium</div>
              <div><strong>{seo.counts.low}</strong>Low</div>
            </div>
          </div>

          <div className="audit-issues">
            <div className="audit-chips">
              {groups.map((g) => {
                const n = g === 'All' ? seo.failed.length : seo.failed.filter((c) => c.group === g).length;
                return (
                  <button key={g} type="button" onClick={() => setGroup(g)} className={group === g ? 'is-active' : ''}>
                    {g === 'All' ? 'All issues' : g} <span>{n}</span>
                  </button>
                );
              })}
            </div>

            <ul className="audit-issue-list">
              {visibleIssues.length === 0 && <li className="audit-issue-empty">Nothing to fix here.</li>}
              {visibleIssues.map((c) => (
                <li key={c.id} className="audit-issue">
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} aria-expanded={Boolean(open[c.id])}>
                    <span className={`audit-sev is-${c.severity}`} />
                    <div className="min-w-0 flex-1">
                      <div className="audit-issue-head">
                        {c.problem}
                        <span className={`audit-sev-tag is-${c.severity}`}>{c.severity}</span>
                        <span className="audit-group-tag">{c.group}</span>
                      </div>
                      <p>{c.detail}</p>
                    </div>
                    <ChevronDown size={16} className={`audit-caret${open[c.id] ? ' is-open' : ''}`} />
                  </button>
                  {open[c.id] && <div className="audit-fix"><strong>How to fix:</strong> {c.fix}</div>}
                </li>
              ))}
              <li className="audit-passed">
                <button type="button" onClick={() => setShowPassed((v) => !v)} aria-expanded={showPassed}>
                  {seo.passed.length} checks passed
                  <ChevronDown size={16} className={`audit-caret${showPassed ? ' is-open' : ''}`} />
                </button>
                {showPassed && (
                  <ul>
                    {seo.passed.map((c) => (
                      <li key={c.id}><Check size={14} /> {c.label}</li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. Already featured */}
      <section id="audit-featured" className="audit-panel">
        <h2 className="audit-h2"><span>3</span>Where {audit.brand} already appears</h2>
        <p className="audit-sub">
          Publications in our catalogue that have already run a story on them. They&apos;re left out of the suggestions and plans.
        </p>
        {pressPending ? (
          <div className="audit-searching" role="status">
            {pressError ? (
              <span className="audit-rivals-error">{pressError}</span>
            ) : (
              <>
                <Loader2 size={18} className="animate-spin" />
                Searching {coverage.searchable} of our publications for articles linking to {audit.domain}… about 30 seconds.
              </>
            )}
          </div>
        ) : featured.length === 0 ? (
          <p className="audit-empty">We didn&apos;t find coverage in our publications yet — every placement would be new.</p>
        ) : (
          <div className="audit-featured">
            {featured.map((f) => (
              <a key={f.id} href={f.articles[0].url} target="_blank" rel="noopener noreferrer" className="audit-feat">
                <Logo src={f.logo} name={f.name} />
                <div className="min-w-0 flex-1">
                  <strong>{f.name}</strong>
                  <span className="audit-feat-title">
                    {f.articles[0].title} <ArrowUpRight size={12} />
                  </span>
                  <em>
                    {shortDate(f.articles[0].date)}
                    {f.articles.length > 1 ? ` · ${f.articles.length} articles` : ''}
                  </em>
                </div>
                {f.dr !== null && <span className="audit-feat-dr">DR {f.dr}</span>}
              </a>
            ))}
          </div>
        )}
        {otherCoverage.length > 0 && (
          <div className="audit-other">
            <span>Also covered by</span>
            {otherCoverage.map((o) => (
              <a key={o.host} href={o.url} target="_blank" rel="noopener noreferrer">
                {o.source}
                {o.count > 1 && <small>×{o.count}</small>}
              </a>
            ))}
          </div>
        )}
        <p className="audit-footnote">
          Every article listed links to {audit.domain} or names {audit.brand} in its headline. We search the {coverage.searchable} catalogue
          publications that have a public search, plus news headlines for the rest.
        </p>
      </section>

      {/* 4. Competitors */}
      <section id="audit-competitors" className="audit-panel">
        <h2 className="audit-h2"><span>4</span>Competitors and their press</h2>
        <p className="audit-sub">
          Add the client&apos;s competitors. We search for their coverage and show which of our publications wrote about them but
          not about {audit.brand}.
        </p>

        <form
          className="audit-rivals"
          onSubmit={(e) => {
            e.preventDefault();
            const fresh = typed.filter((d) => !current.includes(d)).slice(0, Math.max(0, room));
            if (fresh.length) addCompetitors(fresh);
          }}
        >
          <div className="audit-rivals-head">
            <strong>Who are they competing with?</strong>
            <span>{current.length} of {MAX_COMPETITORS} added · separate with commas</span>
          </div>
          {competitors.length > 0 && (
            <div className="audit-rival-chips">
              {competitors.map((c) => (
                <span key={c.domain} className="audit-rival-chip">
                  {c.name} <small>{checking === c.domain ? 'checking…' : c.ready ? `${c.found} articles` : 'queued'}</small>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    disabled={checking !== null}
                    onClick={() => removeCompetitor(c.domain)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="audit-rivals-row">
            <input
              value={rivalInput}
              onChange={(e) => setRivalInput(e.target.value)}
              placeholder="rival.com, competitor.com, other.com"
              disabled={checking !== null || room <= 0}
              aria-label="Competitor websites"
            />
            <button type="submit" className="audit-run !h-11" disabled={checking !== null || !typed.length || room <= 0}>
              {checking ? <Loader2 size={15} className="animate-spin" /> : null}
              {checking ? `Checking ${checking}…` : 'Check competitors'}
            </button>
          </div>
          {checking && <p className="audit-rivals-note">Searching our publications for {checking}… about 30 seconds each.</p>}
          {rivalError && <p className="audit-rivals-error">{rivalError}</p>}
        </form>

        {competitors.length > 0 &&
          (competitorPress.length === 0 ? (
            <p className="audit-empty">None of our publications have covered these competitors (or they already covered {audit.brand} too).</p>
          ) : (
            <ul className="audit-fits">
              {competitorPress.map((r) => (
                <li key={r.id} className={picked.includes(r.id) ? 'is-picked' : ''}>
                  <Logo src={r.logo} name={r.name} />
                  <div className="min-w-0 flex-1">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="audit-fit-name">
                      {r.name} <ArrowUpRight size={13} />
                    </a>
                    <div className="audit-fit-meta">
                      {[r.dr !== null ? `DR ${r.dr}` : null, r.tat || null].filter(Boolean).join(' · ')}
                      {' · Covered '}
                      {r.competitors.join(', ')}
                    </div>
                    <a href={r.articles[0].url} target="_blank" rel="noopener noreferrer" className="audit-fit-why audit-link">
                      “{r.articles[0].title}” <ArrowUpRight size={12} />
                    </a>
                  </div>
                  {r.price !== null && <div className="audit-fit-price">{money(r.price)}</div>}
                  {r.price !== null && addButton(r.id)}
                </li>
              ))}
            </ul>
          ))}
      </section>

      {/* 5. Industry fits */}
      <section id="audit-fits" className="audit-panel">
        <h2 className="audit-h2"><span>5</span>More publications that suit them</h2>
        <p className="audit-sub">
          Titles whose readers match {profile.category.toLowerCase()} and that reach {placeName(audit.market.label)}
          {niche ? `, limited to ones that accept ${niche} content` : ''} — none of them have covered {audit.brand} or the
          competitors you added. Prices are yours.
        </p>
        {fits.length === 0 ? (
          <p className="audit-empty">No more catalogue titles match this client.</p>
        ) : (
          <ul className="audit-fits">
            {fits.map((f) => (
              <li key={f.id} className={picked.includes(f.id) ? 'is-picked' : ''}>
                <Logo src={f.logo} name={f.name} />
                <div className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="audit-fit-name">
                    {f.name} <ArrowUpRight size={13} />
                  </a>
                  <div className="audit-fit-meta">
                    {[f.dr !== null ? `DR ${f.dr}` : null, f.tat || null, f.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                  </div>
                  <div className="audit-fit-why">{f.reasons.join(' · ')}</div>
                </div>
                <div className="audit-fit-price">{money(f.price)}</div>
                {addButton(f.id)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 6. Plans */}
      <section id="audit-plans" className="audit-panel">
        <h2 className="audit-h2"><span>6</span>Ready-made plans</h2>
        <p className="audit-sub">Built from everything above. Prices are yours — add your margin when you quote.</p>
        {plans.length === 0 ? (
          <p className="audit-empty">Not enough matching titles to build plans.</p>
        ) : (
          <div className="audit-plans">
            {plans.map((p) => (
              <article key={p.key} className={`audit-plan is-${p.key}`}>
                <header>
                  <h3>{p.name}</h3>
                  <p>{p.tagline}</p>
                  <strong>{money(p.total)}</strong>
                </header>
                <ul>
                  {p.items.map((i) => (
                    <li key={i.id}>
                      <span>{i.name}</span>
                      <em>{money(i.price)}</em>
                    </li>
                  ))}
                </ul>
                <p className="audit-plan-why">{p.reasoning}</p>
                <div className="audit-plan-actions">
                  <button type="button" className="toolbar-button" onClick={() => addAll(p.items.map((i) => i.id))}>
                    <Plus size={14} /> Add all
                  </button>
                  <button type="button" className="toolbar-button" onClick={() => copy(orderText(p.items))}>
                    <Copy size={14} /> Copy
                  </button>
                  <a className="toolbar-button" href={mailto(p.items)}>
                    <Mail size={14} /> Order
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* The partner's picks, ready to send */}
      {selection.length > 0 && (
        <div className="audit-cart" role="region" aria-label="Your selection">
          <div className="min-w-0">
            <strong>{selection.length} selected · {money(selectionTotal)}</strong>
            <span className="truncate">{selection.map((s) => s.name).join(', ')}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" className="toolbar-button" onClick={() => setPicked([])}>Clear</button>
            <button type="button" className="toolbar-button" onClick={() => copy(orderText(selection))}>
              {copied ? <Check size={14} /> : <Copy size={14} />} Copy
            </button>
            <a className="audit-run !h-10" href={mailto(selection)}>
              <Mail size={15} /> Email order
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
