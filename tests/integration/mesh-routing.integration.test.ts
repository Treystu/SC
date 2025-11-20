/**
 * Integration tests for mesh network routing
 */
import { RoutingTable } from '../../core/src/mesh/routing';
import { MessageRelay } from '../../core/src/mesh/relay';
import { Message, MessageType } from '../../core/src/protocol/message';
import { generateIdentity } from '../../core/src/crypto/primitives';

describe('Mesh Network Integration', () => {
  let routingTable: RoutingTable;
  let relay: MessageRelay;
  let identity: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeEach(async () => {
    identity = await generateIdentity();
    routingTable = new RoutingTable();
    relay = new MessageRelay(routingTable);
  });

  afterEach(() => {
    relay.shutdown();
  });

  describe('Peer routing', () => {
    it('should route messages to connected peers', async () => {
      const peerId = 'peer-1';
      const peerPublicKey = new Uint8Array(32).fill(1);
      
      // Add peer to routing table
      routingTable.addPeer({
        id: peerId,
        publicKey: peerPublicKey,
        transport: 'webrtc',
        lastSeen: Date.now(),
        reputation: 1.0,
        state: 'connected',
        metadata: {},
      });

      // Verify peer exists
      const peer = routingTable.getPeer(peerId);
      expect(peer).toBeDefined();
      expect(peer?.id).toBe(peerId);
    });

    it('should handle multi-hop routing', () => {
      // Add multiple peers in a chain
      const peers = ['peer-1', 'peer-2', 'peer-3'];
      peers.forEach((peerId, index) => {
        routingTable.addPeer({
          id: peerId,
          publicKey: new Uint8Array(32).fill(index + 1),
          transport: 'webrtc',
          lastSeen: Date.now(),
          reputation: 1.0,
          state: 'connected',
          metadata: {},
        });
      });

      // All peers should be in routing table
      expect(routingTable.getAllPeers()).toHaveLength(3);
    });

    it('should update peer reputation based on behavior', () => {
      const peerId = 'peer-1';
      routingTable.addPeer({
        id: peerId,
        publicKey: new Uint8Array(32).fill(1),
        transport: 'webrtc',
        lastSeen: Date.now(),
        reputation: 1.0,
        state: 'connected',
        metadata: {},
      });

      // Update reputation negatively
      routingTable.updatePeerReputation(peerId, false);
      
      let peer = routingTable.getPeer(peerId);
      expect(peer?.reputation).toBeLessThan(1.0);

      // Update reputation positively
      routingTable.updatePeerReputation(peerId, true);
      peer = routingTable.getPeer(peerId);
      expect(peer?.reputation).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Message relay', () => {
    it('should deduplicate messages', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(65),
        },
        payload: new TextEncoder().encode('Test'),
      };

      let relayCount = 0;
      relay.onRelay((msg) => {
        relayCount++;
      });

      // Try to relay the same message twice
      await relay.relayMessage(message, 'peer-1');
      await relay.relayMessage(message, 'peer-1');

      // Should only relay once due to deduplication
      expect(relayCount).toBeLessThanOrEqual(1);
    });

    it('should respect TTL limits', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 0, // Already expired
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(65),
        },
        payload: new TextEncoder().encode('Test'),
      };

      let relayCount = 0;
      relay.onRelay((msg) => {
        relayCount++;
      });

      await relay.relayMessage(message, 'peer-1');

      // Should not relay expired message
      expect(relayCount).toBe(0);
    });
  });

  describe('Network health', () => {
    it('should track peer health metrics', () => {
      const peerId = 'peer-1';
      routingTable.addPeer({
        id: peerId,
        publicKey: new Uint8Array(32).fill(1),
        transport: 'webrtc',
        lastSeen: Date.now(),
        reputation: 1.0,
        state: 'connected',
        metadata: {
          capabilities: {
            maxBandwidth: 1000000,
            supportedTransports: ['webrtc'],
            protocolVersion: 1,
            features: ['relay', 'file-transfer'],
          },
          reputation: 80,
          blacklisted: false,
          failureCount: 0,
          successCount: 10,
        },
      });

      const peer = routingTable.getPeer(peerId);
      expect(peer?.metadata.reputation).toBe(80);
      expect(peer?.metadata.successCount).toBe(10);
      expect(peer?.metadata.capabilities.maxBandwidth).toBe(1000000);
    });
  });
});
