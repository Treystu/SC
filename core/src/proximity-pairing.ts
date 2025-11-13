// Proximity-based pairing using BLE RSSI measurements

export interface ProximityPeer {
  peerId: string;
  rssi: number;
  distance: number; // estimated in meters
  timestamp: Date;
}

export class ProximityPairing {
  private readonly rssiThreshold = -70; // Close proximity threshold
  private readonly calibratedPower = -59; // RSSI at 1 meter
  private readonly environmentalFactor = 2.0; // Path loss exponent
  
  private nearbyPeers: Map<string, ProximityPeer> = new Map();
  private readonly staleTimeout = 10000; // 10 seconds
  
  updatePeer(peerId: string, rssi: number): void {
    const distance = this.calculateDistance(rssi);
    
    this.nearbyPeers.set(peerId, {
      peerId,
      rssi,
      distance,
      timestamp: new Date()
    });
    
    this.cleanupStalePeers();
  }
  
  private calculateDistance(rssi: number): number {
    // Calculate distance using path loss formula
    // distance = 10 ^ ((calibratedPower - rssi) / (10 * n))
    const ratio = (this.calibratedPower - rssi) / (10 * this.environmentalFactor);
    return Math.pow(10, ratio);
  }
  
  getNearbyPeers(maxDistance: number = 2.0): ProximityPeer[] {
    return Array.from(this.nearbyPeers.values())
      .filter(peer => peer.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }
  
  getClosestPeer(): ProximityPeer | null {
    const peers = this.getNearbyPeers();
    return peers.length > 0 ? peers[0] : null;
  }
  
  isInProximity(peerId: string, maxDistance: number = 2.0): boolean {
    const peer = this.nearbyPeers.get(peerId);
    if (!peer) return false;
    
    const age = Date.now() - peer.timestamp.getTime();
    if (age > this.staleTimeout) return false;
    
    return peer.distance <= maxDistance;
  }
  
  private cleanupStalePeers(): void {
    const now = Date.now();
    for (const [peerId, peer] of this.nearbyPeers.entries()) {
      if (now - peer.timestamp.getTime() > this.staleTimeout) {
        this.nearbyPeers.delete(peerId);
      }
    }
  }
  
  async waitForProximity(
    peerId: string,
    maxDistance: number = 2.0,
    timeout: number = 30000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.isInProximity(peerId, maxDistance)) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 500);
    });
  }
  
  getProximityLevel(distance: number): 'immediate' | 'near' | 'far' | 'unknown' {
    if (distance < 0.5) return 'immediate';
    if (distance < 2.0) return 'near';
    if (distance < 10.0) return 'far';
    return 'unknown';
  }
}
