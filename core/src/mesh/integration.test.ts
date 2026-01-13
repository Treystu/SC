/**
 * Integration tests for mesh network components
 * Tests routing table, message relay, and network integration
 */

// @ts-nocheck
const { RoutingTable, PeerState, createPeer } = require('./routing');
const { MessageRelay } = require('./relay');
const { MeshNetwork } = require('./network');
const { MessageType, encodeMessage } = require('../protocol/message');
const { generateIdentity } = require('../crypto/primitives');

describe('Mesh Network Integration', () => {
  let routingTable: RoutingTable;
  let relay: MessageRelay;
  let network: MeshNetwork;
  let identity: { publicKey: Uint8Array; privateKey: Uint8Array };
  let localPeerId: string;

  beforeEach(async () => {
    identity = await generateIdentity();
    localPeerId = Buffer.from(identity.publicKey).toString('hex');
    routingTable = new RoutingTable(localPeerId);
    relay = new MessageRelay(localPeerId, routingTable);
    network = new MeshNetwork({
      identity: {
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
      },
      transports: [],
    });
  });

  describe('Routing Table Integration', () => {
    it('should integrate routing table with message relay', async () => {
      // Add a peer to routing table
      const peerId = 'peer123';
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      // Create a test message addressed to local peer
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Hello, World!',
          recipient: localPeerId
        })),
      };

      // Process message through relay
      let deliveredMessage: Message | undefined;
      relay.onMessageForSelf((msg: Message) => {
        deliveredMessage = msg;
      });

      await relay.processMessage(encodeMessage(message), 'test-peer');

      // Verify message was processed
      expect(deliveredMessage).toBeDefined();
      expect(deliveredMessage?.payload).toEqual(message.payload);
    });

    it('should handle peer state changes in routing table', () => {
      const peerId = 'peer456';
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      
      // Add peer
      routingTable.addPeer(peer);
      expect(peer.state).toBe(PeerState.CONNECTED);

      // Update reputation to trigger state change
      routingTable.updatePeerReputation(peerId, false);
      routingTable.updatePeerReputation(peerId, false);
      routingTable.updatePeerReputation(peerId, false);

      // Check if state changed to degraded
      const updatedPeer = routingTable.getPeer(peerId);
      expect(updatedPeer?.metadata.reputation).toBeLessThan(50);
    });

    it('should handle route expiration', async () => {
      const peerId = 'peer789';
      
      // Add peer with short TTL
      const shortTTLConfig = { routeTTL: 100 }; // 100ms
      const shortRoutingTable = new RoutingTable(localPeerId, shortTTLConfig);
      const shortRelay = new MessageRelay(localPeerId, shortRoutingTable);
      
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      shortRoutingTable.addPeer(peer);

      // Verify route exists initially
      expect(shortRoutingTable.getNextHop(peerId)).toBe(peerId);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify route expired
      expect(shortRoutingTable.getNextHop(peerId)).toBeUndefined();
    });
  });

  describe('Message Relay Integration', () => {
    it('should integrate with routing table for message forwarding', async () => {
      // Create multiple peers
      const peer1 = createPeer('peer1', new Uint8Array(32), 'webrtc');
      const peer2 = createPeer('peer2', new Uint8Array(32), 'webrtc');
      
      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);

      // Create message from peer1 to peer2
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Forwarded message',
          recipient: 'peer2'
        })),
      };

      let forwardedMessage: Message | undefined;
      relay.onForwardMessage((msg: Message, excludePeerId: string) => {
        forwardedMessage = msg;
      });

      // Process message
      await relay.processMessage(encodeMessage(message), 'test-peer');

      // Verify message was forwarded
      expect(forwardedMessage).toBeDefined();
      const payload = JSON.parse(new TextDecoder().decode(forwardedMessage!.payload));
      expect(payload.recipient).toBe('peer2');
    });

    it('should handle message deduplication', async () => {
      const peerId = 'peer123';
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'Duplicate test',
          recipient: localPeerId
        })),
      };

      let messageCount = 0;
      relay.onMessageForSelf(() => {
        messageCount++;
      });

      // Process same message twice
      await relay.processMessage(encodeMessage(message), 'test-peer');
      await relay.processMessage(encodeMessage(message), 'test-peer');

      // Should only be delivered once
      expect(messageCount).toBe(1);
    });
  });

  describe('Network Integration', () => {
    it('should initialize network with routing table', async () => {
      const network = new MeshNetwork({
        identity: {
          publicKey: identity.publicKey,
          privateKey: identity.privateKey,
        },
        transports: [],
      });

      const stats = await network.getStats();
      expect(stats.localPeerId).toBe(localPeerId);
      expect(stats.routing).toBeDefined();
      expect(stats.routing.peerCount).toBe(0);
    });

    it('should handle peer connections in network', async () => {
      const network = new MeshNetwork({
        identity: {
          publicKey: identity.publicKey,
          privateKey: identity.privateKey,
        },
        transports: [],
      });

      // Simulate peer connection
      const peerId = 'connected-peer';
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      
      // Add peer through network's routing table
      network['routingTable'].addPeer(peer);

      const stats = await network.getStats();
      expect(stats.routing.peerCount).toBe(1);
    });

    it('should handle message sending through network', async () => {
      const network = new MeshNetwork({
        identity: {
          publicKey: identity.publicKey,
          privateKey: identity.privateKey,
        },
        transports: [],
      });

      const peerId = 'message-peer';
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      network['routingTable'].addPeer(peer);

      let receivedMessage: any;
      network.onMessage = (msg: any) => {
        receivedMessage = msg;
      };

      // Send message
      const message = 'Test message';
      await network.sendMessage(peerId, message);

      // Verify message was processed
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.payload).toEqual(new TextEncoder().encode(message));
    });
  });

  describe('End-to-End Workflow', () => {
    it('should handle complete message workflow', async () => {
      // Setup network with multiple peers
      const peer1 = createPeer('peer1', new Uint8Array(32), 'webrtc');
      const peer2 = createPeer('peer2', new Uint8Array(32), 'webrtc');
      
      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);

      let messageFlow: string[] = [];
      
      relay.onMessageForSelf((msg: Message) => {
        messageFlow.push('delivered');
      });
      
      relay.onForwardMessage((msg: Message, excludePeerId: string) => {
        messageFlow.push('forwarded');
      });

      // Send message from peer1 to peer2
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: new Uint8Array(32), // peer1 public key
          signature: new Uint8Array(64),
        },
        payload: new TextEncoder().encode(JSON.stringify({
          text: 'End-to-end test',
          recipient: 'peer2'
        })),
      };

      await relay.processMessage(encodeMessage(message), 'peer1');

      // Verify message flow
      expect(messageFlow).toContain('forwarded');
    });

    it('should handle peer reputation updates', async () => {
      const peerId = 'reputation-peer';
      const peer = createPeer(peerId, new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      // Simulate successful interactions
      routingTable.updatePeerReputation(peerId, true);
      routingTable.updatePeerReputation(peerId, true);
      routingTable.updatePeerReputation(peerId, true);

      // Simulate failed interactions
      routingTable.updatePeerReputation(peerId, false);
      routingTable.updatePeerReputation(peerId, false);

      const updatedPeer = routingTable.getPeer(peerId);
      expect(updatedPeer?.metadata.successCount).toBe(3);
      expect(updatedPeer?.metadata.failureCount).toBe(2);
      expect(updatedPeer?.metadata.reputation).toBeGreaterThan(45);
    });
  });
});
