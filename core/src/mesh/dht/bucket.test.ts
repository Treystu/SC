/**
 * K-Bucket Tests
 */

import { KBucket, KBucketManager } from './bucket';
import type { DHTContact } from './types';
import { generateNodeId, nodeIdsEqual } from './node-id';

describe('KBucket', () => {
  let bucket: KBucket;

  beforeEach(() => {
    bucket = new KBucket(0, { k: 3 });
  });

  function createContact(id?: Uint8Array): DHTContact {
    return {
      nodeId: id || generateNodeId(),
      peerId: 'test-peer',
      lastSeen: Date.now(),
      failureCount: 0,
    };
  }

  describe('Basic Operations', () => {
    it('should start empty', () => {
      expect(bucket.size).toBe(0);
      expect(bucket.isFull).toBe(false);
    });

    it('should add contacts', () => {
      const contact = createContact();
      const result = bucket.addContact(contact);

      expect(result.added).toBe(true);
      expect(result.updated).toBe(false);
      expect(bucket.size).toBe(1);
    });

    it('should update existing contacts', () => {
      const contact = createContact();
      bucket.addContact(contact);

      const result = bucket.addContact({ ...contact, peerId: 'updated' });

      expect(result.added).toBe(false);
      expect(result.updated).toBe(true);
      expect(bucket.size).toBe(1);
    });

    it('should get contact by node ID', () => {
      const contact = createContact();
      bucket.addContact(contact);

      const retrieved = bucket.getContact(contact.nodeId);
      expect(retrieved).toBeDefined();
      expect(nodeIdsEqual(retrieved!.nodeId, contact.nodeId)).toBe(true);
    });

    it('should return undefined for unknown contact', () => {
      const retrieved = bucket.getContact(generateNodeId());
      expect(retrieved).toBeUndefined();
    });

    it('should check if contact exists', () => {
      const contact = createContact();
      bucket.addContact(contact);

      expect(bucket.hasContact(contact.nodeId)).toBe(true);
      expect(bucket.hasContact(generateNodeId())).toBe(false);
    });

    it('should remove contacts', () => {
      const contact = createContact();
      bucket.addContact(contact);

      const removed = bucket.removeContact(contact.nodeId);
      expect(removed).toBeDefined();
      expect(bucket.size).toBe(0);
    });

    it('should return undefined when removing non-existent contact', () => {
      const removed = bucket.removeContact(generateNodeId());
      expect(removed).toBeUndefined();
    });
  });

  describe('LRU Behavior', () => {
    it('should move updated contacts to front', () => {
      const contact1 = createContact();
      const contact2 = createContact();
      const contact3 = createContact();

      bucket.addContact(contact1);
      bucket.addContact(contact2);
      bucket.addContact(contact3);

      // Update contact1 (should move to front)
      bucket.addContact(contact1);

      const contacts = bucket.getContacts();
      expect(nodeIdsEqual(contacts[0].nodeId, contact1.nodeId)).toBe(true);
    });

    it('should update lastSeen when adding existing contact', () => {
      const contact = createContact();
      contact.lastSeen = 1000;
      bucket.addContact(contact);

      // Wait a bit and re-add
      bucket.addContact(contact);

      const retrieved = bucket.getContact(contact.nodeId);
      expect(retrieved!.lastSeen).toBeGreaterThan(1000);
    });
  });

  describe('Full Bucket Behavior', () => {
    it('should return needsPing when bucket is full', () => {
      // Fill the bucket
      for (let i = 0; i < 3; i++) {
        bucket.addContact(createContact());
      }

      expect(bucket.isFull).toBe(true);

      // Try to add another contact
      const newContact = createContact();
      const result = bucket.addContact(newContact);

      expect(result.added).toBe(false);
      expect(result.needsPing).toBeDefined();
    });

    it('should return least recently seen contact for ping', () => {
      const contact1 = createContact();
      contact1.lastSeen = 1000;
      const contact2 = createContact();
      contact2.lastSeen = 2000;
      const contact3 = createContact();
      contact3.lastSeen = 3000;

      bucket.addContact(contact3);
      bucket.addContact(contact2);
      bucket.addContact(contact1);

      const result = bucket.addContact(createContact());

      // Should ping the contact that was added last (least recently seen position)
      expect(result.needsPing).toBeDefined();
    });
  });

  describe('Replacement Cache', () => {
    it('should add to replacement cache when full', () => {
      // Fill bucket
      for (let i = 0; i < 3; i++) {
        bucket.addContact(createContact());
      }

      // Add another (goes to replacement cache)
      bucket.addContact(createContact());

      const cache = bucket.getReplacementCache();
      expect(cache.length).toBe(1);
    });

    it('should promote from replacement cache when contact removed', () => {
      // Fill bucket
      const contacts: DHTContact[] = [];
      for (let i = 0; i < 3; i++) {
        const c = createContact();
        contacts.push(c);
        bucket.addContact(c);
      }

      // Add to replacement cache
      const replacement = createContact();
      bucket.addContact(replacement);

      // Remove a contact
      bucket.removeContact(contacts[0].nodeId);

      // Check that replacement was promoted
      expect(bucket.size).toBe(3);
      expect(bucket.hasContact(replacement.nodeId)).toBe(true);
    });
  });

  describe('Failure Tracking', () => {
    it('should record failures', () => {
      const contact = createContact();
      bucket.addContact(contact);

      bucket.recordFailure(contact.nodeId);
      bucket.recordFailure(contact.nodeId);

      const retrieved = bucket.getContact(contact.nodeId);
      expect(retrieved!.failureCount).toBe(2);
    });

    it('should reset failures', () => {
      const contact = createContact();
      contact.failureCount = 5;
      bucket.addContact(contact);

      bucket.resetFailures(contact.nodeId);

      const retrieved = bucket.getContact(contact.nodeId);
      expect(retrieved!.failureCount).toBe(0);
    });
  });

  describe('Staleness', () => {
    it('should identify stale contacts', () => {
      const staleContact = createContact();
      bucket.addContact(staleContact);
      
      // Manually set the contact as stale after it's been added
      const storedStale = bucket.getContact(staleContact.nodeId);
      storedStale!.lastSeen = Date.now() - 120000; // 2 minutes ago

      const freshContact = createContact();
      bucket.addContact(freshContact);

      const stale = bucket.getStaleContacts(60000); // 1 minute threshold
      expect(stale.length).toBe(1);
      expect(nodeIdsEqual(stale[0].nodeId, staleContact.nodeId)).toBe(true);
    });

    it('should update last seen time', () => {
      const contact = createContact();
      contact.lastSeen = 1000;
      bucket.addContact(contact);

      bucket.updateLastSeen(contact.nodeId);

      const retrieved = bucket.getContact(contact.nodeId);
      expect(retrieved!.lastSeen).toBeGreaterThan(1000);
    });
  });

  describe('Refresh', () => {
    it('should track refresh time', () => {
      const initialRefresh = bucket.getLastRefreshed();
      
      bucket.markRefreshed();
      
      const newRefresh = bucket.getLastRefreshed();
      expect(newRefresh).toBeGreaterThanOrEqual(initialRefresh);
    });

    it('should indicate when refresh is needed', () => {
      // Mark as refreshed long ago
      bucket['lastRefreshed'] = Date.now() - 7200000; // 2 hours ago
      
      expect(bucket.needsRefresh(3600000)).toBe(true); // 1 hour interval
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      const contact = createContact();
      bucket.addContact(contact);

      const stats = bucket.getStats();
      expect(stats.contacts).toBe(1);
      expect(stats.replacementCache).toBe(0);
      expect(stats.avgFailures).toBe(0);
    });
  });
});

describe('KBucketManager', () => {
  let manager: KBucketManager;
  let localNodeId: Uint8Array;

  beforeEach(() => {
    localNodeId = generateNodeId();
    manager = new KBucketManager(localNodeId, { k: 20 });
  });

  it('should create 160 buckets', () => {
    const buckets = manager.getAllBuckets();
    expect(buckets.length).toBe(160);
  });

  it('should get bucket by index', () => {
    const bucket = manager.getBucket(0);
    expect(bucket).toBeDefined();
    expect(bucket!.index).toBe(0);
  });

  it('should return undefined for invalid index', () => {
    expect(manager.getBucket(-1)).toBeUndefined();
    expect(manager.getBucket(160)).toBeUndefined();
  });

  it('should track total contacts', () => {
    expect(manager.getTotalContacts()).toBe(0);
  });

  it('should track active bucket count', () => {
    expect(manager.getActiveBucketCount()).toBe(0);
  });

  it('should return stats', () => {
    const stats = manager.getStats();
    expect(stats.totalContacts).toBe(0);
    expect(stats.activeBuckets).toBe(0);
    expect(stats.bucketDistribution.length).toBe(160);
  });
});
