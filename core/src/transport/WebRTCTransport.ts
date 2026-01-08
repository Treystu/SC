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
  lastRTT: number; // Last measured round-trip time in ms
  pingTimestamp: number; // Timestamp when last PING was sent
  rttTimeoutId: NodeJS.Timeout | number | null; // Timeout ID for RTT measurement
  // Batching
  batchBuffer: Uint8Array[];
  batchBufferLength: number;
  batchTimeoutId: NodeJS.Timeout | number | null;
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
  private pruneIntervalId: NodeJS.Timeout | null = null;
  private onSignalCallback?: (peerId: string, signal: any) => void;
  private onTrackCallback?: (
    peerId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
  ) => void;

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
        ...(typeof process !== "undefined" &&
        process.env.TURN_SERVER_ALT &&
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
        // Connection established - no additional action needed here
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
        this.onSignalCallback?.(peerId, {
          type: "candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle incoming data channels
    connection.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    // Handle incoming tracks
    connection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onTrackCallback?.(peerId, event.track, event.streams[0]);
      }
    };

    connection.onnegotiationneeded = async () => {
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        if (this.onSignalCallback) {
          this.onSignalCallback(peerId, {
            type: "offer",
            sdp: offer,
          });
        }
      } catch (err) {
        console.error(`Error renegotiating with ${peerId}:`, err);
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
      if (isReliable) {
        if (wrapper.state !== "connected") {
          wrapper.state = "connected";
          this.handlePeerConnected(peerId);
        }
        this.flushBatch(peerId);
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

      // Check for Batch Magic Byte (0xBB)
      if (payload.length > 0 && payload[0] === 0xbb) {
        // Unpack Batch
        try {
          const view = new DataView(
            payload.buffer,
            payload.byteOffset,
            payload.byteLength,
          );
          let offset = 1; // Skip Magic

          while (offset < payload.byteLength) {
            const len = view.getUint32(offset);
            offset += 4;
            const chunk = payload.slice(offset, offset + len);
            offset += len;

            const message: TransportMessage = {
              from: peerId,
              to: this.localPeerId,
              payload: chunk,
              timestamp: Date.now(),
            };
            this.events?.onMessage(message);
          }
        } catch (e) {
          console.error(
            `[WebRTCTransport] Failed to unpack batch from ${peerId}`,
            e,
          );
        }
      } else {
        // Single Message (Legacy or unbatched)
        const message: TransportMessage = {
          from: peerId,
          to: this.localPeerId,
          payload,
          timestamp: Date.now(),
        };
        this.events?.onMessage(message);
      }
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
   * Measure RTT (Round-Trip Time) for a peer connection using WebRTC statistics.
   * @param peerId The peer to measure RTT for
   * @returns RTT in milliseconds, or 0 if measurement fails
   */
  private async measureRTT(peerId: TransportPeerId): Promise<number> {
    const wrapper = this.peers.get(peerId);
    if (!wrapper || !wrapper.connection) return 0;

    try {
      const stats = await wrapper.connection.getStats();
      let rtt = 0;

      stats.forEach((report) => {
        // Look for the active candidate-pair statistics which contain RTT info
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          const candidatePair = report as any;

          // Verify this is the active/selected candidate pair
          const isSelected =
            candidatePair.selected === true || candidatePair.nominated === true;

          if (!isSelected) {
            return; // Skip non-selected candidate pairs
          }

          // currentRoundTripTime is in seconds, convert to milliseconds
          if (candidatePair.currentRoundTripTime !== undefined) {
            rtt = candidatePair.currentRoundTripTime * 1000;
          }
        }
      });

      return rtt;
    } catch (error) {
      console.error(`Failed to measure RTT for ${peerId}:`, error);
      return 0;
    }
  }

  /**
   * Start periodic RTT measurement for a peer.
   * Measures RTT every 5 seconds and updates connection quality.
   */
  private startRTTMeasurement(peerId: TransportPeerId): void {
    const measureAndUpdate = async () => {
      const wrapper = this.peers.get(peerId);
      if (!wrapper || wrapper.state !== "connected") return;

      const rtt = await this.measureRTT(peerId);
      if (rtt > 0) {
        wrapper.lastRTT = rtt;
      }

      // Schedule next measurement if peer still connected
      if (this.peers.has(peerId) && this.isRunning) {
        const timeoutId = setTimeout(measureAndUpdate, 5000);
        // Update the timeout ID in the wrapper for cleanup
        const updatedWrapper = this.peers.get(peerId);
        if (updatedWrapper) {
          updatedWrapper.rttTimeoutId = timeoutId;
        }
      }
    };

    // Start first measurement after 1 second to allow connection to stabilize
    const initialTimeoutId = setTimeout(measureAndUpdate, 1000);
    const wrapper = this.peers.get(peerId);
    if (wrapper) {
      wrapper.rttTimeoutId = initialTimeoutId;
    }
  }

  /**
   * Handle peer connected event.
   */
  private handlePeerConnected(peerId: TransportPeerId): void {
    const wrapper = this.peers.get(peerId);
    if (!wrapper) return;

    // Start periodic RTT measurement for this peer
    this.startRTTMeasurement(peerId);

    const peerInfo: TransportPeerInfo = {
      peerId,
      state: "connected",
      transportType: "webrtc",
      connectionQuality: 100, // Initial quality, will be updated by RTT measurements
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

    // Clear RTT measurement timeout
    if (wrapper.rttTimeoutId !== null) {
      clearTimeout(wrapper.rttTimeoutId as any);
      wrapper.rttTimeoutId = null;
    }

    // Close channels
    wrapper.reliableChannel?.close();
    wrapper.unreliableChannel?.close();

    // Close connection
    wrapper.connection.close();

    this.peers.delete(peerId);
    this.events?.onPeerDisconnected?.(peerId, reason);
  }

  /**
   * Compatibility shim for MeshNetwork
   */
  getPool() {
    return {
      getOrCreatePeer: (id: string) => {
        if (!this.peers.has(id)) {
          this.connect(id).catch(console.error);
        }
        const wrapper = this.peers.get(id);
        if (!wrapper) throw new Error(`Failed to create peer ${id}`);

        const peerShim = {
          ...wrapper,
          addTrack: (track: MediaStreamTrack, stream: MediaStream) =>
            wrapper.connection.addTrack(track, stream),
          createOffer: async () => {
            const offer = await wrapper.connection.createOffer();
            await wrapper.connection.setLocalDescription(offer);
            return offer;
          },
          createAnswer: async (options?: any) => {
            const answer = await wrapper.connection.createAnswer(options);
            await wrapper.connection.setLocalDescription(answer);
            return answer;
          },
          setRemoteAnswer: (answer: RTCSessionDescriptionInit) =>
            wrapper.connection.setRemoteDescription(answer),
          setRemoteDescription: (desc: RTCSessionDescriptionInit) =>
            wrapper.connection.setRemoteDescription(desc),
          getState: () => wrapper.state,
          connection: wrapper.connection,
          createDataChannel: (config: any) => {
            return wrapper.connection.createDataChannel(config.label, config);
          },
          onStateChange: (cb: (state: string) => void) => {
            wrapper.connection.onconnectionstatechange = () => {
              cb(wrapper.connection.connectionState);
            };
          },
          waitForIceGathering: async () => {
            if (wrapper.connection.iceGatheringState === "complete") return;
            return new Promise<void>((resolve) => {
              const check = () => {
                if (wrapper.connection.iceGatheringState === "complete") {
                  wrapper.connection.removeEventListener(
                    "icegatheringstatechange",
                    check,
                  );
                  resolve();
                }
              };
              wrapper.connection.addEventListener(
                "icegatheringstatechange",
                check,
              );
            });
          },
          getLocalDescription: () => wrapper.connection.localDescription,
        };
        return peerShim;
      },
      getPeer: (id: string) => {
        // Reuse getOrCreatePeer logic but return undefined if missing?
        // Actually simpler to just duplicate shim creation logic or extract it.
        // For now, duplicate for safety.
        const wrapper = this.peers.get(id);
        if (!wrapper) return undefined;
        return {
          ...wrapper,
          addTrack: (track: MediaStreamTrack, stream: MediaStream) =>
            wrapper.connection.addTrack(track, stream),
          createOffer: async () => {
            const offer = await wrapper.connection.createOffer();
            await wrapper.connection.setLocalDescription(offer);
            return offer;
          },
          createAnswer: async (options?: any) => {
            const answer = await wrapper.connection.createAnswer(options);
            await wrapper.connection.setLocalDescription(answer);
            return answer;
          },
          setRemoteAnswer: (answer: RTCSessionDescriptionInit) =>
            wrapper.connection.setRemoteDescription(answer),
          setRemoteDescription: (desc: RTCSessionDescriptionInit) =>
            wrapper.connection.setRemoteDescription(desc),
          getState: () => wrapper.state,
          connection: wrapper.connection,
          createDataChannel: (config: any) => {
            return wrapper.connection.createDataChannel(config.label, config);
          },
          onStateChange: (cb: (state: string) => void) => {
            wrapper.connection.onconnectionstatechange = () => {
              cb(wrapper.connection.connectionState);
            };
          },
          waitForIceGathering: async () => {
            if (wrapper.connection.iceGatheringState === "complete") return;
            return new Promise<void>((resolve) => {
              const check = () => {
                if (wrapper.connection.iceGatheringState === "complete") {
                  wrapper.connection.removeEventListener(
                    "icegatheringstatechange",
                    check,
                  );
                  resolve();
                }
              };
              wrapper.connection.addEventListener(
                "icegatheringstatechange",
                check,
              );
            });
          },
          getLocalDescription: () => wrapper.connection.localDescription,
        };
      },
      onSignal: (cb: (peerId: string, signal: any) => void) => {
        this.onSignalCallback = cb;
      },
      onTrack: (
        cb: (
          peerId: string,
          track: MediaStreamTrack,
          stream: MediaStream,
        ) => void,
      ) => {
        this.onTrackCallback = cb;
      },
      has: (id: string) => this.peers.has(id),
      get: (id: string) => this.peers.get(id),
      getAllPeers: () => Array.from(this.peers.values()),
      getStats: async () => {
        const peers = Array.from(this.peers.values());
        const peerStats = await Promise.all(
          peers.map(async (wrapper) => {
            const stats: any[] = [];
            try {
              if (wrapper.connection.connectionState !== "closed") {
                const report = await wrapper.connection.getStats();
                report.forEach((stat) => stats.push(stat));
              }
            } catch (e) {
              console.warn(
                `[WebRTCTransport] Failed to get stats for ${wrapper.peerId}`,
                e,
              );
            }
            return {
              id: wrapper.peerId,
              state: wrapper.state,
              stats,
            };
          }),
        );

        return {
          size: this.peers.size,
          totalPeers: this.peers.size,
          connectedPeers: peers.filter((p) => p.state === "connected").length,
          peers: peerStats,
        };
      },
      removePeer: (id: string) => this.disconnect(id),
    };
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;

    // Start pruning loop
    this.pruneIntervalId = setInterval(
      () => this.pruneIdleConnections(),
      60000,
    );
  }

  /**
   * Prune idle connections
   */
  private pruneIdleConnections() {
    const now = Date.now();
    for (const [peerId, wrapper] of this.peers.entries()) {
      // Prune if inactive > 60s and not connecting
      if (wrapper.state === "connected" && now - wrapper.lastSeen > 60000) {
        console.log(`[WebRTCTransport] Pruning idle peer ${peerId}`);
        this.disconnect(peerId).catch(console.error);
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pruneIntervalId) {
      clearInterval(this.pruneIntervalId);
      this.pruneIntervalId = null;
    }

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
      lastRTT: 0,
      pingTimestamp: 0,
      rttTimeoutId: null,
      batchBuffer: [],
      batchBufferLength: 0,
      batchTimeoutId: null,
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

      if (this.onSignalCallback) {
        this.onSignalCallback(peerId, {
          type: "offer",
          sdp: offer,
        });
      }
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
    if (!channel || (channel.readyState !== "open" && channel.readyState !== "connecting")) {
      throw new Error(`Data channel to ${peerId} is not ready`);
    }

    // Batching Logic
    // We use Nagle-like algorithm: Buffer small messages, send if buffer full or timeout

    wrapper.batchBuffer.push(payload);
    wrapper.batchBufferLength += payload.length;

    // Flush threshold (e.g. 16KB or instant if payload is large)
    if (wrapper.batchBufferLength >= 16 * 1024 || payload.length > 8000) {
      this.flushBatch(peerId);
    } else if (!wrapper.batchTimeoutId) {
      // Schedule flush
      wrapper.batchTimeoutId = setTimeout(() => {
        wrapper.batchTimeoutId = null;
        this.flushBatch(peerId);
      }, 10); // 10ms delay
    }
  }

  /**
   * Flush pending batch
   */
  private flushBatch(peerId: TransportPeerId): void {
    const wrapper = this.peers.get(peerId);
    if (!wrapper || wrapper.batchBuffer.length === 0) return;

    const channel = wrapper.reliableChannel;
    if (!channel || channel.readyState !== "open") return;

    // Construct Batch: [Magic: 0xBB][Len1:4][Data1]...
    // Note: If buffer has only 1 item and it's large, we might skip batch overhead?
    // But for consistency, let's batch everything or use a flag.
    // Actually, to keep it simple and compatible with the "Magic Byte" check:
    // We ALWAYS use batch format if we went through the buffer.

    const totalSize =
      1 + 4 * wrapper.batchBuffer.length + wrapper.batchBufferLength;
    const batch = new Uint8Array(totalSize);
    const view = new DataView(batch.buffer);

    batch[0] = 0xbb; // Magic
    let offset = 1;

    for (const chunk of wrapper.batchBuffer) {
      view.setUint32(offset, chunk.length);
      offset += 4;
      batch.set(chunk, offset);
      offset += chunk.length;
    }

    // Reset buffer
    wrapper.batchBuffer = [];
    wrapper.batchBufferLength = 0;
    if (wrapper.batchTimeoutId) {
      clearTimeout(wrapper.batchTimeoutId as any);
      wrapper.batchTimeoutId = null;
    }

    try {
      (channel as RTCDataChannel).send(batch as unknown as ArrayBuffer);
      wrapper.bytesSent += totalSize;
    } catch (e) {
      console.error(`[WebRTCTransport] Failed to send batch to ${peerId}`, e);
    }
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

    // Calculate connection quality based on RTT
    // Quality formula: 100 - (RTT / 10)
    // Examples: 0ms = 100, 100ms = 90, 500ms = 50, 1000ms+ = 0
    const quality =
      wrapper.lastRTT > 0
        ? Math.max(0, Math.min(100, 100 - wrapper.lastRTT / 10))
        : 100; // Default to 100 if RTT not yet measured

    return {
      peerId,
      state: wrapper.state,
      transportType: "webrtc",
      connectionQuality: quality,
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
          lastRTT: 0,
          pingTimestamp: 0,
          rttTimeoutId: null,
          batchBuffer: [],
          batchBufferLength: 0,
          batchTimeoutId: null,
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
        lastRTT: 0,
        pingTimestamp: 0,
        rttTimeoutId: null,
        batchBuffer: [],
        batchBufferLength: 0,
        batchTimeoutId: null,
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
