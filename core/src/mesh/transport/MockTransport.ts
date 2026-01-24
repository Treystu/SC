/**
 * Mock Transport Implementation
 *
 * Provides a fake transport layer for testing that uses the outbound transport callback
 * to simulate network message delivery between peers.
 */

import {
  Transport,
  TransportEvents,
  TransportMessage,
  TransportPeerId,
  TransportConnectionState,
  TransportPeerInfo,
} from "../../transport/Transport.js";

export type MockTransportCallback = (peerId: string, data: Uint8Array) => Promise<void>;

export class MockTransport implements Transport {
  public readonly name = "mock";
  public readonly localPeerId: string;

  private events?: TransportEvents;
  private connections: Map<string, TransportConnectionState> = new Map();
  private outboundCallback?: MockTransportCallback;

  constructor(localPeerId?: string, outboundCallback?: MockTransportCallback) {
    this.localPeerId = localPeerId || "MOCK-TRANSPORT-ID";
    this.outboundCallback = outboundCallback;
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    console.log('[MockTransport] Started');
  }

  async stop(): Promise<void> {
    this.connections.clear();
    this.events = undefined;
    console.log('[MockTransport] Stopped');
  }

  async connect(peerId: TransportPeerId): Promise<void> {
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    console.log(`[MockTransport] Connecting to ${normalizedPeerId}`);

    // Simulate connection establishment
    this.connections.set(normalizedPeerId, "connecting");
    this.events?.onStateChange?.(normalizedPeerId, "connecting");

    // Simulate async connection process
    await new Promise(resolve => setTimeout(resolve, 10));

    // Mark as connected
    this.connections.set(normalizedPeerId, "connected");
    this.events?.onStateChange?.(normalizedPeerId, "connected");
    this.events?.onPeerConnected?.(normalizedPeerId);

    console.log(`[MockTransport] Connected to ${normalizedPeerId}`);
  }

  async disconnect(peerId: TransportPeerId): Promise<void> {
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    console.log(`[MockTransport] Disconnecting from ${normalizedPeerId}`);

    this.connections.set(normalizedPeerId, "disconnected");
    this.events?.onStateChange?.(normalizedPeerId, "disconnected");

    // Simulate async disconnection
    await new Promise(resolve => setTimeout(resolve, 5));

    this.connections.delete(normalizedPeerId);
    this.events?.onStateChange?.(normalizedPeerId, "disconnected");
    this.events?.onPeerDisconnected?.(normalizedPeerId);

    console.log(`[MockTransport] Disconnected from ${normalizedPeerId}`);
  }

  async send(peerId: TransportPeerId, data: Uint8Array): Promise<void> {
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();

    if (!this.isConnected(normalizedPeerId)) {
      throw new Error(`Not connected to peer ${normalizedPeerId}`);
    }

    console.log(`[MockTransport] Sending ${data.length} bytes to ${normalizedPeerId}`);

    if (this.outboundCallback) {
      try {
        await this.outboundCallback(normalizedPeerId, data);
        console.log(`[MockTransport] Message delivered via callback to ${normalizedPeerId}`);
      } catch (error) {
        console.error(`[MockTransport] Failed to deliver to ${normalizedPeerId}:`, error);
        throw error;
      }
    } else {
      console.warn(`[MockTransport] No outbound callback configured, message to ${normalizedPeerId} dropped`);
    }
  }

  getConnectionState(peerId: TransportPeerId): TransportConnectionState {
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    return this.connections.get(normalizedPeerId) || "disconnected";
  }

  async broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void> {
    const connectedPeers = this.getConnectedPeers();
    const excludeNormalized = excludePeerId?.replace(/\s/g, "").toUpperCase();

    for (const peerId of connectedPeers) {
      if (peerId !== excludeNormalized) {
        try {
          await this.send(peerId, payload);
        } catch (error) {
          console.error(`[MockTransport] Failed to broadcast to ${peerId}:`, error);
        }
      }
    }
  }

  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    const state = this.connections.get(normalizedPeerId);

    if (!state) {
      return undefined;
    }

    return {
      peerId: normalizedPeerId,
      state,
      transportType: "mock",
      connectionQuality: 100,
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
    };
  }

  async handleIncomingMessage(fromPeerId: string, data: Uint8Array): Promise<void> {
    const normalizedPeerId = fromPeerId.replace(/\s/g, "").toUpperCase();
    console.log(`[MockTransport] Received ${data.length} bytes from ${normalizedPeerId}`);

    // Ensure we have this peer marked as connected
    if (!this.isConnected(normalizedPeerId)) {
      console.log(`[MockTransport] Auto-connecting to incoming peer ${normalizedPeerId}`);
      this.connections.set(normalizedPeerId, "connected");
      this.events?.onPeerConnected?.(normalizedPeerId);
    }

    // Deliver message
    const message: TransportMessage = {
      from: normalizedPeerId,
      payload: data,
    };

    this.events?.onMessage?.(message);
  }

  private isConnected(peerId: string): boolean {
    return this.getConnectionState(peerId) === "connected";
  }

  /**
   * Manually establish connection for testing
   */
  forceConnect(peerId: string): void {
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    console.log(`[MockTransport] Force connecting to ${normalizedPeerId}`);

    this.connections.set(normalizedPeerId, "connected");
    this.events?.onStateChange?.(normalizedPeerId, "connected");
    this.events?.onPeerConnected?.(normalizedPeerId);
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, state]) => state === "connected")
      .map(([peerId]) => peerId);
  }

  /**
   * Set the outbound callback for message delivery
   */
  setOutboundCallback(callback: MockTransportCallback): void {
    this.outboundCallback = callback;
  }
}