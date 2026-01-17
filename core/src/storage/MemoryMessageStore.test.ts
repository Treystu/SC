/**
 * Comprehensive tests for MemoryMessageStore
 *
 * Tests cover all CRUD operations, query operations, batch operations,
 * status updates, TTL calculations, eviction logic, and helper functions.
 */

import {
  MemoryMessageStore,
  createMemoryMessageStore,
} from "./MemoryMessageStore.js";
import {
  MessagePriority,
  DeliveryStatus,
  TTL_BY_PRIORITY,
  createStoredMessage,
  calculateMessageSize,
} from "./MessageStore.js";
import type { Message, MessageHeader } from "../protocol/message.js";
import type { StoredMessage } from "./MessageStore.js";

describe("MemoryMessageStore", () => {
  let store: MemoryMessageStore;

  // Helper to create mock message
  const createMockMessage = (
    content: string = "test message",
    timestamp: number = Date.now()
  ): Message => ({
    header: {
      version: 0x01,
      type: 0x01, // TEXT
      ttl: 10,
      timestamp,
      senderId: new Uint8Array(32).fill(1),
      signature: new Uint8Array(64).fill(2),
    },
    payload: new TextEncoder().encode(content),
  });

  beforeEach(async () => {
    store = createMemoryMessageStore();
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  // ============== Core Operations ==============

  describe("Core CRUD Operations", () => {
    describe("store()", () => {
      it("should store a message successfully", async () => {
        const message = createMockMessage();
        const stored = createStoredMessage(message, "peer-123");

        await store.store(stored);

        expect(await store.has(stored.id)).toBe(true);
      });

      it("should replace existing message with same ID", async () => {
        const message = createMockMessage();
        const stored = createStoredMessage(message, "peer-123", {
          priority: MessagePriority.LOW,
        });

        await store.store(stored);

        // Store again with different priority
        stored.priority = MessagePriority.HIGH;
        await store.store(stored);

        const retrieved = await store.get(stored.id);
        expect(retrieved?.priority).toBe(MessagePriority.HIGH);
      });

      it("should recalculate message size on store", async () => {
        const message = createMockMessage("small");
        const stored = createStoredMessage(message, "peer-123");
        const originalSize = stored.sizeBytes;

        // Store and verify size is recalculated
        await store.store(stored);
        const retrieved = await store.get(stored.id);

        expect(retrieved?.sizeBytes).toBe(calculateMessageSize(stored));
      });
    });

    describe("get()", () => {
      it("should retrieve stored message", async () => {
        const message = createMockMessage();
        const stored = createStoredMessage(message, "peer-123");

        await store.store(stored);
        const retrieved = await store.get(stored.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved?.id).toBe(stored.id);
        expect(retrieved?.recipientId).toBe("peer-123");
      });

      it("should return null for non-existent message", async () => {
        const retrieved = await store.get("non-existent-id");
        expect(retrieved).toBeNull();
      });

      it("should return a copy, not the original", async () => {
        const message = createMockMessage();
        const stored = createStoredMessage(message, "peer-123");

        await store.store(stored);
        const retrieved1 = await store.get(stored.id);
        const retrieved2 = await store.get(stored.id);

        expect(retrieved1).not.toBe(retrieved2); // Different object references
        expect(retrieved1).toEqual(retrieved2); // But same content
      });
    });

    describe("delete()", () => {
      it("should delete a message", async () => {
        const message = createMockMessage();
        const stored = createStoredMessage(message, "peer-123");

        await store.store(stored);
        expect(await store.has(stored.id)).toBe(true);

        await store.delete(stored.id);
        expect(await store.has(stored.id)).toBe(false);
      });

      it("should not throw when deleting non-existent message", async () => {
        await expect(store.delete("non-existent")).resolves.not.toThrow();
      });
    });

    describe("has()", () => {
      it("should return true for existing message", async () => {
        const message = createMockMessage();
        const stored = createStoredMessage(message, "peer-123");

        await store.store(stored);
        expect(await store.has(stored.id)).toBe(true);
      });

      it("should return false for non-existent message", async () => {
        expect(await store.has("non-existent")).toBe(false);
      });
    });
  });

  // ============== Query Operations ==============

  describe("Query Operations", () => {
    describe("query() with filters", () => {
      beforeEach(async () => {
        // Store test data with different attributes
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1", {
            priority: MessagePriority.LOW,
          }),
          createStoredMessage(createMockMessage("msg2"), "peer-2", {
            priority: MessagePriority.NORMAL,
          }),
          createStoredMessage(createMockMessage("msg3"), "peer-1", {
            priority: MessagePriority.HIGH,
          }),
          createStoredMessage(createMockMessage("msg4"), "peer-3", {
            priority: MessagePriority.EMERGENCY,
          }),
        ];

        messages[0].status = DeliveryStatus.PENDING;
        messages[1].status = DeliveryStatus.SENT;
        messages[2].status = DeliveryStatus.DELIVERED;
        messages[3].status = DeliveryStatus.PENDING;

        messages[0].destinationGeoZone = "zone-A";
        messages[1].destinationGeoZone = "zone-B";
        messages[2].destinationGeoZone = "zone-A";
        messages[3].destinationGeoZone = "zone-C";

        messages[0].isOwnMessage = true;
        messages[1].isOwnMessage = false;
        messages[2].isOwnMessage = true;
        messages[3].isOwnMessage = false;

        for (const msg of messages) {
          await store.store(msg);
        }
      });

      it("should filter by recipientId", async () => {
        const results = await store.query({ recipientId: "peer-1" });
        expect(results).toHaveLength(2);
        expect(results.every((m) => m.recipientId === "peer-1")).toBe(true);
      });

      it("should filter by minPriority", async () => {
        const results = await store.query({
          minPriority: MessagePriority.HIGH,
        });
        expect(results).toHaveLength(2);
        expect(
          results.every((m) => m.priority >= MessagePriority.HIGH)
        ).toBe(true);
      });

      it("should filter by status", async () => {
        const results = await store.query({
          status: DeliveryStatus.PENDING,
        });
        expect(results).toHaveLength(2);
        expect(results.every((m) => m.status === DeliveryStatus.PENDING)).toBe(
          true
        );
      });

      it("should filter by destinationGeoZone", async () => {
        const results = await store.query({ destinationGeoZone: "zone-A" });
        expect(results).toHaveLength(2);
        expect(results.every((m) => m.destinationGeoZone === "zone-A")).toBe(
          true
        );
      });

      it("should filter by isOwnMessage", async () => {
        const results = await store.query({ isOwnMessage: true });
        expect(results).toHaveLength(2);
        expect(results.every((m) => m.isOwnMessage === true)).toBe(true);
      });

      it("should filter by createdAfter", async () => {
        const cutoff = Date.now();
        // Add a new message after cutoff
        await new Promise((resolve) => setTimeout(resolve, 10));
        const newMsg = createStoredMessage(createMockMessage("new"), "peer-4");
        await store.store(newMsg);

        const results = await store.query({ createdAfter: cutoff });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.every((m) => m.createdAt > cutoff)).toBe(true);
      });

      it("should filter by expiringBefore", async () => {
        const cutoff = Date.now() + TTL_BY_PRIORITY[MessagePriority.LOW] + 1000;
        const results = await store.query({ expiringBefore: cutoff });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.every((m) => m.expiresAt < cutoff)).toBe(true);
      });

      it("should combine multiple filters", async () => {
        const results = await store.query({
          recipientId: "peer-1",
          minPriority: MessagePriority.HIGH,
          status: DeliveryStatus.DELIVERED,
        });
        expect(results).toHaveLength(1);
        expect(results[0].recipientId).toBe("peer-1");
        expect(results[0].priority).toBeGreaterThanOrEqual(MessagePriority.HIGH);
        expect(results[0].status).toBe(DeliveryStatus.DELIVERED);
      });

      it("should sort results by creation time (newest first)", async () => {
        const results = await store.query({});
        expect(results.length).toBeGreaterThan(1);

        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].createdAt).toBeGreaterThanOrEqual(
            results[i].createdAt
          );
        }
      });

      it("should support pagination with limit", async () => {
        const results = await store.query({ limit: 2 });
        expect(results).toHaveLength(2);
      });

      it("should support pagination with offset", async () => {
        const all = await store.query({});
        const offsetResults = await store.query({ offset: 2 });

        expect(offsetResults).toHaveLength(all.length - 2);
        expect(offsetResults[0].id).toBe(all[2].id);
      });

      it("should support pagination with both offset and limit", async () => {
        const results = await store.query({ offset: 1, limit: 2 });
        expect(results).toHaveLength(2);

        const all = await store.query({});
        expect(results[0].id).toBe(all[1].id);
        expect(results[1].id).toBe(all[2].id);
      });

      it("should return copies of messages", async () => {
        const results = await store.query({ recipientId: "peer-1" });
        const original = await store.get(results[0].id);

        results[0].attempts = 999;
        const unchanged = await store.get(results[0].id);

        expect(unchanged?.attempts).toBe(original?.attempts);
      });
    });

    describe("getForRelay()", () => {
      it("should return messages eligible for relay", async () => {
        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        msg1.status = DeliveryStatus.PENDING;

        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2");
        msg2.status = DeliveryStatus.SENT;

        await store.store(msg1);
        await store.store(msg2);

        const results = await store.getForRelay();
        expect(results).toHaveLength(2);
      });

      it("should exclude delivered messages", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.status = DeliveryStatus.DELIVERED;
        await store.store(msg);

        const results = await store.getForRelay();
        expect(results).toHaveLength(0);
      });

      it("should exclude expired messages", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.status = DeliveryStatus.EXPIRED;
        await store.store(msg);

        const results = await store.getForRelay();
        expect(results).toHaveLength(0);
      });

      it("should exclude messages past expiry time", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.expiresAt = Date.now() - 1000; // Expired
        await store.store(msg);

        const results = await store.getForRelay();
        expect(results).toHaveLength(0);
      });

      it("should exclude messages in excludeIds set", async () => {
        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2");

        await store.store(msg1);
        await store.store(msg2);

        const exclude = new Set([msg1.id]);
        const results = await store.getForRelay(exclude);

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(msg2.id);
      });

      it("should return copies of messages", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        await store.store(msg);

        const results = await store.getForRelay();
        results[0].attempts = 999;

        const unchanged = await store.get(msg.id);
        expect(unchanged?.attempts).toBe(0);
      });
    });

    describe("getPendingForRecipient()", () => {
      it("should return only pending messages for recipient", async () => {
        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        msg1.status = DeliveryStatus.PENDING;

        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-1");
        msg2.status = DeliveryStatus.SENT;

        const msg3 = createStoredMessage(createMockMessage("msg3"), "peer-2");
        msg3.status = DeliveryStatus.PENDING;

        await store.store(msg1);
        await store.store(msg2);
        await store.store(msg3);

        const results = await store.getPendingForRecipient("peer-1");
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(msg1.id);
      });

      it("should return empty array if no pending messages", async () => {
        const results = await store.getPendingForRecipient("peer-1");
        expect(results).toEqual([]);
      });

      it("should return copies of messages", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.status = DeliveryStatus.PENDING;
        await store.store(msg);

        const results = await store.getPendingForRecipient("peer-1");
        results[0].attempts = 999;

        const unchanged = await store.get(msg.id);
        expect(unchanged?.attempts).toBe(0);
      });
    });

    describe("getExpired()", () => {
      it("should return messages past expiry time", async () => {
        const now = Date.now();

        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        msg1.expiresAt = now - 1000; // Expired

        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2");
        msg2.expiresAt = now + 1000; // Not expired

        await store.store(msg1);
        await store.store(msg2);

        const results = await store.getExpired(now);
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(msg1.id);
      });

      it("should use current time if not provided", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.expiresAt = Date.now() - 1000; // Expired
        await store.store(msg);

        const results = await store.getExpired();
        expect(results).toHaveLength(1);
      });

      it("should return copies of messages", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.expiresAt = Date.now() - 1000;
        await store.store(msg);

        const results = await store.getExpired();
        results[0].attempts = 999;

        const unchanged = await store.get(msg.id);
        expect(unchanged?.attempts).toBe(0);
      });
    });
  });

  // ============== Bulk Operations ==============

  describe("Bulk Operations", () => {
    describe("bulkStore()", () => {
      it("should store multiple messages", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
          createStoredMessage(createMockMessage("msg3"), "peer-3"),
        ];

        await store.bulkStore(messages);

        for (const msg of messages) {
          expect(await store.has(msg.id)).toBe(true);
        }
      });

      it("should handle empty array", async () => {
        await expect(store.bulkStore([])).resolves.not.toThrow();
      });
    });

    describe("bulkDelete()", () => {
      it("should delete multiple messages", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
          createStoredMessage(createMockMessage("msg3"), "peer-3"),
        ];

        await store.bulkStore(messages);
        const ids = messages.map((m) => m.id);

        await store.bulkDelete(ids);

        for (const id of ids) {
          expect(await store.has(id)).toBe(false);
        }
      });

      it("should handle empty array", async () => {
        await expect(store.bulkDelete([])).resolves.not.toThrow();
      });

      it("should not throw for non-existent IDs", async () => {
        await expect(
          store.bulkDelete(["id1", "id2", "id3"])
        ).resolves.not.toThrow();
      });
    });

    describe("getAllIds()", () => {
      it("should return all message IDs", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
          createStoredMessage(createMockMessage("msg3"), "peer-3"),
        ];

        await store.bulkStore(messages);
        const ids = await store.getAllIds();

        expect(ids).toHaveLength(3);
        expect(ids).toContain(messages[0].id);
        expect(ids).toContain(messages[1].id);
        expect(ids).toContain(messages[2].id);
      });

      it("should return empty array when store is empty", async () => {
        const ids = await store.getAllIds();
        expect(ids).toEqual([]);
      });
    });

    describe("getMessagesSince()", () => {
      it("should return messages created after timestamp", async () => {
        const cutoff = Date.now();

        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        msg1.createdAt = cutoff - 1000; // Before cutoff

        await store.store(msg1);

        // Wait and add new message
        await new Promise((resolve) => setTimeout(resolve, 10));
        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2");
        await store.store(msg2);

        const results = await store.getMessagesSince(cutoff);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.every((m) => m.createdAt > cutoff)).toBe(true);
      });

      it("should return copies of messages", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        await store.store(msg);

        const results = await store.getMessagesSince(0);
        results[0].attempts = 999;

        const unchanged = await store.get(msg.id);
        expect(unchanged?.attempts).toBe(0);
      });
    });
  });

  // ============== Quota Management ==============

  describe("Quota Management", () => {
    describe("getStats()", () => {
      it("should return correct statistics", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1", {
            priority: MessagePriority.LOW,
            isOwnMessage: true,
          }),
          createStoredMessage(createMockMessage("msg2"), "peer-2", {
            priority: MessagePriority.NORMAL,
            isOwnMessage: false,
          }),
          createStoredMessage(createMockMessage("msg3"), "peer-3", {
            priority: MessagePriority.HIGH,
            isOwnMessage: true,
          }),
        ];

        messages[0].status = DeliveryStatus.PENDING;
        messages[1].status = DeliveryStatus.SENT;
        messages[2].status = DeliveryStatus.DELIVERED;

        await store.bulkStore(messages);
        const stats = await store.getStats();

        expect(stats.messageCount).toBe(3);
        expect(stats.totalBytes).toBeGreaterThan(0);
        expect(stats.ownMessageCount).toBe(2);
        expect(stats.relayMessageCount).toBe(1);

        expect(stats.byPriority[MessagePriority.LOW].count).toBe(1);
        expect(stats.byPriority[MessagePriority.NORMAL].count).toBe(1);
        expect(stats.byPriority[MessagePriority.HIGH].count).toBe(1);
        expect(stats.byPriority[MessagePriority.EMERGENCY].count).toBe(0);

        expect(stats.byStatus[DeliveryStatus.PENDING]).toBe(1);
        expect(stats.byStatus[DeliveryStatus.SENT]).toBe(1);
        expect(stats.byStatus[DeliveryStatus.DELIVERED]).toBe(1);
      });

      it("should track oldest and newest message timestamps", async () => {
        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        msg1.createdAt = 1000;

        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2");
        msg2.createdAt = 2000;

        const msg3 = createStoredMessage(createMockMessage("msg3"), "peer-3");
        msg3.createdAt = 1500;

        await store.bulkStore([msg1, msg2, msg3]);
        const stats = await store.getStats();

        expect(stats.oldestMessage).toBe(1000);
        expect(stats.newestMessage).toBe(2000);
      });

      it("should return 0 for oldest/newest when store is empty", async () => {
        const stats = await store.getStats();
        expect(stats.oldestMessage).toBe(0);
        expect(stats.newestMessage).toBe(0);
      });

      it("should count bytes by priority", async () => {
        const msg1 = createStoredMessage(
          createMockMessage("small"),
          "peer-1",
          {
            priority: MessagePriority.LOW,
          }
        );
        const msg2 = createStoredMessage(
          createMockMessage("larger message content"),
          "peer-2",
          {
            priority: MessagePriority.EMERGENCY,
          }
        );

        await store.bulkStore([msg1, msg2]);
        const stats = await store.getStats();

        expect(stats.byPriority[MessagePriority.LOW].bytes).toBeGreaterThan(0);
        expect(
          stats.byPriority[MessagePriority.EMERGENCY].bytes
        ).toBeGreaterThan(0);
        expect(
          stats.byPriority[MessagePriority.EMERGENCY].bytes
        ).toBeGreaterThan(stats.byPriority[MessagePriority.LOW].bytes);
      });
    });

    describe("getStorageUsed()", () => {
      it("should return total bytes used", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
        ];

        await store.bulkStore(messages);
        const used = await store.getStorageUsed();

        expect(used).toBeGreaterThan(0);
        expect(used).toBe(
          messages.reduce((sum, m) => sum + calculateMessageSize(m), 0)
        );
      });

      it("should return 0 when store is empty", async () => {
        const used = await store.getStorageUsed();
        expect(used).toBe(0);
      });
    });

    describe("getMessageCount()", () => {
      it("should return correct count", async () => {
        expect(await store.getMessageCount()).toBe(0);

        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
          createStoredMessage(createMockMessage("msg3"), "peer-3"),
        ];

        await store.bulkStore(messages);
        expect(await store.getMessageCount()).toBe(3);

        await store.delete(messages[0].id);
        expect(await store.getMessageCount()).toBe(2);
      });
    });

    describe("evictByPriority()", () => {
      it("should evict expired messages first", async () => {
        const now = Date.now();

        const expiredMsg = createStoredMessage(
          createMockMessage("expired"),
          "peer-1",
          {
            priority: MessagePriority.EMERGENCY,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }
        );
        expiredMsg.expiresAt = now - 1000;

        const activeMsg = createStoredMessage(
          createMockMessage("active"),
          "peer-2",
          {
            priority: MessagePriority.LOW,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }
        );

        await store.store(expiredMsg);
        await store.store(activeMsg);

        const bytesFreed = await store.evictByPriority(1);
        expect(bytesFreed).toBeGreaterThan(0);
        expect(await store.has(expiredMsg.id)).toBe(false);
        expect(await store.has(activeMsg.id)).toBe(true);
      });

      it("should evict by priority order: LOW → NORMAL → HIGH → EMERGENCY", async () => {
        const messages = [
          createStoredMessage(createMockMessage("low"), "peer-1", {
            priority: MessagePriority.LOW,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
          createStoredMessage(createMockMessage("normal"), "peer-2", {
            priority: MessagePriority.NORMAL,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
          createStoredMessage(createMockMessage("high"), "peer-3", {
            priority: MessagePriority.HIGH,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
          createStoredMessage(createMockMessage("emergency"), "peer-4", {
            priority: MessagePriority.EMERGENCY,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
        ];

        await store.bulkStore(messages);

        // Evict enough to remove low priority
        const size1 = calculateMessageSize(messages[0]);
        await store.evictByPriority(size1);

        expect(await store.has(messages[0].id)).toBe(false); // LOW evicted
        expect(await store.has(messages[1].id)).toBe(true); // NORMAL kept
        expect(await store.has(messages[2].id)).toBe(true); // HIGH kept
        expect(await store.has(messages[3].id)).toBe(true); // EMERGENCY kept

        // Evict more to remove normal priority
        const size2 = calculateMessageSize(messages[1]);
        await store.evictByPriority(size2);

        expect(await store.has(messages[1].id)).toBe(false); // NORMAL evicted
        expect(await store.has(messages[2].id)).toBe(true); // HIGH kept
        expect(await store.has(messages[3].id)).toBe(true); // EMERGENCY kept
      });

      it("should evict oldest messages first within same priority", async () => {
        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1", {
          priority: MessagePriority.LOW,
          isOwnMessage: false, // Make it relay message so it can be evicted
        });
        msg1.createdAt = 1000;

        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2", {
          priority: MessagePriority.LOW,
          isOwnMessage: false, // Make it relay message so it can be evicted
        });
        msg2.createdAt = 2000;

        await store.store(msg1);
        await store.store(msg2);

        const size = calculateMessageSize(msg1);
        await store.evictByPriority(size);

        expect(await store.has(msg1.id)).toBe(false); // Older, evicted
        expect(await store.has(msg2.id)).toBe(true); // Newer, kept
      });

      it("should never evict own undelivered messages", async () => {
        const ownMsg = createStoredMessage(createMockMessage("own"), "peer-1", {
          priority: MessagePriority.LOW,
          isOwnMessage: true,
        });
        ownMsg.status = DeliveryStatus.PENDING;

        const relayMsg = createStoredMessage(
          createMockMessage("relay"),
          "peer-2",
          {
            priority: MessagePriority.EMERGENCY,
            isOwnMessage: false,
          }
        );

        await store.store(ownMsg);
        await store.store(relayMsg);

        // Try to evict a lot
        await store.evictByPriority(999999);

        expect(await store.has(ownMsg.id)).toBe(true); // Own undelivered, kept
        expect(await store.has(relayMsg.id)).toBe(false); // Relay, evicted
      });

      it("should allow evicting own delivered messages", async () => {
        const ownMsg = createStoredMessage(createMockMessage("own"), "peer-1", {
          priority: MessagePriority.LOW,
          isOwnMessage: true,
        });
        ownMsg.status = DeliveryStatus.DELIVERED;

        await store.store(ownMsg);

        const size = calculateMessageSize(ownMsg);
        await store.evictByPriority(size);

        expect(await store.has(ownMsg.id)).toBe(false);
      });

      it("should return actual bytes freed", async () => {
        const msg = createStoredMessage(createMockMessage("test"), "peer-1", {
          isOwnMessage: false, // Make it relay message so it can be evicted
        });
        await store.store(msg);

        const size = calculateMessageSize(msg);
        const bytesFreed = await store.evictByPriority(size);

        expect(bytesFreed).toBeGreaterThan(0);
        expect(bytesFreed).toBe(size);
      });

      it("should stop evicting when target is reached", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1", {
            priority: MessagePriority.LOW,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
          createStoredMessage(createMockMessage("msg2"), "peer-2", {
            priority: MessagePriority.LOW,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
          createStoredMessage(createMockMessage("msg3"), "peer-3", {
            priority: MessagePriority.LOW,
            isOwnMessage: false, // Make it relay message so it can be evicted
          }),
        ];

        await store.bulkStore(messages);

        // Request to free 1 byte - should evict only 1 message
        const bytesFreed = await store.evictByPriority(1);

        const remaining = await store.getMessageCount();
        expect(remaining).toBe(2);
      });
    });

    describe("pruneExpired()", () => {
      it("should remove expired messages", async () => {
        const now = Date.now();

        const msg1 = createStoredMessage(createMockMessage("msg1"), "peer-1");
        msg1.expiresAt = now - 1000; // Expired

        const msg2 = createStoredMessage(createMockMessage("msg2"), "peer-2");
        msg2.expiresAt = now + 1000; // Not expired

        await store.store(msg1);
        await store.store(msg2);

        const pruned = await store.pruneExpired(now);

        expect(pruned).toBe(1);
        expect(await store.has(msg1.id)).toBe(false);
        expect(await store.has(msg2.id)).toBe(true);
      });

      it("should use current time if not provided", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.expiresAt = Date.now() - 1000;
        await store.store(msg);

        const pruned = await store.pruneExpired();
        expect(pruned).toBe(1);
      });

      it("should return count of pruned messages", async () => {
        const now = Date.now();
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
          createStoredMessage(createMockMessage("msg3"), "peer-3"),
        ];

        messages.forEach((msg) => {
          msg.expiresAt = now - 1000;
        });

        await store.bulkStore(messages);
        const pruned = await store.pruneExpired(now);

        expect(pruned).toBe(3);
      });
    });
  });

  // ============== Status Updates ==============

  describe("Status Updates", () => {
    describe("updateStatus()", () => {
      it("should update message status", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.status = DeliveryStatus.PENDING;
        await store.store(msg);

        await store.updateStatus(msg.id, DeliveryStatus.SENT);

        const updated = await store.get(msg.id);
        expect(updated?.status).toBe(DeliveryStatus.SENT);
      });

      it("should not throw for non-existent message", async () => {
        await expect(
          store.updateStatus("non-existent", DeliveryStatus.SENT)
        ).resolves.not.toThrow();
      });
    });

    describe("recordAttempt()", () => {
      it("should increment attempts counter", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.attempts = 0;
        await store.store(msg);

        await store.recordAttempt(msg.id, "peer-tried-1");

        const updated = await store.get(msg.id);
        expect(updated?.attempts).toBe(1);
      });

      it("should update lastAttempt timestamp", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.lastAttempt = 0;
        await store.store(msg);

        const before = Date.now();
        await store.recordAttempt(msg.id, "peer-tried-1");
        const after = Date.now();

        const updated = await store.get(msg.id);
        expect(updated?.lastAttempt).toBeGreaterThanOrEqual(before);
        expect(updated?.lastAttempt).toBeLessThanOrEqual(after);
      });

      it("should add peer to routeAttempts", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.routeAttempts = [];
        await store.store(msg);

        await store.recordAttempt(msg.id, "peer-tried-1");
        await store.recordAttempt(msg.id, "peer-tried-2");

        const updated = await store.get(msg.id);
        expect(updated?.routeAttempts).toContain("peer-tried-1");
        expect(updated?.routeAttempts).toContain("peer-tried-2");
      });

      it("should not duplicate peers in routeAttempts", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.routeAttempts = [];
        await store.store(msg);

        await store.recordAttempt(msg.id, "peer-tried-1");
        await store.recordAttempt(msg.id, "peer-tried-1");

        const updated = await store.get(msg.id);
        expect(updated?.routeAttempts).toEqual(["peer-tried-1"]);
      });

      it("should not throw for non-existent message", async () => {
        await expect(
          store.recordAttempt("non-existent", "peer-1")
        ).resolves.not.toThrow();
      });
    });

    describe("markDelivered()", () => {
      it("should set status to DELIVERED", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        msg.status = DeliveryStatus.SENT;
        await store.store(msg);

        await store.markDelivered(msg.id);

        const updated = await store.get(msg.id);
        expect(updated?.status).toBe(DeliveryStatus.DELIVERED);
      });

      it("should set deliveredAt timestamp", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        await store.store(msg);

        const before = Date.now();
        await store.markDelivered(msg.id);
        const after = Date.now();

        const updated = await store.get(msg.id);
        expect(updated?.deliveredAt).toBeDefined();
        expect(updated?.deliveredAt).toBeGreaterThanOrEqual(before);
        expect(updated?.deliveredAt).toBeLessThanOrEqual(after);
      });

      it("should accept custom timestamp", async () => {
        const msg = createStoredMessage(createMockMessage(), "peer-1");
        await store.store(msg);

        const customTime = 123456789;
        await store.markDelivered(msg.id, customTime);

        const updated = await store.get(msg.id);
        expect(updated?.deliveredAt).toBe(customTime);
      });

      it("should not throw for non-existent message", async () => {
        await expect(
          store.markDelivered("non-existent")
        ).resolves.not.toThrow();
      });
    });
  });

  // ============== TTL Calculation by Priority ==============

  describe("TTL Calculation by Priority", () => {
    it("should set 24h TTL for LOW priority", () => {
      const msg = createStoredMessage(createMockMessage(), "peer-1", {
        priority: MessagePriority.LOW,
      });

      const expectedTTL = 24 * 60 * 60 * 1000; // 24 hours
      expect(msg.expiresAt - msg.createdAt).toBe(expectedTTL);
    });

    it("should set 7d TTL for NORMAL priority", () => {
      const msg = createStoredMessage(createMockMessage(), "peer-1", {
        priority: MessagePriority.NORMAL,
      });

      const expectedTTL = 7 * 24 * 60 * 60 * 1000; // 7 days
      expect(msg.expiresAt - msg.createdAt).toBe(expectedTTL);
    });

    it("should set 14d TTL for HIGH priority", () => {
      const msg = createStoredMessage(createMockMessage(), "peer-1", {
        priority: MessagePriority.HIGH,
      });

      const expectedTTL = 14 * 24 * 60 * 60 * 1000; // 14 days
      expect(msg.expiresAt - msg.createdAt).toBe(expectedTTL);
    });

    it("should set 30d TTL for EMERGENCY priority", () => {
      const msg = createStoredMessage(createMockMessage(), "peer-1", {
        priority: MessagePriority.EMERGENCY,
      });

      const expectedTTL = 30 * 24 * 60 * 60 * 1000; // 30 days
      expect(msg.expiresAt - msg.createdAt).toBe(expectedTTL);
    });

    it("should default to NORMAL priority if not specified", () => {
      const msg = createStoredMessage(createMockMessage(), "peer-1");

      const expectedTTL = 7 * 24 * 60 * 60 * 1000; // 7 days
      expect(msg.priority).toBe(MessagePriority.NORMAL);
      expect(msg.expiresAt - msg.createdAt).toBe(expectedTTL);
    });
  });

  // ============== Lifecycle ==============

  describe("Lifecycle", () => {
    describe("initialize()", () => {
      it("should initialize successfully", async () => {
        const newStore = createMemoryMessageStore();
        await expect(newStore.initialize()).resolves.not.toThrow();
      });
    });

    describe("close()", () => {
      it("should close without error", async () => {
        await expect(store.close()).resolves.not.toThrow();
      });
    });

    describe("clear()", () => {
      it("should remove all messages", async () => {
        const messages = [
          createStoredMessage(createMockMessage("msg1"), "peer-1"),
          createStoredMessage(createMockMessage("msg2"), "peer-2"),
          createStoredMessage(createMockMessage("msg3"), "peer-3"),
        ];

        await store.bulkStore(messages);
        expect(await store.getMessageCount()).toBe(3);

        await store.clear();
        expect(await store.getMessageCount()).toBe(0);
      });
    });
  });

  // ============== createStoredMessage() Helper ==============

  describe("createStoredMessage() Helper", () => {
    it("should create message with required fields", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123");

      expect(stored.id).toBeDefined();
      expect(stored.message).toBe(message);
      expect(stored.recipientId).toBe("peer-123");
      expect(stored.priority).toBe(MessagePriority.NORMAL); // Default
      expect(stored.sizeBytes).toBeGreaterThan(0);
      expect(stored.createdAt).toBeGreaterThan(0);
      expect(stored.expiresAt).toBeGreaterThan(stored.createdAt);
      expect(stored.status).toBe(DeliveryStatus.PENDING);
      expect(stored.attempts).toBe(0);
      expect(stored.lastAttempt).toBe(0);
      expect(stored.hopCount).toBe(0);
      expect(stored.maxHops).toBe(255); // Default
      expect(stored.routeAttempts).toEqual([]);
      expect(stored.isOwnMessage).toBe(true); // Default
    });

    it("should accept custom priority", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        priority: MessagePriority.EMERGENCY,
      });

      expect(stored.priority).toBe(MessagePriority.EMERGENCY);
    });

    it("should accept custom geoZone", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        geoZone: "zone-A",
      });

      expect(stored.geoZone).toBe("zone-A");
    });

    it("should accept custom destinationGeoZone", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        destinationGeoZone: "zone-B",
      });

      expect(stored.destinationGeoZone).toBe("zone-B");
    });

    it("should accept custom isOwnMessage", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        isOwnMessage: false,
      });

      expect(stored.isOwnMessage).toBe(false);
      expect(stored.relayedAt).toBeDefined();
    });

    it("should set relayedAt for relay messages", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        isOwnMessage: false,
      });

      expect(stored.relayedAt).toBeGreaterThan(0);
    });

    it("should not set relayedAt for own messages", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        isOwnMessage: true,
      });

      expect(stored.relayedAt).toBeUndefined();
    });

    it("should accept custom maxHops", () => {
      const message = createMockMessage();
      const stored = createStoredMessage(message, "peer-123", {
        maxHops: 10,
      });

      expect(stored.maxHops).toBe(10);
    });

    it("should generate unique IDs for different messages", () => {
      const msg1 = createMockMessage("content1");
      const msg2 = createMockMessage("content2");

      const stored1 = createStoredMessage(msg1, "peer-1");
      const stored2 = createStoredMessage(msg2, "peer-2");

      expect(stored1.id).not.toBe(stored2.id);
    });

    it("should generate same ID for same message content", () => {
      const msg1 = createMockMessage("same content", 12345);
      const msg2 = createMockMessage("same content", 12345);

      const stored1 = createStoredMessage(msg1, "peer-1");
      const stored2 = createStoredMessage(msg2, "peer-2");

      // Same message content should produce same ID
      expect(stored1.id).toBe(stored2.id);
    });

    it("should calculate appropriate TTL based on priority", () => {
      const message = createMockMessage();

      const low = createStoredMessage(message, "peer-1", {
        priority: MessagePriority.LOW,
      });
      const normal = createStoredMessage(message, "peer-1", {
        priority: MessagePriority.NORMAL,
      });
      const high = createStoredMessage(message, "peer-1", {
        priority: MessagePriority.HIGH,
      });
      const emergency = createStoredMessage(message, "peer-1", {
        priority: MessagePriority.EMERGENCY,
      });

      expect(low.expiresAt - low.createdAt).toBe(
        TTL_BY_PRIORITY[MessagePriority.LOW]
      );
      expect(normal.expiresAt - normal.createdAt).toBe(
        TTL_BY_PRIORITY[MessagePriority.NORMAL]
      );
      expect(high.expiresAt - high.createdAt).toBe(
        TTL_BY_PRIORITY[MessagePriority.HIGH]
      );
      expect(emergency.expiresAt - emergency.createdAt).toBe(
        TTL_BY_PRIORITY[MessagePriority.EMERGENCY]
      );
    });
  });

  // ============== calculateMessageSize() Helper ==============

  describe("calculateMessageSize() Helper", () => {
    it("should calculate size based on payload and metadata", () => {
      const smallMsg = createStoredMessage(
        createMockMessage("small"),
        "peer-1"
      );
      const largeMsg = createStoredMessage(
        createMockMessage("a much larger message with more content"),
        "peer-1"
      );

      const smallSize = calculateMessageSize(smallMsg);
      const largeSize = calculateMessageSize(largeMsg);

      expect(smallSize).toBeGreaterThan(0);
      expect(largeSize).toBeGreaterThan(smallSize);
    });

    it("should include fixed header size", () => {
      const msg = createStoredMessage(createMockMessage(""), "peer-1");
      const size = calculateMessageSize(msg);

      // Even empty payload should have header + metadata overhead
      expect(size).toBeGreaterThan(300); // ~108 header + 200 metadata
    });
  });

  // ============== Integration Scenarios ==============

  describe("Integration Scenarios", () => {
    it("should handle complete message lifecycle", async () => {
      // Create and store message
      const message = createMockMessage("test");
      const stored = createStoredMessage(message, "peer-123", {
        priority: MessagePriority.HIGH,
      });

      await store.store(stored);
      expect(await store.has(stored.id)).toBe(true);

      // Record delivery attempts
      await store.recordAttempt(stored.id, "peer-A");
      await store.recordAttempt(stored.id, "peer-B");

      let updated = await store.get(stored.id);
      expect(updated?.attempts).toBe(2);
      expect(updated?.routeAttempts).toHaveLength(2);

      // Update status
      await store.updateStatus(stored.id, DeliveryStatus.SENT);
      updated = await store.get(stored.id);
      expect(updated?.status).toBe(DeliveryStatus.SENT);

      // Mark delivered
      await store.markDelivered(stored.id);
      updated = await store.get(stored.id);
      expect(updated?.status).toBe(DeliveryStatus.DELIVERED);
      expect(updated?.deliveredAt).toBeDefined();

      // Cleanup
      await store.delete(stored.id);
      expect(await store.has(stored.id)).toBe(false);
    });

    it("should handle courier sync scenario", async () => {
      // Store messages from different sources
      const ownMessages = [
        createStoredMessage(createMockMessage("own1"), "peer-1", {
          isOwnMessage: true,
        }),
        createStoredMessage(createMockMessage("own2"), "peer-2", {
          isOwnMessage: true,
        }),
      ];

      const relayMessages = [
        createStoredMessage(createMockMessage("relay1"), "peer-3", {
          isOwnMessage: false,
        }),
        createStoredMessage(createMockMessage("relay2"), "peer-4", {
          isOwnMessage: false,
        }),
      ];

      await store.bulkStore([...ownMessages, ...relayMessages]);

      // Get all IDs for sync negotiation
      const allIds = await store.getAllIds();
      expect(allIds).toHaveLength(4);

      // Get messages for relay (excluding already synced)
      const exclude = new Set([ownMessages[0].id]);
      const forRelay = await store.getForRelay(exclude);
      expect(forRelay).toHaveLength(3);

      // Delta sync - get messages since timestamp
      const cutoff = Date.now() - 1000;
      const newMessages = await store.getMessagesSince(cutoff);
      expect(newMessages.length).toBeGreaterThanOrEqual(0);

      // Get storage stats
      const stats = await store.getStats();
      expect(stats.ownMessageCount).toBe(2);
      expect(stats.relayMessageCount).toBe(2);
    });

    it("should handle quota enforcement scenario", async () => {
      // Fill store with various priority messages
      const messages = [
        createStoredMessage(createMockMessage("low1"), "peer-1", {
          priority: MessagePriority.LOW,
          isOwnMessage: false, // Make it relay message so it can be evicted
        }),
        createStoredMessage(createMockMessage("low2"), "peer-2", {
          priority: MessagePriority.LOW,
          isOwnMessage: false, // Make it relay message so it can be evicted
        }),
        createStoredMessage(createMockMessage("normal1"), "peer-3", {
          priority: MessagePriority.NORMAL,
          isOwnMessage: false, // Make it relay message so it can be evicted
        }),
        createStoredMessage(createMockMessage("high1"), "peer-4", {
          priority: MessagePriority.HIGH,
          isOwnMessage: false, // Make it relay message so it can be evicted
        }),
        createStoredMessage(createMockMessage("emergency1"), "peer-5", {
          priority: MessagePriority.EMERGENCY,
          isOwnMessage: false, // Make it relay message so it can be evicted
        }),
      ];

      await store.bulkStore(messages);

      // Check usage
      const initialUsed = await store.getStorageUsed();
      expect(initialUsed).toBeGreaterThan(0);

      // Evict to free space
      const toFree = calculateMessageSize(messages[0]) * 2;
      const freed = await store.evictByPriority(toFree);

      expect(freed).toBeGreaterThanOrEqual(toFree);

      // Low priority messages should be evicted first
      const remaining = await store.getMessageCount();
      expect(remaining).toBeLessThan(5);

      // Emergency should still be there
      expect(await store.has(messages[4].id)).toBe(true);
    });

    it("should handle expired message cleanup", async () => {
      const now = Date.now();

      // Create messages with various expiry times
      const messages = [
        createStoredMessage(createMockMessage("expired1"), "peer-1"),
        createStoredMessage(createMockMessage("expired2"), "peer-2"),
        createStoredMessage(createMockMessage("active1"), "peer-3"),
        createStoredMessage(createMockMessage("active2"), "peer-4"),
      ];

      messages[0].expiresAt = now - 2000;
      messages[1].expiresAt = now - 1000;
      messages[2].expiresAt = now + 1000;
      messages[3].expiresAt = now + 2000;

      await store.bulkStore(messages);

      // Get expired messages
      const expired = await store.getExpired(now);
      expect(expired).toHaveLength(2);

      // Prune expired
      const pruned = await store.pruneExpired(now);
      expect(pruned).toBe(2);

      // Verify only active messages remain
      const remaining = await store.getMessageCount();
      expect(remaining).toBe(2);
    });
  });
});
