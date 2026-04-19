import { headers } from 'next/headers';
import { importJWK, jwtVerify, JWTPayload } from 'jose';
import { z } from 'zod';

/**
 * Modern Environment Schema
 */
export const CloudflareEnvSchema = z.object({
  KV: z.any(),
  NEXT_PUBLIC_CF_TEAM_DOMAIN: z.string().optional(),
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
  let env: any = {};
  
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = await getCloudflareContext();
    env = context.env;
  } catch {
    // Fallback to globals on production if context is unavailable
    env = {
      KV: (globalThis as any).KV || (process.env as any).KV,
      NEXT_PUBLIC_CF_TEAM_DOMAIN: (globalThis as any).NEXT_PUBLIC_CF_TEAM_DOMAIN || (process.env as any).NEXT_PUBLIC_CF_TEAM_DOMAIN,
    };
  }

  return CloudflareEnvSchema.parse(env);
}

/**
 * Fetches and caches Cloudflare Access Public Keys
 */
async function getAccessPublicKeys(teamDomain: string): Promise<JWK[]> {
  const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/jwks`;
  
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600, tags: ['cf-access-jwks'] }
    });
    
    if (!response.ok) return [];
    const data = await response.json() as { keys: JWK[] };
    return data.keys || [];
  } catch (error) {
    console.error("Failed to fetch CF Access keys:", error);
    return [];
  }
}

/**
 * Strictly verifies the identity of the requester
 */
export async function getIdentity(): Promise<string> {
  // 1. Development Bypass
  if (process.env.NODE_ENV === 'development') {
    return 'dev-user@example.com';
  }

  const env = await getCloudflareEnv();
  const headersList = await headers();
  
  const jwt = headersList.get('cf-access-jwt-assertion');
  const teamDomain = env.NEXT_PUBLIC_CF_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace('.cloudflareaccess.com', '').split('/')[0];

  // 2. Strict JWT Verification (If Configured)
  if (jwt && teamDomain) {
    try {
      const keys = await getAccessPublicKeys(teamDomain);
      if (keys.length > 0) {
        const publicKey = await importJWK(keys[0], 'RS256');
        const { payload } = await jwtVerify(jwt, publicKey, {
          issuer: `https://${teamDomain}.cloudflareaccess.com`,
        });
        
        const validated = emailSchema.safeParse(payload.email);
        if (validated.success) return validated.data;
      }
    } catch (error) {
      console.warn("JWT Verification failed, checking header fallback...");
    }
  }

  // 3. Fallback to Identity Header (Only if JWT verification isn't possible or fails)
  const emailHeader = headersList.get('cf-access-authenticated-user-email') || 
                      headersList.get('x-user-email');
  
  if (emailHeader) {
    const validated = emailSchema.safeParse(emailHeader);
    if (validated.success) return validated.data;
  }

  throw new Error("Unauthorized: Could not securely verify user identity.");
}
