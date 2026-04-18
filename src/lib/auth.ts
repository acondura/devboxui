import { headers } from 'next/headers';
import { importJWK, jwtVerify } from 'jose';
import { z } from 'zod';

const emailSchema = z.string().email().toLowerCase().trim();

export interface CloudflareEnv {
  KV: KVNamespace;
  NEXT_PUBLIC_CF_TEAM_DOMAIN?: string;
}

interface JWK {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

/**
 * Robustly decodes a Base64URL string (handling missing padding).
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return globalThis.atob(base64);
}

/**
 * Decodes a JWT payload without verification (for logging/debugging).
 */
function decodeJwtUnsafe(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return (payload.email || payload.sub || null)?.toLowerCase();
  } catch {
    return null;
  }
}

async function verifyAccessJwt(jwt: string, env: CloudflareEnv): Promise<string | null> {
  let teamDomain = (env.NEXT_PUBLIC_CF_TEAM_DOMAIN || process.env.NEXT_PUBLIC_CF_TEAM_DOMAIN || '').trim();
  teamDomain = teamDomain.replace(/^https?:\/\//, '').replace('.cloudflareaccess.com', '').split('/')[0];
  
  if (!teamDomain) return null;

  const endpoints = [
    `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/jwks`,
    `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`
  ];

  let keys: JWK[] = [];
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'DevBoxUI-Auth' },
        next: { revalidate: 3600 }
      });
      if (response.ok) {
        const data = await response.json() as { keys: JWK[] };
        if (data.keys?.length > 0) {
          keys = data.keys;
          break;
        }
      }
    } catch {
      continue;
    }
  }

  try {
    if (keys.length === 0) return null;
    const publicKey = await importJWK(keys[0], 'RS256');
    const { payload } = await jwtVerify(jwt, publicKey, {
      issuer: `https://${teamDomain}.cloudflareaccess.com`,
    });

    const validated = emailSchema.safeParse(payload.email);
    return validated.success ? validated.data : null;
  } catch (e) {
    const attemptedEmail = decodeJwtUnsafe(jwt);
    console.error(`Security Alert: Invalid JWT for ${attemptedEmail || 'unknown'}. Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    return null;
  }
}

export async function getIdentity(env: CloudflareEnv): Promise<string> {
  // 1. Development Bypass
  if (process.env.NODE_ENV === 'development') {
    return 'dev-user@example.com'; 
  }

  const headersList = await headers();
  
  // 2. Look for ANY email-like header Cloudflare or a Proxy might send
  const possibleEmailHeaders = [
    'cf-access-authenticated-user-email',
    'x-user-email',
    'x-auth-request-email',
    'remote-user',
    'x-forwarded-user',
    'x-forwarded-email'
  ];

  for (const headerName of possibleEmailHeaders) {
    const value = headersList.get(headerName);
    if (value) {
      const validated = emailSchema.safeParse(value);
      if (validated.success) return validated.data;
    }
  }

  // 3. Extract from JWT Assertion (Try multiple header names)
  const jwt = headersList.get('cf-access-jwt-assertion') || 
              headersList.get('x-cf-access-jwt-assertion') ||
              headersList.get('authorization')?.replace('Bearer ', '');

  if (jwt && jwt.includes('.')) {
    // A. Attempt Secure Verification
    try {
      const verifiedEmail = await verifyAccessJwt(jwt, env);
      if (verifiedEmail) return verifiedEmail;
    } catch (e) {
      console.warn("JWT Verification failed.");
    }

    // B. Final Fallback: Unsafe Extraction
    const unsafeEmail = decodeJwtUnsafe(jwt);
    if (unsafeEmail) {
      const validated = emailSchema.safeParse(unsafeEmail);
      if (validated.success) return validated.data;
    }
  }

  console.error("Security Alert: Access attempt without valid Cloudflare credentials.");
  throw new Error("Unauthorized: Could not find user identity in headers or JWT.");
}

/**
 * Safely retrieves the Cloudflare environment.
 * On production, it uses globalThis. On development, it use getCloudflareContext.
 */
export async function getCloudflareEnv(): Promise<CloudflareEnv> {
  if (process.env.NODE_ENV === 'development') {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext() as unknown as { env: CloudflareEnv };
    return env;
  }
  
  // On production (Cloudflare Workers/Pages), bindings are global variables
  return {
    KV: (globalThis as any).KV,
    NEXT_PUBLIC_CF_TEAM_DOMAIN: (globalThis as any).NEXT_PUBLIC_CF_TEAM_DOMAIN || (process.env as any).NEXT_PUBLIC_CF_TEAM_DOMAIN
  };
}
