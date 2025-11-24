import { Peer, RouteEntry } from '../types';

/**
 * Task 11: Implement in-memory routing table
 * Task 12: Create peer registry (connected peers)
 */
export class RoutingTable {
  private routes: Map<string, RouteEntry> = new Map();
  private peers: Map<string, Peer> = new Map();

  /**
   * Adds or updates a peer
   */
  addPeer(peer: Peer): void {
    const peerId = this.bufferToHex(peer.id);
    this.peers.set(peerId, peer);
  }

  /**
   * Removes a peer
   */
  removePeer(peerId: Uint8Array): void {
    const peerIdStr = this.bufferToHex(peerId);
    this.peers.delete(peerIdStr);
    
    // Remove routes through this peer
    const toDelete: string[] = [];
    for (const [dest, route] of this.routes.entries()) {
      if (this.bufferToHex(route.nextHopId) === peerIdStr) {
        toDelete.push(dest);
      }
    }
    toDelete.forEach(dest => this.routes.delete(dest));
  }

  /**
   * Gets a peer by ID
   */
  getPeer(peerId: Uint8Array): Peer | undefined {
    return this.peers.get(this.bufferToHex(peerId));
  }

  /**
   * Gets all connected peers
   */
  getAllPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Adds or updates a route
   */
  addRoute(route: RouteEntry): void {
    const destId = this.bufferToHex(route.destinationId);
    const existing = this.routes.get(destId);
    
    // Update if new route is better (fewer hops) or doesn't exist
    if (!existing || route.hopCount < existing.hopCount) {
      this.routes.set(destId, route);
    }
  }

  /**
   * Gets the next hop for a destination
   */
  getNextHop(destinationId: Uint8Array): Uint8Array | undefined {
    const route = this.routes.get(this.bufferToHex(destinationId));
    return route?.nextHopId;
  }

  /**
   * Checks if we have a direct connection to peer
   */
  hasDirectConnection(peerId: Uint8Array): boolean {
    return this.peers.has(this.bufferToHex(peerId));
  }

  /**
   * Gets count of connected peers
   */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Updates peer's last seen timestamp
   */
  updatePeerLastSeen(peerId: Uint8Array): void {
    const peer = this.getPeer(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }

  /**
   * Clears all routes and peers
   */
  clear(): void {
    this.routes.clear();
    this.peers.clear();
  }

  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
