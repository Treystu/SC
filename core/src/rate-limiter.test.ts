import { TokenBucketRateLimiter, SlidingWindowRateLimiter, FixedWindowRateLimiter } from './rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  it('should allow consumption if tokens are available', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRate: 10 });
    expect(limiter.tryConsume()).toBe(true);
  });

  it('should deny consumption if tokens are not available', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRate: 1, initialTokens: 1 });
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);
  });
});

describe('SlidingWindowRateLimiter', () => {
  it('should allow requests within the capacity', () => {
    const limiter = new SlidingWindowRateLimiter({ capacity: 5, windowSizeInSeconds: 1 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume()).toBe(true);
    }
  });

  it('should deny requests exceeding the capacity', () => {
    const limiter = new SlidingWindowRateLimiter({ capacity: 2, windowSizeInSeconds: 1 });
    limiter.tryConsume();
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('should allow requests within the capacity', () => {
    const limiter = new FixedWindowRateLimiter({ capacity: 3, windowSizeInSeconds: 1 });
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
  });

  it('should deny requests exceeding the capacity', () => {
    const limiter = new FixedWindowRateLimiter({ capacity: 1, windowSizeInSeconds: 1 });
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);
  });
});