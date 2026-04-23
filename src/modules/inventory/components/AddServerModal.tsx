import { useState, useEffect } from 'react';
import { getHetznerOptions } from '@/modules/inventory/actions';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, serverType: string, location: string, image: string) => Promise<void>;
}

export function AddServerModal({ isOpen, onClose, onAdd }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [serverType, setServerType] = useState('cpx21');
  const [location, setLocation] = useState('nbg1');
  const [image, setImage] = useState('ubuntu-24.04');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
        const data = await getHetznerOptions();
        setOptions(data);
        
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
                disabled={isLoadingOptions}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-50"
              >
                {options.serverTypes.map(t => (
                  <option key={t.id} value={t.name}>
                    {t.description} ({t.architecture === 'arm' ? 'ARM' : 'x86'})
                  </option>
                ))}
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

          <p className="text-xs text-slate-500 italic px-1">
            We'll automatically create a Hetzner VPS and bootstrap it with Docker and VS Code via Cloud-Init.
          </p>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || isLoadingOptions}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
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
