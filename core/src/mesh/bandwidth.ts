/**
 * Bandwidth-Aware Message Scheduling (Task 22)
 * 
 * Implements adaptive bandwidth management and message scheduling
 * based on available network capacity, message priority, and congestion control.
 */

export enum BandwidthPriority {
  CRITICAL = 0,  // Control messages, heartbeats
  HIGH = 1,      // Voice messages
  MEDIUM = 2,    // Text messages
  LOW = 3        // File transfers
}

export interface BandwidthMetrics {
  availableBandwidth: number; // bytes per second
  utilizationPercent: number;
  queuedMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  packetLoss: number;
}

export interface ScheduledMessage {
  id: string;
  payload: Uint8Array;
  priority: BandwidthPriority;
  timestamp: number;
  retries: number;
  deadline?: number; // Optional delivery deadline
}

export class BandwidthScheduler {
  private queue: ScheduledMessage[] = [];
  private metrics: BandwidthMetrics = {
    availableBandwidth: 1_000_000, // 1 Mbps default
    utilizationPercent: 0,
    queuedMessages: 0,
    messagesPerSecond: 0,
    averageLatency: 0,
    packetLoss: 0
  };

  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly CONGESTION_THRESHOLD = 0.8; // 80% utilization
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private sendingRate = 0;
  private lastSendTime = Date.now();
  private sendingWindow: number[] = [];

  /**
   * Schedule a message for transmission
   */
  scheduleMessage(message: Omit<ScheduledMessage, 'timestamp' | 'retries'>): boolean {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      // Queue full - drop lowest priority message if new message has higher priority
      const lowestPriority = Math.max(...this.queue.map(m => m.priority));
      if (message.priority < lowestPriority) {
        const idx = this.queue.findIndex(m => m.priority === lowestPriority);
        this.queue.splice(idx, 1);
      } else {
        return false; // Cannot schedule
      }
    }

    const scheduledMessage: ScheduledMessage = {
      ...message,
      timestamp: Date.now(),
      retries: 0
    };

    this.queue.push(scheduledMessage);
    this.sortQueue();
    this.metrics.queuedMessages = this.queue.length;

    return true;
  }

  /**
   * Get next message to send based on priority and bandwidth availability
   */
  getNextMessage(): ScheduledMessage | null {
    if (this.queue.length === 0) {
      return null;
    }

    // Check if we're under congestion
    if (this.isCongested()) {
      // Only send critical messages during congestion
      const critical = this.queue.find(m => m.priority === BandwidthPriority.CRITICAL);
      if (critical) {
        this.removeMessage(critical.id);
        return critical;
      }
      return null;
    }

    // Check bandwidth capacity
    const bytesPerSecond = this.estimateSendingRate();
    if (bytesPerSecond >= this.metrics.availableBandwidth) {
      return null; // At capacity
    }

    // Get highest priority message that fits in remaining bandwidth
    const remainingBandwidth = this.metrics.availableBandwidth - bytesPerSecond;
    
    for (const message of this.queue) {
      if (message.payload.byteLength <= remainingBandwidth) {
        this.removeMessage(message.id);
        return message;
      }
    }

    return null;
  }

  /**
   * Update bandwidth metrics based on network measurements
   */
  updateMetrics(metrics: Partial<BandwidthMetrics>): void {
    this.metrics = {
      ...this.metrics,
      ...metrics
    };

    // Adjust scheduling strategy based on metrics
    if (metrics.packetLoss && metrics.packetLoss > 0.05) {
      // High packet loss - reduce sending rate
      this.metrics.availableBandwidth *= 0.8;
    } else if (metrics.utilizationPercent && metrics.utilizationPercent < 0.5) {
      // Low utilization - can increase rate
      this.metrics.availableBandwidth *= 1.1;
    }
  }

  /**
   * Record successful message transmission
   */
  recordSend(messageSize: number): void {
    const now = Date.now();
    this.sendingWindow.push(now);
    
    // Keep only last 10 seconds of data
    this.sendingWindow = this.sendingWindow.filter(t => now - t < 10000);
    
    this.lastSendTime = now;
    this.updateSendingRate();
  }

  /**
   * Get current bandwidth metrics
   */
  getMetrics(): BandwidthMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if network is congested
   */
  private isCongested(): boolean {
    return this.metrics.utilizationPercent > this.CONGESTION_THRESHOLD ||
           this.metrics.packetLoss > 0.1 ||
           this.queue.length > this.MAX_QUEUE_SIZE * 0.9;
  }

  /**
   * Sort queue by priority and deadline
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Then by deadline (if set)
      if (a.deadline && b.deadline) {
        return a.deadline - b.deadline;
      }

      // Finally by timestamp (FIFO within same priority)
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Remove message from queue
   */
  private removeMessage(id: string): void {
    const idx = this.queue.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.metrics.queuedMessages = this.queue.length;
    }
  }

  /**
   * Estimate current sending rate
   */
  private estimateSendingRate(): number {
    if (this.sendingWindow.length < 2) {
      return 0;
    }

    const now = Date.now();
    const messagesInWindow = this.sendingWindow.filter(t => now - t < 1000);
    return messagesInWindow.length;
  }

  /**
   * Update internal sending rate metric
   */
  private updateSendingRate(): void {
    this.sendingRate = this.estimateSendingRate();
    this.metrics.messagesPerSecond = this.sendingRate;

    const bytesPerMessage = this.queue.length > 0
      ? this.queue.reduce((sum, m) => sum + m.payload.byteLength, 0) / this.queue.length
      : 1000; // Assume 1KB average

    const currentBytesPerSecond = this.sendingRate * bytesPerMessage;
    this.metrics.utilizationPercent = currentBytesPerSecond / this.metrics.availableBandwidth;
  }

  /**
   * Clean up expired messages
   */
  cleanupExpired(): number {
    const now = Date.now();
    const before = this.queue.length;

    this.queue = this.queue.filter(m => {
      if (!m.deadline) {
        return true;
      }
      return m.deadline > now;
    });

    const removed = before - this.queue.length;
    this.metrics.queuedMessages = this.queue.length;

    return removed;
  }

  /**
   * Update available bandwidth estimate
   */
  updateBandwidth(bandwidth: number): void {
    this.metrics.availableBandwidth = bandwidth;
  }

  /**
   * Schedule a message for retry
   */
  scheduleRetry(message: ScheduledMessage): boolean {
    const retryMessage: ScheduledMessage = {
      ...message,
      retries: message.retries + 1,
      timestamp: Date.now()
    };

    // Limit retry attempts
    if (retryMessage.retries > this.MAX_RETRY_ATTEMPTS) {
      return false;
    }

    return this.scheduleMessage(retryMessage);
  }

  /**
   * Clear all messages from queue
   */
  clearQueue(): void {
    this.queue = [];
    this.metrics.queuedMessages = 0;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.queue.length >= this.MAX_QUEUE_SIZE;
  }
}

/**
 * Factory function for creating bandwidth scheduler
 */
export function createBandwidthScheduler(
  initialBandwidth: number = 1_000_000
): BandwidthScheduler {
  const scheduler = new BandwidthScheduler();
  scheduler.updateMetrics({ availableBandwidth: initialBandwidth });
  return scheduler;
}
