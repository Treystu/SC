/**
 * Adaptive Quality Management
 * Dynamically adjusts media quality based on available bandwidth
 */

export interface QualitySettings {
  video: {
    enabled: boolean;
    resolution: '1080p' | '720p' | '480p' | '360p' | '240p';
    framerate: number;
    bitrate: number;
  };
  audio: {
    enabled: boolean;
    codec: 'opus' | 'aac';
    bitrate: number;
    sampleRate: number;
  };
  file: {
    compressionLevel: number;
    maxChunkSize: number;
  };
}

export interface NetworkConditions {
  bandwidth: number; // Mbps
  latency: number; // ms
  packetLoss: number; // percentage
  jitter: number; // ms
}

export class AdaptiveQualityManager {
  private currentQuality: QualitySettings;
  private readonly minBandwidthMbps = 0.5;
  private readonly maxBandwidthMbps = 50;

  constructor() {
    this.currentQuality = this.getDefaultQuality();
  }

  /**
   * Get default quality settings
   */
  private getDefaultQuality(): QualitySettings {
    return {
      video: {
        enabled: true,
        resolution: '720p',
        framerate: 30,
        bitrate: 2500000 // 2.5 Mbps
      },
      audio: {
        enabled: true,
        codec: 'opus',
        bitrate: 64000, // 64 kbps
        sampleRate: 48000
      },
      file: {
        compressionLevel: 6,
        maxChunkSize: 16384
      }
    };
  }

  /**
   * Adjust quality based on network conditions
   */
  adjustQuality(conditions: NetworkConditions): QualitySettings {
    const { bandwidth, latency, packetLoss } = conditions;

    // Determine quality tier based on bandwidth
    let qualityTier: 'low' | 'medium' | 'high' | 'ultra';
    if (bandwidth < 1) {
      qualityTier = 'low';
    } else if (bandwidth < 5) {
      qualityTier = 'medium';
    } else if (bandwidth < 15) {
      qualityTier = 'high';
    } else {
      qualityTier = 'ultra';
    }

    // Adjust for poor network conditions
    if (latency > 200 || packetLoss > 2) {
      qualityTier = qualityTier === 'ultra' ? 'high' : 
                    qualityTier === 'high' ? 'medium' : 'low';
    }

    this.currentQuality = this.getQualityForTier(qualityTier);
    return this.currentQuality;
  }

  /**
   * Get quality settings for specific tier
   */
  private getQualityForTier(tier: 'low' | 'medium' | 'high' | 'ultra'): QualitySettings {
    const qualityMap = {
      low: {
        video: {
          enabled: true,
          resolution: '240p' as const,
          framerate: 15,
          bitrate: 300000 // 300 kbps
        },
        audio: {
          enabled: true,
          codec: 'opus' as const,
          bitrate: 24000, // 24 kbps
          sampleRate: 24000
        },
        file: {
          compressionLevel: 9,
          maxChunkSize: 8192
        }
      },
      medium: {
        video: {
          enabled: true,
          resolution: '480p' as const,
          framerate: 24,
          bitrate: 1000000 // 1 Mbps
        },
        audio: {
          enabled: true,
          codec: 'opus' as const,
          bitrate: 48000, // 48 kbps
          sampleRate: 48000
        },
        file: {
          compressionLevel: 6,
          maxChunkSize: 16384
        }
      },
      high: {
        video: {
          enabled: true,
          resolution: '720p' as const,
          framerate: 30,
          bitrate: 2500000 // 2.5 Mbps
        },
        audio: {
          enabled: true,
          codec: 'opus' as const,
          bitrate: 64000, // 64 kbps
          sampleRate: 48000
        },
        file: {
          compressionLevel: 4,
          maxChunkSize: 32768
        }
      },
      ultra: {
        video: {
          enabled: true,
          resolution: '1080p' as const,
          framerate: 60,
          bitrate: 5000000 // 5 Mbps
        },
        audio: {
          enabled: true,
          codec: 'opus' as const,
          bitrate: 128000, // 128 kbps
          sampleRate: 48000
        },
        file: {
          compressionLevel: 1,
          maxChunkSize: 65536
        }
      }
    };

    return qualityMap[tier];
  }

  /**
   * Get current quality settings
   */
  getCurrentQuality(): QualitySettings {
    return { ...this.currentQuality };
  }

  /**
   * Estimate bandwidth requirement for current quality
   */
  estimateBandwidthRequirement(): number {
    let totalBitrate = 0;

    if (this.currentQuality.video.enabled) {
      totalBitrate += this.currentQuality.video.bitrate;
    }

    if (this.currentQuality.audio.enabled) {
      totalBitrate += this.currentQuality.audio.bitrate;
    }

    // Convert to Mbps and add 20% overhead
    return (totalBitrate / 1000000) * 1.2;
  }

  /**
   * Get recommended settings for specific use case
   */
  getRecommendedSettings(useCase: 'voice' | 'video' | 'file' | 'screen'): Partial<QualitySettings> {
    switch (useCase) {
      case 'voice':
        return {
          video: { ...this.currentQuality.video, enabled: false },
          audio: {
            enabled: true,
            codec: 'opus',
            bitrate: 24000,
            sampleRate: 24000
          }
        };
      
      case 'video':
        return this.getCurrentQuality();
      
      case 'file':
        return {
          file: {
            compressionLevel: 6,
            maxChunkSize: this.currentQuality.file.maxChunkSize
          }
        };
      
      case 'screen':
        return {
          video: {
            enabled: true,
            resolution: '1080p',
            framerate: 15,
            bitrate: 1500000
          },
          audio: { ...this.currentQuality.audio }
        };
    }
  }
}
