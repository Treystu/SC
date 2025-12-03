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
import { Directory } from "./directory.js";
import { ConnectionMonitor } from "../connection-quality.js";

export interface MeshNetworkConfig {
  identity?: IdentityKeyPair;
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
  private onPublicRoomMessageCallback?: (message: any) => void;

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
    this.localPeerId = Array.from(this.identity.publicKey)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");

    // Configuration
    this.defaultTTL = config.defaultTTL || 10;
    this.maxPeers = config.maxPeers || 50;

    // Initialize components
    this.routingTable = new RoutingTable();
    this.messageRelay = new MessageRelay(
      this.localPeerId,
      this.routingTable,
      {},
      config.persistence as PersistenceAdapter,
    );
    this.peerPool = new PeerConnectionPool();

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
              // Update routing table metrics
              const metrics = monitor.getMetrics();
              this.routingTable.updateRouteMetrics(
                senderId,
                rtt,
                true,
                metrics.bandwidth,
              );
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
        this.peerPool.broadcast(encodedMessage, excludePeerId);
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
        signature: new Uint8Array(65),
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
        signature: new Uint8Array(65),
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

      // Update bandwidth metric in routing table
      const metrics = monitor.getMetrics();
      if (metrics.bandwidth > 0) {
        // We pass latency and success=true (assuming if we have bandwidth we are connected)
        // But updateRouteMetrics expects latency. We use current metric.
        this.routingTable.updateRouteMetrics(
          peerId,
          metrics.latency,
          true,
          metrics.bandwidth,
        );
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

    // Check if we can use HTTP signaling (Public Room)
    if (this.httpSignaling && this.peerPublicKeys.has(peerId)) {
      console.log(`Sending offer to ${peerId} via HTTP Signaling`);
      const recipientKey = this.peerPublicKeys.get(peerId);
      if (recipientKey) {
        await this.httpSignaling.sendSignal(
          peerId,
          "offer",
          offer,
          recipientKey,
        );

        // Also setup candidate forwarding if not already done
        // Note: This duplicates logic in joinPublicRoom, but ensures manual connections work
        peer.onSignal((signal: any) => {
          if (signal.type === "candidate") {
            this.httpSignaling?.sendSignal(
              peerId,
              "candidate",
              signal.candidate,
              recipientKey,
            );
          }
        });
      }
    } else {
      // Fallback to Mesh Signaling (only works if already connected to mesh)
      console.log(`Sending offer to ${peerId} via Mesh Signaling`);
      this.sendMessage(
        peerId,
        JSON.stringify({
          type: "SIGNAL",
          signal: { type: "offer", sdp: offer },
        }),
      ).catch((err) => console.error("Failed to send offer:", err));
    }

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
  async sendMessage(recipientId: string, content: string): Promise<void> {
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
        type: MessageType.TEXT,
        ttl: this.defaultTTL,
        timestamp: Date.now(),
        senderId: this.identity.publicKey,
        signature: new Uint8Array(65), // Placeholder
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
      }
    } else {
      // Broadcast to all peers (flood routing)
      this.peerPool.broadcast(encodedMessage);
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
        signature: new Uint8Array(65),
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
   * Register callback for public room messages
   */
  onPublicRoomMessage(callback: (message: any) => void): void {
    this.onPublicRoomMessageCallback = callback;
  }

  /**
   * Send message to public room
   */
  async sendPublicRoomMessage(content: string): Promise<void> {
    if (this.httpSignaling) {
      await this.httpSignaling.sendPublicMessage(content);
    } else {
      throw new Error("Not connected to a public room");
    }
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
  ): Promise<void> {
    const message: Message = {
      header: {
        version: 0x01,
        type: MessageType.FILE_CHUNK,
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

  // --- Public Room / HTTP Signaling Support ---

  private httpSignaling?: import("../transport/http-signaling.js").HttpSignalingClient;
  private wsSignaling?: import("../transport/websocket-signaling.js").WebSocketSignalingClient;
  private directory: Directory = new Directory();
  private peerPublicKeys: Map<string, Uint8Array> = new Map();

  /**
   * Join a Public Chat Room (Signaling Server).
   * This enables WAN discovery and signaling.
   */
  async joinPublicRoom(url: string): Promise<void> {
    const { HttpSignalingClient } =
      await import("../transport/http-signaling.js");
    this.httpSignaling = new HttpSignalingClient(
      url,
      this.localPeerId,
      this.identity,
    );

    // Helper to convert hex string to Uint8Array
    const fromHex = (hex: string): Uint8Array => {
      if (!hex) return new Uint8Array(0);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    };

    // Helper to convert Uint8Array to hex string
    const toHex = (bytes: Uint8Array): string => {
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };

    // Handle new peers discovered in the room
    this.httpSignaling.on("peerDiscovered", async (peer: any) => {
      if (peer._id === this.localPeerId) return;

      console.log("Discovered peer:", peer);

      // Track discovered peer
      if (!this.discoveredPeers.has(peer._id)) {
        this.discoveredPeers.add(peer._id);
        this.onDiscoveryUpdateCallback?.(Array.from(this.discoveredPeers));
      }

      // Store public key if available
      const pkHex = peer.metadata?.publicKey || peer.publicKey;
      if (pkHex) {
        const pk = fromHex(pkHex);
        if (pk.length === 32) {
          this.peerPublicKeys.set(peer._id, pk);
        } else {
          console.warn(
            `Invalid public key length for peer ${peer._id}: ${pk.length}`,
          );
        }
      } else {
        console.warn(`No public key found for peer ${peer._id}`);
      }

      // If not already connected, initiate connection

      // If not already connected, initiate connection
      const existingPeer = this.peerPool.getPeer(peer._id);
      if (
        !existingPeer ||
        existingPeer.getState() === "disconnected" ||
        existingPeer.getState() === "failed"
      ) {
        console.log(
          `Discovered peer in room: ${peer._id}, initiating connection (State: ${existingPeer?.getState() || "new"})...`,
        );

        // Use a slight random delay to reduce collision probability when two peers discover each other simultaneously
        const delay = Math.random() * 1000;
        setTimeout(async () => {
          try {
            // Double check status after delay
            const currentPeer = this.peerPool.getPeer(peer._id);
            if (
              currentPeer &&
              (currentPeer.getState() === "connected" ||
                currentPeer.getState() === "connecting")
            ) {
              return;
            }

            const p = this.peerPool.getOrCreatePeer(peer._id);

            // Setup ICE candidate forwarding
            // onSignal overwrites the previous callback, so no need to remove listeners explicitly
            p.onSignal((signal: any) => {
              if (signal.type === "candidate") {
                const recipientKey = this.peerPublicKeys.get(peer._id);
                if (recipientKey && recipientKey.length === 32) {
                  this.httpSignaling?.sendSignal(
                    peer._id,
                    "candidate",
                    signal.candidate,
                    recipientKey,
                  );
                } else {
                  // It's possible we don't have the key yet if we just discovered them
                  // But we should have it from the discovery payload
                  console.warn(
                    `Cannot send candidate to ${peer._id}: missing or invalid public key`,
                  );
                }
              }
            });

            p.createDataChannel({ label: "reliable", ordered: true });

            const offer = await p.createOffer();
            const recipientKey = this.peerPublicKeys.get(peer._id);

            if (recipientKey && recipientKey.length === 32) {
              await this.httpSignaling?.sendSignal(
                peer._id,
                "offer",
                offer,
                recipientKey,
              );
            } else {
              console.error(
                `Cannot send offer to ${peer._id}: missing or invalid public key`,
              );
            }
          } catch (err) {
            console.error(`Failed to create/send offer to ${peer._id}:`, err);
          }
        }, delay);
      }
    });

    // Handle incoming signals
    this.httpSignaling.on(
      "signal",
      async ({
        from,
        type,
        signal,
      }: {
        from: string;
        type: string;
        signal: any;
      }) => {
        if (from === this.localPeerId) return;

        // If signal contains sender's public key, store it
        if (signal.senderPublicKey) {
          this.peerPublicKeys.set(from, fromHex(signal.senderPublicKey));
        }

        const peer = this.peerPool.getOrCreatePeer(from);

        // Setup ICE candidate forwarding (if not already set)
        // Note: This might add multiple listeners if we are not careful.
        // Ideally we check if listener is attached.
        peer.onSignal((sig: any) => {
          if (sig.type === "candidate") {
            const recipientKey = this.peerPublicKeys.get(from);
            if (recipientKey) {
              this.httpSignaling?.sendSignal(
                from,
                "candidate",
                sig.candidate,
                recipientKey,
              );
            } else {
              console.error(
                `Cannot send candidate to ${from}: missing public key`,
              );
            }
          }
        });

        try {
          if (type === "offer") {
            const answer = await peer.createAnswer(signal);
            const recipientKey = this.peerPublicKeys.get(from);

            if (recipientKey) {
              await this.httpSignaling?.sendSignal(
                from,
                "answer",
                answer,
                recipientKey,
              );
            } else {
              console.error(
                `Cannot send answer to ${from}: missing public key`,
              );
            }
          } else if (type === "answer") {
            await peer.setRemoteAnswer(signal);
          } else if (type === "candidate") {
            await peer.addIceCandidate(signal);
          }
        } catch (err) {
          console.error(`Error handling signal from ${from}:`, err);
        }
      },
    );

    // Handle public messages
    this.httpSignaling.on("publicMessage", (msg: any) => {
      console.log("Public Room Message:", msg);
      this.onPublicRoomMessageCallback?.(msg);
    });

    await this.httpSignaling.join({
      agent: "sovereign-web",
      publicKey: toHex(this.identity.publicKey),
    });
  }

  /**
   * Leave Public Room
   */
  leavePublicRoom(): void {
    if (this.httpSignaling) {
      this.httpSignaling.stop();
      this.httpSignaling = undefined;
      this.discoveredPeers.clear();
      this.onDiscoveryUpdateCallback?.([]);
    }
  }

  /**
   * Join a Relay Server (WebSocket).
   * This enables persistent P2P signaling and directory sync.
   */
  async joinRelay(url: string): Promise<void> {
    const { WebSocketSignalingClient } =
      await import("../transport/websocket-signaling.js");
    this.wsSignaling = new WebSocketSignalingClient(
      url,
      this.localPeerId,
      this.directory,
    );

    this.wsSignaling.on("directoryUpdated", (entries: any[]) => {
      entries.forEach((entry) => {
        if (entry.id !== this.localPeerId) {
          if (!this.peerPool.getPeer(entry.id)) {
            console.log(`Discovered peer via relay: ${entry.id}`);
            this.connectViaRelay(entry.id);
          }
        }
      });
    });

    this.wsSignaling.on(
      "signal",
      async ({
        from,
        type,
        signal,
      }: {
        from: string;
        type: string;
        signal: any;
      }) => {
        if (from === this.localPeerId) return;

        const peer = this.peerPool.getOrCreatePeer(from);

        // Setup ICE candidate forwarding via WebSocket
        peer.onSignal((sig: any) => {
          if (sig.type === "candidate") {
            this.wsSignaling?.sendSignal(from, "candidate", sig.candidate);
          }
        });

        try {
          if (type === "offer") {
            const answer = await peer.createAnswer(signal);
            this.wsSignaling?.sendSignal(from, "answer", answer);
          } else if (type === "answer") {
            await peer.setRemoteAnswer(signal);
          } else if (type === "candidate") {
            await peer.addIceCandidate(signal);
          }
        } catch (err) {
          console.error(`Error handling signal from ${from}:`, err);
        }
      },
    );

    this.wsSignaling.connect();
  }

  private async connectViaRelay(peerId: string) {
    const p = this.peerPool.getOrCreatePeer(peerId);

    // Setup ICE candidate forwarding
    p.onSignal((signal: any) => {
      if (signal.type === "candidate") {
        this.wsSignaling?.sendSignal(peerId, "candidate", signal.candidate);
      }
    });

    p.createDataChannel({ label: "reliable", ordered: true });
    const offer = await p.createOffer();
    this.wsSignaling?.sendSignal(peerId, "offer", offer);
  }
}
