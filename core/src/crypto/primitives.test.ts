import {
  generateIdentity,
  signMessage,
  verifySignature,
  encryptMessage,
  decryptMessage,
  generateSessionKey,
  generateFingerprint,
  rotateSessionKey,
} from '../crypto/primitives';

describe('Cryptographic Primitives', () => {
  describe('Identity Generation', () => {
    it('should generate a valid keypair', () => {
      const identity = generateIdentity();
      expect(identity.publicKey).toHaveLength(32);
      expect(identity.privateKey).toHaveLength(32);
    });

    it('should generate different keypairs each time', () => {
      const id1 = generateIdentity();
      const id2 = generateIdentity();
      expect(id1.publicKey).not.toEqual(id2.publicKey);
      expect(id1.privateKey).not.toEqual(id2.privateKey);
    });
  });

  describe('Message Signing', () => {
    it('should sign and verify messages correctly', () => {
      const identity = generateIdentity();
      const message = new TextEncoder().encode('Hello, World!');
      
      const signature = signMessage(message, identity.privateKey);
      const isValid = verifySignature(message, signature, identity.publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const identity = generateIdentity();
      const message = new TextEncoder().encode('Hello, World!');
      const tamperedMessage = new TextEncoder().encode('Hello, World?');
      
      const signature = signMessage(message, identity.privateKey);
      const isValid = verifySignature(tamperedMessage, signature, identity.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should reject signatures from wrong key', () => {
      const identity1 = generateIdentity();
      const identity2 = generateIdentity();
      const message = new TextEncoder().encode('Hello, World!');
      
      const signature = signMessage(message, identity1.privateKey);
      const isValid = verifySignature(message, signature, identity2.publicKey);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Message Encryption', () => {
    it('should encrypt and decrypt messages correctly', () => {
      const sessionKey = generateSessionKey();
      const plaintext = new TextEncoder().encode('Secret message');
      
      const ciphertext = encryptMessage(plaintext, sessionKey.key, sessionKey.nonce);
      const decrypted = decryptMessage(ciphertext, sessionKey.key, sessionKey.nonce);
      
      expect(decrypted).toEqual(plaintext);
    });

    it('should fail with wrong key', () => {
      const sessionKey1 = generateSessionKey();
      const sessionKey2 = generateSessionKey();
      const plaintext = new TextEncoder().encode('Secret message');
      
      const ciphertext = encryptMessage(plaintext, sessionKey1.key, sessionKey1.nonce);
      
      expect(() => {
        decryptMessage(ciphertext, sessionKey2.key, sessionKey1.nonce);
      }).toThrow();
    });

    it('should fail with wrong nonce', () => {
      const sessionKey1 = generateSessionKey();
      const sessionKey2 = generateSessionKey();
      const plaintext = new TextEncoder().encode('Secret message');
      
      const ciphertext = encryptMessage(plaintext, sessionKey1.key, sessionKey1.nonce);
      
      expect(() => {
        decryptMessage(ciphertext, sessionKey1.key, sessionKey2.nonce);
      }).toThrow();
    });
  });

  describe('Session Key Management', () => {
    it('should generate valid session keys', () => {
      const sessionKey = generateSessionKey();
      expect(sessionKey.key).toHaveLength(32);
      expect(sessionKey.nonce).toHaveLength(24);
      expect(sessionKey.timestamp).toBeGreaterThan(0);
    });

    it('should rotate session keys', () => {
      const sessionKey1 = generateSessionKey();
      const sessionKey2 = rotateSessionKey(sessionKey1);
      
      expect(sessionKey2.key).not.toEqual(sessionKey1.key);
      expect(sessionKey2.nonce).not.toEqual(sessionKey1.nonce);
      expect(sessionKey2.timestamp).toBeGreaterThan(sessionKey1.timestamp);
    });
  });

  describe('Key Fingerprints', () => {
    it('should generate consistent fingerprints', () => {
      const identity = generateIdentity();
      const fp1 = generateFingerprint(identity.publicKey);
      const fp2 = generateFingerprint(identity.publicKey);
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different keys', () => {
      const id1 = generateIdentity();
      const id2 = generateIdentity();
      const fp1 = generateFingerprint(id1.publicKey);
      const fp2 = generateFingerprint(id2.publicKey);
      expect(fp1).not.toBe(fp2);
    });

    it('should format fingerprint with spaces', () => {
      const identity = generateIdentity();
      const fingerprint = generateFingerprint(identity.publicKey);
      expect(fingerprint).toMatch(/^[0-9a-f ]+$/);
      expect(fingerprint).toContain(' ');
    });
  });
});
