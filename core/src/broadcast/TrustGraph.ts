/**
 * TrustGraph - Web-of-trust for broadcast verification
 *
 * Implements a trust network where:
 * - You directly trust certain peers (level 3)
 * - Friends of friends get second-degree trust (level 2)
 * - Third-degree connections get minimal trust (level 1)
 *
 * This prevents spam while allowing community-verified
 * broadcasters without central authority.
 */

import { TrustLevel } from "./EmergencyBroadcast.js";

/**
 * A trust relationship
 */
export interface TrustEdge {
  /** Who is trusting */
  fromPeerId: string;

  /** Who is trusted */
  toPeerId: string;

  /** Trust level granted */
  level: TrustLevel;

  /** When trust was established */
  createdAt: number;

  /** Optional note about why trusted */
  note?: string;
}

/**
 * A path through the trust graph
 */
export interface TrustPath {
  /** Target peer ID */
  targetId: string;

  /** Final trust level */
  level: TrustLevel;

  /** Path from us to target */
  path: Array<{
    peerId: string;
    name?: string;
  }>;

  /** Length of path (1 = direct, 2 = second degree, etc.) */
  pathLength: number;
}

/**
 * TrustGraph manages the web-of-trust
 */
export class TrustGraph {
  private localPeerId: string;

  /** Direct trust relationships from us */
  private directTrust: Map<string, TrustEdge> = new Map();

  /** All known trust relationships (for path finding) */
  private allEdges: Map<string, TrustEdge[]> = new Map();

  /** Cached trust paths (cleared on graph change) */
  private pathCache: Map<string, TrustPath | null> = new Map();

  /** Peer display names */
  private peerNames: Map<string, string> = new Map();

  constructor(localPeerId: string) {
    this.localPeerId = localPeerId;
  }

  /**
   * Add a direct trust relationship
   */
  addDirectTrust(
    peerId: string,
    level: TrustLevel = TrustLevel.DIRECT,
    note?: string
  ): void {
    const edge: TrustEdge = {
      fromPeerId: this.localPeerId,
      toPeerId: peerId,
      level,
      createdAt: Date.now(),
      note,
    };

    this.directTrust.set(peerId, edge);
    this.addEdge(edge);
    this.clearCache();

    console.log(`[TrustGraph] Added direct trust: ${peerId} (level ${level})`);
  }

  /**
   * Remove a direct trust relationship
   */
  removeDirectTrust(peerId: string): void {
    this.directTrust.delete(peerId);
    this.removeEdge(this.localPeerId, peerId);
    this.clearCache();

    console.log(`[TrustGraph] Removed direct trust: ${peerId}`);
  }

  /**
   * Add a known trust relationship (from other peers)
   */
  addKnownTrust(edge: TrustEdge): void {
    this.addEdge(edge);
    this.clearCache();
  }

  /**
   * Set peer display name
   */
  setPeerName(peerId: string, name: string): void {
    this.peerNames.set(peerId, name);
  }

  /**
   * Get peer display name
   */
  getPeerName(peerId: string): string | undefined {
    return this.peerNames.get(peerId);
  }

  /**
   * Get trust level for a peer (from our perspective)
   */
  getTrustLevel(peerId: string): TrustLevel {
    // Check cache
    const cached = this.pathCache.get(peerId);
    if (cached !== undefined) {
      return cached?.level ?? TrustLevel.UNKNOWN;
    }

    // Find path
    const path = this.findTrustPath(peerId);
    this.pathCache.set(peerId, path);

    return path?.level ?? TrustLevel.UNKNOWN;
  }

  /**
   * Get trust path to a peer
   */
  getTrustPath(peerId: string): TrustPath | null {
    // Check cache
    const cached = this.pathCache.get(peerId);
    if (cached !== undefined) {
      return cached;
    }

    // Find path
    const path = this.findTrustPath(peerId);
    this.pathCache.set(peerId, path);

    return path;
  }

  /**
   * Check if peer is trusted at minimum level
   */
  isTrusted(peerId: string, minLevel: TrustLevel): boolean {
    return this.getTrustLevel(peerId) >= minLevel;
  }

  /**
   * Check if peer can broadcast (trusted at any level)
   */
  canBroadcast(peerId: string): boolean {
    return this.getTrustLevel(peerId) > TrustLevel.UNKNOWN;
  }

  /**
   * Get all directly trusted peers
   */
  getDirectlyTrusted(): TrustEdge[] {
    return Array.from(this.directTrust.values());
  }

  /**
   * Get all peers at a specific trust level
   */
  getPeersAtLevel(level: TrustLevel): string[] {
    // This is expensive - would optimize for production
    const peers: string[] = [];

    // Get all unique peer IDs from edges
    const allPeers = new Set<string>();
    for (const edges of this.allEdges.values()) {
      for (const edge of edges) {
        allPeers.add(edge.toPeerId);
      }
    }

    for (const peerId of allPeers) {
      if (this.getTrustLevel(peerId) === level) {
        peers.push(peerId);
      }
    }

    return peers;
  }

  /**
   * Export trust graph state
   */
  export(): {
    directTrust: TrustEdge[];
    knownEdges: TrustEdge[];
  } {
    const knownEdges: TrustEdge[] = [];
    for (const edges of this.allEdges.values()) {
      for (const edge of edges) {
        if (edge.fromPeerId !== this.localPeerId) {
          knownEdges.push(edge);
        }
      }
    }

    return {
      directTrust: Array.from(this.directTrust.values()),
      knownEdges,
    };
  }

  /**
   * Import trust graph state
   */
  import(state: { directTrust: TrustEdge[]; knownEdges: TrustEdge[] }): void {
    this.directTrust.clear();
    this.allEdges.clear();
    this.clearCache();

    for (const edge of state.directTrust) {
      this.directTrust.set(edge.toPeerId, edge);
      this.addEdge(edge);
    }

    for (const edge of state.knownEdges) {
      this.addEdge(edge);
    }

    console.log(`[TrustGraph] Imported ${state.directTrust.length} direct + ${state.knownEdges.length} known edges`);
  }

  /**
   * Get trust graph statistics
   */
  getStats(): {
    directTrustCount: number;
    totalEdges: number;
    uniquePeers: number;
  } {
    const uniquePeers = new Set<string>();
    let totalEdges = 0;

    for (const edges of this.allEdges.values()) {
      totalEdges += edges.length;
      for (const edge of edges) {
        uniquePeers.add(edge.toPeerId);
      }
    }

    return {
      directTrustCount: this.directTrust.size,
      totalEdges,
      uniquePeers: uniquePeers.size,
    };
  }

  // ============== Private Methods ==============

  private addEdge(edge: TrustEdge): void {
    const existing = this.allEdges.get(edge.fromPeerId) ?? [];
    // Remove existing edge to same target
    const filtered = existing.filter(e => e.toPeerId !== edge.toPeerId);
    filtered.push(edge);
    this.allEdges.set(edge.fromPeerId, filtered);
  }

  private removeEdge(fromPeerId: string, toPeerId: string): void {
    const existing = this.allEdges.get(fromPeerId);
    if (existing) {
      const filtered = existing.filter(e => e.toPeerId !== toPeerId);
      this.allEdges.set(fromPeerId, filtered);
    }
  }

  private clearCache(): void {
    this.pathCache.clear();
  }

  /**
   * Find shortest trust path to a peer using BFS
   */
  private findTrustPath(targetId: string): TrustPath | null {
    // Self is always fully trusted
    if (targetId === this.localPeerId) {
      return {
        targetId,
        level: TrustLevel.DIRECT,
        path: [{ peerId: this.localPeerId }],
        pathLength: 0,
      };
    }

    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: Array<{
      peerId: string;
      path: string[];
    }> = [];

    // Start from our direct trust
    const directEdges = this.allEdges.get(this.localPeerId) ?? [];
    for (const edge of directEdges) {
      if (edge.toPeerId === targetId) {
        // Direct trust
        return {
          targetId,
          level: TrustLevel.DIRECT,
          path: [
            { peerId: this.localPeerId },
            { peerId: targetId, name: this.peerNames.get(targetId) },
          ],
          pathLength: 1,
        };
      }

      queue.push({
        peerId: edge.toPeerId,
        path: [this.localPeerId, edge.toPeerId],
      });
      visited.add(edge.toPeerId);
    }

    // BFS for second and third degree
    while (queue.length > 0) {
      const current = queue.shift()!;

      // Don't go beyond 3 hops
      if (current.path.length > 3) {
        continue;
      }

      // Check edges from current node
      const edges = this.allEdges.get(current.peerId) ?? [];
      for (const edge of edges) {
        if (visited.has(edge.toPeerId)) {
          continue;
        }

        const newPath = [...current.path, edge.toPeerId];

        if (edge.toPeerId === targetId) {
          // Found target
          const pathLength = newPath.length - 1;
          let level = TrustLevel.UNKNOWN;

          if (pathLength === 1) level = TrustLevel.DIRECT;
          else if (pathLength === 2) level = TrustLevel.SECOND_DEGREE;
          else if (pathLength === 3) level = TrustLevel.THIRD_DEGREE;

          return {
            targetId,
            level,
            path: newPath.map(id => ({
              peerId: id,
              name: this.peerNames.get(id),
            })),
            pathLength,
          };
        }

        visited.add(edge.toPeerId);
        queue.push({
          peerId: edge.toPeerId,
          path: newPath,
        });
      }
    }

    // No path found
    return null;
  }
}

/**
 * Create a trust graph instance
 */
export function createTrustGraph(localPeerId: string): TrustGraph {
  return new TrustGraph(localPeerId);
}
