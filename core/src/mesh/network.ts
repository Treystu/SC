/**
 * Mesh Network Manager
 * Orchestrates routing, relay, and WebRTC connections
 */

import { Message, MessageType, encodeMessage } from "../protocol/message.js";
import { RoutingTable, Peer, createPeer, PeerState } from "./routing.js";
import { MessageRelay } from "./relay.js";
import { PeerConnectionPool } from "../transport/webrtc.js";
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

export interface MeshNetworkConfig {
  identity?: IdentityKeyPair;
  peerId?: string; // Explicit Peer ID (fingerprint)
  maxPeers?: number;
  defaultTTL?: number;
  persistence?: any; // Type 'PersistenceAdapter' is imported from relay.js but circular dependency might be an issue if not careful.
  // ideally import { PersistenceAdapter } from './relay.js';
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
  private peerPool: PeerConnectionPool;
  private localPeerId: string;
  private defaultTTL: number;
  private maxPeers: number;
  private dht: DHT;
  public discovery: DiscoveryManager;

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
  private outboundTransportCallback?: (
    peerId: string,
    data: Uint8Array,
  ) => Promise<void>;

  // State
  private discoveredPeers: Set<string> = new Set();
  private peerMonitors: Map<string, ConnectionMonitor> = new Map();
  private healthCheckInterval: any;

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
    this.peerPool = new PeerConnectionPool();

    // Initialize DHT
    this.dht = new DHT(this.routingTable, async (peerId, type, payload) => {
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

      const peer = this.peerPool.getPeer(peerId);
      if (peer && peer.getState() === "connected") {
        peer.send(encodedMessage);
      } else if (this.outboundTransportCallback) {
        // Fallback to external transport
        await this.outboundTransportCallback(peerId, encodedMessage);
      }
    });

    // Initialize Discovery Manager
    this.discovery = new DiscoveryManager();
    this.discovery.onPeerDiscovered(this.handleDiscoveredPeer.bind(this));

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

    // Handle message forwarding (flood routing)
    this.messageRelay.onForwardMessage(
      (message: Message, excludePeerId: string) => {
        const encodedMessage = encodeMessage(message);
        this.messagesSent++;
        this.bytesTransferred += encodedMessage.byteLength;

        // Broadcast via WebRTC
        this.peerPool.broadcast(encodedMessage, excludePeerId);

        // Broadcast via Native/External Transport
        if (this.outboundTransportCallback) {
          // In a real flood, we might just ask the native layer to "broadcast"
          // or we iterate known external peers.
          // For now, let's assume the native layer handles "broadcast" if we pass a special target or
          // we iterate here if we knew them.
          // Simplest Native Bridge: we just emit the packet and let Native handle routing if it's a "broadcast"?
          // Or we rely on the Native Bridge to be smart.
          // Let's iterate known non-WebRTC peers from routing table?

          // UNIFICATION PLAN: "Flood routing... works for 500 users... Task 2.1: Implement DHT"
          // With DHT, we shouldn't be flooding as much.
          // But for now, let's support flooding to external peers.

          this.routingTable.getAllPeers().forEach((peer) => {
            if (peer.id !== excludePeerId && peer.id !== this.localPeerId) {
              // If we possess a specific connection to them that is NOT WebRTC
              if (!this.peerPool.getPeer(peer.id)) {
                this.outboundTransportCallback!(peer.id, encodedMessage);
              }
            }
          });
        }
      },
    );

    // Handle incoming messages from peers
    this.peerPool.onMessage((peerId: string, data: Uint8Array) => {
      this.messageRelay.processMessage(data, peerId);

      // Update packet loss metrics (simplified)
      const monitor = this.peerMonitors.get(peerId);
      if (monitor) {
        // In a real implementation, we'd track sequence numbers to detect loss
        // For now, just mark activity
        monitor.updateBandwidth(data.length, 1000); // Approximate
      }
    });

    // Handle signaling messages from peers (ICE candidates, offers, answers)
    this.peerPool.onSignal((peerId: string, signal: any) => {
      // Send signal to peer via mesh
      // We wrap it in a special text message for now
      this.sendMessage(
        peerId,
        JSON.stringify({
          type: "SIGNAL",
          signal,
        }),
      ).catch((err) => console.error("Failed to send signal:", err));
    });

    // Handle incoming tracks (Audio/Video)
    this.peerPool.onTrack(
      (peerId: string, track: MediaStreamTrack, stream: MediaStream) => {
        this.onPeerTrackCallback?.(peerId, track, stream);
      },
    );
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

    this.peerPool.broadcast(encodedMessage);
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

    const peer = this.peerPool.getPeer(recipientId);
    if (peer && peer.getState() === "connected") {
      peer.send(encodedMessage);
    }
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

      // Update bandwidth metric in routing table (removed - Kademlia doesn't use route metrics)

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
        console.warn(
          `Connection to peer ${peerId} is poor (Last seen: ${lastSeenAge}ms ago). Marking as degraded.`,
        );
        peer.state = PeerState.DEGRADED;
      } else if (
        (quality === "good" || quality === "excellent") &&
        peer.state === PeerState.DEGRADED
      ) {
        console.log(`Connection to peer ${peerId} recovered.`);
        peer.state = PeerState.CONNECTED;
        this.peerFailureCounts.set(peerId, 0);
      } else if (quality === "offline") {
        // Track consecutive offline checks
        const failures = (this.peerFailureCounts.get(peerId) || 0) + 1;
        this.peerFailureCounts.set(peerId, failures);

        console.warn(
          `Peer ${peerId} is offline (Last seen: ${lastSeenAge}ms ago, Check ${failures}/6)`,
        );

        if (failures >= 6) {
          // ~30 seconds of consecutive offline checks
          console.error(
            `Peer ${peerId} has been offline for too long. Disconnecting to trigger reconnection.`,
          );
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
   * Connect to a peer via WebRTC
   */
  async connectToPeer(peerId: string): Promise<void> {
    if (this.routingTable.getAllPeers().length >= this.maxPeers) {
      throw new Error("Maximum number of peers reached");
    }

    // Create or get peer connection
    const peer = this.peerPool.getOrCreatePeer(peerId);

    // Create reliable data channel for messages
    peer.createDataChannel({
      label: "reliable",
      ordered: true,
    });

    // Create unreliable data channel for real-time data
    peer.createDataChannel({
      label: "unreliable",
      ordered: false,
      maxRetransmits: 0,
    });

    // Create and send offer
    const offer = await peer.createOffer();

    // Fallback to Mesh Signaling (only works if already connected to mesh)
    console.log(`Sending offer to ${peerId} via Mesh Signaling`);
    this.sendMessage(
      peerId,
      JSON.stringify({
        type: "SIGNAL",
        signal: { type: "offer", sdp: offer },
      }),
    ).catch((err) => console.error("Failed to send offer:", err));

    // Set up state change handler
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
  }

  /**
   * Handle peer connected
   */
  private handlePeerConnected(peerId: string): void {
    const peer = createPeer(
      peerId,
      new Uint8Array(32), // Would be obtained during handshake
      "webrtc",
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

    if (nextHop) {
      // Direct route available
      const peer = this.peerPool.getPeer(nextHop);
      if (peer && peer.getState() === "connected") {
        peer.send(encodedMessage);
      } else if (this.outboundTransportCallback) {
        // Try external transport
        this.outboundTransportCallback(nextHop, encodedMessage).catch((err) =>
          console.error(
            `Failed to send via external transport to ${nextHop}:`,
            err,
          ),
        );
      }
    } else {
      // Broadcast to all peers (flood routing)
      this.peerPool.broadcast(encodedMessage);

      // Also broadcast via external transport
      if (this.outboundTransportCallback) {
        this.routingTable.getAllPeers().forEach((peer) => {
          if (peer.id !== this.localPeerId && !this.peerPool.getPeer(peer.id)) {
            this.outboundTransportCallback!(peer.id, encodedMessage);
          }
        });
      }
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
    this.peerPool.broadcast(encodedMessage);
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
  private async handleDiscoveredPeer(peer: DiscoveryPeer): Promise<void> {
    // If we are already connected, just update metadata
    if (this.routingTable.getPeer(peer.id)) {
      // Update last seen
      this.routingTable.updatePeerLastSeen(peer.id);
      return;
    }

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
          await this.connectToPeer(peer.id);
        }
      } catch (e) {
        console.error(`Failed to connect to discovered peer ${peer.id}:`, e);
      }
    }
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
  onPeerTrack(
    callback: (
      peerId: string,
      track: MediaStreamTrack,
      stream: MediaStream,
    ) => void,
  ): void {
    this.onPeerTrackCallback = callback;
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
    const peer = this.peerPool.getPeer(peerId);
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
      peers: await this.peerPool.getStats(),
    };
  }

  /**
   * Disconnect from all peers and shut down
   */
  shutdown(): void {
    this.peerPool.closeAll();
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
    for (const peer of peers) {
      if (peer.id !== this.localPeerId && !this.peerPool.getPeer(peer.id)) {
        // We know about them, but aren't connected.
        // If we have connection info (metadata implies we might, currently we don't store it fully in DHT response)
        // In full impl, FIND_NODE return values include IP/signal info.
        // For now, if we found them via DHT, it means someone else knows them.
        // We rely on the fact that `dht.ts` added them to routing table.
        // We may trigger connection attempts here if we have a way to signal them.

        // If we found them, we might want to try connecting if we are below maxPeers
        if (this.peerPool.getConnectedPeers().length < this.maxPeers) {
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
      const peer = this.peerPool.getPeer(nextHop);
      if (peer && peer.getState() === "connected") {
        peer.send(encodedMessage);
      }
    } else {
      // Broadcast to all peers (flood routing)
      this.peerPool.broadcast(encodedMessage);
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

    this.peerPool.broadcast(encodedMessage);
  }

  /**
   * Disconnect from a specific peer
   */
  async disconnectFromPeer(peerId: string): Promise<void> {
    const peer = this.peerPool.getPeer(peerId);
    if (peer) {
      peer.close();
    }
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
    // Already initialized in constructor
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
    const peer = this.peerPool.getOrCreatePeer(peerId);

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
    const peer = this.peerPool.getOrCreatePeer(peerId);

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

    const peer = this.peerPool.getPeer(peerId);
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
