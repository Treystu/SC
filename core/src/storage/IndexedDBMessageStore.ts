/**
 * IndexedDBMessageStore - Persistent message storage using IndexedDB
 *
 * For web browsers and PWAs. Provides:
 * - Persistent storage across page refreshes
 * - Indexed queries for fast lookups
 * - Automatic schema migrations
 * - Transaction support for data integrity
 *
 * Storage structure:
 * - messages: Main message store with indexes
 * - metadata: Store metadata (version, stats cache)
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
 * Database configuration
 */
export interface IndexedDBConfig {
  /** Database name */
  dbName: string;
  /** Database version (for migrations) */
  version: number;
}

/**
 * Default configuration
 */
export const DEFAULT_INDEXEDDB_CONFIG: IndexedDBConfig = {
  dbName: 'sovereign-communications',
  version: 1,
};

/**
 * Store names
 */
const STORES = {
  MESSAGES: 'messages',
  METADATA: 'metadata',
  DEDUP_LOG: 'dedup_log',
} as const;

/**
 * Index names
 */
const INDEXES = {
  BY_RECIPIENT: 'by_recipient',
  BY_STATUS: 'by_status',
  BY_PRIORITY: 'by_priority',
  BY_CREATED: 'by_created',
  BY_EXPIRES: 'by_expires',
  BY_GEO_ZONE: 'by_geo_zone',
  BY_OWN: 'by_own',
} as const;

/**
 * IndexedDB-based message store implementation
 */
export class IndexedDBMessageStore implements MessageStore {
  private config: IndexedDBConfig;
  private db: IDBDatabase | null = null;
  private initialized = false;

  constructor(config: Partial<IndexedDBConfig> = {}) {
    this.config = { ...DEFAULT_INDEXEDDB_CONFIG, ...config };
  }

  // ============== Lifecycle ==============

  async initialize(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.version);

      request.onerror = () => {
        console.error('[IndexedDBMessageStore] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        console.log('[IndexedDBMessageStore] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createSchema(db);
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============== Core Operations ==============

  async store(message: StoredMessage): Promise<void> {
    await this.ensureInitialized();

    // Recalculate size
    message.sizeBytes = calculateMessageSize(message);

    // Serialize message for storage
    const serialized = this.serializeMessage(message);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.put(serialized);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<StoredMessage | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(this.deserializeMessage(request.result));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async has(id: string): Promise<boolean> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.count(id);

      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  }

  // ============== Query Operations ==============

  async query(options: MessageQuery): Promise<StoredMessage[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = tx.objectStore(STORES.MESSAGES);

      // Choose best index based on query
      let request: IDBRequest;

      if (options.recipientId !== undefined) {
        const index = store.index(INDEXES.BY_RECIPIENT);
        request = index.getAll(options.recipientId);
      } else if (options.status !== undefined) {
        const index = store.index(INDEXES.BY_STATUS);
        request = index.getAll(options.status);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results = (request.result || []).map((r: unknown) =>
          this.deserializeMessage(r as SerializedMessage)
        );

        // Apply additional filters
        results = this.applyFilters(results, options);

        // Apply pagination
        if (options.offset !== undefined) {
          results = results.slice(options.offset);
        }
        if (options.limit !== undefined) {
          results = results.slice(0, options.limit);
        }

        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getForRelay(excludeIds?: Set<string>): Promise<StoredMessage[]> {
    const now = Date.now();
    const exclude = excludeIds ?? new Set();

    const all = await this.query({});

    return all.filter(m =>
      !exclude.has(m.id) &&
      m.expiresAt > now &&
      m.status !== DeliveryStatus.DELIVERED &&
      m.status !== DeliveryStatus.EXPIRED
    );
  }

  async getPendingForRecipient(recipientId: string): Promise<StoredMessage[]> {
    return this.query({
      recipientId,
      status: DeliveryStatus.PENDING,
    });
  }

  async getExpired(now?: number): Promise<StoredMessage[]> {
    const cutoff = now ?? Date.now();
    return this.query({
      expiringBefore: cutoff,
    });
  }

  // ============== Bulk Operations ==============

  async bulkStore(messages: StoredMessage[]): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);

      let completed = 0;
      let hasError = false;

      for (const message of messages) {
        message.sizeBytes = calculateMessageSize(message);
        const serialized = this.serializeMessage(message);
        const request = store.put(serialized);

        request.onsuccess = () => {
          completed++;
          if (completed === messages.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
      }

      if (messages.length === 0) {
        resolve();
      }
    });
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);

      let completed = 0;
      let hasError = false;

      for (const id of ids) {
        const request = store.delete(id);

        request.onsuccess = () => {
          completed++;
          if (completed === ids.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
      }

      if (ids.length === 0) {
        resolve();
      }
    });
  }

  async getAllIds(): Promise<string[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  async getMessagesSince(timestamp: number): Promise<StoredMessage[]> {
    return this.query({
      createdAfter: timestamp,
    });
  }

  // ============== Quota Management ==============

  async getStats(): Promise<StorageStats> {
    const messages = await this.query({});

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
    const stats = await this.getStats();
    return stats.totalBytes;
  }

  async getMessageCount(): Promise<number> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.MESSAGES], 'readonly');
      const store = tx.objectStore(STORES.MESSAGES);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async evictByPriority(bytesToFree: number): Promise<number> {
    const messages = await this.query({});
    const sorted = this.sortForEviction(messages);

    let bytesFreed = 0;
    const toDelete: string[] = [];

    for (const msg of sorted) {
      if (bytesFreed >= bytesToFree) break;

      // Never evict own undelivered messages
      if (msg.isOwnMessage && msg.status !== DeliveryStatus.DELIVERED) {
        continue;
      }

      toDelete.push(msg.id);
      bytesFreed += msg.sizeBytes;
    }

    if (toDelete.length > 0) {
      await this.bulkDelete(toDelete);
    }

    return bytesFreed;
  }

  async pruneExpired(now?: number): Promise<number> {
    const cutoff = now ?? Date.now();
    const expired = await this.getExpired(cutoff);

    const ids = expired.map(m => m.id);
    if (ids.length > 0) {
      await this.bulkDelete(ids);
    }

    return ids.length;
  }

  // ============== Status Updates ==============

  async updateStatus(id: string, status: DeliveryStatus): Promise<void> {
    const msg = await this.get(id);
    if (msg) {
      msg.status = status;
      await this.store(msg);
    }
  }

  async recordAttempt(id: string, peerIdTried: string): Promise<void> {
    const msg = await this.get(id);
    if (msg) {
      msg.attempts++;
      msg.lastAttempt = Date.now();
      if (!msg.routeAttempts.includes(peerIdTried)) {
        msg.routeAttempts.push(peerIdTried);
      }
      await this.store(msg);
    }
  }

  async markDelivered(id: string, timestamp?: number): Promise<void> {
    const msg = await this.get(id);
    if (msg) {
      msg.status = DeliveryStatus.DELIVERED;
      msg.deliveredAt = timestamp ?? Date.now();
      await this.store(msg);
    }
  }

  // ============== Private Methods ==============

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private createSchema(db: IDBDatabase): void {
    console.log('[IndexedDBMessageStore] Creating schema...');

    // Messages store
    if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
      const messagesStore = db.createObjectStore(STORES.MESSAGES, {
        keyPath: 'id',
      });

      // Create indexes
      messagesStore.createIndex(INDEXES.BY_RECIPIENT, 'recipientId', { unique: false });
      messagesStore.createIndex(INDEXES.BY_STATUS, 'status', { unique: false });
      messagesStore.createIndex(INDEXES.BY_PRIORITY, 'priority', { unique: false });
      messagesStore.createIndex(INDEXES.BY_CREATED, 'createdAt', { unique: false });
      messagesStore.createIndex(INDEXES.BY_EXPIRES, 'expiresAt', { unique: false });
      messagesStore.createIndex(INDEXES.BY_GEO_ZONE, 'destinationGeoZone', { unique: false });
      messagesStore.createIndex(INDEXES.BY_OWN, 'isOwnMessage', { unique: false });
    }

    // Metadata store
    if (!db.objectStoreNames.contains(STORES.METADATA)) {
      db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
    }

    // Dedup log store
    if (!db.objectStoreNames.contains(STORES.DEDUP_LOG)) {
      const dedupStore = db.createObjectStore(STORES.DEDUP_LOG, {
        keyPath: 'messageId',
      });
      dedupStore.createIndex('by_seen_at', 'seenAt', { unique: false });
    }

    console.log('[IndexedDBMessageStore] Schema created');
  }

  private serializeMessage(message: StoredMessage): SerializedMessage {
    return {
      id: message.id,
      message: {
        header: {
          version: message.message.header.version,
          type: message.message.header.type,
          ttl: message.message.header.ttl,
          timestamp: message.message.header.timestamp,
          senderId: Array.from(message.message.header.senderId),
          signature: Array.from(message.message.header.signature),
        },
        payload: Array.from(message.message.payload),
      },
      recipientId: message.recipientId,
      priority: message.priority,
      sizeBytes: message.sizeBytes,
      createdAt: message.createdAt,
      expiresAt: message.expiresAt,
      status: message.status,
      attempts: message.attempts,
      lastAttempt: message.lastAttempt,
      hopCount: message.hopCount,
      maxHops: message.maxHops,
      geoZone: message.geoZone,
      destinationGeoZone: message.destinationGeoZone,
      routeAttempts: message.routeAttempts,
      isOwnMessage: message.isOwnMessage,
      relayedAt: message.relayedAt,
      deliveredAt: message.deliveredAt,
    };
  }

  private deserializeMessage(serialized: SerializedMessage): StoredMessage {
    return {
      id: serialized.id,
      message: {
        header: {
          version: serialized.message.header.version,
          type: serialized.message.header.type,
          ttl: serialized.message.header.ttl,
          timestamp: serialized.message.header.timestamp,
          senderId: new Uint8Array(serialized.message.header.senderId),
          signature: new Uint8Array(serialized.message.header.signature),
        },
        payload: new Uint8Array(serialized.message.payload),
      },
      recipientId: serialized.recipientId,
      priority: serialized.priority,
      sizeBytes: serialized.sizeBytes,
      createdAt: serialized.createdAt,
      expiresAt: serialized.expiresAt,
      status: serialized.status,
      attempts: serialized.attempts,
      lastAttempt: serialized.lastAttempt,
      hopCount: serialized.hopCount,
      maxHops: serialized.maxHops,
      geoZone: serialized.geoZone,
      destinationGeoZone: serialized.destinationGeoZone,
      routeAttempts: serialized.routeAttempts,
      isOwnMessage: serialized.isOwnMessage,
      relayedAt: serialized.relayedAt,
      deliveredAt: serialized.deliveredAt,
    };
  }

  private applyFilters(messages: StoredMessage[], options: MessageQuery): StoredMessage[] {
    return messages.filter(m => {
      if (options.minPriority !== undefined && m.priority < options.minPriority) {
        return false;
      }
      if (options.createdAfter !== undefined && m.createdAt <= options.createdAfter) {
        return false;
      }
      if (options.expiringBefore !== undefined && m.expiresAt >= options.expiringBefore) {
        return false;
      }
      if (options.destinationGeoZone !== undefined && m.destinationGeoZone !== options.destinationGeoZone) {
        return false;
      }
      if (options.isOwnMessage !== undefined && m.isOwnMessage !== options.isOwnMessage) {
        return false;
      }
      return true;
    });
  }

  private sortForEviction(messages: StoredMessage[]): StoredMessage[] {
    const now = Date.now();

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

    // Sort each group by creation time
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
 * Serialized message format for IndexedDB storage
 * Uint8Array converted to number[] for IndexedDB compatibility
 */
interface SerializedMessage {
  id: string;
  message: {
    header: {
      version: number;
      type: number;
      ttl: number;
      timestamp: number;
      senderId: number[];
      signature: number[];
    };
    payload: number[];
  };
  recipientId: string;
  priority: MessagePriority;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
  status: DeliveryStatus;
  attempts: number;
  lastAttempt: number;
  hopCount: number;
  maxHops: number;
  geoZone?: string;
  destinationGeoZone?: string;
  routeAttempts: string[];
  isOwnMessage: boolean;
  relayedAt?: number;
  deliveredAt?: number;
}

/**
 * Create an IndexedDB message store
 */
export function createIndexedDBMessageStore(
  config?: Partial<IndexedDBConfig>
): IndexedDBMessageStore {
  return new IndexedDBMessageStore(config);
}
