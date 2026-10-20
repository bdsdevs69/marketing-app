// Reads the static catalogue files in data/. They only change on deploy, so
// each is parsed once per server instance.
import fs from 'fs';
import path from 'path';

const cache = new Map<string, unknown[]>();

export function readCatalogFile<T>(file: string): T[] {
  if (!cache.has(file)) {
    const json = JSON.parse(fs.readFileSync(path.resolve('data', file), 'utf8'));
    if (!Array.isArray(json.result)) throw new Error(`Invalid catalogue file ${file}: 'result' not found.`);
    cache.set(file, json.result);
  }
  return cache.get(file) as T[];
}
