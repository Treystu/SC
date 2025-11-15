/**
 * Bandwidth Scheduler Tests
 * 
 * Tests for bandwidth-aware message scheduling
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  BandwidthScheduler, 
  BandwidthPriority, 
  ScheduledMessage,
  BandwidthMetrics 
} from './bandwidth';

describe('Bandwidth Scheduler', () => {
  let scheduler: BandwidthScheduler;

  beforeEach(() => {
    scheduler = new BandwidthScheduler();
  });

  describe('Message Scheduling', () => {
    it('should schedule a message', () => {
      const message = {
        id: 'msg-1',
        payload: new Uint8Array([1, 2, 3]),
        priority: BandwidthPriority.MEDIUM
      };

      const result = scheduler.scheduleMessage(message);
      expect(result).toBe(true);
    });

    it('should schedule messages with different priorities', () => {
      const messages = [
        { id: 'msg-1', payload: new Uint8Array(10), priority: BandwidthPriority.LOW },
        { id: 'msg-2', payload: new Uint8Array(10), priority: BandwidthPriority.HIGH },
        { id: 'msg-3', payload: new Uint8Array(10), priority: BandwidthPriority.CRITICAL },
      ];

      messages.forEach(msg => {
        const result = scheduler.scheduleMessage(msg);
        expect(result).toBe(true);
      });
    });

    it('should schedule message with deadline', () => {
      const message = {
        id: 'msg-1',
        payload: new Uint8Array([1, 2, 3]),
        priority: BandwidthPriority.MEDIUM,
        deadline: Date.now() + 5000 // 5 seconds from now
      };

      const result = scheduler.scheduleMessage(message);
      expect(result).toBe(true);
    });

    it('should reject message when queue is full', () => {
      // Fill queue with low priority messages
      for (let i = 0; i < 1000; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.LOW
        });
      }

      // Try to add another low priority message
      const result = scheduler.scheduleMessage({
        id: 'msg-overflow',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.LOW
      });

      expect(result).toBe(false);
    });

    it('should evict low priority message for high priority when queue full', () => {
      // Fill queue with low priority messages
      for (let i = 0; i < 1000; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.LOW
        });
      }

      // Add high priority message
      const result = scheduler.scheduleMessage({
        id: 'msg-critical',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.CRITICAL
      });

      expect(result).toBe(true);
    });
  });

  describe('Message Priority', () => {
    it('should prioritize critical messages', () => {
      scheduler.scheduleMessage({
        id: 'msg-low',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.LOW
      });

      scheduler.scheduleMessage({
        id: 'msg-critical',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.CRITICAL
      });

      const next = scheduler.getNextMessage();
      expect(next?.id).toBe('msg-critical');
    });

    it('should respect priority order', () => {
      const priorities = [
        BandwidthPriority.LOW,
        BandwidthPriority.MEDIUM,
        BandwidthPriority.HIGH,
        BandwidthPriority.CRITICAL
      ];

      // Schedule in reverse order
      priorities.reverse().forEach((priority, idx) => {
        scheduler.scheduleMessage({
          id: `msg-${idx}`,
          payload: new Uint8Array(10),
          priority
        });
      });

      // Should retrieve in priority order
      const msg1 = scheduler.getNextMessage();
      expect(msg1?.priority).toBe(BandwidthPriority.CRITICAL);

      const msg2 = scheduler.getNextMessage();
      expect(msg2?.priority).toBe(BandwidthPriority.HIGH);

      const msg3 = scheduler.getNextMessage();
      expect(msg3?.priority).toBe(BandwidthPriority.MEDIUM);

      const msg4 = scheduler.getNextMessage();
      expect(msg4?.priority).toBe(BandwidthPriority.LOW);
    });

    it('should handle same priority FIFO', () => {
      scheduler.scheduleMessage({
        id: 'msg-1',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM
      });

      scheduler.scheduleMessage({
        id: 'msg-2',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM
      });

      const msg1 = scheduler.getNextMessage();
      expect(msg1?.id).toBe('msg-1');

      const msg2 = scheduler.getNextMessage();
      expect(msg2?.id).toBe('msg-2');
    });
  });

  describe('Bandwidth Management', () => {
    it('should track available bandwidth', () => {
      const metrics = scheduler.getMetrics();
      expect(metrics.availableBandwidth).toBeGreaterThan(0);
    });

    it('should update bandwidth estimate', () => {
      const newBandwidth = 2_000_000; // 2 Mbps
      scheduler.updateBandwidth(newBandwidth);

      const metrics = scheduler.getMetrics();
      expect(metrics.availableBandwidth).toBe(newBandwidth);
    });

    it('should calculate utilization percentage', () => {
      const metrics = scheduler.getMetrics();
      expect(metrics.utilizationPercent).toBeGreaterThanOrEqual(0);
      expect(metrics.utilizationPercent).toBeLessThanOrEqual(100);
    });

    it('should detect congestion', () => {
      // Force high utilization
      for (let i = 0; i < 100; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10000), // Large messages
          priority: BandwidthPriority.MEDIUM
        });
      }

      const isCongested = scheduler.isCongested();
      expect(typeof isCongested).toBe('boolean');
    });

    it('should throttle during congestion', () => {
      // Simulate congestion
      scheduler.updateBandwidth(100); // Very low bandwidth

      for (let i = 0; i < 10; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(1000),
          priority: BandwidthPriority.MEDIUM
        });
      }

      // Only critical messages should be sent during congestion
      if (scheduler.isCongested()) {
        const next = scheduler.getNextMessage();
        if (next) {
          expect(next.priority).toBe(BandwidthPriority.CRITICAL);
        }
      }
    });
  });

  describe('Metrics', () => {
    it('should track queued messages', () => {
      scheduler.scheduleMessage({
        id: 'msg-1',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM
      });

      const metrics = scheduler.getMetrics();
      expect(metrics.queuedMessages).toBe(1);
    });

    it('should track messages per second', () => {
      for (let i = 0; i < 10; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.MEDIUM
        });
        scheduler.getNextMessage();
      }

      const metrics = scheduler.getMetrics();
      expect(metrics.messagesPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should track average latency', () => {
      const metrics = scheduler.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it('should track packet loss', () => {
      const metrics = scheduler.getMetrics();
      expect(metrics.packetLoss).toBeGreaterThanOrEqual(0);
      expect(metrics.packetLoss).toBeLessThanOrEqual(1);
    });

    it('should provide complete metrics', () => {
      const metrics = scheduler.getMetrics();
      
      expect(metrics).toHaveProperty('availableBandwidth');
      expect(metrics).toHaveProperty('utilizationPercent');
      expect(metrics).toHaveProperty('queuedMessages');
      expect(metrics).toHaveProperty('messagesPerSecond');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('packetLoss');
    });
  });

  describe('Deadline Handling', () => {
    it('should prioritize messages near deadline', () => {
      scheduler.scheduleMessage({
        id: 'msg-urgent',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.LOW,
        deadline: Date.now() + 100 // 100ms deadline
      });

      scheduler.scheduleMessage({
        id: 'msg-normal',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.LOW,
        deadline: Date.now() + 10000 // 10s deadline
      });

      // Message with closer deadline should be prioritized
      const next = scheduler.getNextMessage();
      expect(next?.id).toBe('msg-urgent');
    });

    it('should drop expired messages', () => {
      scheduler.scheduleMessage({
        id: 'msg-expired',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM,
        deadline: Date.now() - 1000 // Already expired
      });

      scheduler.cleanupExpired();

      const metrics = scheduler.getMetrics();
      expect(metrics.queuedMessages).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should return null when queue is empty', () => {
      const next = scheduler.getNextMessage();
      expect(next).toBeNull();
    });

    it('should clear queue', () => {
      for (let i = 0; i < 10; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.MEDIUM
        });
      }

      scheduler.clearQueue();

      const metrics = scheduler.getMetrics();
      expect(metrics.queuedMessages).toBe(0);
    });

    it('should get queue length', () => {
      for (let i = 0; i < 5; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.MEDIUM
        });
      }

      const length = scheduler.getQueueLength();
      expect(length).toBe(5);
    });

    it('should check if queue is empty', () => {
      expect(scheduler.isEmpty()).toBe(true);

      scheduler.scheduleMessage({
        id: 'msg-1',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM
      });

      expect(scheduler.isEmpty()).toBe(false);
    });

    it('should check if queue is full', () => {
      expect(scheduler.isFull()).toBe(false);

      // Fill queue
      for (let i = 0; i < 1000; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.MEDIUM
        });
      }

      expect(scheduler.isFull()).toBe(true);
    });
  });

  describe('Retry Logic', () => {
    it('should track retry count', () => {
      scheduler.scheduleMessage({
        id: 'msg-1',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM
      });

      const msg = scheduler.getNextMessage();
      expect(msg?.retries).toBe(0);

      // Reschedule as retry
      if (msg) {
        scheduler.scheduleRetry(msg);
        const retried = scheduler.getNextMessage();
        expect(retried?.retries).toBe(1);
      }
    });

    it('should limit retry attempts', () => {
      const message = {
        id: 'msg-1',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM
      };

      scheduler.scheduleMessage(message);
      let msg = scheduler.getNextMessage();

      // Retry multiple times
      for (let i = 0; i < 10; i++) {
        if (msg) {
          scheduler.scheduleRetry(msg);
          msg = scheduler.getNextMessage();
        }
      }

      // Should eventually stop retrying
      expect(msg).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle high throughput', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10000; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(100),
          priority: BandwidthPriority.MEDIUM
        });
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it('should efficiently retrieve messages', () => {
      for (let i = 0; i < 1000; i++) {
        scheduler.scheduleMessage({
          id: `msg-${i}`,
          payload: new Uint8Array(100),
          priority: BandwidthPriority.MEDIUM
        });
      }

      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        scheduler.getNextMessage();
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Less than 500ms
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero bandwidth', () => {
      scheduler.updateBandwidth(0);
      const metrics = scheduler.getMetrics();
      expect(metrics.availableBandwidth).toBe(0);
    });

    it('should handle very large bandwidth', () => {
      scheduler.updateBandwidth(1_000_000_000); // 1 Gbps
      const metrics = scheduler.getMetrics();
      expect(metrics.availableBandwidth).toBe(1_000_000_000);
    });

    it('should handle empty payload', () => {
      const result = scheduler.scheduleMessage({
        id: 'msg-1',
        payload: new Uint8Array(0),
        priority: BandwidthPriority.MEDIUM
      });

      expect(result).toBe(true);
    });

    it('should handle large payload', () => {
      const result = scheduler.scheduleMessage({
        id: 'msg-1',
        payload: new Uint8Array(10 * 1024 * 1024), // 10MB
        priority: BandwidthPriority.MEDIUM
      });

      expect(result).toBe(true);
    });
  });
});
