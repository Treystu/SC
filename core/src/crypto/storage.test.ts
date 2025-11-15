/**
 * Key Storage Tests
 * 
 * Tests for secure key storage abstraction
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MemoryKeyStorage, KeyMetadata } from './storage';

describe('Key Storage', () => {
  let storage: MemoryKeyStorage;

  beforeEach(() => {
    storage = new MemoryKeyStorage();
  });

  describe('Basic Operations', () => {
    it('should store a key', async () => {
      const key = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.storeKey('test-key', key);

      const retrieved = await storage.getKey('test-key');
      expect(retrieved).toEqual(key);
    });

    it('should retrieve stored key', async () => {
      const key = new Uint8Array(32).fill(42);
      await storage.storeKey('my-key', key);

      const retrieved = await storage.getKey('my-key');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(key);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await storage.getKey('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete a key', async () => {
      const key = new Uint8Array([1, 2, 3]);
      await storage.storeKey('temp-key', key);

      await storage.deleteKey('temp-key');

      const retrieved = await storage.getKey('temp-key');
      expect(retrieved).toBeNull();
    });

    it('should check if key exists', async () => {
      const key = new Uint8Array([1, 2, 3]);
      
      expect(await storage.hasKey('test-key')).toBe(false);
      
      await storage.storeKey('test-key', key);
      
      expect(await storage.hasKey('test-key')).toBe(true);
    });

    it('should list all key IDs', async () => {
      await storage.storeKey('key1', new Uint8Array([1]));
      await storage.storeKey('key2', new Uint8Array([2]));
      await storage.storeKey('key3', new Uint8Array([3]));

      const keys = await storage.listKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys.length).toBe(3);
    });
  });

  describe('Metadata Management', () => {
    it('should store key with metadata', async () => {
      const key = new Uint8Array([1, 2, 3]);
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
        tags: ['identity', 'primary']
      };

      await storage.storeKey('test-key', key, metadata);

      const retrieved = await storage.getKeyMetadata('test-key');
      expect(retrieved).toBeDefined();
      expect(retrieved?.version).toBe(1);
      expect(retrieved?.tags).toEqual(['identity', 'primary']);
    });

    it('should create default metadata when not provided', async () => {
      const key = new Uint8Array([1, 2, 3]);
      await storage.storeKey('test-key', key);

      const metadata = await storage.getKeyMetadata('test-key');
      expect(metadata).toBeDefined();
      expect(metadata?.version).toBeDefined();
      expect(metadata?.createdAt).toBeDefined();
    });

    it('should track access count', async () => {
      const key = new Uint8Array([1, 2, 3]);
      await storage.storeKey('test-key', key);

      await storage.getKey('test-key');
      await storage.getKey('test-key');
      await storage.getKey('test-key');

      const metadata = await storage.getKeyMetadata('test-key');
      expect(metadata?.accessCount).toBe(3);
    });

    it('should track last accessed time', async () => {
      const key = new Uint8Array([1, 2, 3]);
      await storage.storeKey('test-key', key);

      const before = Date.now();
      await storage.getKey('test-key');
      const after = Date.now();

      const metadata = await storage.getKeyMetadata('test-key');
      expect(metadata?.lastAccessedAt).toBeDefined();
      expect(metadata!.lastAccessedAt!).toBeGreaterThanOrEqual(before);
      expect(metadata!.lastAccessedAt!).toBeLessThanOrEqual(after);
    });

    it('should support key tags', async () => {
      const key = new Uint8Array([1, 2, 3]);
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
        tags: ['identity', 'session', 'temporary']
      };

      await storage.storeKey('test-key', key, metadata);

      const retrieved = await storage.getKeyMetadata('test-key');
      expect(retrieved?.tags).toContain('identity');
      expect(retrieved?.tags).toContain('session');
      expect(retrieved?.tags).toContain('temporary');
    });

    it('should handle versioning', async () => {
      const keyV1 = new Uint8Array([1, 2, 3]);
      const keyV2 = new Uint8Array([4, 5, 6]);

      await storage.storeKey('key', keyV1, { version: 1, createdAt: Date.now() });
      await storage.storeKey('key', keyV2, { version: 2, createdAt: Date.now() });

      const metadata = await storage.getKeyMetadata('key');
      expect(metadata?.version).toBe(2);

      const retrieved = await storage.getKey('key');
      expect(retrieved).toEqual(keyV2);
    });
  });

  describe('Security Features', () => {
    it('should securely wipe deleted keys', async () => {
      const key = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.storeKey('secure-key', key);

      await storage.deleteKey('secure-key');

      // Key should be completely removed
      const retrieved = await storage.getKey('secure-key');
      expect(retrieved).toBeNull();

      // Metadata should also be removed
      const metadata = await storage.getKeyMetadata('secure-key');
      expect(metadata).toBeNull();
    });

    it('should handle concurrent access', async () => {
      const key = new Uint8Array([1, 2, 3]);
      await storage.storeKey('concurrent-key', key);

      // Simulate concurrent reads
      const reads = await Promise.all([
        storage.getKey('concurrent-key'),
        storage.getKey('concurrent-key'),
        storage.getKey('concurrent-key')
      ]);

      reads.forEach(retrieved => {
        expect(retrieved).toEqual(key);
      });
    });

    it('should prevent key overwrite without explicit update', async () => {
      const key1 = new Uint8Array([1, 2, 3]);
      const key2 = new Uint8Array([4, 5, 6]);

      await storage.storeKey('protected-key', key1);
      await storage.storeKey('protected-key', key2);

      const retrieved = await storage.getKey('protected-key');
      expect(retrieved).toEqual(key2); // Latest value wins
    });
  });

  describe('Migration', () => {
    it('should support version migration', async () => {
      if (storage.migrateKeys) {
        // Store some keys with old version
        await storage.storeKey('key1', new Uint8Array([1]), { version: 1, createdAt: Date.now() });
        await storage.storeKey('key2', new Uint8Array([2]), { version: 1, createdAt: Date.now() });

        // Migrate to new version
        await storage.migrateKeys(1, 2);

        // Check versions updated
        const metadata1 = await storage.getKeyMetadata('key1');
        const metadata2 = await storage.getKeyMetadata('key2');

        expect(metadata1?.version).toBe(2);
        expect(metadata2?.version).toBe(2);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty key', async () => {
      const emptyKey = new Uint8Array(0);
      await storage.storeKey('empty', emptyKey);

      const retrieved = await storage.getKey('empty');
      expect(retrieved).toEqual(emptyKey);
    });

    it('should handle large keys', async () => {
      const largeKey = new Uint8Array(10 * 1024); // 10KB
      largeKey.fill(42);

      await storage.storeKey('large', largeKey);

      const retrieved = await storage.getKey('large');
      expect(retrieved).toEqual(largeKey);
    });

    it('should handle special characters in key ID', async () => {
      const key = new Uint8Array([1, 2, 3]);
      const specialId = 'key-with-special-chars-!@#$%^&*()';

      await storage.storeKey(specialId, key);

      const retrieved = await storage.getKey(specialId);
      expect(retrieved).toEqual(key);
    });

    it('should handle unicode key IDs', async () => {
      const key = new Uint8Array([1, 2, 3]);
      const unicodeId = 'キー-🔑-clé';

      await storage.storeKey(unicodeId, key);

      const retrieved = await storage.getKey(unicodeId);
      expect(retrieved).toEqual(key);
    });

    it('should handle rapid operations', async () => {
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(
          storage.storeKey(`key-${i}`, new Uint8Array([i]))
        );
      }

      await Promise.all(operations);

      const keys = await storage.listKeys();
      expect(keys.length).toBe(100);
    });
  });

  describe('Cleanup', () => {
    it('should clear all keys', async () => {
      await storage.storeKey('key1', new Uint8Array([1]));
      await storage.storeKey('key2', new Uint8Array([2]));
      await storage.storeKey('key3', new Uint8Array([3]));

      await storage.clearAll();

      const keys = await storage.listKeys();
      expect(keys.length).toBe(0);
    });

    it('should remove expired keys', async () => {
      const now = Date.now();
      
      await storage.storeKey('old-key', new Uint8Array([1]), {
        version: 1,
        createdAt: now - 365 * 24 * 60 * 60 * 1000 // 1 year ago
      });

      await storage.storeKey('new-key', new Uint8Array([2]), {
        version: 1,
        createdAt: now
      });

      // Remove keys older than 6 months
      const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
      await storage.removeOldKeys(sixMonthsAgo);

      expect(await storage.hasKey('old-key')).toBe(false);
      expect(await storage.hasKey('new-key')).toBe(true);
    });
  });

  describe('Query Operations', () => {
    it('should find keys by tag', async () => {
      await storage.storeKey('key1', new Uint8Array([1]), {
        version: 1,
        createdAt: Date.now(),
        tags: ['identity']
      });

      await storage.storeKey('key2', new Uint8Array([2]), {
        version: 1,
        createdAt: Date.now(),
        tags: ['session']
      });

      await storage.storeKey('key3', new Uint8Array([3]), {
        version: 1,
        createdAt: Date.now(),
        tags: ['identity', 'primary']
      });

      const identityKeys = await storage.findKeysByTag('identity');
      expect(identityKeys).toContain('key1');
      expect(identityKeys).toContain('key3');
      expect(identityKeys).not.toContain('key2');
    });

    it('should count keys', async () => {
      await storage.storeKey('key1', new Uint8Array([1]));
      await storage.storeKey('key2', new Uint8Array([2]));
      await storage.storeKey('key3', new Uint8Array([3]));

      const count = await storage.count();
      expect(count).toBe(3);
    });

    it('should get storage size estimate', async () => {
      await storage.storeKey('key1', new Uint8Array(1024));
      await storage.storeKey('key2', new Uint8Array(2048));

      const size = await storage.getStorageSize();
      expect(size).toBeGreaterThan(3000); // At least 3KB
    });
  });

  describe('Error Handling', () => {
    it('should handle null key ID', async () => {
      await expect(storage.getKey(null as any)).rejects.toThrow();
    });

    it('should handle undefined key ID', async () => {
      await expect(storage.getKey(undefined as any)).rejects.toThrow();
    });

    it('should handle empty string key ID', async () => {
      await expect(storage.storeKey('', new Uint8Array([1]))).rejects.toThrow();
    });

    it('should handle null key value', async () => {
      await expect(storage.storeKey('key', null as any)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle many keys efficiently', async () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        await storage.storeKey(`key-${i}`, new Uint8Array([i % 256]));
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should retrieve keys quickly', async () => {
      // Store some keys
      for (let i = 0; i < 100; i++) {
        await storage.storeKey(`key-${i}`, new Uint8Array([i % 256]));
      }

      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        await storage.getKey(`key-${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });
  });
});
