import {
  generateIdentity,
  signMessage,
  verifySignature,
  generateNonce,
  generateKey,
} from '../primitives';

describe('Signing', () => {
  describe('generateIdentity', () => {
    it('should generate a valid identity', () => {
      const identity = generateIdentity();
      
      expect(identity.publicKey).toHaveLength(32);
      expect(identity.privateKey).toHaveLength(32);
    });

    it('should generate unique identities', () => {
      const id1 = generateIdentity();
      const id2 = generateIdentity();
      
      expect(id1.publicKey).not.toEqual(id2.publicKey);
      expect(id1.privateKey).not.toEqual(id2.privateKey);
    });
  });

  describe('signMessage and verifySignature', () => {
    it('should sign and verify a message', () => {
      const identity = generateIdentity();
      const message = new TextEncoder().encode('Hello, World!');
      
      const signature = signMessage(message, identity.privateKey);
      expect(signature).toHaveLength(64);
      
      const isValid = verifySignature(message, signature, identity.publicKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', () => {
      const identity1 = generateIdentity();
      const identity2 = generateIdentity();
      const message = new TextEncoder().encode('Hello, World!');
      
      const signature = signMessage(message, identity1.privateKey);
      const isValid = verifySignature(message, signature, identity2.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered message', () => {
      const identity = generateIdentity();
      const message = new TextEncoder().encode('Hello, World!');
      const signature = signMessage(message, identity.privateKey);
      
      const tamperedMessage = new TextEncoder().encode('Hello, World?');
      const isValid = verifySignature(tamperedMessage, signature, identity.publicKey);
      
      expect(isValid).toBe(false);
    });
  });

  describe('generateNonce', () => {
    it('should generate a 12-byte nonce', () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(12);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toEqual(nonce2);
    });
  });

  describe('generateKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateKey();
      expect(key).toHaveLength(32);
    });

    it('should generate unique keys', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1).not.toEqual(key2);
    });
  });
});
