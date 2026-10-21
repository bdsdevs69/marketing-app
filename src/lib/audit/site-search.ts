// Our own "who links to this site" search, scoped to the catalogue: every
// catalogue publication with a public search (WordPress REST search or its
// search feed — mapped by scripts/map-search.mjs) is asked for articles
// containing a domain. Each result's full text is then read back through
// the site's own API (or search feed) and kept only if it really contains
// the domain — a link or the written address. Anything that can't be
// confirmed is dropped.

import fs from 'fs';
import path from 'path';
import { readCatalogFile } from '@/lib/catalog-files';
import { hostOf } from './coverage';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

interface SiteMethod {
  method: 'rest' | 'feed' | 'none';
  base?: string;
}

export interface SiteHit {
  host: string;
  title: string;
  url: string;
  date: string | null;
}

let sitesCache: [string, Required<SiteMethod>][] | null = null;

export function searchableSites(): [string, Required<SiteMethod>][] {
  if (!sitesCache) {
    try {
      const file = JSON.parse(fs.readFileSync(path.resolve('data', 'search-methods.json'), 'utf8')) as { sites: Record<string, SiteMethod> };
      // Highest-DR publications first, so a short time budget drops the small ones.
      const dr = new Map<string, number>();
      for (const p of readCatalogFile<{ url?: string; domain_rating?: unknown }>('data.json')) {
        const n = Number(p.domain_rating);
        if (p.url && Number.isFinite(n)) dr.set(hostOf(p.url), Math.max(dr.get(hostOf(p.url)) ?? 0, n));
      }
      sitesCache = Object.entries(file.sites)
        .filter((e): e is [string, Required<SiteMethod>] => e[1].method !== 'none' && Boolean(e[1].base))
        .sort((a, b) => (dr.get(b[0]) ?? 0) - (dr.get(a[0]) ?? 0));
    } catch {
      sitesCache = [];
    }
  }
  return sitesCache;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#8216;|&#8217;|&rsquo;|&lsquo;/g, '’')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

const contains = (text: string, domain: string) => text.toLowerCase().includes(domain.toLowerCase());
const pubDate = (raw: string | undefined | null) => (raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null);

class Unreachable extends Error {}

// Body of a successful response; null for a definite "no" (4xx/5xx);
// throws Unreachable on a timeout or network error so the site can be retried.
async function get(url: string, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Unreachable();
  }
  return res.ok ? res.text().catch(() => null) : null;
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function searchSite(host: string, site: Required<SiteMethod>, domain: string, timeoutMs: number): Promise<SiteHit[]> {
  const q = encodeURIComponent(domain);

  if (site.method === 'rest') {
    const rows = parseJson<{ id?: number; title?: string; url?: string; subtype?: string }[]>(
      await get(`${site.base}/wp-json/wp/v2/search?search=${q}&per_page=5&_fields=id,title,url,subtype`, timeoutMs)
    );
    if (!Array.isArray(rows)) return [];
    const confirmed = await Promise.all(
      rows
        .filter((r) => r.id && r.url && r.subtype !== 'attachment')
        .map(async (r) => {
          const kind = r.subtype === 'page' ? 'pages' : !r.subtype || r.subtype === 'post' ? 'posts' : r.subtype;
          const post = parseJson<{ link?: string; date?: string; content?: { rendered?: string } }>(
            await get(`${site.base}/wp-json/wp/v2/${kind}/${r.id}?_fields=link,date,content`, timeoutMs).catch(() => null)
          );
          if (!post?.content?.rendered || !contains(post.content.rendered, domain)) return null;
          return { host, title: decode(r.title ?? ''), url: post.link || r.url!, date: pubDate(post.date) };
        })
    );
    return confirmed.filter((h): h is SiteHit => h !== null);
  }

  const xml = await get(`${site.base}/?s=${q}&feed=rss2`, timeoutMs);
  if (!xml) return [];
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).flatMap(([, item]) => {
    if (!contains(item, domain)) return []; // the feed carries the article text
    const url = decode(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    return url
      ? [{ host, title: decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''), url, date: pubDate(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]) }]
      : [];
  });
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>, deadline: number): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length && Date.now() < deadline) results.push(await work(items[next++]));
    })
  );
  return results;
}

// Every searchable catalogue article containing `domain`, confirmed. Stops
// starting new searches once the time budget is used.
export async function searchCatalogueSites(domain: string, budgetMs = 34000) {
  const deadline = Date.now() + budgetMs;
  const sites = searchableSites();
  // Sites that time out get one more try while the budget lasts.
  const retry: typeof sites = [];
  const attempt = (entry: (typeof sites)[number], timeoutMs: number) =>
    searchSite(entry[0], entry[1], domain, timeoutMs).catch((error) => {
      if (error instanceof Unreachable && timeoutMs < 8000) retry.push(entry);
      return [] as SiteHit[];
    });
  const found = (await pool(sites, 80, (entry) => attempt(entry, 5000), deadline)).flat();
  found.push(...(await pool(retry, 40, (entry) => attempt(entry, 8000), deadline)).flat());
  const hits = [...new Map(found.map((h) => [h.url.replace(/[?#].*$/, ''), h])).values()]
    // The client's own site isn't press.
    .filter((h) => hostOf(h.url) !== domain && !hostOf(h.url).endsWith(`.${domain}`));
  return { hits, searched: sites.length };
}
