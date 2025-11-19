import { WebRTCPeer, PeerConnectionPool } from './webrtc';
import { Message, MessageType } from '../protocol/message';

describe('WebRTCPeer', () => {
  let peer: WebRTCPeer;

  beforeEach(() => {
    peer = new WebRTCPeer({ peerId: 'test-peer-123' });
  });

  afterEach(() => {
    peer.close();
  });

  describe('Basic Functionality', () => {
    it('should create a WebRTC peer', () => {
      expect(peer).toBeDefined();
      expect(peer.getPeerId()).toBe('test-peer-123');
    });

    it('should get initial state', () => {
      const state = peer.getState();
      expect(state).toBeDefined();
      expect(['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].includes(state)).toBe(true);
    });

    it('should create data channel', () => {
      const channel = peer.createDataChannel({ label: 'test-channel', ordered: true });
      expect(channel).toBeDefined();
      expect(channel.label).toBe('test-channel');
    });

    it('should close connection', () => {
      peer.close();
      const state = peer.getState();
      expect(state).toBe('closed');
    });
  });

  describe('SDP Operations', () => {
    it('should create offer', async () => {
      const offer = await peer.createOffer();
      expect(offer).toBeDefined();
      expect(offer.type).toBe('offer');
      expect(offer.sdp).toBeDefined();
    });

    it('should create answer', async () => {
      const offer = await peer.createOffer();
      const answer = await peer.createAnswer(offer);
      expect(answer).toBeDefined();
      expect(answer.type).toBe('answer');
      expect(answer.sdp).toBeDefined();
    });
  });
});

describe('PeerConnectionPool', () => {
  let pool: PeerConnectionPool;

  beforeEach(() => {
    pool = new PeerConnectionPool();
  });

  afterEach(() => {
    pool.closeAll();
  });

  describe('Peer Management', () => {
    it('should create or get peer', () => {
      const peer = pool.getOrCreatePeer('peer1');
      expect(peer).toBeDefined();
      expect(peer.getPeerId()).toBe('peer1');
    });

    it('should reuse existing peer', () => {
      const peer1 = pool.getOrCreatePeer('peer1');
      const peer2 = pool.getOrCreatePeer('peer1');
      expect(peer1).toBe(peer2);
    });

    it('should get peer', () => {
      pool.getOrCreatePeer('peer1');
      const peer = pool.getPeer('peer1');
      expect(peer).toBeDefined();
    });

    it('should return undefined for non-existent peer', () => {
      const peer = pool.getPeer('non-existent');
      expect(peer).toBeUndefined();
    });

    it('should remove peer', () => {
      pool.getOrCreatePeer('peer1');
      pool.removePeer('peer1');
      const peer = pool.getPeer('peer1');
      expect(peer).toBeUndefined();
    });

    it('should get connected peers', () => {
      pool.getOrCreatePeer('peer1');
      pool.getOrCreatePeer('peer2');
      const peers = pool.getConnectedPeers();
      expect(Array.isArray(peers)).toBe(true);
    });

    it('should close all peers', () => {
      pool.getOrCreatePeer('peer1');
      pool.getOrCreatePeer('peer2');
      pool.closeAll();
      expect(pool.getPeer('peer1')).toBeUndefined();
      expect(pool.getPeer('peer2')).toBeUndefined();
    });
  });
});
