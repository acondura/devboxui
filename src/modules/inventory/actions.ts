'use server';

import { ServerConfig } from './types';
import nacl from 'tweetnacl';
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
    try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch (e) { }
    throw new Error(`SSH Service Error: ${errorMessage}`);
  }

  return await response.json() as { success: boolean; stdout: string; stderr: string; code: number };
};

/**
 * Generates the full sequence of bash commands to bootstrap the server.
 */
/**
 * Generates the full sequence of bash commands to bootstrap the server.
 */
function getBootstrapScript(username: string, publicKey: string, tunnelToken: string, managementKey: string, userSSHKey: string = '', serverId: string, provisioningToken: string, callbackUrl: string, rootPassword?: string) {
  return `#!/bin/bash
set -e

# --- 0. Configuration ---
DEV_USER="${username}"
ROOT_PASSWORD="${rootPassword || ''}"
SERVER_ID="${serverId}"
PROV_TOKEN="${provisioningToken}"
CALLBACK_URL="${callbackUrl}"
GIT_USER_NAME="DevBox User"
GIT_USER_EMAIL="${username}@devboxui.local"
MANAGEMENT_SSH_KEY="${managementKey}"
USER_SSH_KEY="${userSSHKey}"
TUNNEL_TOKEN="${tunnelToken}"

# Helper for reporting status
report_status() {
    local status_msg="$1"
    echo "Reporting status: $status_msg"
    curl -s -X POST "$CALLBACK_URL" \
      -H "Content-Type: application/json" \
      -d "{\\"serverId\\": \\"$SERVER_ID\\", \\"token\\": \\"$PROV_TOKEN\\", \\"status\\": \\"$status_msg\\"}" || true
}

# --- 1. System Update & Passwords ---
export DEBIAN_FRONTEND=noninteractive
report_status "Initializing system..."

# Wait for apt locks
while fuser /var/lib/dpkg/lock-mirror >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
   echo "Waiting for other software managers to finish..."
   sleep 5
done

report_status "Hardening server and setting up users..."
chage -d $(date +%Y-%m-%d) root

if [ -n "$ROOT_PASSWORD" ]; then
    echo "root:$ROOT_PASSWORD" | chpasswd
fi

echo "⚠️ SETUP IN PROGRESS - Please wait a few minutes before using the server." > /etc/motd
set -x 

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw

# --- 2. Create User '$DEV_USER' & SSH ---
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

# Add System Generated Key
echo "${publicKey}" >> /home/"$DEV_USER"/.ssh/authorized_keys

# Add User Custom Key
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
C_ROOT="/home/$DEV_USER"
mkdir -p "$C_ROOT/workspace" "$C_ROOT/config/data/User"

# Pre-configure (Host-side)
sudo -u "$DEV_USER" bash -c "export HOME=$C_ROOT; curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended"
sed -i "s|OSH_THEME=\"[^\"]*\"|OSH_THEME=\"90210\"|" "$C_ROOT/.bashrc"

cat <<EOF > "$C_ROOT/.gitconfig"
[user]
    name = \$GIT_USER_NAME
    email = \$GIT_USER_EMAIL
EOF

cat <<EOF > "$C_ROOT/config/config.yaml"
bind-addr: 0.0.0.0:8443
auth: none
cert: false
EOF

cat <<EOF > "$C_ROOT/config/data/User/settings.json"
{
    "editor.fontSize": 15,
    "terminal.integrated.fontSize": 15,
    "workbench.colorTheme": "Default Dark+"
}
EOF

chown -R "$DEV_USER":"$DEV_USER" "$C_ROOT"

# Wait for docker daemon
while ! docker info >/dev/null 2>&1; do
  echo "Waiting for Docker..."
  sleep 2
done

report_status "Deploying Code-Server..."
# Start code-server container
docker run -d \\
  --name=code-server \\
  -e PUID=$(id -u "$DEV_USER") -e PGID=$(id -g "$DEV_USER") \\
  -e SUDO_PASSWORD="$ROOT_PASSWORD" \\
  -e DEFAULT_WORKSPACE="$C_ROOT/workspace" \\
  -v "$C_ROOT/config":/config \\
  -v "$C_ROOT":"$C_ROOT" \\
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
    if [ $COUNT -ge $MAX_RETRIES ]; then echo "Container failed to start"; exit 1; fi
    echo "Waiting for code-server container..."
    sleep 2
    COUNT=$((COUNT+1))
done

docker exec -d -u root code-server bash -c "
    chmod 666 /var/run/docker.sock
    apt-get update && apt-get install -y curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://pkg.ddev.com/apt/gpg.key | gpg --batch --yes --dearmor -o /etc/apt/keyrings/ddev.gpg
    echo 'deb [signed-by=/etc/apt/keyrings/ddev.gpg] https://pkg.ddev.com/apt/ * *' > /etc/apt/sources.list.d/ddev.list
    apt-get update && apt-get install -y ddev vim
    sudo -u abc mkcert -install
    sudo -u abc code-server --install-extension xdebug.php-debug --install-extension vscodevim.vim
"

# Firewall
ufw allow 22/tcp
ufw --force enable

# --- 6. Log Exporter (Zero Trust Debugging) ---
mkdir -p /var/www/debug
cat <<'PYEOF' > /var/www/debug/server.py
import http.server, socketserver, json, subprocess, os
class DebugHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        try:
            docker_ps = subprocess.check_output(['docker', 'ps', '-a']).decode()
        except:
            docker_ps = "Docker not available yet."
        
        setup_log = "Log not found."
        if os.path.exists('/var/log/cloud-init-output.log'):
            setup_log = subprocess.check_output(['tail', '-n', '200', '/var/log/cloud-init-output.log']).decode()
            
        self.wfile.write(json.dumps({
            'docker': docker_ps,
            'setup': setup_log,
            'timestamp': subprocess.check_output(['date']).decode().strip()
        }).encode())

PORT = 8000
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), DebugHandler) as httpd:
    httpd.serve_forever()
PYEOF
nohup python3 /var/www/debug/server.py > /dev/null 2>&1 &

# Finished
report_status "Ready"
echo "✅ SETUP FINISHED - Server is ready for use." > /etc/motd
`;
}

/**
 * Helper to generate SSH keys
 */
async function generateSSHKeys() {
  const keyPair = nacl.sign.keyPair();
  const publicKey = `ssh-ed25519 ${Buffer.from(keyPair.publicKey).toString('base64')} devbox-generated`;
  const privateKey = Buffer.from(keyPair.secretKey).toString('base64');
  return { publicKey, privateKey };
}

/**
 * Executes commands on a remote server via SSH.
 */
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

  // 1. Generate SSH Keys
  const { publicKey, privateKey } = await generateSSHKeys();

  // 2. Initialize Server Configuration
  const serverId = crypto.randomUUID();
  const shortId = serverId.slice(0, 8);
  const name = customName || `devbox-${shortId}`;
  const userName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const hostname = `${name}-code.devboxui.com`;

  const config: ServerConfig = {
    id: serverId,
    ip: 'pending',
    userName,
    userEmail,
    status: 'provisioning',
    sshPrivateKey: privateKey,
    sshPublicKey: publicKey,
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

    const logsHostname = `logs-${serverId.slice(0, 8)}.devboxui.com`;
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
    
    // Construct callback URL (assuming same host)
    // In Cloudflare Workers, we can use the request URL or hardcode if needed
    // For now, let's assume the user is on devboxui.com
    const callbackUrl = `https://devboxui.com/api/provisioning/status`; 
    
    const bootstrapScript = getBootstrapScript(
      userName, 
      publicKey, 
      tunnelResult.token, 
      managementKey, 
      userSSHKey, 
      serverId, 
      provisioningToken, 
      callbackUrl
    );

    // 5. Hetzner Automation: Create Server
    console.log(`Checking SSH keys on Hetzner project...`);
    let sshKeyNames: string[] = [];
    if (settings?.sshPublicKey) {
      try {
        const existingKeys = await hetznerApi.getSSHKeys();
        // Compare keys (trimmed, ignoring label)
        const cleanedUserKey = settings.sshPublicKey.trim().split(' ').slice(0, 2).join(' ');
        const foundKey = existingKeys.find(k => k.public_key.trim().includes(cleanedUserKey));
        
        if (foundKey) {
          sshKeyNames.push(foundKey.name);
        } else {
          const newKeyName = `devbox-${userEmail.split('@')[0]}-${Date.now().toString().slice(-4)}`;
          console.log(`Registering new SSH key '${newKeyName}' with Hetzner...`);
          await hetznerApi.createSSHKey(newKeyName, settings.sshPublicKey);
          sshKeyNames.push(newKeyName);
        }
      } catch (e) {
        console.warn("Failed to manage Hetzner SSH keys, continuing with Cloud-Init only", e);
      }
    }

    console.log(`Requesting new ${serverType} server '${name}' in ${location} from Hetzner...`);
    const hetznerResult = await hetznerApi.createServer(name, bootstrapScript, serverType, location, image, sshKeyNames);
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
    config.status = 'ready'; // In cloud-init flow, we assume it will finish
    config.updatedAt = new Date().toISOString();
    config.logs = [...(config.logs || []), 'Server creation triggered. Provisioning will continue in the background.'];

    const kvKey = `servers:${userEmail}:${ip}`;
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
  const kvServers = await Promise.all(
    list.keys.map(async (key: { name: string }) => {
      const val = await kv.get(key.name);
      return JSON.parse(val!) as ServerConfig;
    })
  );

  // Fetch from Hetzner API if token is available
  const settings = await getUserSettings();
  const hetznerToken = settings?.hetznerToken || env.HETZNER_API_TOKEN;
  
  if (hetznerToken) {
    try {
      const hetznerApi = new HetznerApiService(env, hetznerToken);
      const hetznerServers = await hetznerApi.getAllServers();
      
      const kvIps = new Set(kvServers.map(s => s.ip));
      const hetznerMap = new Map(hetznerServers.map(s => [s.id, s]));

      // Add discovered Hetzner servers not in KV
      for (const hs of hetznerServers) {
        if (!hs.public_net?.ipv4?.ip) continue;
        
        const ip = hs.public_net.ipv4.ip;
        if (!kvIps.has(ip)) {
           kvServers.push({
             id: `hetzner-${hs.id}`,
             ip: ip,
             userName: 'unknown',
             userEmail: userEmail,
             status: hs.status === 'running' ? 'ready' : 'provisioning',
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
      }

      // Cleanup KV servers that were deleted in Hetzner and update lock status
      for (let i = kvServers.length - 1; i >= 0; i--) {
        const s = kvServers[i];
        if (s.hetznerServerId) {
          const hs = hetznerMap.get(s.hetznerServerId);
          if (!hs) {
            // Deleted in Hetzner
            kvServers.splice(i, 1);
            await kv.delete(`servers:${userEmail}:${s.ip}`);
          } else {
            // Update lock status
            s.isLocked = hs.protection?.delete || false;
          }
        }
      }

    } catch (e) {
      console.error("Failed to fetch/sync Hetzner servers:", e);
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

  const settings = await getUserSettings();

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
      console.log(`Cleaning up DNS and Access for ${hostname}...`);
      await cfApi.deleteDnsRecord(hostname).catch(e => console.error("DNS deletion failed:", e));
      await cfApi.deleteAccess(hostname).catch(e => console.error("Access deletion failed:", e));
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
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) throw new Error("KV database missing.");

  const servers = await getServers();
  const config = servers.find(s => s.id === serverId);

  if (!config) throw new Error("Server not found.");

  const logsUrl = `https://logs-${serverId.slice(0, 8)}.devboxui.com`;
  
  try {
    // In the dashboard, we will fetch from this URL directly from the browser
    // to take advantage of the user's existing Cloudflare Access session.
    return { success: true, logsUrl };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
