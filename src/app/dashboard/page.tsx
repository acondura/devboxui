import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';


export default async function DashboardPage() {
  const env = await getCloudflareEnv();
  
  let userEmail: string;
  try {
    userEmail = await getIdentity(env);
  } catch (error) {
    console.error("Dashboard auth failed:", error);
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}