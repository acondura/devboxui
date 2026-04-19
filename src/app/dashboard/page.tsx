import { getCloudflareEnv, getIdentity, CloudflareEnv } from '@/lib/auth';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default async function DashboardPage() {
  const env = await getCloudflareEnv();
  
  let userEmail: string;
  try {
    userEmail = await getIdentity();
  } catch (error) {
    console.error("Dashboard auth failed:", error);
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}