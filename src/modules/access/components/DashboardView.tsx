'use client';

import { useState, useEffect } from 'react';
import { AddServerModal } from '@/modules/inventory/components/AddServerModal';
import { ServerList } from '@/modules/inventory/components/ServerList';
import { provisionServer, getServers } from '@/modules/inventory/actions';
import { ServerConfig } from '@/modules/inventory/types';

interface DashboardViewProps {
  userEmail: string;
}

export function DashboardView({ userEmail }: DashboardViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadServers() {
      try {
        const data = await getServers();
        setServers(data);
      } catch (error) {
        console.error("Failed to load servers:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadServers();
  }, []);

  const handleAddServer = async (ip: string, rootPassword: string) => {
    try {
      const newServer = await provisionServer(ip, rootPassword);
      setServers(prev => [...prev, newServer]);
    } catch (error) {
      alert("Failed to provision server. Check console for details.");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 font-sans">
      <AddServerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAdd={handleAddServer} 
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
          <ServerList servers={servers} />
        )}
      </main>
    </div>
  );
}