/**
 * Voice Module Tests
 * 
 * Tests for voice message metadata and codec configuration
 */

import { describe, it, expect } from '@jest/globals';
import {
  createVoiceMessageMetadata,
  formatDuration,
  VoiceMessageMetadata
} from './metadata';
import {
  OpusConfig,
  defaultVoIPConfig,
  highQualityConfig,
  lowLatencyConfig
} from './opus';

describe('Voice Message Metadata', () => {
  describe('createVoiceMessageMetadata', () => {
    it('should create valid metadata', () => {
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        5000, // 5 seconds
        16000, // 16kHz
        24000, // 24kbps
        'opus',
        'sender-456',
        15000, // 15KB
        [10, 20, 30, 40, 50]
      );

      expect(metadata.id).toBe('msg-123');
      expect(metadata.duration).toBe(5000);
      expect(metadata.sampleRate).toBe(16000);
      expect(metadata.bitrate).toBe(24000);
      expect(metadata.codec).toBe('opus');
      expect(metadata.senderId).toBe('sender-456');
      expect(metadata.size).toBe(15000);
      expect(metadata.waveform).toEqual([10, 20, 30, 40, 50]);
      expect(metadata.timestamp).toBeDefined();
    });

    it('should create metadata without waveform', () => {
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        5000,
        16000,
        24000,
        'opus',
        'sender-456',
        15000
      );

      expect(metadata.waveform).toBeUndefined();
    });

    it('should support AAC codec', () => {
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        5000,
        44100,
        128000,
        'aac',
        'sender-456',
        30000
      );

      expect(metadata.codec).toBe('aac');
    });

    it('should generate timestamp automatically', () => {
      const before = Date.now();
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        5000,
        16000,
        24000,
        'opus',
        'sender-456',
        15000
      );
      const after = Date.now();

      expect(metadata.timestamp).toBeGreaterThanOrEqual(before);
      expect(metadata.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle zero duration', () => {
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        0,
        16000,
        24000,
        'opus',
        'sender-456',
        1000
      );

      expect(metadata.duration).toBe(0);
    });

    it('should handle large durations', () => {
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        3600000, // 1 hour
        16000,
        24000,
        'opus',
        'sender-456',
        10800000 // ~10MB for 1 hour
      );

      expect(metadata.duration).toBe(3600000);
    });

    it('should handle large file sizes', () => {
      const metadata = createVoiceMessageMetadata(
        'msg-123',
        300000, // 5 minutes
        48000,
        128000,
        'opus',
        'sender-456',
        4800000 // ~4.8MB
      );

      expect(metadata.size).toBe(4800000);
    });
  });

  describe('formatDuration', () => {
    it('should format duration correctly', () => {
      expect(formatDuration(5000)).toBe('0:05');
      expect(formatDuration(30000)).toBe('0:30');
      expect(formatDuration(60000)).toBe('1:00');
      expect(formatDuration(125000)).toBe('2:05');
    });

    it('should pad seconds with zero', () => {
      expect(formatDuration(1000)).toBe('0:01');
      expect(formatDuration(9000)).toBe('0:09');
    });

    it('should handle zero duration', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should handle long durations', () => {
      expect(formatDuration(3600000)).toBe('60:00'); // 1 hour
      expect(formatDuration(7200000)).toBe('120:00'); // 2 hours
    });

    it('should round down partial seconds', () => {
      expect(formatDuration(1500)).toBe('0:01');
      expect(formatDuration(1999)).toBe('0:01');
    });

    it('should handle various minute values', () => {
      expect(formatDuration(600000)).toBe('10:00');
      expect(formatDuration(1800000)).toBe('30:00');
      expect(formatDuration(3540000)).toBe('59:00');
    });
  });
});

describe('Opus Configuration', () => {
  describe('defaultVoIPConfig', () => {
    it('should have correct VoIP settings', () => {
      expect(defaultVoIPConfig.sampleRate).toBe(16000);
      expect(defaultVoIPConfig.channels).toBe(1);
      expect(defaultVoIPConfig.bitrate).toBe(24000);
      expect(defaultVoIPConfig.complexity).toBe(5);
      expect(defaultVoIPConfig.frameSize).toBe(20);
      expect(defaultVoIPConfig.application).toBe('voip');
    });

    it('should be optimized for bandwidth', () => {
      expect(defaultVoIPConfig.bitrate).toBeLessThan(50000);
      expect(defaultVoIPConfig.channels).toBe(1); // Mono
    });

    it('should balance quality and complexity', () => {
      expect(defaultVoIPConfig.complexity).toBeGreaterThanOrEqual(3);
      expect(defaultVoIPConfig.complexity).toBeLessThanOrEqual(7);
    });
  });

  describe('highQualityConfig', () => {
    it('should have correct high-quality settings', () => {
      expect(highQualityConfig.sampleRate).toBe(48000);
      expect(highQualityConfig.channels).toBe(2);
      expect(highQualityConfig.bitrate).toBe(128000);
      expect(highQualityConfig.complexity).toBe(10);
      expect(highQualityConfig.frameSize).toBe(20);
      expect(highQualityConfig.application).toBe('audio');
    });

    it('should prioritize quality over bandwidth', () => {
      expect(highQualityConfig.bitrate).toBeGreaterThan(defaultVoIPConfig.bitrate);
      expect(highQualityConfig.complexity).toBeGreaterThan(defaultVoIPConfig.complexity);
    });

    it('should use stereo', () => {
      expect(highQualityConfig.channels).toBe(2);
    });
  });

  describe('lowLatencyConfig', () => {
    it('should have correct low-latency settings', () => {
      expect(lowLatencyConfig.sampleRate).toBe(16000);
      expect(lowLatencyConfig.channels).toBe(1);
      expect(lowLatencyConfig.bitrate).toBe(16000);
      expect(lowLatencyConfig.complexity).toBe(3);
      expect(lowLatencyConfig.frameSize).toBe(10);
      expect(lowLatencyConfig.application).toBe('lowdelay');
    });

    it('should minimize latency', () => {
      expect(lowLatencyConfig.frameSize).toBeLessThan(defaultVoIPConfig.frameSize);
      expect(lowLatencyConfig.complexity).toBeLessThan(defaultVoIPConfig.complexity);
    });

    it('should use minimal resources', () => {
      expect(lowLatencyConfig.bitrate).toBeLessThanOrEqual(defaultVoIPConfig.bitrate);
      expect(lowLatencyConfig.complexity).toBeLessThanOrEqual(5);
    });
  });

  describe('OpusConfig validation', () => {
    it('should support all valid sample rates', () => {
      const validRates: Array<OpusConfig['sampleRate']> = [
        48000, 24000, 16000, 12000, 8000
      ];

      validRates.forEach(rate => {
        const config: OpusConfig = {
          ...defaultVoIPConfig,
          sampleRate: rate
        };
        expect(config.sampleRate).toBe(rate);
      });
    });

    it('should support mono and stereo', () => {
      const monoConfig: OpusConfig = {
        ...defaultVoIPConfig,
        channels: 1
      };
      const stereoConfig: OpusConfig = {
        ...defaultVoIPConfig,
        channels: 2
      };

      expect(monoConfig.channels).toBe(1);
      expect(stereoConfig.channels).toBe(2);
    });

    it('should support all valid frame sizes', () => {
      const validFrameSizes: Array<OpusConfig['frameSize']> = [
        2.5, 5, 10, 20, 40, 60
      ];

      validFrameSizes.forEach(size => {
        const config: OpusConfig = {
          ...defaultVoIPConfig,
          frameSize: size
        };
        expect(config.frameSize).toBe(size);
      });
    });

    it('should support all application types', () => {
      const applications: Array<OpusConfig['application']> = [
        'voip', 'audio', 'lowdelay'
      ];

      applications.forEach(app => {
        const config: OpusConfig = {
          ...defaultVoIPConfig,
          application: app
        };
        expect(config.application).toBe(app);
      });
    });

    it('should accept valid bitrate range', () => {
      const validBitrates = [6000, 24000, 64000, 128000, 510000];

      validBitrates.forEach(bitrate => {
        const config: OpusConfig = {
          ...defaultVoIPConfig,
          bitrate
        };
        expect(config.bitrate).toBe(bitrate);
      });
    });

    it('should accept valid complexity range', () => {
      for (let complexity = 0; complexity <= 10; complexity++) {
        const config: OpusConfig = {
          ...defaultVoIPConfig,
          complexity
        };
        expect(config.complexity).toBe(complexity);
      }
    });
  });

  describe('Configuration comparisons', () => {
    it('should have increasing quality levels', () => {
      expect(lowLatencyConfig.bitrate).toBeLessThan(defaultVoIPConfig.bitrate);
      expect(defaultVoIPConfig.bitrate).toBeLessThan(highQualityConfig.bitrate);
    });

    it('should have increasing complexity levels', () => {
      expect(lowLatencyConfig.complexity).toBeLessThan(defaultVoIPConfig.complexity);
      expect(defaultVoIPConfig.complexity).toBeLessThan(highQualityConfig.complexity);
    });

    it('should have varying sample rates for use cases', () => {
      expect(lowLatencyConfig.sampleRate).toBe(16000);
      expect(defaultVoIPConfig.sampleRate).toBe(16000);
      expect(highQualityConfig.sampleRate).toBe(48000);
    });
  });

  describe('Performance characteristics', () => {
    it('should calculate approximate data rates', () => {
      // Approximate bytes per second for each config
      const lowLatencyRate = lowLatencyConfig.bitrate / 8;
      const voipRate = defaultVoIPConfig.bitrate / 8;
      const highQualityRate = highQualityConfig.bitrate / 8;

      expect(lowLatencyRate).toBe(2000); // 2KB/s
      expect(voipRate).toBe(3000); // 3KB/s
      expect(highQualityRate).toBe(16000); // 16KB/s
    });

    it('should estimate file sizes for duration', () => {
      const duration = 60000; // 60 seconds
      
      const lowLatencySize = (lowLatencyConfig.bitrate / 8) * (duration / 1000);
      const voipSize = (defaultVoIPConfig.bitrate / 8) * (duration / 1000);
      const highQualitySize = (highQualityConfig.bitrate / 8) * (duration / 1000);

      expect(lowLatencySize).toBe(120000); // 120KB for 1 minute
      expect(voipSize).toBe(180000); // 180KB for 1 minute
      expect(highQualitySize).toBe(960000); // 960KB for 1 minute
    });
  });
});

describe('Integration Tests', () => {
  it('should create metadata with opus config', () => {
    const config = defaultVoIPConfig;
    const duration = 30000; // 30 seconds
    const estimatedSize = (config.bitrate / 8) * (duration / 1000);

    const metadata = createVoiceMessageMetadata(
      'msg-123',
      duration,
      config.sampleRate,
      config.bitrate,
      'opus',
      'sender-456',
      estimatedSize
    );

    expect(metadata.duration).toBe(duration);
    expect(metadata.sampleRate).toBe(config.sampleRate);
    expect(metadata.bitrate).toBe(config.bitrate);
    expect(metadata.size).toBe(estimatedSize);
  });

  it('should format metadata duration correctly', () => {
    const metadata = createVoiceMessageMetadata(
      'msg-123',
      125000,
      16000,
      24000,
      'opus',
      'sender-456',
      37500
    );

    const formatted = formatDuration(metadata.duration);
    expect(formatted).toBe('2:05');
  });

  it('should create complete voice message workflow', () => {
    // 1. Choose config
    const config = defaultVoIPConfig;
    
    // 2. Calculate estimated size for 45 seconds
    const duration = 45000;
    const estimatedSize = (config.bitrate / 8) * (duration / 1000);
    
    // 3. Create metadata
    const metadata = createVoiceMessageMetadata(
      'voice-001',
      duration,
      config.sampleRate,
      config.bitrate,
      'opus',
      'user-123',
      estimatedSize,
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    );
    
    // 4. Format for display
    const displayDuration = formatDuration(metadata.duration);
    
    // Verify complete workflow
    expect(metadata.id).toBe('voice-001');
    expect(metadata.codec).toBe('opus');
    expect(displayDuration).toBe('0:45');
    expect(metadata.waveform).toHaveLength(10);
  });
});
