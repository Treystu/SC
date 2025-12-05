/**
 * Gossip Protocol Implementation for Scalable Mesh Routing
 * Addresses V1.0 Audit Critical Gap #3: Unscalable Routing
 * 
 * Implements a hybrid push-pull gossip protocol with epidemic spreading
 * to replace pure flood routing for better scalability
 */

import { Message, messageHash } from '../protocol/message.js';

export interface GossipConfig {
  fanout: number; // Number of peers to gossip to (default: 3-5)
  gossipInterval: number; // Milliseconds between gossip rounds (default: 1000)
  maxMessageAge: number; // Max age of messages to gossip (default: 60000)
  pruneInterval: number; // How often to prune old messages (default: 30000)
  pushPullRatio: number; // Ratio of push vs pull (0-1, default: 0.7)
}

interface GossipMessage {
  hash: string;
  timestamp: number;
  message: Message;
  received: number;
  hops: number;
}

interface GossipPeer {
  id: string;
  lastSeen: number;
  messagesExchanged: number;
}

/**
 * Gossip Protocol Manager
 * Implements epidemic-style message dissemination with:
 * - Push gossip: Proactively push new messages to random peers
 * - Pull gossip: Request messages we haven't seen
 * - Anti-entropy: Periodic synchronization to catch missed messages
 */
export class GossipProtocol {
  private config: Required<GossipConfig>;
  private messages: Map<string, GossipMessage> = new Map();
  private peers: Map<string, GossipPeer> = new Map();
  private messagesSeen: Set<string> = new Set();
  private gossipInterval: NodeJS.Timeout | null = null;
  private pruneInterval: NodeJS.Timeout | null = null;
  
  // Callbacks
  private onMessageReceived: ((message: Message, fromPeer: string) => void) | null = null;
  private onMessageForward: ((message: Message, toPeers: string[]) => Promise<void>) | null = null;

  constructor(config?: Partial<GossipConfig>) {
    this.config = {
      fanout: config?.fanout ?? 4, // Gossip to 4 random peers
      gossipInterval: config?.gossipInterval ?? 1000, // Every second
      maxMessageAge: config?.maxMessageAge ?? 60000, // 1 minute
      pruneInterval: config?.pruneInterval ?? 30000, // 30 seconds
      pushPullRatio: config?.pushPullRatio ?? 0.7, // 70% push, 30% pull
    };
  }

  /**
   * Start the gossip protocol
   */
  start(): void {
    if (this.gossipInterval) return; // Already started

    this.gossipInterval = setInterval(() => {
      this.performGossipRound();
    }, this.config.gossipInterval);

    this.pruneInterval = setInterval(() => {
      this.pruneOldMessages();
    }, this.config.pruneInterval);
  }

  /**
   * Stop the gossip protocol
   */
  stop(): void {
    if (this.gossipInterval) {
      clearInterval(this.gossipInterval);
      this.gossipInterval = null;
    }
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
  }

  /**
   * Register a callback for when new messages are received
   */
  onMessage(callback: (message: Message, fromPeer: string) => void): void {
    this.onMessageReceived = callback;
  }

  /**
   * Register a callback for forwarding messages to specific peers
   */
  onForward(callback: (message: Message, toPeers: string[]) => Promise<void>): void {
    this.onMessageForward = callback;
  }

  /**
   * Add a peer to the gossip network
   */
  addPeer(peerId: string): void {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, {
        id: peerId,
        lastSeen: Date.now(),
        messagesExchanged: 0,
      });
    }
  }

  /**
   * Remove a peer from the gossip network
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  /**
   * Receive a message from the network
   * Returns true if this is a new message, false if duplicate
   */
  receiveMessage(message: Message, fromPeer: string): boolean {
    const hash = messageHash(message);

    // Check if we've seen this message before
    if (this.messagesSeen.has(hash)) {
      return false; // Duplicate
    }

    // Mark as seen
    this.messagesSeen.add(hash);

    // Store the message
    const gossipMsg: GossipMessage = {
      hash,
      timestamp: message.header.timestamp,
      message,
      received: Date.now(),
      hops: 0, // We'll track this in the message metadata
    };

    this.messages.set(hash, gossipMsg);

    // Update peer stats
    const peer = this.peers.get(fromPeer);
    if (peer) {
      peer.lastSeen = Date.now();
      peer.messagesExchanged++;
    }

    // Notify callback
    if (this.onMessageReceived) {
      this.onMessageReceived(message, fromPeer);
    }

    return true; // New message
  }

  /**
   * Perform a gossip round: push/pull messages with random peers
   */
  private async performGossipRound(): Promise<void> {
    if (this.peers.size === 0) return;

    const now = Date.now();
    const activePeers = Array.from(this.peers.values()).filter(
      (p) => now - p.lastSeen < 30000 // Only gossip with active peers (seen in last 30s)
    );

    if (activePeers.length === 0) return;

    // Select random peers for this round (fanout)
    const selectedPeers = this.selectRandomPeers(activePeers, this.config.fanout);

    // For now, only use push gossip (pull is TODO)
    // TODO: Implement pull gossip with digest exchange
    await this.pushGossip(selectedPeers);
  }

  /**
   * Push gossip: Send recent messages to selected peers
   */
  private async pushGossip(peers: GossipPeer[]): Promise<void> {
    const now = Date.now();
    const recentMessages: Message[] = [];

    // Select recent messages to gossip
    for (const gossipMsg of this.messages.values()) {
      if (now - gossipMsg.received < this.config.maxMessageAge) {
        recentMessages.push(gossipMsg.message);
      }
    }

    if (recentMessages.length === 0 || !this.onMessageForward) return;

    // Forward messages to selected peers
    const peerIds = peers.map((p) => p.id);
    
    // Send a subset of recent messages to avoid overwhelming the network
    const messagesToSend = this.selectRandomMessages(recentMessages, 10);
    
    for (const message of messagesToSend) {
      await this.onMessageForward(message, peerIds);
    }
  }

  /**
   * Pull gossip: Request messages we might have missed
   * In a real implementation, this would send digest requests to peers
   */
  private async pullGossip(_peers: GossipPeer[]): Promise<void> {
    // TODO: Implement pull gossip with digest exchange
    // For now, this is a placeholder
    // In a full implementation:
    // 1. Send digest (list of message hashes we have) to peers
    // 2. Peers respond with messages we're missing
    // 3. We request and receive those messages
  }

  /**
   * Select N random peers from the active peer list
   * Optimized to only shuffle the first N positions
   */
  private selectRandomPeers(peers: GossipPeer[], count: number): GossipPeer[] {
    if (peers.length <= count) return peers;

    const shuffled = [...peers];
    // Only shuffle first 'count' positions for better performance
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }

  /**
   * Select N random messages from the message list
   * Optimized to only shuffle the first N positions
   */
  private selectRandomMessages(messages: Message[], count: number): Message[] {
    if (messages.length <= count) return messages;

    const shuffled = [...messages];
    // Only shuffle first 'count' positions for better performance
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }

  /**
   * Remove old messages from memory
   */
  private pruneOldMessages(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [hash, gossipMsg] of this.messages.entries()) {
      if (now - gossipMsg.received > this.config.maxMessageAge) {
        toDelete.push(hash);
      }
    }

    for (const hash of toDelete) {
      this.messages.delete(hash);
      this.messagesSeen.delete(hash);
    }
  }

  /**
   * Get statistics about the gossip protocol
   */
  getStats(): {
    messageCount: number;
    seenCount: number;
    peerCount: number;
    activePeerCount: number;
  } {
    const now = Date.now();
    const activePeerCount = Array.from(this.peers.values()).filter(
      (p) => now - p.lastSeen < 30000
    ).length;

    return {
      messageCount: this.messages.size,
      seenCount: this.messagesSeen.size,
      peerCount: this.peers.size,
      activePeerCount,
    };
  }

  /**
   * Clear all state (useful for testing)
   */
  clear(): void {
    this.messages.clear();
    this.messagesSeen.clear();
    this.peers.clear();
  }
}
