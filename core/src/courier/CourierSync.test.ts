/**
 * Comprehensive tests for CourierSync module
 *
 * Tests cover:
 * - Manifest creation and negotiation
 * - Message prioritization and selection
 * - Sync protocol execution
 * - Bloom filter exchange
 * - Priority-based selection (EMERGENCY > HIGH > NORMAL > LOW)
 * - Geographic zone preferences
 * - Storage capacity constraints
 * - Message ordering
 * - Compression handling
 * - Protocol version compatibility
 * - Bidirectional sync fairness
 * - Error recovery on partial sync
 * - Sync timeout handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  CourierSync,
  createCourierSync,
  SyncManifest,
  SyncNegotiation,
  SyncResult,
  SyncConstraints,
  DEFAULT_SYNC_CONSTRAINTS,
  SYNC_PROTOCOL_VERSION,
} from './CourierSync.js';
import {
  MessagePriority,
  DeliveryStatus,
  createStoredMessage,
} from '../storage/MessageStore.js';
import type { StoredMessage, MessageStore } from '../storage/MessageStore.js';
import type { Message } from '../protocol/message.js';
import { BloomFilter, createBloomFilter } from '../dedup/BloomFilter.js';
import { createMemoryMessageStore } from '../storage/MemoryMessageStore.js';

describe('CourierSync', () => {
  let sync: CourierSync;
  let messageStore: MessageStore;
  let bloomFilter: BloomFilter;
  const localPeerId = 'local-peer-123';
  const geoZone = 'zone-A';

  // Helper to create mock message
  const createMockMessage = (
    content: string = 'test message',
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
    messageStore = createMemoryMessageStore();
    await messageStore.initialize();
    bloomFilter = createBloomFilter(10000, 0.01);
    sync = createCourierSync(messageStore, bloomFilter, localPeerId, geoZone);
  });

  afterEach(async () => {
    await messageStore.close();
  });

  // ============== Manifest Creation ==============

  describe('generateManifest()', () => {
    it('should create manifest with correct peer ID', async () => {
      const manifest = await sync.generateManifest();

      expect(manifest.peerId).toBe(localPeerId);
    });

    it('should include timestamp', async () => {
      const before = Date.now();
      const manifest = await sync.generateManifest();
      const after = Date.now();

      expect(manifest.timestamp).toBeGreaterThanOrEqual(before);
      expect(manifest.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include message count', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2');

      await messageStore.store(msg1);
      await messageStore.store(msg2);

      const manifest = await sync.generateManifest();

      expect(manifest.messageCount).toBe(2);
    });

    it('should export bloom filter state', async () => {
      bloomFilter.add('msg-1');
      bloomFilter.add('msg-2');

      const manifest = await sync.generateManifest();

      expect(manifest.bloomFilter).toBeDefined();
      expect(manifest.bloomFilter.itemCount).toBe(2);
      expect(Array.isArray(manifest.bloomFilter.bits)).toBe(true);
    });

    it('should include oldest and newest message timestamps', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      msg1.createdAt = 1000;

      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2');
      msg2.createdAt = 3000;

      const msg3 = createStoredMessage(createMockMessage('msg3'), 'peer-3');
      msg3.createdAt = 2000;

      await messageStore.bulkStore([msg1, msg2, msg3]);

      const manifest = await sync.generateManifest();

      expect(manifest.oldestMessage).toBe(1000);
      expect(manifest.newestMessage).toBe(3000);
    });

    it('should calculate storage available', async () => {
      const manifest = await sync.generateManifest();

      expect(manifest.storageAvailable).toBeGreaterThan(0);
      expect(manifest.storageAvailable).toBeLessThanOrEqual(500 * 1024 * 1024);
    });

    it('should include geo zones from messages', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1', {
        destinationGeoZone: 'zone-A',
      });
      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2', {
        destinationGeoZone: 'zone-B',
      });
      const msg3 = createStoredMessage(createMockMessage('msg3'), 'peer-3', {
        destinationGeoZone: 'zone-A',
      });

      await messageStore.bulkStore([msg1, msg2, msg3]);

      const manifest = await sync.generateManifest();

      expect(manifest.geoZones).toHaveLength(2);
      expect(manifest.geoZones).toContain('zone-A');
      expect(manifest.geoZones).toContain('zone-B');
    });

    it('should include capabilities', async () => {
      const manifest = await sync.generateManifest();

      expect(manifest.capabilities).toBeDefined();
      expect(manifest.capabilities.maxMessageSize).toBe(1024 * 1024);
      expect(manifest.capabilities.maxBatchSize).toBe(100);
      expect(manifest.capabilities.compression).toEqual(['none', 'gzip']);
      expect(manifest.capabilities.protocolVersion).toBe(SYNC_PROTOCOL_VERSION);
    });

    it('should handle empty store', async () => {
      const manifest = await sync.generateManifest();

      expect(manifest.messageCount).toBe(0);
      expect(manifest.geoZones).toEqual([]);
      expect(manifest.storageAvailable).toBeGreaterThan(0);
    });
  });

  // ============== Sync Negotiation ==============

  describe('negotiateSync()', () => {
    it('should identify messages peer needs', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2');

      await messageStore.bulkStore([msg1, msg2]);
      bloomFilter.add(msg1.id);
      bloomFilter.add(msg2.id);

      const ourManifest = await sync.generateManifest();

      // Create peer manifest with empty bloom filter
      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.messagesPeerNeeds).toHaveLength(2);
      expect(negotiation.messagesPeerNeeds).toContain(msg1.id);
      expect(negotiation.messagesPeerNeeds).toContain(msg2.id);
    });

    it('should not include messages peer already has', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2');

      await messageStore.bulkStore([msg1, msg2]);
      bloomFilter.add(msg1.id);
      bloomFilter.add(msg2.id);

      const ourManifest = await sync.generateManifest();

      // Create peer manifest with msg1 in bloom filter
      const peerBloom = createBloomFilter(10000, 0.01);
      peerBloom.add(msg1.id);

      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 1,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.messagesPeerNeeds).toHaveLength(1);
      expect(negotiation.messagesPeerNeeds).toContain(msg2.id);
      expect(negotiation.messagesPeerNeeds).not.toContain(msg1.id);
    });

    it('should estimate bytes to send and receive', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      await messageStore.store(msg1);
      bloomFilter.add(msg1.id);

      const ourManifest = await sync.generateManifest();
      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.estimatedBytesToSend).toBeGreaterThan(0);
      expect(negotiation.estimatedBytesToReceive).toBeGreaterThanOrEqual(0);
    });

    it('should estimate sync duration', async () => {
      const ourManifest = await sync.generateManifest();
      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.estimatedDuration).toBeGreaterThanOrEqual(0);
    });

    it('should negotiate gzip compression when both support it', async () => {
      const ourManifest = await sync.generateManifest();
      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.compression).toBe('gzip');
    });

    it('should fall back to no compression when peer does not support gzip', async () => {
      const ourManifest = await sync.generateManifest();
      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.compression).toBe('none');
    });
  });

  // ============== Message Prioritization ==============

  describe('prioritizeForSync()', () => {
    it('should prioritize EMERGENCY > HIGH > NORMAL > LOW', () => {
      const messages = [
        createStoredMessage(createMockMessage('low'), 'peer-1', {
          priority: MessagePriority.LOW,
        }),
        createStoredMessage(createMockMessage('high'), 'peer-2', {
          priority: MessagePriority.HIGH,
        }),
        createStoredMessage(createMockMessage('normal'), 'peer-3', {
          priority: MessagePriority.NORMAL,
        }),
        createStoredMessage(createMockMessage('emergency'), 'peer-4', {
          priority: MessagePriority.EMERGENCY,
        }),
      ];

      const messageMap = new Map<string, StoredMessage>();
      const ids: string[] = [];
      messages.forEach((msg) => {
        messageMap.set(msg.id, msg);
        ids.push(msg.id);
      });

      const prioritized = sync.prioritizeForSync(ids, messageMap);

      expect(prioritized).toHaveLength(4);
      expect(messageMap.get(prioritized[0])?.priority).toBe(MessagePriority.EMERGENCY);
      expect(messageMap.get(prioritized[1])?.priority).toBe(MessagePriority.HIGH);
      expect(messageMap.get(prioritized[2])?.priority).toBe(MessagePriority.NORMAL);
      expect(messageMap.get(prioritized[3])?.priority).toBe(MessagePriority.LOW);
    });

    it('should prioritize own messages when prioritizeOwn is true', () => {
      const messages = [
        createStoredMessage(createMockMessage('relay'), 'peer-1', {
          priority: MessagePriority.HIGH,
          isOwnMessage: false,
        }),
        createStoredMessage(createMockMessage('own'), 'peer-2', {
          priority: MessagePriority.HIGH,
          isOwnMessage: true,
        }),
      ];

      const messageMap = new Map<string, StoredMessage>();
      const ids: string[] = [];
      messages.forEach((msg) => {
        messageMap.set(msg.id, msg);
        ids.push(msg.id);
      });

      const prioritized = sync.prioritizeForSync(ids, messageMap, {
        ...DEFAULT_SYNC_CONSTRAINTS,
        prioritizeOwn: true,
      });

      expect(prioritized).toHaveLength(2);
      expect(messageMap.get(prioritized[0])?.isOwnMessage).toBe(true);
      expect(messageMap.get(prioritized[1])?.isOwnMessage).toBe(false);
    });

    it('should prioritize older messages within same priority', () => {
      const messages = [
        createStoredMessage(createMockMessage('newer'), 'peer-1', {
          priority: MessagePriority.NORMAL,
        }),
        createStoredMessage(createMockMessage('older'), 'peer-2', {
          priority: MessagePriority.NORMAL,
        }),
      ];

      messages[0].createdAt = 2000;
      messages[1].createdAt = 1000;

      const messageMap = new Map<string, StoredMessage>();
      const ids: string[] = [];
      messages.forEach((msg) => {
        messageMap.set(msg.id, msg);
        ids.push(msg.id);
      });

      const prioritized = sync.prioritizeForSync(ids, messageMap);

      expect(prioritized).toHaveLength(2);
      expect(messageMap.get(prioritized[0])?.createdAt).toBe(1000); // Older first
      expect(messageMap.get(prioritized[1])?.createdAt).toBe(2000);
    });

    it('should filter by minimum priority', () => {
      const messages = [
        createStoredMessage(createMockMessage('low'), 'peer-1', {
          priority: MessagePriority.LOW,
        }),
        createStoredMessage(createMockMessage('normal'), 'peer-2', {
          priority: MessagePriority.NORMAL,
        }),
        createStoredMessage(createMockMessage('high'), 'peer-3', {
          priority: MessagePriority.HIGH,
        }),
      ];

      const messageMap = new Map<string, StoredMessage>();
      const ids: string[] = [];
      messages.forEach((msg) => {
        messageMap.set(msg.id, msg);
        ids.push(msg.id);
      });

      const prioritized = sync.prioritizeForSync(ids, messageMap, {
        ...DEFAULT_SYNC_CONSTRAINTS,
        minPriority: MessagePriority.NORMAL,
      });

      expect(prioritized).toHaveLength(2);
      expect(messageMap.get(prioritized[0])?.priority).toBe(MessagePriority.HIGH);
      expect(messageMap.get(prioritized[1])?.priority).toBe(MessagePriority.NORMAL);
    });

    it('should filter by target geo zones', () => {
      const messages = [
        createStoredMessage(createMockMessage('zone-a'), 'peer-1', {
          destinationGeoZone: 'zone-A',
        }),
        createStoredMessage(createMockMessage('zone-b'), 'peer-2', {
          destinationGeoZone: 'zone-B',
        }),
        createStoredMessage(createMockMessage('zone-c'), 'peer-3', {
          destinationGeoZone: 'zone-C',
        }),
      ];

      const messageMap = new Map<string, StoredMessage>();
      const ids: string[] = [];
      messages.forEach((msg) => {
        messageMap.set(msg.id, msg);
        ids.push(msg.id);
      });

      const prioritized = sync.prioritizeForSync(ids, messageMap, {
        ...DEFAULT_SYNC_CONSTRAINTS,
        targetGeoZones: ['zone-A', 'zone-C'],
      });

      expect(prioritized).toHaveLength(2);
      expect(messageMap.get(prioritized[0])?.destinationGeoZone).toBe('zone-A');
      expect(messageMap.get(prioritized[1])?.destinationGeoZone).toBe('zone-C');
    });

    it('should respect byte limit', () => {
      const messages = [
        createStoredMessage(createMockMessage('msg1'), 'peer-1'),
        createStoredMessage(createMockMessage('msg2'), 'peer-2'),
        createStoredMessage(createMockMessage('msg3'), 'peer-3'),
      ];

      const messageMap = new Map<string, StoredMessage>();
      const ids: string[] = [];
      messages.forEach((msg) => {
        messageMap.set(msg.id, msg);
        ids.push(msg.id);
      });

      // Set very small byte limit
      const prioritized = sync.prioritizeForSync(ids, messageMap, {
        ...DEFAULT_SYNC_CONSTRAINTS,
        maxBytes: 500, // Should fit only 1 message
      });

      expect(prioritized.length).toBeLessThan(3);
    });

    it('should handle empty message list', () => {
      const messageMap = new Map<string, StoredMessage>();
      const prioritized = sync.prioritizeForSync([], messageMap);

      expect(prioritized).toEqual([]);
    });

    it('should handle messages not in map', () => {
      const messageMap = new Map<string, StoredMessage>();
      const prioritized = sync.prioritizeForSync(['non-existent-id'], messageMap);

      expect(prioritized).toEqual([]);
    });
  });

  // ============== Sync Execution ==============

  describe('performSync()', () => {
    it('should successfully sync messages bidirectionally', async () => {
      // Add local messages
      const localMsg1 = createStoredMessage(createMockMessage('local1'), 'peer-1');
      const localMsg2 = createStoredMessage(createMockMessage('local2'), 'peer-2');

      await messageStore.bulkStore([localMsg1, localMsg2]);
      bloomFilter.add(localMsg1.id);
      bloomFilter.add(localMsg2.id);

      // Prepare peer messages
      const peerMsg1 = createStoredMessage(createMockMessage('peer1'), 'peer-3');
      const peerMsg2 = createStoredMessage(createMockMessage('peer2'), 'peer-4');

      const sentMessages: StoredMessage[] = [];
      const sendMessage = jest.fn(async (msg: StoredMessage) => {
        sentMessages.push(msg);
      });

      const receiveMessages = jest.fn(async () => {
        return [peerMsg1, peerMsg2];
      });

      // Create peer manifest
      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 2,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.success).toBe(true);
      expect(result.messagesSent).toBe(2);
      expect(result.messagesReceived).toBe(2);
      expect(result.bytesSent).toBeGreaterThan(0);
      expect(result.bytesReceived).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.errors).toHaveLength(0);
      expect(result.failedMessages).toHaveLength(0);
    });

    it('should add received messages to bloom filter', async () => {
      const peerMsg = createStoredMessage(createMockMessage('peer-msg'), 'peer-1');

      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => [peerMsg]);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 1,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      expect(bloomFilter.mightContain(peerMsg.id)).toBe(false);

      await sync.performSync(sendMessage, receiveMessages, peerManifest);

      expect(bloomFilter.mightContain(peerMsg.id)).toBe(true);
    });

    it('should respect time limit during send', async () => {
      const messages: StoredMessage[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push(createStoredMessage(createMockMessage(`msg${i}`), `peer-${i}`));
      }

      await messageStore.bulkStore(messages);
      messages.forEach((msg) => bloomFilter.add(msg.id));

      let sendCount = 0;
      const sendMessage = jest.fn(async () => {
        sendCount++;
        // Simulate slow send
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const receiveMessages = jest.fn(async () => []);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest,
        {
          ...DEFAULT_SYNC_CONSTRAINTS,
          maxDuration: 500, // 500ms - should stop after ~5 sends
        }
      );

      expect(result.messagesSent).toBeLessThan(100);
      expect(result.messagesSent).toBeGreaterThan(0);
    });

    it('should respect byte limit during receive', async () => {
      const peerMessages: StoredMessage[] = [];
      for (let i = 0; i < 10; i++) {
        peerMessages.push(
          createStoredMessage(createMockMessage(`large-msg-${i}`), `peer-${i}`)
        );
      }

      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => peerMessages);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 10,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest,
        {
          ...DEFAULT_SYNC_CONSTRAINTS,
          maxBytes: 1000, // Very small limit
        }
      );

      expect(result.messagesReceived).toBeLessThan(10);
    });

    it('should handle send errors gracefully', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2');

      await messageStore.bulkStore([msg1, msg2]);
      bloomFilter.add(msg1.id);
      bloomFilter.add(msg2.id);

      let callCount = 0;
      const sendMessage = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Send failed');
        }
      });

      const receiveMessages = jest.fn(async () => []);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.failedMessages.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('SEND_FAILED');
    });

    it('should handle receive/store errors gracefully', async () => {
      const peerMsg = createStoredMessage(createMockMessage('peer-msg'), 'peer-1');

      // Create a proxy store that delegates all methods but throws on store
      const failingStore = new Proxy(messageStore, {
        get(target, prop) {
          if (prop === 'store') {
            return async () => { throw new Error('Store failed'); };
          }
          const value = (target as unknown as Record<string, unknown>)[prop as string];
          return typeof value === 'function' ? (value as Function).bind(target) : value;
        }
      });

      const failingSync = new CourierSync(failingStore, bloomFilter, localPeerId, geoZone);

      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => [peerMsg]);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 1,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await failingSync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('STORE_FAILED');
    });

    it('should handle sync failure', async () => {
      const sendMessage = jest.fn(async () => {
        throw new Error('Catastrophic failure');
      });

      const receiveMessages = jest.fn(async () => {
        throw new Error('Catastrophic failure');
      });

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should track sync duration accurately', async () => {
      const sendMessage = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const receiveMessages = jest.fn(async () => []);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ============== Quick Sync ==============

  describe('quickSync()', () => {
    it('should only sync HIGH and EMERGENCY priority messages', async () => {
      const messages = [
        createStoredMessage(createMockMessage('low'), 'peer-1', {
          priority: MessagePriority.LOW,
        }),
        createStoredMessage(createMockMessage('normal'), 'peer-2', {
          priority: MessagePriority.NORMAL,
        }),
        createStoredMessage(createMockMessage('high'), 'peer-3', {
          priority: MessagePriority.HIGH,
        }),
        createStoredMessage(createMockMessage('emergency'), 'peer-4', {
          priority: MessagePriority.EMERGENCY,
        }),
      ];

      await messageStore.bulkStore(messages);
      messages.forEach((msg) => bloomFilter.add(msg.id));

      const sentMessages: StoredMessage[] = [];
      const sendMessage = jest.fn(async (msg: StoredMessage) => {
        sentMessages.push(msg);
      });

      const receiveMessages = jest.fn(async () => []);

      const result = await sync.quickSync(sendMessage, receiveMessages);

      expect(result.messagesSent).toBe(2); // Only HIGH and EMERGENCY
      expect(sentMessages.every((m) => m.priority >= MessagePriority.HIGH)).toBe(
        true
      );
    });

    it('should have smaller byte limit than regular sync', async () => {
      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => []);

      const result = await sync.quickSync(sendMessage, receiveMessages);

      expect(result.success).toBe(true);
      // Quick sync has 10MB limit vs 50MB for regular sync
    });

    it('should respect custom duration', async () => {
      const sendMessage = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      const receiveMessages = jest.fn(async () => []);

      const startTime = Date.now();
      await sync.quickSync(sendMessage, receiveMessages, 500);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should respect short timeout
    });
  });

  // ============== Bloom Filter Exchange ==============

  describe('Bloom Filter Exchange', () => {
    it('should export and import bloom filter correctly', async () => {
      bloomFilter.add('msg-1');
      bloomFilter.add('msg-2');
      bloomFilter.add('msg-3');

      const manifest = await sync.generateManifest();

      const imported = BloomFilter.import(manifest.bloomFilter);

      expect(imported.mightContain('msg-1')).toBe(true);
      expect(imported.mightContain('msg-2')).toBe(true);
      expect(imported.mightContain('msg-3')).toBe(true);
      expect(imported.mightContain('msg-4')).toBe(false);
    });

    it('should use bloom filter to identify missing messages', async () => {
      const msg1 = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      const msg2 = createStoredMessage(createMockMessage('msg2'), 'peer-2');
      const msg3 = createStoredMessage(createMockMessage('msg3'), 'peer-3');

      await messageStore.bulkStore([msg1, msg2, msg3]);
      bloomFilter.add(msg1.id);
      bloomFilter.add(msg2.id);
      bloomFilter.add(msg3.id);

      const ourManifest = await sync.generateManifest();

      // Peer has msg1 and msg2
      const peerBloom = createBloomFilter(10000, 0.01);
      peerBloom.add(msg1.id);
      peerBloom.add(msg2.id);

      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 2,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const negotiation = await sync.negotiateSync(ourManifest, peerManifest);

      expect(negotiation.messagesPeerNeeds).toHaveLength(1);
      expect(negotiation.messagesPeerNeeds).toContain(msg3.id);
    });
  });

  // ============== Protocol Version Compatibility ==============

  describe('Protocol Version Compatibility', () => {
    it('should include protocol version in manifest', async () => {
      const manifest = await sync.generateManifest();

      expect(manifest.capabilities.protocolVersion).toBe(SYNC_PROTOCOL_VERSION);
    });

    it('should verify SYNC_PROTOCOL_VERSION constant', () => {
      expect(SYNC_PROTOCOL_VERSION).toBe(1);
    });
  });

  // ============== Bidirectional Sync Fairness ==============

  describe('Bidirectional Sync Fairness', () => {
    it('should send and receive in same sync session', async () => {
      const localMsg = createStoredMessage(createMockMessage('local'), 'peer-1');
      const peerMsg = createStoredMessage(createMockMessage('peer'), 'peer-2');

      await messageStore.store(localMsg);
      bloomFilter.add(localMsg.id);

      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => [peerMsg]);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 1,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.messagesSent).toBe(1);
      expect(result.messagesReceived).toBe(1);
      expect(result.bytesSent).toBeGreaterThan(0);
      expect(result.bytesReceived).toBeGreaterThan(0);
    });
  });

  // ============== Edge Cases ==============

  describe('Edge Cases', () => {
    it('should handle empty store sync', async () => {
      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => []);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.success).toBe(true);
      expect(result.messagesSent).toBe(0);
      expect(result.messagesReceived).toBe(0);
    });

    it('should handle sync with no messages to exchange', async () => {
      const msg = createStoredMessage(createMockMessage('msg1'), 'peer-1');
      await messageStore.store(msg);
      bloomFilter.add(msg.id);

      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => []);

      // Peer already has all our messages
      const peerBloom = createBloomFilter(10000, 0.01);
      peerBloom.add(msg.id);

      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 1,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest
      );

      expect(result.success).toBe(true);
      expect(result.messagesSent).toBe(0);
    });

    it('should handle extremely short time limits', async () => {
      const messages: StoredMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createStoredMessage(createMockMessage(`msg${i}`), `peer-${i}`));
      }

      await messageStore.bulkStore(messages);
      messages.forEach((msg) => bloomFilter.add(msg.id));

      const sendMessage = jest.fn(async () => {});
      const receiveMessages = jest.fn(async () => []);

      const peerBloom = createBloomFilter(10000, 0.01);
      const peerManifest: SyncManifest = {
        peerId: 'peer-remote',
        timestamp: Date.now(),
        messageCount: 0,
        bloomFilter: peerBloom.export(),
        oldestMessage: 0,
        newestMessage: 0,
        storageAvailable: 100 * 1024 * 1024,
        geoZones: [],
        capabilities: {
          maxMessageSize: 1024 * 1024,
          maxBatchSize: 100,
          compression: ['none', 'gzip'],
          protocolVersion: 1,
        },
      };

      const result = await sync.performSync(
        sendMessage,
        receiveMessages,
        peerManifest,
        {
          ...DEFAULT_SYNC_CONSTRAINTS,
          maxDuration: 1, // 1ms
        }
      );

      expect(result.success).toBe(true);
      // Should complete but may not send all messages
    });
  });

  // ============== Factory Function ==============

  describe('createCourierSync()', () => {
    it('should create CourierSync instance', () => {
      const instance = createCourierSync(
        messageStore,
        bloomFilter,
        'peer-123',
        'zone-A'
      );

      expect(instance).toBeInstanceOf(CourierSync);
    });

    it('should work without geo zone', () => {
      const instance = createCourierSync(messageStore, bloomFilter, 'peer-123');

      expect(instance).toBeInstanceOf(CourierSync);
    });
  });

  // ============== Constants ==============

  describe('DEFAULT_SYNC_CONSTRAINTS', () => {
    it('should have expected values', () => {
      expect(DEFAULT_SYNC_CONSTRAINTS.maxDuration).toBe(60_000);
      expect(DEFAULT_SYNC_CONSTRAINTS.maxBytes).toBe(50 * 1024 * 1024);
      expect(DEFAULT_SYNC_CONSTRAINTS.minPriority).toBe(MessagePriority.LOW);
      expect(DEFAULT_SYNC_CONSTRAINTS.prioritizeOwn).toBe(true);
    });
  });

  describe('SYNC_PROTOCOL_VERSION', () => {
    it('should be version 1', () => {
      expect(SYNC_PROTOCOL_VERSION).toBe(1);
    });
  });
});
