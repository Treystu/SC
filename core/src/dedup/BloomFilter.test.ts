/**
 * Comprehensive tests for BloomFilter implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  BloomFilter,
  BloomFilterConfig,
  DEFAULT_BLOOM_CONFIG,
  calculateOptimalParams,
  createBloomFilter,
} from './BloomFilter';

describe('BloomFilter', () => {
  describe('Constructor and Configuration', () => {
    it('should create filter with default config', () => {
      const filter = new BloomFilter();
      const info = filter.getInfo();

      expect(info.itemCount).toBe(0);
      expect(info.fillRatio).toBe(0);
      expect(info.hashFunctions).toBeGreaterThan(0);
      expect(info.size).toBeGreaterThan(0);
    });

    it('should create filter with custom config', () => {
      const config: BloomFilterConfig = {
        expectedItems: 1000,
        falsePositiveRate: 0.05,
      };
      const filter = new BloomFilter(config);
      const info = filter.getInfo();

      expect(info.itemCount).toBe(0);
      expect(info.hashFunctions).toBeGreaterThan(0);
    });

    it('should respect explicit size and hash function count', () => {
      const config: BloomFilterConfig = {
        expectedItems: 1000,
        falsePositiveRate: 0.01,
        size: 10000,
        hashFunctions: 5,
      };
      const filter = new BloomFilter(config);
      const info = filter.getInfo();

      expect(info.size).toBe(10000);
      expect(info.hashFunctions).toBe(5);
    });

    it('should calculate memory size correctly', () => {
      const filter = new BloomFilter({
        expectedItems: 1000,
        falsePositiveRate: 0.01,
      });
      const info = filter.getInfo();

      // Memory should be ceil(size/32) * 4 bytes
      const expectedBytes = Math.ceil(info.size / 32) * 4;
      expect(info.memorySizeBytes).toBe(expectedBytes);
    });
  });

  describe('add() - Adding items', () => {
    let filter: BloomFilter;

    beforeEach(() => {
      filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
    });

    it('should increase item count when adding items', () => {
      expect(filter.getItemCount()).toBe(0);

      filter.add('item1');
      expect(filter.getItemCount()).toBe(1);

      filter.add('item2');
      expect(filter.getItemCount()).toBe(2);

      filter.add('item3');
      expect(filter.getItemCount()).toBe(3);
    });

    it('should accept various string inputs', () => {
      filter.add('simple');
      filter.add('with spaces');
      filter.add('with-dashes');
      filter.add('with_underscores');
      filter.add('123456789');
      filter.add('unicode-émojis-🎉');
      filter.add('');

      expect(filter.getItemCount()).toBe(7);
    });

    it('should increase fill ratio as items are added', () => {
      const initialFill = filter.getFillRatio();
      expect(initialFill).toBe(0);

      for (let i = 0; i < 50; i++) {
        filter.add(`item-${i}`);
      }

      const finalFill = filter.getFillRatio();
      expect(finalFill).toBeGreaterThan(initialFill);
      expect(finalFill).toBeLessThanOrEqual(1);
    });

    it('should handle adding duplicate items (still increases count)', () => {
      filter.add('duplicate');
      filter.add('duplicate');
      filter.add('duplicate');

      // Bloom filters don't deduplicate, count still increases
      expect(filter.getItemCount()).toBe(3);
      expect(filter.mightContain('duplicate')).toBe(true);
    });
  });

  describe('mightContain() - Membership testing', () => {
    let filter: BloomFilter;

    beforeEach(() => {
      filter = new BloomFilter({
        expectedItems: 1000,
        falsePositiveRate: 0.01,
      });
    });

    it('should return true for added items', () => {
      const items = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];

      items.forEach((item) => filter.add(item));

      items.forEach((item) => {
        expect(filter.mightContain(item)).toBe(true);
      });
    });

    it('should return false for items not added (empty filter)', () => {
      expect(filter.mightContain('not-added')).toBe(false);
      expect(filter.mightContain('another-missing')).toBe(false);
      expect(filter.mightContain('')).toBe(false);
    });

    it('should return false for most items not added (populated filter)', () => {
      // Add some items
      for (let i = 0; i < 100; i++) {
        filter.add(`message-${i}`);
      }

      // Check for items not added
      let falseNegatives = 0;
      for (let i = 1000; i < 1100; i++) {
        if (!filter.mightContain(`message-${i}`)) {
          falseNegatives++;
        }
      }

      // Should have no false negatives (all should return false)
      expect(falseNegatives).toBe(100);
    });

    it('should have no false negatives (if added, must return true)', () => {
      const testSize = 500;
      const items: string[] = [];

      for (let i = 0; i < testSize; i++) {
        const item = `test-item-${i}-${Math.random()}`;
        items.push(item);
        filter.add(item);
      }

      // Verify all added items return true
      let falseNegatives = 0;
      items.forEach((item) => {
        if (!filter.mightContain(item)) {
          falseNegatives++;
        }
      });

      expect(falseNegatives).toBe(0);
    });
  });

  describe('False Positive Rate Validation', () => {
    it('should maintain FPR within expected bounds for 1% target', () => {
      const expectedItems = 1000;
      const targetFPR = 0.01;
      const filter = new BloomFilter({
        expectedItems,
        falsePositiveRate: targetFPR,
      });

      // Add expected number of items
      for (let i = 0; i < expectedItems; i++) {
        filter.add(`item-${i}`);
      }

      // Test with items not added
      const testCount = 1000;
      let falsePositives = 0;

      for (let i = expectedItems; i < expectedItems + testCount; i++) {
        if (filter.mightContain(`item-${i}`)) {
          falsePositives++;
        }
      }

      const actualFPR = falsePositives / testCount;

      // Should be within reasonable bounds (3x tolerance for randomness)
      expect(actualFPR).toBeLessThanOrEqual(targetFPR * 3);
      expect(filter.getEstimatedFalsePositiveRate()).toBeLessThanOrEqual(
        targetFPR * 3
      );
    });

    it('should maintain FPR within expected bounds for 5% target', () => {
      const expectedItems = 500;
      const targetFPR = 0.05;
      const filter = new BloomFilter({
        expectedItems,
        falsePositiveRate: targetFPR,
      });

      for (let i = 0; i < expectedItems; i++) {
        filter.add(`item-${i}`);
      }

      const testCount = 1000;
      let falsePositives = 0;

      for (let i = expectedItems; i < expectedItems + testCount; i++) {
        if (filter.mightContain(`item-${i}`)) {
          falsePositives++;
        }
      }

      const actualFPR = falsePositives / testCount;
      expect(actualFPR).toBeLessThanOrEqual(targetFPR * 2);
    });

    it('should estimate FPR accurately', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const initialEstimate = filter.getEstimatedFalsePositiveRate();
      expect(initialEstimate).toBeLessThan(0.01);

      // Add items
      for (let i = 0; i < 50; i++) {
        filter.add(`item-${i}`);
      }

      const midEstimate = filter.getEstimatedFalsePositiveRate();
      expect(midEstimate).toBeGreaterThan(initialEstimate);

      // Add more items
      for (let i = 50; i < 100; i++) {
        filter.add(`item-${i}`);
      }

      const finalEstimate = filter.getEstimatedFalsePositiveRate();
      expect(finalEstimate).toBeGreaterThan(midEstimate);
      expect(finalEstimate).toBeLessThanOrEqual(0.02); // Within 2x target
    });
  });

  describe('getFillRatio() - Fill percentage calculation', () => {
    let filter: BloomFilter;

    beforeEach(() => {
      filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
    });

    it('should return 0 for empty filter', () => {
      expect(filter.getFillRatio()).toBe(0);
    });

    it('should increase monotonically as items are added', () => {
      let previousRatio = 0;

      for (let i = 0; i < 50; i++) {
        filter.add(`item-${i}`);
        const currentRatio = filter.getFillRatio();

        expect(currentRatio).toBeGreaterThanOrEqual(previousRatio);
        expect(currentRatio).toBeLessThanOrEqual(1);

        previousRatio = currentRatio;
      }
    });

    it('should never exceed 1.0', () => {
      // Overfill the filter
      for (let i = 0; i < 1000; i++) {
        filter.add(`item-${i}`);
      }

      expect(filter.getFillRatio()).toBeLessThanOrEqual(1);
    });

    it('should be consistent between calls', () => {
      filter.add('item1');
      filter.add('item2');

      const ratio1 = filter.getFillRatio();
      const ratio2 = filter.getFillRatio();

      expect(ratio1).toBe(ratio2);
    });
  });

  describe('getEstimatedFalsePositiveRate() - FPR estimation', () => {
    it('should start near zero for empty filter', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const fpr = filter.getEstimatedFalsePositiveRate();
      expect(fpr).toBeLessThan(0.001);
    });

    it('should increase as filter fills', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const fprs: number[] = [];

      for (let i = 0; i < 100; i += 10) {
        filter.add(`item-${i}`);
        fprs.push(filter.getEstimatedFalsePositiveRate());
      }

      // Each FPR should be >= previous
      for (let i = 1; i < fprs.length; i++) {
        expect(fprs[i]).toBeGreaterThanOrEqual(fprs[i - 1]);
      }
    });

    it('should approach target FPR at expected capacity', () => {
      const expectedItems = 1000;
      const targetFPR = 0.01;
      const filter = new BloomFilter({
        expectedItems,
        falsePositiveRate: targetFPR,
      });

      for (let i = 0; i < expectedItems; i++) {
        filter.add(`item-${i}`);
      }

      const estimatedFPR = filter.getEstimatedFalsePositiveRate();
      expect(estimatedFPR).toBeGreaterThan(targetFPR * 0.5);
      expect(estimatedFPR).toBeLessThanOrEqual(targetFPR * 2);
    });
  });

  describe('clear() - Reset state', () => {
    let filter: BloomFilter;

    beforeEach(() => {
      filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
    });

    it('should reset all state to initial', () => {
      // Add items
      filter.add('item1');
      filter.add('item2');
      filter.add('item3');

      expect(filter.getItemCount()).toBe(3);
      expect(filter.getFillRatio()).toBeGreaterThan(0);
      expect(filter.mightContain('item1')).toBe(true);

      // Clear
      filter.clear();

      expect(filter.getItemCount()).toBe(0);
      expect(filter.getFillRatio()).toBe(0);
      expect(filter.mightContain('item1')).toBe(false);
      expect(filter.mightContain('item2')).toBe(false);
      expect(filter.mightContain('item3')).toBe(false);
    });

    it('should allow reuse after clear', () => {
      filter.add('before-clear');
      expect(filter.mightContain('before-clear')).toBe(true);

      filter.clear();

      filter.add('after-clear');
      expect(filter.mightContain('after-clear')).toBe(true);
      expect(filter.mightContain('before-clear')).toBe(false);
      expect(filter.getItemCount()).toBe(1);
    });

    it('should reset estimated FPR', () => {
      for (let i = 0; i < 50; i++) {
        filter.add(`item-${i}`);
      }

      const fprBeforeClear = filter.getEstimatedFalsePositiveRate();
      expect(fprBeforeClear).toBeGreaterThan(0);

      filter.clear();

      const fprAfterClear = filter.getEstimatedFalsePositiveRate();
      expect(fprAfterClear).toBeLessThan(fprBeforeClear);
      expect(fprAfterClear).toBeLessThan(0.001);
    });
  });

  describe('export() and import() - Serialization', () => {
    it('should export and import successfully (round-trip)', () => {
      const original = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      // Add items
      const items = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];
      items.forEach((item) => original.add(item));

      // Export
      const state = original.export();

      // Verify export structure
      expect(state.size).toBeGreaterThan(0);
      expect(state.hashCount).toBeGreaterThan(0);
      expect(state.itemCount).toBe(5);
      expect(Array.isArray(state.bits)).toBe(true);

      // Import
      const imported = BloomFilter.import(state);

      // Verify imported filter matches original
      expect(imported.getItemCount()).toBe(original.getItemCount());
      expect(imported.getFillRatio()).toBe(original.getFillRatio());
      expect(imported.getEstimatedFalsePositiveRate()).toBe(
        original.getEstimatedFalsePositiveRate()
      );

      // Verify all items are present
      items.forEach((item) => {
        expect(imported.mightContain(item)).toBe(true);
      });
    });

    it('should preserve empty filter state', () => {
      const original = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const state = original.export();
      const imported = BloomFilter.import(state);

      expect(imported.getItemCount()).toBe(0);
      expect(imported.getFillRatio()).toBe(0);
      expect(imported.mightContain('anything')).toBe(false);
    });

    it('should preserve full filter state', () => {
      const original = new BloomFilter({
        expectedItems: 50,
        falsePositiveRate: 0.01,
      });

      // Fill to capacity
      for (let i = 0; i < 50; i++) {
        original.add(`item-${i}`);
      }

      const state = original.export();
      const imported = BloomFilter.import(state);

      // Verify all items
      for (let i = 0; i < 50; i++) {
        expect(imported.mightContain(`item-${i}`)).toBe(true);
      }

      expect(imported.getItemCount()).toBe(original.getItemCount());
    });

    it('should create independent copies', () => {
      const original = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      original.add('original-item');

      const state = original.export();
      const imported = BloomFilter.import(state);

      // Modify original
      original.add('new-item');

      // Imported should not be affected
      expect(original.mightContain('new-item')).toBe(true);
      expect(imported.mightContain('new-item')).toBe(false);
      expect(original.getItemCount()).toBe(2);
      expect(imported.getItemCount()).toBe(1);
    });
  });

  describe('merge() - Combining filters', () => {
    it('should merge two compatible filters (OR operation)', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      const filter2 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter1.add('item1');
      filter1.add('item2');

      filter2.add('item3');
      filter2.add('item4');

      // Merge filter2 into filter1
      filter1.merge(filter2);

      // filter1 should contain all items
      expect(filter1.mightContain('item1')).toBe(true);
      expect(filter1.mightContain('item2')).toBe(true);
      expect(filter1.mightContain('item3')).toBe(true);
      expect(filter1.mightContain('item4')).toBe(true);
    });

    it('should update item count to maximum', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      const filter2 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter1.add('a');
      filter1.add('b');

      filter2.add('c');
      filter2.add('d');
      filter2.add('e');

      expect(filter1.getItemCount()).toBe(2);
      expect(filter2.getItemCount()).toBe(3);

      filter1.merge(filter2);

      // Should take the max count
      expect(filter1.getItemCount()).toBe(3);
    });

    it('should throw error for incompatible sizes', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      const filter2 = new BloomFilter({
        expectedItems: 1000,
        falsePositiveRate: 0.01,
      });

      expect(() => filter1.merge(filter2)).toThrow(
        'Cannot merge bloom filters with different configurations'
      );
    });

    it('should throw error for incompatible hash counts', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
        size: 1000,
        hashFunctions: 5,
      });
      const filter2 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
        size: 1000,
        hashFunctions: 7,
      });

      expect(() => filter1.merge(filter2)).toThrow(
        'Cannot merge bloom filters with different configurations'
      );
    });

    it('should handle merging empty filters', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      const filter2 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter1.add('item1');

      filter1.merge(filter2);

      expect(filter1.mightContain('item1')).toBe(true);
      expect(filter1.getItemCount()).toBe(1);
    });

    it('should handle merging into empty filter', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      const filter2 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter2.add('item1');

      filter1.merge(filter2);

      expect(filter1.mightContain('item1')).toBe(true);
      expect(filter1.getItemCount()).toBe(1);
    });

    it('should not modify source filter', () => {
      const filter1 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });
      const filter2 = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter1.add('item1');
      filter2.add('item2');

      const filter2CountBefore = filter2.getItemCount();
      const filter2FillBefore = filter2.getFillRatio();

      filter1.merge(filter2);

      // filter2 should be unchanged
      expect(filter2.getItemCount()).toBe(filter2CountBefore);
      expect(filter2.getFillRatio()).toBe(filter2FillBefore);
      expect(filter2.mightContain('item1')).toBe(false);
    });
  });

  describe('calculateOptimalParams() - Parameter calculation', () => {
    it('should calculate reasonable parameters', () => {
      const params = calculateOptimalParams(100000, 0.01);

      expect(params.size).toBeGreaterThan(0);
      expect(params.hashFunctions).toBeGreaterThan(0);
      expect(params.hashFunctions).toBeLessThan(20); // Sanity check
    });

    it('should return larger size for lower FPR', () => {
      const params1 = calculateOptimalParams(1000, 0.1);
      const params2 = calculateOptimalParams(1000, 0.01);
      const params3 = calculateOptimalParams(1000, 0.001);

      expect(params2.size).toBeGreaterThan(params1.size);
      expect(params3.size).toBeGreaterThan(params2.size);
    });

    it('should return larger size for more items', () => {
      const params1 = calculateOptimalParams(1000, 0.01);
      const params2 = calculateOptimalParams(10000, 0.01);
      const params3 = calculateOptimalParams(100000, 0.01);

      expect(params2.size).toBeGreaterThan(params1.size);
      expect(params3.size).toBeGreaterThan(params2.size);
    });

    it('should always return at least 1 hash function', () => {
      const params = calculateOptimalParams(1, 0.5);
      expect(params.hashFunctions).toBeGreaterThanOrEqual(1);
    });

    it('should match documented example', () => {
      // From header: 100K items, 1% FPR => ~958,506 bits, 7 hash functions
      const params = calculateOptimalParams(100000, 0.01);

      expect(params.size).toBeGreaterThan(950000);
      expect(params.size).toBeLessThan(970000);
      expect(params.hashFunctions).toBe(7);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty filter queries', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      expect(filter.mightContain('anything')).toBe(false);
      expect(filter.mightContain('')).toBe(false);
      expect(filter.getFillRatio()).toBe(0);
      expect(filter.getItemCount()).toBe(0);
    });

    it('should handle empty string', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter.add('');
      expect(filter.mightContain('')).toBe(true);
      expect(filter.getItemCount()).toBe(1);
    });

    it('should handle very long strings', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const longString = 'x'.repeat(10000);
      filter.add(longString);

      expect(filter.mightContain(longString)).toBe(true);
      expect(filter.getItemCount()).toBe(1);
    });

    it('should handle unicode and special characters', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const items = [
        '你好世界',
        '🎉🎊🎈',
        'café',
        'naïve',
        '\n\t\r',
        '\\n\\t',
      ];

      items.forEach((item) => filter.add(item));

      items.forEach((item) => {
        expect(filter.mightContain(item)).toBe(true);
      });
    });

    it('should handle very small filter', () => {
      const filter = new BloomFilter({
        expectedItems: 1,
        falsePositiveRate: 0.5,
      });

      filter.add('item');
      expect(filter.mightContain('item')).toBe(true);
    });

    it('should handle very large item counts', () => {
      const filter = new BloomFilter({
        expectedItems: 10000,
        falsePositiveRate: 0.01,
      });

      // Add many items
      for (let i = 0; i < 5000; i++) {
        filter.add(`item-${i}`);
      }

      expect(filter.getItemCount()).toBe(5000);
      expect(filter.getFillRatio()).toBeGreaterThan(0);
      expect(filter.getFillRatio()).toBeLessThanOrEqual(1);
    });

    it('should handle overfilling gracefully', () => {
      const filter = new BloomFilter({
        expectedItems: 10,
        falsePositiveRate: 0.01,
      });

      // Add 10x expected items
      for (let i = 0; i < 100; i++) {
        filter.add(`item-${i}`);
      }

      expect(filter.getItemCount()).toBe(100);
      expect(filter.getFillRatio()).toBeLessThanOrEqual(1);

      // Should still work, but FPR will be higher
      expect(filter.mightContain('item-0')).toBe(true);
      expect(filter.mightContain('item-50')).toBe(true);
      expect(filter.mightContain('item-99')).toBe(true);
    });
  });

  describe('Performance - O(1) operations', () => {
    it('should have consistent add() performance', () => {
      const filter = new BloomFilter({
        expectedItems: 10000,
        falsePositiveRate: 0.01,
      });

      const times: number[] = [];

      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        filter.add(`item-${i}`);
        const end = performance.now();
        times.push(end - start);
      }

      // All operations should be roughly same speed (allow 20x for test env jitter)
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(maxTime).toBeLessThan(avgTime * 20);
    });

    it('should have consistent mightContain() performance', () => {
      const filter = new BloomFilter({
        expectedItems: 10000,
        falsePositiveRate: 0.01,
      });

      // Add items
      for (let i = 0; i < 1000; i++) {
        filter.add(`item-${i}`);
      }

      const times: number[] = [];

      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        filter.mightContain(`item-${i}`);
        const end = performance.now();
        times.push(end - start);
      }

      // Allow variance in timing (20x) due to test environment jitter
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(maxTime).toBeLessThan(avgTime * 20);
    });

    it('should handle bulk operations efficiently', () => {
      const filter = new BloomFilter({
        expectedItems: 100000,
        falsePositiveRate: 0.01,
      });

      const start = performance.now();

      // Add 10K items
      for (let i = 0; i < 10000; i++) {
        filter.add(`message-${i}`);
      }

      const addTime = performance.now() - start;

      // Should complete in reasonable time (< 1 second for 10K items)
      expect(addTime).toBeLessThan(1000);

      const queryStart = performance.now();

      // Query 10K items
      for (let i = 0; i < 10000; i++) {
        filter.mightContain(`message-${i}`);
      }

      const queryTime = performance.now() - queryStart;

      // Queries should also complete quickly
      expect(queryTime).toBeLessThan(1000);
    });
  });

  describe('createBloomFilter() - Factory function', () => {
    it('should create filter with specified parameters', () => {
      const filter = createBloomFilter(1000, 0.05);

      expect(filter).toBeInstanceOf(BloomFilter);
      expect(filter.getItemCount()).toBe(0);
    });

    it('should use default FPR when not specified', () => {
      const filter = createBloomFilter(1000);

      expect(filter).toBeInstanceOf(BloomFilter);
      const info = filter.getInfo();
      expect(info.estimatedFPR).toBeLessThan(0.01);
    });
  });

  describe('getInfo() - Information retrieval', () => {
    it('should return complete information object', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      filter.add('test');

      const info = filter.getInfo();

      expect(info).toHaveProperty('size');
      expect(info).toHaveProperty('hashFunctions');
      expect(info).toHaveProperty('itemCount');
      expect(info).toHaveProperty('fillRatio');
      expect(info).toHaveProperty('estimatedFPR');
      expect(info).toHaveProperty('memorySizeBytes');

      expect(typeof info.size).toBe('number');
      expect(typeof info.hashFunctions).toBe('number');
      expect(typeof info.itemCount).toBe('number');
      expect(typeof info.fillRatio).toBe('number');
      expect(typeof info.estimatedFPR).toBe('number');
      expect(typeof info.memorySizeBytes).toBe('number');
    });

    it('should reflect current state accurately', () => {
      const filter = new BloomFilter({
        expectedItems: 100,
        falsePositiveRate: 0.01,
      });

      const info1 = filter.getInfo();
      expect(info1.itemCount).toBe(0);
      expect(info1.fillRatio).toBe(0);

      filter.add('item1');
      filter.add('item2');

      const info2 = filter.getInfo();
      expect(info2.itemCount).toBe(2);
      expect(info2.fillRatio).toBeGreaterThan(0);

      filter.clear();

      const info3 = filter.getInfo();
      expect(info3.itemCount).toBe(0);
      expect(info3.fillRatio).toBe(0);
    });
  });

  describe('DEFAULT_BLOOM_CONFIG', () => {
    it('should have expected values', () => {
      expect(DEFAULT_BLOOM_CONFIG.expectedItems).toBe(100000);
      expect(DEFAULT_BLOOM_CONFIG.falsePositiveRate).toBe(0.01);
      expect(DEFAULT_BLOOM_CONFIG.hashFunctions).toBe(7);
    });

    it('should work when used directly', () => {
      const filter = new BloomFilter(DEFAULT_BLOOM_CONFIG);

      expect(filter).toBeInstanceOf(BloomFilter);
      const info = filter.getInfo();
      expect(info.hashFunctions).toBe(7);
    });
  });
});
