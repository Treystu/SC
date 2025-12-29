export interface RateLimitConfig {
  messagesPerMinute: number;
  messagesPerHour: number;
  filesPerHour: number;
  maxMessageSize: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  messagesPerMinute: 60,
  messagesPerHour: 1000,
  filesPerHour: 100,
  maxMessageSize: 10000
};

export class RateLimiter {
  private messageTimestamps = new Map<string, number[]>();
  private fileTimestamps = new Map<string, number[]>();
  private config: RateLimitConfig;
  
  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMITS) {
    this.config = config;
  }
  
  canSendMessage(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const userMessages = this.messageTimestamps.get(userId) || [];
    
    // Check per-minute limit
    const lastMinute = userMessages.filter(t => now - t < 60000);
    if (lastMinute.length >= this.config.messagesPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.config.messagesPerMinute} messages per minute`
      };
    }
    
    // Check per-hour limit
    const lastHour = userMessages.filter(t => now - t < 3600000);
    if (lastHour.length >= this.config.messagesPerHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.config.messagesPerHour} messages per hour`
      };
    }
    
    // Record this message
    lastHour.push(now);
    this.messageTimestamps.set(userId, lastHour);
    
    return { allowed: true };
  }
  
  canSendFile(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const userFiles = this.fileTimestamps.get(userId) || [];
    
    // Check per-hour limit
    const lastHour = userFiles.filter(t => now - t < 3600000);
    if (lastHour.length >= this.config.filesPerHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.config.filesPerHour} files per hour`
      };
    }
    
    // Record this file
    lastHour.push(now);
    this.fileTimestamps.set(userId, lastHour);
    
    return { allowed: true };
  }
  
  cleanup() {
    const now = Date.now();
    const hourAgo = now - 3600000;
    
    // Clean up old timestamps
    for (const [userId, timestamps] of this.messageTimestamps.entries()) {
      const recent = timestamps.filter(t => t > hourAgo);
      if (recent.length === 0) {
        this.messageTimestamps.delete(userId);
      } else {
        this.messageTimestamps.set(userId, recent);
      }
    }
    
    for (const [userId, timestamps] of this.fileTimestamps.entries()) {
      const recent = timestamps.filter(t => t > hourAgo);
      if (recent.length === 0) {
        this.fileTimestamps.delete(userId);
      } else {
        this.fileTimestamps.set(userId, recent);
      }
    }
  }
}

// Global rate limiter instance
export const rateLimiter = new RateLimiter();

// Cleanup every 5 minutes
const __rateLimiterCleanupTimer = setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);
try {
  if (__rateLimiterCleanupTimer && typeof (__rateLimiterCleanupTimer as any).unref === 'function') {
    (__rateLimiterCleanupTimer as any).unref();
  }
  } catch (e) { /* no-op */ }