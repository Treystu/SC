/**
 * Property-based tests for crypto primitives
 */
import fc from 'fast-check';
import {
  generateIdentity,
  signMessage,
  verifySignature,
  performKeyExchange,
  encryptMessage,
  decryptMessage,
} from './primitives';
import { randomBytes } from '@noble/hashes/utils.js';

describe.skip('Crypto Property-Based Tests', () => {
  describe('Identity generation', () => {
    it('should generate unique identities', async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat(10), async () => {
          const identity1 = await generateIdentity();
          const identity2 = await generateIdentity();
          
          // Public keys should be different
          expect(Buffer.from(identity1.publicKey).equals(Buffer.from(identity2.publicKey))).toBe(false);
          // Private keys should be different
          expect(Buffer.from(identity1.privateKey).equals(Buffer.from(identity2.privateKey))).toBe(false);
        }),
        { numRuns: 10 }
      );
    });

    it('should generate valid key pairs', async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat(10), async () => {
          const identity = await generateIdentity();
          
          // Keys should have correct length
          expect(identity.publicKey.length).toBe(32);
          expect(identity.privateKey.length).toBe(32);
          
          // Keys should not be all zeros
          const pubKeySum = identity.publicKey.reduce((a, b) => a + b, 0);
          const privKeySum = identity.privateKey.reduce((a, b) => a + b, 0);
          expect(pubKeySum).toBeGreaterThan(0);
          expect(privKeySum).toBeGreaterThan(0);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('Message signing', () => {
    it('should verify any message signed with the same key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (data) => {
            const identity = await generateIdentity();
            const signature = await signMessage(data, identity.privateKey);
            const isValid = await verifySignature(data, signature, identity.publicKey);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should fail verification with wrong public key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (data) => {
            const identity1 = await generateIdentity();
            const identity2 = await generateIdentity();
            
            const signature = await signMessage(data, identity1.privateKey);
            const isValid = await verifySignature(data, signature, identity2.publicKey);
            
            // Should fail with different public key
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should fail verification with tampered data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 2, maxLength: 1000 }),
          async (data) => {
            const identity = await generateIdentity();
            const signature = await signMessage(data, identity.privateKey);
            
            // Tamper with data
            const tamperedData = new Uint8Array(data);
            tamperedData[0] = (tamperedData[0] + 1) % 256;
            
            const isValid = await verifySignature(tamperedData, signature, identity.publicKey);
            
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Encryption/Decryption', () => {
    it('should decrypt any message encrypted with the same key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (plaintext) => {
            const sender = await generateIdentity();
            const receiver = await generateIdentity();
            
            // Derive shared secret
            const senderSecret = await performKeyExchange(sender.privateKey, receiver.publicKey);
            const receiverSecret = await performKeyExchange(receiver.privateKey, sender.publicKey);
            
            // Secrets should match
            expect(Buffer.from(senderSecret).equals(Buffer.from(receiverSecret))).toBe(true);
            
            // Encrypt and decrypt
            const nonce = randomBytes(24);
            const encrypted = await encryptMessage(plaintext, senderSecret, nonce);
            const decrypted = await decryptMessage(encrypted, receiverSecret, nonce);
            
            expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should fail decryption with wrong key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (plaintext) => {
            const sender = await generateIdentity();
            const receiver = await generateIdentity();
            const attacker = await generateIdentity();
            
            const senderSecret = await performKeyExchange(sender.privateKey, receiver.publicKey);
            const attackerSecret = await performKeyExchange(attacker.privateKey, sender.publicKey);
            
            const nonce = randomBytes(24);
            const encrypted = await encryptMessage(plaintext, senderSecret, nonce);
            
            // Should fail to decrypt with attacker's key
            await expect(
              decryptMessage(encrypted, attackerSecret, nonce)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Key exchange properties', () => {
    it('should produce symmetric shared secrets (commutative)', async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat(10), async () => {
          const alice = await generateIdentity();
          const bob = await generateIdentity();
          
          const aliceShared = await performKeyExchange(alice.privateKey, bob.publicKey);
          const bobShared = await performKeyExchange(bob.privateKey, alice.publicKey);
          
          expect(Buffer.from(aliceShared).equals(Buffer.from(bobShared))).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('should produce different secrets for different key pairs', async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat(10), async () => {
          const alice = await generateIdentity();
          const bob = await generateIdentity();
          const charlie = await generateIdentity();
          
          const aliceBobSecret = await performKeyExchange(alice.privateKey, bob.publicKey);
          const aliceCharlieSecret = await performKeyExchange(alice.privateKey, charlie.publicKey);
          
          expect(Buffer.from(aliceBobSecret).equals(Buffer.from(aliceCharlieSecret))).toBe(false);
        }),
        { numRuns: 20 }
      );
    });
  });
});
