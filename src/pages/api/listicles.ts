// src/pages/api/listicles.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { displayPrice } from '@/lib/pricing-math';
import { getOverrides, getPricingForPagesRequest } from '@/lib/catalog';
import { listicleTierId, readCatalogFile } from '@/lib/catalog-files';

interface Named {
  name?: string;
}

interface ListicleOption {
  name: string;
  price: number | string;
}

interface CatalogRecord {
  _id: string;
  name?: string;
  url?: string;
  do_follow?: string | boolean | null;
  estimated_time?: string | null;
  genres?: Named[] | null;
  regions?: Named[] | null;
  logo?: { asset?: { _ref?: string } } | null;
  listicles?: ListicleOption[] | null;
  listicle_example_url?: string | null;
  hot_seller?: boolean | null;
}

export interface ListicleTier {
  name: string;
  price: number;
}

export interface ListicleRow {
  id: string;
  name: string;
  // Cheapest tier, used for sorting.
  price: number;
  tiers: ListicleTier[];
  example: string;
  hot: boolean;
  do_follow: string;
  estimated_time: string;
  genres: string;
  regions: string;
  url: string;
  logo: string;
}

const names = (list?: Named[] | null) =>
  (list ?? []).map((n) => n.name).filter(Boolean).join(', ');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListicleRow[] | { error: string }>
) {
  try {
    const [{ rules, userPrices }, overrides] = await Promise.all([
      getPricingForPagesRequest(req, 'listicle'),
      getOverrides('listicle'),
    ]);

    const rows: ListicleRow[] = [];
    for (const item of readCatalogFile<CatalogRecord>('data.json')) {
      // Each tier's file price is our cost (or an admin-set base); partners see
      // it through their pricing factor like a normal article, unless an exact
      // price was set for them.
      const tiers = (item.listicles ?? [])
        .map((t) => ({ name: String(t.name ?? '').trim(), cost: Number(t.price) }))
        .filter((t) => t.name && Number.isFinite(t.cost) && t.cost > 0)
        .map((t) => {
          const id = listicleTierId(item._id, t.name);
          return { name: t.name, price: userPrices.get(id) ?? displayPrice(overrides.get(id) ?? t.cost, rules) };
        });
      if (!tiers.length) continue;

      rows.push({
        id: item._id,
        name: (item.name ?? '').trim(),
        price: Math.min(...tiers.map((t) => t.price)),
        tiers,
        example: item.listicle_example_url ?? '',
        hot: item.hot_seller === true,
        do_follow: typeof item.do_follow === 'boolean' ? (item.do_follow ? 'yes' : 'no') : String(item.do_follow ?? ''),
        estimated_time: item.estimated_time ?? '',
        genres: names(item.genres),
        regions: names(item.regions),
        url: item.url ?? '',
        logo: item.logo?.asset?._ref ?? '',
      });
    }

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error processing listicles:', error);
    res.status(500).json({ error: 'Failed to load listicles' });
  }
}
