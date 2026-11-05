import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { ServerConfig } from '@/modules/inventory/types';

export const dynamic = 'force-dynamic';

/**
 * Builds the set of tunnelIds that are referenced by any server in KV.
 * Uses paginated manifest scans to be safe at any scale.
 */
export async function getActiveTunnelIds(kv: KVNamespace): Promise<Set<string>> {
  const active = new Set<string>();

  // 1. List all org server manifests (paginated)
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'org:servers:manifest:', cursor, limit: 1000 });
    for (const item of page.keys) {
      const raw = await kv.get(item.name);
      if (!raw) continue;
      try {
        const serverIds: string[] = JSON.parse(raw);
        const orgId = item.name.replace('org:servers:manifest:', '');
        // 2. Load each server config to extract tunnelId
        await Promise.all(serverIds.map(async (sid) => {
          const serverRaw = await kv.get(`servers:${orgId}:${sid}`);
          if (!serverRaw) return;
          try {
            const server = JSON.parse(serverRaw) as ServerConfig;
            if (server.tunnelId) active.add(server.tunnelId);
          } catch { /* skip malformed */ }
        }));
      } catch { /* skip malformed manifest */ }
    }
    cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
  } while (cursor);

  return active;
}

/**
 * Lists all Cloudflare tunnels and cross-references with KV to find orphaned ones.
 *
 * Usage (while logged in):
 *   GET  /api/admin/cleanup-tunnels           — list all tunnels with usage status
 *   POST /api/admin/cleanup-tunnels           — delete all orphaned tunnels
 *   POST /api/admin/cleanup-tunnels?id=<tid>  — delete a specific tunnel by ID
 */
export async function GET(_req: NextRequest) {
  try { await getIdentity(); } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  const cfApi = new CloudflareApiService(env);
  const [tunnels, activeTunnelIds] = await Promise.all([
    cfApi.listTunnels(),
    getActiveTunnelIds(kv),
  ]);

  const annotated = tunnels.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    inUse: activeTunnelIds.has(t.id),
    safeToDelete: t.status !== 'healthy' && !activeTunnelIds.has(t.id),
  }));

  return NextResponse.json({
    total: tunnels.length,
    inUse: annotated.filter(t => t.inUse).length,
    healthy: annotated.filter(t => t.status === 'healthy').length,
    orphaned: annotated.filter(t => t.safeToDelete).length,
    tunnels: annotated,
  });
}

export async function POST(req: NextRequest) {
  try { await getIdentity(); } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  return runCleanup(env, kv, req.nextUrl.searchParams.get('id') ?? undefined);
}

export async function runCleanup(
  env: ReturnType<typeof getCloudflareEnv> extends Promise<infer T> ? T : never,
  kv: KVNamespace,
  specificId?: string
): Promise<NextResponse> {
  const cfApi = new CloudflareApiService(env);
  const activeTunnelIds = await getActiveTunnelIds(kv);
  const tunnels = await cfApi.listTunnels();

  let toDelete: typeof tunnels;

  if (specificId) {
    const tunnel = tunnels.find(t => t.id === specificId);
    if (!tunnel) return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 });
    if (activeTunnelIds.has(specificId))
      return NextResponse.json({ error: 'Tunnel is still referenced by a server' }, { status: 409 });
    if (tunnel.status === 'healthy')
      return NextResponse.json({ error: 'Tunnel is healthy/active — cannot delete' }, { status: 409 });
    toDelete = [tunnel];
  } else {
    toDelete = tunnels.filter(t => t.status !== 'healthy' && !activeTunnelIds.has(t.id));
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ message: 'No orphaned tunnels to delete', deleted: 0 });
  }

  const results: { id: string; name: string; success: boolean; error?: string }[] = [];
  for (const t of toDelete) {
    try {
      await cfApi.deleteTunnel(t.id);
      results.push({ id: t.id, name: t.name, success: true });
    } catch (e) {
      results.push({ id: t.id, name: t.name, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    deleted: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  });
}
