'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AddServerModal } from '@/modules/inventory/components/AddServerModal';
import { SettingsModal } from '@/modules/access/components/SettingsModal';
import { SshKeyOnboardingModal } from '@/modules/access/components/SshKeyOnboardingModal';
import { FeedbackModal } from '@/modules/feedback/components/FeedbackModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ServerList, ServerCard } from '@/modules/inventory/components/ServerList';
import { provisionServer, getServers, addProject, deleteServer, reinstallServer, deleteDomain, updateDomain, updateServerAllowedPeers, getUserSettings } from '@/modules/inventory/actions';
import { ServerConfig } from '@/modules/inventory/types';

interface DashboardViewProps {
  userEmail: string;
  isAdmin: boolean;
}

type NavFilter = 'all' | 'active' | 'sleeping' | 'provisioning';

function statusDotClass(status: string) {
  if (status === 'ready') return 'bg-emerald-500';
  if (status === 'off') return 'bg-blue-400';
  if (['provisioning', 'initializing', 'Initializing', 'waiting-for-bootstrap', 'configuring', 'snapshotting'].includes(status)) return 'bg-amber-400 animate-pulse';
  if (status === 'error') return 'bg-red-500';
  return 'bg-zinc-500';
}

function getDisplayName(server: ServerConfig) {
  return server.name || (server.hostname || 'devbox')
    .replace('-code.devboxui.com', '')
    .replace('.devboxui.com', '');
}

export function DashboardView({ userEmail }: DashboardViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Three-panel state
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [navFilter, setNavFilter] = useState<NavFilter>('all');

  const LS_KEY = 'devboxui_last_server_id';

  const selectServer = (id: string | null) => {
    setSelectedServerId(id);
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
  };
  const [listSearch, setListSearch] = useState('');
  const [mobilePanel, setMobilePanel] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    async function checkSshKey() {
      try {
        const settings = await getUserSettings();
        if (settings && !settings.sshPublicKey) {
          setIsOnboardingOpen(true);
        }
      } catch (error) {
        console.error("Failed to check user settings:", error);
      }
    }
    checkSshKey();
  }, []);

  useEffect(() => {
    async function loadServers() {
      try {
        const data = await getServers();
        const list = data || [];
        setServers(list);
        if (list.length > 0) {
          const lastId = localStorage.getItem(LS_KEY);
          const found = lastId ? list.find(s => s.id === lastId) : null;
          const active = list.find(s => s.status === 'ready');
          setSelectedServerId((found ?? active ?? list[0]).id);
        }
      } catch (error) {
        console.error("Failed to load servers:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadServers();
  }, []);

  // Poll for updates if any Hetzner server is provisioning or snapshotting
  useEffect(() => {
    const isPending = servers.some(s =>
      s.hetznerServerId &&
      ['provisioning', 'waiting-for-bootstrap', 'initializing', 'Initializing', 'snapshotting'].includes(s.status as string)
    );
    if (!isPending) return;

    let timerId: NodeJS.Timeout;

    async function poll() {
      try {
        const data = await getServers();
        setServers(data || []);

        const stillPending = data && data.some(s =>
          s.hetznerServerId &&
          ['provisioning', 'waiting-for-bootstrap', 'initializing', 'Initializing', 'snapshotting'].includes(s.status as string)
        );
        if (stillPending) {
          timerId = setTimeout(poll, 15000);
        }
      } catch {
        timerId = setTimeout(poll, 20000);
      }
    }

    timerId = setTimeout(poll, 15000);
    return () => clearTimeout(timerId);
  }, [servers]);

  const handleAddServer = async (
    name: string,
    serverType: string,
    location: string,
    image: string,
    customUsername?: string,
    provider: 'hetzner' | 'digitalocean' = 'hetzner',
    provisioningOptions?: import('@/modules/inventory/actions').ProvisioningOptions
  ) => {
    try {
      const result = await provisionServer(name, serverType, location, image, provider, customUsername, undefined, provisioningOptions) as { success: boolean; server?: ServerConfig; error?: string };
      if (result.success && result.server) {
        setServers(prev => [...prev, result.server!]);
      }
      return result;
    } catch (error) {
      console.error(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const handleAddProject = async (serverId: string, projectName: string, port: number = 8443, startDdev?: boolean) => {
    try {
      const updatedServer = await addProject(serverId, projectName, port, startDdev);
      setServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
    } catch (error) {
      alert("Failed to add project. Check console for details.");
      console.error(error);
    }
  };

  const handleUpdateDomain = async (serverId: string, oldDomain: string, newSubdomain: string, port: number, startDdev?: boolean) => {
    try {
      const updatedServer = await updateDomain(serverId, oldDomain, newSubdomain, port, startDdev);
      setServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
    } catch (error) {
      alert("Failed to update domain.");
      console.error(error);
    }
  };

  const handleDeleteDomain = async (serverId: string, domain: string) => {
    try {
      const updatedServer = await deleteDomain(serverId, domain);
      setServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
    } catch (error) {
      alert("Failed to delete domain.");
      console.error(error);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    try {
      await deleteServer(serverId);
      setServers(prev => prev.filter(s => s.id !== serverId));
      if (selectedServerId === serverId) selectServer(null);
    } catch (error) {
      alert("Failed to delete server.");
      console.error(error);
    }
  };

  const handleToggleLock = async (serverId: string, enableLock: boolean) => {
    try {
      const { toggleServerLock } = await import('@/modules/inventory/actions');
      await toggleServerLock(serverId, enableLock);
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, isLocked: enableLock } : s));
    } catch (error) {
      alert("Failed to toggle lock.");
      console.error(error);
    }
  };

  const handleReinstall = async (serverId: string) => {
    try {
      await reinstallServer(serverId);
      const data = await getServers();
      setServers(data || []);
    } catch (error) {
      alert("Failed to trigger reinstall. Check console for details.");
      console.error(error);
    }
  };

  const handleUpdateAllowedPeers = async (serverId: string, allowedPeers: string[]) => {
    try {
      const updatedServer = await updateServerAllowedPeers(serverId, allowedPeers);
      setServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
    } catch (error) {
      alert("Failed to update API authorization. Check console for details.");
      console.error(error);
    }
  };

  const handleRefresh = async () => {
    try {
      const data = await getServers();
      setServers(data || []);
    } catch (error) {
      console.error("Failed to refresh servers list:", error);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  // Counts for sidebar badges
  const counts = useMemo(() => ({
    all: servers.length,
    active: servers.filter(s => s.status === 'ready').length,
    sleeping: servers.filter(s => s.status === 'off').length,
    provisioning: servers.filter(s => ['provisioning', 'initializing', 'Initializing', 'waiting-for-bootstrap', 'configuring', 'snapshotting'].includes(s.status)).length,
  }), [servers]);

  // Middle-panel filtered list
  const panelServers = useMemo(() => {
    let list = servers;
    if (navFilter === 'active') list = list.filter(s => s.status === 'ready');
    else if (navFilter === 'sleeping') list = list.filter(s => s.status === 'off');
    else if (navFilter === 'provisioning') list = list.filter(s => ['provisioning', 'initializing', 'Initializing', 'waiting-for-bootstrap', 'configuring', 'snapshotting'].includes(s.status));

    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      list = list.filter(s => {
        const name = getDisplayName(s).toLowerCase();
        const ip = (s.ip || '').toLowerCase();
        const domains = (s.projects || []).map(p => p.domain.toLowerCase()).join(' ');
        return name.includes(q) || ip.includes(q) || domains.includes(q);
      });
    }
    return list;
  }, [servers, navFilter, listSearch]);

  const selectedServer = servers.find(s => s.id === selectedServerId) ?? null;

  const sharedListProps = {
    userEmail,
    onAddProject: handleAddProject,
    onUpdateDomain: handleUpdateDomain,
    onDeleteDomain: handleDeleteDomain,
    onDeleteServer: handleDeleteServer,
    onToggleLock: handleToggleLock,
    onReinstall: handleReinstall,
    onUpdateAllowedPeers: handleUpdateAllowedPeers,
    onRefresh: handleRefresh,
  };

  const navLabel: Record<NavFilter, string> = {
    all: 'All Servers',
    active: 'Active',
    sleeping: 'Sleeping',
    provisioning: 'Provisioning',
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 font-sans">
      {/* Modals */}
      <AddServerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAdd={handleAddServer} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
      <SshKeyOnboardingModal isOpen={isOnboardingOpen} onClose={() => setIsOnboardingOpen(false)} />

      {/* ── MOBILE / TABLET layout (< lg) ──────────────────────────────── */}
      <div className="flex flex-col h-screen lg:hidden">
        {/* Top nav */}
        <nav className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 flex justify-between items-center flex-shrink-0 z-40">
          <Link href="/" className="font-bold text-lg tracking-tight text-slate-900 dark:text-zinc-100 flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-base font-black">D</span>
            </div>
            <span className="uppercase tracking-tighter">DevBox<span className="text-indigo-500">UI</span></span>
          </Link>
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 text-slate-500 dark:text-zinc-400 rounded-md border border-slate-200 dark:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors" title="Settings">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button onClick={handleLogout} className="text-xs font-bold text-slate-500 dark:text-zinc-400 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors">Logout</button>
          </div>
        </nav>

        {/* Mobile: list view or detail view */}
        {mobilePanel === 'detail' && selectedServer ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-700 flex-shrink-0">
              <button onClick={() => { setMobilePanel('list'); selectServer(null); }} className="flex items-center space-x-1 text-indigo-500 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span>Back</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ServerCard server={selectedServer} inlineLogsMode servers={servers} {...sharedListProps} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-bold uppercase tracking-tight text-slate-900 dark:text-zinc-100">Servers <span className="text-slate-400 dark:text-zinc-500 font-normal text-sm ml-1">({servers.length})</span></h2>
              <button onClick={() => setIsModalOpen(true)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95">+ Add Server</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
              ) : (
                <ServerList
                  servers={servers}
                  selectedServerId={selectedServerId ?? undefined}
                  onSelectServer={(id) => { selectServer(id); setMobilePanel('detail'); }}
                  {...sharedListProps}
                />
              )}
            </div>
          </div>
        )}

        {/* Mobile Feedback button */}
        <button onClick={() => setIsFeedbackOpen(true)} className="fixed bottom-6 right-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold transition-all active:scale-95">
          GIVE FEEDBACK
        </button>
      </div>

      {/* ── DESKTOP three-panel layout (lg+) ───────────────────────────── */}
      <div className="hidden lg:flex h-screen overflow-hidden">

        {/* LEFT SIDEBAR */}
        <aside className="w-44 xl:w-48 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 overflow-y-auto">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-slate-200 dark:border-zinc-700">
            <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white text-base font-black">D</span>
              </div>
              <span className="font-bold text-sm uppercase tracking-tighter text-slate-900 dark:text-zinc-100">DevBox<span className="text-indigo-500">UI</span></span>
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {(['all', 'active', 'sleeping', 'provisioning'] as NavFilter[]).map(f => (
              <button
                key={f}
                onClick={() => { setNavFilter(f); selectServer(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${navFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-100'}`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  {f === 'all' && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 6h14M5 18h14" /></svg>}
                  {f === 'active' && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${navFilter === f ? 'bg-white' : 'bg-emerald-500'}`} />}
                  {f === 'sleeping' && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${navFilter === f ? 'bg-white' : 'bg-blue-400'}`} />}
                  {f === 'provisioning' && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${navFilter === f ? 'bg-white' : 'bg-amber-400'}`} />}
                  <span className="capitalize truncate">{f === 'all' ? 'All Servers' : f}</span>
                </div>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${navFilter === f ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'}`}>
                  {counts[f]}
                </span>
              </button>
            ))}
          </nav>

          {/* Bottom: user info + actions */}
          <div className="px-2 pb-3 pt-2 border-t border-slate-200 dark:border-zinc-700 space-y-0.5">
            <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-100 transition-all text-left">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span>Settings</span>
            </button>
            <button onClick={handleLogout} className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-100 transition-all text-left">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span>Logout</span>
            </button>
            <div className="px-3 pt-2">
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate" title={userEmail}>{userEmail}</div>
            </div>
          </div>
        </aside>

        {/* MIDDLE PANEL — compact server list */}
        <div className="w-64 xl:w-72 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{navLabel[navFilter]}</span>
            <div className="flex items-center space-x-1">
              <ThemeToggle />
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center space-x-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-md transition-all active:scale-95"
                title="Add Server"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-700/50 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>
              <input
                type="text"
                value={listSearch}
                onChange={e => setListSearch(e.target.value)}
                placeholder="Search servers…"
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-md text-slate-700 dark:text-zinc-300 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all"
              />
              {listSearch && (
                <button onClick={() => setListSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* Server list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12"><div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
            ) : panelServers.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-slate-400 dark:text-zinc-500">
                {listSearch ? 'No servers match your search.' : 'No servers in this category.'}
              </div>
            ) : (
              panelServers.map(server => {
                const name = getDisplayName(server);
                const isSelected = server.id === selectedServerId;
                return (
                  <button
                    key={server.id}
                    onClick={() => selectServer(isSelected ? null : server.id)}
                    className={`w-full flex items-start space-x-3 px-4 py-3 border-b border-slate-100 dark:border-zinc-800 transition-all text-left ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'}`}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass(server.status)}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-zinc-100'}`}>{name}</div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium uppercase tracking-wider">{server.providerName || 'Custom'}</span>
                        {server.ip && server.ip !== 'pending' && server.ip !== 'manual-setup' && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">{server.ip}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL — server detail or empty state */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-800">
          {selectedServer ? (
            <div className="flex-1 overflow-y-auto p-6">
              <ServerCard
                server={selectedServer}
                inlineLogsMode
                servers={servers}
                {...sharedListProps}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="mb-6 opacity-30">
                <svg className="w-16 h-16 text-slate-400 dark:text-zinc-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-500 dark:text-zinc-400">Select a server</h3>
              <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1 max-w-xs">
                Pick a server from the list to view its details, manage domains, and open your workspace.
              </p>
              {servers.length === 0 && !isLoading && (
                <button onClick={() => setIsModalOpen(true)} className="mt-6 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
                  + Add your first server
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Desktop Feedback button */}
      <button
        onClick={() => setIsFeedbackOpen(true)}
        className="fixed bottom-6 right-6 z-50 hidden lg:flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-2xl shadow-2xl shadow-indigo-600/40 transition-all hover:scale-105 active:scale-95"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
        <span className="font-bold text-xs tracking-tight">GIVE FEEDBACK</span>
      </button>
    </div>
  );
}
