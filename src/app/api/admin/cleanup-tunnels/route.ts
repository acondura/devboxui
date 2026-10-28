import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { ServerConfig } from '@/modules/inventory/types';

export const dynamic = 'force-dynamic';

/**
 * Lists all Cloudflare tunnels and cross-references them with KV server configs
 * to identify orphaned (unused) tunnels safe for deletion.
 *
 * Usage (while logged in):
 *   GET  /api/admin/cleanup-tunnels           — list all tunnels with usage status
 *   POST /api/admin/cleanup-tunnels           — delete orphaned (down, unreferenced) tunnels
 *   POST /api/admin/cleanup-tunnels?id=<tid>  — delete a specific tunnel by ID
 */

async function getActiveTunnelIds(kv: KVNamespace): Promise<Set<string>> {
  const active = new Set<string>();
  // Scan all server keys across all orgs/users
  const list = await kv.list({ prefix: 'servers:' });
  for (const item of list.keys) {
    const raw = await kv.get(item.name);
    if (!raw) continue;
    try {
      const server = JSON.parse(raw) as ServerConfig;
      if (server.tunnelId) active.add(server.tunnelId);
    } catch { /* skip malformed */ }
  }
  return active;
}

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

  const result = tunnels.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    inUse: activeTunnelIds.has(t.id),
    safeToDelete: t.status !== 'healthy' && !activeTunnelIds.has(t.id),
  }));

  const orphaned = result.filter(t => t.safeToDelete);
  const inUse = result.filter(t => t.inUse);
  const healthy = result.filter(t => t.status === 'healthy');

  return NextResponse.json({
    total: tunnels.length,
    inUse: inUse.length,
    healthy: healthy.length,
    orphaned: orphaned.length,
    tunnels: result,
  });
}

export async function POST(req: NextRequest) {
  try { await getIdentity(); } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  const cfApi = new CloudflareApiService(env);
  const specificId = req.nextUrl.searchParams.get('id');

  const activeTunnelIds = await getActiveTunnelIds(kv);

  let toDelete: string[] = [];

  if (specificId) {
    // Delete a single specific tunnel — but refuse if it's in use or healthy
    const tunnels = await cfApi.listTunnels();
    const tunnel = tunnels.find(t => t.id === specificId);
    if (!tunnel) return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 });
    if (activeTunnelIds.has(specificId)) {
      return NextResponse.json({ error: 'Tunnel is still referenced by a server — cannot delete' }, { status: 409 });
    }
    if (tunnel.status === 'healthy') {
      return NextResponse.json({ error: 'Tunnel is healthy/active — cannot delete' }, { status: 409 });
    }
    toDelete = [specificId];
  } else {
    // Delete all orphaned (down + unreferenced) tunnels
    const tunnels = await cfApi.listTunnels();
    toDelete = tunnels
      .filter(t => t.status !== 'healthy' && !activeTunnelIds.has(t.id))
      .map(t => t.id);
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ message: 'No orphaned tunnels to delete', deleted: [] });
  }

  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const tunnelId of toDelete) {
    try {
      await cfApi.deleteTunnel(tunnelId);
      results.push({ id: tunnelId, success: true });
    } catch (e) {
      results.push({ id: tunnelId, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return NextResponse.json({ deleted: succeeded, failed, results });
}
