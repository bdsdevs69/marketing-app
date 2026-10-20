// Parsed CSV catalogues (data/*.csv), read once per server instance — like
// readCatalogFile for the JSON ones. Restart the server after editing them.
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const cache = new Map<string, unknown[]>();

export function readCatalogCsv<T>(file: string, options: Papa.ParseConfig = {}): T[] {
  if (!cache.has(file)) {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'data', file), 'utf8');
    const { data, errors } = Papa.parse<T>(content, { header: true, skipEmptyLines: true, ...options });
    if (errors.length) throw new Error(`CSV parsing error in ${file}: ${errors[0].message}`);
    cache.set(file, data);
  }
  return cache.get(file) as T[];
}

// "$1,250" -> 1250; blank or unparseable -> 0.
export const parseRate = (raw?: string) => (raw ? Number(raw.replace(/[$,]/g, '')) || 0 : 0);
