// src/pages/api/data.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { displayPrice } from '@/lib/pricing-math';
import { getOverrides, getPricingForPagesRequest } from '@/lib/catalog';
import { readCatalogFile } from '@/lib/catalog-files';

interface Named {
  name?: string;
}

interface AssetRef {
  asset?: { _ref?: string };
}

interface CatalogRecord {
  _id: string;
  name?: string;
  url?: string;
  defaultPrice?: Array<number | string>;
  estimated_time?: string | null;
  genres?: Named[] | null;
  regions?: Named[] | null;
  badges?: Named[] | null;
  articlePreview?: AssetRef | null;
  example_url?: string | null;
  logo?: AssetRef | null;
  // A logo we host ourselves (public/logos), for publications not in Sanity.
  logo_url?: string | null;
  hot_seller?: boolean | null;
  do_follow?: string | boolean | null;
  sponsored?: string | null;
  indexed?: string | null;
  llm_aeo?: string | null;
  // A number, or "TBA" while the score isn't known yet.
  domain_authority?: number | string | null;
  domain_rating?: number | string | null;
  monthly_visits?: number | null;
  listicles?: Named[] | null;
  cbd?: boolean | null;
  crypto?: boolean | null;
  erotic?: boolean | null;
  gambling?: boolean | null;
  health?: boolean | null;
}

export interface PublicationRow {
  id: string;
  name: string;
  price: number | '';
  estimated_time: string;
  domain_authority: number | string | null;
  domain_rating: number | string | null;
  monthly_visits: number | null;
  genres: string;
  regions: string;
  sponsored: string;
  indexed: string;
  do_follow: string;
  llm_aeo: string;
  example: string;
  listicles: string[];
  niches: string[];
  badges: string[];
  url: string;
  logo: string;
  hot: boolean;
}

const NICHES = ['erotic', 'health', 'cbd', 'crypto', 'gambling'] as const;

const yesNo = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : String(v ?? '').toLowerCase());
const names = (list?: Named[] | null) => (list ?? []).map((x) => x?.name).filter(Boolean) as string[];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PublicationRow[] | { error: string }>
) {
  try {
    const [{ rules, userPrices }, overrides] = await Promise.all([
      getPricingForPagesRequest(req, 'publication'),
      getOverrides('publication'),
    ]);

    const rows: PublicationRow[] = readCatalogFile<CatalogRecord>('data.json').map((item) => {
      // An admin-set base in the database wins over the supplier cost in the file.
      const fileBase = Number(item.defaultPrice?.[0]);
      const base = overrides.get(item._id) ?? fileBase;

      return {
        id: item._id,
        name: (item.name ?? '').trim(),
        // A price set for this user wins; otherwise base through their factor.
        price: userPrices.get(item._id) ?? (Number.isFinite(base) ? displayPrice(base, rules) : ''),
        estimated_time: item.estimated_time ?? '',
        domain_authority: item.domain_authority ?? null,
        domain_rating: item.domain_rating ?? null,
        monthly_visits: item.monthly_visits ?? null,
        genres: names(item.genres).join(', '),
        regions: names(item.regions).join(', '),
        sponsored: yesNo(item.sponsored),
        indexed: yesNo(item.indexed),
        do_follow: yesNo(item.do_follow),
        llm_aeo: yesNo(item.llm_aeo),
        // Live article link only — the old screenshot previews aren't shown.
        example: item.example_url ?? '',
        listicles: names(item.listicles),
        niches: NICHES.filter((n) => item[n] === true),
        badges: names(item.badges),
        url: item.url ?? '',
        logo: item.logo_url ?? item.logo?.asset?._ref ?? '',
        hot: item.hot_seller === true,
      };
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error building /api/data:', error);
    res.status(500).json({ error: 'Failed to read and process JSON file' });
  }
}
