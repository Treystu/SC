/**
 * BroadcastManager - Manages emergency broadcast lifecycle
 *
 * Handles:
 * - Creating and signing broadcasts
 * - Verifying received broadcasts
 * - Spam prevention and rate limiting
 * - Propagation control
 * - Local storage and display
 */

import type {
  EmergencyBroadcast,
  BroadcastAttestation,
  BroadcastConfig,
} from "./EmergencyBroadcast.js";
import {
  BroadcastType,
  BroadcastSeverity,
  TrustLevel,
  DEFAULT_BROADCAST_CONFIG,
  createEmergencyBroadcast,
  generateBroadcastId,
  getBroadcastSigningData,
  isExpired,
  canPropagate,
  incrementHop,
} from "./EmergencyBroadcast.js";
import type { TrustGraph } from "./TrustGraph.js";
import type { GeoZone } from "../geo/GeoZone.js";

/**
 * Verification result for a broadcast
 */
export interface VerificationResult {
  /** Overall validity */
  valid: boolean;

  /** Signature is cryptographically valid */
  signatureValid: boolean;

  /** Trust level of the broadcaster */
  senderTrustLevel: TrustLevel;

  /** Number of attestations */
  attestationCount: number;

  /** Highest trust level among attestations */
  highestAttestationTrust: TrustLevel;

  /** Reasons for the result */
  reasons: string[];
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * BroadcastManager handles the complete broadcast lifecycle
 */
export class BroadcastManager {
  private trustGraph: TrustGraph;
  private config: BroadcastConfig;
  private signFunc: (data: Uint8Array) => Promise<Uint8Array>;
  private verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>;
  private getPublicKey: (peerId: string) => Promise<Uint8Array | null>;

  private localPeerId: string;
  private localGeoZone?: GeoZone;

  /** Stored broadcasts */
  private broadcasts: Map<string, EmergencyBroadcast> = new Map();

  /** Seen broadcast IDs (for dedup) */
  private seenIds: Set<string> = new Set();

  /** Rate limit tracking by sender */
  private senderRateLimits: Map<string, RateLimitEntry> = new Map();

  /** Rate limit tracking by zone */
  private zoneRateLimits: Map<string, RateLimitEntry> = new Map();

  /** Spam reports by sender */
  private spamReports: Map<string, number> = new Map();

  /** Blocked senders */
  private blockedSenders: Set<string> = new Set();

  /** Callbacks for new broadcasts */
  private onBroadcastCallbacks: ((broadcast: EmergencyBroadcast, trustLevel: TrustLevel) => void)[] = [];

  constructor(
    localPeerId: string,
    trustGraph: TrustGraph,
    signFunc: (data: Uint8Array) => Promise<Uint8Array>,
    verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>,
    getPublicKey: (peerId: string) => Promise<Uint8Array | null>,
    config: Partial<BroadcastConfig> = {}
  ) {
    this.localPeerId = localPeerId;
    this.trustGraph = trustGraph;
    this.signFunc = signFunc;
    this.verifyFunc = verifyFunc;
    this.getPublicKey = getPublicKey;
    this.config = { ...DEFAULT_BROADCAST_CONFIG, ...config };
  }

  /**
   * Set local geographic zone
   */
  setLocalZone(zone: GeoZone): void {
    this.localGeoZone = zone;
  }

  /**
   * Create and sign a new broadcast
   */
  async createBroadcast(
    type: BroadcastType,
    severity: BroadcastSeverity,
    title: string,
    body: string,
    options: {
      targetZones?: string[];
      radiusKm?: number;
      ttl?: number;
      maxHops?: number;
      actionUrl?: string;
      supersedes?: string;
    } = {}
  ): Promise<EmergencyBroadcast> {
    // Create broadcast template
    const template = createEmergencyBroadcast(
      type,
      severity,
      title,
      body,
      this.localPeerId,
      'Local User', // Would get from identity
      options
    );

    // Generate ID
    const id = generateBroadcastId(template);

    // Create full broadcast
    const broadcast: EmergencyBroadcast = {
      ...template,
      id,
      signature: new Uint8Array(0), // Will be filled
    };

    // Sign the broadcast
    const signingData = getBroadcastSigningData(broadcast);
    broadcast.signature = await this.signFunc(signingData);

    // Store locally
    this.broadcasts.set(id, broadcast);
    this.seenIds.add(id);

    console.log(`[BroadcastManager] Created broadcast ${id}: ${title}`);

    return broadcast;
  }

  /**
   * Add an attestation to a broadcast
   */
  async attestBroadcast(broadcastId: string): Promise<BroadcastAttestation> {
    // Sign the broadcast ID
    const idBytes = new TextEncoder().encode(broadcastId);
    const signature = await this.signFunc(idBytes);

    const attestation: BroadcastAttestation = {
      attesterId: this.localPeerId,
      attesterName: 'Local User',
      signature,
      attestedAt: Date.now(),
      trustLevel: TrustLevel.DIRECT,
    };

    // Add to broadcast if we have it
    const broadcast = this.broadcasts.get(broadcastId);
    if (broadcast) {
      broadcast.attestations.push(attestation);
    }

    return attestation;
  }

  /**
   * Verify a received broadcast
   */
  async verifyBroadcast(broadcast: EmergencyBroadcast): Promise<VerificationResult> {
    const reasons: string[] = [];
    let signatureValid = false;

    // Get broadcaster's public key
    const publicKey = await this.getPublicKey(broadcast.broadcasterId);

    if (!publicKey) {
      reasons.push('Broadcaster public key not found');
    } else {
      // Verify signature
      try {
        const signingData = getBroadcastSigningData(broadcast);
        signatureValid = await this.verifyFunc(signingData, broadcast.signature, publicKey);

        if (!signatureValid) {
          reasons.push('Invalid signature');
        }
      } catch (err) {
        reasons.push(`Signature verification error: ${err}`);
      }
    }

    // Get sender trust level
    const senderTrustLevel = this.trustGraph.getTrustLevel(broadcast.broadcasterId);

    if (senderTrustLevel === TrustLevel.UNKNOWN) {
      reasons.push('Broadcaster not in trust network');
    }

    // Check attestations
    let highestAttestationTrust = TrustLevel.UNKNOWN;
    for (const attestation of broadcast.attestations) {
      const attesterTrust = this.trustGraph.getTrustLevel(attestation.attesterId);
      if (attesterTrust > highestAttestationTrust) {
        highestAttestationTrust = attesterTrust;
      }
    }

    if (broadcast.attestations.length > 0) {
      reasons.push(`${broadcast.attestations.length} attestations, highest trust: ${highestAttestationTrust}`);
    }

    // Determine overall validity
    const valid = signatureValid && (
      senderTrustLevel >= this.config.minTrustToRelay ||
      highestAttestationTrust >= this.config.minTrustToRelay
    );

    return {
      valid,
      signatureValid,
      senderTrustLevel,
      attestationCount: broadcast.attestations.length,
      highestAttestationTrust,
      reasons,
    };
  }

  /**
   * Process a received broadcast
   */
  async processBroadcast(broadcast: EmergencyBroadcast): Promise<{
    accepted: boolean;
    shouldRelay: boolean;
    shouldDisplay: boolean;
    reason: string;
  }> {
    // Check if already seen
    if (this.seenIds.has(broadcast.id)) {
      return {
        accepted: false,
        shouldRelay: false,
        shouldDisplay: false,
        reason: 'Already seen',
      };
    }

    // Check if expired
    if (isExpired(broadcast)) {
      return {
        accepted: false,
        shouldRelay: false,
        shouldDisplay: false,
        reason: 'Expired',
      };
    }

    // Check if sender is blocked
    if (this.blockedSenders.has(broadcast.broadcasterId)) {
      return {
        accepted: false,
        shouldRelay: false,
        shouldDisplay: false,
        reason: 'Sender is blocked',
      };
    }

    // Check rate limits
    if (!this.checkRateLimit(broadcast)) {
      return {
        accepted: false,
        shouldRelay: false,
        shouldDisplay: false,
        reason: 'Rate limit exceeded',
      };
    }

    // Verify broadcast
    const verification = await this.verifyBroadcast(broadcast);

    if (!verification.signatureValid) {
      return {
        accepted: false,
        shouldRelay: false,
        shouldDisplay: false,
        reason: 'Invalid signature',
      };
    }

    // Mark as seen
    this.seenIds.add(broadcast.id);

    // Store broadcast
    this.broadcasts.set(broadcast.id, broadcast);

    // Determine if we should relay
    const shouldRelay =
      canPropagate(broadcast) &&
      (verification.senderTrustLevel >= this.config.minTrustToRelay ||
       verification.highestAttestationTrust >= this.config.minTrustToRelay);

    // Determine if we should display
    const shouldDisplay = verification.senderTrustLevel >= this.config.minTrustToDisplay;

    // Notify listeners
    if (shouldDisplay) {
      for (const callback of this.onBroadcastCallbacks) {
        try {
          callback(broadcast, verification.senderTrustLevel);
        } catch (err) {
          console.error('[BroadcastManager] Callback error:', err);
        }
      }
    }

    return {
      accepted: true,
      shouldRelay,
      shouldDisplay,
      reason: shouldRelay ? 'Verified and trusted' : 'Verified but not trusted for relay',
    };
  }

  /**
   * Get broadcast for relay (with incremented hop)
   */
  prepareForRelay(broadcastId: string): EmergencyBroadcast | null {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || !canPropagate(broadcast)) {
      return null;
    }

    return incrementHop(broadcast);
  }

  /**
   * Report a broadcast as spam
   */
  reportSpam(broadcastId: string): void {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast) return;

    const senderId = broadcast.broadcasterId;
    const currentReports = (this.spamReports.get(senderId) ?? 0) + 1;
    this.spamReports.set(senderId, currentReports);

    if (currentReports >= this.config.spamReportsToBlock) {
      this.blockedSenders.add(senderId);
      console.log(`[BroadcastManager] Blocked sender ${senderId} after ${currentReports} spam reports`);
    }
  }

  /**
   * Get all broadcasts for a zone
   */
  getBroadcastsForZone(zone: GeoZone): EmergencyBroadcast[] {
    return Array.from(this.broadcasts.values()).filter(b =>
      !isExpired(b) && this.isForZone(b, zone)
    );
  }

  /**
   * Get all active broadcasts
   */
  getActiveBroadcasts(): EmergencyBroadcast[] {
    return Array.from(this.broadcasts.values()).filter(b => !isExpired(b));
  }

  /**
   * Register callback for new broadcasts
   */
  onBroadcast(callback: (broadcast: EmergencyBroadcast, trustLevel: TrustLevel) => void): void {
    this.onBroadcastCallbacks.push(callback);
  }

  /**
   * Prune expired broadcasts
   */
  pruneExpired(): number {
    const toDelete: string[] = [];

    for (const [id, broadcast] of this.broadcasts) {
      if (isExpired(broadcast)) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.broadcasts.delete(id);
    }

    return toDelete.length;
  }

  /**
   * Get broadcast statistics
   */
  getStats(): {
    totalBroadcasts: number;
    activeBroadcasts: number;
    blockedSenders: number;
    seenIds: number;
  } {
    return {
      totalBroadcasts: this.broadcasts.size,
      activeBroadcasts: this.getActiveBroadcasts().length,
      blockedSenders: this.blockedSenders.size,
      seenIds: this.seenIds.size,
    };
  }

  // ============== Private Methods ==============

  private checkRateLimit(broadcast: EmergencyBroadcast): boolean {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;

    // Check sender rate limit
    const senderLimit = this.senderRateLimits.get(broadcast.broadcasterId);
    if (senderLimit) {
      if (senderLimit.windowStart > hourAgo) {
        if (senderLimit.count >= this.config.maxPerSenderPerHour) {
          return false;
        }
        senderLimit.count++;
      } else {
        senderLimit.count = 1;
        senderLimit.windowStart = now;
      }
    } else {
      this.senderRateLimits.set(broadcast.broadcasterId, {
        count: 1,
        windowStart: now,
      });
    }

    // Check zone rate limits
    for (const zone of broadcast.targetZones) {
      const zoneLimit = this.zoneRateLimits.get(zone);
      if (zoneLimit) {
        if (zoneLimit.windowStart > hourAgo) {
          if (zoneLimit.count >= this.config.maxPerZonePerHour) {
            return false;
          }
          zoneLimit.count++;
        } else {
          zoneLimit.count = 1;
          zoneLimit.windowStart = now;
        }
      } else {
        this.zoneRateLimits.set(zone, {
          count: 1,
          windowStart: now,
        });
      }
    }

    return true;
  }

  private isForZone(broadcast: EmergencyBroadcast, zone: GeoZone): boolean {
    // Global broadcast
    if (broadcast.targetZones.length === 0) {
      return true;
    }

    // Check zone match
    return broadcast.targetZones.includes(zone.zoneId);
  }
}

/**
 * Create a broadcast manager instance
 */
export function createBroadcastManager(
  localPeerId: string,
  trustGraph: TrustGraph,
  signFunc: (data: Uint8Array) => Promise<Uint8Array>,
  verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>,
  getPublicKey: (peerId: string) => Promise<Uint8Array | null>,
  config?: Partial<BroadcastConfig>
): BroadcastManager {
  return new BroadcastManager(localPeerId, trustGraph, signFunc, verifyFunc, getPublicKey, config);
}
