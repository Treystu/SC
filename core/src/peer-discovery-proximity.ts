/**
 * Proximity-based peer discovery using BLE RSSI
 * Automatically discovers nearby peers and manages connections based on signal strength
 */

export interface ProximityPeer {
  peerId: string;
  rssi: number;
  distance: number; // estimated in meters
  lastSeen: number;
  deviceName?: string;
  publicKey?: Uint8Array;
}

export interface ProximityConfig {
  rssiThreshold: number; // minimum RSSI to consider (-100 to 0)
  scanInterval: number; // ms between scans
  discoveryTimeout: number; // ms before removing stale peers
  maxDistance: number; // maximum distance in meters
  autoConnect: boolean; // automatically connect to nearby peers
}

export class ProximityDiscovery {
  private peers: Map<string, ProximityPeer> = new Map();
  private config: ProximityConfig;
  private scanning: boolean = false;
  private scanTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private listeners: Map<string, Set<(...args: any[]) => any>> = new Map();

  constructor(config: Partial<ProximityConfig> = {}) {
    this.config = {
      rssiThreshold: -70, // good signal strength
      scanInterval: 5000, // scan every 5 seconds
      discoveryTimeout: 30000, // remove after 30s
      maxDistance: 10, // 10 meters
      autoConnect: true,
      ...config
    };
  }

  /**
   * Start proximity scanning
   */
  async start(): Promise<void> {
    if (this.scanning) {
      return;
    }

    this.scanning = true;
    this.startScanning();
    this.startCleanup();
  }

  /**
   * Stop proximity scanning
   */
  stop(): void {
    this.scanning = false;

    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Start periodic scanning
   */
  private async startScanning(): Promise<void> {
    // @ts-ignore
    if (typeof navigator !== 'undefined' && navigator.bluetooth) {
      try {
        // @ts-ignore - Web Bluetooth API types might not be fully available
        if (navigator.bluetooth.requestLEScan) {
          console.log('Starting BLE scan...');
          // @ts-ignore
          const scan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: true, // For broad discovery, or use filters
            keepRepeatedDevices: true
          });

          // @ts-ignore
          navigator.bluetooth.addEventListener('advertisementreceived', (event: any) => {
            this.handleAdvertisement(event);
          });

          console.log('BLE scan started successfully');
          return;
        }
      } catch (error) {
        console.error('Failed to start BLE scan:', error);
      }
    }

    // Fallback to periodic polling if LE Scan is not supported or fails
    // Initial scan
    this.performScan();

    // Periodic scans
    this.scanTimer = setInterval(() => {
      this.performScan();
    }, this.config.scanInterval);
  }

  /**
   * Handle BLE advertisement packet
   */
  private handleAdvertisement(event: any): void {
    const peer: ProximityPeer = {
      peerId: event.device.id,
      rssi: event.rssi,
      distance: this.rssiToDistance(event.rssi),
      lastSeen: Date.now(),
      deviceName: event.device.name,
      // In a real app, we'd extract the public key from manufacturer data or service data
      // publicKey: event.manufacturerData...
    };

    this.updatePeer(peer);
  }

  /**
   * Perform a single scan
   */
  private async performScan(): Promise<void> {
    try {
      const discovered = await this.scanForPeers();

      discovered.forEach(peer => {
        this.updatePeer(peer);
      });

    } catch (error) {
      console.error('Proximity scan error:', error);
    }
  }

  /**
   * Fallback peer scanning for environments without Web Bluetooth LE Scan support
   * or when manual scanning is required (e.g. via requestDevice)
   */
  private async scanForPeers(): Promise<ProximityPeer[]> {
    // If we are using the event listener approach (requestLEScan), this might be empty
    // or used for a different fallback strategy (e.g. requestDevice)

    // @ts-ignore
    if (typeof navigator !== 'undefined' && navigator.bluetooth) {
      // requestDevice requires user gesture, so we can't call it automatically in a loop.
      // This method is kept for manual triggering or fallback.
      return [];
    }

    return [];
  }

  /**
   * Update or add peer
   */
  private updatePeer(peer: ProximityPeer): void {
    const distance = this.rssiToDistance(peer.rssi);

    // Check if peer meets criteria
    if (peer.rssi < this.config.rssiThreshold || distance > this.config.maxDistance) {
      return;
    }

    const existing = this.peers.get(peer.peerId);
    const isNew = !existing;

    const updated: ProximityPeer = {
      ...peer,
      distance,
      lastSeen: Date.now()
    };

    this.peers.set(peer.peerId, updated);

    if (isNew) {
      this.emit('peer-discovered', updated);

      if (this.config.autoConnect) {
        this.emit('should-connect', updated);
      }
    } else {
      this.emit('peer-updated', updated);
    }
  }

  /**
   * Convert RSSI to estimated distance in meters
   * Uses log-distance path loss model
   */
  private rssiToDistance(rssi: number): number {
    // Calibration values
    const txPower = -59; // RSSI at 1 meter
    const pathLossExponent = 2.0; // environment factor (free space = 2)

    if (rssi === 0) {
      return -1; // invalid
    }

    const ratio = (txPower - rssi) / (10 * pathLossExponent);
    return Math.pow(10, ratio);
  }

  /**
   * Start periodic cleanup of stale peers
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStalePeers();
    }, this.config.discoveryTimeout / 2);
  }

  /**
   * Remove peers that haven't been seen recently
   */
  private cleanupStalePeers(): void {
    const now = Date.now();
    const stale: string[] = [];

    this.peers.forEach((peer, peerId) => {
      if (now - peer.lastSeen > this.config.discoveryTimeout) {
        stale.push(peerId);
      }
    });

    stale.forEach(peerId => {
      const peer = this.peers.get(peerId);
      this.peers.delete(peerId);
      if (peer) {
        this.emit('peer-lost', peer);
      }
    });
  }

  /**
   * Get all discovered peers
   */
  getPeers(): ProximityPeer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get peers sorted by proximity
   */
  getNearbyPeers(): ProximityPeer[] {
    return this.getPeers().sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get specific peer
   */
  getPeer(peerId: string): ProximityPeer | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Check if peer is in range
   */
  isInRange(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer !== undefined;
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProximityConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart scanning with new config
    if (this.scanning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Event listener registration
   */
  on(event: string, callback: (...args: any[]) => any): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Event listener removal
   */
  off(event: string, callback: (...args: any[]) => any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Clear all discovered peers
   */
  clear(): void {
    this.peers.clear();
    this.emit('peers-cleared');
  }

  /**
   * Get discovery statistics
   */
  getStats() {
    const peers = this.getPeers();
    const distances = peers.map(p => p.distance);

    return {
      totalPeers: peers.length,
      averageDistance: distances.length > 0
        ? distances.reduce((a, b) => a + b, 0) / distances.length
        : 0,
      closestPeer: Math.min(...distances, Infinity),
      furthestPeer: Math.max(...distances, -Infinity),
      scanning: this.scanning
    };
  }
}

/**
 * Singleton instance for easy access
 */
export const proximityDiscovery = new ProximityDiscovery();
