// src/app/api/audit/[id]/competitors/route.ts
// Add one competitor (and find its press across our catalogue) or remove
// one. One competitor per request keeps each call well inside the time
// limit; the page adds them in turn. Free — not one of the month's audits.
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'node-html-parser';
import { brandName } from '@/lib/audit/coverage';
import { normaliseDomain, safeFetch } from '@/lib/audit/fetch-site';
import { marketByCode } from '@/lib/audit/markets';
import { findPeople } from '@/lib/audit/people';
import { auditView, checkCompetitor } from '@/lib/audit/run';
import { getAudit, updateAuditData } from '@/lib/audit/store';
import { viewer, viewerPricing } from '@/lib/audit/viewer';

export const maxDuration = 60;

const MAX_COMPETITORS = 8;

// The competitor's own name for itself and the people it names, from its
// homepage; just a name built from the domain if the site doesn't answer.
async function competitorProfile(domain: string) {
  try {
    const page = await safeFetch(`https://${domain}/`, { timeoutMs: 7000, maxBytes: 600_000 });
    const root = parse(page.body);
    const siteName = root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '';
    const name = brandName(domain, siteName, root.querySelector('title')?.text ?? '');
    return { name, people: findPeople(page.body, name) };
  } catch {
    return { name: brandName(domain, '', ''), people: [] };
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await viewer(request);
  if (!user) return NextResponse.json({ message: 'Please sign in' }, { status: 401 });

  const id = Number((await params).id);
  const row = Number.isInteger(id) && id > 0 ? await getAudit(id) : null;
  if (!row || (row.userId !== user.id && user.role !== 'admin')) {
    return NextResponse.json({ message: 'Audit not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const market = marketByCode(row.market) ?? marketByCode('us')!;
  const list = row.data.competitors ?? [];

  try {
    let competitors = list;
    if (body.remove) {
      const remove = normaliseDomain(String(body.remove));
      competitors = list.filter((c) => c.domain !== remove);
    } else {
      const domain = normaliseDomain(String(body.add ?? ''));
      if (!domain) return NextResponse.json({ message: 'Enter a competitor website, e.g. rival.com' }, { status: 400 });
      if (domain === row.domain) return NextResponse.json({ message: "That's the client's own site" }, { status: 400 });
      const others = list.filter((c) => c.domain !== domain);
      if (others.length >= MAX_COMPETITORS) {
        return NextResponse.json({ message: `Up to ${MAX_COMPETITORS} competitors per audit` }, { status: 400 });
      }
      const { name, people } = await competitorProfile(domain);
      competitors = [...others, await checkCompetitor(domain, name, market, people)];
    }

    const data = { ...row.data, competitors };
    await updateAuditData(row.id, data);
    return NextResponse.json({ audit: auditView({ ...row, data }, market, await viewerPricing(request)) });
  } catch (error) {
    console.error('Error checking competitor:', error);
    return NextResponse.json({ message: 'Checking that competitor failed. Please try again.' }, { status: 500 });
  }
}
