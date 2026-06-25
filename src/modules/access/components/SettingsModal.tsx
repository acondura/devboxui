'use client';

import { useState, useEffect } from 'react';
import { getUserSettings, saveUserSettings } from '@/modules/inventory/actions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [hetznerToken, setHetznerToken] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      getUserSettings().then(settings => {
        if (settings) {
          setHetznerToken(settings.hetznerToken || '');
          setSshPublicKey(settings.sshPublicKey || '');
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
      await saveUserSettings({ hetznerToken, sshPublicKey });
      setStatus({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>User Settings</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          {/* Hetzner Token */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Hetzner API Token</label>
            <input
              type="password"
              placeholder="hcl_..."
              value={hetznerToken}
              onChange={(e) => setHetznerToken(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
            <p className="mt-2 text-xs text-slate-500">
              Get this from your <a href="https://console.hetzner.cloud" target="_blank" className="text-indigo-600 hover:text-indigo-750 hover:underline">Hetzner Cloud Console</a> under Security - API Tokens.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Your Public SSH Key</label>
              <textarea
                placeholder="ssh-ed25519 AAAAC3Nza... user@computer"
                value={sshPublicKey}
                onChange={(e) => setSshPublicKey(e.target.value)}
                className="w-full h-24 bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-xs"
                required
              />
              <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                Paste your local public key here (e.g., from <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">~/.ssh/id_ed25519.pub</code>). This key will be automatically added to the server during provisioning so your local VS Code can connect securely.
              </p>
            </div>

            <details className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              <summary className="flex items-center justify-between p-3 text-xs font-bold text-slate-500 cursor-pointer hover:bg-slate-100 transition-all select-none">
                <span>Bypass SSH Connection Prompts (Recommended)</span>
                <svg className="w-4 h-4 transform group-open:rotate-180 transition-transform text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="p-4 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed space-y-2.5 bg-slate-50/50">
                <p>
                  To connect instantly without having to type <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">yes</code> when a server is created or restored, add the following configuration snippet to your computer&apos;s local <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">~/.ssh/config</code> file:
                </p>

                <pre className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-mono text-indigo-650 select-all overflow-x-auto whitespace-pre leading-normal">
{`Host *.devboxui.com
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null`}
                </pre>

              </div>
            </details>
          </div>


          {status && (
            <div className={`p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {status.message}
            </div>
          )}
          
          <div className="pt-2 flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg transition-all">Close</button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold py-2.5 px-8 rounded-lg transition-all flex items-center justify-center"
            >
              {isSaving ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save Settings</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
