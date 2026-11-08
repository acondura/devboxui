import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { verifyMagicToken, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/magic-auth';
import { ServerConfig } from '@/modules/inventory/types';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/login?error=missing', req.url));

  try {
    const env = await getCloudflareEnv();
    if (!env.AUTH_SECRET) return NextResponse.redirect(new URL('/login?error=config', req.url));

    const email = await verifyMagicToken(token, env.AUTH_SECRET);

    // Activate any pending collaborator entries for this email
    if (env.KV) {
      await activatePendingCollaborator(env.KV, email);
    }

    const sessionToken = await createSessionToken(email, env.AUTH_SECRET);

    const next = req.nextUrl.searchParams.get('next');
    const redirectTo = next && next.startsWith('/') ? new URL(next, req.url) : new URL('/dashboard', req.url);
    const res = NextResponse.redirect(redirectTo);
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.redirect(new URL('/login?error=expired', req.url));
  }
}

async function activatePendingCollaborator(kv: { get: (k: string) => Promise<string | null>; put: (k: string, v: string) => Promise<void> }, email: string) {
  // Collect all {orgId, serverId} pairs where this email may be a collaborator
  const pairs: { orgId: string; serverId: string }[] = [];

  // Full-access collaborators are in org membership manifest
  const orgManifestRaw = await kv.get(`user:org:manifest:${email}`);
  if (orgManifestRaw) {
    const orgIds: string[] = JSON.parse(orgManifestRaw);
    for (const orgId of orgIds) {
      const serversRaw = await kv.get(`org:servers:manifest:${orgId}`);
      if (serversRaw) {
        const serverIds: string[] = JSON.parse(serversRaw);
        for (const serverId of serverIds) pairs.push({ orgId, serverId });
      }
    }
  }

  // Web-only collaborators are in the webonly index
  const webOnlyRaw = await kv.get(`user:webonly:${email}`);
  if (webOnlyRaw) {
    const entries: { orgId: string; serverId: string }[] = JSON.parse(webOnlyRaw);
    pairs.push(...entries);
  }

  for (const { orgId, serverId } of pairs) {
    const key = `servers:${orgId}:${serverId}`;
    const raw = await kv.get(key);
    if (!raw) continue;
    const server: ServerConfig = JSON.parse(raw);
    const collab = server.collaborators?.find(c => c.email === email);
    if (collab && collab.status === 'pending') {
      collab.status = 'active';
      await kv.put(key, JSON.stringify(server));
    }
  }
}
