import { headers, cookies } from 'next/headers';
import { importJWK, jwtVerify } from 'jose';
import { z } from 'zod';
import { SESSION_COOKIE, verifySessionToken } from './magic-auth';

/**
 * Modern Environment Schema
 */
export const CloudflareEnvSchema = z.object({
  KV: z.any(),
  NEXT_PUBLIC_CF_TEAM_DOMAIN: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  SSH_SERVICE_URL: z.string().optional(),
  SSH_SERVICE_SECRET: z.string().optional(),
  MANAGEMENT_SSH_PUBLIC_KEY: z.string().optional(),
  MANAGEMENT_SSH_PRIVATE_KEY: z.string().optional(),
  HETZNER_API_TOKEN: z.string().optional(),
  CONTABO_CLIENT_ID: z.string().optional(),
  CONTABO_CLIENT_SECRET: z.string().optional(),
  CONTABO_API_USERNAME: z.string().optional(),
  CONTABO_API_PASSWORD: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  INTERNAL_SECRET: z.string().optional(),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_FROM_EMAIL: z.string().optional(),
});

export type CloudflareEnv = z.infer<typeof CloudflareEnvSchema>;

const emailSchema = z.string().email().toLowerCase().trim();

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
 * Safely retrieves the Cloudflare environment.
 */
export async function getCloudflareEnv(): Promise<CloudflareEnv> {
  let env: Record<string, unknown> = {};
  
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = await getCloudflareContext();
    env = { ...context.env };
  } catch (e) {
    console.warn("Could not load Cloudflare Context:", e);
  }

  // Merge sources: open-next context > global worker env > process.env
  const mergedEnv = {
    ...process.env,
    ...(globalThis as unknown as Record<string, unknown>),
    ...env
  };

  return CloudflareEnvSchema.parse(mergedEnv);
}

/**
 * Fetches and caches Cloudflare Access Public Keys
 */
/**
 * Fetches and caches Cloudflare Access Public Keys
 */
let cachedKeys: JWK[] | null = null;
let keysFetchedAt = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function getAccessPublicKeys(teamDomain: string): Promise<JWK[]> {
  if (cachedKeys && Date.now() - keysFetchedAt < CACHE_TTL) {
    return cachedKeys;
  }

  const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'DevBoxUI-Auth' 
      },
      next: { revalidate: 3600 } // Use Next.js cache
    });
    
    if (response.ok) {
      const data = await response.json() as { keys: JWK[] };
      if (data.keys?.length > 0) {
        cachedKeys = data.keys;
        keysFetchedAt = Date.now();
        return data.keys;
      }
    } else {
      console.warn(`Failed to fetch from ${url}: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error fetching keys from ${url}:`, error);
  }
  
  return [];
}

/**
 * Strictly verifies the identity of the requester
 */
export async function getIdentity(passedEnv?: CloudflareEnv): Promise<string> {
  if (process.env.NODE_ENV === 'development') {
    return 'dev-user@example.com';
  }

  const env = passedEnv || await getCloudflareEnv();

  // 1. Magic-link session cookie (new auth)
  if (env.AUTH_SECRET) {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE);
      if (sessionCookie?.value) {
        const email = await verifySessionToken(sessionCookie.value, env.AUTH_SECRET);
        const validated = emailSchema.safeParse(email);
        if (validated.success) return validated.data;
      }
    } catch {
      // fall through to CF Access
    }
  }

  // 2. Cloudflare Access JWT (legacy fallback while transitioning)
  const headersList = await headers();
  const jwt = headersList.get('cf-access-jwt-assertion');

  if (jwt) {
    let teamDomain = (env.NEXT_PUBLIC_CF_TEAM_DOMAIN || '').trim();
    if (!teamDomain) {
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1]));
        if (payload.iss) {
          teamDomain = payload.iss.replace(/^https?:\/\//, '').replace('.cloudflareaccess.com', '').split('/')[0];
        }
      } catch { /* ignore */ }
    }
    teamDomain = teamDomain.replace(/^https?:\/\//, '').replace('.cloudflareaccess.com', '').split('/')[0];

    if (teamDomain) {
      try {
        const keys = await getAccessPublicKeys(teamDomain);
        for (const key of keys) {
          try {
            const publicKey = await importJWK(key, 'RS256');
            const { payload } = await jwtVerify(jwt, publicKey, {
              issuer: `https://${teamDomain}.cloudflareaccess.com`,
            });
            const validated = emailSchema.safeParse(payload.email);
            if (validated.success) return validated.data;
          } catch { continue; }
        }
      } catch { /* ignore */ }
    }

    const emailHeader = headersList.get('cf-access-authenticated-user-email');
    if (emailHeader) {
      const validated = emailSchema.safeParse(emailHeader);
      if (validated.success) return validated.data;
    }
  }

  throw new Error("Unauthorized");
}
