/**
 * Opus codec configuration for voice messages
 */
export interface OpusConfig {
  /** Audio sample rate in Hz */
  sampleRate: 48000 | 24000 | 16000 | 12000 | 8000;
  
  /** Number of audio channels (1 = mono, 2 = stereo) */
  channels: 1 | 2;
  
  /** Target bitrate in bits per second (6000-510000) */
  bitrate: number;
  
  /** Computational complexity (0-10, higher = better quality but more CPU) */
  complexity: number;
  
  /** Frame size in milliseconds */
  frameSize: 2.5 | 5 | 10 | 20 | 40 | 60;
  
  /** Application type for optimization */
  application: 'voip' | 'audio' | 'lowdelay';
}

/**
 * Default Opus configuration optimized for VoIP
 */
export const defaultVoIPConfig: OpusConfig = {
  sampleRate: 16000,
  channels: 1,
  bitrate: 24000,
  complexity: 5,
  frameSize: 20,
  application: 'voip'
};

/**
 * High quality Opus configuration for music/audio
 */
export const highQualityConfig: OpusConfig = {
  sampleRate: 48000,
  channels: 2,
  bitrate: 128000,
  complexity: 10,
  frameSize: 20,
  application: 'audio'
};

/**
 * Low latency Opus configuration for real-time communication
 */
export const lowLatencyConfig: OpusConfig = {
  sampleRate: 16000,
  channels: 1,
  bitrate: 16000,
  complexity: 3,
  frameSize: 10,
  application: 'lowdelay'
};
