/**
 * Node ID Utilities for Kademlia DHT
 * 
 * Provides 160-bit node ID generation, XOR distance calculation,
 * and related utilities for the DHT implementation.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import type { NodeId, DHTKey } from './types.js';

/** Node ID size in bytes (160 bits) */
export const NODE_ID_BYTES = 20;

/** Node ID size in bits */
export const NODE_ID_BITS = NODE_ID_BYTES * 8;

/**
 * Generate a random node ID
 * @returns A new random 160-bit node ID
 */
export function generateNodeId(): NodeId {
  const nodeId = new Uint8Array(NODE_ID_BYTES);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(nodeId);
  } else {
    // Fallback for environments without crypto API
    for (let i = 0; i < NODE_ID_BYTES; i++) {
      nodeId[i] = Math.floor(Math.random() * 256);
    }
  }
  return nodeId;
}

/**
 * Generate a node ID from a public key
 * Uses SHA-256 truncated to 160 bits for consistent ID generation
 * 
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns 160-bit node ID derived from the public key
 */
export function nodeIdFromPublicKey(publicKey: Uint8Array): NodeId {
  const hash = sha256(publicKey);
  return hash.slice(0, NODE_ID_BYTES);
}

/**
 * Generate a DHT key from arbitrary data
 * Uses SHA-256 truncated to 160 bits
 * 
 * @param data - Arbitrary data to hash
 * @returns 160-bit DHT key
 */
export function generateDHTKey(data: Uint8Array | string): DHTKey {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = sha256(input);
  return hash.slice(0, NODE_ID_BYTES);
}

/**
 * Calculate XOR distance between two node IDs
 * 
 * @param a - First node ID
 * @param b - Second node ID
 * @returns XOR distance as Uint8Array (same size as input)
 */
export function xorDistance(a: NodeId, b: NodeId): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`Node ID length mismatch: ${a.length} vs ${b.length}`);
  }
  
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Compare two XOR distances
 * 
 * @param a - First distance
 * @param b - Second distance
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDistance(a: Uint8Array, b: Uint8Array): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const aVal = i < a.length ? a[i] : 0;
    const bVal = i < b.length ? b[i] : 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

/**
 * Check if distance a is less than distance b
 */
export function isCloser(a: Uint8Array, b: Uint8Array): boolean {
  return compareDistance(a, b) < 0;
}

/**
 * Find the bucket index for a given XOR distance
 * The bucket index is the position of the first set bit (0-indexed from MSB)
 * 
 * @param distance - XOR distance between two node IDs
 * @returns Bucket index (0 to NODE_ID_BITS - 1), or -1 if distance is zero
 */
export function bucketIndexFromDistance(distance: Uint8Array): number {
  for (let i = 0; i < distance.length; i++) {
    if (distance[i] !== 0) {
      // Find position of highest set bit in this byte
      const byte = distance[i];
      const bitPos = 7 - Math.floor(Math.log2(byte));
      return i * 8 + bitPos;
    }
  }
  return -1; // Distance is zero (same node ID)
}

/**
 * Calculate bucket index for a target node relative to local node
 * 
 * @param localId - Local node's ID
 * @param targetId - Target node's ID
 * @returns Bucket index (0 to NODE_ID_BITS - 1)
 */
export function getBucketIndex(localId: NodeId, targetId: NodeId): number {
  const distance = xorDistance(localId, targetId);
  return bucketIndexFromDistance(distance);
}

/**
 * Convert node ID to hexadecimal string
 */
export function nodeIdToHex(nodeId: NodeId): string {
  return Array.from(nodeId)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hexadecimal string to node ID
 */
export function hexToNodeId(hex: string): NodeId {
  if (hex.length !== NODE_ID_BYTES * 2) {
    throw new Error(`Invalid hex string length: expected ${NODE_ID_BYTES * 2}, got ${hex.length}`);
  }
  
  const nodeId = new Uint8Array(NODE_ID_BYTES);
  for (let i = 0; i < NODE_ID_BYTES; i++) {
    nodeId[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return nodeId;
}

/**
 * Check if two node IDs are equal
 */
export function nodeIdsEqual(a: NodeId, b: NodeId): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Validate a node ID
 */
export function isValidNodeId(nodeId: unknown): nodeId is NodeId {
  return (
    nodeId instanceof Uint8Array &&
    nodeId.length === NODE_ID_BYTES
  );
}

/**
 * Create a copy of a node ID
 */
export function copyNodeId(nodeId: NodeId): NodeId {
  return new Uint8Array(nodeId);
}

/**
 * Sort contacts by distance to a target node ID
 * 
 * @param contacts - Array of objects with nodeId property
 * @param targetId - Target node ID to measure distance from
 * @returns New array sorted by distance (closest first)
 */
export function sortByDistance<T extends { nodeId: NodeId }>(
  contacts: T[],
  targetId: NodeId
): T[] {
  return [...contacts].sort((a, b) => {
    const distA = xorDistance(a.nodeId, targetId);
    const distB = xorDistance(b.nodeId, targetId);
    return compareDistance(distA, distB);
  });
}

/**
 * Get the n closest contacts to a target
 * 
 * @param contacts - Array of contacts
 * @param targetId - Target node ID
 * @param n - Maximum number of contacts to return
 * @returns Array of up to n closest contacts
 */
export function getClosestContacts<T extends { nodeId: NodeId }>(
  contacts: T[],
  targetId: NodeId,
  n: number
): T[] {
  const sorted = sortByDistance(contacts, targetId);
  return sorted.slice(0, n);
}

/**
 * Generate a random node ID within a specific bucket's range
 * Useful for bucket refresh operations
 * 
 * @param localId - Local node's ID
 * @param bucketIndex - Target bucket index
 * @returns Random node ID that would fall into the specified bucket
 */
export function generateIdInBucket(localId: NodeId, bucketIndex: number): NodeId {
  if (bucketIndex < 0 || bucketIndex >= NODE_ID_BITS) {
    throw new Error(`Invalid bucket index: ${bucketIndex}`);
  }

  const result = generateNodeId();
  
  // Copy local ID bits up to the bucket index
  const byteIndex = Math.floor(bucketIndex / 8);
  const bitIndex = bucketIndex % 8;
  
  // Copy bytes before the target byte
  for (let i = 0; i < byteIndex; i++) {
    result[i] = localId[i];
  }
  
  // Handle the target byte - keep bits before the target, flip the target bit
  const mask = 0x80 >> bitIndex; // Mask for the target bit
  const prefixMask = (0xFF << (8 - bitIndex)) & 0xFF; // Mask for prefix bits
  
  // Keep prefix bits same as local, flip target bit, randomize suffix
  result[byteIndex] = (localId[byteIndex] & prefixMask) | // Keep prefix
                      (mask ^ (localId[byteIndex] & mask)) | // Flip target bit
                      (result[byteIndex] & (~prefixMask & ~mask & 0xFF)); // Random suffix
  
  return result;
}
