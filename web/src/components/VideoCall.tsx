import React, { useEffect, useRef, useState } from 'react';

interface VideoCallProps {
  peerId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
}

export const VideoCall: React.FC<VideoCallProps> = ({
  peerId,
  localStream,
  remoteStream,
  onEndCall,
  onToggleAudio,
  onToggleVideo
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleToggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled);
    onToggleAudio();
  };

  const handleToggleVideo = () => {
    setIsVideoEnabled(!isVideoEnabled);
    onToggleVideo();
  };

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  if (isMinimized) {
    return (
      <div className="video-call-minimized" onClick={handleToggleMinimize}>
        <div className="minimized-content">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="minimized-video"
          />
          <span className="minimized-label">Call with {peerId}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="video-call-container">
      <div className="video-streams">
        <div className="remote-video-wrapper">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="remote-video"
          />
          <div className="peer-label">{peerId}</div>
        </div>
        
        <div className="local-video-wrapper">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="local-video"
          />
          <div className="local-label">You</div>
        </div>
      </div>

      <div className="video-controls">
        <button
          onClick={handleToggleAudio}
          className={`control-button ${!isAudioEnabled ? 'disabled' : ''}`}
          title={isAudioEnabled ? 'Mute' : 'Unmute'}
        >
          {isAudioEnabled ? '🎤' : '🔇'}
        </button>

        <button
          onClick={handleToggleVideo}
          className={`control-button ${!isVideoEnabled ? 'disabled' : ''}`}
          title={isVideoEnabled ? 'Stop video' : 'Start video'}
        >
          {isVideoEnabled ? '📹' : '📷'}
        </button>

        <button
          onClick={handleToggleMinimize}
          className="control-button"
          title="Minimize"
        >
          ⬇️
        </button>

        <button
          onClick={onEndCall}
          className="control-button end-call"
          title="End call"
        >
          📞
        </button>
      </div>

      <style>{`
        .video-call-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: #000;
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .video-streams {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .remote-video-wrapper {
          width: 100%;
          height: 100%;
          position: relative;
        }

        .remote-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #1a1a1a;
        }

        .local-video-wrapper {
          position: absolute;
          bottom: 80px;
          right: 20px;
          width: 200px;
          height: 150px;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #fff;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        }

        .local-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1); /* Mirror local video */
        }

        .peer-label,
        .local-label {
          position: absolute;
          bottom: 8px;
          left: 8px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .video-controls {
          display: flex;
          justify-content: center;
          gap: 16px;
          padding: 20px;
          background: rgba(0, 0, 0, 0.8);
        }

        .control-button {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          font-size: 24px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-button:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.1);
        }

        .control-button.disabled {
          background: rgba(255, 0, 0, 0.5);
        }

        .control-button.end-call {
          background: #dc3545;
        }

        .control-button.end-call:hover {
          background: #c82333;
        }

        .video-call-minimized {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 240px;
          height: 180px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          cursor: pointer;
          z-index: 1000;
          background: #000;
        }

        .minimized-content {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .minimized-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .minimized-label {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        @media (max-width: 768px) {
          .local-video-wrapper {
            width: 120px;
            height: 90px;
            bottom: 100px;
          }

          .control-button {
            width: 48px;
            height: 48px;
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
};
