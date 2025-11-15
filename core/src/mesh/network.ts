/**
 * Mesh Network Manager
 * Orchestrates routing, relay, and WebRTC connections
 */

import { Message, MessageType, encodeMessage } from '../protocol/message';
import { RoutingTable, Peer, createPeer } from './routing';
import { MessageRelay } from './relay';
import { PeerConnectionPool } from '../transport/webrtc';
import { generateIdentity, IdentityKeyPair, signMessage } from '../crypto/primitives';

export interface MeshNetworkConfig {
  identity?: IdentityKeyPair;
  maxPeers?: number;
  defaultTTL?: number;
}

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
  private onMessageCallback?: (message: Message) => void;
  private onPeerConnectedCallback?: (peerId: string) => void;
  private onPeerDisconnectedCallback?: (peerId: string) => void;

  // Metrics tracking
  private messagesSent = 0;
  private messagesReceived = 0;
  private bytesTransferred = 0;

  constructor(config: MeshNetworkConfig = {}) {
    // Initialize identity
    this.identity = config.identity || generateIdentity();
    this.localPeerId = Array.from(this.identity.publicKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Configuration
    this.defaultTTL = config.defaultTTL || 10;
    this.maxPeers = config.maxPeers || 50;

    // Initialize components
    this.routingTable = new RoutingTable();
    this.messageRelay = new MessageRelay(this.localPeerId, this.routingTable);
    this.peerPool = new PeerConnectionPool();

    this.setupMessageHandlers();
  }

  /**
   * Set up message handlers for relay and peer pool
   */
  private setupMessageHandlers(): void {
    // Handle messages addressed to this peer
    this.messageRelay.onMessageForSelf((message) => {
      this.messagesReceived++;
      this.bytesTransferred += message.payload.byteLength;
      this.onMessageCallback?.(message);
    });

    // Handle message forwarding (flood routing)
    this.messageRelay.onForwardMessage((message, excludePeerId) => {
      const encodedMessage = encodeMessage(message);
      this.messagesSent++;
      this.bytesTransferred += encodedMessage.byteLength;
      this.peerPool.broadcast(encodedMessage, excludePeerId);
    });

    // Handle incoming messages from peers
    this.peerPool.onMessage((peerId, data) => {
      this.messageRelay.processMessage(data, peerId);
    });
  }

  /**
   * Connect to a peer via WebRTC
   */
  async connectToPeer(peerId: string): Promise<void> {
    if (this.routingTable.getAllPeers().length >= this.maxPeers) {
      throw new Error('Maximum number of peers reached');
    }

    // Create or get peer connection
    const peer = this.peerPool.getOrCreatePeer(peerId);

    // Create reliable data channel for messages
    peer.createDataChannel({
      label: 'reliable',
      ordered: true,
    });

    // Create unreliable data channel for real-time data
    peer.createDataChannel({
      label: 'unreliable',
      ordered: false,
      maxRetransmits: 0,
    });

    // Create and send offer
    const offer = await peer.createOffer();
    
    // In a real implementation, this would be sent via mesh signaling
    console.log('Offer created for peer:', peerId);

    // Set up state change handler
    peer.onStateChange((state) => {
      if (state === 'connected') {
        this.handlePeerConnected(peerId);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
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
      'webrtc'
    );

    this.routingTable.addPeer(peer);
    this.onPeerConnectedCallback?.(peerId);

    // Send peer announcement
    this.sendPeerAnnouncement();
  }

  /**
   * Handle peer disconnected
   */
  private handlePeerDisconnected(peerId: string): void {
    this.routingTable.removePeer(peerId);
    this.onPeerDisconnectedCallback?.(peerId);
  }

  /**
   * Send a text message
   */
  async sendMessage(recipientId: string, content: string): Promise<void> {
    const payload = new TextEncoder().encode(JSON.stringify({
      text: content,
      timestamp: Date.now(),
      recipient: recipientId,
    }));

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
    message.header.signature = signMessage(messageBytes, this.identity.privateKey);

    // Send via mesh
    const encodedMessage = encodeMessage(message);
    const nextHop = this.routingTable.getNextHop(recipientId);

    if (nextHop) {
      // Direct route available
      const peer = this.peerPool.getPeer(nextHop);
      if (peer && peer.getState() === 'connected') {
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
    const payload = new TextEncoder().encode(JSON.stringify({
      publicKey: Array.from(this.identity.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      endpoints: [
        { type: 'webrtc', signaling: this.localPeerId },
      ],
      timestamp: Date.now(),
    }));

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
    message.header.signature = signMessage(messageBytes, this.identity.privateKey);
    const encodedMessage = encodeMessage(message);
    this.peerPool.broadcast(encodedMessage);
  }

  /**
   * Register callback for incoming messages
   */
  onMessage(callback: (message: Message) => void): void {
    this.onMessageCallback = callback;
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
   * Get connected peers
   */
  getConnectedPeers(): Peer[] {
    return this.routingTable.getAllPeers();
  }

  /**
   * Get network statistics
   */
  getStats() {
    return {
      localPeerId: this.localPeerId,
      routing: this.routingTable.getStats(),
      relay: this.messageRelay.getStats(),
      peers: this.peerPool.getStats(),
    };
  }

  /**
   * Disconnect from all peers and shut down
   */
  shutdown(): void {
    this.peerPool.closeAll();
    this.routingTable.getAllPeers().forEach(peer => {
      this.routingTable.removePeer(peer.id);
    });
  }

  /**
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
  async sendBinaryMessage(recipientId: string, data: Uint8Array): Promise<void> {
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
    message.header.signature = signMessage(messageBytes, this.identity.privateKey);
    const encodedMessage = encodeMessage(message);
    
    this.peerPool.broadcast(encodedMessage);
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
    message.header.signature = signMessage(messageBytes, this.identity.privateKey);
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
}
