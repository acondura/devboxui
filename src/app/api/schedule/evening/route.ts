import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { getScheduledServers, runEveningWorkflow } from '@/modules/inventory/schedule-actions';

export const dynamic = 'force-dynamic';

/**
 * Evening cron route — poweroff → snapshot → delete old snapshot → delete server.
 *
 * Called by Cloudflare Cron Trigger. The cron worker fetches this URL with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Manual test:
 *   curl -X GET https://devboxui.com/api/schedule/evening \
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

  const results: Array<{
    serverId: string;
    userEmail: string;
    success: boolean;
    message: string;
    snapshotId?: number;
  }> = [];

  const scheduledServers = await getScheduledServers();

  for (const { server, schedule, userEmail } of scheduledServers) {
    // Only fire if the scheduled snapshot time matches the current local hour
    const nowUtc = new Date();
    const localStr = nowUtc.toLocaleString('en-US', {
      timeZone: schedule.timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [localH] = localStr.split(':').map(Number);
    const [targetH] = schedule.snapshotTime.split(':').map(Number);

    if (localH !== targetH) {
      results.push({
        serverId: server.id,
        userEmail,
        success: true,
        message: `Skipped — not time yet (local: ${localStr}, target: ${schedule.snapshotTime})`
      });
      continue;
    }

    try {
      const result = await runEveningWorkflow(server.id, userEmail);
      results.push({ serverId: server.id, userEmail, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron Evening] Failed for ${server.id}:`, msg);
      results.push({ serverId: server.id, userEmail, success: false, message: msg });
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    processed: results.length,
    results
  });
}
