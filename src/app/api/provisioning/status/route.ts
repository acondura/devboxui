import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { ServerConfig } from '@/modules/inventory/types';


export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  console.log(`[Provisioning API] Incoming request to ${url.pathname}`);
  
  try {
    const body = await req.json();
    const { serverId, token, status } = body as { serverId: string; token: string; status: string };
    
    console.log(`[Provisioning API] Server: ${serverId}, Status: ${status}, Token: ${token ? 'PRESENT' : 'MISSING'}`);
    
    const env = await getCloudflareEnv();
    const kv = env.KV;

    if (!kv) {
      console.error('[Provisioning API] KV Namespace is missing!');
      return NextResponse.json({ error: 'KV not configured' }, { status: 500 });
    }

    // 1. Look up the server key directly via the server_lookup index (avoids a full kv.list scan)
    const lookupRaw = await kv.get(`server_lookup:${serverId}`);
    let serverKey = '';
    let data: string | null = null;

    if (lookupRaw) {
      const lookup = JSON.parse(lookupRaw) as { serverKey: string };
      serverKey = lookup.serverKey;
      data = await kv.get(serverKey);
    }

    if (!data || !serverKey) {
      console.error(`Provisioning Status: Server ${serverId} not found in KV.`);
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const config = JSON.parse(data) as ServerConfig;
    const now = new Date().toISOString();

    // 2. Validate token
    if (config.provisioningToken !== token) {
      const errorMsg = `[${now}] Invalid token attempt: ${token?.slice(0, 8)}...`;
      console.error(`Provisioning Status: ${errorMsg} for server ${serverId}.`);
      config.statusLog = [...(config.statusLog || []), errorMsg];
      await kv.put(serverKey, JSON.stringify(config));
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // 3. Update status
    config.detailedStatus = status;
    config.updatedAt = now;
    config.statusLog = [...(config.statusLog || []), `[${now}] ${status}`];
    
    if (status === 'Ready') {
      config.status = 'ready';
    } else {
      config.status = 'configuring';
    }

    // 4. Save back using the FOUND key
    await kv.put(serverKey, JSON.stringify(config));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Status Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
