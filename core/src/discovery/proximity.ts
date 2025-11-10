/**
 * Proximity Pairing via BLE RSSI
 * Task 52: Create proximity pairing based on Bluetooth signal strength
 * 
 * Uses RSSI (Received Signal Strength Indicator) to detect nearby devices
 * and automatically pair when devices are in close proximity
 */

export interface ProximityDevice {
  id: string;
  name?: string;
  rssi: number;
  distance: number;  // Estimated distance in meters
  lastSeen: number;
}

export interface ProximityPairingOptions {
  rssiThreshold: number;      // Minimum RSSI for pairing (-60 = strong signal)
  proximityTimeout: number;   // Timeout for pairing prompt (ms)
  scanInterval: number;       // How often to scan (ms)
}

const DEFAULT_OPTIONS: ProximityPairingOptions = {
  rssiThreshold: -60,  // Strong signal threshold
  proximityTimeout: 30000,  // 30 seconds
  scanInterval: 5000,  // 5 seconds
};

export class ProximityPairing {
  private options: ProximityPairingOptions;
  private nearbyDevices: Map<string, ProximityDevice> = new Map();
  private scanning = false;

  constructor(options: Partial<ProximityPairingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Estimate distance from RSSI using path loss model
   * Formula: RSSI = -10n*log10(d) + A
   * where A = measured power at 1m, n = path loss exponent
   */
  estimateDistance(rssi: number): number {
    const A = -59;  // Measured RSSI at 1 meter
    const n = 2;    // Path loss exponent (2 = free space)
    
    const distance = Math.pow(10, (A - rssi) / (10 * n));
    return Math.round(distance * 10) / 10;  // Round to 1 decimal
  }

  /**
   * Add or update device from BLE scan
   */
  updateDevice(id: string, rssi: number, name?: string): ProximityDevice {
    const device: ProximityDevice = {
      id,
      name,
      rssi,
      distance: this.estimateDistance(rssi),
      lastSeen: Date.now(),
    };

    this.nearbyDevices.set(id, device);
    return device;
  }

  /**
   * Get devices within proximity threshold
   */
  getNearbyDevices(): ProximityDevice[] {
    const now = Date.now();
    const nearby: ProximityDevice[] = [];

    for (const [id, device] of this.nearbyDevices.entries()) {
      // Remove stale devices (not seen in last minute)
      if (now - device.lastSeen > 60000) {
        this.nearbyDevices.delete(id);
        continue;
      }

      // Check if within proximity threshold
      if (device.rssi > this.options.rssiThreshold) {
        nearby.push(device);
      }
    }

    // Sort by signal strength (strongest first)
    return nearby.sort((a, b) => b.rssi - a.rssi);
  }

  /**
   * Get the strongest device (most likely target for pairing)
   */
  getStrongestDevice(): ProximityDevice | null {
    const nearby = this.getNearbyDevices();
    return nearby.length > 0 ? nearby[0] : null;
  }

  /**
   * Check if a specific device is in proximity
   */
  isDeviceInProximity(deviceId: string): boolean {
    const device = this.nearbyDevices.get(deviceId);
    if (!device) return false;

    const now = Date.now();
    if (now - device.lastSeen > 60000) {
      this.nearbyDevices.delete(deviceId);
      return false;
    }

    return device.rssi > this.options.rssiThreshold;
  }

  /**
   * Wait for a device to come into proximity
   * Returns the device when it's close enough
   */
  async waitForProximity(timeoutMs?: number): Promise<ProximityDevice | null> {
    const timeout = timeoutMs || this.options.proximityTimeout;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const strongest = this.getStrongestDevice();
        
        if (strongest) {
          clearInterval(checkInterval);
          resolve(strongest);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, this.options.scanInterval);
    });
  }

  /**
   * Initiate proximity-based pairing
   * Shows UI prompt when a strong signal is detected
   */
  async initiateProximityPairing(
    onDeviceFound: (device: ProximityDevice) => Promise<boolean>
  ): Promise<ProximityDevice | null> {
    const device = await this.waitForProximity();
    
    if (!device) {
      return null;  // Timeout, no device found
    }

    // Call handler to show UI prompt
    const accepted = await onDeviceFound(device);
    
    if (!accepted) {
      return null;  // User rejected pairing
    }

    // Verify device is still in proximity
    if (!this.isDeviceInProximity(device.id)) {
      throw new Error('Device moved out of range');
    }

    return device;
  }

  /**
   * Clear all tracked devices
   */
  clearDevices(): void {
    this.nearbyDevices.clear();
  }

  /**
   * Get all tracked devices (for debugging/UI)
   */
  getAllDevices(): ProximityDevice[] {
    return Array.from(this.nearbyDevices.values());
  }
}

/**
 * Example usage for platform-specific implementations
 */
export interface ProximityPairingHandler {
  /**
   * Start BLE scan and update proximity manager
   */
  startScanning(): void;

  /**
   * Stop BLE scan
   */
  stopScanning(): void;

  /**
   * Show pairing prompt to user
   */
  showPairingPrompt(device: ProximityDevice): Promise<boolean>;

  /**
   * Complete pairing with device
   */
  completePairing(device: ProximityDevice): Promise<void>;
}
