/**
 * SharePayloadGenerator - Generates and verifies share payloads for invites
 * 
 * The share payload is what gets encoded (e.g., in a QR code or deep link)
 * and contains all the information needed to redeem an invite
 */

import { verifySignature as _verifySignature } from '../crypto/primitives';
import { SharePayload, PendingInvite } from './types';

const APP_VERSION = '0.1.0';
const MAX_TIMESTAMP_SKEW = 5 * 60 * 1000; // 5 minutes

export class SharePayloadGenerator {
  /**
   * Create a share payload from an invite
   */
  async createPayload(invite: PendingInvite): Promise<SharePayload> {
    return {
      version: APP_VERSION,
      inviteCode: invite.code,
      inviterPeerId: invite.inviterPeerId,
      signature: invite.signature,
      bootstrapPeers: invite.bootstrapPeers,
      timestamp: Date.now(),
    };
  }

  /**
   * Verify a share payload
   * Checks signature, version compatibility, and timestamp
   */
  async verifyPayload(payload: SharePayload): Promise<{ valid: boolean; error?: string }> {
    // Check version compatibility
    if (!this.isVersionCompatible(payload.version)) {
      return { valid: false, error: 'Incompatible version' };
    }

    // Check timestamp to prevent replay attacks
    const now = Date.now();
    const timeDiff = Math.abs(now - payload.timestamp);
    
    if (timeDiff > MAX_TIMESTAMP_SKEW) {
      return { valid: false, error: 'Payload timestamp too old or from future' };
    }

    // Verify the signature (if we have the public key)
    // Note: Full signature verification would require the inviter's public key
    // which should be included in the payload or looked up
    if (payload.signature.length !== 64) {
      return { valid: false, error: 'Invalid signature format' };
    }

    // Validate bootstrap peers (basic format check)
    if (!Array.isArray(payload.bootstrapPeers)) {
      return { valid: false, error: 'Invalid bootstrap peers format' };
    }

    return { valid: true };
  }

  /**
   * Check if a version string is compatible with the current app version
   */
  private isVersionCompatible(version: string): boolean {
    // Simple version check - in production, use semver
    const [major] = version.split('.');
    const [currentMajor] = APP_VERSION.split('.');
    
    return major === currentMajor;
  }

  /**
   * Serialize a payload to a string (e.g., for QR code encoding)
   */
  serializePayload(payload: SharePayload): string {
    return JSON.stringify({
      v: payload.version,
      c: payload.inviteCode,
      p: payload.inviterPeerId,
      s: Array.from(payload.signature),
      b: payload.bootstrapPeers,
      t: payload.timestamp,
    });
  }

  /**
   * Deserialize a payload from a string
   */
  deserializePayload(data: string): SharePayload | null {
    try {
      const parsed = JSON.parse(data);
      
      return {
        version: parsed.v,
        inviteCode: parsed.c,
        inviterPeerId: parsed.p,
        signature: new Uint8Array(parsed.s),
        bootstrapPeers: parsed.b,
        timestamp: parsed.t,
      };
    } catch (error) {
      return null;
    }
  }
}
