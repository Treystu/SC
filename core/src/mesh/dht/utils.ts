/**
 * DHT Utility Functions
 * 
 * Helper functions for integrating DHT with the existing mesh networking layer,
 * including conversion between Peer and DHTContact formats.
 */

import type { NodeId, DHTContact, DHTKey, DHTEndpoint } from './types.js';
import type { Peer } from '../routing.js';
import { nodeIdFromPublicKey, generateDHTKey, nodeIdToHex } from './node-id.js';

/**
 * Convert a Peer to a DHTContact
 * 
 * @param peer - Mesh network peer
 * @returns DHT contact representation
 */
export function peerToDHTContact(peer: Peer): DHTContact {
  const nodeId = nodeIdFromPublicKey(peer.publicKey);
  
  // Extract address information based on transport type
  // For bluetooth/local transports, preserve address if available
  let address: string | undefined = undefined;
  if ((peer.transportType === 'bluetooth' || peer.transportType === 'local') && 
      'address' in peer && typeof (peer as any).address === 'string') {
    address = (peer as any).address;
  }
  
  const endpoints: DHTEndpoint[] = [{
    type: peer.transportType,
    address,
  }];
  
  return {
    nodeId,
    peerId: peer.id,
    lastSeen: peer.lastSeen,
    failureCount: peer.metadata.failureCount,
    endpoints,
    rtt: undefined,
  };
}

/**
 * Convert multiple Peers to DHTContacts
 * 
 * @param peers - Array of mesh network peers
 * @returns Array of DHT contacts
 */
export function peersToDHTContacts(peers: Peer[]): DHTContact[] {
  return peers.map(peerToDHTContact);
}

/**
 * Generate a DHT key from a peer ID
 * 
 * @param peerId - Hex-encoded peer ID
 * @returns DHT key for lookup
 */
export function peerIdToDHTKey(peerId: string): DHTKey {
  return generateDHTKey(peerId);
}

/**
 * Convert a public key to a DHT node ID
 * 
 * This is the primary way to derive a node ID from a peer's identity.
 * 
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns 160-bit DHT node ID
 */
export function publicKeyToNodeId(publicKey: Uint8Array): NodeId {
  return nodeIdFromPublicKey(publicKey);
}

/**
 * Convert a DHTContact back to basic Peer info
 * 
 * Note: This creates a minimal peer representation since DHTContact
 * doesn't contain all Peer fields. Additional fields should be
 * populated by the caller.
 * 
 * @param contact - DHT contact
 * @param publicKey - Optional public key if known
 * @returns Partial peer information
 */
export function dhtContactToPeerInfo(
  contact: DHTContact,
  publicKey?: Uint8Array
): {
  id: string;
  publicKey?: Uint8Array;
  lastSeen: number;
  transportType: 'webrtc' | 'bluetooth' | 'local';
} {
  // Determine transport type from endpoints
  const transportType = contact.endpoints?.[0]?.type ?? 'webrtc';
  
  return {
    id: contact.peerId,
    publicKey,
    lastSeen: contact.lastSeen,
    transportType: transportType as 'webrtc' | 'bluetooth' | 'local',
  };
}

/**
 * Create a DHT key for storing peer metadata
 * 
 * @param namespace - Namespace for the key (e.g., 'peer-info', 'capabilities')
 * @param peerId - Peer identifier
 * @returns DHT key for storage
 */
export function createMetadataKey(namespace: string, peerId: string): DHTKey {
  const combined = `${namespace}:${peerId}`;
  return generateDHTKey(combined);
}

/**
 * Check if a peer has the minimum required info for DHT
 * 
 * @param peer - Peer to validate
 * @returns True if peer can be used in DHT
 */
export function isValidDHTPeer(peer: Peer): boolean {
  return (
    peer.publicKey instanceof Uint8Array &&
    peer.publicKey.length === 32 &&
    typeof peer.id === 'string' &&
    peer.id.length > 0
  );
}

/**
 * Convert node ID to peer ID format
 * 
 * @param nodeId - DHT node ID
 * @returns Hex-encoded peer ID
 */
export function nodeIdToPeerId(nodeId: NodeId): string {
  return nodeIdToHex(nodeId);
}

/**
 * Estimate network size from bucket distribution
 * 
 * Uses Kademlia's bucket distribution to estimate total network size.
 * This is based on the observation that bucket i should contain approximately
 * 2^i nodes in a uniform network.
 * 
 * @param bucketDistribution - Array of contact counts per bucket
 * @returns Estimated network size (capped at 10 billion)
 */
export function estimateNetworkSize(bucketDistribution: number[], k: number = 20): number {
  let estimate = 0;
  const MAX_REALISTIC_NETWORK_SIZE = 10_000_000_000; // 10 billion nodes
  
  for (let i = 0; i < bucketDistribution.length; i++) {
    const contacts = bucketDistribution[i];
    if (contacts > 0) {
      // Bucket i represents nodes at distance 2^(159-i) to 2^(160-i)
      // If we have contacts in this bucket, estimate there are
      // (contacts / k) * 2^(160-i) nodes in that range
      const exponent = 160 - i;
      
      // Skip very large buckets to prevent overflow
      if (exponent > 30) {
        continue;
      }
      
      const bucketSize = Math.pow(2, exponent);
      const contribution = (contacts / k) * bucketSize;
      
      // Cap at max to prevent overflow
      if (estimate + contribution > MAX_REALISTIC_NETWORK_SIZE) {
        estimate = MAX_REALISTIC_NETWORK_SIZE;
        break;
      }
      
      estimate += contribution;
    }
  }
  
  return Math.min(estimate, MAX_REALISTIC_NETWORK_SIZE);
}

/**
 * Calculate network health score
 * 
 * @param stats - DHT statistics
 * @param minNodes - Minimum nodes for healthy network
 * @param maxLatency - Maximum acceptable latency
 * @returns Health score from 0-100
 */
export function calculateHealthScore(
  stats: { nodeCount: number; avgLookupTime: number; successfulLookups: number; totalLookups: number },
  minNodes: number = 10,
  maxLatency: number = 1000
): number {
  let score = 0;
  
  // Node count (40 points max)
  const nodeRatio = Math.min(stats.nodeCount / minNodes, 1);
  score += nodeRatio * 40;
  
  // Latency (30 points max)
  const latencyScore = Math.max(0, 1 - stats.avgLookupTime / maxLatency);
  score += latencyScore * 30;
  
  // Success rate (30 points max)
  const successRate = stats.totalLookups > 0
    ? stats.successfulLookups / stats.totalLookups
    : 0;
  score += successRate * 30;
  
  return Math.round(Math.min(score, 100));
}
