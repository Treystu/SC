/**
 * Unit tests for RateLimiter
 */
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Token consumption', () => {
    it('should allow consumption within capacity', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
      });

      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false); // Exceeded capacity
    });

    it('should reject consumption exceeding capacity', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
      });

      expect(limiter.tryConsume(11)).toBe(false);
      expect(limiter.tryConsume(10)).toBe(true);
    });

    it('should default to consuming 1 token', () => {
      const limiter = new RateLimiter({
        capacity: 5,
        refillRate: 1,
      });

      for (let i = 0; i < 5; i++) {
        expect(limiter.tryConsume()).toBe(true);
      }
      expect(limiter.tryConsume()).toBe(false);
    });
  });

  describe('Token refill', () => {
    it('should refill tokens over time', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 2, // 2 tokens per second
      });

      // Consume all tokens
      expect(limiter.tryConsume(10)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);

      // Advance time by 1 second
      jest.advanceTimersByTime(1000);

      // Should have 2 tokens now
      expect(limiter.tryConsume(2)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);
    });

    it('should not exceed capacity when refilling', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
      });

      // Don't consume anything
      // Advance time by 10 seconds (would add 50 tokens)
      jest.advanceTimersByTime(10000);

      // Should only have capacity amount
      expect(limiter.tryConsume(10)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);
    });

    it('should handle partial refills', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
      });

      expect(limiter.tryConsume(10)).toBe(true);

      // Advance by 0.5 seconds
      jest.advanceTimersByTime(500);

      // Should have 0.5 tokens (not enough for 1)
      expect(limiter.tryConsume(1)).toBe(false);

      // Advance another 0.5 seconds
      jest.advanceTimersByTime(500);

      // Now should have 1 token
      expect(limiter.tryConsume(1)).toBe(true);
    });
  });

  describe('Initial tokens', () => {
    it('should start with capacity tokens by default', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
      });

      expect(limiter.tryConsume(10)).toBe(true);
    });

    it('should respect custom initial tokens', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        initialTokens: 5,
      });

      expect(limiter.tryConsume(5)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);
    });

    it('should allow zero initial tokens', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        initialTokens: 0,
      });

      expect(limiter.tryConsume(1)).toBe(false);

      jest.advanceTimersByTime(1000);
      expect(limiter.tryConsume(1)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero refill rate', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 0,
      });

      expect(limiter.tryConsume(5)).toBe(true);

      jest.advanceTimersByTime(10000);

      // No refill should happen
      expect(limiter.tryConsume(6)).toBe(false);
      expect(limiter.tryConsume(5)).toBe(true);
    });

    it('should handle very high refill rates', () => {
      const limiter = new RateLimiter({
        capacity: 1000,
        refillRate: 1000,
      });

      expect(limiter.tryConsume(1000)).toBe(true);

      jest.advanceTimersByTime(100); // 0.1 seconds

      // Should have 100 tokens
      expect(limiter.tryConsume(100)).toBe(true);
      expect(limiter.tryConsume(1)).toBe(false);
    });

    it('should handle fractional token consumption', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
      });

      // Consume with fractional amounts
      expect(limiter.tryConsume(2.5)).toBe(true);
      expect(limiter.tryConsume(7.5)).toBe(true);
      expect(limiter.tryConsume(0.1)).toBe(false);
    });
  });

  describe('Multiple refills', () => {
    it('should handle multiple time advances', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
      });

      expect(limiter.tryConsume(100)).toBe(true);

      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(1000);
        expect(limiter.tryConsume(10)).toBe(true);
      }

      expect(limiter.tryConsume(1)).toBe(false);
    });
  });
});
