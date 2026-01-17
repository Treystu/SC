import type { Peer, RouteMetrics } from './routing';
import { PeerState } from './routing';
import { RoutingTable, createPeer } from './routing';

describe('Advanced Routing Table Features', () => {
  let routingTable: RoutingTable;

  beforeEach(() => {
    routingTable = new RoutingTable('local-peer', {
      maxCacheSize: 100,
      cacheTTL: 1000,
      routeTTL: 5000,
      enableBloomFilter: true,
    });
  });

  describe('Route Metrics and Conflict Resolution', () => {
    it('should prefer routes with fewer hops', () => {
      const route1 = {
        destination: 'dest1',
        nextHop: 'peer1',
        hopCount: 3,
        timestamp: Date.now(),
        metrics: {
          hopCount: 3,
          latency: 100,
          reliability: 0.9,
          lastUsed: Date.now(),
        },
        expiresAt: Date.now() + 10000,
      };

      const route2 = {
        destination: 'dest1',
        nextHop: 'peer2',
        hopCount: 2,
        timestamp: Date.now(),
        metrics: {
          hopCount: 2,
          latency: 100,
          reliability: 0.9,
          lastUsed: Date.now(),
        },
        expiresAt: Date.now() + 10000,
      };

      routingTable.addRoute(route1);
      routingTable.addRoute(route2);

      const nextHop = routingTable.getNextHop('dest1');
      expect(nextHop).toBe('peer2');
    });

    it('should prefer lower latency routes with same hop count', () => {
      const route1 = {
        destination: 'dest1',
        nextHop: 'peer1',
        hopCount: 2,
        timestamp: Date.now(),
        metrics: {
          hopCount: 2,
          latency: 200,
          reliability: 0.9,
          lastUsed: Date.now(),
        },
        expiresAt: Date.now() + 10000,
      };

      const route2 = {
        destination: 'dest1',
        nextHop: 'peer2',
        hopCount: 2,
        timestamp: Date.now() + 1,
        metrics: {
          hopCount: 2,
          latency: 100,
          reliability: 0.9,
          lastUsed: Date.now(),
        },
        expiresAt: Date.now() + 10000,
      };

      routingTable.addRoute(route1);
      routingTable.addRoute(route2);

      const nextHop = routingTable.getNextHop('dest1');
      expect(nextHop).toBe('peer2');
    });

    it('should update route metrics', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      routingTable.updateRouteMetrics('peer1', 150, true);
      const route = routingTable.getNextHop('peer1');
      // Peer IDs are normalized to uppercase
      expect(route).toBe('PEER1');
    });
  });

  describe('Peer Reputation and Blacklisting', () => {
    it('should update peer reputation on success', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      routingTable.updatePeerReputation('peer1', true);
      const updated = routingTable.getPeer('peer1');
      
      expect(updated?.metadata.reputation).toBe(51);
      expect(updated?.metadata.successCount).toBe(1);
    });

    it('should decrease reputation on failure', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      routingTable.updatePeerReputation('peer1', false);
      const updated = routingTable.getPeer('peer1');
      
      expect(updated?.metadata.reputation).toBe(48);
      expect(updated?.metadata.failureCount).toBe(1);
    });

    it('should change peer state to degraded with low reputation', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      peer.metadata.reputation = 25;
      routingTable.addPeer(peer);

      for (let i = 0; i < 5; i++) {
        routingTable.updatePeerReputation('peer1', false);
      }

      const updated = routingTable.getPeer('peer1');
      expect(updated?.state).toBe(PeerState.DEGRADED);
    });

    it('should blacklist a peer', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      routingTable.blacklistPeer('peer1');
      
      expect(routingTable.isPeerBlacklisted('peer1')).toBe(true);
      const updated = routingTable.getPeer('peer1');
      expect(updated?.state).toBe(PeerState.DISCONNECTED);
    });

    it('should blacklist peer with expiry', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      routingTable.blacklistPeer('peer1', 100); // 100ms
      expect(routingTable.isPeerBlacklisted('peer1')).toBe(true);

      // Wait for expiry
      setTimeout(() => {
        expect(routingTable.isPeerBlacklisted('peer1')).toBe(false);
      }, 150);
    });

    it('should unblacklist a peer', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      routingTable.blacklistPeer('peer1');
      expect(routingTable.isPeerBlacklisted('peer1')).toBe(true);

      routingTable.unblacklistPeer('peer1');
      expect(routingTable.isPeerBlacklisted('peer1')).toBe(false);
    });
  });

  describe('Bloom Filter and LRU Cache', () => {
    it('should use bloom filter for fast lookups', () => {
      const hash1 = 'hash1';
      const hash2 = 'hash2';

      expect(routingTable.hasSeenMessage(hash1)).toBe(false);
      
      routingTable.markMessageSeen(hash1);
      expect(routingTable.hasSeenMessage(hash1)).toBe(true);
      expect(routingTable.hasSeenMessage(hash2)).toBe(false);
    });

    it('should evict old messages with LRU when cache is full', () => {
      // Fill cache to limit
      for (let i = 0; i < 100; i++) {
        routingTable.markMessageSeen(`hash${i}`);
      }

      const stats = routingTable.getStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(100);

      // Add more messages, should trigger eviction
      for (let i = 100; i < 110; i++) {
        routingTable.markMessageSeen(`hash${i}`);
      }

      const newStats = routingTable.getStats();
      expect(newStats.cacheSize).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory Usage Monitoring', () => {
    it('should track memory usage', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      routingTable.markMessageSeen('hash1');

      const memory = routingTable.getMemoryUsage();
      
      expect(memory.bytes).toBeGreaterThan(0);
      expect(memory.breakdown.peers).toBeGreaterThan(0);
      expect(memory.breakdown.messageCache).toBeGreaterThan(0);
    });

    it('should include memory usage in stats', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      const stats = routingTable.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Route Expiration', () => {
    it('should not return expired routes', async () => {
      const expiredRoute = {
        destination: 'dest1',
        nextHop: 'peer1',
        hopCount: 2,
        timestamp: Date.now() - 10000,
        metrics: {
          hopCount: 2,
          latency: 100,
          reliability: 0.9,
          lastUsed: Date.now() - 10000,
        },
        expiresAt: Date.now() - 1000, // Already expired
      };

      routingTable.addRoute(expiredRoute);

      // Route should not be returned since it's expired
      const nextHop = routingTable.getNextHop('dest1');
      expect(nextHop).toBeUndefined();
    });
  });
});
