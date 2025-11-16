// Connection Manager - Handles all peer connections and their lifecycle
// Task 216: Connection lifecycle management

export interface ConnectionConfig {
  maxPeers: number;
  reconnectInterval: number;
  connectionTimeout: number;
  keepAliveInterval: number;
}

export interface PeerConnection {
  id: string;
  type: 'webrtc' | 'ble' | 'local';
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
  quality: number;
  latency: number;
  lastSeen: number;
  bandwidth: { upload: number; download: number };
}

export class ConnectionManager {
  private connections: Map<string, PeerConnection> = new Map();
  private config: ConnectionConfig;
  private keepAliveTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<ConnectionConfig> = {}) {
    this.config = {
      maxPeers: config.maxPeers || 50,
      reconnectInterval: config.reconnectInterval || 5000,
      connectionTimeout: config.connectionTimeout || 30000,
      keepAliveInterval: config.keepAliveInterval || 10000,
    };
  }

  addConnection(peerId: string, type: PeerConnection['type']): void {
    const connection: PeerConnection = {
      id: peerId,
      type,
      status: 'connecting',
      quality: 0,
      latency: 0,
      lastSeen: Date.now(),
      bandwidth: { upload: 0, download: 0 },
    };

    this.connections.set(peerId, connection);
    this.startKeepAlive(peerId);
  }

  updateConnectionStatus(peerId: string, status: PeerConnection['status']): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.status = status;
      conn.lastSeen = Date.now();

      if (status === 'connected') {
        this.clearReconnectTimer(peerId);
      } else if (status === 'failed' || status === 'disconnected') {
        this.scheduleReconnect(peerId);
      }
    }
  }

  updateConnectionMetrics(
    peerId: string,
    metrics: { quality?: number; latency?: number; bandwidth?: { upload: number; download: number } }
  ): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      if (metrics.quality !== undefined) conn.quality = metrics.quality;
      if (metrics.latency !== undefined) conn.latency = metrics.latency;
      if (metrics.bandwidth) conn.bandwidth = metrics.bandwidth;
      conn.lastSeen = Date.now();
    }
  }

  removeConnection(peerId: string): void {
    this.clearKeepAlive(peerId);
    this.clearReconnectTimer(peerId);
    this.connections.delete(peerId);
  }

  getConnection(peerId: string): PeerConnection | undefined {
    return this.connections.get(peerId);
  }

  getAllConnections(): PeerConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectedPeers(): PeerConnection[] {
    return this.getAllConnections().filter((conn) => conn.status === 'connected');
  }

  getBestConnection(): PeerConnection | null {
    const connected = this.getConnectedPeers();
    if (connected.length === 0) return null;

    // Prioritize quality first, then latency as tiebreaker
    return connected.reduce((best, conn) =>
      conn.quality > best.quality ? conn : 
      conn.quality === best.quality && conn.latency < best.latency ? conn : best
    );
  }

  private startKeepAlive(peerId: string): void {
    const timer = setInterval(() => {
      const conn = this.connections.get(peerId);
      if (!conn) {
        this.clearKeepAlive(peerId);
        return;
      }

      const timeSinceLastSeen = Date.now() - conn.lastSeen;
      if (timeSinceLastSeen > this.config.connectionTimeout) {
        this.updateConnectionStatus(peerId, 'disconnected');
      }
    }, this.config.keepAliveInterval);

    this.keepAliveTimers.set(peerId, timer);
  }

  private clearKeepAlive(peerId: string): void {
    const timer = this.keepAliveTimers.get(peerId);
    if (timer) {
      clearInterval(timer);
      this.keepAliveTimers.delete(peerId);
    }
  }

  private scheduleReconnect(peerId: string): void {
    if (this.reconnectTimers.has(peerId)) return;

    const timer = setTimeout(() => {
      const conn = this.connections.get(peerId);
      if (conn && conn.status !== 'connected') {
        this.updateConnectionStatus(peerId, 'connecting');
        // Emit reconnect event that other systems can listen to
      }
      this.reconnectTimers.delete(peerId);
    }, this.config.reconnectInterval);

    this.reconnectTimers.set(peerId, timer);
  }

  private clearReconnectTimer(peerId: string): void {
    const timer = this.reconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(peerId);
    }
  }

  getStatistics() {
    const connections = this.getAllConnections();
    const connected = this.getConnectedPeers();

    return {
      total: connections.length,
      connected: connected.length,
      connecting: connections.filter((c) => c.status === 'connecting').length,
      disconnected: connections.filter((c) => c.status === 'disconnected').length,
      failed: connections.filter((c) => c.status === 'failed').length,
      avgQuality: connected.reduce((sum, c) => sum + c.quality, 0) / (connected.length || 1),
      avgLatency: connected.reduce((sum, c) => sum + c.latency, 0) / (connected.length || 1),
      totalBandwidth: {
        upload: connected.reduce((sum, c) => sum + c.bandwidth.upload, 0),
        download: connected.reduce((sum, c) => sum + c.bandwidth.download, 0),
      },
    };
  }

  cleanup(): void {
    this.keepAliveTimers.forEach((timer) => clearInterval(timer));
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.keepAliveTimers.clear();
    this.reconnectTimers.clear();
    this.connections.clear();
  }
}
