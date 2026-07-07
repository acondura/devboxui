'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ServerConfig } from '../types';
import { AddDomainModal } from './AddDomainModal';
import { ReinstallModal } from './ReinstallModal';
import { ScheduleModal } from './ScheduleModal';
import { ApiAuthModal } from './ApiAuthModal';
import { ConfirmSnapshotModal } from './ConfirmSnapshotModal';
import { getServerLogs, getLiveProjects, getServerSnapshots } from '../actions';
import { ConfirmSpinUpModal } from './ConfirmSpinUpModal';
import { ScheduleConfig } from '../types';
import { triggerMorningSpinup, triggerEveningSnapshot } from '../schedule-actions';
import { Select2 } from './Select2';
import { InviteCollabModal } from './InviteCollabModal';
import { ErrorModal } from './ErrorModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface ServerListProps {
  servers: ServerConfig[];
  userEmail: string;
  onAddProject: (serverId: string, projectName: string, port: number, startDdev?: boolean) => Promise<void>;
  onUpdateDomain: (serverId: string, oldDomain: string, newSubdomain: string, port: number, startDdev?: boolean) => Promise<void>;
  onDeleteDomain: (serverId: string, domain: string) => Promise<void>;
  onDeleteServer: (serverId: string) => Promise<void>;
  onToggleLock?: (serverId: string, enableLock: boolean) => Promise<void>;
  onReinstall?: (serverId: string) => Promise<void>;
  onUpdateAllowedPeers?: (serverId: string, allowedPeers: string[]) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

type SortField = 'status' | 'type' | 'ip' | 'os' | 'created';
type SortOrder = 'asc' | 'desc';



export function ServerList(props: ServerListProps) {
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const savedField = localStorage.getItem('devboxui_sort_field') as SortField | null;
    const savedOrder = localStorage.getItem('devboxui_sort_order') as SortOrder | null;
    if (savedField) setSortField(savedField);
    if (savedOrder) setSortOrder(savedOrder);
  }, []);

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      const nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(nextOrder);
      localStorage.setItem('devboxui_sort_order', nextOrder);
    } else {
      setSortField(field);
      setSortOrder('desc');
      localStorage.setItem('devboxui_sort_field', field);
      localStorage.setItem('devboxui_sort_order', 'desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-slate-600 ml-1">⇅</span>;
    }
    return sortOrder === 'asc' ? <span className="text-indigo-400 ml-1">▲</span> : <span className="text-indigo-400 ml-1">▼</span>;
  };

  const sortedServers = [...props.servers].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'created') {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    } else if (sortField === 'status') {
      const statusA = a.status || '';
      const statusB = b.status || '';
      comparison = statusA.localeCompare(statusB);
    } else if (sortField === 'type') {
      const typeA = a.providerName || 'Custom';
      const typeB = b.providerName || 'Custom';
      comparison = typeA.localeCompare(typeB);
    } else if (sortField === 'ip') {
      const ipA = a.ip || '';
      const ipB = b.ip || '';
      comparison = ipA.localeCompare(ipB);
    } else if (sortField === 'os') {
      comparison = "Ubuntu 24.04".localeCompare("Ubuntu 24.04");
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <>
      {/* Sort Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 bg-white border border-slate-200 rounded-xl p-4 gap-4 shadow-sm">
        <span className="text-sm text-slate-650 font-medium">
          Active Servers: <strong className="text-slate-900">{props.servers.length}</strong>
        </span>
        <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sort by:</span>
          <div className="flex items-center space-x-1.5">
            <Select2
              value={sortField}
              onValueChange={(val) => handleSort(val as SortField)}
              minimumResultsForSearch={-1}
              containerClassName="select-small"
              className="bg-white border border-slate-250 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer w-full"
            >
              <option value="created">Created Date</option>
              <option value="status">Status</option>
              <option value="type">Provider</option>
              <option value="ip">IP Address</option>
              <option value="os">OS</option>
            </Select2>
            <button
              onClick={() => {
                const nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                setSortOrder(nextOrder);
                localStorage.setItem('devboxui_sort_order', nextOrder);
              }}
              className="px-2.5 py-1.5 bg-white border border-slate-250 rounded-lg hover:border-slate-400 text-slate-600 hover:text-slate-900 transition-all text-xs"
              title="Toggle sort direction"
            >
              {sortOrder === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th onClick={() => handleSort('status')} className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                <div className="flex items-center space-x-1">
                  <span>Status</span>
                  {renderSortIcon('status')}
                </div>
              </th>
              <th onClick={() => handleSort('type')} className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                <div className="flex items-center space-x-1">
                  <span>Provider</span>
                  {renderSortIcon('type')}
                </div>
              </th>
              <th onClick={() => handleSort('ip')} className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                <div className="flex items-center space-x-1">
                  <span>Server ID</span>
                  {renderSortIcon('ip')}
                </div>
              </th>
              <th onClick={() => handleSort('os')} className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                <div className="flex items-center space-x-1">
                  <span>OS</span>
                  {renderSortIcon('os')}
                </div>
              </th>
              <th onClick={() => handleSort('created')} className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                <div className="flex items-center space-x-1">
                  <span>Created</span>
                  {renderSortIcon('created')}
                </div>
              </th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Service URLs</th>
              <th className="py-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sortedServers.map((server) => (
              <ServerRow key={server.id} server={server} {...props} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-6">
        {sortedServers.map((server) => (
          <ServerCard key={server.id} server={server} {...props} />
        ))}
      </div>
    </>
  );
}

function ServerRow({ server, userEmail, onAddProject, onUpdateDomain, onDeleteDomain, onDeleteServer, onReinstall, onUpdateAllowedPeers, servers, onRefresh }: ServerListProps & { server: ServerConfig }) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isApiAuthOpen, setIsApiAuthOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<{ domain: string; port: number; startDdev?: boolean } | null>(null);
  const [isReinstallModalOpen, setIsReinstallModalOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(server.scheduleConfig || null);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);
  const [debugData, setDebugData] = useState<{ docker: string, setup: string, timestamp: string } | null>(null);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [tunnelId, setTunnelId] = useState<string | undefined>(server.tunnelId);
  const [tunnelToken, setTunnelToken] = useState<string | undefined>(server.tunnelToken);
  const [isSpinningUp, setIsSpinningUp] = useState(false);
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [isConfirmSnapshotOpen, setIsConfirmSnapshotOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleteServerOpen, setIsDeleteServerOpen] = useState(false);
  const [deletingDomainPending, setDeletingDomainPending] = useState<string | null>(null);

  const [vpsSnapshots, setVpsSnapshots] = useState<Array<{ id: number | string; description?: string; name?: string | null }>>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('latest');
  const [isSpinUpOpen, setIsSpinUpOpen] = useState(false);

  const isAutomated = !!(server.providerName === 'Hetzner' || server.providerName === 'Contabo' || server.provider === 'hetzner' || server.provider === 'contabo' || server.provider === 'digitalocean');
  const isHetzner = !!(server.providerName === 'Hetzner' || server.provider === 'hetzner');
  const isDigitalOcean = server.provider === 'digitalocean';
  const displayHostname = (server.hostname || 'devbox')
    .replace('.devboxui.com', '')
    .replace('-direct', '');

  useEffect(() => {
    if (server.status === 'off' && (isHetzner || isDigitalOcean)) {
      async function loadSnapshots() {
        try {
          const list = await getServerSnapshots(server.id);
          setVpsSnapshots(list);
          const savedSnapshot = localStorage.getItem(`devbox_last_snapshot_${server.id}`);
          if (savedSnapshot && (savedSnapshot === 'latest' || list.some((s: { id: number | string }) => s.id.toString() === savedSnapshot))) {
            setSelectedSnapshotId(savedSnapshot);
          } else {
            setSelectedSnapshotId('latest');
          }
        } catch (e) {
          console.warn("Failed to load snapshots for server", e);
        }
      }
      loadSnapshots();
    }
  }, [server.id, server.status, isHetzner, isDigitalOcean]);

  const handleSnapshotChange = (id: string) => {
    setSelectedSnapshotId(id);
    localStorage.setItem(`devbox_last_snapshot_${server.id}`, id);
  };

  const handleFetchLogs = async () => {
    setIsLogsModalOpen(true);
    setIsFetchingLogs(true);
    try {
      const result = await getServerLogs(server.id);
      if (result.success) {
        setServerLogs(result.serverLogs || []);
        if (result.tunnelId) setTunnelId(result.tunnelId);
        if (result.tunnelToken) setTunnelToken(result.tunnelToken);
        if (result.logsUrl) {
          const resp = await fetch(result.logsUrl, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json() as { docker: string, setup: string, timestamp: string };
            setDebugData(data);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    } finally {
      setIsFetchingLogs(false);
    }
  };

  const handleSpinUp = async (customServerType?: string, snapshotIdStr?: string) => {
    setIsSpinningUp(true);
    try {
      const snapId = !snapshotIdStr || snapshotIdStr === 'latest' ? undefined : parseInt(snapshotIdStr, 10);
      const result = await triggerMorningSpinup(server.id, snapId, customServerType);
      if (result.success) {
        if (onRefresh) await onRefresh();
      } else {
        setErrorMessage(result.message || 'Spin up failed.');
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Spin up failed.');
    } finally {
      setIsSpinningUp(false);
    }
  };

  const handleSnapshotShutdown = async (customPrefix?: string) => {
    setIsSnapshotting(true);
    try {
      const result = await triggerEveningSnapshot(server.id, customPrefix);
      if (result.success) {
        if (onRefresh) await onRefresh();
      } else {
        setErrorMessage(result.message || 'Snapshot/shutdown failed.');
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Snapshot/shutdown failed.');
    } finally {
      setIsSnapshotting(false);
    }
  };

  return (
    <tr className="group hover:bg-slate-50 transition-colors border-b border-slate-100">

      {/* Status */}
      <td className="py-2.5 px-4">
        {!isAutomated ? (
          <span className="text-sm font-bold text-slate-400">—</span>
        ) : (
          <div className="flex items-center space-x-2" title={server.status === 'off' ? "SLEEPING = Server powered off, snapshot taken, server deleted - this ensures you only pay for what you use." : undefined}>
            {server.status === 'ready' ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            ) : server.status === 'waiting-for-bootstrap' ? (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            ) : ['provisioning', 'configuring', 'initializing', 'Initializing', 'starting', 'snapshotting'].includes(server.status) ? (
              <span className="h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : server.status === 'off' && scheduleConfig?.enabled ? (
              <span className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] animate-pulse" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-400" />
            )}
            <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
              {server.status === 'off' ? 'sleeping' : (server.detailedStatus || server.status)}
            </span>
          </div>
        )}
      </td>

      {/* Provider */}
      <td className="py-2.5 px-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          {server.providerName || 'Custom'}
        </span>
      </td>

      {/* Server ID */}
      <td className="py-2.5 px-4">
        <div className="flex flex-col space-y-1 text-left">
          <span className="text-lg font-extrabold text-slate-900 tracking-tight">{displayHostname}</span>
          
          {server.serverSpecs && (
            <span className="text-sm font-medium text-slate-500 leading-tight">
              {server.serverSpecs}
            </span>
          )}
          
          {server.status !== 'off' && (
            <div className="flex items-center space-x-2 text-sm font-mono text-slate-400">
              <span>{server.ip}</span>
              <CopyButton value={server.ip} />
              {server.rootPassword && (
                <div className="flex items-center space-x-1 pl-1.5 border-l border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase">PWD</span>
                  <CopyButton value={server.rootPassword} />
                </div>
              )}
            </div>
          )}

          {server.collaborators && server.collaborators.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 max-w-[280px]">
              {server.collaborators.map((c) => (
                <span key={c.email} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-650 border border-slate-200" title={`${c.email} (${c.status})`}>
                  👤 {c.username || c.email.split('@')[0]}
                  {c.status === 'pending' && <span className="ml-1 text-[8px] text-amber-500 font-extrabold uppercase">(pending)</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* OS */}
      <td className="py-2.5 px-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ubuntu 24.04</span>
      </td>

      {/* Created */}
      <td className="py-2.5 px-4">
        <span className="text-sm font-bold text-slate-500 font-mono">
          {server.createdAt ? new Date(server.createdAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }) : '—'}
        </span>
      </td>

      {/* Service URLs */}
      <td className="py-2.5 px-4">
        <div className="flex flex-col space-y-2 min-w-[200px]">
          {server.projects?.map((project) => (
            <div key={project.domain} className="flex items-center justify-between group/url">
              <a
                href={`https://${project.domain}`}
                target={`win_${project.domain.replace(/[^a-zA-Z0-9]/g, '_')}`}
                className="text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors flex items-center space-x-1"
              >
                <span>{project.domain}</span>
                <svg className="w-3 h-3 opacity-0 group-hover/url:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <div className="flex items-center space-x-1 opacity-0 group-hover/url:opacity-100 transition-opacity">
                <button onClick={() => { setEditingDomain({ domain: project.domain, port: project.port || 80, startDdev: project.startDdev }); setIsProjectModalOpen(true); }} className="p-1 text-slate-500 hover:text-white transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button
                  onClick={() => setDeletingDomainPending(project.domain)}
                  className="p-1 text-slate-500 hover:text-rose-500 transition-colors"
                >
                  {deletingDomain === project.domain ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setIsProjectModalOpen(true)} className="text-xs font-bold text-indigo-500 hover:text-indigo-400 transition-colors text-left">+ Add Domain</button>
        </div>
      </td>

      {/* Actions */}
      <td className="py-2.5 px-4 text-right">
        <div className="flex items-center justify-end space-x-2.5">
          <div className="flex flex-col items-center">
            <button
              onClick={handleFetchLogs}
              disabled={isFetchingLogs || isDeleting || isReinstalling}
              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
              title="Logs"
            >
              {isFetchingLogs ? (
                <div className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              )}
            </button>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
              Logs
            </span>
          </div>

          <div className="flex flex-col items-center">
            <button
              onClick={() => setIsReinstallModalOpen(true)}
              disabled={isFetchingLogs || isDeleting || isReinstalling}
              className="p-2 text-slate-500 hover:text-amber-500 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
              title="Reinstall"
            >
              {isReinstalling ? (
                <div className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
            </button>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
              Reinstall
            </span>
          </div>

          {/* API Auth Button */}
          {isAutomated && (
            <div className="flex flex-col items-center">
              <button
                onClick={() => setIsApiAuthOpen(true)}
                disabled={isDeleting || isReinstalling}
                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
                title="API Authorization"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </button>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
                Auth
              </span>
            </div>
          )}

          {/* Share/Collaborators Button */}
          {isAutomated && (
            <div className="flex flex-col items-center">
              <button
                onClick={() => setIsInviteOpen(true)}
                disabled={isDeleting || isReinstalling}
                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
                title="Share & Invite Collaborators"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </button>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
                Share
              </span>
            </div>
          )}

          {/* Schedule button — for Hetzner and DigitalOcean servers */}
          {(isHetzner || isDigitalOcean) && (
            <div className="flex flex-col items-center">
              <button
                onClick={() => setIsScheduleOpen(true)}
                disabled={isDeleting || isReinstalling}
                className={`relative p-2 rounded-lg transition-all disabled:opacity-50 ${
                  scheduleConfig?.enabled
                    ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'
                    : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'
                }`}
                title={scheduleConfig?.enabled ? `Schedule active — ${scheduleConfig.spinupTime} / ${scheduleConfig.snapshotTime}` : 'Set daily schedule'}
              >
                {scheduleConfig?.enabled && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_6px_rgba(99,102,241,0.8)] animate-pulse" />
                )}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
                Schedule
              </span>
            </div>
          )}

          {/* Snapshot & Shutdown button — for Hetzner and DigitalOcean servers that are running/not off */}
          {(isHetzner || isDigitalOcean) && server.status !== 'off' && (
            <div className="flex flex-col items-center">
              <button
                onClick={() => setIsConfirmSnapshotOpen(true)}
                disabled={isSnapshotting || isDeleting || isReinstalling}
                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
                title="Snapshot & Shutdown (Saves costs)"
              >
                {isSnapshotting ? (
                  <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                )}
              </button>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
                Snapshot
              </span>
            </div>
          )}

          {isAutomated && (
            <div className="flex flex-col items-center">
              <button
                onClick={async () => {
                  setIsDeleteServerOpen(true);
                }}
                disabled={server.isLocked || isFetchingLogs || isDeleting || isReinstalling}
                className={`p-2 rounded-lg transition-all ${
                  server.isLocked || isDeleting
                    ? 'text-slate-850 opacity-40'
                    : 'text-slate-500 hover:text-rose-500 hover:bg-rose-500/10'
                }`}
                title="Delete Server"
              >
                {isDeleting ? (
                  <div className="h-4 w-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                )}
              </button>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 select-none text-center">
                Delete
              </span>
            </div>
          )}

          <div className="pl-2 ml-2 border-l border-slate-200 flex items-center space-x-2">
            {server.status === 'off' ? (
              <button
                onClick={() => setIsSpinUpOpen(true)}
                disabled={isSpinningUp}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-lg inline-flex items-center whitespace-nowrap"
              >
                {isSpinningUp ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                <span>{isSpinningUp ? 'Spinning Up...' : 'Spin Up'}</span>
              </button>
            ) : (
              <IdeLaunchButton server={server} />
            )}
          </div>
        </div>
        <ConfirmSnapshotModal
          isOpen={isConfirmSnapshotOpen}
          onClose={() => setIsConfirmSnapshotOpen(false)}
          onConfirm={handleSnapshotShutdown}
          serverName={server.hostname || server.ip}
        />
        <ConfirmDeleteModal
          isOpen={isDeleteServerOpen}
          onClose={() => setIsDeleteServerOpen(false)}
          onConfirm={async () => {
            setIsDeleting(true);
            try {
              await onDeleteServer(server.id);
            } catch (e) {
              console.error("Failed to delete server:", e);
            } finally {
              setIsDeleting(false);
            }
          }}
          title="Delete Server"
          description={`Are you sure you want to delete "${server.hostname?.replace('.devboxui.com', '').replace('-direct', '') || server.ip}"? This action cannot be undone.`}
          confirmLabel="Delete Server"
        />
        <ConfirmDeleteModal
          isOpen={deletingDomainPending !== null}
          onClose={() => setDeletingDomainPending(null)}
          onConfirm={async () => {
            if (!deletingDomainPending) return;
            setDeletingDomain(deletingDomainPending);
            try { await onDeleteDomain(server.id, deletingDomainPending); } finally { setDeletingDomain(null); }
          }}
          title="Delete Domain"
          description={`Are you sure you want to delete "${deletingDomainPending}"?`}
          confirmLabel="Delete Domain"
        />
        <AddDomainModal
          isOpen={isProjectModalOpen}
          onClose={() => { setIsProjectModalOpen(false); setEditingDomain(null); }}
          onAdd={(name, port, startDdev) => editingDomain ? onUpdateDomain(server.id, editingDomain.domain, name, port, startDdev) : onAddProject(server.id, name, port, startDdev)}
          initialData={editingDomain ? { prefix: editingDomain.domain.replace('-web.devboxui.com', '').replace('.devboxui.com', ''), port: editingDomain.port || 80, startDdev: editingDomain.startDdev } : undefined}
        />
        <ReinstallModal
          isOpen={isReinstallModalOpen}
          onClose={() => setIsReinstallModalOpen(false)}
          onConfirm={async () => {
            setIsReinstalling(true);
            try {
              await onReinstall?.(server.id);
              if (onRefresh) await onRefresh();
            } finally {
              setIsReinstalling(false);
              setIsReinstallModalOpen(false);
            }
          }}
          serverName={server.hostname || server.ip}
          serverId={server.id}
          provider={server.providerName}
          isAutomated={isAutomated}
        />
        {isScheduleOpen && (
          <ScheduleModal
            isOpen={isScheduleOpen}
            onClose={() => setIsScheduleOpen(false)}
            serverId={server.id}
            serverName={server.hostname || server.ip}
            serverStatus={server.status}
            onSaved={(cfg) => setScheduleConfig(cfg)}
            onRefresh={onRefresh}
          />
        )}
        {isLogsModalOpen && (
          <LogsModal
            isOpen={isLogsModalOpen}
            onClose={() => setIsLogsModalOpen(false)}
            debugData={debugData}
            serverLogs={serverLogs}
            isFetching={isFetchingLogs}
            tunnelId={tunnelId}
            tunnelToken={tunnelToken}
          />
        )}
        {isApiAuthOpen && onUpdateAllowedPeers && (
          <ApiAuthModal
            isOpen={isApiAuthOpen}
            onClose={() => setIsApiAuthOpen(false)}
            server={server}
            allServers={servers}
            onSave={onUpdateAllowedPeers}
          />
        )}
        {isSpinUpOpen && (
          <ConfirmSpinUpModal
            isOpen={isSpinUpOpen}
            onClose={() => setIsSpinUpOpen(false)}
            onConfirm={async (selectedType, selectedSnap) => {
              await handleSpinUp(selectedType, selectedSnap);
            }}
            serverId={server.id}
            serverName={server.hostname || server.ip}
            defaultServerType={server.serverType || 'cpx21'}
            vpsSnapshots={vpsSnapshots}
            selectedSnapshotId={selectedSnapshotId}
            onSnapshotChange={handleSnapshotChange}
          />
        )}
        <InviteCollabModal
          serverId={server.id}
          orgId={server.orgId || userEmail}
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          onSuccess={onRefresh}
        />
        <ErrorModal
          isOpen={!!errorMessage}
          onClose={() => setErrorMessage(null)}
          message={errorMessage || ''}
        />
      </td>
    </tr>
  );
}

function ServerCard({ server, onAddProject, onUpdateDomain, onDeleteDomain, onDeleteServer, onReinstall, onUpdateAllowedPeers, servers, onRefresh }: ServerListProps & { server: ServerConfig }) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isApiAuthOpen, setIsApiAuthOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<{ domain: string; port: number; startDdev?: boolean } | null>(null);
  const [isReinstallModalOpen, setIsReinstallModalOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(server.scheduleConfig || null);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);
  const [debugData, setDebugData] = useState<{ docker: string, setup: string, timestamp: string } | null>(null);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [tunnelId, setTunnelId] = useState<string | undefined>(server.tunnelId);
  const [tunnelToken, setTunnelToken] = useState<string | undefined>(server.tunnelToken);
  const [isSpinningUp, setIsSpinningUp] = useState(false);
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [isConfirmSnapshotOpen, setIsConfirmSnapshotOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleteServerOpen, setIsDeleteServerOpen] = useState(false);
  const [deletingDomainPending, setDeletingDomainPending] = useState<string | null>(null);

  const [vpsSnapshots, setVpsSnapshots] = useState<Array<{ id: number | string; description?: string; name?: string | null }>>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('latest');
  const [isSpinUpOpen, setIsSpinUpOpen] = useState(false);

  const isAutomated = !!(server.hetznerServerId || server.contaboInstanceId || server.providerName === 'Hetzner' || server.providerName === 'Contabo' || server.provider === 'hetzner' || server.provider === 'contabo' || server.provider === 'digitalocean');
  const isHetzner = !!(server.providerName === 'Hetzner' || server.provider === 'hetzner');
  const isDigitalOcean = server.provider === 'digitalocean';
  const displayHostname = (server.hostname || 'devbox')
    .replace('.devboxui.com', '')
    .replace('-direct', '');

  useEffect(() => {
    if (server.status === 'off' && (isHetzner || isDigitalOcean)) {
      async function loadSnapshots() {
        try {
          const list = await getServerSnapshots(server.id);
          setVpsSnapshots(list);
          const savedSnapshot = localStorage.getItem(`devbox_last_snapshot_${server.id}`);
          if (savedSnapshot && (savedSnapshot === 'latest' || list.some((s: { id: number | string }) => s.id.toString() === savedSnapshot))) {
            setSelectedSnapshotId(savedSnapshot);
          } else {
            setSelectedSnapshotId('latest');
          }
        } catch (e) {
          console.warn("Failed to load snapshots for server", e);
        }
      }
      loadSnapshots();
    }
  }, [server.id, server.status, isHetzner, isDigitalOcean]);

  const handleSnapshotChange = (id: string) => {
    setSelectedSnapshotId(id);
    localStorage.setItem(`devbox_last_snapshot_${server.id}`, id);
  };

  const handleFetchLogs = async () => {
    setIsLogsModalOpen(true);
    setIsFetchingLogs(true);
    try {
      const result = await getServerLogs(server.id);
      if (result.success) {
        setServerLogs(result.serverLogs || []);
        if (result.tunnelId) setTunnelId(result.tunnelId);
        if (result.tunnelToken) setTunnelToken(result.tunnelToken);
        if (result.logsUrl) {
          const resp = await fetch(result.logsUrl, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json() as { docker: string, setup: string, timestamp: string };
            setDebugData(data);
          }
        }
      }
    } finally { setIsFetchingLogs(false); }
  };

  const handleSpinUp = async (customServerType?: string, snapshotIdStr?: string) => {
    setIsSpinningUp(true);
    try {
      const snapId = !snapshotIdStr || snapshotIdStr === 'latest' ? undefined : parseInt(snapshotIdStr, 10);
      const result = await triggerMorningSpinup(server.id, snapId, customServerType);
      if (result.success) {
        if (onRefresh) await onRefresh();
      } else {
        setErrorMessage(result.message || 'Spin up failed.');
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Spin up failed.');
    } finally {
      setIsSpinningUp(false);
    }
  };

  const handleSnapshotShutdown = async (customPrefix?: string) => {
    setIsSnapshotting(true);
    try {
      const result = await triggerEveningSnapshot(server.id, customPrefix);
      if (result.success) {
        if (onRefresh) await onRefresh();
      } else {
        setErrorMessage(result.message || 'Snapshot/shutdown failed.');
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Snapshot/shutdown failed.');
    } finally {
      setIsSnapshotting(false);
    }
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

  const handleDelete = () => {
    setIsDeleteServerOpen(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl hover:border-indigo-500/50 transition-all group relative overflow-hidden shadow-sm">
      <ConfirmSnapshotModal
        isOpen={isConfirmSnapshotOpen}
        onClose={() => setIsConfirmSnapshotOpen(false)}
        onConfirm={handleSnapshotShutdown}
        serverName={server.hostname || server.ip}
      />
      <ConfirmDeleteModal
        isOpen={isDeleteServerOpen}
        onClose={() => setIsDeleteServerOpen(false)}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await onDeleteServer(server.id);
          } catch (e) {
            console.error("Delete failed:", e);
          } finally {
            setIsDeleting(false);
          }
        }}
        title="Delete Server"
        description={`Are you sure you want to delete "${server.hostname?.replace('.devboxui.com', '').replace('-direct', '') || server.ip}"? This action cannot be undone.`}
        confirmLabel="Delete Server"
      />
      <ConfirmDeleteModal
        isOpen={deletingDomainPending !== null}
        onClose={() => setDeletingDomainPending(null)}
        onConfirm={async () => {
          if (!deletingDomainPending) return;
          setDeletingDomain(deletingDomainPending);
          try { await onDeleteDomain(server.id, deletingDomainPending); } finally { setDeletingDomain(null); }
        }}
        title="Delete Domain"
        description={`Are you sure you want to delete "${deletingDomainPending}"?`}
        confirmLabel="Delete Domain"
      />
      <AddDomainModal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingDomain(null); }}
        onAdd={(name, port, startDdev) => editingDomain ? onUpdateDomain(server.id, editingDomain.domain, name, port, startDdev) : onAddProject(server.id, name, port, startDdev)}
        initialData={editingDomain ? { prefix: editingDomain.domain.replace('-web.devboxui.com', '').replace('.devboxui.com', ''), port: editingDomain.port || 80, startDdev: editingDomain.startDdev } : undefined}
      />
      <ReinstallModal
        isOpen={isReinstallModalOpen}
        onClose={() => setIsReinstallModalOpen(false)}
        onConfirm={async () => {
          setIsReinstalling(true);
          try {
            await onReinstall?.(server.id);
            if (onRefresh) await onRefresh();
          } finally {
            setIsReinstalling(false);
            setIsReinstallModalOpen(false);
          }
        }}
        serverName={server.hostname || server.ip}
        serverId={server.id}
        provider={server.providerName}
        isAutomated={isAutomated}
      />
      {isScheduleOpen && (
        <ScheduleModal
          isOpen={isScheduleOpen}
          onClose={() => setIsScheduleOpen(false)}
          serverId={server.id}
          serverName={server.hostname || server.ip}
          serverStatus={server.status}
          onSaved={(cfg) => setScheduleConfig(cfg)}
          onRefresh={onRefresh}
        />
      )}

      {/* Mobile Card Header */}
      <div className="p-6 border-b border-slate-200 bg-slate-50 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ubuntu 24.04</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {server.providerName || 'Custom'}
              </span>
              {isAutomated && (
                <div className="flex items-center space-x-1.5 bg-slate-105 px-2 py-1 rounded border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500" title={server.status === 'off' ? "SLEEPING = Server powered off, snapshot taken, server deleted - this ensures you only pay for what you use." : undefined}>
                  {server.status === 'ready' ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  ) : server.status === 'waiting-for-bootstrap' ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  ) : ['provisioning', 'configuring', 'initializing', 'Initializing', 'starting', 'snapshotting'].includes(server.status) ? (
                    <span className="h-2 w-2 border border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  ) : server.status === 'off' && scheduleConfig?.enabled ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] animate-pulse" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  )}
                  <span>{server.status === 'off' ? 'sleeping' : (server.detailedStatus || server.status)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col space-y-1">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight text-left">{displayHostname}</h3>
              
              {server.serverSpecs && (
                <span className="text-xs font-medium text-slate-500 leading-tight text-left">
                  {server.serverSpecs}
                </span>
              )}
              
              {server.status !== 'off' && (
                <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
                  <span>{server.ip}</span>
                  <CopyButton value={server.ip} />
                  {server.rootPassword && (
                    <div className="flex items-center space-x-1.5 pl-1.5 border-l border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">PWD</span>
                      <CopyButton value={server.rootPassword} />
                    </div>
                  )}
                </div>
              )}

              {server.collaborators && server.collaborators.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 justify-start">
                  {server.collaborators.map((c) => (
                    <span key={c.email} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-650 border border-slate-200" title={`${c.email} (${c.status})`}>
                      👤 {c.username || c.email.split('@')[0]}
                      {c.status === 'pending' && <span className="ml-1 text-[8px] text-amber-500 font-extrabold uppercase">(pending)</span>}
                    </span>
                  ))}
                </div>
              )}
              
              <div className="flex flex-row justify-between items-center mt-1 text-[10px] font-mono text-slate-550 w-full font-mono text-left">
                <span />
                <span>
                  {server.createdAt ? new Date(server.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  }) : ''}
                </span>
              </div>
            </div>
          </div>
          <div className="flex space-x-1">
            {isAutomated && (
              <button
                onClick={handleDelete}
                disabled={server.isLocked || isDeleting || isReinstalling || isFetchingLogs}
                className="p-2 text-slate-400 hover:text-rose-500 disabled:opacity-50"
              >
                {isDeleting ? (
                  <div className="h-5 w-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 pt-2 flex-wrap gap-y-2">
          <button
            onClick={handleFetchLogs}
            disabled={isFetchingLogs || isDeleting || isReinstalling}
            className="flex-1 py-2 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50 flex items-center justify-center"
          >
            {isFetchingLogs && (
              <div className="h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-1.5" />
            )}
            {isFetchingLogs ? 'Loading...' : 'Logs'}
          </button>
          <button
            onClick={() => setIsReinstallModalOpen(true)}
            disabled={isFetchingLogs || isDeleting || isReinstalling}
            className="flex-1 py-2 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50 flex items-center justify-center"
          >
            {isReinstalling && (
              <div className="h-3.5 w-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mr-1.5" />
            )}
            {isReinstalling ? 'Reinstalling...' : 'Reinstall'}
          </button>
          {isAutomated && (
            <button
              onClick={() => setIsApiAuthOpen(true)}
              disabled={isDeleting || isReinstalling}
              className="flex-1 py-2 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50"
            >
              API Auth
            </button>
          )}
          {isAutomated && (
            <button
              onClick={() => setIsInviteOpen(true)}
              disabled={isDeleting || isReinstalling}
              className="flex-1 py-2 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50"
            >
              Share
            </button>
          )}
          {(isHetzner || isDigitalOcean) && (
            <button
              onClick={() => setIsScheduleOpen(true)}
              disabled={isDeleting || isReinstalling}
              className={`relative flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all disabled:opacity-50 ${
                scheduleConfig?.enabled
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  : 'bg-slate-105 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {scheduleConfig?.enabled && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              )}
              Schedule
            </button>
          )}
          {(isHetzner || isDigitalOcean) && server.status !== 'off' && (
            <button
              onClick={() => setIsConfirmSnapshotOpen(true)}
              disabled={isSnapshotting || isDeleting || isReinstalling}
              className="flex-1 py-2 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50 flex items-center justify-center"
            >
              {isSnapshotting && (
                <div className="h-3.5 w-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mr-1.5" />
              )}
              {isSnapshotting ? 'Saving...' : 'Shutdown'}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Projects</span>
            <button onClick={() => setIsProjectModalOpen(true)} className="text-xs font-bold text-indigo-655 hover:text-indigo-800 transition-colors">+ Add Domain</button>
          </div>
          {server.projects?.map(p => (
            <div key={p.domain} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
              <span className="text-sm font-mono text-indigo-600 hover:text-indigo-800 truncate max-w-[200px]">{p.domain}</span>
              <div className="flex space-x-2">
                <button onClick={() => { setEditingDomain({ domain: p.domain, port: p.port || 80, startDdev: p.startDdev }); setIsProjectModalOpen(true); }} className="text-slate-400 hover:text-slate-700"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg></button>
                <button
                  onClick={() => setDeletingDomainPending(p.domain)}
                  disabled={deletingDomain === p.domain}
                  className="text-slate-400 hover:text-rose-500 disabled:opacity-50"
                >
                  {deletingDomain === p.domain ? (
                    <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col space-y-2 mt-4">
          {server.status === 'off' ? (
            <button
              onClick={() => setIsSpinUpOpen(true)}
              disabled={isSpinningUp}
              className="w-full py-2.5 justify-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-lg inline-flex items-center whitespace-nowrap"
            >
              {isSpinningUp ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              <span>{isSpinningUp ? 'Spinning Up...' : 'Spin Up'}</span>
            </button>
          ) : (
            <IdeLaunchButton server={server} fullWidth />
          )}
        </div>
      </div>

      {isLogsModalOpen && (
        <LogsModal
          isOpen={isLogsModalOpen}
          onClose={() => setIsLogsModalOpen(false)}
          debugData={debugData}
          serverLogs={serverLogs}
          isFetching={isFetchingLogs}
          tunnelId={tunnelId}
          tunnelToken={tunnelToken}
        />
      )}
      {isApiAuthOpen && onUpdateAllowedPeers && (
        <ApiAuthModal
          isOpen={isApiAuthOpen}
          onClose={() => setIsApiAuthOpen(false)}
          server={server}
          allServers={servers}
          onSave={onUpdateAllowedPeers}
        />
      )}
      {isSpinUpOpen && (
        <ConfirmSpinUpModal
          isOpen={isSpinUpOpen}
          onClose={() => setIsSpinUpOpen(false)}
          onConfirm={async (selectedType, selectedSnap) => {
            await handleSpinUp(selectedType, selectedSnap);
          }}
          serverId={server.id}
          serverName={server.hostname || server.ip}
          defaultServerType={server.serverType || 'cpx21'}
          vpsSnapshots={vpsSnapshots}
          selectedSnapshotId={selectedSnapshotId}
          onSnapshotChange={handleSnapshotChange}
        />
      )}
      <InviteCollabModal
        serverId={server.id}
        orgId={server.orgId || 'personal'}
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        onSuccess={onRefresh}
      />
      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
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

function LogsModal({ isOpen, onClose, debugData, serverLogs, isFetching, tunnelId, tunnelToken }: {
  isOpen: boolean,
  onClose: () => void,
  debugData: { docker: string, setup: string, timestamp: string } | null,
  serverLogs: string[],
  isFetching: boolean,
  tunnelId?: string,
  tunnelToken?: string
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-left">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white uppercase tracking-wider">System Logs</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-slate-950 font-mono text-xs space-y-6 animate-in fade-in duration-200">
          
          {/* Cloudflare Tunnel Details */}
          {(tunnelId || tunnelToken) && (
            <div className="space-y-2 border-b border-slate-800/60 pb-6 text-left">
              <div className="flex items-center space-x-2 text-indigo-400">
                <span className="font-bold uppercase tracking-widest text-[10px]">Cloudflare Tunnel Configuration</span>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 space-y-3">
                {tunnelId && (
                  <div className="flex justify-between items-center text-slate-300">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500 font-medium">Tunnel ID:</span>
                      <span className="font-mono text-indigo-300 select-all font-bold">{tunnelId}</span>
                    </div>
                    <CopyButton value={tunnelId} />
                  </div>
                )}
                {tunnelToken && (
                  <div className="flex justify-between items-start text-slate-300">
                    <div className="mr-4 overflow-hidden text-left">
                      <span className="text-slate-500 font-medium mr-2">Tunnel Token:</span>
                      <span className="font-mono text-indigo-300 select-all break-all">{tunnelToken}</span>
                    </div>
                    <div className="flex-shrink-0 pt-0.5">
                      <CopyButton value={tunnelToken} />
                    </div>
                  </div>
                )}
                {tunnelToken && (
                  <div className="mt-2 pt-3 border-t border-slate-800/80 text-left">
                    <span className="text-slate-500 block mb-1.5 font-medium">VPS Setup & Connection Command:</span>
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex justify-between items-center">
                      <code className="text-emerald-400 select-all break-all pr-4 text-[10px] whitespace-pre-wrap leading-relaxed">
                        {`if ! command -v cloudflared &> /dev/null; then
  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i cloudflared.deb
  rm cloudflared.deb
fi
sudo cloudflared service uninstall || true
sudo cloudflared service install ${tunnelToken}
sudo systemctl restart cloudflared`}
                      </code>
                      <div className="flex-shrink-0">
                        <CopyButton value={`if ! command -v cloudflared &> /dev/null; then\n  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb && rm cloudflared.deb\nfi\nsudo cloudflared service uninstall || true\nsudo cloudflared service install ${tunnelToken}\nsudo systemctl restart cloudflared`} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Orchestrator Event Logs */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-indigo-400 border-b border-indigo-500/20 pb-1">
              <span className="font-bold uppercase tracking-widest text-[10px]">Orchestrator Event Logs</span>
            </div>
            <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">
              {serverLogs && serverLogs.length > 0 
                ? serverLogs.join('\n') 
                : 'No orchestrator events recorded.'}
            </pre>
          </div>

          {isFetching ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4 border-t border-slate-800/40">
              <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-slate-500 animate-pulse text-[10px] uppercase font-bold tracking-wider">Streaming logs from VPS...</p>
            </div>
          ) : debugData ? (
            <div className="space-y-6 border-t border-slate-800/40 pt-6">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sky-400 border-b border-sky-500/20 pb-1">
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
            </div>
          ) : (
            <div className="text-slate-600 text-center py-10 border-t border-slate-800/40 text-[10px] uppercase font-bold tracking-wider">
              No VPS logs found. Ensure the bootstrap script has started on the VPS.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IdeLaunchButton({ server, fullWidth = false }: { server: ServerConfig, fullWidth?: boolean }) {
  const [defaultIde, setDefaultIde] = useState<string>('vscode');
  const [selectedPath, setSelectedPath] = useState<string>(
    (server.userName === 'root' || !server.userName) ? '/root' : `/home/${server.userName}/workspace`
  );
  const [liveProjects, setLiveProjects] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const fetchLiveProjects = async () => {
    setIsFetching(true);
    try {
      const result = await getLiveProjects(server.id);
      if (result.success && result.projects) {
        setLiveProjects(result.projects);
      } else {
        console.warn("Server discovery failed:", result.error);
      }
    } catch (e) {
      console.warn("Failed to fetch live projects from exporter", e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    const savedIde = localStorage.getItem(`devboxui_default_ide_${server.id}`);
    if (savedIde) setDefaultIde(savedIde);

    const savedPath = localStorage.getItem(`devboxui_default_path_${server.id}`);
    if (savedPath) setSelectedPath(savedPath);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, server.status]);

  // Refresh live projects whenever the dropdown is opened
  useEffect(() => {
    if (isOpen && server.status === 'ready') {
      fetchLiveProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, server.status]);

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
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
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
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
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
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 0v24h24V0H0zm18.324 16.272c-.12.44-.36.88-.6 1.16-.48.48-1.2.76-1.88.76-.84 0-1.52-.36-1.92-.96-.28-.4-.4-.84-.4-1.32s.12-.92.4-1.32c.4-.6.96-.92 1.8-.92h.48v-1.96h-2.12v-1.16h3.24v5.72zm-7.68 0c-.12.44-.36.88-.6 1.16-.48.48-1.2.76-1.88.76-.84 0-1.52-.36-1.92-.96-.28-.4-.4-.84-.4-1.32s.12-.92.4-1.32c.4-.6.96-.92 1.8-.92h.48v-1.96H5.404v-1.16h3.24v5.72z" />
        </svg>
      )
    }
  ];

  const getIdeUrl = (ideId: string, path: string) => {
    const user = server.userName || 'root';
    const host = server.ip;
    if (ideId === 'phpstorm') {
      return `jetbrains://gateway/ssh/environment?h=${host}&u=${user}&p=22&ideHint=PS&projectHint=${path}`;
    }
    const scheme = ideId === 'antigravity' ? 'antigravity' : (ideId === 'cursor' ? 'cursor' : 'vscode');
    return `${scheme}://vscode-remote/ssh-remote+${user}@${host}${path}?windowId=_blank`;
  };

  const currentIde = ides.find(i => i.id === defaultIde) || ides.find(i => i.id === 'vscode')!;
  const currentUrl = getIdeUrl(currentIde.id, selectedPath);

  const mainWorkspacePath = (server.userName === 'root' || !server.userName) ? '/root' : `/home/${server.userName}/workspace`;
  
  const staticProjects = server.projects?.map(p => ({ name: p.name, path: `${mainWorkspacePath}/${p.name}`, isStatic: true })) || [];
  
  // Show live results if we've successfully fetched them at least once
  const isLiveActive = liveProjects.length > 0;
  const mergedProjects = isLiveActive
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
        className={`${fullWidth ? 'flex-1 py-2 justify-center' : 'px-4 py-2'} ${currentIde.colorClass} text-white text-xs font-bold rounded-l-lg transition-all shadow-lg inline-flex items-center whitespace-nowrap`}
      >
        {React.cloneElement(currentIde.icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4 mr-2' })}
        <div className="flex flex-col items-start leading-tight">
          <span>Open in {currentIde.name}</span>
          <span className="text-[8px] opacity-80 font-mono tracking-tight mt-0.5 truncate max-w-[120px]">
            {mainWorkspacePath === '/root'
              ? (selectedPath === '/root' ? '~' : `~/${selectedPath.split('/').pop()}`)
              : (selectedPath === mainWorkspacePath ? '~/workspace' : `~/workspace/${selectedPath.split('/').pop()}`)}
          </span>
        </div>
      </a>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${fullWidth ? 'px-3' : 'px-2'} ${currentIde.colorClass} text-white rounded-r-lg border-l border-white/20 transition-all shadow-lg flex items-center justify-center hover:bg-white/10`}
        title="Choose IDE or Folder"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className={`absolute top-full ${fullWidth ? 'left-0 right-0' : 'right-0'} mt-1.5 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 overflow-hidden flex flex-col max-h-[85vh]`}>
          <div className="p-2 space-y-4 overflow-y-auto">
            {/* IDE Selection */}
            <div>
              <div className="px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex justify-between items-center">
                <span>IDE</span>
                <span className="h-px flex-1 bg-slate-800 ml-3" />
              </div>
              <div className="mt-1 space-y-1">
                {ides.map(ide => (
                  <a
                    key={ide.id}
                    href={getIdeUrl(ide.id, selectedPath)}
                    onClick={() => {
                      handleSelectIde(ide.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center group ${
                      ide.id === currentIde.id 
                        ? 'bg-slate-800 text-white ring-1 ring-slate-700' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-md mr-3 ${ide.colorClass} shadow-lg group-hover:scale-110 transition-transform`}>
                      {ide.icon && React.cloneElement(ide.icon as React.ReactElement<{ className?: string }>, { className: 'w-3.5 h-3.5 mr-0' })}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold">{ide.name}</div>
                      {ide.id === currentIde.id && <div className="text-[9px] text-emerald-400 font-black uppercase tracking-widest mt-0.5">Default</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Project Selection */}
            <div>
              <div className="px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex justify-between items-center">
                <span>Projects</span>
                <span className="h-px flex-1 bg-slate-800 ml-3" />
                {server.status === 'ready' && (isLiveActive || isFetching) && (
                  <div className="flex items-center ml-3 space-x-1">
                    {isFetching ? (
                      <div className="h-1.5 w-1.5 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                    )}
                    <span className="text-emerald-500 font-bold text-[8px] tracking-tighter">
                      {isFetching ? 'REFRESHING' : 'LIVE'}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-1 space-y-1">
                <a
                  href={getIdeUrl(currentIde.id, mainWorkspacePath)}
                  onClick={() => {
                    handleSelectPath(mainWorkspacePath);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center ${
                    selectedPath === mainWorkspacePath 
                      ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <div className="p-1.5 bg-slate-800 rounded-md mr-3 text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold leading-tight">Main Workspace</div>
                    <div className="text-[10px] opacity-60 font-mono mt-0.5">{mainWorkspacePath}</div>
                  </div>
                </a>

                {mergedProjects.map(project => (
                  <a
                    key={project.name}
                    href={getIdeUrl(currentIde.id, project.path)}
                    onClick={() => {
                      handleSelectPath(project.path);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center ${
                      selectedPath === project.path 
                        ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="p-1.5 bg-slate-800 rounded-md mr-3 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold leading-tight">{project.name}</div>
                      <div className="text-[10px] opacity-60 font-mono mt-0.5">{project.path}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
          
          <div className="px-4 py-3 bg-slate-950/50 border-t border-slate-800 flex justify-between items-center">
            <span className="text-[9px] text-slate-500 font-medium italic">PhpStorm requires JetBrains Toolbox.</span>
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter">DevBox UI</span>
          </div>
        </div>
      )}
    </div>
  );
}
