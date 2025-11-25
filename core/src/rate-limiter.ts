/**
 * Token Bucket Rate Limiter
 * Implements rate limiting to prevent abuse and ensure fair resource usage
 */

export interface RateLimiterConfig {
  capacity: number; // Maximum number of tokens
  refillRate: number; // Tokens added per second
  initialTokens?: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(config: RateLimiterConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.tokens = config.initialTokens ?? config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens. Returns true if allowed, false if rate limited.
   */
  tryConsume(tokens: number = 1): boolean {
    this.refillTokens();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on time elapsed since last refill
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * Rate limiter for different message types
 */
export class SlidingWindowRateLimiter {
  private readonly capacity: number;
  private readonly windowSizeInMs: number;
  private requests: number[] = [];

  constructor(config: { capacity: number; windowSizeInSeconds: number }) {
    this.capacity = config.capacity;
    this.windowSizeInMs = config.windowSizeInSeconds * 1000;
  }

  tryConsume(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowSizeInMs);

    if (this.requests.length < this.capacity) {
      this.requests.push(now);
      return true;
    }

    return false;
  }
}

export class FixedWindowRateLimiter {
  private readonly capacity: number;
  private readonly windowSizeInMs: number;
  private windowStart: number;
  private count: number = 0;

  constructor(config: { capacity: number; windowSizeInSeconds: number }) {
    this.capacity = config.capacity;
    this.windowSizeInMs = config.windowSizeInSeconds * 1000;
    this.windowStart = Date.now();
  }

  tryConsume(): boolean {
    const now = Date.now();
    if (now - this.windowStart > this.windowSizeInMs) {
      this.windowStart = now;
      this.count = 0;
    }

    if (this.count < this.capacity) {
      this.count++;
      return true;
    }

    return false;
  }
}

export class MessageRateLimiter {
  private limiters: Map<string, TokenBucketRateLimiter>;

  constructor() {
    this.limiters = new Map();

    // Message type rate limits
    this.limiters.set('text', new TokenBucketRateLimiter({ capacity: 60, refillRate: 10 })); // 60 msg/min
    this.limiters.set('file', new TokenBucketRateLimiter({ capacity: 10, refillRate: 1 })); // 10 files/min
    this.limiters.set('voice', new TokenBucketRateLimiter({ capacity: 20, refillRate: 2 })); // 20 voice/min
    this.limiters.set('control', new TokenBucketRateLimiter({ capacity: 100, refillRate: 20 })); // 100 control/min
  }

  canSend(messageType: string, cost: number = 1): boolean {
    const limiter = this.limiters.get(messageType);
    if (!limiter) return true; // No limit for unknown types

    return limiter.tryConsume(cost);
  }

  getStatus(messageType: string): number {
    const limiter = this.limiters.get(messageType);
    return limiter?.getAvailableTokens() ?? -1;
  }
}
