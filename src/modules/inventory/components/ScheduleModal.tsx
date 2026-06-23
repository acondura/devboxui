'use client';

import { useState, useEffect } from 'react';
import { ScheduleConfig } from '../types';
import { getScheduleConfig, saveScheduleConfig, triggerMorningSpinup, triggerEveningSnapshot } from '../schedule-actions';
import { getHetznerOptions } from '../actions';
import { HetznerServerType, HetznerLocation, HetznerPricingResponse } from '@/lib/hetzner-api';
import { ConfirmSnapshotModal } from './ConfirmSnapshotModal';

// Common IANA timezones for the picker
const TIMEZONES = [
  'Europe/Bucharest', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Europe/Warsaw', 'Europe/Kiev',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC'
];

function getIpv4Pricing(pricing: HetznerPricingResponse | null | undefined, location: string) {
  const defaults = { monthly: 0.60, hourly: 0.0008 };
  if (pricing && pricing.pricing && pricing.pricing.primary_ips) {
    const ipv4 = pricing.pricing.primary_ips.find((p) => p.type === 'ipv4');
    if (ipv4 && ipv4.pricings) {
      const locPricing = ipv4.pricings.find((lp) => lp.location === location) || ipv4.pricings[0];
      if (locPricing) {
        let monthly = 0.60;
        let hourly = 0.0008;
        if (locPricing.monthly) {
          const monthlyGross = parseFloat(locPricing.monthly.gross);
          if (!isNaN(monthlyGross)) {
            monthly = monthlyGross;
          } else {
            const monthlyNet = parseFloat(locPricing.monthly.net);
            if (!isNaN(monthlyNet)) monthly = monthlyNet * 1.19;
          }
        }
        if (locPricing.hourly) {
          const hourlyGross = parseFloat(locPricing.hourly.gross);
          if (!isNaN(hourlyGross)) {
            hourly = hourlyGross;
          } else {
            const hourlyNet = parseFloat(locPricing.hourly.net);
            if (!isNaN(hourlyNet)) hourly = hourlyNet * 1.19;
          }
        }
        return { monthly, hourly };
      }
    }
  }
  return defaults;
}

const DEFAULT_CONFIG: ScheduleConfig = {
  enabled: false,
  timezone: 'Europe/Bucharest',
  spinupTime: '09:00',
  snapshotTime: '18:00',
  serverType: 'cpx21',
  location: 'nbg1',
};

interface Props {
  serverId: string;
  serverName: string;
  serverStatus?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: ScheduleConfig) => void;
  onRefresh?: () => Promise<void> | void;
}

export function ScheduleModal({ serverId, serverName, serverStatus, isOpen, onClose, onSaved, onRefresh }: Props) {
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);
  const [serverTypes, setServerTypes] = useState<HetznerServerType[]>([]);
  const [locations, setLocations] = useState<HetznerLocation[]>([]);
  const [originalDiskSize, setOriginalDiskSize] = useState<number>(80);
  const [pricing, setPricing] = useState<HetznerPricingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggeringMorning, setIsTriggeringMorning] = useState(false);
  const [isTriggeringEvening, setIsTriggeringEvening] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isConfirmSnapshotOpen, setIsConfirmSnapshotOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    
    Promise.all([
      getScheduleConfig(serverId),
      getHetznerOptions().catch(err => {
        console.error("Failed to fetch Hetzner options in modal:", err);
        return { serverTypes: [], locations: [], images: [], pricing: null };
      })
    ])
      .then(([cfg, options]) => {
        if (cfg) {
          setConfig(cfg);
          if (options && options.serverTypes) {
            const initialType = options.serverTypes.find(t => t.name.toLowerCase() === (cfg.serverType || 'cpx21').toLowerCase());
            if (initialType) {
              setOriginalDiskSize(initialType.disk);
            }
          }
        } else {
          setConfig({ ...DEFAULT_CONFIG });
          setOriginalDiskSize(80);
        }
        
        if (options) {
          if (options.serverTypes) setServerTypes(options.serverTypes);
          if (options.locations) setLocations(options.locations);
          if (options.pricing) setPricing(options.pricing);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [isOpen, serverId]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveScheduleConfig(serverId, config);
      onSaved?.(config);
      showToast('success', 'Schedule saved successfully.');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerMorning = async () => {
    setIsTriggeringMorning(true);
    try {
      const result = await triggerMorningSpinup(serverId);
      showToast(result.success ? 'success' : 'error', result.message);
      if (result.success && onRefresh) {
        await onRefresh();
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Morning spin-up failed.');
    } finally {
      setIsTriggeringMorning(false);
    }
  };

  const handleTriggerEvening = async (customPrefix?: string) => {
    setIsTriggeringEvening(true);
    try {
      const result = await triggerEveningSnapshot(serverId, customPrefix);
      showToast(result.success ? 'success' : 'error', result.message);
      if (result.success && onRefresh) {
        await onRefresh();
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Evening snapshot failed.');
    } finally {
      setIsTriggeringEvening(false);
    }
  };

  if (!isOpen) return null;

  // --- Pricing calculations ---
  const formattedStatus = serverStatus
    ? serverStatus.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Ready';

  const currentType = serverTypes.find(t => t.name.toLowerCase() === (config.serverType || 'cpx21').toLowerCase());
  const selectedPrice = currentType?.prices.find((p) => p.location === (config.location || 'nbg1')) || currentType?.prices[0];
  
  const ipv4Pricing = getIpv4Pricing(pricing, config.location || 'nbg1');
  const monthlyPriceGross = (selectedPrice ? parseFloat(selectedPrice.price_monthly?.gross || '0') : 8.50) + ipv4Pricing.monthly; 
  const hourlyPriceGross = (selectedPrice ? parseFloat(selectedPrice.price_hourly?.gross || '0') : 0.015) + ipv4Pricing.hourly; 
  const diskSizeGb = currentType ? currentType.disk : 80;

  const activeHoursPerDay = (() => {
    if (!config.spinupTime || !config.snapshotTime) return 9;
    const [sh, sm] = config.spinupTime.split(':').map(Number);
    const [eh, em] = config.snapshotTime.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 9;
    let diffMins = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMins < 0) diffMins += 24 * 60;
    return diffMins / 60;
  })();

  const monthlyRunningHours = activeHoursPerDay * 30;
  const activeCostMonthly = monthlyRunningHours * hourlyPriceGross;
  const snapshotCostMonthly = diskSizeGb * 0.013; 
  const totalScheduleCost = config.enabled ? (activeCostMonthly + snapshotCostMonthly) : monthlyPriceGross;
  const monthlySavings = config.enabled ? Math.max(0, monthlyPriceGross - totalScheduleCost) : 0;
  const savingsPercent = monthlyPriceGross > 0 ? (monthlySavings / monthlyPriceGross) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <ConfirmSnapshotModal
        isOpen={isConfirmSnapshotOpen}
        onClose={() => setIsConfirmSnapshotOpen(false)}
        onConfirm={handleTriggerEvening}
        serverName={serverName}
      />
      <div className="w-full max-w-lg lg:max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Daily Automation Schedule</h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{serverName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors p-1 rounded-md hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 bg-white">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="p-6 overflow-y-auto max-h-[80vh] lg:max-h-[70vh] space-y-6 bg-white">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              
              {/* Left Column: Configuration Settings */}
              <div className="space-y-6">
                
                {/* Enable toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Enable daily automation</p>
                    <p className="text-xs text-slate-550 mt-0.5">Automate daily spin-up and shutdown cycles</p>
                  </div>
                  <button
                    id={`schedule-toggle-${serverId}`}
                    onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${
                      config.enabled ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'bg-slate-250'
                    }`}
                    role="switch"
                    aria-checked={config.enabled}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${
                      config.enabled ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Time settings */}
                <div className="space-y-4 bg-slate-50/50 border border-slate-200/80 p-4 rounded-xl">
                  <Label>Schedule Times</Label>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Spin-up Time (Start)
                        </label>
                        <input
                          id={`spinup-enabled-${serverId}`}
                          type="checkbox"
                          checked={config.spinupEnabled !== false}
                          onChange={e => setConfig(c => ({ ...c, spinupEnabled: e.target.checked }))}
                          disabled={!config.enabled}
                          className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer disabled:opacity-40"
                        />
                      </div>
                      <input
                        id={`spinup-time-${serverId}`}
                        type="time"
                        value={config.spinupTime}
                        onChange={e => setConfig(c => ({ ...c, spinupTime: e.target.value }))}
                        disabled={!config.enabled || config.spinupEnabled === false}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-45 font-mono font-medium"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          Snapshot Time (Stop)
                        </label>
                        <input
                          id={`snapshot-enabled-${serverId}`}
                          type="checkbox"
                          checked={config.snapshotEnabled !== false}
                          onChange={e => setConfig(c => ({ ...c, snapshotEnabled: e.target.checked }))}
                          disabled={!config.enabled}
                          className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer disabled:opacity-40"
                        />
                      </div>
                      <input
                        id={`snapshot-time-${serverId}`}
                        type="time"
                        value={config.snapshotTime}
                        onChange={e => setConfig(c => ({ ...c, snapshotTime: e.target.value }))}
                        disabled={!config.enabled || config.snapshotEnabled === false}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-45 font-mono font-medium"
                      />
                    </div>
                  </div>

                  {/* Timezone */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Timezone</label>
                    <select
                      id={`timezone-${serverId}`}
                      value={config.timezone}
                      onChange={e => setConfig(c => ({ ...c, timezone: e.target.value }))}
                      disabled={!config.enabled}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-45"
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Server type & location */}
                <div className="space-y-4 bg-slate-50/50 border border-slate-200/80 p-4 rounded-xl">
                  <Label>Spin-up Configuration</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Server Type</label>
                      <div className="relative">
                        <select
                          id={`server-type-${serverId}`}
                          value={config.serverType}
                          onChange={e => setConfig(c => ({ ...c, serverType: e.target.value }))}
                          disabled={!config.enabled}
                          className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-45 font-mono appearance-none cursor-pointer font-medium"
                        >
                          {serverTypes.map(t => {
                            const priceObj = t.prices.find(p => p.location === (config.location || 'nbg1')) || t.prices[0];
                            const ipv4 = getIpv4Pricing(pricing, config.location || 'nbg1');
                            const monthlyGross = priceObj ? `${(parseFloat(priceObj.price_monthly?.gross || '0') + ipv4.monthly).toFixed(2)}€` : '';
                            const isDisabled = t.disk < originalDiskSize;
                            return (
                              <option 
                                key={t.id} 
                                value={t.name} 
                                disabled={isDisabled}
                                className="bg-white text-slate-900 text-xs disabled:text-slate-400"
                              >
                                {t.name.toUpperCase()} ({t.cores}C / {t.memory}G / {t.disk}GB SSD) {monthlyGross ? `— ${monthlyGross}/mo` : ''} {isDisabled ? '(Disk too small)' : ''}
                              </option>
                            );
                          })}
                          {serverTypes.length === 0 && (
                            <option value={config.serverType || 'cpx21'}>
                              {(config.serverType || 'cpx21').toUpperCase()} (Loading...)
                            </option>
                          )}
                        </select>
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Choose the hardware capacity. Note: Downscaling to a size with a smaller SSD than your current snapshot ({originalDiskSize}GB) is disabled.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Location</label>
                      <div className="relative">
                        <select
                          id={`location-${serverId}`}
                          value={config.location}
                          onChange={e => setConfig(c => ({ ...c, location: e.target.value }))}
                          disabled={!config.enabled}
                          className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-45 font-mono appearance-none cursor-pointer font-medium"
                        >
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.name} className="bg-white text-slate-900 text-xs">
                              {loc.name.toUpperCase()} ({loc.city})
                            </option>
                          ))}
                          {locations.length === 0 && (
                            <option value={config.location || 'nbg1'}>
                              {(config.location || 'nbg1').toUpperCase()} (Loading...)
                            </option>
                          )}
                        </select>
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Caution: Relocating requires copying snapshot over WAN on boot, delaying startup by several minutes. Nuremberg (NBG1) is recommended.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pause Controls */}
                <div className="space-y-4 bg-slate-50/50 border border-slate-200/80 p-4 rounded-xl">
                  <Label>Pause & Vacation Rules</Label>

                  {/* Pause Until */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6M9 19h6a2 2 0 002-2V7a2 2 0 00-2-2H9a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Pause all automation until
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`pause-until-${serverId}`}
                        type="date"
                        value={config.pauseUntil || ''}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={e => setConfig(c => ({ ...c, pauseUntil: e.target.value || undefined }))}
                        className="flex-1 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                      />
                      {config.pauseUntil && (
                        <button
                          onClick={() => setConfig(c => ({ ...c, pauseUntil: undefined }))}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-100 rounded-lg transition-all"
                          title="Clear pause"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      It keeps the current server state (<span className="text-amber-600 font-medium">{formattedStatus}</span>) during that time.
                    </p>
                    {config.pauseUntil && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block animate-pulse" />
                        Automation paused until <strong>{config.pauseUntil}</strong> (inclusive)
                      </p>
                    )}
                  </div>

                  {/* Skip weekends toggle */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div className="text-left">
                        <span className="text-xs font-bold text-slate-700">Skip Weekends</span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Do not run automation on Saturdays and Sundays</p>
                      </div>
                    </div>
                    <button
                      id={`skip-weekends-toggle-${serverId}`}
                      onClick={() => setConfig(c => ({ ...c, skipWeekends: !c.skipWeekends }))}
                      disabled={!config.enabled}
                      className={`relative w-10 h-5 rounded-full transition-all duration-300 focus:outline-none ${
                        config.skipWeekends ? 'bg-rose-600 shadow-md shadow-rose-600/20' : 'bg-slate-250'
                      } disabled:opacity-40`}
                      role="switch"
                      aria-checked={config.skipWeekends}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-300"
                        style={{ left: config.skipWeekends ? '22px' : '2px' }}
                      />
                    </button>
                  </div>

                  {/* Blocked / vacation dates */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Vacation / Blocked dates
                    </label>

                    {/* Date adder */}
                    <div className="flex items-center gap-2">
                      <input
                        id={`blocked-date-picker-${serverId}`}
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        className="flex-1 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                        onChange={e => {
                          const date = e.target.value;
                          if (!date) return;
                          setConfig(c => {
                            const existing = c.blockedDates || [];
                            if (existing.includes(date)) return c;
                            const updated = [...existing, date].sort();
                            return { ...c, blockedDates: updated };
                          });
                          e.target.value = ''; 
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      It keeps the current server state (<span className="text-rose-600 font-medium">{formattedStatus}</span>) for the selected date.
                    </p>

                    {/* Chip list */}
                    {config.blockedDates && config.blockedDates.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {config.blockedDates.map(date => (
                          <span
                            key={date}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-555 bg-rose-50 border border-rose-200 rounded-full text-[11px] font-mono text-rose-750"
                          >
                            {date}
                            <button
                              onClick={() => setConfig(c => ({
                                ...c,
                                blockedDates: (c.blockedDates || []).filter(d => d !== date)
                              }))}
                              className="text-rose-500/70 hover:text-rose-700 transition-colors"
                              title={`Remove ${date}`}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={() => setConfig(c => ({ ...c, blockedDates: [] }))}
                          className="text-[10px] text-slate-500 hover:text-rose-650 transition-colors px-2 py-1 hover:bg-rose-50 rounded-full"
                        >
                          Clear all
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic">No skip days configured.</p>
                    )}
                  </div>
                </div>

              </div>

              {/* Right Column: Pricing Calculations, Status & Manual Actions */}
              <div className="space-y-6">

                {/* Cost Estimation Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                  
                  <Label>Cost & Savings Projection</Label>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Always On (24/7)</span>
                      <span className="text-lg font-mono font-bold text-slate-700">€{monthlyPriceGross.toFixed(2)}<span className="text-xs text-slate-500">/mo</span></span>
                      <span className="text-[9px] text-slate-500 font-mono block">€{hourlyPriceGross.toFixed(3)}/hr base</span>
                    </div>
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                      <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider block">Automated Schedule</span>
                      <span className="text-lg font-mono font-bold text-indigo-900">€{totalScheduleCost.toFixed(2)}<span className="text-xs text-indigo-750">/mo</span></span>
                      <span className="text-[9px] text-indigo-600/70 font-mono block">Includes snapshot storage</span>
                    </div>
                  </div>

                  {/* Savings Highlight Box */}
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Monthly Savings Projection</span>
                      <div className="text-xl font-mono font-black text-emerald-600">€{monthlySavings.toFixed(2)}<span className="text-xs text-emerald-500 font-normal">/mo</span></div>
                    </div>
                    <div className="px-3 py-1.5 bg-emerald-100 border border-emerald-200 text-emerald-700 font-mono text-sm font-black rounded-lg">
                      -{savingsPercent.toFixed(0)}%
                    </div>
                  </div>

                  {/* Cost Breakdown Details */}
                  <div className="space-y-2 text-[11px] font-mono text-slate-600 border-t border-slate-200 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Daily Active Window</span>
                      <span className="text-slate-700">{activeHoursPerDay.toFixed(1)} hours/day</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monthly Run Hours</span>
                      <span className="text-slate-700">~{monthlyRunningHours.toFixed(0)} hours/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Server Run Cost</span>
                      <span className="text-slate-700">€{activeCostMonthly.toFixed(2)}/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Snapshot Storage ({diskSizeGb}GB)</span>
                      <span className="text-slate-700">€{snapshotCostMonthly.toFixed(2)}/mo</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 italic pt-1 border-t border-slate-200">
                      <span>* Prices include IPv4 address fee (€{getIpv4Pricing(pricing, config.location || 'nbg1').monthly.toFixed(2)}/mo or €{getIpv4Pricing(pricing, config.location || 'nbg1').hourly.toFixed(4)}/hr)</span>
                    </div>
                  </div>
                </div>

                {/* Snapshot status */}
                {(config.latestSnapshotId || config.lastEveningRun) && (
                  <div className="space-y-3 bg-slate-50/50 border border-slate-200/80 p-4 rounded-xl">
                    <Label>Latest Backup Status</Label>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs font-mono">
                      {config.latestSnapshotId && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Snapshot ID</span>
                          <span className="text-indigo-650 font-bold">#{config.latestSnapshotId}</span>
                        </div>
                      )}
                      {config.latestSnapshotDate && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Date Created</span>
                          <span className="text-slate-700">{config.latestSnapshotDate}</span>
                        </div>
                      )}
                      {config.lastEveningRun && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Last Run</span>
                          <span className="text-slate-700">
                            {new Date(config.lastEveningRun).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {config.lastRunStatus && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Automation Status</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                            config.lastRunStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            config.lastRunStatus === 'error' ? 'bg-rose-50 text-rose-750 border border-rose-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {config.lastRunStatus}
                          </span>
                        </div>
                      )}
                      {config.lastRunError && (
                        <p className="text-[10px] text-rose-700 mt-1 break-all bg-rose-50 border border-rose-200 p-2 rounded">{config.lastRunError}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Manual triggers */}
                <div className="space-y-3 bg-slate-50/50 border border-slate-200/80 p-4 rounded-xl">
                  <Label>Manual Operations</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      id={`trigger-morning-${serverId}`}
                      onClick={handleTriggerMorning}
                      disabled={isTriggeringMorning || !config.latestSnapshotId}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 border border-emerald-250 text-emerald-700 text-xs font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-50 hover:bg-emerald-100"
                      title={!config.latestSnapshotId ? 'Run shutdown/snapshot workflow first to create a snapshot' : ''}
                    >
                      {isTriggeringMorning ? (
                        <div className="w-3.5 h-3.5 border-2 border-emerald-455 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07l-.71.71M6.34 17.66l-.71.71m12.73 0l-.71-.71M6.34 6.34l-.71-.71" />
                        </svg>
                      )}
                      Spin Up Now
                    </button>

                    <button
                      id={`trigger-evening-${serverId}`}
                      onClick={() => setIsConfirmSnapshotOpen(true)}
                      disabled={isTriggeringEvening}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-250 text-amber-700 text-xs font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isTriggeringEvening ? (
                        <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                      )}
                      Snapshot + Delete
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
                    <strong className="text-slate-650">Spin Up Now</strong> requests a restore from the snapshot. &nbsp;
                    <strong className="text-slate-650">Snapshot + Delete</strong> triggers a graceful power-off, snapshot creation, and VM deletion.
                  </p>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            id={`save-schedule-${serverId}`}
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            Save Schedule
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-bold shadow-2xl z-[200] transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-600/30'
              : 'bg-rose-600 text-white shadow-rose-600/30'
          }`}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{children}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
