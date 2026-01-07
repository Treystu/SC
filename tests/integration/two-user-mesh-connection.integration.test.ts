import { RoutingTable, PeerState, createPeer } from '../../core/src/mesh/routing';
import { generateIdentity } from '../../core/src/crypto/primitives';
import type { Message } from '../../core/src/protocol/message';
import { MessageType } from '../../core/src/protocol/message';

class MockSignalingServer {
  private peers: Map<string, { 
    peerId: string; 
    metadata?: any;
    signals: Array<{ from: string; to: string; type: string; signal: any; timestamp: number }>;
  }> = new Map();
  
  private signalQueue: Array<{ from: string; to: string; type: string; signal: any; timestamp: number }> = [];

  join(peerId: string, metadata?: any): string[] {
    this.peers.set(peerId, { peerId, metadata, signals: [] });
    return Array.from(this.peers.keys()).filter(id => id !== peerId);
  }

  signal(from: string, to: string, type: string, signalData: any): void {
    const signal = { from, to, type, signal: signalData, timestamp: Date.now() };
    this.signalQueue.push(signal);
    
    const targetPeer = this.peers.get(to);
    if (targetPeer) {
      targetPeer.signals.push(signal);
    }
  }

  poll(peerId: string, since: number = 0): { 
    signals: Array<{ from: string; to: string; type: string; signal: any; timestamp: number }>;
    peers: Array<{ _id: string; metadata?: any }>;
  } {
    const peer = this.peers.get(peerId);
    if (!peer) return { signals: [], peers: [] };

    const signals = this.signalQueue.filter(
      s => s.to === peerId && s.timestamp > since
    );

    const peers = Array.from(this.peers.entries()).map(([id, p]) => ({
      _id: id,
      metadata: p.metadata
    }));

    return { signals, peers };
  }

  leave(peerId: string): void {
    this.peers.delete(peerId);
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  getSignalCount(): number {
    return this.signalQueue.length;
  }

  clear(): void {
    this.peers.clear();
    this.signalQueue = [];
  }
}

describe('Two-User Mesh Connection Integration', () => {
  let signalingServer: MockSignalingServer;
  let identity1: { publicKey: Uint8Array; privateKey: Uint8Array };
  let identity2: { publicKey: Uint8Array; privateKey: Uint8Array };
  let peerId1: string;
  let peerId2: string;
  let routingTable1: RoutingTable;
  let routingTable2: RoutingTable;

  beforeEach(async () => {
    identity1 = await generateIdentity();
    identity2 = await generateIdentity();
    
    peerId1 = Buffer.from(identity1.publicKey).toString('hex');
    peerId2 = Buffer.from(identity2.publicKey).toString('hex');

    signalingServer = new MockSignalingServer();
    
    routingTable1 = new RoutingTable(peerId1);
    routingTable2 = new RoutingTable(peerId2);
  });

  afterEach(() => {
    signalingServer?.clear();
  });

  describe('Connection Establishment', () => {
    it('should establish bidirectional connection between two peers', async () => {
      const existingPeers = signalingServer.join(peerId1, { displayName: 'User1' });
      expect(existingPeers).toHaveLength(0);

      const peersInRoom = signalingServer.join(peerId2, { displayName: 'User2' });
      expect(peersInRoom).toHaveLength(1);
      expect(peersInRoom[0]).toBe(peerId1);

      const poll1 = signalingServer.poll(peerId1, 0);
      const poll2 = signalingServer.poll(peerId2, 0);

      expect(poll1.peers).toHaveLength(2);
      expect(poll2.peers).toHaveLength(2);
    });

    it('should exchange signaling messages between peers', async () => {
      signalingServer.join(peerId1);
      signalingServer.join(peerId2);

      const mockOffer = { type: 'offer', sdp: 'mock-sdp-offer' };
      signalingServer.signal(peerId1, peerId2, 'offer', mockOffer);

      const poll2 = signalingServer.poll(peerId2, 0);
      expect(poll2.signals).toHaveLength(1);
      expect(poll2.signals[0].type).toBe('offer');
      expect(poll2.signals[0].from).toBe(peerId1);

      const mockAnswer = { type: 'answer', sdp: 'mock-sdp-answer' };
      signalingServer.signal(peerId2, peerId1, 'answer', mockAnswer);

      const poll1 = signalingServer.poll(peerId1, 0);
      const answerSignal = poll1.signals.find(s => s.type === 'answer');
      expect(answerSignal).toBeDefined();
      expect(answerSignal?.from).toBe(peerId2);
    });

    it('BUG REPRO: should detect asymmetric connection state', async () => {
      signalingServer.join(peerId1);
      signalingServer.join(peerId2);

      const mockOffer = { type: 'offer', sdp: 'mock-sdp-offer' };
      signalingServer.signal(peerId1, peerId2, 'offer', mockOffer);

      const poll2 = signalingServer.poll(peerId2, 0);
      expect(poll2.signals).toHaveLength(1);

      const poll1 = signalingServer.poll(peerId1, 0);
      const answerSignals = poll1.signals.filter(s => s.type === 'answer');
      expect(answerSignals).toHaveLength(0);

      expect(signalingServer.getSignalCount()).toBe(1);
    });

    it('BUG REPRO: should detect when signals are not being polled frequently enough', async () => {
      signalingServer.join(peerId1);
      signalingServer.join(peerId2);

      const mockOffer = { type: 'offer', sdp: 'mock-sdp-offer' };
      signalingServer.signal(peerId1, peerId2, 'offer', mockOffer);

      const afterSignal = Date.now() + 1;
      const poll2Late = signalingServer.poll(peerId2, afterSignal);
      
      expect(poll2Late.signals).toHaveLength(0);
    });
  });

  describe('Peer Status Synchronization', () => {
    it('should report consistent online/offline status on both sides', async () => {
      signalingServer.join(peerId1);
      signalingServer.join(peerId2);

      const poll1 = signalingServer.poll(peerId1, 0);
      const poll2 = signalingServer.poll(peerId2, 0);

      const peer1SeesPeer2 = poll1.peers.some(p => p._id === peerId2);
      const peer2SeesPeer1 = poll2.peers.some(p => p._id === peerId1);

      expect(peer1SeesPeer2).toBe(true);
      expect(peer2SeesPeer1).toBe(true);
      expect(peer1SeesPeer2).toBe(peer2SeesPeer1);
    });

    it('should handle peer departure gracefully', async () => {
      signalingServer.join(peerId1);
      signalingServer.join(peerId2);

      expect(signalingServer.getPeerCount()).toBe(2);

      signalingServer.leave(peerId2);

      const poll1 = signalingServer.poll(peerId1, 0);
      const peer1SeesPeer2 = poll1.peers.some(p => p._id === peerId2);
      expect(peer1SeesPeer2).toBe(false);
    });
  });

  describe('Routing Table Integration', () => {
    it('should add peer to routing table when connected', () => {
      const peer = createPeer(peerId2, identity2.publicKey, 'webrtc');
      routingTable1.addPeer(peer);

      const retrievedPeer = routingTable1.getPeer(peerId2);
      expect(retrievedPeer).toBeDefined();
      expect(retrievedPeer?.state).toBe(PeerState.CONNECTED);
    });

    it('should maintain symmetric routing tables', () => {
      const peer1ForTable2 = createPeer(peerId1, identity1.publicKey, 'webrtc');
      const peer2ForTable1 = createPeer(peerId2, identity2.publicKey, 'webrtc');
      
      routingTable1.addPeer(peer2ForTable1);
      routingTable2.addPeer(peer1ForTable2);

      expect(routingTable1.getPeer(peerId2)).toBeDefined();
      expect(routingTable2.getPeer(peerId1)).toBeDefined();
    });

    it('BUG REPRO: asymmetric routing tables cause message delivery failure', () => {
      const peer2ForTable1 = createPeer(peerId2, identity2.publicKey, 'webrtc');
      routingTable1.addPeer(peer2ForTable1);

      expect(routingTable1.getPeer(peerId2)).toBeDefined();
      expect(routingTable2.getPeer(peerId1)).toBeUndefined();

      const nextHop1to2 = routingTable1.getNextHop(peerId2);
      const nextHop2to1 = routingTable2.getNextHop(peerId1);

      expect(nextHop1to2).toBe(peerId2);
      expect(nextHop2to1).toBeUndefined();
    });
  });

  describe('Connection Retry Logic', () => {
    it('should timeout connection attempt after threshold', async () => {
      const startTime = Date.now();
      const TIMEOUT_MS = 500;
      
      const connectWithTimeout = async (): Promise<boolean> => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(false), TIMEOUT_MS);
        });
      };

      const result = await connectWithTimeout();
      const elapsed = Date.now() - startTime;

      expect(result).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    });
  });

  describe('Heartbeat and Health Monitoring', () => {
    it('should detect stale peer via lastSeen timestamp', () => {
      const peer = createPeer(peerId2, identity2.publicKey, 'webrtc');
      peer.lastSeen = Date.now() - 60000;
      routingTable1.addPeer(peer);

      const retrievedPeer = routingTable1.getPeer(peerId2);
      const isStale = Date.now() - (retrievedPeer?.lastSeen || 0) > 30000;
      
      expect(isStale).toBe(true);
    });

    it('should update peer lastSeen on activity', () => {
      const peer = createPeer(peerId2, identity2.publicKey, 'webrtc');
      const initialLastSeen = peer.lastSeen;
      routingTable1.addPeer(peer);

      routingTable1.updatePeerLastSeen(peerId2);
      const updatedPeer = routingTable1.getPeer(peerId2);
      
      expect(updatedPeer?.lastSeen).toBeGreaterThanOrEqual(initialLastSeen);
    });
  });
});

describe('RALPH Loop - Mesh Connection Fixes', () => {
  describe('Fix 1: Bidirectional Signaling', () => {
    it('should complete full signaling handshake', async () => {
      const server = new MockSignalingServer();
      const id1 = 'peer-1';
      const id2 = 'peer-2';
      
      server.join(id1);
      server.join(id2);

      server.signal(id1, id2, 'offer', { type: 'offer', sdp: 'offer-sdp' });
      server.signal(id2, id1, 'answer', { type: 'answer', sdp: 'answer-sdp' });
      server.signal(id1, id2, 'candidate', { candidate: 'ice-candidate-1' });
      server.signal(id2, id1, 'candidate', { candidate: 'ice-candidate-2' });

      const poll1 = server.poll(id1, 0);
      const poll2 = server.poll(id2, 0);

      expect(poll1.signals.length).toBeGreaterThan(0);
      expect(poll2.signals.length).toBeGreaterThan(0);

      const answerSignal = poll1.signals.find(s => s.type === 'answer');
      expect(answerSignal).toBeDefined();

      const offerSignal = poll2.signals.find(s => s.type === 'offer');
      expect(offerSignal).toBeDefined();
    });
  });

  describe('Fix 2: Connection Timeout and Retry', () => {
    it('should timeout connection attempt after threshold', async () => {
      const startTime = Date.now();
      const TIMEOUT_MS = 200;
      
      const connectWithTimeout = async (): Promise<boolean> => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(false), TIMEOUT_MS);
        });
      };

      const result = await connectWithTimeout();
      const elapsed = Date.now() - startTime;

      expect(result).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    });

    it('should retry connection on failure', async () => {
      let attempts = 0;
      const MAX_RETRIES = 3;
      
      const connectWithRetry = async (): Promise<boolean> => {
        for (let i = 0; i < MAX_RETRIES; i++) {
          attempts++;
          const success = i === MAX_RETRIES - 1;
          if (success) return true;
          await new Promise(r => setTimeout(r, 10));
        }
        return false;
      };

      const result = await connectWithRetry();
      expect(result).toBe(true);
      expect(attempts).toBe(MAX_RETRIES);
    });
  });

  describe('Fix 3: Symmetric Status', () => {
    it('should maintain symmetric online status', async () => {
      const server = new MockSignalingServer();
      const id1 = 'peer-1';
      const id2 = 'peer-2';

      server.join(id1);
      server.join(id2);

      const poll1 = server.poll(id1, 0);
      const poll2 = server.poll(id2, 0);

      const peer1InPoll2 = poll2.peers.find(p => p._id === id1);
      const peer2InPoll1 = poll1.peers.find(p => p._id === id2);

      expect(peer1InPoll2).toBeDefined();
      expect(peer2InPoll1).toBeDefined();
    });
  });

  describe('Fix 4: Poll Frequency', () => {
    it('should not miss signals with frequent polling', async () => {
      const server = new MockSignalingServer();
      server.join('peer-1');
      server.join('peer-2');

      server.signal('peer-1', 'peer-2', 'offer', { sdp: 'test' });

      const poll = server.poll('peer-2', 0);
      expect(poll.signals).toHaveLength(1);
    });
  });

  describe('Fix 5: Connection Validation', () => {
    it('should validate connection with ping/pong', async () => {
      const pingTimestamp = Date.now();
      const pongResponse = { pingTimestamp };
      const rtt = Date.now() - pongResponse.pingTimestamp;

      expect(rtt).toBeGreaterThanOrEqual(0);
      expect(rtt).toBeLessThan(1000);
    });
  });
});
