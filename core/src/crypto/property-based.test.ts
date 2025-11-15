/**
 * Property-Based Testing for Cryptography
 * 
 * Uses fast-check to verify cryptographic properties hold for all inputs
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { 
  generateKeyPair, 
  signMessage, 
  verifySignature,
  encryptMessage,
  decryptMessage,
  deriveSharedSecret
} from './primitives';

describe('Crypto Property-Based Tests', () => {
  describe('Key Generation Properties', () => {
    it('should always generate 32-byte public keys', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const keypair = generateKeyPair();
          expect(keypair.publicKey.length).toBe(32);
        }),
        { numRuns: 100 }
      );
    });

    it('should always generate 32-byte private keys', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const keypair = generateKeyPair();
          expect(keypair.privateKey.length).toBe(32);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate unique keypairs', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const kp1 = generateKeyPair();
          const kp2 = generateKeyPair();
          expect(kp1.publicKey).not.toEqual(kp2.publicKey);
          expect(kp1.privateKey).not.toEqual(kp2.privateKey);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Signature Properties', () => {
    it('should verify any signed message (correctness)', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 1024 }), (message) => {
          const keypair = generateKeyPair();
          const signature = signMessage(message, keypair.privateKey);
          const isValid = verifySignature(message, signature, keypair.publicKey);
          expect(isValid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject signatures with wrong public key', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 1024 }), (message) => {
          const kp1 = generateKeyPair();
          const kp2 = generateKeyPair();
          const signature = signMessage(message, kp1.privateKey);
          const isValid = verifySignature(message, signature, kp2.publicKey);
          expect(isValid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject modified messages', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 2, maxLength: 1024 }),
          fc.nat(),
          (message, flipBit) => {
            const keypair = generateKeyPair();
            const signature = signMessage(message, keypair.privateKey);
            
            // Modify one bit in the message
            const modified = new Uint8Array(message);
            const byteIndex = flipBit % modified.length;
            modified[byteIndex] ^= 1;
            
            const isValid = verifySignature(modified, signature, keypair.publicKey);
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce 64-byte signatures', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 1024 }), (message) => {
          const keypair = generateKeyPair();
          const signature = signMessage(message, keypair.privateKey);
          expect(signature.length).toBe(64);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Encryption Properties', () => {
    it('should decrypt any encrypted message (correctness)', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 1024 }), (plaintext) => {
          const keypair = generateKeyPair();
          const encrypted = encryptMessage(plaintext, keypair.publicKey);
          const decrypted = decryptMessage(encrypted, keypair.privateKey);
          expect(decrypted).toEqual(plaintext);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce different ciphertexts for same message (probabilistic)', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), (message) => {
          const keypair = generateKeyPair();
          const ct1 = encryptMessage(message, keypair.publicKey);
          const ct2 = encryptMessage(message, keypair.publicKey);
          // Ciphertexts should differ due to random nonce
          expect(ct1).not.toEqual(ct2);
        }),
        { numRuns: 50 }
      );
    });

    it('should fail decryption with wrong private key', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), (message) => {
          const kp1 = generateKeyPair();
          const kp2 = generateKeyPair();
          const encrypted = encryptMessage(message, kp1.publicKey);
          
          expect(() => {
            decryptMessage(encrypted, kp2.privateKey);
          }).toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('should handle empty messages', () => {
      fc.assert(
        fc.property(fc.constant(new Uint8Array(0)), (emptyMessage) => {
          const keypair = generateKeyPair();
          const encrypted = encryptMessage(emptyMessage, keypair.publicKey);
          const decrypted = decryptMessage(encrypted, keypair.privateKey);
          expect(decrypted).toEqual(emptyMessage);
        }),
        { numRuns: 10 }
      );
    });

    it('should handle maximum size messages', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 10000, maxLength: 10000 }), (largeMessage) => {
          const keypair = generateKeyPair();
          const encrypted = encryptMessage(largeMessage, keypair.publicKey);
          const decrypted = decryptMessage(encrypted, keypair.privateKey);
          expect(decrypted).toEqual(largeMessage);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('Key Exchange Properties', () => {
    it('should produce same shared secret for both parties (symmetry)', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const aliceKp = generateKeyPair();
          const bobKp = generateKeyPair();
          
          const aliceShared = deriveSharedSecret(aliceKp.privateKey, bobKp.publicKey);
          const bobShared = deriveSharedSecret(bobKp.privateKey, aliceKp.publicKey);
          
          expect(aliceShared).toEqual(bobShared);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce 32-byte shared secrets', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const kp1 = generateKeyPair();
          const kp2 = generateKeyPair();
          const shared = deriveSharedSecret(kp1.privateKey, kp2.publicKey);
          expect(shared.length).toBe(32);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce different secrets for different keypairs', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const kp1 = generateKeyPair();
          const kp2 = generateKeyPair();
          const kp3 = generateKeyPair();
          
          const secret12 = deriveSharedSecret(kp1.privateKey, kp2.publicKey);
          const secret13 = deriveSharedSecret(kp1.privateKey, kp3.publicKey);
          
          expect(secret12).not.toEqual(secret13);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Determinism Properties', () => {
    it('should produce same signature for same message and key', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), (message) => {
          const keypair = generateKeyPair();
          const sig1 = signMessage(message, keypair.privateKey);
          const sig2 = signMessage(message, keypair.privateKey);
          expect(sig1).toEqual(sig2);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce same shared secret for same keypairs', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const kp1 = generateKeyPair();
          const kp2 = generateKeyPair();
          
          const shared1 = deriveSharedSecret(kp1.privateKey, kp2.publicKey);
          const shared2 = deriveSharedSecret(kp1.privateKey, kp2.publicKey);
          
          expect(shared1).toEqual(shared2);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle all-zero messages', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1024 }), (length) => {
          const message = new Uint8Array(length);
          const keypair = generateKeyPair();
          
          const signature = signMessage(message, keypair.privateKey);
          expect(verifySignature(message, signature, keypair.publicKey)).toBe(true);
          
          const encrypted = encryptMessage(message, keypair.publicKey);
          const decrypted = decryptMessage(encrypted, keypair.privateKey);
          expect(decrypted).toEqual(message);
        }),
        { numRuns: 50 }
      );
    });

    it('should handle all-ones messages', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1024 }), (length) => {
          const message = new Uint8Array(length).fill(255);
          const keypair = generateKeyPair();
          
          const signature = signMessage(message, keypair.privateKey);
          expect(verifySignature(message, signature, keypair.publicKey)).toBe(true);
          
          const encrypted = encryptMessage(message, keypair.publicKey);
          const decrypted = decryptMessage(encrypted, keypair.privateKey);
          expect(decrypted).toEqual(message);
        }),
        { numRuns: 50 }
      );
    });

    it('should handle random binary data', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 2048 }), (randomData) => {
          const keypair = generateKeyPair();
          
          const signature = signMessage(randomData, keypair.privateKey);
          expect(verifySignature(randomData, signature, keypair.publicKey)).toBe(true);
          
          const encrypted = encryptMessage(randomData, keypair.publicKey);
          const decrypted = decryptMessage(encrypted, keypair.privateKey);
          expect(decrypted).toEqual(randomData);
        }),
        { numRuns: 50 }
      );
    });
  });
});
