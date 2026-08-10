// src/pages/api/listicles.ts
import fs from 'fs';
import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';

interface Genre {
  name: string;
}

interface Region {
  name: string;
}

interface Asset {
  _ref: string;
}

interface ArticlePreview {
  asset?: Asset;
}

interface Logo {
  asset?: Asset;
}

interface ListicleOption {
  _key?: string;
  name: string;
  price: number;
}

interface DataItem {
  name?: string;
  defaultPrice?: string[];
  do_follow?: boolean;
  estimated_time?: string;
  genres?: Genre[];
  regions?: Region[];
  url?: string;
  articlePreview?: ArticlePreview;
  logo?: Logo;
  listicles?: ListicleOption[];
}

interface JsonData {
  result: DataItem[];
}

interface TransformedListicle {
  name: string;
  price: string; // Will be formatted like "Top 5: $3,000, Top 10: $6,000"
  do_follow: boolean | string;
  estimated_time: string;
  genres: string;
  regions: string;
  url: string;
  logo: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<TransformedListicle[] | { error: string }>
) {
  try {
    console.log('\n🚀 === API /listicles called ===');

    // Read the JSON file
    const filePath = path.resolve('data', 'data.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const json: JsonData = JSON.parse(fileContent);

    if (!Array.isArray(json.result)) {
      return res.status(400).json({ error: "Invalid data format: 'result' not found." });
    }

    // Filter items that have listicles
    const itemsWithListicles = json.result.filter((item: DataItem) => 
      item.listicles && Array.isArray(item.listicles) && item.listicles.length > 0
    );

    console.log(`📊 Processing ${itemsWithListicles.length} items with listicles out of ${json.result.length} total items`);

    const transformed: TransformedListicle[] = itemsWithListicles.map((item: DataItem) => {
      // Format listicle prices
      let formattedPrice = '';
      if (item.listicles && Array.isArray(item.listicles)) {
        const priceOptions = item.listicles
          .map((listicle: ListicleOption) => {
            const formattedAmount = listicle.price.toLocaleString();
            return `${listicle.name}: ${formattedAmount}`;
          })
          .join(', ');
        formattedPrice = priceOptions;
      }

      // Debug logging for specific items if needed
      if (item.name?.toLowerCase().includes('elite daily')) {
        console.log(`\n🔍 LISTICLE DEBUG for "${item.name}"`);
        console.log(`📊 Raw listicles:`, item.listicles);
        console.log(`📊 Formatted price: ${formattedPrice}`);
      }

      return {
        name: item.name || '',
        price: formattedPrice,
        do_follow: item.do_follow ?? '',
        estimated_time: item.estimated_time ?? '',
        genres: item.genres?.map(g => g.name).join(', ') ?? '',
        regions: item.regions?.map(r => r.name).join(', ') ?? '',
        url: item.url || '',
        logo: item.logo?.asset?._ref || ''
      };
    });

    console.log('✅ === Listicles API processing complete ===\n');
    res.status(200).json(transformed);
  } catch (error) {
    console.error('❌ Error processing listicles:', error);
    res.status(500).json({ error: 'Failed to read and process JSON file' });
  }
}