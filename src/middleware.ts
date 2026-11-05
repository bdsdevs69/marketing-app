import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

// Every page needs a signed-in user. This file must live next to the app
// (src/), or Next.js silently skips it and every page is open to anyone.
// The token's signature is checked here; whether the login is still active
// is checked by the APIs, which the dashboard follows back to /login.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/login') return NextResponse.next();

  const token = request.cookies.get('auth-token')?.value;
  let valid = false;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
      valid = true;
    } catch {
      // forged, expired or signed with an old secret
    }
  }
  if (valid) return NextResponse.next();

  const response = NextResponse.redirect(new URL('/login', request.url));
  if (token) response.cookies.delete('auth-token');
  return response;
}

export const config = {
  runtime: 'nodejs',
  // Pages only: APIs check the login themselves, and files (anything with a
  // dot, e.g. /logos/forbes.png) and the invitation sign-up page stay open.
  matcher: ['/((?!api|_next/static|_next/image|signup|.*\\..*).*)'],
};
