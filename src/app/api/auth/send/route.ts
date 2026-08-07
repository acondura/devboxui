import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { createMagicToken, sendMagicLinkEmail } from '@/lib/magic-auth';


export async function POST(req: NextRequest) {
  try {
    const { email, next } = await req.json() as { email?: string; next?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const env = await getCloudflareEnv();
    if (!env.AUTH_SECRET) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    if (!env.AWS_SES_ACCESS_KEY_ID || !env.AWS_SES_SECRET_ACCESS_KEY || !env.AWS_SES_REGION || !env.AWS_SES_FROM_EMAIL) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
    }

    const token = await createMagicToken(email, env.AUTH_SECRET);
    const appUrl = env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
    const magicUrl = new URL(`${appUrl}/api/auth/verify`);
    magicUrl.searchParams.set('token', token);
    if (next && next.startsWith('/')) magicUrl.searchParams.set('next', next);

    await sendMagicLinkEmail({
      to: email,
      magicUrl: magicUrl.toString(),
      sesAccessKeyId: env.AWS_SES_ACCESS_KEY_ID,
      sesSecretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY,
      sesRegion: env.AWS_SES_REGION,
      sesFromEmail: env.AWS_SES_FROM_EMAIL,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[auth/send]', err);
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 });
  }
}
