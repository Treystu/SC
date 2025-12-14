import { DiscoveryProvider, DiscoveryPeer } from "./discovery.js";

export class BootstrapDiscoveryProvider implements DiscoveryProvider {
  name = "bootstrap";
  private peers: DiscoveryPeer[] = [];
  private callback?: (peer: DiscoveryPeer) => void;

  constructor(bootstrapPeers: DiscoveryPeer[]) {
    this.peers = bootstrapPeers;
  }

  async start(): Promise<void> {
    // Emit all known peers immediately on start
    if (this.callback) {
      this.peers.forEach((peer) => {
        // Update last seen to now
        const updatedPeer = { ...peer, lastSeen: Date.now() };
        this.callback!(updatedPeer);
      });
    }
  }

  async stop(): Promise<void> {
    // No-op
  }

  onPeerFound(callback: (peer: DiscoveryPeer) => void): void {
    this.callback = callback;
  }
}
