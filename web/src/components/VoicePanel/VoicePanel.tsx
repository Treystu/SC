/**
 * Voice Panel Component
 * Unified interface for voice communication, STT, and audio feedback
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import './VoicePanel.css';

export type VoicePanelMode = 'idle' | 'recording' | 'processing' | 'playing' | 'error';

export interface VoicePanelProps {
  /** Called when recording starts */
  onRecordingStart?: () => void;
  /** Called when recording stops with audio blob */
  onRecordingStop?: (audioBlob: Blob) => void;
  /** Called when STT result is available */
  onTranscription?: (text: string) => void;
  /** Called when there's an error */
  onError?: (error: Error) => void;
  /** Enable push-to-talk mode */
  pushToTalk?: boolean;
  /** Maximum recording duration in seconds */
  maxDuration?: number;
  /** Show audio visualization */
  showVisualization?: boolean;
  /** Custom class name */
  className?: string;
  /** Disable the panel */
  disabled?: boolean;
  /** External transcription text to display */
  transcription?: string;
}

export function VoicePanel({
  onRecordingStart,
  onRecordingStop,
  onTranscription,
  onError,
  pushToTalk = false,
  maxDuration = 60,
  showVisualization = true,
  className = '',
  disabled = false,
  transcription = ''
}: VoicePanelProps) {
  const [mode, setMode] = useState<VoicePanelMode>('idle');
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const startVisualization = useCallback(() => {
    if (!analyserRef.current || !showVisualization) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, [showVisualization]);

  const startRecording = useCallback(async () => {
    if (disabled || mode !== 'idle') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        onRecordingStop?.(blob);
        chunksRef.current = [];
      };

      mediaRecorder.start(100); // Capture in 100ms chunks

      setMode('recording');
      setDuration(0);
      onRecordingStart?.();

      // Start duration timer
      durationTimerRef.current = window.setInterval(() => {
        setDuration(d => {
          if (d >= maxDuration) {
            stopRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);

      // Start visualization
      startVisualization();

    } catch (error) {
      setMode('error');
      onError?.(error as Error);
    }
  }, [disabled, mode, maxDuration, onRecordingStart, onRecordingStop, onError, startVisualization]);

  const stopRecording = useCallback(() => {
    if (mode !== 'recording') return;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setMode('idle');
    setAudioLevel(0);
  }, [mode]);

  const toggleRecording = useCallback(() => {
    if (mode === 'idle') {
      startRecording();
    } else if (mode === 'recording') {
      stopRecording();
    }
  }, [mode, startRecording, stopRecording]);

  // Push-to-talk handlers
  const handleMouseDown = useCallback(() => {
    if (pushToTalk) {
      startRecording();
    }
  }, [pushToTalk, startRecording]);

  const handleMouseUp = useCallback(() => {
    if (pushToTalk && mode === 'recording') {
      stopRecording();
    }
  }, [pushToTalk, mode, stopRecording]);

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getModeIcon = (): string => {
    switch (mode) {
      case 'idle': return '🎤';
      case 'recording': return '⏺️';
      case 'processing': return '⏳';
      case 'playing': return '🔊';
      case 'error': return '❌';
      default: return '🎤';
    }
  };

  const getModeLabel = (): string => {
    switch (mode) {
      case 'idle': return pushToTalk ? 'Hold to talk' : 'Tap to record';
      case 'recording': return 'Recording...';
      case 'processing': return 'Processing...';
      case 'playing': return 'Playing...';
      case 'error': return 'Error occurred';
      default: return '';
    }
  };

  return (
    <div className={`voice-panel ${className} ${mode} ${disabled ? 'disabled' : ''}`}>
      {/* Visualization */}
      {showVisualization && (
        <div className="voice-visualization">
          <div 
            className="voice-level" 
            style={{ transform: `scaleY(${0.2 + audioLevel * 0.8})` }}
          />
        </div>
      )}

      {/* Main button */}
      <button
        className={`voice-button ${mode}`}
        onClick={pushToTalk ? undefined : toggleRecording}
        onMouseDown={pushToTalk ? handleMouseDown : undefined}
        onMouseUp={pushToTalk ? handleMouseUp : undefined}
        onMouseLeave={pushToTalk ? handleMouseUp : undefined}
        onTouchStart={pushToTalk ? handleMouseDown : undefined}
        onTouchEnd={pushToTalk ? handleMouseUp : undefined}
        disabled={disabled || mode === 'processing'}
        aria-label={getModeLabel()}
      >
        <span className="voice-icon">{getModeIcon()}</span>
      </button>

      {/* Status */}
      <div className="voice-status">
        <span className="voice-mode-label">{getModeLabel()}</span>
        {mode === 'recording' && (
          <span className="voice-duration">{formatDuration(duration)}</span>
        )}
        {mode === 'recording' && maxDuration && (
          <span className="voice-max-duration">/ {formatDuration(maxDuration)}</span>
        )}
      </div>

      {/* Transcription display */}
      {transcription && (
        <div className="voice-transcription">
          <p>{transcription}</p>
        </div>
      )}
    </div>
  );
}

export default VoicePanel;
