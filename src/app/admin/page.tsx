import { getIdentity, getCloudflareEnv } from '@/lib/auth';
import { AdminView } from '@/modules/feedback/components/AdminView';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const env = await getCloudflareEnv();
  let userEmail: string;

  try {
    userEmail = await getIdentity(env);
  } catch (error) {
    console.error("Admin auth failed:", error);
    redirect('/');
  }

  // Logic: Only allow the admin set in environment
  const adminEmail = (env as Record<string, unknown>).ADMIN_EMAIL as string;
  const isAdmin = userEmail === adminEmail;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-black text-white mb-4 tracking-tight uppercase">Unauthorized</h1>
        <p className="text-slate-500 mb-8 max-w-md">This area is for the DevBoxUI administrators only. Your account ({userEmail}) does not have permission to view this page.</p>
        <Link href="/dashboard" className="text-indigo-400 hover:underline font-bold uppercase tracking-widest text-xs">Return to Dashboard</Link>
      </div>
    );
  }

  return <AdminView userEmail={userEmail} />;
}
