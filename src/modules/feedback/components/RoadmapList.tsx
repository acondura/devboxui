'use client';

import { useState, useEffect } from 'react';
import { getRoadmap } from '../actions';
import { FeedbackItem } from '../types';

export function RoadmapList() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getRoadmap().then(data => {
      setItems(data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sections = [
    { label: 'Planned', status: 'planned', icon: '📝', color: 'text-indigo-400' },
    { label: 'In Progress', status: 'in-progress', icon: '⚡', color: 'text-amber-400' },
    { label: 'Fixed & Released', status: 'fixed', icon: '✅', color: 'text-emerald-400' }
  ];

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {sections.map((section) => {
          const sectionItems = items.filter(i => i.status === section.status || (section.status === 'planned' && i.status === 'pending'));
          
          return (
            <div key={section.status} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className={`text-sm font-bold uppercase tracking-widest flex items-center space-x-2 ${section.color}`}>
                  <span>{section.icon}</span>
                  <span>{section.label}</span>
                </h4>
                <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {sectionItems.length}
                </span>
              </div>

              <div className="space-y-3">
                {sectionItems.length === 0 ? (
                  <p className="text-slate-600 text-xs italic py-4">No tasks here yet.</p>
                ) : (
                  sectionItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={`group p-4 rounded-xl border border-slate-800 transition-all hover:border-slate-700 bg-slate-900/50 ${
                        item.status === 'fixed' ? 'ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/5' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded ${
                          item.type === 'bug' ? 'bg-red-500/10 text-red-500' : 
                          item.type === 'feature' ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {item.type}
                        </span>
                        
                        {/* Admin Controls */}
                        {item.status !== 'fixed' && (
                          <button
                            onClick={async () => {
                              const { updateFeedbackStatus } = await import('../actions');
                              await updateFeedbackStatus(item.id, item.userEmail, 'fixed');
                              window.location.reload(); // Quick refresh to show update
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[9px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 transition-all hover:bg-emerald-500/20"
                          >
                            Mark Fixed
                          </button>
                        )}
                        
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.userName}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">{item.message}</p>
                      {item.status === 'fixed' && (
                        <div className="mt-3 pt-3 border-t border-emerald-500/10 flex items-center space-x-2 text-emerald-400 animate-in slide-in-from-left-2 duration-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-[11px] font-bold uppercase tracking-wide">Live now!</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
