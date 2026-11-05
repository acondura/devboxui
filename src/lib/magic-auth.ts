import { SignJWT, jwtVerify } from 'jose';

const TOKEN_EXPIRY = '15m'; // magic link expires after 15 minutes
export const SESSION_COOKIE = 'devboxui_session';
const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

export async function createMagicToken(email: string, authSecret: string): Promise<string> {
  return new SignJWT({ email, type: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret(authSecret));
}

export async function verifyMagicToken(token: string, authSecret: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret(authSecret));
  if (payload.type !== 'magic' || typeof payload.email !== 'string') {
    throw new Error('Invalid token');
  }
  return payload.email;
}

export async function createSessionToken(email: string, authSecret: string): Promise<string> {
  return new SignJWT({ email, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret(authSecret));
}

export async function verifySessionToken(token: string, authSecret: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret(authSecret));
  if (payload.type !== 'session' || typeof payload.email !== 'string') {
    throw new Error('Invalid session');
  }
  return payload.email;
}

export function sessionCookieOptions(maxAge = SESSION_EXPIRY_SECONDS) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    domain: '.devboxui.com',
    maxAge,
  };
}

export async function sendMagicLinkEmail(opts: {
  to: string;
  magicUrl: string;
  sesAccessKeyId: string;
  sesSecretAccessKey: string;
  sesRegion: string;
  sesFromEmail: string;
  subject?: string;
  bodyOverride?: string;
}): Promise<void> {
  const { to, magicUrl, sesAccessKeyId, sesSecretAccessKey, sesRegion, sesFromEmail, subject, bodyOverride } = opts;

  const body = bodyOverride ?? `
    <html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#1e293b">
      <h2 style="color:#4f46e5">DevBox UI — Sign In</h2>
      <p>Click the button below to sign in. This link expires in 15 minutes.</p>
      <a href="${magicUrl}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">
        Sign In to DevBox UI
      </a>
      <p style="color:#64748b;font-size:13px">If you didn't request this, you can ignore this email.</p>
    </body></html>
  `.trim();

  const endpoint = `https://email.${sesRegion}.amazonaws.com/v2/email/outbound-emails`;

  const payload = JSON.stringify({
    FromEmailAddress: sesFromEmail,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject ?? 'Sign in to DevBox UI', Charset: 'UTF-8' },
        Body: { Html: { Data: body, Charset: 'UTF-8' } },
      },
    },
  });

  // AWS SES v2 request signing (AWS Signature Version 4)
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const host = `email.${sesRegion}.amazonaws.com`;
  const credentialScope = `${dateStamp}/${sesRegion}/ses/aws4_request`;

  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';

  const encoder = new TextEncoder();
  const payloadHash = await sha256Hex(encoder.encode(payload));

  const canonicalRequest = [
    'POST',
    '/v2/email/outbound-emails',
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(encoder.encode(canonicalRequest)),
  ].join('\n');

  const signingKey = await deriveSigningKey(sesSecretAccessKey, dateStamp, sesRegion, 'ses');
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${sesAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'Authorization': authHeader,
    },
    body: payload,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SES send failed: ${res.status} ${text}`);
  }
}

// --- AWS Sig V4 helpers (no Node crypto — uses Web Crypto API available in CF Workers) ---

async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return bufToHex(buf);
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const encoded = new TextEncoder().encode(data);
  return crypto.subtle.sign('HMAC', cryptoKey, encoded.buffer as ArrayBuffer);
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  return bufToHex(await hmac(key, data));
}

async function deriveSigningKey(secret: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
  const kSecret = new TextEncoder().encode(`AWS4${secret}`).buffer as ArrayBuffer;
  const kDate = await hmac(kSecret, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
