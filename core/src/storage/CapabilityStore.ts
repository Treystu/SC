/**
 * Capability-based Store-and-Forward
 *
 * Extends the message store with capability-gated participation
 * in the network's store-and-forward system. Nodes with canStore=true
 * accept and deliver messages for offline peers.
 */

import type { MessageStore, StoredMessage, MessageQuery, StorageStats } from "./MessageStore.js";
import { DeliveryStatus, MessagePriority, TTL_BY_PRIORITY } from "./MessageStore.js";
import type { NodeCapabilities } from "../node/capabilities.js";

/**
 * Configuration for capability-based store
 */
export interface CapabilityStoreConfig {
  /** Maximum storage quota in bytes */
  maxStorageBytes: number;
  /** Maximum messages to store */
  maxMessages: number;
  /** Cleanup interval in ms */
  cleanupInterval: number;
  /** Maximum message age before pruning (ms) */
  maxMessageAge: number;
  /** Maximum message size in bytes */
  maxMessageSize: number;
  /** Whether to accept relay messages */
  acceptRelayMessages: boolean;
}

/**
 * Default capability store configuration
 */
export const DEFAULT_CAPABILITY_STORE_CONFIG: CapabilityStoreConfig = {
  maxStorageBytes: 100 * 1024 * 1024, // 100 MB
  maxMessages: 10000,
  cleanupInterval: 60 * 1000, // 1 minute
  maxMessageAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxMessageSize: 1024 * 1024, // 1 MB
  acceptRelayMessages: true,
};

/**
 * Capability-gated Store-and-Forward Manager
 *
 * Wraps a MessageStore implementation with capability checks
 * and quota management for network-level store-forward participation.
 */
export class CapabilityStore {
  private store: MessageStore;
  private capabilities: NodeCapabilities;
  private config: CapabilityStoreConfig;
  private cleanupHandle?: ReturnType<typeof setInterval>;
  private active = false;

  constructor(
    store: MessageStore,
    capabilities: NodeCapabilities,
    config: Partial<CapabilityStoreConfig> = {}
  ) {
    this.store = store;
    this.capabilities = capabilities;
    this.config = { ...DEFAULT_CAPABILITY_STORE_CONFIG, ...config };

    // Adjust config based on capabilities
    if (capabilities.storage > 0) {
      this.config.maxStorageBytes = Math.min(
        this.config.maxStorageBytes,
        capabilities.storage * 1024 * 1024 // Convert MB to bytes
      );
    }
  }

  /**
   * Start the capability store
   */
  async start(): Promise<void> {
    await this.store.initialize();
    this.active = true;

    // Start periodic cleanup
    this.cleanupHandle = setInterval(
      () => this.performCleanup(),
      this.config.cleanupInterval
    );
  }

  /**
   * Stop the capability store
   */
  async stop(): Promise<void> {
    this.active = false;
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = undefined;
    }
    await this.store.close();
  }

  /**
   * Check if this node can accept a message for storage
   */
  canAcceptMessage(sizeBytes: number): boolean {
    if (!this.capabilities.canStore) return false;
    if (!this.active) return false;
    if (sizeBytes > this.config.maxMessageSize) return false;
    return true;
  }

  /**
   * Store a message for offline delivery
   * Only stores if node has storage capabilities
   */
  async storeForDelivery(message: StoredMessage): Promise<boolean> {
    if (!this.canAcceptMessage(message.sizeBytes)) {
      return false;
    }

    // Check quota
    const currentUsage = await this.store.getStorageUsed();
    if (currentUsage + message.sizeBytes > this.config.maxStorageBytes) {
      // Try to free space by evicting low priority messages
      const freed = await this.store.evictByPriority(message.sizeBytes);
      if (freed < message.sizeBytes) {
        return false; // Not enough space
      }
    }

    // Check message count
    const currentCount = await this.store.getMessageCount();
    if (currentCount >= this.config.maxMessages) {
      return false;
    }

    await this.store.store(message);
    return true;
  }

  /**
   * Retrieve stored messages for a peer
   */
  async retrieveForPeer(peerId: string): Promise<StoredMessage[]> {
    if (!this.active) return [];
    return this.store.getPendingForRecipient(peerId);
  }

  /**
   * Mark a message as delivered
   */
  async markDelivered(messageId: string): Promise<void> {
    await this.store.markDelivered(messageId);
  }

  /**
   * Get messages available for relay
   */
  async getRelayableMessages(
    excludeIds?: Set<string>
  ): Promise<StoredMessage[]> {
    if (!this.config.acceptRelayMessages) return [];
    return this.store.getForRelay(excludeIds);
  }

  /**
   * Perform periodic cleanup
   */
  private async performCleanup(): Promise<void> {
    if (!this.active) return;

    try {
      // Prune expired messages
      await this.store.pruneExpired();

      // Prune messages older than max age
      const expired = await this.store.query({
        createdAfter: 0,
        expiringBefore: Date.now(),
      });

      if (expired.length > 0) {
        await this.store.bulkDelete(expired.map((m) => m.id));
      }
    } catch (error) {
      // Cleanup errors are non-fatal
      console.error("[CapabilityStore] Cleanup error:", error);
    }
  }

  /**
   * Update capabilities (e.g., after re-detection)
   */
  updateCapabilities(capabilities: NodeCapabilities): void {
    this.capabilities = capabilities;
    // Adjust quota based on new capabilities
    if (capabilities.storage > 0) {
      this.config.maxStorageBytes = Math.min(
        DEFAULT_CAPABILITY_STORE_CONFIG.maxStorageBytes,
        capabilities.storage * 1024 * 1024
      );
    }
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<StorageStats> {
    return this.store.getStats();
  }

  /**
   * Get underlying message store (for direct operations)
   */
  getStore(): MessageStore {
    return this.store;
  }

  /**
   * Check if store is active
   */
  isActive(): boolean {
    return this.active && this.capabilities.canStore;
  }
}
