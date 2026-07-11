'use client';

import React, { useState, useEffect } from 'react';
import { getHetznerOptions } from '../actions';
import { Select2 } from './Select2';

interface ConfirmSpinUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (serverType: string, snapshotId: string) => Promise<void> | void;
  serverId: string;
  serverName: string;
  defaultServerType?: string;
  vpsSnapshots: Array<{ id: number | string; name?: string | null; description?: string; labels?: Record<string, string>; disk_size?: number; image_size?: number | null }>;
  selectedSnapshotId: string;
  onSnapshotChange: (id: string) => void;
}

interface HetznerServerType {
  id?: number;
  name: string;
  cores: number;
  memory: number;
  disk: number;
  architecture: string;
  prices?: Array<{ location: string; price_monthly: { gross: string }; price_hourly: { gross: string } }>;
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

  const getPrice = (t: HetznerServerType) => {
    if (!t.prices?.length) return null;
    const p = t.prices[0];
    return {
      monthly: parseFloat(p.price_monthly.gross).toFixed(2),
      hourly: parseFloat(p.price_hourly.gross).toFixed(4),
    };
  };

  const selectedTypeData = (serverTypes.length > 0 ? serverTypes : []).find(t => t.name === serverType);
  const selectedPrice = selectedTypeData ? getPrice(selectedTypeData) : null;

  const formatSpecs = (t: HetznerServerType) => {
    const price = getPrice(t);
    const base = `${t.name.toUpperCase()} (${t.cores} vCPU / ${t.memory}GB RAM / ${t.disk}GB Disk / ${t.architecture})`;
    return price ? `${base} — €${price.monthly}/mo` : base;
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in zoom-in duration-200 text-left">
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
            <span className="text-base font-bold text-slate-900">{serverName.replace('.devboxui.com', '')}</span>
          </div>

          {/* VPS Type Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest block">
              VPS Size (Server Type)
            </label>
            <Select2
              value={serverType}
              onValueChange={val => setServerType(val)}
              disabled={isSpinningUp}
              className="w-full bg-white border border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-medium"
            >
              {typesList.map((t) => (
                <option key={t.name} value={t.name}>
                  {formatSpecs(t)}
                </option>
              ))}
            </Select2>
            {isLoadingTypes && (
              <p className="text-[10px] text-slate-400 animate-pulse">Loading live options from Hetzner...</p>
            )}
            {selectedPrice && (
              <div className="flex items-center space-x-3 pt-1">
                <div className="flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-bold text-emerald-700">€{selectedPrice.monthly}<span className="font-normal text-emerald-600">/mo</span></span>
                </div>
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-bold text-slate-600">€{selectedPrice.hourly}<span className="font-normal text-slate-500">/hr</span></span>
                </div>
              </div>
            )}
          </div>

          {/* Snapshot Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest block">
              Snapshot to Restore
            </label>
            <Select2
              value={selectedSnapshotId}
              onValueChange={val => onSnapshotChange(val)}
              disabled={isSpinningUp}
              className="w-full bg-white border border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-medium"
            >
              <option value="latest">Latest Snapshot (Auto)</option>
              {vpsSnapshots.some((s) => {
                if (s.labels && s.labels['devbox-server-id'] === serverId) return true;
                const cleanName = serverName.replace('.devboxui.com', '').replace('-code', '').toLowerCase();
                if (s.name && s.name.toLowerCase().includes(cleanName)) return true;
                if (s.description && s.description.toLowerCase().includes(cleanName)) return true;
                return false;
              }) && (
                <optgroup label="This DevBox's Snapshots">
                  {vpsSnapshots
                    .filter((s) => {
                      if (s.labels && s.labels['devbox-server-id'] === serverId) return true;
                      const cleanName = serverName.replace('.devboxui.com', '').replace('-code', '').toLowerCase();
                      if (s.name && s.name.toLowerCase().includes(cleanName)) return true;
                      if (s.description && s.description.toLowerCase().includes(cleanName)) return true;
                      return false;
                    })
                    .map((s) => (
                      <option key={s.id} value={s.id.toString()}>
                        {s.description || s.name || `Snapshot #${s.id}`} {s.image_size ? `(${parseFloat(s.image_size.toString()).toFixed(2)} GB)` : ''}
                      </option>
                    ))}
                </optgroup>
              )}
              {vpsSnapshots.some((s) => {
                if (s.labels && s.labels['devbox-server-id'] === serverId) return false;
                const cleanName = serverName.replace('.devboxui.com', '').replace('-code', '').toLowerCase();
                if (s.name && s.name.toLowerCase().includes(cleanName)) return false;
                if (s.description && s.description.toLowerCase().includes(cleanName)) return false;
                return true;
              }) && (
                <optgroup label="Other Compatible Snapshots">
                  {vpsSnapshots
                    .filter((s) => {
                      if (s.labels && s.labels['devbox-server-id'] === serverId) return false;
                      const cleanName = serverName.replace('.devboxui.com', '').replace('-code', '').toLowerCase();
                      if (s.name && s.name.toLowerCase().includes(cleanName)) return false;
                      if (s.description && s.description.toLowerCase().includes(cleanName)) return false;
                      return true;
                    })
                    .map((s) => (
                      <option key={s.id} value={s.id.toString()}>
                        {s.description || s.name || `Snapshot #${s.id}`} {s.image_size ? `(${parseFloat(s.image_size.toString()).toFixed(2)} GB)` : ''}
                      </option>
                    ))}
                </optgroup>
              )}
            </Select2>
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
