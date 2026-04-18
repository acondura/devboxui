import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getIdentity, CloudflareEnv } from '@/lib/auth';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default async function DashboardPage() {
  const { env } = await getCloudflareContext() as unknown as { env: CloudflareEnv };
  
  let userEmail: string;
  try {
    userEmail = await getIdentity(env);
  } catch (error) {
    console.error("Auth failed:", error);
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}