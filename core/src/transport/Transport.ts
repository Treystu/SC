/**
 * Transport Abstraction Layer
 * 
 * Defines a platform-agnostic transport interface that all mesh/routing logic
 * depends on. Concrete implementations (WebRTC, BLE, Wi-Fi Direct, etc.) are
 * provided by platform-specific code.
 * 
 * This abstraction ensures protocol and routing logic remain decoupled from
 * platform-specific APIs (browser WebRTC, Android BLE, iOS CoreBluetooth, etc.).
 */

/**
 * Unique identifier for a peer in the transport layer.
 * Typically a hex-encoded public key or a UUID.
 */
export type TransportPeerId = string;

/**
 * A message transported between peers.
 */
export interface TransportMessage {
  /** The sender's peer ID */
  from: TransportPeerId;
  /** The recipient's peer ID (optional for broadcasts) */
  to?: TransportPeerId;
  /** Binary message payload */
  payload: Uint8Array;
  /** Optional timestamp for the message */
  timestamp?: number;
}

/**
 * Connection state for a transport peer.
 */
export type TransportConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

/**
 * Peer information provided by the transport layer.
 */
export interface TransportPeerInfo {
  /** The peer's unique identifier */
  peerId: TransportPeerId;
  /** Current connection state */
  state: TransportConnectionState;
  /** Transport type (webrtc, bluetooth, local, etc.) */
  transportType: string;
  /** Connection quality metric (0-100) */
  connectionQuality?: number;
  /** Bytes sent to this peer */
  bytesSent?: number;
  /** Bytes received from this peer */
  bytesReceived?: number;
  /** Last seen timestamp */
  lastSeen?: number;
}

/**
 * Event handlers for transport events.
 * Implementations call these callbacks when events occur.
 */
export interface TransportEvents {
  /**
   * Called when a message is received from a peer.
   * @param msg The received message
   */
  onMessage(msg: TransportMessage): void;

  /**
   * Called when a peer successfully connects.
   * @param peerId The connected peer's ID
   * @param info Optional peer information
   */
  onPeerConnected?(peerId: TransportPeerId, info?: TransportPeerInfo): void;

  /**
   * Called when a peer disconnects.
   * @param peerId The disconnected peer's ID
   * @param reason Optional reason for disconnection
   */
  onPeerDisconnected?(peerId: TransportPeerId, reason?: string): void;

  /**
   * Called when connection state changes for a peer.
   * @param peerId The peer's ID
   * @param state The new connection state
   */
  onStateChange?(peerId: TransportPeerId, state: TransportConnectionState): void;

  /**
   * Called when an error occurs.
   * @param error The error that occurred
   * @param peerId Optional peer ID if error is peer-specific
   */
  onError?(error: Error, peerId?: TransportPeerId): void;

  /**
   * Called when a media track is received (for WebRTC-style transports).
   * @param peerId The peer's ID
   * @param track The media track
   * @param stream The media stream containing the track
   */
  onTrack?(peerId: TransportPeerId, track: unknown, stream: unknown): void;
}

/**
 * Configuration options for transport initialization.
 */
export interface TransportConfig {
  /** Maximum number of concurrent connections */
  maxPeers?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Custom transport-specific options */
  options?: Record<string, unknown>;
}

/**
 * Signaling data for connection establishment.
 * Used for transports that require out-of-band signaling (like WebRTC).
 */
export interface SignalingData {
  /** Type of signaling data */
  type: "offer" | "answer" | "candidate" | "custom";
  /** The signaling payload (SDP, ICE candidate, etc.) */
  data: unknown;
  /** Sender peer ID */
  from?: TransportPeerId;
  /** Recipient peer ID */
  to?: TransportPeerId;
}

/**
 * Transport interface defining the contract all transport implementations must follow.
 * 
 * This abstraction allows the mesh networking layer to work with any transport
 * mechanism (WebRTC, Bluetooth LE, Wi-Fi Direct, TCP, etc.) without coupling
 * to specific platform APIs.
 * 
 * @example
 * ```typescript
 * const transport: Transport = new WebRTCTransport(config);
 * await transport.start({
 *   onMessage: (msg) => console.log('Received:', msg),
 *   onPeerConnected: (peerId) => console.log('Connected:', peerId),
 * });
 * 
 * await transport.connect('peer-id-123');
 * await transport.send('peer-id-123', new Uint8Array([1, 2, 3]));
 * ```
 */
export interface Transport {
  /**
   * The local peer ID for this transport instance.
   */
  readonly localPeerId: TransportPeerId;

  /**
   * Start the transport and begin listening for connections.
   * @param events Event handlers for transport events
   * @returns Promise that resolves when transport is ready
   */
  start(events: TransportEvents): Promise<void>;

  /**
   * Stop the transport and close all connections.
   * @returns Promise that resolves when transport is fully stopped
   */
  stop(): Promise<void>;

  /**
   * Initiate a connection to a peer.
   * @param peerId The peer ID to connect to
   * @param signalingData Optional signaling data for connection establishment
   * @returns Promise that resolves when connection is established
   */
  connect(peerId: TransportPeerId, signalingData?: SignalingData): Promise<void>;

  /**
   * Disconnect from a specific peer.
   * @param peerId The peer ID to disconnect from
   * @returns Promise that resolves when disconnection is complete
   */
  disconnect(peerId: TransportPeerId): Promise<void>;

  /**
   * Send a message to a specific peer.
   * @param peerId The recipient peer ID
   * @param payload The binary message payload
   * @returns Promise that resolves when message is sent (not necessarily delivered)
   */
  send(peerId: TransportPeerId, payload: Uint8Array): Promise<void>;

  /**
   * Broadcast a message to all connected peers.
   * @param payload The binary message payload
   * @param excludePeerId Optional peer ID to exclude from broadcast
   * @returns Promise that resolves when broadcast is complete
   */
  broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void>;

  /**
   * Get the list of currently connected peer IDs.
   * @returns Array of connected peer IDs
   */
  getConnectedPeers(): TransportPeerId[];

  /**
   * Get information about a specific peer.
   * @param peerId The peer ID to query
   * @returns Peer information or undefined if not connected
   */
  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined;

  /**
   * Get the current connection state for a peer.
   * @param peerId The peer ID to query
   * @returns Connection state or undefined if peer is unknown
   */
  getConnectionState(peerId: TransportPeerId): TransportConnectionState | undefined;

  /**
   * Handle incoming signaling data (for transports that require signaling).
   * @param signalingData The signaling data to process
   * @returns Promise that resolves with optional response signaling data
   */
  handleSignaling?(signalingData: SignalingData): Promise<SignalingData | undefined>;

  /**
   * Generate signaling data to initiate a connection (for transports that require signaling).
   * @param peerId The target peer ID
   * @returns Promise that resolves with signaling data to send to the peer
   */
  createSignalingOffer?(peerId: TransportPeerId): Promise<SignalingData>;
}

/**
 * Factory function type for creating transport instances.
 * Useful for dependency injection and testing.
 */
export type TransportFactory = (config?: TransportConfig) => Transport;

/**
 * Registry for transport implementations.
 * Allows dynamic registration and lookup of transport types.
 */
export interface TransportRegistry {
  /**
   * Register a transport factory.
   * @param type Transport type identifier (e.g., 'webrtc', 'bluetooth')
   * @param factory Factory function to create transport instances
   */
  register(type: string, factory: TransportFactory): void;

  /**
   * Get a transport factory by type.
   * @param type Transport type identifier
   * @returns Factory function or undefined if not registered
   */
  get(type: string): TransportFactory | undefined;

  /**
   * Get all registered transport types.
   * @returns Array of transport type identifiers
   */
  getTypes(): string[];
}

/**
 * Default transport registry implementation.
 */
export class DefaultTransportRegistry implements TransportRegistry {
  private factories: Map<string, TransportFactory> = new Map();

  register(type: string, factory: TransportFactory): void {
    this.factories.set(type, factory);
  }

  get(type: string): TransportFactory | undefined {
    return this.factories.get(type);
  }

  getTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Global transport registry instance.
 */
export const transportRegistry = new DefaultTransportRegistry();
