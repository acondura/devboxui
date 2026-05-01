'use client';

import { useState } from 'react';

interface ReinstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serverName: string;
  provider?: string;
  bootstrapCommand?: string;
  isAutomated?: boolean;
}

export function ReinstallModal({ isOpen, onClose, onConfirm, serverName, provider, bootstrapCommand, isAutomated }: ReinstallModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    await onConfirm();
    setIsConfirming(false);
    onClose();
  };

  const handleCopy = () => {
    if (bootstrapCommand) {
      navigator.clipboard.writeText(bootstrapCommand);
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
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
                <>Since this is an <strong>automated</strong> server ({provider}), we will trigger an OS rebuild via API and re-run your bootstrap script.</>
              ) : (
                <>This is a <strong>manual</strong> server. We will reset its status and provide you with a new bootstrap command to run via SSH.</>
              )}
            </p>

            {!isAutomated && bootstrapCommand && (
              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Manual Bootstrap Command</label>
                <div className="relative group">
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-[11px] text-slate-300 break-all leading-relaxed pr-10">
                    {bootstrapCommand}
                  </div>
                  <button 
                    onClick={handleCopy}
                    className="absolute top-3 right-3 p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    title="Copy command"
                  >
                    {copyStatus ? (
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    )}
                  </button>
                  {copyStatus && (
                    <span className="absolute -top-8 right-0 bg-emerald-600 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-bounce">{copyStatus}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 italic">Run this command on your VPS as root to begin the bootstrap process.</p>
              </div>
            )}
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
