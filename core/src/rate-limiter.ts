/**
 * Token Bucket Rate Limiter
 * Implements rate limiting to prevent abuse and ensure fair resource usage
 */

export interface RateLimiterConfig {
  capacity: number; // Maximum number of tokens
  refillRate: number; // Tokens added per second
  initialTokens?: number;
}

export class RateLimiter {
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
export class MessageRateLimiter {
  private limiters: Map<string, RateLimiter>;

  constructor() {
    this.limiters = new Map();

    // Message type rate limits
    this.limiters.set('text', new RateLimiter({ capacity: 60, refillRate: 10 })); // 60 msg/min
    this.limiters.set('file', new RateLimiter({ capacity: 10, refillRate: 1 })); // 10 files/min
    this.limiters.set('voice', new RateLimiter({ capacity: 20, refillRate: 2 })); // 20 voice/min
    this.limiters.set('control', new RateLimiter({ capacity: 100, refillRate: 20 })); // 100 control/min
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
