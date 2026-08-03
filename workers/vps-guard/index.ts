/**
 * VPS Guard — Cloudflare Worker
 *
 * Intercepts requests to VPS subdomains (e.g. cma2-web.devboxui.com).
 * Allows requests from trusted peer IPs (allowedPeers) unconditionally.
 * For browser traffic: verifies the devboxui_session cookie and checks that
 * the session email matches the server owner or a collaborator.
 * Redirects unauthenticated/unauthorized requests to devboxui.com/login.
 *
 * Deploy routes (add in Cloudflare Dashboard → Workers → Triggers → Routes):
 *   *-web.devboxui.com/*
 *   *-code.devboxui.com/*
 *   *-logs.devboxui.com/*
 */

import { jwtVerify } from 'jose';

interface KVNamespace {
  get(key: string): Promise<string | null>;
}

export interface Env {
  KV: KVNamespace;
  AUTH_SECRET: string;
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

    // ── 1. Peer-to-peer bypass: trusted VPS IPs skip auth entirely ──────────
    const clientIp = req.headers.get('CF-Connecting-IP') || '';

    const lookupRaw = await env.KV.get(`hostname_lookup:${hostname}`);
    if (!lookupRaw) {
      // Hostname not in KV — pass through (may not be a managed VPS)
      return fetch(req);
    }

    const lookup: HostnameLookup = JSON.parse(lookupRaw);
    const serverRaw = await env.KV.get(`servers:${lookup.orgId}:${lookup.serverId}`);
    if (!serverRaw) {
      return fetch(req);
    }

    const server: ServerConfig = JSON.parse(serverRaw);

    // Allow requests from any known VPS IP that is listed as a peer of this server,
    // OR that lists this server as one of its own peers (bidirectional trust).
    // allowedPeers stores server IDs — resolve to IPs via KV.
    if (clientIp) {
      const orgId = server.orgId || lookup.orgId;

      // Build set of trusted peer IPs: peers this server trusts
      const trustedPeerIds = new Set(server.allowedPeers || []);

      // Also trust any server whose allowedPeers includes this server (reverse direction)
      // We check this by looking up the incoming IP via a vps_ip_index KV key written by the app
      const ipIndexRaw = await env.KV.get(`vps_ip:${clientIp}`);
      if (ipIndexRaw) {
        const ipIndex: { orgId: string; serverId: string } = JSON.parse(ipIndexRaw);
        const incomingServerRaw = await env.KV.get(`servers:${ipIndex.orgId}:${ipIndex.serverId}`);
        if (incomingServerRaw) {
          const incomingServer: ServerConfig = JSON.parse(incomingServerRaw);
          // Trust if: incoming server has this server in its allowedPeers, OR this server has incoming in its peers
          const incomingTrustsUs = (incomingServer.allowedPeers || []).includes(lookup.serverId);
          const weTrustIncoming = trustedPeerIds.has(ipIndex.serverId);
          if (incomingTrustsUs || weTrustIncoming) {
            return fetch(req);
          }
        }
      }
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
