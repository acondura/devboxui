'use client';

import { useState, useEffect } from 'react';
import { getHetznerOptions, getDigitalOceanOptions, provisionManualServer } from '@/modules/inventory/actions';
import type { HetznerPricingResponse } from '@/lib/hetzner-api';
import { Select2 } from './Select2';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, serverType: string, location: string, image: string, customUsername?: string, provider?: 'hetzner' | 'digitalocean') => Promise<{ success: boolean; error?: string; server?: unknown } | void>;
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
  cpu_type: string;
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

function getIpv4MonthlyPrice(pricing: HetznerPricingResponse | null | undefined, location: string): number {
  if (pricing && pricing.pricing && pricing.pricing.primary_ips) {
    const ipv4 = pricing.pricing.primary_ips.find((p) => p.type === 'ipv4');
    if (ipv4 && ipv4.pricings) {
      const locPricing = ipv4.pricings.find((lp) => lp.location === location) || ipv4.pricings[0];
      if (locPricing && locPricing.monthly) {
        const gross = parseFloat(locPricing.monthly.gross);
        if (!isNaN(gross)) return gross;
        const net = parseFloat(locPricing.monthly.net);
        if (!isNaN(net)) return net * 1.19; // fallback
      }
    }
  }
  return 0.60; // default fallback if anything fails
}

export function AddServerModal({ isOpen, onClose, onAdd }: AddServerModalProps) {
  const [provider, setProvider] = useState<CloudProvider>('hetzner');
  const [name, setName] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serverType, setServerType] = useState('cpx21');
  const [location, setLocation] = useState('nbg1');
  const [image, setImage] = useState('ubuntu-24.04');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [options, setOptions] = useState<{
    serverTypes: HetznerServerType[];
    locations: HetznerLocation[];
    images: HetznerImage[];
    snapshots: HetznerImage[];
    pricing?: HetznerPricingResponse | null;
  }>({ serverTypes: [], locations: [], images: [], snapshots: [], pricing: null });
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [ip, setIp] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapCommand, setBootstrapCommand] = useState<string | null>(null);
  const [createdServerName, setCreatedServerName] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  
  // Load last provider and selections on mount
  useEffect(() => {
    const saved = localStorage.getItem('devbox_last_provider');
    if (saved) setProvider(saved as CloudProvider);
    
    const savedType = localStorage.getItem('devbox_last_server_type');
    if (savedType) setServerType(savedType);
    
    const savedLoc = localStorage.getItem('devbox_last_location');
    if (savedLoc) setLocation(savedLoc);
    
    const savedImg = localStorage.getItem('devbox_last_image');
    if (savedImg) setImage(savedImg);
  }, []);

  // Save provider on change
  const handleProviderSelect = (p: CloudProvider) => {
    setProvider(p);
    localStorage.setItem('devbox_last_provider', p);
  };

  useEffect(() => {
    if (isOpen && (provider === 'hetzner' || provider === 'digitalocean')) {
      async function loadOptions() {
        setIsLoadingOptions(true);
        setOptionsError(null);
        
        const data = provider === 'hetzner' ? await getHetznerOptions() : await getDigitalOceanOptions();
        const responseData = data as { error?: string };
        if (responseData.error) {
          setOptionsError(responseData.error);
        }
        
        setOptions(data as unknown as { serverTypes: HetznerServerType[]; locations: HetznerLocation[]; images: HetznerImage[]; snapshots: HetznerImage[]; pricing?: HetznerPricingResponse | null });
        
        // Reset name on open
        setName('');
        setCustomUsername('');
        
        // Set defaults only if no saved options exist
        const savedType = localStorage.getItem(`devbox_last_${provider}_server_type`);
        if (savedType) {
          setServerType(savedType);
        } else if (data.serverTypes.length > 0) {
          const typedTypes = data.serverTypes as unknown as HetznerServerType[];
          const typedData = data as unknown as { pricing?: HetznerPricingResponse | null };
          const sorted = [...typedTypes].sort((a, b) => {
            if (provider === 'digitalocean') {
              const priceA = parseFloat(a.prices[0]?.price_monthly?.gross || '0');
              const priceB = parseFloat(b.prices[0]?.price_monthly?.gross || '0');
              return priceA - priceB;
            }
            const getPrice = (t: HetznerServerType) => {
              const p = t.prices.find((p) => p.location === location) || t.prices[0];
              const ipv4 = getIpv4MonthlyPrice(typedData.pricing || null, location);
              return parseFloat(p?.price_monthly?.gross || '0') + ipv4;
            };
            return getPrice(a) - getPrice(b);
          });
          setServerType(sorted[0].name);
        }

        const savedLoc = localStorage.getItem(`devbox_last_${provider}_location`);
        if (savedLoc) {
          setLocation(savedLoc);
        } else if (data.locations.length > 0) {
          const defaultLoc = provider === 'hetzner'
            ? (data.locations.find(l => l.name === 'nbg1') || data.locations[0])
            : (data.locations.find(l => l.name === 'nyc1') || data.locations[0]);
          setLocation(defaultLoc.name);
        }

        const savedImg = localStorage.getItem(`devbox_last_${provider}_image`);
        if (savedImg) {
          setImage(savedImg);
        } else {
          if (data.snapshots && data.snapshots.length > 0) {
            const initialImg = data.snapshots[0].id.toString();
            setImage(initialImg);
            localStorage.setItem(`devbox_last_${provider}_image`, initialImg);
          } else if (data.images.length > 0) {
            const defaultImg = provider === 'hetzner'
              ? (data.images.find(i => i.name === 'ubuntu-24.04') || data.images[0])
              : (data.images.find(i => i.name?.includes('24-04')) || data.images[0]);
            const initialImg = defaultImg.name ?? defaultImg.id.toString();
            setImage(initialImg);
            localStorage.setItem(`devbox_last_${provider}_image`, initialImg);
          }
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
      if (provider === 'digitalocean') {
        return parseFloat(p?.price_monthly?.gross || '0');
      }
      const ipv4 = getIpv4MonthlyPrice(options.pricing, location);
      return parseFloat(p?.price_monthly?.gross || '0') + ipv4;
    };
    return getPrice(a) - getPrice(b);
  });
 
  // Categorization function for server types
  const getCategorizedType = (t: HetznerServerType) => {
    const name = t.name.toLowerCase();
    
    if (provider === 'digitalocean') {
      if (name.startsWith('s-')) {
        return 'Shared Resources - Cost-Optimized (Intel/AMD)';
      }
      return 'Dedicated Resources (General Purpose)';
    }

    // Dedicated resources
    if (t.cpu_type === 'dedicated' || name.startsWith('ccx')) {
      return 'Dedicated Resources (General Purpose)';
    }
    
    // ARM architecture
    if (t.architecture === 'arm' || name.startsWith('cax')) {
      return 'Shared Resources - ARM64 (Ampere®)';
    }
    
    // x86 Shared resources
    const isNewerShared = name.startsWith('cx23') || name.startsWith('cx33') || name.startsWith('cx43') || name.startsWith('cx53') || name.startsWith('cx63');
    if (isNewerShared) {
      return 'Shared Resources - Regular Performance (Intel/AMD)';
    }
    
    return 'Shared Resources - Cost-Optimized (Intel/AMD)';
  };

  // Group sorted types by category
  const groupedServerTypes = sortedServerTypes.reduce((acc, t) => {
    const category = getCategorizedType(t);
    if (!acc[category]) acc[category] = [];
    acc[category].push(t);
    return acc;
  }, {} as Record<string, HetznerServerType[]>);

  const categoryOrder = [
    'Shared Resources - Regular Performance (Intel/AMD)',
    'Shared Resources - Cost-Optimized (Intel/AMD)',
    'Shared Resources - ARM64 (Ampere®)',
    'Dedicated Resources (General Purpose)'
  ];

  // Find price for current selection
  const selectedPrice = currentType?.prices.find((p) => p.location === location) || currentType?.prices[0];
  const ipv4Fee = getIpv4MonthlyPrice(options.pricing, location);
  const monthlyPrice = selectedPrice ? (parseFloat(selectedPrice.price_monthly.gross) + ipv4Fee).toString() : undefined;

  // Auto-switch image if current selection is not compatible with the architecture
  useEffect(() => {
    if (!isOpen || isLoadingOptions) return;

    const isImageValid = options.images.some(i => i.name === image && i.architecture === currentArch);
    const isSnapshotValid = options.snapshots.some(s => s.id.toString() === image && s.architecture === currentArch);

    if (!isImageValid && !isSnapshotValid) {
      if (options.snapshots.length > 0) {
        const validSnapshots = options.snapshots.filter(s => s.architecture === currentArch);
        if (validSnapshots.length > 0) {
          const newImg = validSnapshots[0].id.toString();
          setImage(newImg);
          localStorage.setItem('devbox_last_image', newImg);
          return;
        }
      }

      if (filteredImages.length > 0) {
        const ubuntuImages = filteredImages.filter(i => i.name && i.name.toLowerCase().startsWith('ubuntu-'));
        const newImg = ubuntuImages.length > 0
          ? (ubuntuImages[0].name || filteredImages[0].name)
          : filteredImages[0].name;
        setImage(newImg);
        localStorage.setItem('devbox_last_image', newImg);
      }
    }
  }, [serverType, image, options.images, options.snapshots, filteredImages, currentArch, isOpen, isLoadingOptions]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (provider === 'hetzner' || provider === 'digitalocean') {
        const result = await onAdd(name, serverType, location, image, customUsername.trim() || undefined, provider);
        if (result && !result.success) {
          setError(result.error || "An unknown error occurred during provisioning.");
        } else {
          onClose();
        }
      } else {
        const result = await provisionManualServer(name, provider, ip, password, customUsername.trim() || undefined);
        if (result.success) {
          setBootstrapCommand(result.command || null);
          setShowSuccess(true);
          setCreatedServerName(name);
        } else {
          setError(result.error || "An unknown error occurred during setup.");
        }
      }
    } catch (err) {
      console.error("Failed to add server:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const providers: {id: CloudProvider, name: string, active: boolean, info?: string}[] = [
    { id: 'hetzner', name: 'Hetzner', active: true },
    { id: 'digitalocean', name: 'DigitalOcean', active: true },
    { id: 'linode', name: 'Linode', active: false },
    { id: 'vultr', name: 'Vultr', active: false },
    { id: 'contabo', name: 'Custom', active: true, info: 'Manual Provision' },
  ];  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-2xl overflow-hidden p-6 relative text-left">
          <div className="flex items-center space-x-3 text-red-500 mb-4">
            <svg className="w-8 h-8 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-900">Provisioning Failed</h3>
          </div>
          <div className="bg-red-50 border border-red-150 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700 leading-relaxed font-mono break-all whitespace-pre-wrap text-left">
              {error}
            </p>
          </div>
          <div className="text-center">
            <button
              onClick={() => setError(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-sm border border-slate-205"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (bootstrapCommand) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
        <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
             <div>
               <h3 className="text-xl font-bold text-slate-900">Manual Setup Required</h3>
               <p className="text-xs text-indigo-600 uppercase tracking-widest font-black mt-1">Provider: {provider}</p>
             </div>
             <button onClick={() => { setBootstrapCommand(null); onClose(); }} className="text-slate-400 hover:text-slate-900 transition-colors">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
               </svg>
             </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-sm text-indigo-900 leading-relaxed">
                Infrastructure for <strong>{createdServerName}</strong> is ready. Connect to your fresh <strong>Ubuntu</strong> server and run this command as root:
              </p>
            </div>
            
            <div className="relative group">
              <div className="bg-slate-100 border border-slate-250 rounded-xl p-5 font-mono text-[10px] text-indigo-700 break-all leading-relaxed shadow-inner max-h-[100px] overflow-y-auto">
                <span className="text-slate-500 mr-2 select-none">$</span>
                {bootstrapCommand}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(bootstrapCommand);
                }}
                className="absolute top-3 right-3 p-2 bg-slate-205 hover:bg-slate-300 text-slate-700 rounded-lg transition-all shadow-lg"
                title="Copy to clipboard"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 8h4m-2-2v4" />
                </svg>
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">What happens next?</h4>
              <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                <li>Server reports progress back to DevBox UI automatically</li>
                <li>Your secure Cloudflare Tunnel will be activated</li>
                <li>Docker, DDEV and Oh-My-Bash will be deployed</li>
              </ul>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => {
                  setBootstrapCommand(null);
                  onClose();
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-all"
              >
                Close and wait for server
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
        <div className="w-full max-w-md bg-white border border-indigo-200 rounded-3xl shadow-2xl overflow-hidden text-center p-8 relative">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/40">
             <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
             </svg>
          </div>
          <div className="mt-8 space-y-4">
            <h3 className="text-2xl font-black text-slate-900 italic">{bootstrapCommand ? 'READY TO LAUNCH! 🚀' : 'VICTORY! 🚀'}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              {bootstrapCommand 
                ? "Your Cloudflare infrastructure is ready. Now just paste this command on your VPS to link it."
                : "Your DevBox is live. You just saved yourself roughly 2 hours of manual configuration."}
            </p>
            
            {bootstrapCommand && (
              <div className="bg-slate-50 border border-indigo-100 rounded-2xl p-4 mt-6 text-left group relative overflow-hidden">
                <div className="absolute inset-0 bg-indigo-500/5 animate-pulse"></div>
                <p className="text-[10px] uppercase font-black text-indigo-600 mb-2 tracking-widest flex items-center">
                  <span className="w-2 h-2 bg-indigo-600 rounded-full mr-2 animate-ping"></span>
                  Paste this on your server
                </p>
                <code className="text-xs text-slate-700 font-mono break-all leading-relaxed block pr-8 max-h-[100px] overflow-y-auto scrollbar-thin">
                  {bootstrapCommand}
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(bootstrapCommand || '');
                    setCopyStatus('Copied!');
                    setTimeout(() => setCopyStatus(null), 2000);
                  }}
                  className="absolute top-4 right-4 p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Copy to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 8h4m-2-2v4" />
                  </svg>
                </button>
              </div>
            )}

            {!bootstrapCommand && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-6 text-left group">
                <p className="text-[10px] uppercase font-black text-slate-500 mb-2 tracking-widest">Share your expert setup</p>
                <p className="text-xs text-indigo-600 italic font-medium leading-relaxed">
                  &quot;Just provisioned a full Docker/DDEV dev environment in under 60 seconds with @DevBoxUI. My infra is finally automated. ⚡️&quot;
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => {
                  const text = bootstrapCommand || `Just provisioned a full Docker/DDEV dev environment in under 60 seconds with DevBoxUI. My infra is finally automated. ⚡️`;
                  navigator.clipboard.writeText(text);
                  setCopyStatus('Copied!');
                  setTimeout(() => setCopyStatus(null), 2000);
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-sm border border-slate-200"
              >
                {copyStatus || (bootstrapCommand ? 'Copy Command' : 'Copy Post')}
              </button>
              <button 
                onClick={onClose}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all text-sm shadow-lg shadow-indigo-600/20"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Launch New DevBox</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Multi-Cloud Provisioning</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider Selector */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-205">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Select Cloud Provider</label>
          <Select2
            value={provider}
            onValueChange={(val) => {
              const selected = providers.find(p => p.id === val);
              if (selected?.active) handleProviderSelect(val as CloudProvider);
            }}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.active}>
                {p.name} {p.info ? `(${p.info})` : ''} {!p.active ? '— Coming Soon' : ''}
              </option>
            ))}
          </Select2>
        </div>
        
        {optionsError && (provider === 'hetzner' || provider === 'digitalocean') && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-left">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-red-700 leading-relaxed">
              <p className="font-bold">{provider === 'hetzner' ? 'Hetzner' : 'DigitalOcean'} Connection Error</p>
              <p>{optionsError}</p>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">DevBox Name (Required)</label>
              <input
                type="text"
                placeholder="e.g. project-x-dev"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">SSH Username (Optional)</label>
              <input
                type="text"
                placeholder="e.g. admin"
                value={customUsername}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Clean on input to keep it POSIX-friendly (lowercase, no spaces/special chars)
                  const cleaned = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
                  setCustomUsername(cleaned);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
              />
            </div>
            
            {(provider === 'hetzner' || provider === 'digitalocean') && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Server Type</label>
                  <Select2
                    value={serverType}
                    onValueChange={(val) => {
                      setServerType(val);
                      localStorage.setItem(`devbox_last_${provider}_server_type`, val);
                    }}
                    disabled={isLoadingOptions}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50 text-sm font-medium"
                  >
                    {isLoadingOptions ? (
                      <option>Loading types...</option>
                    ) : (
                      categoryOrder.map(category => {
                        const types = groupedServerTypes[category];
                        if (!types || types.length === 0) return null;
                        return (
                          <optgroup key={category} label={category} className="bg-white text-slate-500 font-semibold text-xs py-1">
                            {types.map(t => {
                              const p = t.prices.find((p) => p.location === location) || t.prices[0];
                              const ipv4 = provider === 'digitalocean' ? 0 : getIpv4MonthlyPrice(options.pricing, location);
                              const priceSymbol = provider === 'digitalocean' ? '$' : '€';
                              const priceLabel = p ? `${priceSymbol}${(parseFloat(p.price_monthly.gross) + ipv4).toFixed(2)}` : '';
                              const specs = `${t.cores} vCPU / ${t.memory}GB RAM / ${t.disk}GB / ${t.architecture.toUpperCase()}`;
                              return (
                                <option key={t.id} value={t.name} className="text-slate-900 font-normal bg-white">
                                  {t.name.toUpperCase()} — ({priceLabel}) — {specs}
                                </option>
                              );
                            })}
                          </optgroup>
                        );
                      })
                    )}
                  </Select2>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                  <Select2
                    value={location}
                    onValueChange={(val) => {
                      setLocation(val);
                      localStorage.setItem(`devbox_last_${provider}_location`, val);
                    }}
                    disabled={isLoadingOptions}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50 text-sm font-medium"
                  >
                    {options.locations.map(l => (
                      <option key={l.name} value={l.name}>{l.city} ({l.name.toUpperCase()})</option>
                    ))}
                    {isLoadingOptions && <option>Loading locations...</option>}
                  </Select2>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">OS Image / Snapshot</label>
                  <Select2
                    value={image}
                    onValueChange={(val) => {
                      setImage(val);
                      localStorage.setItem(`devbox_last_${provider}_image`, val);
                    }}
                    disabled={isLoadingOptions}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50 text-sm font-medium"
                  >
                    {options.snapshots && options.snapshots.length > 0 && (
                      <optgroup label="Your Snapshots">
                        {options.snapshots
                          .filter(s => s.architecture === currentArch)
                          .map(s => (
                            <option key={s.id} value={s.id.toString()}>
                              {s.description || `Snapshot #${s.id}`} (ID: {s.id})
                            </option>
                          ))
                        }
                      </optgroup>
                    )}
                    <optgroup label="System OS Images">
                      {filteredImages.map(i => (
                        <option key={i.id || i.name} value={i.name ?? ''}>
                          {i.description || i.name} ({i.name})
                        </option>
                      ))}
                    </optgroup>
                    {isLoadingOptions && <option>Loading OS options...</option>}
                  </Select2>
                </div>
              </>
            )}
          </div>

          {/* Specs Summary */}
          {!isLoadingOptions && currentType && (provider === 'hetzner' || provider === 'digitalocean') && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Cores</p>
                <p className="text-sm font-bold text-slate-700">{currentType.cores} vCPU</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-slate-100 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  Virtual CPU cores allocated to your instance.
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">RAM</p>
                <p className="text-sm font-bold text-slate-700">{currentType.memory} GB</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-slate-100 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  Total system memory available.
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Disk</p>
                <p className="text-sm font-bold text-slate-700">{currentType.disk} GB</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-slate-100 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  SSD-backed storage capacity.
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center group relative cursor-help">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Arch</p>
                <p className="text-sm font-bold text-slate-700 uppercase">{currentType.architecture}</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-slate-100 text-[10px] p-2 rounded shadow-xl w-36 pointer-events-none z-50">
                  Processor architecture (x86_64 or ARM64).
                </div>
              </div>
            </div>
          )}

          {provider === 'contabo' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Server IP Address</label>
                <input
                  type="text"
                  placeholder="e.g. 1.2.3.4"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Root Password</label>
                <input
                  type="password"
                  placeholder="Enter root password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                />
              </div>
            </div>
          )}
          {(provider === 'hetzner' || provider === 'digitalocean') && (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center group relative">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Cost</p>
                  <p className="text-2xl font-black text-slate-900">
                    {monthlyPrice ? `${provider === 'digitalocean' ? '$' : '€'}${parseFloat(monthlyPrice).toFixed(2)}` : '--'}
                    <span className="text-sm text-slate-500 font-normal ml-1">/ month</span>
                  </p>
                  {provider === 'hetzner' && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Includes IPv4 address (€{getIpv4MonthlyPrice(options.pricing, location).toFixed(2)}/mo)
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Billing Model</p>
                  <p className="text-sm font-mono text-indigo-650 uppercase tracking-tighter">
                    Hourly Pro-rata
                  </p>
                </div>
                <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
              </div>
            </>
          )}

          <div className="p-4 bg-indigo-55 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider">How it works</p>
            </div>
            <p className="text-xs text-slate-650 leading-relaxed">
              {provider === 'hetzner' || provider === 'digitalocean' ? (
                <>We&apos;ll create a clean <strong className="text-slate-800 font-bold">{provider === 'hetzner' ? 'Hetzner' : 'DigitalOcean'}</strong> instance with your SSH key injected for instant connection.</>
              ) : (
                <>We&apos;ll connect to your <strong className="text-slate-800 font-bold">existing server</strong>.</>
              )} This sets up secure SSH access and dynamic DNS routing without installing extra software.
            </p>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || ((provider === 'hetzner' || provider === 'digitalocean') && isLoadingOptions) || !name.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Provisioning on {providers.find(p => p.id === provider)?.name}...</span>
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
