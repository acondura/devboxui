interface DashboardViewProps {
  userEmail: string;
}

export function DashboardView({ userEmail }: DashboardViewProps) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 font-sans">
      {/* Top Navigation */}
      <nav className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex justify-between items-center">
        <div className="font-bold text-xl tracking-tight text-white">
          DevBox<span className="text-indigo-500">UI</span>
        </div>
        
        {/* This is where the Access module proves it knows who the user is */}
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-sm">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="text-sm text-slate-400 font-mono bg-slate-800 px-3 py-1.5 rounded-md">
            {userEmail}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-8">
        <div className="mb-8 border-b border-slate-800 pb-5 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-white">Active Environments</h2>
            <p className="text-slate-400 text-sm mt-1">Manage your team's cloud development servers.</p>
          </div>
          
          {/* We will wire this button up to the Provisioning module later */}
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-md transition-colors shadow-sm">
            + Provision VPS
          </button>
        </div>

        {/* Empty State placeholder */}
        <div className="border border-dashed border-slate-700 rounded-lg p-12 text-center bg-slate-800/30">
          <div className="mx-auto h-12 w-12 text-slate-500 mb-3 rounded-full bg-slate-800 flex items-center justify-center">
             <span className="text-xl">☁️</span>
          </div>
          <h3 className="text-sm font-semibold text-white">No servers active</h3>
          <p className="mt-1 text-sm text-slate-400">Click provision to boot a new Contabo instance.</p>
        </div>
      </main>
    </div>
  );
}