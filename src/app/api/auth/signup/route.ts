import { NextRequest, NextResponse } from 'next/server';
import { UserModel, InvitationModel } from '@/lib/models';
import { createSession, logActivity } from '@/lib/auth';
import { sendSignupNotificationEmails } from '@/lib/email';
import { storePasswordCopy } from '@/lib/password-vault';

export async function POST(request: NextRequest) {
  try {
    const { token, password, firstName, lastName } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { message: 'Token and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Verify invitation token
    const invitation = await InvitationModel.findByToken(token);
    if (!invitation) {
      return NextResponse.json(
        { message: 'Invalid or expired invitation' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await UserModel.findByEmail(invitation.email);
    if (existingUser) {
      return NextResponse.json(
        { message: 'User already exists' },
        { status: 400 }
      );
    }

    // Create user account
    const newUser = await UserModel.create({
      email: invitation.email,
      password: password,
      role: 'user',
      first_name: firstName,
      last_name: lastName
    });

    await storePasswordCopy(newUser.id, password);

    // Mark invitation as used
    await InvitationModel.markAsUsed(invitation.id);

    // Get client info
    const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || // If multiple IPs, use the first
    request.headers.get('x-real-ip') ||
    'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Create session
    const authToken = await createSession(
      {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        first_name: newUser.first_name,
        last_name: newUser.last_name
      },
      ipAddress,
      userAgent
    );

    // Log account creation
    await logActivity(
      newUser.id,
      'ACCOUNT_CREATED',
      'AUTH',
      ipAddress,
      userAgent
    );

    // Send signup notification emails to admins (don't block the response)
    sendSignupNotificationEmails({
      id: newUser.id.toString(),
      email: newUser.email,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      role: newUser.role
    }).catch(error => {
      console.error('Failed to send signup notification emails:', error);
      // Don't throw here as the signup was successful
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        first_name: newUser.first_name,
        last_name: newUser.last_name
      }
    });

    // Set auth cookie
    response.cookies.set('auth-token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });

    return response;

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}