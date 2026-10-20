// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { UserModel } from '@/lib/models';
import { createSession, logActivity } from '@/lib/auth';
import { storePasswordCopy } from '@/lib/password-vault';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user in database (including inactive users for proper error handling)
    const user = await UserModel.findByEmail(email);
    if (!user) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password first
    const isValid = await UserModel.verifyPassword(user, password);
    if (!isValid) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if account is active (after password verification)
    if (!user.is_active) {
      return NextResponse.json(
        { 
          message: 'Your account has been restricted. Please contact the administrator for assistance.',
          code: 'ACCOUNT_RESTRICTED'
        },
        { status: 403 }
      );
    }

    // Get client info for logging
    const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || // If multiple IPs, use the first
    request.headers.get('x-real-ip') ||
    'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Create session and token
    const token = await createSession(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      },
      ipAddress,
      userAgent
    );

    // Update user's last login
    await UserModel.updateLastLogin(user.id);

    // Accounts created before viewable copies existed get one on their next
    // sign-in — the only moment the real password is available.
    await storePasswordCopy(user.id, password, true);

    // Log successful login
    await logActivity(
      user.id,
      'LOGIN',
      'AUTH',
      ipAddress,
      userAgent
    );

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });

    // Set secure HTTP-only cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}