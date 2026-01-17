/**
 * Mesh Network Manager
 * Orchestrates routing, relay, and transport connections
 */

import { bytesToHex, bytesToBase64, base64ToBytes } from "../utils/encoding.js";
import { Message, MessageType, encodeMessage } from "../protocol/message.js";
import { RoutingTable, Peer, createPeer, PeerState } from "./routing.js";
import { MessageRelay } from "./relay.js";
import { TransportManager, Transport } from "./transport/Transport.js";
import { WebRTCTransport } from "../transport/WebRTCTransport.js";
import {
  generateIdentity,
  IdentityKeyPair,
  signMessage,
} from "../crypto/primitives.js";
import { generateFingerprintSync as _generateFingerprintSync } from "../utils/fingerprint.js";
import { ConnectionMonitor } from "../connection-quality.js";
import { DHT } from "./dht.js";
import {
  DiscoveryManager,
  DiscoveryPeer,
  DiscoveryProvider,
} from "./discovery.js";
import { KademliaRoutingTable, publicKeyToNodeId } from "./dht/index.js";
import { HttpBootstrapProvider } from "../discovery/http-bootstrap.js";
import { StorageAdapter } from "./dht/storage/StorageAdapter.js";
import { RendezvousManager } from "./rendezvous.js";
import { BlobStore, IndexedDBBlobAdapter } from "../storage/blob-store.js";
import { SocialRecoveryManager } from "../recovery/social-recovery.js";
import { TransferManager } from "../transfer/TransferManager.js";
import { RoutingMode } from "./routing.js";

export interface MeshNetworkConfig {
  identity?: IdentityKeyPair;
  peerId?: string; // Explicit Peer ID (fingerprint)
  maxPeers?: number;
  defaultTTL?: number;
  persistence?: PersistenceAdapter;
  dhtStorage?: StorageAdapter;
  transports?: Transport[];
  bootstrapUrl?: string; // URL for HTTP bootstrap
  
  // Performance and scaling configurations
  messageQueueSize?: number; // Max messages in queue (default: 10000)
  connectionTimeout?: number; // Connection timeout in ms (default: 30000)
  heartbeatInterval?: number; // Heartbeat interval in ms (default: 30000)
  healthCheckInterval?: number; // Health check interval in ms (default: 5000)
  maxMessageSize?: number; // Max message size in bytes (default: 1MB)
  rateLimitPerPeer?: number; // Max messages per second per peer (default: 100)
  enableSelectiveFlooding?: boolean; // Enable smart flooding (default: true)
  enableMessageDeduplication?: boolean; // Enable deduplication (default: true)
  enableLoopDetection?: boolean; // Enable loop detection (default: true)
  maxRetries?: number; // Max retry attempts (default: 3)
  retryBackoff?: number; // Retry backoff in ms (default: 5000)
}

import { PersistenceAdapter } from "./relay.js";

/**
 * Mesh Network Manager
 * High-level API for mesh networking
 */
export class MeshNetwork {
  private identity: IdentityKeyPair;
  private routingTable: RoutingTable;
  private messageRelay: MessageRelay;

  // Replaced PeerConnectionPool with TransportManager
  private transportManager: TransportManager;
  private webrtcTransport: WebRTCTransport; // Keep ref for signaling hook

  private localPeerId: string;
  private defaultTTL: number;
  private maxPeers: number;
  private dht: DHT;
  public rendezvous: RendezvousManager;
  public discovery: DiscoveryManager;
  public blobStore: BlobStore;
  public socialRecovery: SocialRecoveryManager;
  public transferManager: TransferManager;

  // Connection monitoring and recovery
  private connectionHealthCheckInterval?: NodeJS.Timeout;
  private readonly HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
  private readonly CONNECTION_TIMEOUT = 45000; // 45 seconds
  private readonly MAX_CONNECTION_ATTEMPTS = 3;
  private connectionAttempts: Map<string, number> = new Map();
  private lastConnectionAttempt: Map<string, number> = new Map();

  // Callbacks
  private messageListeners: Set<(message: Message) => void> = new Set();
  private peerConnectedListeners: Set<(peerId: string) => void> = new Set();
  private peerDisconnectedListeners: Set<(peerId: string) => void> = new Set();
  private peerTrackListeners: Set<
    (peerId: string, track: MediaStreamTrack, stream: MediaStream) => void
  > = new Set();
  private discoveryUpdateListeners: Set<(peers: string[]) => void> = new Set();

  // Replaced by Transport Registration (Legacy Support)
  private outboundTransportCallback?: (
    peerId: string,
    data: Uint8Array,
  ) => Promise<void>;

  private signalingCallback?: (
    peerId: string,
    signal: { type: string; candidate?: RTCIceCandidateInit; sdp?: RTCSessionDescriptionInit },
  ) => Promise<void>;

  // State
  private discoveredPeers: Set<string> = new Set();
  private peerMonitors: Map<string, ConnectionMonitor> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private pendingBlobRequests: Map<
    string,
    {
      resolve: (blob: Uint8Array | null) => void;
      reject: (err: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  // Message statistics
  private messagesStored: number = 0;

  // Session enforcement (single-session per identity)
  private sessionId: string;
  private sessionTimestamp: number;
  private sessionPresenceInterval: ReturnType<typeof setInterval> | null = null;
  private onSessionInvalidatedCallback?: () => void;

  // Metrics tracking
  private messagesSent = 0;
  private messagesReceived = 0;
  private bytesTransferred = 0;
  private heartbeatMs: number;
  private healthCheckMs: number;
  private maxMessageSize: number;
  private rateLimitPerPeer: number;
  private maxRetries: number;
  private retryBackoff: number;

  constructor(config: MeshNetworkConfig = {}) {
    // Initialize identity
    this.identity = config.identity || generateIdentity();

    // Unified Identity: Use provided ID or derive from public key
    // CRITICAL FIX: Peer IDs MUST be 16 chars uppercase hex format for consistency
    // This matches how sender IDs are extracted from messages (first 16 chars of pubkey hex)
    if (config.peerId) {
      // Use provided peer ID, normalized to uppercase
      this.localPeerId = config.peerId.replace(/\s/g, "").toUpperCase();
    } else {
      // Derive peer ID from public key: first 16 chars (8 bytes) of hex, uppercase
      this.localPeerId = Buffer.from(this.identity.publicKey)
        .toString("hex")
        .substring(0, 16)
        .toUpperCase();
    }

    // Initialize session for single-session enforcement
    this.sessionId = this.generateSessionId();
    this.sessionTimestamp = Date.now();

    // Configuration with production-ready defaults for 1M+ users
    this.defaultTTL = config.defaultTTL || 10;
    this.maxPeers = config.maxPeers || 100; // Increased for better scaling

    // Performance configuration
    const messageQueueSize = config.messageQueueSize ?? 10000;
    const _connectionTimeout = config.connectionTimeout ?? 30000;
    this.heartbeatMs = config.heartbeatInterval ?? 30000;
    this.healthCheckMs = config.healthCheckInterval ?? 5000;
    this.maxMessageSize = config.maxMessageSize ?? 1024 * 1024; // 1MB
    this.rateLimitPerPeer = config.rateLimitPerPeer ?? 100;
    const enableSelectiveFlooding = config.enableSelectiveFlooding !== false;
    const _enableMessageDeduplication = config.enableMessageDeduplication !== false;
    const _enableLoopDetection = config.enableLoopDetection !== false;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBackoff = config.retryBackoff ?? 5000;

    // Initialize components
    // Derive DHT node ID from public key (not from hex peer ID which is 64 chars)
    const dhtNodeId = publicKeyToNodeId(this.identity.publicKey);
    const dhtRoutingTable = new KademliaRoutingTable(dhtNodeId);

    this.routingTable = new RoutingTable(this.localPeerId, {
      mode: RoutingMode.HYBRID, // Default to Hybrid (DHT + Flood)
      dhtRoutingTable,
    });

    // Configure message relay for high-scale operations
    const relayConfig = {
      maxStoredMessages: messageQueueSize,
      storeTimeout: 300000, // 5 minutes
      maxRetries: this.maxRetries,
      retryBackoff: this.retryBackoff,
      floodRateLimit: this.rateLimitPerPeer,
      selectiveFlooding: enableSelectiveFlooding,
    };

    this.messageRelay = new MessageRelay(
      this.localPeerId,
      this.routingTable,
      relayConfig,
      config.persistence as PersistenceAdapter,
    );

    // Initialize Transports
    this.transportManager = new TransportManager();

    // Register WebRTC Transport
    this.webrtcTransport = new WebRTCTransport(this.localPeerId);
    this.transportManager.registerTransport(this.webrtcTransport);

    // Register custom transports
    if (config.transports) {
      config.transports.forEach((transport) => {
        this.transportManager.registerTransport(transport);
      });
    }

    // Bind Transport Events
    this.transportManager.onMessage((peerId, data) => {
      this.handleIncomingTransportMessage(peerId, data);
    });

    this.transportManager.onPeerConnected((peerId) => {
      this.handlePeerConnected(peerId);
    });

    this.transportManager.onPeerDisconnected((peerId) => {
      this.handlePeerDisconnected(peerId);
    });

    this.webrtcTransport.getPool().onSignal((peerId, signal) => {
      if (this.signalingCallback) {
        this.signalingCallback(peerId, signal).catch((err) =>
          console.error("[MeshNetwork] Failed to send signal via callback:", err),
        );
      } else if (this.outboundTransportCallback) {
        this.outboundTransportCallback(peerId, new Uint8Array()).catch((err) =>
          console.error("[MeshNetwork] Failed to send signal via outbound transport:", err),
        );
      } else {
        console.debug("[MeshNetwork] No signaling callback registered, ICE candidate dropped for:", peerId);
      }
    });

    this.webrtcTransport.getPool().onTrack((peerId, track, stream) => {
      this.peerTrackListeners.forEach((listener) => {
        try {
          listener(peerId, track, stream);
        } catch (e) {
          console.error("Error in peer track listener:", e);
        }
      });
    });

    // Initialize DHT
    this.dht = new DHT(
      this.routingTable,
      async (peerId, type, payload) => {
        const message: Message = {
          header: {
            version: 0x01,
            type,
            ttl: this.defaultTTL,
            timestamp: Date.now(),
            senderId: this.identity.publicKey,
            signature: new Uint8Array(64),
          },
          payload,
        };

        const messageBytes = encodeMessage(message);
        message.header.signature = signMessage(
          messageBytes,
          this.identity.privateKey,
        );
        const encodedMessage = encodeMessage(message);

        // Route via Transport Manager
        try {
          await this.transportManager.send(peerId, encodedMessage);
        } catch (e) {
          // If an outbound transport callback is registered (simulation / native), use it
          if (this.outboundTransportCallback) {
            try {
              await this.outboundTransportCallback(peerId, encodedMessage);
            } catch (err) {
              console.warn(
                `[DHT] Failed to deliver message to ${peerId} via outboundTransportCallback.`,
                err,
              );
            }
          } else {
            // Fallback to flood if needed, or handle error
            console.warn(
              `[DHT] Failed to send message to ${peerId} via transports.`,
              e,
            );
          }
        }
      },
      { storage: config.dhtStorage },
    );

    // Initialize Discovery Manager
    this.discovery = new DiscoveryManager();
    if (config.bootstrapUrl) {
      this.discovery.registerProvider(
        new HttpBootstrapProvider(config.bootstrapUrl),
      );
    }
    this.discovery.onPeerDiscovered(this.handleDiscoveredPeer.bind(this));

    // Initialize Rendezvous Manager
    this.rendezvous = new RendezvousManager(
      this.localPeerId,
      this.dht,
      async (peerId, type, payload) => {
        const message: Message = {
          header: {
            version: 0x01,
            type,
            ttl: this.defaultTTL,
            timestamp: Date.now(),
            senderId: this.identity.publicKey,
            signature: new Uint8Array(64),
          },
          payload,
        };
        const messageBytes = encodeMessage(message);
        message.header.signature = signMessage(
          messageBytes,
          this.identity.privateKey,
        );
        const encodedMessage = encodeMessage(message);
        try {
          await this.transportManager.send(peerId, encodedMessage);
        } catch (e) {
          if (this.outboundTransportCallback) {
            try {
              await this.outboundTransportCallback(peerId, encodedMessage);
            } catch (err) {
              console.warn(
                `[Rendezvous] Failed to deliver to ${peerId} via outboundTransportCallback.`,
                err,
              );
            }
          } else {
            console.warn(`[Rendezvous] Failed to send to ${peerId}`, e);
          }
        }
      },
    );

    // Initialize BlobStore with persistent storage for sneakernet relay
    // In browser environments, use IndexedDB; in Node/test, use memory-only
    let blobPersistence;
    if (typeof indexedDB !== 'undefined') {
      blobPersistence = new IndexedDBBlobAdapter();
    }
    this.blobStore = new BlobStore(blobPersistence);
    
    // Initialize blob store asynchronously (non-blocking)
    this.blobStore.init().catch(err => {
      console.error('[BlobStore] Failed to initialize persistent storage:', err);
      // Continue with memory-only mode if IndexedDB fails
    });

    // Initialize Social Recovery
    this.socialRecovery = new SocialRecoveryManager(this);

    // Initialize Transfer Manager
    this.transferManager = new TransferManager(this);

    this.setupMessageHandlers();
  }

  /**
   * Set up message handlers for relay and peer pool
   */
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Set up message handlers for relay and peer pool
   */
  private setupMessageHandlers(): void {
    // Handle messages addressed to this peer
    this.messageRelay.onMessageForSelf((message: Message) => {
      this.messagesReceived++;
      this.bytesTransferred += message.payload.byteLength;

      // Extract sender ID - use first 16 chars (8 bytes) in uppercase to match peer ID format
      const senderId = Array.from(message.header.senderId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 16)
        .toUpperCase();

      // Handle Control Messages
      if (message.header.type === MessageType.CONTROL_PING) {
        this.sendPong(message.header.senderId, message.header.timestamp);
        return;
      }

      // Handle File Transfer Messages
      if (
        message.header.type === MessageType.FILE_METADATA ||
        message.header.type === MessageType.FILE_CHUNK
      ) {
        this.transferManager.handleMessage(
          message.header.type,
          message.payload,
        );
        return;
      }

      // Handle DHT Messages
      if (
        message.header.type === MessageType.DHT_FIND_NODE ||
        message.header.type === MessageType.DHT_FOUND_NODES ||
        message.header.type === MessageType.DHT_FIND_VALUE ||
        message.header.type === MessageType.DHT_STORE
      ) {
        this.dht.handleMessage(message);
        return;
      }

      if (
        message.header.type === MessageType.RENDEZVOUS_ANNOUNCE ||
        message.header.type === MessageType.RENDEZVOUS_QUERY ||
        message.header.type === MessageType.RENDEZVOUS_RESPONSE
      ) {
        this.rendezvous.handleMessage(message);
        return;
      }

      // Handle Blob Messages
      if (
        message.header.type === MessageType.REQUEST_BLOB ||
        message.header.type === MessageType.RESPONSE_BLOB
      ) {
        this.handleBlobMessage(message);
        return;
      }

      if (message.header.type === MessageType.CONTROL_PONG) {
        // Calculate RTT
        // Payload contains the original timestamp (8 bytes / 64-bit float stored as string or bytes)
        // For simplicity, let's assume payload is JSON string of timestamp
        try {
          const payloadStr = new TextDecoder().decode(message.payload);
          const data = JSON.parse(payloadStr);
          if (data.pingTimestamp) {
            const rtt = Date.now() - data.pingTimestamp;
            const monitor = this.peerMonitors.get(senderId);
            if (monitor) {
              monitor.updateLatency(rtt);
              // Update peer last seen timestamp
              this.routingTable.updatePeerLastSeen(senderId);
            }
          }
        } catch (e) {
          // Ignore malformed PONG
        }
        return;
      }

      // Handle Session Presence (Single-Session Enforcement)
      if (message.header.type === MessageType.SESSION_PRESENCE) {
        this.handleSessionPresence(senderId, message.payload);
        return;
      }

      // Notify all listeners
      this.messageListeners.forEach((listener) => {
        try {
          listener(message);
        } catch (error) {
          console.error("Error in message listener:", error);
        }
      });
    });

    // Handle message forwarding (Smart Routing)
    this.messageRelay.onForwardMessage(
      (message: Message, excludePeerId: string) => {
        const encodedMessage = encodeMessage(message);
        this.messagesSent++;
        this.bytesTransferred += encodedMessage.byteLength;

        // "Smart Flood" / Tiered Routing Logic
        let targetId: string | undefined;
        try {
          const payloadStr = new TextDecoder().decode(message.payload);
          const data = JSON.parse(payloadStr);
          targetId = data.recipient;
        } catch (e) {
          // Not a JSON payload or parsing failed -> Broadcast
        }

        if (targetId) {
          const candidates =
            this.routingTable.getRankedPeersForTarget(targetId);

          // Filter: Exclude sender and self
          const validCandidates = candidates.filter(
            (p) =>
              p.id !== excludePeerId &&
              p.id !== this.localPeerId &&
              p.state === "connected",
          );

          // Adaptive Selection Logic
          const totalCandidates = validCandidates.length;
          const FLOOD_THRESHOLD = 5; // "Few" threshold

          let countToSelect;
          if (totalCandidates <= FLOOD_THRESHOLD) {
            countToSelect = totalCandidates;
          } else {
            countToSelect = Math.max(
              FLOOD_THRESHOLD,
              Math.ceil(totalCandidates * 0.1),
            );
          }

          const selectedPeers = validCandidates.slice(0, countToSelect);

          if (selectedPeers.length === 0) {
            console.warn(
              `[MeshNetwork] No valid peers for forwarding to ${targetId}. Dropping.`,
            );
          }

          selectedPeers.forEach((peer) => {
            this.transportManager.send(peer.id, encodedMessage).catch((err) => {
              console.error(`Failed to forward to ${peer.id}`, err);
            });
          });
        } else {
          // Fallback to Full Flood via TransportManager (needs broadcast capability or manual loop)
          // TransportManager send is point-to-point.
          // We must iterate manual peers.
          this.routingTable.getAllPeers().forEach((peer) => {
            if (
              peer.id !== excludePeerId &&
              peer.id !== this.localPeerId &&
              peer.state === PeerState.CONNECTED
            ) {
              this.transportManager
                .send(peer.id, encodedMessage)
                .catch(() => {});
            }
          });
        }
      },
    );
  }

  // Handle incoming from Transport
  private handleIncomingTransportMessage(peerId: string, data: Uint8Array) {
    this.messageRelay.processMessage(data, peerId);

    // Update packet loss metrics (simplified)
    const monitor = this.peerMonitors.get(peerId);
    if (monitor) {
      monitor.updateBandwidth(data.length, 1000);
    }
  }

  /**
   * Start sending heartbeat (PING) messages
   */
  startHeartbeat(intervalMs: number = 30000): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    const hbMs = intervalMs ?? this.heartbeatMs;
    this.heartbeatInterval = setInterval(() => {
      this.broadcastPing();
    }, hbMs);
    try {
      if (
        this.heartbeatInterval &&
        typeof (this.heartbeatInterval as any).unref === "function"
      ) {
        (this.heartbeatInterval as any).unref();
      }
    } catch (e) {
      /* no-op */
    }

    // Also start health check loop
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = setInterval(() => {
      this.monitorConnectionHealth();
    }, this.healthCheckMs); // Configurable check interval
    try {
      if (
        this.healthCheckInterval &&
        typeof (this.healthCheckInterval as any).unref === "function"
      ) {
        (this.healthCheckInterval as any).unref();
      }
    } catch (e) {
      /* no-op */
    }
  }

  /**
   * Stop sending heartbeat messages
   */
  stopHeartbeat(): void {
    // Stop internals
    this.transportManager.stop().catch(console.error);

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async broadcastPing(): Promise<void> {
    try {
      // Validate identity keys before signing
      if (!this.identity?.privateKey || this.identity.privateKey.length !== 32) {
        console.warn('[MeshNetwork] broadcastPing skipped: invalid private key');
        return;
      }
      if (!this.identity?.publicKey || this.identity.publicKey.length !== 32) {
        console.warn('[MeshNetwork] broadcastPing skipped: invalid public key');
        return;
      }

      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.CONTROL_PING,
          ttl: 1,
          timestamp: Date.now(),
          senderId: this.identity.publicKey,
          signature: new Uint8Array(64),
        },
        payload: new Uint8Array(0),
      };

      const messageBytes = encodeMessage(message);
      message.header.signature = signMessage(
        messageBytes,
        this.identity.privateKey,
      );
      const encodedMessage = encodeMessage(message);

      this.routingTable.getAllPeers().forEach((peer) => {
        if (
          peer.state === PeerState.CONNECTED ||
          peer.state === PeerState.DEGRADED
        ) {
          this.transportManager.send(peer.id, encodedMessage).catch(() => {});
        }
      });
    } catch (error) {
      console.error('[MeshNetwork] broadcastPing failed:', error);
    }
  }

  private async sendPong(
    recipientPublicKey: Uint8Array,
    pingTimestamp: number,
  ): Promise<void> {
    const recipientId = Array.from(recipientPublicKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Echo back the ping timestamp
    const payload = new TextEncoder().encode(JSON.stringify({ pingTimestamp }));

    const message: Message = {
      header: {
        version: 0x01,
        type: MessageType.CONTROL_PONG,
        ttl: 1,
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(64),
      },
      payload: payload,
    };

    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(
      messageBytes,
      this.identity.privateKey,
    );
    const encodedMessage = encodeMessage(message);

    this.transportManager.send(recipientId, encodedMessage).catch(() => {});
  }

  /**
   * Monitor connection health and handle degradation
   */
  private peerFailureCounts: Map<string, number> = new Map();

  private monitorConnectionHealth(): void {
    this.peerMonitors.forEach((monitor, peerId) => {
      let quality = monitor.getQuality();
      const peer = this.routingTable.getPeer(peerId);

      if (!peer) {
        this.peerMonitors.delete(peerId);
        this.peerFailureCounts.delete(peerId);
        return;
      }

      // Check lastSeen as a fallback for silence detection
      const lastSeenAge = Date.now() - peer.lastSeen;
      if (lastSeenAge > 30000) {
        // 30 seconds silence
        quality = "offline";
      } else if (lastSeenAge > 10000 && quality !== "offline") {
        // 10 seconds silence
        quality = "poor";
      }

      // Update peer state based on quality
      if (quality === "poor" && peer.state === PeerState.CONNECTED) {
        peer.state = PeerState.DEGRADED;
      } else if (
        (quality === "good" || quality === "excellent") &&
        peer.state === PeerState.DEGRADED
      ) {
        peer.state = PeerState.CONNECTED;
        this.peerFailureCounts.set(peerId, 0);
      } else if (quality === "offline") {
        // Track consecutive offline checks
        const failures = (this.peerFailureCounts.get(peerId) || 0) + 1;
        this.peerFailureCounts.set(peerId, failures);

        if (failures >= 6) {
          // ~30 seconds of consecutive offline checks
          this.disconnectFromPeer(peerId).catch((err) =>
            console.error(`Error disconnecting peer ${peerId}:`, err),
          );
          this.peerFailureCounts.delete(peerId);
        }
      } else {
        // Reset failure count if healthy
        this.peerFailureCounts.set(peerId, 0);
      }
    });
  }

  /**
   * Connect to a peer via available transports
   */
  async connectToPeer(peerId: string): Promise<void> {
    console.log(`[MeshNetwork] connectToPeer called for ${peerId}`);

    if (this.routingTable.getAllPeers().length >= this.maxPeers) {
      console.warn(
        `[MeshNetwork] Max peers reached (${this.maxPeers}), cannot connect to ${peerId}`,
      );
      throw new Error("Maximum number of peers reached");
    }

    // Check if already connected
    const existingPeer = this.routingTable.getPeer(peerId);
    if (existingPeer && existingPeer.state === "connected") {
      console.log(`[MeshNetwork] Already connected to ${peerId}, skipping`);
      return;
    }

    const webrtcTransport = this.transportManager.getTransport("webrtc");
    if (webrtcTransport) {
      const state = webrtcTransport.getConnectionState(peerId);
      if (state === "connecting" || state === "connected") {
        console.log(`[MeshNetwork] Connection to ${peerId} is already in state: ${state}, skipping`);
        return;
      }
    }

    console.log(
      `[MeshNetwork] Initiating connection to ${peerId} via WebRTC...`,
    );

    // Use TransportManager to connect
    // Currently defaults to WebRTC as it's the only registered transport
    // but in future will try multiple
    return this.transportManager
      .connect(peerId, "webrtc")
      .then(() => {
        console.log(
          `[MeshNetwork] Connection initiated to ${peerId}, waiting for signaling...`,
        );
      })
      .catch((err) => {
        console.error(`[MeshNetwork] Failed to connect to ${peerId}:`, err);
        throw err;
      });
  }

  /**
   * Handle peer connected
   */
  private handlePeerConnected(peerId: string): void {
    // Get transport type - if it's not one of the known types, default to "webrtc"
    const transportName = this.webrtcTransport.name;
    const validTransportTypes = ["webrtc", "bluetooth", "local"] as const;
    const transportType = validTransportTypes.includes(transportName as any)
      ? (transportName as "webrtc" | "bluetooth" | "local")
      : "webrtc"; // Safe default fallback

    const peer = createPeer(
      peerId,
      new Uint8Array(32), // Would be obtained during handshake
      transportType,
    );

    this.routingTable.addPeer(peer);
    this.peerMonitors.set(peerId, new ConnectionMonitor()); // Start monitoring
    this.peerConnectedListeners.forEach((listener) => {
      try {
        listener(peerId);
      } catch (e) {
        console.error("Error in peer connected listener:", e);
      }
    });

    // Send peer announcement
    this.sendPeerAnnouncement();
  }

  /**
   * Handle peer disconnected
   */
  private handlePeerDisconnected(peerId: string): void {
    this.routingTable.removePeer(peerId);
    this.peerMonitors.delete(peerId); // Stop monitoring
    this.peerDisconnectedListeners.forEach((listener) => {
      try {
        listener(peerId);
      } catch (e) {
        console.error("Error in peer disconnected listener:", e);
      }
    });
  }

  /**
   * Send a text message with enhanced validation and rate limiting
   */
  async sendMessage(
    recipientId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<void> {
    // Normalize recipient ID to uppercase for consistent matching
    const normalizedRecipientId = recipientId.replace(/\s/g, "").toUpperCase();
    
    console.log(
      `[MeshNetwork] sendMessage to ${normalizedRecipientId}, type=${MessageType[type]}`,
    );

    // Validate message size for scaling
    const contentSize = new TextEncoder().encode(content).length;
    if (contentSize > this.maxMessageSize) {
      throw new Error(`Message size ${contentSize} exceeds maximum ${this.maxMessageSize} bytes`);
    }

    const payload = new TextEncoder().encode(
      JSON.stringify({
        text: content,
        timestamp: Date.now(),
        recipient: normalizedRecipientId,
      }),
    );

    const message: Message = {
      header: {
        version: 0x01,
        type: type,
        ttl: this.defaultTTL,
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(64), // Placeholder
      },
      payload,
    };

    // Sign the message
    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(
      messageBytes,
      this.identity.privateKey,
    );

    // Send via mesh
    const encodedMessage = encodeMessage(message);
    const nextHop = this.routingTable.getNextHop(normalizedRecipientId);

    console.log(
      `[MeshNetwork] Route lookup for ${normalizedRecipientId}: nextHop=${nextHop || "none"}, connectedPeers=${this.routingTable.getAllPeers().filter((p) => p.state === "connected").length}`,
    );

    if (nextHop) {
      // Direct route available
      console.log(`[MeshNetwork] Sending directly to nextHop=${nextHop}`);
      this.transportManager.send(nextHop, encodedMessage).catch((err) => {
        console.error(
          `[MeshNetwork] Failed to send to next hop ${nextHop}:`,
          err,
        );
      });
    } else {
      // Check if we have any connected peers at all
      const connectedPeers = this.routingTable
        .getAllPeers()
        .filter((p) => p.state === "connected" && p.id !== this.localPeerId);

      console.log(
        `[MeshNetwork] No direct route. Connected peers: ${connectedPeers.length}`,
      );

      if (connectedPeers.length === 0) {
        console.warn(
          `[MeshNetwork] No connected peers! Using sneakernet storage for ${recipientId}.`,
        );
        
        // SNEAKERNET: Store message for later delivery via any available peer
        try {
          await this.messageRelay.storeMessage(message, normalizedRecipientId);
          console.log(`[MeshNetwork] 📦 Message stored for sneakernet delivery to ${recipientId}`);
          this.messagesStored++;
        } catch (error) {
          console.error(`[MeshNetwork] Failed to store message for ${recipientId}:`, error);
          throw new Error(`No connected peers and failed to store message: ${error}`);
        }
        return;
      }

      // Attempt DHT lookup if no candidates found
      const candidates = this.routingTable.getRankedPeersForTarget(recipientId);

      const connectedCandidates = candidates.filter(
        (p) => p.state === "connected" && p.id !== this.localPeerId,
      );

      if (connectedCandidates.length === 0 && this.dht) {
        console.log(
          `[MeshNetwork] No known path to ${recipientId}, attempting DHT lookup...`,
        );
        try {
          const foundPeers = await this.dht.findNode(recipientId);
          const targetPeer = foundPeers.find((p) => p.id === recipientId);
          if (targetPeer) {
            console.log(
              `[MeshNetwork] Found ${recipientId} in DHT, attempting connection...`,
            );
            await this.connectToPeer(recipientId);
          }
        } catch (e) {
          console.warn(`[MeshNetwork] DHT lookup failed for ${recipientId}`, e);
        }
      }

      console.log(
        `[MeshNetwork] No direct route to ${recipientId}, initiating Smart Flood...`,
      );

      // Flood Fallback via TransportManager
      this.routingTable.getAllPeers().forEach((peer) => {
        if (
          peer.state === PeerState.CONNECTED &&
          peer.id !== this.localPeerId
        ) {
          this.transportManager.send(peer.id, encodedMessage).catch(() => {});
        }
      });
    }
  }

  /**
   * Send peer announcement to mesh
   */
  private sendPeerAnnouncement(): void {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        publicKey: Array.from(this.identity.publicKey)
          .map((b: number) => b.toString(16).padStart(2, "0"))
          .join(""),
        endpoints: [{ type: "webrtc", signaling: this.localPeerId }],
        capabilities: {
          supportedTransports: ["webrtc"],
          protocolVersion: 1,
        },
        timestamp: Date.now(),
      }),
    );

    const message: Message = {
      header: {
        version: 0x01,
        type: MessageType.PEER_DISCOVERY,
        ttl: this.defaultTTL,
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(64),
      },
      payload,
    };

    // Sign and broadcast
    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(
      messageBytes,
      this.identity.privateKey,
    );
    const encodedMessage = encodeMessage(message);

    // Broadcast via routing table
    this.routingTable.getAllPeers().forEach((peer) => {
      if (peer.state === PeerState.CONNECTED) {
        this.transportManager.send(peer.id, encodedMessage).catch(() => {});
      }
    });
  }



  onMessage(callback: (message: Message) => void): void {
    this.messageListeners.add(callback);
  }

  /**
   * Unregister callback for incoming messages
   */
  offMessage(callback: (message: Message) => void): void {
    this.messageListeners.delete(callback);
  }

  /**
   * Register a discovery provider
   */
  registerDiscoveryProvider(provider: DiscoveryProvider): void {
    this.discovery.registerProvider(provider);
  }

  /**
   * Handle discovered peer
   */
  private handleDiscoveredPeer(peer: DiscoveryPeer): void {
    const peerId = peer.id;
    if (peerId === this.localPeerId) return;

    if (!this.discoveredPeers.has(peerId)) {
      this.discoveredPeers.add(peerId);
      console.log(`Discovered new peer ${peerId} via ${peer.source}`);

      // Attempt to connect if we have capacity
      if (this.routingTable.getAllPeers().length < this.maxPeers) {
        console.log(
          `Discovered new peer ${peer.id} via ${peer.source}. Attempting connection...`,
        );

        try {
          if (peer.transportType === "ble") {
            console.log(
              `[MeshNetwork] BLE peer discovered. Native bridge required to connect to ${peer.id}`,
            );
            // In a real implementation: Bridge.connect(peer.id, peer.connectionDetails)
          } else {
            // Default to WebRTC / standard connection
            this.connectToPeer(peer.id).catch((err) => {
              console.warn(
                `Failed to auto-connect to discovered peer ${peerId}:`,
                err,
              );
            });
          }
        } catch (e) {
          console.error(`Failed to connect to discovered peer ${peer.id}:`, e);
        }
      }
    }

    // Notify listeners
    this.discoveryUpdateListeners.forEach((listener) => {
      try {
        listener(Array.from(this.discoveredPeers));
      } catch (e) {
        console.error("Error in discovery update listener:", e);
      }
    });
  }

  /**
   * Register callback for peer connected events
   */
  onPeerConnected(callback: (peerId: string) => void): void {
    this.peerConnectedListeners.add(callback);
  }

  /**
   * Unregister callback for peer connected events
   */
  offPeerConnected(callback: (peerId: string) => void): void {
    this.peerConnectedListeners.delete(callback);
  }

  /**
   * Register callback for peer disconnected events
   */
  onPeerDisconnected(callback: (peerId: string) => void): void {
    this.peerDisconnectedListeners.add(callback);
  }

  /**
   * Unregister callback for peer disconnected events
   */
  offPeerDisconnected(callback: (peerId: string) => void): void {
    this.peerDisconnectedListeners.delete(callback);
  }

  /**
   * Register callback for incoming peer tracks
   */
  /**
   * Register callback for incoming peer tracks
   */
  onPeerTrack(
    callback: (
      peerId: string,
      track: MediaStreamTrack,
      stream: MediaStream,
    ) => void,
  ): void {
    this.peerTrackListeners.add(callback);
  }

  offPeerTrack(
    callback: (
      peerId: string,
      track: MediaStreamTrack,
      stream: MediaStream,
    ) => void,
  ): void {
    this.peerTrackListeners.delete(callback);
  }

  // --- Blob Handlers ---

  private async handleBlobMessage(message: Message): Promise<void> {
    // Normalize sender ID to 16-char uppercase format
    const senderId = bytesToHex(message.header.senderId).substring(0, 16).toUpperCase();

    if (message.header.type === MessageType.REQUEST_BLOB) {
      try {
        const data = JSON.parse(new TextDecoder().decode(message.payload));
        const { hash, requestId } = data;

        const blob = await this.blobStore.get(hash);
        if (blob) {
          // Send Response
          const payload = new TextEncoder().encode(
            JSON.stringify({
              hash,
              requestId,
              blob: bytesToBase64(blob),
              recipient: senderId, // Add recipient for relay routing
            }),
          );

          const responseMsg: Message = {
            header: {
              version: 0x01,
              type: MessageType.RESPONSE_BLOB,
              ttl: this.defaultTTL,
              timestamp: Date.now(),
              senderId: this.identity.publicKey,
              signature: new Uint8Array(64),
            },
            payload,
          };
          const msgBytes = encodeMessage(responseMsg);
          responseMsg.header.signature = signMessage(
            msgBytes,
            this.identity.privateKey,
          );
          const encoded = encodeMessage(responseMsg);

          await this.transportManager.send(senderId, encoded);
        }
      } catch (e) {
        console.error("Error handling REQUEST_BLOB", e);
      }
    } else if (message.header.type === MessageType.RESPONSE_BLOB) {
      try {
        const data = JSON.parse(new TextDecoder().decode(message.payload));
        const { hash: _hash, requestId, blob } = data;

        const pending = this.pendingBlobRequests.get(requestId);
        if (pending) {
          const blobBuffer = base64ToBytes(blob);
          // Verify hash? Ideally yes.
          pending.resolve(blobBuffer);
          clearTimeout(pending.timeout);
          this.pendingBlobRequests.delete(requestId);
        }
      } catch (e) {
        console.error("Error processing RESPONSE_BLOB", e);
      }
    }
  }

  /**
   * Request a blob from a specific peer
   */
  async requestBlob(
    peerId: string,
    hash: string,
    timeoutMs: number = 5000,
  ): Promise<Uint8Array | null> {
    const requestId = Math.random().toString(36).substring(7);

    return new Promise<Uint8Array | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingBlobRequests.delete(requestId);
        // Don't reject, just return null if not found/timed out? Or reject.
        // For a DHT/Content fetch, null might be better if just "not found here".
        // But explicit timeout is useful.
        resolve(null);
      }, timeoutMs);

      this.pendingBlobRequests.set(requestId, { resolve, reject, timeout });

      const payload = new TextEncoder().encode(
        JSON.stringify({
          hash,
          requestId,
        }),
      );

      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.REQUEST_BLOB,
          ttl: this.defaultTTL,
          timestamp: Date.now(),
          senderId: this.identity.publicKey,
          signature: new Uint8Array(64),
        },
        payload,
      };

      const msgBytes = encodeMessage(message);
      message.header.signature = signMessage(
        msgBytes,
        this.identity.privateKey,
      );
      const encoded = encodeMessage(message);

      this.transportManager.send(peerId, encoded).catch((e) => {
        clearTimeout(timeout);
        this.pendingBlobRequests.delete(requestId);
        reject(e);
      });
    });
  }

  /**
   * Register callback for discovery updates
   */
  onDiscoveryUpdate(callback: (peers: string[]) => void): void {
    this.discoveryUpdateListeners.add(callback);
  }

  /**
   * Unregister callback for discovery updates
   */
  offDiscoveryUpdate(callback: (peers: string[]) => void): void {
    this.discoveryUpdateListeners.delete(callback);
  }

  /**
   * Add media stream to peer connection
   */
  async addStreamToPeer(peerId: string, stream: MediaStream): Promise<void> {
    const peer = this.webrtcTransport.getPool().getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found`);
    }

    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream);
    });

    // If connection is already established, we might need to renegotiate
    // But for now, we assume this is called before or during connection setup
    // Or that the browser handles renegotiation (which requires sending a new offer)

    // Trigger renegotiation if connected
    if (peer.getState() === "connected") {
      const offer = await peer.createOffer();
      await this.sendMessage(
        peerId,
        JSON.stringify({
          type: "SIGNAL",
          signal: { type: "offer", sdp: offer },
        }),
      );
    }
  }

  /**
   * Get connected peers
   */
  getConnectedPeers(): Peer[] {
    return this.routingTable.getAllPeers();
  }

  /**
   * Get a specific peer by ID
   */
  getPeer(peerId: string): Peer | undefined {
    return this.routingTable.getPeer(peerId);
  }

  /**
   * Get comprehensive network statistics for monitoring and scaling
   */
  async getStats() {
    const now = Date.now();
    const uptime = now - this.sessionTimestamp;
    const dhtTable = this.routingTable.getDHTRoutingTable();
    const dhtStats = dhtTable?.getStats ? dhtTable.getStats() : undefined;
    const dhtNodeCount = dhtStats?.nodeCount ?? 0;

    return {
      localPeerId: this.localPeerId,
      uptime,
      sessionTimestamp: this.sessionTimestamp,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      bytesTransferred: this.bytesTransferred,
      routing: this.routingTable.getStats(),
      relay: this.messageRelay.getStats(),
      peers: await this.webrtcTransport.getPool().getStats(),
      dht: this.dht
        ? {
            nodeId: bytesToHex(publicKeyToNodeId(this.identity.publicKey)),
            nodeCount: dhtNodeCount,
          }
        : null,
      performance: {
        maxPeers: this.maxPeers,
        currentPeers: this.routingTable.getAllPeers().length,
        connectedPeers: this.routingTable.getAllPeers().filter(p => p.state === 'connected').length,
        defaultTTL: this.defaultTTL,
        messageQueueSize: 10000, // Default from config
        rateLimitPerPeer: 100, // Default from config
      },
    };
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const signalingData = {
        type: "candidate" as const,
        data: candidate,
        from: peerId,
        to: this.localPeerId,
      };
      
      await this.webrtcTransport.handleSignaling(signalingData);
    } catch (error) {
      console.warn(`[MeshNetwork] Failed to process ICE candidate for ${peerId}:`, error);
    }
  }

  // ===== SESSION MANAGEMENT (Single-Session Enforcement) =====

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Start broadcasting session presence
   */
  private startSessionPresence(): void {
    // Clear existing interval if any
    if (this.sessionPresenceInterval)
      clearInterval(this.sessionPresenceInterval);

    // Broadcast immediately
    this.broadcastSessionPresence();

    // Then broadcast every 30 seconds
    this.sessionPresenceInterval = setInterval(() => {
      this.broadcastSessionPresence();
    }, 30000);

    // Allow Node.js to exit cleanly
    try {
      if (
        this.sessionPresenceInterval &&
        typeof (this.sessionPresenceInterval as any).unref === "function"
      ) {
        (this.sessionPresenceInterval as any).unref();
      }
    } catch (e) {
      /* no-op */
    }
  }

  /**
   * Stop broadcasting session presence
   */
  private stopSessionPresence(): void {
    if (this.sessionPresenceInterval) {
      clearInterval(this.sessionPresenceInterval);
      this.sessionPresenceInterval = null;
    }
  }

  /**
   * Broadcast session presence to all connected peers
   */
  private async broadcastSessionPresence(): Promise<void> {
    try {
      const payload = JSON.stringify({
        sessionId: this.sessionId,
        timestamp: this.sessionTimestamp,
        identityFingerprint: bytesToHex(this.identity.publicKey),
      });

      const payloadBytes = new TextEncoder().encode(payload);
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.SESSION_PRESENCE,
          ttl: this.defaultTTL,
          timestamp: Date.now(),
          senderId: this.identity.publicKey,
          signature: new Uint8Array(64),
        },
        payload: payloadBytes,
      };

      // Sign and broadcast
      // Note: We encode twice because signature must be computed over the message
      // without the signature field populated, then we set the signature and encode again
      const messageBytes = encodeMessage(message);
      message.header.signature = signMessage(
        messageBytes,
        this.identity.privateKey,
      );
      const encodedMessage = encodeMessage(message);

      // Broadcast to all connected peers
      this.routingTable.getAllPeers().forEach((peer) => {
        if (
          peer.state === PeerState.CONNECTED ||
          peer.state === PeerState.DEGRADED
        ) {
          this.transportManager.send(peer.id, encodedMessage).catch(() => {});
        }
      });
    } catch (error) {
      console.error("Failed to broadcast session presence:", error);
    }
  }

  /**
   * Handle incoming session presence message
   */
  private handleSessionPresence(fromPeerId: string, payload: any): void {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { sessionId, timestamp, identityFingerprint } = data;

      // Get our own identity fingerprint
      const ourFingerprint = bytesToHex(this.identity.publicKey);

      // Check if this is a duplicate session of our identity
      if (
        identityFingerprint === ourFingerprint &&
        sessionId !== this.sessionId
      ) {
        // Another session with our identity exists!
        // Determine which session should be invalidated
        let shouldInvalidate = false;

        if (timestamp > this.sessionTimestamp) {
          // Their timestamp is newer - invalidate this session
          shouldInvalidate = true;
        } else if (timestamp === this.sessionTimestamp) {
          // Race condition: same timestamp (e.g., simultaneous logins)
          // Use sessionId lexicographic comparison as deterministic tie-breaker
          shouldInvalidate = sessionId > this.sessionId;
        }

        if (shouldInvalidate) {
          console.warn(
            `Detected newer session for our identity. Invalidating this session.
            Our session: ${this.sessionId} (${new Date(this.sessionTimestamp).toISOString()})
            New session: ${sessionId} (${new Date(timestamp).toISOString()})`,
          );

          // Call the invalidation callback
          if (this.onSessionInvalidatedCallback) {
            this.onSessionInvalidatedCallback();
          }

          // Shutdown this instance
          this.shutdown();
        } else {
          // Our session is newer - the other session should invalidate itself
          console.info(
            `Detected older session for our identity. Our session is newer - keeping it.
            Our session: ${this.sessionId} (${new Date(this.sessionTimestamp).toISOString()})
            Old session: ${sessionId} (${new Date(timestamp).toISOString()})`,
          );
        }
      }
    } catch (error) {
      console.error("Failed to handle session presence:", error);
    }
  }

  /**
   * Register callback for session invalidation
   */
  onSessionInvalidated(callback: () => void): void {
    this.onSessionInvalidatedCallback = callback;
  }

  /**
   * Disconnect from all peers and shut down
   */
  shutdown(): void {
    this.transportManager.stop().catch(console.error);
    this.routingTable.getAllPeers().forEach((peer: Peer) => {
      this.routingTable.removePeer(peer.id);
    });
    this.stopHeartbeat();
    this.stopSessionPresence();
  } /**
   * Get local identity
   */
  getIdentity(): IdentityKeyPair {
    return this.identity;
  }

  /**
   * Get local peer ID
   */
  getLocalPeerId(): string {
    return this.localPeerId;
  }

  /**
   * Get public key
   */
  getPublicKey(): Uint8Array {
    return this.identity.publicKey;
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.routingTable.getAllPeers().length;
  }

  /**
   * Bootstrap the network by finding closest peers to self in DHT
   */
  async bootstrap(): Promise<void> {
    console.log("Bootstrapping DHT...");
    const peers = await this.dht.findNode(this.localPeerId);
    console.log(`DHT Bootstrap complete. Found ${peers.length} peers.`);

    // Attempt connections to discovered peers
    // Attempt connections to discovered peers
    for (const peer of peers) {
      if (peer.id !== this.localPeerId && !this.routingTable.getPeer(peer.id)) {
        // We know about them, but aren't connected.
        // If we have connection info (metadata implies we might, currently we don't store it fully in DHT response)
        // In full impl, FIND_NODE return values include IP/signal info.
        // For now, if we found them via DHT, it means someone else knows them.
        // We rely on the fact that `dht.ts` added them to routing table.
        // We may trigger connection attempts here if we have a way to signal them.

        // If we found them, we might want to try connecting if we are below maxPeers
        if (this.routingTable.getAllPeers().length < this.maxPeers) {
          // connection logic would go here if we had signaling info
          // For this version, just populating the routing table (done in DHT) is the first step.
        }
      }
    }
  }

  /**
   * Get the DHT instance
   */
  getDHT(): DHT {
    return this.dht;
  }

  /**
   * Send text message
   */
  async sendTextMessage(recipientId: string, text: string): Promise<void> {
    return this.sendMessage(recipientId, text);
  }

  /**
   * Send binary message
   */
  async sendBinaryMessage(
    recipientId: string,
    data: Uint8Array,
    type: MessageType = MessageType.FILE_CHUNK,
  ): Promise<void> {
    const message: Message = {
      header: {
        version: 0x01,
        type: type,
        ttl: this.defaultTTL,
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(65),
      },
      payload: data,
    };

    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(
      messageBytes,
      this.identity.privateKey,
    );
    const encodedMessage = encodeMessage(message);

    const nextHop = this.routingTable.getNextHop(recipientId);

    if (nextHop) {
      // Direct route available
      this.transportManager.send(nextHop, encodedMessage).catch((err) => {
        console.warn(`Failed to send binary message to ${nextHop}:`, err);
      });
    } else {
      // Broadcast to all peers (flood routing)
      this.routingTable.getAllPeers().forEach((peer) => {
        if (peer.state === "connected") {
          this.transportManager.send(peer.id, encodedMessage).catch(() => {});
        }
      });
    }
  }

  /**
   * Broadcast message to all peers
   */
  async broadcastMessage(text: string): Promise<void> {
    const payload = new TextEncoder().encode(text);
    const message: Message = {
      header: {
        version: 0x01,
        type: MessageType.TEXT,
        ttl: this.defaultTTL,
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(65),
      },
      payload,
    };

    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(
      messageBytes,
      this.identity.privateKey,
    );
    const encodedMessage = encodeMessage(message);

    this.routingTable.getAllPeers().forEach((peer) => {
      if (peer.state === "connected") {
        this.transportManager.send(peer.id, encodedMessage).catch(() => {});
      }
    });
  }

  /**
   * Disconnect from a specific peer
   */
  async disconnectFromPeer(peerId: string): Promise<void> {
    // Shim: Manually verify specific transport removal
    // Ideally this should differ to TransportManager
    this.webrtcTransport.getPool().removePeer(peerId);

    this.routingTable.removePeer(peerId);
  }

  /**
   * Disconnect from all peers
   */
  async disconnectAll(): Promise<void> {
    this.shutdown();
  }

  /**
   * Check if connected to a peer (with ID normalization)
   */
  isConnectedToPeer(peerId: string): boolean {
    // Normalize peer ID for consistent matching
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    const peer = this.routingTable.getPeer(normalizedPeerId);
    return Boolean(peer && peer.state === "connected");
  }

  /**
   * Get network statistics
   */
  getStatistics() {
    return {
      peerCount: this.getPeerCount(),
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      bytesTransferred: this.bytesTransferred,
    };
  }

  /**
   * Start the network
   */
  async start(): Promise<void> {
    await this.transportManager.start();
    this.startHeartbeat();
    this.startSessionPresence();
    this.startConnectionHealthMonitoring();
    this.messageRelay.start(); // Start sneakernet message retry
  }

  /**
   * Start connection health monitoring for rock-solid connections
   */
  private startConnectionHealthMonitoring(): void {
    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
    }

    this.connectionHealthCheckInterval = setInterval(() => {
      this.performConnectionHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    console.log('[MeshNetwork] 🔍 Started connection health monitoring');
  }

  /**
   * Perform comprehensive connection health check
   */
  private performConnectionHealthCheck(): void {
    const now = Date.now();
    const connectedPeers = this.routingTable.getAllPeers().filter(p => p.state === 'connected');
    
    console.log(`[MeshNetwork] 💓 Health check: ${connectedPeers.length} connected peers`);

    for (const peer of connectedPeers) {
      const lastSeen = peer.lastSeen || 0;
      const connectionAge = now - lastSeen;
      const attempts = this.connectionAttempts.get(peer.id) || 0;
      
      // Check for stale connections
      if (connectionAge > this.CONNECTION_TIMEOUT) {
        console.warn(`[MeshNetwork] ⚠️ Stale connection detected for ${peer.id} (${connectionAge}ms ago)`);
        
        if (attempts < this.MAX_CONNECTION_ATTEMPTS) {
          console.log(`[MeshNetwork] 🔄 Attempting to recover connection to ${peer.id}`);
          this.attemptConnectionRecovery(peer.id);
        } else {
          console.error(`[MeshNetwork] 💥 Too many failed attempts for ${peer.id}, disconnecting`);
          this.routingTable.removePeer(peer.id);
          this.peerDisconnectedListeners.forEach(listener => listener(peer.id));
        }
      } else {
        // Reset connection attempts for healthy connections
        this.connectionAttempts.delete(peer.id);
        this.lastConnectionAttempt.delete(peer.id);
      }
    }
  }

  /**
   * Attempt to recover a failing connection
   */
  private async attemptConnectionRecovery(peerId: string): Promise<void> {
    const attempts = (this.connectionAttempts.get(peerId) || 0) + 1;
    this.connectionAttempts.set(peerId, attempts);
    this.lastConnectionAttempt.set(peerId, Date.now());

    try {
      console.log(`[MeshNetwork] 🔄 Recovery attempt ${attempts}/${this.MAX_CONNECTION_ATTEMPTS} for ${peerId}`);
      
      // Remove old peer entry
      this.routingTable.removePeer(peerId);
      
      // Try to reconnect via transport
      await this.transportManager.connect(peerId);
      
      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if connection was successful
      const peer = this.routingTable.getPeer(peerId);
      if (peer && peer.state === 'connected') {
        console.log(`[MeshNetwork] ✅ Successfully recovered connection to ${peerId}`);
        this.connectionAttempts.delete(peerId);
        this.lastConnectionAttempt.delete(peerId);
      } else {
        throw new Error('Connection not established after recovery attempt');
      }
    } catch (error) {
      console.error(`[MeshNetwork] ❌ Recovery attempt ${attempts} failed for ${peerId}:`, error);
      
      if (attempts >= this.MAX_CONNECTION_ATTEMPTS) {
        console.error(`[MeshNetwork] 💥 Giving up on connection to ${peerId} after ${attempts} attempts`);
        this.routingTable.removePeer(peerId);
        this.peerDisconnectedListeners.forEach(listener => listener(peerId));
      }
    }
  }

  /**
   * Stop the network
   */
  async stop(): Promise<void> {
    // Clean up connection health monitoring
    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
      this.connectionHealthCheckInterval = undefined;
    }
    
    // Stop message relay retry process
    this.messageRelay.stop();
    
    this.shutdown();
  }

  // --- Manual Connection Methods (WAN Support) ---

  /**
   * Initiate a manual connection to a peer (for WAN/Serverless).
   * Returns the SDP Offer to be shared with the remote peer.
   */
  async createManualConnection(peerId: string): Promise<string> {
    if (this.routingTable.getAllPeers().length >= this.maxPeers) {
      throw new Error("Maximum number of peers reached");
    }

    // Create or get peer connection
    // Manual connection is specifically WEBRTC feature, so we access shim.
    // IMPORTANT: if we already have a peer connection for this peer, recreate it
    // before generating a new offer. Generating multiple offers / re-creating data
    // channels on an existing RTCPeerConnection can cause SDP m-line order mismatch.
    const pool = this.webrtcTransport.getPool();
    if (typeof (pool as any).has === "function" && (pool as any).has(peerId)) {
      try {
        const maybePromise = (pool as any).removePeer(peerId);
        if (maybePromise && typeof maybePromise.then === "function") {
          await maybePromise;
        }
      } catch (e) {
        // no-op
      }
    }
    const peer = pool.getOrCreatePeer(peerId);

    // Manual connection flow explicitly controls offer/answer exchange.
    // Disable automatic renegotiation offers during initial setup to avoid
    // concurrent offers and SDP m-line order mismatch.
    try {
      if ((peer as any).connection && typeof (peer as any).connection === "object") {
        (peer as any).connection.onnegotiationneeded = null;
      }
    } catch {
      // no-op
    }

    // Create data channels
    peer.createDataChannel({ label: "reliable", ordered: true });
    peer.createDataChannel({
      label: "unreliable",
      ordered: false,
      maxRetransmits: 0,
    });

    // Create offer
    await peer.createOffer();

    // Set up state change handler to ensure peer is registered when connected
    peer.onStateChange((state: string) => {
      if (state === "connected") {
        this.handlePeerConnected(peerId);
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        this.handlePeerDisconnected(peerId);
      }
    });

    // Wait for ICE gathering to complete (so candidates are included in SDP)
    await peer.waitForIceGathering();
    const offer = await peer.getLocalDescription();

    // Return the offer wrapped with metadata
    return JSON.stringify({
      type: "offer",
      peerId: this.localPeerId,
      sdp: offer,
    });
  }

  /**
   * Register a callback for signaling (ICE candidates, offers, answers) to be sent via external channel
   */
  registerSignalingCallback(
    callback: (peerId: string, signal: { type: string; candidate?: RTCIceCandidateInit; sdp?: RTCSessionDescriptionInit }) => Promise<void>,
  ): void {
    this.signalingCallback = callback;
  }

  /**
   * Register a callback for outbound messages via external transport (e.g., Native BLE)
   */
  registerOutboundTransport(
    callback: (peerId: string, data: Uint8Array) => Promise<void>,
  ): void {
    this.outboundTransportCallback = callback;
  }

  /**
   * Handle incoming raw packet from external transport (e.g., Native BLE)
   */
  async handleIncomingPacket(peerId: string, data: Uint8Array): Promise<void> {
    // Treat as if received from peer pool
    await this.messageRelay.processMessage(data, peerId);

    // Update metrics or checking if we need to add to table?
    // processMessage handles relay logic.
    // We should ensure the peer exists in routing table?
    // If it's a new peer sending us data, we might want to ensure they are "connected"
    if (!this.routingTable.getPeer(peerId)) {
      // We received data from an unknown peer via native transport.
      // The DiscoveryManager or native bridge shoutd ideally register them first.
      // But we can implicitly register or update last seen.
      // For now, let's assume Discovery handled registration or we just let it flow.
    }
  }

  /**
   * Accept a manual connection offer.
   * Returns the SDP Answer to be sent back to the initiator.
   */
  async acceptManualConnection(offerData: string): Promise<string> {
    const payload = JSON.parse(offerData);
    const { peerId, sdp } = payload;

    if (!peerId || !sdp || sdp.type !== "offer") {
      throw new Error("Invalid manual offer data");
    }

    // Create peer connection
    const peer = this.webrtcTransport.getPool().getOrCreatePeer(peerId);

    // Set remote description (Offer)
    await peer.setRemoteDescription(sdp);

    // Create answer
    await peer.createAnswer();

    // Set up state change handler to ensure peer is registered when connected
    peer.onStateChange((state: string) => {
      if (state === "connected") {
        this.handlePeerConnected(peerId);
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        this.handlePeerDisconnected(peerId);
      }
    });

    // Wait for ICE gathering
    await peer.waitForIceGathering();
    const answer = await peer.getLocalDescription();

    // Return the answer wrapped with metadata
    return JSON.stringify({
      type: "answer",
      peerId: this.localPeerId,
      sdp: answer,
    });
  }

  /**
   * Finalize a manual connection with the answer.
   */
  async finalizeManualConnection(answerData: string): Promise<void> {
    const payload = JSON.parse(answerData);
    const { peerId, sdp } = payload;

    if (!peerId || !sdp || sdp.type !== "answer") {
      throw new Error("Invalid manual answer data");
    }

    const peer = this.webrtcTransport.getPool().getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found (connection not initiated?)`);
    }

    await peer.setRemoteAnswer(sdp);
  }

  // --- DHT Operations ---

  /**
   * Store a value in the DHT
   */
  async dhtStore(key: string, value: Uint8Array): Promise<void> {
    await this.dht.store(key, value);
  }

  /**
   * Find a value in the DHT
   */
  async dhtFindValue(key: string): Promise<Uint8Array | null> {
    return this.dht.findValue(key);
  }

  /**
   * Find a node in the DHT
   */
  async dhtFindNode(nodeId: string): Promise<Peer | undefined> {
    const peers = await this.dht.findNode(nodeId);
    return peers.find((p) => p.id === nodeId);
  }

  /**
   * Send a file to a peer
   */
  async sendFile(peerId: string, file: File | Uint8Array): Promise<string> {
    return this.transferManager.sendFile(peerId, file);
  }
}
