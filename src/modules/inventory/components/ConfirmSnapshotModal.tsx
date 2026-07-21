'use client';

import { useState } from 'react';

interface ConfirmSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (customPrefix?: string) => Promise<void> | void;
  serverName: string;
}

export function ConfirmSnapshotModal({ isOpen, onClose, onConfirm, serverName }: ConfirmSnapshotModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [customPrefix, setCustomPrefix] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(customPrefix.trim() || undefined);
    } finally {
      setIsConfirming(false);
      onClose();
    }
  };

  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const cleanServerName = serverName
    .replace('.devboxui.com', '')
    .replace('-code', '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();

  const basePreview = `${cleanServerName}--${YYYY}-${MM}-${DD}-${hh}-${mm}-${ss}`;
  const finalPreview = customPrefix.trim() ? `${customPrefix.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')}--${basePreview}` : basePreview;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-zinc-700 flex justify-between items-center bg-slate-50 dark:bg-zinc-800/50">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Snapshot & Shutdown</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-widest font-bold mt-1">Cost Optimization</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-100 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl flex items-start space-x-3">
            <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-tight">How it works</p>
              <p className="text-sm text-indigo-750 dark:text-indigo-200/70 leading-relaxed">
                The VPS will be powered off and a snapshot image will be created. The VPS will then be deleted to stop hourly billing. The server configuration remains in the dashboard to spin it back up later.
              </p>
            </div>
          </div>

          {/* Snapshot custom name prefix input */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest">
              Snapshot Prefix (Optional)
            </label>
            <input
              type="text"
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. pre-refactor, before-db-upgrade"
              className="w-full bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 transition-all font-mono"
            />
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-normal">
              Final Snapshot Name: <br />
              <span className="text-sm text-indigo-600 dark:text-indigo-400 font-mono font-bold break-all mt-1 block">{finalPreview}</span>
            </p>
          </div>

          <div className="space-y-2 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
            <p className="text-sm font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Target Server:</p>
            <span className="text-base font-mono font-bold text-slate-900 dark:text-zinc-100 break-all">{serverName.replace('.devboxui.com', '')}</span>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="flex-1 px-4 py-3 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 disabled:opacity-50 text-slate-700 dark:text-zinc-200 font-bold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex-[2] font-bold py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2"
            >
              {isConfirming ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Snapshotting...</span>
                </>
              ) : (
                <span>Confirm & Shutdown</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
