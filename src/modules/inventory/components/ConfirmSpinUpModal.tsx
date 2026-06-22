'use client';

import React, { useState, useEffect } from 'react';
import type { HetznerImage } from '@/lib/hetzner-api';
import { getHetznerOptions } from '../actions';

interface ConfirmSpinUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (serverType: string, snapshotId: string) => Promise<void> | void;
  serverId: string;
  serverName: string;
  defaultServerType?: string;
  vpsSnapshots: HetznerImage[];
  selectedSnapshotId: string;
  onSnapshotChange: (id: string) => void;
}

interface HetznerServerType {
  id: number;
  name: string;
  cores: number;
  memory: number;
  disk: number;
  architecture: string;
}

export function ConfirmSpinUpModal({
  isOpen,
  onClose,
  onConfirm,
  serverId,
  serverName,
  defaultServerType = 'cpx21',
  vpsSnapshots,
  selectedSnapshotId,
  onSnapshotChange,
}: ConfirmSpinUpModalProps) {
  const [isSpinningUp, setIsSpinningUp] = useState(false);
  const [serverType, setServerType] = useState(defaultServerType);
  const [serverTypes, setServerTypes] = useState<HetznerServerType[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setServerType(defaultServerType);
      setIsLoadingTypes(true);
      getHetznerOptions()
        .then((data) => {
          if (data && data.serverTypes) {
            setServerTypes(data.serverTypes as HetznerServerType[]);
          }
        })
        .catch((err) => console.warn('Failed to load server types:', err))
        .finally(() => setIsLoadingTypes(false));
    }
  }, [isOpen, defaultServerType]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSpinningUp(true);
    try {
      await onConfirm(serverType, selectedSnapshotId);
    } finally {
      setIsSpinningUp(false);
      onClose();
    }
  };

  // Hardcoded fallback list if API fails or is loading
  const fallbackTypes = [
    { name: 'cpx11', cores: 2, memory: 2, disk: 40, architecture: 'x86' },
    { name: 'cx22', cores: 2, memory: 4, disk: 40, architecture: 'x86' },
    { name: 'cpx21', cores: 3, memory: 4, disk: 80, architecture: 'x86' },
    { name: 'cpx31', cores: 4, memory: 8, disk: 160, architecture: 'x86' },
    { name: 'cpx41', cores: 8, memory: 16, disk: 240, architecture: 'x86' },
    { name: 'cpx51', cores: 16, memory: 32, disk: 360, architecture: 'x86' },
  ];

  const typesList = serverTypes.length > 0 ? serverTypes : fallbackTypes;

  const formatSpecs = (name: string, cores: number, memory: number, disk: number, arch: string) => {
    return `${name.toUpperCase()} (${cores} vCPU / ${memory}GB RAM / ${disk}GB Disk / ${arch})`;
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Spin Up Server</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Configure Environment</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Target Server Details */}
          <div className="space-y-1 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Server</p>
            <span className="text-base font-bold text-slate-900">{serverName}</span>
          </div>

          {/* VPS Type Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest block">
              VPS Size (Server Type)
            </label>
            <div className="relative">
              <select
                value={serverType}
                onChange={(e) => setServerType(e.target.value)}
                disabled={isSpinningUp}
                className="w-full bg-white border border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 appearance-none cursor-pointer pr-10 font-medium"
              >
                {typesList.map((t) => (
                  <option key={t.name} value={t.name}>
                    {formatSpecs(t.name, t.cores, t.memory, t.disk, t.architecture)}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {isLoadingTypes && (
              <p className="text-[10px] text-slate-400 animate-pulse">Loading live options from Hetzner...</p>
            )}
          </div>

          {/* Snapshot Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest block">
              Snapshot to Restore
            </label>
            <div className="relative">
              <select
                value={selectedSnapshotId}
                onChange={(e) => onSnapshotChange(e.target.value)}
                disabled={isSpinningUp}
                className="w-full bg-white border border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 appearance-none cursor-pointer pr-10 font-medium"
              >
                <option value="latest">Latest Snapshot (Auto)</option>
                {vpsSnapshots.some((s) => s.labels && s.labels['devbox-server-id'] === serverId) && (
                  <optgroup label="This DevBox's Snapshots">
                    {vpsSnapshots
                      .filter((s) => s.labels && s.labels['devbox-server-id'] === serverId)
                      .map((s) => (
                        <option key={s.id} value={s.id.toString()}>
                          {s.description || `Snapshot #${s.id}`}
                        </option>
                      ))}
                  </optgroup>
                )}
                {vpsSnapshots.some((s) => !s.labels || s.labels['devbox-server-id'] !== serverId) && (
                  <optgroup label="Other Compatible Snapshots">
                    {vpsSnapshots
                      .filter((s) => !s.labels || s.labels['devbox-server-id'] !== serverId)
                      .map((s) => (
                        <option key={s.id} value={s.id.toString()}>
                          {s.description || `Snapshot #${s.id}`}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              disabled={isSpinningUp}
              className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSpinningUp}
              className="flex-[2] font-bold py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center space-x-2"
            >
              {isSpinningUp ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Spinning Up...</span>
                </>
              ) : (
                <span>Confirm & Spin Up</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
