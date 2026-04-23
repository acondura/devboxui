import { useState, useEffect } from 'react';
import { getHetznerOptions, getUserSettings } from '@/modules/inventory/actions';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onAdd: (name: string, serverType: string, location: string, image: string) => Promise<void>;
}

export function AddServerModal({ isOpen, onClose, onOpenSettings, onAdd }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [serverType, setServerType] = useState('cpx21');
  const [location, setLocation] = useState('nbg1');
  const [image, setImage] = useState('ubuntu-24.04');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSSHKey, setHasSSHKey] = useState(true);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  
  const [options, setOptions] = useState<{
    serverTypes: any[];
    locations: any[];
    images: any[];
  }>({ serverTypes: [], locations: [], images: [] });
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  useEffect(() => {
    if (isOpen) {
      async function loadOptions() {
        setIsLoadingOptions(true);
        setIsCheckingKey(true);
        
        const [data, settings] = await Promise.all([
          getHetznerOptions(),
          getUserSettings()
        ]);
        
        setOptions(data);
        setHasSSHKey(!!settings?.sshPublicKey);
        setIsCheckingKey(false);
        
        // Set defaults if data available
        if (data.serverTypes.length > 0) {
          const defaultType = data.serverTypes.find(t => t.name === 'cpx21') || data.serverTypes[0];
          setServerType(defaultType.name);
        }
        if (data.locations.length > 0) {
          const defaultLoc = data.locations.find(l => l.name === 'nbg1') || data.locations[0];
          setLocation(defaultLoc.name);
        }
        if (data.images.length > 0) {
          const defaultImg = data.images.find(i => i.name === 'ubuntu-24.04') || data.images[0];
          setImage(defaultImg.name);
        }
        
        setIsLoadingOptions(false);
      }
      loadOptions();
    }
  }, [isOpen]);

  // Find current architecture
  const currentType = options.serverTypes.find(t => t.name === serverType);
  const currentArch = currentType?.architecture || 'x86';

  // Filter images based on architecture
  const filteredImages = options.images.filter(i => i.architecture === currentArch);

  // Sort server types by price (for the current location)
  const sortedServerTypes = [...options.serverTypes].sort((a, b) => {
    const getPrice = (t: any) => {
      const p = t.prices.find((p: any) => p.location === location) || t.prices[0];
      return parseFloat(p?.price_monthly?.gross || '0');
    };
    return getPrice(a) - getPrice(b);
  });

  // Find price for current selection
  const selectedPrice = currentType?.prices.find((p: any) => p.location === location) || currentType?.prices[0];
  const monthlyPrice = selectedPrice?.price_monthly?.gross;

  // Auto-switch image if current image is not in filtered list
  useEffect(() => {
    if (filteredImages.length > 0 && !filteredImages.some(i => i.name === image)) {
      setImage(filteredImages[0].name);
    }
  }, [serverType, options.images, image, filteredImages]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onAdd(name, serverType, location, image);
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
          <h3 className="text-xl font-bold text-white">Launch New DevBox</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {!hasSSHKey && !isCheckingKey && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.268 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-bold">SSH Key Required</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                You must add your SSH Public Key in settings before you can launch a DevBox. This ensures you can access your server securely.
              </p>
              <button 
                type="button"
                onClick={() => { onClose(); onOpenSettings(); }}
                className="text-xs font-bold text-amber-500 hover:text-amber-400 underline underline-offset-4"
              >
                Go to Settings to add key →
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">DevBox Name (Optional)</label>
            <input
              type="text"
              placeholder="e.g. project-x-dev"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!hasSSHKey}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Server Type</label>
              <select
                value={serverType}
                onChange={(e) => setServerType(e.target.value)}
                disabled={isLoadingOptions || !hasSSHKey}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50"
              >
                {sortedServerTypes.map(t => {
                  const p = t.prices.find((p: any) => p.location === location) || t.prices[0];
                  const priceLabel = p ? `(€${parseFloat(p.price_monthly.gross).toFixed(2)})` : '';
                  return (
                    <option key={t.id} value={t.name}>
                      {t.name.toUpperCase()} - {t.description} {priceLabel}
                    </option>
                  );
                })}
                {isLoadingOptions && <option>Loading types...</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Location</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isLoadingOptions}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50"
              >
                {options.locations.map(l => (
                  <option key={l.id} value={l.name}>{l.city} ({l.name.toUpperCase()})</option>
                ))}
                {isLoadingOptions && <option>Loading locations...</option>}
              </select>
            </div>
          </div>

          {/* Specs Summary */}
          {!isLoadingOptions && currentType && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Cores</p>
                <p className="text-xs font-bold text-slate-200">{currentType.cores} vCPU</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">RAM</p>
                <p className="text-xs font-bold text-slate-200">{currentType.memory} GB</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Disk</p>
                <p className="text-xs font-bold text-slate-200">{currentType.disk} GB</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Arch</p>
                <p className="text-xs font-bold text-slate-200 uppercase">{currentType.architecture}</p>
              </div>
            </div>
          )}

          {/* Deprecation Warning */}
          {currentType?.deprecation && (
            <div className="bg-amber-900/20 border border-amber-900/30 rounded-xl p-3 flex items-start space-x-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                Scheduled for deprecation on <strong className="text-amber-400">{new Date(currentType.deprecation).toLocaleDateString()}</strong>.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">OS Image</label>
            <select
              value={image}
              onChange={(e) => setImage(e.target.value)}
              disabled={isLoadingOptions}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50"
            >
              {filteredImages.map(i => (
                <option key={i.id} value={i.name}>
                  {i.description} ({i.architecture === 'arm' ? 'ARM' : 'x86'})
                </option>
              ))}
              {isLoadingOptions && <option>Loading images...</option>}
              {!isLoadingOptions && filteredImages.length === 0 && <option>No compatible images</option>}
            </select>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Estimated Cost</p>
              <p className="text-xl font-black text-white">
                {monthlyPrice ? `€${parseFloat(monthlyPrice).toFixed(2)}` : '--'}
                <span className="text-xs text-slate-400 font-normal ml-1">/ month</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Hourly</p>
              <p className="text-sm font-mono text-indigo-400">
                {selectedPrice?.price_hourly?.gross ? `€${parseFloat(selectedPrice.price_hourly.gross).toFixed(4)}` : '--'}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500 italic px-1">
            We'll automatically create a Hetzner VPS and bootstrap it with Docker and VS Code via Cloud-Init.
          </p>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || isLoadingOptions || !hasSSHKey}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Launching...</span>
                </>
              ) : (
                <span>Launch DevBox ✨</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
