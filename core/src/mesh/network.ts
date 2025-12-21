/**
 * Mesh Network Manager
 * Orchestrates routing, relay, and transport connections
 */

import { Message, MessageType, encodeMessage } from "../protocol/message.js";
import { RoutingTable, Peer, createPeer, PeerState } from "./routing.js";
import { MessageRelay } from "./relay.js";
import { TransportManager, Transport } from "./transport/Transport.js";
import { WebRTCTransport } from "./transport/WebRTCTransport.js";
import {
  generateIdentity,
  IdentityKeyPair,
  signMessage,
} from "../crypto/primitives.js";
import { generateFingerprintSync } from "../utils/fingerprint.js";
import { ConnectionMonitor } from "../connection-quality.js";
import { DHT } from "./dht.js";
import {
  DiscoveryManager,
  DiscoveryPeer,
  DiscoveryProvider,
} from "./discovery.js";
import { HttpBootstrapProvider } from "../discovery/http-bootstrap.js";
import { StorageAdapter } from "./dht/storage/StorageAdapter.js";
import { RendezvousManager } from "./rendezvous.js";
import { BlobStore } from "../storage/blob-store.js";
import { SocialRecoveryManager } from "../recovery/social-recovery.js";

export interface MeshNetworkConfig {
  identity?: IdentityKeyPair;
  peerId?: string; // Explicit Peer ID (fingerprint)
  maxPeers?: number;
  defaultTTL?: number;
  persistence?: any;
  dhtStorage?: StorageAdapter;
  transports?: Transport[];
  bootstrapUrl?: string; // URL for HTTP bootstrap
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

  // Callbacks
  private messageListeners: Set<(message: Message) => void> = new Set();
  private onPeerConnectedCallback?: (peerId: string) => void;

  private onPeerDisconnectedCallback?: (peerId: string) => void;
  private onPeerTrackCallback?: (
    peerId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
  ) => void;
  private onDiscoveryUpdateCallback?: (peers: string[]) => void;

  // Replaced by Transport Registration (Legacy Support)
  private outboundTransportCallback?: (
    peerId: string,
    data: Uint8Array,
  ) => Promise<void>;

  // State
  private discoveredPeers: Set<string> = new Set();
  private peerMonitors: Map<string, ConnectionMonitor> = new Map();
  private healthCheckInterval: any;
  private pendingBlobRequests: Map<
    string,
    {
      resolve: (blob: Uint8Array | null) => void;
      reject: (err: Error) => void;
      timeout: any;
    }
  > = new Map();

  // Metrics tracking
  private messagesSent = 0;
  private messagesReceived = 0;
  private bytesTransferred = 0;

  constructor(config: MeshNetworkConfig = {}) {
    // Initialize identity
    this.identity = config.identity || generateIdentity();

    // Unified Identity: Use provided ID (likely fingerprint from DB) or generate new fingerprint
    this.localPeerId =
      config.peerId || generateFingerprintSync(this.identity.publicKey);

    // Configuration
    this.defaultTTL = config.defaultTTL || 10;
    this.maxPeers = config.maxPeers || 50;

    // Initialize components
    this.routingTable = new RoutingTable(this.localPeerId);
    this.messageRelay = new MessageRelay(
      this.localPeerId,
      this.routingTable,
      {},
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

    // Special Hook: WebRTC Signaling via Mesh
    // Since WebRTC needs to send signals over the existing mesh (if available), we hook into the pool.
    // In the future, this should be event-driven from the Transport itself.
    this.webrtcTransport.getPool().onSignal((peerId, signal) => {
      this.sendMessage(
        peerId,
        JSON.stringify({
          type: "SIGNAL",
          signal,
        }),
      ).catch((err) => console.error("Failed to send signal:", err));
    });

    this.webrtcTransport.getPool().onTrack((peerId, track, stream) => {
      this.onPeerTrackCallback?.(peerId, track, stream);
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
          // Fallback to flood if needed, or handle error
          console.warn(
            `[DHT] Failed to send message to ${peerId} via transports.`,
            e,
          );
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
          console.warn(`[Rendezvous] Failed to send to ${peerId}`, e);
        }
      },
    );

    // Initialize BlobStore
    this.blobStore = new BlobStore();

    // Initialize Social Recovery
    this.socialRecovery = new SocialRecoveryManager(this);

    this.setupMessageHandlers();
  }

  /**
   * Set up message handlers for relay and peer pool
   */
  private heartbeatInterval: any;

  /**
   * Set up message handlers for relay and peer pool
   */
  private setupMessageHandlers(): void {
    // Handle messages addressed to this peer
    this.messageRelay.onMessageForSelf((message: Message) => {
      this.messagesReceived++;
      this.bytesTransferred += message.payload.byteLength;

      const senderId = Array.from(message.header.senderId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Handle Control Messages
      if (message.header.type === MessageType.CONTROL_PING) {
        this.sendPong(message.header.senderId, message.header.timestamp);
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
    this.heartbeatInterval = setInterval(() => {
      this.broadcastPing();
    }, intervalMs);

    // Also start health check loop
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = setInterval(() => {
      this.monitorConnectionHealth();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop sending heartbeat messages
   */
  stopHeartbeat(): void {
    // Stop internals
    this.transportManager.stop().catch(console.error);

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private async broadcastPing(): Promise<void> {
    const message: Message = {
      header: {
        version: 0x01,
        type: MessageType.CONTROL_PING,
        ttl: 1, // Only neighbors
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(64),
      },
      payload: new Uint8Array(0),
    };

    // Sign and broadcast
    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(
      messageBytes,
      this.identity.privateKey,
    );
    const encodedMessage = encodeMessage(message);

    // Broadcast manually to all connected peers
    this.routingTable.getAllPeers().forEach((peer) => {
      if (
        peer.state === PeerState.CONNECTED ||
        peer.state === PeerState.DEGRADED
      ) {
        this.transportManager.send(peer.id, encodedMessage).catch(() => {});
      }
    });
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
    if (this.routingTable.getAllPeers().length >= this.maxPeers) {
      throw new Error("Maximum number of peers reached");
    }

    // Use TransportManager to connect
    // Currently defaults to WebRTC as it's the only registered transport
    // but in future will try multiple
    return this.transportManager.connect(peerId, "webrtc");
  }

  /**
   * Handle peer connected
   */
  private handlePeerConnected(peerId: string): void {
    const peer = createPeer(
      peerId,
      new Uint8Array(32), // Would be obtained during handshake
      "webrtc", // TODO: Get actual transport type
    );

    this.routingTable.addPeer(peer);
    this.peerMonitors.set(peerId, new ConnectionMonitor()); // Start monitoring
    this.onPeerConnectedCallback?.(peerId);

    // Send peer announcement
    this.sendPeerAnnouncement();
  }

  /**
   * Handle peer disconnected
   */
  private handlePeerDisconnected(peerId: string): void {
    this.routingTable.removePeer(peerId);
    this.peerMonitors.delete(peerId); // Stop monitoring
    this.onPeerDisconnectedCallback?.(peerId);
  }

  /**
   * Send a text message
   */
  async sendMessage(
    recipientId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<void> {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        text: content,
        timestamp: Date.now(),
        recipient: recipientId,
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
    const nextHop = this.routingTable.getNextHop(recipientId);

    console.log(
      `[MeshNetwork] sendMessage to ${recipientId}: nextHop=${nextHop}`,
    );

    if (nextHop) {
      // Direct route available
      this.transportManager.send(nextHop, encodedMessage).catch((err) => {
        console.error(`Failed to send to next hop ${nextHop}:`, err);
      });
    } else {
      // Attempt DHT lookup if no candidates found
      let candidates = this.routingTable.getRankedPeersForTarget(recipientId);

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

  /**
   * Register callback for incoming messages
   */
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
    this.onDiscoveryUpdateCallback?.(Array.from(this.discoveredPeers));
  }

  /**
   * Register callback for peer connected events
   */
  onPeerConnected(callback: (peerId: string) => void): void {
    this.onPeerConnectedCallback = callback;
  }

  /**
   * Register callback for peer disconnected events
   */
  onPeerDisconnected(callback: (peerId: string) => void): void {
    this.onPeerDisconnectedCallback = callback;
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
    this.onPeerTrackCallback = callback;
  }

  // --- Blob Handlers ---

  private async handleBlobMessage(message: Message): Promise<void> {
    const senderId = Buffer.from(message.header.senderId).toString("hex");

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
              blob: Buffer.from(blob).toString("base64"),
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
        const { hash, requestId, blob } = data;

        const pending = this.pendingBlobRequests.get(requestId);
        if (pending) {
          const blobBuffer = Buffer.from(blob, "base64");
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
    this.onDiscoveryUpdateCallback = callback;
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
   * Get network statistics
   */
  async getStats() {
    return {
      localPeerId: this.localPeerId,
      routing: this.routingTable.getStats(),
      relay: this.messageRelay.getStats(),
      // Use WebRTC specific stats for now as it's the primary transport
      peers: await this.webrtcTransport.getPool().getStats(),
    };
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
   * Check if connected to a peer
   */
  isConnectedToPeer(peerId: string): boolean {
    const peer = this.routingTable.getPeer(peerId);
    return peer !== null;
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
  }

  /**
   * Stop the network
   */
  async stop(): Promise<void> {
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
    // Manual connection is specifically WEBRTC feature, so we access shim
    const peer = this.webrtcTransport.getPool().getOrCreatePeer(peerId);

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

    // Create answer
    await peer.createAnswer(sdp);

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
}
