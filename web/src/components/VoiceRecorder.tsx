import { useState, useRef, useEffect } from 'react';

export interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onRecordingComplete, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopRecording();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 24000,
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to access microphone. Please check permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
  };

  const handleCancel = () => {
    stopRecording();
    onCancel();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder-dialog">
      <div className="dialog-overlay" onClick={handleCancel}>
        <div className="dialog voice-dialog" onClick={(e) => e.stopPropagation()}>
          <h3>Record Voice Message</h3>

          <div className="recorder-content">
            {!isRecording ? (
              <div className="recorder-start">
                <div className="mic-icon">🎤</div>
                <p>Tap to start recording</p>
                <button onClick={startRecording} className="record-btn primary-btn">
                  Start Recording
                </button>
              </div>
            ) : (
              <div className="recorder-active">
                <div className={`recording-indicator ${isPaused ? 'paused' : 'recording'}`}>
                  {isPaused ? '⏸️' : '🔴'}
                </div>
                <div className="recording-time">{formatTime(recordingTime)}</div>
                <div className="recording-waveform">
                  <div className="waveform-bars">
                    {[...Array(20)].map((_, i) => (
                      <div key={i} className="waveform-bar" />
                    ))}
                  </div>
                </div>
                <div className="recording-controls">
                  {isPaused ? (
                    <button onClick={resumeRecording} className="control-btn">
                      ▶️ Resume
                    </button>
                  ) : (
                    <button onClick={pauseRecording} className="control-btn">
                      ⏸️ Pause
                    </button>
                  )}
                  <button onClick={stopRecording} className="control-btn primary-btn">
                    ⏹️ Stop & Send
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="dialog-actions">
            <button onClick={handleCancel} className="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
