// Which catalogue publications suit this client, at the partner's own
// prices; which ones have already covered the client or its competitors;
// and ready-to-order plans built from all of that.

import { readCatalogFile } from '@/lib/catalog-files';
import { displayPrice, type PricingRule } from '@/lib/pricing-math';
import type { Classification, Niche } from './classify';
import { hostOf, type Mention } from './coverage';

interface Named {
  name?: string;
}

interface Pub {
  _id: string;
  name?: string;
  url?: string;
  defaultPrice?: Array<number | string>;
  genres?: Named[] | null;
  regions?: Named[] | null;
  domain_rating?: number | string | null;
  estimated_time?: string | null;
  sponsored?: string | null;
  indexed?: string | null;
  do_follow?: string | boolean | null;
  logo?: { asset?: { _ref?: string } } | null;
  logo_url?: string | null;
  [key: string]: unknown;
}

export interface Fit {
  id: string;
  name: string;
  url: string;
  logo: string;
  price: number;
  dr: number | null;
  tat: string;
  genres: string[];
  reasons: string[];
  score: number;
}

export interface Plan {
  key: 'starter' | 'growth' | 'authority' | 'competitors';
  name: string;
  tagline: string;
  reasoning: string;
  items: Pick<Fit, 'id' | 'name' | 'url' | 'price' | 'dr' | 'tat'>[];
  total: number;
}

export interface PartnerPricing {
  rules: PricingRule[] | null;
  userPrices: Map<string, number>;
  baseOverrides: Map<string, number>;
}

// The catalogue's field for each niche (adult content is "erotic" there).
const NICHE_FIELD: Record<Exclude<Niche, 'standard'>, string> = {
  health: 'health',
  crypto: 'crypto',
  cbd: 'cbd',
  gambling: 'gambling',
  adult: 'erotic',
};

const OWN_PRODUCTS = new Set(['dna-pr-blast']);
const WIDE_REACH = ['International', 'Global'];

// "United States" -> "the United States"; "Canada" stays "Canada".
const placeName = (region: string) =>
  ['United States', 'United Kingdom', 'Netherlands', 'UAE'].includes(region) ? `the ${region}` : region;

const yes = (v: unknown) => v === true || String(v ?? '').toLowerCase() === 'yes';

// Price for this partner: an exact per-user price wins; otherwise the base
// (admin override or supplier cost), times the niche multiplier, through
// their pricing factor.
function priceFor(pub: Pub, niche: Niche, pricing: PartnerPricing): number | null {
  const custom = pricing.userPrices.get(pub._id);
  if (custom !== undefined) return custom;
  const base = pricing.baseOverrides.get(pub._id) ?? Number(pub.defaultPrice?.[0]);
  if (!Number.isFinite(base) || base <= 0) return null;
  const multiplier = niche === 'standard' ? 1 : Number(pub[`${NICHE_FIELD[niche]}Multiplier`]);
  return displayPrice(base * (multiplier > 0 ? multiplier : 1), pricing.rules);
}

// --- Coverage in the catalogue ------------------------------------------

// Catalogue sites by host. A site sold as several packages lists its plain
// listing (no "(…)" in the name) first.
let byHostCache: Map<string, Pub[]> | null = null;
function catalogueByHost(): Map<string, Pub[]> {
  if (!byHostCache) {
    byHostCache = new Map();
    for (const pub of readCatalogFile<Pub>('data.json')) {
      if (OWN_PRODUCTS.has(pub._id) || !pub.url) continue;
      const host = hostOf(pub.url);
      if (!byHostCache.has(host)) byHostCache.set(host, []);
      byHostCache.get(host)!.push(pub);
    }
    for (const list of byHostCache.values()) {
      list.sort((a, b) => Number((a.name ?? '').includes('(')) - Number((b.name ?? '').includes('(')) || (a.name ?? '').length - (b.name ?? '').length);
    }
  }
  return byHostCache;
}

// The catalogue site an article was published on, if any ("news.site.com"
// counts as "site.com" when that's what we sell).
function catalogueHostFor(articleHost: string): string | null {
  const hosts = catalogueByHost();
  if (hosts.has(articleHost)) return articleHost;
  const parts = articleHost.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (hosts.has(parent)) return parent;
  }
  return null;
}

export interface Article {
  title: string;
  url: string;
  date: string | null;
  about?: string; // which competitor, on competitor press
}

export interface Featured {
  id: string;
  name: string;
  url: string;
  logo: string;
  dr: number | null;
  articles: Article[];
}

export interface CompetitorPress extends Featured {
  price: number | null;
  tat: string;
  competitors: string[];
}

const pubDr = (pub: Pub) => {
  const dr = Number(pub.domain_rating);
  return pub.domain_rating !== null && pub.domain_rating !== undefined && Number.isFinite(dr) ? dr : null;
};

const pubLogo = (pub: Pub) => pub.logo_url ?? pub.logo?.asset?._ref ?? '';

// Group articles by the catalogue site they ran on; the rest are "other".
export function splitCoverage(mentions: Mention[]) {
  const inCatalogue = new Map<string, Article[]>();
  const other = new Map<string, { source: string; host: string; count: number; url: string }>();
  for (const m of mentions) {
    const host = catalogueHostFor(m.host);
    const article = { title: m.title, url: m.url, date: m.date };
    if (host) {
      if (!inCatalogue.has(host)) inCatalogue.set(host, []);
      inCatalogue.get(host)!.push(article);
    } else {
      const o = other.get(m.host) ?? { source: m.source, host: m.host, count: 0, url: m.url };
      o.count++;
      other.set(m.host, o);
    }
  }
  const featured: Featured[] = [...inCatalogue.entries()].map(([host, articles]) => {
    const pub = catalogueByHost().get(host)![0];
    return { id: pub._id, name: (pub.name ?? '').trim(), url: pub.url ?? '', logo: pubLogo(pub), dr: pubDr(pub), articles };
  });
  featured.sort((a, b) => (b.dr ?? 0) - (a.dr ?? 0));
  return {
    featured,
    featuredHosts: new Set(inCatalogue.keys()),
    other: [...other.values()].sort((a, b) => b.count - a.count).slice(0, 16),
  };
}

// Catalogue sites that covered a competitor but not the client.
export function competitorPress(
  competitors: { name: string; mentions: Mention[] }[],
  skipHosts: Set<string>,
  niche: Niche,
  pricing: PartnerPricing
): CompetitorPress[] {
  const byHost = new Map<string, { competitors: Set<string>; articles: Article[] }>();
  for (const c of competitors) {
    for (const m of c.mentions) {
      const host = catalogueHostFor(m.host);
      if (!host || skipHosts.has(host)) continue;
      const entry = byHost.get(host) ?? { competitors: new Set<string>(), articles: [] };
      entry.competitors.add(c.name);
      entry.articles.push({ title: m.title, url: m.url, date: m.date, about: c.name });
      byHost.set(host, entry);
    }
  }
  return [...byHost.entries()]
    .map(([host, e]) => {
      const pub = catalogueByHost().get(host)![0];
      return {
        id: pub._id,
        name: (pub.name ?? '').trim(),
        url: pub.url ?? '',
        logo: pubLogo(pub),
        dr: pubDr(pub),
        price: priceFor(pub, niche, pricing),
        tat: pub.estimated_time ?? '',
        competitors: [...e.competitors],
        articles: e.articles.slice(0, 6),
      };
    })
    .sort((a, b) => b.competitors.length - a.competitors.length || (b.dr ?? 0) - (a.dr ?? 0));
}

// --- Industry fits ---------------------------------------------------------

export function industryFits(
  profile: Pick<Classification, 'genres' | 'niche'>,
  region: string,
  pricing: PartnerPricing,
  skipHosts: Set<string> = new Set(),
  limit = 12
): Fit[] {
  const byHost = new Map<string, Fit>();

  for (const pub of readCatalogFile<Pub>('data.json')) {
    if (OWN_PRODUCTS.has(pub._id) || !pub.url || skipHosts.has(hostOf(pub.url))) continue;
    if (profile.niche !== 'standard' && pub[NICHE_FIELD[profile.niche]] !== true) continue;

    const genres = (pub.genres ?? []).map((g) => g.name ?? '').filter(Boolean);
    const matched = profile.genres.filter((g) => genres.includes(g));
    if (!matched.length) continue;

    // Skip titles written only for other countries.
    const regions = (pub.regions ?? []).map((r) => r.name ?? '').filter(Boolean);
    const inRegion = regions.includes(region);
    const wide = regions.some((r) => WIDE_REACH.includes(r));
    if (regions.length && !inRegion && !wide) continue;

    const price = priceFor(pub, profile.niche, pricing);
    if (price === null) continue;

    const dr = Number(pub.domain_rating);
    const hasDr = pub.domain_rating !== null && pub.domain_rating !== undefined && Number.isFinite(dr);

    let score = 0;
    profile.genres.forEach((g, i) => {
      if (genres.includes(g)) score += 4 - Math.min(i, 3);
    });
    score += inRegion ? 3 : wide ? 1 : 0;
    score += hasDr ? Math.min(dr, 100) / 20 : 0;
    if (yes(pub.indexed)) score += 1;
    if (yes(pub.do_follow)) score += 1;
    if (String(pub.sponsored ?? '').toLowerCase() === 'no') score += 1;

    const reasons = [
      `Covers ${matched.join(' & ')}`,
      inRegion ? `Read in ${placeName(region)}` : wide ? 'International readership' : '',
      hasDr ? `DR ${dr}` : '',
      yes(pub.do_follow) ? 'Do-follow link' : '',
    ].filter(Boolean);

    const fit: Fit = {
      id: pub._id,
      name: (pub.name ?? '').trim(),
      url: pub.url,
      logo: pub.logo_url ?? pub.logo?.asset?._ref ?? '',
      price,
      dr: hasDr ? dr : null,
      tat: pub.estimated_time ?? '',
      genres,
      reasons,
      score: Math.round(score * 10) / 10,
    };

    // One entry per site — packages of the same title compete on score, then price.
    const host = hostOf(pub.url);
    const current = byHost.get(host);
    if (!current || fit.score > current.score || (fit.score === current.score && fit.price < current.price)) {
      byHost.set(host, fit);
    }
  }

  return [...byHost.values()].sort((a, b) => b.score - a.score || a.price - b.price).slice(0, limit);
}

const planItem = (f: Fit) => ({ id: f.id, name: f.name, url: f.url, price: f.price, dr: f.dr, tat: f.tat });

export function buildPlans(
  fits: Fit[],
  profile: Pick<Classification, 'category' | 'genres'>,
  rivals: CompetitorPress[] = []
): Plan[] {
  const plans: Plan[] = [];

  // Titles that already ran stories on their competitors.
  const proven = rivals.filter((r) => r.price !== null).slice(0, 5);
  if (proven.length >= 2) {
    plans.push({
      key: 'competitors',
      name: 'Match the competition',
      tagline: 'Where their competitors have already been covered',
      reasoning: `These titles have run stories on ${[...new Set(proven.flatMap((p) => p.competitors))].slice(0, 3).join(', ')} — proof they cover this space. Being there too closes the gap.`,
      items: proven.map((p) => ({ id: p.id, name: p.name, url: p.url, price: p.price!, dr: p.dr, tat: p.tat })),
      total: proven.reduce((sum, p) => sum + (p.price ?? 0), 0),
    });
  }

  if (fits.length < 3) return plans;
  const industry = profile.category || profile.genres[0] || 'their industry';
  const total = (items: Fit[]) => items.reduce((sum, f) => sum + f.price, 0);

  // Keep plans to realistic budgets: leave out titles priced far above a
  // typical fit for this client (premium titles still show in the fits list).
  const prices = fits.map((f) => f.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const cap = Math.max(5000, median * 4);
  const affordable = fits.filter((f) => f.price <= cap);
  const pool = affordable.length >= 3 ? affordable : fits;

  const starter = [...pool].sort((a, b) => a.price - b.price).slice(0, 3);
  const growth = pool.slice(0, Math.min(5, pool.length));
  const authority = [...pool].sort((a, b) => (b.dr ?? 0) - (a.dr ?? 0)).slice(0, Math.min(4, pool.length));

  return [
    ...plans,
    {
      key: 'starter',
      name: 'Starter',
      tagline: 'First credible coverage, on a small budget',
      reasoning: `The three most affordable titles that still match ${industry} readers — enough to show real press on the client's site and socials within weeks.`,
      items: starter.map(planItem),
      total: total(starter),
    },
    {
      key: 'growth',
      name: 'Growth',
      tagline: 'The best overall fits, together',
      reasoning: `The ${growth.length} strongest matches for ${industry}: right audience, right market, indexed and linking back. Builds a visible run of coverage rather than a one-off.`,
      items: growth.map(planItem),
      total: total(growth),
    },
    {
      key: 'authority',
      name: 'Authority',
      tagline: 'Highest-authority titles in their space',
      reasoning: `The highest-DR publications that fit ${industry}. These carry the most weight with Google and with AI answers that cite trusted sources.`,
      items: authority.map(planItem),
      total: total(authority),
    },
  ];
}

// Every genre the catalogue uses, for the classifier to choose from.
let genreCache: string[] | null = null;
export function catalogueGenres(): string[] {
  if (!genreCache) {
    const set = new Set<string>();
    for (const pub of readCatalogFile<Pub>('data.json')) for (const g of pub.genres ?? []) if (g.name) set.add(g.name);
    genreCache = [...set].sort();
  }
  return genreCache;
}
