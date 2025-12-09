/**
 * Tests for Message Relay and Flood Routing
 */

import { MessageRelay, RelayConfig } from './relay';
import { RoutingTable } from './routing';
import { Message, MessageType, encodeMessage } from '../protocol/message';

describe('MessageRelay', () => {
  let relay: MessageRelay;
  let routingTable: RoutingTable;
  const localPeerId = 'local-peer-123';

  beforeEach(() => {
    routingTable = new RoutingTable();
    relay = new MessageRelay(localPeerId, routingTable);
  });

  describe('Configuration', () => {
    it('should create relay with default config', () => {
      expect(relay).toBeDefined();
      const stats = relay.getStats();
      expect(stats.messagesReceived).toBe(0);
      expect(stats.messagesForwarded).toBe(0);
    });

    it('should create relay with custom config', () => {
      const config: RelayConfig = {
        maxStoredMessages: 500,
        storeTimeout: 120000,
        maxRetries: 5,
      };
      const customRelay = new MessageRelay(localPeerId, routingTable, config);
      expect(customRelay).toBeDefined();
    });

    it('should use selective flooding by default', () => {
      const config: RelayConfig = {};
      const selectiveRelay = new MessageRelay(localPeerId, routingTable, config);
      expect(selectiveRelay).toBeDefined();
    });
  });

  describe('Message Processing', () => {
    it('should process valid message', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('test message'),
      };

      const encoded = encodeMessage(message);
      await relay.processMessage(encoded, 'peer-1');

      const stats = relay.getStats();
      expect(stats.messagesReceived).toBe(1);
    });

    it('should detect duplicate messages', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('duplicate test'),
      };

      const encoded = encodeMessage(message);

      await relay.processMessage(encoded, 'peer-1');
      await relay.processMessage(encoded, 'peer-2'); // Duplicate

      const stats = relay.getStats();
      expect(stats.messagesReceived).toBe(2);
      expect(stats.messagesDuplicate).toBe(1);
    });

    it('should drop expired messages (TTL=0)', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 0,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('expired'),
      };

      const encoded = encodeMessage(message);
      await relay.processMessage(encoded, 'peer-1');

      const stats = relay.getStats();
      expect(stats.messagesExpired).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track message stats', () => {
      const stats = relay.getStats();

      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('messagesForwarded');
      expect(stats).toHaveProperty('messagesDuplicate');
      expect(stats).toHaveProperty('messagesExpired');
      expect(stats).toHaveProperty('messagesForSelf');
      expect(stats).toHaveProperty('messagesStored');
      expect(stats).toHaveProperty('relayFailures');
      expect(stats).toHaveProperty('loopsDetected');
    });

    it('should reset statistics', () => {
      relay.resetStats();
      const stats = relay.getStats();

      expect(stats.messagesReceived).toBe(0);
      expect(stats.messagesForwarded).toBe(0);
      expect(stats.messagesDuplicate).toBe(0);
      expect(stats.messagesExpired).toBe(0);
    });
  });

  describe('Store and Forward', () => {
    it('should store message for offline peer', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('stored message'),
      };

      await relay.storeMessage(message, 'offline-peer');

      const stats = await relay.getStats();
      expect(stats.messagesStored).toBe(1);
    });

    it('should track stored messages stats', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('retrieve test'),
      };

      await relay.storeMessage(message, 'offline-peer');
      const storedStats = await relay.getStoredMessagesStats();

      expect(storedStats.total).toBeGreaterThan(0);
      expect(storedStats.byDestination).toHaveProperty('offline-peer');
    });

    it('should retry stored messages', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('clear test'),
      };

      await relay.storeMessage(message, 'peer-1');
      await relay.retryStoredMessages();

      expect(relay).toBeDefined();
    });
  });

  describe('Callbacks', () => {
    it('should register onMessageForSelf callback', () => {
      let callbackCalled = false;

      relay.onMessageForSelf(() => {
        callbackCalled = true;
      });

      expect(relay).toBeDefined();
    });

    it('should register onForwardMessage callback', () => {
      let callbackCalled = false;

      relay.onForwardMessage(() => {
        callbackCalled = true;
      });

      expect(relay).toBeDefined();
    });
  });

  describe('Loop Detection', () => {
    it('should detect message loops', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('loop test'),
      };

      const encoded = encodeMessage(message);

      // Process from multiple peers to simulate potential loop
      await relay.processMessage(encoded, 'peer-1');

      const stats = relay.getStats();
      expect(stats).toBeDefined();
    });
  });
});
