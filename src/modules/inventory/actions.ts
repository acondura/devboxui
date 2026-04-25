'use server';

import { ServerConfig } from './types';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { HetznerApiService } from '@/lib/hetzner-api';

/**
 * Executes a command on a remote server via the SSH-as-a-Service Worker.
 */
const runRemoteCommand = async (config: {
  host: string;
  username: string;
  password?: string;
  privateKey?: string;
  command: string;
}) => {
  const env = await getCloudflareEnv();
  const serviceUrl = env.SSH_SERVICE_URL;
  const secret = env.SSH_SERVICE_SECRET;

  if (!serviceUrl || !secret) {
    throw new Error("SSH Service configuration missing (SSH_SERVICE_URL or SSH_SERVICE_SECRET).");
  }

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`
    },
    body: JSON.stringify(config)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch { }
    throw new Error(`SSH Service Error: ${errorMessage}`);
  }

  return await response.json() as { success: boolean; stdout: string; stderr: string; code: number };
};

/**
 * Generates the full sequence of bash commands to bootstrap the server.
 */
function getBootstrapScript(username: string, userEmail: string, tunnelToken: string, managementKey: string, userSSHKey: string, serverId: string, provisioningToken: string, callbackUrl: string, rootPassword?: string, serviceTokenId?: string, serviceTokenSecret?: string, hetznerToken?: string) {
  return `#!/bin/bash
set -e

# --- 0. Configuration ---
DEV_USER="${username}"
ROOT_PASSWORD="${rootPassword || ''}"
SERVER_ID="${serverId}"
PROV_TOKEN="${provisioningToken}"
CALLBACK_URL="${callbackUrl}"
GIT_USER_NAME="${username}"
GIT_USER_EMAIL="${userEmail}"
MANAGEMENT_SSH_KEY="${managementKey}"
USER_SSH_KEY="${userSSHKey}"
TUNNEL_TOKEN="${tunnelToken}"
HETZNER_TOKEN="${hetznerToken || ''}"

SERVICE_TOKEN_ID="${serviceTokenId || ''}"
SERVICE_TOKEN_SECRET="${serviceTokenSecret || ''}"

# --- 1. Immediate Heartbeat & Emergency Tools ---
# UNLOCK root immediately (Ubuntu locks it by default when SSH keys are present)
passwd -u root || echo "Root already unlocked"

# SET PASSWORDS IMMEDIATELY (so the user can get in via SSH while setup runs)
echo "root:${rootPassword}" | chpasswd
useradd -m -s /bin/bash "${username}" || echo "User already exists"
echo "${username}:${rootPassword}" | chpasswd
usermod -aG sudo "${username}" || echo "Sudo group add failed"

# Wait for network to be ready
echo "Waiting for network..."
for i in {1..30}; do
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        echo "Network is up!"
        break
    fi
    echo "Waiting for network... ($i/30)"
    sleep 2
done

# Helper to update Hetzner server name with status
hetzner_heartbeat() {
    local status_msg="$1"
    mkdir -p /var/www/debug
    echo "$status_msg" > /var/www/debug/status.txt
    
    if [ -n "$HETZNER_TOKEN" ] && [ -n "$SERVER_ID" ]; then
        local clean_msg=$(echo "$status_msg" | tr ' ' '-')
        if command -v curl >/dev/null 2>&1; then
            curl -s -X PUT "https://api.hetzner.cloud/v1/servers/$SERVER_ID" \
                -H "Authorization: Bearer $HETZNER_TOKEN" \
                -H "Content-Type: application/json" \
                -d "{\"name\": \"${username}-$clean_msg\"}" || true
        elif command -v wget >/dev/null 2>&1; then
            wget -qO- --method=PUT --header="Authorization: Bearer $HETZNER_TOKEN" \
                --header="Content-Type: application/json" \
                --body-data="{\"name\": \"${username}-$clean_msg\"}" \
                "https://api.hetzner.cloud/v1/servers/$SERVER_ID" || true
        fi
    fi
}

# START BEATING
hetzner_heartbeat "Booting-system"

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
        status_txt = "Initializing..."
        if os.path.exists("/var/www/debug/status.txt"):
            with open("/var/www/debug/status.txt", "r") as f:
                status_txt = f.read().strip()

        data = {
            "docker": docker_status,
            "setup": setup_logs,
            "status": status_txt,
            "timestamp": subprocess.getoutput('date')
        }
        self.wfile.write(json.dumps(data).encode())

PORT = 8080
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), DebugHandler) as httpd:
    httpd.serve_forever()
PYEOF

# Start the server in the background with nohup to ensure survival
nohup python3 /var/www/debug/server.py > /var/log/debug-server.log 2>&1 &

# --- 2. System Resilience & Immediate Reporting ---
export DEBIAN_FRONTEND=noninteractive
# Open debug port
ufw allow 8080/tcp || echo "ufw not present or failed"

# CRITICAL: Wait for apt locks (background updates often lock apt on fresh boot)
# We use a simple apt-get update retry loop instead of 'fuser' (which might be missing)
echo "Waiting for apt locks..."
for i in {1..20}; do
    if apt-get update 2>&1 | grep -q "Could not get lock"; then
        echo "Apt is locked, retrying in 5s... ($i/20)"
        sleep 5
    else
        echo "Apt lock acquired."
        break
    fi
done


# Helper for reporting status
report_status() {
    local status_msg="$1"
    echo "Reporting status: $status_msg"
    hetzner_heartbeat "$status_msg"
    # Attempt to report status with retry logic and tool fallback
    for i in 1 2 3; do
      local response_code="000"
      if command -v curl >/dev/null 2>&1; then
        response_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$CALLBACK_URL" \
          -H "Content-Type: application/json" \
          -H "CF-Access-Client-Id: $SERVICE_TOKEN_ID" \
          -H "CF-Access-Client-Secret: $SERVICE_TOKEN_SECRET" \
          -d "{\\\"serverId\\\": \\\"$SERVER_ID\\\", \\\"token\\\": \\\"$PROV_TOKEN\\\", \\\"status\\\": \\\"$status_msg\\\"}")
      elif command -v wget >/dev/null 2>&1; then
        # Fallback to wget if curl is not yet available
        wget -q --spider --method=POST --header="Content-Type: application/json" \
          --header="CF-Access-Client-Id: $SERVICE_TOKEN_ID" \
          --header="CF-Access-Client-Secret: $SERVICE_TOKEN_SECRET" \
          --body-data="{\"serverId\": \"$SERVER_ID\", \"token\": \"$PROV_TOKEN\", \"status\": \"$status_msg\"}" \
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
MAX_WAIT=300
WAIT_COUNT=0
while fuser /var/lib/dpkg/lock-mirror >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
   if [ $WAIT_COUNT -gt $MAX_WAIT ]; then echo "Apt lock timeout"; break; fi
   echo "Waiting for other software managers to finish..."
   sleep 5
   WAIT_COUNT=$((WAIT_COUNT+5))
done

report_status "Hardening server and setting up users..."
chage -d $(date +%Y-%m-%d) root

if [ -n "$ROOT_PASSWORD" ]; then
    echo "root:$ROOT_PASSWORD" | chpasswd
fi

echo "⚠️ SETUP IN PROGRESS - Please wait a few minutes before using the server." > /etc/motd
set -x 

# Retry apt-get update to be safe
apt-get update || (sleep 10 && apt-get update)
apt-get install -y ca-certificates curl gnupg lsb-release ufw

# --- 3. Create User '$DEV_USER' & SSH ---
if ! id "$DEV_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEV_USER"
    if [ -n "$ROOT_PASSWORD" ]; then
        echo "$DEV_USER:$ROOT_PASSWORD" | chpasswd
        chage -d $(date +%Y-%m-%d) "$DEV_USER"
    fi
    usermod -aG sudo "$DEV_USER"
    echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/"$DEV_USER"
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

# --- 3. Install Docker ---
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
report_status "Installing Docker..."
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker "$DEV_USER"

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

# --- 5. Deploy Code-Server ---
C_ROOT="/home/\$DEV_USER"
mkdir -p "\$C_ROOT/workspace" "\$C_ROOT/config/data/User"

# Pre-configure (Host-side)
sudo -u "\$DEV_USER" bash -c "export HOME=\$C_ROOT; curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended"

# Robust theme update (Host)
if [ -f "\$C_ROOT/.bashrc" ]; then
    grep -v "OSH_THEME=" "\$C_ROOT/.bashrc" > "\$C_ROOT/.bashrc.tmp"
    echo 'OSH_THEME="90210"' >> "\$C_ROOT/.bashrc.tmp"
    mv "\$C_ROOT/.bashrc.tmp" "\$C_ROOT/.bashrc"
fi

# Base64 encoded configs to survive all shells
echo 'W3VzZXJdCiAgICBuYW1lID0gR2l0SHViIFVzZXIKICAgIGVtYWlsID0gZGV2Ym94QHVzZXIubG9jYWwK' | base64 -d > "\$C_ROOT/.gitconfig"
echo 'YmluZC1hZGRyOiAwLjAuMC4wOjg0NDMKYXV0aDogbm9uZQpjZXJ0OiBmYWxzZQo=' | base64 -d > "\$C_ROOT/config/config.yaml"
echo 'ewogICAgImVkaXRvci5mb250U2l6ZSI6IDE1LAogICAgInRlcm1pbmFsLmludGVncmF0ZWQuZm9udFNpemUiOiAxNSwKICAgICJ3b3JrYmVuY2guY29sb3JUaGVtZSI6ICJEYXJrKyIKfQo=' | base64 -d > "\$C_ROOT/config/data/User/settings.json"

chown -R "\$DEV_USER":"\$DEV_USER" "\$C_ROOT"

# Wait for docker daemon
while ! docker info >/dev/null 2>&1; do
  echo "Waiting for Docker..."
  sleep 2
done

report_status "Deploying Code-Server..."
# Start code-server container
docker run -d \\
  --name=code-server \\
  -e PUID=1000 -e PGID=1000 \\
  -e SUDO_PASSWORD= \\
  -e DEFAULT_WORKSPACE=/home/\$DEV_USER/workspace \\
  -v /home/\$DEV_USER/config:/config \\
  -v /home/\$DEV_USER:/home/\$DEV_USER \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /usr/bin/docker:/usr/bin/docker \\
  -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins \\
  -p 127.0.0.1:8443:8443 \\
  -p 9003:9003 \\
  --restart unless-stopped \\
  lscr.io/linuxserver/code-server:latest

# Final Container Setup (Wait for container to be ready)
MAX_RETRIES=30
COUNT=0
while ! docker ps | grep -q code-server; do
    if [ "\$COUNT" -ge "\$MAX_RETRIES" ]; then echo "Container failed to start"; exit 1; fi
    echo "Waiting for code-server container..."
    sleep 2
    COUNT=\$((COUNT + 1))
done

# Final Container Setup (Synchronous & Robust)
docker exec -u root code-server bash -c "
    set -e
    echo \"--- Configuring Container Permissions ---\"
    chmod 666 /var/run/docker.sock || true
    groupadd -g \$(stat -c '%g' /var/run/docker.sock) docker_host || true
    usermod -aG docker_host abc || true
    echo \"abc ALL=(ALL) NOPASSWD:ALL\" >> /etc/sudoers

    echo \"--- Installing Dependencies ---\"
    apt-get update
    apt-get install -y gnupg2 curl ca-certificates git sudo vim

    echo \"--- Installing DDEV ---\"
    curl -fsSL https://apt.fury.io/ddev/gpg.key | gpg --dearmor | tee /etc/apt/keyrings/ddev.gpg > /dev/null
    echo \"deb [signed-by=/etc/apt/keyrings/ddev.gpg] https://apt.fury.io/ddev/ * *\" | tee /etc/apt/sources.list.d/ddev.list
    apt-get update && apt-get install -y ddev

    echo \"--- Installing Oh-My-Bash ---\"
    # Install for abc user
    sudo -u abc bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh) --unattended\" || true
    
    # Ensure theme is set correctly
    if [ -f /config/.bashrc ]; then
        sed -i 's/OSH_THEME=.*/OSH_THEME=\"90210\"/' /config/.bashrc
    fi

    echo \"--- Installing VS Code Extensions ---\"
    sudo -u abc code-server --install-extension xdebug.php-debug --install-extension vscodevim.vim || true
"

# Firewall
ufw allow 22/tcp
ufw --force enable

# Finished
report_status "Ready"
echo "✅ SETUP FINISHED - Server is ready for use." > /etc/motd
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
      const script = `
        DEV_USER="${server.userName}"
        mkdir -p /home/\$DEV_USER/.ssh
        echo "${newPublicKey}" > /home/\$DEV_USER/.ssh/authorized_keys
        chown -R \$DEV_USER:\$DEV_USER /home/\$DEV_USER/.ssh
        chmod 700 /home/\$DEV_USER/.ssh
        chmod 600 /home/\$DEV_USER/.ssh/authorized_keys
        echo "✅ SSH key updated for \$DEV_USER"
      `;

      await executeSshCommands(server.ip, server.rootPassword, script, (log) => console.log(`[Sync ${server.ip}] ${log}`));
      results.push({ id: server.id, success: true });
    } catch (error) {
      console.error(`Failed to sync key to ${server.ip}:`, error);
      results.push({ id: server.id, success: false, error });
    }
  }

  return { success: true, results };
}

/**
 * Executes commands on a remote server via SSH (Remote Service).
 */
async function executeSshCommands(ip: string, password: string, script: string, onLog: (log: string) => void) {
  onLog(`Sending bootstrap script to remote SSH service for ${ip}...`);

  const result = await runRemoteCommand({
    host: ip,
    username: 'root',
    password: password,
    command: script
  });

  if (result.stdout) onLog(result.stdout);
  if (result.stderr) onLog(`[STDERR] ${result.stderr}`);

  if (!result.success || result.code !== 0) {
    throw new Error(`SSH Command failed with code ${result.code}`);
  }

  return true;
}

/**
 * Retrieves per-user settings (like Hetzner API Token) from KV.
 */
export async function getUserSettings() {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return null;

  const data = await kv.get(`settings:${userEmail}`);
  if (!data) return { hetznerToken: '', sshPublicKey: '' };

  return JSON.parse(data) as { hetznerToken: string; sshPublicKey: string };
}

/**
 * Saves per-user settings to KV.
 */
export async function saveUserSettings(settings: { hetznerToken: string; sshPublicKey: string }) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  await kv.put(`settings:${userEmail}`, JSON.stringify(settings));
  return { success: true };
}

/**
 * Provisions a new server automatically via Hetzner API and Cloud-Init.
 */
export async function provisionServer(
  customName?: string,
  serverType: string = 'cpx21',
  location: string = 'nbg1',
  image: string = 'ubuntu-24.04'
) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  // 0. Fetch User Token
  const settings = await getUserSettings();
  const hetznerToken = settings?.hetznerToken || env.HETZNER_API_TOKEN;

  if (!hetznerToken) {
    throw new Error("Hetzner API Token is missing. Please set it in Settings.");
  }

  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env, hetznerToken);

  // 1. Fetch User SSH Key
  const sshPublicKey = settings?.sshPublicKey;
  if (!sshPublicKey) {
    throw new Error("SSH Public Key is missing. Please set it in Settings before adding a server.");
  }

  // 2. Initialize Server Configuration
  const serverId = crypto.randomUUID();
  const shortId = serverId.slice(0, 8);
  const name = customName || `devbox-${shortId}`;
  const userName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const hostname = `${name}-code.devboxui.com`;

  const rootPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-6);
  const config: ServerConfig = {
    id: serverId,
    ip: 'pending',
    userName,
    userEmail,
    status: 'provisioning',
    rootPassword: rootPassword, // NEW: Saved to dashboard
    sshPrivateKey: '',
    sshPublicKey: sshPublicKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [`Starting Cloud-Init provisioning (${serverType} in ${location}) via Hetzner API...`],
    tunnelUrl: `https://${hostname}`,
    projects: []
  };

  let tunnelId: string | undefined;
  let hetznerServerId: number | undefined;

  try {
    // 3. Cloudflare Automation: Create Tunnel & DNS
    console.log("Creating Cloudflare Tunnel...");
    const tunnelResult = await cfApi.createTunnel(`tunnel-${serverId}`);
    tunnelId = tunnelResult.id;
    config.tunnelId = tunnelId;

    console.log("Setting up DNS and Routing...");
    await cfApi.setupHostname(hostname, tunnelResult.id);

    console.log(`Setting up Zero Trust Access for ${userEmail}...`);
    await cfApi.setupAccess(hostname, userEmail);

    const logsHostname = `${name}-logs.devboxui.com`;
    console.log(`Setting up Logs Tunnel for ${logsHostname}...`);
    await cfApi.setupHostname(logsHostname, tunnelResult.id, "http://localhost:8000");
    await cfApi.setupAccess(logsHostname, userEmail);
    
    config.detailedStatus = 'Logs endpoint created';

    // 4. Generate Cloud-Init Script with baked-in SSH keys and Tunnel token
    const managementKey = env.MANAGEMENT_SSH_PUBLIC_KEY || '';
    const userSSHKey = settings?.sshPublicKey || '';
    const provisioningToken = crypto.randomUUID();
    config.provisioningToken = provisioningToken;
    config.detailedStatus = 'Starting bootstrap...';
    
    // Construct callback URL dynamically
    const requestHost = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';
    const callbackUrl = `${requestHost}/api/provisioning/status`; 
    console.log(`[Provisioning] Callback URL: ${callbackUrl}`);
    
    // 3.5 Setup Service Token for bypassing Cloudflare Access during provisioning
    console.log("[Provisioning] Setting up Cloudflare Access Service Token...");
    const serviceToken = await cfApi.getOrCreateServiceToken(kv);
    console.log(`[Provisioning] Service Token ID: ${serviceToken.id}`);
    
    await cfApi.authorizeServiceToken(requestHost.replace('https://', ''), serviceToken.id);
    console.log("[Provisioning] Authorization step complete.");
    
    const bootstrapScript = getBootstrapScript(
      userName, 
      userEmail,
      tunnelResult.token, 
      managementKey, 
      userSSHKey, 
      serverId, 
      provisioningToken, 
      callbackUrl,
      rootPassword,
      serviceToken.client_id,
      serviceToken.client_secret,
      hetznerToken
    );

    // 5. Hetzner Automation: Manage SSH Keys
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
        const foundKey = existingKeys.find(ex => ex.public_key.trim().includes(cleanedKey));
        
        if (foundKey) {
          sshKeyIds.push(foundKey.id);
        } else {
          console.log(`Registering key '${k.name}' with Hetzner...`);
          const created = await hetznerApi.createSSHKey(k.name, k.key);
          if (created) sshKeyIds.push(created.id);
        }
      } catch (e) {
        console.error(`Warning: Failed to register SSH key ${k.name}:`, e);
      }
    }

    if (sshKeyIds.length === 0) {
      throw new Error("Failed to register any SSH keys with Hetzner. Aborting launch to prevent root password fallback.");
    }

    console.log(`Requesting new ${serverType} server '${name}' in ${location} with ${sshKeyIds.length} keys...`);
    const hetznerResult = await hetznerApi.createServer(name, bootstrapScript, serverType, location, image, sshKeyIds);
    hetznerServerId = hetznerResult.server.id;
    config.hetznerServerId = hetznerServerId;
    
    // Store the root password generated by Hetzner
    if (hetznerResult.root_password) {
      console.log("Captured root password from Hetzner.");
      config.rootPassword = hetznerResult.root_password;
    }

    const ip = hetznerResult.server.public_net.ipv4.ip;
    config.ip = ip;
    config.logs = [...(config.logs || []), `Hetzner server created at ${ip}`];

    // 5. Success! Commit to KV
    config.status = 'provisioning'; // Stay in provisioning until callback
    config.detailedStatus = 'Initializing...';
    config.updatedAt = new Date().toISOString();
    config.logs = [...(config.logs || []), 'Server creation triggered. Provisioning will continue in the background.'];

    const kvKey = `servers:${userEmail}:${serverId}`; // Use serverId instead of IP to be stable
    await kv.put(kvKey, JSON.stringify(config));

    return { success: true, server: config };

  } catch (error) {
    console.error("Provisioning failed, cleaning up...", error);

    // Cleanup Cloudflare resources
    if (tunnelId) {
      try { await cfApi.deleteTunnel(tunnelId); } catch (e) { console.error("Cleanup: Failed to delete tunnel", e); }
    }

    // Cleanup DNS Record
    if (hostname) {
      try { await cfApi.deleteDnsRecord(hostname); } catch (e) { console.error("Cleanup: Failed to delete DNS record", e); }
    }

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
        await kv.delete(key.name).catch(() => {});
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
          if (hs.public_net?.ipv4?.ip) s.ip = hs.public_net.ipv4.ip;

          // 2. Check for Heartbeat in name (e.g. "opis-Installing-Docker")
          // We look for the last part after the dash
          if (hs.name.includes('-')) {
            const parts = hs.name.split('-');
            const statusStr = parts[parts.length - 1];
            
            if (statusStr === 'Ready') {
                s.status = 'ready';
                s.detailedStatus = 'Ready';
            } else if (['Booting', 'Installing', 'system', 'Docker', 'DDEV', 'Code'].some(st => statusStr.includes(st))) {
                s.detailedStatus = 'Installing ' + statusStr;
            }
          }
          
          // ELEGANT PROBING: If in setup phase, try a direct "pull" from the IP:8080 exporter
          const setupStatuses: string[] = ['provisioning', 'Initializing', 'initializing'];
          const isSettingUp = setupStatuses.includes(s.status as string);
          if (isSettingUp) {
            try {
              const controller = new AbortController();
              const id = setTimeout(() => controller.abort(), 800); // Very fast probe
              const probeResp = await fetch(`http://${s.ip}:8080`, { 
                signal: controller.signal,
                cache: 'no-store'
              });
              clearTimeout(id);

              if (probeResp.ok) {
                const probeData = await probeResp.json() as { status: string };
                if (probeData.status) {
                  s.detailedStatus = `(Live) ${probeData.status}`;
                  if (probeData.status === 'Ready') {
                    s.status = 'ready';
                  }
                }
              }
            } catch {
              // Probe failed (booting), ignore
            }
          } else if (hs.status !== 'running') {
            // If KV says ready but Hetzner says off, sync it
            s.status = 'off';
          }

          finalServers.push(s);
          // Remove from map so we don't add it as "discovered" later
          hetznerMap.delete(hs.id.toString());
        } else {
          // GHOST DETECTION WITH GRACE PERIOD
          const serverAgeMinutes = (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60);
          
          if (serverAgeMinutes > 2) {
            console.log(`Self-healing: Removing ghost server ${s.id} (not in Hetzner after ${Math.round(serverAgeMinutes)}m)`);
            await kv.delete(`servers:${userEmail}:${s.id}`).catch(() => {});
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
export async function addProject(serverId: string, projectName: string) {
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
  const cleanName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const projectDomain = `${cleanName}-app.devboxui.com`;

  // 3. Update Cloudflare Tunnel, DNS & Access
  await cfApi.setupHostname(projectDomain, config.tunnelId);
  console.log(`Setting up Zero Trust Access for project ${projectDomain}...`);
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
 * Deletes a server and cleans up Cloudflare resources.
 */
export async function deleteServer(serverId: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const settings = await getUserSettings();

  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env, settings?.hetznerToken);

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
  } catch (e) {
    console.error("Cleanup process encountered errors, proceeding with KV removal:", e);
  }

  // 3. Remove from KV
  // Note: We use the IP in the key, so we need it. If it's still 'pending', we'll need to find the key.
  const kvKey = `servers:${userEmail}:${config.ip}`;
  await kv.delete(kvKey);

  return { success: true };
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
    const [serverTypes, locations, images] = await Promise.all([
      hetznerApi.getServerTypes(),
      hetznerApi.getLocations(),
      hetznerApi.getImages()
    ]);

    return { serverTypes, locations, images };
  } catch (error) {
    console.error("Failed to fetch Hetzner options:", error);
    return { serverTypes: [], locations: [], images: [] };
  }
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

  const logsUrl = config.tunnelUrl?.replace('-code.', '-logs.') || `https://logs-${serverId.slice(0, 8)}.devboxui.com`;
  
  try {
    // In the dashboard, we will fetch from this URL directly from the browser
    // to take advantage of the user's existing Cloudflare Access session.
    return { success: true, logsUrl };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Manually forces a server's status to 'ready'.
 */
export async function forceReadyServer(serverId: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) throw new Error("KV database missing.");

  const list = await kv.list({ prefix: `servers:${userEmail}:` });
  let serverKey = "";
  let config: ServerConfig | null = null;

  for (const key of list.keys) {
    const val = await kv.get(key.name);
    if (!val) continue;
    const c = JSON.parse(val) as ServerConfig;
    if (c.id === serverId) {
      serverKey = key.name;
      config = c;
      break;
    }
  }

  if (!config || !serverKey) throw new Error("Server not found.");

  config.status = 'ready';
  config.detailedStatus = 'Manually forced to ready';
  config.updatedAt = new Date().toISOString();

  await kv.put(serverKey, JSON.stringify(config));
  return config;
}
