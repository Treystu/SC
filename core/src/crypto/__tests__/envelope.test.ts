/**
 * Tests for envelope encryption utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  encryptEnvelope,
  decryptEnvelope,
  signEnvelope,
  verifyEnvelope,
} from '../envelope.js';
import { randomBytes } from '../primitives.js';
import { x25519, ed25519 } from '@noble/curves/ed25519.js';

describe('Envelope Encryption', () => {
  // Generate test keypairs
  // Sender uses Ed25519 for signing
  const senderPrivateKey = randomBytes(32);
  const senderEd25519PublicKey = ed25519.getPublicKey(senderPrivateKey);

  // Recipient uses X25519 for encryption
  const recipientPrivateKey = randomBytes(32);
  const recipientPublicKey = x25519.getPublicKey(recipientPrivateKey);

  const testData = new TextEncoder().encode('Hello, World!');

  describe('encryptEnvelope', () => {
    it('should encrypt data into an envelope', () => {
      const envelope = encryptEnvelope(testData, senderPrivateKey, recipientPublicKey);

      expect(envelope).toBeDefined();
      expect(envelope.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
      expect(envelope.ephemeralPublicKey.length).toBe(32);
      expect(envelope.nonce).toBeInstanceOf(Uint8Array);
      expect(envelope.nonce.length).toBe(24);
      expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
      expect(envelope.signature).toBeInstanceOf(Uint8Array);
      expect(envelope.version).toBe(1);
      expect(typeof envelope.timestamp).toBe('number');
    });

    it('should produce different ciphertexts for same data', () => {
      const envelope1 = encryptEnvelope(testData, senderPrivateKey, recipientPublicKey);
      const envelope2 = encryptEnvelope(testData, senderPrivateKey, recipientPublicKey);

      // Ephemeral keys should be different
      expect(Buffer.from(envelope1.ephemeralPublicKey).toString('hex'))
        .not.toBe(Buffer.from(envelope2.ephemeralPublicKey).toString('hex'));

      // Ciphertexts should be different
      expect(Buffer.from(envelope1.ciphertext).toString('hex'))
        .not.toBe(Buffer.from(envelope2.ciphertext).toString('hex'));
    });

    it('should reject invalid key sizes', () => {
      expect(() => encryptEnvelope(testData, new Uint8Array(16), recipientPublicKey))
        .toThrow('Sender private key must be 32 bytes');

      expect(() => encryptEnvelope(testData, senderPrivateKey, new Uint8Array(16)))
        .toThrow('Recipient public key must be 32 bytes');
    });
  });

  describe('decryptEnvelope', () => {
    it('should decrypt an envelope back to original data', () => {
      const envelope = encryptEnvelope(testData, senderPrivateKey, recipientPublicKey);
      const decrypted = decryptEnvelope(envelope, recipientPrivateKey, senderEd25519PublicKey);

      expect(Buffer.from(decrypted).toString()).toBe('Hello, World!');
    });

    it('should fail with wrong recipient key', () => {
      const envelope = encryptEnvelope(testData, senderPrivateKey, recipientPublicKey);
      const wrongKey = randomBytes(32);

      expect(() => decryptEnvelope(envelope, wrongKey, senderEd25519PublicKey)).toThrow();
    });
  });

  describe('signEnvelope', () => {
    it('should sign data with Ed25519', () => {
      const signed = signEnvelope(testData, senderPrivateKey);

      expect(signed.data).toEqual(testData);
      expect(signed.signature).toBeInstanceOf(Uint8Array);
      expect(signed.signature.length).toBe(64);
      expect(signed.senderPublicKey).toBeInstanceOf(Uint8Array);
      expect(signed.senderPublicKey.length).toBe(32);
      expect(typeof signed.timestamp).toBe('number');
    });
  });

  describe('verifyEnvelope', () => {
    it('should verify valid signature', () => {
      const signed = signEnvelope(testData, senderPrivateKey);
      const isValid = verifyEnvelope(signed);

      expect(isValid).toBe(true);
    });

    it('should reject tampered data', () => {
      const signed = signEnvelope(testData, senderPrivateKey);

      // Tamper with data
      signed.data = new TextEncoder().encode('Tampered!');

      const isValid = verifyEnvelope(signed);
      expect(isValid).toBe(false);
    });

    it('should reject invalid signature', () => {
      const signed = signEnvelope(testData, senderPrivateKey);

      // Tamper with signature
      signed.signature = randomBytes(64);

      const isValid = verifyEnvelope(signed);
      expect(isValid).toBe(false);
    });
  });
});
