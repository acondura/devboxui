'use client';

import { useState, useEffect } from 'react';
import { getUserSettings, saveUserSettings } from '@/modules/inventory/actions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [hetznerToken, setHetznerToken] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [cfAccountId, setCfAccountId] = useState('');
  const [cfZoneId, setCfZoneId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      getUserSettings().then(settings => {
        if (settings) {
          setHetznerToken(settings.hetznerToken || '');
          setCfToken(settings.cfToken || '');
          setCfAccountId(settings.cfAccountId || '');
          setCfZoneId(settings.cfZoneId || '');
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
      await saveUserSettings({ hetznerToken, cfToken, cfAccountId, cfZoneId });
      setStatus({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Cloud Settings</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-2">Hetzner Infrastructure</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">API Token</label>
                <input
                  type="password"
                  placeholder="hcl_..."
                  value={hetznerToken}
                  onChange={(e) => setHetznerToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white placeholder-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-2">Cloudflare Networking</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">API Token</label>
                <input
                  type="password"
                  placeholder="Cloudflare API Token"
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white placeholder-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Account ID</label>
                <input
                  type="text"
                  placeholder="Cloudflare Account ID"
                  value={cfAccountId}
                  onChange={(e) => setCfAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white placeholder-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Zone ID</label>
                <input
                  type="text"
                  placeholder="Cloudflare Zone ID"
                  value={cfZoneId}
                  onChange={(e) => setCfZoneId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white placeholder-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
          </div>

          {status && (
            <div className={`p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {status.message}
            </div>
          )}
          
          <div className="pt-2 flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg transition-all"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-2.5 px-8 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
            >
              {isSaving ? (
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
