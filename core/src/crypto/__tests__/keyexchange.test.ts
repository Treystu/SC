import {
  generateECDHKeypair,
  computeSharedSecret,
  deriveSessionKey,
} from '../keyexchange';

describe('Key Exchange', () => {
  describe('generateECDHKeypair', () => {
    it('should generate a valid keypair', () => {
      const keypair = generateECDHKeypair();
      
      expect(keypair.privateKey).toHaveLength(32);
      expect(keypair.publicKey).toHaveLength(32);
    });

    it('should generate unique keypairs', () => {
      const kp1 = generateECDHKeypair();
      const kp2 = generateECDHKeypair();
      
      expect(kp1.privateKey).not.toEqual(kp2.privateKey);
      expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    });
  });

  describe('computeSharedSecret', () => {
    it('should compute same shared secret for both parties', () => {
      const alice = generateECDHKeypair();
      const bob = generateECDHKeypair();
      
      const aliceSecret = computeSharedSecret(alice.privateKey, bob.publicKey);
      const bobSecret = computeSharedSecret(bob.privateKey, alice.publicKey);
      
      expect(aliceSecret).toEqual(bobSecret);
      expect(aliceSecret).toHaveLength(32);
    });
  });

  describe('deriveSessionKey', () => {
    it('should derive a 32-byte session key', () => {
      const sharedSecret = new Uint8Array(32);
      const salt = new Uint8Array(32);
      
      const sessionKey = deriveSessionKey(sharedSecret, salt);
      expect(sessionKey).toHaveLength(32);
    });

    it('should derive different keys with different salts', () => {
      const sharedSecret = new Uint8Array(32).fill(1);
      const salt1 = new Uint8Array(32).fill(2);
      const salt2 = new Uint8Array(32).fill(3);
      
      const key1 = deriveSessionKey(sharedSecret, salt1);
      const key2 = deriveSessionKey(sharedSecret, salt2);
      
      expect(key1).not.toEqual(key2);
    });
  });
});
