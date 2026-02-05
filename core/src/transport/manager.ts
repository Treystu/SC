/**
 * Transport Manager - Multi-transport connection management
 *
 * Manages multiple transport implementations and provides a unified
 * interface for connecting to peers. Handles transport selection,
 * fallback, and connection pooling.
 */

import type {
  Transport,
  TransportPeerId,
  TransportMessage,
  TransportEvents,
  TransportPeerInfo,
  TransportConnectionState,
  SignalingData,
} from "./Transport.js";

/**
 * Transport priority configuration
 */
export interface TransportPriority {
  /** Transport name */
  name: string;
  /** Priority (lower = preferred) */
  priority: number;
  /** Whether this transport is enabled */
  enabled: boolean;
}

/**
 * Connection pool entry
 */
interface PooledConnection {
  /** Peer ID */
  peerId: string;
  /** Which transport is being used */
  transportName: string;
  /** Connection state */
  state: TransportConnectionState;
  /** When connected */
  connectedAt: number;
  /** Last activity */
  lastActivity: number;
  /** Bytes sent */
  bytesSent: number;
  /** Bytes received */
  bytesReceived: number;
}

/**
 * Address entry for a peer
 */
export interface PeerTransportAddress {
  /** Transport type */
  transportType: string;
  /** Transport-specific address */
  address: string;
  /** Priority (higher = preferred) */
  priority: number;
}

/**
 * Transport Manager configuration
 */
export interface TransportManagerConfig {
  /** Maximum total connections across all transports */
  maxConnections: number;
  /** Connection timeout in ms */
  connectionTimeout: number;
  /** Whether to try fallback transports on failure */
  enableFallback: boolean;
  /** Idle connection timeout in ms */
  idleTimeout: number;
  /** Connection cleanup interval in ms */
  cleanupInterval: number;
}

/**
 * Default TransportManager config
 */
const DEFAULT_TRANSPORT_MANAGER_CONFIG: TransportManagerConfig = {
  maxConnections: 50,
  connectionTimeout: 15000,
  enableFallback: true,
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000, // 1 minute
};

/**
 * Transport Manager
 *
 * Orchestrates multiple transport implementations, handling
 * connection establishment with automatic fallback.
 */
export class TransportManager {
  private transports: Map<string, Transport> = new Map();
  private priorities: TransportPriority[] = [];
  private pool: Map<string, PooledConnection> = new Map();
  private peerAddresses: Map<string, PeerTransportAddress[]> = new Map();
  private config: TransportManagerConfig;
  private events: TransportEvents | null = null;
  private cleanupHandle?: ReturnType<typeof setInterval>;
  private started = false;

  constructor(config: Partial<TransportManagerConfig> = {}) {
    this.config = { ...DEFAULT_TRANSPORT_MANAGER_CONFIG, ...config };
  }

  /**
   * Register a transport with priority
   */
  addTransport(transport: Transport, priority: number = 10): void {
    this.transports.set(transport.name, transport);
    this.priorities.push({
      name: transport.name,
      priority,
      enabled: true,
    });
    // Sort by priority (lower first)
    this.priorities.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a transport
   */
  removeTransport(name: string): void {
    this.transports.delete(name);
    this.priorities = this.priorities.filter((p) => p.name !== name);
  }

  /**
   * Start all transports
   */
  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.started = true;

    // Create wrapped events that update our pool
    const wrappedEvents: TransportEvents = {
      onMessage: (msg: TransportMessage) => {
        // Update pool activity
        const conn = this.pool.get(msg.from);
        if (conn) {
          conn.lastActivity = Date.now();
          conn.bytesReceived += msg.payload.length;
        }
        events.onMessage(msg);
      },
      onPeerConnected: (peerId: string, info?: TransportPeerInfo) => {
        if (info) {
          this.pool.set(peerId, {
            peerId,
            transportName: info.transportType,
            state: "connected",
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            bytesSent: 0,
            bytesReceived: 0,
          });
        }
        events.onPeerConnected?.(peerId, info);
      },
      onPeerDisconnected: (peerId: string, reason?: string) => {
        this.pool.delete(peerId);
        events.onPeerDisconnected?.(peerId, reason);
      },
      onStateChange: (peerId: string, state: TransportConnectionState) => {
        const conn = this.pool.get(peerId);
        if (conn) {
          conn.state = state;
        }
        events.onStateChange?.(peerId, state);
      },
      onError: (error: Error, peerId?: string) => {
        events.onError?.(error, peerId);
      },
    };

    // Start all transports
    const startPromises = Array.from(this.transports.values()).map(
      (transport) => transport.start(wrappedEvents).catch((err) => {
        console.error(`Failed to start transport ${transport.name}:`, err);
      })
    );
    await Promise.all(startPromises);

    // Start cleanup interval
    this.cleanupHandle = setInterval(
      () => this.cleanupIdleConnections(),
      this.config.cleanupInterval
    );
  }

  /**
   * Stop all transports
   */
  async stop(): Promise<void> {
    this.started = false;

    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = undefined;
    }

    const stopPromises = Array.from(this.transports.values()).map(
      (transport) => transport.stop().catch(() => {})
    );
    await Promise.all(stopPromises);

    this.pool.clear();
  }

  /**
   * Register known addresses for a peer
   */
  registerPeerAddresses(
    peerId: string,
    addresses: PeerTransportAddress[]
  ): void {
    this.peerAddresses.set(peerId, addresses);
  }

  /**
   * Connect to a peer using the best available transport
   *
   * Tries transports in priority order, with fallback on failure.
   */
  async connect(peerId: string): Promise<string> {
    if (!this.started) {
      throw new Error("TransportManager not started");
    }

    // Check if already connected
    const existing = this.pool.get(peerId);
    if (existing && existing.state === "connected") {
      return existing.transportName;
    }

    // Check pool limit
    if (this.pool.size >= this.config.maxConnections) {
      // Try to evict idle connections first
      this.cleanupIdleConnections();
      if (this.pool.size >= this.config.maxConnections) {
        throw new Error("Maximum connections reached");
      }
    }

    // Get known addresses for peer
    const addresses = this.peerAddresses.get(peerId) || [];

    // Try transports in priority order
    const errors: Error[] = [];

    for (const { name, enabled } of this.priorities) {
      if (!enabled) continue;

      const transport = this.transports.get(name);
      if (!transport) continue;

      // Check if we have an address for this transport type
      const addr = addresses.find((a) => a.transportType === name);

      try {
        const signalingData: SignalingData | undefined = addr
          ? {
              type: "custom",
              data: { url: addr.address },
              to: peerId,
            }
          : undefined;

        await Promise.race([
          transport.connect(peerId, signalingData),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Connection timeout")),
              this.config.connectionTimeout
            )
          ),
        ]);

        // Success - update pool
        this.pool.set(peerId, {
          peerId,
          transportName: name,
          state: "connected",
          connectedAt: Date.now(),
          lastActivity: Date.now(),
          bytesSent: 0,
          bytesReceived: 0,
        });

        return name;
      } catch (error) {
        errors.push(
          error instanceof Error ? error : new Error(String(error))
        );
        if (!this.config.enableFallback) break;
      }
    }

    throw new Error(
      `Failed to connect to ${peerId} via any transport: ${errors
        .map((e) => e.message)
        .join(", ")}`
    );
  }

  /**
   * Disconnect from a peer
   */
  async disconnect(peerId: string): Promise<void> {
    const conn = this.pool.get(peerId);
    if (!conn) return;

    const transport = this.transports.get(conn.transportName);
    if (transport) {
      await transport.disconnect(peerId).catch(() => {});
    }

    this.pool.delete(peerId);
  }

  /**
   * Send data to a peer using their active transport
   */
  async send(peerId: string, payload: Uint8Array): Promise<void> {
    const conn = this.pool.get(peerId);
    if (!conn || conn.state !== "connected") {
      throw new Error(`Not connected to peer: ${peerId}`);
    }

    const transport = this.transports.get(conn.transportName);
    if (!transport) {
      throw new Error(`Transport ${conn.transportName} not found`);
    }

    await transport.send(peerId, payload);
    conn.bytesSent += payload.length;
    conn.lastActivity = Date.now();
  }

  /**
   * Broadcast to all connected peers
   */
  async broadcast(
    payload: Uint8Array,
    excludePeerId?: string
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [peerId] of this.pool) {
      if (peerId !== excludePeerId) {
        promises.push(this.send(peerId, payload).catch(() => {}));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Get all connected peers across all transports
   */
  getConnectedPeers(): string[] {
    const peers: string[] = [];
    for (const [peerId, conn] of this.pool) {
      if (conn.state === "connected") {
        peers.push(peerId);
      }
    }
    return peers;
  }

  /**
   * Get peer info
   */
  getPeerInfo(peerId: string): TransportPeerInfo | undefined {
    const conn = this.pool.get(peerId);
    if (!conn) return undefined;

    // Try to get detailed info from the transport
    const transport = this.transports.get(conn.transportName);
    if (transport) {
      const info = transport.getPeerInfo(peerId);
      if (info) return info;
    }

    return {
      peerId,
      state: conn.state,
      transportType: conn.transportName,
      bytesSent: conn.bytesSent,
      bytesReceived: conn.bytesReceived,
      lastSeen: conn.lastActivity,
    };
  }

  /**
   * Get connection state for a peer
   */
  getConnectionState(peerId: string): TransportConnectionState | undefined {
    return this.pool.get(peerId)?.state;
  }

  /**
   * Get statistics about the transport manager
   */
  getStats(): {
    totalConnections: number;
    connectionsByTransport: Record<string, number>;
    totalBytesSent: number;
    totalBytesReceived: number;
    availableTransports: string[];
  } {
    const connectionsByTransport: Record<string, number> = {};
    let totalBytesSent = 0;
    let totalBytesReceived = 0;

    for (const conn of this.pool.values()) {
      connectionsByTransport[conn.transportName] =
        (connectionsByTransport[conn.transportName] || 0) + 1;
      totalBytesSent += conn.bytesSent;
      totalBytesReceived += conn.bytesReceived;
    }

    return {
      totalConnections: this.pool.size,
      connectionsByTransport,
      totalBytesSent,
      totalBytesReceived,
      availableTransports: this.priorities
        .filter((p) => p.enabled)
        .map((p) => p.name),
    };
  }

  /**
   * Check if a transport is available
   */
  hasTransport(name: string): boolean {
    return this.transports.has(name);
  }

  /**
   * Get a specific transport
   */
  getTransport(name: string): Transport | undefined {
    return this.transports.get(name);
  }

  /**
   * Clean up idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    for (const [peerId, conn] of this.pool) {
      if (now - conn.lastActivity > this.config.idleTimeout) {
        this.disconnect(peerId).catch(() => {});
      }
    }
  }
}
