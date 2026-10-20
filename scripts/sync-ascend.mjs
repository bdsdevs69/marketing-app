#!/usr/bin/env node
// Sync data/data.json with an Ascend catalogue export.
//
// Ascend's price is our supplier cost, so it becomes each publication's base
// (defaultPrice). Rules:
//   - PROTECTED publications (our own $75 network) are left exactly as they are.
//   - Hand-set prices (KEEP_BASE) keep showing our price: the file takes
//     Ascend's cost and our price is written as a base-price override in the
//     database, where it shows as "Edited" in /catalog and can be reset.
//   - Everything else matching by _id is replaced with Ascend's record,
//     except what we add ourselves: hand-picked examples (KEEP_EXAMPLE),
//     our own fields (OUR_FIELDS) and listicle tiers Ascend doesn't sell.
//   - Ascend-only publications are added. dnapricing-only ones are kept, or
//     removed with --prune — except OUR_OWN products, which are never removed.
//
// Usage:
//   node scripts/sync-ascend.mjs <ascend-export.json> [--write] [--overrides] [--prune]
// Without --write it only prints what would change.

import fs from 'fs';
import path from 'path';

const [, , exportPath, ...flags] = process.argv;
const WRITE = flags.includes('--write');
const WRITE_OVERRIDES = flags.includes('--overrides');
const PRUNE = flags.includes('--prune');
if (!exportPath) {
  console.error('usage: node scripts/sync-ascend.mjs <ascend-export.json> [--write] [--overrides] [--prune]');
  process.exit(1);
}

// Our own network, sold at $75 — never overwritten from Ascend.
const PROTECTED = new Set([
  'CEO Weekly', 'Celebrity News', 'World Reporter', 'San Francisco Post', 'BLK News', 'NY Wire',
  'Kivo Daily', 'Entertainment Monthly News', 'Influencer Daily', 'Chicago Journal', 'Artist Weekly',
  'Market Daily', 'Portland News', 'Entertainment Post', 'Economic Insider', 'US Insider', 'US Reporter',
  'Texas Today', 'Networth.us', 'Music Observer', 'Famous Times', 'Real Estate Today', 'Voyage New York',
  'Atlanta Wire', 'NY Weekly', 'Wall Street Times', 'LA Wire', 'California Observer', 'Miami Wire',
  "Women's Journal", 'US Business News',
  // On the network list but not in our catalogue yet — don't pull them in from Ascend.
  'The American News', 'California Gazette',
].map((n) => n.toLowerCase()));

// Prices set by hand to hit a specific display price; kept as overrides.
const KEEP_BASE = new Set([
  'Miami Herald', 'USA Today', 'CIO Bulletin', 'Fort Bend Star',
  'PR Blast (200 + affiliate websites for Fox, NBC, CBS, and Many others)',
].map((n) => n.toLowerCase()));

// Example articles we chose ourselves; Ascend's example must not replace them.
const KEEP_EXAMPLE = new Set(['MSN'].map((n) => n.toLowerCase()));

// Fields only we set (Ascend's records never have them).
const OUR_FIELDS = ['listicle_example_url', 'hot_seller'];

// Sold by us but not carried by Ascend (by _id): never pruned.
const OUR_OWN = new Set(['dna-pr-blast', 'times-square-journal', 'the-icon', 'fluenciaga']);

// Ascend fields that are about the reseller account, not the publication.
const DROP = new Set(['price', 'customPrice', 'rating', 'business']);

const norm = (s) => String(s ?? '').trim().toLowerCase();

const dataPath = path.resolve('data', 'data.json');
const ours = JSON.parse(fs.readFileSync(dataPath, 'utf8')).result;

// PR Blast is our own product. It was created as a copy of Fort Bend Star and
// shared its _id, so it would have been overwritten by Fort Bend Star.
for (const rec of ours) {
  if (norm(rec.name).startsWith('pr blast') && rec._id !== 'dna-pr-blast') rec._id = 'dna-pr-blast';
}
const theirs = JSON.parse(fs.readFileSync(exportPath, 'utf8')).publications;
if (!Array.isArray(theirs) || theirs.length < 100) throw new Error('Export has no publications');

const theirsById = new Map(theirs.map((p) => [p._id, p]));
const oursById = new Map(ours.map((p) => [p._id, p]));

// Ascend references logos by Sanity asset id ("image-<hash>-486x291-png");
// our catalogue uses the CDN file name ("<hash>-486x291.png").
const toFileRef = (ref) => {
  const m = String(ref ?? '').match(/^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/);
  return m ? `${m[1]}-${m[2]}.${m[3]}` : ref;
};

const clean = (record) => {
  const out = {};
  for (const [k, v] of Object.entries(record)) if (!DROP.has(k)) out[k] = v;
  out.customPrice = [];
  if (out.logo?.asset?._ref) {
    out.logo = { _type: 'image', asset: { _ref: toFileRef(out.logo.asset._ref), _type: 'reference' } };
  }
  return out;
};

const report = { updated: 0, priceChanged: [], unchanged: 0, protectedKept: [], added: [], keptOursOnly: [], pruned: [], overrides: [] };
const result = [];

for (const mine of ours) {
  const name = norm(mine.name);
  const theirsRec = theirsById.get(mine._id);

  if (!theirsRec && PRUNE && !PROTECTED.has(name) && !OUR_OWN.has(mine._id)) {
    report.pruned.push(mine.name.trim());
    continue;
  }

  if (PROTECTED.has(name) || !theirsRec) {
    // Protected rows keep our price and details; only the live example link
    // is taken from Ascend.
    if (PROTECTED.has(name) && theirsRec?.example_url) mine.example_url = theirsRec.example_url;
    result.push(mine);
    if (PROTECTED.has(name)) report.protectedKept.push(mine.name.trim());
    else report.keptOursOnly.push(mine.name.trim());
    continue;
  }

  const next = clean(theirsRec);
  for (const field of OUR_FIELDS) if (mine[field] !== undefined) next[field] = mine[field];
  if (KEEP_EXAMPLE.has(name) && mine.example_url) next.example_url = mine.example_url;
  // Listicle tiers we sell where Ascend sells none (e.g. MSN) are kept.
  if (!next.listicles?.length && mine.listicles?.length) next.listicles = mine.listicles;
  const ourBase = Number(mine.defaultPrice?.[0]);
  const theirBase = Number(theirsRec.defaultPrice?.[0]);

  if (KEEP_BASE.has(name) && ourBase !== theirBase && ourBase >= theirBase) {
    report.overrides.push({ id: mine._id, name: mine.name.trim(), supplierCost: theirBase, keep: ourBase });
  } else if (KEEP_BASE.has(name) && ourBase < theirBase) {
    report.belowCostDropped = [...(report.belowCostDropped ?? []), { name: mine.name.trim(), was: ourBase, cost: theirBase }];
    report.priceChanged.push({ name: mine.name.trim(), from: ourBase, to: theirBase });
  } else if (ourBase !== theirBase) {
    report.priceChanged.push({ name: mine.name.trim(), from: ourBase, to: theirBase });
  } else {
    report.unchanged++;
  }
  report.updated++;
  result.push(next);
}

for (const rec of theirs) {
  if (oursById.has(rec._id) || PROTECTED.has(norm(rec.name))) continue;
  result.push(clean(rec));
  report.added.push(rec.name.trim());
}

console.log(JSON.stringify({
  ascend: theirs.length,
  before: ours.length,
  after: result.length,
  refreshedFromAscend: report.updated,
  basePriceChanged: report.priceChanged.length,
  basePriceSame: report.unchanged,
  added: report.added.length,
  protectedKept: report.protectedKept.length,
  keptOursOnly: report.keptOursOnly.length,
  pruned: report.pruned.length,
  overrides: report.overrides,
  handSetBelowCostNotKept: report.belowCostDropped ?? [],
}, null, 2));

if (process.env.SHOW_PRICE_CHANGES) {
  for (const c of report.priceChanged) console.log(`  ${c.name}: ${c.from} -> ${c.to}`);
}

if (process.env.LIST_OURS_ONLY) console.log('\nNot sold by Ascend any more:\n  ' + report.keptOursOnly.join('\n  '));

if (WRITE) {
  fs.writeFileSync(dataPath, JSON.stringify({ result }, null, 4) + '\n');
  console.log(`\nwrote ${result.length} publications to data/data.json`);
}

if (WRITE_OVERRIDES && report.overrides.length) {
  const { default: pg } = await import('pg');
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    })
  );
  const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS catalog_price_overrides (
      catalog TEXT NOT NULL, item_id TEXT NOT NULL,
      base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (catalog, item_id))`);
  for (const o of report.overrides) {
    await client.query(
      `INSERT INTO catalog_price_overrides (catalog, item_id, base_price, updated_at)
       VALUES ('publication', $1, $2, NOW())
       ON CONFLICT (catalog, item_id) DO UPDATE SET base_price = $2, updated_at = NOW()`,
      [o.id, o.keep]
    );
  }
  await client.end();
  console.log(`saved ${report.overrides.length} hand-set prices as overrides`);
}
