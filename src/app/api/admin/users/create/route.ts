// src/app/api/admin/users/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, logActivity } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';
import { storePasswordCopy } from '@/lib/password-vault';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Create a user account directly, with its pricing factor, instead of emailing an
// invitation. The admin sets the password and hands the credentials over themselves.
export async function POST(request: NextRequest) {
  try {
    const admin = await verifySession(request);
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    // Emails are stored lower-cased so the credentials we hand over work whatever
    // case the client types at login.
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const firstName = String(body.firstName ?? '').trim() || null;
    const lastName = String(body.lastName ?? '').trim() || null;
    const role = body.role === 'admin' ? 'admin' : 'user';
    const factorId =
      body.factorId === null || body.factorId === undefined || body.factorId === ''
        ? null
        : Number(body.factorId);

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ message: 'Enter a valid email address' }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (factorId !== null && !Number.isInteger(factorId)) {
      return NextResponse.json({ message: 'Invalid pricing factor' }, { status: 400 });
    }

    // Compare case-insensitively so two accounts can't differ only by capitalisation.
    const existing = await db.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { message: 'A user with that email already exists' },
        { status: 409 }
      );
    }

    if (factorId !== null) {
      const factor = await db.query(
        'SELECT id, name FROM pricing_factors WHERE id = $1 AND is_active = true',
        [factorId]
      );
      if (factor.rows.length === 0) {
        return NextResponse.json(
          { message: 'That pricing factor no longer exists' },
          { status: 400 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create the account and attach its factor together, so a user is never left
    // half-created on the wrong pricing.
    const created = await db.transaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         RETURNING id, email, role, first_name, last_name, is_active, created_at`,
        [email, passwordHash, role, firstName, lastName]
      );
      const user = userResult.rows[0];

      if (factorId !== null) {
        await client.query(
          `INSERT INTO user_pricing_factors (user_id, factor_id, assigned_by, assigned_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET factor_id = $2, assigned_by = $3, assigned_at = NOW()`,
          [user.id, factorId, admin.id]
        );
      }

      return user;
    });

    await storePasswordCopy(created.id, password);

    // Audit trail is best effort — never fail a successful creation over it.
    logActivity(admin.id, 'USER_CREATED', `USER:${created.id}`).catch((error) =>
      console.error('Failed to log user creation:', error)
    );

    return NextResponse.json({ success: true, user: created }, { status: 201 });
  } catch (error) {
    // Unique violation, in case two admins submit the same email at once.
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { message: 'A user with that email already exists' },
        { status: 409 }
      );
    }
    console.error('Error creating user:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
