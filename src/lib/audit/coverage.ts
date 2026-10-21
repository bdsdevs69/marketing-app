// Google News search feeds (free, no key), for press on outlets whose own
// site can't be searched. News search matches loosely, so its results are
// only leads: press.ts opens every article at the publisher and keeps it
// only if it links to the client.

import { BROWSER_UA } from './fetch-site';

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

// Google News links point at Google, not the publisher. Older ones carry the
// publisher's address inside the link; current ones have to be asked for,
// with a signature from the article's Google page. null when Google won't say.
export async function publisherUrl(link: string, timeoutMs = 8000): Promise<string | null> {
  const id = link.match(/news\.google\.com\/(?:rss\/)?articles\/([\w-]+)/)?.[1];
  if (!id) return null;
  const raw = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
  if (!raw.includes('AU_yqL')) return raw.match(/https?:\/\/[\x21-\x7e]+/)?.[0] ?? null;

  const signal = AbortSignal.timeout(Math.max(1000, timeoutMs));
  try {
    const page = await (await fetch(`https://news.google.com/rss/articles/${id}`, { headers: { 'user-agent': BROWSER_UA }, signal })).text();
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="(\d+)"/)?.[1];
    if (!sg || !ts) return null;
    const ask = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],${JSON.stringify(id)},${ts},${JSON.stringify(sg)}]`;
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': BROWSER_UA },
      body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', ask, null, 'generic']]]))}`,
      signal,
    });
    // Answer: a JSON line [["wrb.fr","Fbv4je","[\"garturlres\",\"<url>\",1]",...]].
    for (const line of (await res.text()).split('\n')) {
      if (!line.startsWith('[["wrb.fr"')) continue;
      const answer = JSON.parse(JSON.parse(line)[0][2]);
      return answer?.[0] === 'garturlres' && /^https?:\/\//.test(answer[1]) ? answer[1] : null;
    }
  } catch {
    // Google said no or took too long
  }
  return null;
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
  // "Digital Networking Agency" matches digitalnetworkingagency.com.
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const scored = parts
    .map((p) => ({ p, hits: words.filter((w) => squash(p).includes(squash(w))).length }))
    .sort((a, b) => b.hits - a.hits || a.p.length - b.p.length);
  if (scored[0]?.hits) return scored[0].p;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
