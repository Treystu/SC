import React, { useRef, useEffect, useState } from 'react';

interface VideoCallUIProps {
  peerId: string;
  onEndCall: () => void;
}

export function VideoCallUI({ peerId, onEndCall }: VideoCallUIProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    // Initialize local media stream
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(console.error);

    return () => {
      // Cleanup streams
      if (localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleMute = () => {
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <div className="video-call-ui">
      <div className="remote-video-container">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="remote-video"
        />
      </div>

      <div className="local-video-container">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="local-video"
        />
      </div>

      <div className="call-controls">
        <button onClick={toggleMute} className={isMuted ? 'muted' : ''}>
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button onClick={toggleVideo} className={isVideoOff ? 'video-off' : ''}>
          {isVideoOff ? '📹' : '📷'}
        </button>
        <button onClick={onEndCall} className="end-call">
          📞
        </button>
      </div>
    </div>
  );
}
