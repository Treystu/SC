// Cache management for improved performance
export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  size: number; // Size in bytes
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  count: number;
}

export class CacheManager<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    count: 0
  };

  constructor(
    private maxSize: number = 50 * 1024 * 1024, // 50MB default
    private defaultTtl: number = 3600000 // 1 hour default
  ) {
    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  // Get item from cache
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  // Set item in cache
  set(key: string, value: T, ttl: number = this.defaultTtl): void {
    const size = this.estimateSize(value);

    // Check if we need to evict
    while (this.stats.size + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      size
    };

    // Remove old entry if exists
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.size -= existing.size;
      this.stats.count--;
    }

    this.cache.set(key, entry);
    this.stats.size += size;
    this.stats.count++;
  }

  // Check if key exists
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  // Delete item
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.stats.size -= entry.size;
    this.stats.count--;
    return true;
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.count = 0;
  }

  // Get or fetch (with callback)
  async getOrFetch(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  // Evict oldest entry
  private evictOldest(): void {
    let oldest: CacheEntry<T> | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.delete(key);
    }
  }

  // Estimate size of value in bytes
  private estimateSize(value: T): number {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return 1000; // Default estimate
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Get cache hit rate
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  // Prewarm cache with data
  async prewarm(entries: Array<{ key: string; fetcher: () => Promise<T>; ttl?: number }>): Promise<void> {
    await Promise.all(
      entries.map(({ key, fetcher, ttl }) => 
        this.getOrFetch(key, fetcher, ttl)
      )
    );
  }
}

// Specialized cache for images/media
export class MediaCache extends CacheManager<Blob> {
  constructor(maxSize: number = 100 * 1024 * 1024) { // 100MB for media
    super(maxSize, 86400000); // 24 hour TTL
  }

  // Create object URL from cached blob
  getObjectURL(key: string): string | null {
    const blob = this.get(key);
    return blob ? URL.createObjectURL(blob) : null;
  }

  // Cache image from URL
  async cacheFromURL(key: string, url: string): Promise<Blob> {
    return this.getOrFetch(key, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch image');
      return await response.blob();
    });
  }
}
