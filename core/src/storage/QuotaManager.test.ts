/**
 * QuotaManager Tests
 *
 * Tests comprehensive quota management functionality including:
 * - Status calculation (OK → WARNING → CRITICAL → FULL)
 * - Threshold enforcement (80% warning, 95% critical)
 * - Room checking and eviction
 * - Smart priority-aware eviction
 * - Protection of own undelivered messages
 * - Periodic maintenance
 */

import {
  QuotaManager,
  QuotaStatus,
  DEFAULT_QUOTA_CONFIG,
  formatBytes,
  createQuotaManager,
  type QuotaConfig,
  type QuotaWarning,
  type EvictionResult,
} from "./QuotaManager.js";
import {
  MessagePriority,
  DeliveryStatus,
  type MessageStore,
  type StoredMessage,
  type StorageStats,
} from "./MessageStore.js";
import type { Message, MessageHeader } from "../protocol/message.js";
import { MessageType } from "../protocol/message.js";

// Mock timers for periodic checking tests
jest.useFakeTimers();

/**
 * Create a mock Message for testing
 */
function createMockMessageData(): Message {
  const header: MessageHeader = {
    version: 1,
    type: MessageType.TEXT,
    ttl: 10,
    timestamp: Date.now(),
    senderId: new Uint8Array(32),
    signature: new Uint8Array(64),
  };
  return {
    header,
    payload: new Uint8Array(0),
  };
}

/**
 * Create a mock StoredMessage for testing
 */
function createMockMessage(
  id: string,
  priority: MessagePriority,
  sizeBytes: number,
  options: {
    isOwnMessage?: boolean;
    status?: DeliveryStatus;
    expiresAt?: number;
    createdAt?: number;
  } = {}
): StoredMessage {
  const now = Date.now();
  return {
    id,
    message: createMockMessageData(),
    recipientId: "peer1",
    priority,
    sizeBytes,
    createdAt: options.createdAt ?? now,
    expiresAt: options.expiresAt ?? now + 24 * 60 * 60 * 1000,
    status: options.status ?? DeliveryStatus.PENDING,
    attempts: 0,
    lastAttempt: 0,
    hopCount: 0,
    maxHops: 10,
    routeAttempts: [],
    isOwnMessage: options.isOwnMessage ?? false,
  };
}

/**
 * Create a mock MessageStore
 */
function createMockStore(): jest.Mocked<MessageStore> {
  const messages = new Map<string, StoredMessage>();

  return {
    store: jest.fn(async (msg: StoredMessage) => {
      messages.set(msg.id, msg);
    }),
    get: jest.fn(async (id: string) => messages.get(id) ?? null),
    delete: jest.fn(async (id: string) => {
      messages.delete(id);
    }),
    has: jest.fn(async (id: string) => messages.has(id)),
    query: jest.fn(async () => Array.from(messages.values())),
    getForRelay: jest.fn(async () => []),
    getPendingForRecipient: jest.fn(async () => []),
    getExpired: jest.fn(async () => []),
    bulkStore: jest.fn(async (msgs: StoredMessage[]) => {
      msgs.forEach((msg) => messages.set(msg.id, msg));
    }),
    bulkDelete: jest.fn(async (ids: string[]) => {
      ids.forEach((id) => messages.delete(id));
    }),
    getAllIds: jest.fn(async () => Array.from(messages.keys())),
    getMessagesSince: jest.fn(async () => []),
    getStats: jest.fn(async () => {
      const msgs = Array.from(messages.values());
      const totalBytes = msgs.reduce((sum, m) => sum + m.sizeBytes, 0);
      const byPriority: StorageStats['byPriority'] = {
        [MessagePriority.LOW]: { count: 0, bytes: 0 },
        [MessagePriority.NORMAL]: { count: 0, bytes: 0 },
        [MessagePriority.HIGH]: { count: 0, bytes: 0 },
        [MessagePriority.EMERGENCY]: { count: 0, bytes: 0 },
      };
      const byStatus: StorageStats['byStatus'] = {
        [DeliveryStatus.PENDING]: 0,
        [DeliveryStatus.SENT]: 0,
        [DeliveryStatus.DELIVERED]: 0,
        [DeliveryStatus.FAILED]: 0,
        [DeliveryStatus.EXPIRED]: 0,
      };
      msgs.forEach((m) => {
        byPriority[m.priority].count++;
        byPriority[m.priority].bytes += m.sizeBytes;
        byStatus[m.status]++;
      });
      const timestamps = msgs.map((m) => m.createdAt);
      return {
        totalBytes,
        messageCount: msgs.length,
        byPriority,
        byStatus,
        oldestMessage: timestamps.length > 0 ? Math.min(...timestamps) : 0,
        newestMessage: timestamps.length > 0 ? Math.max(...timestamps) : 0,
        ownMessageCount: msgs.filter((m) => m.isOwnMessage).length,
        relayMessageCount: msgs.filter((m) => !m.isOwnMessage).length,
      };
    }),
    getStorageUsed: jest.fn(async () => {
      return Array.from(messages.values()).reduce(
        (sum, m) => sum + m.sizeBytes,
        0
      );
    }),
    getMessageCount: jest.fn(async () => messages.size),
    evictByPriority: jest.fn(async () => 0),
    pruneExpired: jest.fn(async () => 0),
    updateStatus: jest.fn(async () => {}),
    incrementAttempts: jest.fn(async () => {}),
    clear: jest.fn(async () => {
      messages.clear();
    }),
  } as any;
}

describe("QuotaManager", () => {
  let store: jest.Mocked<MessageStore>;
  let quotaManager: QuotaManager;

  beforeEach(() => {
    jest.clearAllTimers();
    store = createMockStore();
    quotaManager = new QuotaManager(store, {
      maxBytes: 1000,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
      evictionTarget: 0.7,
      checkInterval: 60000,
    });
  });

  afterEach(() => {
    quotaManager.stop();
    jest.clearAllTimers();
  });

  describe("Status Calculation", () => {
    it("should return OK status when under warning threshold", async () => {
      // 700 bytes used out of 1000 = 70% < 80% warning threshold
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 700));

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.OK);
    });

    it("should return WARNING status when over warning threshold but under critical", async () => {
      // 850 bytes used out of 1000 = 85% (80% < 85% < 95%)
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.WARNING);
    });

    it("should return CRITICAL status when over critical threshold", async () => {
      // 960 bytes used out of 1000 = 96% > 95% critical threshold
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 960));

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.CRITICAL);
    });

    it("should return FULL status when at or over max capacity", async () => {
      // 1000 bytes used out of 1000 = 100%
      await store.store(
        createMockMessage("msg1", MessagePriority.NORMAL, 1000)
      );

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.FULL);
    });

    it("should return FULL status when over max capacity", async () => {
      // 1100 bytes used out of 1000 = 110%
      await store.store(
        createMockMessage("msg1", MessagePriority.NORMAL, 1100)
      );

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.FULL);
    });
  });

  describe("Threshold Enforcement", () => {
    it("should enforce 80% warning threshold", async () => {
      const maxBytes = 1000;
      const warningThreshold = 0.8;
      const warningBytes = maxBytes * warningThreshold; // 800 bytes

      quotaManager = new QuotaManager(store, {
        maxBytes,
        warningThreshold,
      });

      // Just under threshold
      await store.store(
        createMockMessage("msg1", MessagePriority.NORMAL, 799)
      );
      expect(await quotaManager.getStatus()).toBe(QuotaStatus.OK);

      // At threshold
      await store.delete("msg1");
      await store.store(
        createMockMessage("msg2", MessagePriority.NORMAL, 800)
      );
      expect(await quotaManager.getStatus()).toBe(QuotaStatus.WARNING);
    });

    it("should enforce 95% critical threshold", async () => {
      const maxBytes = 1000;
      const criticalThreshold = 0.95;
      const criticalBytes = maxBytes * criticalThreshold; // 950 bytes

      quotaManager = new QuotaManager(store, {
        maxBytes,
        criticalThreshold,
      });

      // Just under threshold
      await store.store(
        createMockMessage("msg1", MessagePriority.NORMAL, 949)
      );
      expect(await quotaManager.getStatus()).toBe(QuotaStatus.WARNING);

      // At threshold
      await store.delete("msg1");
      await store.store(
        createMockMessage("msg2", MessagePriority.NORMAL, 950)
      );
      expect(await quotaManager.getStatus()).toBe(QuotaStatus.CRITICAL);
    });
  });

  describe("getQuotaInfo()", () => {
    it("should return detailed quota information", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 600));

      const info = await quotaManager.getQuotaInfo();

      expect(info.status).toBe(QuotaStatus.OK);
      expect(info.usedBytes).toBe(600);
      expect(info.maxBytes).toBe(1000);
      expect(info.usageRatio).toBe(0.6);
      expect(info.messageCount).toBe(1);
      expect(info.oldestMessage).toBeGreaterThan(0);
    });

    it("should reflect current storage state accurately", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 300));
      await store.store(createMockMessage("msg2", MessagePriority.HIGH, 500));

      const info = await quotaManager.getQuotaInfo();

      expect(info.usedBytes).toBe(800);
      expect(info.messageCount).toBe(2);
      expect(info.status).toBe(QuotaStatus.WARNING); // 80%
    });
  });

  describe("canAccept()", () => {
    it("should return true when there is room for new message", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 600));

      // 600 + 300 = 900 < 1000 max
      const canAccept = await quotaManager.canAccept(300);
      expect(canAccept).toBe(true);
    });

    it("should return false when new message would exceed quota", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 800));

      // 800 + 300 = 1100 > 1000 max
      const canAccept = await quotaManager.canAccept(300);
      expect(canAccept).toBe(false);
    });

    it("should return true when new message exactly fits", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 700));

      // 700 + 300 = 1000 = max
      const canAccept = await quotaManager.canAccept(300);
      expect(canAccept).toBe(true);
    });

    it("should return true for empty storage", async () => {
      const canAccept = await quotaManager.canAccept(1000);
      expect(canAccept).toBe(true);
    });
  });

  describe("ensureRoom()", () => {
    it("should return true when room already available", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 500));

      const hasRoom = await quotaManager.ensureRoom(400);
      expect(hasRoom).toBe(true);
    });

    it("should evict messages to make room", async () => {
      // Fill to 900 bytes
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 500));
      await store.store(createMockMessage("msg2", MessagePriority.LOW, 400));

      // Need to add 300 bytes, so total would be 1200
      // Need to evict at least 200 bytes
      const hasRoom = await quotaManager.ensureRoom(300);

      expect(hasRoom).toBe(true);
      expect(store.bulkDelete).toHaveBeenCalled();
    });

    it("should return false if cannot free enough space", async () => {
      // Only own undelivered message (protected)
      await store.store(
        createMockMessage("msg1", MessagePriority.EMERGENCY, 900, {
          isOwnMessage: true,
          status: DeliveryStatus.PENDING,
        })
      );

      // Try to add 300 bytes - need to evict but can't (protected)
      const hasRoom = await quotaManager.ensureRoom(300);

      expect(hasRoom).toBe(false);
    });
  });

  describe("checkAndEvict()", () => {
    it("should return null when under critical threshold", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 700));

      const result = await quotaManager.checkAndEvict();
      expect(result).toBeNull();
    });

    it("should evict when over critical threshold", async () => {
      // 970 bytes = 97% > 95% critical
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 500));
      await store.store(createMockMessage("msg2", MessagePriority.LOW, 470));

      const result = await quotaManager.checkAndEvict();

      expect(result).not.toBeNull();
      expect(result!.messagesEvicted).toBeGreaterThan(0);
      expect(result!.bytesFreed).toBeGreaterThan(0);
    });

    it("should prune expired messages", async () => {
      const now = Date.now();
      // Create expired message
      await store.store(
        createMockMessage("expired", MessagePriority.LOW, 300, {
          expiresAt: now - 1000,
        })
      );

      store.pruneExpired = jest.fn(async () => {
        await store.delete("expired");
        return 1;
      });

      await quotaManager.checkAndEvict();

      expect(store.pruneExpired).toHaveBeenCalled();
    });

    it("should target eviction to reach evictionTarget (70%)", async () => {
      // Fill to 97% (970 bytes)
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 970));

      const result = await quotaManager.checkAndEvict();

      // Should evict to reach 70% = 700 bytes
      // So need to free 270 bytes
      expect(result).not.toBeNull();
      expect(result!.newStats.totalBytes).toBeLessThanOrEqual(700);
    });
  });

  describe("evict() - Smart Eviction Strategy", () => {
    it("should evict expired messages first", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("expired1", MessagePriority.EMERGENCY, 200, {
          expiresAt: now - 1000,
          createdAt: now - 5000,
        })
      );
      await store.store(
        createMockMessage("active", MessagePriority.LOW, 200, {
          expiresAt: now + 10000,
          createdAt: now - 3000,
        })
      );

      const result = await quotaManager.evict(200, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("expired1")).toBe(false);
      expect(await store.has("active")).toBe(true);
    });

    it("should evict LOW priority before NORMAL", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("low", MessagePriority.LOW, 200, {
          createdAt: now - 5000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("normal", MessagePriority.NORMAL, 200, {
          createdAt: now - 6000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(200, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("low")).toBe(false);
      expect(await store.has("normal")).toBe(true);
    });

    it("should evict NORMAL priority before HIGH", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("normal", MessagePriority.NORMAL, 200, {
          createdAt: now - 5000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("high", MessagePriority.HIGH, 200, {
          createdAt: now - 6000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(200, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("normal")).toBe(false);
      expect(await store.has("high")).toBe(true);
    });

    it("should evict HIGH priority before EMERGENCY", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("high", MessagePriority.HIGH, 200, {
          createdAt: now - 5000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("emergency", MessagePriority.EMERGENCY, 200, {
          createdAt: now - 6000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(200, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("high")).toBe(false);
      expect(await store.has("emergency")).toBe(true);
    });

    it("should evict oldest messages within same priority", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("old", MessagePriority.LOW, 200, {
          createdAt: now - 10000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("new", MessagePriority.LOW, 200, {
          createdAt: now - 1000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(200, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("old")).toBe(false);
      expect(await store.has("new")).toBe(true);
    });

    it("should track bytes freed accurately", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 300));
      await store.store(createMockMessage("msg2", MessagePriority.LOW, 400));

      const result = await quotaManager.evict(500, "quota");

      expect(result.bytesFreed).toBeGreaterThanOrEqual(500);
      expect(result.messagesEvicted).toBe(2); // Need both to free 500 bytes
    });

    it("should provide breakdown by priority", async () => {
      await store.store(createMockMessage("low1", MessagePriority.LOW, 200));
      await store.store(createMockMessage("low2", MessagePriority.LOW, 200));
      await store.store(
        createMockMessage("normal1", MessagePriority.NORMAL, 200)
      );

      const result = await quotaManager.evict(400, "quota");

      expect(result.byPriority[MessagePriority.LOW]).toBe(2);
      expect(result.byPriority[MessagePriority.NORMAL]).toBe(0);
    });

    it("should include eviction duration", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 200));

      const result = await quotaManager.evict(200, "quota");

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Protection of Own Undelivered Messages", () => {
    it("should NOT evict own undelivered messages", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("own-pending", MessagePriority.LOW, 300, {
          isOwnMessage: true,
          status: DeliveryStatus.PENDING,
          createdAt: now - 10000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("relay", MessagePriority.LOW, 300, {
          isOwnMessage: false,
          status: DeliveryStatus.PENDING,
          createdAt: now - 5000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(300, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("own-pending")).toBe(true);
      expect(await store.has("relay")).toBe(false);
    });

    it("should evict own DELIVERED messages", async () => {
      await store.store(
        createMockMessage("own-delivered", MessagePriority.LOW, 300, {
          isOwnMessage: true,
          status: DeliveryStatus.DELIVERED,
        })
      );

      const result = await quotaManager.evict(300, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("own-delivered")).toBe(false);
    });

    it("should evict own EXPIRED messages", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("own-expired", MessagePriority.LOW, 300, {
          isOwnMessage: true,
          status: DeliveryStatus.EXPIRED,
          expiresAt: now - 1000,
        })
      );

      const result = await quotaManager.evict(300, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(await store.has("own-expired")).toBe(false);
    });

    it("should protect own SENT messages (waiting for ack)", async () => {
      const now = Date.now();

      await store.store(
        createMockMessage("own-sent", MessagePriority.LOW, 300, {
          isOwnMessage: true,
          status: DeliveryStatus.SENT,
          createdAt: now - 10000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("relay", MessagePriority.LOW, 300, {
          isOwnMessage: false,
          createdAt: now - 5000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(300, "quota");

      expect(await store.has("own-sent")).toBe(true);
      expect(await store.has("relay")).toBe(false);
    });
  });

  describe("onQuotaWarning() - Callback Notifications", () => {
    it("should call callback when status changes", async () => {
      const callback = jest.fn();
      quotaManager.onQuotaWarning(callback);

      // Start at OK
      await quotaManager.checkAndEvict();
      expect(callback).toHaveBeenCalledTimes(0); // No change

      // Move to WARNING
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));
      await quotaManager.checkAndEvict();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: QuotaStatus.WARNING,
          usedBytes: 850,
        })
      );
    });

    it("should NOT call callback when status unchanged", async () => {
      const callback = jest.fn();
      quotaManager.onQuotaWarning(callback);

      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));
      await quotaManager.checkAndEvict();
      expect(callback).toHaveBeenCalledTimes(1);

      // Status still WARNING
      await quotaManager.checkAndEvict();
      expect(callback).toHaveBeenCalledTimes(1); // No additional call
    });

    it("should call callback when transitioning WARNING → CRITICAL", async () => {
      const callback = jest.fn();
      quotaManager.onQuotaWarning(callback);

      // Move to WARNING
      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));
      await quotaManager.checkAndEvict();
      expect(callback).toHaveBeenCalledTimes(1);

      // Move to CRITICAL
      await store.delete("msg1");
      await store.store(createMockMessage("msg2", MessagePriority.NORMAL, 970));
      await quotaManager.checkAndEvict();

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: QuotaStatus.CRITICAL,
        })
      );
    });

    it("should handle multiple callbacks", async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      quotaManager.onQuotaWarning(callback1);
      quotaManager.onQuotaWarning(callback2);

      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));
      await quotaManager.checkAndEvict();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should not crash on callback errors", async () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      quotaManager.onQuotaWarning(errorCallback);
      quotaManager.onQuotaWarning(normalCallback);

      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));

      // Should not throw
      await expect(quotaManager.checkAndEvict()).resolves.not.toThrow();

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });

    it("should provide complete warning information", async () => {
      const callback = jest.fn();
      quotaManager.onQuotaWarning(callback);

      await store.store(createMockMessage("msg1", MessagePriority.NORMAL, 850));
      await quotaManager.checkAndEvict();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.any(String),
          usedBytes: expect.any(Number),
          maxBytes: expect.any(Number),
          usageRatio: expect.any(Number),
          messageCount: expect.any(Number),
          oldestMessage: expect.any(Number),
        })
      );
    });
  });

  describe("Periodic Checking Timer", () => {
    it("should start periodic checking", () => {
      quotaManager.start();

      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it("should not start multiple timers", () => {
      quotaManager.start();
      const timerCount = jest.getTimerCount();

      quotaManager.start(); // Try to start again

      expect(jest.getTimerCount()).toBe(timerCount); // No new timer
    });

    it("should stop periodic checking", () => {
      quotaManager.start();
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      quotaManager.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it("should perform initial check on start", async () => {
      const checkSpy = jest.spyOn(quotaManager as any, "checkAndEvict");

      quotaManager.start();

      // Wait for initial check promise to resolve
      await jest.runOnlyPendingTimersAsync();

      expect(checkSpy).toHaveBeenCalled();
    });

    it("should check quota at configured interval", async () => {
      const checkSpy = jest.spyOn(quotaManager as any, "checkAndEvict");

      quotaManager.start();
      await jest.runOnlyPendingTimersAsync(); // Initial check

      checkSpy.mockClear();

      // Advance by check interval
      jest.advanceTimersByTime(60000);
      await jest.runOnlyPendingTimersAsync();

      expect(checkSpy).toHaveBeenCalled();
    });

    it("should handle check errors gracefully", async () => {
      store.getStats = jest.fn().mockRejectedValue(new Error("Store error"));

      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation();

      quotaManager.start();
      await jest.runOnlyPendingTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty storage", async () => {
      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.OK);

      const info = await quotaManager.getQuotaInfo();
      expect(info.usedBytes).toBe(0);
      expect(info.messageCount).toBe(0);
    });

    it("should handle eviction when no evictable messages exist", async () => {
      // Only protected messages
      await store.store(
        createMockMessage("protected", MessagePriority.EMERGENCY, 500, {
          isOwnMessage: true,
          status: DeliveryStatus.PENDING,
        })
      );

      const result = await quotaManager.evict(500, "quota");

      expect(result.messagesEvicted).toBe(0);
      expect(result.bytesFreed).toBe(0);
    });

    it("should handle eviction request larger than total storage", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 300));

      const result = await quotaManager.evict(1000, "quota");

      expect(result.bytesFreed).toBe(300); // Only freed what was available
    });

    it("should handle full quota that cannot accept new messages", async () => {
      await store.store(
        createMockMessage("msg1", MessagePriority.NORMAL, 1000)
      );

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.FULL);

      const canAccept = await quotaManager.canAccept(1);
      expect(canAccept).toBe(false);
    });

    it("should handle zero-byte messages", async () => {
      await store.store(createMockMessage("empty", MessagePriority.LOW, 0));

      const status = await quotaManager.getStatus();
      expect(status).toBe(QuotaStatus.OK);

      const info = await quotaManager.getQuotaInfo();
      expect(info.messageCount).toBe(1);
      expect(info.usedBytes).toBe(0);
    });

    it("should evict EMERGENCY priority as last resort when critically full", async () => {
      const now = Date.now();

      // Only EMERGENCY messages remain
      await store.store(
        createMockMessage("emergency1", MessagePriority.EMERGENCY, 300, {
          isOwnMessage: false,
          createdAt: now - 5000,
          expiresAt: now + 10000,
        })
      );
      await store.store(
        createMockMessage("emergency2", MessagePriority.EMERGENCY, 300, {
          isOwnMessage: false,
          createdAt: now - 3000,
          expiresAt: now + 10000,
        })
      );

      const result = await quotaManager.evict(300, "quota");

      expect(result.messagesEvicted).toBe(1);
      expect(result.byPriority[MessagePriority.EMERGENCY]).toBe(1);
      // Should evict older one
      expect(await store.has("emergency1")).toBe(false);
      expect(await store.has("emergency2")).toBe(true);
    });
  });

  describe("forceEvict()", () => {
    it("should perform manual eviction", async () => {
      await store.store(createMockMessage("msg1", MessagePriority.LOW, 500));

      const result = await quotaManager.forceEvict(300);

      expect(result.reason).toBe("manual");
      expect(result.bytesFreed).toBeGreaterThanOrEqual(300);
    });
  });

  describe("createQuotaManager() factory", () => {
    it("should create QuotaManager with default config", () => {
      const manager = createQuotaManager(store);

      expect(manager).toBeInstanceOf(QuotaManager);
    });

    it("should create QuotaManager with custom config", () => {
      const manager = createQuotaManager(store, {
        maxBytes: 2000,
        warningThreshold: 0.75,
      });

      expect(manager).toBeInstanceOf(QuotaManager);
    });
  });
});

describe("formatBytes()", () => {
  it("should format bytes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("should format kilobytes correctly", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("should format megabytes correctly", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("should format gigabytes correctly", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("should round to 1 decimal place", () => {
    expect(formatBytes(1234)).toBe("1.2 KB");
    expect(formatBytes(1567)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1234)).toBe("1.2 MB");
  });
});

describe("DEFAULT_QUOTA_CONFIG", () => {
  it("should have correct default values", () => {
    expect(DEFAULT_QUOTA_CONFIG.maxBytes).toBe(500 * 1024 * 1024); // 500MB
    expect(DEFAULT_QUOTA_CONFIG.warningThreshold).toBe(0.8); // 80%
    expect(DEFAULT_QUOTA_CONFIG.criticalThreshold).toBe(0.95); // 95%
    expect(DEFAULT_QUOTA_CONFIG.evictionTarget).toBe(0.7); // 70%
    expect(DEFAULT_QUOTA_CONFIG.checkInterval).toBe(60_000); // 60 seconds
  });
});
