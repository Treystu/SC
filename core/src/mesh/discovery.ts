/**
 * Decentralized Peer Discovery Manager
 * Aggregates peer discoveries from multiple sources (mDNS, BLE, DHT, etc.)
 */

export interface DiscoveryPeer {
  id: string;
  transportType: string;
  lastSeen: number;
  connectionDetails: Record<string, unknown>; // specific to transport (e.g., IP/port, BLE UUID)
  source: string; // "mdns", "ble", "dht", "bootstrap"
}

export interface DiscoveryProvider {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onPeerFound(callback: (peer: DiscoveryPeer) => void): void;
}

export class DiscoveryManager {
  private providers: Map<string, DiscoveryProvider> = new Map();
  private discoveredPeers: Map<string, DiscoveryPeer> = new Map();
  private onPeerDiscoveredCallback?: (peer: DiscoveryPeer) => void;
  private isRunning: boolean = false;

  constructor() {}

  /**
   * Register a discovery provider (e.g., MDNS, Bluetooth)
   */
  registerProvider(provider: DiscoveryProvider): void {
    this.providers.set(provider.name, provider);

    // Subscribe to findings
    provider.onPeerFound((peer) => {
      this.handlePeerFound(peer);
    });

    if (this.isRunning) {
      provider.start().catch((err) => {
        console.error(`Failed to start provider ${provider.name}:`, err);
      });
    }
  }

  /**
   * Start all discovery providers
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const promises = Array.from(this.providers.values()).map(async (p) => {
      try {
        await p.start();
      } catch (e) {
        console.error(`Error starting discovery provider ${p.name}:`, e);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Stop all discovery providers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    const promises = Array.from(this.providers.values()).map((p) => p.stop());
    await Promise.all(promises);
  }

  /**
   * Handle detailed peer discovery event
   */
  private handlePeerFound(peer: DiscoveryPeer): void {
    // Dedup and merge?
    // Always update last seen
    this.discoveredPeers.set(peer.id, peer);

    // Notify if new or if connection details changed significantly
    // For now, naive notification
    if (this.onPeerDiscoveredCallback) {
      this.onPeerDiscoveredCallback(peer);
    }
  }

  /**
   * Manual injection of a discovered peer (e.g. from Native bridge)
   */
  reportDiscovery(peer: DiscoveryPeer): void {
    this.handlePeerFound(peer);
  }

  /**
   * Register callback for new peers
   */
  onPeerDiscovered(callback: (peer: DiscoveryPeer) => void): void {
    this.onPeerDiscoveredCallback = callback;
  }

  /**
   * Get all currently known discovered peers
   */
  getDiscoveredPeers(): DiscoveryPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Clear discovered peers (e.g. on network change)
   */
  clear(): void {
    this.discoveredPeers.clear();
  }
}
