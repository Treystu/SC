/**
 * QuotaManager - Storage quota management with priority-aware eviction
 *
 * Enforces the 500MB storage limit with intelligent eviction:
 * 1. Expired messages first (any priority)
 * 2. Oldest LOW priority messages
 * 3. Oldest NORMAL priority messages
 * 4. Oldest HIGH priority messages
 * 5. Oldest EMERGENCY messages (only if critically full)
 * 6. NEVER evict own undelivered outbound messages
 */

import type { MessageStore, StoredMessage, StorageStats } from "./MessageStore.js";
import { MessagePriority, DeliveryStatus } from "./MessageStore.js";

/**
 * Quota configuration
 */
export interface QuotaConfig {
  /** Maximum storage in bytes (default: 500MB) */
  maxBytes: number;

  /** Warning threshold as ratio (default: 0.8 = 80%) */
  warningThreshold: number;

  /** Critical threshold as ratio (default: 0.95 = 95%) */
  criticalThreshold: number;

  /** Target free space after eviction as ratio (default: 0.7 = 70%) */
  evictionTarget: number;

  /** How often to check quota (default: 60 seconds) */
  checkInterval: number;
}

/**
 * Default quota configuration
 */
export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  maxBytes: 500 * 1024 * 1024,  // 500MB
  warningThreshold: 0.8,        // 80% = 400MB
  criticalThreshold: 0.95,      // 95% = 475MB
  evictionTarget: 0.7,          // 70% = 350MB after eviction
  checkInterval: 60_000,        // 60 seconds
};

/**
 * Quota status levels
 */
export enum QuotaStatus {
  OK = 'ok',           // Under warning threshold
  WARNING = 'warning', // Over warning, under critical
  CRITICAL = 'critical', // Over critical threshold
  FULL = 'full',       // Cannot accept new messages
}

/**
 * Result of an eviction operation
 */
export interface EvictionResult {
  /** Number of messages evicted */
  messagesEvicted: number;

  /** Bytes freed */
  bytesFreed: number;

  /** Duration of eviction in ms */
  durationMs: number;

  /** Reason for eviction */
  reason: 'quota' | 'expiry' | 'manual';

  /** Breakdown by priority */
  byPriority: Record<MessagePriority, number>;

  /** New storage stats after eviction */
  newStats: StorageStats;
}

/**
 * Quota warning event
 */
export interface QuotaWarning {
  status: QuotaStatus;
  usedBytes: number;
  maxBytes: number;
  usageRatio: number;
  messageCount: number;
  oldestMessage: number;
}

/**
 * QuotaManager handles storage limits and eviction
 */
export class QuotaManager {
  private store: MessageStore;
  private config: QuotaConfig;
  private checkTimer?: ReturnType<typeof setInterval>;
  private warningCallbacks: ((warning: QuotaWarning) => void)[] = [];
  private lastStatus: QuotaStatus = QuotaStatus.OK;

  constructor(store: MessageStore, config: Partial<QuotaConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_QUOTA_CONFIG, ...config };
  }

  /**
   * Start periodic quota checking
   */
  start(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.checkAndEvict().catch(err => {
        console.error('[QuotaManager] Check error:', err);
      });
    }, this.config.checkInterval);

    // Initial check
    this.checkAndEvict().catch(err => {
      console.error('[QuotaManager] Initial check error:', err);
    });
  }

  /**
   * Stop periodic quota checking
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Register a callback for quota warnings
   */
  onQuotaWarning(callback: (warning: QuotaWarning) => void): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Get current quota status
   */
  async getStatus(): Promise<QuotaStatus> {
    const stats = await this.store.getStats();
    return this.calculateStatus(stats.totalBytes);
  }

  /**
   * Get detailed quota information
   */
  async getQuotaInfo(): Promise<QuotaWarning> {
    const stats = await this.store.getStats();
    return {
      status: this.calculateStatus(stats.totalBytes),
      usedBytes: stats.totalBytes,
      maxBytes: this.config.maxBytes,
      usageRatio: stats.totalBytes / this.config.maxBytes,
      messageCount: stats.messageCount,
      oldestMessage: stats.oldestMessage,
    };
  }

  /**
   * Check if there's room for a new message
   */
  async canAccept(messageSize: number): Promise<boolean> {
    const stats = await this.store.getStats();
    const projectedUsage = stats.totalBytes + messageSize;
    return projectedUsage <= this.config.maxBytes;
  }

  /**
   * Make room for a new message if needed
   * Returns true if there's now room, false if eviction failed
   */
  async ensureRoom(messageSize: number): Promise<boolean> {
    const stats = await this.store.getStats();
    const projectedUsage = stats.totalBytes + messageSize;

    if (projectedUsage <= this.config.maxBytes) {
      return true; // Already have room
    }

    // Need to evict
    const bytesNeeded = projectedUsage - this.config.maxBytes;
    const result = await this.evict(bytesNeeded, 'quota');

    return result.bytesFreed >= bytesNeeded;
  }

  /**
   * Check quota and evict if necessary
   */
  async checkAndEvict(): Promise<EvictionResult | null> {
    const stats = await this.store.getStats();
    const status = this.calculateStatus(stats.totalBytes);

    // Emit warning if status changed
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.emitWarning(stats);
    }

    // Always prune expired messages
    const expiredCount = await this.store.pruneExpired();
    if (expiredCount > 0) {
      console.log(`[QuotaManager] Pruned ${expiredCount} expired messages`);
    }

    // Evict if over critical threshold
    if (status === QuotaStatus.CRITICAL || status === QuotaStatus.FULL) {
      const targetBytes = this.config.maxBytes * this.config.evictionTarget;
      const bytesToFree = stats.totalBytes - targetBytes;

      if (bytesToFree > 0) {
        return await this.evict(bytesToFree, 'quota');
      }
    }

    return null;
  }

  /**
   * Evict messages to free up space using priority-aware strategy
   */
  async evict(bytesNeeded: number, reason: 'quota' | 'expiry' | 'manual'): Promise<EvictionResult> {
    const startTime = Date.now();
    let bytesFreed = 0;
    let messagesEvicted = 0;
    const byPriority: Record<MessagePriority, number> = {
      [MessagePriority.LOW]: 0,
      [MessagePriority.NORMAL]: 0,
      [MessagePriority.HIGH]: 0,
      [MessagePriority.EMERGENCY]: 0,
    };

    console.log(`[QuotaManager] Starting eviction, need to free ${bytesNeeded} bytes`);

    // Get all messages for eviction consideration
    const allMessages = await this.store.query({});

    // Filter out own undelivered messages (NEVER evict these)
    const evictable = allMessages.filter(msg =>
      !msg.isOwnMessage ||
      msg.status === DeliveryStatus.DELIVERED ||
      msg.status === DeliveryStatus.EXPIRED
    );

    // Sort by eviction priority
    const sorted = this.sortForEviction(evictable);

    // Evict until we've freed enough space
    const toDelete: string[] = [];

    for (const msg of sorted) {
      if (bytesFreed >= bytesNeeded) break;

      toDelete.push(msg.id);
      bytesFreed += msg.sizeBytes;
      messagesEvicted++;
      byPriority[msg.priority]++;
    }

    // Perform deletion
    if (toDelete.length > 0) {
      await this.store.bulkDelete(toDelete);
    }

    const newStats = await this.store.getStats();

    const result: EvictionResult = {
      messagesEvicted,
      bytesFreed,
      durationMs: Date.now() - startTime,
      reason,
      byPriority,
      newStats,
    };

    console.log(`[QuotaManager] Eviction complete: freed ${bytesFreed} bytes, evicted ${messagesEvicted} messages`);

    return result;
  }

  /**
   * Force eviction of a specific amount
   */
  async forceEvict(bytesToFree: number): Promise<EvictionResult> {
    return this.evict(bytesToFree, 'manual');
  }

  // ============== Private Methods ==============

  private calculateStatus(usedBytes: number): QuotaStatus {
    const ratio = usedBytes / this.config.maxBytes;

    if (ratio >= 1) return QuotaStatus.FULL;
    if (ratio >= this.config.criticalThreshold) return QuotaStatus.CRITICAL;
    if (ratio >= this.config.warningThreshold) return QuotaStatus.WARNING;
    return QuotaStatus.OK;
  }

  private emitWarning(stats: StorageStats): void {
    const warning: QuotaWarning = {
      status: this.calculateStatus(stats.totalBytes),
      usedBytes: stats.totalBytes,
      maxBytes: this.config.maxBytes,
      usageRatio: stats.totalBytes / this.config.maxBytes,
      messageCount: stats.messageCount,
      oldestMessage: stats.oldestMessage,
    };

    for (const callback of this.warningCallbacks) {
      try {
        callback(warning);
      } catch (err) {
        console.error('[QuotaManager] Warning callback error:', err);
      }
    }
  }

  /**
   * Sort messages for eviction using priority-aware hybrid strategy
   *
   * Order:
   * 1. Expired messages (sorted by expiry, oldest first)
   * 2. LOW priority (sorted by creation time, oldest first)
   * 3. NORMAL priority (sorted by creation time, oldest first)
   * 4. HIGH priority (sorted by creation time, oldest first)
   * 5. EMERGENCY priority (sorted by creation time, oldest first)
   */
  private sortForEviction(messages: StoredMessage[]): StoredMessage[] {
    const now = Date.now();

    // Separate expired from non-expired
    const expired = messages.filter(m => m.expiresAt < now);
    const active = messages.filter(m => m.expiresAt >= now);

    // Sort expired by expiry time (oldest expired first)
    expired.sort((a, b) => a.expiresAt - b.expiresAt);

    // Group active by priority
    const byPriority: Record<MessagePriority, StoredMessage[]> = {
      [MessagePriority.LOW]: [],
      [MessagePriority.NORMAL]: [],
      [MessagePriority.HIGH]: [],
      [MessagePriority.EMERGENCY]: [],
    };

    for (const msg of active) {
      byPriority[msg.priority].push(msg);
    }

    // Sort each priority group by creation time (oldest first)
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        byPriority[priority].sort((a, b) => a.createdAt - b.createdAt);
      }
    }

    // Combine in eviction order
    return [
      ...expired,
      ...byPriority[MessagePriority.LOW],
      ...byPriority[MessagePriority.NORMAL],
      ...byPriority[MessagePriority.HIGH],
      ...byPriority[MessagePriority.EMERGENCY],
    ];
  }
}

/**
 * Create a quota manager with default configuration
 */
export function createQuotaManager(
  store: MessageStore,
  config?: Partial<QuotaConfig>
): QuotaManager {
  return new QuotaManager(store, config);
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
