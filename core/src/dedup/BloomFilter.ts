/**
 * BloomFilter - Space-efficient probabilistic data structure
 *
 * Used for O(1) message deduplication with configurable false positive rate.
 * False positives mean we might skip relaying a message we haven't seen.
 * False negatives are impossible - if we say "not seen", it's definitely not seen.
 *
 * Configuration:
 * - Expected items: 100,000 unique messages
 * - False positive rate: 1%
 * - Optimal hash functions: 7
 * - Bit array size: ~958,506 bits (~117KB)
 */

/**
 * Bloom filter configuration
 */
export interface BloomFilterConfig {
  /** Expected number of items to store */
  expectedItems: number;

  /** Desired false positive rate (0.0 - 1.0) */
  falsePositiveRate: number;

  /** Number of hash functions (calculated if not provided) */
  hashFunctions?: number;

  /** Size of bit array in bits (calculated if not provided) */
  size?: number;
}

/**
 * Default configuration optimized for message deduplication
 */
export const DEFAULT_BLOOM_CONFIG: BloomFilterConfig = {
  expectedItems: 100_000,
  falsePositiveRate: 0.01, // 1% false positive rate
  hashFunctions: 7,
};

/**
 * Calculate optimal bloom filter parameters
 */
export function calculateOptimalParams(
  expectedItems: number,
  falsePositiveRate: number
): { size: number; hashFunctions: number } {
  // Optimal size: m = -n * ln(p) / (ln(2)^2)
  const size = Math.ceil(
    (-expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2)
  );

  // Optimal hash functions: k = (m/n) * ln(2)
  const hashFunctions = Math.round((size / expectedItems) * Math.LN2);

  return { size, hashFunctions: Math.max(1, hashFunctions) };
}

/**
 * BloomFilter implementation using typed arrays for efficiency
 */
export class BloomFilter {
  private bits: Uint32Array;
  private size: number;
  private hashCount: number;
  private itemCount: number = 0;

  constructor(config: BloomFilterConfig = DEFAULT_BLOOM_CONFIG) {
    const params = calculateOptimalParams(
      config.expectedItems,
      config.falsePositiveRate
    );

    this.size = config.size ?? params.size;
    this.hashCount = config.hashFunctions ?? params.hashFunctions;

    // Allocate bit array (using Uint32Array for 32-bit chunks)
    const arraySize = Math.ceil(this.size / 32);
    this.bits = new Uint32Array(arraySize);
  }

  /**
   * Add an item to the bloom filter
   */
  add(item: string): void {
    const hashes = this.getHashes(item);

    for (const hash of hashes) {
      const index = hash % this.size;
      const arrayIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      this.bits[arrayIndex] |= (1 << bitIndex);
    }

    this.itemCount++;
  }

  /**
   * Check if an item might be in the set
   * Returns true if possibly present, false if definitely not present
   */
  mightContain(item: string): boolean {
    const hashes = this.getHashes(item);

    for (const hash of hashes) {
      const index = hash % this.size;
      const arrayIndex = Math.floor(index / 32);
      const bitIndex = index % 32;

      if ((this.bits[arrayIndex] & (1 << bitIndex)) === 0) {
        return false; // Definitely not present
      }
    }

    return true; // Possibly present
  }

  /**
   * Get the estimated fill ratio (0.0 - 1.0)
   */
  getFillRatio(): number {
    let setBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      setBits += this.popCount(this.bits[i]);
    }
    return setBits / this.size;
  }

  /**
   * Get the estimated false positive rate based on current fill
   */
  getEstimatedFalsePositiveRate(): number {
    // FPR = (1 - e^(-kn/m))^k where k=hashCount, n=items, m=size
    const exponent = (-this.hashCount * this.itemCount) / this.size;
    return Math.pow(1 - Math.exp(exponent), this.hashCount);
  }

  /**
   * Get number of items added
   */
  getItemCount(): number {
    return this.itemCount;
  }

  /**
   * Get configuration info
   */
  getInfo(): {
    size: number;
    hashFunctions: number;
    itemCount: number;
    fillRatio: number;
    estimatedFPR: number;
    memorySizeBytes: number;
  } {
    return {
      size: this.size,
      hashFunctions: this.hashCount,
      itemCount: this.itemCount,
      fillRatio: this.getFillRatio(),
      estimatedFPR: this.getEstimatedFalsePositiveRate(),
      memorySizeBytes: this.bits.byteLength,
    };
  }

  /**
   * Clear the bloom filter
   */
  clear(): void {
    this.bits.fill(0);
    this.itemCount = 0;
  }

  /**
   * Export the bloom filter state for persistence
   */
  export(): BloomFilterState {
    return {
      size: this.size,
      hashCount: this.hashCount,
      itemCount: this.itemCount,
      bits: Array.from(this.bits),
    };
  }

  /**
   * Import a previously exported bloom filter state
   */
  static import(state: BloomFilterState): BloomFilter {
    const filter = new BloomFilter({
      expectedItems: state.itemCount || 100000,
      falsePositiveRate: 0.01,
      size: state.size,
      hashFunctions: state.hashCount,
    });

    filter.bits = new Uint32Array(state.bits);
    filter.itemCount = state.itemCount;

    return filter;
  }

  /**
   * Merge another bloom filter into this one (OR operation)
   * Useful for combining filters from multiple sources
   */
  merge(other: BloomFilter): void {
    if (this.size !== other.size || this.hashCount !== other.hashCount) {
      throw new Error('Cannot merge bloom filters with different configurations');
    }

    for (let i = 0; i < this.bits.length; i++) {
      this.bits[i] |= other.bits[i];
    }

    // Item count becomes an estimate after merge
    this.itemCount = Math.max(this.itemCount, other.itemCount);
  }

  // ============== Private Methods ==============

  /**
   * Generate k hash values for an item using double hashing
   * h(i) = h1(x) + i * h2(x) for i = 0..k-1
   */
  private getHashes(item: string): number[] {
    const h1 = this.hash1(item);
    const h2 = this.hash2(item);

    const hashes: number[] = [];
    for (let i = 0; i < this.hashCount; i++) {
      // Double hashing technique
      hashes.push(Math.abs((h1 + i * h2) >>> 0));
    }

    return hashes;
  }

  /**
   * Primary hash function (FNV-1a)
   */
  private hash1(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Secondary hash function (DJB2)
   */
  private hash2(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  /**
   * Count set bits in a 32-bit integer (Hamming weight)
   */
  private popCount(n: number): number {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    n = (n + (n >>> 4)) & 0x0f0f0f0f;
    n = n + (n >>> 8);
    n = n + (n >>> 16);
    return n & 0x3f;
  }
}

/**
 * Serializable bloom filter state
 */
export interface BloomFilterState {
  size: number;
  hashCount: number;
  itemCount: number;
  bits: number[];
}

/**
 * Create a bloom filter sized for a specific capacity and FPR
 */
export function createBloomFilter(
  expectedItems: number,
  falsePositiveRate: number = 0.01
): BloomFilter {
  return new BloomFilter({
    expectedItems,
    falsePositiveRate,
  });
}
