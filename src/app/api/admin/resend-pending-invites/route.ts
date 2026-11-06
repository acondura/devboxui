import { NextResponse } from 'next/server';
import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { ServerConfig } from '@/modules/inventory/types';
import { createMagicToken, sendMagicLinkEmail } from '@/lib/magic-auth';

export const dynamic = 'force-dynamic';

/**
 * One-time utility: re-sends invite emails to all pending collaborators across
 * all servers, issuing fresh 24h tokens. Safe to run multiple times.
 *
 * Usage (while logged in):
 *   GET /api/admin/resend-pending-invites
 *   GET /api/admin/resend-pending-invites?dry=true   — preview without sending
 */
export async function GET(req: Request) {
  try {
    await getIdentity();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const env = await getCloudflareEnv();
  const kv = env.KV;
  if (!kv) return NextResponse.json({ error: 'KV missing' }, { status: 500 });

  const dry = new URL(req.url).searchParams.get('dry') === 'true';

  const canSendEmail = !!(
    env.AUTH_SECRET &&
    env.AWS_SES_ACCESS_KEY_ID &&
    env.AWS_SES_SECRET_ACCESS_KEY &&
    env.AWS_SES_REGION &&
    env.AWS_SES_FROM_EMAIL
  );

  const sent: { server: string; email: string }[] = [];
  const skipped: { server: string; email: string; reason: string }[] = [];

  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'servers:', ...(cursor ? { cursor } : {}) });
    cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;

    for (const item of page.keys) {
      const parts = item.name.split(':');
      if (parts.length !== 3) continue; // skip manifest keys like org:servers:manifest:...

      const raw = await kv.get(item.name);
      if (!raw) continue;
      const server: ServerConfig = JSON.parse(raw);

      const pendingCollabs = (server.collaborators || []).filter(c => c.status === 'pending');
      if (pendingCollabs.length === 0) continue;

      const serverLabel = server.name || server.hostname || server.id;
      const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://devboxui.com';

      for (const collab of pendingCollabs) {
        if (!canSendEmail) {
          skipped.push({ server: serverLabel, email: collab.email, reason: 'email not configured' });
          continue;
        }
        if (dry) {
          sent.push({ server: serverLabel, email: collab.email });
          continue;
        }
        try {
          const token = await createMagicToken(collab.email, env.AUTH_SECRET!);
          const magicUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
          const projectList = collab.allowedProjects?.length
            ? `<ul style="margin:8px 0;padding-left:20px">${collab.allowedProjects.map(p => `<li style="color:#4f46e5">${p}</li>`).join('')}</ul>`
            : '';
          const accessDesc = collab.allowedProjects?.length
            ? `web-only access to: ${projectList}`
            : `full access to <strong>${serverLabel}</strong>.`;

          await sendMagicLinkEmail({
            to: collab.email,
            magicUrl,
            sesAccessKeyId: env.AWS_SES_ACCESS_KEY_ID!,
            sesSecretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!,
            sesRegion: env.AWS_SES_REGION!,
            sesFromEmail: env.AWS_SES_FROM_EMAIL!,
            subject: `Your DevBox UI invite link (refreshed)`,
            bodyOverride: `
              <html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#1e293b">
                <h2 style="color:#4f46e5">DevBox UI — Refreshed Invite</h2>
                <p>Your previous invite link expired. Here is a new one granting you ${accessDesc}</p>
                <p>Click below to sign in. This link expires in 24 hours.</p>
                <a href="${magicUrl}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">
                  Accept Invitation
                </a>
                <p style="color:#64748b;font-size:13px">If you didn't expect this, you can ignore this email.</p>
              </body></html>
            `.trim(),
          });
          sent.push({ server: serverLabel, email: collab.email });
        } catch (e) {
          skipped.push({ server: serverLabel, email: collab.email, reason: String(e) });
        }
      }
    }
  } while (cursor);

  return NextResponse.json({ dry, sent, skipped, total: sent.length + skipped.length });
}
