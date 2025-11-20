import { useState, useEffect, useRef } from 'react';

interface Participant {
  id: string;
  name: string;
  stream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  speaking: boolean;
}

interface GroupVideoCallProps {
  roomId: string;
  onLeave: () => void;
}

export const GroupVideoCall: React.FC<GroupVideoCallProps> = ({ roomId, onLeave }) => {
  const [participants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'speaker' | 'sidebar'>('grid');
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    initializeLocalStream();
    return () => {
      cleanup();
    };
  }, []);

  const initializeLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Set up audio level monitoring for active speaker detection
      setupAudioLevelMonitoring(stream);
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const setupAudioLevelMonitoring = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    microphone.connect(analyser);

    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      
      // Update speaking status based on audio level
      if (average > 30) {
        // Local user is speaking
        setActiveSpeaker('local');
      }

      requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen sharing
      if (screenShareRef.current) {
        screenShareRef.current.getTracks().forEach(track => track.stop());
        screenShareRef.current = null;
      }
      setScreenSharing(false);
    } else {
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        screenShareRef.current = screenStream;
        setScreenSharing(true);

        // Handle screen share stop
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
          setScreenSharing(false);
          screenShareRef.current = null;
        });
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    }
  };

  const switchCamera = async () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      const currentFacingMode = videoTrack.getSettings().facingMode;
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode },
          audio: false,
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        localStream.removeTrack(videoTrack);
        localStream.addTrack(newVideoTrack);
        videoTrack.stop();

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      } catch (error) {
        console.error('Error switching camera:', error);
      }
    }
  };

  const leaveCall = () => {
    cleanup();
    onLeave();
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (screenShareRef.current) {
      screenShareRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const renderParticipantGrid = () => {
    const allParticipants = [
      { id: 'local', name: 'You', stream: localStream, audioEnabled, videoEnabled, speaking: activeSpeaker === 'local' },
      ...participants,
    ];

    const gridCols = Math.ceil(Math.sqrt(allParticipants.length));
    const gridRows = Math.ceil(allParticipants.length / gridCols);

    return (
      <div
        className="participant-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: '8px',
          height: '100%',
          padding: '8px',
        }}
      >
        {allParticipants.map((participant) => (
          <ParticipantVideo
            key={participant.id}
            participant={participant}
            isLocal={participant.id === 'local'}
            videoRef={participant.id === 'local' ? localVideoRef : undefined}
          />
        ))}
      </div>
    );
  };

  const renderSpeakerView = () => {
    const speaker: Participant | undefined = participants.find((p: Participant) => p.id === activeSpeaker) || participants[0];
    const others: Participant[] = participants.filter((p: Participant) => p.id !== activeSpeaker);

    return (
      <div className="speaker-layout" style={{ display: 'flex', height: '100%' }}>
        <div className="main-speaker" style={{ flex: 1, padding: '8px' }}>
          {speaker && <ParticipantVideo participant={speaker} isLocal={false} />}
        </div>
        <div className="sidebar-participants" style={{ width: '200px', overflowY: 'auto', padding: '8px' }}>
          <ParticipantVideo
            participant={{ id: 'local', name: 'You', stream: localStream, audioEnabled, videoEnabled, speaking: activeSpeaker === 'local' }}
            isLocal={true}
            videoRef={localVideoRef}
          />
          {others.map((participant: Participant) => (
            <ParticipantVideo key={participant.id} participant={participant} isLocal={false} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="group-video-call" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1a1a1a' }}>
      {/* Header */}
      <div className="call-header" style={{ padding: '16px', backgroundColor: '#2a2a2a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Group Call - Room {roomId}</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#aaa' }}>
            {participants.length + 1} participants
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setLayout('grid')}
            style={{ padding: '8px 16px', backgroundColor: layout === 'grid' ? '#4CAF50' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Grid
          </button>
          <button
            onClick={() => setLayout('speaker')}
            style={{ padding: '8px 16px', backgroundColor: layout === 'speaker' ? '#4CAF50' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Speaker
          </button>
        </div>
      </div>

      {/* Video Area */}
      <div className="video-area" style={{ flex: 1, overflow: 'hidden' }}>
        {layout === 'grid' ? renderParticipantGrid() : renderSpeakerView()}
      </div>

      {/* Controls */}
      <div className="call-controls" style={{ padding: '16px', backgroundColor: '#2a2a2a', display: 'flex', justifyContent: 'center', gap: '16px' }}>
        <button
          onClick={toggleAudio}
          style={{ padding: '12px 24px', backgroundColor: audioEnabled ? '#4CAF50' : '#f44336', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontSize: '16px' }}
        >
          {audioEnabled ? '🎤 Mute' : '🔇 Unmute'}
        </button>
        <button
          onClick={toggleVideo}
          style={{ padding: '12px 24px', backgroundColor: videoEnabled ? '#4CAF50' : '#f44336', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontSize: '16px' }}
        >
          {videoEnabled ? '📹 Stop Video' : '📹 Start Video'}
        </button>
        <button
          onClick={toggleScreenShare}
          style={{ padding: '12px 24px', backgroundColor: screenSharing ? '#4CAF50' : '#555', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontSize: '16px' }}
        >
          {screenSharing ? '🖥️ Stop Sharing' : '🖥️ Share Screen'}
        </button>
        <button
          onClick={switchCamera}
          style={{ padding: '12px 24px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontSize: '16px' }}
        >
          🔄 Switch Camera
        </button>
        <button
          onClick={leaveCall}
          style={{ padding: '12px 24px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontSize: '16px' }}
        >
          📞 Leave Call
        </button>
      </div>
    </div>
  );
};

interface ParticipantVideoProps {
  participant: Participant;
  isLocal: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

const ParticipantVideo: React.FC<ParticipantVideoProps> = ({ participant, isLocal, videoRef }) => {
  const defaultVideoRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef || defaultVideoRef;

  useEffect(() => {
    if (ref.current && participant.stream && !isLocal) {
      ref.current.srcObject = participant.stream;
    }
  }, [participant.stream, isLocal, ref]);

  return (
    <div
      className="participant-video"
      style={{
        position: 'relative',
        backgroundColor: '#000',
        borderRadius: '8px',
        overflow: 'hidden',
        border: participant.speaking ? '3px solid #4CAF50' : '1px solid #555',
      }}
    >
      {participant.videoEnabled ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={isLocal}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '48px',
            color: '#fff',
            backgroundColor: '#333',
          }}
        >
          👤
        </div>
      )}
      <div
        className="participant-info"
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          right: '8px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{participant.name}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {!participant.audioEnabled && <span>🔇</span>}
          {!participant.videoEnabled && <span>📹</span>}
        </div>
      </div>
    </div>
  );
};
