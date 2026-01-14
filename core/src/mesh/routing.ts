/**
 * Mesh networking core - routing table and peer management
 */

import { MessageType } from "../protocol/message.js";
import type { KademliaRoutingTable } from "./dht/index.js";
import {
  peerToDHTContact,
  isValidDHTPeer,
  peerIdToDHTKey,
} from "./dht/index.js";
import { xorDistance } from "./kademlia.js";

export enum PeerState {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DEGRADED = "degraded",
  DISCONNECTED = "disconnected",
}

export interface PeerCapabilities {
  maxBandwidth?: number;
  supportedTransports: ("webrtc" | "bluetooth" | "local")[];
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
  transportType: "webrtc" | "bluetooth" | "local";
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
  transportType: "webrtc" | "bluetooth" | "local" = "webrtc",
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
  bandwidth?: number; // bytes per second (optional)
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

/**
 * Routing mode for the mesh network
 */
export enum RoutingMode {
  /** Traditional flood-based routing (default) */
  FLOOD = "flood",
  /** Kademlia DHT-based routing */
  DHT = "dht",
  /** Hybrid: use DHT for discovery, flood for delivery */
  HYBRID = "hybrid",
}

export interface RoutingConfig {
  maxCacheSize?: number;
  cacheTTL?: number;
  routeTTL?: number;
  maxRoutes?: number;
  enableBloomFilter?: boolean;
  /** Routing mode (default: FLOOD for backward compatibility) */
  mode?: RoutingMode;
  /** DHT routing table (required if mode is DHT or HYBRID) */
  dhtRoutingTable?: KademliaRoutingTable;
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
  private readonly mode: RoutingMode;
  public readonly localNodeId: string;
  private dhtRoutingTable?: KademliaRoutingTable;

  constructor(localNodeId: string, config: RoutingConfig = {}) {
    this.localNodeId = localNodeId;
    this.MAX_CACHE_SIZE = config.maxCacheSize || 10000;
    this.CACHE_TTL = config.cacheTTL || 600000; // 10 minutes (increased to exceed Relay storeTimeout)
    this.ROUTE_TTL = config.routeTTL || 300000; // 5 minutes
    this.MAX_ROUTES = config.maxRoutes || 10000;
    this.ENABLE_BLOOM = config.enableBloomFilter !== false;
    this.mode = config.mode || RoutingMode.FLOOD;
    this.dhtRoutingTable = config.dhtRoutingTable;

    // Validate configuration
    if (
      (this.mode === RoutingMode.DHT || this.mode === RoutingMode.HYBRID) &&
      !this.dhtRoutingTable
    ) {
      throw new Error(`DHT routing table required for ${this.mode} mode`);
    }
  }

  /**
   * Add or update a peer
   */
  addPeer(peer: Peer): void {
    // Normalize peer ID to uppercase for consistent matching
    const normalizedId = peer.id.replace(/\s/g, "").toUpperCase();
    const originalId = peer.id; // Preserve original format
    
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

    // Store peer with original ID format, but use normalized key for lookup
    this.peers.set(normalizedId, peer);
    // Direct route to connected peer
    this.routes.set(normalizedId, {
      destination: normalizedId,
      nextHop: originalId, // Return original ID for getNextHop
      hopCount: 0,
      timestamp: Date.now(),
      metrics: {
        hopCount: 0,
        latency: 0,
        reliability: 1.0,
        bandwidth: 0,
        lastUsed: Date.now(),
      },
      expiresAt: Date.now() + this.ROUTE_TTL,
    });

    // If DHT mode is enabled, also add to DHT routing table
    if (
      this.dhtRoutingTable &&
      (this.mode === RoutingMode.DHT || this.mode === RoutingMode.HYBRID)
    ) {
      if (isValidDHTPeer(peer)) {
        const dhtContact = peerToDHTContact(peer);
        // Add valid peer to DHT routing table in DHT or HYBRID mode
        this.dhtRoutingTable.addContact(dhtContact);
      }
    }
  }

  /**
   * Remove a peer
   */
  removePeer(peerId: string): void {
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    this.peers.delete(normalizedId);
    this.routes.delete(normalizedId);
    // Remove routes that go through this peer
    for (const [dest, route] of this.routes.entries()) {
      if (route.nextHop === normalizedId) {
        this.routes.delete(dest);
      }
    }
  }

  /**
   * Get a peer by ID
   */
  getPeer(peerId: string): Peer | undefined {
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    return this.peers.get(normalizedId);
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
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    const peer = this.peers.get(normalizedId);
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
    const shouldUpdate = !existing || this.shouldReplaceRoute(existing, route);

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
      if (newRoute.metrics.latency === existing.metrics.latency) {
        if (newRoute.metrics.reliability > existing.metrics.reliability) {
          return true;
        }

        // If same reliability, prefer higher bandwidth
        const newBw = newRoute.metrics.bandwidth || 0;
        const existingBw = existing.metrics.bandwidth || 0;
        if (
          newRoute.metrics.reliability === existing.metrics.reliability &&
          newBw > existingBw
        ) {
          return true;
        }
      }

      // If metrics equal, prefer newer route
      if (
        newRoute.metrics.latency === existing.metrics.latency &&
        newRoute.metrics.reliability === existing.metrics.reliability &&
        (newRoute.metrics.bandwidth || 0) ===
          (existing.metrics.bandwidth || 0) &&
        newRoute.timestamp > existing.timestamp
      ) {
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

    toDelete.forEach((dest) => this.routes.delete(dest));

    // If still over limit, remove least recently used routes
    if (this.routes.size >= this.MAX_ROUTES) {
      const routes = Array.from(this.routes.entries()).sort(
        (a, b) => a[1].metrics.lastUsed - b[1].metrics.lastUsed,
      );

      const removeCount = this.routes.size - this.MAX_ROUTES + 100;
      for (let i = 0; i < removeCount && i < routes.length; i++) {
        this.routes.delete(routes[i][0]);
      }
    }
  }

  /**
   * Update route metrics
   */
  updateRouteMetrics(
    destination: string,
    latency: number,
    success: boolean,
    bandwidth?: number,
  ): void {
    // Normalize destination ID for consistent lookup
    const normalizedDest = destination.replace(/\s/g, "").toUpperCase();
    const route = this.routes.get(normalizedDest);
    if (route) {
      route.metrics.latency = latency;
      route.metrics.lastUsed = Date.now();

      // Update reliability with exponential moving average
      const alpha = 0.3;
      route.metrics.reliability =
        alpha * (success ? 1 : 0) + (1 - alpha) * route.metrics.reliability;

      if (bandwidth !== undefined) {
        route.metrics.bandwidth = bandwidth;
      }

      // Also update peer metadata for reputation tracking
      const peer = this.peers.get(normalizedDest);
      if (peer) {
        if (success) {
          peer.metadata.successCount += 1;
          peer.metadata.reputation = Math.min(100, peer.metadata.reputation + 1);
        } else {
          peer.metadata.failureCount += 1;
          peer.metadata.reputation = Math.max(0, peer.metadata.reputation - 2);
          
          // If reputation gets too low, mark as degraded
          if (peer.metadata.reputation < 20 && peer.state === PeerState.CONNECTED) {
            peer.state = PeerState.DEGRADED;
          }
        }
      }
    }
  }

  /**
   * Get next hop for a destination
   */
  getNextHop(destination: string): string | undefined {
    // Normalize destination ID for consistent lookup
    const normalizedDest = destination.replace(/\s/g, "").toUpperCase();
    const route = this.routes.get(normalizedDest) || this.routes.get(destination);

    // Check if route is expired
    if (route && route.expiresAt < Date.now()) {
      // Remove expired route
      this.routes.delete(normalizedDest);
      this.routes.delete(destination);
      return undefined;
    }

    // Return the nextHop which stores the original ID format
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
      toDelete.forEach((hash) => {
        this.messageCache.delete(hash);
        if (this.ENABLE_BLOOM) {
          this.bloomFilter.delete(hash);
        }
      });
      return;
    }

    // LRU eviction: sort by timestamp and remove oldest
    const entries = Array.from(this.messageCache.entries()).sort(
      (a, b) => a[1] - b[1],
    );

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
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    const peer = this.peers.get(normalizedId);
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
    } else if (
      peer.state === PeerState.DEGRADED &&
      peer.metadata.reputation > 40
    ) {
      peer.state = PeerState.CONNECTED;
    }
  }

  /**
   * Blacklist a peer temporarily or permanently
   */
  blacklistPeer(peerId: string, durationMs?: number): void {
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    const peer = this.peers.get(normalizedId);
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
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    const peer = this.peers.get(normalizedId);
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
      if (
        peer.metadata.blacklisted &&
        peer.metadata.blacklistExpiry &&
        peer.metadata.blacklistExpiry < now
      ) {
        this.unblacklistPeer(peer.id);
      }
    }
  }

  /**
   * Check if peer is blacklisted
   */
  isPeerBlacklisted(peerId: string): boolean {
    // Normalize peer ID for consistent lookup
    const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
    const peer = this.peers.get(normalizedId);
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

    for (const [_normalizedId, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > timeoutMs) {
        // Return the original peer ID, not the normalized one
        stale.push(peer.id);
      }
    }

    // Remove using normalized IDs
    stale.forEach((peerId) => {
      const normalizedId = peerId.replace(/\s/g, "").toUpperCase();
      this.removePeer(normalizedId);
    });
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

  /**
   * Get the current routing mode
   */
  getRoutingMode(): RoutingMode {
    return this.mode;
  }

  /**
   * Get the DHT routing table (if enabled)
   */
  getDHTRoutingTable(): KademliaRoutingTable | undefined {
    return this.dhtRoutingTable;
  }

  /**
   * Check if DHT routing is enabled
   */
  isDHTEnabled(): boolean {
    return this.mode === RoutingMode.DHT || this.mode === RoutingMode.HYBRID;
  }

  /**
   * Find peers via DHT lookup
   */
  async findPeerViaDHT(targetPeerId: string): Promise<Peer[]> {
    if (!this.dhtRoutingTable) {
      throw new Error('DHT routing table not configured');
    }

    // For now, return peers that are close to the target in the routing table
    // In a real implementation, this would perform a DHT lookup
    const allPeers = this.getAllPeers();
    const targetPeer = this.getPeer(targetPeerId);
    
    if (targetPeer) {
      return [targetPeer];
    }

    // Return a subset of peers (simulating DHT lookup results)
    return allPeers.slice(0, Math.min(5, allPeers.length));
  }

  /**
   * Get peers ranked by likelihood of reaching the target
   * Scoring strategy: "Score for NOW" (Real-time Value > History)
   * 1. Direct connection (Immediate Delivery)
   * 2. Kademlia Proximity (Topological Potential)
   * 3. Connection Quality (Current Health)
   * 4. Route Table Next Hop (Routing Memory - only if healthy)
   */
  getRankedPeersForTarget(targetId: string): Peer[] {
    const peers = Array.from(this.peers.values());
    const bestRoute = this.routes.get(targetId);

    // Cache scores to sorting
    const peerScores = new Map<string, number>();

    for (const peer of peers) {
      if (peer.state === PeerState.DISCONNECTED) {
        peerScores.set(peer.id, -1);
        continue;
      }

      let score = 0;

      // 1. Connection Health "NOW" (0-100)
      // If quality is poor, the node's value is low regardless of history.
      score += peer.connectionQuality || 50;

      // Penalize degraded state heavily ONLY if current quality is also lacking.
      // "If the node is good now, let's use it" - User
      // If a node is DEGRADED (historical failures) but currently has 100% Quality (Heartbeats/Latency good),
      // we should NOT penalize it. We give it a fresh start.
      // Penalty scales with quality defect: (100 - Quality) * 4
      // Qual 100 -> Penalty 0. Qual 50 -> Penalty 200.
      if (peer.state === PeerState.DEGRADED) {
        const qualityDefect = 100 - (peer.connectionQuality || 50);
        score -= Math.max(0, qualityDefect * 4);
      }

      // 2. Direct Connection (Perfect)
      if (peer.id === targetId) {
        score += 2000;
      }

      // 3. Topology / Kademlia Potential (Future Potential)
      // Closer peers in XOR space are statistically more likely to find the target.
      // We calculate bitwise affinity.

      // 4. Known Route (Routing Memory)
      // Only useful if the peer is currently healthy.
      if (bestRoute && bestRoute.nextHop === peer.id) {
        // Current Quality is the multiplier, not historical reliability.
        const routeQualityMult = (peer.connectionQuality || 50) / 100;
        score += 300 * routeQualityMult;
      }

      // 5. Bandwidth / Uplink Capacity (The "Datacenter vs Tunnel" Factor)
      // High capacity nodes should be preferred for routing.

      // Use metrics if available (proven throughput)
      if (bestRoute && bestRoute.metrics.bandwidth) {
        // Cap at 100 points for ~10 MB/s to avoid skewing too much
        score += Math.min(100, bestRoute.metrics.bandwidth / 100000);
      }

      // Use advertised capability if available
      if (peer.metadata.capabilities.maxBandwidth) {
        score += Math.min(
          50,
          peer.metadata.capabilities.maxBandwidth / 1000000,
        ); // 1 point per MBps?
      }

      // Heuristic based on Transport
      // Local/Wired/WiFi > WebRTC (Internet) > Bluetooth
      if (peer.transportType === "local") {
        score += 50; // Likely high speed LAN
      } else if (peer.transportType === "bluetooth") {
        score -= 50; // Low bandwidth, keep for proximity/fallback
      }

      peerScores.set(peer.id, score);
    }

    return peers.sort((a, b) => {
      const scoreA = peerScores.get(a.id) || 0;
      const scoreB = peerScores.get(b.id) || 0;

      // Primary: Heuristic Score (Health + Direct + Route + Bandwidth)
      // "Score for NOW" means reacting to the immediate high-bandwidth potential.
      if (Math.abs(scoreA - scoreB) > 10) {
        return scoreB - scoreA;
      }

      // Secondary: Kademlia Distance (Tie-breaker for "Potential")
      const distA = xorDistance(targetId, a.id);
      const distB = xorDistance(targetId, b.id);

      return distA < distB ? -1 : distA > distB ? 1 : 0;
    });
  }

  /**
   * Find closest peers to a target ID using XOR distance
   * Used by DHT for iterative lookups
   */
  findClosestPeers(targetId: string, count: number = 20): Peer[] {
    // If DHT is enabled, use the bucket structure for O(log N) lookup
    if (this.dhtRoutingTable) {
      try {
        const targetKey = peerIdToDHTKey(targetId);
        const contacts = this.dhtRoutingTable.getClosestContacts(
          targetKey,
          count,
        );

        // Convert DHT contacts back to Peers
        // We prefer the live Peer object if we have it, otherwise reconstruct minimal Peer
        return contacts.map((contact) => {
          const existingPeer = this.peers.get(contact.peerId);
          if (existingPeer) return existingPeer;

          // Reconstruct minimal peer from contact info
          let transport = (contact.endpoints?.[0]?.type as any) || "webrtc";
          if (transport === "manual") transport = "webrtc";

          return createPeer(
            contact.peerId,
            new Uint8Array(0), // PublicKey not always in contact
            transport,
          );
        });
      } catch (e) {
        console.warn("DHT lookup failed, falling back to linear scan", e);
      }
    }

    // Fallback: Linear scan of all connected peers (O(N))
    // Acceptable for small meshes (< 1000 nodes)
    const peers = Array.from(this.peers.values());

    // Filter valid peers
    const validPeers = peers.filter((p) => !this.isPeerBlacklisted(p.id));

    return validPeers
      .sort((a, b) => {
        const distA = xorDistance(targetId, a.id);
        const distB = xorDistance(targetId, b.id);
        return distA < distB ? -1 : distA > distB ? 1 : 0;
      })
      .slice(0, count);
  }
}

/**
 * Message priority queue with starvation prevention
 */
export class MessageQueue {
  private queues: Map<
    MessageType,
    Array<{ message: any; timestamp: number; originalPriority: MessageType }>
  > = new Map();
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
      originalPriority: messageType,
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

      const itemsToEscalate: Array<{
        message: any;
        timestamp: number;
        originalPriority: MessageType;
      }> = [];
      const remainingItems: Array<{
        message: any;
        timestamp: number;
        originalPriority: MessageType;
      }> = [];

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
