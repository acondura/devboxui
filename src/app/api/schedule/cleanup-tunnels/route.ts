import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { getActiveTunnelIds, runCleanup } from '@/app/api/admin/cleanup-tunnels/route';

export const dynamic = 'force-dynamic';

/**
 * Weekly tunnel cleanup cron — deletes orphaned Cloudflare tunnels (down + unreferenced).
 *
 * Called by Cloudflare Cron Trigger every Sunday at 03:00 UTC:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Manual test:
 *   curl -X GET https://devboxui.com/api/schedule/cleanup-tunnels \
 *        -H "Authorization: Bearer <secret>"
 *
 * Cloudflare Dashboard → Workers & Pages → devboxui → Settings → Triggers → Cron Triggers:
 *   Add:  0 3 * * 0
 */
export async function GET(req: NextRequest) {
  const env = await getCloudflareEnv();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  // Dry-run: just report what would be deleted (no ?force param)
  const force = req.nextUrl.searchParams.get('force') === '1';

  if (!force) {
    const { CloudflareApiService } = await import('@/lib/cloudflare-api');
    const cfApi = new CloudflareApiService(env);
    const [tunnels, activeTunnelIds] = await Promise.all([
      cfApi.listTunnels(),
      getActiveTunnelIds(kv),
    ]);
    const orphaned = tunnels.filter(t => t.status !== 'healthy' && !activeTunnelIds.has(t.id));
    return NextResponse.json({
      dryRun: true,
      orphaned: orphaned.length,
      tunnels: orphaned.map(t => ({ id: t.id, name: t.name, status: t.status })),
      hint: 'Add ?force=1 to actually delete',
    });
  }

  return runCleanup(env, kv);
}
