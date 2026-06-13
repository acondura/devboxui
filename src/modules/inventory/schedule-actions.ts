'use server';

import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { HetznerApiService } from '@/lib/hetzner-api';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { ScheduleConfig, ServerConfig } from './types';
import { getUserSettings, syncAllDependentPolicies } from './actions';

// ─────────────────────────────────────────────────────────────────────────────
// KV key helpers
// ─────────────────────────────────────────────────────────────────────────────

function scheduleKey(userEmail: string, serverId: string) {
  return `schedule:${userEmail}:${serverId}`;
}

function serverKey(userEmail: string, serverId: string) {
  return `servers:${userEmail}:${serverId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get schedule configuration for a server
// ─────────────────────────────────────────────────────────────────────────────

export async function getScheduleConfig(serverId: string): Promise<ScheduleConfig | null> {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return null;

  const data = await kv.get(scheduleKey(userEmail, serverId));
  return data ? (JSON.parse(data) as ScheduleConfig) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Save schedule configuration for a server
// ─────────────────────────────────────────────────────────────────────────────

export async function saveScheduleConfig(
  serverId: string,
  config: ScheduleConfig
): Promise<{ success: boolean }> {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error('KV database missing.');

  await kv.put(scheduleKey(userEmail, serverId), JSON.stringify(config));

  // Also persist scheduleConfig inside the server record so getServers() surfaces it
  const sKey = serverKey(userEmail, serverId);
  const serverData = await kv.get(sKey);
  if (serverData) {
    const server = JSON.parse(serverData) as ServerConfig;
    server.scheduleConfig = config;
    server.updatedAt = new Date().toISOString();
    await kv.put(sKey, JSON.stringify(server));
  }

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers shared by cron routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the Hetzner SSH key IDs registered on the account that match the
 * user's public key (management key + user key).  Falls back to the stored
 * sshKeyIds from the schedule config.
 */
async function resolveSSHKeyIds(
  hetznerApi: HetznerApiService,
  schedConfig: ScheduleConfig,
  userSSHKey: string,
  managementKey: string
): Promise<number[]> {
  if (schedConfig.sshKeyIds && schedConfig.sshKeyIds.length > 0) {
    return schedConfig.sshKeyIds;
  }
  // Auto-discover from Hetzner account
  try {
    const keys = await hetznerApi.getSSHKeys();
    const ids: number[] = [];
    for (const key of keys) {
      const trimmed = key.public_key.trim().split(' ').slice(0, 2).join(' ');
      if (userSSHKey && userSSHKey.trim().includes(trimmed)) ids.push(key.id);
      else if (managementKey && managementKey.trim().includes(trimmed)) ids.push(key.id);
    }
    return ids.length > 0 ? ids : [];
  } catch {
    return [];
  }
}

/**
 * Returns { paused: true, reason } when the schedule should not run today.
 * Checks:
 *   1. pauseUntil — a hard pause until a specific date
 *   2. blockedDates — a set of individual skip days (vacation days)
 * All date comparisons are done in the server's configured timezone.
 */
function isSchedulePaused(
  sched: ScheduleConfig,
  nowUtc: Date = new Date()
): { paused: boolean; reason?: string } {
  // Get today's date string in the server's local timezone (YYYY-MM-DD)
  const localDateStr = nowUtc.toLocaleDateString('en-CA', { timeZone: sched.timezone || 'UTC' }); // en-CA gives YYYY-MM-DD

  // 1. Hard pause until a specific date
  if (sched.pauseUntil) {
    if (localDateStr <= sched.pauseUntil) {
      return { paused: true, reason: `Paused until ${sched.pauseUntil} (today: ${localDateStr})` };
    }
  }

  // 2. Blocked individual dates (vacation days)
  if (sched.blockedDates && sched.blockedDates.includes(localDateStr)) {
    return { paused: true, reason: `${localDateStr} is a blocked date` };
  }

  return { paused: false };
}


export async function runMorningWorkflow(
  serverId: string,
  userEmail: string,
  isManual?: boolean
): Promise<{ success: boolean; message: string; newServerId?: number; ip?: string }> {
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error('KV database missing.');

  const settings = await getUserSettings();
  const hetznerToken = settings?.hetznerToken || env.HETZNER_API_TOKEN;
  if (!hetznerToken) throw new Error('Hetzner API Token missing.');

  const hetznerApi = new HetznerApiService(env, hetznerToken);

  // Load schedule config
  const schedConfig = await kv.get(scheduleKey(userEmail, serverId));
  if (!schedConfig) return { success: false, message: 'No schedule config found for server.' };
  const sched = JSON.parse(schedConfig) as ScheduleConfig;
  if (!isManual && !sched.enabled) return { success: false, message: 'Schedule is disabled.' };

  // Check pause / vacation days
  if (!isManual) {
    const pauseCheck = isSchedulePaused(sched);
    if (pauseCheck.paused) {
      return { success: true, message: `Skipped: ${pauseCheck.reason}` };
    }
  }

  // Load KV server record
  const serverData = await kv.get(serverKey(userEmail, serverId));
  if (!serverData) return { success: false, message: 'Server KV record not found.' };
  const server = JSON.parse(serverData) as ServerConfig;

  // Check if a server is already running on Hetzner for this config
  if (server.hetznerServerId) {
    try {
      const currentStatus = await hetznerApi.getServerStatus(server.hetznerServerId);
      if (currentStatus === 'running') {
        return { success: true, message: `Server already running (Hetzner ID: ${server.hetznerServerId}).` };
      }
    } catch {
      // Server probably deleted; proceed to create
    }
  }

  if (!sched.latestSnapshotId) {
    return { success: false, message: 'No snapshot available to restore from. Evening workflow must run first.' };
  }

  // Resolve SSH keys
  const sshKeyIds = await resolveSSHKeyIds(
    hetznerApi,
    sched,
    settings?.sshPublicKey || '',
    env.MANAGEMENT_SSH_PUBLIC_KEY || ''
  );

  // Create server from snapshot
  const serverName = (server.hostname || `devbox-${serverId.slice(0, 8)}`)
    .replace('.devboxui.com', '')
    .replace('-direct', '');
  console.log(`[Morning] Creating server "${serverName}" from snapshot ${sched.latestSnapshotId}…`);

  const result = await hetznerApi.createServerFromSnapshot(
    serverName,
    sched.latestSnapshotId,
    sched.serverType,
    sched.location,
    sshKeyIds
  );

  const newHetznerServerId = result.server.id;
  const ip = result.server.public_net.ipv4.ip;

  // Update Direct SSH DNS A record in Cloudflare
  if (server.hostname) {
    try {
      const cfApi = new CloudflareApiService(env);
      const directHostname = server.hostname.replace('-code.', '.').replace('-direct', '');
      console.log(`[Morning] Updating Direct SSH DNS A record for ${directHostname} to ${ip}...`);
      await cfApi.setupARecord(directHostname, ip);
    } catch (err) {
      console.error("[Morning] Failed to update Direct SSH DNS A record:", err);
    }
  }

  // Update KV server record
  server.hetznerServerId = newHetznerServerId;
  server.hetznerStatus = 'starting';
  server.ip = ip;
  server.status = 'ready';
  server.detailedStatus = 'Ready';
  server.updatedAt = new Date().toISOString();
  if (server.scheduleConfig) {
    server.scheduleConfig.lastMorningRun = new Date().toISOString();
    server.scheduleConfig.lastRunStatus = 'success';
  }
  // Persist updated schedule config
  sched.lastMorningRun = new Date().toISOString();
  sched.lastRunStatus = 'success';
  await kv.put(scheduleKey(userEmail, serverId), JSON.stringify(sched));
  await kv.put(serverKey(userEmail, serverId), JSON.stringify(server));

  // Trigger policy sync for dependent servers (dynamic IP update)
  try {
    console.log(`[Morning Workflow] Server IP updated to ${ip}. Triggering dependent policy sync...`);
    await syncAllDependentPolicies(serverId, ip);
  } catch (err) {
    console.error("[Morning Workflow] Failed to sync dependent policies on spin-up:", err);
  }

  return {
    success: true,
    message: `Server created from snapshot. Hetzner ID: ${newHetznerServerId}, IP: ${ip}`,
    newServerId: newHetznerServerId,
    ip
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENING WORKFLOW — poweroff → snapshot → delete old → delete server
// ─────────────────────────────────────────────────────────────────────────────

export async function runEveningWorkflow(
  serverId: string,
  userEmail: string,
  isManual?: boolean,
  customPrefix?: string
): Promise<{ success: boolean; message: string; snapshotId?: number }> {
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error('KV database missing.');

  const settings = await getUserSettings();
  const hetznerToken = settings?.hetznerToken || env.HETZNER_API_TOKEN;
  if (!hetznerToken) throw new Error('Hetzner API Token missing.');

  const hetznerApi = new HetznerApiService(env, hetznerToken);

  const serverData = await kv.get(serverKey(userEmail, serverId));
  if (!serverData) return { success: false, message: 'Server KV record not found.' };
  const server = JSON.parse(serverData) as ServerConfig;

  if (!server.hetznerServerId) {
    return { success: false, message: 'No Hetzner server ID on record — nothing to snapshot.' };
  }

  const hetznerServerId = server.hetznerServerId;

  const schedData = await kv.get(scheduleKey(userEmail, serverId));
  let sched: ScheduleConfig;
  if (schedData) {
    sched = JSON.parse(schedData) as ScheduleConfig;
  } else {
    // If no schedule config exists, query the server details from Hetzner API to set defaults
    try {
      const hs = await hetznerApi.getServer(hetznerServerId);
      sched = {
        enabled: false,
        timezone: 'Europe/Bucharest',
        spinupTime: '09:00',
        snapshotTime: '18:00',
        serverType: hs.server_type.name,
        location: hs.datacenter.location.name,
      };
    } catch (e) {
      return { success: false, message: `Failed to fetch server details from Hetzner API: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (!isManual && !sched.enabled) return { success: false, message: 'Schedule is disabled.' };

  // Check pause / vacation days
  if (!isManual) {
    const pauseCheck = isSchedulePaused(sched);
    if (pauseCheck.paused) {
      return { success: true, message: `Skipped: ${pauseCheck.reason}` };
    }
  }

  console.log(`[Evening] Starting evening workflow for Hetzner server ${hetznerServerId}…`);

  // ── Step 1: Power off ─────────────────────────────────────────────────────
  const currentStatus = await hetznerApi.getServerStatus(hetznerServerId);
  if (currentStatus !== 'off') {
    console.log(`[Evening] Initiating graceful ACPI shutdown for server ${hetznerServerId} (currently: ${currentStatus})…`);
    try {
      await hetznerApi.shutdownServer(hetznerServerId);
      // Wait up to 45 seconds for graceful shutdown to finish
      await hetznerApi.waitForServerStatus(hetznerServerId, 'off', 45_000, 5_000);
      console.log(`[Evening] Server ${hetznerServerId} gracefully shut down.`);
    } catch (err) {
      console.log(`[Evening] Graceful shutdown failed or timed out: ${err instanceof Error ? err.message : String(err)}. Falling back to hard poweroff…`);
      try {
        await hetznerApi.poweroffServer(hetznerServerId);
        // Wait up to 2 minutes for hard poweroff
        await hetznerApi.waitForServerStatus(hetznerServerId, 'off', 120_000, 5_000);
        console.log(`[Evening] Server ${hetznerServerId} forced OFF.`);
      } catch (forceErr) {
        console.error(`[Evening] Hard poweroff also failed:`, forceErr);
        throw new Error(`Failed to power off server ${hetznerServerId} even with hard poweroff.`);
      }
    }
  } else {
    console.log(`[Evening] Server ${hetznerServerId} already OFF.`);
  }

  // ── Step 2: Create snapshot ───────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const baseDescription = `devbox-auto-${serverId.slice(0, 8)}-${date}`;
  const snapshotDescription = customPrefix ? `${customPrefix}-${baseDescription}` : baseDescription;
  const snapshotLabel = { 'devbox-server-id': serverId, 'devbox-auto': 'true' };

  console.log(`[Evening] Creating snapshot "${snapshotDescription}"…`);
  const snapshot = await hetznerApi.createSnapshot(hetznerServerId, snapshotDescription, snapshotLabel);
  console.log(`[Evening] Snapshot ${snapshot.id} created, waiting for it to be available…`);

  // Wait up to 10 minutes for the snapshot to be ready
  await hetznerApi.waitForSnapshot(snapshot.id, 600_000, 10_000);
  console.log(`[Evening] Snapshot ${snapshot.id} is available.`);

  // ── Step 3: Delete old snapshots ──────────────────────────────────────────
  const previousSnapshotId = sched.latestSnapshotId;
  if (previousSnapshotId && previousSnapshotId !== snapshot.id) {
    try {
      console.log(`[Evening] Deleting old snapshot ${previousSnapshotId}…`);
      await hetznerApi.deleteSnapshot(previousSnapshotId);
      console.log(`[Evening] Old snapshot ${previousSnapshotId} deleted.`);
    } catch (e) {
      console.warn(`[Evening] Failed to delete old snapshot ${previousSnapshotId}:`, e);
    }
  }

  // Also sweep any orphan snapshots with the same label (safety net)
  try {
    const orphans = await hetznerApi.getSnapshots(`devbox-server-id=${serverId}`);
    for (const orphan of orphans) {
      if (orphan.id !== snapshot.id) {
        console.log(`[Evening] Sweeping orphan snapshot ${orphan.id}…`);
        await hetznerApi.deleteSnapshot(orphan.id).catch(() => {});
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Step 4: Delete the Hetzner server (cost saving) ──────────────────────
  console.log(`[Evening] Deleting Hetzner server ${hetznerServerId}…`);
  await hetznerApi.deleteServer(hetznerServerId);
  console.log(`[Evening] Server ${hetznerServerId} deleted.`);

  // ── Step 5: Update KV records ─────────────────────────────────────────────
  sched.latestSnapshotId = snapshot.id;
  sched.latestSnapshotDate = date;
  sched.latestSnapshotDescription = snapshotDescription;
  sched.lastEveningRun = new Date().toISOString();
  sched.lastRunStatus = 'success';
  sched.lastRunError = undefined;
  await kv.put(scheduleKey(userEmail, serverId), JSON.stringify(sched));

  server.hetznerServerId = undefined;
  server.hetznerStatus = undefined;
  server.ip = 'pending';
  server.status = 'off';
  server.scheduleConfig = sched;
  server.updatedAt = new Date().toISOString();
  await kv.put(serverKey(userEmail, serverId), JSON.stringify(server));

  return {
    success: true,
    message: `Evening workflow complete. Snapshot ${snapshot.id} saved, server deleted.`,
    snapshotId: snapshot.id
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual trigger server actions (called from UI buttons)
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerMorningSpinup(serverId: string) {
  const userEmail = await getIdentity();
  return runMorningWorkflow(serverId, userEmail, true);
}

export async function triggerEveningSnapshot(serverId: string, customPrefix?: string) {
  const userEmail = await getIdentity();
  return runEveningWorkflow(serverId, userEmail, true, customPrefix);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get all servers with schedule enabled (used by cron routes)
// ─────────────────────────────────────────────────────────────────────────────

export async function getScheduledServers(): Promise<
  Array<{ server: ServerConfig; schedule: ScheduleConfig; userEmail: string }>
> {
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return [];

  // List all schedule keys
  const list = await kv.list({ prefix: 'schedule:' });
  const results: Array<{ server: ServerConfig; schedule: ScheduleConfig; userEmail: string }> = [];

  for (const key of list.keys) {
    const schedData = await kv.get(key.name);
    if (!schedData) continue;
    const sched = JSON.parse(schedData) as ScheduleConfig;
    if (!sched.enabled) continue;

    // Derive userEmail and serverId from key pattern "schedule:<email>:<serverId>"
    const parts = key.name.split(':');
    if (parts.length < 3) continue;
    const userEmail = parts[1];
    const serverId = parts.slice(2).join(':');

    const serverData = await kv.get(serverKey(userEmail, serverId));
    if (!serverData) continue;
    const server = JSON.parse(serverData) as ServerConfig;
    results.push({ server, schedule: sched, userEmail });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: determine if a cron event should fire for a given server's schedule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts HH:MM in a given timezone to current UTC hour+minute,
 * then checks if it matches the current UTC time (within a 1-hour window).
 */
export async function shouldFireNow(
  timeHHMM: string,
  timezone: string,
  nowUtc: Date = new Date()
): Promise<boolean> {
  try {
    // Get current local time in the target timezone
    const localStr = nowUtc.toLocaleString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    // localStr is "HH:MM" in 24h
    const [localH, localM] = localStr.split(':').map(Number);
    const [targetH] = timeHHMM.split(':').map(Number);
    // Fire if we're within the same hour (cron runs every hour on the dot)
    return localH === targetH && localM < 60;
  } catch {
    return false;
  }
}
