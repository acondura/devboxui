'use client';

import { RoadmapList } from '@/modules/feedback/components/RoadmapList';
import Link from 'next/link';

interface AdminViewProps {
  userEmail: string;
}

export function AdminView({ userEmail }: AdminViewProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-8">
      <nav className="max-w-7xl mx-auto mb-12 flex justify-between items-center border-b border-slate-900 pb-6">
        <div className="flex items-center space-x-4">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white text-xl font-black">A</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Admin<span className="text-indigo-500">Panel</span></h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Logged in as {userEmail}</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest border border-slate-800 px-4 py-2 rounded-lg">
          Back to Dashboard
        </Link>
      </nav>

      <main className="max-w-7xl mx-auto">
        <header className="mb-12">
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight uppercase">Global <span className="text-indigo-500">Roadmap</span></h2>
          <p className="text-slate-500 max-w-2xl text-lg">
            Hover over any feedback card to reveal the <span className="text-emerald-500 font-bold">Mark Fixed</span> button. Marking an item as fixed will automatically move it to the Fixed column and announce it on the homepage.
          </p>
        </header>

        <RoadmapList />
      </main>
    </div>
  );
}
