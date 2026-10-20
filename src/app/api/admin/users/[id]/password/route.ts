// src/app/api/admin/users/[id]/password/route.ts
// Admin-only: reveal a user's password from its encrypted copy. Every view
// is written to the activity log.
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, logActivity } from '@/lib/auth';
import { passwordViewEnabled, readPasswordCopy } from '@/lib/password-vault';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  try {
    const password = await readPasswordCopy(userId);
    if (password) logActivity(session.id, 'PASSWORD_VIEWED', `USER:${userId}`).catch(() => {});
    // Never cached anywhere along the way.
    return NextResponse.json(
      { password, enabled: passwordViewEnabled() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error reading password copy:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
