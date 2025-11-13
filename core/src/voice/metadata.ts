/**
 * Metadata for voice messages
 */
export interface VoiceMessageMetadata {
  /** Unique identifier for the voice message */
  id: string;
  
  /** Duration in milliseconds */
  duration: number;
  
  /** Audio sample rate in Hz */
  sampleRate: number;
  
  /** Bitrate in bits per second */
  bitrate: number;
  
  /** Audio codec used */
  codec: 'opus' | 'aac';
  
  /** Waveform amplitude samples for visualization (0-100) */
  waveform?: number[];
  
  /** Timestamp when the message was recorded */
  timestamp: number;
  
  /** ID of the sender */
  senderId: string;
  
  /** Size of the audio file in bytes */
  size: number;
}

/**
 * Create voice message metadata
 */
export function createVoiceMessageMetadata(
  id: string,
  duration: number,
  sampleRate: number,
  bitrate: number,
  codec: 'opus' | 'aac',
  senderId: string,
  size: number,
  waveform?: number[]
): VoiceMessageMetadata {
  return {
    id,
    duration,
    sampleRate,
    bitrate,
    codec,
    waveform,
    timestamp: Date.now(),
    senderId,
    size
  };
}

/**
 * Format duration for display (mm:ss)
 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
