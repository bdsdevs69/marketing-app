// src/app/api/admin/catalog/route.ts
// Admin-only: list every catalogue item with its supplier cost and current
// base, and set or clear base-price overrides.
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import {
  CatalogKind,
  clearOverride,
  getActiveFactors,
  getOverrideDetails,
  setOverride,
} from '@/lib/catalog';
import { readCatalogFile } from '@/lib/catalog-files';

interface FileItem {
  _id: string;
  name?: string;
  url?: string;
  show_url?: string;
  defaultPrice?: Array<number | string>;
}

const FILES: Record<CatalogKind, string> = {
  publication: 'data.json',
  podcast: 'podcasts.json',
};

const MAX_BASE = 1_000_000;

function parseKind(value: unknown): CatalogKind | null {
  return value === 'publication' || value === 'podcast' ? value : null;
}

function fileItems(kind: CatalogKind) {
  return readCatalogFile<FileItem>(FILES[kind]);
}

async function requireAdmin(request: NextRequest) {
  const session = await verifySession(request);
  return session && session.role === 'admin' ? session : null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const kind = parseKind(request.nextUrl.searchParams.get('catalog') ?? 'publication');
  if (!kind) return NextResponse.json({ message: 'Unknown catalogue' }, { status: 400 });

  try {
    const [factors, overrides] = await Promise.all([getActiveFactors(), getOverrideDetails(kind)]);
    const items = fileItems(kind).map((item) => {
      const fileBase = Number(item.defaultPrice?.[0]);
      const override = overrides.get(item._id);
      return {
        id: item._id,
        name: (item.name ?? '').trim(),
        url: item.url ?? item.show_url ?? '',
        fileBase: Number.isFinite(fileBase) ? fileBase : null,
        base: override?.base ?? (Number.isFinite(fileBase) ? fileBase : null),
        overridden: Boolean(override),
        updatedAt: override?.updatedAt ?? null,
        updatedBy: override?.updatedBy ?? null,
      };
    });
    return NextResponse.json({ catalog: kind, factors, items });
  } catch (error) {
    console.error('Error loading catalogue for admin:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const kind = parseKind(body.catalog);
  const id = typeof body.id === 'string' ? body.id : '';
  const base = Number(body.base);

  if (!kind) return NextResponse.json({ message: 'Unknown catalogue' }, { status: 400 });
  if (!Number.isFinite(base) || base < 0 || base > MAX_BASE) {
    return NextResponse.json({ message: `Base price must be between 0 and ${MAX_BASE.toLocaleString()}` }, { status: 400 });
  }

  const item = fileItems(kind).find((i) => i._id === id);
  if (!item) return NextResponse.json({ message: 'Item not found' }, { status: 404 });

  try {
    const rounded = Math.round(base * 100) / 100;
    // Setting a base back to the supplier cost just removes the override.
    if (rounded === Number(item.defaultPrice?.[0])) {
      await clearOverride(kind, id);
      return NextResponse.json({ id, base: rounded, overridden: false });
    }
    await setOverride(kind, id, rounded, admin.id);
    return NextResponse.json({ id, base: rounded, overridden: true });
  } catch (error) {
    console.error('Error saving base price:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'Admin access required' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const kind = parseKind(body.catalog);
  const id = typeof body.id === 'string' ? body.id : '';
  if (!kind) return NextResponse.json({ message: 'Unknown catalogue' }, { status: 400 });

  const item = fileItems(kind).find((i) => i._id === id);
  if (!item) return NextResponse.json({ message: 'Item not found' }, { status: 404 });

  try {
    await clearOverride(kind, id);
    const fileBase = Number(item.defaultPrice?.[0]);
    return NextResponse.json({ id, base: fileBase, overridden: false });
  } catch (error) {
    console.error('Error clearing base price:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
