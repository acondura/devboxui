import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { getScheduledServers, runEveningWorkflow, processAllPendingSnapshots, processAllPendingCreates } from '@/modules/inventory/schedule-actions';
import { CloudflareApiService } from '@/lib/cloudflare-api';

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

  // Self-healing processing of any pending snapshots/creations
  const kv = env.KV;
  if (kv) {
    try {
      await processAllPendingSnapshots(kv);
    } catch (err) {
      console.error('[Cron Evening] Failed to process pending snapshots:', err);
    }
    try {
      await processAllPendingCreates(kv);
    } catch (err) {
      console.error('[Cron Evening] Failed to process pending creations:', err);
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
    // Inactivity Auto-Shutdown check
    if (schedule.shutdownAfterInactivity && server.status === 'ready') {
      try {
        const timeoutMinutes = schedule.inactivityDurationMinutes || 30;
        const timeoutSeconds = timeoutMinutes * 60;
        const logsUrl = server.tunnelUrl?.split('?')[0].replace('-code.', '-logs.') || `https://logs-${server.id.slice(0, 8)}.devboxui.com`;

        const cfApi = new CloudflareApiService(env);
        const serviceToken = await cfApi.getOrCreateServiceToken(kv);

        const resp = await fetch(logsUrl, {
          headers: {
            'CF-Access-Client-Id': serviceToken.id,
            'CF-Access-Client-Secret': serviceToken.client_secret,
          },
          next: { revalidate: 0 },
          cache: 'no-store'
        });

        if (resp.ok) {
          const data = await resp.json() as { idle_seconds?: number };
          if (typeof data.idle_seconds === 'number') {
            console.log(`[Cron Inactivity] Server ${server.id} (IP: ${server.ip}) idle for ${data.idle_seconds}s (limit: ${timeoutSeconds}s)`);
            if (data.idle_seconds >= timeoutSeconds) {
              console.log(`[Cron Inactivity] Idle limit exceeded. Shutting down server ${server.id}...`);
              const result = await runEveningWorkflow(server.id, userEmail);
              results.push({ serverId: server.id, userEmail, ...result, message: `Auto-shutdown due to inactivity (${timeoutMinutes}m): ${result.message}` });
              continue;
            }
          }
        }
      } catch (err) {
        console.error(`[Cron Inactivity] Failed checking inactivity for server ${server.id}:`, err);
      }
    }

    if (schedule.snapshotEnabled === false || !schedule.snapshotTime) {
      results.push({
        serverId: server.id,
        userEmail,
        success: true,
        message: 'Skipped — evening snapshot disabled for this server'
      });
      continue;
    }

    // Only fire if the scheduled snapshot time matches the current local hour
    const nowUtc = new Date();
    const localStr = nowUtc.toLocaleString('en-US', {
      timeZone: schedule.timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [localH, localM] = localStr.split(':').map(Number);
    const [targetH, targetM] = schedule.snapshotTime.split(':').map(Number);

    if (localH !== targetH || localM !== targetM) {
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
