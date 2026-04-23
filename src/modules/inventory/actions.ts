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
    try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch(e) {}
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
function getBootstrapScript(username: string, publicKey: string, tunnelToken: string, managementKey: string) {
  return `#!/bin/bash
set -e

# --- 0. Configuration ---
DEV_USER="${username}"
GIT_USER_NAME="DevBox User"
GIT_USER_EMAIL="${username}@devboxui.local"
MANAGEMENT_SSH_KEY="${managementKey}"
TUNNEL_TOKEN="${tunnelToken}"

# --- 1. Host Setup & Hardening ---
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw

# --- 2. Docker ---
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# --- 3. Host User & SSH ---
if ! id "$DEV_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEV_USER"
    usermod -aG sudo,docker "$DEV_USER"
    echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/"$DEV_USER"
    
    mkdir -p /home/"$DEV_USER"/.ssh
    # Add User Key
    echo "${publicKey}" >> /home/"$DEV_USER"/.ssh/authorized_keys
    # Add Management Key
    if [ -n "$MANAGEMENT_SSH_KEY" ]; then
        echo "$MANAGEMENT_SSH_KEY" >> /home/"$DEV_USER"/.ssh/authorized_keys
    fi
    # Sync from root
    [ -f /root/.ssh/authorized_keys ] && cat /root/.ssh/authorized_keys >> /home/"$DEV_USER"/.ssh/authorized_keys
    
    chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"/.ssh
    chmod 700 /home/"$DEV_USER"/.ssh
    chmod 600 /home/"$DEV_USER"/.ssh/authorized_keys || true
fi

# --- 4. Deployment (The Symmetry Strategy) ---
# Mirror path for DDEV compatibility
C_ROOT="/home/$DEV_USER"
mkdir -p "$C_ROOT/workspace"

# 4.1 Pre-configure (Host-side)
sudo -u "$DEV_USER" bash -c "export HOME=$C_ROOT; curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended"
sed -i "s|OSH_THEME=\"[^\"]*\"|OSH_THEME=\"90210\"|" "$C_ROOT/.bashrc"

cat <<EOF > "$C_ROOT/.gitconfig"
[user]
    name = \$GIT_USER_NAME
    email = \$GIT_USER_EMAIL
EOF

# Code-Server Settings
mkdir -p "$C_ROOT/config/data/User"
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

# 4.2 Start Containers
docker run -d \\
  --name=code-server \\
  -e PUID=$(id -u "$DEV_USER") -e PGID=$(id -g "$DEV_USER") \\
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

docker run -d \\
  --name=tunnel \\
  --restart unless-stopped \\
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token "\$TUNNEL_TOKEN"

# 4.3 Final Container Setup
docker exec -d -u root code-server bash -c "
    chmod 666 /var/run/docker.sock
    apt-get update && apt-get install -y curl gnupg vim ddev
    sudo -u abc mkcert -install
"

# --- 5. Final Security ---
ufw allow 22/tcp
ufw --force enable
  `.trim();
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
 * Provisions a new server automatically via Hetzner API and Cloud-Init.
 */
export async function provisionServer(customName?: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) {
    throw new Error("Database Error: The 'KV' binding is missing. Please check your wrangler.toml or Cloudflare Dashboard settings.");
  }
  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env);

  // 1. Generate SSH Keys for the user
  const { publicKey, privateKey } = await generateSSHKeys();

  // 2. Initialize Server Configuration
  const serverId = crypto.randomUUID();
  const shortId = serverId.slice(0, 8);
  const name = customName || `devbox-${shortId}`;
  const userName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const hostname = `${name}.devboxui.com`; 
  
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
    logs: ['Starting Cloud-Init provisioning via Hetzner API...'],
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

    // 4. Generate Cloud-Init Script with baked-in SSH keys and Tunnel token
    const managementKey = env.MANAGEMENT_SSH_PUBLIC_KEY || '';
    const bootstrapScript = getBootstrapScript(userName, publicKey, tunnelResult.token, managementKey);
    
    // 5. Hetzner Automation: Create Server
    console.log(`Requesting new server '${name}' from Hetzner...`);
    const hetznerResult = await hetznerApi.createServer(name, bootstrapScript);
    hetznerServerId = hetznerResult.server.id;
    config.hetznerServerId = hetznerServerId;
    
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
  const servers = await Promise.all(
    list.keys.map(async (key: { name: string }) => {
      const val = await kv.get(key.name);
      return JSON.parse(val!) as ServerConfig;
    })
  );
  
  return servers;
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
  const baseDomain = config.tunnelUrl?.replace('https://', '') || '';
  const projectDomain = `${cleanName}.${baseDomain}`;

  // 3. Update Cloudflare Tunnel & DNS
  await cfApi.setupHostname(projectDomain, config.tunnelId);

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
  const cfApi = new CloudflareApiService(env);
  const hetznerApi = new HetznerApiService(env);

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
      console.log(`Deleting DNS record: ${hostname}`);
      await cfApi.deleteDnsRecord(hostname).catch(e => console.error("DNS deletion failed:", e));
    }

    if (config.projects) {
      for (const project of config.projects) {
        console.log(`Deleting project DNS record: ${project.domain}`);
        await cfApi.deleteDnsRecord(project.domain).catch(e => console.error(`Project DNS deletion failed for ${project.domain}:`, e));
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
