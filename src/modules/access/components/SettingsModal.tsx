'use client';

import { useState, useEffect } from 'react';
import { getUserSettings, saveUserSettings } from '@/modules/inventory/actions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export function SettingsModal({ isOpen, onClose, userEmail }: SettingsModalProps) {
  const [hetznerToken, setHetznerToken] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [originalSshKey, setOriginalSshKey] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      getUserSettings().then(settings => {
        if (settings) {
          setHetznerToken(settings.hetznerToken || '');
          setSshPublicKey(settings.sshPublicKey || '');
          setOriginalSshKey(settings.sshPublicKey || '');
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
      
      if (sshPublicKey !== originalSshKey && sshPublicKey.startsWith('ssh-')) {
        setShowSyncPrompt(true);
      } else {
        setStatus({ type: 'success', message: 'Settings saved successfully!' });
        setTimeout(() => setStatus(null), 3000);
      }
    } catch {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncKeys = async () => {
    setIsSyncing(true);
    setShowSyncPrompt(false);
    try {
      const { syncSshKeys } = await import('@/modules/inventory/actions');
      await syncSshKeys(sshPublicKey);
      setStatus({ type: 'success', message: 'SSH Key synced to all servers!' });
      setOriginalSshKey(sshPublicKey);
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to sync SSH keys to some servers.' });
    } finally {
      setIsSyncing(false);
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
            />
            <p className="mt-2 text-xs text-slate-500">
              Get this from your <a href="https://console.hetzner.cloud" target="_blank" className="text-indigo-400 hover:underline">Hetzner Cloud Console</a> under Security - API Tokens.
            </p>
          </div>

          {/* SSH Key Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-medium text-slate-400">My SSH Public Key (Mandatory)</label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const keyPair = await window.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
                    const exportedPublic = await window.crypto.subtle.exportKey("raw", keyPair.publicKey);
                    const exportedPrivate = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
                    const pubBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPublic)));
                    const privBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPrivate)));
                    const sshPubKey = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${pubBase64} devboxui-generated`;
                    setSshPublicKey(sshPubKey);
                    const blob = new Blob([`-----BEGIN PRIVATE KEY-----\n${privBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'devbox_id_ed25519';
                    a.click();
                    alert("Key generated! Private key downloaded. Move it to your ~/.ssh folder.");
                  } catch {
                    alert("Browser doesn't support Ed25519 generation yet.");
                  }
                }}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 transition-all"
              >
                ✨ Magic Generate
              </button>
            </div>
            
            <textarea
              placeholder="ssh-ed25519 AAAAC3Nza..."
              value={sshPublicKey}
              onChange={(e) => setSshPublicKey(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-xs resize-none"
              required
            />

            {/* Info Box */}
            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-indigo-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] font-bold uppercase tracking-wider">Why Ed25519?</p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The modern standard: Ed25519 is faster, more secure, and more resilient than RSA or ECDSA.
              </p>
              <div className="pt-2 border-t border-indigo-500/10 flex items-center space-x-4">
                <a href="https://goteleport.com/blog/comparing-ssh-keys/" target="_blank" className="text-[10px] text-indigo-400 hover:underline">Comparison Guide</a>
                <a href="https://en.wikipedia.org/wiki/EdDSA#Ed25519" target="_blank" className="text-[10px] text-indigo-400 hover:underline">Specs</a>
              </div>
            </div>

            {/* Manual Instructions */}
            <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Setup:</p>
              <code className="block bg-slate-900 p-2 rounded text-[10px] text-slate-300 font-mono">
                ssh-keygen -t ed25519 -C &quot;{userEmail}&quot;
              </code>
            </div>
          </div>

          {/* Sync Prompt */}
          {showSyncPrompt && (
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-3 animate-in slide-in-from-bottom-2 duration-300">
              <p className="text-sm font-bold text-white">Sync your new key?</p>
              <p className="text-xs text-slate-400">Push this new key to all your existing DevBoxes using root credentials?</p>
              <div className="flex space-x-2">
                <button type="button" onClick={handleSyncKeys} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded transition-colors">Yes, Sync Now</button>
                <button type="button" onClick={() => { setShowSyncPrompt(false); setStatus({ type: 'success', message: 'Saved locally.' }); }} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded transition-colors">Maybe Later</button>
              </div>
            </div>
          )}

          {status && (
            <div className={`p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {status.message}
            </div>
          )}
          
          <div className="pt-2 flex space-x-3">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg transition-all">Close</button>
            <button
              type="submit"
              disabled={isSaving || isSyncing}
              className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-2.5 px-8 rounded-lg transition-all flex items-center justify-center"
            >
              {isSaving || isSyncing ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save Settings</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
