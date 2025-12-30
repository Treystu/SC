/**
 * WebRTC Transport Implementation
 *
 * A Transport implementation that uses WebRTC for peer-to-peer communication.
 * This wraps the existing WebRTC functionality to conform to the Transport interface.
 *
 * Browser-only: This implementation uses browser WebRTC APIs and should only
 * be used in web environments. Platform-specific implementations (Android, iOS)
 * should provide their own Transport implementations.
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
  transportRegistry,
} from "./Transport.js";

/**
 * Check if WebRTC is available in the current environment.
 */
function isWebRTCAvailable(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

/**
 * WebRTC-specific configuration options.
 */
export interface WebRTCTransportConfig extends TransportConfig {
  /** ICE servers for NAT traversal */
  iceServers?: RTCIceServer[];
  /** ICE candidate pool size */
  iceCandidatePoolSize?: number;
  /** Data channel label for reliable messaging */
  reliableChannelLabel?: string;
  /** Data channel label for unreliable messaging */
  unreliableChannelLabel?: string;
}

/**
 * Internal peer connection wrapper.
 */
interface PeerConnectionWrapper {
  peerId: TransportPeerId;
  connection: RTCPeerConnection;
  reliableChannel: RTCDataChannel | null;
  unreliableChannel: RTCDataChannel | null;
  state: TransportConnectionState;
  bytesSent: number;
  bytesReceived: number;
  lastSeen: number;
}

/**
 * WebRTC Transport implementation.
 * Provides peer-to-peer communication using WebRTC data channels.
 */
export class WebRTCTransport implements Transport {
  readonly localPeerId: TransportPeerId;
  readonly name = "webrtc";

  private config: WebRTCTransportConfig;
  private events: TransportEvents | null = null;
  private peers: Map<TransportPeerId, PeerConnectionWrapper> = new Map();
  private isRunning = false;
  private pendingIceCandidates: Map<TransportPeerId, RTCIceCandidateInit[]> =
    new Map();

  constructor(
    localPeerId: TransportPeerId,
    config: WebRTCTransportConfig = {},
  ) {
    if (!isWebRTCAvailable()) {
      throw new Error("WebRTC is not available in this environment");
    }

    this.localPeerId = localPeerId;
    this.config = {
      maxPeers: 50,
      connectionTimeout: 30000,
      heartbeatInterval: 30000,
      iceServers: [
        // Public STUN servers (fallback)
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
        // TURN servers (when available via environment variables)
        // Format: turn:turn.sovereigncommunications.app:3478
        // Credentials should be set via environment variables for security
        ...(typeof process !== "undefined" &&
        process.env.TURN_SERVER &&
        process.env.TURN_USERNAME &&
        process.env.TURN_PASSWORD
          ? [
              {
                urls: process.env.TURN_SERVER,
                username: process.env.TURN_USERNAME,
                credential: process.env.TURN_PASSWORD,
              },
            ]
          : []),
        // Alternative TURN server
        ...(process.env.TURN_SERVER_ALT &&
        process.env.TURN_USERNAME_ALT &&
        process.env.TURN_PASSWORD_ALT
          ? [
              {
                urls: process.env.TURN_SERVER_ALT,
                username: process.env.TURN_USERNAME_ALT,
                credential: process.env.TURN_PASSWORD_ALT,
              },
            ]
          : []),
      ],
      iceCandidatePoolSize: 10,
      reliableChannelLabel: "reliable",
      unreliableChannelLabel: "unreliable",
      ...config,
    };
  }

  /**
   * Create an RTCPeerConnection with standard configuration.
   */
  private createPeerConnection(peerId: TransportPeerId): RTCPeerConnection {
    const configuration: RTCConfiguration = {
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: this.config.iceCandidatePoolSize,
    };

    const connection = new RTCPeerConnection(configuration);

    // Connection state monitoring
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState as TransportConnectionState;
      const wrapper = this.peers.get(peerId);
      if (wrapper) {
        wrapper.state = state;
      }
      this.events?.onStateChange?.(peerId, state);

      if (state === "connected") {
        this.handlePeerConnected(peerId);
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        this.handlePeerDisconnected(peerId, `Connection ${state}`);
      }
    };

    // ICE candidate handling
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        // ICE candidates need to be sent via signaling
        // The signaling mechanism is external to this transport
        // Emit a custom event that can be captured for signaling
        console.debug(
          `ICE candidate generated for ${peerId}:`,
          event.candidate.toJSON(),
        );
      }
    };

    // Handle incoming data channels
    connection.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    // Handle incoming tracks
    connection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.events?.onTrack?.(peerId, event.track, event.streams[0]);
      }
    };

    return connection;
  }

  /**
   * Set up event handlers for a data channel.
   */
  private setupDataChannel(
    peerId: TransportPeerId,
    channel: RTCDataChannel,
  ): void {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return;

    const isReliable = channel.label === this.config.reliableChannelLabel;
    if (isReliable) {
      wrapper.reliableChannel = channel;
    } else {
      wrapper.unreliableChannel = channel;
    }

    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      console.debug(`Data channel ${channel.label} opened for ${peerId}`);
      // If reliable channel is open, consider peer fully connected
      if (isReliable && wrapper.state !== "connected") {
        wrapper.state = "connected";
        this.handlePeerConnected(peerId);
      }
    };

    channel.onclose = () => {
      console.debug(`Data channel ${channel.label} closed for ${peerId}`);
    };

    channel.onerror = (event) => {
      // RTCErrorEvent contains the actual error in event.error
      const errorMessage =
        (event as RTCErrorEvent).error?.message || "Unknown data channel error";
      console.error(
        `Data channel ${channel.label} error for ${peerId}:`,
        errorMessage,
      );
      this.events?.onError?.(
        new Error(`Data channel error: ${errorMessage}`),
        peerId,
      );
    };

    channel.onmessage = (event) => {
      const payload =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new TextEncoder().encode(event.data);

      wrapper.bytesReceived += payload.length;
      wrapper.lastSeen = Date.now();

      const message: TransportMessage = {
        from: peerId,
        to: this.localPeerId,
        payload,
        timestamp: Date.now(),
      };

      this.events?.onMessage(message);
    };
  }

  /**
   * Create data channels for a peer connection.
   */
  private createDataChannels(
    peerId: TransportPeerId,
    connection: RTCPeerConnection,
  ): void {
    // Reliable channel for important messages
    const reliableChannel = connection.createDataChannel(
      this.config.reliableChannelLabel!,
      { ordered: true },
    );
    this.setupDataChannel(peerId, reliableChannel);

    // Unreliable channel for real-time data
    const unreliableChannel = connection.createDataChannel(
      this.config.unreliableChannelLabel!,
      { ordered: false, maxRetransmits: 0 },
    );
    this.setupDataChannel(peerId, unreliableChannel);
  }

  /**
   * Handle peer connected event.
   */
  private handlePeerConnected(peerId: TransportPeerId): void {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return;

    const peerInfo: TransportPeerInfo = {
      peerId,
      state: "connected",
      transportType: "webrtc",
      connectionQuality: 100,
      bytesSent: wrapper.bytesSent,
      bytesReceived: wrapper.bytesReceived,
      lastSeen: wrapper.lastSeen,
    };

    this.events?.onPeerConnected?.(peerId, peerInfo);
  }

  /**
   * Handle peer disconnected event.
   */
  private handlePeerDisconnected(
    peerId: TransportPeerId,
    reason?: string,
  ): void {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return;

    // Close channels
    wrapper.reliableChannel?.close();
    wrapper.unreliableChannel?.close();

    // Close connection
    wrapper.connection.close();

    this.peers.delete(peerId);
    this.events?.onPeerDisconnected?.(peerId, reason);
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Disconnect all peers
    for (const peerId of Array.from(this.peers.keys())) {
      await this.disconnect(peerId);
    }

    this.events = null;
  }

  async connect(
    peerId: TransportPeerId,
    signalingData?: SignalingData,
  ): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Transport is not running");
    }

    if (this.peers.size >= (this.config.maxPeers || 50)) {
      throw new Error("Maximum number of peers reached");
    }

    // Create peer connection
    const connection = this.createPeerConnection(peerId);
    const wrapper: PeerConnectionWrapper = {
      peerId,
      connection,
      reliableChannel: null,
      unreliableChannel: null,
      state: "connecting",
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
    };
    this.peers.set(peerId, wrapper);

    this.events?.onStateChange?.(peerId, "connecting");

    // Create data channels (initiator creates channels)
    this.createDataChannels(peerId, connection);

    // If signaling data is provided (remote offer), handle it
    if (signalingData && signalingData.type === "offer") {
      await this.handleSignaling(signalingData);
    } else {
      // Otherwise, create an offer
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
    }
  }

  async disconnect(peerId: TransportPeerId): Promise<void> {
    this.handlePeerDisconnected(peerId, "Disconnected by user");
  }

  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Transport is not running");
    }

    const wrapper = this.peers.get(peerId);
    if (!wrapper) {
      throw new Error(`Peer ${peerId} is not connected`);
    }

    const channel = wrapper.reliableChannel;
    if (!channel || channel.readyState !== "open") {
      throw new Error(`Data channel to ${peerId} is not ready`);
    }

    // WebRTC's send() accepts ArrayBuffer, Blob, or ArrayBufferView.
    // TypeScript's strict checking has issues with Uint8Array as ArrayBufferView
    // in some configurations, so we use a type assertion here.
    // This is safe because Uint8Array is a valid ArrayBufferView.
    (channel as RTCDataChannel).send(payload as unknown as ArrayBuffer);
    wrapper.bytesSent += payload.length;
  }

  async broadcast(
    payload: Uint8Array,
    excludePeerId?: TransportPeerId,
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const peerId of this.peers.keys()) {
      if (peerId !== excludePeerId) {
        promises.push(
          this.send(peerId, payload).catch((err) => {
            console.error(`Failed to send to ${peerId}:`, err);
          }),
        );
      }
    }

    await Promise.all(promises);
  }

  getConnectedPeers(): TransportPeerId[] {
    return Array.from(this.peers.entries())
      .filter(([_, wrapper]) => wrapper.state === "connected")
      .map(([peerId]) => peerId);
  }

  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return undefined;

    return {
      peerId,
      state: wrapper.state,
      transportType: "webrtc",
      connectionQuality: 100, // TODO: Calculate based on RTT
      bytesSent: wrapper.bytesSent,
      bytesReceived: wrapper.bytesReceived,
      lastSeen: wrapper.lastSeen,
    };
  }

  getConnectionState(
    peerId: TransportPeerId,
  ): TransportConnectionState | undefined {
    return this.peers.get(peerId)?.state;
  }

  async handleSignaling(
    signalingData: SignalingData,
  ): Promise<SignalingData | undefined> {
    const peerId = signalingData.from;
    if (!peerId) {
      throw new Error("Signaling data missing 'from' peer ID");
    }

    let wrapper = this.peers.get(peerId);

    if (signalingData.type === "offer") {
      // Create peer connection if it doesn't exist
      if (!wrapper) {
        const connection = this.createPeerConnection(peerId);
        wrapper = {
          peerId,
          connection,
          reliableChannel: null,
          unreliableChannel: null,
          state: "connecting",
          bytesSent: 0,
          bytesReceived: 0,
          lastSeen: Date.now(),
        };
        this.peers.set(peerId, wrapper);
        this.events?.onStateChange?.(peerId, "connecting");
      }

      // Set remote description and create answer
      const offer = signalingData.data as RTCSessionDescriptionInit;
      await wrapper.connection.setRemoteDescription(offer);

      // Process any pending ICE candidates
      const pending = this.pendingIceCandidates.get(peerId) || [];
      for (const candidate of pending) {
        await wrapper.connection.addIceCandidate(candidate);
      }
      this.pendingIceCandidates.delete(peerId);

      const answer = await wrapper.connection.createAnswer();
      await wrapper.connection.setLocalDescription(answer);

      return {
        type: "answer",
        data: answer,
        from: this.localPeerId,
        to: peerId,
      };
    } else if (signalingData.type === "answer") {
      if (!wrapper) {
        throw new Error(`No pending connection to ${peerId}`);
      }

      const answer = signalingData.data as RTCSessionDescriptionInit;
      await wrapper.connection.setRemoteDescription(answer);

      // Process any pending ICE candidates
      const pending = this.pendingIceCandidates.get(peerId) || [];
      for (const candidate of pending) {
        await wrapper.connection.addIceCandidate(candidate);
      }
      this.pendingIceCandidates.delete(peerId);

      return undefined;
    } else if (signalingData.type === "candidate") {
      const candidate = signalingData.data as RTCIceCandidateInit;

      if (wrapper && wrapper.connection.remoteDescription) {
        await wrapper.connection.addIceCandidate(candidate);
      } else {
        // Queue candidate for later
        if (!this.pendingIceCandidates.has(peerId)) {
          this.pendingIceCandidates.set(peerId, []);
        }
        this.pendingIceCandidates.get(peerId)!.push(candidate);
      }

      return undefined;
    }

    throw new Error(`Unknown signaling type: ${signalingData.type}`);
  }

  async createSignalingOffer(peerId: TransportPeerId): Promise<SignalingData> {
    let wrapper = this.peers.get(peerId);

    if (!wrapper) {
      // Create peer connection
      const connection = this.createPeerConnection(peerId);
      wrapper = {
        peerId,
        connection,
        reliableChannel: null,
        unreliableChannel: null,
        state: "connecting",
        bytesSent: 0,
        bytesReceived: 0,
        lastSeen: Date.now(),
      };
      this.peers.set(peerId, wrapper);

      // Create data channels
      this.createDataChannels(peerId, wrapper.connection);
    }

    const offer = await wrapper.connection.createOffer();
    await wrapper.connection.setLocalDescription(offer);

    return {
      type: "offer",
      data: offer,
      from: this.localPeerId,
      to: peerId,
    };
  }

  /**
   * Wait for ICE gathering to complete (with timeout).
   */
  async waitForIceGathering(
    peerId: TransportPeerId,
    timeoutMs = 2000,
  ): Promise<void> {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return;

    if (wrapper.connection.iceGatheringState === "complete") {
      return;
    }

    return new Promise<void>((resolve) => {
      const checkState = () => {
        if (wrapper.connection.iceGatheringState === "complete") {
          clearTimeout(timeoutId);
          wrapper.connection.removeEventListener(
            "icegatheringstatechange",
            checkState,
          );
          resolve();
        }
      };

      wrapper.connection.addEventListener(
        "icegatheringstatechange",
        checkState,
      );

      const timeoutId = setTimeout(() => {
        wrapper.connection.removeEventListener(
          "icegatheringstatechange",
          checkState,
        );
        resolve(); // Resolve anyway on timeout
      }, timeoutMs);
    });
  }

  /**
   * Get the local session description for a peer.
   */
  async getLocalDescription(
    peerId: TransportPeerId,
  ): Promise<RTCSessionDescription | null> {
    const wrapper = this.peers.get(peerId);
    return wrapper?.connection.localDescription || null;
  }

  /**
   * Get RTCStatsReport for a peer connection.
   */
  async getStats(peerId: TransportPeerId): Promise<RTCStatsReport | null> {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return null;
    return wrapper.connection.getStats();
  }

  /**
   * Add a media track to a peer connection.
   */
  addTrack(
    peerId: TransportPeerId,
    track: MediaStreamTrack,
    stream: MediaStream,
  ): void {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) {
      throw new Error(`Peer ${peerId} not found`);
    }
    wrapper.connection.addTrack(track, stream);
  }
}

// Register WebRTC transport in the global registry
transportRegistry.register("webrtc", (config) => {
  // Generate a random peer ID if not provided
  const peerId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new WebRTCTransport(peerId, config as WebRTCTransportConfig);
});
