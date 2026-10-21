// src/app/api/audit/route.ts
// Client audits: GET lists the viewer's recent audits and allowance; POST
// runs one (or re-opens the saved one for free).
import { NextRequest, NextResponse } from 'next/server';
import { normaliseDomain } from '@/lib/audit/fetch-site';
import { marketByCode } from '@/lib/audit/markets';
import { auditView, runAudit } from '@/lib/audit/run';
import { auditLimitFor, auditsThisMonth, latestAudit, recentAudits, saveAudit } from '@/lib/audit/store';
import { viewer, viewerPricing } from '@/lib/audit/viewer';

// Scanning a slow site plus the LLM can take a while.
export const maxDuration = 60;


export async function GET(request: NextRequest) {
  const user = await viewer(request);
  if (!user) return NextResponse.json({ message: 'Please sign in' }, { status: 401 });
  try {
    const [recent, used, limit] = await Promise.all([recentAudits(user.id), auditsThisMonth(user.id), auditLimitFor(user.id, user.role)]);
    return NextResponse.json({ recent, quota: { used, limit } });
  } catch (error) {
    console.error('Error listing audits:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await viewer(request);
  if (!user) return NextResponse.json({ message: 'Please sign in' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const domain = normaliseDomain(String(body.url ?? ''));
  const market = marketByCode(String(body.market ?? 'us'));
  if (!domain) return NextResponse.json({ message: 'Enter a website, e.g. clientbrand.com' }, { status: 400 });
  if (!market) return NextResponse.json({ message: 'Pick a market' }, { status: 400 });

  try {
    const [used, limit] = await Promise.all([auditsThisMonth(user.id), auditLimitFor(user.id, user.role)]);

    // A saved audit of the same site and market re-opens for free.
    if (!body.refresh) {
      const saved = await latestAudit(user.id, domain, market.code);
      if (saved) {
        return NextResponse.json({
          audit: auditView(saved, market, await viewerPricing(request)),
          reopened: true,
          quota: { used, limit },
        });
      }
    }

    if (limit !== null && used >= limit) {
      return NextResponse.json(
        {
          message:
            limit === 0
              ? 'New audits aren’t switched on for your account. Saved audits still open for free.'
              : `You've used all ${limit} new audit${limit === 1 ? '' : 's'} this month. Saved audits still open for free.`,
        },
        { status: 429 }
      );
    }

    const data = await runAudit(domain, market);
    const row = await saveAudit(user.id, domain, market.code, data);
    return NextResponse.json({
      audit: auditView(row, market, await viewerPricing(request)),
      reopened: false,
      quota: { used: used + 1, limit },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Problems reaching the client's site are the partner's to see; anything else is ours.
    if (/couldn't open|public website|web address|standard web|redirects/i.test(message)) {
      return NextResponse.json({ message }, { status: 422 });
    }
    console.error('Error running audit:', error);
    return NextResponse.json({ message: 'The audit failed. Please try again.' }, { status: 500 });
  }
}
