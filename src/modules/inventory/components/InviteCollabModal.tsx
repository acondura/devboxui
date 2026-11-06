'use client';

import { useState } from 'react';
import { inviteCollaborator } from '../actions';

interface Project {
  name: string;
  domain: string;
}

interface InviteCollabModalProps {
  serverId: string;
  orgId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projects?: Project[];
}

export function InviteCollabModal({ serverId, orgId, isOpen, onClose, onSuccess, projects = [] }: InviteCollabModalProps) {
  const [email, setEmail] = useState('');
  const [accessType, setAccessType] = useState<'full' | 'web'>('web');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const toggleProject = (domain: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (accessType === 'web' && selectedProjects.size === 0) {
      setError('Select at least one project to share.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const allowedProjects = accessType === 'web' ? Array.from(selectedProjects) : undefined;
      await inviteCollaborator(serverId, orgId, email.trim(), allowedProjects);
      setSuccess(true);
      setEmail('');
      setSelectedProjects(new Set());
      setAccessType('full');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send invite.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-300 text-left">
        <div className="px-6 py-6 border-b border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-zinc-100 tracking-tight flex items-center space-x-2">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>Add Collaborator</span>
            </h3>
            <p className="text-slate-500 dark:text-zinc-400 text-xs mt-1">Share access to this DevBox with a colleague.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-100 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Colleague&apos;s Email</label>
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all text-sm"
              required
            />
          </div>

          {projects.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Access Level</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccessType('full')}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${accessType === 'full' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-300 hover:border-indigo-400'}`}
                >
                  Full Server
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('web')}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${accessType === 'web' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-300 hover:border-indigo-400'}`}
                >
                  Web Only
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
                {accessType === 'full'
                  ? 'They will be added as a Linux user with SSH access to the whole server.'
                  : 'Browser-only access to selected project URLs. No SSH or Linux account.'}
              </p>
            </div>
          )}

          {accessType === 'web' && projects.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Projects to Share</label>
              <div className="space-y-2">
                {projects.map(p => (
                  <label key={p.domain} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer transition-all">
                    <input
                      type="checkbox"
                      checked={selectedProjects.has(p.domain)}
                      onChange={() => toggleProject(p.domain)}
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{p.name}</div>
                      <div className="text-xs text-slate-400 dark:text-zinc-500 truncate">{p.domain}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {projects.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              They will be added to the server as a Linux user account. When they configure their public SSH key, it will automatically sync to authorize their login.
            </p>
          )}

          {error && (
            <div className="p-4 rounded-xl text-sm font-medium bg-red-500/10 text-red-500 border border-red-500/20">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              Invitation sent successfully! Syncing access...
            </div>
          )}

          <div className="flex space-x-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 text-slate-700 dark:text-zinc-200 font-bold py-3.5 rounded-xl transition-all">Cancel</button>
            <button
              type="submit"
              disabled={isSubmitting || success}
              className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-bold py-3.5 px-8 rounded-xl transition-all flex items-center justify-center shadow-lg shadow-indigo-600/10 active:scale-95"
            >
              {isSubmitting ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Send Invite</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
