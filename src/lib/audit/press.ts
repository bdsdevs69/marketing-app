// Press for a domain, accurate first:
//  - articles on our catalogue sites that contain the domain (each site's
//    own search, every result's text read back and checked);
//  - news headlines that name the brand outright;
//  - news headlines that name one of its people (founder, CEO…), searched
//    together with a word from the brand so namesakes don't match.

import { findMentions, type Mention } from './coverage';
import { searchCatalogueSites } from './site-search';

// Bump when the way press is found changes, so saved audits refresh.
export const PRESS_VERSION = 3;

const GENERIC = new Set(['the', 'and', 'of', 'inc', 'llc', 'ltd', 'co', 'company', 'group', 'agency', 'clinic', 'institute', 'medical', 'center', 'centre', 'global', 'international', 'services', 'solutions', 'studio', 'studios', 'labs', 'media']);

const norm = (s: string) => s.toLowerCase().replace(/[®™©]/g, '').replace(/\bdr\.?\s+/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
const has = (title: string, phrase: string) => ` ${norm(title)} `.includes(` ${norm(phrase)} `);

// A brand counts only when it's distinctive enough not to collide.
const distinctive = (brand: string) => norm(brand).split(' ').length >= 2 || norm(brand).length >= 8;

export async function findPress(domain: string, brand: string, market: string, people: string[] = []) {
  const keyword = norm(brand).split(' ').find((w) => w.length > 3 && !GENERIC.has(w)) ?? '';
  const [site, byBrand, ...byPeople] = await Promise.all([
    searchCatalogueSites(domain),
    findMentions([brand, domain], market),
    ...people.map((person) => findMentions([keyword ? `"${person}" ${keyword}` : `"${person}"`], market, true)),
  ]);

  const fromSites: Mention[] = site.hits.map((h) => ({ title: h.title, url: h.url, source: '', host: h.host, date: h.date, via: 'site' }));
  const fromBrand = byBrand.filter((m) => has(m.title, domain) || (distinctive(brand) && has(m.title, brand)));
  const fromPeople = byPeople.flatMap((list, i) => list.filter((m) => has(m.title, people[i])));
  return { mentions: [...fromSites, ...fromBrand, ...fromPeople], searchedSites: site.searched };
}
