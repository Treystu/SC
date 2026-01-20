/**
 * Peer ID Utilities
 * Centralized functions for extracting and normalizing peer IDs
 */

/** Length of peer ID in characters (8 bytes = 16 hex chars) */
export const PEER_ID_LENGTH = 16;

/**
 * Extract peer ID from a Uint8Array public key or sender ID
 * @param bytes - Public key or sender ID bytes
 * @returns Uppercase hex string of first 8 bytes (16 characters)
 */
export function extractPeerId(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.substring(0, PEER_ID_LENGTH).toUpperCase();
}

/**
 * Normalize a peer ID to uppercase with whitespace removed
 * @param peerId - Peer ID string to normalize
 * @returns Normalized uppercase peer ID
 */
export function normalizePeerId(peerId: string): string {
  return peerId.replace(/\s/g, "").toUpperCase();
}

/**
 * Compare two peer IDs for equality (case-insensitive, whitespace-insensitive)
 * @param peerId1 - First peer ID
 * @param peerId2 - Second peer ID
 * @returns true if peer IDs match
 */
export function peerIdsEqual(peerId1: string, peerId2: string): boolean {
  return normalizePeerId(peerId1) === normalizePeerId(peerId2);
}
