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
  const [clientCount, setClientCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [hostDelay, setHostDelay] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const originalStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);

  // Update host delay dynamically
  useEffect(() => {
    if (delayNodeRef.current && audioContextRef.current) {
      delayNodeRef.current.delayTime.setTargetAtTime(hostDelay / 1000, audioContextRef.current.currentTime, 0.05);
    }
  }, [hostDelay]);

  // Handle client joining and WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('client-joined', async ({ clientId }) => {
      console.log(`Client joined: ${clientId}`);
      setClientCount((prev) => prev + 1);

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
      setClientCount((prev) => Math.max(0, prev - 1));
      const peerConnection = peerConnectionsRef.current.get(clientId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(clientId);
      }
    });

    return () => {
      socket.off('client-joined');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('client-disconnected');
    };
  }, [socket]);

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
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No audio track found. Make sure to share a tab and enable "Share tab audio".');
      }

      // We only need the audio track
      const audioStream = new MediaStream([audioTracks[0]]);
      originalStreamRef.current = stream; // Keep original stream to stop it later

      // Route through Web Audio API to allow Host-side delay before sending to peers
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(audioStream);
      const delayNode = ctx.createDelay(1.0); // max 1 second delay
      delayNode.delayTime.value = hostDelay / 1000;
      delayNodeRef.current = delayNode;

      const dest = ctx.createMediaStreamDestination();
      
      source.connect(delayNode);
      delayNode.connect(dest);

      streamRef.current = dest.stream;
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
    if (originalStreamRef.current) {
      originalStreamRef.current.getTracks().forEach((track) => track.stop());
      originalStreamRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      delayNodeRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    
    setIsStreaming(false);
    setRoomId('');
    setClientCount(0);
    
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
          <div className="mx-auto w-16 h-16 bg-[#10b981]/10 rounded-full flex items-center justify-center mb-4">
            <Radio size={32} className="text-[#10b981]" />
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
        <Card className="items-center border-[#10b981]/30">
          <div className="flex items-center gap-2 text-[#10b981] font-semibold mb-2 bg-[#10b981]/10 px-4 py-1.5 rounded-full border border-[#10b981]/20">
            <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
            Live Streaming
          </div>
          
          <h2 className="text-4xl font-bold tracking-wider mb-8 text-glow">{roomId}</h2>

          <div className="bg-white p-4 rounded-xl mb-6 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <QRCodeSVG value={shareUrl} size={180} fgColor="#000000" />
          </div>

          <div className="w-full bg-black/40 border border-white/5 rounded-xl p-4 mb-6">
            <p className="text-[10px] text-white/50 mb-3 font-semibold tracking-wider uppercase">Global Stream Delay</p>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white/70 text-xs font-mono w-10">{hostDelay}ms</span>
              <input
                type="range"
                min="0"
                max="500"
                step="5"
                value={hostDelay}
                onChange={(e) => setHostDelay(parseFloat(e.target.value))}
                className="flex-1 accent-[#10b981] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <p className="text-[10px] text-white/40 leading-relaxed mt-2">
              Add a delay to the audio stream sent to ALL connected phones. Use this if the phones are playing ahead of a connected PA system.
            </p>
          </div>

          <div className="flex items-center gap-2 text-white/70 bg-white/5 px-4 py-2 rounded-lg mb-6 w-full justify-between border border-white/10">
            <div className="flex items-center gap-2">
              <Users size={18} />
              <span>{clientCount} listener{clientCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="text-xs font-mono bg-black px-2 py-1 rounded text-white/50">
              ID: {roomId}
            </div>
          </div>

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
