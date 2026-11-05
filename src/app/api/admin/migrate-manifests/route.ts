import { NextResponse } from 'next/server';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { ServerConfig } from '@/modules/inventory/types';

export const dynamic = 'force-dynamic';

/**
 * One-time migration: scans all existing KV entries and builds the manifest
 * indexes that replace kv.list() prefix scans.
 *
 * Populates:
 *   org:servers:manifest:{orgId}  → string[]  server IDs in that org
 *   user:org:manifest:{email}     → string[]  org IDs the user belongs to
 *
 * Safe to run multiple times — it rebuilds manifests from current KV state
 * each time, which also repairs any drift.
 *
 * Usage (while logged in):
 *   GET /api/admin/migrate-manifests
 *   GET /api/admin/migrate-manifests?dry=true   — preview without writing
 */
export async function GET(req: Request) {
  try {
    await getIdentity();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  const dry = new URL(req.url).searchParams.get('dry') === 'true';

  // ── 1. Scan all server entries ─────────────────────────────────────────────
  // Builds: orgId → Set<serverId>
  // Also collects server metadata for the report (status, provider).
  const orgToServers = new Map<string, Map<string, { status: string; provider: string }>>();

  let serverCursor: string | undefined;
  let serverKeyCount = 0;

  do {
    const page = await kv.list({
      prefix: 'servers:',
      ...(serverCursor ? { cursor: serverCursor } : {}),
    });

    for (const item of page.keys) {
      serverKeyCount++;
      // key: servers:{orgId}:{serverId}
      const withoutPrefix = item.name.slice('servers:'.length);
      const colonIdx = withoutPrefix.indexOf(':');
      if (colonIdx === -1) continue;
      const orgId = withoutPrefix.slice(0, colonIdx);
      const serverId = withoutPrefix.slice(colonIdx + 1);

      if (!orgToServers.has(orgId)) orgToServers.set(orgId, new Map());

      // Read the config to get status/provider for the report
      const raw = await kv.get(item.name);
      let status = 'unknown';
      let provider = 'unknown';
      if (raw) {
        try {
          const config = JSON.parse(raw) as ServerConfig;
          status = config.status || 'unknown';
          provider = config.provider || 'hetzner';
        } catch { /* skip malformed */ }
      }

      orgToServers.get(orgId)!.set(serverId, { status, provider });
    }

    serverCursor = page.list_complete ? undefined : page.cursor;
  } while (serverCursor);

  // ── 2. Scan all org membership entries ────────────────────────────────────
  // Builds: email → Set<orgId>
  const emailToOrgs = new Map<string, Set<string>>();

  let orgCursor: string | undefined;
  let membershipKeyCount = 0;

  do {
    const page = await kv.list({
      prefix: 'user:org:',
      ...(orgCursor ? { cursor: orgCursor } : {}),
    });

    for (const item of page.keys) {
      // Skip manifest keys written by this system
      if (item.name.startsWith('user:org:manifest:')) continue;
      membershipKeyCount++;

      // key: user:org:{email}:{orgId}
      const withoutPrefix = item.name.slice('user:org:'.length);
      const colonIdx = withoutPrefix.indexOf(':');
      if (colonIdx === -1) continue;
      const email = withoutPrefix.slice(0, colonIdx);
      const orgId = withoutPrefix.slice(colonIdx + 1);

      if (!emailToOrgs.has(email)) emailToOrgs.set(email, new Set());
      emailToOrgs.get(email)!.add(orgId);
    }

    orgCursor = page.list_complete ? undefined : page.cursor;
  } while (orgCursor);

  // ── 3. Write manifests ─────────────────────────────────────────────────────
  const orgManifestsWritten: Record<string, string[]> = {};
  const userManifestsWritten: Record<string, string[]> = {};

  if (!dry) {
    for (const [orgId, servers] of orgToServers) {
      const serverIds = [...servers.keys()];
      await kv.put(`org:servers:manifest:${orgId}`, JSON.stringify(serverIds));
      orgManifestsWritten[orgId] = serverIds;
    }

    for (const [email, orgIds] of emailToOrgs) {
      const ids = [...orgIds];
      await kv.put(`user:org:manifest:${email}`, JSON.stringify(ids));
      userManifestsWritten[email] = ids;
    }
  }

  // ── 4. Report ──────────────────────────────────────────────────────────────
  const serverSummary: Record<string, Array<{ id: string; status: string; provider: string }>> = {};
  for (const [orgId, servers] of orgToServers) {
    serverSummary[orgId] = [...servers.entries()].map(([id, meta]) => ({ id, ...meta }));
  }

  return NextResponse.json({
    dry,
    scanned: { serverKeys: serverKeyCount, membershipKeys: membershipKeyCount },
    orgManifests: serverSummary,
    userManifests: dry
      ? Object.fromEntries([...emailToOrgs.entries()].map(([e, s]) => [e, [...s]]))
      : userManifestsWritten,
    written: dry ? 0 : orgToServers.size + emailToOrgs.size,
    message: dry
      ? 'Dry run complete — no data written'
      : `Migration complete. Wrote ${orgToServers.size} org manifest(s) and ${emailToOrgs.size} user manifest(s).`,
  });
}
