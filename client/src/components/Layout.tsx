import { Outlet } from 'react-router-dom';
import { Radio } from 'lucide-react';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#10b981] rounded-full blur-[150px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-[#059669] rounded-full blur-[120px] opacity-10 pointer-events-none" />

      {/* Header */}
      <header className="absolute top-0 w-full p-6 flex justify-center sm:justify-start items-center z-10">
        <div className="flex items-center gap-3 text-white/90">
          <div className="p-2 bg-[#10b981]/20 rounded-xl border border-[#10b981]/30 text-[#10b981]">
            <Radio size={24} className="animate-pulse" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">AudioSync</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-4xl mx-auto z-10 flex flex-col items-center pt-20 pb-10">
        <Outlet />
      </main>
    </div>
  );
}
