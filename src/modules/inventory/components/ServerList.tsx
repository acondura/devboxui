import { useState } from 'react';
import { ServerConfig } from '../types';
import { AddProjectModal } from './AddProjectModal';

interface ServerListProps {
  servers: ServerConfig[];
  onAddProject: (serverId: string, projectName: string) => Promise<void>;
  onDeleteServer: (serverId: string) => Promise<void>;
  onToggleLock?: (serverId: string, enableLock: boolean) => Promise<void>;
}

export function ServerList({ servers, onAddProject, onDeleteServer, onToggleLock }: ServerListProps) {
  if (servers.length === 0) {
    return (
      <div className="border border-dashed border-slate-700 rounded-xl p-12 text-center bg-slate-800/20">
        <div className="mx-auto h-12 w-12 text-slate-500 mb-4 rounded-full bg-slate-800 flex items-center justify-center">
           <span className="text-2xl">☁️</span>
        </div>
        <h3 className="text-base font-semibold text-white">No servers active</h3>
        <p className="mt-1 text-sm text-slate-400 max-w-xs mx-auto">
          Add a server by IP to start provisioning your cloud development environment.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {servers.map((server) => (
        <ServerCard key={server.id} server={server} onAddProject={onAddProject} onDeleteServer={onDeleteServer} onToggleLock={onToggleLock} />
      ))}
    </div>
  );
}

function ServerCard({ server, onAddProject, onDeleteServer, onToggleLock }: { server: ServerConfig, onAddProject: (serverId: string, projectName: string) => Promise<void>, onDeleteServer: (serverId: string) => Promise<void>, onToggleLock?: (serverId: string, enableLock: boolean) => Promise<void> }) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingLock, setIsTogglingLock] = useState(false);

  const handleToggleLock = async () => {
    if (onToggleLock) {
      setIsTogglingLock(true);
      await onToggleLock(server.id, !server.isLocked);
      setIsTogglingLock(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this server? This will also remove the Cloudflare Tunnel and all associated DNS records.")) {
      setIsDeleting(true);
      try {
        await onDeleteServer(server.id);
      } catch (e) {
        alert("Failed to delete server.");
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all group relative">
      <AddProjectModal 
        isOpen={isProjectModalOpen} 
        onClose={() => setIsProjectModalOpen(false)} 
        onAdd={(name) => onAddProject(server.id, name)} 
      />
      
      <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-2">
            <span className={`h-2 w-2 rounded-full ${server.status === 'ready' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <h4 className="font-bold text-white uppercase tracking-wider text-xs">{server.status}</h4>
          </div>
          <p className="text-lg font-mono text-indigo-400 mt-1">{server.ip}</p>
          {server.tunnelUrl && (
            <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate max-w-[150px]">
              {server.tunnelUrl.replace('https://', '')}
            </p>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <div className="bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-slate-400 uppercase mr-1">
            Ubuntu 24.04
          </div>
          {server.hetznerServerId && (
            <button 
              onClick={handleToggleLock}
              disabled={isTogglingLock}
              className={`p-1.5 rounded transition-colors group/lock relative ${server.isLocked ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
            >
              {isTogglingLock ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : server.isLocked ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
              {/* Tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/lock:opacity-100 transition-opacity bg-slate-700 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                {server.isLocked ? 'Protection active (Click to unlock)' : 'Unprotected (Click to lock)'}
              </div>
            </button>
          )}
          <button 
            onClick={handleDelete}
            disabled={isDeleting || server.isLocked}
            className={`p-1.5 transition-colors rounded ${server.isLocked ? 'text-slate-700 cursor-not-allowed' : 'text-slate-500 hover:text-red-500 hover:bg-slate-800'}`}
            title={server.isLocked ? "Unlock server to delete" : "Delete Server"}
          >
            {isDeleting ? (
              <div className="h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Workspace User</span>
          <span className="text-slate-300 font-mono">{server.userName}</span>
        </div>

        {/* Projects List */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Projects</span>
            <button 
              onClick={() => setIsProjectModalOpen(true)}
              className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              + Add Project
            </button>
          </div>
          
          <div className="space-y-1.5">
            {server.projects && server.projects.length > 0 ? (
              server.projects.map((project, idx) => (
                <a 
                  key={idx}
                  href={`https://${project.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 hover:border-indigo-500/30 transition-all group/project"
                >
                  <span className="text-xs text-slate-300 font-medium">{project.name}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-[9px] text-slate-600 font-mono hidden group-hover/project:block">
                      {project.domain}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                </a>
              ))
            ) : (
              <p className="text-[10px] text-slate-600 italic">No projects yet.</p>
            )}
          </div>
        </div>
        
        {server.status === 'ready' && server.tunnelUrl ? (
          <a 
            href={server.tunnelUrl} 
            target="_blank" 
            rel="noreferrer"
            className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 transition-all text-sm active:scale-95"
          >
            Launch VS Code
          </a>
        ) : server.status === 'provisioning' ? (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 tracking-widest">
              <span>Provisioning</span>
              <span className="animate-pulse">In Progress...</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-1/2 animate-[shimmer_2s_infinite]" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
