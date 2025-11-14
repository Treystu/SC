import { CacheManager, MediaCache, CacheEntry, CacheStats } from './cache-manager';

// Mock timers for testing TTL
jest.useFakeTimers();

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    jest.clearAllTimers();
    cache = new CacheManager<string>(1024 * 1024, 60000); // 1MB, 60s TTL
  });

  afterEach(() => {
    cache.clear();
    jest.clearAllTimers();
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('should update existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1', 1000); // 1 second TTL
      expect(cache.get('key1')).toBe('value1');
      
      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();
    });

    it('should use default TTL when not specified', () => {
      cache.set('key1', 'value1');
      jest.advanceTimersByTime(59999);
      expect(cache.get('key1')).toBe('value1');
      
      jest.advanceTimersByTime(2);
      expect(cache.get('key1')).toBeNull();
    });

    it('should allow custom TTL per entry', () => {
      cache.set('short', 'value1', 1000);
      cache.set('long', 'value2', 10000);
      
      jest.advanceTimersByTime(1001);
      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value2');
    });
  });

  describe('Eviction', () => {
    it('should evict oldest entry when size limit reached', () => {
      const smallCache = new CacheManager<string>(200, 60000); // Very small cache
      
      smallCache.set('key1', 'a'.repeat(100));
      smallCache.set('key2', 'b'.repeat(100));
      
      // This should trigger eviction of key1
      smallCache.set('key3', 'c'.repeat(100));
      
      // key1 should be evicted (oldest), but key3 should be cached
      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key3')).not.toBeNull();
      
      // Either key2 was evicted too, or it's still there
      // (depends on exact size calculations)
    });

    it('should track eviction count', () => {
      const smallCache = new CacheManager<string>(200, 60000);
      
      smallCache.set('key1', 'a'.repeat(100));
      smallCache.set('key2', 'b'.repeat(100));
      smallCache.set('key3', 'c'.repeat(100)); // Triggers eviction
      
      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');
      
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key3'); // miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key1', 'value1');
      
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key3'); // miss
      
      expect(cache.getHitRate()).toBe(0.5); // 2 hits out of 4 total
    });

    it('should return 0 hit rate when no requests', () => {
      expect(cache.getHitRate()).toBe(0);
    });

    it('should track cache size and count', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      const stats = cache.getStats();
      expect(stats.count).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should update stats when clearing cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      
      const stats = cache.getStats();
      expect(stats.count).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('getOrFetch', () => {
    it('should return cached value if exists', async () => {
      cache.set('key1', 'cached');
      
      const fetcher = jest.fn(async () => 'fetched');
      const result = await cache.getOrFetch('key1', fetcher);
      
      expect(result).toBe('cached');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not exists', async () => {
      const fetcher = jest.fn(async () => 'fetched');
      const result = await cache.getOrFetch('key1', fetcher);
      
      expect(result).toBe('fetched');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBe('fetched');
    });

    it('should use custom TTL when fetching', async () => {
      const fetcher = async () => 'fetched';
      await cache.getOrFetch('key1', fetcher, 1000);
      
      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('prewarm', () => {
    it('should prewarm cache with multiple entries', async () => {
      const entries = [
        { key: 'key1', fetcher: async () => 'value1' },
        { key: 'key2', fetcher: async () => 'value2' },
        { key: 'key3', fetcher: async () => 'value3' },
      ];
      
      await cache.prewarm(entries);
      
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should support custom TTL in prewarm', async () => {
      const entries = [
        { key: 'key1', fetcher: async () => 'value1', ttl: 1000 },
      ];
      
      await cache.prewarm(entries);
      
      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      cache.set('key1', '');
      expect(cache.get('key1')).toBe('');
    });

    it('should handle numeric values', () => {
      const numberCache = new CacheManager<number>();
      numberCache.set('key1', 42);
      expect(numberCache.get('key1')).toBe(42);
    });

    it('should handle object values', () => {
      const objectCache = new CacheManager<{ value: string }>();
      const obj = { value: 'test' };
      objectCache.set('key1', obj);
      expect(objectCache.get('key1')).toEqual(obj);
    });

    it('should handle undefined values', () => {
      const anyCache = new CacheManager<any>();
      anyCache.set('key1', undefined);
      expect(anyCache.get('key1')).toBeUndefined();
    });
  });
});

describe('MediaCache', () => {
  let mediaCache: MediaCache;

  beforeEach(() => {
    mediaCache = new MediaCache();
  });

  afterEach(() => {
    mediaCache.clear();
  });

  describe('Basic Operations', () => {
    it('should cache blob values', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      mediaCache.set('test.txt', blob);
      
      const cached = mediaCache.get('test.txt');
      expect(cached).toBe(blob);
    });

    it('should create object URLs from cached blobs', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      mediaCache.set('test.txt', blob);
      
      const url = mediaCache.getObjectURL('test.txt');
      expect(url).toBeTruthy();
      expect(typeof url).toBe('string');
      expect(url).toMatch(/^blob:/);
    });

    it('should return null for non-existent blob URLs', () => {
      const url = mediaCache.getObjectURL('nonexistent');
      expect(url).toBeNull();
    });
  });

  describe('cacheFromURL', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should fetch and cache from URL', async () => {
      const mockBlob = new Blob(['content'], { type: 'image/png' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      const result = await mediaCache.cacheFromURL('image', 'http://example.com/image.png');
      
      expect(result).toBe(mockBlob);
      expect(mediaCache.get('image')).toBe(mockBlob);
    });

    it('should throw error on failed fetch', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      await expect(
        mediaCache.cacheFromURL('image', 'http://example.com/fail.png')
      ).rejects.toThrow('Failed to fetch image');
    });

    it('should return cached value on subsequent calls', async () => {
      const mockBlob = new Blob(['content'], { type: 'image/png' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      await mediaCache.cacheFromURL('image', 'http://example.com/image.png');
      await mediaCache.cacheFromURL('image', 'http://example.com/image.png');
      
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
