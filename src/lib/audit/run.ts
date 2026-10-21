// One audit end to end: scan the site, check it and profile the business
// (fast), then — as a separate step — find its press. The response view adds
// catalogue matches, fits and plans at the viewer's current prices.

import { classify } from './classify';
import { brandName, hostOf } from './coverage';
import { buildPlans, catalogueGenres, competitorPress, industryFits, splitCoverage, type PartnerPricing } from './fits';
import { llmConfigured } from './llm';
import type { Market } from './markets';
import { safeFetch } from './fetch-site';
import { findPeople, looksLikePerson } from './people';
import { findPress, PRESS_VERSION } from './press';
import { scanSite } from './scan';
import { runSeoChecks } from './seo-checks';
import { searchableSites } from './site-search';
import { updateAuditData, type AuditData, type AuditRow, type CompetitorCheck } from './store';

export async function runAudit(domain: string, market: Market): Promise<AuditData> {
  const facts = await scanSite(domain);
  const seo = runSeoChecks(facts);
  const profile = await classify(domain, market.label, facts, catalogueGenres());
  const { text, ...stored } = facts;
  return { facts: stored, seo, profile };
}

const coverageReady = (data: AuditData) => data.coverage?.v === PRESS_VERSION;

// People named on the homepage; audits saved before people were recorded
// read the homepage again.
async function peopleFor(row: AuditRow, brand: string): Promise<string[]> {
  // Lists saved by older versions can hold phrases that aren't names.
  if (row.data.facts.people) return row.data.facts.people.filter(looksLikePerson);
  try {
    const page = await safeFetch(row.data.facts.finalUrl, { timeoutMs: 8000 });
    return findPeople(page.body, brand);
  } catch {
    return [];
  }
}

export async function checkCoverage(row: AuditRow, market: Market): Promise<AuditRow> {
  const brand = brandName(row.domain, row.data.facts.siteName ?? '', row.data.facts.title);
  const press = await findPress(row.domain, brand, market.code, await peopleFor(row, brand));
  const data: AuditData = {
    ...row.data,
    coverage: { v: PRESS_VERSION, brand, mentions: press.mentions, searchedSites: press.searchedSites, checkedAt: new Date().toISOString() },
  };
  await updateAuditData(row.id, data);
  return { ...row, data };
}

export async function checkCompetitor(domain: string, name: string, market: Market, people: string[] = []): Promise<CompetitorCheck> {
  const press = await findPress(domain, name, market.code, people);
  return { domain, name, mentions: press.mentions, v: PRESS_VERSION };
}

export function auditView(row: AuditRow, market: Market, pricing: PartnerPricing) {
  const ready = coverageReady(row.data);
  const { featured, featuredHosts, other } = splitCoverage(ready ? row.data.coverage!.mentions : []);
  const checked = (row.data.competitors ?? []).filter((c) => c.v === PRESS_VERSION);
  const rivals = competitorPress(checked, featuredHosts, row.data.profile.niche, pricing);
  // Opportunities leave out titles that already covered the client or a competitor.
  const skip = new Set([...featuredHosts, ...rivals.map((r) => hostOf(r.url))]);
  const fits = industryFits(row.data.profile, market.region, pricing, skip);
  return {
    id: row.id,
    domain: row.domain,
    market: { code: market.code, label: market.label },
    createdAt: row.createdAt,
    facts: row.data.facts,
    seo: row.data.seo,
    profile: row.data.profile,
    brand: row.data.coverage?.brand ?? brandName(row.domain, row.data.facts.siteName ?? '', row.data.facts.title),
    coverage: {
      status: ready ? ('ready' as const) : ('pending' as const),
      searchable: searchableSites().length,
      found: ready ? row.data.coverage!.mentions.length : 0,
    },
    featured,
    otherCoverage: other,
    competitors: (row.data.competitors ?? []).map((c) => ({
      domain: c.domain,
      name: c.name,
      found: c.mentions.length,
      ready: c.v === PRESS_VERSION,
    })),
    competitorPress: rivals,
    fits,
    plans: buildPlans(fits, row.data.profile, rivals),
    llm: { configured: llmConfigured(), used: row.data.profile.source === 'llm' },
  };
}

export type AuditView = ReturnType<typeof auditView>;
