/**
 * Crypto module exports
 * Provides all cryptographic primitives for Sovereign Communications
 */

export * from './primitives.js';
export * from './storage.js';
export * from './envelope.js';

// Re-export specific commonly-used items for convenience
import {
  generateIdentity,
  generateKeyPair,
  generateKey,
  generateNonce,
  generateSessionKey,
  generateEphemeralKeyPair,
  signMessage,
  verifySignature,
  batchVerifySignatures,
  encryptMessage,
  decryptMessage,
  performKeyExchange,
  deriveSharedSecret,
  deriveSessionKey,
  generateFingerprint,
  rotateSessionKey,
  shouldRotateKey,
  timingSafeEqual,
  secureWipe,
  validateEntropy,
  incrementNonce,
  randomBytes,
  NonceManager,
  initializeRatchet,
  ratchetStep,
  deriveMessageKey,
  type IdentityKeyPair,
  type SessionKey,
  type RatchetState,
} from './primitives.js';

// Re-export the imported items
export {
  generateIdentity,
  generateKeyPair,
  generateKey,
  generateNonce,
  generateSessionKey,
  generateEphemeralKeyPair,
  signMessage,
  verifySignature,
  batchVerifySignatures,
  encryptMessage,
  decryptMessage,
  performKeyExchange,
  deriveSharedSecret,
  deriveSessionKey,
  generateFingerprint,
  rotateSessionKey,
  shouldRotateKey,
  timingSafeEqual,
  secureWipe,
  validateEntropy,
  incrementNonce,
  randomBytes,
  NonceManager,
  initializeRatchet,
  ratchetStep,
  deriveMessageKey,
  type IdentityKeyPair,
  type SessionKey,
  type RatchetState,
};

/**
 * CryptoManager class - High-level encryption/decryption API
 * Provides a convenient class-based interface for cryptographic operations
 */
export class CryptoManager {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  /** Minimum size for encrypted data (nonce size) */
  private static readonly NONCE_SIZE = 24;

  /**
   * Validate and extract nonce/ciphertext from encrypted data
   * @param encrypted - Encrypted data with nonce prepended
   * @returns Object containing nonce and ciphertext
   * @throws Error if encrypted data is too short
   */
  private extractNonceAndCiphertext(encrypted: Uint8Array): { nonce: Uint8Array; ciphertext: Uint8Array } {
    if (encrypted.length < CryptoManager.NONCE_SIZE) {
      throw new Error(`Encrypted data too short: must be at least ${CryptoManager.NONCE_SIZE} bytes (nonce size)`);
    }
    return {
      nonce: encrypted.slice(0, CryptoManager.NONCE_SIZE),
      ciphertext: encrypted.slice(CryptoManager.NONCE_SIZE),
    };
  }

  /**
   * Generate a random 32-byte symmetric key
   */
  generateKey(): Uint8Array {
    return generateKey();
  }

  /**
   * Encrypt a message using XChaCha20-Poly1305
   * @param message - String or Uint8Array to encrypt
   * @param key - 32-byte encryption key
   * @returns Encrypted data with nonce prepended
   */
  encrypt(message: string | Uint8Array, key: Uint8Array): Uint8Array {
    const plaintext = typeof message === 'string' 
      ? this.encoder.encode(message)
      : message;
    
    const nonce = generateNonce();
    const ciphertext = encryptMessage(plaintext, key, nonce);
    
    // Prepend nonce to ciphertext
    const result = new Uint8Array(nonce.length + ciphertext.length);
    result.set(nonce, 0);
    result.set(ciphertext, nonce.length);
    
    return result;
  }

  /**
   * Decrypt a message using XChaCha20-Poly1305
   * @param encrypted - Encrypted data with nonce prepended
   * @param key - 32-byte decryption key
   * @returns Decrypted string
   * @throws Error if encrypted data is too short
   */
  decrypt(encrypted: Uint8Array, key: Uint8Array): string {
    const { nonce, ciphertext } = this.extractNonceAndCiphertext(encrypted);
    const plaintext = decryptMessage(ciphertext, key, nonce);
    return this.decoder.decode(plaintext);
  }

  /**
   * Decrypt a message and return raw bytes (Uint8Array)
   * @param encrypted - Encrypted data with nonce prepended
   * @param key - 32-byte decryption key
   * @returns Decrypted Uint8Array
   * @throws Error if encrypted data is too short
   */
  decryptBytes(encrypted: Uint8Array, key: Uint8Array): Uint8Array {
    const { nonce, ciphertext } = this.extractNonceAndCiphertext(encrypted);
    return decryptMessage(ciphertext, key, nonce);
  }

  /**
   * Sign a message using Ed25519
   * @param message - Message to sign (string or Uint8Array)
   * @param privateKey - 32-byte Ed25519 private key
   * @returns 64-byte signature
   */
  sign(message: string | Uint8Array, privateKey: Uint8Array): Uint8Array {
    const data = typeof message === 'string'
      ? this.encoder.encode(message)
      : message;
    
    return signMessage(data, privateKey);
  }

  /**
   * Verify a signature using Ed25519
   * @param message - Original message
   * @param signature - 64-byte signature
   * @param publicKey - 32-byte Ed25519 public key
   * @returns true if valid, false otherwise
   */
  verify(message: string | Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    const data = typeof message === 'string'
      ? this.encoder.encode(message)
      : message;
    
    return verifySignature(data, signature, publicKey);
  }

  /**
   * Derive a shared secret using X25519 ECDH
   * @param privateKey - Our private key
   * @param peerPublicKey - Peer's public key
   * @returns 32-byte shared secret
   */
  deriveSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
    return deriveSharedSecret(privateKey, peerPublicKey);
  }
}

/**
 * KeyManager class - Manages identity keypairs
 * Provides persistent key storage and generation
 */
export class KeyManager {
  private publicKey: Uint8Array | null = null;
  private privateKey: Uint8Array | null = null;

  /**
   * Generate a new Ed25519 identity keypair
   */
  generateIdentityKeyPair(): void {
    const keypair = generateIdentity();
    this.publicKey = keypair.publicKey;
    this.privateKey = keypair.privateKey;
  }

  /**
   * Get the public key
   * @throws Error if keypair not generated
   * @returns A copy of the public key to prevent external modification
   */
  getPublicKey(): Uint8Array {
    if (!this.publicKey) {
      throw new Error('Keypair not generated. Call generateIdentityKeyPair first.');
    }
    return new Uint8Array(this.publicKey);
  }

  /**
   * Get the private key
   * @throws Error if keypair not generated
   * @returns A copy of the private key to prevent external modification
   */
  getPrivateKey(): Uint8Array {
    if (!this.privateKey) {
      throw new Error('Keypair not generated. Call generateIdentityKeyPair first.');
    }
    return new Uint8Array(this.privateKey);
  }

  /**
   * Check if a keypair has been generated
   */
  hasKeypair(): boolean {
    return this.publicKey !== null && this.privateKey !== null;
  }

  /**
   * Clear the stored keypair from memory
   */
  clear(): void {
    if (this.privateKey) {
      secureWipe(this.privateKey);
    }
    this.publicKey = null;
    this.privateKey = null;
  }
}
