import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { ServerConfig } from '@/modules/inventory/types';

export const dynamic = 'force-dynamic';

/**
 * Strips the -code suffix from any server's hostname and tunnelUrl in KV,
 * then sets up Cloudflare tunnel routing and Access for the new hostname.
 *
 * Usage (while logged in to devboxui.com):
 *   GET /api/admin/fix-hostname              — fix all servers with -code hostname
 *   GET /api/admin/fix-hostname?id=<uuid>    — fix a specific server by ID
 */
export async function GET(req: NextRequest) {
  let userEmail: string;
  try {
    userEmail = await getIdentity();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  const targetId = req.nextUrl.searchParams.get('id');
  const cfApi = new CloudflareApiService(env);

  const results: Array<{ key: string; old: string; new: string; steps: string[]; error?: string }> = [];

  // Scan all server keys for this user (personal and org)
  const list = await kv.list({ prefix: `servers:${userEmail}:` });

  for (const item of list.keys) {
    const raw = await kv.get(item.name);
    if (!raw) continue;
    const server = JSON.parse(raw) as ServerConfig;

    if (targetId && server.id !== targetId) continue;
    if (!server.hostname?.includes('-code.')) continue;

    const oldHostname = server.hostname;
    const newHostname = oldHostname.replace('-code.', '.');
    const steps: string[] = [];

    try {
      // Update hostname and tunnelUrl in the server record
      server.hostname = newHostname;
      if (server.tunnelUrl) {
        server.tunnelUrl = server.tunnelUrl.replace('-code.', '.');
      }

      // Set up Cloudflare tunnel routing for the new hostname
      if (server.tunnelId) {
        const logsHostname = newHostname.replace(/^([^.]+)\./, '$1-logs.');
        for (const [h, svc] of [[newHostname, undefined], [logsHostname, 'http://localhost:8000']] as [string, string | undefined][]) {
          try {
            steps.push(`Setting up hostname routing for ${h}…`);
            await cfApi.setupHostname(h, server.tunnelId, svc);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('81053')) {
              steps.push(`DNS record for ${h} already exists — skipping`);
            } else {
              throw e;
            }
          }
          try {
            steps.push(`Setting up Access for ${h}…`);
            await cfApi.setupAccess(h, userEmail);
          } catch (e) {
            steps.push(`Access setup for ${h} skipped: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        try {
          const serviceToken = await cfApi.getOrCreateServiceToken(kv);
          await cfApi.authorizeServiceToken(logsHostname, serviceToken.id);
        } catch (e) {
          steps.push(`Service token auth skipped: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        steps.push('No tunnelId on record — skipping Cloudflare routing setup');
      }

      // Persist
      await kv.put(item.name, JSON.stringify(server));
      steps.push('Saved to KV');

      results.push({ key: item.name, old: oldHostname, new: newHostname, steps });
    } catch (err) {
      results.push({
        key: item.name,
        old: oldHostname,
        new: newHostname,
        steps,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ message: 'No servers with -code hostname found', targetId });
  }

  return NextResponse.json({ fixed: results });
}
