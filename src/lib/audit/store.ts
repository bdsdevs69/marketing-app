// Saved audits and the monthly allowance. Each run is one row; re-opening a
// saved audit reads it back for free, and fits/plans are rebuilt on every
// read so prices are always the partner's current ones.

import db from '@/lib/db';
import type { Classification } from './classify';
import type { Mention } from './coverage';
import type { PageFacts } from './scan';
import type { SeoReport } from './seo-checks';

// New audits a user may run per calendar month unless an admin sets their own
// limit (users.audit_limit: NULL = this default, -1 = unlimited, 0 = none).
// Admins are never limited.
export const MONTHLY_AUDITS = 20;
export const UNLIMITED = -1;

// What's kept from the scan (not the page text).
export type StoredFacts = Omit<PageFacts, 'text'>;

export interface CompetitorCheck {
  domain: string;
  name: string;
  mentions: Mention[];
  v?: number; // PRESS_VERSION it was checked with
}

export interface AuditData {
  facts: StoredFacts;
  seo: SeoReport;
  profile: Classification;
  // Press found for the client (PRESS_VERSION v); checked after the audit runs.
  coverage?: { v?: number; brand: string; mentions: Mention[]; searchedSites?: number; checkedAt: string };
  competitors?: CompetitorCheck[];
}

export interface AuditRow {
  id: number;
  userId: number;
  domain: string;
  market: string;
  createdAt: string;
  data: AuditData;
}

let ready: Promise<void> | null = null;

export function ensureAuditTable(): Promise<void> {
  if (!ready) {
    ready = db
      .query(
        `CREATE TABLE IF NOT EXISTS client_audits (
           id          SERIAL PRIMARY KEY,
           user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           domain      TEXT NOT NULL,
           market      TEXT NOT NULL,
           result      JSONB NOT NULL,
           created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
         );
         CREATE INDEX IF NOT EXISTS client_audits_user_idx ON client_audits (user_id, created_at DESC);`
      )
      .then(() => undefined)
      .catch((error) => {
        ready = null;
        throw error;
      });
  }
  return ready;
}

const toRow = (r: { id: number; user_id: number; domain: string; market: string; created_at: Date; result: AuditData }): AuditRow => ({
  id: r.id,
  userId: r.user_id,
  domain: r.domain,
  market: r.market,
  createdAt: new Date(r.created_at).toISOString(),
  data: r.result,
});

let limitColumnReady: Promise<void> | null = null;

export function ensureAuditLimitColumn(): Promise<void> {
  if (!limitColumnReady) {
    limitColumnReady = db
      .query('ALTER TABLE users ADD COLUMN IF NOT EXISTS audit_limit INTEGER')
      .then(() => undefined)
      .catch((error) => {
        limitColumnReady = null;
        throw error;
      });
  }
  return limitColumnReady;
}

// The user's monthly allowance; null = unlimited.
export async function auditLimitFor(userId: number, role: string): Promise<number | null> {
  if (role === 'admin') return null;
  await ensureAuditLimitColumn();
  const result = await db.query('SELECT audit_limit FROM users WHERE id = $1', [userId]);
  const limit = result.rows[0]?.audit_limit;
  if (limit === null || limit === undefined) return MONTHLY_AUDITS;
  return limit === UNLIMITED ? null : limit;
}

export async function setAuditLimit(userId: number, limit: number | null): Promise<void> {
  await ensureAuditLimitColumn();
  await db.query('UPDATE users SET audit_limit = $2 WHERE id = $1', [userId, limit]);
}

export async function auditsThisMonth(userId: number): Promise<number> {
  await ensureAuditTable();
  const result = await db.query(
    "SELECT COUNT(*)::int AS n FROM client_audits WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())",
    [userId]
  );
  return result.rows[0].n;
}

export async function latestAudit(userId: number, domain: string, market: string): Promise<AuditRow | null> {
  await ensureAuditTable();
  const result = await db.query(
    'SELECT * FROM client_audits WHERE user_id = $1 AND domain = $2 AND market = $3 ORDER BY created_at DESC LIMIT 1',
    [userId, domain, market]
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function getAudit(id: number): Promise<AuditRow | null> {
  await ensureAuditTable();
  const result = await db.query('SELECT * FROM client_audits WHERE id = $1', [id]);
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function saveAudit(userId: number, domain: string, market: string, data: AuditData): Promise<AuditRow> {
  await ensureAuditTable();
  const result = await db.query(
    'INSERT INTO client_audits (user_id, domain, market, result) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, domain, market, JSON.stringify(data)]
  );
  return toRow(result.rows[0]);
}

export async function updateAuditData(id: number, data: AuditData): Promise<void> {
  await ensureAuditTable();
  const save = () => db.query('UPDATE client_audits SET result = $2 WHERE id = $1', [id, JSON.stringify(data)]);
  // Saves follow ~30s of network-heavy searching; give a dropped connection one more go.
  await save().catch(save);
}

// The user's most recent audit of each site, newest first.
export async function recentAudits(userId: number, limit = 8) {
  await ensureAuditTable();
  const result = await db.query(
    `SELECT id, domain, market, created_at FROM (
       SELECT DISTINCT ON (domain, market) id, domain, market, created_at
         FROM client_audits WHERE user_id = $1
        ORDER BY domain, market, created_at DESC
     ) latest ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map((r) => ({ id: r.id, domain: r.domain, market: r.market, createdAt: new Date(r.created_at).toISOString() }));
}
