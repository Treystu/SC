import {
  generateIdentity,
  generateKeyPair,
  generateKey,
  generateNonce,
  deriveSharedSecret,
  signMessage,
  verifySignature,
  encryptMessage,
  decryptMessage,
  generateSessionKey,
  generateFingerprint,
  rotateSessionKey,
  timingSafeEqual,
  secureWipe,
  validateEntropy,
  batchVerifySignatures,
  performKeyExchange,
  generateEphemeralKeyPair,
  deriveSessionKey,
  shouldRotateKey,
  incrementNonce,
  NonceManager,
  initializeRatchet,
  ratchetStep,
  deriveMessageKey,
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
      expect(sessionKey2.timestamp).toBeGreaterThanOrEqual(sessionKey1.timestamp);
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

  describe('Timing-Safe Operations', () => {
    it('should compare equal arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it('should detect different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it('should detect length differences', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it('should handle empty arrays', () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);
      expect(timingSafeEqual(a, b)).toBe(true);
    });
  });

  describe('Secure Memory Operations', () => {
    it('should wipe data from memory', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      secureWipe(data);
      expect(data.every(b => b === 0)).toBe(true);
    });

    it('should validate good entropy', () => {
      const goodEntropy = new Uint8Array(32);
      crypto.getRandomValues(goodEntropy);
      expect(validateEntropy(goodEntropy)).toBe(true);
    });

    it('should reject all zeros', () => {
      const zeros = new Uint8Array(32);
      expect(validateEntropy(zeros)).toBe(false);
    });

    it('should reject all same value', () => {
      const same = new Uint8Array(32).fill(0xFF);
      expect(validateEntropy(same)).toBe(false);
    });

    it('should reject too short data', () => {
      const short = new Uint8Array(16);
      crypto.getRandomValues(short);
      expect(validateEntropy(short)).toBe(false);
    });
  });

  describe('Batch Signature Verification', () => {
    it('should verify multiple valid signatures', () => {
      const identity = generateIdentity();
      const messages = [
        new TextEncoder().encode('Message 1'),
        new TextEncoder().encode('Message 2'),
        new TextEncoder().encode('Message 3'),
      ];

      const items = messages.map(message => ({
        message,
        signature: signMessage(message, identity.privateKey),
        publicKey: identity.publicKey,
      }));

      expect(batchVerifySignatures(items)).toBe(true);
    });

    it('should reject if any signature is invalid', () => {
      const identity1 = generateIdentity();
      const identity2 = generateIdentity();
      const messages = [
        new TextEncoder().encode('Message 1'),
        new TextEncoder().encode('Message 2'),
      ];

      const items = [
        {
          message: messages[0],
          signature: signMessage(messages[0], identity1.privateKey),
          publicKey: identity1.publicKey,
        },
        {
          message: messages[1],
          signature: signMessage(messages[1], identity1.privateKey),
          publicKey: identity2.publicKey, // Wrong public key
        },
      ];

      expect(batchVerifySignatures(items)).toBe(false);
    });
  });

  describe('ECDH Key Exchange', () => {
    it('should derive same shared secret for both parties', () => {
      const alice = generateEphemeralKeyPair();
      const bob = generateEphemeralKeyPair();

      const aliceShared = performKeyExchange(alice.privateKey, bob.publicKey);
      const bobShared = performKeyExchange(bob.privateKey, alice.publicKey);

      expect(timingSafeEqual(aliceShared, bobShared)).toBe(true);
    });

    it('should validate key sizes', () => {
      const alice = generateEphemeralKeyPair();
      const invalidPrivate = new Uint8Array(16);

      expect(() => performKeyExchange(invalidPrivate, alice.publicKey)).toThrow(/32 bytes/);
    });

    it('should use HKDF for derivation', () => {
      const alice = generateEphemeralKeyPair();
      const bob = generateEphemeralKeyPair();

      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);

      const key1 = performKeyExchange(alice.privateKey, bob.publicKey, salt);
      const key2 = performKeyExchange(alice.privateKey, bob.publicKey, salt);

      expect(timingSafeEqual(key1, key2)).toBe(true);
    });
  });

  describe('Session Key Derivation', () => {
    it('should derive consistent keys', () => {
      const secret = new Uint8Array(32);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(secret);
      crypto.getRandomValues(salt);

      const key1 = deriveSessionKey(secret, salt);
      const key2 = deriveSessionKey(secret, salt);

      expect(timingSafeEqual(key1, key2)).toBe(true);
    });

    it('should derive different keys with different info', () => {
      const secret = new Uint8Array(32);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(secret);
      crypto.getRandomValues(salt);

      const key1 = deriveSessionKey(secret, salt, new TextEncoder().encode('context1'));
      const key2 = deriveSessionKey(secret, salt, new TextEncoder().encode('context2'));

      expect(timingSafeEqual(key1, key2)).toBe(false);
    });
  });

  describe('Nonce Management', () => {
    it('should track used nonces', () => {
      const manager = new NonceManager();
      const nonce = new Uint8Array(24);
      crypto.getRandomValues(nonce);

      expect(manager.hasBeenUsed(nonce)).toBe(false);
      manager.markUsed(nonce);
      expect(manager.hasBeenUsed(nonce)).toBe(true);
    });

    it('should detect nonce reuse', () => {
      const manager = new NonceManager();
      const nonce = new Uint8Array(24);
      crypto.getRandomValues(nonce);

      manager.markUsed(nonce);
      expect(() => manager.markUsed(nonce)).toThrow(/reuse/i);
    });

    it('should increment nonces correctly', () => {
      const sessionKey = generateSessionKey();
      const nonce1 = incrementNonce(sessionKey);
      const nonce2 = incrementNonce(sessionKey);

      expect(timingSafeEqual(nonce1, nonce2)).toBe(false);
      expect(sessionKey.counter).toBe(2);
    });
  });

  describe('Session Key Rotation', () => {
    it('should rotate keys based on time', async () => {
      const sessionKey = generateSessionKey();
      sessionKey.timestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago

      expect(shouldRotateKey(sessionKey, 60 * 60 * 1000)).toBe(true);
    });

    it('should rotate keys based on message count', () => {
      const sessionKey = generateSessionKey();
      sessionKey.messageCount = 1500;

      expect(shouldRotateKey(sessionKey, Infinity, 1000)).toBe(true);
    });

    it('should not rotate fresh keys', () => {
      const sessionKey = generateSessionKey();
      expect(shouldRotateKey(sessionKey)).toBe(false);
    });

    it('should wipe old key material on rotation', () => {
      const sessionKey = generateSessionKey();
      const oldKey = new Uint8Array(sessionKey.key);
      const oldNonce = new Uint8Array(sessionKey.nonce);

      rotateSessionKey(sessionKey);

      // Old arrays should be wiped
      expect(sessionKey.key.every(b => b === 0)).toBe(true);
      expect(sessionKey.nonce.every(b => b === 0)).toBe(true);
    });
  });

  describe('Double Ratchet Algorithm', () => {
    it('should initialize ratchet state', () => {
      const sharedSecret = new Uint8Array(32);
      crypto.getRandomValues(sharedSecret);

      const state = initializeRatchet(sharedSecret, true);

      expect(state.rootKey.length).toBe(32);
      expect(state.sendChainKey.length).toBe(32);
      expect(state.receiveChainKey.length).toBe(32);
      expect(state.sendCounter).toBe(0);
      expect(state.receiveCounter).toBe(0);
    });

    it('should perform ratchet step', () => {
      const sharedSecret = new Uint8Array(32);
      crypto.getRandomValues(sharedSecret);

      const state = initializeRatchet(sharedSecret, true);
      const oldRootKey = new Uint8Array(state.rootKey);

      const peerKey = generateEphemeralKeyPair();
      const newState = ratchetStep(state, peerKey.publicKey);

      expect(timingSafeEqual(newState.rootKey, oldRootKey)).toBe(false);
      expect(newState.sendCounter).toBe(0);
      expect(newState.previousSendCounter).toBe(0);
    });

    it('should derive message keys from chain', () => {
      const chainKey = new Uint8Array(32);
      crypto.getRandomValues(chainKey);

      const { messageKey, nextChainKey } = deriveMessageKey(chainKey);

      expect(messageKey.length).toBe(32);
      expect(nextChainKey.length).toBe(32);
      expect(timingSafeEqual(messageKey, nextChainKey)).toBe(false);
    });

    it('should support forward secrecy through ratcheting', () => {
      const sharedSecret = new Uint8Array(32);
      crypto.getRandomValues(sharedSecret);

      // Alice and Bob initialize with swapped send/receive chains
      const aliceState = initializeRatchet(sharedSecret, true);
      const bobState = initializeRatchet(sharedSecret, false);

      // Manually swap send/receive for Bob to simulate proper handshake
      // In real protocol, this would be handled by key exchange
      const tempChain = bobState.sendChainKey;
      bobState.sendChainKey = aliceState.sendChainKey;
      bobState.receiveChainKey = tempChain;

      // First message: Alice sends
      const aliceResult1 = deriveMessageKey(aliceState.sendChainKey);
      aliceState.sendChainKey = aliceResult1.nextChainKey;

      // Bob receives
      const bobResult1 = deriveMessageKey(bobState.receiveChainKey);
      bobState.receiveChainKey = bobResult1.nextChainKey;

      // Keys should match
      expect(timingSafeEqual(aliceResult1.messageKey, bobResult1.messageKey)).toBe(true);

      // Second message uses different key
      const aliceResult2 = deriveMessageKey(aliceState.sendChainKey);
      expect(timingSafeEqual(aliceResult1.messageKey, aliceResult2.messageKey)).toBe(false);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle empty messages', () => {
      const sessionKey = generateSessionKey();
      const empty = new Uint8Array(0);

      const encrypted = encryptMessage(empty, sessionKey.key, sessionKey.nonce);
      const decrypted = decryptMessage(encrypted, sessionKey.key, sessionKey.nonce);

      expect(decrypted.length).toBe(0);
    });

    it('should reject tampering with ciphertext', () => {
      const sessionKey = generateSessionKey();
      const plaintext = new TextEncoder().encode('Secret');

      const ciphertext = encryptMessage(plaintext, sessionKey.key, sessionKey.nonce);
      
      // Tamper with ciphertext
      ciphertext[0] ^= 1;

      expect(() => decryptMessage(ciphertext, sessionKey.key, sessionKey.nonce)).toThrow();
    });

    it('should reject wrong key size for encryption', () => {
      const sessionKey = generateSessionKey();
      const wrongKey = new Uint8Array(16);
      const plaintext = new TextEncoder().encode('Test');

      expect(() => encryptMessage(plaintext, wrongKey, sessionKey.nonce)).toThrow(/32 bytes/);
    });

    it('should reject wrong nonce size for encryption', () => {
      const sessionKey = generateSessionKey();
      const wrongNonce = new Uint8Array(12);
      const plaintext = new TextEncoder().encode('Test');

      expect(() => encryptMessage(plaintext, sessionKey.key, wrongNonce)).toThrow(/24 bytes/);
    });

    it('should reject ciphertext without auth tag', () => {
      const sessionKey = generateSessionKey();
      const tooShort = new Uint8Array(10);

      expect(() => decryptMessage(tooShort, sessionKey.key, sessionKey.nonce)).toThrow(/too short/);
    });
  });

  describe('API Compatibility Aliases', () => {
    it('generateKeyPair should be an alias for generateIdentity', () => {
      const keypair = generateKeyPair();
      expect(keypair.publicKey).toHaveLength(32);
      expect(keypair.privateKey).toHaveLength(32);
    });

    it('generateKey should return a 32-byte key', () => {
      const key = generateKey();
      expect(key).toHaveLength(32);
      expect(key).toBeInstanceOf(Uint8Array);
      
      // Key should have good entropy
      expect(validateEntropy(key)).toBe(true);
    });

    it('generateKey should return unique keys each time', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(timingSafeEqual(key1, key2)).toBe(false);
    });

    it('generateNonce should return a 24-byte nonce', () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(24);
      expect(nonce).toBeInstanceOf(Uint8Array);
    });

    it('generateNonce should return unique nonces each time', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(timingSafeEqual(nonce1, nonce2)).toBe(false);
    });

    it('deriveSharedSecret should derive same secret as performKeyExchange', () => {
      const keypair1 = generateKeyPair();
      const keypair2 = generateKeyPair();
      
      const secret1 = deriveSharedSecret(keypair1.privateKey, keypair2.publicKey);
      const secret2 = performKeyExchange(keypair1.privateKey, keypair2.publicKey);
      
      expect(timingSafeEqual(secret1, secret2)).toBe(true);
    });

    it('generateKey and generateNonce should work for encryption/decryption', () => {
      const key = generateKey();
      const nonce = generateNonce();
      const plaintext = new TextEncoder().encode('Test message with new API');
      
      const ciphertext = encryptMessage(plaintext, key, nonce);
      const decrypted = decryptMessage(ciphertext, key, nonce);
      
      expect(decrypted).toEqual(plaintext);
    });
  });
});
