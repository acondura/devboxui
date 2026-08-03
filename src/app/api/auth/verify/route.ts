import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { verifyMagicToken, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/magic-auth';


export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/login?error=missing', req.url));

  try {
    const env = await getCloudflareEnv();
    if (!env.AUTH_SECRET) return NextResponse.redirect(new URL('/login?error=config', req.url));

    const email = await verifyMagicToken(token, env.AUTH_SECRET);
    const sessionToken = await createSessionToken(email, env.AUTH_SECRET);

    const res = NextResponse.redirect(new URL('/dashboard', req.url));
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.redirect(new URL('/login?error=expired', req.url));
  }
}
