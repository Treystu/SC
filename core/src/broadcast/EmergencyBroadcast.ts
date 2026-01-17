/**
 * EmergencyBroadcast - One-to-many emergency alert system
 *
 * Enables trusted individuals to broadcast emergency alerts that
 * propagate through the mesh network. Uses web-of-trust to prevent
 * spam while allowing community-verified broadcasters.
 *
 * Features:
 * - Cryptographically signed alerts
 * - Web-of-trust verification
 * - Geo-scoped propagation
 * - Priority message handling
 * - Alert aggregation to prevent spam
 */

import type { GeoZone } from "../geo/GeoZone.js";

/**
 * Emergency broadcast types
 */
export enum BroadcastType {
  /** Highest priority - immediate danger */
  EMERGENCY = 'emergency',

  /** High priority - important alert */
  ALERT = 'alert',

  /** Normal priority - general announcement */
  ANNOUNCEMENT = 'announcement',

  /** Update to a previous broadcast */
  UPDATE = 'update',

  /** Cancellation of previous alert */
  ALL_CLEAR = 'all_clear',
}

/**
 * Severity levels for emergencies
 */
export enum BroadcastSeverity {
  /** Informational only */
  INFO = 'info',

  /** Warning - potential danger */
  WARNING = 'warning',

  /** Critical - immediate action needed */
  CRITICAL = 'critical',

  /** Life-threatening - evacuate/shelter */
  LIFE_THREATENING = 'life_threatening',
}

/**
 * Trust levels for web-of-trust
 */
export enum TrustLevel {
  /** Unknown - not in trust network */
  UNKNOWN = 0,

  /** Third degree - friend of friend of friend */
  THIRD_DEGREE = 1,

  /** Second degree - friend of friend */
  SECOND_DEGREE = 2,

  /** Direct - personally verified */
  DIRECT = 3,
}

/**
 * An attestation from a trusted peer
 */
export interface BroadcastAttestation {
  /** ID of the attesting peer */
  attesterId: string;

  /** Display name of attester */
  attesterName: string;

  /** Signature over the broadcast ID */
  signature: Uint8Array;

  /** When the attestation was made */
  attestedAt: number;

  /** Trust level of the attester (from our perspective) */
  trustLevel: TrustLevel;
}

/**
 * An emergency broadcast message
 */
export interface EmergencyBroadcast {
  /** Unique broadcast ID */
  id: string;

  /** Broadcast type */
  type: BroadcastType;

  /** Severity level */
  severity: BroadcastSeverity;

  /** Short title (max 100 chars) */
  title: string;

  /** Full message body */
  body: string;

  /** Optional action URL */
  actionUrl?: string;

  /** Optional image hash (content-addressed) */
  imageHash?: string;

  /** Broadcaster's peer ID */
  broadcasterId: string;

  /** Broadcaster's display name */
  broadcasterName: string;

  /** Ed25519 signature of the broadcast */
  signature: Uint8Array;

  /** Web-of-trust attestations */
  attestations: BroadcastAttestation[];

  /** Target geographic zones (empty = global) */
  targetZones: string[];

  /** Radius in km (0 = exact zones only) */
  radiusKm: number;

  /** When the broadcast was created */
  createdAt: number;

  /** When the broadcast expires */
  expiresAt: number;

  /** ID of broadcast this supersedes (for updates) */
  supersedes?: string;

  /** Current hop count */
  hopCount: number;

  /** Maximum allowed hops */
  maxHops: number;
}

/**
 * Configuration for broadcast system
 */
export interface BroadcastConfig {
  /** Maximum broadcasts per sender per hour */
  maxPerSenderPerHour: number;

  /** Maximum broadcasts per zone per hour */
  maxPerZonePerHour: number;

  /** Minimum trust level to relay */
  minTrustToRelay: TrustLevel;

  /** Minimum trust level to display */
  minTrustToDisplay: TrustLevel;

  /** Number of spam reports to block sender */
  spamReportsToBlock: number;

  /** Default broadcast TTL (ms) */
  defaultTTL: number;

  /** Maximum broadcast TTL (ms) */
  maxTTL: number;
}

/**
 * Default broadcast configuration
 */
export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  maxPerSenderPerHour: 3,
  maxPerZonePerHour: 10,
  minTrustToRelay: TrustLevel.THIRD_DEGREE,
  minTrustToDisplay: TrustLevel.UNKNOWN, // Display all, but show trust level
  spamReportsToBlock: 5,
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Create a new emergency broadcast
 */
export function createEmergencyBroadcast(
  type: BroadcastType,
  severity: BroadcastSeverity,
  title: string,
  body: string,
  broadcasterId: string,
  broadcasterName: string,
  options: {
    targetZones?: string[];
    radiusKm?: number;
    ttl?: number;
    maxHops?: number;
    actionUrl?: string;
    imageHash?: string;
    supersedes?: string;
  } = {}
): Omit<EmergencyBroadcast, 'id' | 'signature'> {
  const now = Date.now();

  return {
    type,
    severity,
    title: title.substring(0, 100),
    body,
    broadcasterId,
    broadcasterName,
    attestations: [],
    targetZones: options.targetZones ?? [],
    radiusKm: options.radiusKm ?? 0,
    createdAt: now,
    expiresAt: now + (options.ttl ?? DEFAULT_BROADCAST_CONFIG.defaultTTL),
    hopCount: 0,
    maxHops: options.maxHops ?? 50,
    actionUrl: options.actionUrl,
    imageHash: options.imageHash,
    supersedes: options.supersedes,
  };
}

/**
 * Generate broadcast ID from content
 */
export function generateBroadcastId(broadcast: Omit<EmergencyBroadcast, 'id' | 'signature'>): string {
  // Create deterministic ID from content
  const content = JSON.stringify({
    type: broadcast.type,
    title: broadcast.title,
    body: broadcast.body,
    broadcasterId: broadcast.broadcasterId,
    createdAt: broadcast.createdAt,
  });

  // Simple hash for now
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash;
  }

  return `bc_${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

/**
 * Get data to sign for a broadcast
 */
export function getBroadcastSigningData(broadcast: EmergencyBroadcast): Uint8Array {
  const data = JSON.stringify({
    id: broadcast.id,
    type: broadcast.type,
    severity: broadcast.severity,
    title: broadcast.title,
    body: broadcast.body,
    broadcasterId: broadcast.broadcasterId,
    targetZones: broadcast.targetZones,
    createdAt: broadcast.createdAt,
    expiresAt: broadcast.expiresAt,
  });

  return new TextEncoder().encode(data);
}

/**
 * Check if a broadcast is for a specific zone
 */
export function isForZone(broadcast: EmergencyBroadcast, zone: GeoZone): boolean {
  // Global broadcast (no target zones)
  if (broadcast.targetZones.length === 0) {
    return true;
  }

  // Exact zone match
  if (broadcast.targetZones.includes(zone.zoneId)) {
    return true;
  }

  // TODO: Check radius if specified
  // Would need to calculate distance from zone to target zones

  return false;
}

/**
 * Check if a broadcast has expired
 */
export function isExpired(broadcast: EmergencyBroadcast): boolean {
  return Date.now() > broadcast.expiresAt;
}

/**
 * Check if a broadcast can still propagate
 */
export function canPropagate(broadcast: EmergencyBroadcast): boolean {
  return !isExpired(broadcast) && broadcast.hopCount < broadcast.maxHops;
}

/**
 * Increment hop count for relay
 */
export function incrementHop(broadcast: EmergencyBroadcast): EmergencyBroadcast {
  return {
    ...broadcast,
    hopCount: broadcast.hopCount + 1,
  };
}

/**
 * Get severity display info
 */
export function getSeverityInfo(severity: BroadcastSeverity): {
  label: string;
  color: string;
  icon: string;
} {
  switch (severity) {
    case BroadcastSeverity.INFO:
      return { label: 'Info', color: '#0066cc', icon: 'ℹ️' };
    case BroadcastSeverity.WARNING:
      return { label: 'Warning', color: '#ff9900', icon: '⚠️' };
    case BroadcastSeverity.CRITICAL:
      return { label: 'Critical', color: '#cc0000', icon: '🚨' };
    case BroadcastSeverity.LIFE_THREATENING:
      return { label: 'LIFE THREATENING', color: '#990000', icon: '☠️' };
  }
}

/**
 * Get trust level display info
 */
export function getTrustInfo(level: TrustLevel): {
  label: string;
  description: string;
  color: string;
} {
  switch (level) {
    case TrustLevel.UNKNOWN:
      return {
        label: 'Unknown',
        description: 'This broadcaster is not in your trust network',
        color: '#999999',
      };
    case TrustLevel.THIRD_DEGREE:
      return {
        label: 'Third Degree',
        description: 'Trusted by someone trusted by someone you trust',
        color: '#ffcc00',
      };
    case TrustLevel.SECOND_DEGREE:
      return {
        label: 'Second Degree',
        description: 'Trusted by someone you trust',
        color: '#66cc00',
      };
    case TrustLevel.DIRECT:
      return {
        label: 'Directly Trusted',
        description: 'You have personally verified this broadcaster',
        color: '#00cc00',
      };
  }
}
