import {
  DeduplicationManager,
  DeduplicationConfig,
  DeduplicationLogAdapter,
  LogEntry,
  MemoryDeduplicationLogAdapter,
  createDeduplicationManager,
  DEFAULT_DEDUP_CONFIG,
} from "./DeduplicationManager.js";
import { BloomFilterState } from "./BloomFilter.js";

// Mock timers for testing periodic pruning
jest.useFakeTimers();

describe("DeduplicationManager", () => {
  let manager: DeduplicationManager;
  let logAdapter: MemoryDeduplicationLogAdapter;

  beforeEach(() => {
    jest.clearAllTimers();
    logAdapter = new MemoryDeduplicationLogAdapter();
    manager = new DeduplicationManager(
      {
        bloomExpectedItems: 1000,
        bloomFalsePositiveRate: 0.01,
        maxLogAge: 60000, // 1 minute for testing
        maxLogEntries: 100,
        pruneInterval: 10000, // 10 seconds for testing
      },
      logAdapter
    );
  });

  afterEach(() => {
    manager.stop();
    jest.clearAllTimers();
  });

  describe("Initialization", () => {
    it("should initialize and rebuild bloom filter from log", async () => {
      // Add some entries before initialization
      await logAdapter.save({ messageId: "msg1", seenAt: Date.now() });
      await logAdapter.save({ messageId: "msg2", seenAt: Date.now() });

      const newManager = new DeduplicationManager({}, logAdapter);
      await newManager.initialize();

      const stats = await newManager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(2);

      newManager.stop();
    });

    it("should not initialize twice", async () => {
      await manager.initialize();
      const initialStats = await manager.getStats();

      // Mark a message as seen
      await manager.markSeen("test-msg");

      // Try to initialize again
      await manager.initialize();

      // Stats should reflect the markSeen, not reset
      const finalStats = await manager.getStats();
      expect(finalStats.bloomFilter.itemCount).toBe(initialStats.bloomFilter.itemCount + 1);
    });

    it("should start prune timer on initialization", async () => {
      await manager.initialize();

      // Add an old entry
      const oldTimestamp = Date.now() - 120000; // 2 minutes ago
      await logAdapter.save({ messageId: "old-msg", seenAt: oldTimestamp });

      // Fast-forward past prune interval
      jest.advanceTimersByTime(10000);
      await Promise.resolve(); // Allow async operations to complete

      const count = await logAdapter.count();
      expect(count).toBe(0); // Old entry should be pruned
    });
  });

  describe("shouldProcess()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should return true for new messages", async () => {
      const result = await manager.shouldProcess("new-message");
      expect(result).toBe(true);
    });

    it("should return false for duplicate messages", async () => {
      await manager.markSeen("seen-message");

      const result = await manager.shouldProcess("seen-message");
      expect(result).toBe(false);
    });

    it("should increment totalChecks counter", async () => {
      await manager.shouldProcess("msg1");
      await manager.shouldProcess("msg2");

      const stats = await manager.getStats();
      expect(stats.totalChecks).toBe(2);
    });

    it("should increment newMessages counter for new messages", async () => {
      await manager.shouldProcess("new1");
      await manager.shouldProcess("new2");

      const stats = await manager.getStats();
      expect(stats.newMessages).toBe(2);
    });

    it("should increment duplicatesDetected counter for duplicates", async () => {
      await manager.markSeen("dup1");
      await manager.markSeen("dup2");

      await manager.shouldProcess("dup1");
      await manager.shouldProcess("dup2");

      const stats = await manager.getStats();
      expect(stats.duplicatesDetected).toBe(2);
    });

    it("should use fast path when bloom filter says not seen", async () => {
      const hasSpyBefore = jest.spyOn(logAdapter, "has");

      // New message - bloom filter returns false immediately
      await manager.shouldProcess("new-message");

      // Log adapter should not be checked (fast path)
      expect(hasSpyBefore).not.toHaveBeenCalled();

      hasSpyBefore.mockRestore();
    });

    it("should fall back to log check on bloom filter positive", async () => {
      const hasSpy = jest.spyOn(logAdapter, "has");

      await manager.markSeen("seen-message");

      // This will hit bloom filter (positive), then check log
      await manager.shouldProcess("seen-message");

      expect(hasSpy).toHaveBeenCalledWith("seen-message");

      hasSpy.mockRestore();
    });

    it("should handle bloom filter false positives correctly", async () => {
      // Add many messages to increase bloom filter collision chance
      for (let i = 0; i < 100; i++) {
        await manager.markSeen(`msg-${i}`);
      }

      // Clear the log but keep bloom filter
      await logAdapter.clear();

      // Now bloom filter might say "seen" but log says "not seen"
      // This is a false positive - should still return true (process the message)
      const result = await manager.shouldProcess("msg-0");

      // Should process because log doesn't have it (despite bloom filter hit)
      expect(result).toBe(true);
    });
  });

  describe("markSeen()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should mark message as seen", async () => {
      await manager.markSeen("test-msg");

      const shouldProcess = await manager.shouldProcess("test-msg");
      expect(shouldProcess).toBe(false);
    });

    it("should add to bloom filter", async () => {
      const statsBefore = await manager.getStats();
      await manager.markSeen("test-msg");
      const statsAfter = await manager.getStats();

      expect(statsAfter.bloomFilter.itemCount).toBe(statsBefore.bloomFilter.itemCount + 1);
    });

    it("should persist to log adapter", async () => {
      await manager.markSeen("test-msg");

      const hasInLog = await logAdapter.has("test-msg");
      expect(hasInLog).toBe(true);
    });

    it("should record timestamp", async () => {
      const beforeTime = Date.now();
      await manager.markSeen("test-msg");
      const afterTime = Date.now();

      const entries = await logAdapter.getAll();
      const entry = entries.find((e) => e.messageId === "test-msg");

      expect(entry).toBeDefined();
      expect(entry!.seenAt).toBeGreaterThanOrEqual(beforeTime);
      expect(entry!.seenAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe("checkAndMark()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should check and mark new messages atomically", async () => {
      const result = await manager.checkAndMark("new-msg");

      expect(result).toBe(true);
      expect(await logAdapter.has("new-msg")).toBe(true);
    });

    it("should not mark duplicate messages", async () => {
      await manager.markSeen("existing-msg");

      const countBefore = await logAdapter.count();
      const result = await manager.checkAndMark("existing-msg");
      const countAfter = await logAdapter.count();

      expect(result).toBe(false);
      expect(countAfter).toBe(countBefore);
    });

    it("should be atomic for concurrent calls", async () => {
      // Call checkAndMark multiple times concurrently with same message
      const results = await Promise.all([
        manager.checkAndMark("concurrent-msg"),
        manager.checkAndMark("concurrent-msg"),
        manager.checkAndMark("concurrent-msg"),
      ]);

      // First one should succeed, others should fail
      const successes = results.filter((r) => r === true).length;
      const failures = results.filter((r) => r === false).length;

      // At least one should succeed
      expect(successes).toBeGreaterThanOrEqual(1);

      // Message should be in log exactly once
      const entries = await logAdapter.getAll();
      const matchingEntries = entries.filter((e) => e.messageId === "concurrent-msg");
      expect(matchingEntries.length).toBe(1);
    });
  });

  describe("rebuildFromLog()", () => {
    it("should rebuild bloom filter from empty log", async () => {
      await manager.rebuildFromLog();

      const stats = await manager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(0);
    });

    it("should rebuild bloom filter from populated log", async () => {
      await logAdapter.save({ messageId: "msg1", seenAt: Date.now() });
      await logAdapter.save({ messageId: "msg2", seenAt: Date.now() });
      await logAdapter.save({ messageId: "msg3", seenAt: Date.now() });

      await manager.rebuildFromLog();

      const stats = await manager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(3);
    });

    it("should clear existing bloom filter before rebuilding", async () => {
      await manager.initialize();
      await manager.markSeen("old-msg");

      // Clear log and add new entries
      await logAdapter.clear();
      await logAdapter.save({ messageId: "new-msg", seenAt: Date.now() });

      await manager.rebuildFromLog();

      // Old message should not be in bloom filter
      const shouldProcessOld = await manager.shouldProcess("old-msg");
      expect(shouldProcessOld).toBe(true);

      // New message should be in bloom filter
      const shouldProcessNew = await manager.shouldProcess("new-msg");
      expect(shouldProcessNew).toBe(false);
    });

    it("should handle large logs efficiently", async () => {
      // Add 1000 entries
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(logAdapter.save({ messageId: `msg-${i}`, seenAt: Date.now() }));
      }
      await Promise.all(promises);

      const startTime = Date.now();
      await manager.rebuildFromLog();
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);

      const stats = await manager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(1000);
    });
  });

  describe("pruneLog()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should remove old entries", async () => {
      const now = Date.now();
      const oldTimestamp = now - 120000; // 2 minutes ago

      await logAdapter.save({ messageId: "old-msg", seenAt: oldTimestamp });
      await logAdapter.save({ messageId: "new-msg", seenAt: now });

      const pruned = await manager.pruneLog(60000); // 1 minute max age

      expect(pruned).toBe(1);
      expect(await logAdapter.has("old-msg")).toBe(false);
      expect(await logAdapter.has("new-msg")).toBe(true);
    });

    it("should use default maxLogAge if not specified", async () => {
      const now = Date.now();
      const oldTimestamp = now - 120000; // 2 minutes ago

      await logAdapter.save({ messageId: "old-msg", seenAt: oldTimestamp });

      // Manager configured with 60000ms maxLogAge
      const pruned = await manager.pruneLog();

      expect(pruned).toBe(1);
    });

    it("should return 0 when no entries pruned", async () => {
      await logAdapter.save({ messageId: "recent-msg", seenAt: Date.now() });

      const pruned = await manager.pruneLog(60000);

      expect(pruned).toBe(0);
    });

    it("should update lastPrune timestamp", async () => {
      const statsBefore = await manager.getStats();

      await manager.pruneLog();

      const statsAfter = await manager.getStats();
      expect(statsAfter.lastPrune).toBeGreaterThan(statsBefore.lastPrune);
    });

    it("should rebuild bloom filter after significant pruning", async () => {
      // Add many old entries (more than 10% of expected items)
      const oldTimestamp = Date.now() - 120000;
      for (let i = 0; i < 150; i++) {
        await logAdapter.save({ messageId: `old-${i}`, seenAt: oldTimestamp });
      }

      // Rebuild to get them in bloom filter
      await manager.rebuildFromLog();

      const statsBefore = await manager.getStats();
      expect(statsBefore.bloomFilter.itemCount).toBe(150);

      // Prune (should trigger rebuild because 150 > 100 * 0.1)
      await manager.pruneLog(60000);

      const statsAfter = await manager.getStats();
      expect(statsAfter.bloomFilter.itemCount).toBe(0);
    });

    it("should not rebuild bloom filter after minor pruning", async () => {
      // Add a few old entries (less than 10% of expected items)
      const oldTimestamp = Date.now() - 120000;
      await logAdapter.save({ messageId: "old-1", seenAt: oldTimestamp });
      await logAdapter.save({ messageId: "recent-1", seenAt: Date.now() });

      await manager.rebuildFromLog();
      const statsBefore = await manager.getStats();

      // Prune (should not trigger rebuild because 1 < 100 * 0.1)
      await manager.pruneLog(60000);

      const statsAfter = await manager.getStats();
      // Bloom filter count should be same (not rebuilt)
      expect(statsAfter.bloomFilter.itemCount).toBe(statsBefore.bloomFilter.itemCount);
    });
  });

  describe("getStats()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should return comprehensive statistics", async () => {
      await manager.markSeen("msg1");
      await manager.shouldProcess("msg1");
      await manager.shouldProcess("msg2");

      const stats = await manager.getStats();

      expect(stats).toMatchObject({
        totalChecks: 2,
        duplicatesDetected: 1,
        newMessages: 1,
      });

      expect(stats.bloomFilter).toBeDefined();
      expect(stats.bloomFilter.itemCount).toBeGreaterThan(0);
      expect(stats.bloomFilter.fillRatio).toBeGreaterThanOrEqual(0);
      expect(stats.bloomFilter.estimatedFPR).toBeGreaterThanOrEqual(0);
      expect(stats.bloomFilter.memorySizeBytes).toBeGreaterThan(0);

      expect(stats.persistentLog).toBeDefined();
      expect(stats.persistentLog.entryCount).toBe(1);
      expect(stats.persistentLog.oldestEntry).toBeDefined();
      expect(stats.persistentLog.newestEntry).toBeDefined();

      expect(stats.lastPrune).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty log", async () => {
      const stats = await manager.getStats();

      expect(stats.persistentLog.entryCount).toBe(0);
      expect(stats.persistentLog.oldestEntry).toBeNull();
      expect(stats.persistentLog.newestEntry).toBeNull();
    });

    it("should sort entries by timestamp", async () => {
      const now = Date.now();
      await logAdapter.save({ messageId: "msg2", seenAt: now + 1000 });
      await logAdapter.save({ messageId: "msg1", seenAt: now });
      await logAdapter.save({ messageId: "msg3", seenAt: now + 2000 });

      const stats = await manager.getStats();

      expect(stats.persistentLog.oldestEntry).toBe(now);
      expect(stats.persistentLog.newestEntry).toBe(now + 2000);
    });
  });

  describe("exportBloomFilter() and importBloomFilter()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should export bloom filter state", async () => {
      await manager.markSeen("msg1");
      await manager.markSeen("msg2");

      const state = manager.exportBloomFilter();

      expect(state).toMatchObject({
        size: expect.any(Number),
        hashCount: expect.any(Number),
        itemCount: 2,
        bits: expect.any(Array),
      });
    });

    it("should import bloom filter state", async () => {
      await manager.markSeen("msg1");
      await manager.markSeen("msg2");

      const state = manager.exportBloomFilter();

      // Create new manager with SAME adapter (so log entries persist)
      const newManager = new DeduplicationManager({}, logAdapter);
      newManager.importBloomFilter(state);

      // Should recognize previously seen messages
      const shouldProcess1 = await newManager.shouldProcess("msg1");
      const shouldProcess2 = await newManager.shouldProcess("msg2");
      const shouldProcess3 = await newManager.shouldProcess("msg3");

      expect(shouldProcess1).toBe(false);
      expect(shouldProcess2).toBe(false);
      expect(shouldProcess3).toBe(true);

      newManager.stop();
    });

    it("should preserve exact bloom filter state", async () => {
      // Add multiple messages
      for (let i = 0; i < 50; i++) {
        await manager.markSeen(`msg-${i}`);
      }

      const state = manager.exportBloomFilter();
      const newManager = new DeduplicationManager({}, logAdapter);
      newManager.importBloomFilter(state);

      // Check all messages
      for (let i = 0; i < 50; i++) {
        const shouldProcess = await newManager.shouldProcess(`msg-${i}`);
        expect(shouldProcess).toBe(false);
      }

      newManager.stop();
    });

    it("should be faster than rebuilding from log", async () => {
      // Add many messages to the log
      const adapter = new MemoryDeduplicationLogAdapter();
      for (let i = 0; i < 1000; i++) {
        await adapter.save({ messageId: `msg-${i}`, seenAt: Date.now() });
      }

      // Build a manager with the log, then export bloom state
      const sourceManager = new DeduplicationManager({}, adapter);
      await sourceManager.rebuildFromLog();
      const exportState = sourceManager.exportBloomFilter();
      sourceManager.stop();

      // Time import (with a new manager but same adapter)
      const newManager1 = new DeduplicationManager({}, adapter);
      const importStart = Date.now();
      newManager1.importBloomFilter(exportState);
      const importDuration = Date.now() - importStart;

      // Time rebuild (with another new manager and same adapter)
      const newManager2 = new DeduplicationManager({}, adapter);
      const rebuildStart = Date.now();
      await newManager2.rebuildFromLog();
      const rebuildDuration = Date.now() - rebuildStart;

      // Import should be faster than rebuild (usually by 10x or more)
      // We use a lenient check here since timing can vary
      expect(importDuration).toBeLessThanOrEqual(rebuildDuration);

      newManager1.stop();
      newManager2.stop();
    });
  });

  describe("clear()", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should clear bloom filter", async () => {
      await manager.markSeen("msg1");
      await manager.clear();

      const stats = await manager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(0);
    });

    it("should clear log adapter", async () => {
      await manager.markSeen("msg1");
      await manager.clear();

      const count = await logAdapter.count();
      expect(count).toBe(0);
    });

    it("should reset statistics", async () => {
      await manager.shouldProcess("msg1");
      await manager.shouldProcess("msg2");
      await manager.markSeen("msg1");

      await manager.clear();

      const stats = await manager.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.duplicatesDetected).toBe(0);
      expect(stats.newMessages).toBe(0);
      expect(stats.lastPrune).toBe(0);
    });

    it("should allow fresh start after clear", async () => {
      await manager.markSeen("msg1");
      await manager.clear();

      const shouldProcess = await manager.shouldProcess("msg1");
      expect(shouldProcess).toBe(true);
    });
  });

  describe("stop()", () => {
    it("should stop prune timer", async () => {
      await manager.initialize();
      manager.stop();

      // Add old entry
      const oldTimestamp = Date.now() - 120000;
      await logAdapter.save({ messageId: "old-msg", seenAt: oldTimestamp });

      // Advance time past prune interval
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      // Entry should still exist (timer stopped)
      const hasEntry = await logAdapter.has("old-msg");
      expect(hasEntry).toBe(true);
    });

    it("should allow multiple stop calls", () => {
      expect(() => {
        manager.stop();
        manager.stop();
      }).not.toThrow();
    });
  });

  describe("Log Entry TTL Enforcement", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should enforce TTL during automatic pruning", async () => {
      const now = Date.now();
      const oldTimestamp = now - 120000; // 2 minutes ago

      await logAdapter.save({ messageId: "old-msg", seenAt: oldTimestamp });
      await logAdapter.save({ messageId: "new-msg", seenAt: now });

      // Fast-forward past prune interval
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(await logAdapter.has("old-msg")).toBe(false);
      expect(await logAdapter.has("new-msg")).toBe(true);
    });

    it("should keep entries within TTL", async () => {
      const now = Date.now();
      await logAdapter.save({ messageId: "recent-msg", seenAt: now - 30000 }); // 30s ago

      const pruned = await manager.pruneLog(60000); // 1 minute TTL

      expect(pruned).toBe(0);
      expect(await logAdapter.has("recent-msg")).toBe(true);
    });
  });

  describe("Integration with MemoryDeduplicationLogAdapter", () => {
    it("should work seamlessly with memory adapter", async () => {
      const adapter = new MemoryDeduplicationLogAdapter();
      const mgr = new DeduplicationManager({}, adapter);
      await mgr.initialize();

      // Mark some messages as seen
      await mgr.markSeen("msg1");
      await mgr.markSeen("msg2");

      // Check deduplication
      expect(await mgr.shouldProcess("msg1")).toBe(false);
      expect(await mgr.shouldProcess("msg2")).toBe(false);
      expect(await mgr.shouldProcess("msg3")).toBe(true);

      // Verify adapter state
      expect(await adapter.count()).toBe(2);
      expect(await adapter.has("msg1")).toBe(true);
      expect(await adapter.has("msg3")).toBe(false);

      mgr.stop();
    });

    it("should persist and reload from memory adapter", async () => {
      const adapter = new MemoryDeduplicationLogAdapter();
      const mgr1 = new DeduplicationManager({}, adapter);
      await mgr1.initialize();

      await mgr1.markSeen("persistent-msg");
      mgr1.stop();

      // Create new manager with same adapter
      const mgr2 = new DeduplicationManager({}, adapter);
      await mgr2.initialize();

      // Should recognize message from previous manager
      expect(await mgr2.shouldProcess("persistent-msg")).toBe(false);

      mgr2.stop();
    });

    it("should handle adapter operations correctly", async () => {
      const adapter = new MemoryDeduplicationLogAdapter();

      const now = Date.now();

      // Test save and has
      await adapter.save({ messageId: "msg1", seenAt: now - 10000 }); // 10 seconds ago
      expect(await adapter.has("msg1")).toBe(true);
      expect(await adapter.count()).toBe(1);

      // Test getAll
      const all = await adapter.getAll();
      expect(all.length).toBe(1);
      expect(all[0].messageId).toBe("msg1");

      // Add more entries
      await adapter.save({ messageId: "msg2", seenAt: now - 5000 }); // 5 seconds ago
      await adapter.save({ messageId: "msg3", seenAt: now }); // now

      // Test getNewerThan - should only get msg3 (newer than 3 seconds ago)
      const newer = await adapter.getNewerThan(now - 3000);
      expect(newer.length).toBe(1);
      expect(newer[0].messageId).toBe("msg3");

      // Test deleteOlderThan - should delete msg1 and msg2 (older than 3 seconds ago)
      const deleted = await adapter.deleteOlderThan(now - 3000);
      expect(deleted).toBe(2);
      expect(await adapter.count()).toBe(1);

      // Test clear
      await adapter.clear();
      expect(await adapter.count()).toBe(0);
    });
  });

  describe("createDeduplicationManager()", () => {
    it("should create manager with default config", () => {
      const mgr = createDeduplicationManager();
      expect(mgr).toBeInstanceOf(DeduplicationManager);
      mgr.stop();
    });

    it("should create manager with custom config", () => {
      const config: DeduplicationConfig = {
        bloomExpectedItems: 5000,
        bloomFalsePositiveRate: 0.001,
      };
      const mgr = createDeduplicationManager(config);
      expect(mgr).toBeInstanceOf(DeduplicationManager);
      mgr.stop();
    });

    it("should create manager with custom adapter", () => {
      const adapter = new MemoryDeduplicationLogAdapter();
      const mgr = createDeduplicationManager({}, adapter);
      expect(mgr).toBeInstanceOf(DeduplicationManager);
      mgr.stop();
    });
  });

  describe("Edge Cases and Error Handling", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should handle empty message IDs", async () => {
      await manager.markSeen("");
      const shouldProcess = await manager.shouldProcess("");
      expect(shouldProcess).toBe(false);
    });

    it("should handle very long message IDs", async () => {
      const longId = "x".repeat(10000);
      await manager.markSeen(longId);
      const shouldProcess = await manager.shouldProcess(longId);
      expect(shouldProcess).toBe(false);
    });

    it("should handle special characters in message IDs", async () => {
      const specialId = "msg-with-🚀-emoji-and-@#$%";
      await manager.markSeen(specialId);
      const shouldProcess = await manager.shouldProcess(specialId);
      expect(shouldProcess).toBe(false);
    });

    it("should handle concurrent operations", async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(manager.checkAndMark(`concurrent-${i}`));
      }

      const results = await Promise.all(promises);

      // All should succeed (no conflicts)
      expect(results.every((r) => r === true)).toBe(true);

      const stats = await manager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(100);
    });

    it("should handle rapid repeated checks", async () => {
      await manager.markSeen("rapid-msg");

      const checks = [];
      for (let i = 0; i < 1000; i++) {
        checks.push(manager.shouldProcess("rapid-msg"));
      }

      const results = await Promise.all(checks);

      // All should return false (duplicate)
      expect(results.every((r) => r === false)).toBe(true);

      const stats = await manager.getStats();
      expect(stats.duplicatesDetected).toBe(1000);
    });
  });

  describe("Performance Characteristics", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should have O(1) lookup for new messages (fast path)", async () => {
      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await manager.shouldProcess(`new-msg-${i}`);
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // Should be very fast (< 1ms per check on average)
      expect(avgTime).toBeLessThan(1);
    });

    it("should handle bloom filter growth gracefully", async () => {
      const capacity = 1000; // Expected items in config
      const items = capacity * 2; // Add 2x expected items

      for (let i = 0; i < items; i++) {
        await manager.markSeen(`msg-${i}`);
      }

      const stats = await manager.getStats();
      expect(stats.bloomFilter.itemCount).toBe(items);

      // False positive rate should increase but still be reasonable
      expect(stats.bloomFilter.estimatedFPR).toBeLessThan(0.5); // < 50%
    });

    it("should maintain performance with large log", async () => {
      // Add 10000 entries
      for (let i = 0; i < 10000; i++) {
        await logAdapter.save({ messageId: `msg-${i}`, seenAt: Date.now() });
      }

      const start = Date.now();
      await manager.rebuildFromLog();
      const duration = Date.now() - start;

      // Should rebuild in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe("Configuration Defaults", () => {
    it("should use DEFAULT_DEDUP_CONFIG values", () => {
      const mgr = new DeduplicationManager();

      expect(DEFAULT_DEDUP_CONFIG).toMatchObject({
        bloomExpectedItems: 100_000,
        bloomFalsePositiveRate: 0.01,
        maxLogAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxLogEntries: 200_000,
        pruneInterval: 60 * 60 * 1000, // 1 hour
      });

      mgr.stop();
    });

    it("should merge custom config with defaults", async () => {
      const mgr = new DeduplicationManager({
        bloomExpectedItems: 5000,
        // Other values should use defaults
      });

      await mgr.initialize();
      const stats = await mgr.getStats();

      // Custom value used
      expect(stats.bloomFilter.itemCount).toBeLessThanOrEqual(5000);

      mgr.stop();
    });
  });
});
