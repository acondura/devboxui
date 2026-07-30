import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { ScheduleConfig, ServerConfig } from '@/modules/inventory/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const env = await getCloudflareEnv();
  const secret = req.nextUrl.searchParams.get('secret');
  
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const kv = env.KV;
  if (!kv) {
    return NextResponse.json({ error: 'KV database missing' }, { status: 500 });
  }

  const userEmail = "andrei@condurachi.ro";
  const serverId = "66672da7-a2d2-43ad-8071-b9caacba7472"; // The existing odb-code server ID
  const serverKey = `servers:${userEmail}:${serverId}`;
  const scheduleKey = `schedule:${userEmail}:${serverId}`;

  // 1. Load current configurations
  const serverData = await kv.get(serverKey);
  const scheduleData = await kv.get(scheduleKey);

  if (!serverData) {
    return NextResponse.json({ error: `Server config ${serverKey} not found` }, { status: 404 });
  }

  const server = JSON.parse(serverData) as ServerConfig;
  const schedule = scheduleData ? JSON.parse(scheduleData) as ScheduleConfig : null;

  // 2. Perform updates
  const newHostname = "odb.devboxui.com";
  server.hostname = newHostname;
  server.tunnelUrl = `https://${newHostname}/?folder=/home/${server.userName}/workspace`;
  
  // Point to the manual snapshot: ID 414345887
  const manualSnapshotId = 414345887;
  const manualSnapshotDesc = "odb-2026-07-30-15-16-50";
  const manualSnapshotDate = "2026-07-30";
  
  if (schedule) {
    schedule.latestSnapshotId = manualSnapshotId;
    schedule.latestSnapshotDescription = manualSnapshotDesc;
    schedule.latestSnapshotDate = manualSnapshotDate;
    server.scheduleConfig = schedule;
  }

  // 3. Set up DNS Routing and Access Policies for the new hostname
  const cfApi = new CloudflareApiService(env);
  const tunnelId = "61a33f97-e0fa-4f9b-afa4-673eab4c5019"; // odb-code active tunnel ID
  
  const logSteps: string[] = [];
  try {
    logSteps.push("Setting up hostname routing for odb.devboxui.com...");
    await cfApi.setupHostname(newHostname, tunnelId);
    
    logSteps.push("Setting up Access for odb.devboxui.com...");
    await cfApi.setupAccess(newHostname, userEmail);

    logSteps.push("Setting up hostname routing for odb-logs.devboxui.com...");
    await cfApi.setupHostname("odb-logs.devboxui.com", tunnelId, "http://localhost:8000");

    logSteps.push("Setting up Access for odb-logs.devboxui.com...");
    await cfApi.setupAccess("odb-logs.devboxui.com", userEmail);
    
    const serviceToken = await cfApi.getOrCreateServiceToken(kv);
    await cfApi.authorizeServiceToken("odb-logs.devboxui.com", serviceToken.id);
  } catch (err) {
    console.error("Failed Cloudflare setup:", err);
    return NextResponse.json({ 
      error: "Cloudflare API setup failed", 
      message: err instanceof Error ? err.message : String(err),
      logSteps 
    }, { status: 500 });
  }

  // 4. Save updated configs back to KV
  await kv.put(serverKey, JSON.stringify(server));
  if (schedule) {
    await kv.put(scheduleKey, JSON.stringify(schedule));
  }

  return NextResponse.json({ 
    success: true, 
    message: "Successfully renamed odb-code to odb, updated latest snapshot config, and set up Cloudflare Tunnel routing.",
    server,
    schedule,
    logSteps
  });
}
