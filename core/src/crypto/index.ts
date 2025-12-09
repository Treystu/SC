/**
 * Crypto module exports
 * Provides all cryptographic primitives for Sovereign Communications
 */

export * from './primitives.js';
export * from './storage.js';
export * from './envelope.js';

// Re-export specific commonly-used items for convenience
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
  type IdentityKeyPair,
  type SessionKey,
  type RatchetState,
  initializeRatchet,
  ratchetStep,
  deriveMessageKey,
} from './primitives.js';

/**
 * CryptoManager class - High-level encryption/decryption API
 * Provides a convenient class-based interface for cryptographic operations
 */
export class CryptoManager {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  /**
   * Generate a random 32-byte symmetric key
   */
  generateKey(): Uint8Array {
    // Import at function call to avoid circular dependency
    const { generateKey } = require('./primitives.js');
    return generateKey();
  }

  /**
   * Encrypt a message using XChaCha20-Poly1305
   * @param message - String or Uint8Array to encrypt
   * @param key - 32-byte encryption key
   * @returns Encrypted data with nonce prepended
   */
  async encrypt(message: string | Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const { encryptMessage, generateNonce } = require('./primitives.js');
    
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
   */
  async decrypt(encrypted: Uint8Array, key: Uint8Array): Promise<string> {
    const { decryptMessage } = require('./primitives.js');
    
    // Extract nonce (first 24 bytes) and ciphertext
    const nonce = encrypted.slice(0, 24);
    const ciphertext = encrypted.slice(24);
    
    const plaintext = decryptMessage(ciphertext, key, nonce);
    return this.decoder.decode(plaintext);
  }

  /**
   * Sign a message using Ed25519
   * @param message - Message to sign (string or Uint8Array)
   * @param privateKey - 32-byte Ed25519 private key
   * @returns 64-byte signature
   */
  async sign(message: string | Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    const { signMessage } = require('./primitives.js');
    
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
  async verify(message: string | Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    const { verifySignature } = require('./primitives.js');
    
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
  async deriveSharedSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Promise<Uint8Array> {
    const { deriveSharedSecret } = require('./primitives.js');
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
  async generateIdentityKeyPair(): Promise<void> {
    const { generateIdentity } = require('./primitives.js');
    const keypair = generateIdentity();
    this.publicKey = keypair.publicKey;
    this.privateKey = keypair.privateKey;
  }

  /**
   * Get the public key
   * @throws Error if keypair not generated
   */
  async getPublicKey(): Promise<Uint8Array> {
    if (!this.publicKey) {
      throw new Error('Keypair not generated. Call generateIdentityKeyPair first.');
    }
    return this.publicKey;
  }

  /**
   * Get the private key
   * @throws Error if keypair not generated
   */
  async getPrivateKey(): Promise<Uint8Array> {
    if (!this.privateKey) {
      throw new Error('Keypair not generated. Call generateIdentityKeyPair first.');
    }
    return this.privateKey;
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
    const { secureWipe } = require('./primitives.js');
    if (this.privateKey) {
      secureWipe(this.privateKey);
    }
    this.publicKey = null;
    this.privateKey = null;
  }
}
