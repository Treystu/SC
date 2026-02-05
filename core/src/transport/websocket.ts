/**
 * WebSocket Transport
 *
 * Transport implementation using WebSockets for nodes with public IPs
 * or for fallback when WebRTC fails. Supports both client and server modes.
 */

import type {
  Transport,
  TransportPeerId,
  TransportMessage,
  TransportEvents,
  TransportPeerInfo,
  TransportConnectionState,
  TransportConfig,
  SignalingData,
} from "./Transport.js";

/**
 * WebSocket connection wrapper
 */
interface WSConnection {
  peerId: string;
  socket: WebSocket;
  state: TransportConnectionState;
  bytesSent: number;
  bytesReceived: number;
  lastSeen: number;
  connectionQuality: number;
}

/**
 * WebSocket transport configuration
 */
export interface WebSocketTransportConfig extends TransportConfig {
  /** WebSocket server URL to connect to (client mode) */
  serverUrl?: string;
  /** Port to listen on (server mode) */
  listenPort?: number;
  /** Reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay base in ms */
  reconnectDelay?: number;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
}

/**
 * WebSocket transport message format
 */
interface WSMessage {
  type: "data" | "handshake" | "heartbeat" | "disconnect";
  from: string;
  to?: string;
  payload?: number[]; // Uint8Array as number array for JSON
  timestamp: number;
}

/**
 * WebSocket Transport Implementation
 *
 * Provides WebSocket-based connectivity for nodes with public IPs.
 * Acts as a fallback transport when WebRTC is unavailable.
 */
export class WebSocketTransport implements Transport {
  readonly localPeerId: TransportPeerId;
  readonly name = "websocket";

  private config: WebSocketTransportConfig;
  private events: TransportEvents | null = null;
  private connections: Map<string, WSConnection> = new Map();
  private started = false;
  private heartbeatHandle?: ReturnType<typeof setInterval>;

  constructor(localPeerId: string, config: WebSocketTransportConfig = {}) {
    this.localPeerId = localPeerId;
    this.config = {
      maxPeers: config.maxPeers || 50,
      connectionTimeout: config.connectionTimeout || 10000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      maxReconnectAttempts: config.maxReconnectAttempts || 3,
      reconnectDelay: config.reconnectDelay || 1000,
      ...config,
    };
  }

  /**
   * Start the transport
   */
  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.started = true;

    // Start heartbeat
    this.heartbeatHandle = setInterval(
      () => this.sendHeartbeats(),
      this.config.heartbeatInterval
    );
  }

  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    this.started = false;

    // Clear heartbeat
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = undefined;
    }

    // Close all connections
    for (const [peerId, conn] of this.connections) {
      try {
        this.sendWSMessage(conn.socket, {
          type: "disconnect",
          from: this.localPeerId,
          to: peerId,
          timestamp: Date.now(),
        });
        conn.socket.close(1000, "Transport stopping");
      } catch {
        // Ignore close errors
      }
    }
    this.connections.clear();
  }

  /**
   * Connect to a peer via WebSocket
   */
  async connect(
    peerId: TransportPeerId,
    signalingData?: SignalingData
  ): Promise<void> {
    if (!this.started) {
      throw new Error("Transport not started");
    }

    if (this.connections.has(peerId)) {
      const existing = this.connections.get(peerId)!;
      if (
        existing.state === "connected" ||
        existing.state === "connecting"
      ) {
        return; // Already connected or connecting
      }
    }

    // Get the address from signaling data
    const address =
      signalingData?.data &&
      typeof signalingData.data === "object" &&
      "url" in (signalingData.data as any)
        ? (signalingData.data as any).url
        : this.config.serverUrl;

    if (!address) {
      throw new Error("No WebSocket address provided");
    }

    return this.connectToAddress(peerId, address);
  }

  /**
   * Connect to a specific WebSocket address
   */
  private async connectToAddress(
    peerId: string,
    address: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, this.config.connectionTimeout);

      try {
        const socket = new WebSocket(address);

        const conn: WSConnection = {
          peerId,
          socket,
          state: "connecting",
          bytesSent: 0,
          bytesReceived: 0,
          lastSeen: Date.now(),
          connectionQuality: 100,
        };

        this.connections.set(peerId, conn);
        this.events?.onStateChange?.(peerId, "connecting");

        socket.onopen = () => {
          clearTimeout(timeout);
          conn.state = "connected";
          conn.lastSeen = Date.now();

          // Send handshake
          this.sendWSMessage(socket, {
            type: "handshake",
            from: this.localPeerId,
            to: peerId,
            timestamp: Date.now(),
          });

          this.events?.onPeerConnected?.(peerId, this.getPeerInfo(peerId));
          this.events?.onStateChange?.(peerId, "connected");
          resolve();
        };

        socket.onmessage = (event: MessageEvent) => {
          this.handleMessage(peerId, event.data);
        };

        socket.onclose = () => {
          clearTimeout(timeout);
          conn.state = "disconnected";
          this.connections.delete(peerId);
          this.events?.onPeerDisconnected?.(peerId, "connection closed");
          this.events?.onStateChange?.(peerId, "disconnected");
        };

        socket.onerror = (err: Event) => {
          clearTimeout(timeout);
          conn.state = "failed";
          this.events?.onError?.(
            new Error("WebSocket connection error"),
            peerId
          );
          this.events?.onStateChange?.(peerId, "failed");
          reject(new Error("WebSocket connection failed"));
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from a peer
   */
  async disconnect(peerId: TransportPeerId): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) return;

    try {
      this.sendWSMessage(conn.socket, {
        type: "disconnect",
        from: this.localPeerId,
        to: peerId,
        timestamp: Date.now(),
      });
      conn.socket.close(1000, "Disconnecting");
    } catch {
      // Ignore
    }

    this.connections.delete(peerId);
    this.events?.onPeerDisconnected?.(peerId, "manual disconnect");
    this.events?.onStateChange?.(peerId, "disconnected");
  }

  /**
   * Send data to a peer
   */
  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn || conn.state !== "connected") {
      throw new Error(`Not connected to peer: ${peerId}`);
    }

    const msg: WSMessage = {
      type: "data",
      from: this.localPeerId,
      to: peerId,
      payload: Array.from(payload),
      timestamp: Date.now(),
    };

    this.sendWSMessage(conn.socket, msg);
    conn.bytesSent += payload.length;
  }

  /**
   * Broadcast to all connected peers
   */
  async broadcast(
    payload: Uint8Array,
    excludePeerId?: TransportPeerId
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [peerId] of this.connections) {
      if (peerId !== excludePeerId) {
        promises.push(this.send(peerId, payload).catch(() => {}));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Get connected peer IDs
   */
  getConnectedPeers(): TransportPeerId[] {
    const peers: string[] = [];
    for (const [peerId, conn] of this.connections) {
      if (conn.state === "connected") {
        peers.push(peerId);
      }
    }
    return peers;
  }

  /**
   * Get peer info
   */
  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    const conn = this.connections.get(peerId);
    if (!conn) return undefined;

    return {
      peerId,
      state: conn.state,
      transportType: "websocket",
      connectionQuality: conn.connectionQuality,
      bytesSent: conn.bytesSent,
      bytesReceived: conn.bytesReceived,
      lastSeen: conn.lastSeen,
    };
  }

  /**
   * Get connection state for a peer
   */
  getConnectionState(
    peerId: TransportPeerId
  ): TransportConnectionState | undefined {
    return this.connections.get(peerId)?.state;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(peerId: string, data: string | ArrayBuffer): void {
    try {
      const text =
        typeof data === "string"
          ? data
          : new TextDecoder().decode(data as ArrayBuffer);
      const msg: WSMessage = JSON.parse(text);

      const conn = this.connections.get(peerId);
      if (conn) {
        conn.lastSeen = Date.now();
      }

      switch (msg.type) {
        case "data":
          if (msg.payload && this.events) {
            const payload = new Uint8Array(msg.payload);
            if (conn) conn.bytesReceived += payload.length;

            const transportMsg: TransportMessage = {
              from: msg.from,
              to: msg.to,
              payload,
              timestamp: msg.timestamp,
            };
            this.events.onMessage(transportMsg);
          }
          break;

        case "handshake":
          // Handshake received, peer is confirmed connected
          if (conn) {
            conn.state = "connected";
          }
          break;

        case "heartbeat":
          // Update last seen
          break;

        case "disconnect":
          if (conn) {
            conn.state = "disconnected";
            conn.socket.close(1000, "Peer disconnected");
            this.connections.delete(peerId);
            this.events?.onPeerDisconnected?.(peerId, "peer initiated disconnect");
          }
          break;
      }
    } catch (error) {
      this.events?.onError?.(
        new Error(`Failed to handle message: ${error}`),
        peerId
      );
    }
  }

  /**
   * Send a WebSocket message
   */
  private sendWSMessage(socket: WebSocket, msg: WSMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  /**
   * Send heartbeats to all connected peers
   */
  private sendHeartbeats(): void {
    for (const [peerId, conn] of this.connections) {
      if (conn.state === "connected") {
        try {
          this.sendWSMessage(conn.socket, {
            type: "heartbeat",
            from: this.localPeerId,
            to: peerId,
            timestamp: Date.now(),
          });
        } catch {
          // Connection might be stale
          conn.connectionQuality = Math.max(0, conn.connectionQuality - 10);
        }
      }
    }
  }

  /**
   * Add an externally-created WebSocket connection (for server-accepted connections)
   */
  addConnection(peerId: string, socket: WebSocket): void {
    const conn: WSConnection = {
      peerId,
      socket,
      state: "connected",
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
      connectionQuality: 100,
    };

    this.connections.set(peerId, conn);

    socket.onmessage = (event: MessageEvent) => {
      this.handleMessage(peerId, event.data);
    };

    socket.onclose = () => {
      conn.state = "disconnected";
      this.connections.delete(peerId);
      this.events?.onPeerDisconnected?.(peerId, "connection closed");
    };

    socket.onerror = () => {
      conn.state = "failed";
      this.events?.onError?.(
        new Error("WebSocket connection error"),
        peerId
      );
    };

    this.events?.onPeerConnected?.(peerId, this.getPeerInfo(peerId));
    this.events?.onStateChange?.(peerId, "connected");
  }
}
