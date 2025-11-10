export interface MediaQualitySettings {
  video: {
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  };
  audio: {
    sampleRate: number;
    bitrate: number;
  };
}

export class MediaQualityAdapter {
  private currentBandwidth: number = 0;
  private qualityLevel: 'high' | 'medium' | 'low' = 'high';

  getOptimalSettings(bandwidth: number): MediaQualitySettings {
    this.currentBandwidth = bandwidth;

    if (bandwidth > 2000000) { // > 2 Mbps
      this.qualityLevel = 'high';
      return {
        video: {
          width: 1920,
          height: 1080,
          frameRate: 30,
          bitrate: 2500000
        },
        audio: {
          sampleRate: 48000,
          bitrate: 128000
        }
      };
    } else if (bandwidth > 500000) { // > 500 Kbps
      this.qualityLevel = 'medium';
      return {
        video: {
          width: 1280,
          height: 720,
          frameRate: 24,
          bitrate: 1000000
        },
        audio: {
          sampleRate: 44100,
          bitrate: 64000
        }
      };
    } else {
      this.qualityLevel = 'low';
      return {
        video: {
          width: 640,
          height: 480,
          frameRate: 15,
          bitrate: 400000
        },
        audio: {
          sampleRate: 22050,
          bitrate: 32000
        }
      };
    }
  }

  adaptToNetworkConditions(
    packetLoss: number,
    latency: number
  ): MediaQualitySettings {
    // Reduce quality if network conditions are poor
    const degradedBandwidth = this.currentBandwidth * (1 - packetLoss / 100);
    
    if (latency > 200 || packetLoss > 5) {
      // Significant degradation needed
      return this.getOptimalSettings(degradedBandwidth * 0.5);
    } else if (latency > 100 || packetLoss > 2) {
      // Moderate degradation
      return this.getOptimalSettings(degradedBandwidth * 0.75);
    }

    return this.getOptimalSettings(degradedBandwidth);
  }

  getCurrentQuality(): 'high' | 'medium' | 'low' {
    return this.qualityLevel;
  }
}
