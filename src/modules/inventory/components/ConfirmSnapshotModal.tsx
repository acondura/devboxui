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

  const todayStr = new Date().toISOString().slice(0, 10);
  const displaySuffix = `devbox-auto-${serverName.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8).toLowerCase()}-${todayStr}`;
  const finalPreview = customPrefix.trim() ? `${customPrefix.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')}-${displaySuffix}` : displaySuffix;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Snapshot & Shutdown</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Cost Optimization</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start space-x-3">
            <svg className="w-6 h-6 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-bold text-indigo-200 uppercase tracking-tight">How it works</p>
              <p className="text-xs text-indigo-200/70 leading-relaxed">
                The VPS will be powered off and a snapshot image will be created. The VPS will then be deleted to stop hourly billing. The server configuration remains in the dashboard to spin it back up later.
              </p>
            </div>
          </div>

          {/* Snapshot custom name prefix input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Snapshot Prefix (Optional)
            </label>
            <input
              type="text"
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. pre-refactor, before-db-upgrade"
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 transition-all font-mono"
            />
            <p className="text-[10px] text-slate-500 leading-normal">
              Final Snapshot Name: <br />
              <span className="text-indigo-400 font-mono font-bold break-all">{finalPreview}</span>
            </p>
          </div>

          <div className="space-y-2 bg-slate-950/30 border border-slate-800/50 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Server:</p>
            <span className="text-sm font-mono font-bold text-white break-all">{serverName}</span>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold rounded-xl transition-all"
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
