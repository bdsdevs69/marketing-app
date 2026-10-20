// src/pages/api/podcasts.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { displayPrice } from '@/lib/pricing-math';
import { getOverrides, getRulesForPagesRequest } from '@/lib/catalog';
import { readCatalogFile } from '@/lib/catalog-files';

interface PodcastRecord {
  _id: string;
  name: string;
  show_url: string;
  defaultPrice: number[];
  views: number | null;
  views_label: string;
  episode_example: string;
  category: string;
  companion_article: string;
  article_example: string;
}

export interface PodcastRow {
  id: string;
  name: string;
  price: number | '';
  views: number | null;
  category: string;
  companion_article: string;
  episode_example: string;
  article_example: string;
  url: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PodcastRow[] | { error: string }>
) {
  try {
    const [rules, overrides] = await Promise.all([
      getRulesForPagesRequest(req),
      getOverrides('podcast'),
    ]);

    const rows = readCatalogFile<PodcastRecord>('podcasts.json').map((item) => {
      const base = overrides.get(item._id) ?? Number(item.defaultPrice?.[0]);
      return {
        id: item._id,
        name: item.name,
        price: Number.isFinite(base) ? displayPrice(base, rules) : ('' as const),
        views: item.views,
        category: item.category,
        companion_article: item.companion_article,
        episode_example: item.episode_example,
        article_example: item.article_example,
        url: item.show_url,
      };
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error building /api/podcasts:', error);
    res.status(500).json({ error: 'Failed to load podcasts' });
  }
}
