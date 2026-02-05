/**
 * Enhanced Peer Discovery
 *
 * Multi-method peer discovery combining:
 * - DHT lookup (primary)
 * - Local network discovery (mDNS-like)
 * - Bootstrap nodes (fallback)
 * - Previously known peers (cache)
 */

import type { PeerAddress } from "../mesh/dht/records.js";
import { getPeerRecordKey, type PeerRecord } from "../mesh/dht/records.js";
import type { NodeCapabilities } from "../node/capabilities.js";
import type { DHTInterface } from "../node/registration.js";

/**
 * Discovered peer information
 */
export interface DiscoveredPeer {
  /** Peer ID (16-char hex) */
  peerId: string;
  /** How to reach this peer */
  addresses: PeerAddress[];
  /** Peer capabilities */
  capabilities: NodeCapabilities | null;
  /** How the peer was discovered */
  discoveryMethod: DiscoveryMethod;
  /** When the peer was discovered */
  discoveredAt: number;
  /** Last time the peer was verified reachable */
  lastVerified: number;
  /** Discovery confidence (0-100) */
  confidence: number;
}

/**
 * How a peer was discovered
 */
export enum DiscoveryMethod {
  /** Found via DHT lookup */
  DHT = "dht",
  /** Found on local network */
  LOCAL = "local",
  /** Found from bootstrap list */
  BOOTSTRAP = "bootstrap",
  /** Found from cache of previously known peers */
  CACHE = "cache",
  /** Found via QR code */
  QR = "qr",
  /** Direct manual entry */
  MANUAL = "manual",
}

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  /** How often to scan for local peers (ms) */
  localScanInterval: number;
  /** How long to cache peer records (ms) */
  cacheTTL: number;
  /** Maximum cached peers */
  maxCachedPeers: number;
  /** Whether to enable local network discovery */
  enableLocalDiscovery: boolean;
  /** Bootstrap nodes */
  bootstrapPeers: DiscoveredPeer[];
}

/**
 * Default discovery configuration
 */
export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  localScanInterval: 30000, // 30 seconds
  cacheTTL: 3600000, // 1 hour
  maxCachedPeers: 500,
  enableLocalDiscovery: true,
  bootstrapPeers: [],
};

/**
 * Enhanced Peer Discovery Manager
 */
export class EnhancedPeerDiscovery {
  private config: DiscoveryConfig;
  private dht: DHTInterface | null = null;
  private cache: Map<string, DiscoveredPeer> = new Map();
  private localScanHandle?: ReturnType<typeof setInterval>;
  private localPeers: Map<string, DiscoveredPeer> = new Map();
  private onPeerDiscovered?: (peer: DiscoveredPeer) => void;

  constructor(config: Partial<DiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };

    // Pre-populate cache with bootstrap peers
    for (const peer of this.config.bootstrapPeers) {
      this.cache.set(peer.peerId, peer);
    }
  }

  /**
   * Set the DHT interface
   */
  setDHT(dht: DHTInterface): void {
    this.dht = dht;
  }

  /**
   * Set peer discovery callback
   */
  setOnPeerDiscovered(callback: (peer: DiscoveredPeer) => void): void {
    this.onPeerDiscovered = callback;
  }

  /**
   * Start discovery
   */
  start(): void {
    if (this.config.enableLocalDiscovery) {
      this.localScanHandle = setInterval(
        () => this.scanLocalNetwork(),
        this.config.localScanInterval,
      );
    }
  }

  /**
   * Stop discovery
   */
  stop(): void {
    if (this.localScanHandle) {
      clearInterval(this.localScanHandle);
      this.localScanHandle = undefined;
    }
  }

  /**
   * Find a peer by ID using all available methods
   */
  async findPeer(peerId: string): Promise<DiscoveredPeer | null> {
    // 1. Check cache first
    const cached = this.cache.get(peerId);
    if (cached && !this.isCacheExpired(cached)) {
      return cached;
    }

    // 2. Check local peers
    const local = this.localPeers.get(peerId);
    if (local) {
      this.updateCache(local);
      return local;
    }

    // 3. DHT lookup
    if (this.dht) {
      const dhtPeer = await this.lookupDHT(peerId);
      if (dhtPeer) {
        this.updateCache(dhtPeer);
        return dhtPeer;
      }
    }

    // 4. Check bootstrap nodes
    const bootstrapPeer = this.config.bootstrapPeers.find(
      (p) => p.peerId === peerId,
    );
    if (bootstrapPeer) {
      return bootstrapPeer;
    }

    return null;
  }

  /**
   * Find peers with specific capabilities
   */
  async findCapablePeers(
    requirement: Partial<{
      canSignal: boolean;
      canRelay: boolean;
      canStore: boolean;
    }>,
    limit: number = 10,
  ): Promise<DiscoveredPeer[]> {
    const results: DiscoveredPeer[] = [];

    // Search cache
    for (const peer of this.cache.values()) {
      if (this.isCacheExpired(peer)) continue;
      if (!peer.capabilities) continue;

      let matches = true;
      if (requirement.canSignal && !peer.capabilities.canSignal)
        matches = false;
      if (requirement.canRelay && !peer.capabilities.canRelay) matches = false;
      if (requirement.canStore && !peer.capabilities.canStore) matches = false;

      if (matches) {
        results.push(peer);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Lookup a peer via DHT
   */
  private async lookupDHT(peerId: string): Promise<DiscoveredPeer | null> {
    if (!this.dht) return null;

    try {
      const key = getPeerRecordKey(peerId);
      const value = await this.dht.findValue(key);
      if (!value) return null;

      const json = new TextDecoder().decode(value.data);
      const record = JSON.parse(json, (_key, val) => {
        if (val && typeof val === "object" && val.__uint8array__) {
          return new Uint8Array(val.data);
        }
        return val;
      }) as PeerRecord;

      // Validate structure
      if (!record.peerId || typeof record.peerId !== "string") return null;
      if (!record.addresses || !Array.isArray(record.addresses)) return null;
      if (typeof record.timestamp !== "number") return null;

      return {
        peerId: record.peerId,
        addresses: record.addresses,
        capabilities: record.capabilities || null,
        discoveryMethod: DiscoveryMethod.DHT,
        discoveredAt: Date.now(),
        lastVerified: record.timestamp,
        confidence: 80,
      };
    } catch {
      return null;
    }
  }

  /**
   * Scan local network for peers
   */
  private async scanLocalNetwork(): Promise<void> {
    // This is a no-op placeholder that can be overridden
    // by platform-specific implementations (mDNS, BLE scan, etc.)
  }

  /**
   * Add a locally discovered peer
   */
  addLocalPeer(peer: DiscoveredPeer): void {
    this.localPeers.set(peer.peerId, peer);
    this.updateCache(peer);
    this.onPeerDiscovered?.(peer);
  }

  /**
   * Add a manually discovered peer
   */
  addManualPeer(peerId: string, addresses: PeerAddress[]): DiscoveredPeer {
    const peer: DiscoveredPeer = {
      peerId,
      addresses,
      capabilities: null,
      discoveryMethod: DiscoveryMethod.MANUAL,
      discoveredAt: Date.now(),
      lastVerified: 0,
      confidence: 50,
    };

    this.updateCache(peer);
    return peer;
  }

  /**
   * Update the peer cache
   */
  private updateCache(peer: DiscoveredPeer): void {
    // Enforce cache size limit
    if (
      this.cache.size >= this.config.maxCachedPeers &&
      !this.cache.has(peer.peerId)
    ) {
      // Remove oldest entry
      let oldest: string | null = null;
      let oldestTime = Infinity;
      for (const [id, p] of this.cache) {
        if (p.discoveredAt < oldestTime) {
          oldestTime = p.discoveredAt;
          oldest = id;
        }
      }
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(peer.peerId, peer);
  }

  /**
   * Check if a cache entry is expired
   */
  private isCacheExpired(peer: DiscoveredPeer): boolean {
    return Date.now() - peer.discoveredAt > this.config.cacheTTL;
  }

  /**
   * Get all cached peers
   */
  getCachedPeers(): DiscoveredPeer[] {
    return Array.from(this.cache.values()).filter(
      (p) => !this.isCacheExpired(p),
    );
  }

  /**
   * Get all local peers
   */
  getLocalPeers(): DiscoveredPeer[] {
    return Array.from(this.localPeers.values());
  }

  /**
   * Get discovery statistics
   */
  getStats(): {
    cachedPeers: number;
    localPeers: number;
    bootstrapPeers: number;
    hasDHT: boolean;
  } {
    return {
      cachedPeers: this.cache.size,
      localPeers: this.localPeers.size,
      bootstrapPeers: this.config.bootstrapPeers.length,
      hasDHT: !!this.dht,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    // Re-add bootstrap peers
    for (const peer of this.config.bootstrapPeers) {
      this.cache.set(peer.peerId, peer);
    }
  }

  /**
   * Export cache for persistence
   */
  exportCache(): DiscoveredPeer[] {
    return Array.from(this.cache.values());
  }

  /**
   * Import cached peers from persistence
   */
  importCache(peers: DiscoveredPeer[]): void {
    for (const peer of peers) {
      if (!this.isCacheExpired(peer)) {
        this.cache.set(peer.peerId, {
          ...peer,
          discoveryMethod: DiscoveryMethod.CACHE,
        });
      }
    }
  }
}
