'use client';

import { useEffect, useState } from 'react';
import { getIdentity } from '@/lib/auth';
import { RoadmapList } from '@/modules/feedback/components/RoadmapList';
import Link from 'next/link';

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    async function checkAuth() {
      const email = await getIdentity();
      setUserEmail(email);
      // Logic: Only allow you
      if (email === 'andrei@example.com' || email === 'andrei.condurachi@gmail.com') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    }
    checkAuth();
  }, []);

  if (isAdmin === null) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  if (isAdmin === false) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-black text-white mb-4 tracking-tight uppercase italic">Unauthorized</h1>
      <p className="text-slate-500 mb-8 max-w-md">This area is for the DevBoxUI administrators only. Your account ({userEmail}) does not have permission to view this page.</p>
      <Link href="/dashboard" className="text-indigo-400 hover:underline font-bold uppercase tracking-widest text-xs">Return to Dashboard</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-8">
      <nav className="max-w-7xl mx-auto mb-12 flex justify-between items-center border-b border-slate-900 pb-6">
        <div className="flex items-center space-x-4">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white text-xl font-black italic">A</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Admin<span className="text-indigo-500">Panel</span></h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Feedback Management</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest border border-slate-800 px-4 py-2 rounded-lg">
          Back to Dashboard
        </Link>
      </nav>

      <main className="max-w-7xl mx-auto">
        <header className="mb-12">
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight uppercase italic">Global <span className="text-indigo-500">Roadmap</span></h2>
          <p className="text-slate-500 max-w-2xl text-lg">
            Hover over any feedback card to reveal the <span className="text-emerald-500 font-bold">Mark Fixed</span> button. Marking an item as fixed will automatically move it to the Fixed column and announce it on the homepage.
          </p>
        </header>

        <RoadmapList />
      </main>
    </div>
  );
}
