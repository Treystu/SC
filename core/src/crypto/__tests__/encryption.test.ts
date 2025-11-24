import {
  encryptMessage,
  decryptMessage,
  createSessionKey,
  shouldRotateKey,
  rotateSessionKey,
} from '../encryption';
import { generateKey, generateNonce } from '../signing';

describe('Encryption', () => {
  describe('encryptMessage and decryptMessage', () => {
    it('should encrypt and decrypt a message', () => {
      const key = generateKey();
      const nonce = generateNonce();
      const plaintext = new TextEncoder().encode('Secret message');
      
      const ciphertext = encryptMessage(plaintext, key, nonce);
      expect(ciphertext.length).toBeGreaterThan(plaintext.length); // Includes auth tag
      
      const decrypted = decryptMessage(ciphertext, key, nonce);
      expect(decrypted).toEqual(plaintext);
    });

    it('should fail decryption with wrong key', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      const nonce = generateNonce();
      const plaintext = new TextEncoder().encode('Secret message');
      
      const ciphertext = encryptMessage(plaintext, key1, nonce);
      
      expect(() => {
        decryptMessage(ciphertext, key2, nonce);
      }).toThrow();
    });

    it('should fail decryption with wrong nonce', () => {
      const key = generateKey();
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      const plaintext = new TextEncoder().encode('Secret message');
      
      const ciphertext = encryptMessage(plaintext, key, nonce1);
      
      expect(() => {
        decryptMessage(ciphertext, key, nonce2);
      }).toThrow();
    });

    it('should support additional authenticated data', () => {
      const key = generateKey();
      const nonce = generateNonce();
      const plaintext = new TextEncoder().encode('Secret message');
      const aad = new TextEncoder().encode('metadata');
      
      const ciphertext = encryptMessage(plaintext, key, nonce, aad);
      const decrypted = decryptMessage(ciphertext, key, nonce, aad);
      
      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('createSessionKey', () => {
    it('should create a valid session key', () => {
      const sessionKey = createSessionKey();
      
      expect(sessionKey.keyId).toHaveLength(32);
      expect(sessionKey.key).toHaveLength(32);
      expect(sessionKey.nonce).toHaveLength(12);
      expect(sessionKey.createdAt).toBeLessThanOrEqual(Date.now());
      expect(sessionKey.expiresAt).toBeGreaterThan(sessionKey.createdAt);
    });
  });

  describe('shouldRotateKey', () => {
    it('should return false for fresh key', () => {
      const sessionKey = createSessionKey();
      expect(shouldRotateKey(sessionKey)).toBe(false);
    });

    it('should return true for expired key', () => {
      const sessionKey = createSessionKey();
      sessionKey.expiresAt = Date.now() - 1000;
      expect(shouldRotateKey(sessionKey)).toBe(true);
    });
  });

  describe('rotateSessionKey', () => {
    it('should create a new key with same keyId', () => {
      const oldKey = createSessionKey();
      const newKey = rotateSessionKey(oldKey);
      
      expect(newKey.keyId).toEqual(oldKey.keyId);
      expect(newKey.key).not.toEqual(oldKey.key);
      expect(newKey.nonce).not.toEqual(oldKey.nonce);
      expect(newKey.createdAt).toBeGreaterThanOrEqual(oldKey.createdAt);
    });
  });
});
