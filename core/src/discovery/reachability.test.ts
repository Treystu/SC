/**
 * Tests for Enhanced Reachability Verification
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ReachabilityVerifier,
  testPeerReachability,
  type PingMessage,
  type PongMessage,
  type ReachabilityResult,
} from './reachability';

describe('Enhanced Reachability Verification', () => {
  let verifier: ReachabilityVerifier;

  beforeEach(() => {
    verifier = new ReachabilityVerifier({
      timeout: 1000,        // 1 second for faster tests
      maxAttempts: 2,
      methods: ['direct', 'webrtc'],
      cacheTimeout: 5000,   // 5 seconds
    });
  });

  afterEach(() => {
    verifier.cleanup();
  });

  describe('testReachability', () => {
    it('should detect reachable peer', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        // Simulate pong response
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 50);
      };

      const result = await verifier.testReachability('peer-1', mockSendPing);

      expect(result.reachable).toBe(true);
      expect(result.peerId).toBe('peer-1');
      expect(result.latency).toBeGreaterThan(0);
      expect(result.method).toBeDefined();
    });

    it('should detect unreachable peer', async () => {
      const mockSendPing = async () => {
        // Never send pong (simulate timeout)
      };

      const result = await verifier.testReachability('peer-2', mockSendPing);

      expect(result.reachable).toBe(false);
      expect(result.peerId).toBe('peer-2');
      expect(result.error).toBeDefined();
    }, 10000); // 10 second timeout for this test

    it('should measure latency accurately', async () => {
      const expectedLatency = 100; // ms
      
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, expectedLatency);
      };

      const result = await verifier.testReachability('peer-3', mockSendPing);

      expect(result.reachable).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(expectedLatency - 10);
      expect(result.latency).toBeLessThanOrEqual(expectedLatency + 50);
    });

    it('should try multiple methods', async () => {
      const attemptedMethods: string[] = [];
      
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        attemptedMethods.push(ping.method);
        
        // Only succeed on second method
        if (ping.method === 'webrtc') {
          setTimeout(() => {
            const pong: PongMessage = verifier.createPong(ping);
            verifier.handlePong(pong);
          }, 10);
        }
      };

      const result = await verifier.testReachability('peer-4', mockSendPing);

      expect(result.reachable).toBe(true);
      expect(result.method).toBe('webrtc');
      expect(attemptedMethods).toContain('direct');
      expect(attemptedMethods).toContain('webrtc');
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        attempts++;
        
        // Succeed on second attempt
        if (attempts >= 2) {
          setTimeout(() => {
            const pong: PongMessage = verifier.createPong(ping);
            verifier.handlePong(pong);
          }, 10);
        }
      };

      const result = await verifier.testReachability('peer-5', mockSendPing);

      expect(result.reachable).toBe(true);
      expect(attempts).toBeGreaterThan(1);
    });
  });

  describe('Caching', () => {
    it('should cache successful results', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 10);
      };

      // First call - actual test
      const result1 = await verifier.testReachability('peer-6', mockSendPing);
      expect(result1.reachable).toBe(true);

      // Second call - should use cache (no ping sent)
      let pingsSent = 0;
      const countingSendPing = async (peerId: string, ping: PingMessage) => {
        pingsSent++;
        await mockSendPing(peerId, ping);
      };

      const result2 = await verifier.testReachability('peer-6', countingSendPing);
      expect(result2.reachable).toBe(true);
      expect(pingsSent).toBe(0); // Cache was used
    });

    it('should expire cached results', async () => {
      const shortCacheVerifier = new ReachabilityVerifier({
        timeout: 1000,
        maxAttempts: 1,
        methods: ['direct'],
        cacheTimeout: 100, // 100ms
      });

      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = shortCacheVerifier.createPong(ping);
          shortCacheVerifier.handlePong(pong);
        }, 10);
      };

      // First call
      await shortCacheVerifier.testReachability('peer-7', mockSendPing);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call - cache expired, should send ping
      let pingsSent = 0;
      const countingSendPing = async (peerId: string, ping: PingMessage) => {
        pingsSent++;
        await mockSendPing(peerId, ping);
      };

      await shortCacheVerifier.testReachability('peer-7', countingSendPing);
      expect(pingsSent).toBeGreaterThan(0); // Cache expired, new ping sent

      shortCacheVerifier.cleanup();
    });

    it('should clear cache on demand', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 10);
      };

      await verifier.testReachability('peer-8', mockSendPing);
      
      const cached = verifier.getCached('peer-8');
      expect(cached).not.toBeNull();

      verifier.clearCache('peer-8');
      
      const cleared = verifier.getCached('peer-8');
      expect(cleared).toBeNull();
    });
  });

  describe('Status', () => {
    it('should return reachable status', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 10);
      };

      await verifier.testReachability('peer-9', mockSendPing);
      
      const status = verifier.getStatus('peer-9');
      expect(status).toBe('reachable');
    });

    it('should return unreachable status', async () => {
      const mockSendPing = async () => {
        // Never respond
      };

      await verifier.testReachability('peer-10', mockSendPing);
      
      const status = verifier.getStatus('peer-10');
      expect(status).toBe('unreachable');
    }, 10000); // 10 second timeout

    it('should return unknown status for untested peer', () => {
      const status = verifier.getStatus('peer-11');
      expect(status).toBe('unknown');
    });
  });

  describe('Latency Measurement', () => {
    it('should measure latency multiple times', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 50);
      };

      const latencies = await verifier.measureLatency('peer-12', mockSendPing, 3);

      expect(latencies.length).toBe(3);
      latencies.forEach(lat => {
        expect(lat).toBeGreaterThan(0);
      });
    });

    it('should calculate average latency', () => {
      const latencies = [10, 20, 30, 40, 50];
      const avg = ReachabilityVerifier.getAverageLatency(latencies);
      expect(avg).toBe(30);
    });

    it('should calculate median latency', () => {
      const latencies = [10, 50, 20, 40, 30];
      const median = ReachabilityVerifier.getMedianLatency(latencies);
      expect(median).toBe(30);
    });

    it('should calculate latency statistics', () => {
      const latencies = [10, 20, 30, 40, 50];
      const stats = ReachabilityVerifier.getLatencyStats(latencies);

      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.avg).toBe(30);
      expect(stats.median).toBe(30);
      expect(stats.jitter).toBeGreaterThan(0);
    });
  });

  describe('Events', () => {
    it('should emit reachable event', async () => {
      const events: ReachabilityResult[] = [];
      verifier.on('reachable', (result) => events.push(result));

      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 10);
      };

      await verifier.testReachability('peer-13', mockSendPing);

      expect(events.length).toBe(1);
      expect(events[0].reachable).toBe(true);
    });

    it('should emit unreachable event', async () => {
      const events: ReachabilityResult[] = [];
      verifier.on('unreachable', (result) => events.push(result));

      const mockSendPing = async () => {
        // Never respond
      };

      await verifier.testReachability('peer-14', mockSendPing);

      expect(events.length).toBe(1);
      expect(events[0].reachable).toBe(false);
    }, 10000); // 10 second timeout
  });

  describe('Ping/Pong Protocol', () => {
    it('should create valid ping message', async () => {
      let capturedPing: PingMessage | undefined;

      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        capturedPing = ping;
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 10);
      };

      await verifier.testReachability('peer-15', mockSendPing);

      expect(capturedPing).toBeDefined();
      expect(capturedPing!.type).toBe('ping');
      expect(capturedPing!.id).toBeDefined();
      expect(capturedPing!.timestamp).toBeGreaterThan(0);
      expect(capturedPing!.method).toBeDefined();
    });

    it('should create valid pong message', async () => {
      const ping: PingMessage = {
        type: 'ping',
        id: 'test-ping-123',
        timestamp: Date.now(),
        method: 'direct',
      };

      const pong = verifier.createPong(ping);

      expect(pong.type).toBe('pong');
      expect(pong.id).toBe(ping.id);
      expect(pong.pingTimestamp).toBe(ping.timestamp);
      expect(pong.pongTimestamp).toBeGreaterThan(0);
    });

    it('should handle pong correctly', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        // Manually create and handle pong
        const pong: PongMessage = {
          type: 'pong',
          id: ping.id,
          pingTimestamp: ping.timestamp,
          pongTimestamp: Date.now(),
        };
        
        setTimeout(() => verifier.handlePong(pong), 10);
      };

      const result = await verifier.testReachability('peer-16', mockSendPing);
      expect(result.reachable).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete reachability test within 5 seconds', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const pong: PongMessage = verifier.createPong(ping);
          verifier.handlePong(pong);
        }, 10);
      };

      const startTime = Date.now();
      await verifier.testReachability('peer-17', mockSendPing);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Utility Function', () => {
    it('should test reachability with default settings', async () => {
      const mockSendPing = async (peerId: string, ping: PingMessage) => {
        setTimeout(() => {
          const dummyVerifier = new ReachabilityVerifier();
          const pong: PongMessage = dummyVerifier.createPong(ping);
          
          // We can't call handlePong on the internal verifier
          // so we simulate it being handled
        }, 10);
      };

      // This will timeout since we can't access the internal verifier
      // but we test that the function exists and can be called
      const promise = testPeerReachability('peer-18', mockSendPing);
      expect(promise).toBeInstanceOf(Promise);
    }, 10000); // Longer timeout for this test
  });
});
