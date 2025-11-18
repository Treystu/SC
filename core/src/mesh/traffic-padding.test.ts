/**
 * Tests for Traffic Padding implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TrafficPadding, MESSAGE_SIZE_BUCKETS, AdaptivePadding } from '../mesh/traffic-padding';

describe('TrafficPadding', () => {
  let padding: TrafficPadding;
  
  beforeEach(() => {
    padding = new TrafficPadding({ enabled: true });
  });
  
  it('should pad message to bucket size', () => {
    const message = new Uint8Array(100);
    const padded = padding.pad(message);
    
    expect(padded.bucketSize).toBeGreaterThanOrEqual(100);
    expect(padded.originalSize).toBe(100);
    expect(padded.overhead).toBeGreaterThan(0);
  });
  
  it('should unpad message correctly', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const padded = padding.pad(original);
    const unpadded = padding.unpad(padded.data);
    
    expect(unpadded).toEqual(original);
  });
  
  it('should handle different padding strategies', () => {
    const message = new Uint8Array(100);
    
    // Random padding
    padding.updateConfig({ strategy: 'random' });
    const random = padding.pad(message);
    expect(random.data.length).toBeGreaterThan(message.length);
    
    // Zero padding
    padding.updateConfig({ strategy: 'zero' });
    const zero = padding.pad(message);
    expect(zero.data.length).toBeGreaterThan(message.length);
    
    // PKCS7 padding
    padding.updateConfig({ strategy: 'pkcs7' });
    const pkcs7 = padding.pad(message);
    expect(pkcs7.data.length).toBeGreaterThan(message.length);
  });
  
  it('should use correct bucket sizes', () => {
    const sizes = [50, 200, 500, 1500, 3000];
    
    for (const size of sizes) {
      const message = new Uint8Array(size);
      const padded = padding.pad(message);
      
      // Check bucket size is from standard buckets
      expect(MESSAGE_SIZE_BUCKETS).toContain(padded.bucketSize);
    }
  });
  
  it('should calculate overhead correctly', () => {
    const messageSize = 100;
    const overhead = padding.calculateOverhead(messageSize);
    
    expect(overhead.bytes).toBeGreaterThan(0);
    expect(overhead.percentage).toBeGreaterThan(0);
  });
  
  it('should handle disabled padding', () => {
    const disabled = new TrafficPadding({ enabled: false });
    const message = new Uint8Array(100);
    
    const padded = disabled.pad(message);
    expect(padded.data).toEqual(message);
    expect(padded.overhead).toBe(0);
  });
  
  it('should reject oversized messages', () => {
    const huge = new Uint8Array(20000);
    
    expect(() => padding.pad(huge)).toThrow();
  });
  
  it('should track statistics', () => {
    const message = new Uint8Array(100);
    
    padding.pad(message);
    
    const stats = padding.getStats();
    expect(stats.messagesPadded).toBe(1);
    expect(stats.averageOverhead).toBeGreaterThan(0);
  });
});

describe('AdaptivePadding', () => {
  let adaptive: AdaptivePadding;
  
  beforeEach(() => {
    adaptive = new AdaptivePadding({ enabled: true });
  });
  
  it('should adapt to network conditions', () => {
    // Low bandwidth
    adaptive.updateNetworkConditions(100, 50000);
    const lowConfig = adaptive.getConfig();
    expect(lowConfig.sizeBuckets.length).toBeLessThan(MESSAGE_SIZE_BUCKETS.length);
    
    // High bandwidth
    adaptive.updateNetworkConditions(10, 2000000);
    const highConfig = adaptive.getConfig();
    expect(highConfig.strategy).toBe('random');
  });
  
  it('should decide when to pad', () => {
    adaptive.updateNetworkConditions(10, 2000000);
    expect(adaptive.shouldPad(100)).toBe(true);
    
    adaptive.updateNetworkConditions(100, 50000);
    expect(adaptive.shouldPad(50)).toBe(false);
  });
});
