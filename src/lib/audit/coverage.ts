// Google News search feeds (free, no key), for press on outlets whose own
// site can't be searched. News search matches loosely, so press.ts only
// keeps a result when the headline itself names the brand.

export interface Mention {
  title: string;
  url: string;
  source: string; // outlet name ('' when it's one of ours — the catalogue names it)
  host: string; // outlet's site, e.g. "usatoday.com"
  date: string | null;
  via: 'site' | 'news'; // found on the outlet's own search, or Google News
}

// Google News edition per market: language, country, edition id.
const EDITIONS: Record<string, [string, string, string]> = {
  us: ['en-US', 'US', 'US:en'],
  uk: ['en-GB', 'GB', 'GB:en'],
  ca: ['en-CA', 'CA', 'CA:en'],
  au: ['en-AU', 'AU', 'AU:en'],
  ie: ['en-IE', 'IE', 'IE:en'],
  in: ['en-IN', 'IN', 'IN:en'],
  sg: ['en-SG', 'SG', 'SG:en'],
  za: ['en-ZA', 'ZA', 'ZA:en'],
  ae: ['en-AE', 'AE', 'AE:en'],
  de: ['de', 'DE', 'DE:de'],
  fr: ['fr', 'FR', 'FR:fr'],
  es: ['es', 'ES', 'ES:es'],
  it: ['it', 'IT', 'IT:it'],
  nl: ['nl', 'NL', 'NL:nl'],
  br: ['pt-BR', 'BR', 'BR:pt-419'],
  mx: ['es-419', 'MX', 'MX:es-419'],
};

const MAX_MENTIONS = 80;

export const hostOf = (url: string) =>
  url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/:?#].*$/, '').toLowerCase();

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

async function googleNews(query: string, market: string): Promise<Mention[]> {
  const [hl, gl, ceid] = EDITIONS[market] ?? EDITIONS.us;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; DNA-ClientAudit/1.0)' }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
      const source = item.match(/<source url="([^"]+)">([\s\S]*?)<\/source>/);
      const title = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const link = decode(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      if (!source || !title || !link) return [];
      const name = decode(source[2]);
      const date = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
      return [{
        // Google appends " - Outlet" to every headline.
        title: title.endsWith(` - ${name}`) ? title.slice(0, -(name.length + 3)) : title,
        url: link,
        source: name,
        host: hostOf(source[1]),
        date: date ? new Date(date).toISOString() : null,
        via: 'news' as const,
      }];
    });
  } catch {
    return [];
  }
}

// Every article mentioning any of the terms, in the US edition and the
// client's own market, newest first, without repeats.
export async function findMentions(terms: string[], market: string, rawQuery = false): Promise<Mention[]> {
  // Terms are searched as exact phrases unless the caller wrote the query.
  const queries = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))].map((t) => (rawQuery ? t : `"${t}"`));
  const editions = market === 'us' ? ['us'] : ['us', market];
  const batches = await Promise.all(queries.flatMap((q) => editions.map((e) => googleNews(q, e))));

  const seen = new Set<string>();
  const mentions: Mention[] = [];
  for (const m of batches.flat()) {
    const key = `${m.host}|${m.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push(m);
  }
  return mentions
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, MAX_MENTIONS);
}

// The name a brand goes by: the site's own og:site_name / structured data,
// else the part of the page title that looks most like the domain.
export function brandName(domain: string, siteName: string, title: string): string {
  const strip = (s: string) => s.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
  if (siteName && !/^(home|homepage|welcome)$/i.test(strip(siteName))) return strip(siteName);

  const label = domain.split('.')[0];
  const words = label.split(/[-_]/).filter(Boolean);
  const parts = title.split(/\s[|\-–—:·•]\s/).map(strip).filter(Boolean);
  const scored = parts
    .map((p) => ({ p, hits: words.filter((w) => p.toLowerCase().includes(w.toLowerCase())).length }))
    .sort((a, b) => b.hits - a.hits || a.p.length - b.p.length);
  if (scored[0]?.hits) return scored[0].p;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
