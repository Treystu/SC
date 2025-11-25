/**
 * Enhanced Reachability Verification
 * Task 56: Implement comprehensive peer reachability testing
 * 
 * Features:
 * - Ping/pong protocol
 * - Latency measurement
 * - Reachability caching
 * - Event notifications
 * - Multi-method testing
 */

export interface PingMessage {
  type: 'ping';
  id: string;              // Unique ping ID
  timestamp: number;       // Send timestamp
  method: ReachabilityMethod;
}

export interface PongMessage {
  type: 'pong';
  id: string;              // Same ID as ping
  pingTimestamp: number;   // Original ping timestamp
  pongTimestamp: number;   // Pong send timestamp
}

export type ReachabilityMethod = 'direct' | 'webrtc' | 'relay' | 'ble';

export interface ReachabilityResult {
  peerId: string;
  reachable: boolean;
  latency?: number;        // Round-trip time in ms
  method?: ReachabilityMethod;
  timestamp: number;
  attempts: number;
  error?: string;
}

export interface ReachabilityOptions {
  timeout: number;         // Timeout per attempt (ms)
  maxAttempts: number;     // Max retry attempts
  methods: ReachabilityMethod[];  // Methods to try
  cacheTimeout: number;    // Cache validity (ms)
}

const DEFAULT_OPTIONS: ReachabilityOptions = {
  timeout: 5000,           // 5 seconds
  maxAttempts: 3,
  methods: ['direct', 'webrtc', 'relay'],
  cacheTimeout: 60000,     // 1 minute
};

export class ReachabilityVerifier {
  private options: ReachabilityOptions;
  private cache = new Map<string, ReachabilityResult>();
  private pendingPings = new Map<string, {
    resolve: (result: ReachabilityResult) => void;
    reject: (error: Error) => void;
    timestamp: number;
    timeout: NodeJS.Timeout;
  }>();
  private listeners = new Map<string, Set<(...args: any[]) => any>>();

  constructor(options: Partial<ReachabilityOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Test peer reachability
   */
  async testReachability(
    peerId: string,
    onSendPing: (peerId: string, ping: PingMessage) => Promise<void>
  ): Promise<ReachabilityResult> {
    // Check cache first
    const cached = this.getCached(peerId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Try each method until one succeeds
    let lastError: string | undefined;
    
    for (const method of this.options.methods) {
      try {
        const result = await this.testWithMethod(peerId, method, onSendPing);
        
        if (result.reachable) {
          // Cache successful result
          this.cache.set(peerId, result);
          this.emit('reachable', result);
          return result;
        }
        
        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // All methods failed
    const failedResult: ReachabilityResult = {
      peerId,
      reachable: false,
      timestamp: Date.now(),
      attempts: this.options.methods.length * this.options.maxAttempts,
      error: lastError,
    };

    this.cache.set(peerId, failedResult);
    this.emit('unreachable', failedResult);
    
    return failedResult;
  }

  /**
   * Test reachability with specific method
   */
  private async testWithMethod(
    peerId: string,
    method: ReachabilityMethod,
    onSendPing: (peerId: string, ping: PingMessage) => Promise<void>
  ): Promise<ReachabilityResult> {
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < this.options.maxAttempts) {
      attempts++;

      try {
        const ping: PingMessage = {
          type: 'ping',
          id: this.generatePingId(),
          timestamp: Date.now(),
          method,
        };

        // Send ping
        const sendTime = Date.now();
        await onSendPing(peerId, ping);

        // Wait for pong
        const _pong = await this.waitForPong(ping.id, this.options.timeout);
        const receiveTime = Date.now();

        // Calculate latency
        const latency = receiveTime - sendTime;

        return {
          peerId,
          reachable: true,
          latency,
          method,
          timestamp: Date.now(),
          attempts,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Ping timeout';
        
        // Exponential backoff before retry
        if (attempts < this.options.maxAttempts) {
          await this.delay(Math.min(1000 * attempts, 5000));
        }
      }
    }

    return {
      peerId,
      reachable: false,
      method,
      timestamp: Date.now(),
      attempts,
      error: lastError,
    };
  }

  /**
   * Handle incoming pong message
   */
  handlePong(pong: PongMessage): void {
    const pending = this.pendingPings.get(pong.id);
    
    if (!pending) {
      // Unsolicited pong or already handled
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingPings.delete(pong.id);
    
    // Resolve the waiting promise
    pending.resolve(pong as any);
  }

  /**
   * Wait for pong response
   */
  private waitForPong(pingId: string, timeout: number): Promise<PongMessage> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingPings.delete(pingId);
        reject(new Error('Ping timeout'));
      }, timeout);

      this.pendingPings.set(pingId, {
        resolve: (result) => {
          // This is called from handlePong
          resolve(result as any);
        },
        reject,
        timestamp: Date.now(),
        timeout: timeoutHandle,
      });
    });
  }

  /**
   * Create pong response
   */
  createPong(ping: PingMessage): PongMessage {
    return {
      type: 'pong',
      id: ping.id,
      pingTimestamp: ping.timestamp,
      pongTimestamp: Date.now(),
    };
  }

  /**
   * Get cached reachability result
   */
  getCached(peerId: string): ReachabilityResult | null {
    const cached = this.cache.get(peerId);
    
    if (!cached) {
      return null;
    }

    if (!this.isCacheValid(cached)) {
      this.cache.delete(peerId);
      return null;
    }

    return cached;
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(result: ReachabilityResult): boolean {
    const age = Date.now() - result.timestamp;
    return age < this.options.cacheTimeout;
  }

  /**
   * Get reachability status
   */
  getStatus(peerId: string): 'reachable' | 'unreachable' | 'unknown' {
    const cached = this.getCached(peerId);
    
    if (!cached) {
      return 'unknown';
    }

    return cached.reachable ? 'reachable' : 'unreachable';
  }

  /**
   * Clear cache for peer
   */
  clearCache(peerId: string): void {
    this.cache.delete(peerId);
  }

  /**
   * Clear all cached results
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Get all cached results
   */
  getAllCached(): Map<string, ReachabilityResult> {
    // Filter out expired entries
    for (const [peerId, result] of this.cache.entries()) {
      if (!this.isCacheValid(result)) {
        this.cache.delete(peerId);
      }
    }
    
    return new Map(this.cache);
  }

  /**
   * Measure latency to peer
   */
  async measureLatency(
    peerId: string,
    onSendPing: (peerId: string, ping: PingMessage) => Promise<void>,
    samples: number = 5
  ): Promise<number[]> {
    const latencies: number[] = [];

    for (let i = 0; i < samples; i++) {
      const result = await this.testReachability(peerId, onSendPing);
      
      if (result.reachable && result.latency !== undefined) {
        latencies.push(result.latency);
      }

      // Small delay between pings
      if (i < samples - 1) {
        await this.delay(100);
      }
    }

    return latencies;
  }

  /**
   * Get average latency
   */
  static getAverageLatency(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    return latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  }

  /**
   * Get median latency (more robust than average)
   */
  static getMedianLatency(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    
    return sorted[mid];
  }

  /**
   * Get latency statistics
   */
  static getLatencyStats(latencies: number[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
    jitter: number;  // Variance in latency
  } {
    if (latencies.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0, jitter: 0 };
    }

    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const avg = this.getAverageLatency(latencies);
    const median = this.getMedianLatency(latencies);
    
    // Calculate jitter (standard deviation)
    const variance = latencies.reduce((sum, val) => {
      return sum + Math.pow(val - avg, 2);
    }, 0) / latencies.length;
    const jitter = Math.sqrt(variance);

    return { min, max, avg, median, jitter };
  }

  /**
   * Register event listener
   */
  on(event: 'reachable' | 'unreachable' | 'timeout', callback: (result: ReachabilityResult) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  off(event: string, callback: (...args: any[]) => any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Generate unique ping ID
   */
  private generatePingId(): string {
    return `ping-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all pending pings
    for (const [_id, pending] of this.pendingPings.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Verifier cleanup'));
    }
    
    this.pendingPings.clear();
    this.cache.clear();
    this.listeners.clear();
  }
}

/**
 * Utility function to test reachability with default settings
 */
export async function testPeerReachability(
  peerId: string,
  onSendPing: (peerId: string, ping: PingMessage) => Promise<void>
): Promise<ReachabilityResult> {
  const verifier = new ReachabilityVerifier();
  try {
    return await verifier.testReachability(peerId, onSendPing);
  } finally {
    verifier.cleanup();
  }
}
