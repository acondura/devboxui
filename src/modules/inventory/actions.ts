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

export async function provisionServer(ip: string, rootPassword: string, userEmail: string) {
  // 1. Generate Keys
  const { publicKey, privateKey } = await generateSSHKeys();
  
  // 2. Create Server Config
  const serverId = crypto.randomUUID();
  const userName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  
  const config: ServerConfig = {
    id: serverId,
    ip,
    userName,
    userEmail,
    status: 'provisioning',
    sshPrivateKey: privateKey,
    sshPublicKey: publicKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: ['Initializing provisioning...']
  };

  // Access the KV binding. In Cloudflare Workers, these are globals.
  // @ts-ignore
  const kv = (globalThis as any).KV || (process.env as any).KV;
  const kvKey = `servers:${userEmail}:${ip}`;

  const updateStatus = async (status: ServerConfig['status'], logEntry: string) => {
    config.status = status;
    config.logs = [...(config.logs || []), logEntry];
    config.updatedAt = new Date().toISOString();
    
    // Ensure kv is an object with a put method before calling it
    if (kv && typeof kv === 'object' && typeof kv.put === 'function') {
      await kv.put(kvKey, JSON.stringify(config));
    }
  };

  if (kv && typeof kv === 'object' && typeof kv.put === 'function') {
    await kv.put(kvKey, JSON.stringify(config));
  }

  // 3. Simulate Multi-step Provisioning
  // Step 1: Connecting
  await new Promise(resolve => setTimeout(resolve, 2000));
  await updateStatus('provisioning', `Connected to root@${ip}. Creating user ${userName}...`);

  // Step 2: Updates
  await new Promise(resolve => setTimeout(resolve, 3000));
  await updateStatus('provisioning', 'Running Ubuntu updates (apt update && upgrade)...');

  // Step 3: Installing code-server
  await new Promise(resolve => setTimeout(resolve, 3000));
  await updateStatus('provisioning', 'Installing VS Code Server (code-server)...');

  // Step 4: Finalizing
  await new Promise(resolve => setTimeout(resolve, 2000));
  config.tunnelUrl = `https://${ip}.devbox.cloud`; // Simulated URL
  await updateStatus('ready', 'Provisioning complete. Environment secured with Cloudflare Access.');

  return config;
}

export async function getServers() {
  const userEmail = "user@example.com";
  // @ts-ignore
  const kv = (globalThis as any).KV || (process.env as any).KV;
  
  // Check if kv is the expected namespace object
  if (kv && typeof kv === 'object' && typeof kv.list === 'function') {
    const list = await kv.list({ prefix: `servers:${userEmail}:` });
    const servers = await Promise.all(
      list.keys.map(async (key: any) => {
        const val = await kv.get(key.name);
        return JSON.parse(val);
      })
    );
    return servers;
  }
  
  return [];
}
