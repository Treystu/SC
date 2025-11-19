/**
 * Types and interfaces for the sharing and invite system
 */

export interface InviteOptions {
  ttl?: number; // Time-to-live in milliseconds
  metadata?: Record<string, unknown>;
}

export interface PendingInvite {
  code: string;
  inviterPeerId: string;
  inviterPublicKey: Uint8Array;
  inviterName?: string;
  createdAt: number;
  expiresAt: number;
  signature: Uint8Array;
  bootstrapPeers: string[];
  metadata?: Record<string, unknown>;
}

export interface SharePayload {
  version: string;
  inviteCode: string;
  inviterPeerId: string;
  signature: Uint8Array;
  bootstrapPeers: string[];
  timestamp: number;
}

export interface Contact {
  peerId: string;
  publicKey: Uint8Array;
  name?: string;
  addedVia: 'invite' | 'manual' | 'discovery';
  addedAt: number;
  verified: boolean;
}

export interface InviteRedemptionResult {
  contact: Contact;
  inviterPeerId: string;
  success: boolean;
}
