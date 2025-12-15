/**
 * InviteManager - Manages the lifecycle of invite codes
 *
 * Responsibilities:
 * - Generate cryptographically secure invite codes
 * - Store and manage pending invites
 * - Validate and redeem invite codes
 * - Handle invite expiration
 *
 * REFACTOR: Uses Stateless Invites (Self-contained signed payloads)
 */

import { randomBytes } from "@noble/hashes/utils.js";

import { signMessage, verifySignature } from "../crypto/primitives.js";
import { arrayBufferToHex, hexToArrayBuffer } from "../utils.js";
import {
  InviteOptions,
  PendingInvite,
  InviteRedemptionResult,
  Contact,
} from "./types.js";

const DEFAULT_INVITE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

interface InvitePayload {
  pid: string; // Peer ID
  pk: string; // Public Key (Hex)
  n?: string; // Name
  ts: number; // Created At
  exp: number; // Expires At
  nonce: string; // Random Nonce
  bps?: string[]; // Bootstrap Peers
}

export class InviteManager {
  private invites: Map<string, PendingInvite> = new Map();
  private peerId: string;
  private publicKey: Uint8Array;
  private privateKey: Uint8Array;
  private displayName?: string;
  private bootstrapPeers: string[];

  constructor(
    peerId: string,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    displayName?: string,
    bootstrapPeers?: string[],
  ) {
    this.peerId = peerId;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.displayName = displayName || "User";
    this.bootstrapPeers = bootstrapPeers || [];
  }

  /**
   * Helper to base64 encode (Universal)
   */
  private toBase64(str: string): string {
    if (typeof btoa === "function") return btoa(str);
    if (typeof Buffer !== "undefined")
      return Buffer.from(str).toString("base64");
    throw new Error("Base64 encoding not supported");
  }

  /**
   * Helper to base64 decode (Universal)
   */
  private fromBase64(str: string): string {
    if (typeof atob === "function") return atob(str);
    if (typeof Buffer !== "undefined")
      return Buffer.from(str, "base64").toString("utf-8");
    throw new Error("Base64 decoding not supported");
  }

  /**
   * Create a new stateless invite code
   */
  async createInvite(options?: InviteOptions): Promise<PendingInvite> {
    const createdAt = Date.now();
    const ttl = options?.ttl || DEFAULT_INVITE_TTL;
    const expiresAt = createdAt + ttl;
    const nonce = arrayBufferToHex(randomBytes(8).buffer as ArrayBuffer); // randomBytes returns Uint8Array, but type might match if I cast or use .buffer if needed. Actually utils.ts expects ArrayBuffer. randomBytes returns Uint8Array.
    // randomBytes(8).buffer IS an ArrayBuffer.

    const payload: InvitePayload = {
      pid: this.peerId,
      pk: arrayBufferToHex(this.publicKey.buffer as ArrayBuffer),
      n: this.displayName,
      ts: createdAt,
      exp: expiresAt,
      nonce: nonce,
      bps: this.getBootstrapPeers(),
    };

    const payloadStr = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadStr);

    // Sign the payload
    const signature = signMessage(payloadBytes, this.privateKey);
    const signatureHex = arrayBufferToHex(signature.buffer as ArrayBuffer);

    // Construct the code: Base64(Payload) + "." + Hex(Signature)
    const encodedPayload = this.toBase64(payloadStr);
    const code = `${encodedPayload}.${signatureHex}`;

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

    // Store locally for reference (optional)
    this.invites.set(code, invite);
    return invite;
  }

  /**
   * Validate an invite code (Stateless)
   */
  async validateInvite(
    code: string,
  ): Promise<{ valid: boolean; error?: string; invite?: PendingInvite }> {
    try {
      // Split code into Payload and Signature
      const parts = code.split(".");
      if (parts.length !== 2) {
        // Fallback: Check local map (Strictly for legacy/local testing support)
        const localInvite = this.invites.get(code);
        if (localInvite) {
          if (localInvite.expiresAt <= Date.now()) {
            return { valid: false, error: "Invite expired" };
          }
          return { valid: true, invite: localInvite };
        }
        return { valid: false, error: "Invalid invite format" };
      }

      const [encodedPayload, signatureHex] = parts;
      const payloadStr = this.fromBase64(encodedPayload);
      const payload: InvitePayload = JSON.parse(payloadStr);

      // Verify Expiry
      if (payload.exp <= Date.now()) {
        return { valid: false, error: "Invite expired" };
      }

      // Verify Signature
      const payloadBytes = new TextEncoder().encode(payloadStr);
      const signature = hexToArrayBuffer(signatureHex);
      const inviterPublicKey = hexToArrayBuffer(payload.pk);

      const isValidSignature = verifySignature(
        payloadBytes,
        new Uint8Array(signature),
        new Uint8Array(inviterPublicKey),
      );

      if (!isValidSignature) {
        return { valid: false, error: "Invalid signature" };
      }

      // Reconstruct PendingInvite object
      const invite: PendingInvite = {
        code,
        inviterPeerId: payload.pid,
        inviterPublicKey: new Uint8Array(inviterPublicKey),
        inviterName: payload.n,
        createdAt: payload.ts,
        expiresAt: payload.exp,
        signature: new Uint8Array(signature),
        bootstrapPeers: payload.bps || [],
      };

      return { valid: true, invite };
    } catch (e) {
      console.error("Invite validation error:", e);
      return { valid: false, error: "Invalid invite data" };
    }
  }

  /**
   * Redeem an invite code
   */
  async redeemInvite(
    code: string,
    _recipientPeerId: string,
  ): Promise<InviteRedemptionResult> {
    const validation = await this.validateInvite(code);

    if (!validation.valid || !validation.invite) {
      throw new Error(validation.error || "Invalid invite code");
    }

    const invite = validation.invite;

    // Create contact from invite
    const contact: Contact = {
      peerId: invite.inviterPeerId,
      publicKey: invite.inviterPublicKey,
      name: invite.inviterName,
      addedVia: "invite",
      addedAt: Date.now(),
      verified: true, // Auto-verified through invite signature
    };

    // If it was in our local map, remove it (one-time use check?)
    // Stateless invites are technically multi-use unless we blacklist nonces.
    // For now, allow multi-use or simple local cleanup.
    this.invites.delete(code);

    return {
      contact,
      inviterPeerId: invite.inviterPeerId,
      success: true,
    };
  }

  private getBootstrapPeers(): string[] {
    return this.bootstrapPeers;
  }

  // Legacy/Stateful methods

  getInvite(code: string): PendingInvite | undefined {
    return this.invites.get(code);
  }

  getAllInvites(): PendingInvite[] {
    return Array.from(this.invites.values());
  }

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

  revokeInvite(code: string): boolean {
    return this.invites.delete(code);
  }

  revokeAllInvites(): number {
    const count = this.invites.size;
    this.invites.clear();
    return count;
  }

  getPendingInviteCount(): number {
    return this.invites.size;
  }
}
