/**
 * Tests for Proof-of-Work implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ProofOfWork, benchmarkPoW, DEFAULT_POW_CONFIG } from '../mesh/proof-of-work';

describe('ProofOfWork', () => {
  let pow: ProofOfWork;
  const testMessage = new Uint8Array([1, 2, 3, 4, 5]);
  
  beforeEach(() => {
    pow = new ProofOfWork({ enabled: true, maxComputeTime: 10000 });
  });
  
  it('should compute valid PoW', async () => {
    const challenge = await pow.computePoW(testMessage, 8);
    
    expect(challenge).not.toBeNull();
    expect(challenge!.difficulty).toBe(8);
    expect(challenge!.nonce).toBeGreaterThanOrEqual(0);
  });
  
  it('should verify valid PoW', async () => {
    const challenge = await pow.computePoW(testMessage, 8);
    expect(challenge).not.toBeNull();
    
    const isValid = pow.verifyPoW(testMessage, challenge!, 8);
    expect(isValid).toBe(true);
  });
  
  it('should reject invalid PoW', async () => {
    const challenge = await pow.computePoW(testMessage, 8);
    expect(challenge).not.toBeNull();
    
    // Modify nonce
    challenge!.nonce += 1;
    
    const isValid = pow.verifyPoW(testMessage, challenge!, 8);
    expect(isValid).toBe(false);
  });
  
  it('should handle difficulty levels', async () => {
    // Low difficulty should be fast
    const easy = await pow.computePoW(testMessage, 4);
    expect(easy).not.toBeNull();
    
    // Higher difficulty should take longer
    const hard = await pow.computePoW(testMessage, 12);
    expect(hard).not.toBeNull();
  });
  
  it('should respect peer exemptions', () => {
    const peerId = 'trusted-peer-123';
    
    expect(pow.isPeerExempt(peerId)).toBe(false);
    
    pow.exemptPeer(peerId);
    expect(pow.isPeerExempt(peerId)).toBe(true);
    
    pow.unexemptPeer(peerId);
    expect(pow.isPeerExempt(peerId)).toBe(false);
  });
  
  it('should handle adaptive difficulty', () => {
    const initialDifficulty = pow.getConfig().defaultDifficulty;
    
    pow.increaseDifficulty(2);
    expect(pow.getConfig().defaultDifficulty).toBe(initialDifficulty + 2);
    
    pow.decreaseDifficulty(1);
    expect(pow.getConfig().defaultDifficulty).toBe(initialDifficulty + 1);
  });
  
  it('should track statistics', async () => {
    await pow.computePoW(testMessage, 8);
    
    const stats = pow.getStats();
    expect(stats.computeAttempts).toBeGreaterThan(0);
    expect(stats.computeSuccesses).toBeGreaterThan(0);
  });
  
  it('should handle disabled PoW', async () => {
    const disabledPoW = new ProofOfWork({ enabled: false });
    
    const challenge = await disabledPoW.computePoW(testMessage, 8);
    expect(challenge).not.toBeNull();
    expect(challenge!.difficulty).toBe(0);
    
    const isValid = disabledPoW.verifyPoW(testMessage, challenge!, 8);
    expect(isValid).toBe(true);
  });
});
