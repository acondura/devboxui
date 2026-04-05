import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-3xl text-center space-y-8">
        
        {/* 'Build in Public' Badge */}
        <div className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-sm font-medium text-indigo-300">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500 mr-2 animate-pulse"></span>
          Building in public
        </div>

        {/* Hero Text */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
          The Zero-Touch <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            Control Plane
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
          Replace expensive hardware with instant cloud workspaces. DevBox UI orchestrates secure, browser-based VS Code and DDEV environments directly on scalable infrastructure.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link 
            href="/dashboard" 
            className="w-full sm:w-auto px-8 py-3.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
          >
            Enter Dashboard
          </Link>
          <a 
            href="https://github.com/acondura/devboxui" 
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto px-8 py-3.5 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg shadow-sm border border-slate-700 transition-all"
          >
            View Source
          </a>
        </div>
        
      </div>
    </div>
  );
}