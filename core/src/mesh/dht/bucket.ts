/**
 * K-Bucket Implementation for Kademlia DHT
 * 
 * Each K-bucket stores up to k contacts for a specific distance range
 * from the local node. Implements LRU eviction and staleness checking.
 */

import type { DHTContact, NodeId, KBucketConfig } from './types.js';
import { nodeIdsEqual, copyNodeId } from './node-id.js';

/** Default K-bucket configuration */
const DEFAULT_BUCKET_CONFIG: KBucketConfig = {
  k: 20,
  pingTimeout: 5000,
  alpha: 3,
};

/**
 * K-Bucket - stores contacts within a specific XOR distance range
 */
export class KBucket {
  /** Maximum number of contacts in this bucket */
  readonly k: number;
  
  /** Contacts stored in this bucket (ordered by last seen, most recent first) */
  private contacts: DHTContact[] = [];
  
  /** Replacement cache for contacts that couldn't be added */
  private replacementCache: DHTContact[] = [];
  
  /** Maximum size of replacement cache */
  private readonly maxReplacementCacheSize: number;
  
  /** Last time this bucket was refreshed */
  private lastRefreshed: number = Date.now();
  
  /** Bucket index (for debugging/logging) */
  readonly index: number;

  constructor(index: number, config: Partial<KBucketConfig> = {}) {
    this.index = index;
    this.k = config.k ?? DEFAULT_BUCKET_CONFIG.k;
    this.maxReplacementCacheSize = Math.ceil(this.k / 2);
  }

  /**
   * Get the number of contacts in this bucket
   */
  get size(): number {
    return this.contacts.length;
  }

  /**
   * Check if the bucket is full
   */
  get isFull(): boolean {
    return this.contacts.length >= this.k;
  }

  /**
   * Get all contacts in this bucket
   */
  getContacts(): DHTContact[] {
    return [...this.contacts];
  }

  /**
   * Get a contact by node ID
   */
  getContact(nodeId: NodeId): DHTContact | undefined {
    return this.contacts.find(c => nodeIdsEqual(c.nodeId, nodeId));
  }

  /**
   * Check if a contact exists in this bucket
   */
  hasContact(nodeId: NodeId): boolean {
    return this.contacts.some(c => nodeIdsEqual(c.nodeId, nodeId));
  }

  /**
   * Add or update a contact in the bucket
   * 
   * @param contact - Contact to add
   * @returns Object indicating result: added, updated, or needs ping check
   */
  addContact(contact: DHTContact): {
    added: boolean;
    updated: boolean;
    needsPing?: DHTContact;
  } {
    // Check if contact already exists
    const existingIndex = this.contacts.findIndex(c => 
      nodeIdsEqual(c.nodeId, contact.nodeId)
    );

    if (existingIndex !== -1) {
      // Update existing contact and move to front (most recently seen)
      const existing = this.contacts[existingIndex];
      this.contacts.splice(existingIndex, 1);
      this.contacts.unshift({
        ...existing,
        ...contact,
        lastSeen: Date.now(),
        nodeId: copyNodeId(contact.nodeId),
      });
      return { added: false, updated: true };
    }

    // Contact is new
    if (!this.isFull) {
      // Bucket has space, add the contact
      this.contacts.unshift({
        ...contact,
        lastSeen: Date.now(),
        nodeId: copyNodeId(contact.nodeId),
      });
      return { added: true, updated: false };
    }

    // Bucket is full - need to ping least recently seen contact
    const leastRecent = this.contacts[this.contacts.length - 1];
    
    // Add to replacement cache for potential later use
    this.addToReplacementCache(contact);
    
    return {
      added: false,
      updated: false,
      needsPing: leastRecent,
    };
  }

  /**
   * Add contact to replacement cache
   */
  private addToReplacementCache(contact: DHTContact): void {
    // Remove if already exists
    const existingIndex = this.replacementCache.findIndex(c =>
      nodeIdsEqual(c.nodeId, contact.nodeId)
    );
    if (existingIndex !== -1) {
      this.replacementCache.splice(existingIndex, 1);
    }

    // Add to front
    this.replacementCache.unshift({
      ...contact,
      nodeId: copyNodeId(contact.nodeId),
    });

    // Trim if over capacity
    if (this.replacementCache.length > this.maxReplacementCacheSize) {
      this.replacementCache.pop();
    }
  }

  /**
   * Remove a contact from the bucket
   * 
   * @param nodeId - Node ID of contact to remove
   * @returns The removed contact, or undefined if not found
   */
  removeContact(nodeId: NodeId): DHTContact | undefined {
    const index = this.contacts.findIndex(c => nodeIdsEqual(c.nodeId, nodeId));
    if (index === -1) return undefined;

    const [removed] = this.contacts.splice(index, 1);

    // Try to promote from replacement cache
    if (this.replacementCache.length > 0) {
      const replacement = this.replacementCache.shift()!;
      this.contacts.push(replacement);
    }

    return removed;
  }

  /**
   * Update a contact's last seen time
   */
  updateLastSeen(nodeId: NodeId): boolean {
    const index = this.contacts.findIndex(c => nodeIdsEqual(c.nodeId, nodeId));
    if (index === -1) return false;

    // Splice out, update timestamp, and move to front - more efficient than filter
    const [contact] = this.contacts.splice(index, 1);
    contact.lastSeen = Date.now();
    this.contacts.unshift(contact);
    return true;
  }

  /**
   * Record a failed contact attempt
   */
  recordFailure(nodeId: NodeId): void {
    const contact = this.contacts.find(c => nodeIdsEqual(c.nodeId, nodeId));
    if (contact) {
      contact.failureCount++;
    }
  }

  /**
   * Reset failure count for a contact
   */
  resetFailures(nodeId: NodeId): void {
    const contact = this.contacts.find(c => nodeIdsEqual(c.nodeId, nodeId));
    if (contact) {
      contact.failureCount = 0;
    }
  }

  /**
   * Get the least recently seen contact
   */
  getLeastRecentlySeen(): DHTContact | undefined {
    return this.contacts.length > 0 
      ? this.contacts[this.contacts.length - 1] 
      : undefined;
  }

  /**
   * Get stale contacts (not seen within timeout)
   */
  getStaleContacts(staleThresholdMs: number): DHTContact[] {
    const cutoff = Date.now() - staleThresholdMs;
    return this.contacts.filter(c => c.lastSeen < cutoff);
  }

  /**
   * Replace a stale contact with one from replacement cache
   */
  replaceStaleContact(staleNodeId: NodeId): DHTContact | undefined {
    if (this.replacementCache.length === 0) return undefined;

    const removed = this.removeContact(staleNodeId);
    if (removed) {
      // The removeContact method already promotes from replacement cache
      return this.contacts.find(c => !nodeIdsEqual(c.nodeId, staleNodeId));
    }
    return undefined;
  }

  /**
   * Get the last refresh time
   */
  getLastRefreshed(): number {
    return this.lastRefreshed;
  }

  /**
   * Mark the bucket as refreshed
   */
  markRefreshed(): void {
    this.lastRefreshed = Date.now();
  }

  /**
   * Check if bucket needs refresh
   */
  needsRefresh(refreshIntervalMs: number): boolean {
    return Date.now() - this.lastRefreshed > refreshIntervalMs;
  }

  /**
   * Clear all contacts from the bucket
   */
  clear(): void {
    this.contacts = [];
    this.replacementCache = [];
  }

  /**
   * Get replacement cache contacts
   */
  getReplacementCache(): DHTContact[] {
    return [...this.replacementCache];
  }

  /**
   * Get bucket statistics
   */
  getStats(): {
    contacts: number;
    replacementCache: number;
    avgLastSeen: number;
    avgFailures: number;
  } {
    const now = Date.now();
    
    const avgLastSeen = this.contacts.length > 0
      ? this.contacts.reduce((sum, c) => sum + (now - c.lastSeen), 0) / this.contacts.length
      : 0;
    
    const avgFailures = this.contacts.length > 0
      ? this.contacts.reduce((sum, c) => sum + c.failureCount, 0) / this.contacts.length
      : 0;

    return {
      contacts: this.contacts.length,
      replacementCache: this.replacementCache.length,
      avgLastSeen,
      avgFailures,
    };
  }
}

/**
 * K-Bucket Manager - manages all k-buckets for a node
 */
export class KBucketManager {
  /** All k-buckets indexed by distance prefix length */
  private buckets: KBucket[];
  
  /** Local node ID */
  readonly localNodeId: NodeId;
  
  /** K parameter */
  readonly k: number;

  constructor(localNodeId: NodeId, config: Partial<KBucketConfig> = {}) {
    this.localNodeId = copyNodeId(localNodeId);
    this.k = config.k ?? DEFAULT_BUCKET_CONFIG.k;
    
    // Create 160 buckets (one for each possible prefix length)
    this.buckets = Array.from(
      { length: 160 },
      (_, i) => new KBucket(i, config)
    );
  }

  /**
   * Get a specific bucket by index
   */
  getBucket(index: number): KBucket | undefined {
    return this.buckets[index];
  }

  /**
   * Get all buckets
   */
  getAllBuckets(): KBucket[] {
    return [...this.buckets];
  }

  /**
   * Get all contacts from all buckets
   */
  getAllContacts(): DHTContact[] {
    return this.buckets.flatMap(bucket => bucket.getContacts());
  }

  /**
   * Get total number of contacts
   */
  getTotalContacts(): number {
    return this.buckets.reduce((sum, bucket) => sum + bucket.size, 0);
  }

  /**
   * Get number of non-empty buckets
   */
  getActiveBucketCount(): number {
    return this.buckets.filter(bucket => bucket.size > 0).length;
  }

  /**
   * Get buckets that need refresh
   */
  getBucketsNeedingRefresh(refreshIntervalMs: number): KBucket[] {
    return this.buckets.filter(bucket => 
      bucket.size > 0 && bucket.needsRefresh(refreshIntervalMs)
    );
  }

  /**
   * Get overall statistics
   */
  getStats(): {
    totalContacts: number;
    activeBuckets: number;
    bucketDistribution: number[];
    avgContactsPerBucket: number;
  } {
    const bucketDistribution = this.buckets.map(b => b.size);
    const activeBuckets = bucketDistribution.filter(s => s > 0).length;
    const totalContacts = bucketDistribution.reduce((a, b) => a + b, 0);
    
    return {
      totalContacts,
      activeBuckets,
      bucketDistribution,
      avgContactsPerBucket: activeBuckets > 0 ? totalContacts / activeBuckets : 0,
    };
  }
}
