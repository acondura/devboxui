'use client';

import { useState } from 'react';
import { saveUserSettings } from '@/modules/inventory/actions';

interface SshKeyOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SshKeyOnboardingModal({ isOpen, onClose }: SshKeyOnboardingModalProps) {
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sshPublicKey.trim().startsWith('ssh-')) {
      setStatus({ type: 'error', message: 'Please enter a valid public SSH key starting with ssh-.' });
      return;
    }
    setIsSaving(true);
    setStatus(null);
    try {
      await saveUserSettings({ sshPublicKey });
      setStatus({ type: 'success', message: 'SSH key saved successfully! You are ready to go.' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save SSH key. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-300 text-left">
        <div className="px-6 py-6 border-b border-slate-100 bg-slate-50/50">
          <div className="h-12 w-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m0 4a2 2 0 01-2 2m0 0a2 2 0 01-2-2m2 2v3a2 2 0 01-2 2H9a2 2 0 01-2-2v-3a2 2 0 01-2-2m2 2v-3a2 2 0 012-2h3" />
            </svg>
          </div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Add Your SSH Public Key</h3>
          <p className="text-slate-500 text-sm mt-1">To collaborate on DevBoxes, we need your SSH public key to authorize access to your user account.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Public SSH Key</label>
            <textarea
              placeholder="ssh-ed25519 AAAAC3Nza... user@computer"
              value={sshPublicKey}
              onChange={(e) => setSshPublicKey(e.target.value)}
              className="w-full h-28 bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all font-mono text-xs"
              required
            />
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Typically found in your local machine&apos;s terminal at <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">~/.ssh/id_ed25519.pub</code> or <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">~/.ssh/id_rsa.pub</code>.
            </p>
          </div>

          {status && (
            <div className={`p-4 rounded-xl text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {status.message}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center active:scale-95"
            >
              {isSaving ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save and Continue</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
