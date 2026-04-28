import Link from 'next/link';
import Image from 'next/image';
import { LatestUpdates } from '@/modules/feedback/components/LatestUpdates';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden">
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-6 backdrop-blur-md bg-[#020617]/70 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white font-black text-xs">DX</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">DevBox<span className="text-indigo-500 font-black">UI</span></span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#security" className="hover:text-white transition-colors">Security</a>
          <a href="#stack" className="hover:text-white transition-colors">Stack</a>
        </div>

        <div className="flex items-center gap-4">
          <Link 
            href="/dashboard" 
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            Open App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-24 px-6 md:px-12 flex flex-col items-center">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-indigo-600/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
        <div className="absolute top-48 left-0 w-[400px] h-[400px] bg-cyan-600/10 blur-[100px] rounded-full -z-10 pointer-events-none" />

        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-wider uppercase">
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              v1.0 is officially live
            </div>
            
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white leading-[0.9]">
              The Next Gen <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">
                Cloud IDE
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Transform raw VPS infrastructure into high-performance, secure development boxes in 60 seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link 
                href="/dashboard" 
                className="group w-full sm:w-auto px-10 py-5 text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-2xl shadow-xl shadow-indigo-600/30 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
              >
                Launch DevBox
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
              <a 
                href="https://github.com/acondura/devboxui" 
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-10 py-5 text-lg font-bold text-slate-300 bg-white/5 hover:bg-white/10 rounded-2xl backdrop-blur-md border border-white/10 transition-all flex items-center justify-center gap-2"
              >
                Github Source
              </a>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-6 pt-4 text-slate-500 font-medium">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-[#020617] bg-slate-800 flex items-center justify-center text-[10px] text-slate-300 font-bold overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 10}`} alt="User avatar" />
                  </div>
                ))}
              </div>
              <p className="text-sm">Trusted by <span className="text-white font-bold">500+</span> cloud engineers</p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-slate-900/50 rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl backdrop-blur-2xl">
              <img 
                src="/devboxui_hero_dashboard_1777353892839.png" 
                alt="DevBox UI Dashboard Preview" 
                className="w-full h-auto scale-105 group-hover:scale-100 transition-transform duration-700"
              />
              
              {/* Overlay elements for "Wow" factor */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-indigo-600/80 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform shadow-2xl shadow-indigo-600/50">
                <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 px-6 md:px-12 relative overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-indigo-500 font-black uppercase tracking-[0.3em] text-xs mb-4">Core Engine</h2>
            <h3 className="text-4xl md:text-6xl font-black text-white tracking-tighter">Everything you need to <br /> ship at lightspeed.</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Automated Infra",
                desc: "Full Hetzner Cloud lifecycle management with one-click provisioning and real-time state tracking.",
                icon: (
                  <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                ),
                color: "indigo"
              },
              {
                title: "Pre-loaded IDE",
                desc: "Code-server with Xdebug, Vim, and Oh My Bash (90210 theme) pre-installed and ready to use.",
                icon: (
                  <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                ),
                color: "cyan"
              },
              {
                title: "Zero-Trust Security",
                desc: "Cloudflare Tunnel and Access policies ensure your development box is only accessible by you.",
                icon: (
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                color: "emerald"
              }
            ].map((feature, idx) => (
              <div key={idx} className="group p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-all hover:-translate-y-2">
                <div className={`w-16 h-16 rounded-2xl bg-${feature.color}-500/10 border border-${feature.color}-500/20 flex items-center justify-center mb-8 shadow-inner`}>
                  {feature.icon}
                </div>
                <h4 className="text-2xl font-bold text-white mb-4">{feature.title}</h4>
                <p className="text-slate-400 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Deep Dive */}
      <section id="security" className="py-24 px-6 md:px-12 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-20">
          <div className="lg:w-1/2 space-y-8">
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter">Enterprise security, <br /> simplified for individuals.</h2>
            <div className="space-y-6">
              {[
                "Automatic Cloudflare Tunnel configuration",
                "Instant Access (Zero-Trust) authentication policies",
                "Programmatic Service Token authorization",
                "One-click SSH key rotation and synchronization"
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 text-slate-300">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:w-1/2 relative">
             <div className="absolute -inset-4 bg-emerald-500/10 blur-[80px] rounded-full" />
             <div className="relative p-8 rounded-3xl bg-slate-900/50 border border-emerald-500/20 backdrop-blur-xl">
               <div className="flex items-center justify-between mb-8">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                   </div>
                   <div>
                     <p className="text-white font-bold">Cloudflare Zero-Trust</p>
                     <p className="text-emerald-500 text-xs font-bold uppercase tracking-widest">Active & Secure</p>
                   </div>
                 </div>
                 <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                   Protected
                 </div>
               </div>
               <div className="space-y-3 opacity-50">
                 <div className="h-4 bg-white/5 rounded-full w-3/4" />
                 <div className="h-4 bg-white/5 rounded-full w-full" />
                 <div className="h-4 bg-white/5 rounded-full w-1/2" />
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section id="stack" className="py-32 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
             <h2 className="text-white text-2xl font-bold">Powered by the cutting edge</h2>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-12 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-700">
            {/* Tech Logos Placeholders */}
            {["Next.js", "Cloudflare", "Hetzner", "Docker", "DDEV", "React"].map(tech => (
              <span key={tech} className="text-2xl font-black tracking-tighter text-white">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Changelog Section */}
      <section className="pb-32 px-6 md:px-12">
        <LatestUpdates />
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 px-6 md:px-12 text-center text-slate-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-6 h-6 bg-slate-800 rounded flex items-center justify-center">
            <span className="text-[10px] font-bold text-slate-400">DX</span>
          </div>
          <span className="text-white font-bold">DevBoxUI</span>
        </div>
        <p>© 2024 DevBoxUI. Built with Next.js 15.5 & React 19.</p>
      </footer>
    </div>
  );
}