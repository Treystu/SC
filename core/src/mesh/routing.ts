/**
 * Mesh networking core - routing table and peer management
 */

import { MessageType } from '../protocol/message';

export interface Peer {
  id: string; // Hex-encoded public key
  publicKey: Uint8Array;
  lastSeen: number;
  connectedAt: number;
  transportType: 'webrtc' | 'bluetooth' | 'local';
  connectionQuality: number; // 0-100
  bytesSent: number;
  bytesReceived: number;
}

export interface Route {
  destination: string;
  nextHop: string;
  hopCount: number;
  timestamp: number;
}

/**
 * In-memory routing table for mesh network
 */
export class RoutingTable {
  private routes: Map<string, Route> = new Map();
  private peers: Map<string, Peer> = new Map();
  private messageCache: Map<string, number> = new Map(); // hash -> timestamp
  private readonly MAX_CACHE_SIZE = 10000;
  private readonly CACHE_TTL = 60000; // 60 seconds

  /**
   * Add or update a peer
   */
  addPeer(peer: Peer): void {
    this.peers.set(peer.id, peer);
    // Direct route to connected peer
    this.routes.set(peer.id, {
      destination: peer.id,
      nextHop: peer.id,
      hopCount: 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove a peer
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    this.routes.delete(peerId);
    // Remove routes that go through this peer
    for (const [dest, route] of this.routes.entries()) {
      if (route.nextHop === peerId) {
        this.routes.delete(dest);
      }
    }
  }

  /**
   * Get a peer by ID
   */
  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Get all connected peers
   */
  getAllPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Update peer last seen timestamp
   */
  updatePeerLastSeen(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }

  /**
   * Add or update a route
   */
  addRoute(route: Route): void {
    const existing = this.routes.get(route.destination);
    // Only update if new route is better (fewer hops) or newer
    if (!existing || route.hopCount < existing.hopCount || 
        (route.hopCount === existing.hopCount && route.timestamp > existing.timestamp)) {
      this.routes.set(route.destination, route);
    }
  }

  /**
   * Get next hop for a destination
   */
  getNextHop(destination: string): string | undefined {
    const route = this.routes.get(destination);
    return route?.nextHop;
  }

  /**
   * Check if message has been seen (for deduplication)
   */
  hasSeenMessage(messageHash: string): boolean {
    return this.messageCache.has(messageHash);
  }

  /**
   * Mark message as seen
   */
  markMessageSeen(messageHash: string): void {
    this.messageCache.set(messageHash, Date.now());
    this.cleanupMessageCache();
  }

  /**
   * Clean up old entries from message cache
   */
  private cleanupMessageCache(): void {
    if (this.messageCache.size < this.MAX_CACHE_SIZE) {
      return;
    }

    const now = Date.now();
    const toDelete: string[] = [];

    for (const [hash, timestamp] of this.messageCache.entries()) {
      if (now - timestamp > this.CACHE_TTL) {
        toDelete.push(hash);
      }
    }

    toDelete.forEach(hash => this.messageCache.delete(hash));
  }

  /**
   * Remove stale peers (haven't been seen recently)
   */
  removeStalepeers(timeoutMs: number = 60000): string[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > timeoutMs) {
        stale.push(id);
      }
    }

    stale.forEach(id => this.removePeer(id));
    return stale;
  }

  /**
   * Get routing table statistics
   */
  getStats() {
    return {
      peerCount: this.peers.size,
      routeCount: this.routes.size,
      cacheSize: this.messageCache.size,
    };
  }
}

/**
 * Message priority queue
 */
export class MessageQueue {
  private queues: Map<MessageType, Array<{ message: any; timestamp: number }>> = new Map();
  private readonly priorities = [
    MessageType.CONTROL_PING,
    MessageType.CONTROL_PONG,
    MessageType.CONTROL_ACK,
    MessageType.VOICE,
    MessageType.TEXT,
    MessageType.FILE_CHUNK,
    MessageType.FILE_METADATA,
  ];

  enqueue(messageType: MessageType, message: any): void {
    if (!this.queues.has(messageType)) {
      this.queues.set(messageType, []);
    }
    this.queues.get(messageType)!.push({ message, timestamp: Date.now() });
  }

  dequeue(): any | null {
    // Process queues in priority order
    for (const priority of this.priorities) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        const item = queue.shift();
        return item?.message || null;
      }
    }
    return null;
  }

  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  clear(): void {
    this.queues.clear();
  }
}
