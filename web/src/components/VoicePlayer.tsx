import React, { useState, useRef, useEffect } from 'react';

interface VoicePlayerProps {
  audioUrl: string;
  duration: number;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ audioUrl, duration }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number>(0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoaded);
    
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.pause();
      clearInterval(progressIntervalRef.current);
    };
  }, [audioUrl]);

  const handleLoaded = () => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    clearInterval(progressIntervalRef.current);
  };

  const togglePlayback = async () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      clearInterval(progressIntervalRef.current);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        
        progressIntervalRef.current = window.setInterval(() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }, 100);
      } catch (error) {
        console.error('Playback failed:', error);
      }
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * (audioRef.current.duration || duration);
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const changePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = audioRef.current?.duration 
    ? (currentTime / audioRef.current.duration) * 100 
    : 0;

  return (
    <div className="voice-player">
      <button onClick={togglePlayback} className="play-button">
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      
      <div className="playback-info">
        <div className="waveform-container" onClick={seek}>
          <div className="waveform-progress" style={{ width: `${progress}%` }} />
          <div className="waveform-placeholder">
            {Array.from({ length: 20 }).map((_, i) => (
              <div 
                key={i} 
                className="waveform-bar" 
                style={{ height: `${Math.random() * 80 + 20}%` }}
              />
            ))}
          </div>
        </div>
        
        <div className="time-info">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>
      </div>
      
      <button onClick={changePlaybackRate} className="playback-rate">
        {playbackRate}x
      </button>
    </div>
  );
};
