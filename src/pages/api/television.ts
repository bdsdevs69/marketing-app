import type { NextApiRequest, NextApiResponse } from 'next';
import { displayPrice } from '@/lib/pricing-math';
import { getRulesForPagesRequest } from '@/lib/catalog';
import { parseRate, readCatalogCsv } from '@/lib/catalog-csv';

// Columns of data/data1.csv
interface CSVRow {
  'Affiliate'?: string;
  'Example'?: string;
  'Calls'?: string;
  'State'?: string;
  'Market'?: string;
  'Program Name'?: string;
  'Location'?: string;
  'Time'?: string;
  'Rate'?: string;
}

interface TransformedTelevisionItem {
  affiliate: string;
  example: string;
  calls: string;
  state: string;
  market: string;
  programName: string;
  location: string;
  time: string;
  rate: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TransformedTelevisionItem[] | { error: string }>
) {
  try {
    const rules = await getRulesForPagesRequest(req);
    const rows = readCatalogCsv<CSVRow>('data1.csv', { delimitersToGuess: [',', '\t', '|', ';'] });

    const transformed = rows.map((item) => {
      // The CSV rate is our cost; a blank rate stays 0 ("on request").
      const cost = parseRate(item.Rate);
      return {
        affiliate: item.Affiliate || '',
        example: item.Example || '',
        calls: item.Calls || '',
        state: item.State || '',
        market: item.Market || '',
        programName: item['Program Name'] || '',
        location: item.Location || '',
        time: item.Time || '',
        rate: cost > 0 ? displayPrice(cost, rules) : cost,
      };
    });

    res.status(200).json(transformed);
  } catch (error) {
    console.error('Error building /api/television:', error);
    res.status(500).json({ error: 'Failed to load television rates' });
  }
}
