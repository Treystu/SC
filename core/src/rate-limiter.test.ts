import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('canSendMessage', () => {
    it('should allow messages within per-minute limit', () => {
      const userId = 'user1';

      // Should allow first 60 messages
      for (let i = 0; i < 60; i++) {
        const result = limiter.canSendMessage(userId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should deny messages exceeding per-minute limit', () => {
      const userId = 'user1';

      // Send 60 messages (at limit)
      for (let i = 0; i < 60; i++) {
        limiter.canSendMessage(userId);
      }

      // 61st message should be denied
      const result = limiter.canSendMessage(userId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('60 messages per minute');
    });

    it('should track different users independently', () => {
      const result1 = limiter.canSendMessage('user1');
      const result2 = limiter.canSendMessage('user2');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('canSendFile', () => {
    it('should allow files within limit', () => {
      const userId = 'user1';

      for (let i = 0; i < 100; i++) {
        const result = limiter.canSendFile(userId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should deny files exceeding limit', () => {
      const userId = 'user1';

      // Send 100 files (at limit)
      for (let i = 0; i < 100; i++) {
        limiter.canSendFile(userId);
      }

      // 101st file should be denied
      const result = limiter.canSendFile(userId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('100 files per hour');
    });
  });
});