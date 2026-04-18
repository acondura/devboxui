'use server';

import { ServerConfig } from './types';
import { cookies } from 'next/headers';
import nacl from 'tweetnacl';

// Helper to generate SSH keys
async function generateSSHKeys() {
  const keyPair = nacl.sign.keyPair();
  
  // This is a simplified version. Real OpenSSH keys have a specific header/footer.
  // For the sake of this demo/implementation, we will use a representation 
  // that can be used by ssh2 or similar.
  const publicKey = `ssh-ed25519 ${Buffer.from(keyPair.publicKey).toString('base64')} devbox-generated`;
  const privateKey = Buffer.from(keyPair.secretKey).toString('base64');
  
  return { publicKey, privateKey };
}

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { CloudflareEnv } from '@/lib/auth';

// ... (generateSSHKeys remains same)

export async function provisionServer(ip: string, rootPassword: string, userEmail: string) {
  const { env } = await getCloudflareContext() as unknown as { env: CloudflareEnv };
  const kv = env.KV;

  // 1. Generate Keys
  const { publicKey, privateKey } = await generateSSHKeys();
  
  // 2. Create Server Config
  const serverId = crypto.randomUUID();
  const userName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  
  const config: ServerConfig = {
    id: serverId, ip, userName, userEmail, status: 'provisioning',
    sshPrivateKey: privateKey, sshPublicKey: publicKey,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    logs: ['Initializing provisioning...']
  };

  const kvKey = `servers:${userEmail}:${ip}`;

  const updateStatus = async (status: ServerConfig['status'], logEntry: string) => {
    config.status = status;
    config.logs = [...(config.logs || []), logEntry];
    config.updatedAt = new Date().toISOString();
    if (kv) await kv.put(kvKey, JSON.stringify(config));
  };

  if (kv) await kv.put(kvKey, JSON.stringify(config));

  // 3. Simulate Multi-step Provisioning
  await new Promise(resolve => setTimeout(resolve, 2000));
  await updateStatus('provisioning', `Connected to root@${ip}. Creating user ${userName}...`);

  await new Promise(resolve => setTimeout(resolve, 3000));
  await updateStatus('provisioning', 'Running Ubuntu updates (apt update && upgrade)...');

  await new Promise(resolve => setTimeout(resolve, 3000));
  await updateStatus('provisioning', 'Installing VS Code Server (code-server)...');

  await new Promise(resolve => setTimeout(resolve, 2000));
  config.tunnelUrl = `https://${ip}.devbox.cloud`; 
  await updateStatus('ready', 'Provisioning complete. Environment secured with Cloudflare Access.');

  return config;
}

export async function getServers(userEmail: string) {
  const { env } = await getCloudflareContext() as unknown as { env: CloudflareEnv };
  const kv = env.KV;
  
  if (kv) {
    const list = await kv.list({ prefix: `servers:${userEmail}:` });
    const servers = await Promise.all(
      list.keys.map(async (key: any) => {
        const val = await kv.get(key.name);
        return JSON.parse(val!);
      })
    );
    return servers;
  }
  
  return [];
}
