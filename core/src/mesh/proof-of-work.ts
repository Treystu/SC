/**
 * Proof-of-Work (PoW) for Mesh Network Spam Prevention
 * 
 * Implements HashCash-style proof-of-work to prevent spam flooding in the mesh network.
 * Messages must include a valid PoW solution to be relayed, making spam attacks
 * computationally expensive.
 * 
 * Security Model:
 * - Each message requires computational work proportional to difficulty
 * - Difficulty adjustable based on network conditions
 * - Trusted peers can be exempted from PoW requirements
 * - Relay nodes can require higher difficulty than direct peers
 * 
 * Trade-offs:
 * - Battery impact on mobile devices
 * - Message sending latency (difficulty dependent)
 * - Additional bandwidth for nonce field
 * 
 * Configuration:
 * - Difficulty: 0-24 leading zero bits (default: 8)
 * - Optional: Can be disabled per peer
 * - Adaptive: Can increase during spam attacks
 */

import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Proof-of-Work challenge parameters
 */
export interface PoWChallenge {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  
  /** Number of leading zero bits required (0-24) */
  difficulty: number;
  
  /** Solution nonce */
  nonce: number;
  
  /** Optional: Target recipient (prevents nonce reuse) */
  target?: string;
}

/**
 * Proof-of-Work configuration
 */
export interface PoWConfig {
  /** Default difficulty for messages (leading zero bits) */
  defaultDifficulty: number;
  
  /** Higher difficulty for relay (messages not for us) */
  relayDifficulty: number;
  
  /** Whether PoW is enabled */
  enabled: boolean;
  
  /** Maximum time to compute PoW (ms) before giving up */
  maxComputeTime: number;
  
  /** Exempt peers (by public key) */
  exemptPeers: Set<string>;
  
  /** Adaptive difficulty during spam attacks */
  adaptiveDifficulty: boolean;
}

/**
 * Default PoW configuration
 */
export const DEFAULT_POW_CONFIG: PoWConfig = {
  defaultDifficulty: 8,      // ~256 hashes on average
  relayDifficulty: 12,        // ~4096 hashes on average
  enabled: true,
  maxComputeTime: 5000,       // 5 seconds max
  exemptPeers: new Set(),
  adaptiveDifficulty: true
};

/**
 * Proof-of-Work manager for mesh network
 */
export class ProofOfWork {
  private config: PoWConfig;
  private stats = {
    computeAttempts: 0,
    computeSuccesses: 0,
    verifyAttempts: 0,
    verifySuccesses: 0,
    totalComputeTime: 0,
    adaptiveIncreases: 0
  };
  
  constructor(config: Partial<PoWConfig> = {}) {
    this.config = { ...DEFAULT_POW_CONFIG, ...config };
  }
  
  /**
   * Compute proof-of-work for a message
   * 
   * @param message - Message bytes to compute PoW for
   * @param difficulty - Optional difficulty override
   * @param target - Optional target recipient
   * @returns PoW challenge with valid nonce, or null if timeout
   */
  async computePoW(
    message: Uint8Array,
    difficulty?: number,
    target?: string
  ): Promise<PoWChallenge | null> {
    if (!this.config.enabled) {
      // PoW disabled, return dummy challenge
      return {
        timestamp: Date.now(),
        difficulty: 0,
        nonce: 0,
        target
      };
    }
    
    const startTime = Date.now();
    const actualDifficulty = difficulty ?? this.config.defaultDifficulty;
    const timestamp = startTime;
    
    this.stats.computeAttempts++;
    
    // Prepare message data
    const targetBytes = target ? new TextEncoder().encode(target) : new Uint8Array(0);
    const timestampBytes = new Uint8Array(8);
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), false);
    
    // Try to find valid nonce
    let nonce = 0;
    const maxNonce = 2 ** 32; // Prevent infinite loop
    
    while (nonce < maxNonce) {
      // Check timeout
      if (Date.now() - startTime > this.config.maxComputeTime) {
        console.warn('PoW computation timed out after', Date.now() - startTime, 'ms');
        return null;
      }
      
      // Build challenge data: message || timestamp || target || nonce
      const nonceBytes = new Uint8Array(4);
      new DataView(nonceBytes.buffer).setUint32(0, nonce, false);
      
      const data = new Uint8Array(
        message.length + timestampBytes.length + targetBytes.length + nonceBytes.length
      );
      let offset = 0;
      data.set(message, offset); offset += message.length;
      data.set(timestampBytes, offset); offset += timestampBytes.length;
      data.set(targetBytes, offset); offset += targetBytes.length;
      data.set(nonceBytes, offset);
      
      // Hash and check
      const hash = sha256(data);
      
      if (this.hasLeadingZeros(hash, actualDifficulty)) {
        // Found valid nonce!
        this.stats.computeSuccesses++;
        this.stats.totalComputeTime += Date.now() - startTime;
        
        return {
          timestamp,
          difficulty: actualDifficulty,
          nonce,
          target
        };
      }
      
      nonce++;
    }
    
    // Failed to find valid nonce
    console.error('PoW computation failed: exhausted nonce space');
    return null;
  }
  
  /**
   * Verify proof-of-work for a message
   * 
   * @param message - Message bytes
   * @param challenge - PoW challenge to verify
   * @param minDifficulty - Minimum required difficulty
   * @returns true if PoW is valid
   */
  verifyPoW(
    message: Uint8Array,
    challenge: PoWChallenge,
    minDifficulty?: number
  ): boolean {
    if (!this.config.enabled) {
      return true; // PoW disabled, always valid
    }
    
    this.stats.verifyAttempts++;
    
    // Check difficulty meets minimum
    const requiredDifficulty = minDifficulty ?? this.config.defaultDifficulty;
    if (challenge.difficulty < requiredDifficulty) {
      console.warn('PoW difficulty too low:', challenge.difficulty, '<', requiredDifficulty);
      return false;
    }
    
    // Check timestamp is reasonable (within 5 minutes)
    const now = Date.now();
    const timeDiff = Math.abs(now - challenge.timestamp);
    if (timeDiff > 5 * 60 * 1000) {
      console.warn('PoW timestamp too old or in future:', timeDiff, 'ms');
      return false;
    }
    
    // Reconstruct challenge data
    const targetBytes = challenge.target ? new TextEncoder().encode(challenge.target) : new Uint8Array(0);
    const timestampBytes = new Uint8Array(8);
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(challenge.timestamp), false);
    const nonceBytes = new Uint8Array(4);
    new DataView(nonceBytes.buffer).setUint32(0, challenge.nonce, false);
    
    const data = new Uint8Array(
      message.length + timestampBytes.length + targetBytes.length + nonceBytes.length
    );
    let offset = 0;
    data.set(message, offset); offset += message.length;
    data.set(timestampBytes, offset); offset += timestampBytes.length;
    data.set(targetBytes, offset); offset += targetBytes.length;
    data.set(nonceBytes, offset);
    
    // Verify hash
    const hash = sha256(data);
    const isValid = this.hasLeadingZeros(hash, challenge.difficulty);
    
    if (isValid) {
      this.stats.verifySuccesses++;
    }
    
    return isValid;
  }
  
  /**
   * Check if hash has required number of leading zero bits
   * 
   * @param hash - Hash to check
   * @param difficulty - Number of leading zero bits required
   * @returns true if hash meets difficulty
   */
  private hasLeadingZeros(hash: Uint8Array, difficulty: number): boolean {
    const fullBytes = Math.floor(difficulty / 8);
    const remainingBits = difficulty % 8;
    
    // Check full zero bytes
    for (let i = 0; i < fullBytes; i++) {
      if (hash[i] !== 0) {
        return false;
      }
    }
    
    // Check remaining bits
    if (remainingBits > 0) {
      const mask = 0xFF << (8 - remainingBits);
      if ((hash[fullBytes] & mask) !== 0) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if peer is exempt from PoW
   * 
   * @param peerId - Peer public key
   * @returns true if exempt
   */
  isPeerExempt(peerId: string): boolean {
    return this.config.exemptPeers.has(peerId);
  }
  
  /**
   * Add peer to exemption list (trusted peer)
   * 
   * @param peerId - Peer public key to exempt
   */
  exemptPeer(peerId: string): void {
    this.config.exemptPeers.add(peerId);
  }
  
  /**
   * Remove peer from exemption list
   * 
   * @param peerId - Peer public key
   */
  unexemptPeer(peerId: string): void {
    this.config.exemptPeers.delete(peerId);
  }
  
  /**
   * Increase difficulty (during spam attack)
   * 
   * @param amount - Number of bits to increase
   */
  increaseDifficulty(amount: number = 2): void {
    if (!this.config.adaptiveDifficulty) {
      return;
    }
    
    this.config.defaultDifficulty = Math.min(24, this.config.defaultDifficulty + amount);
    this.config.relayDifficulty = Math.min(24, this.config.relayDifficulty + amount);
    this.stats.adaptiveIncreases++;
    
    console.log('PoW difficulty increased to:', this.config.defaultDifficulty);
  }
  
  /**
   * Decrease difficulty (after spam subsides)
   * 
   * @param amount - Number of bits to decrease
   */
  decreaseDifficulty(amount: number = 1): void {
    if (!this.config.adaptiveDifficulty) {
      return;
    }
    
    const minDifficulty = DEFAULT_POW_CONFIG.defaultDifficulty;
    this.config.defaultDifficulty = Math.max(minDifficulty, this.config.defaultDifficulty - amount);
    this.config.relayDifficulty = Math.max(
      DEFAULT_POW_CONFIG.relayDifficulty,
      this.config.relayDifficulty - amount
    );
    
    console.log('PoW difficulty decreased to:', this.config.defaultDifficulty);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): Readonly<PoWConfig> {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   * 
   * @param updates - Partial config updates
   */
  updateConfig(updates: Partial<PoWConfig>): void {
    this.config = { ...this.config, ...updates };
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageComputeTime: this.stats.computeSuccesses > 0
        ? this.stats.totalComputeTime / this.stats.computeSuccesses
        : 0,
      computeSuccessRate: this.stats.computeAttempts > 0
        ? this.stats.computeSuccesses / this.stats.computeAttempts
        : 0,
      verifySuccessRate: this.stats.verifyAttempts > 0
        ? this.stats.verifySuccesses / this.stats.verifyAttempts
        : 0
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      computeAttempts: 0,
      computeSuccesses: 0,
      verifyAttempts: 0,
      verifySuccesses: 0,
      totalComputeTime: 0,
      adaptiveIncreases: 0
    };
  }
  
  /**
   * Estimate time to compute PoW for given difficulty
   * 
   * @param difficulty - Difficulty level
   * @param hashRate - Hashes per second (default: estimated)
   * @returns Estimated time in milliseconds
   */
  static estimateComputeTime(difficulty: number, hashRate: number = 10000): number {
    // Average attempts needed = 2^difficulty
    const averageAttempts = Math.pow(2, difficulty);
    
    // Time = attempts / hash rate
    return (averageAttempts / hashRate) * 1000; // Convert to ms
  }
}

/**
 * Helper to convert number to bytes (big-endian)
 */
function numberToBytes(num: number, bytes: number = 4): Uint8Array {
  const result = new Uint8Array(bytes);
  const view = new DataView(result.buffer);
  
  if (bytes === 4) {
    view.setUint32(0, num, false);
  } else if (bytes === 8) {
    view.setBigUint64(0, BigInt(num), false);
  }
  
  return result;
}

/**
 * Benchmark PoW performance
 * 
 * @param difficulty - Difficulty to benchmark
 * @param iterations - Number of iterations
 * @returns Average time per computation
 */
export async function benchmarkPoW(
  difficulty: number = 8,
  iterations: number = 10
): Promise<number> {
  const pow = new ProofOfWork({ defaultDifficulty: difficulty, enabled: true });
  const testMessage = new Uint8Array(100);
  crypto.getRandomValues(testMessage);
  
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await pow.computePoW(testMessage, difficulty);
    times.push(Date.now() - start);
  }
  
  return times.reduce((a, b) => a + b, 0) / times.length;
}
