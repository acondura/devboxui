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

  // 1. Fast direct lookup by token
  const lookupData = await kv.get(`token:${token}`);
  if (!lookupData) {
    console.error(`[Bootstrap] Token not found: ${token}`);
    return new Response('Invalid or expired token', { status: 404 });
  }

  const { serverKey } = JSON.parse(lookupData) as { serverKey: string };
  const data = await kv.get(serverKey);
  
  if (!data) {
    console.error(`[Bootstrap] Server config missing for key: ${serverKey}`);
    return new Response('Server configuration lost', { status: 404 });
  }
  
  const config = JSON.parse(data) as ServerConfig;

  if (config.provisioningToken !== token) {
    return new Response('Token mismatch', { status: 403 });
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

START_TIME=$(date +%s)
LOG_FILE="/var/log/devbox-setup.log"
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

# Save stdout to descriptor 3
exec 3>&1

# Redirect stdout and stderr to the log file
exec 1>>"$LOG_FILE" 2>&1

# Progress tracking
TOTAL_STEPS=5
CURRENT_STEP=0

# Helper for clean titles
title() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  PERCENT=$((CURRENT_STEP * 100 / TOTAL_STEPS))
  # Keep it at 99% until the very end
  if [ $PERCENT -gt 99 ] && [ "$1" != "Ready" ]; then PERCENT=99; fi
  
  echo -e "\\x1b[1;34m[\${PERCENT}%] 🚀 \$1...\\x1b[0m" >&3
  echo "[\$(date +%T)] \$1" >> "\$LOG_FILE"
}

# Variables
SERVER_ID="${serverId}"
TOKEN="${token}"
TUNNEL_TOKEN="${tunnelTokenMatch}"
CALLBACK_URL="${callbackUrl}"

# Helper to report status
report_status() {
  title "\$1"
  curl -s -X POST "\$CALLBACK_URL" \\
    -H "Content-Type: application/json" \\
    -d "{\\"serverId\\": \\"\$SERVER_ID\\", \\"token\\": \\"\$TOKEN\\", \\"status\\": \\"\$1\\"}" > /dev/null || true
}

report_status "Initializing System"

# Wait for apt locks (background updates often lock apt on fresh boot)
echo -e "\x1b[33m[Waiting]\x1b[0m Ubuntu is finishing background updates (apt lock)..." >&3
while fuser /var/lib/dpkg/lock-mirror >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
   sleep 5
done


# 1. Install Dependencies
apt-get update -qq
apt-get install -y -qq curl sudo git jq ca-certificates > /dev/null

# 2. Install Cloudflare Tunnel
report_status "Installing Cloudflare Tunnel"
if ! command -v cloudflared &> /dev/null; then
    curl -L -s --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared.deb > /dev/null
    rm cloudflared.deb
fi

# 3. Configure Tunnel as a Service
report_status "Connecting to Cloudflare"
cloudflared service install "$TUNNEL_TOKEN" > /dev/null 2>&1 || true

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
    "${config.rootPassword || 'PASSWORD_SET'}" \\
    "" \\
    "" \\
    "" \\
    "${config.provider || 'Custom'}" \\
    "${config.tunnelUrl?.replace('https://', '') || 'Server'}"

report_status "Ready"

# Restore stdout and show summary
exec 1>&3
END_TIME=$(date +%s)
DIFF=$((END_TIME - START_TIME))
if [ \$DIFF -ge 60 ]; then
  DURATION="$((DIFF / 60))m $((DIFF % 60))s"
else
  DURATION="\${DIFF}s"
fi

echo -e "\n\\x1b[1;32m✅ DevBox is live! (Setup took \${DURATION})\\x1b[0m"
echo -e "\\x1b[0;36m📄 Full log available at: \$LOG_FILE\\x1b[0m\n"
`;

  return new Response(script, {
    headers: {
      'Content-Type': 'text/x-shellscript',
      'Cache-Control': 'no-cache'
    }
  });
}
