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

    // 1. Fetch current config
    const data = await kv.get(`server:${serverId}`);
    if (!data) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const config = JSON.parse(data) as ServerConfig;

    // 2. Validate token
    if (config.provisioningToken !== token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // 3. Update status
    config.detailedStatus = status;
    config.updatedAt = new Date().toISOString();
    
    if (status === 'Ready') {
      config.status = 'ready';
    }

    // 4. Save back
    await kv.put(`server:${serverId}`, JSON.stringify(config));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Status Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
