import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC, { type IAgoraRTCClient, type ILocalVideoTrack, type ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { AGORA_APP_ID } from '../../constants/agora';
import Button from '../ui/Button';
import { PhoneOff, Video } from 'lucide-react';

export interface LiveConsultationAgoraProps {
  chatId: string;
  patientName: string;
  onClose: () => void;
}

const LiveConsultationAgora: React.FC<LiveConsultationAgoraProps> = ({ chatId, patientName, onClose }) => {
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const tracksRef = useRef<(ILocalAudioTrack | ILocalVideoTrack)[] | null>(null);

  const [phase, setPhase] = useState<'joining' | 'live' | 'error'>('joining');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteJoined, setRemoteJoined] = useState(false);

  useEffect(() => {
    let destroyed = false;

    const run = async () => {
      try {
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        await client.join(AGORA_APP_ID, chatId, null, null);

        if (destroyed) return;

        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        tracksRef.current = tracks;

        if (localRef.current) {
          tracks[1]?.play(localRef.current);
        }

        await client.publish(tracks);

        client.on('user-published', async (user, mediaType) => {
          if (destroyed) return;
          try {
            await client.subscribe(user, mediaType);
            if (mediaType === 'video' && user.videoTrack && remoteRef.current) {
              user.videoTrack.play(remoteRef.current);
              setRemoteJoined(true);
            }
            if (mediaType === 'audio' && user.audioTrack) {
              user.audioTrack.play();
            }
          } catch (e) {
            console.error('Subscribe error', e);
          }
        });

        client.on('user-unpublished', () => {
          setRemoteJoined(false);
        });

        if (!destroyed) setPhase('live');
      } catch (e) {
        console.error('Agora join error', e);
        if (!destroyed) {
          setPhase('error');
          setErrorMessage(e instanceof Error ? e.message : 'Could not start camera or connect.');
        }
      }
    };

    run();

    return () => {
      destroyed = true;
      const client = clientRef.current;
      const tracks = tracksRef.current;
      clientRef.current = null;
      tracksRef.current = null;

      (async () => {
        try {
          if (tracks?.length) {
            tracks.forEach((t) => t.close());
          }
          if (client) {
            client.removeAllListeners();
            await client.leave();
          }
        } catch (e) {
          console.warn('Agora cleanup', e);
        }
      })();
    };
  }, [chatId]);

  const endCall = async () => {
    try {
      await updateDoc(doc(db, 'Consultations', chatId), {
        status: 'ended',
        endTimestamp: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Could not mark consultation ended', e);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Video className="h-5 w-5 shrink-0 text-teal-400" />
          <div className="min-w-0">
            <p className="font-semibold truncate">Video call</p>
            <p className="text-xs text-white/60 truncate">{patientName}</p>
          </div>
        </div>
        <Button
          type="button"
          onClick={endCall}
          className="shrink-0 bg-red-600 hover:bg-red-700 text-white border-0 inline-flex items-center gap-2"
        >
          <PhoneOff className="h-4 w-4" />
          End call
        </Button>
      </header>

      <div className="relative flex-1 flex flex-col lg:flex-row">
        <div className="relative flex-1 min-h-[50vh] bg-neutral-900">
          <div ref={remoteRef} className="absolute inset-0 flex items-center justify-center" />
          {!remoteJoined && phase === 'live' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-center text-white/70 px-4">Waiting for the other person to join the call…</p>
            </div>
          )}
          {phase === 'joining' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white/80">Connecting… If your browser asks, allow camera and microphone.</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div>
                <p className="text-red-300 font-medium">We couldn’t start the call</p>
                <p className="text-sm text-white/60 mt-2">{errorMessage}</p>
                <Button type="button" className="mt-4" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 p-3 bg-black/80">
          <p className="text-xs text-white/50 mb-2">Your camera</p>
          <div
            ref={localRef}
            className="aspect-video w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-neutral-800 ring-1 ring-white/10"
          />
        </div>
      </div>
    </div>
  );
};

export default LiveConsultationAgora;
