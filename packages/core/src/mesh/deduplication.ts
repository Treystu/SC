import { Message } from '../types';
import { hashMessage } from '../protocol';

/**
 * Task 14: Create message deduplication cache (hash-based)
 */
export class DeduplicationCache {
  private cache: Map<string, number> = new Map();
  private readonly maxAge: number;
  private readonly maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxAge: number = 300000, maxSize: number = 10000) {
    this.maxAge = maxAge; // 5 minutes default
    this.maxSize = maxSize;
    this.startCleanup();
  }

  /**
   * Checks if a message has been seen before
   */
  hasSeen(message: Message): boolean {
    const hash = this.hashToString(hashMessage(message));
    return this.cache.has(hash);
  }

  /**
   * Marks a message as seen
   */
  markSeen(message: Message): void {
    const hash = this.hashToString(hashMessage(message));
    this.cache.set(hash, Date.now());

    // Enforce max size
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }

  /**
   * Removes expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [hash, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.maxAge) {
        toDelete.push(hash);
      }
    }

    toDelete.forEach(hash => this.cache.delete(hash));
  }

  /**
   * Evicts oldest entries when cache is full
   */
  private evictOldest(): void {
    let oldestHash: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, timestamp] of this.cache.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      this.cache.delete(oldestHash);
    }
  }

  /**
   * Starts periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Stops cleanup and clears cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  private hashToString(hash: Uint8Array): string {
    return Array.from(hash)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
