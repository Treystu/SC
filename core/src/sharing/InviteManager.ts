/**
 * InviteManager - Manages the lifecycle of invite codes
 * 
 * Responsibilities:
 * - Generate cryptographically secure invite codes
 * - Store and manage pending invites
 * - Validate and redeem invite codes
 * - Handle invite expiration
 */

import { randomBytes } from '@noble/hashes/utils.js';

import { signMessage, verifySignature } from '../crypto/primitives.js';
import { InviteOptions, PendingInvite, InviteRedemptionResult, Contact } from './types.js';

const DEFAULT_INVITE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export class InviteManager {
  private invites: Map<string, PendingInvite> = new Map();
  private peerId: string;
  private publicKey: Uint8Array;
  private privateKey: Uint8Array;
  private displayName?: string;

  constructor(
    peerId: string,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    displayName?: string
  ) {
    this.peerId = peerId;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.displayName = displayName || 'User';
  }

  /**
   * Generate a cryptographically secure invite code
   * Uses 32 random bytes encoded as hex for 64-character code
   */
  private async generateSecureCode(): Promise<string> {
    const randomData = randomBytes(32);
    return Array.from(randomData)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Get bootstrap peers for the invite
   * This would typically come from the mesh network
   * For now, returns an empty array as a placeholder
   */
  private getBootstrapPeers(): string[] {
    // In a real implementation, this would query the mesh network
    // for a list of known, reliable peers to help the invitee connect
    return [];
  }

  /**
   * Create a new invite code
   */
  async createInvite(options?: InviteOptions): Promise<PendingInvite> {
    const code = await this.generateSecureCode();
    const createdAt = Date.now();
    const ttl = options?.ttl || DEFAULT_INVITE_TTL;
    const expiresAt = createdAt + ttl;

    // Sign the invite code to prove authenticity
    const codeBytes = new TextEncoder().encode(code);
    const signature = signMessage(codeBytes, this.privateKey);

    const invite: PendingInvite = {
      code,
      inviterPeerId: this.peerId,
      inviterPublicKey: this.publicKey,
      inviterName: this.displayName,
      createdAt,
      expiresAt,
      signature,
      bootstrapPeers: this.getBootstrapPeers(),
      metadata: options?.metadata ? { ...options.metadata } : undefined,
    };

    this.invites.set(code, invite);
    return invite;
  }

  /**
   * Validate an invite code
   * Checks if the code exists, is not expired, and has a valid signature
   */
  async validateInvite(code: string): Promise<{ valid: boolean; error?: string; invite?: PendingInvite }> {
    const invite = this.invites.get(code);

    if (!invite) {
      return { valid: false, error: 'Invalid invite code' };
    }

    if (invite.expiresAt <= Date.now()) {
      return { valid: false, error: 'Invite expired' };
    }

    // Verify signature
    const codeBytes = new TextEncoder().encode(code);
    const isValidSignature = verifySignature(codeBytes, invite.signature, invite.inviterPublicKey);

    if (!isValidSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, invite };
  }

  /**
   * Redeem an invite code
   * Validates the code and creates a contact entry for the inviter
   */
  async redeemInvite(code: string, _recipientPeerId: string): Promise<InviteRedemptionResult> {
    const validation = await this.validateInvite(code);

    if (!validation.valid || !validation.invite) {
      throw new Error(validation.error || 'Invalid invite code');
    }

    const invite = validation.invite;

    // Create contact from invite
    const contact: Contact = {
      peerId: invite.inviterPeerId,
      publicKey: invite.inviterPublicKey,
      name: invite.inviterName,
      addedVia: 'invite',
      addedAt: Date.now(),
      verified: true, // Auto-verified through invite signature
    };

    // Mark invite as used by removing it
    this.invites.delete(code);

    return {
      contact,
      inviterPeerId: invite.inviterPeerId,
      success: true,
    };
  }

  /**
   * Get an invite by code
   */
  getInvite(code: string): PendingInvite | undefined {
    return this.invites.get(code);
  }

  /**
   * Get all pending invites
   */
  getAllInvites(): PendingInvite[] {
    return Array.from(this.invites.values());
  }

  /**
   * Clean up expired invites
   * Returns the number of invites removed
   */
  cleanupExpiredInvites(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [code, invite] of this.invites.entries()) {
      if (invite.expiresAt <= now) {
        this.invites.delete(code);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Revoke a specific invite code
   */
  revokeInvite(code: string): boolean {
    return this.invites.delete(code);
  }

  /**
   * Revoke all pending invites
   */
  revokeAllInvites(): number {
    const count = this.invites.size;
    this.invites.clear();
    return count;
  }

  /**
   * Get the number of pending invites
   */
  getPendingInviteCount(): number {
    return this.invites.size;
  }
}
