'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AddServerModal } from '@/modules/inventory/components/AddServerModal';
import { SettingsModal } from '@/modules/access/components/SettingsModal';
import { FeedbackModal } from '@/modules/feedback/components/FeedbackModal';
import { ServerList } from '@/modules/inventory/components/ServerList';
import { provisionServer, getServers, addProject, deleteServer } from '@/modules/inventory/actions';
import { ServerConfig } from '@/modules/inventory/types';

interface DashboardViewProps {
  userEmail: string;
}

export function DashboardView({ userEmail }: DashboardViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadServers() {
      try {
        const data = await getServers();
        setServers(data || []);
      } catch (error) {
        console.error("Failed to load servers:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadServers();
  }, []);

  // Poll for updates if any server is provisioning
  useEffect(() => {
    const isProvisioning = servers.some(s => s.status === 'provisioning');
    if (!isProvisioning) return;

    let timerId: NodeJS.Timeout;

    async function poll() {
      try {
        const data = await getServers();
        setServers(data || []);
        
        // Re-schedule only if still provisioning
        if (data && data.some(s => s.status === 'provisioning')) {
          timerId = setTimeout(poll, 3000);
        }
      } catch (error) {
        console.error("Polling error:", error);
        timerId = setTimeout(poll, 5000); // Wait longer on error
      }
    }

    timerId = setTimeout(poll, 3000);
    return () => clearTimeout(timerId);
  }, [servers]); // Simplified dependency to avoid complex expression warnings

  const handleAddServer = async (name: string, serverType: string, location: string, image: string) => {
    try {
      const result = await provisionServer(name, serverType, location, image);
      if (result.success && result.server) {
        setServers(prev => [...prev, result.server]);
      }
    } catch (error) {
      alert("Failed to provision server. Check console for details.");
      console.error(error);
    }
  };

  const handleAddProject = async (serverId: string, projectName: string) => {
    try {
      const updatedServer = await addProject(serverId, projectName);
      setServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
    } catch (error) {
      alert("Failed to add project. Check console for details.");
      console.error(error);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    try {
      await deleteServer(serverId);
      setServers(prev => prev.filter(s => s.id !== serverId));
    } catch (error) {
      alert("Failed to delete server. Check console for details.");
      console.error(error);
    }
  };

  const handleToggleLock = async (serverId: string, enableLock: boolean) => {
    try {
      const { toggleServerLock } = await import('@/modules/inventory/actions');
      const result = await toggleServerLock(serverId, enableLock);
      if (result.success) {
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, isLocked: result.isLocked } : s));
      }
    } catch (error) {
      alert("Failed to toggle server protection. Check console for details.");
      console.error(error);
    }
  };

  const handleLogout = () => {
    const returnTo = encodeURIComponent(window.location.origin);
    window.location.href = `/cdn-cgi/access/logout?returnTo=${returnTo}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 font-sans">
      <AddServerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onOpenSettings={() => setIsSettingsOpen(true)}
        onAdd={handleAddServer} 
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userEmail={userEmail}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      {/* Top Navigation */}
      <nav className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <Link href="/" className="font-bold text-xl tracking-tight text-white flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg font-black">D</span>
          </div>
          <span className="uppercase italic tracking-tighter">DevBox<span className="text-indigo-500">UI</span></span>
        </Link>
        
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-xs text-indigo-400">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block text-xs text-slate-400 font-mono bg-slate-800/50 px-3 py-1.5 rounded-md border border-slate-700">
            {userEmail}
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-slate-400 hover:text-white rounded-md border border-slate-800 hover:bg-slate-800 transition-colors"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          <button 
            onClick={handleLogout}
            className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-md border border-slate-800 hover:bg-slate-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-8">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight uppercase italic">Active <span className="text-indigo-500">DevBoxes</span></h2>
              <p className="text-slate-400 text-sm mt-1">Manage and provision your team&apos;s cloud development servers.</p>
            </div>
            
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center space-x-2"
            >
              <span>+ Add Server</span>
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <ServerList servers={servers} onAddProject={handleAddProject} onDeleteServer={handleDeleteServer} onToggleLock={handleToggleLock} />
          )}
        </div>
      </main>

      {/* Floating Feedback Button */}
      <button
        onClick={() => setIsFeedbackOpen(true)}
        className="fixed bottom-8 right-8 z-50 flex items-center space-x-3 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-indigo-600/40 transition-all hover:scale-105 active:scale-95 group"
      >
        <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span className="font-bold text-sm tracking-tight">GIVE FEEDBACK</span>
      </button>
    </div>
  );
}