'use client';

import { useState, useEffect } from 'react';
import { getUserSettings, saveUserSettings } from '@/modules/inventory/actions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [hetznerToken, setHetznerToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      getUserSettings().then(settings => {
        if (settings) {
          setHetznerToken(settings.hetznerToken || '');
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      await saveUserSettings({ hetznerToken });
      setStatus({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white flex items-center space-x-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>User Settings</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          {/* Hetzner Token */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Hetzner API Token</label>
            <input
              type="password"
              placeholder="hcl_..."
              value={hetznerToken}
              onChange={(e) => setHetznerToken(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              required
            />
            <p className="mt-2 text-xs text-slate-500">
              Get this from your <a href="https://console.hetzner.cloud" target="_blank" className="text-indigo-400 hover:underline">Hetzner Cloud Console</a> under Security - API Tokens.
            </p>
          </div>

          <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] font-bold uppercase tracking-wider">Automated SSH Keys</p>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              We now automatically manage your SSH keypairs in the background. You no longer need to manually provide or sync public keys.
            </p>
          </div>

          {status && (
            <div className={`p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {status.message}
            </div>
          )}
          
          <div className="pt-2 flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg transition-all">Close</button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-2.5 px-8 rounded-lg transition-all flex items-center justify-center"
            >
              {isSaving ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save Settings</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
