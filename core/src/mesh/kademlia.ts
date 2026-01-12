/**
 * Kademlia DHT Implementation
 * 
 * This file contains the core logic for the Kademlia Distributed Hash Table,
 * including the distance metric, k-bucket management, and peer lookup.
 */

import type { Peer } from './routing.js';
import { hexToBytes } from "../utils/encoding.js";

const K = 20; // Kademlia constant for bucket size
const ID_LENGTH = 256; // Peer ID length in bits

/**
 * Calculates the XOR distance between two peer IDs.
 * 
 * @param id1 The first peer ID (hex string).
 * @param id2 The second peer ID (hex string).
 * @returns The XOR distance as a BigInt.
 */
export function xorDistance(id1: string, id2: string): bigint {
  const norm1 = id1.replace(/\s/g, "").toLowerCase();
  const norm2 = id2.replace(/\s/g, "").toLowerCase();

  // Ensure both are even-length hex strings before decoding.
  const hex1 = norm1.length % 2 === 0 ? norm1 : `0${norm1}`;
  const hex2 = norm2.length % 2 === 0 ? norm2 : `0${norm2}`;

  const bytes1 = hexToBytes(hex1);
  const bytes2 = hexToBytes(hex2);

  const len = Math.max(bytes1.length, bytes2.length);

  // Left-pad to equal lengths.
  const a = new Uint8Array(len);
  const b = new Uint8Array(len);
  a.set(bytes1, len - bytes1.length);
  b.set(bytes2, len - bytes2.length);

  let out = 0n;
  for (let i = 0; i < len; i++) {
    out = (out << 8n) | BigInt((a[i] ^ b[i]) & 0xff);
  }
  return out;
}

/**
 * A K-Bucket stores a list of peers that are a certain distance from the local node.
 */
export class KBucket {
  private peers: Peer[] = [];
  private readonly capacity = K;

  /**
   * Adds a peer to the bucket.
   * 
   * @param peer The peer to add.
   * @returns The evicted peer if the bucket is full, otherwise null.
   */
  add(peer: Peer): Peer | null {
    if (this.peers.find(p => p.id === peer.id)) {
      // Move the existing peer to the end of the list (most recently seen)
      this.peers = this.peers.filter(p => p.id !== peer.id);
      this.peers.push(peer);
      return null;
    }

    if (this.peers.length < this.capacity) {
      this.peers.push(peer);
      return null;
    }

    // If the bucket is full, the oldest peer is a candidate for eviction.
    // In a full implementation, we would ping the oldest peer to see if it's still alive.
    // For now, we'll just evict the oldest.
    const oldest = this.peers.shift();
    this.peers.push(peer);
    return oldest || null;
  }

  /**
   * Removes a peer from the bucket.
   * 
   * @param peerId The ID of the peer to remove.
   */
  remove(peerId: string): void {
    this.peers = this.peers.filter(p => p.id !== peerId);
  }

  /**
   * Gets all peers in the bucket.
   */
  getPeers(): Peer[] {
    return [...this.peers];
  }

  /**
   * Gets the number of peers in the bucket.
   */
  size(): number {
    return this.peers.length;
  }
}

/**
 * The KademliaRoutingTable organizes peers into k-buckets based on their distance
 * from the local node.
 */
export class KademliaRoutingTable {
  public readonly localNodeId: string;
  private readonly buckets: KBucket[] = [];

  constructor(localNodeId: string) {
    this.localNodeId = localNodeId;
    for (let i = 0; i < ID_LENGTH; i++) {
      this.buckets.push(new KBucket());
    }
  }

  /**
   * Gets the appropriate bucket for a given peer ID.
   * 
   * @param peerId The peer ID.
   * @returns The k-bucket for the peer.
   */
  private getBucket(peerId: string): KBucket {
    const distance = xorDistance(this.localNodeId, peerId);
    const index = Math.floor(Math.log2(Number(distance)));
    return this.buckets[index];
  }

  /**
   * Adds a peer to the routing table.
   * 
   * @param peer The peer to add.
   */
  add(peer: Peer): void {
    const bucket = this.getBucket(peer.id);
    bucket.add(peer);
  }

  /**
   * Removes a peer from the routing table.
   * 
   * @param peerId The ID of the peer to remove.
   */
  remove(peerId: string): void {
    const bucket = this.getBucket(peerId);
    bucket.remove(peerId);
  }

  /**
   * Finds the k closest peers to a given target ID.
   * 
   * @param targetId The target ID.
   * @param count The number of peers to return.
   * @returns A list of the closest peers.
   */
  findClosestPeers(targetId: string, count: number = K): Peer[] {
    const allPeers = this.buckets.flatMap(bucket => bucket.getPeers());
    
    allPeers.sort((a, b) => {
      const distA = xorDistance(targetId, a.id);
      const distB = xorDistance(targetId, b.id);
      return distA < distB ? -1 : 1;
    });

    return allPeers.slice(0, count);
  }

  /**
   * Gets all peers in the routing table.
   */
  getAllPeers(): Peer[] {
    return this.buckets.flatMap(bucket => bucket.getPeers());
  }
}