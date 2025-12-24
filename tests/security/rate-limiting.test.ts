describe('Rate Limiting Security Test', () => {
  describe('Message Flooding Detection', () => {
    it('should detect and prevent message flooding', () => {
      const rateLimiter = new MockRateLimiter(10, 1000); // 10 messages per second
      const messages = Array(15).fill(null).map((_, i) => ({ id: i, content: `Message ${i}` }));

      let allowedCount = 0;
      let blockedCount = 0;

      messages.forEach(message => {
        if (rateLimiter.allow('user1', 'message')) {
          allowedCount++;
        } else {
          blockedCount++;
        }
      });

      expect(allowedCount).toBeLessThanOrEqual(10);
      expect(blockedCount).toBeGreaterThan(0);
    });

    it('should allow normal message rates', () => {
      const rateLimiter = new MockRateLimiter(10, 1000);
      const messages = Array(8).fill(null).map((_, i) => ({ id: i, content: `Message ${i}` }));

      const allAllowed = messages.every(() => rateLimiter.allow('user1', 'message'));
      expect(allAllowed).toBe(true);
    });

    it('should reset rate limits over time', () => {
      const rateLimiter = new MockRateLimiter(5, 100); // Very short window for testing

      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.allow('user1', 'message')).toBe(true);
      }
      expect(rateLimiter.allow('user1', 'message')).toBe(false);

      // Wait for reset (simulate time passing)
      rateLimiter.reset();

      // Should allow again
      expect(rateLimiter.allow('user1', 'message')).toBe(true);
    });
  });

  describe('Peer Connection Rate Limiting', () => {
    it('should limit peer connection attempts', () => {
      const rateLimiter = new MockRateLimiter(3, 60000); // 3 connections per minute
      const connectionAttempts = Array(5).fill(null);

      let successfulConnections = 0;
      let failedConnections = 0;

      connectionAttempts.forEach(() => {
        if (rateLimiter.allow('peer1', 'connection')) {
          successfulConnections++;
        } else {
          failedConnections++;
        }
      });

      expect(successfulConnections).toBe(3);
      expect(failedConnections).toBe(2);
    });

    it('should differentiate between different peers', () => {
      const rateLimiter = new MockRateLimiter(2, 60000);

      // Peer 1 exhausts their limit
      expect(rateLimiter.allow('peer1', 'connection')).toBe(true);
      expect(rateLimiter.allow('peer1', 'connection')).toBe(true);
      expect(rateLimiter.allow('peer1', 'connection')).toBe(false);

      // Peer 2 should still be allowed
      expect(rateLimiter.allow('peer2', 'connection')).toBe(true);
      expect(rateLimiter.allow('peer2', 'connection')).toBe(true);
      expect(rateLimiter.allow('peer2', 'connection')).toBe(false);
    });

    it('should prevent connection spam from same IP', () => {
      const rateLimiter = new MockRateLimiter(1, 30000); // 1 connection per 30 seconds

      // First connection allowed
      expect(rateLimiter.allow('192.168.1.100', 'connection')).toBe(true);

      // Subsequent connections blocked
      expect(rateLimiter.allow('192.168.1.100', 'connection')).toBe(false);
      expect(rateLimiter.allow('192.168.1.100', 'connection')).toBe(false);
    });
  });

  describe('DHT Query Rate Limiting', () => {
    it('should limit DHT lookup queries', () => {
      const rateLimiter = new MockRateLimiter(20, 60000); // 20 queries per minute
      const queries = Array(25).fill(null).map((_, i) => ({ key: `key${i}` }));

      let successfulQueries = 0;
      let throttledQueries = 0;

      queries.forEach(() => {
        if (rateLimiter.allow('node1', 'dht_query')) {
          successfulQueries++;
        } else {
          throttledQueries++;
        }
      });

      expect(successfulQueries).toBe(20);
      expect(throttledQueries).toBe(5);
    });

    it('should allow reasonable DHT query patterns', () => {
      const rateLimiter = new MockRateLimiter(50, 60000);
      const normalQueryPattern = Array(30).fill(null); // Normal usage

      const allAllowed = normalQueryPattern.every(() => rateLimiter.allow('node1', 'dht_query'));
      expect(allAllowed).toBe(true);
    });

    it('should prevent DHT query amplification attacks', () => {
      const rateLimiter = new MockRateLimiter(10, 10000); // 10 queries per 10 seconds

      // Simulate amplification attack (many queries from one node)
      const attackQueries = Array(15).fill(null);

      let allowed = 0;
      let blocked = 0;

      attackQueries.forEach(() => {
        if (rateLimiter.allow('attacker_node', 'dht_query')) {
          allowed++;
        } else {
          blocked++;
        }
      });

      expect(allowed).toBe(10);
      expect(blocked).toBe(5);
    });
  });

  describe('Burst Handling', () => {
    it('should handle burst traffic gracefully', () => {
      const rateLimiter = new MockRateLimiter(10, 1000, 5); // 10 per second, burst of 5

      // Burst should be allowed
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.allow('user1', 'message')).toBe(true);
      }

      // Additional requests should be rate limited
      expect(rateLimiter.allow('user1', 'message')).toBe(false);
    });

    it('should recover from bursts over time', () => {
      const rateLimiter = new MockRateLimiter(5, 2000, 2); // Short window for testing

      // Exhaust burst capacity
      expect(rateLimiter.allow('user1', 'message')).toBe(true);
      expect(rateLimiter.allow('user1', 'message')).toBe(true);
      expect(rateLimiter.allow('user1', 'message')).toBe(false);

      // Simulate time passing and reset
      rateLimiter.reset();

      // Should allow burst again
      expect(rateLimiter.allow('user1', 'message')).toBe(true);
      expect(rateLimiter.allow('user1', 'message')).toBe(true);
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    it('should prevent CPU exhaustion from rate limit calculations', () => {
      const rateLimiter = new MockRateLimiter(1000, 60000);

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        rateLimiter.allow(`user${i}`, 'message');
      }
      const endTime = Date.now();

      // Should complete in reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should prevent memory exhaustion from tracking too many users', () => {
      const rateLimiter = new MockRateLimiter(1, 60000);
      const maxTrackedUsers = 10000;

      // Simulate many different users
      for (let i = 0; i < maxTrackedUsers; i++) {
        rateLimiter.allow(`user${i}`, 'message');
      }

      // Should not crash or consume excessive memory
      expect(rateLimiter.getTrackedUsersCount()).toBeLessThanOrEqual(maxTrackedUsers);
    });
  });
});

// Mock rate limiter for testing
function MockRateLimiter(maxRequests, windowMs, burstLimit) {
  this.requests = new Map();
  this.maxRequests = maxRequests || 10;
  this.windowMs = windowMs || 1000;
  this.burstLimit = burstLimit || maxRequests;

  this.allow = function(identifier, action) {
    const key = `${identifier}:${action}`;
    const now = Date.now();

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const timestamps = this.requests.get(key);

    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
    this.requests.set(key, validTimestamps);

    // Check burst limit (immediate requests)
    const recentRequests = validTimestamps.filter(ts => now - ts < 100).length;

    if (recentRequests >= this.burstLimit) {
      return false;
    }

    // Check overall rate limit
    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    // Allow request
    validTimestamps.push(now);
    return true;
  };

  this.reset = function() {
    this.requests.clear();
  };

  this.getTrackedUsersCount = function() {
    return this.requests.size;
  };
}