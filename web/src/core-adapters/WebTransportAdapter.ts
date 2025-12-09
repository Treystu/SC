/**
 * Web Transport Adapter
 * 
 * Provides a web-specific implementation of the Transport interface
 * that bridges between the React/Web application and the core library's
 * transport abstraction.
 * 
 * This adapter wraps WebRTC functionality and integrates with the web
 * application's signaling mechanisms.
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
  WebRTCTransport,
  type WebRTCTransportConfig,
} from "@sc/core";

/**
 * Web-specific transport configuration.
 */
export interface WebTransportConfig extends TransportConfig {
  /** STUN/TURN servers for WebRTC */
  iceServers?: RTCIceServer[];
  /** Signaling server URL for discovery */
  signalingUrl?: string;
  /** Local identity public key */
  publicKey?: Uint8Array;
}

/**
 * Event callback for signaling data that needs to be sent via signaling channel.
 */
export type SignalingCallback = (peerId: TransportPeerId, data: SignalingData) => Promise<void>;

/**
 * WebTransportAdapter - Web application's transport layer implementation.
 * 
 * This class:
 * 1. Wraps the core WebRTCTransport with web-specific signaling
 * 2. Integrates with the web app's HTTP/WebSocket signaling
 * 3. Manages peer discovery and connection establishment
 */
export class WebTransportAdapter implements Transport {
  readonly localPeerId: TransportPeerId;

  private transport: WebRTCTransport;
  private config: WebTransportConfig;
  private events: TransportEvents | null = null;
  private signalingCallback: SignalingCallback | null = null;
  private isRunning = false;

  constructor(localPeerId: TransportPeerId, config: WebTransportConfig = {}) {
    this.localPeerId = localPeerId;
    this.config = config;

    // Create underlying WebRTC transport
    const webrtcConfig: WebRTCTransportConfig = {
      maxPeers: config.maxPeers || 50,
      connectionTimeout: config.connectionTimeout || 30000,
      iceServers: config.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    this.transport = new WebRTCTransport(localPeerId, webrtcConfig);
  }

  /**
   * Set a callback for when signaling data needs to be sent.
   * The web application provides this to route signals via HTTP or WebSocket.
   */
  setSignalingCallback(callback: SignalingCallback): void {
    this.signalingCallback = callback;
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;

    // Create wrapper events that include our signaling logic
    const wrappedEvents: TransportEvents = {
      onMessage: (msg: TransportMessage) => {
        events.onMessage(msg);
      },
      onPeerConnected: (peerId: TransportPeerId, info?: TransportPeerInfo) => {
        events.onPeerConnected?.(peerId, info);
      },
      onPeerDisconnected: (peerId: TransportPeerId, reason?: string) => {
        events.onPeerDisconnected?.(peerId, reason);
      },
      onStateChange: (peerId: TransportPeerId, state: TransportConnectionState) => {
        events.onStateChange?.(peerId, state);
      },
      onError: (error: Error, peerId?: TransportPeerId) => {
        events.onError?.(error, peerId);
      },
      onTrack: (peerId: TransportPeerId, track: unknown, stream: unknown) => {
        events.onTrack?.(peerId, track, stream);
      },
    };

    await this.transport.start(wrappedEvents);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.transport.stop();
    this.events = null;
  }

  async connect(peerId: TransportPeerId, signalingData?: SignalingData): Promise<void> {
    if (signalingData) {
      // If we received signaling data (e.g., an offer), handle it
      await this.handleSignaling(signalingData);
    } else {
      // Otherwise, initiate a new connection and send offer via signaling
      const offer = await this.transport.createSignalingOffer?.(peerId);
      if (offer) {
        if (!this.signalingCallback) {
          throw new Error(
            `Cannot connect to peer ${peerId}: signaling callback not set. ` +
            `Call setSignalingCallback() before initiating connections.`
          );
        }
        await this.signalingCallback(peerId, offer);
      }
    }
  }

  async disconnect(peerId: TransportPeerId): Promise<void> {
    await this.transport.disconnect(peerId);
  }

  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    await this.transport.send(peerId, payload);
  }

  async broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void> {
    await this.transport.broadcast(payload, excludePeerId);
  }

  getConnectedPeers(): TransportPeerId[] {
    return this.transport.getConnectedPeers();
  }

  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    return this.transport.getPeerInfo(peerId);
  }

  getConnectionState(peerId: TransportPeerId): TransportConnectionState | undefined {
    return this.transport.getConnectionState(peerId);
  }

  /**
   * Handle incoming signaling data from the signaling channel.
   * Call this when signaling messages arrive via HTTP or WebSocket.
   */
  async handleSignaling(signalingData: SignalingData): Promise<SignalingData | undefined> {
    const response = await this.transport.handleSignaling?.(signalingData);
    
    // If we got a response (e.g., an answer), send it via signaling channel
    if (response && signalingData.from && this.signalingCallback) {
      await this.signalingCallback(signalingData.from, response);
    }

    return response;
  }

  /**
   * Wait for ICE gathering to complete for a peer.
   */
  async waitForIceGathering(peerId: TransportPeerId, timeoutMs = 2000): Promise<void> {
    return this.transport.waitForIceGathering(peerId, timeoutMs);
  }

  /**
   * Get local session description for manual connection.
   */
  async getLocalDescription(peerId: TransportPeerId): Promise<RTCSessionDescription | null> {
    return this.transport.getLocalDescription(peerId);
  }

  /**
   * Get connection statistics.
   */
  async getStats(peerId: TransportPeerId): Promise<RTCStatsReport | null> {
    return this.transport.getStats(peerId);
  }

  /**
   * Add a media track to a peer connection.
   */
  addTrack(peerId: TransportPeerId, track: MediaStreamTrack, stream: MediaStream): void {
    this.transport.addTrack(peerId, track, stream);
  }
}

/**
 * Create a WebTransportAdapter with the given configuration.
 */
export function createWebTransport(
  localPeerId: TransportPeerId,
  config?: WebTransportConfig
): WebTransportAdapter {
  return new WebTransportAdapter(localPeerId, config);
}
