// src/app/api/audit/[id]/coverage/route.ts
// Find where the client already appears: search every searchable catalogue
// publication for its domain and check each hit. Runs after the audit (it
// takes ~30s); free — not one of the month's audits.
import { NextRequest, NextResponse } from 'next/server';
import { marketByCode } from '@/lib/audit/markets';
import { auditView, checkCoverage } from '@/lib/audit/run';
import { getAudit } from '@/lib/audit/store';
import { viewer, viewerPricing } from '@/lib/audit/viewer';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await viewer(request);
  if (!user) return NextResponse.json({ message: 'Please sign in' }, { status: 401 });

  const id = Number((await params).id);
  const row = Number.isInteger(id) && id > 0 ? await getAudit(id) : null;
  if (!row || (row.userId !== user.id && user.role !== 'admin')) {
    return NextResponse.json({ message: 'Audit not found' }, { status: 404 });
  }

  const market = marketByCode(row.market) ?? marketByCode('us')!;
  try {
    const updated = await checkCoverage(row, market);
    return NextResponse.json({ audit: auditView(updated, market, await viewerPricing(request)) });
  } catch (error) {
    console.error('Error checking coverage:', error);
    return NextResponse.json({ message: 'Searching for their press failed. Please try again.' }, { status: 500 });
  }
}
