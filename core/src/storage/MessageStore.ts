/**
 * MessageStore - Persistent message storage with priority-aware TTL
 *
 * Supports the apocalypse-resilient store-and-forward system with:
 * - Configurable TTL based on message priority (24h to 30 days)
 * - Size tracking for quota management
 * - Geo-zone hints for routing optimization
 * - Query operations for courier sync
 */

import type { Message } from "../protocol/message.js";

/**
 * Message priority levels with corresponding TTL values
 */
export enum MessagePriority {
  LOW = 0,        // 24-hour TTL - routine messages
  NORMAL = 1,     // 7-day TTL - standard messages
  HIGH = 2,       // 14-day TTL - important messages
  EMERGENCY = 3,  // 30-day TTL - critical/emergency messages
}

/**
 * TTL values in milliseconds for each priority level
 */
export const TTL_BY_PRIORITY: Record<MessagePriority, number> = {
  [MessagePriority.LOW]: 24 * 60 * 60 * 1000,           // 24 hours
  [MessagePriority.NORMAL]: 7 * 24 * 60 * 60 * 1000,    // 7 days
  [MessagePriority.HIGH]: 14 * 24 * 60 * 60 * 1000,     // 14 days
  [MessagePriority.EMERGENCY]: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Message delivery status
 */
export enum DeliveryStatus {
  PENDING = 'pending',     // Not yet sent
  SENT = 'sent',           // Sent but no ack
  DELIVERED = 'delivered', // Delivery acknowledged
  FAILED = 'failed',       // Delivery failed after retries
  EXPIRED = 'expired',     // TTL expired
}

/**
 * Extended stored message with apocalypse-resilient features
 */
export interface StoredMessage {
  /** Unique message ID (SHA-256 hash of content) */
  id: string;

  /** The actual message */
  message: Message;

  /** Recipient peer ID (or 'BROADCAST' for broadcasts) */
  recipientId: string;

  /** Message priority determines TTL and eviction order */
  priority: MessagePriority;

  /** Size in bytes for quota management */
  sizeBytes: number;

  /** When the message was created */
  createdAt: number;

  /** When the message expires */
  expiresAt: number;

  /** Current delivery status */
  status: DeliveryStatus;

  /** Number of delivery attempts */
  attempts: number;

  /** Timestamp of last delivery attempt */
  lastAttempt: number;

  /** Number of hops this message has traversed */
  hopCount: number;

  /** Maximum allowed hops before dropping */
  maxHops: number;

  /** Geographic zone hint for routing (100km grid) */
  geoZone?: string;

  /** Destination geographic zone for geo-aware routing */
  destinationGeoZone?: string;

  /** List of peer IDs that have been tried for routing */
  routeAttempts: string[];

  /** True if this device originated the message */
  isOwnMessage: boolean;

  /** When we received this message for relay */
  relayedAt?: number;

  /** When delivery was confirmed (for own messages) */
  deliveredAt?: number;
}

/**
 * Query options for filtering messages
 */
export interface MessageQuery {
  /** Filter by recipient ID */
  recipientId?: string;

  /** Filter by minimum priority */
  minPriority?: MessagePriority;

  /** Filter by status */
  status?: DeliveryStatus;

  /** Filter messages created after this timestamp */
  createdAfter?: number;

  /** Filter messages expiring before this timestamp */
  expiringBefore?: number;

  /** Filter by destination geo zone */
  destinationGeoZone?: string;

  /** Filter for own messages only */
  isOwnMessage?: boolean;

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Storage statistics for quota management
 */
export interface StorageStats {
  /** Total bytes used */
  totalBytes: number;

  /** Number of messages */
  messageCount: number;

  /** Breakdown by priority */
  byPriority: Record<MessagePriority, { count: number; bytes: number }>;

  /** Breakdown by status */
  byStatus: Record<DeliveryStatus, number>;

  /** Timestamp of oldest message */
  oldestMessage: number;

  /** Timestamp of newest message */
  newestMessage: number;

  /** Number of own (outbound) messages */
  ownMessageCount: number;

  /** Number of relay messages */
  relayMessageCount: number;
}

/**
 * Abstract MessageStore interface
 * Implementations: MemoryMessageStore, IndexedDBMessageStore, SQLiteMessageStore
 */
export interface MessageStore {
  // ============== Core Operations ==============

  /**
   * Store a message. Replaces existing message with same ID.
   */
  store(message: StoredMessage): Promise<void>;

  /**
   * Get a message by ID
   */
  get(id: string): Promise<StoredMessage | null>;

  /**
   * Delete a message by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Check if a message exists
   */
  has(id: string): Promise<boolean>;

  // ============== Query Operations ==============

  /**
   * Query messages with filters
   */
  query(options: MessageQuery): Promise<StoredMessage[]>;

  /**
   * Get all messages for relay (excluding own delivered messages)
   */
  getForRelay(excludeIds?: Set<string>): Promise<StoredMessage[]>;

  /**
   * Get messages pending delivery for a recipient
   */
  getPendingForRecipient(recipientId: string): Promise<StoredMessage[]>;

  /**
   * Get all expired messages
   */
  getExpired(now?: number): Promise<StoredMessage[]>;

  // ============== Bulk Operations ==============

  /**
   * Store multiple messages (for courier sync)
   */
  bulkStore(messages: StoredMessage[]): Promise<void>;

  /**
   * Delete multiple messages
   */
  bulkDelete(ids: string[]): Promise<void>;

  /**
   * Get all message IDs (for sync negotiation)
   */
  getAllIds(): Promise<string[]>;

  /**
   * Get messages created since timestamp (for delta sync)
   */
  getMessagesSince(timestamp: number): Promise<StoredMessage[]>;

  // ============== Quota Management ==============

  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;

  /**
   * Get total storage used in bytes
   */
  getStorageUsed(): Promise<number>;

  /**
   * Get message count
   */
  getMessageCount(): Promise<number>;

  /**
   * Evict messages to free space, respecting priority
   * Returns number of bytes freed
   */
  evictByPriority(bytesToFree: number): Promise<number>;

  /**
   * Prune expired messages
   * Returns number of messages pruned
   */
  pruneExpired(now?: number): Promise<number>;

  // ============== Status Updates ==============

  /**
   * Update message delivery status
   */
  updateStatus(id: string, status: DeliveryStatus): Promise<void>;

  /**
   * Record a delivery attempt
   */
  recordAttempt(id: string, peerIdTried: string): Promise<void>;

  /**
   * Mark message as delivered
   */
  markDelivered(id: string, timestamp?: number): Promise<void>;

  // ============== Lifecycle ==============

  /**
   * Initialize the store (create tables, indexes, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Close the store and release resources
   */
  close(): Promise<void>;

  /**
   * Clear all messages (for testing/reset)
   */
  clear(): Promise<void>;
}

/**
 * Create a StoredMessage from a Message with appropriate defaults
 */
export function createStoredMessage(
  message: Message,
  recipientId: string,
  options: {
    priority?: MessagePriority;
    geoZone?: string;
    destinationGeoZone?: string;
    isOwnMessage?: boolean;
    maxHops?: number;
  } = {}
): StoredMessage {
  const priority = options.priority ?? MessagePriority.NORMAL;
  const now = Date.now();
  const messageBytes = JSON.stringify(message); // Rough size estimate

  return {
    id: generateMessageId(message),
    message,
    recipientId,
    priority,
    sizeBytes: messageBytes.length,
    createdAt: now,
    expiresAt: now + TTL_BY_PRIORITY[priority],
    status: DeliveryStatus.PENDING,
    attempts: 0,
    lastAttempt: 0,
    hopCount: 0,
    maxHops: options.maxHops ?? 255,
    geoZone: options.geoZone,
    destinationGeoZone: options.destinationGeoZone,
    routeAttempts: [],
    isOwnMessage: options.isOwnMessage ?? true,
    relayedAt: options.isOwnMessage ? undefined : now,
  };
}

/**
 * Generate a unique message ID from the message content
 */
function generateMessageId(message: Message): string {
  // Use SHA-256 of serialized message for unique ID
  const content = JSON.stringify({
    senderId: Array.from(message.header.senderId),
    timestamp: message.header.timestamp,
    type: message.header.type,
    payload: Array.from(message.payload),
  });

  // Simple hash for now - in production use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Calculate actual byte size of a stored message
 */
export function calculateMessageSize(message: StoredMessage): number {
  // Estimate size: header + payload + metadata overhead
  const payloadSize = message.message.payload.length;
  const headerSize = 108; // Fixed header size
  const metadataOverhead = 200; // Rough estimate for other fields

  return payloadSize + headerSize + metadataOverhead;
}
