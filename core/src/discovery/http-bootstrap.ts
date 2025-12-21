import { DiscoveryProvider, DiscoveryPeer } from "../mesh/discovery.js";

export class HttpBootstrapProvider implements DiscoveryProvider {
  name = "http-bootstrap";
  private bootstrapUrl: string;
  private pollInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private callback?: (peer: DiscoveryPeer) => void;

  constructor(bootstrapUrl: string, pollInterval: number = 60000) {
    this.bootstrapUrl = bootstrapUrl;
    this.pollInterval = pollInterval;
  }

  async start(): Promise<void> {
    // Initial fetch
    this.fetchPeers();

    // Start polling
    if (this.pollInterval > 0) {
      this.intervalId = setInterval(() => {
        this.fetchPeers();
      }, this.pollInterval);
    }
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  onPeerFound(callback: (peer: DiscoveryPeer) => void): void {
    this.callback = callback;
  }

  private async fetchPeers(): Promise<void> {
    try {
      // In a real environment, we would use fetch()
      // For now, we simulate or use a cross-platform fetch polyfill if needed
      // Assuming 'fetch' is available (Node 18+ or Browser)

      const response = await fetch(this.bootstrapUrl);
      if (!response.ok) {
        throw new Error(`Bootstrap fetch failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Expected schema: { peers: [{ id, transportType, connectionDetails, ... }] }
      if (Array.isArray(data.peers)) {
        data.peers.forEach((peerData: any) => {
          if (!peerData.id) return;

          const peer: DiscoveryPeer = {
            id: peerData.id,
            transportType: peerData.transportType || "webrtc",
            lastSeen: Date.now(),
            connectionDetails: peerData.connectionDetails || {},
            source: "bootstrap",
          };

          this.callback?.(peer);
        });
      }
    } catch (e) {
      console.warn(
        `[HttpBootstrap] Failed to fetch peers from ${this.bootstrapUrl}`,
        e,
      );
    }
  }
}
