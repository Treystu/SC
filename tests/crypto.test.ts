import { describe, it, expect } from '@jest/globals';
import { CryptoManager } from '../core/src/crypto';
import { KeyManager } from '../core/src/key-manager';

describe('CryptoManager', () => {
  it('should generate valid Ed25519 keypair', async () => {
    const keyManager = new KeyManager();
    await keyManager.generateIdentityKeyPair();
    
    const publicKey = await keyManager.getPublicKey();
    const privateKey = await keyManager.getPrivateKey();
    
    expect(publicKey).toBeDefined();
    expect(privateKey).toBeDefined();
    expect(publicKey.length).toBe(32);
    expect(privateKey.length).toBe(32);
  });

  it('should encrypt and decrypt message successfully', async () => {
    const crypto = new CryptoManager();
    const message = 'Test message for encryption';
    const key = crypto.generateKey();
    
    const encrypted = await crypto.encrypt(message, key);
    const decrypted = await crypto.decrypt(encrypted, key);
    
    expect(decrypted).toBe(message);
  });

  it('should fail to decrypt with wrong key', async () => {
    const crypto = new CryptoManager();
    const message = 'Test message';
    const key1 = crypto.generateKey();
    const key2 = crypto.generateKey();
    
    const encrypted = await crypto.encrypt(message, key1);
    
    await expect(crypto.decrypt(encrypted, key2)).rejects.toThrow();
  });

  it('should sign and verify message correctly', async () => {
    const keyManager = new KeyManager();
    await keyManager.generateIdentityKeyPair();
    
    const crypto = new CryptoManager();
    const message = 'Message to sign';
    
    const signature = await crypto.sign(message, await keyManager.getPrivateKey());
    const isValid = await crypto.verify(message, signature, await keyManager.getPublicKey());
    
    expect(isValid).toBe(true);
  });

  it('should fail verification with wrong public key', async () => {
    const keyManager1 = new KeyManager();
    const keyManager2 = new KeyManager();
    await keyManager1.generateIdentityKeyPair();
    await keyManager2.generateIdentityKeyPair();
    
    const crypto = new CryptoManager();
    const message = 'Message to sign';
    
    const signature = await crypto.sign(message, await keyManager1.getPrivateKey());
    const isValid = await crypto.verify(message, signature, await keyManager2.getPublicKey());
    
    expect(isValid).toBe(false);
  });

  it('should perform ECDH key exchange', async () => {
    const keyManager1 = new KeyManager();
    const keyManager2 = new KeyManager();
    await keyManager1.generateIdentityKeyPair();
    await keyManager2.generateIdentityKeyPair();
    
    const crypto = new CryptoManager();
    
    const sharedSecret1 = await crypto.deriveSharedSecret(
      await keyManager1.getPrivateKey(),
      await keyManager2.getPublicKey()
    );
    
    const sharedSecret2 = await crypto.deriveSharedSecret(
      await keyManager2.getPrivateKey(),
      await keyManager1.getPublicKey()
    );
    
    expect(sharedSecret1).toEqual(sharedSecret2);
  });

  it('should handle large messages', async () => {
    const crypto = new CryptoManager();
    const largeMessage = 'A'.repeat(10000);
    const key = crypto.generateKey();
    
    const encrypted = await crypto.encrypt(largeMessage, key);
    const decrypted = await crypto.decrypt(encrypted, key);
    
    expect(decrypted).toBe(largeMessage);
  });

  it('should handle empty messages', async () => {
    const crypto = new CryptoManager();
    const emptyMessage = '';
    const key = crypto.generateKey();
    
    const encrypted = await crypto.encrypt(emptyMessage, key);
    const decrypted = await crypto.decrypt(encrypted, key);
    
    expect(decrypted).toBe(emptyMessage);
  });

  it('should perform end-to-end secure message exchange', async () => {
    // Alice and Bob generate their keypairs
    const alice = new KeyManager();
    const bob = new KeyManager();
    await alice.generateIdentityKeyPair();
    await bob.generateIdentityKeyPair();
    
    const crypto = new CryptoManager();
    
    // Alice derives shared secret with Bob's public key
    const aliceShared = await crypto.deriveSharedSecret(
      await alice.getPrivateKey(),
      await bob.getPublicKey()
    );
    
    // Alice encrypts message
    const message = 'Secret message from Alice to Bob';
    const encrypted = await crypto.encrypt(message, aliceShared);
    
    // Alice signs the encrypted message
    const signature = await crypto.sign(encrypted, await alice.getPrivateKey());
    
    // Bob verifies signature
    const isValidSignature = await crypto.verify(encrypted, signature, await alice.getPublicKey());
    expect(isValidSignature).toBe(true);
    
    // Bob derives the same shared secret
    const bobShared = await crypto.deriveSharedSecret(
      await bob.getPrivateKey(),
      await alice.getPublicKey()
    );
    
    // Bob decrypts message
    const decrypted = await crypto.decrypt(encrypted, bobShared);
    
    expect(decrypted).toBe(message);
  });
});
