/**
 * DeduplicationManager - Hybrid deduplication using Bloom filter + persistent log
 *
 * Strategy:
 * 1. BloomFilter for O(1) fast check on hot path (may have false positives)
 * 2. Persistent log for accuracy after app restart
 * 3. Rolling window to bound storage growth
 *
 * Trade-offs:
 * - False positive (bloom says seen, but not): Message not relayed (acceptable)
 * - False negative (impossible): Never happens with bloom filters
 */

import { BloomFilter, BloomFilterState } from "./BloomFilter.js";

/**
 * Configuration for the deduplication manager
 */
export interface DeduplicationConfig {
  /** Bloom filter expected items (default: 100,000) */
  bloomExpectedItems?: number;

  /** Bloom filter false positive rate (default: 0.01) */
  bloomFalsePositiveRate?: number;

  /** Maximum age for entries in the persistent log (default: 30 days) */
  maxLogAge?: number;

  /** Maximum entries in the persistent log (default: 200,000) */
  maxLogEntries?: number;

  /** How often to prune old entries (default: 1 hour) */
  pruneInterval?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_DEDUP_CONFIG: Required<DeduplicationConfig> = {
  bloomExpectedItems: 100_000,
  bloomFalsePositiveRate: 0.01,
  maxLogAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxLogEntries: 200_000,
  pruneInterval: 60 * 60 * 1000, // 1 hour
};

/**
 * Entry in the persistent log
 */
export interface LogEntry {
  messageId: string;
  seenAt: number;
}

/**
 * Persistence adapter for the dedup log
 */
export interface DeduplicationLogAdapter {
  /** Save an entry to the log */
  save(entry: LogEntry): Promise<void>;

  /** Check if a message ID exists in the log */
  has(messageId: string): Promise<boolean>;

  /** Get all entries (for rebuilding bloom filter) */
  getAll(): Promise<LogEntry[]>;

  /** Get entries newer than timestamp */
  getNewerThan(timestamp: number): Promise<LogEntry[]>;

  /** Delete entries older than timestamp */
  deleteOlderThan(timestamp: number): Promise<number>;

  /** Get entry count */
  count(): Promise<number>;

  /** Clear all entries */
  clear(): Promise<void>;
}

/**
 * In-memory implementation of the dedup log adapter
 */
export class MemoryDeduplicationLogAdapter implements DeduplicationLogAdapter {
  private entries: Map<string, LogEntry> = new Map();

  async save(entry: LogEntry): Promise<void> {
    this.entries.set(entry.messageId, entry);
  }

  async has(messageId: string): Promise<boolean> {
    return this.entries.has(messageId);
  }

  async getAll(): Promise<LogEntry[]> {
    return Array.from(this.entries.values());
  }

  async getNewerThan(timestamp: number): Promise<LogEntry[]> {
    return Array.from(this.entries.values()).filter(e => e.seenAt > timestamp);
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    let deleted = 0;
    for (const [id, entry] of this.entries) {
      if (entry.seenAt < timestamp) {
        this.entries.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async count(): Promise<number> {
    return this.entries.size;
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  /** Total checks performed */
  totalChecks: number;

  /** Messages that were duplicates */
  duplicatesDetected: number;

  /** Messages that were new */
  newMessages: number;

  /** Bloom filter info */
  bloomFilter: {
    itemCount: number;
    fillRatio: number;
    estimatedFPR: number;
    memorySizeBytes: number;
  };

  /** Persistent log info */
  persistentLog: {
    entryCount: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  };

  /** Last prune timestamp */
  lastPrune: number;
}

/**
 * DeduplicationManager combines bloom filter and persistent log
 */
export class DeduplicationManager {
  private bloomFilter: BloomFilter;
  private logAdapter: DeduplicationLogAdapter;
  private config: Required<DeduplicationConfig>;

  private stats = {
    totalChecks: 0,
    duplicatesDetected: 0,
    newMessages: 0,
    lastPrune: 0,
  };

  private pruneTimer?: ReturnType<typeof setInterval>;
  private initialized = false;

  constructor(
    config: DeduplicationConfig = {},
    logAdapter?: DeduplicationLogAdapter
  ) {
    this.config = { ...DEFAULT_DEDUP_CONFIG, ...config };

    this.bloomFilter = new BloomFilter({
      expectedItems: this.config.bloomExpectedItems,
      falsePositiveRate: this.config.bloomFalsePositiveRate,
    });

    this.logAdapter = logAdapter ?? new MemoryDeduplicationLogAdapter();
  }

  /**
   * Initialize the deduplication manager
   * Must be called before use to rebuild bloom filter from persistent log
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Rebuild bloom filter from persistent log
    await this.rebuildFromLog();

    // Start periodic pruning
    this.startPruneTimer();

    this.initialized = true;
  }

  /**
   * Check if a message has been seen before
   * Returns true if the message should be processed (NOT a duplicate)
   */
  async shouldProcess(messageId: string): Promise<boolean> {
    this.stats.totalChecks++;

    // Fast path: check bloom filter first
    if (this.bloomFilter.mightContain(messageId)) {
      // Bloom filter says "maybe seen" - could be false positive
      // Check persistent log for certainty
      const definitelySeen = await this.logAdapter.has(messageId);

      if (definitelySeen) {
        this.stats.duplicatesDetected++;
        return false; // Definitely a duplicate
      }

      // Bloom filter false positive - message is actually new
      // Fall through to mark as seen
    }

    // Message is new
    this.stats.newMessages++;
    return true;
  }

  /**
   * Mark a message as seen (call after successful processing)
   */
  async markSeen(messageId: string): Promise<void> {
    // Add to bloom filter (fast, in-memory)
    this.bloomFilter.add(messageId);

    // Add to persistent log (for restart recovery)
    await this.logAdapter.save({
      messageId,
      seenAt: Date.now(),
    });
  }

  /**
   * Combined check and mark for convenience
   * Returns true if message should be processed (and marks it as seen)
   */
  async checkAndMark(messageId: string): Promise<boolean> {
    const shouldProcess = await this.shouldProcess(messageId);

    if (shouldProcess) {
      await this.markSeen(messageId);
    }

    return shouldProcess;
  }

  /**
   * Rebuild bloom filter from persistent log
   * Call on app start to restore state
   */
  async rebuildFromLog(): Promise<void> {
    // Clear existing bloom filter
    this.bloomFilter.clear();

    // Get all entries from persistent log
    const entries = await this.logAdapter.getAll();

    // Add each to bloom filter
    for (const entry of entries) {
      this.bloomFilter.add(entry.messageId);
    }

    console.log(`[DeduplicationManager] Rebuilt bloom filter from ${entries.length} log entries`);
  }

  /**
   * Prune old entries from the persistent log
   * Returns number of entries pruned
   */
  async pruneLog(maxAge?: number): Promise<number> {
    const cutoff = Date.now() - (maxAge ?? this.config.maxLogAge);
    const pruned = await this.logAdapter.deleteOlderThan(cutoff);

    this.stats.lastPrune = Date.now();

    if (pruned > 0) {
      console.log(`[DeduplicationManager] Pruned ${pruned} old log entries`);

      // Rebuild bloom filter after significant pruning
      if (pruned > this.config.bloomExpectedItems * 0.1) {
        await this.rebuildFromLog();
      }
    }

    return pruned;
  }

  /**
   * Get deduplication statistics
   */
  async getStats(): Promise<DeduplicationStats> {
    const entries = await this.logAdapter.getAll();
    const sortedByTime = entries.sort((a, b) => a.seenAt - b.seenAt);

    return {
      totalChecks: this.stats.totalChecks,
      duplicatesDetected: this.stats.duplicatesDetected,
      newMessages: this.stats.newMessages,
      bloomFilter: this.bloomFilter.getInfo(),
      persistentLog: {
        entryCount: entries.length,
        oldestEntry: sortedByTime[0]?.seenAt ?? null,
        newestEntry: sortedByTime[sortedByTime.length - 1]?.seenAt ?? null,
      },
      lastPrune: this.stats.lastPrune,
    };
  }

  /**
   * Export bloom filter state for persistence
   */
  exportBloomFilter(): BloomFilterState {
    return this.bloomFilter.export();
  }

  /**
   * Import bloom filter state (faster than rebuilding from log)
   */
  importBloomFilter(state: BloomFilterState): void {
    this.bloomFilter = BloomFilter.import(state);
  }

  /**
   * Clear all deduplication state
   */
  async clear(): Promise<void> {
    this.bloomFilter.clear();
    await this.logAdapter.clear();
    this.stats = {
      totalChecks: 0,
      duplicatesDetected: 0,
      newMessages: 0,
      lastPrune: 0,
    };
  }

  /**
   * Stop the deduplication manager and clean up
   */
  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
  }

  // ============== Private Methods ==============

  private startPruneTimer(): void {
    // Prune periodically
    this.pruneTimer = setInterval(() => {
      this.pruneLog().catch(err => {
        console.error('[DeduplicationManager] Prune error:', err);
      });
    }, this.config.pruneInterval);
  }
}

/**
 * Create a deduplication manager with default configuration
 */
export function createDeduplicationManager(
  config?: DeduplicationConfig,
  logAdapter?: DeduplicationLogAdapter
): DeduplicationManager {
  return new DeduplicationManager(config, logAdapter);
}
