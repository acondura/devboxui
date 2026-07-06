import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/auth';
import { ServerConfig } from '@/modules/inventory/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: serverId } = await params;

  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) {
    return NextResponse.json({ error: 'KV database missing.' }, { status: 500 });
  }

  // Find server using the lookup index
  const lookupData = await kv.get(`server_lookup:${serverId}`);
  if (!lookupData) {
    return NextResponse.json({ error: 'Server not found.' }, { status: 404 });
  }

  const { serverKey } = JSON.parse(lookupData) as { serverKey: string };
  const data = await kv.get(serverKey);
  if (!data) {
    return NextResponse.json({ error: 'Server configuration lost.' }, { status: 404 });
  }

  const server = JSON.parse(data) as ServerConfig;

  // Compile list of users
  const usersList: { username: string; email: string; sshKeys: string[] }[] = [];

  // 1. Add owner
  const ownerEmail = server.userEmail;
  const ownerUsername = server.userName || ownerEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const ownerSshKeys: string[] = [];
  if (server.sshPublicKey) {
    ownerSshKeys.push(server.sshPublicKey);
  } else {
    // Fallback to settings
    const ownerSettingsData = await kv.get(`settings:${ownerEmail}`);
    if (ownerSettingsData) {
      const settings = JSON.parse(ownerSettingsData);
      if (settings.sshPublicKey) ownerSshKeys.push(settings.sshPublicKey);
    }
  }

  usersList.push({
    username: ownerUsername,
    email: ownerEmail,
    sshKeys: ownerSshKeys.filter(Boolean)
  });

  // 2. Add collaborators
  if (server.collaborators && server.collaborators.length > 0) {
    for (const collab of server.collaborators) {
      const collabUsername = collab.username || collab.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const collabSshKeys: string[] = [];
      const collabSettingsData = await kv.get(`settings:${collab.email}`);
      if (collabSettingsData) {
        const settings = JSON.parse(collabSettingsData);
        if (settings.sshPublicKey) {
          collabSshKeys.push(settings.sshPublicKey);
        }
      }
      usersList.push({
        username: collabUsername,
        email: collab.email,
        sshKeys: collabSshKeys.filter(Boolean)
      });
    }
  }

  return NextResponse.json({ users: usersList });
}
