'use client';

import { useState, useEffect } from 'react';
import { 
  getUserSettings, 
  saveUserSettings, 
  getUserMemberships, 
  getOrgSettings, 
  saveOrgSettings 
} from '@/modules/inventory/actions';
import { UserMembership } from '@/modules/inventory/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'personal' | 'org'>('personal');
  
  // Personal settings state
  const [personalHetznerToken, setPersonalHetznerToken] = useState('');
  const [personalDigitalOceanToken, setPersonalDigitalOceanToken] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');
  
  // Org settings state
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [orgName, setOrgName] = useState('');
  const [orgHetznerToken, setOrgHetznerToken] = useState('');
  const [orgDigitalOceanToken, setOrgDigitalOceanToken] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Load initial settings
  useEffect(() => {
    if (isOpen) {
      // Load personal settings
      getUserSettings().then(settings => {
        if (settings) {
          setPersonalHetznerToken(settings.hetznerToken || '');
          setPersonalDigitalOceanToken(settings.digitalOceanToken || '');
          setSshPublicKey(settings.sshPublicKey || '');
        }
      });

      // Load organization memberships
      getUserMemberships().then(m => {
        setMemberships(m || []);
        if (m && m.length > 0) {
          setSelectedOrgId(m[0].orgId);
        }
      });
    }
  }, [isOpen]);

  // Load selected organization settings
  useEffect(() => {
    if (selectedOrgId) {
      getOrgSettings(selectedOrgId).then(settings => {
        if (settings) {
          setOrgName(settings.orgName || '');
          setOrgHetznerToken(settings.hetznerToken || '');
          setOrgDigitalOceanToken(settings.digitalOceanToken || '');
        } else {
          setOrgName(selectedOrgId);
          setOrgHetznerToken('');
          setOrgDigitalOceanToken('');
        }
      });
    }
  }, [selectedOrgId]);

  if (!isOpen) return null;

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      await saveUserSettings({
        hetznerToken: personalHetznerToken,
        digitalOceanToken: personalDigitalOceanToken,
        sshPublicKey
      });
      setStatus({ type: 'success', message: 'Personal settings saved successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setIsSaving(true);
    setStatus(null);
    try {
      await saveOrgSettings({
        orgId: selectedOrgId,
        orgName,
        hetznerToken: orgHetznerToken,
        digitalOceanToken: orgDigitalOceanToken,
        adminEmails: []
      });
      setStatus({ type: 'success', message: 'Organization settings saved successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save organization settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all ${
              activeTab === 'personal'
                ? 'border-indigo-600 text-indigo-605'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            👤 Personal Profile
          </button>
          {memberships.length > 0 && (
            <button
              onClick={() => setActiveTab('org')}
              className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all ${
                activeTab === 'org'
                  ? 'border-indigo-600 text-indigo-605'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              🏢 Organization
            </button>
          )}
        </div>
        
        {activeTab === 'personal' ? (
          <form onSubmit={handleSavePersonal} className="p-6 space-y-6">
            {/* Hetzner Token */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Personal Hetzner API Token</label>
              <input
                type="password"
                placeholder="hcl_..."
                value={personalHetznerToken}
                onChange={(e) => setPersonalHetznerToken(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="mt-2 text-xs text-slate-500">
                Optional. If not set, the global organization or system token will be used.
              </p>
            </div>

            {/* DigitalOcean Token */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Personal DigitalOcean API Token</label>
              <input
                type="password"
                placeholder="dop_..."
                value={personalDigitalOceanToken}
                onChange={(e) => setPersonalDigitalOceanToken(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="mt-2 text-xs text-slate-500">
                Optional. If not set, the organization or system token will be used.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Your Public SSH Key</label>
                <textarea
                  placeholder="ssh-ed25519 AAAAC3Nza... user@computer"
                  value={sshPublicKey}
                  onChange={(e) => setSshPublicKey(e.target.value)}
                  className="w-full h-24 bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-xs"
                  required
                />
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                  Paste your local public key here. This key will be automatically added to all DevBoxes you have access to.
                </p>
              </div>
            </div>

            {status && (
              <div className={`p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                {status.message}
              </div>
            )}
            
            <div className="pt-2 flex space-x-3">
              <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg transition-all">Close</button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold py-2.5 px-8 rounded-lg transition-all flex items-center justify-center"
              >
                {isSaving ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save Settings</span>}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveOrg} className="p-6 space-y-6">
            {/* Org Dropdown Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Organization</label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                {memberships.map(m => (
                  <option key={m.orgId} value={m.orgId}>{m.orgId}</option>
                ))}
              </select>
            </div>

            {/* Org Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Organization Name</label>
              <input
                type="text"
                placeholder="My Awesome Org"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Org Hetzner Token */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Organization Hetzner Token</label>
              <input
                type="password"
                placeholder="hcl_..."
                value={orgHetznerToken}
                onChange={(e) => setOrgHetznerToken(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="mt-2 text-xs text-slate-500">
                Shared Hetzner API Token used by all members to launch DevBoxes under this organization.
              </p>
            </div>

            {/* Org DigitalOcean Token */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Organization DigitalOcean Token</label>
              <input
                type="password"
                placeholder="dop_..."
                value={orgDigitalOceanToken}
                onChange={(e) => setOrgDigitalOceanToken(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="mt-2 text-xs text-slate-500">
                Shared DigitalOcean API Token used by all members to launch Droplets under this organization.
              </p>
            </div>

            {status && (
              <div className={`p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                {status.message}
              </div>
            )}
            
            <div className="pt-2 flex space-x-3">
              <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg transition-all">Close</button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-semibold py-2.5 px-8 rounded-lg transition-all flex items-center justify-center"
              >
                {isSaving ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Save Org Settings</span>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
