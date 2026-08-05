import { useNavigate } from 'react-router-dom';
import { Radio, Headphones } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-8 p-4 bg-[#10b981]/10 rounded-full border border-[#10b981]/20">
        <Radio size={48} className="text-[#10b981] animate-pulse" />
      </div>
      
      <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-glow text-white">
        Sync Your Audio. <br className="hidden sm:block" />
        <span className="text-[#10b981]">Wirelessly.</span>
      </h2>
      
      <p className="text-lg text-white/60 max-w-md mx-auto mb-10">
        Turn your phone into a wireless speaker. Stream high-quality audio from your browser directly to your devices with ultra-low latency.
      </p>

      <Card className="items-center">
        <Button size="lg" fullWidth onClick={() => navigate('/host')} className="gap-2">
          <Radio size={20} />
          Start Streaming
        </Button>
        <div className="text-white/40 text-sm font-medium w-full text-center relative flex items-center justify-center">
          <span className="bg-[#000000] px-4 z-10">OR</span>
          <div className="absolute w-full h-[1px] bg-white/10 top-1/2 left-0 -translate-y-1/2"></div>
        </div>
        <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/join')} className="gap-2">
          <Headphones size={20} />
          Join a Room
        </Button>
      </Card>
    </div>
  );
}
