import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { ServerConfig } from '@/modules/inventory/types';

/**
 * GET /api/provisioning/bootstrap?id=SERVER_ID&token=PROVISIONING_TOKEN
 * Returns a shell script that provisions the VPS from the inside out.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('id');
  const token = searchParams.get('token');

  if (!serverId || !token) {
    return new Response('Missing id or token', { status: 400 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) {
    return new Response('KV not configured', { status: 500 });
  }

  // 1. Find the server config
  const list = await kv.list({ prefix: 'servers:' });
  let config: ServerConfig | null = null;
  
  for (const key of list.keys) {
    if (key.name.endsWith(`:${serverId}`)) {
      const data = await kv.get(key.name);
      if (data) config = JSON.parse(data);
      break;
    }
  }

  if (!config || config.provisioningToken !== token) {
    return new Response('Server not found or invalid token', { status: 404 });
  }

  // 2. Extract the Tunnel Token from the logs (where we store it during creation)
  const tunnelTokenMatch = config.logs?.find(l => l.startsWith('Tunnel Token: '))?.replace('Tunnel Token: ', '');
  
  if (!tunnelTokenMatch) {
    return new Response('Tunnel token not found for this server. Please recreate it.', { status: 500 });
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
  const callbackUrl = `${appUrl}/api/provisioning/status`;

  // 3. Generate the script
  const script = `#!/bin/bash
set -e

echo "🚀 Starting DevBox Bootloader..."

# Variables
SERVER_ID="${serverId}"
TOKEN="${token}"
TUNNEL_TOKEN="${tunnelTokenMatch}"
CALLBACK_URL="${callbackUrl}"

# Helper to report status
report_status() {
  echo "[-] $1"
  curl -s -X POST "$CALLBACK_URL" \\
    -H "Content-Type: application/json" \\
    -d "{\\"serverId\\": \\"$SERVER_ID\\", \\"token\\": \\"$TOKEN\\", \\"status\\": \\"$1\\"}" > /dev/null || true
}

report_status "Initializing System"

# 1. Install Dependencies
apt-get update -qq
apt-get install -y -qq curl sudo git jq ca-certificates > /dev/null

# 2. Install Cloudflare Tunnel
report_status "Installing Cloudflare Tunnel"
if ! command -v cloudflared &> /dev/null; then
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared.deb
    rm cloudflared.deb
fi

# 3. Configure Tunnel as a Service
report_status "Connecting to Cloudflare"
cloudflared service install "$TUNNEL_TOKEN"

# 4. Run Main Bootstrap (Docker, DDEV, etc.)
report_status "Running Main Bootstrap"
curl -sL https://raw.githubusercontent.com/acondura/devboxui/contabo/cloud-init.sh | bash -s -- \\
    "${config.userName}" \\
    "${config.userEmail}" \\
    "$TUNNEL_TOKEN" \\
    "MANAGEMENT_KEY_PLACEHOLDER" \\
    "${config.sshPublicKey}" \\
    "$SERVER_ID" \\
    "$TOKEN" \\
    "$CALLBACK_URL" \\
    "${config.rootPassword || 'PASSWORD_SET'}"

report_status "Ready"
echo "✅ DevBox is live!"
`;

  return new Response(script, {
    headers: {
      'Content-Type': 'text/x-shellscript',
      'Cache-Control': 'no-cache'
    }
  });
}
