import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { ServerConfig } from '@/modules/inventory/types';


export async function POST(req: NextRequest) {
  try {
    const { serverId, token, status } = await req.json() as { serverId: string; token: string; status: string };
    const env = await getCloudflareEnv();
    const kv = env.KV;

    if (!kv) {
      return NextResponse.json({ error: 'KV not configured' }, { status: 500 });
    }

    // 1. Fetch all server keys to find the one matching this serverId
    const list = await kv.list({ prefix: 'servers:' });
    let serverKey = '';
    let data: string | null = null;

    for (const key of list.keys) {
      if (key.name.endsWith(`:${serverId}`)) {
        serverKey = key.name;
        data = await kv.get(serverKey);
        break;
      }
    }

    if (!data || !serverKey) {
      console.error(`Provisioning Status: Server ${serverId} not found in KV.`);
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const config = JSON.parse(data) as ServerConfig;

    // 2. Validate token
    if (config.provisioningToken !== token) {
      console.error(`Provisioning Status: Invalid token for server ${serverId}.`);
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // 3. Update status
    config.detailedStatus = status;
    config.updatedAt = new Date().toISOString();
    
    if (status === 'Ready') {
      config.status = 'ready';
    }

    // 4. Save back using the FOUND key
    await kv.put(serverKey, JSON.stringify(config));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Status Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
