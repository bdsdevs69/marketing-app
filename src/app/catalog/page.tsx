'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, RotateCcw, Check, AlertCircle, ChevronDown, UserRound, Users as UsersIcon } from 'lucide-react';
import { displayPrice, type PricingRule } from '@/lib/pricing-math';

type Kind = 'publication' | 'podcast' | 'listicle';

const KINDS: { kind: Kind; tab: string; stat: string; column: string }[] = [
  { kind: 'publication', tab: 'Publications', stat: 'Publications', column: 'Publication' },
  { kind: 'listicle', tab: 'Listicles', stat: 'Listicle tiers', column: 'Listicle' },
  { kind: 'podcast', tab: 'Podcasts', stat: 'Podcasts', column: 'Podcast' },
];
const kindInfo = (k: Kind) => KINDS.find((x) => x.kind === k)!;

interface Factor {
  id: number;
  name: string;
  rules: PricingRule[];
}

interface Item {
  id: string;
  name: string;
  // Listicle tier ("Top 5"); null for publications and podcasts.
  tier: string | null;
  url: string;
  fileBase: number | null;
  base: number | null;
  overridden: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface UserOption {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  factor_id: number | null;
  factor_name: string | null;
}

type SortKey = 'name' | 'base-asc' | 'base-desc';

const PAGE_SIZE = 50;
const money = (n: number | null) => (n === null ? '—' : `$${n.toLocaleString()}`);
const userName = (u: UserOption) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;

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

  // "Prices for": everyone (base prices) or one user (their own prices).
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [userPrices, setUserPrices] = useState<Record<string, number>>({});

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

  // Users for the picker; /catalog?user=ID opens straight on that user.
  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get('user'));
    if (Number.isInteger(fromUrl) && fromUrl > 0) setUserId(fromUrl);
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUserOptions((data.users as UserOption[]).filter((u) => u.role !== 'admin')))
      .catch(() => {});
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

  // The chosen user's own prices, and keep ?user= in the address bar.
  useEffect(() => {
    setDrafts({});
    setUserPrices({});
    const url = new URL(window.location.href);
    if (userId) url.searchParams.set('user', String(userId));
    else url.searchParams.delete('user');
    window.history.replaceState(null, '', url);
    if (!userId) return;

    let cancelled = false;
    fetch(`/api/admin/user-prices?userId=${userId}&catalog=${kind}`)
      .then((r) => r.json().then((data) => (r.ok ? data : Promise.reject(new Error(data.message)))))
      .then((data) => {
        if (!cancelled) {
          setUserPrices(Object.fromEntries((data.prices as { id: string; price: number }[]).map((p) => [p.id, p.price])));
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load that user’s prices'));
    return () => {
      cancelled = true;
    };
  }, [userId, kind]);

  const selectedUser = userOptions.find((u) => u.id === userId) ?? null;
  const userMode = userId !== null;
  // What the chosen user sees without a custom price: base through their factor.
  const userFactor = factors.find((f) => f.id === selectedUser?.factor_id) ?? null;
  const userRules = userFactor?.rules ?? null;

  const isEdited = useCallback(
    (i: Item) => (userMode ? userPrices[i.id] !== undefined : i.overridden),
    [userMode, userPrices]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || i.url.toLowerCase().includes(q) || (i.tier ?? '').toLowerCase().includes(q)) &&
        (!editedOnly || isEdited(i))
    );
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name) || (a.tier ?? '').localeCompare(b.tier ?? '', undefined, { numeric: true });
      const av = a.base ?? 0;
      const bv = b.base ?? 0;
      return sort === 'base-asc' ? av - bv : bv - av;
    });
    return list;
  }, [items, query, editedOnly, sort, isEdited]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const editedCount = items.filter(isEdited).length;

  useEffect(() => {
    setPage(0);
  }, [query, editedOnly, sort, userId]);

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

  const send = async (id: string, method: 'PUT' | 'DELETE', url: string, body: object) => {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      return data;
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const save = async (item: Item) => {
    const raw = drafts[item.id];
    const value = Number(raw);
    if (raw === undefined || raw.trim() === '' || !Number.isFinite(value) || value < 0) {
      showFlash(item.id, false, 'Enter a valid price');
      return;
    }
    try {
      if (userMode) {
        const data = await send(item.id, 'PUT', '/api/admin/user-prices', { userId, catalog: kind, id: item.id, price: value });
        setUserPrices((p) => ({ ...p, [item.id]: data.price }));
        setDrafts((d) => without(d, item.id));
        showFlash(item.id, true, `Only ${selectedUser ? userName(selectedUser) : 'this user'} sees this`);
      } else {
        const data = await send(item.id, 'PUT', '/api/admin/catalog', { catalog: kind, id: item.id, base: value });
        applySaved(item.id, data.base, data.overridden);
        showFlash(item.id, true, 'Saved — live now');
      }
    } catch (e) {
      showFlash(item.id, false, e instanceof Error ? e.message : 'Save failed');
    }
  };

  const reset = async (item: Item) => {
    try {
      if (userMode) {
        await send(item.id, 'DELETE', '/api/admin/user-prices', { userId, catalog: kind, id: item.id });
        setUserPrices((p) => {
          const next = { ...p };
          delete next[item.id];
          return next;
        });
        setDrafts((d) => without(d, item.id));
        showFlash(item.id, true, 'Back to their factor price');
      } else {
        const data = await send(item.id, 'DELETE', '/api/admin/catalog', { catalog: kind, id: item.id });
        applySaved(item.id, data.base, false);
        showFlash(item.id, true, 'Back to supplier cost');
      }
    } catch (e) {
      showFlash(item.id, false, e instanceof Error ? e.message : 'Reset failed');
    }
  };

  const columnCount = userMode ? 5 : 5 + factors.length;

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
              <p className="text-xs text-gray-400 truncate">
                {userMode
                  ? 'Prices set here are seen by this user only.'
                  : 'Supplier cost is the default. Edits go live instantly — no deploy.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/users" className="toolbar-button !h-9 !px-3 text-sm">Users</Link>
            <Link href="/pricing-factors" className="toolbar-button !h-9 !px-3 text-sm">Pricing factors</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="pf-stat">
            <div className="pf-stat-k">{kindInfo(kind).stat}</div>
            <div className="pf-stat-v">{items.length.toLocaleString()}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-k">{userMode ? 'Custom prices' : 'Edited bases'}</div>
            <div className="pf-stat-v text-[#fcd34d]">{editedCount.toLocaleString()}</div>
          </div>
          {userMode ? (
            <>
              <div className="pf-stat">
                <div className="pf-stat-k">Viewing as</div>
                <div className="pf-stat-v !text-lg truncate">{selectedUser ? userName(selectedUser) : '…'}</div>
              </div>
              <div className="pf-stat">
                <div className="pf-stat-k">Their factor</div>
                <div className="pf-stat-v !text-lg truncate">{userFactor?.name ?? 'No factor'}</div>
              </div>
            </>
          ) : (
            factors.slice(0, 2).map((f) => (
              <div className="pf-stat" key={f.id}>
                <div className="pf-stat-k">Factor</div>
                <div className="pf-stat-v !text-lg truncate">{f.name}</div>
              </div>
            ))
          )}
        </div>

        {/* Controls */}
        <div className="filter-toolbar mb-4">
          <UserPicker users={userOptions} value={userId} onChange={setUserId} />

          <div className="inline-flex rounded-full p-1 bg-black/30 border border-white/10">
            {KINDS.map(({ kind: k, tab }) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-4 h-8 rounded-full text-sm font-bold transition-colors ${
                  kind === k ? 'bg-[#34d399] text-[#04221a]' : 'text-gray-300 hover:text-white'
                }`}
              >
                {tab}
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
            {userMode ? 'Custom only' : 'Edited only'}
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
                <th className="text-left">{kindInfo(kind).column}</th>
                {userMode ? (
                  <>
                    <th className="text-right">Base price</th>
                    <th className="text-right">Normal price ({userFactor?.name ?? 'no factor'})</th>
                    <th className="text-left">Price for {selectedUser ? userName(selectedUser) : 'this user'}</th>
                  </>
                ) : (
                  <>
                    <th className="text-right">Supplier cost</th>
                    <th className="text-left">Base price</th>
                    {factors.map((f) => (
                      <th key={f.id} className="text-right">{f.name}</th>
                    ))}
                    <th className="text-right">No factor</th>
                  </>
                )}
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`skeleton-${i}`} aria-hidden="true">
                    <td colSpan={columnCount} className="py-4">
                      <span className="skel h-5" />
                    </td>
                  </tr>
                ))
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-16 text-center text-gray-400">Nothing matches.</td>
                </tr>
              ) : (
                pageItems.map((item) => {
                  const draft = drafts[item.id];
                  const busy = Boolean(saving[item.id]);
                  const note = flash?.id === item.id ? flash : null;
                  const nameCell = (
                    <td>
                      <div className="font-semibold text-white leading-5 flex items-center gap-2">
                        {item.name}
                        {item.tier && <span className="catalog-tier">{item.tier}</span>}
                      </div>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-[#34d399] break-all">
                          {item.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                        </a>
                      )}
                    </td>
                  );

                  if (userMode) {
                    const custom = userPrices[item.id];
                    const normal = item.base === null ? null : displayPrice(item.base, userRules);
                    const dirty = draft !== undefined && draft.trim() !== '' && Number(draft) !== custom;
                    return (
                      <tr key={item.id} className={dirty ? 'is-dirty' : ''}>
                        {nameCell}
                        <td className="text-right tabular-nums text-gray-400">{money(item.base)}</td>
                        <td className={`text-right tabular-nums ${custom !== undefined ? 'text-gray-500 line-through' : 'text-white font-semibold'}`}>
                          {money(normal)}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="catalog-input-wrap">
                              <span>$</span>
                              <input
                                inputMode="decimal"
                                value={draft ?? (custom !== undefined ? String(custom) : '')}
                                placeholder={normal === null ? '' : String(normal)}
                                onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') save(item);
                                  if (e.key === 'Escape') setDrafts((d) => without(d, item.id));
                                }}
                                aria-label={`Price of ${item.name}${item.tier ? ` ${item.tier}` : ''} for this user`}
                              />
                            </div>
                            {custom !== undefined && !dirty && <span className="catalog-pill">Custom</span>}
                          </div>
                          {note && <div className={`mt-1 text-xs ${note.ok ? 'text-[#34d399]' : 'text-red-400'}`}>{note.text}</div>}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {dirty ? (
                            <button type="button" disabled={busy} onClick={() => save(item)} className="catalog-save">
                              <Check size={14} /> {busy ? 'Saving…' : 'Save'}
                            </button>
                          ) : custom !== undefined ? (
                            <button type="button" disabled={busy} onClick={() => reset(item)} className="catalog-reset" title="Back to their normal price">
                              <RotateCcw size={13} /> Reset
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }

                  const dirty = draft !== undefined && Number(draft) !== item.base;
                  const previewBase = draft !== undefined && draft.trim() !== '' && Number.isFinite(Number(draft))
                    ? Number(draft)
                    : item.base;

                  return (
                    <tr key={item.id} className={dirty ? 'is-dirty' : ''}>
                      {nameCell}
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
                              aria-label={`Base price for ${item.name}${item.tier ? ` ${item.tier}` : ''}`}
                            />
                          </div>
                          {item.overridden && !dirty && <span className="catalog-pill">Edited</span>}
                        </div>
                        {note && <div className={`mt-1 text-xs ${note.ok ? 'text-[#34d399]' : 'text-red-400'}`}>{note.text}</div>}
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

// "Prices for" dropdown: everyone, or one user found by name or email.
function UserPicker({
  users,
  value,
  onChange,
}: {
  users: UserOption[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const selected = users.find((u) => u.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = search.trim().toLowerCase();
  const matches = users.filter((u) => !q || userName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

  const pick = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="user-picker" ref={boxRef}>
      <button
        type="button"
        className={`toolbar-button${value !== null ? ' is-active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {value !== null ? <UserRound size={15} /> : <UsersIcon size={15} />}
        <span className="max-w-[180px] truncate">Prices for: {selected ? userName(selected) : value !== null ? '…' : 'Everyone'}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="user-picker-menu" role="listbox">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a user…"
              className="filter-input !h-9 !pl-8 !text-sm"
            />
          </div>
          <div className="user-picker-list">
            <button type="button" role="option" aria-selected={value === null} onClick={() => pick(null)} className={`user-picker-item${value === null ? ' is-selected' : ''}`}>
              <span className="font-bold">Everyone</span>
              <span className="text-xs text-gray-500">Base prices for all users</span>
            </button>
            {matches.map((u) => (
              <button
                type="button"
                role="option"
                aria-selected={u.id === value}
                key={u.id}
                onClick={() => pick(u.id)}
                className={`user-picker-item${u.id === value ? ' is-selected' : ''}`}
              >
                <span className="font-bold truncate">{userName(u)}</span>
                <span className="text-xs text-gray-500 truncate">
                  {u.email} · {u.factor_name ?? 'No factor'}
                </span>
              </button>
            ))}
            {matches.length === 0 && <div className="px-3 py-3 text-sm text-gray-500">No user matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
