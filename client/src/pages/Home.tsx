import { useNavigate } from 'react-router-dom';
import { Radio, Headphones } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-8 p-4 bg-[var(--color-brand)]/10 rounded-full border border-[var(--color-brand)]/20 shadow-[0_0_30px_rgba(29,185,84,0.15)]">
        <Radio size={48} className="text-[var(--color-brand)] animate-pulse" />
      </div>
      
      <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-[var(--color-text)]">
        Sync Your Audio. <br className="hidden sm:block" />
        <span className="text-[var(--color-brand)]">Wirelessly.</span>
      </h2>
      
      <p className="text-lg text-[var(--color-text-muted)] max-w-md mx-auto mb-10">
        Turn your phone into a wireless speaker. Stream high-quality audio from your browser directly to your devices with ultra-low latency.
      </p>

      <Card className="items-center">
        <Button size="lg" fullWidth onClick={() => navigate('/host')} className="gap-2">
          <Radio size={20} />
          Start Streaming
        </Button>
        <div className="text-[var(--color-text-muted)] text-sm font-medium w-full text-center relative flex items-center justify-center">
          <span className="bg-white px-4 z-10">OR</span>
          <div className="absolute w-full h-px bg-[#dce8df] top-1/2 left-0 -translate-y-1/2"></div>
        </div>
        <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/join')} className="gap-2">
          <Headphones size={20} />
          Join a Room
        </Button>
      </Card>
    </div>
  );
}
