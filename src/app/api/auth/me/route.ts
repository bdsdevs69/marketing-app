import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // The login must still exist, not just the cookie: a logged-out or
    // expired login is turned away here so the dashboard can send the
    // person back to sign in.
    const user = await verifySession(request);

    if (!user) {
      return NextResponse.json({ message: 'Not signed in' }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name
    });

  } catch (error) {
    console.error('User info error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}