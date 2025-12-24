/**
 * Types and interfaces for the sharing and invite system
 * 
 * This module defines the core data structures used throughout the invite
 * and contact sharing system.
 */

export interface InviteOptions {
  ttl?: number; // Time-to-live in milliseconds (default: 7 days)
  metadata?: Record<string, unknown>; // Optional custom metadata
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
  // For stateful invites we optionally keep the original payload string
  // so validation can re-run signature checks against stored data.
  payload?: string;
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
