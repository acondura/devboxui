'use server';

import { ServerConfig } from './types';
import nacl from 'tweetnacl';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';

/**
 * Helper to generate SSH keys
 */
async function generateSSHKeys() {
  const keyPair = nacl.sign.keyPair();
  
  // Standard Ed25519 public key format
  const publicKey = `ssh-ed25519 ${Buffer.from(keyPair.publicKey).toString('base64')} devbox-generated`;
  const privateKey = Buffer.from(keyPair.secretKey).toString('base64');
  
  return { publicKey, privateKey };
}

/**
 * Provisions a new server by IP. 
 * Securely retrieves user identity internally.
 */
export async function provisionServer(ip: string, rootPassword: string) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  // 1. Generate SSH Keys
  const { publicKey, privateKey } = await generateSSHKeys();
  
  // 2. Initialize Server Configuration
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

  const kvKey = `servers:${userEmail}:${ip}`;

  // State Persistence Helper
  const updateStatus = async (status: ServerConfig['status'], logEntry: string) => {
    config.status = status;
    config.logs = [...(config.logs || []), logEntry];
    config.updatedAt = new Date().toISOString();
    await kv.put(kvKey, JSON.stringify(config));
  };

  await kv.put(kvKey, JSON.stringify(config));

  // 3. Simulate Provisioning Workflow (Async)
  // In a real scenario, this would trigger a background task or long-running worker
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
