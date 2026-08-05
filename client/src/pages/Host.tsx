import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, StopCircle, Radio, Users, AlertCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { rtcConfiguration } from '../utils/webrtc';

export function Host() {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const [roomId, setRoomId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string>('');
  
  interface ConnectedClient {
    id: string;
    name: string;
    joinedAt: Date;
    latency: number;
  }
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
  const [targetLatency, setTargetLatency] = useState(0);
  const clientCounterRef = useRef(1);
  
  const [copied, setCopied] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Handle client joining and WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('client-joined', async ({ clientId, deviceName }) => {
      console.log(`Client joined: ${clientId} as ${deviceName}`);
      const clientName = deviceName || `Listener ${clientCounterRef.current++}`;
      setConnectedClients((prev) => [...prev, { id: clientId, name: clientName, joinedAt: new Date(), latency: 0 }]);

      if (!streamRef.current) return;

      const peerConnection = new RTCPeerConnection(rtcConfiguration);
      peerConnectionsRef.current.set(clientId, peerConnection);

      // Add audio track to peer connection
      streamRef.current.getTracks().forEach((track) => {
        if (streamRef.current) {
          peerConnection.addTrack(track, streamRef.current);
        }
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', { targetId: clientId, candidate: event.candidate });
        }
      };

      try {
        const offer = await peerConnection.createOffer();
        
        // Force high-fidelity stereo audio in WebRTC by modifying the SDP
        if (offer.sdp) {
          offer.sdp = offer.sdp.replace(
            /useinbandfec=1/g,
            'useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=510000'
          );
        }
        
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { clientId, offer });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    });

    socket.on('answer', async ({ clientId, answer }) => {
      const peerConnection = peerConnectionsRef.current.get(clientId);
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      }
    });

    socket.on('ice-candidate', async ({ senderId, candidate }) => {
      const peerConnection = peerConnectionsRef.current.get(senderId);
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('client-disconnected', ({ clientId }) => {
      console.log(`Client disconnected: ${clientId}`);
      setConnectedClients((prev) => prev.filter((c) => c.id !== clientId));
      const peerConnection = peerConnectionsRef.current.get(clientId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(clientId);
      }
    });

    socket.on('client-latency', ({ clientId, latency }) => {
      setConnectedClients((prev) => 
        prev.map(c => c.id === clientId ? { ...c, latency } : c)
      );
    });

    return () => {
      socket.off('client-joined');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('client-disconnected');
      socket.off('client-latency');
    };
  }, [socket]);

  // Dynamically calculate and broadcast target latency
  useEffect(() => {
    if (connectedClients.length > 0 && isStreaming) {
      const maxLatency = Math.max(...connectedClients.map(c => c.latency));
      // Add 20ms safety buffer, minimum 50ms
      const newTarget = Math.max(50, maxLatency + 20);
      setTargetLatency(newTarget);
      
      if (socket && roomId) {
        socket.emit("broadcast-target-latency", { roomId, targetLatency: newTarget });
      }
    }
  }, [connectedClients, isStreaming, roomId, socket]);

  const startStreaming = async () => {
    setError('');
    try {
      // Prompt user to share tab audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No audio track found. Make sure to share a tab and enable "Share tab audio".');
      }

      // We only need the audio track
      const audioStream = new MediaStream([audioTracks[0]]);
      streamRef.current = audioStream;
      setIsStreaming(true);

      // Stop stream if user stops sharing via browser UI
      audioTracks[0].onended = () => {
        stopStreaming();
      };

      // Generate a random 6-character room ID
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomId(newRoomId);

      // Tell signaling server to create room
      if (socket) {
        socket.emit('create-room', { roomId: newRoomId });
      }

    } catch (err: any) {
      console.error('Error capturing stream:', err);
      setError(err.message || 'Failed to start screen capture. Please try again.');
    }
  };

  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    
    setIsStreaming(false);
    setRoomId('');
    setConnectedClients([]);
    clientCounterRef.current = 1; // Reset counter when stream stops
    
    // navigate away or just reset state
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  let shareHostname = window.location.hostname;
  if (shareHostname === 'localhost' || shareHostname === '127.0.0.1') {
    // @ts-ignore
    if (typeof __LOCAL_IP__ !== 'undefined') {
      // @ts-ignore
      shareHostname = __LOCAL_IP__;
    }
  }
  const shareUrl = `${window.location.protocol}//${shareHostname}${window.location.port ? `:${window.location.port}` : ''}/room/${roomId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected) {
    return <div className="text-white/60">Connecting to server...</div>;
  }

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-500">
      {!isStreaming ? (
        <Card className="text-center">
          <div className="mx-auto w-16 h-16 bg-[var(--color-brand)]/10 rounded-full flex items-center justify-center mb-4">
            <Radio size={32} className="text-[var(--color-brand)]" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Host a Session</h2>
          <p className="text-white/60 mb-6 text-sm">
            Share a browser tab and select "Share tab audio" to start broadcasting.
          </p>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm flex items-start gap-2 text-left">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button size="lg" fullWidth onClick={startStreaming}>
            Start Streaming
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/')} className="mt-2">
            Back
          </Button>
        </Card>
      ) : (
        <Card className="items-center border-[var(--color-brand)]/30">
          <div className="flex items-center gap-2 text-[var(--color-brand)] font-semibold mb-2 bg-[var(--color-brand)]/10 px-4 py-1.5 rounded-full border border-[var(--color-brand)]/20">
            <div className="w-2 h-2 rounded-full bg-[var(--color-brand)] animate-pulse" />
            Live Streaming
          </div>
          
          <h2 className="text-4xl font-bold tracking-wider mb-8 text-glow">{roomId}</h2>

          <div className="bg-white p-4 rounded-xl mb-6 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <QRCodeSVG value={shareUrl} size={180} fgColor="#000000" />
          </div>

          <div className="flex items-center gap-2 text-white/70 bg-white/5 px-4 py-2 rounded-lg mb-6 w-full justify-between border border-white/10">
            <div className="flex items-center gap-2">
              <Users size={18} />
              <span>{connectedClients.length} listener{connectedClients.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="text-xs font-mono bg-[var(--color-brand)]/20 text-[var(--color-brand)] px-2 py-1 rounded border border-[var(--color-brand)]/30">
              Target Sync: {targetLatency}ms
            </div>
          </div>

          {connectedClients.length > 0 && (
            <div className="w-full bg-black/40 border border-white/5 rounded-xl p-4 mb-6 text-left">
              <h3 className="text-[10px] text-white/50 mb-3 font-semibold tracking-wider uppercase flex items-center justify-between">
                <span>Connected Listeners</span>
                <span>{connectedClients.length}</span>
              </h3>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {connectedClients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] animate-pulse"></div>
                      <span className="text-sm font-medium text-white/90">{client.name}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-white/40">
                        {client.joinedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-[var(--color-brand)] font-mono">
                        {client.latency}ms ping
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <Button variant="secondary" className="flex-1 gap-2" onClick={handleCopyLink}>
              <Copy size={18} />
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            <Button variant="danger" className="flex-1 gap-2" onClick={stopStreaming}>
              <StopCircle size={18} />
              Stop
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
