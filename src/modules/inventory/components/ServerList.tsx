'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ServerConfig } from '../types';
import { AddDomainModal } from './AddDomainModal';
import { ReinstallModal } from './ReinstallModal';
import { getServerLogs } from '../actions';

interface ServerListProps {
  servers: ServerConfig[];
  userEmail: string;
  onAddProject: (serverId: string, projectName: string, port: number) => Promise<void>;
  onUpdateDomain: (serverId: string, oldDomain: string, newSubdomain: string, port: number) => Promise<void>;
  onDeleteDomain: (serverId: string, domain: string) => Promise<void>;
  onDeleteServer: (serverId: string) => Promise<void>;
  onToggleLock?: (serverId: string, enableLock: boolean) => Promise<void>;
  onReinstall?: (serverId: string) => Promise<void>;
}

export function ServerList(props: ServerListProps) {
  if (props.servers.length === 0) {
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
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Type</th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Server Identification</th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Environment</th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Service URLs</th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {props.servers.map((server) => (
              <ServerRow key={server.id} server={server} {...props} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-6">
        {props.servers.map((server) => (
          <ServerCard key={server.id} server={server} {...props} />
        ))}
      </div>
    </>
  );
}

function ServerRow({ server, userEmail, onAddProject, onUpdateDomain, onDeleteDomain, onDeleteServer, onReinstall }: ServerListProps & { server: ServerConfig }) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<{ domain: string; port: number } | null>(null);
  const [isReinstallModalOpen, setIsReinstallModalOpen] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<{ docker: string, setup: string, timestamp: string } | null>(null);

  // const safeTargetBase = `${userEmail}-${server.id}`.replace(/[^a-zA-Z0-9]/g, '_');
  const displayHostname = (server.hostname || 'devbox').replace('.devboxui.com', '');

  const handleFetchLogs = async () => {
    setIsLogsModalOpen(true);
    setIsFetchingLogs(true);
    try {
      const result = await getServerLogs(server.id);
      if (result.success && result.logsUrl) {
        const resp = await fetch(result.logsUrl, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json() as { docker: string, setup: string, timestamp: string };
          setDebugData(data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    } finally {
      setIsFetchingLogs(false);
    }
  };

  return (
    <tr className="group hover:bg-slate-800/30 transition-colors">
      <AddDomainModal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingDomain(null); }}
        onAdd={(name, port) => editingDomain ? onUpdateDomain(server.id, editingDomain.domain, name, port) : onAddProject(server.id, name, port)}
        initialData={editingDomain ? { prefix: editingDomain.domain.replace('.devboxui.com', ''), port: editingDomain.port || 80 } : undefined}
      />
      <ReinstallModal
        isOpen={isReinstallModalOpen}
        onClose={() => setIsReinstallModalOpen(false)}
        onConfirm={async () => {
          try { await onReinstall?.(server.id); }
          finally { setIsReinstallModalOpen(false); }
        }}
        serverName={server.hostname || server.ip}
        serverId={server.id}
        provider={server.providerName}
        isAutomated={!!(server.hetznerServerId || server.contaboInstanceId)}
      />

      {/* Status */}
      <td className="py-6 px-4">
        {!(server.hetznerServerId || server.contaboInstanceId) ? (
          <span className="text-xs font-bold text-slate-600">—</span>
        ) : (
          <div className="flex items-center space-x-2">
            {server.status === 'ready' ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            ) : server.status === 'waiting-for-bootstrap' ? (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-600" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{server.status}</span>
          </div>
        )}
      </td>

      {/* Type */}
      <td className="py-6 px-4">
        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest ${
          (server.hetznerServerId || server.contaboInstanceId) 
            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
            : 'bg-slate-800 text-slate-400 border border-slate-700'
        }`}>
          {server.providerName || 'Custom'}
        </span>
      </td>

      {/* Server Identification */}
      <td className="py-6 px-4">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="text-base font-mono font-bold text-white leading-none">{server.ip}</span>
            <CopyButton value={server.ip} />
            {server.rootPassword && (
              <div className="flex items-center space-x-1 pl-1 border-l border-slate-800 ml-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">PWD</span>
                <CopyButton value={server.rootPassword} />
              </div>
            )}
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1">{displayHostname}.devboxui.com</span>
        </div>
      </td>

      {/* Environment */}
      <td className="py-6 px-4">
        <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded uppercase tracking-widest">Ubuntu 24.04</span>
      </td>

      {/* Service URLs */}
      <td className="py-6 px-4">
        <div className="flex flex-col space-y-2 min-w-[200px]">
          {server.projects?.map((project) => (
            <div key={project.domain} className="flex items-center justify-between group/url">
              <a
                href={`https://${project.domain}`}
                target={`win_${project.domain.replace(/[^a-zA-Z0-9]/g, '_')}`}
                className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors flex items-center space-x-1"
              >
                <span>{project.domain}</span>
                <svg className="w-3 h-3 opacity-0 group-hover/url:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <div className="flex items-center space-x-1 opacity-0 group-hover/url:opacity-100 transition-opacity">
                <button onClick={() => { setEditingDomain({ domain: project.domain, port: project.port || 80 }); setIsProjectModalOpen(true); }} className="p-1 text-slate-500 hover:text-white transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button
                  onClick={async () => {
                    if (confirm(`Delete ${project.domain}?`)) {
                      setDeletingDomain(project.domain);
                      try { await onDeleteDomain(server.id, project.domain); } finally { setDeletingDomain(null); }
                    }
                  }}
                  className="p-1 text-slate-500 hover:text-rose-500 transition-colors"
                >
                  {deletingDomain === project.domain ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setIsProjectModalOpen(true)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 transition-colors text-left">+ Add Domain</button>
        </div>
      </td>

      {/* Actions */}
      <td className="py-6 px-4 text-right">
        <div className="flex items-center justify-end space-x-1">
          <button onClick={handleFetchLogs} disabled={isFetchingLogs} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all" title="Logs">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <button
            onClick={() => setIsReinstallModalOpen(true)}
            className="p-2 text-slate-500 hover:text-amber-500 hover:bg-slate-800 rounded-lg transition-all"
            title="Reinstall"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>

          {(server.hetznerServerId || server.contaboInstanceId) && (
            <button
              onClick={async () => { if (confirm("Delete server?")) await onDeleteServer(server.id); }}
              disabled={server.isLocked}
              className={`p-2 rounded-lg transition-all ${server.isLocked ? 'text-slate-800' : 'text-slate-500 hover:text-rose-500 hover:bg-rose-500/10'}`}
              title="Delete Server"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}

          <div className="pl-2 ml-2 border-l border-slate-800 flex items-center space-x-2">
            <IdeLaunchButton server={server} />
          </div>
        </div>
        {isLogsModalOpen && (
          <LogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} debugData={debugData} isFetching={isFetchingLogs} />
        )}
      </td>
    </tr>
  );
}

function ServerCard({ server, onAddProject, onUpdateDomain, onDeleteDomain, onDeleteServer, onReinstall }: ServerListProps & { server: ServerConfig }) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<{ domain: string; port: number } | null>(null);
  const [isReinstallModalOpen, setIsReinstallModalOpen] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  // const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [debugData, setDebugData] = useState<{ docker: string, setup: string, timestamp: string } | null>(null);

  const displayHostname = (server.hostname || 'devbox').replace('.devboxui.com', '');

  const handleFetchLogs = async () => {
    setIsLogsModalOpen(true);
    setIsFetchingLogs(true);
    try {
      const result = await getServerLogs(server.id);
      if (result.success && result.logsUrl) {
        const resp = await fetch(result.logsUrl, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json() as { docker: string, setup: string, timestamp: string };
          setDebugData(data);
        }
      }
    } finally { setIsFetchingLogs(false); }
  };

  /*
  const handleToggleLock = async () => {
    if (onToggleLock) {
      setIsTogglingLock(true);
      await onToggleLock(server.id, !server.isLocked);
      setIsTogglingLock(false);
    }
  };
  */

  const handleDelete = async () => {
    if (confirm("Delete this server?")) {
      try { await onDeleteServer(server.id); } catch { console.error("Delete failed"); }
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-all group relative overflow-hidden">
      <AddDomainModal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingDomain(null); }}
        onAdd={(name, port) => editingDomain ? onUpdateDomain(server.id, editingDomain.domain, name, port) : onAddProject(server.id, name, port)}
        initialData={editingDomain ? { prefix: editingDomain.domain.replace('.devboxui.com', ''), port: editingDomain.port || 80 } : undefined}
      />
      <ReinstallModal
        isOpen={isReinstallModalOpen}
        onClose={() => setIsReinstallModalOpen(false)}
        onConfirm={async () => {
          try { await onReinstall?.(server.id); }
          finally { setIsReinstallModalOpen(false); }
        }}
        serverName={server.hostname || server.ip}
        serverId={server.id}
        provider={server.providerName}
        isAutomated={!!(server.hetznerServerId || server.contaboInstanceId)}
      />

      {/* Mobile Card Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-950/50 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded uppercase tracking-widest border border-slate-700">Ubuntu 24.04</span>
              <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest ${
                (server.hetznerServerId || server.contaboInstanceId) 
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {server.providerName || 'Custom'}
              </span>
              {(server.hetznerServerId || server.contaboInstanceId) && server.status === 'ready' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-mono font-bold text-white tracking-tight">{server.ip}</h3>
                <CopyButton value={server.ip} />
                {server.rootPassword && (
                  <div className="flex items-center space-x-1 pl-1 border-l border-slate-800 ml-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">PWD</span>
                    <CopyButton value={server.rootPassword} />
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono tracking-widest mt-0.5">{displayHostname}.devboxui.com</p>
            </div>
          </div>
          <div className="flex space-x-1">
            {(server.hetznerServerId || server.contaboInstanceId) && (
              <button onClick={handleDelete} disabled={server.isLocked} className="p-2 text-slate-500 hover:text-rose-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <button onClick={handleFetchLogs} className="flex-1 py-2 text-xs font-bold uppercase bg-slate-800 text-slate-300 rounded-lg">Logs</button>
          <button onClick={() => setIsReinstallModalOpen(true)} className="flex-1 py-2 text-xs font-bold uppercase bg-slate-800 text-slate-300 rounded-lg">Reinstall</button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Projects</span>
            <button onClick={() => setIsProjectModalOpen(true)} className="text-xs font-bold text-indigo-500 hover:text-indigo-400 transition-colors">+ Add Domain</button>
          </div>
          {server.projects?.map(p => (
            <div key={p.domain} className="flex justify-between items-center bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
              <span className="text-sm font-mono text-indigo-400 truncate max-w-[200px]">{p.domain}</span>
              <div className="flex space-x-2">
                <button onClick={() => { setEditingDomain({ domain: p.domain, port: p.port || 80 }); setIsProjectModalOpen(true); }} className="text-slate-600 hover:text-white"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg></button>
                <button onClick={() => onDeleteDomain(server.id, p.domain)} className="text-slate-600 hover:text-rose-500"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col space-y-2 mt-4">
          <IdeLaunchButton server={server} fullWidth />
        </div>
      </div>

      {isLogsModalOpen && <LogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} debugData={debugData} isFetching={isFetchingLogs} />}
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
    <button onClick={handleCopy} className="text-slate-500 hover:text-white transition-colors">
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 00-2 2h2a2 2 0 002-2M8 5a2 2 0 002-2h2a2 2 0 002-2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
      )}
    </button>
  );
}

function LogsModal({ isOpen, onClose, debugData, isFetching }: {
  isOpen: boolean,
  onClose: () => void,
  debugData: { docker: string, setup: string, timestamp: string } | null,
  isFetching: boolean
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white uppercase tracking-wider">System Logs</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-slate-950 font-mono text-xs space-y-6">
          {isFetching ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-slate-500 animate-pulse">Streaming logs from VPS...</p>
            </div>
          ) : debugData ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-indigo-400 border-b border-indigo-500/20 pb-1">
                  <span className="font-bold uppercase tracking-widest text-[10px]">Cloud-Init Setup</span>
                </div>
                <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">{debugData.setup || 'No setup logs available.'}</pre>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400 border-b border-emerald-500/20 pb-1">
                  <span className="font-bold uppercase tracking-widest text-[10px]">Docker Containers</span>
                </div>
                <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">{debugData.docker || 'No container logs available.'}</pre>
              </div>
            </>
          ) : (
            <div className="text-slate-500 text-center py-20">No logs found. Ensure the bootstrap script has started on the VPS.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function IdeLaunchButton({ server, fullWidth = false }: { server: ServerConfig, fullWidth?: boolean }) {
  const [defaultIde, setDefaultIde] = useState<string>('vscode');
  const [selectedPath, setSelectedPath] = useState<string>(`/home/${server.userName || 'root'}/workspace`);
  const [liveProjects, setLiveProjects] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const savedIde = localStorage.getItem(`devboxui_default_ide_${server.id}`);
    if (savedIde) setDefaultIde(savedIde);

    const savedPath = localStorage.getItem(`devboxui_default_path_${server.id}`);
    if (savedPath) setSelectedPath(savedPath);

    const fetchLiveProjects = async () => {
      try {
        const result = await getServerLogs(server.id);
        if (result.success && result.logsUrl) {
          const resp = await fetch(result.logsUrl, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json() as { projects?: string[] };
            if (data.projects) setLiveProjects(data.projects);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch live projects from exporter", e);
      }
    };

    if (server.status === 'ready') {
      fetchLiveProjects();
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [server.id, server.status]);

  const handleSelectIde = (ideId: string) => {
    setDefaultIde(ideId);
    localStorage.setItem(`devboxui_default_ide_${server.id}`, ideId);
  };

  const handleSelectPath = (path: string) => {
    setSelectedPath(path);
    localStorage.setItem(`devboxui_default_path_${server.id}`, path);
  };

  const ides = [
    { 
      id: 'antigravity', 
      name: 'Antigravity', 
      protocol: 'antigravity', 
      colorClass: 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 shadow-purple-500/20',
      icon: (
        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    { 
      id: 'vscode', 
      name: 'VS Code', 
      protocol: 'vscode', 
      colorClass: 'bg-[#007ACC] hover:bg-[#0062a3] shadow-blue-500/20',
      icon: (
        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.15 2.58L17.62 0l-9.64 9.19-4.37-3.32L0 8.09l4.79 3.01L0 14.12l3.61 2.21 4.37-3.32 9.64 9.19 5.53-2.58L12.7 12l10.45-9.42z" />
        </svg>
      )
    },
    { 
      id: 'cursor', 
      name: 'Cursor', 
      protocol: 'cursor', 
      colorClass: 'bg-[#f54e00] hover:bg-[#d44300] shadow-orange-500/20',
      icon: (
        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" />
          <path d="M12 8c-2.209 0-4 1.791-4 4s1.791 4 4 4 4-1.791 4-4-1.791-4-4-4zm0 6c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2z" />
        </svg>
      )
    },
    { 
      id: 'phpstorm', 
      name: 'PhpStorm', 
      protocol: 'jetbrains', 
      colorClass: 'bg-[#FE315D] hover:bg-[#e01b4a] shadow-rose-500/20',
      icon: (
        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 0v24h24V0H0zm18.324 16.272c-.12.44-.36.88-.6 1.16-.48.48-1.2.76-1.88.76-.84 0-1.52-.36-1.92-.96-.28-.4-.4-.84-.4-1.32s.12-.92.4-1.32c.4-.6.96-.92 1.8-.92h.48v-1.96h-2.12v-1.16h3.24v5.72zm-7.68 0c-.12.44-.36.88-.6 1.16-.48.48-1.2.76-1.88.76-.84 0-1.52-.36-1.92-.96-.28-.4-.4-.84-.4-1.32s.12-.92.4-1.32c.4-.6.96-.92 1.8-.92h.48v-1.96H5.404v-1.16h3.24v5.72z" />
        </svg>
      )
    }
  ];

  const getIdeUrl = (ideId: string, path: string) => {
    const user = server.userName || 'root';
    if (ideId === 'phpstorm') {
      return `jetbrains://gateway/ssh/environment?h=${server.ip}&u=${user}&p=22&ideHint=PS&projectHint=${path}`;
    }
    const scheme = ideId === 'antigravity' ? 'antigravity' : (ideId === 'cursor' ? 'cursor' : 'vscode');
    return `${scheme}://vscode-remote/ssh-remote+${user}@${server.ip}${path}?windowId=_blank`;
  };

  const currentIde = ides.find(i => i.id === defaultIde) || ides.find(i => i.id === 'vscode')!;
  const currentUrl = getIdeUrl(currentIde.id, selectedPath);

  const mainWorkspacePath = `/home/${server.userName || 'root'}/workspace`;
  
  // Only list projects that actually exist on disk (if live discovery is active)
  // or show static ones if discovery fails.
  const staticProjects = server.projects?.map(p => ({ name: p.name, path: `${mainWorkspacePath}/${p.name}`, isStatic: true })) || [];
  
  const mergedProjects = liveProjects.length > 0 
    ? liveProjects.map(name => ({ 
        name, 
        path: `${mainWorkspacePath}/${name}`, 
        isStatic: staticProjects.some(sp => sp.name === name) 
      }))
    : staticProjects;

  return (
    <div className={`relative inline-flex items-stretch ${fullWidth ? 'w-full' : ''}`} ref={dropdownRef}>
      <a
        href={currentUrl}
        className={`${fullWidth ? 'flex-1 py-4 justify-center' : 'px-6 py-3'} ${currentIde.colorClass} text-white text-base font-extrabold rounded-l-xl transition-all shadow-xl inline-flex items-center whitespace-nowrap`}
      >
        {React.cloneElement(currentIde.icon as React.ReactElement<{ className?: string }>, { className: 'w-6 h-6 mr-3' })}
        <div className="flex flex-col items-start leading-tight">
          <span>Open in {currentIde.name}</span>
          <span className="text-[10px] opacity-80 font-mono tracking-tight mt-1 truncate max-w-[180px]">
            {selectedPath === mainWorkspacePath ? '~/workspace' : `~/workspace/${selectedPath.split('/').pop()}`}
          </span>
        </div>
      </a>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${fullWidth ? 'px-5' : 'px-3'} ${currentIde.colorClass} text-white rounded-r-xl border-l border-white/20 transition-all shadow-xl flex items-center justify-center hover:bg-white/10`}
        title="Choose IDE or Folder"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className={`absolute top-full ${fullWidth ? 'left-0 right-0' : 'right-0'} mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 overflow-hidden flex flex-col max-h-[85vh]`}>
          <div className="p-3 space-y-5 overflow-y-auto">
            {/* IDE Selection */}
            <div>
              <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] flex justify-between items-center">
                <span>IDE</span>
                <span className="h-px flex-1 bg-slate-800 ml-4" />
              </div>
              <div className="mt-2 space-y-1.5">
                {ides.map(ide => (
                  <button
                    key={ide.id}
                    onClick={() => handleSelectIde(ide.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg text-base transition-all flex items-center group ${
                      ide.id === currentIde.id 
                        ? 'bg-slate-800 text-white ring-1 ring-slate-700' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg mr-4 ${ide.colorClass} shadow-lg group-hover:scale-110 transition-transform`}>
                      {ide.icon && React.cloneElement(ide.icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4 mr-0' })}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold">{ide.name}</div>
                      {ide.id === currentIde.id && <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mt-0.5">Selected Default</div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Project Selection */}
            <div>
              <div className="px-3 py-1.5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] flex justify-between items-center">
                <span>Projects</span>
                <span className="h-px flex-1 bg-slate-800 ml-4" />
                {server.status === 'ready' && liveProjects.length > 0 && (
                  <div className="flex items-center ml-4 space-x-1.5">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-emerald-500 font-bold text-[9px]">LIVE</span>
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                <button
                  onClick={() => handleSelectPath(mainWorkspacePath)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-base transition-all flex items-center ${
                    selectedPath === mainWorkspacePath 
                      ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <div className="p-2 bg-slate-800 rounded-lg mr-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-lg leading-tight">Main Workspace</div>
                    <div className="text-[11px] opacity-60 font-mono mt-0.5">{mainWorkspacePath}</div>
                  </div>
                </button>

                {mergedProjects.map(project => (
                  <button
                    key={project.name}
                    onClick={() => handleSelectPath(project.path)}
                    className={`w-full text-left px-4 py-3 rounded-lg text-base transition-all flex items-center ${
                      selectedPath === project.path 
                        ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="p-2 bg-slate-800 rounded-lg mr-4 text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <div className="font-bold text-lg leading-tight">{project.name}</div>
                      </div>
                      <div className="text-[11px] opacity-60 font-mono mt-0.5">{project.path}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="px-5 py-4 bg-slate-950/50 border-t border-slate-800 flex justify-between items-center">
            <span className="text-[10px] text-slate-500 font-medium italic">PhpStorm requires JetBrains Toolbox.</span>
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">DevBox UI</span>
          </div>
        </div>
      )}
    </div>
  );
}
