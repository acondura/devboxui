'use server';

import { ServerConfig } from './types';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { HetznerApiService } from '@/lib/hetzner-api';
import { ContaboApiService } from '@/lib/contabo-api';
import { formatRsaPublicKey, formatPrivateKey } from '@/lib/ssh-utils';

/**
 * Generates the full sequence of bash commands to bootstrap the server.
 */
function getBootstrapScript(
  userName: string,
  userEmail: string,
  tunnelToken: string,
  managementKey: string,
  userSSHKey: string,
  serverId: string,
  provisioningToken: string,
  callbackUrl: string,
  rootPassword?: string,
  serviceTokenId?: string,
  serviceTokenSecret?: string,
  hetznerToken?: string,
  providerName: string = 'DevBox',
  displayUrl: string = 'Server'
) {
  // DERIVED VARIABLES
  const HOST_HOME = `/home/${userName}`;
  const HOST_WORKSPACE = `${HOST_HOME}/workspace`;
  const serverName = displayUrl ? displayUrl.split('-code.')[0].split('-logs.')[0].split('.')[0] : 'devbox';

  return `#!/bin/bash
set -e
echo -e "\\x1b[32m🚀 Script decoded successfully. Starting setup...\\x1b[0m"
# Script Version: 2026-05-06-v1

# --- 0. Configuration ---
DEV_USER="${userName}"
ROOT_PASSWORD="${rootPassword || ''}"
SERVER_ID="${serverId}"
PROV_TOKEN="${provisioningToken}"
WORKSPACE_DIR="${HOST_WORKSPACE}"
SERVER_NAME="${serverName}"

# EXPORT SECRETS
export TUNNEL_TOKEN="${tunnelToken}"
export HETZNER_TOKEN="${hetznerToken || ''}"
export SERVER_ID="${serverId}"
export PROV_TOKEN="${provisioningToken}"
export CALLBACK_URL="${callbackUrl}"
export SERVICE_TOKEN_ID="${serviceTokenId || ''}"
export SERVICE_TOKEN_SECRET="${serviceTokenSecret || ''}"
export USER_SSH_KEY="${userSSHKey}"
export MANAGEMENT_SSH_KEY="${managementKey}"
export WORKSPACE_DIR="${HOST_WORKSPACE}"

# Auto-detect Hetzner Server ID from metadata if not provided
if [ -z "$HETZNER_SERVER_ID" ]; then
    HETZNER_SERVER_ID=$(curl -s -m 2 http://169.254.169.254/hetzner/v1/metadata/instance-id || echo "")
fi

# UNLOCK root immediately
passwd -u root || echo "Root already unlocked"

if [ -n "${rootPassword}" ]; then
    echo "root:${rootPassword}" | chpasswd
    # Enable Password Auth for root
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
    sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
    sed -i 's/#PermitRootLogin yes/PermitRootLogin yes/' /etc/ssh/sshd_config
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
fi

# PREPARE WORKSPACE DIRECTORY ON HOST
mkdir -p "$WORKSPACE_DIR"
chmod 777 "$WORKSPACE_DIR"

# Helper to update Hetzner server name with status
hetzner_heartbeat() {
    local status_msg="$1"
    mkdir -p /var/www/debug
    echo "$status_msg" > /var/www/debug/status.txt
    
    if [ -n "$HETZNER_TOKEN" ] && [ -n "$HETZNER_SERVER_ID" ]; then
        local clean_msg=$(echo "$status_msg" | tr ' ' '-')
        if command -v curl >/dev/null 2>&1; then
            curl -s -X PUT "https://api.hetzner.cloud/v1/servers/$HETZNER_SERVER_ID" -H "Authorization: Bearer $HETZNER_TOKEN" -H "Content-Type: application/json" -d '{"name": "'"${serverName}-\$clean_msg"'"}' || true
        elif command -v wget >/dev/null 2>&1; then
            wget -qO- --method=PUT --header="Authorization: Bearer $HETZNER_TOKEN" --header="Content-Type: application/json" --body-data='{"name": "'"${serverName}-\$clean_msg"'"}' "https://api.hetzner.cloud/v1/servers/$HETZNER_SERVER_ID" || true
        fi
    fi
}

# START BEATING
hetzner_heartbeat "Booting-system"

# CRITICAL: Wait for apt locks (background updates often lock apt on fresh boot)
wait_for_apt_locks() {
  local max_wait=300
  local wait_count=0
  while [ $wait_count -lt $max_wait ]; do
    local locked=false
    if command -v pgrep >/dev/null 2>&1 && pgrep -f "apt-get|dpkg|unattended-upgrades" >/dev/null 2>&1; then
      locked=true
    elif command -v fuser >/dev/null 2>&1; then
      if fuser /var/lib/dpkg/lock-mirror >/dev/null 2>&1 || \
         fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || \
         fuser /var/lib/dpkg/lock >/dev/null 2>&1 || \
         fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
        locked=true
      fi
    fi
    if [ "$locked" = "false" ]; then
      break
    fi
    echo -e "\\x1b[33m[Waiting]\\x1b[0m Ubuntu is finishing background updates (apt lock)..."
    sleep 5
    wait_count=$((wait_count + 5))
  done
}
wait_for_apt_locks


# Install tools
apt-get update && apt-get install -y curl wget || echo "Initial apt failed, will retry later"

# Inject SSH key to root immediately for emergency access
mkdir -p /root/.ssh
echo "\${USER_SSH_KEY}" >> /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
ln -sf /var/log/cloud-init-output.log /var/www/debug/setup.log

cat <<'PYEOF' > /var/www/debug/server.py
import http.server, socketserver, json, subprocess, os
class DebugHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
        
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        origin = self.headers.get('Origin', 'https://devboxui.com')
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()
        
        docker_status = subprocess.getoutput('docker ps --format "{{.Names}}: {{.Status}}" || echo "Docker not ready"')
        setup_logs = subprocess.getoutput('tail -n 100 /var/log/cloud-init-output.log || echo "Logs not ready"')
        
        # Live Project Discovery
        workspace_dir = os.environ.get('WORKSPACE_DIR')
        if not workspace_dir:
            # Try to auto-detect if env var is missing
            possible_home = subprocess.getoutput('echo /home/$(ls /home | head -n 1)/workspace')
            workspace_dir = possible_home if os.path.exists(possible_home) else '/home/root/workspace'
            
        projects_list = []
        if os.path.exists(workspace_dir):
            try:
                projects_list = [d for d in os.listdir(workspace_dir) if os.path.isdir(os.path.join(workspace_dir, d))]
            except Exception as e:
                projects_list = [f"Error listing projects: {str(e)}"]

        status_txt = "Initializing..."
        if os.path.exists("/var/www/debug/status.txt"):
            with open("/var/www/debug/status.txt", "r") as f:
                status_txt = f.read().strip()

        data = {
            "docker": docker_status,
            "setup": setup_logs,
            "status": status_txt,
            "projects": projects_list,
            "workspace": workspace_dir,
            "timestamp": subprocess.getoutput('date')
        }
        self.wfile.write(json.dumps(data).encode())

PORT = 8000
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), DebugHandler) as httpd:
    httpd.serve_forever()
PYEOF

# Set up and start the debug status server as a systemd service
cat <<EOF > /etc/systemd/system/devbox-debug.service
[Unit]
Description=DevBox Debug and Status Exporter
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/debug
Environment="WORKSPACE_DIR=$WORKSPACE_DIR"
ExecStart=/usr/bin/python3 /var/www/debug/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable devbox-debug.service
systemctl start devbox-debug.service


# --- 2. System Resilience & Immediate Reporting ---
export DEBIAN_FRONTEND=noninteractive
# Open debug port
ufw allow 8000/tcp || echo "ufw not present or failed"

# We use a simple apt-get update retry loop instead of 'fuser' (which might be missing)
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

# Helper for reporting status
report_status() {
    local status_msg="\$1"
    title "\$status_msg"
    hetzner_heartbeat "\$status_msg"
    # Attempt to report status with retry logic and tool fallback
    for i in {1..3}; do
      local response_code="000"
      if command -v curl >/dev/null 2>&1; then
        response_code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$CALLBACK_URL" \
          -H "Content-Type: application/json" \
          -H "CF-Access-Client-Id: $SERVICE_TOKEN_ID" \
          -H "CF-Access-Client-Secret: $SERVICE_TOKEN_SECRET" \
          -d "{\\\"serverId\\\": \\\"$SERVER_ID\\\", \\\"token\\\": \\\"$PROV_TOKEN\\\", \\\"status\\\": \\\"$status_msg\\\"}")
      elif command -v wget >/dev/null 2>&1; then
        # Fallback to wget if curl is not yet available
        wget -q --timeout=5 --spider --method=POST --header="Content-Type: application/json" \
          --header="CF-Access-Client-Id: $SERVICE_TOKEN_ID" \
          --header="CF-Access-Client-Secret: $SERVICE_TOKEN_SECRET" \
          --body-data="{\\\"serverId\\\": \\\"$SERVER_ID\\\", \\\"token\\\": \\\"$PROV_TOKEN\\\", \\\"status\\\": \\\"$status_msg\\\"}" \
          "$CALLBACK_URL" && response_code="200"
      fi
      
      echo "Status report attempt $i: HTTP $response_code" >> /var/log/provisioning-heartbeat.log
      
      if [ "$response_code" -eq 200 ] || [ "$response_code" -eq 201 ]; then
        return 0
      fi
      sleep 2
    done
    return 0 # Never fail the whole script because of a status report
}

# First report
report_status "Initializing system..."


# Wait for apt locks (background updates often lock apt on fresh boot)
wait_for_apt_locks >&3


report_status "Hardening server and setting up users..."
chage -d $(date +%Y-%m-%d) root

if [ -n "$ROOT_PASSWORD" ]; then
    echo "root:$ROOT_PASSWORD" | chpasswd
fi

echo "⚠️ SETUP IN PROGRESS - Please wait a few minutes before using the server." > /etc/motd
set -x 

# Retry apt-get update to be safe
apt-get update || (sleep 10 && apt-get update)
apt-get install -y ca-certificates curl gnupg lsb-release ufw git jq vim

# --- 3. Create User '$DEV_USER' & SSH ---
if ! id "$DEV_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEV_USER"
    if [ -n "$ROOT_PASSWORD" ]; then
        echo "$DEV_USER:$ROOT_PASSWORD" | chpasswd
        chage -d $(date +%Y-%m-%d) "$DEV_USER"
    fi
    usermod -aG sudo "$DEV_USER"
fi

# --- 2. SSH Key Synchronization ---
report_status "Syncing SSH keys..."
mkdir -p /home/"$DEV_USER"/.ssh
chmod 700 /home/"$DEV_USER"/.ssh

# Add User SSH Key (Magic Key)
if [ -n "$USER_SSH_KEY" ]; then
    echo "$USER_SSH_KEY" >> /home/"$DEV_USER"/.ssh/authorized_keys
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    echo "$USER_SSH_KEY" >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

# Add Management Key
if [ -n "$MANAGEMENT_SSH_KEY" ]; then
    echo "$MANAGEMENT_SSH_KEY" >> /home/"$DEV_USER"/.ssh/authorized_keys
fi

# Sync from root (Hetzner added keys)
if [ -f /root/.ssh/authorized_keys ]; then
    cat /root/.ssh/authorized_keys >> /home/"$DEV_USER"/.ssh/authorized_keys
fi

# Cleanup and Permissions
sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys 2>/dev/null || true
sort -u /home/"$DEV_USER"/.ssh/authorized_keys -o /home/"$DEV_USER"/.ssh/authorized_keys

chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"/.ssh
chmod 600 /home/"$DEV_USER"/.ssh/authorized_keys

report_status "Setting up Cloudflare Tunnel..."
# Detect architecture
ARCH=$(dpkg --print-architecture)
if [ "$ARCH" = "arm64" ]; then
  CF_PKG="cloudflared-linux-arm64.deb"
else
  CF_PKG="cloudflared-linux-amd64.deb"
fi
curl -L --output cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_PKG"
dpkg -i cloudflared.deb
rm cloudflared.deb
if [ -n "$TUNNEL_TOKEN" ]; then
    cloudflared service install "$TUNNEL_TOKEN"
    systemctl start cloudflared || true
fi

# Configure developer workspace environment
mkdir -p "${HOST_WORKSPACE}"
chown -R "$DEV_USER":"$DEV_USER" "${HOST_HOME}"

# Pre-configure Git for the host user
cat <<EOF > /home/"$DEV_USER"/.gitconfig
[user]
    name = ${userName}
    email = ${userEmail}
EOF
chown "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"/.gitconfig

# Grant NOPASSWD so the developer can use sudo without a password (since they use SSH keys)
echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-devbox-user

# Firewall
ufw allow 22/tcp
ufw --force enable

# Finished
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

echo "✅ SETUP FINISHED - Server is ready for use." > /etc/motd
`;
}

/**
 * Generates a minimal, ultra-fast cloud-init script for Hetzner servers.
 * Avoids slow package updates and installation, focusing only on user creation,
 * workspace creation, SSH key sync, git configuration, and instant status reporting.
 */
function getHetznerBootstrapScript(
  userName: string,
  userEmail: string,
  serverId: string,
  provisioningToken: string,
  callbackUrl: string,
  serviceTokenId?: string,
  serviceTokenSecret?: string
) {
  return `#!/bin/bash
set -e

# Configuration
DEV_USER="${userName}"
SERVER_ID="${serverId}"
PROV_TOKEN="${provisioningToken}"
CALLBACK_URL="${callbackUrl}"
SERVICE_TOKEN_ID="${serviceTokenId || ''}"
SERVICE_TOKEN_SECRET="${serviceTokenSecret || ''}"

# Create User
if ! id "$DEV_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEV_USER"
    usermod -aG sudo "$DEV_USER"
    echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-devbox-user
fi

# Set up workspace directory
mkdir -p /home/"$DEV_USER"/workspace

# Copy SSH keys
mkdir -p /home/"$DEV_USER"/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys /home/"$DEV_USER"/.ssh/authorized_keys
fi
chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"
chmod 700 /home/"$DEV_USER"/.ssh
chmod 600 /home/"$DEV_USER"/.ssh/authorized_keys || true

# Configure Git
cat <<EOF > /home/"$DEV_USER"/.gitconfig
[user]
    name = ${userName}
    email = ${userEmail}
EOF
chown "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"/.gitconfig

# Report Ready status back
if command -v curl >/dev/null 2>&1; then
    curl -s -m 5 -X POST "$CALLBACK_URL" \
      -H "Content-Type: application/json" \
      -H "CF-Access-Client-Id: $SERVICE_TOKEN_ID" \
      -H "CF-Access-Client-Secret: $SERVICE_TOKEN_SECRET" \
      -d "{\\\"serverId\\\": \\\"$SERVER_ID\\\", \\\"token\\\": \\\"$PROV_TOKEN\\\", \\\"status\\\": \\\"Ready\\\"}" || true
fi
`;
}

/**
 * Synchronizes the user's SSH public key to all existing servers.
 */
export async function syncSshKeys(newPublicKey: string) {
  const servers = await getServers();
  const results = [];

  for (const server of servers) {
    if (server.status !== 'ready' || !server.ip || !server.rootPassword) continue;

    try {
      // Use root password to update the user's authorized_keys
      // results.push({ id: server.id, success: false, error: new Error("SSH sync not available for manual servers.") });

      results.push({ id: server.id, success: false, error: new Error("SSH sync not available for manual servers.") });
    } catch (error) {
      console.error(`Failed to sync key to ${server.ip}:`, error);
      results.push({ id: server.id, success: false, error });
    }
  }

  return { success: true, results };
}


/**
 * Generates a consistent 10-character alphanumeric Linux username based on an email address.
 * Uses a double-hash approach combined into base36 to ensure uniqueness and predictability.
 */
function generateUniqueUsername(email: string): string {
  let hash = 5381;
  const str = email.toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
  }
  const hashNum = (hash >>> 0);
  
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    hash2 = Math.imul(31, hash2) + str.charCodeAt(i) | 0;
  }
  const hashNum2 = (hash2 >>> 0);
  
  const base36Str = (hashNum.toString(36) + hashNum2.toString(36)).replace(/[^a-z0-9]/g, '');
  return ('u' + base36Str.padEnd(9, '0')).substring(0, 10);
}

/**
 * Retrieves per-user settings (like Hetzner API Token) from KV.
 * Auto-generates an SSH keypair if missing.
 */
export async function getUserSettings() {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return null;

  const data = await kv.get(`settings:${userEmail}`);
  const settings = data ? JSON.parse(data) : {
    hetznerToken: '',
    sshPublicKey: '',
    sshPrivateKey: '',
    contaboClientId: '',
    contaboClientSecret: '',
    contaboUsername: '',
    contaboPassword: ''
  };



  return settings as {
    hetznerToken: string;
    sshPublicKey: string;
    sshPrivateKey: string;
    contaboClientId?: string;
    contaboClientSecret?: string;
    contaboUsername?: string;
    contaboPassword?: string;
    sshKeyVersion?: string;
  };
}

/**
 * Saves per-user settings to KV.
 */
export async function saveUserSettings(settings: {
  hetznerToken?: string;
  sshPublicKey?: string;
  sshPrivateKey?: string;
  contaboClientId?: string;
  contaboClientSecret?: string;
  contaboUsername?: string;
  contaboPassword?: string;
}) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  // Merge with existing to preserve keys if only token is updated
  const existing = await getUserSettings();
  const updated = { ...existing, ...settings };

  await kv.put(`settings:${userEmail}`, JSON.stringify(updated));
  return { success: true };
}

/**
 * Provisions a new server automatically via Cloud-Init.
 */
export async function provisionServer(
  customName: string,
  serverType: string,
  location: string,
  image: string,
  provider: 'hetzner' | 'contabo' = 'hetzner'
) {
  if (provider === 'contabo') {
    return provisionContaboServer(customName, serverType, location, image);
  }
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  // 1. Fetch User Settings (with auto-generated keys)
  const settings = await getUserSettings();
  if (!settings) throw new Error("Could not retrieve or generate user settings.");

  const hetznerToken = settings.hetznerToken || env.HETZNER_API_TOKEN;
  if (!hetznerToken) {
    throw new Error("Hetzner API Token is missing. Please set it in Settings.");
  }

  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env, hetznerToken);

  // 2. Initialize Server Configuration
  const serverId = crypto.randomUUID();
  const shortId = serverId.slice(0, 8);
  const name = customName || `devbox-${shortId}`;
  
  const userName = generateUniqueUsername(userEmail);
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const directHostname = `${safeName}.devboxui.com`;

  const rootPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-6);
  const provisioningToken = crypto.randomUUID();
  const config: ServerConfig = {
    id: serverId,
    ip: 'pending',
    userName,
    userEmail,
    status: 'initializing',
    provisioningToken,
    rootPassword: rootPassword,
    sshPrivateKey: settings.sshPrivateKey,
    sshPublicKey: settings.sshPublicKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [`Starting Hetzner server creation (${serverType} in ${location})...`],
    tunnelUrl: undefined,
    projects: [],
    serverType: serverType,
    provider: 'hetzner',
    providerName: 'Hetzner',
    hostname: directHostname
  };

  let hetznerServerId: number | undefined;

  try {
    const userSSHKey = settings.sshPublicKey;
    const managementKey = env.MANAGEMENT_SSH_PUBLIC_KEY || '';

    // 3. Hetzner Automation: Manage SSH Keys
    console.log(`Managing SSH keys on Hetzner...`);
    const sshKeyIds: (string | number)[] = [];

    const keysToRegister = [
      { name: `devbox-${userName}`, key: userSSHKey },
      { name: 'devbox-mgmt', key: managementKey }
    ].filter(k => k.key);

    for (const k of keysToRegister) {
      try {
        const existingKeys = await hetznerApi.getSSHKeys();
        const cleanedKey = k.key.trim().split(' ').slice(0, 2).join(' ');

        const contentMatch = existingKeys.find(ex => ex.public_key.trim().includes(cleanedKey));
        const nameMatch = existingKeys.find(ex => ex.name === k.name);

        if (contentMatch) {
          console.log(`Key '${k.name}' already exists on Hetzner (ID: ${contentMatch.id})`);
          sshKeyIds.push(contentMatch.id);
        } else {
          if (nameMatch) {
            console.warn(`Key '${k.name}' exists but content differs. Deleting old key to recreate...`);
            await hetznerApi.deleteSSHKey(nameMatch.id);
          }

          console.log(`Registering key '${k.name}' with Hetzner...`);
          const created = await hetznerApi.createSSHKey(k.name, k.key);
          if (created) {
            console.log(`Successfully registered key '${k.name}' (ID: ${created.id})`);
            sshKeyIds.push(created.id);
          } else {
            const retryKeys = await hetznerApi.getSSHKeys();
            const lastDitchMatch = retryKeys.find(ex => ex.name === k.name);
            if (lastDitchMatch) sshKeyIds.push(lastDitchMatch.id);
          }
        }
      } catch (e) {
        console.error(`Warning: Failed to register SSH key ${k.name}:`, e);
      }
    }

    if (sshKeyIds.length === 0) {
      throw new Error("Failed to register any SSH keys with Hetzner. Aborting launch to prevent root password fallback.");
    }

    const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
    const callbackUrl = `${requestHost}/api/provisioning/status`;
    const serviceToken = await cfApi.getOrCreateServiceToken(kv);
    await cfApi.authorizeServiceToken(requestHost.replace('https://', ''), serviceToken.id);

    const bootstrapScript = getHetznerBootstrapScript(
      userName,
      userEmail,
      serverId,
      provisioningToken,
      callbackUrl,
      serviceToken.id,
      serviceToken.client_secret
    );

    console.log(`Requesting new ${serverType} server '${name}' in ${location} with ${sshKeyIds.length} keys...`);
    const hetznerResult = await hetznerApi.createServer(name, bootstrapScript, serverType, location, image, sshKeyIds);
    hetznerServerId = hetznerResult.server.id;
    config.hetznerServerId = hetznerServerId;

    if (hetznerResult.root_password && !rootPassword) {
      console.log("Captured root password from Hetzner.");
      config.rootPassword = hetznerResult.root_password;
    }

    const ip = hetznerResult.server.public_net.ipv4.ip;
    config.ip = ip;
    config.logs = [...(config.logs || []), `Hetzner server created at ${ip}`];

    // Create Direct SSH DNS record in Cloudflare pointing to the public IP
    try {
      console.log(`Setting up Direct SSH DNS A record for ${directHostname} to ${ip}...`);
      await cfApi.setupARecord(directHostname, ip);
      config.logs = [...(config.logs || []), `Created Direct SSH DNS record: ${directHostname}`];
    } catch (err) {
      console.error("Failed to setup Direct SSH DNS record:", err);
      config.logs = [...(config.logs || []), `Warning: Failed to setup direct DNS record: ${err instanceof Error ? err.message : String(err)}`];
    }

    // Save initial state to KV
    config.updatedAt = new Date().toISOString();
    config.logs = [...(config.logs || []), 'Server creation completed. Injected SSH key.'];

    const kvKey = `servers:${userEmail}:${serverId}`;
    await kv.put(kvKey, JSON.stringify(config));

    return { success: true, server: config };

  } catch (error) {
    console.error("Provisioning failed, cleaning up...", error);

    // Cleanup Hetzner resources
    if (hetznerServerId) {
      try { await hetznerApi.deleteServer(hetznerServerId); } catch (e) { console.error("Cleanup: Failed to delete Hetzner server", e); }
    }

    throw error;
  }
}

/**
 * Retrieves the list of servers for the current authenticated user.
 */
export async function getServers() {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) return [];

  const list = await kv.list({ prefix: `servers:${userEmail}:` });
  const kvServers = (await Promise.all(
    list.keys.map(async (key: { name: string }) => {
      const val = await kv.get(key.name);
      if (!val) {
        console.warn(`Self-healing: Deleting ghost key ${key.name}`);
        await kv.delete(key.name).catch(() => { });
        return null;
      }
      return JSON.parse(val) as ServerConfig;
    })
  )).filter((s): s is ServerConfig => s !== null);

  // Fetch from Hetzner API if token is available
  const settings = await getUserSettings();
  const hetznerToken = settings?.hetznerToken || env.HETZNER_API_TOKEN;

  if (hetznerToken) {
    try {
      const hetznerApi = new HetznerApiService(env, hetznerToken);
      const hetznerServers = await hetznerApi.getAllServers();
      const hetznerMap = new Map(hetznerServers.map(hs => [hs.id.toString(), hs]));
      const finalServers: ServerConfig[] = [];

      // 1. Sync KV servers with live Hetzner data and cleanup "ghosts"
      for (const s of kvServers) {
        if (!s.hetznerServerId) {
          finalServers.push(s);
          continue;
        }

        const hs = hetznerMap.get(s.hetznerServerId.toString());
        if (hs) {
          // Sync live data
          s.isLocked = hs.protection?.delete || false;
          s.hetznerStatus = hs.status;
          if (hs.public_net?.ipv4?.ip) s.ip = hs.public_net.ipv4.ip;
          s.serverType = hs.server_type.name;

          // Sync live Hetzner status to local config status
          const oldStatus = s.status;
          const oldDetailed = s.detailedStatus;

          if (hs.status === 'running') {
            s.status = 'ready';
            s.detailedStatus = 'Ready';
          } else if (hs.status === 'starting' || hs.status === 'initializing') {
            s.status = 'initializing';
            s.detailedStatus = 'Initializing...';
          } else {
            s.status = 'off';
            s.detailedStatus = `Server is ${hs.status}`;
          }

          if (s.status !== oldStatus || s.detailedStatus !== oldDetailed) {
            await kv.put(`servers:${userEmail}:${s.id}`, JSON.stringify(s)).catch(() => {});
          }

          finalServers.push(s);
          // Remove from map so we don't add it as "discovered" later
          hetznerMap.delete(hs.id.toString());
        } else {
          // GHOST DETECTION WITH GRACE PERIOD
          const serverAgeMinutes = (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60);

          if (serverAgeMinutes > 2) {
            console.log(`Self-healing: Removing ghost server ${s.id} (not in Hetzner after ${Math.round(serverAgeMinutes)}m)`);
            await kv.delete(`servers:${userEmail}:${s.id}`).catch(() => { });
            // Skip adding to final list
          } else {
            // Give it more time to show up in Hetzner API
            finalServers.push(s);
          }
        }
      }

      // 2. Add discovered Hetzner servers not in KV
      for (const [, hs] of hetznerMap) {
        if (!hs.public_net?.ipv4?.ip) continue;
        const ip = hs.public_net.ipv4.ip;

        finalServers.push({
          id: `hetzner-${hs.id}`,
          ip: ip,
          userName: 'unknown',
          userEmail: userEmail,
          status: hs.status === 'running' ? 'ready' : 'off',
          sshPrivateKey: '',
          sshPublicKey: '',
          createdAt: hs.created,
          updatedAt: hs.created,
          hetznerServerId: hs.id,
          hetznerStatus: hs.status,
          isLocked: hs.protection?.delete || false,
          logs: ['Server discovered from Hetzner API.'],
          tunnelUrl: `http://${ip}`,
          projects: []
        });
      }

      return finalServers;

    } catch (_e) {
      console.error("Failed to fetch/sync Hetzner servers:", _e);
    }
  }

  return kvServers;
}

/**
 * Adds a new DDEV project to an existing server.
 */
export async function addProject(serverId: string, projectName: string, port: number = 8443) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  const cfApi = new CloudflareApiService(env);

  if (!kv) throw new Error("KV database missing.");

  // 1. Find the server
  const list = await kv.list({ prefix: `servers:${userEmail}:` });
  let serverKey = "";
  let config: ServerConfig | null = null;

  for (const key of list.keys) {
    const val = await kv.get(key.name);
    const c = JSON.parse(val!) as ServerConfig;
    if (c.id === serverId) {
      serverKey = key.name;
      config = c;
      break;
    }
  }

  if (!config || !serverKey) throw new Error("Server not found.");
  if (!config.tunnelId) throw new Error("Server is missing a Tunnel ID.");

  // 2. Generate Project Domain
  const cleanName = projectName.toLowerCase().replace(/[^a-z0-9.]/g, '-');
  const projectDomain = `${cleanName}.devboxui.com`; // Simplified domain generation

  // 3. Update Cloudflare Tunnel, DNS & Access
  const service = `http://localhost:${port}`;
  await cfApi.setupHostname(projectDomain, config.tunnelId, service);
  console.log(`Setting up Zero Trust Access for project ${projectDomain} -> ${service}...`);
  await cfApi.setupAccess(projectDomain, userEmail);

  // 4. Update Server State
  const newProject = {
    name: projectName,
    domain: projectDomain,
    status: 'ready' as const
  };

  config.projects = [...(config.projects || []), newProject];
  config.updatedAt = new Date().toISOString();
  config.logs = [...(config.logs || []), `Added project: ${projectName} at ${projectDomain}`];

  await kv.put(serverKey, JSON.stringify(config));

  return config;
}

/**
 * Deletes a domain/ingress rule from a server.
 */
export async function deleteDomain(serverId: string, projectDomain: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const cfApi = new CloudflareApiService(env);

  if (!kv) throw new Error("KV database missing.");

  // 1. Find the server
  const list = await kv.list({ prefix: `servers:${userEmail}:` });
  let serverKey = "";
  let config: ServerConfig | null = null;

  for (const key of list.keys) {
    const val = await kv.get(key.name);
    const c = JSON.parse(val!) as ServerConfig;
    if (c.id === serverId) {
      serverKey = key.name;
      config = c;
      break;
    }
  }

  if (!config || !serverKey) throw new Error("Server not found.");
  if (!config.tunnelId) throw new Error("Server is missing a Tunnel ID.");

  // 2. Remove from Cloudflare (Tunnel, DNS, Access)
  console.log(`Deleting domain ${projectDomain}...`);
  try {
    await cfApi.removeHostname(projectDomain, config.tunnelId);
    await cfApi.deleteAccess(projectDomain);
  } catch (err) {
    console.error("Cloudflare cleanup failed during domain deletion:", err);
    // Continue anyway to clean up local state
  }

  // 3. Update Server State
  config.projects = (config.projects || []).filter(p => p.domain !== projectDomain);
  config.updatedAt = new Date().toISOString();
  await kv.put(serverKey, JSON.stringify(config));

  return config;
}

/**
 * Updates an existing domain's configuration (e.g. changing the port or subdomain).
 */
export async function updateDomain(serverId: string, oldDomain: string, newSubdomain: string, newPort: number) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const cfApi = new CloudflareApiService(env);

  if (!kv) throw new Error("KV database missing.");

  // 1. Find the server
  const list = await kv.list({ prefix: `servers:${userEmail}:` });
  let serverKey = "";
  let config: ServerConfig | null = null;

  for (const key of list.keys) {
    const val = await kv.get(key.name);
    const c = JSON.parse(val!) as ServerConfig;
    if (c.id === serverId) {
      serverKey = key.name;
      config = c;
      break;
    }
  }

  if (!config || !serverKey) throw new Error("Server not found.");
  if (!config.tunnelId) throw new Error("Server is missing a Tunnel ID.");

  // 2. Determine new domain
  const cleanSubdomain = newSubdomain.toLowerCase().replace(/[^a-z0-9.]/g, '-');
  const newDomain = `${cleanSubdomain}.devboxui.com`;
  const domainChanged = oldDomain !== newDomain;

  // 3. Update Cloudflare Tunnel Ingress
  const service = `http://localhost:${newPort}`;
  
  if (domainChanged) {
    console.log(`Domain changed from ${oldDomain} to ${newDomain}. Cleaning up old and creating new...`);
    try {
      await cfApi.removeHostname(oldDomain, config.tunnelId);
      await cfApi.deleteAccess(oldDomain);
    } catch (e) {
      console.error("Cleanup of old domain failed (non-critical):", e);
    }
  }
  
  await cfApi.setupHostname(newDomain, config.tunnelId, service);
  await cfApi.setupAccess(newDomain, userEmail);

  // 4. Update Server State
  config.projects = (config.projects || []).map(p => {
    if (p.domain === oldDomain) {
      return { ...p, domain: newDomain, name: newSubdomain, port: newPort };
    }
    return p;
  });
  config.updatedAt = new Date().toISOString();
  await kv.put(serverKey, JSON.stringify(config));

  return config;
}

/**
 * Deletes a server and cleans up Cloudflare resources.
 */
export async function deleteServer(serverId: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const settings = await getUserSettings();

  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env, settings?.hetznerToken);
  const contaboApi = new ContaboApiService(env, {
    clientId: settings?.contaboClientId || env.CONTABO_CLIENT_ID || '',
    clientSecret: settings?.contaboClientSecret || env.CONTABO_CLIENT_SECRET || '',
    apiUsername: settings?.contaboUsername || env.CONTABO_API_USERNAME || '',
    apiPassword: settings?.contaboPassword || env.CONTABO_API_PASSWORD || ''
  });

  if (!kv) throw new Error("KV database missing.");

  // 1. Find the server in KV
  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);

  if (!config) {
    throw new Error("Server not found.");
  }

  // 2. Automated Cleanup
  console.log(`Starting cleanup for server ${config.ip || 'pending'}...`);

  try {
    // Delete Cloudflare Tunnel
    if (config.tunnelId) {
      console.log("Deleting Cloudflare Tunnel...");
      await cfApi.deleteTunnel(config.tunnelId).catch(e => console.error("Tunnel deletion failed:", e));
    }

    // Delete DNS Records (Main and Projects)
    if (config.tunnelUrl) {
      const hostname = config.tunnelUrl.replace('https://', '');
      const logsHostname = hostname.replace('-code.', '-logs.');
      console.log(`Cleaning up DNS and Access for ${hostname} and ${logsHostname}...`);
      await cfApi.deleteDnsRecord(hostname).catch(e => console.error("DNS deletion failed:", e));
      await cfApi.deleteAccess(hostname).catch(e => console.error("Access deletion failed:", e));

      await cfApi.deleteDnsRecord(logsHostname).catch(e => console.error("Logs DNS deletion failed:", e));
      await cfApi.deleteAccess(logsHostname).catch(e => console.error("Logs Access deletion failed:", e));

      const directHostname = hostname.replace('-code.', '.').replace('-direct', '');
      await cfApi.deleteDnsRecord(directHostname).catch(e => console.error("Direct DNS deletion failed:", e));
      if (hostname.includes('-code.')) {
        const legacyDirect = hostname.replace('-code.', '-direct.');
        await cfApi.deleteDnsRecord(legacyDirect).catch(e => {});
      }
    }

    if (config.hostname) {
      console.log(`Cleaning up hostname DNS record: ${config.hostname}`);
      await cfApi.deleteDnsRecord(config.hostname).catch(e => console.error("Hostname DNS deletion failed:", e));
    }

    if (config.projects) {
      for (const project of config.projects) {
        console.log(`Cleaning up DNS and Access for project: ${project.domain}`);
        await cfApi.deleteDnsRecord(project.domain).catch(e => console.error(`Project DNS deletion failed for ${project.domain}:`, e));
        await cfApi.deleteAccess(project.domain).catch(e => console.error(`Project Access deletion failed for ${project.domain}:`, e));
      }
    }

    // Delete Hetzner Server
    if (config.hetznerServerId) {
      console.log(`Deleting Hetzner server ${config.hetznerServerId}...`);
      await hetznerApi.deleteServer(config.hetznerServerId).catch(e => console.error("Hetzner deletion failed:", e));
    }

    // Delete Contabo Instance and Secret
    if (config.contaboInstanceId) {
      console.log(`Deleting Contabo instance ${config.contaboInstanceId}...`);
      await contaboApi.deleteInstance(config.contaboInstanceId).catch(e => console.error("Contabo instance deletion failed:", e));
    }

    if (config.contaboSecretId) {
      console.log(`Deleting Contabo secret ${config.contaboSecretId}...`);
      await contaboApi.deleteSecret(config.contaboSecretId).catch(e => console.error("Contabo secret deletion failed:", e));
    }
  } catch (e) {
    console.error("Cleanup process encountered errors, proceeding with KV removal:", e);
  }

  // 3. Remove from KV
  const kvKey = `servers:${userEmail}:${serverId}`;
  await kv.delete(kvKey);

  return { success: true };
}

/**
 * Reinstalls the OS on a server (Contabo/Hetzner) and restarts provisioning.
 */
async function setupCloudflareTunnel(config: ServerConfig, userEmail: string) {
  const env = await getCloudflareEnv();
  const cfApi = new CloudflareApiService(env);
  
  const hostname = (config.tunnelUrl || '').replace('https://', '');
  if (!hostname) throw new Error("Tunnel URL missing in config.");

  console.log(`Setting up Cloudflare Tunnel for ${hostname}...`);
  const tunnelResult = await cfApi.createTunnel(`tunnel-${config.id}`);
  config.tunnelId = tunnelResult.id;
  config.tunnelToken = tunnelResult.token;
  
  await cfApi.setupHostname(hostname, tunnelResult.id);
  await cfApi.setupAccess(hostname, userEmail);
  
  return tunnelResult;
}

/**
 * Reinstalls the operating system on an existing server.
 */
export async function reinstallServer(serverId: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const settings = await getUserSettings();

  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env, settings?.hetznerToken);
  const contaboApi = new ContaboApiService(env, {
    clientId: settings?.contaboClientId || env.CONTABO_CLIENT_ID || '',
    clientSecret: settings?.contaboClientSecret || env.CONTABO_CLIENT_SECRET || '',
    apiUsername: settings?.contaboUsername || env.CONTABO_API_USERNAME || '',
    apiPassword: settings?.contaboPassword || env.CONTABO_API_PASSWORD || ''
  });

  if (!kv) throw new Error("KV database missing.");
  if (!settings) throw new Error("User settings not found.");

  // 1. Find the server in KV
  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);

  if (!config) {
    throw new Error("Server not found.");
  }

  // 2. Reset Status
  config.status = 'provisioning';
  config.detailedStatus = 'Triggering Reinstall...';
  config.updatedAt = new Date().toISOString();
  config.logs = [`OS Reinstallation triggered at ${config.updatedAt}`];

  const serverKey = `servers:${userEmail}:${serverId}`;
  await kv.put(serverKey, JSON.stringify(config));

  try {
    if (config.contaboInstanceId) {
      // For Contabo, we can re-inject cloud-init
      // 1. Re-generate bootstrap script (needs the same token/ids)
      await setupCloudflareTunnel(config, userEmail);

      const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
      const callbackUrl = `${requestHost}/api/provisioning/status`;
      const serviceToken = await cfApi.getOrCreateServiceToken(kv);

      const bootstrapScript = getBootstrapScript(
        config.userName || 'abc',
        userEmail,
        config.tunnelToken || '',
        env.MANAGEMENT_SSH_PUBLIC_KEY || '',
        settings.sshPublicKey,
        serverId,
        config.provisioningToken || '',
        callbackUrl,
        config.rootPassword || '',
        serviceToken.id,
        serviceToken.client_secret,
        undefined,
        config.providerName || 'Custom',
        config.hostname || 'devbox'
      );

      console.log(`Triggering Contabo Reinstall for ${config.contaboInstanceId}...`);
      await contaboApi.reinstallInstance(config.contaboInstanceId, {
        imageId: 'ubuntu-24.04',
        userData: bootstrapScript,
        sshKeys: config.contaboSecretId ? [config.contaboSecretId] : []
      });

      config.detailedStatus = 'OS Reinstalling (Contabo)...';
    } else if (config.hetznerServerId) {
      console.log(`Triggering Hetzner Rebuild for ${config.hetznerServerId}...`);
      await hetznerApi.rebuildServer(config.hetznerServerId);
      config.detailedStatus = 'OS Rebuild in progress (Hetzner)...';

      // Since Hetzner rebuild doesn't re-run cloud-init easily, 
      // we'll switch back to waiting-for-bootstrap for manual servers
      if (config.ip && !config.hetznerServerId) {
        config.status = 'waiting-for-bootstrap';
      }
    } else {
      // Manual server or promoted to manual: Reset status and provide new command
      config.status = 'waiting-for-bootstrap';
      config.detailedStatus = 'Waiting for manual bootstrap...';

      const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
      const callbackUrl = `${requestHost}/api/provisioning/status`;
      const serviceToken = await cfApi.getOrCreateServiceToken(kv);

      const bootstrapScript = getBootstrapScript(
        config.userName || 'abc',
        userEmail,
        config.tunnelToken || '',
        env.MANAGEMENT_SSH_PUBLIC_KEY || '',
        settings.sshPublicKey,
        serverId,
        config.provisioningToken || '',
        callbackUrl,
        config.rootPassword || '',
        serviceToken.id,
        serviceToken.client_secret,
        undefined,
        config.providerName || 'Custom',
        config.hostname || 'devbox'
      );

      const base64Script = Buffer.from(bootstrapScript).toString('base64');
      config.bootstrapCommand = `echo "${base64Script}" | base64 -d | bash `;
      config.logs = [...(config.logs || []), `Manual reinstall requested at ${new Date().toISOString()}`];
    }

    await kv.put(serverKey, JSON.stringify(config));
    return { success: true };
  } catch (error) {
    console.error("Reinstall failed:", error);
    // Restore state if failed
    config.status = 'ready'; // Best guess
    config.detailedStatus = undefined;
    await kv.put(serverKey, JSON.stringify(config));
    throw error;
  }
}

/**
 * Toggles the protection status (lock) of a server on Hetzner.
 */
export async function toggleServerLock(serverId: string, enableLock: boolean) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const settings = await getUserSettings();

  const hetznerApi = new HetznerApiService(env, settings?.hetznerToken);

  if (!kv) throw new Error("KV database missing.");

  // 1. Find the server in KV
  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);

  if (!config) {
    throw new Error("Server not found.");
  }

  if (!config.hetznerServerId) {
    throw new Error("Cannot lock/unlock a server not managed by Hetzner.");
  }

  // 2. Call Hetzner API
  await hetznerApi.changeProtection(config.hetznerServerId, enableLock);

  // 3. Update KV state for immediate feedback
  config.isLocked = enableLock;
  config.updatedAt = new Date().toISOString();

  const kvKey = `servers:${userEmail}:${config.ip}`;
  await kv.put(kvKey, JSON.stringify(config));

  return { success: true, isLocked: enableLock };
}

/**
 * Fetches dynamic server types, locations and images from Hetzner.
 */
export async function getHetznerOptions() {
  const env = await getCloudflareEnv();
  const settings = await getUserSettings();
  const hetznerApi = new HetznerApiService(env, settings?.hetznerToken);
  try {
    const [serverTypes, locations, images, pricing] = await Promise.all([
      hetznerApi.getServerTypes(),
      hetznerApi.getLocations(),
      hetznerApi.getImages(),
      hetznerApi.getPricing().catch(() => null)
    ]);

    return { serverTypes, locations, images, pricing };
  } catch (error) {
    console.error("Failed to fetch Hetzner options:", error);
    return { serverTypes: [], locations: [], images: [], pricing: null };
  }
}

/**
 * Regenerates the bootstrap command for an existing server using the latest script logic.
 */
export async function getLatestBootstrapCommand(serverId: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const settings = await getUserSettings();

  if (!kv || !settings) throw new Error("Environment or settings missing.");

  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);

  if (!config) throw new Error("Server not found.");

  const cfApi = new CloudflareApiService(env);
  const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
  const callbackUrl = `${requestHost}/api/provisioning/status`;
  const serviceToken = await cfApi.getOrCreateServiceToken(kv);

  const bootstrapScript = getBootstrapScript(
    config.userName || 'abc',
    userEmail,
    config.tunnelToken || '',
    env.MANAGEMENT_SSH_PUBLIC_KEY || '',
    settings.sshPublicKey,
    serverId,
    config.provisioningToken || '',
    callbackUrl,
    config.rootPassword || '',
    serviceToken.id,
    serviceToken.client_secret,
    undefined,
    config.providerName || 'Custom',
    config.hostname || 'devbox'
  );

  const base64Script = Buffer.from(bootstrapScript).toString('base64');
  const command = `echo "Decoding and starting setup..." && echo '${base64Script}' | base64 -d | bash`;
  
  // Optionally update KV with the latest command
  config.bootstrapCommand = command;
  await kv.put(`servers:${userEmail}:${serverId}`, JSON.stringify(config));

  return { success: true, command };
}

/**
 * Returns the secure log URL for the server.
 */
export async function getServerLogs(serverId: string) {
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);

  if (!config) throw new Error("Server not found.");

  const logsUrl = config.tunnelUrl?.split('?')[0].replace('-code.', '-logs.') || `https://logs-${serverId.slice(0, 8)}.devboxui.com`;

  return { success: true, logsUrl };
}

/**
 * Fetches live projects from the server via the secure logs tunnel.
 * Performs the fetch on the server side to bypass Cloudflare Access and CORS.
 */
export async function getLiveProjects(serverId: string) {
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);
  if (!config) throw new Error("Server not found.");

  const logsUrl = config.tunnelUrl?.split('?')[0].replace('-code.', '-logs.') || `https://logs-${serverId.slice(0, 8)}.devboxui.com`;

  try {
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
      const data = await resp.json() as { projects?: string[] };
      return { success: true, projects: data.projects || [] };
    }
    
    return { success: false, error: `Fetch failed: ${resp.status} ${resp.statusText}` };
  } catch (error) {
    console.error("Failed to fetch live projects:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Provisions a new server configuration for manual setup (e.g. Contabo).
 * Sets up Cloudflare resources and optionally bootstraps via SSH if credentials are provided.
 */
export async function provisionManualServer(customName: string, provider: string = 'contabo', manualIp?: string, manualPassword?: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const settings = await getUserSettings();
  if (!settings) throw new Error("Settings missing.");

  const cfApi = new CloudflareApiService(env);

  const serverId = crypto.randomUUID();
  const shortId = serverId.slice(0, 8);
  const name = customName || `devbox-${shortId}`;
  const userName = generateUniqueUsername(userEmail);
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const hostname = `${safeName}-code.devboxui.com`;

  const rootPassword = manualPassword || Math.random().toString(36).slice(-10);
  const config: ServerConfig = {
    id: serverId,
    ip: manualIp || 'manual-setup',
    userName,
    userEmail,
    status: manualIp ? 'provisioning' : 'waiting-for-bootstrap',
    detailedStatus: manualIp ? 'Starting automated SSH bootstrap...' : 'Waiting for manual bootstrap...',
    rootPassword,
    sshPrivateKey: settings.sshPrivateKey,
    sshPublicKey: settings.sshPublicKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tunnelUrl: `https://${hostname}/?folder=/home/${userName}/workspace`,
    projects: [],
    provider: provider as 'hetzner' | 'contabo' | 'custom',
    logs: [manualIp ? `Automated SSH provisioning started for ${manualIp}` : 'Manual provisioning initiated. Waiting for bootstrap script.']
  };

  try {
    // 1. Cloudflare Automation
    const tunnelResult = await cfApi.createTunnel(`tunnel-${serverId}`);
    config.tunnelId = tunnelResult.id;
    config.tunnelToken = tunnelResult.token;
    config.providerName = provider === 'contabo' ? 'Custom' : (provider || 'Custom');
    config.hostname = hostname;

    await cfApi.setupHostname(hostname, tunnelResult.id);
    await cfApi.setupAccess(hostname, userEmail);

    const logsHostname = `${name}-logs.devboxui.com`;
    await cfApi.setupHostname(logsHostname, tunnelResult.id, "http://localhost:8000");
    await cfApi.setupAccess(logsHostname, userEmail);

    const provisioningToken = crypto.randomUUID();
    config.provisioningToken = provisioningToken;

    const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
    const callbackUrl = `${requestHost}/api/provisioning/status`;
    const serviceToken = await cfApi.getOrCreateServiceToken(kv);
    await cfApi.authorizeServiceToken(requestHost.replace('https://', ''), serviceToken.id);

    // 2. Generate Bootstrap Script
    const bootstrapScript = getBootstrapScript(
      userName,
      userEmail,
      tunnelResult.token,
      env.MANAGEMENT_SSH_PUBLIC_KEY || '',
      settings.sshPublicKey,
      serverId,
      provisioningToken,
      callbackUrl,
      rootPassword,
      serviceToken.id,
      serviceToken.client_secret,
      undefined,
      provider === 'contabo' ? 'Custom' : (provider || 'Custom'),
      hostname
    );

    // 3. Generate One-Liner (Base64 to survive all shells)
    const base64Script = Buffer.from(bootstrapScript).toString('base64');
    const command = `echo "${base64Script}" | base64 -d | bash `;
    config.bootstrapCommand = command;

    // 4. Save to KV (Multi-tenant listing)
    const serverKey = `servers:${userEmail}:${serverId}`;
    await kv.put(serverKey, JSON.stringify(config));

    // Fast-lookup index for the bootstrap API
    await kv.put(`token:${provisioningToken}`, JSON.stringify({ serverKey, serverId }));

    return { success: true, server: config, command };
  } catch (error) {
    console.error("Manual provisioning setup failed:", error);
    throw error;
  }
}

/**
 * Provisions a new server automatically via Contabo API and Cloud-Init.
 */
export async function provisionContaboServer(
  customName: string,
  productId: string = 'V1', // Standard VPS S
  region: string = 'EU',
  imageId: string = 'ubuntu-24.04'
) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  // 1. Fetch User Settings
  const settings = await getUserSettings();
  if (!settings) throw new Error("Could not retrieve user settings.");

  const credentials = {
    clientId: settings.contaboClientId || env.CONTABO_CLIENT_ID || '',
    clientSecret: settings.contaboClientSecret || env.CONTABO_CLIENT_SECRET || '',
    apiUsername: settings.contaboUsername || env.CONTABO_API_USERNAME || '',
    apiPassword: settings.contaboPassword || env.CONTABO_API_PASSWORD || ''
  };

  if (!credentials.clientId || !credentials.clientSecret || !credentials.apiUsername || !credentials.apiPassword) {
    throw new Error("Contabo API credentials missing. Please set them in Settings.");
  }

  const cfApi = new CloudflareApiService(env);
  const contaboApi = new ContaboApiService(env, credentials);

  // 2. Initialize Server Configuration
  const serverId = crypto.randomUUID();
  const shortId = serverId.slice(0, 8);
  const name = customName || `devbox-${shortId}`;
  const userName = generateUniqueUsername(userEmail);
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const hostname = `${safeName}-code.devboxui.com`;

  const rootPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-6);
  const config: ServerConfig = {
    id: serverId,
    ip: 'pending',
    userName,
    userEmail,
    status: 'provisioning',
    rootPassword: rootPassword,
    sshPrivateKey: settings.sshPrivateKey,
    sshPublicKey: settings.sshPublicKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [`Starting Cloud-Init provisioning (${productId} in ${region}) via Contabo API...`],
    tunnelUrl: `https://${hostname}/?folder=/home/${userName}/workspace`,
    projects: [],
    provider: 'contabo',
    serverType: productId
  };

  try {
    // 3. Setup Networking (Cloudflare)
    const tunnelResult = await cfApi.createTunnel(`tunnel-${serverId}`);
    config.tunnelId = tunnelResult.id;
    await cfApi.setupHostname(hostname, tunnelResult.id);
    await cfApi.setupAccess(hostname, userEmail);

    const provisioningToken = crypto.randomUUID();
    config.provisioningToken = provisioningToken;

    const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
    const callbackUrl = `${requestHost}/api/provisioning/status`;
    const serviceToken = await cfApi.getOrCreateServiceToken(kv);
    await cfApi.authorizeServiceToken(requestHost.replace('https://', ''), serviceToken.id);

    // 4. Register SSH Key as Secret in Contabo
    const secretName = `key-${shortId}`;
    const secretId = await contaboApi.createSecret(secretName, settings.sshPublicKey);

    // 5. Generate Cloud-Init
    const bootstrapScript = getBootstrapScript(
      userName,
      userEmail,
      tunnelResult.token,
      env.MANAGEMENT_SSH_PUBLIC_KEY || '',
      settings.sshPublicKey,
      serverId,
      provisioningToken,
      callbackUrl,
      rootPassword,
      serviceToken.id,
      serviceToken.client_secret,
      undefined,
      'Contabo',
      hostname
    );

    // 6. Launch Instance
    const instance = await contaboApi.createInstance({
      productId,
      region,
      imageId,
      name,
      userData: bootstrapScript,
      sshKeys: [secretId.id]
    });

    config.ip = instance.ipAddress;
    config.contaboInstanceId = instance.instanceId;
    config.contaboSecretId = secretId.id;
    config.status = 'provisioning';
    config.detailedStatus = 'Initializing...';

    const kvKey = `servers:${userEmail}:${serverId}`;
    await kv.put(kvKey, JSON.stringify(config));

    try {
      console.log(`[Provisioning Contabo] Server IP resolved as ${instance.ipAddress}. Triggering dependent policy sync...`);
      await syncAllDependentPolicies(serverId, instance.ipAddress);
    } catch (err) {
      console.error("[Provisioning Contabo] Failed to sync dependent policies on provision:", err);
    }

    // Create Direct SSH DNS record in Cloudflare
    try {
      const directHostname = hostname.replace('-code.', '.').replace('-direct', '');
      console.log(`Setting up Direct SSH DNS A record for ${directHostname} to ${instance.ipAddress}...`);
      await cfApi.setupARecord(directHostname, instance.ipAddress);
    } catch (err) {
      console.error("Failed to setup Direct SSH DNS record for Contabo:", err);
    }

    // 7. Save final state to KV
    config.updatedAt = new Date().toISOString();
    await kv.put(kvKey, JSON.stringify(config));

    return { success: true, server: config };
  } catch (e: unknown) {
    const error = e as Error;
    console.error("Contabo provisioning failed:", error);
    config.status = 'error';
    if (!config.logs) config.logs = [];
    config.logs.push(`Error: ${error.message}`);
    await kv.put(`servers:${userEmail}:${serverId}`, JSON.stringify(config));
    throw error;
  }
}

/**
 * Returns available Contabo regions and products for the UI.
 */
export async function getContaboOptions() {
  return {
    serverTypes: [
      { id: 'V1', name: 'VPS S', cores: 4, memory: 8, disk: 50, price_monthly: '4.50', architecture: 'x86' },
      { id: 'V2', name: 'VPS M', cores: 6, memory: 16, disk: 100, price_monthly: '8.50', architecture: 'x86' },
      { id: 'V3', name: 'VPS L', cores: 8, memory: 30, disk: 200, price_monthly: '13.50', architecture: 'x86' },
      { id: 'V4', name: 'VPS XL', cores: 10, memory: 60, disk: 400, price_monthly: '24.50', architecture: 'x86' },
    ],
    locations: [
      { id: 'EU', name: 'EU', city: 'Germany' },
      { id: 'US-C', name: 'US-C', city: 'United States' },
      { id: 'ASIA', name: 'ASIA', city: 'Singapore' },
      { id: 'AU', name: 'AU', city: 'Australia' },
    ],
    images: [
      { id: 'ubuntu-24.04', name: 'ubuntu-24.04', description: 'Ubuntu 24.04', architecture: 'x86' },
      { id: 'ubuntu-22.04', name: 'ubuntu-22.04', description: 'Ubuntu 22.04', architecture: 'x86' },
      { id: 'debian-12', name: 'debian-12', description: 'Debian 12', architecture: 'x86' },
    ]
  };
}

export async function updateServerProvider(serverId: string, data: { hetznerServerId?: number; contaboInstanceId?: number }) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const kvKey = `servers:${userEmail}:${serverId}`;
  const existing = await kv.get(kvKey);
  if (!existing) throw new Error("Server not found.");

  const config = JSON.parse(existing) as ServerConfig;
  
  if (data.hetznerServerId) {
    config.hetznerServerId = data.hetznerServerId;
    config.providerName = 'Hetzner';
    config.provider = 'hetzner';
  } else if (data.contaboInstanceId) {
    config.contaboInstanceId = data.contaboInstanceId;
    config.providerName = 'Contabo';
    config.provider = 'contabo';
  }

  config.updatedAt = new Date().toISOString();
  if (!config.logs) config.logs = [];
  config.logs.push(`Associated with cloud provider: ${config.providerName}`);

  await kv.put(kvKey, JSON.stringify(config));
  return config;
}

export async function syncServerAccessPolicies(serverId: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const kvKey = `servers:${userEmail}:${serverId}`;
  const serverVal = await kv.get(kvKey);
  if (!serverVal) throw new Error(`Server ${serverId} not found for sync.`);
  const server = JSON.parse(serverVal) as ServerConfig;

  const allowedPeers = server.allowedPeers || [];
  const peerIps: string[] = [];

  if (allowedPeers.length > 0) {
    const allServers = await getServers();
    for (const peerId of allowedPeers) {
      const peer = allServers.find(s => s.id === peerId);
      if (peer && peer.ip && peer.ip !== 'pending') {
        peerIps.push(peer.ip);
      }
    }
  }

  const cfApi = new CloudflareApiService(env);
  
  if (server.hostname) {
    console.log(`[Access Sync] Syncing peer bypass on ${server.hostname} with IPs:`, peerIps);
    await cfApi.syncPeerBypassPolicy(server.hostname, peerIps);
  }

  if (server.projects) {
    for (const project of server.projects) {
      console.log(`[Access Sync] Syncing peer bypass on project ${project.domain} with IPs:`, peerIps);
      await cfApi.syncPeerBypassPolicy(project.domain, peerIps);
    }
  }
}

export async function syncAllDependentPolicies(peerServerId: string, newIp: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return;

  const list = await kv.list({ prefix: `servers:${userEmail}:` });
  for (const key of list.keys) {
    const val = await kv.get(key.name);
    if (!val) continue;
    const server = JSON.parse(val) as ServerConfig;

    if (server.allowedPeers && server.allowedPeers.includes(peerServerId)) {
      console.log(`[Access Sync] Server ${server.id} allows ${peerServerId} which got new IP ${newIp}. Syncing...`);
      try {
        await syncServerAccessPolicies(server.id);
      } catch (err) {
        console.error(`[Access Sync] Failed to sync dependent policy on ${server.id}:`, err);
      }
    }
  }
}

export async function updateServerAllowedPeers(serverId: string, allowedPeers: string[]) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const kvKey = `servers:${userEmail}:${serverId}`;
  const serverVal = await kv.get(kvKey);
  if (!serverVal) throw new Error("Server not found.");
  const server = JSON.parse(serverVal) as ServerConfig;

  server.allowedPeers = allowedPeers;
  server.updatedAt = new Date().toISOString();
  if (!server.logs) server.logs = [];
  server.logs.push(`Updated allowed peer DevBoxes to: ${allowedPeers.join(', ') || 'none'}`);

  await kv.put(kvKey, JSON.stringify(server));

  await syncServerAccessPolicies(serverId);

  return server;
}
