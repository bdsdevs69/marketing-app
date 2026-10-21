// src/app/api/audit/[id]/route.ts
// Open a saved audit (owner or admin), with fits at the viewer's prices.
import { NextRequest, NextResponse } from 'next/server';
import { marketByCode } from '@/lib/audit/markets';
import { auditView } from '@/lib/audit/run';
import { getAudit } from '@/lib/audit/store';
import { viewer, viewerPricing } from '@/lib/audit/viewer';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await viewer(request);
  if (!user) return NextResponse.json({ message: 'Please sign in' }, { status: 401 });

  const id = Number((await params).id);
  try {
    const row = Number.isInteger(id) && id > 0 ? await getAudit(id) : null;
    if (!row || (row.userId !== user.id && user.role !== 'admin')) {
      return NextResponse.json({ message: 'Audit not found' }, { status: 404 });
    }
    const market = marketByCode(row.market) ?? marketByCode('us')!;
    return NextResponse.json({ audit: auditView(row, market, await viewerPricing(request)) });
  } catch (error) {
    console.error('Error opening audit:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
