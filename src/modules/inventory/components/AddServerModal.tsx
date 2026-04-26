import { useState, useEffect } from 'react';
import { getHetznerOptions } from '@/modules/inventory/actions';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, serverType: string, location: string, image: string) => Promise<void>;
}

interface HetznerPrice {
  location: string;
  price_monthly: { gross: string };
  price_hourly: { gross: string };
}

interface HetznerServerType {
  id: number;
  name: string;
  cores: number;
  memory: number;
  disk: number;
  architecture: string;
  deprecation: string | null;
  prices: HetznerPrice[];
}

interface HetznerLocation {
  id: number;
  name: string;
  city: string;
}

interface HetznerImage {
  id: number;
  name: string;
  description: string;
  architecture: string;
}

type CloudProvider = 'hetzner' | 'contabo' | 'digitalocean' | 'linode' | 'vultr';

export function AddServerModal({ isOpen, onClose, onAdd }: AddServerModalProps) {
  const [provider, setProvider] = useState<CloudProvider>('hetzner');
  const [name, setName] = useState('');
  const [serverType, setServerType] = useState('cpx21');
  const [location, setLocation] = useState('nbg1');
  const [image, setImage] = useState('ubuntu-24.04');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [options, setOptions] = useState<{
    serverTypes: HetznerServerType[];
    locations: HetznerLocation[];
    images: HetznerImage[];
  }>({ serverTypes: [], locations: [], images: [] });
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  useEffect(() => {
    if (isOpen && provider === 'hetzner') {
      async function loadOptions() {
        setIsLoadingOptions(true);
        
        const data = await getHetznerOptions();
        
        setOptions(data as unknown as { serverTypes: HetznerServerType[]; locations: HetznerLocation[]; images: HetznerImage[] });
        
        // Reset form values on open
        setName('');
        
        // Set defaults if data available
        if (data.serverTypes.length > 0) {
          const typedTypes = data.serverTypes as unknown as HetznerServerType[];
          const sorted = [...typedTypes].sort((a, b) => {
            const getPrice = (t: HetznerServerType) => {
              const p = t.prices.find((p) => p.location === location) || t.prices[0];
              return parseFloat(p?.price_monthly?.gross || '0');
            };
            return getPrice(a) - getPrice(b);
          });
          setServerType(sorted[0].name);
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
  }, [isOpen, location, provider]);

  // Find current architecture
  const currentType = options.serverTypes.find(t => t.name === serverType);
  const currentArch = currentType?.architecture || 'x86';

  // Filter images based on architecture
  const filteredImages = options.images.filter(i => i.architecture === currentArch);

  // Sort server types by price (for the current location)
  const sortedServerTypes = [...options.serverTypes].sort((a, b) => {
    const getPrice = (t: HetznerServerType) => {
      const p = t.prices.find((p) => p.location === location) || t.prices[0];
      return parseFloat(p?.price_monthly?.gross || '0');
    };
    return getPrice(a) - getPrice(b);
  });

  // Find price for current selection
  const selectedPrice = currentType?.prices.find((p) => p.location === location) || currentType?.prices[0];
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
    if (provider !== 'hetzner') {
      alert("Only Hetzner is currently supported in the prototype.");
      return;
    }
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

  const providers: {id: CloudProvider, name: string, active: boolean, info?: string}[] = [
    { id: 'hetzner', name: 'Hetzner', active: true },
    { id: 'contabo', name: 'Contabo', active: false, info: 'Monthly billing' },
    { id: 'digitalocean', name: 'DigitalOcean', active: false },
    { id: 'linode', name: 'Linode', active: false },
    { id: 'vultr', name: 'Vultr', active: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h3 className="text-xl font-bold text-white">Launch New DevBox</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Multi-Cloud Provisioning</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider Selector */}
        <div className="px-6 py-4 bg-slate-950/30 border-b border-slate-800/50">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Select Cloud Provider</label>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.active && setProvider(p.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex flex-col items-center min-w-[90px] relative overflow-hidden group ${
                  provider === p.id 
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                    : p.active 
                      ? 'bg-slate-800 border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-slate-300' 
                      : 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed grayscale'
                }`}
              >
                <span>{p.name}</span>
                {p.info && <span className="text-[8px] opacity-60 font-normal">{p.info}</span>}
                {!p.active && (
                  <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] uppercase tracking-tighter text-white font-black bg-indigo-500 px-1.5 py-0.5 rounded shadow-lg">Coming Soon</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-400 mb-1.5">DevBox Name (Required)</label>
              <input
                type="text"
                placeholder="e.g. project-x-dev"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Server Type</label>
              <select
                value={serverType}
                onChange={(e) => setServerType(e.target.value)}
                disabled={isLoadingOptions || provider !== 'hetzner'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50 text-sm"
              >
                {sortedServerTypes.map(t => {
                  const p = t.prices.find((p) => p.location === location) || t.prices[0];
                  const priceLabel = p ? `€${parseFloat(p.price_monthly.gross).toFixed(2)}` : '';
                  const specs = `${t.cores} vCPU / ${t.memory}GB RAM / ${t.disk}GB / ${t.architecture.toUpperCase()}`;
                  return (
                    <option key={t.id} value={t.name}>
                      {t.name.toUpperCase()} - ({priceLabel}) - {specs}
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
                disabled={isLoadingOptions || provider !== 'hetzner'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50 text-sm"
              >
                {options.locations.map(l => (
                  <option key={l.id} value={l.name}>{l.city} ({l.name.toUpperCase()})</option>
                ))}
                {isLoadingOptions && <option>Loading locations...</option>}
              </select>
            </div>
          </div>

          {/* Specs Summary */}
          {!isLoadingOptions && currentType && provider === 'hetzner' && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Cores</p>
                <p className="text-sm font-bold text-slate-200">{currentType.cores} vCPU</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-300 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  Virtual CPU cores allocated to your instance.
                </div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">RAM</p>
                <p className="text-sm font-bold text-slate-200">{currentType.memory} GB</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-300 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  Total system memory available.
                </div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Disk</p>
                <p className="text-sm font-bold text-slate-200">{currentType.disk} GB</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-300 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  SSD-backed storage capacity.
                </div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Arch</p>
                <p className="text-sm font-bold text-slate-200 uppercase">{currentType.architecture}</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-300 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  Processor architecture (x86_64 or ARM64).
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">OS Image</label>
            <select
              value={image}
              onChange={(e) => setImage(e.target.value)}
              disabled={isLoadingOptions || provider !== 'hetzner'}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50 text-sm"
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

          <div className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-4 flex justify-between items-center group relative">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Cost</p>
              <p className="text-2xl font-black text-white">
                {monthlyPrice ? `€${parseFloat(monthlyPrice).toFixed(2)}` : '--'}
                <span className="text-sm text-slate-400 font-normal ml-1">/ month</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Billing Model</p>
              <p className="text-sm font-mono text-indigo-400 uppercase tracking-tighter">
                {provider === 'contabo' ? 'Monthly' : 'Hourly Pro-rata'}
              </p>
            </div>
            <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
          </div>

          <div className="p-4 bg-slate-950/40 border border-slate-800/50 rounded-xl space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider">How it works</p>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              We&apos;ll create a <strong className="text-slate-200 capitalize">{provider}</strong> instance and run our custom DevBox bootstrap. This installs Docker, sets up your secure tunnel, and deploys your VS Code environment.
            </p>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || (provider === 'hetzner' && isLoadingOptions)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Provisioning on {provider}...</span>
                </>
              ) : (
                <span className="text-sm">Launch DevBox ✨</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
