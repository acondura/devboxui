import { useState } from 'react';
import { ServerConfig } from '../types';
import { AddDomainModal } from './AddDomainModal';
import { getServerLogs, forceReadyServer } from '../actions';

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
          Launch a DevBox to start your cloud development environment.
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
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [debugData, setDebugData] = useState<{docker: string, setup: string, timestamp: string} | null>(null);

  const handleFetchLogs = async () => {
    setIsLogsModalOpen(true);
    setIsFetchingLogs(true);
    try {
      const result = await getServerLogs(server.id);
      if (result.success && result.logsUrl) {
        const resp = await fetch(result.logsUrl, {
          credentials: 'include'
        });
        if (resp.ok) {
          const data = await resp.json() as {docker: string, setup: string, timestamp: string};
          setDebugData(data);
        } else {
          setDebugData(null);
        }
      } else {
        setDebugData(null);
      }
    } catch {
      setDebugData(null);
    } finally {
      setIsFetchingLogs(false);
    }
  };

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
      } catch {
        alert("Failed to delete server.");
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-all group relative">
      <AddDomainModal 
        isOpen={isProjectModalOpen} 
        onClose={() => setIsProjectModalOpen(false)} 
        onAdd={(name) => onAddProject(server.id, name)} 
      />
      
      <div className="p-5 border-b border-slate-800 bg-slate-950/50 rounded-t-xl flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-2">
            {server.status !== 'provisioning' && server.status !== 'Initializing' && server.status !== 'initializing' && (
              <>
                <span className={`h-2 w-2 rounded-full ${server.status === 'ready' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} />
                <h4 className="font-bold text-white uppercase tracking-wider text-[10px]">
                  {server.status}
                </h4>
              </>
            )}
          </div>
          <div className="flex items-center space-x-2 mt-1 group/ip">
            <p className="text-lg font-mono text-indigo-400" title="Public IP address of your DevBox">{server.ip}</p>
            <CopyButton value={server.ip} />
          </div>
          {server.tunnelUrl && (
            <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate max-w-[150px]" title="Cloudflare Tunnel Endpoint">
              {server.tunnelUrl.replace('https://', '')}
            </p>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <div className="bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-slate-400 uppercase mr-1">
            Ubuntu 24.04
          </div>
          <button 
            onClick={handleFetchLogs}
            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors group/logs relative"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/logs:opacity-100 transition-opacity bg-slate-700 text-white text-[9px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-50">
              View live provisioning logs
            </div>
          </button>
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
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/lock:opacity-100 transition-opacity bg-slate-700 text-white text-[9px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-50">
                {server.isLocked ? 'Unlock to allow deletion' : 'Lock to prevent accidental deletion'}
              </div>
            </button>
          )}
          {server.status === 'provisioning' && (
            <button 
              onClick={async () => {
                if (confirm('Manually mark this server as READY? This skips waiting for the setup status but does NOT stop the setup script.')) {
                  await forceReadyServer(server.id);
                  window.location.reload();
                }
              }}
              className="p-1.5 text-slate-500 hover:text-emerald-500 hover:bg-slate-800 rounded transition-colors group/ready relative"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/ready:opacity-100 transition-opacity bg-slate-700 text-white text-[9px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-50">
                Force server to &apos;Ready&apos; state
              </div>
            </button>
          )}
          <button 
            onClick={handleDelete}
            disabled={isDeleting || server.isLocked}
            className={`p-1.5 transition-colors rounded group/delete relative ${server.isLocked ? 'text-slate-700 cursor-not-allowed' : 'text-slate-500 hover:text-red-500 hover:bg-slate-800'}`}
          >
            {isDeleting ? (
              <div className="h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/delete:opacity-100 transition-opacity bg-slate-700 text-white text-[9px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-50">
              {server.isLocked ? 'Unlock first' : 'Destroy server and DNS'}
            </div>
          </button>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        {server.rootPassword && (
          <div className="flex justify-between text-sm items-center">
            <div className="flex items-center space-x-1 group/info relative">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Root Access</span>
              <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover/info:opacity-100 transition-opacity bg-slate-800 border border-slate-700 text-slate-300 text-[9px] p-2 rounded shadow-xl w-48 pointer-events-none z-50">
                Emergency SSH access for the &apos;root&apos; user. Not needed for web-based development.
              </div>
            </div>
            <PasswordField value={server.rootPassword} />
          </div>
        )}

        {/* Domains List */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-1 group/dinfo relative">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Service Domains</span>
              <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover/dinfo:opacity-100 transition-opacity bg-slate-800 border border-slate-700 text-slate-300 text-[9px] p-2 rounded shadow-xl w-56 pointer-events-none z-50">
                Custom subdomains that route directly to web services (like DDEV) running inside your DevBox.
              </div>
            </div>
            <button 
              onClick={() => setIsProjectModalOpen(true)}
              className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              + Add Domain
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
                  <span className="text-xs text-slate-300 font-medium">{project.domain.split('.')[0]}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-[9px] text-slate-600 font-mono hidden group-hover/project:block">
                      {project.domain}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.3)]" />
                  </div>
                </a>
              ))
            ) : (
              <p className="text-[10px] text-slate-600 italic">No custom domains yet.</p>
            )}
          </div>
        </div>
        
        {/* Primary Action Button */}
        {server.tunnelUrl && (
          <div className="space-y-3 pt-2">
            <a 
              href={server.tunnelUrl} 
              target="_blank" 
              rel="noreferrer"
              className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 transition-all text-sm active:scale-95"
            >
              Launch VS Code
            </a>
            <p className="text-[10px] text-slate-500 text-center px-4 italic leading-relaxed">
              Opens your secure VS Code web interface via Cloudflare Access.
            </p>
          </div>
        )}
        
        {!server.tunnelUrl && server.status === 'provisioning' && (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 tracking-widest">
              <span>{server.detailedStatus || 'Provisioning'}</span>
              <span className="animate-pulse">Building Environment...</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-1/2 animate-[shimmer_2s_infinite]" />
            </div>
            <p className="text-[9px] text-slate-500 italic text-center">
              Initial setup usually takes 2-4 minutes.
            </p>
          </div>
        )}
      </div>

      {/* Debug Logs Modal */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Live Provisioning Status: {server.ip}</span>
              </h3>
              <button onClick={() => setIsLogsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-auto bg-slate-950 font-mono text-xs text-slate-300 flex-1 min-h-0">
              {isFetchingLogs ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500 animate-pulse text-sm font-bold tracking-widest uppercase">Connecting to DevBox...</p>
                </div>
              ) : debugData ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center text-slate-500 border-b border-slate-800 pb-2 mb-4">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600">Last Updated</span>
                    <span className="text-[10px]">{debugData.timestamp}</span>
                  </div>
                  
                  <section>
                    <h4 className="text-indigo-400 font-bold mb-2 flex items-center space-x-2 uppercase tracking-tighter text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                      <span>Docker Container Engine</span>
                    </h4>
                    <pre className="bg-slate-900/30 p-3 rounded-lg border border-slate-800/50 overflow-x-auto text-[10px] leading-tight">
                      {debugData.docker}
                    </pre>
                  </section>

                  <section>
                    <h4 className="text-emerald-400 font-bold mb-2 flex items-center space-x-2 uppercase tracking-tighter text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <span>Cloud-Init Setup (Detailed)</span>
                    </h4>
                    <pre className="bg-slate-900/30 p-3 rounded-lg border border-slate-800/50 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed">
                      {debugData.setup}
                    </pre>
                  </section>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="text-amber-500 mb-4 text-2xl">⚠️</div>
                    <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
                      Could not reach live log exporter on port 8000. <br/>
                      <span className="text-xs text-slate-500 mt-2 block">
                        This is expected if the server is still doing initial Ubuntu system updates.
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end space-x-3 bg-slate-950/50">
              <button 
                onClick={handleFetchLogs}
                disabled={isFetchingLogs}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all flex items-center space-x-2"
              >
                <svg className={`w-4 h-4 ${isFetchingLogs ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Sync Latest Logs</span>
              </button>
              <button 
                onClick={() => setIsLogsModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordField({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center space-x-2 group/pass">
      <div className="relative">
        <span className={`text-[11px] font-mono transition-all duration-200 ${show ? 'text-indigo-300' : 'text-slate-600 blur-[3px] select-none'}`}>
          {show ? value : '••••••••••••••••'}
        </span>
      </div>
      <div className="flex items-center space-x-1 opacity-0 group-hover/pass:opacity-100 transition-opacity">
        <button 
          onClick={() => setShow(!show)} 
          className="p-1 text-slate-500 hover:text-indigo-400 transition-colors group/view relative"
        >
          {show ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L4.242 4.243m11.515 11.515L21.364 21" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/view:opacity-100 transition-opacity bg-slate-700 text-white text-[8px] py-1 px-1.5 rounded pointer-events-none whitespace-nowrap z-50">
            {show ? 'Hide' : 'Show'}
          </div>
        </button>
        <button 
          onClick={handleCopy} 
          className={`p-1 transition-colors group/copy relative ${copied ? 'text-emerald-500' : 'text-slate-500 hover:text-indigo-400'}`}
        >
          {copied ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          )}
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/copy:opacity-100 transition-opacity bg-slate-700 text-white text-[8px] py-1 px-1.5 rounded pointer-events-none whitespace-nowrap z-50">
            {copied ? 'Copied!' : 'Copy'}
          </div>
        </button>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      onClick={handleCopy}
      className={`transition-all duration-200 group/cb relative ${copied ? 'text-emerald-500 opacity-100' : 'text-slate-600 hover:text-indigo-400 opacity-0 group-hover/ip:opacity-100'}`}
    >
      {copied ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      )}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/cb:opacity-100 transition-opacity bg-slate-700 text-white text-[8px] py-1 px-1.5 rounded pointer-events-none whitespace-nowrap z-50">
        Copy IP
      </div>
    </button>
  );
}
