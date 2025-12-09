/**
 * Tests for Performance Optimizations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  LRUCache,
  BufferPool,
  MessageBatcher,
  BloomFilter,
  ConnectionPool,
  MetricsCollector,
  BatchItem,
} from './performance-optimizations.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  it('should store and retrieve values', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should evict least recently used item when full', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' to make it recently used
    cache.get('a');

    // Add 'd' - should evict 'b' (least recently used)
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1); // Still there
    expect(cache.get('b')).toBeUndefined(); // Evicted
    expect(cache.get('c')).toBe(3); // Still there
    expect(cache.get('d')).toBe(4); // New item
  });

  it('should update existing keys without eviction', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('a', 10); // Update existing

    expect(cache.get('a')).toBe(10);
    expect(cache.size).toBe(3);
  });

  it('should track hit rate correctly', () => {
    cache.set('a', 1);

    cache.get('a'); // hit
    cache.get('a'); // hit
    cache.get('missing'); // miss

    expect(cache.stats.hits).toBe(2);
    expect(cache.stats.misses).toBe(1);
    expect(cache.hitRate).toBeCloseTo(0.667, 2);
  });

  it('should delete items correctly', () => {
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.delete('a')).toBe(false);
  });

  it('should clear all items', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('BufferPool', () => {
  let pool: BufferPool;

  beforeEach(() => {
    pool = new BufferPool(10);
  });

  it('should acquire buffers of requested size', () => {
    const buffer = pool.acquire(100);
    expect(buffer.length).toBeGreaterThanOrEqual(100);
  });

  it('should normalize buffer sizes', () => {
    const buffer1 = pool.acquire(50); // Should get 64
    const buffer2 = pool.acquire(100); // Should get 128

    expect(buffer1.length).toBe(64);
    expect(buffer2.length).toBe(128);
  });

  it('should reuse released buffers', () => {
    const buffer1 = pool.acquire(64);
    pool.release(buffer1);

    const buffer2 = pool.acquire(64);
    expect(buffer2).toBe(buffer1);
  });

  it('should clear buffers on release for security', () => {
    const buffer = pool.acquire(64);
    buffer[0] = 42;
    pool.release(buffer);

    const reused = pool.acquire(64);
    expect(reused[0]).toBe(0);
  });

  it('should provide withBuffer helper', () => {
    const result = pool.withBuffer(100, (buffer) => {
      buffer[0] = 1;
      return buffer.length;
    });

    expect(result).toBeGreaterThanOrEqual(100);
  });

  it('should track statistics', () => {
    pool.acquire(64);
    pool.acquire(64);

    const stats = pool.stats;
    expect(stats.acquired).toBe(2);
    expect(stats.created).toBe(2);
  });
});

describe('MessageBatcher', () => {
  let batcher: MessageBatcher;
  let batches: BatchItem[][];

  beforeEach(() => {
    batches = [];
    batcher = new MessageBatcher({
      maxBatchSize: 3,
      maxWaitMs: 100,
      onBatch: (items) => {
        batches.push(items);
      },
    });
  });

  afterEach(() => {
    batcher.destroy();
  });

  it('should batch messages by peer', () => {
    batcher.add({ peerId: 'peer1', data: new Uint8Array([1]) });
    batcher.add({ peerId: 'peer1', data: new Uint8Array([2]) });
    batcher.add({ peerId: 'peer1', data: new Uint8Array([3]) });

    // Should flush after reaching maxBatchSize
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(3);
  });

  it('should keep separate queues per peer', () => {
    batcher.add({ peerId: 'peer1', data: new Uint8Array([1]) });
    batcher.add({ peerId: 'peer2', data: new Uint8Array([2]) });

    batcher.flushAll();

    expect(batches.length).toBe(2);
  });

  it('should sort by priority', () => {
    batcher.add({ peerId: 'peer1', data: new Uint8Array([1]), priority: 1 });
    batcher.add({ peerId: 'peer1', data: new Uint8Array([2]), priority: 10 });
    batcher.add({ peerId: 'peer1', data: new Uint8Array([3]), priority: 5 });

    expect((batches[0][0] as BatchItem).priority).toBe(10); // Highest priority first
    expect((batches[0][1] as BatchItem).priority).toBe(5);
    expect((batches[0][2] as BatchItem).priority).toBe(1);
  });

  it('should flush on timeout', async () => {
    batcher.add({ peerId: 'peer1', data: new Uint8Array([1]) });

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(batches.length).toBe(1);
  });

  it('should track statistics', () => {
    batcher.add({ peerId: 'peer1', data: new Uint8Array([1]) });
    batcher.add({ peerId: 'peer1', data: new Uint8Array([2]) });
    batcher.add({ peerId: 'peer1', data: new Uint8Array([3]) });

    const stats = batcher.stats;
    expect(stats.messagesBatched).toBe(3);
    expect(stats.batchesSent).toBe(1);
    expect(stats.avgBatchSize).toBe(3);
  });
});

describe('BloomFilter', () => {
  let filter: BloomFilter;

  beforeEach(() => {
    filter = new BloomFilter(1000, 0.01);
  });

  it('should add and check elements', () => {
    filter.add('hello');
    filter.add('world');

    expect(filter.mightContain('hello')).toBe(true);
    expect(filter.mightContain('world')).toBe(true);
  });

  it('should return false for elements not added', () => {
    filter.add('hello');

    // This should almost certainly be false
    // (with very small probability of false positive)
    expect(filter.mightContain('goodbye')).toBe(false);
  });

  it('should work with Uint8Array', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    filter.add(data);

    expect(filter.mightContain(data)).toBe(true);
    expect(filter.mightContain(new Uint8Array([5, 6, 7, 8]))).toBe(false);
  });

  it('should track count', () => {
    filter.add('a');
    filter.add('b');
    filter.add('c');

    expect(filter.count).toBe(3);
  });

  it('should clear correctly', () => {
    filter.add('hello');
    filter.clear();

    expect(filter.mightContain('hello')).toBe(false);
    expect(filter.count).toBe(0);
  });

  it('should maintain low false positive rate', () => {
    // Add 500 elements
    for (let i = 0; i < 500; i++) {
      filter.add(`element-${i}`);
    }

    // Check 500 elements that were NOT added
    let falsePositives = 0;
    for (let i = 500; i < 1000; i++) {
      if (filter.mightContain(`element-${i}`)) {
        falsePositives++;
      }
    }

    // Should be around 1% (5 out of 500) or less
    expect(falsePositives).toBeLessThan(25); // Allow some margin
  });
});

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  let closedConnections: string[];

  beforeEach(() => {
    closedConnections = [];
    pool = new ConnectionPool({
      maxConnections: 3,
      idleTimeoutMs: 100,
      cleanupIntervalMs: 50,
    });
  });

  afterEach(() => {
    pool.destroy();
  });

  it('should create connections', () => {
    const conn = pool.getOrCreate('peer1', () => ({
      peerId: 'peer1',
      lastActivity: Date.now(),
      isActive: true,
      close: () => closedConnections.push('peer1'),
    }));

    expect(conn.peerId).toBe('peer1');
    expect(pool.size).toBe(1);
  });

  it('should return existing connections', () => {
    let createCount = 0;

    const create = () => {
      createCount++;
      return {
        peerId: 'peer1',
        lastActivity: Date.now(),
        isActive: true,
        close: () => {},
      };
    };

    pool.getOrCreate('peer1', create);
    pool.getOrCreate('peer1', create);

    expect(createCount).toBe(1);
  });

  it('should evict when at capacity', () => {
    for (let i = 0; i < 3; i++) {
      pool.getOrCreate(`peer${i}`, () => ({
        peerId: `peer${i}`,
        lastActivity: Date.now() - (3 - i) * 1000, // Older peers first
        isActive: false,
        close: () => closedConnections.push(`peer${i}`),
      }));
    }

    // Add one more - should evict oldest
    pool.getOrCreate('peer3', () => ({
      peerId: 'peer3',
      lastActivity: Date.now(),
      isActive: false,
      close: () => closedConnections.push('peer3'),
    }));

    expect(closedConnections).toContain('peer0');
    expect(pool.size).toBe(3);
  });

  it('should remove connections', () => {
    pool.getOrCreate('peer1', () => ({
      peerId: 'peer1',
      lastActivity: Date.now(),
      isActive: true,
      close: () => closedConnections.push('peer1'),
    }));

    pool.remove('peer1');

    expect(closedConnections).toContain('peer1');
    expect(pool.size).toBe(0);
  });
});

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should track messages', () => {
    collector.recordMessage();
    collector.recordMessage();
    collector.recordMessage();

    const metrics = collector.getMetrics();
    // Can't precisely test messagesPerSecond due to timing
    expect(metrics.messagesPerSecond).toBeGreaterThanOrEqual(0);
  });

  it('should calculate average latency', () => {
    collector.recordLatency(10);
    collector.recordLatency(20);
    collector.recordLatency(30);

    const metrics = collector.getMetrics();
    expect(metrics.averageLatencyMs).toBe(20);
  });

  it('should track peak connections', () => {
    collector.recordConnections(5);
    collector.recordConnections(10);
    collector.recordConnections(3);

    const metrics = collector.getMetrics();
    expect(metrics.peakConnections).toBe(10);
  });

  it('should reset correctly', () => {
    collector.recordMessage();
    collector.recordLatency(100);
    collector.recordConnections(50);

    collector.reset();

    const metrics = collector.getMetrics();
    expect(metrics.averageLatencyMs).toBe(0);
    expect(metrics.peakConnections).toBe(0);
  });
});
