import { PeerHealth } from '../types';

/**
 * Task 17: Implement peer health monitoring (heartbeat)
 * Task 18: Create peer timeout and removal
 */
export class PeerHealthMonitor {
  private peerHealth: Map<string, PeerHealth> = new Map();
  private readonly heartbeatInterval: number;
  private readonly maxMissedHeartbeats: number;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    heartbeatInterval: number = 30000, // 30 seconds
    maxMissedHeartbeats: number = 3
  ) {
    this.heartbeatInterval = heartbeatInterval;
    this.maxMissedHeartbeats = maxMissedHeartbeats;
    this.startMonitoring();
  }

  /**
   * Records a heartbeat from a peer
   */
  recordHeartbeat(peerId: Uint8Array): void {
    const peerIdStr = this.bufferToHex(peerId);
    const existing = this.peerHealth.get(peerIdStr);

    if (existing) {
      existing.lastHeartbeat = Date.now();
      existing.missedHeartbeats = 0;
      existing.isHealthy = true;
    } else {
      this.peerHealth.set(peerIdStr, {
        peerId,
        lastHeartbeat: Date.now(),
        missedHeartbeats: 0,
        isHealthy: true,
      });
    }
  }

  /**
   * Checks if a peer is healthy
   */
  isHealthy(peerId: Uint8Array): boolean {
    const health = this.peerHealth.get(this.bufferToHex(peerId));
    return health?.isHealthy ?? false;
  }

  /**
   * Gets unhealthy peers that should be removed
   */
  getUnhealthyPeers(): Uint8Array[] {
    return Array.from(this.peerHealth.values())
      .filter(health => !health.isHealthy)
      .map(health => health.peerId);
  }

  /**
   * Removes a peer from health monitoring
   */
  removePeer(peerId: Uint8Array): void {
    this.peerHealth.delete(this.bufferToHex(peerId));
  }

  /**
   * Monitors peer health and marks unhealthy peers
   */
  private monitor(): void {
    const now = Date.now();

    for (const health of this.peerHealth.values()) {
      const timeSinceLastHeartbeat = now - health.lastHeartbeat;

      if (timeSinceLastHeartbeat > this.heartbeatInterval) {
        health.missedHeartbeats++;

        if (health.missedHeartbeats >= this.maxMissedHeartbeats) {
          health.isHealthy = false;
        }
      }
    }
  }

  /**
   * Starts periodic health monitoring
   */
  private startMonitoring(): void {
    this.monitorInterval = setInterval(
      () => this.monitor(),
      this.heartbeatInterval
    );
  }

  /**
   * Stops monitoring and cleans up
   */
  destroy(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.peerHealth.clear();
  }

  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
