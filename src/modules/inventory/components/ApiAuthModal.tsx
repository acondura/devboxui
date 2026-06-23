'use client';

import { useState, useEffect } from 'react';
import { ServerConfig } from '../types';

interface ApiAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: ServerConfig;
  allServers: ServerConfig[];
  onSave: (serverId: string, allowedPeers: string[]) => Promise<void>;
}

export function ApiAuthModal({ isOpen, onClose, server, allServers, onSave }: ApiAuthModalProps) {
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPeers(server.allowedPeers || []);
    }
  }, [isOpen, server.allowedPeers]);

  if (!isOpen) return null;

  // Filter out the current server from the list of possible peers
  const peerCandidates = allServers.filter(s => s.id !== server.id);

  const handleTogglePeer = (peerId: string) => {
    setSelectedPeers(prev =>
      prev.includes(peerId) ? prev.filter(id => id !== peerId) : [...prev, peerId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(server.id, selectedPeers);
      onClose();
    } catch (err) {
      console.error("Failed to save API authorization settings:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>API Authorization</span>
            </h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">
              {(server.hostname || 'DevBox').replace('.devboxui.com', '').replace('-direct', '')} Access Controls
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* How it works Banner */}
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider">How it works</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Select which DevBoxes are authorized to send API requests to this server.
              Authorized DevBoxes bypass the Cloudflare Access login screen automatically using their public IP address.
              Any dynamic IP updates will keep authorization rules aligned automatically.
            </p>
          </div>

          {/* Peer Checklist */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Select Allowed Peer DevBoxes
            </h4>
            
            {peerCandidates.length === 0 ? (
              <div className="text-center py-6 px-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs">
                No other DevBoxes available to configure.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {peerCandidates.map(peer => {
                  const isChecked = selectedPeers.includes(peer.id);
                  const isPendingIp = !peer.ip || peer.ip === 'pending';
                  const isOffline = peer.status === 'off';

                  return (
                    <label
                      key={peer.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-indigo-50 border-indigo-200 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350'
                      }`}
                    >
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTogglePeer(peer.id)}
                          className="w-4 h-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500/30 focus:ring-offset-0 focus:ring-2 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-bold truncate">
                            {(peer.hostname || 'devbox').replace('.devboxui.com', '').replace('-direct', '')}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                            <span>{isPendingIp ? 'IP Pending' : peer.ip}</span>
                            {isOffline && (
                              <span className="text-rose-600 font-bold uppercase text-[9px] tracking-tight">
                                (Offline)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase font-bold text-slate-500 tracking-wider">
                        {peer.providerName || 'Custom'}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-bold uppercase bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Authorization</span>
            )}
          </button>
        </div>
        
      </div>
    </div>
  );
}
