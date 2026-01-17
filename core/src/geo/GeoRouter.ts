/**
 * GeoRouter - Geographic-aware message routing
 *
 * Routes messages toward their destination by preferring peers
 * that are geographically closer to the target zone.
 *
 * In apocalypse scenarios, this ensures messages traveling from
 * NYC to LA prefer westward-moving peers rather than random directions.
 */

import type { GeoZone } from "./GeoZone.js";
import { geoDistance, isOnPath, getDirection, LocationPrecision } from "./GeoZone.js";

/**
 * Information about a peer for routing decisions
 */
export interface PeerGeoInfo {
  /** Peer ID */
  peerId: string;

  /** Peer's geographic zone */
  geoZone?: GeoZone;

  /** Number of peers this peer knows */
  knownPeers: number;

  /** Number of messages this peer is carrying */
  messageCount: number;

  /** Whether this peer has indicated they travel (courier) */
  isCourier: boolean;

  /** Connection quality (0-100) */
  connectionQuality: number;

  /** Transport type */
  transportType: 'webrtc' | 'bluetooth' | 'wifi-direct' | 'lora' | 'meshtastic';
}

/**
 * Routing hint for a message
 */
export interface GeoRoutingHint {
  /** Source zone of message */
  sourceZone?: GeoZone;

  /** Destination zone of message */
  destinationZone?: GeoZone;

  /** Preferred direction for routing */
  preferredDirection: string;

  /** Estimated number of hops */
  estimatedHops: number;

  /** Estimated delivery time (ms) */
  estimatedDeliveryTime: number;

  /** Whether this is a local delivery (same zone) */
  isLocal: boolean;
}

/**
 * Peer score for message relay
 */
export interface PeerScore {
  /** Peer ID */
  peerId: string;

  /** Total score (higher = better relay) */
  score: number;

  /** Score breakdown for debugging */
  breakdown: {
    proximityScore: number;
    directionScore: number;
    connectivityScore: number;
    loadScore: number;
    courierScore: number;
    transportScore: number;
  };

  /** Why this peer was scored this way */
  reason: string;
}

/**
 * GeoRouter configuration
 */
export interface GeoRouterConfig {
  /** Our own geographic zone */
  ownZone?: GeoZone;

  /** Weight for proximity scoring (0-1) */
  proximityWeight: number;

  /** Weight for direction scoring (0-1) */
  directionWeight: number;

  /** Weight for connectivity scoring (0-1) */
  connectivityWeight: number;

  /** Weight for load scoring (0-1) */
  loadWeight: number;

  /** Maximum peer load before penalty */
  maxPeerLoad: number;

  /** Bonus for courier peers */
  courierBonus: number;
}

/**
 * Default router configuration
 */
export const DEFAULT_GEO_ROUTER_CONFIG: GeoRouterConfig = {
  ownZone: undefined,
  proximityWeight: 0.4,
  directionWeight: 0.3,
  connectivityWeight: 0.15,
  loadWeight: 0.15,
  maxPeerLoad: 10000,
  courierBonus: 50,
};

/**
 * GeoRouter handles geographic-aware routing decisions
 */
export class GeoRouter {
  private config: GeoRouterConfig;

  constructor(config: Partial<GeoRouterConfig> = {}) {
    this.config = { ...DEFAULT_GEO_ROUTER_CONFIG, ...config };
  }

  /**
   * Set our own geographic zone
   */
  setOwnZone(zone: GeoZone): void {
    this.config.ownZone = zone;
  }

  /**
   * Get our own geographic zone
   */
  getOwnZone(): GeoZone | undefined {
    return this.config.ownZone;
  }

  /**
   * Calculate routing hint for a message
   */
  calculateRoute(
    sourceZone: GeoZone | undefined,
    destinationZone: GeoZone | undefined
  ): GeoRoutingHint {
    // No destination = can't route geographically
    if (!destinationZone || destinationZone.precision === LocationPrecision.NONE) {
      return {
        sourceZone,
        destinationZone,
        preferredDirection: 'any',
        estimatedHops: 10, // Unknown, assume moderate
        estimatedDeliveryTime: 24 * 60 * 60 * 1000, // 24 hours
        isLocal: false,
      };
    }

    const source = sourceZone ?? this.config.ownZone;

    // Same zone = local delivery
    if (source && source.zoneId === destinationZone.zoneId) {
      return {
        sourceZone: source,
        destinationZone,
        preferredDirection: 'local',
        estimatedHops: 1,
        estimatedDeliveryTime: 60 * 1000, // 1 minute
        isLocal: true,
      };
    }

    // Calculate direction and distance
    let direction = 'any';
    let distance = Infinity;

    if (source) {
      direction = getDirection(source, destinationZone);
      distance = geoDistance(source, destinationZone);
    }

    // Estimate hops based on distance
    // Rough estimate: 1 hop per 100km for mesh, faster for LoRa
    const estimatedHops = Math.ceil(distance / 100);

    // Estimate delivery time
    // Assume: 1 hour per hop for regular mesh
    const estimatedDeliveryTime = estimatedHops * 60 * 60 * 1000;

    return {
      sourceZone: source,
      destinationZone,
      preferredDirection: direction,
      estimatedHops,
      estimatedDeliveryTime,
      isLocal: false,
    };
  }

  /**
   * Score a peer for relaying a specific message
   */
  scorePeerForMessage(
    peer: PeerGeoInfo,
    destinationZone: GeoZone | undefined
  ): PeerScore {
    const breakdown = {
      proximityScore: 0,
      directionScore: 0,
      connectivityScore: 0,
      loadScore: 0,
      courierScore: 0,
      transportScore: 0,
    };

    let reason = '';

    // If no destination zone, use neutral scoring
    if (!destinationZone || destinationZone.precision === LocationPrecision.NONE) {
      breakdown.proximityScore = 50;
      reason = 'No destination zone, neutral scoring';
    } else if (!peer.geoZone) {
      // Peer has no zone info
      breakdown.proximityScore = 40;
      reason = 'Peer zone unknown';
    } else if (!this.config.ownZone) {
      // We don't know our own zone
      breakdown.proximityScore = 50;
      reason = 'Own zone unknown';
    } else {
      // Full geographic scoring
      const ourDist = geoDistance(this.config.ownZone, destinationZone);
      const peerDist = geoDistance(peer.geoZone, destinationZone);

      // Proximity score: peer closer to destination = higher score
      if (peerDist < ourDist) {
        // Peer is closer - great!
        breakdown.proximityScore = 100 * (1 - peerDist / ourDist);
        reason = `Peer ${Math.round(ourDist - peerDist)}km closer to destination`;
      } else if (peerDist === 0) {
        // Peer IS in destination zone!
        breakdown.proximityScore = 100;
        reason = 'Peer is in destination zone!';
      } else {
        // Peer is further - penalize
        breakdown.proximityScore = Math.max(0, 50 - (peerDist - ourDist) / 100);
        reason = `Peer ${Math.round(peerDist - ourDist)}km further from destination`;
      }

      // Direction score: peer on path = bonus
      if (isOnPath(peer.geoZone, this.config.ownZone, destinationZone)) {
        breakdown.directionScore = 100;
        reason += ', on path';
      } else {
        breakdown.directionScore = 30;
      }
    }

    // Connectivity score: more connected peers = better relay
    breakdown.connectivityScore = Math.min(peer.knownPeers * 5, 100);

    // Load score: overloaded peers = worse relay
    const loadRatio = peer.messageCount / this.config.maxPeerLoad;
    breakdown.loadScore = Math.max(0, 100 - loadRatio * 100);

    // Courier bonus
    if (peer.isCourier) {
      breakdown.courierScore = this.config.courierBonus;
      reason += ', courier';
    }

    // Transport score
    const transportScores: Record<string, number> = {
      'webrtc': 80,       // Fast, reliable
      'wifi-direct': 70,  // Good bandwidth
      'bluetooth': 50,    // Limited bandwidth
      'lora': 90,         // Long range
      'meshtastic': 95,   // Long range + mesh
    };
    breakdown.transportScore = transportScores[peer.transportType] || 50;

    // Calculate weighted total
    const total =
      breakdown.proximityScore * this.config.proximityWeight +
      breakdown.directionScore * this.config.directionWeight +
      breakdown.connectivityScore * this.config.connectivityWeight +
      breakdown.loadScore * this.config.loadWeight +
      breakdown.courierScore +
      breakdown.transportScore * 0.1; // Small transport weight

    return {
      peerId: peer.peerId,
      score: Math.round(total),
      breakdown,
      reason,
    };
  }

  /**
   * Select best peers for relaying a message
   */
  selectRelayPeers(
    availablePeers: PeerGeoInfo[],
    destinationZone: GeoZone | undefined,
    maxPeers: number = 3
  ): PeerScore[] {
    // Score all peers
    const scores = availablePeers.map(peer =>
      this.scorePeerForMessage(peer, destinationZone)
    );

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Return top N
    return scores.slice(0, maxPeers);
  }

  /**
   * Check if a peer is a good relay for a destination
   */
  isGoodRelay(
    peer: PeerGeoInfo,
    destinationZone: GeoZone | undefined,
    minScore: number = 50
  ): boolean {
    const score = this.scorePeerForMessage(peer, destinationZone);
    return score.score >= minScore;
  }

  /**
   * Get routing statistics for debugging
   */
  getRoutingStats(
    peers: PeerGeoInfo[],
    destinationZone: GeoZone | undefined
  ): {
    totalPeers: number;
    peersWithZone: number;
    goodRelays: number;
    bestScore: number;
    averageScore: number;
    preferredDirection: string;
  } {
    const scores = peers.map(p => this.scorePeerForMessage(p, destinationZone));

    const goodRelays = scores.filter(s => s.score >= 50).length;
    const bestScore = Math.max(...scores.map(s => s.score), 0);
    const averageScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      : 0;

    const hint = this.calculateRoute(undefined, destinationZone);

    return {
      totalPeers: peers.length,
      peersWithZone: peers.filter(p => p.geoZone).length,
      goodRelays,
      bestScore,
      averageScore: Math.round(averageScore),
      preferredDirection: hint.preferredDirection,
    };
  }
}

/**
 * Create a geo router instance
 */
export function createGeoRouter(config?: Partial<GeoRouterConfig>): GeoRouter {
  return new GeoRouter(config);
}
