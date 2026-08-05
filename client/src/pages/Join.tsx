import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Headphones, Volume2, VolumeX, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { rtcConfiguration } from '../utils/webrtc';

export function Join() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();

  const [roomIdInput, setRoomIdInput] = useState(id || '');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [syncDelay, setSyncDelay] = useState(0);
  const [networkLatency, setNetworkLatency] = useState(0);
  const [autoDelay, setAutoDelay] = useState(0);
  const [targetTotalDelay, setTargetTotalDelay] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);

  // We use an <audio> element in the JSX for better mobile compatibility

  // Update volume
  useEffect(() => {
    const targetVolume = isMuted ? 0 : volume;
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(targetVolume, audioContextRef.current.currentTime, 0.05);
    }
    if (audioRef.current) {
      audioRef.current.volume = targetVolume;
    }
  }, [volume, isMuted]);

  // Update sync delay dynamically
  useEffect(() => {
    if (delayNodeRef.current && audioContextRef.current) {
      delayNodeRef.current.delayTime.setTargetAtTime(
        Math.max(0, (autoDelay + syncDelay) / 1000), 
        audioContextRef.current.currentTime, 
        0.05
      );
    }
  }, [syncDelay, autoDelay]);

  // Auto-sync engine
  useEffect(() => {
    if (!socket || !joined) return;

    let pingInterval: ReturnType<typeof setInterval>;
    const latencySamples: number[] = [];
    
    socket.on('pong-host', ({ clientTime }) => {
      const rtt = Date.now() - clientTime;
      const latency = rtt / 2;
      
      // Moving average over last 5 samples
      latencySamples.push(latency);
      if (latencySamples.length > 5) latencySamples.shift();
      
      const avgLatency = latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length;
      const roundedAvgLatency = Math.round(avgLatency);
      setNetworkLatency(roundedAvgLatency);
      
      // Report latency to host
      socket.emit('report-latency', { roomId: roomIdInput, latency: roundedAvgLatency });
      
      // Calculate how much artificial delay to add to hit targetTotalDelay
      const calculatedDelay = Math.max(0, targetTotalDelay - avgLatency);
      setAutoDelay(Math.round(calculatedDelay));
    });

    socket.on('target-latency', ({ targetLatency }) => {
      setTargetTotalDelay(targetLatency);
    });

    pingInterval = setInterval(() => {
      socket.emit('ping-host', { clientTime: Date.now() });
    }, 2000);

    return () => {
      clearInterval(pingInterval);
      socket.off('pong-host');
      socket.off('target-latency');
    };
  }, [socket, joined, targetTotalDelay, roomIdInput]);

  useEffect(() => {
    if (!socket || !joined) return;

    socket.on('offer', async ({ hostId, offer }) => {
      console.log('Received offer from host');
      const peerConnection = new RTCPeerConnection(rtcConfiguration);
      peerConnectionRef.current = peerConnection;

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', { targetId: hostId, candidate: event.candidate });
        }
      };

      peerConnection.ontrack = (event) => {
        console.log('Received remote track');

        // Force WebRTC jitter buffer to 0ms for the absolute lowest possible latency
        if (event.receiver && 'playoutDelayHint' in event.receiver) {
          try {
            // @ts-ignore
            event.receiver.playoutDelayHint = 0;
          } catch (e) {
            console.error("Could not set playoutDelayHint", e);
          }
        }

        if (event.streams[0]) {
          const stream = event.streams[0];

          try {
            // Web Audio API bypasses the HTML media element buffering for ultra-low latency
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass({ latencyHint: 'interactive' });
            audioContextRef.current = ctx;

            const source = ctx.createMediaStreamSource(stream);

            const delayNode = ctx.createDelay(1.0); // max 1 second delay
            delayNode.delayTime.value = syncDelay / 1000;
            delayNodeRef.current = delayNode;

            const gainNode = ctx.createGain();
            gainNodeRef.current = gainNode;

            gainNode.gain.value = isMuted ? 0 : volume;

            source.connect(delayNode);
            delayNode.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Safari Workaround: WebRTC streams are silent in Web Audio API unless ALSO attached to a playing <audio> element.
            if (audioRef.current) {
              audioRef.current.srcObject = stream;
              audioRef.current.muted = true; // Mute it so we don't hear the delayed double-audio

              audioRef.current.play().then(() => {
                if (ctx.state === 'suspended') {
                  setAutoplayBlocked(true);
                } else {
                  setAutoplayBlocked(false);
                }
              }).catch(e => {
                console.error("Autoplay prevented:", e);
                setAutoplayBlocked(true);
              });
            }
          } catch (err) {
            console.error("Web Audio API failed, falling back to <audio> tag", err);
            if (audioRef.current) {
              audioRef.current.muted = false; // Unmute fallback
              audioRef.current.srcObject = stream;
              audioRef.current.play().then(() => {
                setAutoplayBlocked(false);
              }).catch(e => {
                console.error("Autoplay prevented:", e);
                setAutoplayBlocked(true);
              });
            }
          }
        }
      };

      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        
        // Force high-fidelity stereo audio in WebRTC by modifying the SDP
        if (answer.sdp) {
          answer.sdp = answer.sdp.replace(
            /useinbandfec=1/g,
            'useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=510000'
          );
        }
        
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { hostId, answer });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('host-disconnected', () => {
      setError('Host disconnected');
      cleanupConnection();
      setJoined(false);
    });

    socket.on('room-error', ({ message }) => {
      setError(message);
      setJoined(false);
    });

    return () => {
      socket.off('offer');
      socket.off('ice-candidate');
      socket.off('host-disconnected');
      socket.off('room-error');
    };
  }, [socket, joined]);

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!roomIdInput.trim() || !socket) return;

    setError('');
    const room = roomIdInput.trim().toUpperCase();
    setRoomIdInput(room);

    // Resume AudioContext just in case it's suspended
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.play().catch(() => { });
    }

    // Attempt to guess device
    const getDeviceName = () => {
      const ua = navigator.userAgent;
      if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone/iPad';
      if (/Android/.test(ua)) return 'Android';
      if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
      if (/Windows/.test(ua)) return 'Windows PC';
      return null;
    };

    socket.emit('join-room', { roomId: room, deviceName: getDeviceName() });
    setJoined(true);
  };

  // If ID was in URL, join automatically once socket connects
  useEffect(() => {
    if (id && isConnected && !joined) {
      handleJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isConnected]);

  const cleanupConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
      delayNodeRef.current = null;
    }
  };

  const handleDisconnect = () => {
    cleanupConnection();
    setJoined(false);
    if (id) {
      navigate('/join'); // Clear the URL parameter
    }
  };

  const handlePlayAudio = () => {
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.play().catch(console.error);
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        setAutoplayBlocked(false);
      });
    } else {
      setAutoplayBlocked(false);
    }
  };

  if (!isConnected) {
    return <div className="text-white/60">Connecting to server...</div>;
  }

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-500">
      {!joined ? (
        <Card>
          <div className="mx-auto w-16 h-16 bg-[var(--color-brand)]/10 rounded-full flex items-center justify-center mb-4">
            <Headphones size={32} className="text-[var(--color-brand)]" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-center">Join a Session</h2>
          <p className="text-white/60 mb-6 text-sm text-center">
            Enter the Room ID displayed on the host's screen.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <input
                type="text"
                placeholder="Enter Room ID (e.g., A1B2C3)"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/50 focus:border-[var(--color-brand)]/50 transition-all uppercase"
                required
              />
            </div>
            <Button type="submit" size="lg" fullWidth disabled={!roomIdInput.trim()}>
              Connect
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={() => navigate('/')}>
              Back
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="items-center">
          <audio ref={audioRef} autoPlay playsInline className="hidden" />

          <div className="flex items-center gap-2 text-[var(--color-brand)] font-semibold mb-6 bg-[var(--color-brand)]/10 px-4 py-1.5 rounded-full border border-[var(--color-brand)]/20">
            <CheckCircle2 size={16} />
            Connected
          </div>

          {autoplayBlocked && (
            <Button onClick={handlePlayAudio} className="mb-6 shadow-[0_0_20px_rgba(16,185,129,0.5)]">
              Tap to Play Audio
            </Button>
          )}

          <div className="w-32 h-32 rounded-full border-4 border-[var(--color-brand)]/30 flex items-center justify-center mb-8 relative">
            {/* Visualizer animation rings */}
            <div className="absolute inset-0 rounded-full animate-pulse-ring border-2 border-[var(--color-brand)]/50"></div>
            <div className="absolute inset-0 rounded-full animate-pulse-ring border-2 border-[var(--color-brand)]/30" style={{ animationDelay: '0.5s' }}></div>

            <Headphones size={48} className="text-[var(--color-brand)]" />
          </div>

          <div className="w-full bg-black/40 border border-white/5 rounded-xl p-4 mb-6">
            <p className="text-[10px] text-white/50 mb-3 font-semibold tracking-wider uppercase">Volume</p>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-white/70 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="flex-1 accent-[var(--color-brand)] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="w-full h-px bg-white/10 my-4"></div>

            <div className="flex justify-between items-center text-[10px] text-white/50 mb-3 font-semibold tracking-wider uppercase">
              <span>Auto-Sync Calibration</span>
              <span className="text-[var(--color-brand)]">Target: {targetTotalDelay}ms</span>
            </div>
            
            <div className="bg-black/30 rounded-lg p-3 mb-4 space-y-2 border border-white/5">
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Network Latency</span>
                <span className="font-mono text-white/80">{networkLatency}ms</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Auto-Delay Added</span>
                <span className="font-mono text-white/80">+{autoDelay}ms</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <span className="text-white/70 text-xs font-mono w-10 text-right">{syncDelay > 0 ? '+' : ''}{syncDelay}ms</span>
              <input
                type="range"
                min="-100"
                max="100"
                step="5"
                value={syncDelay}
                onChange={(e) => setSyncDelay(parseFloat(e.target.value))}
                className="flex-1 accent-[var(--color-brand)] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <p className="text-[10px] text-white/40 leading-relaxed mt-2 text-center">
              Fine-tune hardware latency (e.g. for Bluetooth audio)
            </p>
          </div>

          <div className="text-center mb-6">
            <p className="text-sm text-white/50">Room ID</p>
            <p className="font-mono text-lg tracking-widest">{roomIdInput}</p>
          </div>

          <Button variant="danger" fullWidth onClick={handleDisconnect} className="gap-2">
            <LogOut size={18} />
            Disconnect
          </Button>
        </Card>
      )}
    </div>
  );
}
