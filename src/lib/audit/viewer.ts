// The signed-in viewer and their prices, for the audit routes.
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getOverrides, getPricingForToken } from '@/lib/catalog';
import type { PartnerPricing } from './fits';

export async function viewer(request: NextRequest) {
  return verifySession(request);
}

export async function viewerPricing(request: NextRequest): Promise<PartnerPricing> {
  const [{ rules, userPrices }, baseOverrides] = await Promise.all([
    getPricingForToken(request.cookies.get('auth-token')?.value, 'publication'),
    getOverrides('publication'),
  ]);
  return { rules, userPrices, baseOverrides };
}
