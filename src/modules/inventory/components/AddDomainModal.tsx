'use client';

import { useState } from 'react';

interface AddDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (domainPrefix: string) => void;
}

export function AddDomainModal({ isOpen, onClose, onAdd }: AddDomainModalProps) {
  const [domainPrefix, setDomainPrefix] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onAdd(domainPrefix);
    setIsSubmitting(false);
    setDomainPrefix('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Expose Service Domain</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Cloudflare Ingress Setup</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider">How it works</p>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              We&apos;ll create a new Cloudflare DNS record and route it through your secure tunnel. This allows you to access web services (like <strong>DDEV</strong> or <strong>Node.js</strong> apps) running inside your DevBox.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Subdomain Prefix</label>
            <input
              type="text"
              required
              placeholder="e.g. my-app"
              value={domainPrefix}
              onChange={(e) => setDomainPrefix(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            <div className="mt-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800/50 flex items-center justify-between">
               <span className="text-xs text-slate-500 font-bold uppercase tracking-tight">Resulting URL:</span>
               <span className="text-sm font-mono text-indigo-400 truncate ml-2">
                  {domainPrefix ? `${domainPrefix}.devboxui.com` : 'prefix.devboxui.com'}
               </span>
            </div>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Updating DNS...</span>
                </>
              ) : (
                <span className="text-sm">Expose New Domain ✨</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
