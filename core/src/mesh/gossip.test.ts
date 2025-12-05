/**
 * Tests for Gossip Protocol Implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GossipProtocol } from './gossip.js';
import { Message, MessageType } from '../protocol/message.js';

describe('GossipProtocol', () => {
  let gossip: GossipProtocol;

  beforeEach(() => {
    gossip = new GossipProtocol({
      fanout: 3,
      gossipInterval: 100, // Fast for testing
      maxMessageAge: 5000,
      pruneInterval: 1000,
    });
  });

  afterEach(() => {
    gossip.stop();
    gossip.clear();
  });

  describe('Peer Management', () => {
    it('should add peers', () => {
      gossip.addPeer('peer1');
      gossip.addPeer('peer2');
      
      const stats = gossip.getStats();
      expect(stats.peerCount).toBe(2);
    });

    it('should remove peers', () => {
      gossip.addPeer('peer1');
      gossip.addPeer('peer2');
      gossip.removePeer('peer1');
      
      const stats = gossip.getStats();
      expect(stats.peerCount).toBe(1);
    });

    it('should track active peers', () => {
      gossip.addPeer('peer1');
      const stats = gossip.getStats();
      expect(stats.activePeerCount).toBe(1);
    });
  });

  describe('Message Handling', () => {
    it('should receive new messages', () => {
      const message = createTestMessage('test message');
      const isNew = gossip.receiveMessage(message, 'peer1');
      
      expect(isNew).toBe(true);
      const stats = gossip.getStats();
      expect(stats.messageCount).toBe(1);
      expect(stats.seenCount).toBe(1);
    });

    it('should detect duplicate messages', () => {
      const message = createTestMessage('test message');
      
      const isNew1 = gossip.receiveMessage(message, 'peer1');
      const isNew2 = gossip.receiveMessage(message, 'peer2');
      
      expect(isNew1).toBe(true);
      expect(isNew2).toBe(false); // Duplicate
      
      const stats = gossip.getStats();
      expect(stats.messageCount).toBe(1); // Only one copy stored
    });

    it('should trigger onMessage callback for new messages', () => {
      const callback = vi.fn();
      gossip.onMessage(callback);
      
      const message = createTestMessage('test');
      gossip.receiveMessage(message, 'peer1');
      
      expect(callback).toHaveBeenCalledWith(message, 'peer1');
    });

    it('should not trigger callback for duplicate messages', () => {
      const callback = vi.fn();
      gossip.onMessage(callback);
      
      const message = createTestMessage('test');
      gossip.receiveMessage(message, 'peer1');
      gossip.receiveMessage(message, 'peer2');
      
      expect(callback).toHaveBeenCalledTimes(1); // Only once
    });
  });

  describe('Gossip Protocol', () => {
    it('should start and stop gossip rounds', () => {
      gossip.start();
      expect(gossip['gossipInterval']).not.toBeNull();
      
      gossip.stop();
      expect(gossip['gossipInterval']).toBeNull();
    });

    it('should not start multiple times', () => {
      gossip.start();
      const interval1 = gossip['gossipInterval'];
      
      gossip.start();
      const interval2 = gossip['gossipInterval'];
      
      expect(interval1).toBe(interval2);
      gossip.stop();
    });

    it('should prune old messages', () => {
      vi.useFakeTimers();
      const message = createTestMessage('old message');
      gossip.receiveMessage(message, 'peer1');
      
      expect(gossip.getStats().messageCount).toBe(1);
      
      // Advance time past maxMessageAge (5000ms from config)
      vi.advanceTimersByTime(6000);
      
      // Trigger prune manually
      gossip['pruneOldMessages']();
      
      expect(gossip.getStats().messageCount).toBe(0);
      vi.useRealTimers();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate stats', () => {
      gossip.addPeer('peer1');
      gossip.addPeer('peer2');
      
      const msg1 = createTestMessage('msg1');
      const msg2 = createTestMessage('msg2');
      
      gossip.receiveMessage(msg1, 'peer1');
      gossip.receiveMessage(msg2, 'peer2');
      
      const stats = gossip.getStats();
      expect(stats.peerCount).toBe(2);
      expect(stats.messageCount).toBe(2);
      expect(stats.seenCount).toBe(2);
    });
  });

  describe('Clear', () => {
    it('should clear all state', () => {
      gossip.addPeer('peer1');
      const message = createTestMessage('test');
      gossip.receiveMessage(message, 'peer1');
      
      gossip.clear();
      
      const stats = gossip.getStats();
      expect(stats.peerCount).toBe(0);
      expect(stats.messageCount).toBe(0);
      expect(stats.seenCount).toBe(0);
    });
  });
});

/**
 * Helper to create a test message
 */
function createTestMessage(content: string): Message {
  return {
    header: {
      version: 1,
      type: MessageType.TEXT,
      ttl: 10,
      timestamp: Date.now(),
      senderId: new Uint8Array(32),
      signature: new Uint8Array(65),
    },
    payload: new TextEncoder().encode(content),
  };
}
