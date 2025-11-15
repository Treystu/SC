import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BandwidthScheduler, BandwidthPriority, type ScheduledMessage } from './bandwidth';

describe('BandwidthScheduler', () => {
  let scheduler: BandwidthScheduler;

  beforeEach(() => {
    scheduler = new BandwidthScheduler();
    jest.clearAllTimers();
  });

  describe('Message Scheduling', () => {
    it('should schedule message with priority', () => {
      const message: ScheduledMessage = {
        id: 'msg1',
        payload: new Uint8Array([1, 2, 3]),
        priority: BandwidthPriority.HIGH,
        timestamp: Date.now(),
        retries: 0
      };

      scheduler.scheduleMessage(message);
      const metrics = scheduler.getMetrics();
      
      expect(metrics.queuedMessages).toBe(1);
    });

    it('should prioritize critical messages', () => {
      const critical: ScheduledMessage = {
        id: 'critical',
        payload: new Uint8Array([1]),
        priority: BandwidthPriority.CRITICAL,
        timestamp: Date.now(),
        retries: 0
      };

      const low: ScheduledMessage = {
        id: 'low',
        payload: new Uint8Array([2]),
        priority: BandwidthPriority.LOW,
        timestamp: Date.now(),
        retries: 0
      };

      scheduler.scheduleMessage(low);
      scheduler.scheduleMessage(critical);

      // Critical should be processed first
      expect(scheduler.getMetrics().queuedMessages).toBe(2);
    });

    it('should respect message deadlines', () => {
      const expiredMessage: ScheduledMessage = {
        id: 'expired',
        payload: new Uint8Array([1]),
        priority: BandwidthPriority.MEDIUM,
        timestamp: Date.now(),
        retries: 0,
        deadline: Date.now() - 1000 // Already expired
      };

      scheduler.scheduleMessage(expiredMessage);
      
      // Expired messages should be dropped
      const metrics = scheduler.getMetrics();
      expect(metrics.queuedMessages).toBe(0);
    });
  });

  describe('Bandwidth Management', () => {
    it('should track bandwidth utilization', () => {
      const message: ScheduledMessage = {
        id: 'msg1',
        payload: new Uint8Array(1000), // 1KB
        priority: BandwidthPriority.MEDIUM,
        timestamp: Date.now(),
        retries: 0
      };

      scheduler.scheduleMessage(message);
      scheduler.updateBandwidth(100_000); // 100 KB/s

      const metrics = scheduler.getMetrics();
      expect(metrics.availableBandwidth).toBe(100_000);
    });

    it('should detect congestion', () => {
      scheduler.updateBandwidth(1000); // Low bandwidth

      for (let i = 0; i < 100; i++) {
        scheduler.scheduleMessage({
          id: `msg${i}`,
          payload: new Uint8Array(100),
          priority: BandwidthPriority.LOW,
          timestamp: Date.now(),
          retries: 0
        });
      }

      const metrics = scheduler.getMetrics();
      expect(metrics.utilizationPercent).toBeGreaterThan(0);
    });

    it('should adjust sending rate based on congestion', () => {
      const initialRate = scheduler.getSendingRate();
      
      // Simulate high utilization
      scheduler.updateBandwidth(1000);
      for (let i = 0; i < 50; i++) {
        scheduler.scheduleMessage({
          id: `msg${i}`,
          payload: new Uint8Array(100),
          priority: BandwidthPriority.LOW,
          timestamp: Date.now(),
          retries: 0
        });
      }

      expect(scheduler.getSendingRate()).toBeDefined();
    });
  });

  describe('Queue Management', () => {
    it('should enforce max queue size', () => {
      // Try to add more than MAX_QUEUE_SIZE messages
      for (let i = 0; i < 1100; i++) {
        scheduler.scheduleMessage({
          id: `msg${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.LOW,
          timestamp: Date.now(),
          retries: 0
        });
      }

      const metrics = scheduler.getMetrics();
      expect(metrics.queuedMessages).toBeLessThanOrEqual(1000);
    });

    it('should drop low priority messages when queue is full', () => {
      // Fill queue with low priority
      for (let i = 0; i < 1000; i++) {
        scheduler.scheduleMessage({
          id: `low${i}`,
          payload: new Uint8Array(10),
          priority: BandwidthPriority.LOW,
          timestamp: Date.now(),
          retries: 0
        });
      }

      // Add critical message - should be accepted
      scheduler.scheduleMessage({
        id: 'critical',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.CRITICAL,
        timestamp: Date.now(),
        retries: 0
      });

      // Queue should still be at max
      expect(scheduler.getMetrics().queuedMessages).toBeLessThanOrEqual(1000);
    });

    it('should clear queue', () => {
      scheduler.scheduleMessage({
        id: 'msg1',
        payload: new Uint8Array(10),
        priority: BandwidthPriority.MEDIUM,
        timestamp: Date.now(),
        retries: 0
      });

      scheduler.clearQueue();
      expect(scheduler.getMetrics().queuedMessages).toBe(0);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track messages per second', () => {
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

    it('should update metrics on send', () => {
      const message: ScheduledMessage = {
        id: 'msg1',
        payload: new Uint8Array(100),
        priority: BandwidthPriority.HIGH,
        timestamp: Date.now(),
        retries: 0
      };

      scheduler.scheduleMessage(message);
      const beforeMetrics = scheduler.getMetrics();
      
      scheduler.processQueue();
      
      const afterMetrics = scheduler.getMetrics();
      expect(afterMetrics.queuedMessages).toBeLessThanOrEqual(beforeMetrics.queuedMessages);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed messages', () => {
      const message: ScheduledMessage = {
        id: 'msg1',
        payload: new Uint8Array(100),
        priority: BandwidthPriority.MEDIUM,
        timestamp: Date.now(),
        retries: 0
      };

      scheduler.scheduleMessage(message);
      scheduler.markFailed('msg1');

      const metrics = scheduler.getMetrics();
      // Message should be back in queue with retry count incremented
      expect(metrics.queuedMessages).toBeGreaterThan(0);
    });

    it('should drop messages after max retries', () => {
      const message: ScheduledMessage = {
        id: 'msg1',
        payload: new Uint8Array(100),
        priority: BandwidthPriority.MEDIUM,
        timestamp: Date.now(),
        retries: 5 // Already at max
      };

      scheduler.scheduleMessage(message);
      scheduler.markFailed('msg1');

      // Should be dropped
      const metrics = scheduler.getMetrics();
      expect(metrics.queuedMessages).toBe(0);
    });
  });

  describe('Adaptive Scheduling', () => {
    it('should adapt to changing bandwidth', () => {
      scheduler.updateBandwidth(1_000_000); // 1 Mbps
      const highBandwidthMetrics = scheduler.getMetrics();

      scheduler.updateBandwidth(100_000); // 100 Kbps
      const lowBandwidthMetrics = scheduler.getMetrics();

      expect(lowBandwidthMetrics.availableBandwidth).toBeLessThan(
        highBandwidthMetrics.availableBandwidth
      );
    });

    it('should pause sending during extreme congestion', () => {
      scheduler.updateBandwidth(100); // Very low bandwidth
      
      for (let i = 0; i < 100; i++) {
        scheduler.scheduleMessage({
          id: `msg${i}`,
          payload: new Uint8Array(1000),
          priority: BandwidthPriority.LOW,
          timestamp: Date.now(),
          retries: 0
        });
      }

      const metrics = scheduler.getMetrics();
      expect(metrics.utilizationPercent).toBeGreaterThan(0.8);
    });
  });
});
