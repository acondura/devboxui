'use client';

import { useState, useEffect } from 'react';
import { AddServerModal } from '@/modules/inventory/components/AddServerModal';
import { SettingsModal } from '@/modules/access/components/SettingsModal';
import { ServerList } from '@/modules/inventory/components/ServerList';
import { provisionServer, getServers, addProject, deleteServer } from '@/modules/inventory/actions';
import { ServerConfig } from '@/modules/inventory/types';

interface DashboardViewProps {
  userEmail: string;
  teamDomain: string;
}

export function DashboardView({ userEmail, teamDomain }: DashboardViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    const provisioningCount = servers.filter(s => s.status === 'provisioning').length;
    if (provisioningCount === 0) return;

    const interval = setInterval(async () => {
      try {
        const data = await getServers();
        setServers(data || []);
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [servers]);

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
    if (!teamDomain) {
      window.location.href = '/';
      return;
    }
    
    // Cloudflare Access standard logout URL with returnTo redirect
    const cleanDomain = teamDomain.replace(/^https?:\/\//, '').replace('.cloudflareaccess.com', '').split('/')[0];
    const returnTo = encodeURIComponent(window.location.origin);
    window.location.href = `https://${cleanDomain}.cloudflareaccess.com/cdn-cgi/access/logout?returnTo=${returnTo}`;
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

      {/* Top Navigation */}
      <nav className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="font-bold text-xl tracking-tight text-white flex items-center space-x-2">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">D</span>
          </div>
          <span>DevBox<span className="text-indigo-500">UI</span></span>
        </div>
        
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 001.066-2.573c.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
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
        <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Active Environments</h2>
            <p className="text-slate-400 text-sm mt-1">Manage and provision your team's cloud development servers.</p>
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
      </main>
    </div>
  );
}