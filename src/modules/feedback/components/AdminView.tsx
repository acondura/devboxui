'use client';

import { RoadmapList } from '@/modules/feedback/components/RoadmapList';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

interface AdminViewProps {
  userEmail: string;
}

interface TunnelEntry {
  id: string;
  name: string;
  status: string;
  inUse: boolean;
  safeToDelete: boolean;
}

interface TunnelSummary {
  total: number;
  inUse: number;
  healthy: number;
  orphaned: number;
  tunnels: TunnelEntry[];
}

function TunnelCleanup() {
  const [data, setData] = useState<TunnelSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | 'all' | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/cleanup-tunnels');
      setData(await res.json());
    } catch (e) {
      setMessage({ text: String(e), ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteAll = async () => {
    if (!confirm(`Delete all ${data?.orphaned} orphaned tunnels?`)) return;
    setDeleting('all');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/cleanup-tunnels', { method: 'POST' });
      const result = await res.json() as { deleted: number; failed: number };
      setMessage({ text: `Deleted ${result.deleted} tunnel(s). Failed: ${result.failed}.`, ok: result.failed === 0 });
      await load();
    } catch (e) {
      setMessage({ text: String(e), ok: false });
    } finally {
      setDeleting(null);
    }
  };

  const deleteOne = async (id: string) => {
    setDeleting(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/cleanup-tunnels?id=${id}`, { method: 'POST' });
      const result = await res.json() as { error?: string };
      if (!res.ok) {
        setMessage({ text: result.error || 'Failed', ok: false });
      } else {
        setMessage({ text: `Deleted tunnel ${id.slice(0, 8)}…`, ok: true });
        await load();
      }
    } catch (e) {
      setMessage({ text: String(e), ok: false });
    } finally {
      setDeleting(null);
    }
  };

  const orphaned = data?.tunnels.filter(t => t.safeToDelete) ?? [];
  const active = data?.tunnels.filter(t => !t.safeToDelete) ?? [];

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">
            Cloudflare <span className="text-indigo-500">Tunnels</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">Orphaned = Down + not referenced by any server in KV</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 rounded-lg transition-all disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {orphaned.length > 0 && (
            <button
              onClick={deleteAll}
              disabled={deleting !== null}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all disabled:opacity-40"
            >
              {deleting === 'all' ? 'Deleting…' : `Delete ${orphaned.length} Orphaned`}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${message.ok ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
          {message.text}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: data.total, color: 'text-white' },
            { label: 'In Use', value: data.inUse, color: 'text-emerald-400' },
            { label: 'Healthy', value: data.healthy, color: 'text-blue-400' },
            { label: 'Orphaned', value: data.orphaned, color: data.orphaned > 0 ? 'text-red-400' : 'text-slate-500' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {orphaned.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-3">Orphaned — Safe to Delete</h3>
          <div className="space-y-2">
            {orphaned.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-slate-900 border border-red-900/40 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-mono text-slate-200">{t.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{t.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase text-red-400 bg-red-900/30 px-2 py-0.5 rounded">{t.status}</span>
                  <button
                    onClick={() => deleteOne(t.id)}
                    disabled={deleting !== null}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all disabled:opacity-40"
                  >
                    {deleting === t.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <details className="group">
          <summary className="text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-300 transition-colors mb-3 list-none flex items-center gap-2">
            <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="currentColor" viewBox="0 0 20 20"><path d="M6 6l8 4-8 4V6z"/></svg>
            {active.length} Active / In-Use Tunnels
          </summary>
          <div className="space-y-1.5 mt-3">
            {active.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5">
                <div>
                  <p className="text-sm font-mono text-slate-400">{t.name}</p>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">{t.id}</p>
                </div>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${t.status === 'healthy' ? 'text-emerald-400 bg-emerald-900/30' : 'text-slate-400 bg-slate-800'}`}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {!loading && !data && (
        <p className="text-slate-500 text-sm">Failed to load tunnel data.</p>
      )}
    </section>
  );
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
        <TunnelCleanup />

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
