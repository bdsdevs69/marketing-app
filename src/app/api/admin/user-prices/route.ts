// src/app/api/admin/user-prices/route.ts
// Admin-only: the exact prices set for one user (they see these instead of
// base price + factor), and setting or clearing one.
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import db from '@/lib/db';
import { CatalogKind, clearUserPrice, ensureUserPricesTable, setUserPrice } from '@/lib/catalog';
import { parseCatalogKind as parseKind, readCatalogItems } from '@/lib/catalog-files';

const MAX_PRICE = 1_000_000;

async function requireAdmin(request: NextRequest) {
  const session = await verifySession(request);
  return session && session.role === 'admin' ? session : null;
}

async function userExists(userId: number) {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const result = await db.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0;
}

const itemExists = (kind: CatalogKind, id: string) => readCatalogItems(kind).some((item) => item._id === id);

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const userId = Number(request.nextUrl.searchParams.get('userId'));
  const kind = parseKind(request.nextUrl.searchParams.get('catalog') ?? 'publication');
  if (!kind) return NextResponse.json({ message: 'Unknown catalogue' }, { status: 400 });
  if (!(await userExists(userId))) return NextResponse.json({ message: 'User not found' }, { status: 404 });

  try {
    await ensureUserPricesTable();
    const result = await db.query(
      'SELECT item_id, price, updated_at FROM user_price_overrides WHERE user_id = $1 AND catalog = $2',
      [userId, kind]
    );
    return NextResponse.json({
      prices: result.rows.map((r) => ({ id: r.item_id, price: Number(r.price), updatedAt: new Date(r.updated_at).toISOString() })),
    });
  } catch (error) {
    console.error('Error loading user prices:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const userId = Number(body.userId);
  const kind = parseKind(body.catalog);
  const id = typeof body.id === 'string' ? body.id : '';
  const price = Number(body.price);

  if (!kind) return NextResponse.json({ message: 'Unknown catalogue' }, { status: 400 });
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return NextResponse.json({ message: `Price must be between 0 and ${MAX_PRICE.toLocaleString()}` }, { status: 400 });
  }
  if (!(await userExists(userId))) return NextResponse.json({ message: 'User not found' }, { status: 404 });
  if (!itemExists(kind, id)) return NextResponse.json({ message: 'Item not found' }, { status: 404 });

  try {
    const rounded = Math.round(price * 100) / 100;
    await setUserPrice(userId, kind, id, rounded, admin.id);
    return NextResponse.json({ id, price: rounded });
  } catch (error) {
    console.error('Error saving user price:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const userId = Number(body.userId);
  const kind = parseKind(body.catalog);
  const id = typeof body.id === 'string' ? body.id : '';
  if (!kind) return NextResponse.json({ message: 'Unknown catalogue' }, { status: 400 });

  try {
    await clearUserPrice(userId, kind, id);
    return NextResponse.json({ id, cleared: true });
  } catch (error) {
    console.error('Error clearing user price:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
