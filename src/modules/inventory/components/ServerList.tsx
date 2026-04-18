import { ServerConfig } from '../types';

interface ServerListProps {
  servers: ServerConfig[];
}

export function ServerList({ servers }: ServerListProps) {
  if (servers.length === 0) {
    return (
      <div className="border border-dashed border-slate-700 rounded-xl p-12 text-center bg-slate-800/20">
        <div className="mx-auto h-12 w-12 text-slate-500 mb-4 rounded-full bg-slate-800 flex items-center justify-center">
           <span className="text-2xl">☁️</span>
        </div>
        <h3 className="text-base font-semibold text-white">No servers active</h3>
        <p className="mt-1 text-sm text-slate-400 max-w-xs mx-auto">
          Add a server by IP to start provisioning your cloud development environment.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {servers.map((server) => (
        <div key={server.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all group">
          <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex justify-between items-start">
            <div>
              <div className="flex items-center space-x-2">
                <span className={`h-2 w-2 rounded-full ${server.status === 'ready' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <h4 className="font-bold text-white uppercase tracking-wider text-xs">{server.status}</h4>
              </div>
              <p className="text-lg font-mono text-indigo-400 mt-1">{server.ip}</p>
            </div>
            <div className="bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-slate-400 uppercase">
              Ubuntu 22.04
            </div>
          </div>
          
          <div className="p-5 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">User</span>
              <span className="text-slate-300 font-mono">{server.userName}</span>
            </div>
            
            {server.status === 'ready' && server.tunnelUrl && (
              <a 
                href={server.tunnelUrl} 
                target="_blank" 
                rel="noreferrer"
                className="block w-full text-center bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 font-semibold py-2 rounded-lg border border-indigo-500/30 transition-all text-sm"
              >
                Open VS Code
              </a>
            )}
            
            {server.status === 'provisioning' && (
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full w-1/2 animate-[shimmer_2s_infinite]" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
