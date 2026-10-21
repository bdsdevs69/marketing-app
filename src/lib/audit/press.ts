// Press for a domain. An article is only ever reported when the article
// itself links to the domain (or prints it) — missing a feature is fine,
// crediting the client with someone else's is not. Names are only used to
// find articles worth opening:
//  - catalogue sites with a public search, asked for the domain; every
//    result read back through the site's own API and checked;
//  - news search for the domain, the brand and its people (founder, CEO…);
//    every article opened at the publisher and checked.

import { findMentions, hostOf, publisherUrl, type Mention } from './coverage';
import { BROWSER_UA, safeFetch } from './fetch-site';
import { isDomainHost, linksTo } from './links';
import { pool, searchCatalogueSites } from './site-search';

// Bump when the way press is found changes, so saved audits refresh.
export const PRESS_VERSION = 4;

// News articles opened per check; enough for every real lead, and keeps the
// check inside the request's time limit.
const MAX_NEWS_LEADS = 40;
const BUDGET_MS = 36000;

const GENERIC = new Set(['the', 'and', 'of', 'inc', 'llc', 'ltd', 'co', 'company', 'group', 'agency', 'clinic', 'institute', 'medical', 'center', 'centre', 'global', 'international', 'services', 'solutions', 'studio', 'studios', 'labs', 'media']);

const norm = (s: string) => s.toLowerCase().replace(/[®™©]/g, '').replace(/\bdr\.?\s+/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
const sameArticle = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();

// News leads, most promising first: articles found by the domain itself,
// then the brand's and its people's results taken in turn.
async function newsLeads(domain: string, brand: string, market: string, people: string[]) {
  const keyword = norm(brand).split(' ').find((w) => w.length > 3 && !GENERIC.has(w)) ?? '';
  const [byDomain, byBrand, ...byPeople] = await Promise.all([
    findMentions([domain], market),
    findMentions([brand], market),
    ...people.map((person) => findMentions([keyword ? `"${person}" ${keyword}` : `"${person}"`], market, true)),
  ]);
  const rest = [byBrand, ...byPeople];
  const ordered = [...byDomain];
  for (let i = 0; rest.some((list) => i < list.length); i++) for (const list of rest) if (list[i]) ordered.push(list[i]);

  const seen = new Set<string>();
  return ordered
    .filter((m) => {
      const key = `${m.host}|${m.title.toLowerCase()}`;
      if (seen.has(key) || isDomainHost(m.host, domain)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_NEWS_LEADS);
}

// Opens each lead at the publisher; keeps it only if the article links to the domain.
async function confirmLeads(leads: Mention[], domain: string, deadline: number) {
  const left = () => deadline - Date.now();
  const checked = await pool(
    leads,
    10,
    async (lead): Promise<Mention | null> => {
      if (left() < 3000) return null;
      const url = await publisherUrl(lead.url, Math.min(8000, left()));
      if (!url || left() < 1500) return null;
      const page = await safeFetch(url, { timeoutMs: Math.min(9000, left()), maxBytes: 3_000_000, userAgent: BROWSER_UA }).catch(() => null);
      if (!page?.ok || isDomainHost(hostOf(page.finalUrl), domain) || !linksTo(page.body, domain)) return null;
      return { ...lead, url: page.finalUrl, host: hostOf(page.finalUrl) };
    },
    deadline
  );
  return checked.filter((m): m is Mention => m !== null);
}

export async function findPress(domain: string, brand: string, market: string, people: string[] = []) {
  const deadline = Date.now() + BUDGET_MS;
  const [site, news] = await Promise.all([
    searchCatalogueSites(domain, BUDGET_MS - 2000),
    newsLeads(domain, brand, market, people).then((leads) => confirmLeads(leads, domain, deadline)),
  ]);

  const fromSites: Mention[] = site.hits.map((h) => ({ title: h.title, url: h.url, source: '', host: h.host, date: h.date, via: 'site' }));
  const seen = new Set(fromSites.map((m) => sameArticle(m.url)));
  const fromNews = news.filter((m) => !seen.has(sameArticle(m.url)) && seen.add(sameArticle(m.url)));
  return { mentions: [...fromSites, ...fromNews], searchedSites: site.searched };
}
