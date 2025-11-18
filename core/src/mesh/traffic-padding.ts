/**
 * Traffic Padding for Metadata Privacy
 * 
 * Implements message padding to prevent traffic analysis based on message size.
 * Messages are padded to fixed size buckets to obscure actual content length.
 * 
 * Security Benefits:
 * - Prevents message size analysis (e.g., "short message = yes/no answer")
 * - Obscures message type (text, image, file, etc.)
 * - Makes traffic analysis more difficult
 * 
 * Trade-offs:
 * - Increased bandwidth (10-30% overhead typical)
 * - Slight increase in processing time
 * - Battery impact on mobile devices
 * 
 * Configuration:
 * - Multiple size buckets (256, 512, 1024, 2048, 4096 bytes)
 * - Padding algorithm (PKCS7-style or random)
 * - Optional compression before padding
 */

/**
 * Standard message size buckets (in bytes)
 * 
 * These sizes are chosen to:
 * - Cover common message sizes efficiently
 * - Limit bandwidth overhead
 * - Provide good privacy/efficiency trade-off
 */
export const MESSAGE_SIZE_BUCKETS = [
  256,   // Short messages, status updates
  512,   // Medium text messages
  1024,  // Long messages, small images
  2048,  // Files, larger images
  4096,  // Large files (chunked)
  8192,  // Very large content (chunked)
  16384  // Maximum single message size
] as const;

/**
 * Padding configuration
 */
export interface PaddingConfig {
  /** Whether padding is enabled */
  enabled: boolean;
  
  /** Size buckets to use */
  sizeBuckets: readonly number[];
  
  /** Padding strategy */
  strategy: 'pkcs7' | 'random' | 'zero';
  
  /** Whether to compress before padding */
  compress: boolean;
  
  /** Maximum message size (messages larger will be rejected) */
  maxMessageSize: number;
}

/**
 * Default padding configuration
 */
export const DEFAULT_PADDING_CONFIG: PaddingConfig = {
  enabled: true,
  sizeBuckets: MESSAGE_SIZE_BUCKETS,
  strategy: 'random',
  compress: false, // Compression can leak information
  maxMessageSize: 16384
};

/**
 * Padded message structure
 */
export interface PaddedMessage {
  /** Padded data */
  data: Uint8Array;
  
  /** Original size (stored in last 2 bytes) */
  originalSize: number;
  
  /** Bucket size used */
  bucketSize: number;
  
  /** Padding overhead (bytes) */
  overhead: number;
}

/**
 * Traffic padding manager
 */
export class TrafficPadding {
  private config: PaddingConfig;
  private stats = {
    messagesPadded: 0,
    messagesUnpadded: 0,
    totalOverhead: 0,
    averageOverhead: 0
  };
  
  constructor(config: Partial<PaddingConfig> = {}) {
    this.config = { ...DEFAULT_PADDING_CONFIG, ...config };
  }
  
  /**
   * Pad a message to the next size bucket
   * 
   * @param message - Original message
   * @returns Padded message
   * @throws Error if message exceeds maximum size
   */
  pad(message: Uint8Array): PaddedMessage {
    if (!this.config.enabled) {
      // Padding disabled, return as-is
      return {
        data: message,
        originalSize: message.length,
        bucketSize: message.length,
        overhead: 0
      };
    }
    
    const originalSize = message.length;
    
    // Check maximum size
    if (originalSize > this.config.maxMessageSize) {
      throw new Error(`Message size ${originalSize} exceeds maximum ${this.config.maxMessageSize}`);
    }
    
    // Find next bucket size
    const bucketSize = this.findBucketSize(originalSize);
    
    // Create padded array
    const padded = new Uint8Array(bucketSize);
    
    // Copy original message
    padded.set(message, 0);
    
    // Add padding
    const paddingLength = bucketSize - originalSize - 2; // Reserve 2 bytes for size
    
    if (paddingLength < 0) {
      throw new Error('Invalid bucket size calculation');
    }
    
    switch (this.config.strategy) {
      case 'random':
        // Random padding (most secure but higher cost)
        const randomPadding = crypto.getRandomValues(new Uint8Array(paddingLength));
        padded.set(randomPadding, originalSize);
        break;
        
      case 'zero':
        // Zero padding (efficient but less secure)
        // Array is already zero-filled
        break;
        
      case 'pkcs7':
        // PKCS7-style padding (repeating padding length byte)
        const pkcs7Value = paddingLength & 0xFF;
        for (let i = originalSize; i < originalSize + paddingLength; i++) {
          padded[i] = pkcs7Value;
        }
        break;
    }
    
    // Store original size in last 2 bytes (big-endian)
    const view = new DataView(padded.buffer);
    view.setUint16(bucketSize - 2, originalSize, false);
    
    // Update statistics
    this.stats.messagesPadded++;
    const overhead = bucketSize - originalSize;
    this.stats.totalOverhead += overhead;
    this.stats.averageOverhead = this.stats.totalOverhead / this.stats.messagesPadded;
    
    return {
      data: padded,
      originalSize,
      bucketSize,
      overhead
    };
  }
  
  /**
   * Unpad a message to recover original content
   * 
   * @param paddedData - Padded message data
   * @returns Original message
   * @throws Error if unpadding fails (corrupted data)
   */
  unpad(paddedData: Uint8Array): Uint8Array {
    if (!this.config.enabled) {
      // Padding disabled, return as-is
      return paddedData;
    }
    
    if (paddedData.length < 2) {
      throw new Error('Padded data too short');
    }
    
    // Read original size from last 2 bytes
    const view = new DataView(paddedData.buffer, paddedData.byteOffset);
    const originalSize = view.getUint16(paddedData.length - 2, false);
    
    // Validate original size
    if (originalSize > paddedData.length - 2) {
      throw new Error('Invalid original size: possible corruption');
    }
    
    if (originalSize < 0) {
      throw new Error('Invalid original size: negative value');
    }
    
    // Extract original message
    const original = paddedData.slice(0, originalSize);
    
    // Update statistics
    this.stats.messagesUnpadded++;
    
    return original;
  }
  
  /**
   * Find appropriate bucket size for message
   * 
   * @param messageSize - Original message size
   * @returns Bucket size to use
   */
  private findBucketSize(messageSize: number): number {
    // Need to account for 2-byte size field
    const sizeWithField = messageSize + 2;
    
    // Find smallest bucket that fits
    for (const bucket of this.config.sizeBuckets) {
      if (sizeWithField <= bucket) {
        return bucket;
      }
    }
    
    // Message too large for any bucket
    throw new Error(`Message size ${messageSize} too large for available buckets`);
  }
  
  /**
   * Calculate padding overhead for a message size
   * 
   * @param messageSize - Original message size
   * @returns Overhead in bytes and percentage
   */
  calculateOverhead(messageSize: number): { bytes: number; percentage: number } {
    if (!this.config.enabled) {
      return { bytes: 0, percentage: 0 };
    }
    
    try {
      const bucketSize = this.findBucketSize(messageSize);
      const overhead = bucketSize - messageSize;
      const percentage = (overhead / messageSize) * 100;
      
      return { bytes: overhead, percentage };
    } catch {
      return { bytes: -1, percentage: -1 };
    }
  }
  
  /**
   * Get bucket distribution statistics
   * 
   * @param messageSizes - Array of message sizes
   * @returns Distribution of messages across buckets
   */
  getBucketDistribution(messageSizes: number[]): Map<number, number> {
    const distribution = new Map<number, number>();
    
    for (const bucket of this.config.sizeBuckets) {
      distribution.set(bucket, 0);
    }
    
    for (const size of messageSizes) {
      try {
        const bucket = this.findBucketSize(size);
        distribution.set(bucket, (distribution.get(bucket) || 0) + 1);
      } catch {
        // Message too large, skip
      }
    }
    
    return distribution;
  }
  
  /**
   * Update configuration
   * 
   * @param updates - Partial config updates
   */
  updateConfig(updates: Partial<PaddingConfig>): void {
    this.config = { ...this.config, ...updates };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): Readonly<PaddingConfig> {
    return { ...this.config };
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messagesPadded: 0,
      messagesUnpadded: 0,
      totalOverhead: 0,
      averageOverhead: 0
    };
  }
  
  /**
   * Estimate bandwidth overhead for a traffic pattern
   * 
   * @param messageSizes - Array of typical message sizes
   * @returns Estimated overhead percentage
   */
  static estimateBandwidthOverhead(
    messageSizes: number[],
    config: Partial<PaddingConfig> = {}
  ): number {
    const padding = new TrafficPadding(config);
    
    let totalOriginal = 0;
    let totalPadded = 0;
    
    for (const size of messageSizes) {
      try {
        const padded = padding.pad(new Uint8Array(size));
        totalOriginal += size;
        totalPadded += padded.bucketSize;
      } catch {
        // Skip messages that are too large
      }
    }
    
    if (totalOriginal === 0) {
      return 0;
    }
    
    const overhead = totalPadded - totalOriginal;
    return (overhead / totalOriginal) * 100;
  }
}

/**
 * Adaptive padding strategy that adjusts based on network conditions
 */
export class AdaptivePadding extends TrafficPadding {
  private networkLatency: number = 0;
  private bandwidthLimit: number = 0;
  
  /**
   * Update network conditions
   * 
   * @param latency - Network latency in ms
   * @param bandwidth - Available bandwidth in bytes/sec
   */
  updateNetworkConditions(latency: number, bandwidth: number): void {
    this.networkLatency = latency;
    this.bandwidthLimit = bandwidth;
    
    // Adjust padding strategy based on conditions
    if (bandwidth < 100000) {
      // Low bandwidth: reduce padding
      this.updateConfig({
        sizeBuckets: [512, 1024, 2048],
        strategy: 'zero' // Faster than random
      });
    } else if (bandwidth > 1000000) {
      // High bandwidth: use full padding for privacy
      this.updateConfig({
        sizeBuckets: MESSAGE_SIZE_BUCKETS,
        strategy: 'random'
      });
    }
  }
  
  /**
   * Decide whether to pad based on network conditions
   * 
   * @param messageSize - Size of message to potentially pad
   * @returns Whether padding should be applied
   */
  shouldPad(messageSize: number): boolean {
    // Always pad if configured
    const config = this.getConfig();
    if (!config.enabled) {
      return false;
    }
    
    // Skip padding for very small messages on low bandwidth
    if (this.bandwidthLimit < 100000 && messageSize < 128) {
      return false;
    }
    
    return true;
  }
}

/**
 * Timing obfuscation (send dummy messages to hide traffic patterns)
 * 
 * Note: This is more advanced and may not be suitable for all use cases.
 * It increases bandwidth usage significantly.
 */
export class TimingObfuscation {
  private dummyMessageInterval: number = 10000; // 10 seconds
  private enabled: boolean = false;
  private intervalId?: number;
  
  /**
   * Start sending dummy messages at regular intervals
   * 
   * @param callback - Function to send dummy message
   * @param interval - Interval in milliseconds
   */
  start(callback: () => void, interval: number = 10000): void {
    this.enabled = true;
    this.dummyMessageInterval = interval;
    
    this.intervalId = setInterval(callback, interval) as unknown as number;
  }
  
  /**
   * Stop sending dummy messages
   */
  stop(): void {
    this.enabled = false;
    
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
  
  /**
   * Check if timing obfuscation is active
   */
  isActive(): boolean {
    return this.enabled;
  }
}
