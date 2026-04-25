'use client';

import { useState, useEffect } from 'react';
import { getRoadmap } from '../actions';
import { FeedbackItem } from '../types';

export function LatestUpdates() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getRoadmap().then(data => {
      // Only show fixed items on the homepage
      setItems(data.filter(i => i.status === 'fixed'));
      setIsLoading(false);
    });
  }, []);

  if (isLoading || items.length === 0) return null;

  // Grouping by type for better presentation
  const categories = {
    feature: { label: 'New Capabilities', icon: '✨', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    improvement: { label: 'Performance & UX', icon: '🚀', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    bug: { label: 'Stability Fixes', icon: '🛡️', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
  };

  return (
    <section className="mt-24 pt-12 border-t border-slate-900 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="text-center mb-12">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-500 mb-2">Changelog</h2>
        <h3 className="text-3xl font-bold text-white">Latest Enhancements</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {(Object.entries(categories) as [keyof typeof categories, typeof categories['feature']][]).map(([type, meta]) => {
          const categoryItems = items.filter(i => i.type === type).slice(0, 3); // Show top 3 per category
          if (categoryItems.length === 0) return null;

          return (
            <div key={type} className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-700 transition-all">
              <div className="flex items-center space-x-3 mb-6">
                <div className={`w-10 h-10 ${meta.bg} rounded-xl flex items-center justify-center text-xl`}>
                  {meta.icon}
                </div>
                <h4 className={`font-bold ${meta.color}`}>{meta.label}</h4>
              </div>
              
              <ul className="space-y-4">
                {categoryItems.map((item) => (
                  <li key={item.id} className="flex items-start space-x-3 group">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-700 group-hover:bg-indigo-500 transition-colors shrink-0" />
                    <p className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors leading-relaxed">
                      {item.message}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
