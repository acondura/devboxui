import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { getScheduledServers, runMorningWorkflow, processAllPendingSnapshots } from '@/modules/inventory/schedule-actions';

export const dynamic = 'force-dynamic';

/**
 * Morning cron route — spin up each scheduled server from its latest snapshot.
 *
 * Called by Cloudflare Cron Trigger. The cron worker fetches this URL with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Manual test:
 *   curl -X GET https://devboxui.com/api/schedule/morning \
 *        -H "Authorization: Bearer <secret>"
 */
export async function GET(req: NextRequest) {
  const env = await getCloudflareEnv();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Self-healing processing of any pending snapshots
  const kv = env.KV;
  if (kv) {
    try {
      await processAllPendingSnapshots(kv);
    } catch (err) {
      console.error('[Cron Morning] Failed to process pending snapshots:', err);
    }
  }

  const results: Array<{
    serverId: string;
    userEmail: string;
    success: boolean;
    message: string;
  }> = [];

  const scheduledServers = await getScheduledServers();

  for (const { server, schedule, userEmail } of scheduledServers) {
    // Only fire if the scheduled spinup time matches the current local time
    const nowUtc = new Date();
    const localStr = nowUtc.toLocaleString('en-US', {
      timeZone: schedule.timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [localH] = localStr.split(':').map(Number);
    const [targetH] = schedule.spinupTime.split(':').map(Number);

    if (localH !== targetH) {
      results.push({
        serverId: server.id,
        userEmail,
        success: true,
        message: `Skipped — not time yet (local: ${localStr}, target: ${schedule.spinupTime})`
      });
      continue;
    }

    try {
      const result = await runMorningWorkflow(server.id, userEmail);
      results.push({ serverId: server.id, userEmail, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron Morning] Failed for ${server.id}:`, msg);
      results.push({ serverId: server.id, userEmail, success: false, message: msg });
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    processed: results.length,
    results
  });
}
