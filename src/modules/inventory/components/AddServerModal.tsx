'use client';

import { useState } from 'react';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (ip: string, rootPassword: string) => void;
}

export function AddServerModal({ isOpen, onClose, onAdd }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [serverType, setServerType] = useState('cx22');
  const [location, setLocation] = useState('nbg1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onAdd(name, serverType, location);
      onClose();
    } catch (err) {
      console.error("Failed to add server:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Spawn New DevBox</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">DevBox Name (Optional)</label>
            <input
              type="text"
              placeholder="e.g. project-x-dev"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Server Type</label>
              <select
                value={serverType}
                onChange={(e) => setServerType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
              >
                <option value="cx22">Intel (2 vCPU, 4GB)</option>
                <option value="cpx11">AMD (2 vCPU, 2GB)</option>
                <option value="cax11">ARM (2 vCPU, 4GB)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Location</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
              >
                <option value="nbg1">🇩🇪 Nuremberg</option>
                <option value="fsn1">🇩🇪 Falkenstein</option>
                <option value="hel1">🇫🇮 Helsinki</option>
                <option value="ash">🇺🇸 Ashburn, VA</option>
                <option value="hil">🇺🇸 Hillsboro, OR</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-slate-500 italic px-1">
            We'll automatically create a Hetzner VPS and bootstrap it with Docker and VS Code via Cloud-Init.
          </p>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Spawning...</span>
                </>
              ) : (
                <span>Spawn DevBox ✨</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
