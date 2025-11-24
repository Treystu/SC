import { useRef, useState } from 'react';

export function ScreenShare() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
      }

      setStream(screenStream);
      setIsSharing(true);

      // Handle user stopping share via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  };

  const stopScreenShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsSharing(false);
    }
  };

  return (
    <div className="screen-share">
      {!isSharing ? (
        <button onClick={startScreenShare} className="start-share">
          🖥️ Share Screen
        </button>
      ) : (
        <div className="sharing-container">
          <video ref={videoRef} autoPlay playsInline className="shared-screen" />
          <button onClick={stopScreenShare} className="stop-share">
            ⏹️ Stop Sharing
          </button>
        </div>
      )}
    </div>
  );
}
