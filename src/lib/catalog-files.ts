// Reads the static catalogue files in data/. They only change on deploy, so
// each is parsed once per server instance.
import fs from 'fs';
import path from 'path';
import type { CatalogKind } from './catalog';

const cache = new Map<string, unknown[]>();

export function readCatalogFile<T>(file: string): T[] {
  if (!cache.has(file)) {
    const json = JSON.parse(fs.readFileSync(path.resolve('data', file), 'utf8'));
    if (!Array.isArray(json.result)) throw new Error(`Invalid catalogue file ${file}: 'result' not found.`);
    cache.set(file, json.result);
  }
  return cache.get(file) as T[];
}

// Listicle tiers are priced one by one, so each gets its own catalogue id:
// "<publication id>::<tier name>", e.g. "a8ec…::Top 5".
export const listicleTierId = (publicationId: string, tier: string) => `${publicationId}::${tier}`;

export interface ListicleTier {
  _id: string;
  publicationId: string;
  name: string;
  tier: string;
  url: string;
  defaultPrice: number[];
}

let tiers: ListicleTier[] | null = null;

export function readListicleTiers(): ListicleTier[] {
  if (!tiers) {
    tiers = [];
    for (const p of readCatalogFile<{ _id: string; name?: string; url?: string; listicles?: { name?: string; price?: number | string }[] | null }>('data.json')) {
      for (const t of p.listicles ?? []) {
        const tier = String(t.name ?? '').trim();
        const cost = Number(t.price);
        if (!tier || !Number.isFinite(cost) || cost <= 0) continue;
        tiers.push({
          _id: listicleTierId(p._id, tier),
          publicationId: p._id,
          name: (p.name ?? '').trim(),
          tier,
          url: p.url ?? '',
          defaultPrice: [cost],
        });
      }
    }
  }
  return tiers;
}

export interface CatalogItem {
  _id: string;
  name?: string;
  url?: string;
  show_url?: string;
  defaultPrice?: Array<number | string>;
  tier?: string;
}

// Every priced item of one catalogue, with its supplier cost in defaultPrice[0].
export function readCatalogItems(kind: CatalogKind): CatalogItem[] {
  if (kind === 'listicle') return readListicleTiers();
  return readCatalogFile<CatalogItem>(kind === 'podcast' ? 'podcasts.json' : 'data.json');
}

export const parseCatalogKind = (value: unknown): CatalogKind | null =>
  value === 'publication' || value === 'podcast' || value === 'listicle' ? value : null;
