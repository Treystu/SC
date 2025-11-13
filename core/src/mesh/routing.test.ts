import { RoutingTable, MessageQueue, Peer } from '../mesh/routing';
import { MessageType } from '../protocol/message';

describe('Routing Table', () => {
  let routingTable: RoutingTable;

  beforeEach(() => {
    routingTable = new RoutingTable();
  });

  describe('Peer Management', () => {
    it('should add and retrieve peers', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(peer);
      const retrieved = routingTable.getPeer('peer1');

      expect(retrieved).toEqual(peer);
    });

    it('should remove peers', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(peer);
      routingTable.removePeer('peer1');
      const retrieved = routingTable.getPeer('peer1');

      expect(retrieved).toBeUndefined();
    });

    it('should list all peers', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'bluetooth',
        connectionQuality: 80,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);

      const peers = routingTable.getAllPeers();
      expect(peers).toHaveLength(2);
      expect(peers.map(p => p.id)).toContain('peer1');
      expect(peers.map(p => p.id)).toContain('peer2');
    });

    it('should update peer last seen', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        lastSeen: 1000,
        connectedAt: 1000,
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(peer);
      routingTable.updatePeerLastSeen('peer1');

      const updated = routingTable.getPeer('peer1');
      expect(updated!.lastSeen).toBeGreaterThan(1000);
    });

    it('should remove stale peers', async () => {
      const stalePeer: Peer = {
        id: 'stale',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now() - 120000, // 2 minutes ago
        connectedAt: Date.now() - 120000,
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      const freshPeer: Peer = {
        id: 'fresh',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(stalePeer);
      routingTable.addPeer(freshPeer);

      const removed = routingTable.removeStalepeers(60000); // 60 second timeout

      expect(removed).toContain('stale');
      expect(removed).not.toContain('fresh');
      expect(routingTable.getPeer('stale')).toBeUndefined();
      expect(routingTable.getPeer('fresh')).toBeDefined();
    });
  });

  describe('Message Deduplication', () => {
    it('should detect duplicate messages', () => {
      const hash = 'message-hash-123';

      expect(routingTable.hasSeenMessage(hash)).toBe(false);
      routingTable.markMessageSeen(hash);
      expect(routingTable.hasSeenMessage(hash)).toBe(true);
    });

    it('should track multiple messages', () => {
      const hashes = ['hash1', 'hash2', 'hash3'];

      hashes.forEach(hash => routingTable.markMessageSeen(hash));
      hashes.forEach(hash => {
        expect(routingTable.hasSeenMessage(hash)).toBe(true);
      });
    });
  });

  describe('Routing', () => {
    it('should create direct routes for connected peers', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(peer);
      const nextHop = routingTable.getNextHop('peer1');

      expect(nextHop).toBe('peer1');
    });

    it('should return undefined for unknown destinations', () => {
      const nextHop = routingTable.getNextHop('unknown');
      expect(nextHop).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        transportType: 'webrtc',
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
      };

      routingTable.addPeer(peer);
      routingTable.markMessageSeen('hash1');

      const stats = routingTable.getStats();
      expect(stats.peerCount).toBe(1);
      expect(stats.routeCount).toBe(1);
      expect(stats.cacheSize).toBe(1);
    });
  });
});

describe('Message Queue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  it('should enqueue and dequeue messages', () => {
    const message = { data: 'test' };
    queue.enqueue(MessageType.TEXT, message);

    const dequeued = queue.dequeue();
    expect(dequeued).toEqual(message);
  });

  it('should prioritize control messages over text', () => {
    const textMsg = { type: 'text' };
    const controlMsg = { type: 'control' };

    queue.enqueue(MessageType.TEXT, textMsg);
    queue.enqueue(MessageType.CONTROL_PING, controlMsg);

    const first = queue.dequeue();
    expect(first).toEqual(controlMsg);
  });

  it('should prioritize voice over text', () => {
    const textMsg = { type: 'text' };
    const voiceMsg = { type: 'voice' };

    queue.enqueue(MessageType.TEXT, textMsg);
    queue.enqueue(MessageType.VOICE, voiceMsg);

    const first = queue.dequeue();
    expect(first).toEqual(voiceMsg);
  });

  it('should return null when queue is empty', () => {
    const message = queue.dequeue();
    expect(message).toBeNull();
  });

  it('should track queue size', () => {
    expect(queue.size()).toBe(0);

    queue.enqueue(MessageType.TEXT, { data: '1' });
    queue.enqueue(MessageType.TEXT, { data: '2' });
    expect(queue.size()).toBe(2);

    queue.dequeue();
    expect(queue.size()).toBe(1);
  });

  it('should clear all messages', () => {
    queue.enqueue(MessageType.TEXT, { data: '1' });
    queue.enqueue(MessageType.VOICE, { data: '2' });

    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.dequeue()).toBeNull();
  });
});
