import { Outlet } from 'react-router-dom';
import { Radio } from 'lucide-react';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[var(--color-background)]">
      {/* Texture overlay */}
      <div className="absolute inset-0 bg-noise pointer-events-none z-0" />
      
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-200 rounded-full blur-[150px] opacity-[0.35] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-lime-100 rounded-full blur-[120px] opacity-[0.5] pointer-events-none z-0" />

      {/* Header */}
      <header className="absolute top-0 w-full p-6 flex justify-center sm:justify-start items-center z-10">
        <div className="flex items-center gap-3 text-[var(--color-text)]">
          <div className="p-2 bg-emerald-100 rounded-xl border border-emerald-200 text-emerald-700">
            <Radio size={24} className="animate-pulse" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">AudioCast</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-4xl mx-auto z-10 flex flex-col items-center pt-20 pb-10">
        <Outlet />
      </main>
    </div>
  );
}
