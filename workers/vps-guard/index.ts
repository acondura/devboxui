/**
 * VPS Guard — Cloudflare Worker
 *
 * Intercepts requests to VPS subdomains (e.g. cma2-web.devboxui.com).
 * Allows requests from trusted peer IPs (allowedPeers) unconditionally.
 * For browser traffic: verifies the devboxui_session cookie and checks that
 * the session email matches the server owner or a collaborator.
 * Redirects unauthenticated/unauthorized requests to devboxui.com/login.
 */

import { jwtVerify } from 'jose';

interface KVNamespace {
  get(key: string): Promise<string | null>;
}

export interface Env {
  KV: KVNamespace;
  AUTH_SECRET: string;
  INTERNAL_SECRET: string;
}

interface HostnameLookup {
  orgId: string;
  serverId: string;
}

interface CollaboratorInfo {
  email: string;
  status: 'pending' | 'active';
}

interface ServerConfig {
  id: string;
  ip: string;
  orgId?: string;
  userEmail: string;
  allowedPeers?: string[];
  collaborators?: CollaboratorInfo[];
}

const SESSION_COOKIE = 'devboxui_session';
const APP_URL = 'https://devboxui.com';

function getSecret(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

async function getSessionEmail(req: Request, authSecret: string): Promise<string | null> {
  const cookieHeader = req.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], getSecret(authSecret));
    if (payload.type !== 'session' || typeof payload.email !== 'string') return null;
    return payload.email;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const hostname = url.hostname;

    // If AUTH_SECRET is not configured, pass through (safety valve during rollout)
    if (!env.AUTH_SECRET) {
      return fetch(req);
    }

    // ── 0. Internal service bypass (server-side Pages → Worker fetches) ──────
    if (env.INTERNAL_SECRET && req.headers.get('X-DevBox-Internal') === env.INTERNAL_SECRET) {
      const headers = new Headers(req.headers);
      headers.delete('X-DevBox-Internal');
      return fetch(new Request(req, { headers }));
    }

    // ── 1. Peer-to-peer bypass: trusted VPS IPs skip auth entirely ──────────
    const clientIp = req.headers.get('CF-Connecting-IP') || '';

    const lookupRaw = await env.KV.get(`hostname_lookup:${hostname}`);
    if (!lookupRaw) {
      console.log(`[vps-guard] PASS-THROUGH: no hostname_lookup for ${hostname}`);
      return fetch(req);
    }

    const lookup: HostnameLookup = JSON.parse(lookupRaw);
    console.log(`[vps-guard] ${hostname} → orgId=${lookup.orgId} serverId=${lookup.serverId} clientIp=${clientIp}`);

    const serverRaw = await env.KV.get(`servers:${lookup.orgId}:${lookup.serverId}`);
    if (!serverRaw) {
      console.log(`[vps-guard] PASS-THROUGH: servers:${lookup.orgId}:${lookup.serverId} not found`);
      return fetch(req);
    }

    const server: ServerConfig = JSON.parse(serverRaw);

    if (clientIp) {
      const trustedPeerIds = new Set(server.allowedPeers || []);

      const ipIndexRaw = await env.KV.get(`vps_ip:${clientIp}`);
      console.log(`[vps-guard] vps_ip:${clientIp} = ${ipIndexRaw ?? 'NOT FOUND'}`);

      if (ipIndexRaw) {
        const ipIndex: { orgId: string; serverId: string } = JSON.parse(ipIndexRaw);
        const incomingServerRaw = await env.KV.get(`servers:${ipIndex.orgId}:${ipIndex.serverId}`);
        console.log(`[vps-guard] incoming server servers:${ipIndex.orgId}:${ipIndex.serverId} = ${incomingServerRaw ? 'found' : 'NOT FOUND'}`);

        if (incomingServerRaw) {
          const incomingServer: ServerConfig = JSON.parse(incomingServerRaw);
          const incomingTrustsUs = (incomingServer.allowedPeers || []).includes(lookup.serverId);
          const weTrustIncoming = trustedPeerIds.has(ipIndex.serverId);
          console.log(`[vps-guard] incomingTrustsUs=${incomingTrustsUs} weTrustIncoming=${weTrustIncoming} (cma2.allowedPeers=${JSON.stringify(server.allowedPeers)})`);
          if (incomingTrustsUs || weTrustIncoming) {
            console.log(`[vps-guard] PEER BYPASS granted for IP ${clientIp}`);
            return fetch(req);
          }
        }
      }
      console.log(`[vps-guard] peer bypass FAILED for IP ${clientIp}`);
    }

    // ── 2. Session verification ──────────────────────────────────────────────
    const sessionEmail = await getSessionEmail(req, env.AUTH_SECRET);

    if (!sessionEmail) {
      return redirectToLogin(url);
    }

    // ── 3. Access control: owner or active/pending collaborator ─────────────
    const isOwner = sessionEmail === server.userEmail;
    const isCollaborator = server.collaborators?.some(c => c.email === sessionEmail) ?? false;

    if (!isOwner && !isCollaborator) {
      return redirectToLogin(url, 'unauthorized');
    }

    // ── 4. Proxy the request ─────────────────────────────────────────────────
    return fetch(req);
  },
};

function redirectToLogin(url: URL, error?: string): Response {
  const loginUrl = new URL('/login', APP_URL);
  loginUrl.searchParams.set('next', url.toString());
  if (error) loginUrl.searchParams.set('error', error);
  return Response.redirect(loginUrl.toString(), 302);
}
