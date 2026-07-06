'use server';

import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { HetznerApiService } from '@/lib/hetzner-api';
import { DigitalOceanApiService } from '@/lib/digitalocean-api';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { ScheduleConfig, ServerConfig } from './types';
import { getUserSettings, syncAllDependentPolicies, getNetworkZone, getServerKeyAndConfig, getOrgSettings } from './actions';

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
  const resolved = await getServerKeyAndConfig(kv, userEmail, serverId);
  if (resolved) {
    const { key: actualServerKey, config: server } = resolved;
    server.scheduleConfig = config;
    server.updatedAt = new Date().toISOString();
    await kv.put(actualServerKey, JSON.stringify(server));
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
  hetznerApi: HetznerApiService | null,
  doApi: DigitalOceanApiService | null,
  schedConfig: ScheduleConfig,
  userSSHKey: string,
  managementKey: string
): Promise<(number | string)[]> {
  if (schedConfig.sshKeyIds && schedConfig.sshKeyIds.length > 0) {
    return schedConfig.sshKeyIds;
  }
  // Auto-discover from provider account
  try {
    if (doApi) {
      const keys = await doApi.getSSHKeys();
      const ids: (number | string)[] = [];
      for (const key of keys) {
        const trimmed = key.public_key.trim().split(' ').slice(0, 2).join(' ');
        if (userSSHKey && userSSHKey.trim().includes(trimmed)) ids.push(key.id);
        else if (managementKey && managementKey.trim().includes(trimmed)) ids.push(key.id);
      }
      return ids.length > 0 ? ids : [];
    } else if (hetznerApi) {
      const keys = await hetznerApi.getSSHKeys();
      const ids: number[] = [];
      for (const key of keys) {
        const trimmed = key.public_key.trim().split(' ').slice(0, 2).join(' ');
        if (userSSHKey && userSSHKey.trim().includes(trimmed)) ids.push(key.id);
        else if (managementKey && managementKey.trim().includes(trimmed)) ids.push(key.id);
      }
      return ids.length > 0 ? ids : [];
    }
    return [];
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

  // 3. Skip weekends
  if (sched.skipWeekends) {
    const dayOfWeekStr = nowUtc.toLocaleDateString('en-US', { timeZone: sched.timezone || 'UTC', weekday: 'long' });
    if (dayOfWeekStr === 'Saturday' || dayOfWeekStr === 'Sunday') {
      return { paused: true, reason: `today is weekend (${dayOfWeekStr})` };
    }
  }

  return { paused: false };
}


export async function runMorningWorkflow(
  serverId: string,
  userEmail: string,
  isManual?: boolean,
  customSnapshotId?: number,
  customServerType?: string
): Promise<{ success: boolean; message: string; newServerId?: number; ip?: string }> {
  try {
    const env = await getCloudflareEnv();
    const kv = env.KV;
    if (!kv) throw new Error('KV database missing.');

  // 1. Load KV server record first
  const resolved = await getServerKeyAndConfig(kv, userEmail, serverId);
  if (!resolved) return { success: false, message: 'Server KV record not found.' };
  const { key: actualServerKey, config: server } = resolved;

  // 2. Resolve provider API token and SSH Key
  let hetznerToken = env.HETZNER_API_TOKEN;
  let digitalOceanToken = env.CLOUDFLARE_API_TOKEN; // fallback
  let userSshKey = '';
  if (server.orgId) {
    const orgSettings = await getOrgSettings(server.orgId);
    if (orgSettings?.hetznerToken) {
      hetznerToken = orgSettings.hetznerToken;
    }
    if (orgSettings?.digitalOceanToken) {
      digitalOceanToken = orgSettings.digitalOceanToken;
    }
  }
  if (userEmail) {
    const settings = await getUserSettings(userEmail);
    userSshKey = settings?.sshPublicKey || '';
    if (!hetznerToken) {
      hetznerToken = settings?.hetznerToken;
    }
    if (settings?.digitalOceanToken) {
      digitalOceanToken = settings.digitalOceanToken;
    }
  }

  const isDO = server.provider === 'digitalocean';
  if (isDO && !digitalOceanToken) throw new Error('DigitalOcean API Token missing.');
  if (!isDO && !hetznerToken) throw new Error('Hetzner API Token missing.');

  const hetznerApi = isDO ? null : new HetznerApiService(env, hetznerToken);
  const doApi = isDO ? new DigitalOceanApiService(env, digitalOceanToken) : null;

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

  // Check if server is already running
  if (isDO) {
    if (server.digitalOceanDropletId && doApi) {
      try {
        const d = await doApi.getDroplet(server.digitalOceanDropletId);
        if (d.status === 'active') {
          return { success: true, message: `Droplet already active (ID: ${server.digitalOceanDropletId}).` };
        }
      } catch {
        // proceed
      }
    }
  } else {
    if (server.hetznerServerId && hetznerApi) {
      try {
        const currentStatus = await hetznerApi.getServerStatus(server.hetznerServerId);
        if (currentStatus === 'running') {
          return { success: true, message: `Server already running (Hetzner ID: ${server.hetznerServerId}).` };
        }
      } catch {
        // proceed
      }
    }
  }

  const snapshotToRestore = customSnapshotId || sched.latestSnapshotId;
  if (!snapshotToRestore) {
    return { success: false, message: 'No snapshot available to restore from. Evening workflow must run first.' };
  }

  // Resolve SSH keys
  const sshKeyIds = await resolveSSHKeyIds(
    hetznerApi,
    doApi,
    sched,
    userSshKey,
    env.MANAGEMENT_SSH_PUBLIC_KEY || ''
  );

  // Generate bootstrap script to ensure correct tunnel/hostname mapping on boot
  let bootstrapScript: string | undefined = undefined;
  try {
    const cfApi = new CloudflareApiService(env);
    const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
    const callbackUrl = `${requestHost}/api/provisioning/status`;
    const serviceToken = await cfApi.getOrCreateServiceToken(kv);
    await cfApi.authorizeServiceToken(requestHost.replace('https://', ''), serviceToken.id);

    // Import the script generator dynamically to avoid circular references
    const { getHetznerBootstrapScript } = await import('./actions');

    bootstrapScript = await getHetznerBootstrapScript(
      server.userName,
      server.userEmail || userEmail,
      serverId,
      server.provisioningToken || crypto.randomUUID(),
      callbackUrl,
      serviceToken.id,
      serviceToken.client_secret,
      server.tunnelToken
    );
  } catch (err) {
    console.error("[Morning] Failed to generate bootstrap script for snapshot restore:", err);
  }

  // Create server from snapshot
  const serverName = (server.hostname || `devbox-${serverId.slice(0, 8)}`)
    .replace('.devboxui.com', '')
    .replace('-direct', '');
  console.log(`[Morning] Creating server "${serverName}" from snapshot ${snapshotToRestore}…`);

  let newHetznerServerId: number | undefined;
  let newDropletId: number | undefined;
  let ip = 'pending';
  let actionId: number;

  if (isDO) {
    const doResult = await doApi!.createDroplet(
      serverName,
      sched.location,
      customServerType || sched.serverType,
      snapshotToRestore,
      sshKeyIds,
      bootstrapScript || ''
    );
    newDropletId = doResult.droplet.id;
    actionId = doResult.links?.actions?.[0]?.id || 999999;
  } else {
    const result = await hetznerApi!.createServerFromSnapshot(
      serverName,
      snapshotToRestore,
      customServerType || sched.serverType,
      sched.location,
      sshKeyIds,
      bootstrapScript
    );
    newHetznerServerId = result.server.id;
    ip = result.server.public_net.ipv4.ip;
    actionId = result.action.id;
  }

  // Construct serverSpecs
  if (isDO) {
    const specsParts = [
      (customServerType || sched.serverType || '').toUpperCase(),
      'X86',
      sched.location.toUpperCase()
    ];
    server.serverSpecs = specsParts.join(' | ');
  } else {
    const result = await hetznerApi!.getServer(newHetznerServerId!);
    const arch = result.server_type.architecture || 'x86';
    const disk = result.server_type.disk ? `${result.server_type.disk} GB` : '';
    const zone = await getNetworkZone(result.datacenter?.location?.name);
    const specsParts = [
      result.server_type.name.toUpperCase(),
      arch,
      disk,
      zone
    ].filter(Boolean);
    server.serverSpecs = specsParts.join(' | ');
  }

  // Try to resolve DO droplet IP immediately if possible
  if (isDO && newDropletId) {
    try {
      const activeDroplet = await doApi!.waitForDropletStatus(newDropletId, 'active', 10000, 2000);
      const publicIp = activeDroplet.networks.v4?.find(n => n.type === 'public')?.ip_address;
      if (publicIp) {
        ip = publicIp;
      }
    } catch {
      // droplet active check deferred to pending creates sweep
    }
  }

  // Update Direct SSH DNS A record in Cloudflare
  if (server.hostname && ip !== 'pending') {
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
  if (isDO) {
    server.digitalOceanDropletId = newDropletId;
  } else {
    server.hetznerServerId = newHetznerServerId;
    server.hetznerStatus = 'starting';
  }
  server.ip = ip;
  server.status = 'initializing';
  server.detailedStatus = 'Initializing (0%)';
  server.pendingCreateActionId = actionId;
  server.updatedAt = new Date().toISOString();
  if (server.scheduleConfig) {
    server.scheduleConfig.lastMorningRun = new Date().toISOString();
    server.scheduleConfig.lastRunStatus = 'success';
  }
  // Persist updated schedule config
  sched.lastMorningRun = new Date().toISOString();
  sched.lastRunStatus = 'success';
  await kv.put(scheduleKey(userEmail, serverId), JSON.stringify(sched));
  await kv.put(actualServerKey, JSON.stringify(server));

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
  } catch (error: unknown) {
    console.error("[runMorningWorkflow] Execution failed:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
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
  try {
    const env = await getCloudflareEnv();
    const kv = env.KV;
    if (!kv) throw new Error('KV database missing.');

  // 1. Load KV server record first
  const resolved = await getServerKeyAndConfig(kv, userEmail, serverId);
  if (!resolved) return { success: false, message: 'Server KV record not found.' };
  const { key: actualServerKey, config: server } = resolved;

  // 2. Resolve provider API token
  let hetznerToken = env.HETZNER_API_TOKEN;
  let digitalOceanToken = env.CLOUDFLARE_API_TOKEN; // fallback
  if (server.orgId) {
    const orgSettings = await getOrgSettings(server.orgId);
    if (orgSettings?.hetznerToken) {
      hetznerToken = orgSettings.hetznerToken;
    }
    if (orgSettings?.digitalOceanToken) {
      digitalOceanToken = orgSettings.digitalOceanToken;
    }
  }
  if (userEmail) {
    const settings = await getUserSettings(userEmail);
    if (!hetznerToken) {
      hetznerToken = settings?.hetznerToken;
    }
    if (settings?.digitalOceanToken) {
      digitalOceanToken = settings.digitalOceanToken;
    }
  }

  const isDO = server.provider === 'digitalocean';
  if (isDO && !digitalOceanToken) throw new Error('DigitalOcean API Token missing.');
  if (!isDO && !hetznerToken) throw new Error('Hetzner API Token missing.');

  const hetznerApi = isDO ? null : new HetznerApiService(env, hetznerToken);
  const doApi = isDO ? new DigitalOceanApiService(env, digitalOceanToken) : null;

  if (isDO && !server.digitalOceanDropletId) {
    return { success: false, message: 'No DigitalOcean droplet ID on record — nothing to snapshot.' };
  }
  if (!isDO && !server.hetznerServerId) {
    return { success: false, message: 'No Hetzner server ID on record — nothing to snapshot.' };
  }

  const schedData = await kv.get(scheduleKey(userEmail, serverId));
  let sched: ScheduleConfig;
  if (schedData) {
    sched = JSON.parse(schedData) as ScheduleConfig;
  } else {
    try {
      if (isDO) {
        const hs = await doApi!.getDroplet(server.digitalOceanDropletId!);
        sched = {
          enabled: false,
          timezone: 'Europe/Bucharest',
          spinupTime: '09:00',
          snapshotTime: '18:00',
          serverType: hs.size_slug || 's-2vcpu-4gb',
          location: hs.region?.slug || 'nyc1',
        };
      } else {
        const hs = await hetznerApi!.getServer(server.hetznerServerId!);
        sched = {
          enabled: false,
          timezone: 'Europe/Bucharest',
          spinupTime: '09:00',
          snapshotTime: '18:00',
          serverType: hs.server_type?.name || 'cpx21',
          location: hs.datacenter?.location?.name || 'nbg1',
        };
      }
    } catch (e) {
      return { success: false, message: `Failed to fetch server details from API: ${e instanceof Error ? e.message : String(e)}` };
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

  console.log(`[Evening] Starting evening workflow for server ${server.hostname || server.ip}…`);

  // ── Step 1: Power off ─────────────────────────────────────────────────────
  const currentStatus = isDO 
    ? (await doApi!.getDroplet(server.digitalOceanDropletId!)).status 
    : (await hetznerApi!.getServerStatus(server.hetznerServerId!));
  if (currentStatus !== 'off') {
    console.log(`[Evening] Initiating graceful shutdown for server (currently: ${currentStatus})…`);
    try {
      if (isDO) {
        await doApi!.shutdownDroplet(server.digitalOceanDropletId!);
        await doApi!.waitForDropletStatus(server.digitalOceanDropletId!, 'off', 45_000, 5_000);
      } else {
        await hetznerApi!.shutdownServer(server.hetznerServerId!);
        await hetznerApi!.waitForServerStatus(server.hetznerServerId!, 'off', 45_000, 5_000);
      }
      console.log(`[Evening] Server gracefully shut down.`);
    } catch (err) {
      console.log(`[Evening] Graceful shutdown failed or timed out: ${err instanceof Error ? err.message : String(err)}. Falling back to hard poweroff…`);
      try {
        if (isDO) {
          await doApi!.poweroffDroplet(server.digitalOceanDropletId!);
          await doApi!.waitForDropletStatus(server.digitalOceanDropletId!, 'off', 120_000, 5_000);
        } else {
          await hetznerApi!.poweroffServer(server.hetznerServerId!);
          await hetznerApi!.waitForServerStatus(server.hetznerServerId!, 'off', 120_000, 5_000);
        }
        console.log(`[Evening] Server forced OFF.`);
      } catch (forceErr) {
        console.error(`[Evening] Hard poweroff also failed:`, forceErr);
        throw new Error(`Failed to power off server even with hard poweroff.`);
      }
    }
  } else {
    console.log(`[Evening] Server already OFF.`);
  }

  // ── Step 2: Create snapshot (Non-blocking) ────────────────────────────────
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const cleanServerName = (server.hostname || `devbox-${serverId.slice(0, 8)}`)
    .replace('.devboxui.com', '')
    .replace('-code', '')
    .replace('-direct', '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();

  const baseDescription = `${cleanServerName}--${YYYY}-${MM}-${DD}-${hh}-${mm}-${ss}`;
  const snapshotDescription = customPrefix ? `${customPrefix.toLowerCase().replace(/[^a-z0-9-]/g, '')}--${baseDescription}` : baseDescription;
  const snapshotLabel = { 'devbox-server-id': serverId, 'devbox-auto': 'true' };

  console.log(`[Evening] Creating snapshot "${snapshotDescription}"…`);
  let snapshotImageId: number;
  let snapshotActionId: number;

  if (isDO) {
    const res = await doApi!.createSnapshot(server.digitalOceanDropletId!, snapshotDescription);
    snapshotImageId = 999999;
    snapshotActionId = res.action.id;
  } else {
    const { image: snapshotImage, action: snapshotAction } = await hetznerApi!.createSnapshot(server.hetznerServerId!, snapshotDescription, snapshotLabel);
    snapshotImageId = snapshotImage.id;
    snapshotActionId = snapshotAction.id;
  }
  console.log(`[Evening] Snapshot action ${snapshotActionId} initiated.`);

  // Update server state and store pending snapshot details
  server.status = 'snapshotting';
  server.detailedStatus = 'Saving snapshot (0%)';
  server.pendingSnapshotId = snapshotImageId;
  server.pendingSnapshotActionId = snapshotActionId;
  server.pendingSnapshotDescription = snapshotDescription;
  server.pendingSnapshotDate = `${YYYY}-${MM}-${DD}`;
  server.updatedAt = new Date().toISOString();

  if (sched) {
    sched.lastEveningRun = new Date().toISOString();
    sched.lastRunStatus = 'running';
    sched.lastRunError = undefined;
    server.scheduleConfig = sched;
    await kv.put(scheduleKey(userEmail, serverId), JSON.stringify(sched));
  }
  await kv.put(actualServerKey, JSON.stringify(server));

    return {
      success: true,
      message: `Evening workflow initiated. Snapshot action ${snapshotActionId} started.`,
      snapshotId: snapshotImageId
    };
  } catch (error: unknown) {
    console.error("[runEveningWorkflow] Execution failed:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual trigger server actions (called from UI buttons)
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerMorningSpinup(serverId: string, customSnapshotId?: number, customServerType?: string) {
  const userEmail = await getIdentity();
  return runMorningWorkflow(serverId, userEmail, true, customSnapshotId, customServerType);
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

export async function processPendingSnapshot(
  server: ServerConfig,
  actualServerKey: string,
  userEmail: string,
  kv: KVNamespace,
  hetznerApi: HetznerApiService | null,
  doApi?: DigitalOceanApiService | null
): Promise<ServerConfig> {
  if (!server.pendingSnapshotId || !server.pendingSnapshotActionId) {
    return server;
  }

  const actionId = server.pendingSnapshotActionId;
  const snapshotId = server.pendingSnapshotId;
  const isDO = server.provider === 'digitalocean';

  try {
    console.log(`[processPendingSnapshot] Checking action ${actionId} for server ${server.id}…`);
    const actionStatus = isDO 
      ? (await doApi!.getAction(actionId)).status 
      : (await hetznerApi!.getAction(actionId)).status;
    const progress = isDO ? (actionStatus === 'completed' ? 100 : 50) : (await hetznerApi!.getAction(actionId)).progress || 0;
    console.log(`[processPendingSnapshot] Action status: ${actionStatus}, progress: ${progress}%`);

    const now = new Date().toISOString();
    if (actionStatus === 'in-progress' || actionStatus === 'running') {
      server.status = 'snapshotting';
      server.detailedStatus = `Saving snapshot (${progress}%)`;
      server.updatedAt = now;
      await kv.put(actualServerKey, JSON.stringify(server));
    } else if (actionStatus === 'completed' || actionStatus === 'success') {
      console.log(`[processPendingSnapshot] Snapshot action succeeded. Cleaning up VM and old snapshots…`);

      // Load schedule config
      const schedData = await kv.get(scheduleKey(userEmail, server.id));
      let sched: ScheduleConfig;
      if (schedData) {
        sched = JSON.parse(schedData) as ScheduleConfig;
      } else {
        sched = {
          enabled: false,
          timezone: 'Europe/Bucharest',
          spinupTime: '09:00',
          snapshotTime: '18:00',
          serverType: server.serverType || 's-2vcpu-4gb',
          location: 'nyc1',
        };
      }

      let realSnapshotId = snapshotId;
      if (isDO && snapshotId === 999999) {
        try {
          const allPrivate = await doApi!.getImages('private');
          const found = allPrivate.find(img => img.name === server.pendingSnapshotDescription);
          if (found) {
            realSnapshotId = found.id;
            console.log(`[processPendingSnapshot] Resolved DigitalOcean snapshot ID: ${realSnapshotId}`);
          }
        } catch (e) {
          console.warn("Failed to auto-resolve DO snapshot ID from name:", e);
        }
      }

      // Delete old snapshot
      const previousSnapshotId = sched.latestSnapshotId;
      if (previousSnapshotId && previousSnapshotId !== realSnapshotId) {
        try {
          console.log(`[processPendingSnapshot] Deleting old snapshot ${previousSnapshotId}…`);
          if (isDO) {
            await doApi!.deleteSnapshot(previousSnapshotId);
          } else {
            await hetznerApi!.deleteSnapshot(previousSnapshotId);
          }
        } catch (e) {
          console.warn(`[processPendingSnapshot] Failed to delete old snapshot ${previousSnapshotId}:`, e);
        }
      }

      // Sweep orphan snapshots (Hetzner only, since DO doesn't support tags/labels filtering easily)
      if (!isDO) {
        try {
          const orphans = await hetznerApi!.getSnapshots(`devbox-server-id=${server.id}`);
          for (const orphan of orphans) {
            if (orphan.id !== realSnapshotId) {
              console.log(`[processPendingSnapshot] Sweeping orphan snapshot ${orphan.id}…`);
              await hetznerApi!.deleteSnapshot(orphan.id).catch(() => {});
            }
          }
        } catch (e) {
          console.warn(`[processPendingSnapshot] Orphan sweep failed:`, e);
        }
      }

      // Delete the provider VM
      if (isDO && server.digitalOceanDropletId) {
        try {
          console.log(`[processPendingSnapshot] Deleting DigitalOcean Droplet ${server.digitalOceanDropletId}…`);
          await doApi!.deleteDroplet(server.digitalOceanDropletId);
        } catch (e) {
          console.error(`[processPendingSnapshot] Failed to delete Droplet ${server.digitalOceanDropletId}:`, e);
        }
      } else if (!isDO && server.hetznerServerId) {
        try {
          console.log(`[processPendingSnapshot] Deleting Hetzner server ${server.hetznerServerId}…`);
          await hetznerApi!.deleteServer(server.hetznerServerId);
        } catch (e) {
          console.error(`[processPendingSnapshot] Failed to delete server ${server.hetznerServerId}:`, e);
        }
      }

      // Update schedule config
      sched.latestSnapshotId = realSnapshotId;
      sched.latestSnapshotDate = server.pendingSnapshotDate || new Date().toISOString().slice(0, 10);
      sched.latestSnapshotDescription = server.pendingSnapshotDescription || '';
      sched.lastEveningRun = new Date().toISOString();
      sched.lastRunStatus = 'success';
      sched.lastRunError = undefined;
      await kv.put(scheduleKey(userEmail, server.id), JSON.stringify(sched));

      // Update server record
      server.hetznerServerId = undefined;
      server.hetznerStatus = undefined;
      server.digitalOceanDropletId = undefined;
      server.ip = 'pending';
      server.status = 'off';
      server.detailedStatus = 'Server is off';
      server.scheduleConfig = sched;
      
      // Clear pending fields
      server.pendingSnapshotId = undefined;
      server.pendingSnapshotActionId = undefined;
      server.pendingSnapshotDescription = undefined;
      server.pendingSnapshotDate = undefined;
      server.updatedAt = new Date().toISOString();

      await kv.put(actualServerKey, JSON.stringify(server));
      console.log(`[processPendingSnapshot] Server ${server.id} cleanup complete.`);
    } else if (actionStatus === 'error' || actionStatus === 'errored') {
      const errMsg = 'snapshot action failed';
      console.error(`[processPendingSnapshot] Snapshot action ${actionId} failed`);

      // Load schedule config
      const schedData = await kv.get(scheduleKey(userEmail, server.id));
      let sched: ScheduleConfig | undefined;
      if (schedData) {
        sched = JSON.parse(schedData) as ScheduleConfig;
        sched.lastEveningRun = new Date().toISOString();
        sched.lastRunStatus = 'error';
        sched.lastRunError = `Snapshot action failed: ${errMsg}`;
        await kv.put(scheduleKey(userEmail, server.id), JSON.stringify(sched));
      }

      // Reset server status
      server.status = 'ready';
      server.detailedStatus = `Snapshot failed: ${errMsg}`;
      if (sched) {
        server.scheduleConfig = sched;
      }

      // Clear pending fields
      server.pendingSnapshotId = undefined;
      server.pendingSnapshotActionId = undefined;
      server.pendingSnapshotDescription = undefined;
      server.pendingSnapshotDate = undefined;
      server.updatedAt = new Date().toISOString();

      await kv.put(actualServerKey, JSON.stringify(server));
    }
  } catch (err) {
    console.error(`[processPendingSnapshot] Failed checking action ${actionId}:`, err);
  }

  return server;
}

export async function processPendingCreate(
  server: ServerConfig,
  actualServerKey: string,
  userEmail: string,
  kv: KVNamespace,
  hetznerApi: HetznerApiService | null,
  doApi?: DigitalOceanApiService | null
): Promise<ServerConfig> {
  const isDO = server.provider === 'digitalocean';
  if (isDO) {
    if (server.status !== 'initializing') {
      return server;
    }
    if (!server.digitalOceanDropletId) {
      return server;
    }
    try {
      console.log(`[processPendingCreate] Checking DigitalOcean droplet ${server.digitalOceanDropletId} status...`);
      const droplet = await doApi!.getDroplet(server.digitalOceanDropletId);
      console.log(`[processPendingCreate] Droplet status: ${droplet.status}`);
      
      const now = new Date().toISOString();
      if (droplet.status === 'new') {
        server.status = 'initializing';
        server.detailedStatus = 'Initializing (Droplet creating...)';
        server.updatedAt = now;
        await kv.put(actualServerKey, JSON.stringify(server));
      } else if (droplet.status === 'active') {
        const publicIp = droplet.networks.v4?.find(n => n.type === 'public')?.ip_address;
        if (publicIp) {
          server.ip = publicIp;
          const env = await getCloudflareEnv();
          const cfApi = new CloudflareApiService(env);
          const directHostname = server.hostname?.replace('-code.', '.').replace('-direct', '');
          if (directHostname) {
            console.log(`[processPendingCreate] Active Droplet IP: ${publicIp}. Updating DNS...`);
            await cfApi.setupARecord(directHostname, publicIp).catch(() => {});
          }
        }
        server.pendingCreateActionId = undefined;
        server.status = 'ready';
        server.detailedStatus = 'Ready';
        server.updatedAt = now;
        await kv.put(actualServerKey, JSON.stringify(server));
        triggerOnStartCommands(server);
      } else if (droplet.status === 'archive' || droplet.status === 'off') {
        server.pendingCreateActionId = undefined;
        server.status = 'error';
        server.detailedStatus = `Initialization failed (Status: ${droplet.status})`;
        server.updatedAt = now;
        await kv.put(actualServerKey, JSON.stringify(server));
      }
    } catch (err) {
      console.error(`[processPendingCreate] Failed to poll DO droplet ${server.digitalOceanDropletId}:`, err);
    }
    return server;
  }

  if (!server.pendingCreateActionId) {
    return server;
  }

  const actionId = server.pendingCreateActionId;

  try {
    console.log(`[processPendingCreate] Checking Hetzner create action ${actionId} for server ${server.id}…`);
    const action = await hetznerApi!.getAction(actionId);
    console.log(`[processPendingCreate] Action status: ${action.status}, progress: ${action.progress}%`);

    const now = new Date().toISOString();
    if (action.status === 'running') {
      const progress = action.progress || 0;
      server.status = 'initializing';
      server.detailedStatus = `Initializing (${progress}%)`;
      server.updatedAt = now;
      await kv.put(actualServerKey, JSON.stringify(server));
    } else if (action.status === 'success') {
      console.log(`[processPendingCreate] Create action ${actionId} succeeded.`);
      server.pendingCreateActionId = undefined;
      server.status = 'ready';
      server.detailedStatus = 'Ready';
      server.updatedAt = now;
      await kv.put(actualServerKey, JSON.stringify(server));
      triggerOnStartCommands(server);
    } else if (action.status === 'error') {
      console.error(`[processPendingCreate] Create action ${actionId} failed.`);
      server.pendingCreateActionId = undefined;
      server.status = 'error';
      server.detailedStatus = 'Initialization failed';
      server.updatedAt = now;
      await kv.put(actualServerKey, JSON.stringify(server));
    }
  } catch (err) {
    console.error(`[processPendingCreate] Failed to process pending create action ${actionId}:`, err);
  }

  return server;
}

export async function processAllPendingCreates(kv: KVNamespace) {
  console.log('[processAllPendingCreates] Scanning KV for servers with pending creations...');
  const list = await kv.list({ prefix: 'servers:' });
  let count = 0;
  for (const key of list.keys) {
    const data = await kv.get(key.name);
    if (!data) continue;

    let server: ServerConfig;
    try {
      server = JSON.parse(data) as ServerConfig;
    } catch {
      continue;
    }

    const isDO = server.provider === 'digitalocean';
    const isPending = server.pendingCreateActionId || (isDO && server.status === 'initializing');

    if (isPending) {
      count++;
      const userEmail = server.userEmail;

      try {
        const env = await getCloudflareEnv();
        let hetznerToken = env.HETZNER_API_TOKEN;
        let digitalOceanToken = env.CLOUDFLARE_API_TOKEN; // fallback
        if (server.orgId) {
          const orgSettings = await getOrgSettings(server.orgId);
          if (orgSettings?.hetznerToken) {
            hetznerToken = orgSettings.hetznerToken;
          }
          if (orgSettings?.digitalOceanToken) {
            digitalOceanToken = orgSettings.digitalOceanToken;
          }
        }
        const settings = await getUserSettings(userEmail);
        if (!hetznerToken && settings?.hetznerToken) {
          hetznerToken = settings.hetznerToken;
        }
        if (settings?.digitalOceanToken) {
          digitalOceanToken = settings.digitalOceanToken;
        }

        const hetznerApi = isDO ? null : new HetznerApiService(env, hetznerToken);
        const doApi = isDO ? new DigitalOceanApiService(env, digitalOceanToken) : null;
        await processPendingCreate(server, key.name, userEmail, kv, hetznerApi, doApi);
      } catch (err) {
        console.error(`[processAllPendingCreates] Failed to process pending create for ${server.id}:`, err);
      }
    }
  }
  console.log(`[processAllPendingCreates] Finished processing ${count} pending creations.`);
}

export async function processAllPendingSnapshots(kv: KVNamespace) {
  console.log('[processAllPendingSnapshots] Scanning KV for servers with pending snapshots...');
  const list = await kv.list({ prefix: 'servers:' });
  let count = 0;
  for (const key of list.keys) {
    const data = await kv.get(key.name);
    if (!data) continue;
    
    let server: ServerConfig;
    try {
      server = JSON.parse(data) as ServerConfig;
    } catch {
      continue;
    }
    
    if (server.pendingSnapshotId && server.pendingSnapshotActionId) {
      count++;
      const userEmail = server.userEmail;
      
      try {
        const env = await getCloudflareEnv();
        let hetznerToken = env.HETZNER_API_TOKEN;
        let digitalOceanToken = env.CLOUDFLARE_API_TOKEN; // fallback
        if (server.orgId) {
          const orgSettings = await getOrgSettings(server.orgId);
          if (orgSettings?.hetznerToken) {
            hetznerToken = orgSettings.hetznerToken;
          }
          if (orgSettings?.digitalOceanToken) {
            digitalOceanToken = orgSettings.digitalOceanToken;
          }
        }
        const settings = await getUserSettings(userEmail);
        if (!hetznerToken && settings?.hetznerToken) {
          hetznerToken = settings.hetznerToken;
        }
        if (settings?.digitalOceanToken) {
          digitalOceanToken = settings.digitalOceanToken;
        }

        const isDO = server.provider === 'digitalocean';
        const hetznerApi = isDO ? null : new HetznerApiService(env, hetznerToken);
        const doApi = isDO ? new DigitalOceanApiService(env, digitalOceanToken) : null;
        await processPendingSnapshot(server, key.name, userEmail, kv, hetznerApi, doApi);
      } catch (err) {
        console.error(`[processAllPendingSnapshots] Failed to process pending snapshot for ${server.id}:`, err);
      }
    }
  }
  console.log(`[processAllPendingSnapshots] Finished processing ${count} pending snapshots.`);
}

export async function triggerOnStartCommands(server: ServerConfig) {
  if (!server.projects || server.projects.length === 0) return;
  const hasDdevStart = server.projects.some(p => p.startDdev);
  if (!hasDdevStart) return;

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return;

  const logsUrl = server.tunnelUrl?.split('?')[0].replace('-code.', '-logs.') || `https://logs-${server.id.slice(0, 8)}.devboxui.com`;

  const runLoop = async () => {
    try {
      const cfApi = new CloudflareApiService(env);
      const serviceToken = await cfApi.getOrCreateServiceToken(kv);

      let success = false;
      let retries = 0;
      const maxRetries = 25; // 25 * 4s = 100 seconds max wait

      while (!success && retries < maxRetries) {
        try {
          const resp = await fetch(logsUrl, {
            headers: {
              'CF-Access-Client-Id': serviceToken.id,
              'CF-Access-Client-Secret': serviceToken.client_secret,
            },
            next: { revalidate: 0 },
            cache: 'no-store'
          });
          if (resp.ok) {
            success = true;
            break;
          }
        } catch {
          // VM not booted or tunnel not active yet
        }
        retries++;
        await new Promise(resolve => setTimeout(resolve, 4000));
      }

      if (!success) {
        console.warn(`[StartCommands] Timeout waiting for VM exporter to respond at ${logsUrl}`);
        return;
      }

      // Exporter is ready! Trigger DDEV start commands
      const username = server.userName || 'root';
      for (const project of server.projects!) {
        if (project.startDdev) {
          console.log(`[StartCommands] Triggering ddev start for project ${project.name} as ${username}...`);
          await fetch(`${logsUrl}/ddev-start`, {
            method: 'POST',
            headers: {
              'CF-Access-Client-Id': serviceToken.id,
              'CF-Access-Client-Secret': serviceToken.client_secret,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ project: project.name, username }),
            next: { revalidate: 0 }
          }).catch(e => console.error(`[StartCommands] Failed to request ddev start for ${project.name}:`, e));
        }
      }
    } catch (err) {
      console.error("[StartCommands] Background run execution failed:", err);
    }
  };

  runLoop();
}
