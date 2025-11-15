/**
 * Performance Regression Tests
 * 
 * Ensures cryptographic operations maintain acceptable performance
 */

import { describe, it, expect } from '@jest/globals';
import { 
  generateKeyPair, 
  signMessage, 
  verifySignature,
  encryptMessage,
  decryptMessage,
  deriveSharedSecret
} from './primitives';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  keyGeneration: 10,
  signing: 5,
  verification: 5,
  encryption: 10,
  decryption: 10,
  keyExchange: 5,
  bulkEncryption: 500, // for 1MB
  bulkDecryption: 500,
};

/**
 * Measures execution time of a function
 */
function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

/**
 * Runs a function multiple times and returns average time
 */
function measureAverage(fn: () => void, iterations: number): number {
  const times: number[] = [];
  
  // Warmup
  for (let i = 0; i < 10; i++) {
    fn();
  }
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    times.push(measure(fn));
  }
  
  return times.reduce((a, b) => a + b, 0) / times.length;
}

describe('Crypto Performance Tests', () => {
  describe('Key Generation Performance', () => {
    it('should generate keypair within threshold', () => {
      const avgTime = measureAverage(() => {
        generateKeyPair();
      }, 100);
      
      console.log(`Key generation average: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(THRESHOLDS.keyGeneration);
    });

    it('should generate 100 keypairs in reasonable time', () => {
      const totalTime = measure(() => {
        for (let i = 0; i < 100; i++) {
          generateKeyPair();
        }
      });
      
      console.log(`100 keypairs: ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(THRESHOLDS.keyGeneration * 100);
    });
  });

  describe('Signature Performance', () => {
    const keypair = generateKeyPair();
    const message = new Uint8Array(1024); // 1KB message

    it('should sign message within threshold', () => {
      const avgTime = measureAverage(() => {
        signMessage(message, keypair.privateKey);
      }, 100);
      
      console.log(`Signing average: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(THRESHOLDS.signing);
    });

    it('should verify signature within threshold', () => {
      const signature = signMessage(message, keypair.privateKey);
      
      const avgTime = measureAverage(() => {
        verifySignature(message, signature, keypair.publicKey);
      }, 100);
      
      console.log(`Verification average: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(THRESHOLDS.verification);
    });

    it('should handle 1000 signatures/sec', () => {
      const totalTime = measure(() => {
        for (let i = 0; i < 1000; i++) {
          signMessage(message, keypair.privateKey);
        }
      });
      
      console.log(`1000 signatures: ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(1000 * THRESHOLDS.signing);
    });
  });

  describe('Encryption Performance', () => {
    const keypair = generateKeyPair();
    const message = new Uint8Array(1024); // 1KB message

    it('should encrypt message within threshold', () => {
      const avgTime = measureAverage(() => {
        encryptMessage(message, keypair.publicKey);
      }, 100);
      
      console.log(`Encryption average: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(THRESHOLDS.encryption);
    });

    it('should decrypt message within threshold', () => {
      const encrypted = encryptMessage(message, keypair.publicKey);
      
      const avgTime = measureAverage(() => {
        decryptMessage(encrypted, keypair.privateKey);
      }, 100);
      
      console.log(`Decryption average: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(THRESHOLDS.decryption);
    });
  });

  describe('Bulk Encryption Performance', () => {
    const keypair = generateKeyPair();
    const largeMessage = new Uint8Array(1024 * 1024); // 1MB

    it('should encrypt 1MB within threshold', () => {
      const time = measure(() => {
        encryptMessage(largeMessage, keypair.publicKey);
      });
      
      console.log(`Encrypt 1MB: ${time.toFixed(2)}ms`);
      expect(time).toBeLessThan(THRESHOLDS.bulkEncryption);
    });

    it('should decrypt 1MB within threshold', () => {
      const encrypted = encryptMessage(largeMessage, keypair.publicKey);
      
      const time = measure(() => {
        decryptMessage(encrypted, keypair.privateKey);
      });
      
      console.log(`Decrypt 1MB: ${time.toFixed(2)}ms`);
      expect(time).toBeLessThan(THRESHOLDS.bulkDecryption);
    });

    it('should maintain performance for multiple large encryptions', () => {
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const time = measure(() => {
          encryptMessage(largeMessage, keypair.publicKey);
        });
        times.push(time);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Avg bulk encrypt: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      expect(maxTime).toBeLessThan(THRESHOLDS.bulkEncryption * 1.5);
    });
  });

  describe('Key Exchange Performance', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    it('should derive shared secret within threshold', () => {
      const avgTime = measureAverage(() => {
        deriveSharedSecret(kp1.privateKey, kp2.publicKey);
      }, 100);
      
      console.log(`Key exchange average: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(THRESHOLDS.keyExchange);
    });

    it('should handle 1000 key exchanges/sec', () => {
      const totalTime = measure(() => {
        for (let i = 0; i < 1000; i++) {
          deriveSharedSecret(kp1.privateKey, kp2.publicKey);
        }
      });
      
      console.log(`1000 key exchanges: ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(1000 * THRESHOLDS.keyExchange);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical messaging workload', () => {
      const aliceKp = generateKeyPair();
      const bobKp = generateKeyPair();
      const messages = Array(100).fill(null).map((_, i) => 
        new Uint8Array(512).fill(i % 256)
      );

      const totalTime = measure(() => {
        const aliceShared = deriveSharedSecret(aliceKp.privateKey, bobKp.publicKey);
        
        messages.forEach(msg => {
          const signature = signMessage(msg, aliceKp.privateKey);
          const encrypted = encryptMessage(msg, bobKp.publicKey);
          
          verifySignature(msg, signature, aliceKp.publicKey);
          decryptMessage(encrypted, bobKp.privateKey);
        });
      });
      
      console.log(`100 message workflow: ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 100 messages
    });

    it('should handle peer handshake efficiently', () => {
      const totalTime = measure(() => {
        // Simulate 10 peer handshakes
        for (let i = 0; i < 10; i++) {
          const peer1 = generateKeyPair();
          const peer2 = generateKeyPair();
          
          // Exchange keys
          const shared1 = deriveSharedSecret(peer1.privateKey, peer2.publicKey);
          const shared2 = deriveSharedSecret(peer2.privateKey, peer1.publicKey);
          
          // Challenge-response
          const challenge = new Uint8Array(32);
          const sig1 = signMessage(challenge, peer1.privateKey);
          const sig2 = signMessage(challenge, peer2.privateKey);
          
          verifySignature(challenge, sig1, peer1.publicKey);
          verifySignature(challenge, sig2, peer2.publicKey);
        }
      });
      
      console.log(`10 peer handshakes: ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(500);
    });
  });

  describe('Memory Performance', () => {
    it('should not leak memory during repeated operations', () => {
      if (global.gc) {
        global.gc();
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Perform many operations
        for (let i = 0; i < 1000; i++) {
          const kp = generateKeyPair();
          const msg = new Uint8Array(1024);
          const sig = signMessage(msg, kp.privateKey);
          verifySignature(msg, sig, kp.publicKey);
        }
        
        global.gc();
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
        
        console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);
        expect(memoryIncrease).toBeLessThan(50); // Less than 50MB increase
      } else {
        console.log('Run with --expose-gc to test memory');
      }
    });
  });
});
