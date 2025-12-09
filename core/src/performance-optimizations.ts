/**
 * Performance Optimizations for Large-Scale Mesh Networks
 *
 * This module provides optimizations for scaling to 1M+ users:
 * - LRU Cache with O(1) operations
 * - Object pooling for Uint8Array buffers
 * - Message batching for high throughput
 * - Connection pooling optimizations
 * - Bloom filters for message deduplication
 */

// ============================================================================
// LRU Cache with O(1) Get/Set/Delete
// ============================================================================

/**
 * LRU (Least Recently Used) Cache with O(1) time complexity for all operations
 * Uses a doubly-linked list + Map for efficient access and eviction
 */
export class LRUCache<K, V> {
  private cache: Map<K, LRUNode<K, V>> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;
  private readonly maxSize: number;
  private _hits = 0;
  private _misses = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * Get value by key - O(1)
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);

    if (!node) {
      this._misses++;
      return undefined;
    }

    this._hits++;

    // Move to head (most recently used)
    this.moveToHead(node);

    return node.value;
  }

  /**
   * Set key-value pair - O(1)
   */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing
      existingNode.value = value;
      this.moveToHead(existingNode);
      return;
    }

    // Create new node
    const newNode: LRUNode<K, V> = {
      key,
      value,
      prev: null,
      next: null,
    };

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictTail();
    }

    // Add to head
    this.addToHead(newNode);
    this.cache.set(key, newNode);
  }

  /**
   * Check if key exists - O(1)
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete key - O(1)
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get hit rate
   */
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }

  /**
   * Get stats
   */
  get stats(): { hits: number; misses: number; size: number; hitRate: number } {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this.cache.size,
      hitRate: this.hitRate,
    };
  }

  private addToHead(node: LRUNode<K, V>): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private moveToHead(node: LRUNode<K, V>): void {
    if (node === this.head) return;
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictTail(): void {
    if (!this.tail) return;
    this.cache.delete(this.tail.key);
    this.removeNode(this.tail);
  }
}

interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

// ============================================================================
// Object Pool for Uint8Array Buffers
// ============================================================================

/**
 * Object pool for Uint8Array buffers to reduce GC pressure
 * Especially useful for crypto operations and message encoding
 */
export class BufferPool {
  private pools: Map<number, Uint8Array[]> = new Map();
  private readonly maxPoolSize: number;
  private _acquired = 0;
  private _released = 0;
  private _created = 0;

  constructor(maxPoolSize = 100) {
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Acquire a buffer of specified size
   */
  acquire(size: number): Uint8Array {
    this._acquired++;

    // Round up to common sizes to improve pooling
    const normalizedSize = this.normalizeSize(size);
    const pool = this.pools.get(normalizedSize);

    if (pool && pool.length > 0) {
      return pool.pop()!;
    }

    // No pooled buffer available, create new one
    this._created++;
    return new Uint8Array(normalizedSize);
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: Uint8Array): void {
    this._released++;

    const size = buffer.length;
    let pool = this.pools.get(size);

    if (!pool) {
      pool = [];
      this.pools.set(size, pool);
    }

    if (pool.length < this.maxPoolSize) {
      // Clear the buffer before pooling (security)
      // NOTE: For cryptographic material, use crypto/primitives.ts secure deletion
      // This basic clearing is sufficient for general-purpose buffers
      buffer.fill(0);
      pool.push(buffer);
    }
    // Otherwise, let GC handle it
  }

  /**
   * Acquire, use, and release in one operation
   */
  withBuffer<T>(size: number, fn: (buffer: Uint8Array) => T): T {
    const buffer = this.acquire(size);
    try {
      return fn(buffer);
    } finally {
      this.release(buffer);
    }
  }

  /**
   * Get pool statistics
   */
  get stats(): {
    acquired: number;
    released: number;
    created: number;
    pooled: number;
  } {
    let pooled = 0;
    for (const pool of this.pools.values()) {
      pooled += pool.length;
    }

    return {
      acquired: this._acquired,
      released: this._released,
      created: this._created,
      pooled,
    };
  }

  /**
   * Clear all pooled buffers
   */
  clear(): void {
    this.pools.clear();
  }

  /**
   * Normalize size to common powers of 2 for better pooling
   */
  private normalizeSize(size: number): number {
    // Common sizes for mesh network operations
    if (size <= 64) return 64;
    if (size <= 128) return 128;
    if (size <= 256) return 256;
    if (size <= 512) return 512;
    if (size <= 1024) return 1024;
    if (size <= 2048) return 2048;
    if (size <= 4096) return 4096;
    if (size <= 8192) return 8192;
    if (size <= 16384) return 16384;
    if (size <= 32768) return 32768;
    if (size <= 65536) return 65536;

    // For larger sizes, round up to nearest power of 2
    return Math.pow(2, Math.ceil(Math.log2(size)));
  }
}

// Global buffer pool instance
export const bufferPool = new BufferPool();

// ============================================================================
// Message Batcher for High Throughput
// ============================================================================

export interface BatchConfig {
  maxBatchSize?: number;
  maxWaitMs?: number;
  onBatch: (items: BatchItem[]) => void | Promise<void>;
}

export interface BatchItem {
  peerId: string;
  data: Uint8Array;
  priority?: number;
}

/**
 * Message batcher for efficient high-throughput message delivery
 * Reduces overhead by batching multiple messages to the same peer
 */
export class MessageBatcher {
  private queues: Map<string, BatchItem[]> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly maxBatchSize: number;
  private readonly maxWaitMs: number;
  private readonly onBatch: (items: BatchItem[]) => void | Promise<void>;
  private _batchesSent = 0;
  private _messagesBatched = 0;

  constructor(config: BatchConfig) {
    this.maxBatchSize = config.maxBatchSize || 10;
    this.maxWaitMs = config.maxWaitMs || 50;
    this.onBatch = config.onBatch;
  }

  /**
   * Add an item to the batch queue
   */
  add(item: BatchItem): void {
    this._messagesBatched++;

    let queue = this.queues.get(item.peerId);
    if (!queue) {
      queue = [];
      this.queues.set(item.peerId, queue);
    }

    queue.push(item);

    // Flush if batch size reached
    if (queue.length >= this.maxBatchSize) {
      this.flush(item.peerId);
      return;
    }

    // Set timer for delayed flush if not already set
    if (!this.timers.has(item.peerId)) {
      const timer = setTimeout(() => {
        this.flush(item.peerId);
      }, this.maxWaitMs);
      this.timers.set(item.peerId, timer);
    }
  }

  /**
   * Flush batch for a specific peer
   */
  flush(peerId: string): void {
    const queue = this.queues.get(peerId);
    if (!queue || queue.length === 0) return;

    // Clear timer
    const timer = this.timers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(peerId);
    }

    // Get and clear queue
    const items = queue.splice(0);
    this._batchesSent++;

    // Sort by priority (higher first)
    items.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Send batch
    this.onBatch(items);
  }

  /**
   * Flush all pending batches
   */
  flushAll(): void {
    for (const peerId of this.queues.keys()) {
      this.flush(peerId);
    }
  }

  /**
   * Get statistics
   */
  get stats(): {
    batchesSent: number;
    messagesBatched: number;
    avgBatchSize: number;
  } {
    return {
      batchesSent: this._batchesSent,
      messagesBatched: this._messagesBatched,
      avgBatchSize:
        this._batchesSent === 0 ? 0 : this._messagesBatched / this._batchesSent,
    };
  }

  /**
   * Cleanup and stop all timers
   */
  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.queues.clear();
  }
}

// ============================================================================
// Bloom Filter for Message Deduplication
// ============================================================================

/**
 * Space-efficient probabilistic data structure for message deduplication
 * False positive rate ~1% with 10 hash functions and 10 bits per element
 */
export class BloomFilter {
  private bits: Uint32Array;
  private readonly numBits: number;
  private readonly numHashes: number;
  private _count = 0;

  /**
   * Create bloom filter
   * @param expectedElements Expected number of elements
   * @param falsePositiveRate Desired false positive rate (default 0.01 = 1%)
   */
  constructor(expectedElements: number, falsePositiveRate = 0.01) {
    // Calculate optimal number of bits: m = -n*ln(p)/(ln(2)^2)
    this.numBits = Math.ceil(
      (-expectedElements * Math.log(falsePositiveRate)) /
        (Math.log(2) * Math.log(2))
    );

    // Calculate optimal number of hash functions: k = (m/n) * ln(2)
    this.numHashes = Math.ceil(
      (this.numBits / expectedElements) * Math.log(2)
    );

    // Initialize bit array (using Uint32Array for efficiency)
    const numWords = Math.ceil(this.numBits / 32);
    this.bits = new Uint32Array(numWords);
  }

  /**
   * Add an element to the filter
   */
  add(element: string | Uint8Array): void {
    const hashes = this.getHashes(element);
    for (const hash of hashes) {
      const index = hash % this.numBits;
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      this.bits[wordIndex] |= 1 << bitIndex;
    }
    this._count++;
  }

  /**
   * Check if element might be in filter
   * Returns true if element is possibly in set, false if definitely not
   */
  mightContain(element: string | Uint8Array): boolean {
    const hashes = this.getHashes(element);
    for (const hash of hashes) {
      const index = hash % this.numBits;
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      if ((this.bits[wordIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get approximate number of elements
   */
  get count(): number {
    return this._count;
  }

  /**
   * Get fill ratio (percentage of bits set)
   */
  get fillRatio(): number {
    let setBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      setBits += this.popCount(this.bits[i]);
    }
    return setBits / this.numBits;
  }

  /**
   * Clear the filter
   */
  clear(): void {
    this.bits.fill(0);
    this._count = 0;
  }

  /**
   * Generate multiple hashes for an element using double hashing
   */
  private getHashes(element: string | Uint8Array): number[] {
    const data =
      typeof element === 'string' ? new TextEncoder().encode(element) : element;

    // Use two base hashes and derive others via double hashing
    const hash1 = this.fnv1a(data);
    const hash2 = this.murmur3(data);

    const hashes: number[] = [];
    for (let i = 0; i < this.numHashes; i++) {
      // gi(x) = h1(x) + i * h2(x) mod m
      hashes.push(Math.abs((hash1 + i * hash2) >>> 0));
    }

    return hashes;
  }

  /**
   * FNV-1a hash function
   */
  private fnv1a(data: Uint8Array): number {
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Simplified MurmurHash3
   */
  private murmur3(data: Uint8Array): number {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 0x5bd1e995);
      hash ^= hash >>> 15;
    }
    return hash >>> 0;
  }

  /**
   * Count set bits in a 32-bit integer
   */
  private popCount(n: number): number {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
}

// ============================================================================
// Connection Pool Manager
// ============================================================================

export interface ConnectionPoolConfig {
  maxConnections?: number;
  idleTimeoutMs?: number;
  cleanupIntervalMs?: number;
}

export interface PooledConnection {
  peerId: string;
  lastActivity: number;
  isActive: boolean;
  close: () => void;
}

/**
 * Connection pool manager for efficient peer connection management
 */
export class ConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private readonly maxConnections: number;
  private readonly idleTimeoutMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: ConnectionPoolConfig = {}) {
    this.maxConnections = config.maxConnections || 100;
    this.idleTimeoutMs = config.idleTimeoutMs || 300000; // 5 minutes

    // Start cleanup timer
    const cleanupInterval = config.cleanupIntervalMs || 60000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
  }

  /**
   * Get or create a connection
   */
  getOrCreate(
    peerId: string,
    createFn: () => PooledConnection
  ): PooledConnection {
    let conn = this.connections.get(peerId);

    if (conn) {
      conn.lastActivity = Date.now();
      return conn;
    }

    // Check pool size limit
    if (this.connections.size >= this.maxConnections) {
      this.evictIdleConnections();

      // If still at capacity, evict oldest
      if (this.connections.size >= this.maxConnections) {
        this.evictOldest();
      }
    }

    // Create new connection
    conn = createFn();
    conn.lastActivity = Date.now();
    this.connections.set(peerId, conn);

    return conn;
  }

  /**
   * Update activity timestamp
   */
  touch(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.lastActivity = Date.now();
    }
  }

  /**
   * Remove a connection
   */
  remove(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }

  /**
   * Get number of connections
   */
  get size(): number {
    return this.connections.size;
  }

  /**
   * Get all peer IDs
   */
  getPeerIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Cleanup idle connections
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [peerId, conn] of this.connections.entries()) {
      if (!conn.isActive && now - conn.lastActivity > this.idleTimeoutMs) {
        conn.close();
        this.connections.delete(peerId);
      }
    }
  }

  /**
   * Evict idle connections to make room
   */
  private evictIdleConnections(): void {
    const now = Date.now();
    const halfTimeout = this.idleTimeoutMs / 2;

    for (const [peerId, conn] of this.connections.entries()) {
      if (!conn.isActive && now - conn.lastActivity > halfTimeout) {
        conn.close();
        this.connections.delete(peerId);
      }
    }
  }

  /**
   * Evict oldest connection
   */
  private evictOldest(): void {
    let oldest: [string, PooledConnection] | null = null;

    for (const entry of this.connections.entries()) {
      if (
        !entry[1].isActive &&
        (!oldest || entry[1].lastActivity < oldest[1].lastActivity)
      ) {
        oldest = entry;
      }
    }

    if (oldest) {
      oldest[1].close();
      this.connections.delete(oldest[0]);
    }
  }

  /**
   * Destroy the pool
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
  }
}

// ============================================================================
// Performance Metrics Collector
// ============================================================================

export interface PerformanceMetrics {
  messagesPerSecond: number;
  averageLatencyMs: number;
  peakConnections: number;
  cacheHitRate: number;
  memoryUsageMB: number;
}

/**
 * Collect and report performance metrics
 */
export class MetricsCollector {
  private messageCount = 0;
  private totalLatency = 0;
  private latencyCount = 0;
  private peakConnections = 0;
  private lastReportTime = Date.now();
  private lastMessageCount = 0;

  recordMessage(): void {
    this.messageCount++;
  }

  recordLatency(latencyMs: number): void {
    this.totalLatency += latencyMs;
    this.latencyCount++;
  }

  recordConnections(count: number): void {
    if (count > this.peakConnections) {
      this.peakConnections = count;
    }
  }

  getMetrics(cacheHitRate = 0): PerformanceMetrics {
    const now = Date.now();
    const elapsed = (now - this.lastReportTime) / 1000;
    const messagesSinceLastReport = this.messageCount - this.lastMessageCount;

    const metrics: PerformanceMetrics = {
      messagesPerSecond: elapsed > 0 ? messagesSinceLastReport / elapsed : 0,
      averageLatencyMs:
        this.latencyCount > 0 ? this.totalLatency / this.latencyCount : 0,
      peakConnections: this.peakConnections,
      cacheHitRate,
      memoryUsageMB: this.getMemoryUsage(),
    };

    this.lastReportTime = now;
    this.lastMessageCount = this.messageCount;

    return metrics;
  }

  reset(): void {
    this.messageCount = 0;
    this.totalLatency = 0;
    this.latencyCount = 0;
    this.peakConnections = 0;
    this.lastReportTime = Date.now();
    this.lastMessageCount = 0;
  }

  private getMemoryUsage(): number {
    // Browser environment
    if (
      typeof performance !== 'undefined' &&
      'memory' in performance
    ) {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      return memory?.usedJSHeapSize
        ? memory.usedJSHeapSize / (1024 * 1024)
        : 0;
    }
    return 0;
  }
}
