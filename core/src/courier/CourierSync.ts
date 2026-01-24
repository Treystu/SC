/**
 * CourierSync - Physical message carrying and sync protocol
 *
 * When two phones meet after being offline for days:
 * 1. Exchange bloom filters to identify missing messages
 * 2. Prioritize messages by: emergency > destination geo-zone > high priority
 * 3. Bidirectional sync up to storage limits
 * 4. Update local dedup state
 *
 * This is the core of apocalypse-resilient communication -
 * messages physically travel with people and vehicles.
 */

import type { StoredMessage, MessageStore } from "../storage/MessageStore.js";
import type { BloomFilter, BloomFilterState } from "../dedup/BloomFilter.js";
import { MessagePriority } from "../storage/MessageStore.js";

/**
 * Sync manifest exchanged at start of sync
 */
export interface SyncManifest {
  /** Peer ID of the device */
  peerId: string;

  /** Timestamp of manifest creation */
  timestamp: number;

  /** Total message count */
  messageCount: number;

  /** Bloom filter of message IDs */
  bloomFilter: BloomFilterState;

  /** Timestamp of oldest message */
  oldestMessage: number;

  /** Timestamp of newest message */
  newestMessage: number;

  /** Available storage in bytes */
  storageAvailable: number;

  /** Geo zones we have messages for */
  geoZones: string[];

  /** Device capabilities */
  capabilities: SyncCapabilities;
}

/**
 * Device sync capabilities
 */
export interface SyncCapabilities {
  /** Maximum message size we can accept */
  maxMessageSize: number;

  /** Maximum batch size */
  maxBatchSize: number;

  /** Supported compression (none, gzip, lz4) */
  compression: string[];

  /** Protocol version */
  protocolVersion: number;
}

/**
 * Sync negotiation result
 */
export interface SyncNegotiation {
  /** Messages we need from peer */
  messagesWeNeed: string[];

  /** Messages peer needs from us */
  messagesPeerNeeds: string[];

  /** Estimated bytes to receive */
  estimatedBytesToReceive: number;

  /** Estimated bytes to send */
  estimatedBytesToSend: number;

  /** Estimated sync duration in ms */
  estimatedDuration: number;

  /** Agreed compression */
  compression: string;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Sync was successful */
  success: boolean;

  /** Number of messages received */
  messagesReceived: number;

  /** Number of messages sent */
  messagesSent: number;

  /** Bytes received */
  bytesReceived: number;

  /** Bytes sent */
  bytesSent: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Any errors encountered */
  errors: SyncError[];

  /** Messages that failed to transfer */
  failedMessages: string[];
}

/**
 * Sync error
 */
export interface SyncError {
  messageId?: string;
  code: string;
  message: string;
  timestamp: number;
}

/**
 * Sync constraints for limited transfers
 */
export interface SyncConstraints {
  /** Maximum time allowed for sync (ms) */
  maxDuration: number;

  /** Maximum bytes to transfer */
  maxBytes: number;

  /** Only sync messages with these priorities or higher */
  minPriority: MessagePriority;

  /** Only sync messages for these geo zones */
  targetGeoZones?: string[];

  /** Prioritize own outbound messages */
  prioritizeOwn: boolean;
}

/**
 * Default sync constraints
 */
export const DEFAULT_SYNC_CONSTRAINTS: SyncConstraints = {
  maxDuration: 60_000,           // 60 seconds
  maxBytes: 50 * 1024 * 1024,    // 50 MB
  minPriority: MessagePriority.LOW,
  prioritizeOwn: true,
};

/**
 * Protocol version for compatibility checking
 */
export const SYNC_PROTOCOL_VERSION = 1;

/**
 * CourierSync handles bidirectional message sync between devices
 */
export class CourierSync {
  private messageStore: MessageStore;
  private bloomFilter: BloomFilter;
  private localPeerId: string;
  private geoZone?: string;

  constructor(
    messageStore: MessageStore,
    bloomFilter: BloomFilter,
    localPeerId: string,
    geoZone?: string
  ) {
    this.messageStore = messageStore;
    this.bloomFilter = bloomFilter;
    this.localPeerId = localPeerId;
    this.geoZone = geoZone;
  }

  /**
   * Generate our sync manifest
   */
  async generateManifest(): Promise<SyncManifest> {
    const stats = await this.messageStore.getStats();
    const _allIds = await this.messageStore.getAllIds();

    // Get unique geo zones from our messages
    const messages = await this.messageStore.query({});
    const geoZones = new Set<string>();
    for (const msg of messages) {
      if (msg.destinationGeoZone) {
        geoZones.add(msg.destinationGeoZone);
      }
    }

    return {
      peerId: this.localPeerId,
      timestamp: Date.now(),
      messageCount: stats.messageCount,
      bloomFilter: this.bloomFilter.export(),
      oldestMessage: stats.oldestMessage,
      newestMessage: stats.newestMessage,
      storageAvailable: 500 * 1024 * 1024 - stats.totalBytes, // 500MB - used
      geoZones: Array.from(geoZones),
      capabilities: {
        maxMessageSize: 1024 * 1024, // 1 MB
        maxBatchSize: 100,
        compression: ['none', 'gzip'],
        protocolVersion: SYNC_PROTOCOL_VERSION,
      },
    };
  }

  /**
   * Negotiate sync with peer based on manifests
   */
  async negotiateSync(
    ourManifest: SyncManifest,
    peerManifest: SyncManifest
  ): Promise<SyncNegotiation> {
    // Reconstruct peer's bloom filter
    const { BloomFilter } = await import("../dedup/BloomFilter.js");
    const peerBloom = BloomFilter.import(peerManifest.bloomFilter);

    // Find messages peer is missing
    const ourIds = await this.messageStore.getAllIds();
    const messagesPeerNeeds: string[] = [];

    for (const id of ourIds) {
      if (!peerBloom.mightContain(id)) {
        messagesPeerNeeds.push(id);
      }
    }

    // Find messages we're missing (peer will compute this)
    // For now, use empty - peer will tell us what they're sending
    const messagesWeNeed: string[] = [];

    // Estimate sizes
    const avgMessageSize = 1024; // 1KB average estimate
    const estimatedBytesToReceive = messagesWeNeed.length * avgMessageSize;
    const estimatedBytesToSend = messagesPeerNeeds.length * avgMessageSize;

    // Estimate duration based on BLE transfer (~100 KB/s typical)
    const totalBytes = estimatedBytesToReceive + estimatedBytesToSend;
    const estimatedDuration = (totalBytes / (100 * 1024)) * 1000;

    // Agree on compression
    const ourCompression = new Set(ourManifest.capabilities.compression);
    const peerCompression = peerManifest.capabilities.compression;
    let compression = 'none';
    if (ourCompression.has('gzip') && peerCompression.includes('gzip')) {
      compression = 'gzip';
    }

    return {
      messagesWeNeed,
      messagesPeerNeeds,
      estimatedBytesToReceive,
      estimatedBytesToSend,
      estimatedDuration,
      compression,
    };
  }

  /**
   * Prioritize messages for sync based on constraints
   */
  prioritizeForSync(
    messageIds: string[],
    messages: Map<string, StoredMessage>,
    constraints: SyncConstraints = DEFAULT_SYNC_CONSTRAINTS
  ): string[] {
    // Get full message objects
    const msgList: StoredMessage[] = [];
    for (const id of messageIds) {
      const msg = messages.get(id);
      if (msg) {
        // Filter by minimum priority
        if (msg.priority >= constraints.minPriority) {
          // Filter by target geo zones if specified
          if (!constraints.targetGeoZones ||
              (msg.destinationGeoZone && constraints.targetGeoZones.includes(msg.destinationGeoZone))) {
            msgList.push(msg);
          }
        }
      }
    }

    // Sort by priority
    msgList.sort((a, b) => {
      // 1. Own outbound first (if prioritizeOwn)
      if (constraints.prioritizeOwn) {
        if (a.isOwnMessage && !b.isOwnMessage) return -1;
        if (!a.isOwnMessage && b.isOwnMessage) return 1;
      }

      // 2. Higher priority first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }

      // 3. Older messages first (they've been waiting longer)
      return a.createdAt - b.createdAt;
    });

    // Apply byte limit
    let totalBytes = 0;
    const result: string[] = [];

    for (const msg of msgList) {
      if (totalBytes + msg.sizeBytes > constraints.maxBytes) {
        break;
      }
      result.push(msg.id);
      totalBytes += msg.sizeBytes;
    }

    return result;
  }

  /**
   * Perform full sync with a peer
   */
  async performSync(
    sendMessage: (msg: StoredMessage) => Promise<void>,
    receiveMessages: () => Promise<StoredMessage[]>,
    peerManifest: SyncManifest,
    constraints: SyncConstraints = DEFAULT_SYNC_CONSTRAINTS
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    const failedMessages: string[] = [];
    let messagesReceived = 0;
    let messagesSent = 0;
    let bytesReceived = 0;
    let bytesSent = 0;

    try {
      // Generate our manifest
      const ourManifest = await this.generateManifest();

      // Negotiate what to sync
      const negotiation = await this.negotiateSync(ourManifest, peerManifest);

      // Get messages to send
      const allMessages = await this.messageStore.query({});
      const messageMap = new Map<string, StoredMessage>();
      for (const msg of allMessages) {
        messageMap.set(msg.id, msg);
      }

      // Prioritize messages for sending
      const toSend = this.prioritizeForSync(
        negotiation.messagesPeerNeeds,
        messageMap,
        constraints
      );

      // Send messages
      for (const id of toSend) {
        // Check time limit
        if (Date.now() - startTime > constraints.maxDuration) {
          console.log('[CourierSync] Time limit reached, stopping send');
          break;
        }

        const msg = messageMap.get(id);
        if (!msg) continue;

        try {
          await sendMessage(msg);
          messagesSent++;
          bytesSent += msg.sizeBytes;
        } catch (err) {
          console.error(`[CourierSync] Failed to send message ${id}:`, err);
          failedMessages.push(id);
          errors.push({
            messageId: id,
            code: 'SEND_FAILED',
            message: String(err),
            timestamp: Date.now(),
          });
        }
      }

      // Receive messages
      const received = await receiveMessages();
      for (const msg of received) {
        // Check time limit
        if (Date.now() - startTime > constraints.maxDuration) {
          console.log('[CourierSync] Time limit reached, stopping receive');
          break;
        }

        // Check byte limit
        if (bytesReceived + msg.sizeBytes > constraints.maxBytes) {
          console.log('[CourierSync] Byte limit reached, stopping receive');
          break;
        }

        try {
          // Store the message
          await this.messageStore.store(msg);

          // Add to bloom filter
          this.bloomFilter.add(msg.id);

          messagesReceived++;
          bytesReceived += msg.sizeBytes;
        } catch (err) {
          console.error(`[CourierSync] Failed to store message ${msg.id}:`, err);
          errors.push({
            messageId: msg.id,
            code: 'STORE_FAILED',
            message: String(err),
            timestamp: Date.now(),
          });
        }
      }

      return {
        success: errors.length === 0,
        messagesReceived,
        messagesSent,
        bytesReceived,
        bytesSent,
        durationMs: Date.now() - startTime,
        errors,
        failedMessages,
      };

    } catch (err) {
      console.error('[CourierSync] Sync failed:', err);
      return {
        success: false,
        messagesReceived,
        messagesSent,
        bytesReceived,
        bytesSent,
        durationMs: Date.now() - startTime,
        errors: [{
          code: 'SYNC_FAILED',
          message: String(err),
          timestamp: Date.now(),
        }],
        failedMessages,
      };
    }
  }

  /**
   * Quick sync for dead phone mode - prioritizes critical messages
   * Unlike full sync, this doesn't require a peer manifest - just sends all matching messages
   */
  async quickSync(
    sendMessage: (msg: StoredMessage) => Promise<void>,
    receiveMessages: () => Promise<StoredMessage[]>,
    maxDurationMs: number = 120_000 // 2 minutes
  ): Promise<SyncResult> {
    // Create an empty peer manifest (peer has nothing, so they need everything)
    const { createBloomFilter } = await import("../dedup/BloomFilter.js");
    const emptyBloom = createBloomFilter(1000, 0.01);
    const emptyPeerManifest: SyncManifest = {
      peerId: "quick-sync-peer",
      timestamp: Date.now(),
      messageCount: 0,
      bloomFilter: emptyBloom.export(),
      oldestMessage: 0,
      newestMessage: 0,
      storageAvailable: 100 * 1024 * 1024,
      geoZones: [],
      capabilities: {
        maxMessageSize: 1024 * 1024,
        maxBatchSize: 100,
        compression: ["none", "gzip"],
        protocolVersion: SYNC_PROTOCOL_VERSION,
      },
    };

    return this.performSync(
      sendMessage,
      receiveMessages,
      emptyPeerManifest,
      {
        maxDuration: maxDurationMs,
        maxBytes: 10 * 1024 * 1024, // 10 MB
        minPriority: MessagePriority.HIGH, // Only HIGH and EMERGENCY
        prioritizeOwn: true,
      }
    );
  }
}

/**
 * Create a courier sync instance
 */
export function createCourierSync(
  messageStore: MessageStore,
  bloomFilter: BloomFilter,
  localPeerId: string,
  geoZone?: string
): CourierSync {
  return new CourierSync(messageStore, bloomFilter, localPeerId, geoZone);
}
