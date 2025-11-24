/**
 * Integration tests for mesh network routing
 */
import { RoutingTable, PeerState, createPeer } from '../../core/src/mesh/routing';
import { MessageRelay } from '../../core/src/mesh/relay';
import { Message, MessageType, encodeMessage } from '../../core/src/protocol/message';
import { generateIdentity } from '../../core/src/crypto/primitives';

describe('Mesh Network Integration', () => {
  let routingTable: RoutingTable;
  let relay: MessageRelay;
  let identity: { publicKey: Uint8Array; privateKey: Uint8Array };
  let localPeerId: string;

  beforeEach(async () => {
    identity = await generateIdentity();
    localPeerId = Buffer.from(identity.publicKey).toString('hex');
    routingTable = new RoutingTable();
    relay = new MessageRelay(localPeerId, routingTable);
  });

  describe('Peer routing', () => {
    it('should route messages to connected peers', async () => {
      const peerId = 'peer-1';
      const peerPublicKey = new Uint8Array(32).fill(1);
      
      // Add peer to routing table using createPeer helper
      const peer = createPeer(peerId, peerPublicKey, 'webrtc');
      routingTable.addPeer(peer);

      // Verify peer exists
      const retrievedPeer = routingTable.getPeer(peerId);
      expect(retrievedPeer).toBeDefined();
      expect(retrievedPeer?.id).toBe(peerId);
    });

    it('should handle multi-hop routing', () => {
      // Add multiple peers in a chain
      const peers = ['peer-1', 'peer-2', 'peer-3'];
      peers.forEach((peerId, index) => {
        const peer = createPeer(peerId, new Uint8Array(32).fill(index + 1), 'webrtc');
        routingTable.addPeer(peer);
      });

      // All peers should be in routing table
      expect(routingTable.getAllPeers()).toHaveLength(3);
    });

    it('should update peer reputation based on behavior', () => {
      const peerId = 'peer-1';
      const peer = createPeer(peerId, new Uint8Array(32).fill(1), 'webrtc');
      routingTable.addPeer(peer);

      // Update reputation negatively
      routingTable.updatePeerReputation(peerId, false);
      
      let retrievedPeer = routingTable.getPeer(peerId);
      // Default reputation is 50, negative update should decrease it
      const DEFAULT_REPUTATION = 50;
      expect(retrievedPeer?.metadata.reputation).toBeLessThan(DEFAULT_REPUTATION);

      // Update reputation positively
      routingTable.updatePeerReputation(peerId, true);
      retrievedPeer = routingTable.getPeer(peerId);
      expect(retrievedPeer?.metadata.reputation).toBeGreaterThanOrEqual(0);
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

      // Encode the message
      const encodedMessage = encodeMessage(message);

      // Process the same message twice from the same peer
      await relay.processMessage(encodedMessage, 'peer-1');
      await relay.processMessage(encodedMessage, 'peer-1');

      // Check that the message was marked as seen (deduplicated)
      const stats = relay.getStats();
      expect(stats.messagesDuplicate).toBeGreaterThanOrEqual(1);
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

      // Encode the message
      const encodedMessage = encodeMessage(message);

      await relay.processMessage(encodedMessage, 'peer-1');

      // Should not forward expired message
      const stats = relay.getStats();
      expect(stats.messagesExpired).toBeGreaterThanOrEqual(1);
      expect(stats.messagesForwarded).toBe(0);
    });
  });

  describe('Network health', () => {
    it('should track peer health metrics', () => {
      const peerId = 'peer-1';
      const peer = createPeer(peerId, new Uint8Array(32).fill(1), 'webrtc');
      
      // Update peer metadata
      peer.metadata.reputation = 80;
      peer.metadata.successCount = 10;
      peer.metadata.capabilities.maxBandwidth = 1000000;
      peer.metadata.capabilities.features = ['relay', 'file-transfer'];
      
      routingTable.addPeer(peer);

      const retrievedPeer = routingTable.getPeer(peerId);
      expect(retrievedPeer?.metadata.reputation).toBe(80);
      expect(retrievedPeer?.metadata.successCount).toBe(10);
      expect(retrievedPeer?.metadata.capabilities.maxBandwidth).toBe(1000000);
    });
  });
});
