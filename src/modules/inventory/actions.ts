'use server';

import { ServerConfig } from './types';
import nacl from 'tweetnacl';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { CloudflareApiService } from '@/lib/cloudflare-api';
import { Client } from 'ssh2';

/**
 * Generates the full sequence of bash commands to bootstrap the server.
 */
function getBootstrapScript(username: string, publicKey: string, tunnelToken: string) {
  return `
# 1. System Update & Docker Install
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 2. Create Unique User
if ! id -u ${username} >/dev/null 2>&1; then
  useradd -m -s /bin/bash ${username}
  usermod -aG docker ${username}
fi

# 3. Setup SSH for User
mkdir -p /home/${username}/.ssh
echo "${publicKey}" > /home/${username}/.ssh/authorized_keys
chown -R ${username}:${username} /home/${username}/.ssh
chmod 700 /home/${username}/.ssh
chmod 600 /home/${username}/.ssh/authorized_keys

# 4. Run VS Code Server (code-server)
docker run -d \\
  --name=code-server \\
  -e PUID=$(id -u ${username}) \\
  -e PGID=$(id -g ${username}) \\
  -e TZ=Etc/UTC \\
  -e DEFAULT_WORKSPACE=/home/${username} \\
  -p 8443:8443 \\
  -v /home/${username}/code-config:/config \\
  --restart unless-stopped \\
  lscr.io/linuxserver/code-server:latest

# 5. Bootstrap Cloudflare Tunnel
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
cloudflared service install ${tunnelToken}
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
async function executeSshCommands(ip: string, password: string, script: string, onLog: (log: string) => void) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      onLog("SSH Connection established.");
      conn.exec(script, (err, stream) => {
        if (err) return reject(err);
        
        stream.on('close', (code: number) => {
          conn.end();
          if (code === 0) resolve(true);
          else reject(new Error(`Exit code ${code}`));
        }).on('data', (data: Buffer) => {
          onLog(data.toString());
        }).stderr.on('data', (data: Buffer) => {
          onLog(`[STDERR] ${data.toString()}`);
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host: ip,
      port: 22,
      username: 'root',
      password: password,
      // Note: Cloudflare Workers with OpenNext polyfill node:net to use cloudflare:sockets
      // We may need to explicitly pass the socket if the polyfill is not enough.
    });
  });
}

/**
 * Provisions a new server by IP. 
 * Securely retrieves user identity internally.
 */
export async function provisionServer(ip: string, rootPassword: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;
  const cfApi = new CloudflareApiService(env);

  // 1. Generate SSH Keys
  const { publicKey, privateKey } = await generateSSHKeys();
  
  // 2. Initialize Server Configuration
  const serverId = crypto.randomUUID();
  const userName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const hostname = `devbox-${serverId.slice(0, 8)}.devboxui.com`; // Example hostname pattern
  
  const config: ServerConfig = {
    id: serverId, ip, userName, userEmail, status: 'provisioning',
    sshPrivateKey: privateKey, sshPublicKey: publicKey,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    logs: ['Starting Zero-Touch provisioning...'],
    tunnelUrl: `https://${hostname}`
  };

  const kvKey = `servers:${userEmail}:${ip}`;
  const updateStatus = async (status: ServerConfig['status'], logEntry: string) => {
    config.status = status;
    config.logs = [...(config.logs || []), logEntry.slice(0, 500)]; // Cap logs per entry
    config.updatedAt = new Date().toISOString();
    await kv.put(kvKey, JSON.stringify(config));
  };

  await kv.put(kvKey, JSON.stringify(config));

  try {
    // 3. Cloudflare Automation: Create Tunnel & DNS
    await updateStatus('provisioning', "Creating Cloudflare Tunnel...");
    const { id: tunnelId, token: tunnelToken } = await cfApi.createTunnel(`tunnel-${serverId}`);
    
    await updateStatus('provisioning', "Setting up DNS and Routing...");
    await cfApi.setupHostname(hostname, tunnelId);

    // 4. Server Automation: Execute Bootstrap Script via SSH
    const bootstrapScript = getBootstrapScript(userName, publicKey, tunnelToken);
    
    await updateStatus('provisioning', `Connecting to ${ip} to begin installation...`);
    await executeSshCommands(ip, rootPassword, bootstrapScript, (log) => {
      // In a real app, you might want to stream these logs via WebSockets or long-polling
      console.log(`[SSH ${ip}]: ${log}`);
    });

    await updateStatus('ready', 'Server is ready! Access gated by Cloudflare.');
  } catch (error) {
    await updateStatus('error', `Provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  return config;
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
    list.keys.map(async (key) => {
      const val = await kv.get(key.name);
      return JSON.parse(val!) as ServerConfig;
    })
  );
  
  return servers;
}
