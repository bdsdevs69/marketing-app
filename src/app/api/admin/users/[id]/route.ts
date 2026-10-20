// src/app/api/admin/users/[id]/route.ts
// Admin-only: set a user's password, or delete the user for good.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySession, logActivity, hashToken } from '@/lib/auth';
import db from '@/lib/db';
import { passwordViewEnabled, storePasswordCopy } from '@/lib/password-vault';

const MIN_PASSWORD_LENGTH = 8;

async function requireAdmin(request: NextRequest) {
  const session = await verifySession(request);
  return session && session.role === 'admin' ? session : null;
}

async function findUser(id: string) {
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const result = await db.query('SELECT id, email, role FROM users WHERE id = $1', [userId]);
  return result.rows[0] ?? null;
}

// Set a new password. The user is signed out everywhere so the old one stops
// working at once (an admin changing their own keeps this session).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const user = await findUser((await params).id);
  if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, user.id]);
    await storePasswordCopy(user.id, password);

    const ownToken = request.cookies.get('auth-token')?.value;
    await db.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2',
      [user.id, ownToken ? hashToken(ownToken) : '']
    );

    logActivity(admin.id, 'PASSWORD_SET_BY_ADMIN', `USER:${user.id}`).catch(() => {});
    return NextResponse.json({ success: true, viewable: passwordViewEnabled() });
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Delete a user completely: their sessions, factor and custom prices go with
// them (ON DELETE CASCADE); their activity log entries stay, unlinked.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const user = await findUser((await params).id);
  if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
  if (user.id === admin.id) return NextResponse.json({ message: "You can't delete your own account" }, { status: 403 });
  if (user.role === 'admin') return NextResponse.json({ message: "Admin accounts can't be deleted here" }, { status: 403 });

  try {
    await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    logActivity(admin.id, 'USER_DELETED', `USER:${user.id}:${user.email}`).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
