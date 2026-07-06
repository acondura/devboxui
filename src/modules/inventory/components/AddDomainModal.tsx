'use client';

import { useState, useEffect } from 'react';

interface AddDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (domainPrefix: string, port: number, startDdev?: boolean) => void;
  initialData?: { prefix: string; port: number; startDdev?: boolean };
}

export function AddDomainModal({ isOpen, onClose, onAdd, initialData }: AddDomainModalProps) {
  const [domainPrefix, setDomainPrefix] = useState(initialData?.prefix || '');
  const [startDdev, setStartDdev] = useState(initialData?.startDdev || false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state with initialData when modal opens
  useEffect(() => {
    if (isOpen) {
      setDomainPrefix(initialData?.prefix || '');
      setStartDdev(initialData?.startDdev || false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onAdd(domainPrefix, 80, startDdev);
    setIsSubmitting(false);
    setDomainPrefix('');
    setStartDdev(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Expose Service Domain</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Cloudflare Ingress Setup</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider">How it works</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              We&apos;ll create a new Cloudflare DNS record and route it through your secure tunnel. This allows you to access web services (like <strong>DDEV</strong> or <strong>Node.js</strong> apps) running inside your DevBox.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Subdomain</label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="e.g. odb-app"
                value={domainPrefix}
                onChange={(e) => setDomainPrefix(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-4 pr-36 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <span className="text-slate-500 text-sm font-medium">-web.devboxui.com</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
            <input
              id="start-ddev"
              type="checkbox"
              checked={startDdev}
              onChange={(e) => setStartDdev(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 cursor-pointer"
            />
            <label htmlFor="start-ddev" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
              Start ddev project <strong className="text-indigo-600">{domainPrefix || 'X'}</strong> on spin-up
            </label>
          </div>

          <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
             <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Endpoint URL</span>
                <span className="text-sm font-mono text-indigo-600 break-all">
                   https://{domainPrefix ? `${domainPrefix}-web.devboxui.com` : 'prefix-web.devboxui.com'}
                </span>
             </div>
             <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <div className="flex items-center space-x-2">
                   <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Cloudflare Access + Tunnel</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                   :localhost:80
                </span>
             </div>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !domainPrefix}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm uppercase tracking-wider">Activating Domain...</span>
                </>
              ) : (
                <span className="text-sm uppercase tracking-wider">Activate Domain</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
