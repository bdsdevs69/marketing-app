'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { displayPrice, type PricingRule } from '@/lib/pricing-math';

type Kind = 'publication' | 'podcast';

interface Factor {
  id: number;
  name: string;
  rules: PricingRule[];
}

interface Item {
  id: string;
  name: string;
  url: string;
  fileBase: number | null;
  base: number | null;
  overridden: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

type SortKey = 'name' | 'base-asc' | 'base-desc';

const PAGE_SIZE = 50;
const money = (n: number | null) => (n === null ? '—' : `$${n.toLocaleString()}`);

function without(record: Record<string, string>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export default function CatalogPage() {
  const [kind, setKind] = useState<Kind>('publication');
  const [items, setItems] = useState<Item[]>([]);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [editedOnly, setEditedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('name');
  const [page, setPage] = useState(0);

  // Unsaved edits, keyed by item id.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  // Admins only.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => {
        if (me.role !== 'admin') window.location.href = '/';
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  const load = useCallback(async (k: Kind) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/catalog?catalog=${k}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load');
      setItems(data.items);
      setFactors(data.factors);
      setDrafts({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(kind);
    setPage(0);
  }, [kind, load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || i.url.toLowerCase().includes(q)) &&
        (!editedOnly || i.overridden)
    );
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const av = a.base ?? 0;
      const bv = b.base ?? 0;
      return sort === 'base-asc' ? av - bv : bv - av;
    });
    return list;
  }, [items, query, editedOnly, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const editedCount = items.filter((i) => i.overridden).length;

  useEffect(() => {
    setPage(0);
  }, [query, editedOnly, sort]);

  const showFlash = (id: string, ok: boolean, text: string) => {
    setFlash({ id, ok, text });
    window.setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 2500);
  };

  const applySaved = (id: string, base: number, overridden: boolean) => {
    setItems((list) =>
      list.map((i) =>
        i.id === id
          ? { ...i, base, overridden, updatedAt: overridden ? new Date().toISOString() : null, updatedBy: overridden ? 'you' : null }
          : i
      )
    );
    setDrafts((d) => without(d, id));
  };

  const save = async (item: Item) => {
    const raw = drafts[item.id];
    const base = Number(raw);
    if (raw === undefined || raw.trim() === '' || !Number.isFinite(base) || base < 0) {
      showFlash(item.id, false, 'Enter a valid price');
      return;
    }
    setSaving((s) => ({ ...s, [item.id]: true }));
    try {
      const res = await fetch('/api/admin/catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog: kind, id: item.id, base }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      applySaved(item.id, data.base, data.overridden);
      showFlash(item.id, true, 'Saved — live now');
    } catch (e) {
      showFlash(item.id, false, e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving((s) => ({ ...s, [item.id]: false }));
    }
  };

  const reset = async (item: Item) => {
    setSaving((s) => ({ ...s, [item.id]: true }));
    try {
      const res = await fetch('/api/admin/catalog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog: kind, id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      applySaved(item.id, data.base, false);
      showFlash(item.id, true, 'Back to supplier cost');
    } catch (e) {
      showFlash(item.id, false, e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving((s) => ({ ...s, [item.id]: false }));
    }
  };

  return (
    <div className="min-h-screen text-white">
      <header className="catalog-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="toolbar-button !h-9 !px-3" aria-label="Back to dashboard">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">Base prices</h1>
              <p className="text-xs text-gray-400 truncate">Supplier cost is the default. Edits go live instantly — no deploy.</p>
            </div>
          </div>
          <Link href="/pricing-factors" className="toolbar-button !h-9 !px-3 text-sm">Pricing factors</Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="pf-stat">
            <div className="pf-stat-k">{kind === 'publication' ? 'Publications' : 'Podcasts'}</div>
            <div className="pf-stat-v">{items.length.toLocaleString()}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-k">Edited bases</div>
            <div className="pf-stat-v text-[#fcd34d]">{editedCount.toLocaleString()}</div>
          </div>
          {factors.slice(0, 2).map((f) => (
            <div className="pf-stat" key={f.id}>
              <div className="pf-stat-k">Factor</div>
              <div className="pf-stat-v !text-lg truncate">{f.name}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="filter-toolbar mb-4">
          <div className="inline-flex rounded-full p-1 bg-black/30 border border-white/10">
            {(['publication', 'podcast'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-4 h-8 rounded-full text-sm font-bold transition-colors ${
                  kind === k ? 'bg-[#34d399] text-[#04221a]' : 'text-gray-300 hover:text-white'
                }`}
              >
                {k === 'publication' ? 'Publications' : 'Podcasts'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or URL…"
              className="toolbar-search !pr-4"
            />
          </div>

          <button
            type="button"
            onClick={() => setEditedOnly((v) => !v)}
            className={`toolbar-button${editedOnly ? ' is-active' : ''}`}
          >
            Edited only
          </button>

          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="toolbar-button !pr-8">
            <option value="name">Name A–Z</option>
            <option value="base-asc">Base: low to high</option>
            <option value="base-desc">Base: high to low</option>
          </select>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 flex items-center gap-2 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="catalog-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">{kind === 'publication' ? 'Publication' : 'Podcast'}</th>
                <th className="text-right">Supplier cost</th>
                <th className="text-left">Base price</th>
                {factors.map((f) => (
                  <th key={f.id} className="text-right">{f.name}</th>
                ))}
                <th className="text-right">No factor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`skeleton-${i}`} aria-hidden="true">
                    <td colSpan={5 + factors.length} className="py-4">
                      <span className="skel h-5" />
                    </td>
                  </tr>
                ))
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5 + factors.length} className="py-16 text-center text-gray-400">Nothing matches.</td>
                </tr>
              ) : (
                pageItems.map((item) => {
                  const draft = drafts[item.id];
                  const dirty = draft !== undefined && Number(draft) !== item.base;
                  const previewBase = draft !== undefined && draft.trim() !== '' && Number.isFinite(Number(draft))
                    ? Number(draft)
                    : item.base;
                  const busy = Boolean(saving[item.id]);
                  const note = flash?.id === item.id ? flash : null;

                  return (
                    <tr key={item.id} className={dirty ? 'is-dirty' : ''}>
                      <td>
                        <div className="font-semibold text-white leading-5">{item.name}</div>
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-[#34d399] break-all">
                            {item.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                          </a>
                        )}
                      </td>
                      <td className="text-right tabular-nums text-gray-400">{money(item.fileBase)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="catalog-input-wrap">
                            <span>$</span>
                            <input
                              inputMode="decimal"
                              value={draft ?? (item.base ?? '').toString()}
                              onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') save(item);
                                if (e.key === 'Escape') setDrafts((d) => without(d, item.id));
                              }}
                              aria-label={`Base price for ${item.name}`}
                            />
                          </div>
                          {item.overridden && !dirty && <span className="catalog-pill">Edited</span>}
                        </div>
                        {note && (
                          <div className={`mt-1 text-xs ${note.ok ? 'text-[#34d399]' : 'text-red-400'}`}>{note.text}</div>
                        )}
                      </td>
                      {factors.map((f) => (
                        <td key={f.id} className={`text-right tabular-nums font-semibold ${dirty ? 'text-[#fcd34d]' : 'text-white'}`}>
                          {previewBase === null ? '—' : money(displayPrice(previewBase, f.rules))}
                        </td>
                      ))}
                      <td className={`text-right tabular-nums ${dirty ? 'text-[#fcd34d]' : 'text-gray-300'}`}>
                        {previewBase === null ? '—' : money(displayPrice(previewBase, null))}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {dirty ? (
                          <button type="button" disabled={busy} onClick={() => save(item)} className="catalog-save">
                            <Check size={14} /> {busy ? 'Saving…' : 'Save'}
                          </button>
                        ) : item.overridden ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => reset(item)}
                            className="catalog-reset"
                            title={`Back to supplier cost (${money(item.fileBase)})`}
                          >
                            <RotateCcw size={13} /> Reset
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — only once rows are in, so it doesn't get shoved down */}
        {!loading && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>
              {visible.length === 0
                ? '0 results'
                : `${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min(visible.length, (page + 1) * PAGE_SIZE).toLocaleString()} of ${visible.length.toLocaleString()}`}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" className="toolbar-button !h-9" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span className="tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <button type="button" className="toolbar-button !h-9" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
