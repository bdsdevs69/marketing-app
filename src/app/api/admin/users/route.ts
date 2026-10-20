// src/app/api/admin/users/route.ts
// Admin-only: every user with their factor, last login, custom-price count
// and whether a viewable password copy exists, plus the pricing factors.
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import db from '@/lib/db';
import { ensureUserPricesTable } from '@/lib/catalog';
import { ensurePasswordColumn, passwordViewEnabled } from '@/lib/password-vault';

export async function GET(request: NextRequest) {
  try {
    const sessionData = await verifySession(request);
    if (!sessionData || sessionData.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await Promise.all([ensurePasswordColumn(), ensureUserPricesTable()]);

    // Last login comes from the activity log, which records every sign-in.
    const [users, factors] = await Promise.all([
      db.query(`
        SELECT
          u.id, u.email, u.role, u.first_name, u.last_name, u.is_active,
          u.created_at, u.updated_at,
          upf.factor_id, pf.name AS factor_name,
          ll.last_login, COALESCE(ll.login_count, 0)::int AS login_count,
          COALESCE(cp.custom_prices, 0)::int AS custom_prices,
          (u.password_view IS NOT NULL) AS has_password_copy
        FROM users u
        LEFT JOIN user_pricing_factors upf ON upf.user_id = u.id
        LEFT JOIN pricing_factors pf ON pf.id = upf.factor_id
        LEFT JOIN LATERAL (
          SELECT MAX(a.created_at) AS last_login, COUNT(*) AS login_count
            FROM activity_logs a WHERE a.user_id = u.id AND a.action = 'LOGIN'
        ) ll ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS custom_prices FROM user_price_overrides o WHERE o.user_id = u.id
        ) cp ON true
        ORDER BY u.created_at DESC
      `),
      db.query('SELECT id, name, is_active FROM pricing_factors ORDER BY is_active DESC, name'),
    ]);

    return NextResponse.json({
      users: users.rows,
      factors: factors.rows,
      passwordView: passwordViewEnabled(),
      currentUserId: sessionData.id,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
