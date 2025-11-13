/**
 * Peer Health Monitoring with Heartbeat
 */

import { RoutingTable, Peer } from './routing';
import { Message, MessageType, encodeMessage } from '../protocol/message';
import { signMessage } from '../crypto/primitives';

export interface HeartbeatConfig {
  interval: number; // Heartbeat interval in ms
  timeout: number; // Peer timeout in ms
  maxMissed: number; // Max missed heartbeats before removing peer
}

export interface PeerHealth {
  peerId: string;
  lastHeartbeat: number;
  missedHeartbeats: number;
  rtt: number; // Round-trip time in ms
  isHealthy: boolean;
}

/**
 * Peer Health Monitor
 * Implements heartbeat-based health monitoring
 */
export class PeerHealthMonitor {
  private routingTable: RoutingTable;
  private config: HeartbeatConfig;
  private peerHealth: Map<string, PeerHealth> = new Map();
  private heartbeatIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private onPeerUnhealthyCallback?: (peerId: string) => void;
  private onPeerHealthyCallback?: (peerId: string) => void;
  private onSendMessageCallback?: (peerId: string, message: Uint8Array) => void;
  private localPeerId: string;
  private identityPrivateKey: Uint8Array;

  constructor(
    localPeerId: string,
    identityPrivateKey: Uint8Array,
    routingTable: RoutingTable,
    config: Partial<HeartbeatConfig> = {}
  ) {
    this.localPeerId = localPeerId;
    this.identityPrivateKey = identityPrivateKey;
    this.routingTable = routingTable;
    this.config = {
      interval: config.interval || 30000, // 30 seconds
      timeout: config.timeout || 90000, // 90 seconds
      maxMissed: config.maxMissed || 3,
    };
  }

  /**
   * Start monitoring a peer
   */
  startMonitoring(peerId: string): void {
    if (this.heartbeatIntervals.has(peerId)) {
      return; // Already monitoring
    }

    // Initialize health tracking
    this.peerHealth.set(peerId, {
      peerId,
      lastHeartbeat: Date.now(),
      missedHeartbeats: 0,
      rtt: 0,
      isHealthy: true,
    });

    // Start sending heartbeats
    const interval = setInterval(() => {
      this.sendHeartbeat(peerId);
      this.checkPeerHealth(peerId);
    }, this.config.interval);

    this.heartbeatIntervals.set(peerId, interval);
  }

  /**
   * Stop monitoring a peer
   */
  stopMonitoring(peerId: string): void {
    const interval = this.heartbeatIntervals.get(peerId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(peerId);
    }
    this.peerHealth.delete(peerId);
  }

  /**
   * Send heartbeat (PING) to peer
   */
  private sendHeartbeat(peerId: string): void {
    const payload = new TextEncoder().encode(JSON.stringify({
      timestamp: Date.now(),
      peerId: this.localPeerId,
    }));

    const message: Message = {
      header: {
        version: 0x01,
        type: MessageType.CONTROL_PING,
        ttl: 1, // Direct message, no forwarding
        timestamp: Date.now(),
        senderId: new Uint8Array(32), // Will be filled with actual public key
        signature: new Uint8Array(65),
      },
      payload,
    };

    // Sign message
    const messageBytes = encodeMessage(message);
    message.header.signature = signMessage(messageBytes, this.identityPrivateKey);

    // Send to peer
    const encodedMessage = encodeMessage(message);
    this.onSendMessageCallback?.(peerId, encodedMessage);
  }

  /**
   * Process received heartbeat response (PONG)
   */
  processHeartbeatResponse(peerId: string, timestamp: number): void {
    const health = this.peerHealth.get(peerId);
    if (!health) {
      return;
    }

    // Calculate RTT
    const rtt = Date.now() - timestamp;
    health.rtt = rtt;
    health.lastHeartbeat = Date.now();
    health.missedHeartbeats = 0;

    // Check if peer became healthy
    if (!health.isHealthy) {
      health.isHealthy = true;
      this.onPeerHealthyCallback?.(peerId);
    }

    // Update peer last seen in routing table
    this.routingTable.updatePeerLastSeen(peerId);
  }

  /**
   * Check peer health based on missed heartbeats
   */
  private checkPeerHealth(peerId: string): void {
    const health = this.peerHealth.get(peerId);
    if (!health) {
      return;
    }

    const now = Date.now();
    const timeSinceLastHeartbeat = now - health.lastHeartbeat;

    // Check if heartbeat is overdue
    if (timeSinceLastHeartbeat > this.config.interval * 1.5) {
      health.missedHeartbeats++;

      // Check if peer is unhealthy
      if (health.missedHeartbeats >= this.config.maxMissed) {
        if (health.isHealthy) {
          health.isHealthy = false;
          this.onPeerUnhealthyCallback?.(peerId);
        }

        // Check if peer should be removed
        if (timeSinceLastHeartbeat > this.config.timeout) {
          this.stopMonitoring(peerId);
          this.routingTable.removePeer(peerId);
        }
      }
    }
  }

  /**
   * Get health status for a peer
   */
  getPeerHealth(peerId: string): PeerHealth | undefined {
    return this.peerHealth.get(peerId);
  }

  /**
   * Get all peer health statuses
   */
  getAllPeerHealth(): PeerHealth[] {
    return Array.from(this.peerHealth.values());
  }

  /**
   * Register callback for peer becoming unhealthy
   */
  onPeerUnhealthy(callback: (peerId: string) => void): void {
    this.onPeerUnhealthyCallback = callback;
  }

  /**
   * Register callback for peer becoming healthy
   */
  onPeerHealthy(callback: (peerId: string) => void): void {
    this.onPeerHealthyCallback = callback;
  }

  /**
   * Register callback for sending messages
   */
  onSendMessage(callback: (peerId: string, message: Uint8Array) => void): void {
    this.onSendMessageCallback = callback;
  }

  /**
   * Get health statistics
   */
  getStats() {
    const healthy = Array.from(this.peerHealth.values()).filter(h => h.isHealthy).length;
    const unhealthy = this.peerHealth.size - healthy;

    return {
      totalPeers: this.peerHealth.size,
      healthy,
      unhealthy,
      averageRtt: this.calculateAverageRtt(),
    };
  }

  /**
   * Calculate average RTT across all healthy peers
   */
  private calculateAverageRtt(): number {
    const healthyPeers = Array.from(this.peerHealth.values()).filter(h => h.isHealthy);
    if (healthyPeers.length === 0) {
      return 0;
    }

    const totalRtt = healthyPeers.reduce((sum, h) => sum + h.rtt, 0);
    return totalRtt / healthyPeers.length;
  }

  /**
   * Shutdown health monitor
   */
  shutdown(): void {
    // Clear all intervals
    this.heartbeatIntervals.forEach(interval => clearInterval(interval));
    this.heartbeatIntervals.clear();
    this.peerHealth.clear();
  }
}
