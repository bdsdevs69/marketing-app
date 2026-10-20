// Server-side catalogue helpers: base-price overrides kept in Postgres, the
// active pricing factors, the logged-in user's factor, and per-user prices.
//
// Catalogue files (data/*.json) hold each item's supplier cost. An admin can
// override that base in the database; overrides win over the file, so prices
// change without a code deploy. On top of that an admin can fix the exact
// price one user sees for an item (user_price_overrides), which skips the
// factor entirely for that user and item.

import type { NextApiRequest } from 'next';
import db from './db';
import { verifyToken, hashToken } from './auth';
import type { PricingRule } from './pricing-math';

export type CatalogKind = 'publication' | 'podcast' | 'listicle';

let tableReady: Promise<void> | null = null;

// Created on first use so a fresh environment needs no manual migration.
export function ensureOverridesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS catalog_price_overrides (
           catalog     TEXT NOT NULL,
           item_id     TEXT NOT NULL,
           base_price  NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
           updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
           updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           PRIMARY KEY (catalog, item_id)
         )`
      )
      .then(() => undefined)
      .catch((error) => {
        tableReady = null; // let the next request retry
        throw error;
      });
  }
  return tableReady;
}

export async function getOverrides(catalog: CatalogKind): Promise<Map<string, number>> {
  await ensureOverridesTable();
  const result = await db.query(
    'SELECT item_id, base_price FROM catalog_price_overrides WHERE catalog = $1',
    [catalog]
  );
  return new Map(result.rows.map((r) => [r.item_id as string, Number(r.base_price)]));
}

export interface OverrideDetail {
  base: number;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getOverrideDetails(catalog: CatalogKind): Promise<Map<string, OverrideDetail>> {
  await ensureOverridesTable();
  const result = await db.query(
    `SELECT o.item_id, o.base_price, o.updated_at, u.email
       FROM catalog_price_overrides o
       LEFT JOIN users u ON u.id = o.updated_by
      WHERE o.catalog = $1`,
    [catalog]
  );
  return new Map(
    result.rows.map((r) => [
      r.item_id as string,
      { base: Number(r.base_price), updatedAt: new Date(r.updated_at).toISOString(), updatedBy: r.email ?? null },
    ])
  );
}

export async function setOverride(catalog: CatalogKind, itemId: string, base: number, userId: number) {
  await ensureOverridesTable();
  await db.query(
    `INSERT INTO catalog_price_overrides (catalog, item_id, base_price, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (catalog, item_id)
     DO UPDATE SET base_price = $3, updated_by = $4, updated_at = NOW()`,
    [catalog, itemId, base, userId]
  );
}

export async function clearOverride(catalog: CatalogKind, itemId: string) {
  await ensureOverridesTable();
  await db.query('DELETE FROM catalog_price_overrides WHERE catalog = $1 AND item_id = $2', [catalog, itemId]);
}

let userPricesReady: Promise<void> | null = null;

export function ensureUserPricesTable(): Promise<void> {
  if (!userPricesReady) {
    userPricesReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS user_price_overrides (
           user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           catalog     TEXT NOT NULL,
           item_id     TEXT NOT NULL,
           price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
           updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
           updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           PRIMARY KEY (user_id, catalog, item_id)
         )`
      )
      .then(() => undefined)
      .catch((error) => {
        userPricesReady = null;
        throw error;
      });
  }
  return userPricesReady;
}

// item id -> the exact price this user sees.
export async function getUserPrices(userId: number, catalog: CatalogKind): Promise<Map<string, number>> {
  await ensureUserPricesTable();
  const result = await db.query(
    'SELECT item_id, price FROM user_price_overrides WHERE user_id = $1 AND catalog = $2',
    [userId, catalog]
  );
  return new Map(result.rows.map((r) => [r.item_id as string, Number(r.price)]));
}

export async function setUserPrice(userId: number, catalog: CatalogKind, itemId: string, price: number, adminId: number) {
  await ensureUserPricesTable();
  await db.query(
    `INSERT INTO user_price_overrides (user_id, catalog, item_id, price, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, catalog, item_id)
     DO UPDATE SET price = $4, updated_by = $5, updated_at = NOW()`,
    [userId, catalog, itemId, price, adminId]
  );
}

export async function clearUserPrice(userId: number, catalog: CatalogKind, itemId: string) {
  await ensureUserPricesTable();
  await db.query(
    'DELETE FROM user_price_overrides WHERE user_id = $1 AND catalog = $2 AND item_id = $3',
    [userId, catalog, itemId]
  );
}

export interface FactorWithRules {
  id: number;
  name: string;
  rules: PricingRule[];
}

export async function getActiveFactors(): Promise<FactorWithRules[]> {
  const factors = await db.query('SELECT id, name FROM pricing_factors WHERE is_active = true ORDER BY id');
  const rules = await db.query(
    `SELECT factor_id, min_price, max_price, addition_type, addition_value
       FROM pricing_factor_rules ORDER BY factor_id, min_price ASC`
  );
  return factors.rows.map((f) => ({
    id: f.id,
    name: f.name,
    rules: rules.rows.filter((r) => r.factor_id === f.id),
  }));
}

export async function getUserRules(userId: number): Promise<PricingRule[] | null> {
  // One round trip: the rules of the user's (first) active factor.
  const rules = await db.query(
    `SELECT min_price, max_price, addition_type, addition_value
       FROM pricing_factor_rules
      WHERE factor_id = (
        SELECT pf.id FROM pricing_factors pf
          JOIN user_pricing_factors upf ON pf.id = upf.factor_id
         WHERE upf.user_id = $1 AND pf.is_active = true
         LIMIT 1)
      ORDER BY min_price ASC`,
    [userId]
  );
  return rules.rows.length ? rules.rows : null;
}

export interface RequestPricing {
  // The user's factor rules (null = no factor / not signed in).
  rules: PricingRule[] | null;
  // Exact prices set for this user, by item id (empty without a catalog).
  userPrices: Map<string, number>;
}

const NO_PRICING: RequestPricing = { rules: null, userPrices: new Map() };

// Pricing for whoever made this request. The session check, the rules and
// the per-user prices are fetched side by side, and only used if the
// session is still valid.
export async function getPricingForPagesRequest(req: NextApiRequest, catalog?: CatalogKind): Promise<RequestPricing> {
  const token = req.cookies['auth-token'];
  if (!token) return NO_PRICING;
  const user = verifyToken(token);
  if (!user) return NO_PRICING;
  const [session, rules, userPrices] = await Promise.all([
    db.query('SELECT 1 FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()', [hashToken(token)]),
    getUserRules(user.id),
    catalog ? getUserPrices(user.id, catalog) : Promise.resolve(new Map<string, number>()),
  ]);
  return session.rows.length ? { rules, userPrices } : NO_PRICING;
}

export async function getRulesForPagesRequest(req: NextApiRequest): Promise<PricingRule[] | null> {
  return (await getPricingForPagesRequest(req)).rules;
}
