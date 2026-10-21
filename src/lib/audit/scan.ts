// Everything the audit reads from the client's own site and public records,
// with no paid data: the homepage, robots.txt, the sitemap, whether plain
// http:// moves to https://, and the domain's registration date (RDAP).

import { parse, type HTMLElement } from 'node-html-parser';
import { safeFetch } from './fetch-site';
import { findPeople } from './people';

export interface PageFacts {
  finalUrl: string;
  status: number;
  https: boolean;
  httpRedirectsToHttps: boolean | null;
  responseMs: number;
  title: string;
  siteName: string; // the brand's own name, when the site states it
  people: string[]; // founder / CEO / spokesperson named on the homepage
  metaDescription: string;
  h1: string[];
  h2: string[];
  lang: string;
  canonical: string;
  viewport: boolean;
  robotsMeta: string;
  ogTitle: boolean;
  ogDescription: boolean;
  ogImage: boolean;
  twitterCard: boolean;
  jsonLd: number;
  favicon: boolean;
  images: number;
  imagesWithAlt: number;
  internalLinks: number;
  wordCount: number;
  text: string; // visible text, trimmed, for classification
  robotsTxt: { found: boolean; blocksAll: boolean; sitemaps: string[] };
  sitemap: { found: boolean; url: string | null; pages: number | null };
  domainCreated: string | null;
}

const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim();

function visibleText(root: HTMLElement) {
  const body = root.querySelector('body') ?? root;
  body.querySelectorAll('script,style,noscript,svg,template,iframe').forEach((n) => n.remove());
  return clean(body.text);
}

async function readRobots(origin: string): Promise<PageFacts['robotsTxt']> {
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 6000, maxBytes: 200_000 });
    if (!res.ok || /html/i.test(res.contentType)) return { found: false, blocksAll: false, sitemaps: [] };
    const lines = res.body.split(/\r?\n/).map((l) => l.trim());
    const sitemaps = lines.filter((l) => /^sitemap:/i.test(l)).map((l) => l.replace(/^sitemap:\s*/i, ''));
    // "User-agent: *" followed by "Disallow: /" shuts every search engine out.
    let inStar = false;
    let blocksAll = false;
    for (const l of lines) {
      if (/^user-agent:/i.test(l)) inStar = /^user-agent:\s*\*\s*$/i.test(l);
      else if (inStar && /^disallow:\s*\/\s*$/i.test(l)) blocksAll = true;
    }
    return { found: true, blocksAll, sitemaps };
  } catch {
    return { found: false, blocksAll: false, sitemaps: [] };
  }
}

// Count pages in the sitemap, following an index into up to 10 child maps.
async function readSitemap(origin: string, declared: string[]): Promise<PageFacts['sitemap']> {
  const candidates = [...declared, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  for (const url of [...new Set(candidates)].slice(0, 5)) {
    try {
      const res = await safeFetch(url, { timeoutMs: 6000, maxBytes: 3_000_000 });
      if (!res.ok || !/<(urlset|sitemapindex)/i.test(res.body)) continue;
      const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      if (!/<sitemapindex/i.test(res.body)) return { found: true, url, pages: locs(res.body).length };
      const children = locs(res.body).slice(0, 10);
      const counts = await Promise.all(
        children.map((child) =>
          safeFetch(child, { timeoutMs: 6000, maxBytes: 3_000_000 })
            .then((r) => (r.ok ? locs(r.body).length : 0))
            .catch(() => 0)
        )
      );
      const total = counts.reduce((a, b) => a + b, 0);
      // More than 10 child maps: say "at least" by keeping the partial total.
      return { found: true, url, pages: total };
    } catch {
      /* try the next candidate */
    }
  }
  return { found: false, url: null, pages: null };
}

// Registration date from the domain registry's own RDAP server, found via
// IANA's bootstrap list of which server handles each domain ending.
let rdapServers: Promise<Map<string, string>> | null = null;

function loadRdapServers(): Promise<Map<string, string>> {
  if (!rdapServers) {
    rdapServers = fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(6000) })
      .then((r) => r.json())
      .then((data: { services: [string[], string[]][] }) => {
        const map = new Map<string, string>();
        for (const [tlds, urls] of data.services) for (const tld of tlds) map.set(tld.toLowerCase(), urls[0]);
        return map;
      })
      .catch((error) => {
        rdapServers = null;
        throw error;
      });
  }
  return rdapServers;
}

async function readDomainCreated(domain: string): Promise<string | null> {
  try {
    const servers = await loadRdapServers();
    const labels = domain.split('.');
    // Longest matching ending first ("co.uk" before "uk").
    let base: string | undefined;
    for (let i = 1; i < labels.length && !base; i++) base = servers.get(labels.slice(i).join('.'));
    if (!base) return null;
    const res = await fetch(`${base.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const event = (data.events ?? []).find((e: { eventAction?: string }) => e.eventAction === 'registration');
    return event?.eventDate ? new Date(event.eventDate).toISOString() : null;
  } catch {
    return null;
  }
}

async function httpMovesToHttps(domain: string): Promise<boolean | null> {
  try {
    const res = await safeFetch(`http://${domain}/`, { timeoutMs: 6000, maxBytes: 20_000 });
    return res.finalUrl.startsWith('https://');
  } catch {
    return null;
  }
}

export async function scanSite(domain: string): Promise<PageFacts> {
  // Try https first, then www., then plain http — whatever answers.
  let page = null;
  let lastError: unknown = null;
  for (const start of [`https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`]) {
    try {
      page = await safeFetch(start);
      if (page.body) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!page || !page.body) {
    const reason = lastError instanceof Error ? lastError.message : '';
    throw new Error(/public website|web address|standard web/.test(reason) ? reason : `We couldn't open ${domain}. Check the address and try again.`);
  }

  const origin = new URL(page.finalUrl).origin;
  const [robotsTxt, domainCreated, httpRedirect] = await Promise.all([
    readRobots(origin),
    readDomainCreated(domain),
    httpMovesToHttps(domain),
  ]);
  const sitemap = await readSitemap(origin, robotsTxt.sitemaps);

  const root = parse(page.body, { comment: false });
  const meta = (selector: string) => clean(root.querySelector(selector)?.getAttribute('content'));
  const host = new URL(page.finalUrl).hostname.replace(/^www\./, '');

  const images = root.querySelectorAll('img');
  const links = root.querySelectorAll('a[href]');
  const internalLinks = links.filter((a) => {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return false;
    try {
      return new URL(href, page!.finalUrl).hostname.replace(/^www\./, '') === host;
    } catch {
      return false;
    }
  }).length;

  // Read structured data before visibleText() strips <script> tags.
  const ldScripts = root.querySelectorAll('script[type="application/ld+json"]');
  const jsonLd = ldScripts.length;
  let ldName = '';
  for (const script of ldScripts) {
    const m = script.text.match(/"@type"\s*:\s*"(?:Organization|Corporation|LocalBusiness|MedicalOrganization|MedicalClinic|Brand|WebSite)"[\s\S]{0,400}?"name"\s*:\s*"([^"]{2,80})"/);
    if (m) {
      ldName = m[1];
      break;
    }
  }
  const text = visibleText(root);

  return {
    finalUrl: page.finalUrl,
    status: page.status,
    https: page.finalUrl.startsWith('https://'),
    httpRedirectsToHttps: httpRedirect,
    responseMs: page.ms,
    title: clean(root.querySelector('title')?.text),
    siteName: meta('meta[property="og:site_name"]') || clean(ldName),
    people: findPeople(page.body, meta('meta[property="og:site_name"]') || clean(ldName) || domain),
    metaDescription: meta('meta[name="description"]'),
    h1: root.querySelectorAll('h1').map((h) => clean(h.text)).filter(Boolean),
    h2: root.querySelectorAll('h2').map((h) => clean(h.text)).filter(Boolean).slice(0, 12),
    lang: clean(root.querySelector('html')?.getAttribute('lang')),
    canonical: clean(root.querySelector('link[rel="canonical"]')?.getAttribute('href')),
    viewport: Boolean(root.querySelector('meta[name="viewport"]')),
    robotsMeta: meta('meta[name="robots"]').toLowerCase(),
    ogTitle: Boolean(meta('meta[property="og:title"]')),
    ogDescription: Boolean(meta('meta[property="og:description"]')),
    ogImage: Boolean(meta('meta[property="og:image"]')),
    twitterCard: Boolean(meta('meta[name="twitter:card"]')),
    jsonLd,
    favicon: Boolean(root.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')),
    images: images.length,
    imagesWithAlt: images.filter((img) => clean(img.getAttribute('alt')).length > 0).length,
    internalLinks,
    wordCount: text ? text.split(/\s+/).length : 0,
    text: text.slice(0, 4000),
    robotsTxt,
    sitemap,
    domainCreated,
  };
}
