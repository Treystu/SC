/**
 * MemoryMessageStore - In-memory implementation of MessageStore
 *
 * Used for:
 * - Testing and development
 * - Platforms without IndexedDB
 * - Short-lived sessions
 *
 * Note: Data is lost on page refresh. For persistence, use IndexedDBMessageStore.
 */

import type {
  MessageStore,
  StoredMessage,
  MessageQuery,
  StorageStats,
} from "./MessageStore.js";
import {
  MessagePriority,
  DeliveryStatus,
  calculateMessageSize,
} from "./MessageStore.js";

/**
 * In-memory message store implementation
 */
export class MemoryMessageStore implements MessageStore {
  private messages: Map<string, StoredMessage> = new Map();
  private initialized = false;

  // ============== Core Operations ==============

  async store(message: StoredMessage): Promise<void> {
    // Recalculate size
    message.sizeBytes = calculateMessageSize(message);
    this.messages.set(message.id, { ...message });
  }

  async get(id: string): Promise<StoredMessage | null> {
    const msg = this.messages.get(id);
    return msg ? { ...msg } : null;
  }

  async delete(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async has(id: string): Promise<boolean> {
    return this.messages.has(id);
  }

  // ============== Query Operations ==============

  async query(options: MessageQuery): Promise<StoredMessage[]> {
    let results = Array.from(this.messages.values());

    // Apply filters
    if (options.recipientId !== undefined) {
      results = results.filter(m => m.recipientId === options.recipientId);
    }

    if (options.minPriority !== undefined) {
      results = results.filter(m => m.priority >= options.minPriority!);
    }

    if (options.status !== undefined) {
      results = results.filter(m => m.status === options.status);
    }

    if (options.createdAfter !== undefined) {
      results = results.filter(m => m.createdAt > options.createdAfter!);
    }

    if (options.expiringBefore !== undefined) {
      results = results.filter(m => m.expiresAt < options.expiringBefore!);
    }

    if (options.destinationGeoZone !== undefined) {
      results = results.filter(m => m.destinationGeoZone === options.destinationGeoZone);
    }

    if (options.isOwnMessage !== undefined) {
      results = results.filter(m => m.isOwnMessage === options.isOwnMessage);
    }

    // Sort by creation time (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    if (options.offset !== undefined) {
      results = results.slice(options.offset);
    }

    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results.map(m => ({ ...m }));
  }

  async getForRelay(excludeIds?: Set<string>): Promise<StoredMessage[]> {
    const now = Date.now();
    const exclude = excludeIds ?? new Set();

    return Array.from(this.messages.values())
      .filter(m =>
        !exclude.has(m.id) &&
        m.expiresAt > now &&
        m.status !== DeliveryStatus.DELIVERED &&
        m.status !== DeliveryStatus.EXPIRED
      )
      .map(m => ({ ...m }));
  }

  async getPendingForRecipient(recipientId: string): Promise<StoredMessage[]> {
    return Array.from(this.messages.values())
      .filter(m =>
        m.recipientId === recipientId &&
        m.status === DeliveryStatus.PENDING
      )
      .map(m => ({ ...m }));
  }

  async getExpired(now?: number): Promise<StoredMessage[]> {
    const cutoff = now ?? Date.now();
    return Array.from(this.messages.values())
      .filter(m => m.expiresAt < cutoff)
      .map(m => ({ ...m }));
  }

  // ============== Bulk Operations ==============

  async bulkStore(messages: StoredMessage[]): Promise<void> {
    for (const msg of messages) {
      await this.store(msg);
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.messages.delete(id);
    }
  }

  async getAllIds(): Promise<string[]> {
    return Array.from(this.messages.keys());
  }

  async getMessagesSince(timestamp: number): Promise<StoredMessage[]> {
    return Array.from(this.messages.values())
      .filter(m => m.createdAt > timestamp)
      .map(m => ({ ...m }));
  }

  // ============== Quota Management ==============

  async getStats(): Promise<StorageStats> {
    const messages = Array.from(this.messages.values());

    const byPriority: Record<MessagePriority, { count: number; bytes: number }> = {
      [MessagePriority.LOW]: { count: 0, bytes: 0 },
      [MessagePriority.NORMAL]: { count: 0, bytes: 0 },
      [MessagePriority.HIGH]: { count: 0, bytes: 0 },
      [MessagePriority.EMERGENCY]: { count: 0, bytes: 0 },
    };

    const byStatus: Record<DeliveryStatus, number> = {
      [DeliveryStatus.PENDING]: 0,
      [DeliveryStatus.SENT]: 0,
      [DeliveryStatus.DELIVERED]: 0,
      [DeliveryStatus.FAILED]: 0,
      [DeliveryStatus.EXPIRED]: 0,
    };

    let totalBytes = 0;
    let oldestMessage = Infinity;
    let newestMessage = 0;
    let ownMessageCount = 0;
    let relayMessageCount = 0;

    for (const msg of messages) {
      totalBytes += msg.sizeBytes;
      byPriority[msg.priority].count++;
      byPriority[msg.priority].bytes += msg.sizeBytes;
      byStatus[msg.status]++;

      if (msg.createdAt < oldestMessage) oldestMessage = msg.createdAt;
      if (msg.createdAt > newestMessage) newestMessage = msg.createdAt;

      if (msg.isOwnMessage) {
        ownMessageCount++;
      } else {
        relayMessageCount++;
      }
    }

    return {
      totalBytes,
      messageCount: messages.length,
      byPriority,
      byStatus,
      oldestMessage: messages.length > 0 ? oldestMessage : 0,
      newestMessage: messages.length > 0 ? newestMessage : 0,
      ownMessageCount,
      relayMessageCount,
    };
  }

  async getStorageUsed(): Promise<number> {
    let total = 0;
    for (const msg of this.messages.values()) {
      total += msg.sizeBytes;
    }
    return total;
  }

  async getMessageCount(): Promise<number> {
    return this.messages.size;
  }

  async evictByPriority(bytesToFree: number): Promise<number> {
    const now = Date.now();
    let bytesFreed = 0;

    // Get messages sorted by eviction priority
    const sortedMessages = this.getSortedForEviction();

    for (const msg of sortedMessages) {
      if (bytesFreed >= bytesToFree) break;

      // Never evict own undelivered messages
      if (msg.isOwnMessage && msg.status !== DeliveryStatus.DELIVERED) {
        continue;
      }

      this.messages.delete(msg.id);
      bytesFreed += msg.sizeBytes;
    }

    return bytesFreed;
  }

  async pruneExpired(now?: number): Promise<number> {
    const cutoff = now ?? Date.now();
    let pruned = 0;

    for (const [id, msg] of this.messages) {
      if (msg.expiresAt < cutoff) {
        this.messages.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  // ============== Status Updates ==============

  async updateStatus(id: string, status: DeliveryStatus): Promise<void> {
    const msg = this.messages.get(id);
    if (msg) {
      msg.status = status;
    }
  }

  async recordAttempt(id: string, peerIdTried: string): Promise<void> {
    const msg = this.messages.get(id);
    if (msg) {
      msg.attempts++;
      msg.lastAttempt = Date.now();
      if (!msg.routeAttempts.includes(peerIdTried)) {
        msg.routeAttempts.push(peerIdTried);
      }
    }
  }

  async markDelivered(id: string, timestamp?: number): Promise<void> {
    const msg = this.messages.get(id);
    if (msg) {
      msg.status = DeliveryStatus.DELIVERED;
      msg.deliveredAt = timestamp ?? Date.now();
    }
  }

  // ============== Lifecycle ==============

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async close(): Promise<void> {
    // Nothing to close for in-memory store
  }

  async clear(): Promise<void> {
    this.messages.clear();
  }

  // ============== Private Methods ==============

  private getSortedForEviction(): StoredMessage[] {
    const now = Date.now();
    const messages = Array.from(this.messages.values());

    // Separate expired from non-expired
    const expired = messages.filter(m => m.expiresAt < now);
    const active = messages.filter(m => m.expiresAt >= now);

    // Sort expired by expiry time
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

    // Sort each group by creation time (oldest first)
    for (const priority of [
      MessagePriority.LOW,
      MessagePriority.NORMAL,
      MessagePriority.HIGH,
      MessagePriority.EMERGENCY,
    ]) {
      byPriority[priority].sort((a, b) => a.createdAt - b.createdAt);
    }

    // Return in eviction order
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
 * Create a new in-memory message store
 */
export function createMemoryMessageStore(): MemoryMessageStore {
  return new MemoryMessageStore();
}
