/**
 * MockTransport - A mock implementation of the Transport interface for testing.
 * 
 * This mock transport simulates peer-to-peer communication in memory,
 * allowing unit and integration tests to run without actual network connectivity.
 * 
 * Features:
 * - Simulates latency and message delivery
 * - Tracks sent/received messages for test assertions
 * - Supports multiple mock transport instances connected together
 * - Configurable failure modes for testing error handling
 */

import {
  Transport,
  TransportPeerId,
  TransportMessage,
  TransportEvents,
  TransportConfig,
  TransportPeerInfo,
  TransportConnectionState,
  SignalingData,
} from "../Transport.js";

/**
 * Configuration options specific to MockTransport.
 */
export interface MockTransportConfig extends TransportConfig {
  /** Simulated latency in milliseconds (default: 0) */
  latencyMs?: number;
  /** Probability of message loss (0-1, default: 0) */
  packetLossRate?: number;
  /** Simulated connection delay in milliseconds (default: 0) */
  connectionDelayMs?: number;
  /** If true, connections will fail */
  failConnections?: boolean;
  /** If true, message sends will fail */
  failSends?: boolean;
}

/**
 * Shared registry of MockTransport instances for simulating a network.
 */
const mockNetworkRegistry: Map<TransportPeerId, MockTransport> = new Map();

/**
 * MockTransport implementation for testing purposes.
 */
export class MockTransport implements Transport {
  readonly localPeerId: TransportPeerId;

  private config: MockTransportConfig;
  private events: TransportEvents | null = null;
  private peers: Map<TransportPeerId, TransportPeerInfo> = new Map();
  private isRunning = false;

  // Tracking for test assertions
  public sentMessages: TransportMessage[] = [];
  public receivedMessages: TransportMessage[] = [];
  public connectionAttempts: TransportPeerId[] = [];
  public disconnectionAttempts: TransportPeerId[] = [];

  constructor(localPeerId: TransportPeerId, config: MockTransportConfig = {}) {
    this.localPeerId = localPeerId;
    this.config = {
      latencyMs: 0,
      packetLossRate: 0,
      connectionDelayMs: 0,
      failConnections: false,
      failSends: false,
      ...config,
    };
  }

  /**
   * Register this transport in the mock network for cross-instance communication.
   */
  private registerInNetwork(): void {
    mockNetworkRegistry.set(this.localPeerId, this);
  }

  /**
   * Unregister this transport from the mock network.
   */
  private unregisterFromNetwork(): void {
    mockNetworkRegistry.delete(this.localPeerId);
  }

  /**
   * Simulate message delivery with optional latency.
   */
  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs && this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
  }

  /**
   * Check if a message should be dropped due to simulated packet loss.
   */
  private shouldDropMessage(): boolean {
    const lossRate = this.config.packetLossRate || 0;
    return Math.random() < lossRate;
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;
    this.registerInNetwork();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.unregisterFromNetwork();

    // Disconnect all peers
    for (const peerId of this.peers.keys()) {
      await this.disconnect(peerId);
    }

    this.events = null;
  }

  async connect(peerId: TransportPeerId, _signalingData?: SignalingData): Promise<void> {
    this.connectionAttempts.push(peerId);

    if (this.config.failConnections) {
      const error = new Error(`Connection to ${peerId} failed (mock failure)`);
      this.events?.onError?.(error, peerId);
      throw error;
    }

    // Simulate connection delay
    if (this.config.connectionDelayMs && this.config.connectionDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.connectionDelayMs));
    }

    // Update state to connecting
    this.events?.onStateChange?.(peerId, "connecting");

    // Create peer info
    const peerInfo: TransportPeerInfo = {
      peerId,
      state: "connected",
      transportType: "mock",
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
    };

    this.peers.set(peerId, peerInfo);

    // Notify peer connection
    this.events?.onPeerConnected?.(peerId, peerInfo);
    this.events?.onStateChange?.(peerId, "connected");

    // If the remote peer exists in the network, establish bidirectional connection
    const remotePeer = mockNetworkRegistry.get(peerId);
    if (remotePeer && remotePeer !== this && !remotePeer.peers.has(this.localPeerId)) {
      await remotePeer.handleIncomingConnection(this.localPeerId);
    }
  }

  /**
   * Handle an incoming connection from another MockTransport.
   */
  async handleIncomingConnection(remotePeerId: TransportPeerId): Promise<void> {
    if (this.config.failConnections) {
      return;
    }

    const peerInfo: TransportPeerInfo = {
      peerId: remotePeerId,
      state: "connected",
      transportType: "mock",
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
    };

    this.peers.set(remotePeerId, peerInfo);
    this.events?.onPeerConnected?.(remotePeerId, peerInfo);
    this.events?.onStateChange?.(remotePeerId, "connected");
  }

  async disconnect(peerId: TransportPeerId): Promise<void> {
    this.disconnectionAttempts.push(peerId);

    const peerInfo = this.peers.get(peerId);
    if (peerInfo) {
      peerInfo.state = "disconnected";
      this.peers.delete(peerId);
      this.events?.onPeerDisconnected?.(peerId);
      this.events?.onStateChange?.(peerId, "disconnected");
    }

    // Notify the remote peer if it exists
    const remotePeer = mockNetworkRegistry.get(peerId);
    if (remotePeer && remotePeer.peers.has(this.localPeerId)) {
      remotePeer.handleRemoteDisconnection(this.localPeerId);
    }
  }

  /**
   * Handle disconnection initiated by a remote peer.
   */
  handleRemoteDisconnection(remotePeerId: TransportPeerId): void {
    const peerInfo = this.peers.get(remotePeerId);
    if (peerInfo) {
      peerInfo.state = "disconnected";
      this.peers.delete(remotePeerId);
      this.events?.onPeerDisconnected?.(remotePeerId);
      this.events?.onStateChange?.(remotePeerId, "disconnected");
    }
  }

  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Transport is not running");
    }

    if (this.config.failSends) {
      const error = new Error(`Send to ${peerId} failed (mock failure)`);
      this.events?.onError?.(error, peerId);
      throw error;
    }

    const peerInfo = this.peers.get(peerId);
    if (!peerInfo || peerInfo.state !== "connected") {
      throw new Error(`Peer ${peerId} is not connected`);
    }

    const message: TransportMessage = {
      from: this.localPeerId,
      to: peerId,
      payload: payload,
      timestamp: Date.now(),
    };

    this.sentMessages.push(message);

    // Update bytes sent
    peerInfo.bytesSent = (peerInfo.bytesSent || 0) + payload.length;

    // Simulate packet loss
    if (this.shouldDropMessage()) {
      return; // Message is "lost"
    }

    // Simulate latency
    await this.simulateLatency();

    // Deliver to remote peer
    const remotePeer = mockNetworkRegistry.get(peerId);
    if (remotePeer) {
      remotePeer.receiveMessage(message);
    }
  }

  /**
   * Handle receiving a message from another MockTransport.
   */
  receiveMessage(message: TransportMessage): void {
    if (!this.isRunning) {
      return;
    }

    this.receivedMessages.push(message);

    // Update bytes received
    const peerInfo = this.peers.get(message.from);
    if (peerInfo) {
      peerInfo.bytesReceived = (peerInfo.bytesReceived || 0) + message.payload.length;
      peerInfo.lastSeen = Date.now();
    }

    // Notify listeners
    this.events?.onMessage(message);
  }

  async broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const peerId of this.peers.keys()) {
      if (peerId !== excludePeerId) {
        promises.push(this.send(peerId, payload).catch(() => {
          // Ignore individual send failures during broadcast
        }));
      }
    }

    await Promise.all(promises);
  }

  getConnectedPeers(): TransportPeerId[] {
    return Array.from(this.peers.entries())
      .filter(([_, info]) => info.state === "connected")
      .map(([peerId]) => peerId);
  }

  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getConnectionState(peerId: TransportPeerId): TransportConnectionState | undefined {
    return this.peers.get(peerId)?.state;
  }

  /**
   * Reset tracking data for test assertions.
   */
  resetTracking(): void {
    this.sentMessages = [];
    this.receivedMessages = [];
    this.connectionAttempts = [];
    this.disconnectionAttempts = [];
  }

  /**
   * Update mock configuration at runtime (useful for testing error scenarios).
   */
  updateConfig(config: Partial<MockTransportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if transport is currently running.
   */
  isTransportRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Clear the global mock network registry.
 * Call this in test teardown to ensure clean state between tests.
 */
export function clearMockNetwork(): void {
  mockNetworkRegistry.clear();
}

/**
 * Get all registered mock transports (for debugging/testing).
 */
export function getMockNetworkPeers(): TransportPeerId[] {
  return Array.from(mockNetworkRegistry.keys());
}
