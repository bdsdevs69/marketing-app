import type { NextApiRequest, NextApiResponse } from 'next';
import { displayPrice } from '@/lib/pricing-math';
import { getRulesForPagesRequest } from '@/lib/catalog';
import { parseRate, readCatalogCsv } from '@/lib/catalog-csv';

// Columns of data/data2.csv ("Segement Length" is spelled that way in the file).
interface CSVRow {
  'Call Sign'?: string;
  'Station'?: string;
  'Rate'?: string;
  'TAT'?: string;
  'Sponsored'?: string;
  'Indexed'?: string;
  'Segement Length'?: string;
  'Location'?: string;
  'Program Name'?: string;
  'Interview Type'?: string;
  'Example'?: string;
}

interface TransformedCSVItem {
  CallSign: string;
  station: string;
  rate: number;
  tat: string;
  sponsored: string;
  indexed: string;
  SegmentLength: string;
  location: string;
  ProgramName: string;
  InterviewType: string;
  Example: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TransformedCSVItem[] | { error: string }>
) {
  try {
    const rules = await getRulesForPagesRequest(req);
    const rows = readCatalogCsv<CSVRow>('data2.csv');

    const transformed = rows.map((item) => {
      const cost = parseRate(item.Rate);
      return {
        CallSign: item['Call Sign'] || '',
        station: item['Station'] || '',
        rate: cost > 0 ? displayPrice(cost, rules) : cost,
        tat: item['TAT'] || '',
        sponsored: item['Sponsored'] || '',
        indexed: item['Indexed'] || '',
        SegmentLength: item['Segement Length'] || '',
        location: item['Location'] || '',
        ProgramName: item['Program Name'] || '',
        InterviewType: item['Interview Type'] || '',
        Example: item['Example'] || '',
      };
    });

    res.status(200).json(transformed);
  } catch (error) {
    console.error('Error building /api/broadcast_television:', error);
    res.status(500).json({ error: 'Failed to load broadcast rates' });
  }
}
