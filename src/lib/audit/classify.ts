// What the client does, who for, and whether they're a niche (health,
// crypto, CBD, gambling, adult) client — the niches publications price and
// accept differently. Rules first; the LLM refines when it's reachable.

import type { PageFacts } from './scan';
import { askLlmJson } from './llm';

export const NICHES = ['standard', 'health', 'crypto', 'cbd', 'gambling', 'adult'] as const;
export type Niche = (typeof NICHES)[number];

export interface Classification {
  category: string;
  summary: string;
  audience: string;
  niche: Niche;
  genres: string[]; // catalogue genres, best first
  source: 'llm' | 'rules';
}

const NICHE_WORDS: Record<Exclude<Niche, 'standard'>, string[]> = {
  health: ['clinic', 'medical', 'medicine', 'health', 'wellness', 'therapy', 'therapies', 'doctor', 'physician', 'patient', 'supplement', 'stem cell', 'dental', 'dentist', 'pharma', 'treatment', 'longevity', 'telehealth', 'surgery', 'nutrition'],
  crypto: ['crypto', 'cryptocurrency', 'bitcoin', 'blockchain', 'web3', 'defi', 'nft', 'ethereum', 'stablecoin', 'altcoin'],
  cbd: ['cbd', 'cannabis', 'hemp', 'thc', 'marijuana', 'dispensary', 'delta-8', 'kratom'],
  gambling: ['casino', 'betting', 'sportsbook', 'poker', 'slots', 'gambling', 'wager', 'jackpot', 'lottery', 'bookmaker'],
  adult: ['adult content', 'xxx', 'escort', 'onlyfans', 'porn', 'cam girls', 'nsfw'],
};

// Words that point a client at a catalogue genre.
const GENRE_WORDS: Record<string, string[]> = {
  'Health & Wellness': NICHE_WORDS.health,
  'Crypto & Web3': NICHE_WORDS.crypto,
  Finance: ['finance', 'financial', 'invest', 'investment', 'bank', 'loan', 'mortgage', 'insurance', 'wealth', 'trading', 'accounting', 'tax', 'fintech', 'capital'],
  Tech: ['software', 'saas', 'app', 'artificial intelligence', ' ai ', 'technology', 'cloud', 'platform', 'data', 'cyber', 'developer', 'automation', 'digital'],
  Business: ['business', 'consulting', 'consultancy', 'b2b', 'agency', 'enterprise', 'startup', 'company', 'services', 'solutions', 'entrepreneur', 'leadership', 'coaching'],
  'Real Estate': ['real estate', 'property', 'properties', 'realtor', 'homes for sale', 'brokerage', 'listing', 'realty', 'condo', 'apartment'],
  Fashion: ['fashion', 'clothing', 'apparel', 'streetwear', 'designer', 'collection', 'boutique', 'jewelry', 'jewellery', 'accessories'],
  Beauty: ['beauty', 'skincare', 'skin care', 'cosmetic', 'salon', 'makeup', 'hair', 'spa', 'aesthetic'],
  Music: ['music', 'artist', 'album', 'record label', 'band', 'songwriter', 'producer', 'concert', 'single'],
  Entertainment: ['entertainment', 'celebrity', 'show', 'events', 'influencer', 'creator', 'podcast'],
  'Film & TV': ['film', 'movie', 'tv series', 'production company', 'studio', 'documentary', 'streaming'],
  'Food & Drink': ['restaurant', 'food', 'recipe', 'drink', 'coffee', 'wine', 'bar', 'catering', 'bakery', 'chef', 'beverage'],
  Travel: ['travel', 'hotel', 'tour', 'resort', 'vacation', 'airline', 'destination', 'booking', 'tourism'],
  Sports: ['sport', 'sports', 'athlete', 'team', 'league', 'fitness', 'gym', 'training', 'coach'],
  Legal: ['law firm', 'attorney', 'lawyer', 'legal', 'litigation', 'immigration'],
  Marketing: ['marketing', 'seo', 'advertising', 'branding', 'public relations', 'social media', 'growth'],
  Automotive: ['car', 'cars', 'auto', 'automotive', 'vehicle', 'dealership', 'motors'],
  'Home & Design': ['interior', 'design studio', 'furniture', 'home decor', 'architecture', 'architect', 'renovation', 'construction'],
  Luxury: ['luxury', 'premium', 'exclusive', 'bespoke', 'yacht', 'private jet'],
  'Parenting & Family': ['parenting', 'parents', 'kids', 'children', 'baby', 'family', 'mom'],
  Science: ['science', 'research', 'laboratory', 'biotech', 'scientific', 'clinical trial'],
  Gaming: ['gaming', 'video game', 'esports', 'gamer', 'console'],
  Politics: ['politics', 'political', 'campaign', 'government', 'policy', 'election'],
};

// Whole words only, so "car" doesn't count inside "care".
const countHits = (text: string, words: string[]) =>
  words.reduce((n, w) => n + (text.match(new RegExp(`\\b${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'))?.length ?? 0), 0);

function byRules(facts: PageFacts, catalogueGenres: string[]): Classification {
  // Title, description and headings count more than body text.
  const headline = ` ${[facts.title, facts.metaDescription, ...facts.h1, ...facts.h2].join(' ')} `.toLowerCase();
  const body = ` ${facts.text} `.toLowerCase();
  const score = (words: string[]) => countHits(headline, words) * 4 + countHits(body, words);

  // A niche business says so in its title, description or main heading;
  // a news site that merely mentions crypto doesn't count.
  let niche: Niche = 'standard';
  let best = 0;
  for (const [n, words] of Object.entries(NICHE_WORDS) as [Exclude<Niche, 'standard'>, string[]][]) {
    const s = score(words);
    if (countHits(headline, words) > 0 && s >= 8 && s > best) {
      best = s;
      niche = n;
    }
  }

  const genres = Object.entries(GENRE_WORDS)
    .map(([genre, words]) => ({ genre, s: score(words) }))
    .filter((g) => g.s >= 3 && catalogueGenres.includes(g.genre))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((g) => g.genre);
  if (!genres.length) genres.push('Business');

  const summary = facts.metaDescription || facts.text.split(/(?<=[.!?])\s/).slice(0, 2).join(' ').slice(0, 260);
  return {
    category: `${genres[0]}${niche !== 'standard' && genres[0] !== 'Health & Wellness' ? ` (${niche})` : ''}`,
    summary,
    audience: '',
    niche,
    genres,
    source: 'rules',
  };
}

const SYSTEM = `You profile a company's website for a PR agency that places articles in online publications.
Reply with one JSON object only, no prose:
{
 "category": "short industry label, max 6 words, e.g. \\"Regenerative medicine clinic\\"",
 "summary": "1-2 plain sentences: what they do and for whom. No hype.",
 "audience": "who their customers are, max 12 words",
 "niche": one of "standard","health","crypto","cbd","gambling","adult",
 "genres": up to 4 genres from the allowed list, best fit first
}
"niche" is "health" for anything medical, clinical, supplements or wellness treatments; otherwise the matching restricted niche, else "standard".`;

export async function classify(domain: string, marketLabel: string, facts: PageFacts, catalogueGenres: string[]): Promise<Classification> {
  const rules = byRules(facts, catalogueGenres);
  const prompt = [
    `Website: ${domain} (market: ${marketLabel})`,
    `Title: ${facts.title}`,
    `Meta description: ${facts.metaDescription}`,
    `Headings: ${[...facts.h1, ...facts.h2].slice(0, 10).join(' | ')}`,
    `Page text: ${facts.text.slice(0, 2500)}`,
    `Allowed genres: ${catalogueGenres.join(', ')}`,
  ].join('\n');

  const ai = await askLlmJson<Partial<Classification>>(SYSTEM, prompt);
  if (!ai) return rules;

  const niche = NICHES.includes(ai.niche as Niche) ? (ai.niche as Niche) : rules.niche;
  const genres = (Array.isArray(ai.genres) ? ai.genres : [])
    .map(String)
    .filter((g) => catalogueGenres.includes(g))
    .slice(0, 4);
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  return {
    category: text(ai.category, 60) || rules.category,
    summary: text(ai.summary, 320) || rules.summary,
    audience: text(ai.audience, 120),
    niche,
    genres: genres.length ? genres : rules.genres,
    source: 'llm',
  };
}
