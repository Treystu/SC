/**
 * Rate Limiter - Prevent abuse and DoS attacks
 * Implements token bucket algorithm with configurable limits
 */

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;
  
  /**
   * Time window in milliseconds
   */
  windowMs: number;
  
  /**
   * Number of tokens to add per interval (for token bucket)
   */
  tokensPerInterval?: number;
  
  /**
   * Interval for adding tokens in milliseconds
   */
  refillIntervalMs?: number;
}

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Token bucket rate limiter
 */
export class TokenBucketRateLimiter {
  private tokens: Map<string, number> = new Map();
  private lastRefill: Map<string, number> = new Map();
  
  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per second
    private refillIntervalMs: number = 1000
  ) {
    // Start refill timer
    setInterval(() => this.refillAllBuckets(), refillIntervalMs);
  }
  
  /**
   * Check if request is allowed and consume a token
   */
  tryConsume(key: string, cost: number = 1): RateLimitInfo {
    const now = Date.now();
    const currentTokens = this.tokens.get(key) ?? this.maxTokens;
    const lastRefill = this.lastRefill.get(key) ?? now;
    
    // Refill tokens based on elapsed time
    const elapsedMs = now - lastRefill;
    const tokensToAdd = Math.floor((elapsedMs / this.refillIntervalMs) * this.refillRate);
    const newTokens = Math.min(currentTokens + tokensToAdd, this.maxTokens);
    
    if (newTokens >= cost) {
      // Consume tokens
      this.tokens.set(key, newTokens - cost);
      this.lastRefill.set(key, now);
      
      return {
        allowed: true,
        remaining: newTokens - cost,
        resetTime: now + this.refillIntervalMs,
      };
    }
    
    // Not enough tokens
    const tokensNeeded = cost - newTokens;
    const retryAfter = Math.ceil((tokensNeeded / this.refillRate) * this.refillIntervalMs);
    
    return {
      allowed: false,
      remaining: newTokens,
      resetTime: now + retryAfter,
      retryAfter,
    };
  }
  
  /**
   * Refill all buckets
   */
  private refillAllBuckets(): void {
    const now = Date.now();
    
    for (const [key, tokens] of this.tokens.entries()) {
      const lastRefill = this.lastRefill.get(key) ?? now;
      const elapsedMs = now - lastRefill;
      const tokensToAdd = Math.floor((elapsedMs / this.refillIntervalMs) * this.refillRate);
      
      if (tokensToAdd > 0) {
        const newTokens = Math.min(tokens + tokensToAdd, this.maxTokens);
        this.tokens.set(key, newTokens);
        this.lastRefill.set(key, now);
      }
    }
  }
  
  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.tokens.delete(key);
    this.lastRefill.delete(key);
  }
  
  /**
   * Get current token count
   */
  getTokens(key: string): number {
    return this.tokens.get(key) ?? this.maxTokens;
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {
    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }
  
  /**
   * Check if request is allowed
   */
  tryRequest(key: string): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get requests in current window
    const keyRequests = this.requests.get(key) ?? [];
    const requestsInWindow = keyRequests.filter(time => time > windowStart);
    
    if (requestsInWindow.length < this.maxRequests) {
      // Allow request
      requestsInWindow.push(now);
      this.requests.set(key, requestsInWindow);
      
      return {
        allowed: true,
        remaining: this.maxRequests - requestsInWindow.length,
        resetTime: windowStart + this.windowMs,
      };
    }
    
    // Rate limit exceeded
    const oldestRequest = requestsInWindow[0];
    const retryAfter = oldestRequest + this.windowMs - now;
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: oldestRequest + this.windowMs,
      retryAfter,
    };
  }
  
  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [key, requests] of this.requests.entries()) {
      const filtered = requests.filter(time => time > windowStart);
      
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
  
  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }
  
  /**
   * Get current request count
   */
  getRequestCount(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const requests = this.requests.get(key) ?? [];
    return requests.filter(time => time > windowStart).length;
  }
}

/**
 * Fixed window rate limiter
 */
export class FixedWindowRateLimiter {
  private counts: Map<string, { count: number; resetTime: number }> = new Map();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}
  
  /**
   * Check if request is allowed
   */
  tryRequest(key: string): RateLimitInfo {
    const now = Date.now();
    const entry = this.counts.get(key);
    
    // Check if window has expired
    if (!entry || now >= entry.resetTime) {
      // New window
      this.counts.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs,
      };
    }
    
    if (entry.count < this.maxRequests) {
      // Increment count
      entry.count++;
      
      return {
        allowed: true,
        remaining: this.maxRequests - entry.count,
        resetTime: entry.resetTime,
      };
    }
    
    // Rate limit exceeded
    const retryAfter = entry.resetTime - now;
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfter,
    };
  }
  
  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.counts.delete(key);
  }
  
  /**
   * Get current request count
   */
  getRequestCount(key: string): number {
    const entry = this.counts.get(key);
    if (!entry || Date.now() >= entry.resetTime) {
      return 0;
    }
    return entry.count;
  }
}

/**
 * Composite rate limiter with multiple limits
 */
export class CompositeRateLimiter {
  private limiters: Array<{
    name: string;
    limiter: TokenBucketRateLimiter | SlidingWindowRateLimiter | FixedWindowRateLimiter;
  }> = [];
  
  /**
   * Add a rate limiter
   */
  addLimiter(
    name: string,
    limiter: TokenBucketRateLimiter | SlidingWindowRateLimiter | FixedWindowRateLimiter
  ): void {
    this.limiters.push({ name, limiter });
  }
  
  /**
   * Check if request is allowed (all limiters must allow)
   */
  tryRequest(key: string): RateLimitInfo {
    for (const { name, limiter } of this.limiters) {
      const result = limiter instanceof TokenBucketRateLimiter
        ? limiter.tryConsume(key)
        : limiter.tryRequest(key);
      
      if (!result.allowed) {
        return {
          ...result,
          // Add name to identify which limiter triggered
        };
      }
    }
    
    return {
      allowed: true,
      remaining: 0, // Combined remaining not calculated
      resetTime: Date.now(),
    };
  }
  
  /**
   * Reset all limiters for a key
   */
  reset(key: string): void {
    for (const { limiter } of this.limiters) {
      limiter.reset(key);
    }
  }
}

/**
 * Rate limiter middleware for message processing
 */
export class MessageRateLimiter {
  // Per-peer message rate limit (100 msg/min)
  private peerLimiter = new SlidingWindowRateLimiter(100, 60 * 1000);
  
  // Global message rate limit (1000 msg/min)
  private globalLimiter = new SlidingWindowRateLimiter(1000, 60 * 1000);
  
  // Per-peer bandwidth limit (1MB/sec using token bucket)
  private bandwidthLimiter = new TokenBucketRateLimiter(
    1024 * 1024, // 1MB bucket
    1024 * 1024, // 1MB/sec refill
    1000 // 1 second interval
  );
  
  /**
   * Check if message is allowed from peer
   */
  allowMessage(peerId: string, messageSize: number = 1): RateLimitInfo {
    // Check peer-specific limit
    const peerLimit = this.peerLimiter.tryRequest(peerId);
    if (!peerLimit.allowed) {
      return peerLimit;
    }
    
    // Check global limit
    const globalLimit = this.globalLimiter.tryRequest('global');
    if (!globalLimit.allowed) {
      return globalLimit;
    }
    
    // Check bandwidth limit
    const bandwidthLimit = this.bandwidthLimiter.tryConsume(peerId, messageSize);
    if (!bandwidthLimit.allowed) {
      return bandwidthLimit;
    }
    
    return {
      allowed: true,
      remaining: Math.min(
        peerLimit.remaining,
        globalLimit.remaining,
        bandwidthLimit.remaining
      ),
      resetTime: Math.max(
        peerLimit.resetTime,
        globalLimit.resetTime,
        bandwidthLimit.resetTime
      ),
    };
  }
  
  /**
   * Reset limits for a peer (use sparingly)
   */
  resetPeer(peerId: string): void {
    this.peerLimiter.reset(peerId);
    this.bandwidthLimiter.reset(peerId);
  }
  
  /**
   * Get current message count for peer
   */
  getMessageCount(peerId: string): number {
    return this.peerLimiter.getRequestCount(peerId);
  }
  
  /**
   * Get current bandwidth used by peer
   */
  getBandwidthUsed(peerId: string): number {
    const maxTokens = 1024 * 1024;
    const currentTokens = this.bandwidthLimiter.getTokens(peerId);
    return maxTokens - currentTokens;
  }
}

/**
 * Create default rate limiters for different use cases
 */
export const RateLimiters = {
  /**
   * API endpoint rate limiter (100 req/min per IP)
   */
  api: () => new SlidingWindowRateLimiter(100, 60 * 1000),
  
  /**
   * Login attempt limiter (5 attempts per 15 min)
   */
  login: () => new FixedWindowRateLimiter(5, 15 * 60 * 1000),
  
  /**
   * Message sending limiter (100 msg/min per user)
   */
  message: () => new MessageRateLimiter(),
  
  /**
   * File upload limiter (10 files per hour, 100MB total)
   */
  fileUpload: () => {
    const composite = new CompositeRateLimiter();
    composite.addLimiter('count', new FixedWindowRateLimiter(10, 60 * 60 * 1000));
    composite.addLimiter('size', new TokenBucketRateLimiter(100 * 1024 * 1024, 100 * 1024 * 1024, 3600 * 1000));
    return composite;
  },
  
  /**
   * Connection attempts (20 per minute)
   */
  connection: () => new SlidingWindowRateLimiter(20, 60 * 1000),
};
