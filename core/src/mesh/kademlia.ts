/**
 * Kademlia DHT Implementation
 * 
 * This file contains the core logic for the Kademlia Distributed Hash Table,
 * including the distance metric, k-bucket management, and peer lookup.
 */

import type { Peer } from './routing.js';

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
  const buf1 = Buffer.from(id1, 'hex');
  const buf2 = Buffer.from(id2, 'hex');
  const result = Buffer.alloc(buf1.length);

  for (let i = 0; i < buf1.length; i++) {
    result[i] = buf1[i] ^ buf2[i];
  }

  return BigInt('0x' + result.toString('hex'));
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