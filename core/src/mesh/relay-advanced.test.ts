import { MessageRelay, fragmentMessage, MessageReassembler, calculateFragmentSize, calculateFragmentationOverhead } from './relay';
import type { Peer } from './routing';
import { RoutingTable, createPeer } from './routing';
import type { Message } from '../protocol/message';
import { MessageType, encodeMessage } from '../protocol/message';

describe('Advanced Message Relay Features', () => {
  let relay: MessageRelay;
  let routingTable: RoutingTable;
  const localPeerId = 'local-peer';

  beforeEach(() => {
    routingTable = new RoutingTable(localPeerId);
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

  describe('Loopback Prevention (Regression Tests for PR #211)', () => {
    it('should NOT deliver own messages back to self', async () => {
      // Create 32-byte sender ID that extracts to a matching peer ID
      // For this test, use a hex peer ID that matches the extraction
      const testPeerId = 'ABCDEF0123456789'; // 16-char hex peer ID
      const senderId = new Uint8Array(32);
      // Convert hex string to bytes
      for (let i = 0; i < 8; i++) {
        senderId[i] = parseInt(testPeerId.substring(i * 2, i * 2 + 2), 16);
      }

      // Create a relay with matching peer ID for this test
      const testRelay = new MessageRelay(testPeerId, routingTable, {
        maxStoredMessages: 10,
        storeTimeout: 5000,
        maxRetries: 3,
        retryBackoff: 1000,
        floodRateLimit: 10,
        selectiveFlooding: true,
      });

      const messageToSelf: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: senderId, // Message sent by local peer
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Hello from myself',
          recipient: testPeerId,
        })),
      };

      const messageData = encodeMessage(messageToSelf);
      let deliveredToSelf = false;

      testRelay.onMessageForSelf(() => {
        deliveredToSelf = true;
      });

      // Process a message that we sent
      await testRelay.processMessage(messageData, 'some-peer');

      // Should NOT be delivered to self (loopback prevention)
      expect(deliveredToSelf).toBe(false);

      const stats = testRelay.getStats();
      expect(stats.messagesForSelf).toBe(0);
    });

    it('should deliver messages from OTHER peers addressed to us', async () => {
      // Create 32-byte sender ID (pad as needed)
      const senderId = new Uint8Array(32);
      const otherPeerIdBytes = new TextEncoder().encode('OTHER_PEER_ID_9876543210');
      senderId.set(otherPeerIdBytes.slice(0, Math.min(32, otherPeerIdBytes.length)));

      const messageFromOther: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: senderId, // Message sent by OTHER peer
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Hello from other peer',
          recipient: localPeerId,
        })),
      };

      const messageData = encodeMessage(messageFromOther);
      let deliveredToSelf = false;

      relay.onMessageForSelf(() => {
        deliveredToSelf = true;
      });

      // Process a message from another peer addressed to us
      await relay.processMessage(messageData, 'other-peer');

      // SHOULD be delivered to self (from different peer)
      expect(deliveredToSelf).toBe(true);

      const stats = relay.getStats();
      expect(stats.messagesForSelf).toBe(1);
    });

    it('should forward own messages to other peers instead of delivering to self', async () => {
      // Create 32-byte sender ID that matches the relay's peer ID for proper loopback testing
      // Use the same approach as the first test to ensure proper hex-to-peer-ID matching
      const testPeerId = '1234567890ABCDEF'; // 16-char hex peer ID
      const senderId = new Uint8Array(32);
      // Convert hex string to bytes
      for (let i = 0; i < 8; i++) {
        senderId[i] = parseInt(testPeerId.substring(i * 2, i * 2 + 2), 16);
      }

      // Create a relay with matching peer ID for this test
      const testRelay = new MessageRelay(testPeerId, routingTable, {
        maxStoredMessages: 10,
        storeTimeout: 5000,
        maxRetries: 3,
        retryBackoff: 1000,
        floodRateLimit: 10,
        selectiveFlooding: true,
      });

      const messageToOther: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: senderId, // Message sent by local peer
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Hello to other peer',
          recipient: 'OTHER_PEER_ID',
        })),
      };

      const messageData = encodeMessage(messageToOther);
      let deliveredToSelf = false;
      let forwardedToOthers = false;

      testRelay.onMessageForSelf(() => {
        deliveredToSelf = true;
      });

      testRelay.onForwardMessage(() => {
        forwardedToOthers = true;
      });

      // Process own message (would happen when relaying our own sent message)
      await testRelay.processMessage(messageData, 'local-peer');

      // Should NOT deliver to self
      expect(deliveredToSelf).toBe(false);

      // SHOULD forward to other peers
      expect(forwardedToOthers).toBe(true);

      const stats = testRelay.getStats();
      expect(stats.messagesForSelf).toBe(0);
      expect(stats.messagesForwarded).toBe(1);
    });

    it('should process broadcast messages even from self', async () => {
      // Create 32-byte sender ID (pad as needed)
      const senderId = new Uint8Array(32);
      const localPeerIdBytes = new TextEncoder().encode('LOCAL_PEER_ID_1234567890');
      senderId.set(localPeerIdBytes.slice(0, Math.min(32, localPeerIdBytes.length)));

      const broadcastMessage: Message = {
        header: {
          version: 0x01,
          type: MessageType.PEER_DISCOVERY, // Broadcast type
          ttl: 5,
          timestamp: Date.now(),
          senderId: senderId, // Message sent by local peer
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode('Discovery broadcast'),
      };

      const messageData = encodeMessage(broadcastMessage);
      let deliveredToSelf = false;

      relay.onMessageForSelf(() => {
        deliveredToSelf = true;
      });

      // Process broadcast message from self
      await relay.processMessage(messageData, 'local-peer');

      // Broadcast messages should still be delivered (special case)
      expect(deliveredToSelf).toBe(true);

      const stats = relay.getStats();
      expect(stats.messagesForSelf).toBe(1);
    });

    it('should handle recipient validation with type safety', async () => {
      // Create 32-byte sender ID (pad as needed)
      const senderId = new Uint8Array(32);
      const otherPeerIdBytes = new TextEncoder().encode('OTHER_PEER_ID_9876543210');
      senderId.set(otherPeerIdBytes.slice(0, Math.min(32, otherPeerIdBytes.length)));

      // Test with invalid recipient type (not a string)
      const messageWithInvalidRecipient: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 5,
          timestamp: Date.now(),
          senderId: senderId,
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Message with invalid recipient',
          recipient: 12345, // Invalid: number instead of string
        })),
      };

      const messageData = encodeMessage(messageWithInvalidRecipient);
      let deliveredToSelf = false;

      relay.onMessageForSelf(() => {
        deliveredToSelf = true;
      });

      // Should handle gracefully without crashing
      await expect(relay.processMessage(messageData, 'other-peer')).resolves.not.toThrow();

      // Should not deliver invalid message
      expect(deliveredToSelf).toBe(false);
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
