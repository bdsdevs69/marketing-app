'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Search,
  Shield,
  ShieldOff,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import PageSkeleton from '@/components/PageSkeleton';
import FilterDrawer from '@/components/FilterDrawer';

interface UserRow {
  id: number;
  email: string;
  role: 'admin' | 'user';
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  created_at: string;
  factor_id: number | null;
  factor_name: string | null;
  last_login: string | null;
  login_count: number;
  custom_prices: number;
  has_password_copy: boolean;
}

interface FactorOption {
  id: number;
  name: string;
  is_active: boolean;
}

type StatusFilter = 'all' | 'active' | 'restricted';

const MIN_PASSWORD_LENGTH = 8;

const displayName = (u: UserRow) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
const initials = (u: UserRow) =>
  displayName(u)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

const fullDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never';

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// 14 characters without look-alikes (no 0/O, 1/l/I), easy to read out.
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [factors, setFactors] = useState<FactorOption[]>([]);
  const [passwordView, setPasswordView] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load users');
      setUsers(data.users);
      setFactors(data.factors);
      setPasswordView(Boolean(data.passwordView));
      setCurrentUserId(data.currentUserId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (status === 'all' || (status === 'active' ? u.is_active : !u.is_active)) &&
        (!q || displayName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [users, query, status]);

  const updateUser = (id: number, patch: Partial<UserRow>) =>
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const activeCount = users.filter((u) => u.is_active).length;
  const loggedInThisMonth = users.filter(
    (u) => u.last_login && Date.now() - new Date(u.last_login).getTime() < 30 * 86400000
  ).length;

  if (loading) return <PageSkeleton />;

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
              <h1 className="text-lg font-bold truncate">Users</h1>
              <p className="text-xs text-gray-400 truncate">Accounts, pricing factors, passwords and access.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/catalog" className="toolbar-button !h-9 !px-3 text-sm">Base prices</Link>
            <Link href="/pricing-factors" className="toolbar-button !h-9 !px-3 text-sm">Pricing factors</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="pf-stat">
            <div className="pf-stat-k">Users</div>
            <div className="pf-stat-v">{users.length}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-k">Active</div>
            <div className="pf-stat-v text-[#34d399]">{activeCount}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-k">Restricted</div>
            <div className="pf-stat-v text-[#fb7185]">{users.length - activeCount}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-k">Logged in, last 30 days</div>
            <div className="pf-stat-v text-[#fcd34d]">{loggedInThisMonth}</div>
          </div>
        </div>

        <div className="filter-toolbar mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="toolbar-search !pr-4"
            />
          </div>
          <div className="inline-flex rounded-full p-1 bg-black/30 border border-white/10">
            {(['all', 'active', 'restricted'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`px-4 h-8 rounded-full text-sm font-bold capitalize transition-colors ${
                  status === s ? 'bg-[#34d399] text-[#04221a]' : 'text-gray-300 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
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
                <th className="text-left">User</th>
                <th className="text-left">Pricing factor</th>
                <th className="text-left">Status</th>
                <th className="text-left">Last login</th>
                <th className="text-left">Created</th>
                <th className="text-right">Custom prices</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">No users match.</td>
                </tr>
              ) : (
                visible.map((u) => (
                  <tr key={u.id} className="users-row" onClick={() => setSelectedId(u.id)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="users-avatar">{initials(u)}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white leading-5 flex items-center gap-2">
                            {displayName(u)}
                            {u.role === 'admin' && <span className="users-badge is-admin"><Shield size={11} /> Admin</span>}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {u.factor_name ? (
                        <span className="users-badge">{u.factor_name}</span>
                      ) : (
                        <span className="text-gray-500">No factor</span>
                      )}
                    </td>
                    <td>
                      <span className={`users-badge ${u.is_active ? 'is-active' : 'is-restricted'}`}>
                        {u.is_active ? 'Active' : 'Restricted'}
                      </span>
                    </td>
                    <td className="text-gray-300" title={fullDate(u.last_login)}>{timeAgo(u.last_login)}</td>
                    <td className="text-gray-400">{new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="text-right tabular-nums text-gray-300">{u.custom_prices || '—'}</td>
                    <td className="text-right text-gray-500"><ChevronRight size={16} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <FilterDrawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        footerLabel="Done"
        title={selected ? displayName(selected) : 'User'}
      >
        {selected && (
          <UserPanel
            key={selected.id}
            user={selected}
            factors={factors}
            passwordView={passwordView}
            isSelf={selected.id === currentUserId}
            onChange={(patch) => updateUser(selected.id, patch)}
            onDeleted={() => {
              setUsers((list) => list.filter((u) => u.id !== selected.id));
              setSelectedId(null);
            }}
          />
        )}
      </FilterDrawer>
    </div>
  );
}

interface UserPanelProps {
  user: UserRow;
  factors: FactorOption[];
  passwordView: boolean;
  isSelf: boolean;
  onChange: (patch: Partial<UserRow>) => void;
  onDeleted: () => void;
}

function UserPanel({ user, factors, passwordView, isSelf, onChange, onDeleted }: UserPanelProps) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealState, setRevealState] = useState<'idle' | 'loading' | 'none'>('idle');
  const [copied, setCopied] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const protectedAccount = user.role === 'admin' || isSelf;

  const say = (ok: boolean, text: string) => {
    setNote({ ok, text });
    window.setTimeout(() => setNote((n) => (n?.text === text ? null : n)), 4000);
  };

  const request = async (key: string, url: string, init: RequestInit) => {
    setBusy(key);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Something went wrong');
      return data;
    } finally {
      setBusy(null);
    }
  };

  const reveal = async () => {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    setRevealState('loading');
    try {
      const data = await request('reveal', `/api/admin/users/${user.id}/password`, { method: 'GET' });
      if (data.password) {
        setRevealed(data.password);
        setRevealState('idle');
      } else {
        setRevealState('none');
      }
    } catch (e) {
      setRevealState('idle');
      say(false, e instanceof Error ? e.message : 'Could not load the password');
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const changeFactor = async (value: string) => {
    try {
      if (value === '') {
        await request('factor', '/api/admin/user-factors', { method: 'DELETE', body: JSON.stringify({ userId: user.id }) });
        onChange({ factor_id: null, factor_name: null });
      } else {
        const factor = factors.find((f) => f.id === Number(value));
        await request('factor', '/api/admin/user-factors', {
          method: 'POST',
          body: JSON.stringify({ userId: user.id, factorId: Number(value) }),
        });
        onChange({ factor_id: Number(value), factor_name: factor?.name ?? null });
      }
      say(true, 'Pricing factor saved — their prices update straight away');
    } catch (e) {
      say(false, e instanceof Error ? e.message : 'Could not change the factor');
    }
  };

  const savePassword = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      say(false, `Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    try {
      const data = await request('password', `/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      setRevealed(newPassword);
      setRevealState('idle');
      setNewPassword('');
      onChange({ has_password_copy: Boolean(data.viewable) });
      say(true, isSelf ? 'Password changed' : 'Password changed — they have been signed out everywhere');
    } catch (e) {
      say(false, e instanceof Error ? e.message : 'Could not change the password');
    }
  };

  const toggleAccess = async () => {
    try {
      await request('access', '/api/admin/users/toggle-status', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, isActive: !user.is_active }),
      });
      onChange({ is_active: !user.is_active });
      say(true, user.is_active ? 'User restricted — they can no longer sign in' : 'User activated');
    } catch (e) {
      say(false, e instanceof Error ? e.message : 'Could not change access');
    }
  };

  const deleteUser = async () => {
    try {
      await request('delete', `/api/admin/users/${user.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      say(false, e instanceof Error ? e.message : 'Could not delete the user');
    }
  };

  return (
    <div className="user-panel">
      <div className="user-panel-head">
        <span className="users-avatar is-large">{initials(user)}</span>
        <div className="min-w-0">
          <div className="text-sm text-gray-400 truncate">{user.email}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {user.role === 'admin' && <span className="users-badge is-admin"><Shield size={11} /> Admin</span>}
            <span className={`users-badge ${user.is_active ? 'is-active' : 'is-restricted'}`}>
              {user.is_active ? 'Active' : 'Restricted'}
            </span>
          </div>
        </div>
      </div>

      {note && (
        <div className={`user-panel-note ${note.ok ? 'is-ok' : 'is-error'}`}>
          {note.ok ? <Check size={14} /> : <AlertCircle size={14} />} {note.text}
        </div>
      )}

      <dl className="user-facts">
        <div>
          <dt>Created</dt>
          <dd>{fullDate(user.created_at)}</dd>
        </div>
        <div>
          <dt>Last login</dt>
          <dd>
            {fullDate(user.last_login)}
            {user.last_login && <span className="user-facts-sub">{timeAgo(user.last_login)} · {user.login_count} logins in total</span>}
          </dd>
        </div>
      </dl>

      <section className="user-section">
        <h3>Pricing factor</h3>
        <select
          className="filter-select user-select"
          value={user.factor_id ?? ''}
          disabled={busy === 'factor'}
          onChange={(e) => changeFactor(e.target.value)}
        >
          <option value="">No factor (default markup)</option>
          {factors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}{f.is_active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        <Link href={`/catalog?user=${user.id}`} className="user-link">
          <Tag size={14} />
          {user.custom_prices > 0
            ? `${user.custom_prices} custom price${user.custom_prices === 1 ? '' : 's'} — edit`
            : 'Set custom prices for this user'}
          <ChevronRight size={14} />
        </Link>
      </section>

      <section className="user-section">
        <h3>Password</h3>
        {passwordView ? (
          <>
            <div className="user-password">
              <span className={`user-password-value${revealed !== null ? ' is-shown' : ''}`}>
                {revealed ?? '••••••••••'}
              </span>
              {revealed !== null && (
                <button type="button" className="user-icon-btn" onClick={() => copy(revealed)} aria-label="Copy password">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              )}
              <button
                type="button"
                className="user-icon-btn"
                onClick={reveal}
                disabled={revealState === 'loading'}
                aria-label={revealed !== null ? 'Hide password' : 'Show password'}
              >
                {revealed !== null ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {revealState === 'none' && (
              <p className="user-hint">
                Not on file yet — it&apos;s saved the next time they log in, or when you set a new one below.
              </p>
            )}
          </>
        ) : (
          <p className="user-hint">Viewing passwords isn&apos;t switched on for this site.</p>
        )}

        <div className="user-password-form">
          <div className="relative flex-1">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              className="filter-input user-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePassword()}
            />
          </div>
          <button type="button" className="toolbar-button !h-10" onClick={() => setNewPassword(generatePassword())} title="Generate a strong password">
            <Wand2 size={15} /> <span className="hidden sm:inline">Generate</span>
          </button>
          <button type="button" className="catalog-save !h-10" disabled={busy === 'password' || !newPassword} onClick={savePassword}>
            {busy === 'password' ? 'Saving…' : 'Set'}
          </button>
        </div>
        {!isSelf && <p className="user-hint">Setting a new password signs them out everywhere.</p>}
      </section>

      {!protectedAccount && (
        <section className="user-section">
          <h3>Access</h3>
          <button
            type="button"
            disabled={busy === 'access'}
            onClick={toggleAccess}
            className={`user-action ${user.is_active ? 'is-warn' : 'is-ok'}`}
          >
            {user.is_active ? <ShieldOff size={15} /> : <Check size={15} />}
            {user.is_active ? 'Restrict — block sign-in' : 'Activate — allow sign-in'}
          </button>

          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="user-action is-danger">
              <Trash2 size={15} /> Delete user
            </button>
          ) : (
            <div className="user-confirm">
              <p>
                Delete <strong>{user.email}</strong> for good? Their login, pricing factor and custom prices are removed.
                This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button type="button" className="toolbar-button !h-9" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="user-action is-danger is-solid" disabled={busy === 'delete'} onClick={deleteUser}>
                  <Trash2 size={15} /> {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
