import { getCloudflareEnv, getIdentity, CloudflareEnv } from '@/lib/auth';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { headers } from 'next/headers';

export const runtime = 'edge';

export default async function DashboardPage() {
  const env = await getCloudflareEnv();
  const headersList = await headers();
  
  // Collect debug info
  const debugInfo = {
    hasKV: !!env.KV,
    hasJwt: !!headersList.get('cf-access-jwt-assertion'),
    hasEmailHeader: !!(headersList.get('cf-access-authenticated-user-email') || headersList.get('x-user-email')),
    nodeEnv: process.env.NODE_ENV,
    jwtKeys: headersList.get('cf-access-jwt-assertion')?.split('.').length === 3 
      ? Object.keys(JSON.parse(globalThis.atob(headersList.get('cf-access-jwt-assertion')!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))
      : 'invalid-jwt'
  };

  try {
    const userEmail = await getIdentity(env);
    return <DashboardView userEmail={userEmail} />;
  } catch (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-red-400">Authentication Failed</h1>
            <p className="text-slate-400">We couldn't identify you through Cloudflare Access.</p>
          </div>
          
          <div className="p-4 bg-black/50 rounded-lg font-mono text-xs space-y-2 text-slate-300">
            <p className="text-indigo-400 font-bold">Debug Information:</p>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            <p className="text-red-400 mt-2">Error: {error instanceof Error ? error.message : String(error)}</p>
          </div>
          
          <a href="/" className="block w-full text-center py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
            Return to Home
          </a>
        </div>
      </div>
    );
  }
}