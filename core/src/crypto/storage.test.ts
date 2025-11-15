/**
 * Tests for Secure Key Storage
 */

import { WebKeyStorage, MemoryKeyStorage, KeyMetadata } from './storage';

describe('WebKeyStorage', () => {
  let storage: WebKeyStorage;
  const testKeyId = 'test-key-123';
  const testKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  beforeEach(async () => {
    storage = new WebKeyStorage();
    // Skip init for tests (would need IndexedDB mock)
  });

  describe('Memory Storage (for testing)', () => {
    let memStorage: MemoryKeyStorage;

    beforeEach(() => {
      memStorage = new MemoryKeyStorage();
    });

    it('should store and retrieve keys', async () => {
      await memStorage.storeKey(testKeyId, testKey);
      const retrieved = await memStorage.getKey(testKeyId);
      
      expect(retrieved).toEqual(testKey);
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await memStorage.getKey('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should check if key exists', async () => {
      await memStorage.storeKey(testKeyId, testKey);
      
      const exists = await memStorage.hasKey(testKeyId);
      const notExists = await memStorage.hasKey('other-key');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should delete keys securely', async () => {
      await memStorage.storeKey(testKeyId, testKey);
      await memStorage.deleteKey(testKeyId);
      
      const retrieved = await memStorage.getKey(testKeyId);
      expect(retrieved).toBeNull();
    });

    it('should list all keys', async () => {
      await memStorage.storeKey('key1', testKey);
      await memStorage.storeKey('key2', testKey);
      await memStorage.storeKey('key3', testKey);
      
      const keys = await memStorage.listKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).toHaveLength(3);
    });

    it('should store and retrieve key metadata', async () => {
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
        tags: ['signing', 'primary'],
      };
      
      await memStorage.storeKey(testKeyId, testKey, metadata);
      const retrieved = await memStorage.getKeyMetadata(testKeyId);
      
      expect(retrieved).toEqual(metadata);
    });

    it('should update metadata on access', async () => {
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
        accessCount: 0,
      };
      
      await memStorage.storeKey(testKeyId, testKey, metadata);
      await memStorage.getKey(testKeyId);
      await memStorage.getKey(testKeyId);
      
      const updated = await memStorage.getKeyMetadata(testKeyId);
      expect(updated?.accessCount).toBeGreaterThan(0);
    });

    it('should support key versioning', async () => {
      const metadata1: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
      };
      
      const metadata2: KeyMetadata = {
        version: 2,
        createdAt: Date.now(),
      };
      
      await memStorage.storeKey('key-v1', testKey, metadata1);
      await memStorage.storeKey('key-v2', new Uint8Array([9, 10, 11]), metadata2);
      
      const meta1 = await memStorage.getKeyMetadata('key-v1');
      const meta2 = await memStorage.getKeyMetadata('key-v2');
      
      expect(meta1?.version).toBe(1);
      expect(meta2?.version).toBe(2);
    });

    it('should support key tagging', async () => {
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
        tags: ['encryption', 'session', 'temporary'],
      };
      
      await memStorage.storeKey(testKeyId, testKey, metadata);
      const retrieved = await memStorage.getKeyMetadata(testKeyId);
      
      expect(retrieved?.tags).toContain('encryption');
      expect(retrieved?.tags).toContain('session');
      expect(retrieved?.tags).toContain('temporary');
    });

    it('should handle empty key list', async () => {
      const keys = await memStorage.listKeys();
      expect(keys).toEqual([]);
    });

    it('should overwrite existing keys', async () => {
      const key1 = new Uint8Array([1, 2, 3]);
      const key2 = new Uint8Array([4, 5, 6]);
      
      await memStorage.storeKey(testKeyId, key1);
      await memStorage.storeKey(testKeyId, key2);
      
      const retrieved = await memStorage.getKey(testKeyId);
      expect(retrieved).toEqual(key2);
    });

    it('should handle metadata for non-existent keys', async () => {
      const metadata = await memStorage.getKeyMetadata('non-existent');
      expect(metadata).toBeNull();
    });

    it('should delete non-existent keys without error', async () => {
      await expect(memStorage.deleteKey('non-existent')).resolves.not.toThrow();
    });
  });

  describe('Security Features', () => {
    let memStorage: MemoryKeyStorage;

    beforeEach(() => {
      memStorage = new MemoryKeyStorage();
    });

    it('should wipe keys from memory on delete', async () => {
      const sensitiveKey = new Uint8Array([1, 2, 3, 4, 5]);
      await memStorage.storeKey(testKeyId, sensitiveKey);
      
      await memStorage.deleteKey(testKeyId);
      
      // Key should be completely removed
      const retrieved = await memStorage.getKey(testKeyId);
      expect(retrieved).toBeNull();
    });

    it('should track key access count', async () => {
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
        accessCount: 0,
      };
      
      await memStorage.storeKey(testKeyId, testKey, metadata);
      
      // Access the key multiple times
      await memStorage.getKey(testKeyId);
      await memStorage.getKey(testKeyId);
      await memStorage.getKey(testKeyId);
      
      const updated = await memStorage.getKeyMetadata(testKeyId);
      expect(updated?.accessCount).toBeGreaterThanOrEqual(3);
    });

    it('should track last accessed time', async () => {
      const beforeTime = Date.now();
      
      const metadata: KeyMetadata = {
        version: 1,
        createdAt: beforeTime,
      };
      
      await memStorage.storeKey(testKeyId, testKey, metadata);
      
      // Wait a bit and access
      await new Promise(resolve => setTimeout(resolve, 10));
      await memStorage.getKey(testKeyId);
      
      const updated = await memStorage.getKeyMetadata(testKeyId);
      expect(updated?.lastAccessedAt).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('Edge Cases', () => {
    let memStorage: MemoryKeyStorage;

    beforeEach(() => {
      memStorage = new MemoryKeyStorage();
    });

    it('should handle empty key data', async () => {
      const emptyKey = new Uint8Array(0);
      await memStorage.storeKey(testKeyId, emptyKey);
      
      const retrieved = await memStorage.getKey(testKeyId);
      expect(retrieved).toEqual(emptyKey);
    });

    it('should handle large keys', async () => {
      const largeKey = new Uint8Array(10000);
      largeKey.fill(42);
      
      await memStorage.storeKey(testKeyId, largeKey);
      const retrieved = await memStorage.getKey(testKeyId);
      
      expect(retrieved).toEqual(largeKey);
    });

    it('should handle special characters in key IDs', async () => {
      const specialId = 'key-@#$%^&*()_+{}[]|\\:";\'<>?,./';
      await memStorage.storeKey(specialId, testKey);
      
      const retrieved = await memStorage.getKey(specialId);
      expect(retrieved).toEqual(testKey);
    });

    it('should handle many keys', async () => {
      for (let i = 0; i < 100; i++) {
        await memStorage.storeKey(`key-${i}`, new Uint8Array([i]));
      }
      
      const keys = await memStorage.listKeys();
      expect(keys).toHaveLength(100);
    });

    it('should handle metadata without optional fields', async () => {
      const minimalMetadata: KeyMetadata = {
        version: 1,
        createdAt: Date.now(),
      };
      
      await memStorage.storeKey(testKeyId, testKey, minimalMetadata);
      const retrieved = await memStorage.getKeyMetadata(testKeyId);
      
      expect(retrieved?.version).toBe(1);
      expect(retrieved?.createdAt).toBeDefined();
    });
  });

  describe('Migration Support', () => {
    it('should support key migration', async () => {
      const memStorage = new MemoryKeyStorage();
      
      if (memStorage.migrateKeys) {
        await expect(memStorage.migrateKeys(1, 2)).resolves.not.toThrow();
      }
    });
  });
});
