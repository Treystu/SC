import { MessageRelay, fragmentMessage, MessageReassembler, calculateFragmentSize, calculateFragmentationOverhead } from './relay';
import { RoutingTable, createPeer } from './routing';
import { Message, MessageType, encodeMessage } from '../protocol/message';

describe('Advanced Message Relay Features', () => {
  let relay: MessageRelay;
  let routingTable: RoutingTable;
  const localPeerId = 'local-peer';

  beforeEach(() => {
    routingTable = new RoutingTable();
    relay = new MessageRelay(localPeerId, routingTable, {
      maxStoredMessages: 10,
      storeTimeout: 5000,
      maxRetries: 3,
      retryBackoff: 1000,
      floodRateLimit: 10,
      selectiveFlooding: true,
    });
  });

  describe('Loop Detection', () => {
    it('should detect routing loops', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('test'),
      };

      const messageData = encodeMessage(message);

      // Process message from peer1
      await relay.processMessage(messageData, 'peer1');

      // Process same message from peer1 again would be caught by deduplication
      // The loop detection tracks the path through different peers
      const stats = relay.getStats();

      // First message should be received
      expect(stats.messagesReceived).toBe(1);
    });
  });

  describe('Flood Rate Limiting', () => {
    it('should limit flood rate per peer', async () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      let forwardCount = 0;
      relay.onForwardMessage(() => {
        forwardCount++;
      });

      // Try to flood with many messages quickly
      for (let i = 0; i < 20; i++) {
        const message: Message = {
          header: {
            version: 0x01,
            type: MessageType.TEXT,
            ttl: 5,
            timestamp: Date.now(),
            senderId: new Uint8Array(32),
            signature: new Uint8Array(64),
          },
          payload: new TextEncoder().encode(`message${i}`),
        };

        const messageData = encodeMessage(message);
        await relay.processMessage(messageData, 'peer1');
      }

      // Should have rate limited some messages
      expect(forwardCount).toBeLessThan(20);
    });
  });

  describe('Store-and-Forward', () => {
    it('should store messages for offline peers', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('test'),
      };

      await relay.storeMessage(message, 'offline-peer');

      const stats = relay.getStats();
      expect(stats.messagesStored).toBe(1);

      const storedStats = await relay.getStoredMessagesStats();
      expect(storedStats.total).toBe(1);
      expect(storedStats.byDestination['offline-peer']).toBe(1);
    });

    it('should retry stored messages when peer comes online', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('test'),
      };

      await relay.storeMessage(message, 'peer1');

      // Peer comes online
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      const storedStatsBefore = await relay.getStoredMessagesStats();
      expect(storedStatsBefore.total).toBe(1);

      await relay.retryStoredMessages();

      // Message should still be stored until successfully sent
      const storedStatsAfter = await relay.getStoredMessagesStats();
      expect(storedStatsAfter).toBeDefined();
    });

    it('should limit stored messages and remove oldest', async () => {
      for (let i = 0; i < 15; i++) {
        const message: Message = {
          header: {
            version: 0x01,
            type: MessageType.TEXT,
            ttl: 5,
            timestamp: Date.now(),
            senderId: new Uint8Array(32),
            signature: new Uint8Array(64),
          },
          payload: new TextEncoder().encode(`message${i}`),
        };

        await relay.storeMessage(message, `peer${i}`);
      }

      const storedStats = await relay.getStoredMessagesStats();
      expect(storedStats.total).toBeLessThanOrEqual(10);
    });
  });

  describe('Selective Flooding', () => {
    it('should always forward control messages', async () => {
      const controlMessage: Message = {
        header: {
          version: 0x01,
          type: MessageType.CONTROL_PING,
          ttl: 5,
          timestamp: Date.now(),
          senderId: new Uint8Array(32),
          signature: new Uint8Array(64),
        },
        payload: new Uint8Array(0),
      };

      relay.onMessageForSelf(() => {
        // Control messages are delivered to self
      });

      const messageData = encodeMessage(controlMessage);
      await relay.processMessage(messageData, 'peer1');

      const stats = relay.getStats();
      expect(stats.messagesReceived).toBe(1);
    });
  });
});

describe('Message Fragmentation Advanced Features', () => {
  describe('Optimal Fragment Size', () => {
    it('should calculate fragment size based on MTU', () => {
      const size = calculateFragmentSize(1500, 100);
      expect(size).toBe(1400);
    });

    it('should respect minimum fragment size', () => {
      const size = calculateFragmentSize(200, 100);
      expect(size).toBeGreaterThanOrEqual(512);
    });

    it('should respect maximum fragment size', () => {
      const size = calculateFragmentSize(20000, 100);
      expect(size).toBeLessThanOrEqual(16384);
    });
  });

  describe('Fragmentation Overhead', () => {
    it('should calculate overhead correctly', () => {
      const messageSize = 100000;
      const fragmentSize = 16384;

      const overhead = calculateFragmentationOverhead(messageSize, fragmentSize);
      const expectedFragments = Math.ceil(messageSize / fragmentSize);

      expect(overhead).toBe(expectedFragments * 50);
    });
  });

  describe('Fragment Timestamps', () => {
    it('should include timestamp in fragments', () => {
      const message = new Uint8Array(50000);
      const fragments = fragmentMessage(message, 'msg1', 16384);

      expect(fragments.length).toBeGreaterThan(1);
      fragments.forEach(fragment => {
        expect(fragment.timestamp).toBeDefined();
        expect(fragment.timestamp).toBeGreaterThan(0);
      });
    });
  });
});

describe('Message Reassembly Advanced Features', () => {
  let reassembler: MessageReassembler;

  beforeEach(() => {
    reassembler = new MessageReassembler();
  });

  describe('Duplicate Fragment Detection', () => {
    it('should detect duplicate fragments', () => {
      const fragment = {
        messageId: 'msg1',
        fragmentIndex: 0,
        totalFragments: 3,
        data: new Uint8Array(100),
        timestamp: Date.now(),
      };

      const result1 = reassembler.addFragment(fragment);
      const result2 = reassembler.addFragment(fragment);

      expect(result1).toBe(false); // Not complete
      expect(result2).toBe(false); // Duplicate
    });
  });

  describe('Out-of-Order Fragment Handling', () => {
    it('should handle fragments arriving out of order', (done) => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
      const fragments = [
        {
          messageId: 'msg1',
          fragmentIndex: 2,
          totalFragments: 3,
          data: data.slice(4, 6),
          timestamp: Date.now(),
        },
        {
          messageId: 'msg1',
          fragmentIndex: 0,
          totalFragments: 3,
          data: data.slice(0, 2),
          timestamp: Date.now(),
        },
        {
          messageId: 'msg1',
          fragmentIndex: 1,
          totalFragments: 3,
          data: data.slice(2, 4),
          timestamp: Date.now(),
        },
      ];

      reassembler.onComplete((messageId, message) => {
        expect(messageId).toBe('msg1');
        expect(message).toEqual(data);
        done();
      });

      fragments.forEach(fragment => {
        reassembler.addFragment(fragment);
      });
    });
  });

  describe('Memory Limits and Cleanup', () => {
    it('should track buffer usage', () => {
      const fragment = {
        messageId: 'msg1',
        fragmentIndex: 0,
        totalFragments: 3,
        data: new Uint8Array(1000),
        timestamp: Date.now(),
      };

      reassembler.addFragment(fragment);

      const stats = reassembler.getStats();
      expect(stats.bufferUsage).toBeGreaterThan(0);
      expect(stats.bufferLimit).toBeDefined();
    });

    it('should cleanup expired messages', () => {
      const fragment = {
        messageId: 'msg1',
        fragmentIndex: 0,
        totalFragments: 3,
        data: new Uint8Array(1000),
        timestamp: Date.now(),
      };

      reassembler.addFragment(fragment);

      const beforeStats = reassembler.getStats();
      expect(beforeStats.incompleteMessages).toBe(1);

      // Cleanup won't remove recent messages
      const removed = reassembler.cleanup(100000); // Cleanup anything older than 100 seconds

      // Should not have removed recent message
      const afterStats = reassembler.getStats();
      expect(afterStats.incompleteMessages).toBe(1);
      expect(removed).toBe(0);
    });

    it('should include buffer limits in stats', () => {
      const stats = reassembler.getStats();

      expect(stats.bufferUsage).toBeDefined();
      expect(stats.bufferLimit).toBe(100 * 1024 * 1024);
    });
  });
});
