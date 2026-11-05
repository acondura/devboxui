'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error
    console.error('Captured client error:', error);

    // Check if this is a ChunkLoaderError
    const isChunkLoadError = 
      error.name === 'ChunkLoadError' || 
      error.message?.includes('ChunkLoadError') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module');

    if (isChunkLoadError) {
      console.warn('ChunkLoadError detected. Reloading page to fetch latest build...');
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center space-y-4">
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 rounded-2xl p-6 max-w-md w-full text-left">
        <div className="flex items-center space-x-3 text-red-600 dark:text-red-400 mb-4">
          <svg className="w-8 h-8 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Something went wrong</h2>
        </div>
        <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl p-4 mb-6">
          <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed font-mono break-all whitespace-pre-wrap">
            {error.message || 'An unexpected error occurred while rendering this page.'}
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => reset()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all text-sm shadow-md"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 text-slate-700 dark:text-zinc-200 font-bold py-2.5 px-4 rounded-xl transition-all text-sm border border-slate-200 dark:border-zinc-600"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
