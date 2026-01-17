/**
 * Message Relay and Flood Routing Implementation
 */

import type { Message } from "../protocol/message";
import { MessageType, decodeMessage, messageHash } from "../protocol/message";
import { RoutingTable } from "./routing.js";

export interface RelayStats {
  messagesReceived: number;
  messagesForwarded: number;
  messagesDuplicate: number;
  messagesExpired: number;
  messagesForSelf: number;
  messagesStored: number;
  relayFailures: number;
  loopsDetected: number;
}

export interface StoredMessage {
  message: Message;
  destinationPeerId: string;
  attempts: number;
  lastAttempt: number;
  expiresAt: number;
  priority: 'high' | 'normal' | 'low';
  routeAttempts: string[];
}

export interface RelayConfig {
  maxStoredMessages?: number;
  storeTimeout?: number;
  maxRetries?: number;
  retryBackoff?: number;
  floodRateLimit?: number; // messages per second per peer
  selectiveFlooding?: boolean;
  retryInterval?: number; // Auto-retry interval in milliseconds
}

/**
 * Persistence Adapter Interface
 * Allows plugging in different storage backends (Memory, IndexedDB, SQLite, etc.)
 */
export interface PersistenceAdapter {
  saveMessage(id: string, message: StoredMessage): Promise<void>;
  getMessage(id: string): Promise<StoredMessage | null>;
  removeMessage(id: string): Promise<void>;
  getAllMessages(): Promise<Map<string, StoredMessage>>;
  pruneExpired(now: number): Promise<void>;
  size(): Promise<number>;
}

/**
 * Default In-Memory Persistence Adapter
 */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private storage: Map<string, StoredMessage> = new Map();

  async saveMessage(id: string, message: StoredMessage): Promise<void> {
    this.storage.set(id, message);
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    return this.storage.get(id) || null;
  }

  async removeMessage(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async getAllMessages(): Promise<Map<string, StoredMessage>> {
    return new Map(this.storage);
  }

  async pruneExpired(now: number): Promise<void> {
    for (const [id, msg] of this.storage.entries()) {
      if (msg.expiresAt < now) {
        this.storage.delete(id);
      }
    }
  }

  async size(): Promise<number> {
    return this.storage.size;
  }
}

/**
 * Message Relay Engine
 * Implements flood routing with TTL, deduplication, and store-and-forward
 */
export class MessageRelay {
  private routingTable: RoutingTable;
  private localPeerId: string;
  private stats: RelayStats = {
    messagesReceived: 0,
    messagesForwarded: 0,
    messagesDuplicate: 0,
    messagesExpired: 0,
    messagesForSelf: 0,
    messagesStored: 0,
    relayFailures: 0,
    loopsDetected: 0,
  };

  private persistence: PersistenceAdapter;
  private messageRoutes: Map<string, string[]> = new Map(); // messageHash -> path of peer IDs
  private peerFloodCounter: Map<string, number[]> = new Map(); // peerId -> timestamps
  private config: RelayConfig;
  private retryInterval?: NodeJS.Timeout;

  // Callbacks
  private onMessageForSelfCallback?: (message: Message) => void;
  private onForwardMessageCallback?: (
    message: Message,
    excludePeerId: string,
  ) => void;

  constructor(
    localPeerId: string,
    routingTable: RoutingTable,
    config: RelayConfig = {},
    persistence?: PersistenceAdapter,
  ) {
    this.localPeerId = localPeerId;
    this.routingTable = routingTable;
    this.config = {
      maxStoredMessages: config.maxStoredMessages || 1000,
      // IMPROVED: 24 hours instead of 5 minutes for better offline delivery
      storeTimeout: config.storeTimeout || 86400000, // 24 hours (was 5 minutes)
      // IMPROVED: 10 retries instead of 3 for better delivery reliability
      maxRetries: config.maxRetries || 10, // (was 3)
      retryBackoff: config.retryBackoff || 5000, // 5 seconds
      floodRateLimit: config.floodRateLimit || 100, // 100 msg/sec per peer
      selectiveFlooding: config.selectiveFlooding !== false,
      // IMPROVED: Retry every 30 seconds instead of 10 for less aggressive retries
      retryInterval: config.retryInterval || 30000, // 30 seconds (was 10 seconds)
    };
    this.persistence = persistence || new MemoryPersistenceAdapter();
  }

  /**
   * Process incoming message and decide whether to forward, deliver, or drop
   */
  async processMessage(
    messageData: Uint8Array,
    fromPeerId: string,
  ): Promise<void> {
    this.stats.messagesReceived++;

    let message: Message;
    try {
      message = decodeMessage(messageData);
    } catch (error) {
      console.error("Failed to decode message:", error);
      return;
    }

    // Step 1: Check if we've seen this message before (deduplication)
    const hash = messageHash(message);
    console.log(`[MessageRelay] Processing message from ${fromPeerId}, type=${message.header.type}, hash=${hash.substring(0, 8)}`);
    
    if (this.routingTable.hasSeenMessage(hash)) {
      this.stats.messagesDuplicate++;
      console.log(`[MessageRelay] Dropping duplicate message ${hash.substring(0, 8)}`);
      return; // Drop duplicate
    }

    // Step 2: Check for routing loops
    if (this.detectLoop(hash, fromPeerId)) {
      this.stats.loopsDetected++;
      console.log(`[MessageRelay] Dropping looped message ${hash.substring(0, 8)}`);
      return; // Drop looped message
    }

    // Mark as seen
    this.routingTable.markMessageSeen(hash);

    // Step 3: Check TTL
    if (message.header.ttl === 0) {
      this.stats.messagesExpired++;
      console.log(`[MessageRelay] Dropping expired message (TTL=0)`);
      return; // Drop expired message
    }

    // Step 4: Check flood rate limit
    if (!this.checkFloodRateLimit(fromPeerId)) {
      console.log(`[MessageRelay] Dropping message due to flood rate limit`);
      return; // Drop if flooding too fast
    }

    // Step 5: Determine message relevance and forwarding policy
    const isBroadcast = this.isBroadcastMessage(message.header.type);
    const isTarget = this.isMessageForSelf(message);
    
    console.log(`[MessageRelay] Message analysis: isBroadcast=${isBroadcast}, isTarget=${isTarget}, localPeerId=${this.localPeerId}`);

    // Deliver to self if we are target or it's a broadcast
    if (isTarget || isBroadcast) {
      if (isTarget) this.stats.messagesForSelf++;
      console.log(`[MessageRelay] ========== DELIVERING MESSAGE TO SELF ==========`);
      this.onMessageForSelfCallback?.(message);
    } else {
      console.log(`[MessageRelay] Message NOT for self, will forward`);
    }

    // Determine if we should stop forwarding (Unicast to us)
    // If it's Unicast to us, we stop.
    // If it's Broadcast, we continue forwarding.
    // If it's Unicast to someone else, we continue forwarding.
    if (isTarget && !isBroadcast) {
      return; // Stop forwarding Unicast addressed to us
    }

    // Step 6: Decrement TTL for forwarding
    const forwardMessage: Message = {
      header: {
        ...message.header,
        ttl: message.header.ttl - 1,
      },
      payload: message.payload,
    };

    // Step 7: Forward to all peers except sender (Smart/Flood routing)
    if (forwardMessage.header.ttl > 0) {
      if (this.shouldForwardMessage(forwardMessage)) {
        this.stats.messagesForwarded++;
        this.onForwardMessageCallback?.(forwardMessage, fromPeerId);
      }
    }
  }

  /**
   * Detect routing loops based on message path
   */
  private detectLoop(messageHash: string, fromPeerId: string): boolean {
    if (!this.messageRoutes.has(messageHash)) {
      this.messageRoutes.set(messageHash, []);
    }

    const path = this.messageRoutes.get(messageHash)!;

    // Check if we've seen this peer in the path
    if (path.includes(fromPeerId)) {
      return true; // Loop detected
    }

    // Add to path
    path.push(fromPeerId);

    // Limit path tracking (cleanup old entries)
    if (this.messageRoutes.size > 10000) {
      const keys = Array.from(this.messageRoutes.keys());
      for (let i = 0; i < 1000; i++) {
        this.messageRoutes.delete(keys[i]);
      }
    }

    return false;
  }

  /**
   * Check flood rate limit for a peer
   */
  private checkFloodRateLimit(peerId: string): boolean {
    const now = Date.now();

    if (!this.peerFloodCounter.has(peerId)) {
      this.peerFloodCounter.set(peerId, []);
    }

    const timestamps = this.peerFloodCounter.get(peerId)!;

    // Remove timestamps older than 1 second
    const recentTimestamps = timestamps.filter((t) => now - t < 1000);

    // Check rate limit
    if (recentTimestamps.length >= this.config.floodRateLimit!) {
      return false; // Rate limit exceeded
    }

    // Add current timestamp
    recentTimestamps.push(now);
    this.peerFloodCounter.set(peerId, recentTimestamps);

    return true;
  }

  /**
   * Determine if message should be forwarded (selective flooding)
   */
  private shouldForwardMessage(message: Message): boolean {
    if (!this.config.selectiveFlooding) {
      return true; // Forward all messages
    }

    // Always forward control messages
    if (this.isControlMessage(message.header.type)) {
      return true;
    }

    // For other messages, use selective criteria
    // (Can be extended with topic-based filtering, etc.)
    return true;
  }

  /**
   * Check if message type is control
   */
  private isControlMessage(type: MessageType): boolean {
    return (
      type === MessageType.CONTROL_PING ||
      type === MessageType.CONTROL_PONG ||
      type === MessageType.CONTROL_ACK
    );
  }

  /**
   * Check if message is addressed to this peer
   */
  private isMessageForSelf(message: Message): boolean {
    // For broadcast messages (PEER_DISCOVERY, etc.), everyone processes them
    if (this.isBroadcastMessage(message.header.type)) {
      return true;
    }

    // DHT Messages are point-to-point RPCs, so they are always "for self" (the next hop)
    // The DHT logic itself handles further recursion if needed (e.g. iterative lookup)
    if (
      message.header.type >= MessageType.DHT_FIND_NODE &&
      message.header.type <= MessageType.DHT_FOUND_VALUE
    ) {
      return true;
    }

    // Payload Inspection for Recipient ID (since Header doesn't have it yet)
    try {
      // Decode payload to JSON
      const payloadStr = new TextDecoder().decode(message.payload);
      const data = JSON.parse(payloadStr);

      if (data.recipient) {
        // Normalize both IDs to uppercase for comparison
        const normalizedRecipient = data.recipient.replace(/\s/g, "").toUpperCase();
        const normalizedLocalId = this.localPeerId.replace(/\s/g, "").toUpperCase();
        
        console.log(`[MessageRelay] Checking recipient: ${normalizedRecipient} vs localPeerId: ${normalizedLocalId}`);
        
        if (normalizedRecipient === normalizedLocalId) {
          return true;
        }
      }
    } catch (e) {
      // Ignore parsing errors, assume not for us if we can't read it
    }

    return false;
  }

  /**
   * Check if message type is broadcast
   */
  private isBroadcastMessage(type: MessageType): boolean {
    return (
      type === MessageType.PEER_DISCOVERY ||
      type === MessageType.PEER_INTRODUCTION ||
      type === MessageType.CONTROL_PING ||
      type === MessageType.CONTROL_PONG
    );
  }

  /**
   * Store message for offline peer (store-and-forward)
   */
  async storeMessage(
    message: Message,
    destinationPeerId: string,
  ): Promise<void> {
    const currentSize = await this.persistence.size();
    if (currentSize >= this.config.maxStoredMessages!) {
      // Remove oldest message
      // Note: This is less efficient with async persistence, might need optimization
      const allMessages = await this.persistence.getAllMessages();
      const oldest = Array.from(allMessages.entries()).sort(
        (a, b) => a[1].lastAttempt - b[1].lastAttempt,
      )[0];
      if (oldest) {
        await this.persistence.removeMessage(oldest[0]);
      }
    }

    const hash = messageHash(message);
    await this.persistence.saveMessage(hash, {
      message,
      destinationPeerId,
      attempts: 0,
      lastAttempt: Date.now(),
      expiresAt: Date.now() + this.config.storeTimeout!,
      priority: 'normal',
      routeAttempts: [],
    });

    this.stats.messagesStored++;
  }

  /**
   * Retry forwarding stored messages with sneakernet approach
   */
  async retryStoredMessages(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];
    const allMessages = await this.persistence.getAllMessages();

    // Get all connected peers for potential relay
    const connectedPeers = this.routingTable.getAllPeers().filter(p => p.state === 'connected');
    
    for (const [hash, stored] of allMessages.entries()) {
      // Check expiry
      if (stored.expiresAt < now) {
        toDelete.push(hash);
        this.stats.messagesExpired++;
        continue;
      }

      // Check retry backoff
      const timeSinceLastAttempt = now - stored.lastAttempt;
      const backoffTime = this.config.retryBackoff! * Math.pow(2, stored.attempts);

      if (timeSinceLastAttempt < backoffTime) {
        continue; // Not time to retry yet
      }

      // SNEAKERNET APPROACH: Try multiple routing strategies
      let deliveryAttempted = false;
      
      // Strategy 1: Direct delivery if target peer is connected
      const targetPeer = this.routingTable.getPeer(stored.destinationPeerId);
      if (targetPeer && targetPeer.state === 'connected') {
        console.log(`[MessageRelay] 🎯 Direct delivery to ${stored.destinationPeerId}`);
        this.onForwardMessageCallback?.(stored.message, "");
        deliveryAttempted = true;
      }
      // Strategy 2: Relay through any connected peer (sneakernet)
      // IMPROVED: Try ALL available peers per cycle for maximum delivery probability
      else if (connectedPeers.length > 0) {
        // Try each connected peer as a potential relay
        let relayCount = 0;
        for (const relayPeer of connectedPeers) {
          // Don't try the same relay peer twice for the same message
          if (stored.routeAttempts.includes(relayPeer.id)) {
            continue;
          }

          console.log(`[MessageRelay] 🚸 Sneakernet relay via ${relayPeer.id} to reach ${stored.destinationPeerId}`);

          // Mark this peer as attempted for routing
          stored.routeAttempts.push(relayPeer.id);

          // Forward message through this peer
          this.onForwardMessageCallback?.(stored.message, relayPeer.id);
          deliveryAttempted = true;
          relayCount++;
          // IMPROVED: Try ALL peers instead of just one per cycle
          // This maximizes the chance of reaching the destination
        }
        if (relayCount > 0) {
          console.log(`[MessageRelay] 📤 Relayed message to ${relayCount} peers for ${stored.destinationPeerId}`);
        }
      }

      // Update attempt tracking
      stored.attempts++;
      stored.lastAttempt = now;

      if (!deliveryAttempted) {
        console.log(`[MessageRelay] ❌ No delivery path available for ${stored.destinationPeerId}`);
      }

      // Check if we've exceeded max retries
      if (stored.attempts > this.config.maxRetries!) {
        console.log(`[MessageRelay] 💀 Giving up on message to ${stored.destinationPeerId} after ${stored.attempts} attempts`);
        toDelete.push(hash);
        this.stats.relayFailures++;
      } else {
        // Update stored state with new route attempts
        await this.persistence.saveMessage(hash, stored);
        this.stats.messagesForwarded++;
      }
    }

    // Clean up expired/failed messages
    for (const hash of toDelete) {
      await this.persistence.removeMessage(hash);
    }

    // Log statistics
    if (allMessages.size > 0) {
      console.log(`[MessageRelay] 📊 Retry cycle complete: ${allMessages.size - toDelete.length} messages retained, ${toDelete.length} cleaned up`);
    }
  }

  /**
   * Get stored messages statistics
   */
  async getStoredMessagesStats() {
    const allMessages = await this.persistence.getAllMessages();
    return {
      total: allMessages.size,
      byDestination: Array.from(allMessages.values()).reduce(
        (acc, msg) => {
          acc[msg.destinationPeerId] = (acc[msg.destinationPeerId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  /**
   * Register callback for messages addressed to this peer
   */
  onMessageForSelf(callback: (message: Message) => void): void {
    this.onMessageForSelfCallback = callback;
  }

  /**
   * Register callback for forwarding messages
   */
  onForwardMessage(
    callback: (message: Message, excludePeerId: string) => void,
  ): void {
    this.onForwardMessageCallback = callback;
  }

  /**
   * Start automatic retry process
   */
  start(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    
    console.log(`[MessageRelay] 🚀 Starting automatic retry every ${this.config.retryInterval}ms`);
    this.retryInterval = setInterval(() => {
      this.retryStoredMessages().catch(error => {
        console.error('[MessageRelay] Error in automatic retry:', error);
      });
    }, this.config.retryInterval!);
  }

  /**
   * Stop automatic retry process
   */
  stop(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = undefined;
      console.log('[MessageRelay] 🛑 Stopped automatic retry');
    }
  }

  /**
   * Get relay statistics
   */
  getStats(): RelayStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messagesReceived: 0,
      messagesForwarded: 0,
      messagesDuplicate: 0,
      messagesExpired: 0,
      messagesForSelf: 0,
      messagesStored: 0,
      relayFailures: 0,
      loopsDetected: 0,
    };
  }
}

/**
 * Message Fragmentation for Large Messages
 */
export interface MessageFragment {
  messageId: string;
  fragmentIndex: number;
  totalFragments: number;
  data: Uint8Array;
  timestamp: number;
}

export const MAX_FRAGMENT_SIZE = 16384; // 16KB per fragment
export const MIN_FRAGMENT_SIZE = 512; // 512 bytes minimum

/**
 * Calculate optimal fragment size based on MTU and network conditions
 */
export function calculateFragmentSize(
  mtu: number = 1500,
  overhead: number = 100,
): number {
  const optimalSize = mtu - overhead;
  return Math.max(MIN_FRAGMENT_SIZE, Math.min(MAX_FRAGMENT_SIZE, optimalSize));
}

/**
 * Fragment a large message into smaller chunks
 */
export function fragmentMessage(
  message: Uint8Array,
  messageId: string,
  fragmentSize: number = MAX_FRAGMENT_SIZE,
): MessageFragment[] {
  const fragments: MessageFragment[] = [];
  const totalFragments = Math.ceil(message.length / fragmentSize);

  for (let i = 0; i < totalFragments; i++) {
    const start = i * fragmentSize;
    const end = Math.min(start + fragmentSize, message.length);
    const data = message.slice(start, end);

    fragments.push({
      messageId,
      fragmentIndex: i,
      totalFragments,
      data,
      timestamp: Date.now(),
    });
  }

  return fragments;
}

/**
 * Calculate fragmentation overhead
 */
export function calculateFragmentationOverhead(
  messageSize: number,
  fragmentSize: number = MAX_FRAGMENT_SIZE,
): number {
  const totalFragments = Math.ceil(messageSize / fragmentSize);
  const headerOverhead = 50; // Approximate header size per fragment
  return totalFragments * headerOverhead;
}

/**
 * Message Reassembly Engine with timeout and memory limits
 */
export class MessageReassembler {
  private fragments: Map<string, Map<number, Uint8Array>> = new Map();
  private totalFragments: Map<string, number> = new Map();
  private fragmentTimestamps: Map<string, number> = new Map();
  private onCompleteCallback?: (messageId: string, message: Uint8Array) => void;
  private readonly REASSEMBLY_TIMEOUT = 60000; // 60 seconds
  private readonly MAX_REASSEMBLY_BUFFER = 100 * 1024 * 1024; // 100 MB
  private currentBufferSize = 0;

  /**
   * Add a fragment to the reassembly buffer
   */
  addFragment(fragment: MessageFragment): boolean {
    const { messageId, fragmentIndex, totalFragments, data } = fragment;

    // Check for duplicate fragments
    if (this.fragments.has(messageId)) {
      const messageFragments = this.fragments.get(messageId)!;
      if (messageFragments.has(fragmentIndex)) {
        return false; // Duplicate fragment
      }
    }

    // Initialize fragment map for this message if needed
    if (!this.fragments.has(messageId)) {
      this.fragments.set(messageId, new Map());
      this.totalFragments.set(messageId, totalFragments);
      this.fragmentTimestamps.set(messageId, Date.now());
    }

    // Check memory limits
    if (this.currentBufferSize + data.length > this.MAX_REASSEMBLY_BUFFER) {
      this.cleanupOldest();
    }

    // Add fragment
    const messageFragments = this.fragments.get(messageId)!;
    messageFragments.set(fragmentIndex, data);
    this.currentBufferSize += data.length;

    // Check if we have all fragments
    if (messageFragments.size === totalFragments) {
      this.reassembleMessage(messageId);
      return true; // Message complete
    }

    return false; // Still waiting for more fragments
  }

  /**
   * Reassemble complete message from fragments (handles out-of-order)
   */
  private reassembleMessage(messageId: string): void {
    const messageFragments = this.fragments.get(messageId);
    const totalFragments = this.totalFragments.get(messageId);

    if (!messageFragments || !totalFragments) {
      return;
    }

    // Calculate total size
    let totalSize = 0;
    for (let i = 0; i < totalFragments; i++) {
      const fragment = messageFragments.get(i);
      if (!fragment) {
        console.error(`Missing fragment ${i} for message ${messageId}`);
        return;
      }
      totalSize += fragment.length;
    }

    // Reassemble in correct order
    const completeMessage = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < totalFragments; i++) {
      const fragment = messageFragments.get(i)!;
      completeMessage.set(fragment, offset);
      offset += fragment.length;
    }

    // Update buffer size
    this.currentBufferSize -= totalSize;

    // Clean up
    this.fragments.delete(messageId);
    this.totalFragments.delete(messageId);
    this.fragmentTimestamps.delete(messageId);

    // Notify completion
    this.onCompleteCallback?.(messageId, completeMessage);
  }

  /**
   * Register callback for completed messages
   */
  onComplete(callback: (messageId: string, message: Uint8Array) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * Clean up expired incomplete messages
   */
  cleanup(maxAgeMs: number = this.REASSEMBLY_TIMEOUT): number {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [messageId, timestamp] of this.fragmentTimestamps.entries()) {
      if (now - timestamp > maxAgeMs) {
        toDelete.push(messageId);
      }
    }

    let freedBytes = 0;
    for (const messageId of toDelete) {
      const messageFragments = this.fragments.get(messageId);
      if (messageFragments) {
        for (const fragment of messageFragments.values()) {
          freedBytes += fragment.length;
        }
      }
      this.fragments.delete(messageId);
      this.totalFragments.delete(messageId);
      this.fragmentTimestamps.delete(messageId);
    }

    this.currentBufferSize -= freedBytes;
    return toDelete.length;
  }

  /**
   * Clean up oldest incomplete message to free memory
   */
  private cleanupOldest(): void {
    if (this.fragmentTimestamps.size === 0) return;

    const oldest = Array.from(this.fragmentTimestamps.entries()).sort(
      (a, b) => a[1] - b[1],
    )[0];

    if (oldest) {
      const [messageId] = oldest;
      const messageFragments = this.fragments.get(messageId);

      if (messageFragments) {
        for (const fragment of messageFragments.values()) {
          this.currentBufferSize -= fragment.length;
        }
      }

      this.fragments.delete(messageId);
      this.totalFragments.delete(messageId);
      this.fragmentTimestamps.delete(messageId);
    }
  }

  /**
   * Get reassembly statistics
   */
  getStats() {
    return {
      incompleteMessages: this.fragments.size,
      fragmentsWaiting: Array.from(this.fragments.values()).reduce(
        (sum, map) => sum + map.size,
        0,
      ),
      bufferUsage: this.currentBufferSize,
      bufferLimit: this.MAX_REASSEMBLY_BUFFER,
    };
  }
}
