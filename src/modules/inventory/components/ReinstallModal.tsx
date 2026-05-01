'use client';

import { useState } from 'react';

interface ReinstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serverName: string;
  provider?: string;
}

export function ReinstallModal({ isOpen, onClose, onConfirm, serverName, provider }: ReinstallModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    await onConfirm();
    setIsConfirming(false);
    onClose();
  };

  const isAutomated = provider === 'Hetzner' || provider === 'Contabo';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Reinstall Server</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Danger Zone</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3">
            <svg className="w-6 h-6 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-200 uppercase tracking-tight">Destructive Action</p>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                This will wipe the operating system on <strong>{serverName}</strong>. All data, containers, and configurations on the VPS will be permanently lost.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              {isAutomated ? (
                <>Since this is a <strong>{provider}</strong> server, we will trigger an automated OS rebuild via API and re-run your bootstrap script.</>
              ) : (
                <>This is a <strong>manual</strong> server. We will reset its status and provide you with a new bootstrap command to run via SSH.</>
              )}
            </p>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex-[2] bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center space-x-2"
            >
              {isConfirming ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Wiping...</span>
                </>
              ) : (
                <span>Wipe & Reinstall</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
