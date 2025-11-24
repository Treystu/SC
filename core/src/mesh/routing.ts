/**
 * Mesh networking core - routing table and peer management
 */

import { MessageType } from '../protocol/message';

export enum PeerState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DEGRADED = 'degraded',
  DISCONNECTED = 'disconnected',
}

export interface PeerCapabilities {
  maxBandwidth?: number;
  supportedTransports: ('webrtc' | 'bluetooth' | 'local')[];
  protocolVersion: number;
  features: string[];
}

export interface PeerMetadata {
  capabilities: PeerCapabilities;
  reputation: number; // 0-100, default 50
  blacklisted: boolean;
  blacklistExpiry?: number;
  failureCount: number;
  successCount: number;
}

export interface Peer {
  id: string; // Hex-encoded public key
  publicKey: Uint8Array;
  lastSeen: number;
  connectedAt: number;
  transportType: 'webrtc' | 'bluetooth' | 'local';
  connectionQuality: number; // 0-100
  bytesSent: number;
  bytesReceived: number;
  state: PeerState;
  metadata: PeerMetadata;
}

/**
 * Create a new peer with default values
 */
export function createPeer(
  id: string,
  publicKey: Uint8Array,
  transportType: 'webrtc' | 'bluetooth' | 'local' = 'webrtc'
): Peer {
  return {
    id,
    publicKey,
    lastSeen: Date.now(),
    connectedAt: Date.now(),
    transportType,
    connectionQuality: 100,
    bytesSent: 0,
    bytesReceived: 0,
    state: PeerState.CONNECTED,
    metadata: {
      capabilities: {
        supportedTransports: [transportType],
        protocolVersion: 1,
        features: [],
      },
      reputation: 50,
      blacklisted: false,
      failureCount: 0,
      successCount: 0,
    },
  };
}

export interface RouteMetrics {
  hopCount: number;
  latency: number; // milliseconds
  reliability: number; // 0-1, success rate
  lastUsed: number;
}

export interface Route {
  destination: string;
  nextHop: string;
  hopCount: number;
  timestamp: number;
  metrics: RouteMetrics;
  expiresAt: number;
}

export interface RoutingConfig {
  maxCacheSize?: number;
  cacheTTL?: number;
  routeTTL?: number;
  maxRoutes?: number;
  enableBloomFilter?: boolean;
}

/**
 * In-memory routing table for mesh network
 */
export class RoutingTable {
  private routes: Map<string, Route> = new Map();
  private peers: Map<string, Peer> = new Map();
  private messageCache: Map<string, number> = new Map(); // hash -> timestamp
  private bloomFilter: Set<string> = new Set(); // Simple bloom filter
  private readonly MAX_CACHE_SIZE: number;
  private readonly CACHE_TTL: number;
  private readonly ROUTE_TTL: number;
  private readonly MAX_ROUTES: number;
  private readonly ENABLE_BLOOM: boolean;

  constructor(config: RoutingConfig = {}) {
    this.MAX_CACHE_SIZE = config.maxCacheSize || 10000;
    this.CACHE_TTL = config.cacheTTL || 60000; // 60 seconds
    this.ROUTE_TTL = config.routeTTL || 300000; // 5 minutes
    this.MAX_ROUTES = config.maxRoutes || 10000;
    this.ENABLE_BLOOM = config.enableBloomFilter !== false;
  }

  /**
   * Add or update a peer
   */
  addPeer(peer: Peer): void {
    // Ensure peer has required metadata
    if (!peer.state) {
      peer.state = PeerState.CONNECTED;
    }
    if (!peer.metadata) {
      peer.metadata = {
        capabilities: {
          supportedTransports: [peer.transportType],
          protocolVersion: 1,
          features: [],
        },
        reputation: 50,
        blacklisted: false,
        failureCount: 0,
        successCount: 0,
      };
    }

    this.peers.set(peer.id, peer);
    // Direct route to connected peer
    this.routes.set(peer.id, {
      destination: peer.id,
      nextHop: peer.id,
      hopCount: 0,
      timestamp: Date.now(),
      metrics: {
        hopCount: 0,
        latency: 0,
        reliability: 1.0,
        lastUsed: Date.now(),
      },
      expiresAt: Date.now() + this.ROUTE_TTL,
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
   * Add or update a route with conflict resolution
   */
  addRoute(route: Route): void {
    const existing = this.routes.get(route.destination);
    
    // Route conflict resolution based on metrics
    const shouldUpdate = !existing || 
      this.shouldReplaceRoute(existing, route);
    
    if (shouldUpdate) {
      // Ensure route has expiry
      if (!route.expiresAt) {
        route.expiresAt = Date.now() + this.ROUTE_TTL;
      }
      
      this.routes.set(route.destination, route);
      this.cleanupExpiredRoutes();
    }
  }

  /**
   * Determine if new route should replace existing route
   */
  private shouldReplaceRoute(existing: Route, newRoute: Route): boolean {
    // Check if existing route is expired
    if (existing.expiresAt < Date.now()) {
      return true;
    }

    // Prefer routes with fewer hops
    if (newRoute.metrics.hopCount < existing.metrics.hopCount) {
      return true;
    }

    // If same hop count, prefer lower latency
    if (newRoute.metrics.hopCount === existing.metrics.hopCount) {
      if (newRoute.metrics.latency < existing.metrics.latency) {
        return true;
      }
      
      // If same latency, prefer higher reliability
      if (newRoute.metrics.latency === existing.metrics.latency &&
          newRoute.metrics.reliability > existing.metrics.reliability) {
        return true;
      }
      
      // If metrics equal, prefer newer route
      if (newRoute.metrics.latency === existing.metrics.latency &&
          newRoute.metrics.reliability === existing.metrics.reliability &&
          newRoute.timestamp > existing.timestamp) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clean up expired routes
   */
  private cleanupExpiredRoutes(): void {
    if (this.routes.size < this.MAX_ROUTES) {
      return;
    }

    const now = Date.now();
    const toDelete: string[] = [];

    for (const [dest, route] of this.routes.entries()) {
      if (route.expiresAt < now) {
        toDelete.push(dest);
      }
    }

    toDelete.forEach(dest => this.routes.delete(dest));

    // If still over limit, remove least recently used routes
    if (this.routes.size >= this.MAX_ROUTES) {
      const routes = Array.from(this.routes.entries())
        .sort((a, b) => a[1].metrics.lastUsed - b[1].metrics.lastUsed);
      
      const removeCount = this.routes.size - this.MAX_ROUTES + 100;
      for (let i = 0; i < removeCount && i < routes.length; i++) {
        this.routes.delete(routes[i][0]);
      }
    }
  }

  /**
   * Update route metrics
   */
  updateRouteMetrics(destination: string, latency: number, success: boolean): void {
    const route = this.routes.get(destination);
    if (route) {
      route.metrics.latency = latency;
      route.metrics.lastUsed = Date.now();
      
      // Update reliability with exponential moving average
      const alpha = 0.3;
      route.metrics.reliability = 
        alpha * (success ? 1 : 0) + (1 - alpha) * route.metrics.reliability;
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
   * Uses Bloom filter for fast pre-check if enabled
   */
  hasSeenMessage(messageHash: string): boolean {
    // Fast bloom filter check
    if (this.ENABLE_BLOOM && !this.bloomFilter.has(messageHash)) {
      return false;
    }
    return this.messageCache.has(messageHash);
  }

  /**
   * Mark message as seen with LRU eviction
   */
  markMessageSeen(messageHash: string): void {
    this.messageCache.set(messageHash, Date.now());
    
    if (this.ENABLE_BLOOM) {
      this.bloomFilter.add(messageHash);
    }
    
    this.cleanupMessageCache();
  }

  /**
   * Clean up old entries from message cache with LRU eviction
   */
  private cleanupMessageCache(): void {
    const now = Date.now();

    // If cache is below max size, just remove expired entries
    if (this.messageCache.size < this.MAX_CACHE_SIZE) {
      const toDelete: string[] = [];
      for (const [hash, timestamp] of this.messageCache.entries()) {
        if (now - timestamp > this.CACHE_TTL) {
          toDelete.push(hash);
        }
      }
      toDelete.forEach(hash => {
        this.messageCache.delete(hash);
        if (this.ENABLE_BLOOM) {
          this.bloomFilter.delete(hash);
        }
      });
      return;
    }

    // LRU eviction: sort by timestamp and remove oldest
    const entries = Array.from(this.messageCache.entries())
      .sort((a, b) => a[1] - b[1]);
    
    const removeCount = this.messageCache.size - this.MAX_CACHE_SIZE + 100;
    for (let i = 0; i < removeCount && i < entries.length; i++) {
      this.messageCache.delete(entries[i][0]);
      if (this.ENABLE_BLOOM) {
        this.bloomFilter.delete(entries[i][0]);
      }
    }
  }

  /**
   * Update peer reputation based on behavior
   */
  updatePeerReputation(peerId: string, success: boolean): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    if (success) {
      peer.metadata.successCount++;
      peer.metadata.reputation = Math.min(100, peer.metadata.reputation + 1);
    } else {
      peer.metadata.failureCount++;
      peer.metadata.reputation = Math.max(0, peer.metadata.reputation - 2);
    }

    // Update peer state based on reputation
    if (peer.metadata.reputation < 20) {
      peer.state = PeerState.DEGRADED;
    } else if (peer.state === PeerState.DEGRADED && peer.metadata.reputation > 40) {
      peer.state = PeerState.CONNECTED;
    }
  }

  /**
   * Blacklist a peer temporarily or permanently
   */
  blacklistPeer(peerId: string, durationMs?: number): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.metadata.blacklisted = true;
    if (durationMs) {
      peer.metadata.blacklistExpiry = Date.now() + durationMs;
    }
    peer.state = PeerState.DISCONNECTED;
  }

  /**
   * Remove peer from blacklist
   */
  unblacklistPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.metadata.blacklisted = false;
    peer.metadata.blacklistExpiry = undefined;
  }

  /**
   * Check and clean up expired blacklists
   */
  cleanupBlacklists(): void {
    const now = Date.now();
    for (const peer of this.peers.values()) {
      if (peer.metadata.blacklisted && 
          peer.metadata.blacklistExpiry && 
          peer.metadata.blacklistExpiry < now) {
        this.unblacklistPeer(peer.id);
      }
    }
  }

  /**
   * Check if peer is blacklisted
   */
  isPeerBlacklisted(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;

    // Check expiry
    if (peer.metadata.blacklisted && peer.metadata.blacklistExpiry) {
      if (peer.metadata.blacklistExpiry < Date.now()) {
        this.unblacklistPeer(peerId);
        return false;
      }
    }

    return peer.metadata.blacklisted;
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
   * Get memory usage statistics
   */
  getMemoryUsage(): { bytes: number; breakdown: Record<string, number> } {
    const breakdown = {
      routes: this.routes.size * 100, // Approximate size per route
      peers: this.peers.size * 200, // Approximate size per peer
      messageCache: this.messageCache.size * 50, // Approximate size per hash
      bloomFilter: this.bloomFilter.size * 50,
    };

    const bytes = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
    return { bytes, breakdown };
  }

  /**
   * Get routing table statistics
   */
  getStats() {
    return {
      peerCount: this.peers.size,
      routeCount: this.routes.size,
      cacheSize: this.messageCache.size,
      memoryUsage: this.getMemoryUsage().bytes,
    };
  }
}

/**
 * Message priority queue with starvation prevention
 */
export class MessageQueue {
  private queues: Map<MessageType, Array<{ message: any; timestamp: number; originalPriority: MessageType }>> = new Map();
  private readonly priorities = [
    MessageType.CONTROL_PING,
    MessageType.CONTROL_PONG,
    MessageType.CONTROL_ACK,
    MessageType.VOICE,
    MessageType.TEXT,
    MessageType.FILE_CHUNK,
    MessageType.FILE_METADATA,
  ];
  private readonly ESCALATION_THRESHOLD = 30000; // 30 seconds
  private readonly STARVATION_CHECK_INTERVAL = 5000; // 5 seconds
  private lastStarvationCheck = Date.now();

  enqueue(messageType: MessageType, message: any): void {
    if (!this.queues.has(messageType)) {
      this.queues.set(messageType, []);
    }
    this.queues.get(messageType)!.push({ 
      message, 
      timestamp: Date.now(),
      originalPriority: messageType 
    });
  }

  dequeue(): any | null {
    // Check for starvation periodically
    const now = Date.now();
    if (now - this.lastStarvationCheck > this.STARVATION_CHECK_INTERVAL) {
      this.preventStarvation();
      this.lastStarvationCheck = now;
    }

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

  /**
   * Prevent starvation by escalating old low-priority messages
   */
  private preventStarvation(): void {
    const now = Date.now();
    
    // Check low-priority queues for old messages
    for (let i = this.priorities.length - 1; i > 0; i--) {
      const currentPriority = this.priorities[i];
      const queue = this.queues.get(currentPriority);
      
      if (!queue || queue.length === 0) continue;
      
      const itemsToEscalate: Array<{ message: any; timestamp: number; originalPriority: MessageType }> = [];
      const remainingItems: Array<{ message: any; timestamp: number; originalPriority: MessageType }> = [];
      
      for (const item of queue) {
        const age = now - item.timestamp;
        if (age > this.ESCALATION_THRESHOLD) {
          itemsToEscalate.push(item);
        } else {
          remainingItems.push(item);
        }
      }
      
      // Update current queue
      this.queues.set(currentPriority, remainingItems);
      
      // Move escalated items to higher priority queue
      if (itemsToEscalate.length > 0) {
        const higherPriority = this.priorities[i - 1];
        if (!this.queues.has(higherPriority)) {
          this.queues.set(higherPriority, []);
        }
        this.queues.get(higherPriority)!.push(...itemsToEscalate);
      }
    }
  }

  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get size by priority level
   */
  getSizeByPriority(): Map<MessageType, number> {
    const sizes = new Map<MessageType, number>();
    for (const [priority, queue] of this.queues.entries()) {
      sizes.set(priority, queue.length);
    }
    return sizes;
  }

  /**
   * Get oldest message age in queue
   */
  getOldestMessageAge(): number {
    const now = Date.now();
    let oldest = 0;
    
    for (const queue of this.queues.values()) {
      for (const item of queue) {
        const age = now - item.timestamp;
        if (age > oldest) {
          oldest = age;
        }
      }
    }
    
    return oldest;
  }

  clear(): void {
    this.queues.clear();
  }
}
