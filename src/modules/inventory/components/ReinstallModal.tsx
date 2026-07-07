'use client';

import { useEffect, useState } from 'react';
import { getLatestBootstrapCommand } from '../actions';

interface ReinstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serverName: string;
  serverId: string; // Added serverId
  provider?: string;
  isAutomated?: boolean;
}

export function ReinstallModal({ isOpen, onClose, onConfirm, serverName, serverId, provider, isAutomated }: ReinstallModalProps) {
  const cleanServerName = serverName.replace('.devboxui.com', '');
  const [isConfirming, setIsConfirming] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [bootstrapCommand, setBootstrapCommand] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !isAutomated) {
      async function fetchCommand() {
        setIsLoading(true);
        try {
          const result = await getLatestBootstrapCommand(serverId);
          if (result.success) setBootstrapCommand(result.command);
        } catch (err) {
          console.error("Failed to refresh command", err);
        } finally {
          setIsLoading(false);
        }
      }
      fetchCommand();
    }
  }, [isOpen, serverId, isAutomated]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              {isAutomated ? 'Reinstall Server' : 'Bootstrap Command'}
            </h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">
              {isAutomated ? 'Danger Zone' : 'Manual Setup'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {isAutomated ? (
            <div className="p-4 bg-amber-50 border border-amber-250 rounded-xl flex items-start space-x-3">
              <svg className="w-6 h-6 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="space-y-1">
                <p className="text-sm font-bold text-amber-900 uppercase tracking-tight">Destructive Action</p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This will wipe <strong>{cleanServerName}</strong> via API. All data will be permanently lost.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-650 leading-relaxed">
                Run this command on <strong>{cleanServerName}</strong> to reinstall the DevBox environment.
              </p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">What this script does:</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    'Updates system & tools',
                    'Configures users & SSH',
                    'Installs Docker Engine',
                    'Installs Oh-My-Bash',
                    'Installs DDEV & Git',
                    'Secures firewall & ports'
                  ].map((step, i) => (
                    <li key={i} className="flex items-center space-x-2 text-sm text-slate-650">
                      <svg className="w-3 h-3 text-emerald-550 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {!isAutomated && (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Command</label>
                {isLoading ? (
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center space-y-3">
                    <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest animate-pulse">Regenerating Script...</span>
                  </div>
                ) : bootstrapCommand ? (
                  <>
                    <div className="relative group">
                      <div className="w-full bg-slate-100 border border-slate-250 rounded-lg p-4 font-mono text-sm text-slate-800 break-all leading-relaxed pr-10 max-h-[120px] overflow-y-auto scrollbar-thin">
                        {bootstrapCommand}
                      </div>
                      <button 
                        onClick={handleCopy}
                        className="absolute top-3 right-3 p-1.5 bg-slate-200 hover:bg-slate-350 text-slate-650 hover:text-slate-900 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy command"
                      >
                        {copyStatus ? (
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                        )}
                      </button>
                      {copyStatus && (
                        <span className="absolute -top-8 right-0 bg-emerald-650 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-bounce">{copyStatus}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 italic mt-3 leading-relaxed">
                      This one-line command uses Base64 encoding to safely pass the full bootstrap script (including special characters) to your server in a single paste.
                    </p>
                  </>
                ) : (
                  <div className="w-full bg-rose-50 border border-rose-250 rounded-lg p-4 text-xs text-rose-700 text-center">
                    Failed to generate command. Please try again.
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
            >
              Close
            </button>
            {isAutomated && (
              <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className={`flex-[2] font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2 ${
                  isAutomated 
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 text-white' 
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 text-white'
                }`}
              >
                {isConfirming ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{isAutomated ? 'Wipe & Reinstall' : 'Reset Status & Reinstall'}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
