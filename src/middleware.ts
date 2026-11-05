import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/magic-auth';

const PUBLIC_PATHS = ['/', '/login', '/api/auth/send', '/api/auth/verify', '/api/auth/logout'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Static assets and Next internals
  if (pathname.startsWith('/_next/') || pathname.startsWith('/cdn-cgi/')) return true;
  if (pathname.match(/\.(ico|svg|png|jpg|jpeg|webp|css|js|woff2?)$/)) return true;
  // Provisioning / cron routes authenticated via CRON_SECRET header, not session
  if (pathname.startsWith('/api/provisioning/') || pathname.startsWith('/api/schedule/')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const authSecret = process.env.AUTH_SECRET;
  // If AUTH_SECRET isn't set yet, fall through (lets CF Access handle it during migration)
  if (!authSecret) return NextResponse.next();

  const sessionCookie = req.cookies.get(SESSION_COOKIE);
  if (sessionCookie?.value) {
    try {
      await verifySessionToken(sessionCookie.value, authSecret);
      return NextResponse.next();
    } catch { /* invalid/expired — fall through to redirect */ }
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
