#!/usr/bin/env node
// Map how each catalogue site can be searched, for the client audit's
// "already featured" and competitor checks: WordPress's REST search, the
// classic WordPress search feed, or neither. A site whose search returns
// results for a made-up address ignores the query, so it counts as neither.
// Re-run after catalogue changes:
//   node scripts/map-search.mjs        -> writes data/search-methods.json
import fs from 'fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const hostOf = (u) => String(u || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/:?#].*$/, '').toLowerCase();
const allHosts = [...new Set(JSON.parse(fs.readFileSync('data/data.json', 'utf8')).result.map((p) => hostOf(p.url)).filter(Boolean))];
// --only a.com,b.com re-checks just those sites and keeps the rest of the map.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const hosts = onlyArg ? onlyArg.slice(7).split(',') : allHosts;
const previous = onlyArg && fs.existsSync('data/search-methods.json') ? JSON.parse(fs.readFileSync('data/search-methods.json', 'utf8')).sites : {};

// A made-up address no real article contains.
const NONSENSE = 'qzxv-no-such-site-7731.com';

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(9000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const restResults = (t) => (t && t.trim().startsWith('[') ? JSON.parse(t).length : null);
const feedResults = (t) => (t && /<rss[\s>]/i.test(t) && /<channel>/i.test(t) ? (t.match(/<item>/g) || []).length : null);

async function mapHost(host) {
  for (const base of [`https://${host}`, `https://www.${host}`]) {
    if (restResults(await fetchText(`${base}/wp-json/wp/v2/search?search=press&per_page=1&_fields=id`)) === null) continue;
    // Two made-up searches must both return results before a site is ruled out.
    const junk = async () => restResults(await fetchText(`${base}/wp-json/wp/v2/search?search=${NONSENSE}&per_page=1&_fields=id`));
    return (await junk()) === 0 || (await junk()) === 0 ? { method: 'rest', base } : { method: 'none', reason: 'search ignores the query' };
  }
  for (const base of [`https://${host}`, `https://www.${host}`]) {
    if (feedResults(await fetchText(`${base}/?s=press&feed=rss2`)) === null) continue;
    const junk = async () => feedResults(await fetchText(`${base}/?s=${NONSENSE}&feed=rss2`));
    return (await junk()) === 0 || (await junk()) === 0 ? { method: 'feed', base } : { method: 'none', reason: 'search ignores the query' };
  }
  return { method: 'none' };
}

const sites = { ...previous };
let next = 0;
await Promise.all(Array.from({ length: 48 }, async () => {
  while (next < hosts.length) {
    const host = hosts[next++];
    sites[host] = await mapHost(host);
  }
}));

const sorted = Object.fromEntries(Object.entries(sites).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync('data/search-methods.json', JSON.stringify({ checkedAt: new Date().toISOString(), sites: sorted }, null, 1) + '\n');
const count = (m) => Object.values(sites).filter((s) => s.method === m).length;
const noisy = Object.values(sites).filter((s) => s.reason).length;
console.log(`${hosts.length} sites: ${count('rest')} REST search, ${count('feed')} search feed, ${count('none')} not searchable (${noisy} whose search ignores the query)`);
