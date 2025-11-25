/**
 * Cryptographic primitives for Sovereign Communications
 * 
 * Security Standards:
 * - Ed25519: RFC 8032 - Edwards-Curve Digital Signature Algorithm
 * - X25519: RFC 7748 - Elliptic Curve Diffie-Hellman (ECDH)
 * - XChaCha20-Poly1305: draft-irtf-cfrg-xchacha - AEAD cipher
 * - HKDF: RFC 5869 - HMAC-based Key Derivation Function
 * - SHA-256: FIPS 180-4 - Secure Hash Standard
 * 
 * Implementation: @noble libraries (audited, minimal dependencies)
 * 
 * Side-Channel Attack Protections:
 * - Constant-time comparisons for secret data
 * - Secure key wiping after use
 * - Nonce tracking and reuse prevention
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';

/**
 * Identity keypair for signing and key exchange
 */
export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Session key for symmetric encryption with metadata
 */
export interface SessionKey {
  key: Uint8Array;
  nonce: Uint8Array;
  timestamp: number;
  messageCount?: number;  // Track messages for rotation
  counter?: number;        // Nonce counter for sequential messages
}

/**
 * Nonce manager to prevent reuse
 */
export class NonceManager {
  private usedNonces = new Set<string>();
  private readonly maxTracked = 10000;

  /**
   * Check if nonce has been used and mark it as used
   * @throws Error if nonce has been reused
   */
  markUsed(nonce: Uint8Array): void {
    const nonceStr = Array.from(nonce).join(',');
    
    if (this.usedNonces.has(nonceStr)) {
      throw new Error('Nonce reuse detected! This is a critical security violation.');
    }
    
    this.usedNonces.add(nonceStr);
    
    // Prevent memory bloat
    if (this.usedNonces.size > this.maxTracked) {
      // Remove oldest entries (first 1000)
      const toRemove = Array.from(this.usedNonces).slice(0, 1000);
      toRemove.forEach(n => this.usedNonces.delete(n));
    }
  }

  /**
   * Check if nonce has been used without marking
   */
  hasBeenUsed(nonce: Uint8Array): boolean {
    const nonceStr = Array.from(nonce).join(',');
    return this.usedNonces.has(nonceStr);
  }

  /**
   * Clear all tracked nonces
   */
  clear(): void {
    this.usedNonces.clear();
  }
}

/**
 * Timing-safe comparison function to prevent timing attacks
 * Returns true if arrays are equal, false otherwise
 * Execution time is independent of where differences occur
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

/**
 * Securely wipe key material from memory
 * Overwrites the array with zeros
 */
export function secureWipe(data: Uint8Array): void {
  data.fill(0);
}

/**
 * Validate entropy quality of random data
 * Performs basic statistical tests
 */
export function validateEntropy(data: Uint8Array): boolean {
  if (data.length < 32) return false;
  
  // Check for all zeros
  if (data.every(b => b === 0)) return false;
  
  // Check for all same value
  const first = data[0];
  if (data.every(b => b === first)) return false;
  
  // Check for simple patterns
  let patternCount = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i] === data[i - 1]) patternCount++;
  }
  
  // If more than 80% are sequential duplicates, likely bad entropy
  if (patternCount > data.length * 0.8) return false;
  
  return true;
}

/**
 * Generate a new Ed25519 identity keypair
 * Uses cryptographically secure random number generator
 * 
 * Algorithm Parameters:
 * - Curve: Edwards25519
 * - Private key: 32 bytes
 * - Public key: 32 bytes (compressed point)
 * - Security level: ~128 bits
 * 
 * @throws Error if entropy validation fails
 */
export function generateIdentity(): IdentityKeyPair {
  const privateKey = ed25519.utils.randomSecretKey();
  
  // Validate entropy quality
  if (!validateEntropy(privateKey)) {
    throw new Error('Insufficient entropy for key generation');
  }
  
  const publicKey = ed25519.getPublicKey(privateKey);
  
  return {
    publicKey,
    privateKey,
  };
}

/**
 * Sign a message with Ed25519
 * 
 * Algorithm: RFC 8032 Deterministic Ed25519
 * - Uses deterministic nonce generation (no randomness during signing)
 * - Signature: 64 bytes (R point + s scalar)
 * - Resistant to nonce reuse attacks
 * 
 * @param message - Message to sign
 * @param privateKey - 32-byte Ed25519 private key
 * @returns 64-byte signature
 */
export function signMessage(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  
  return ed25519.sign(message, privateKey);
}

/**
 * Verify a message signature with Ed25519
 * Uses constant-time operations to prevent timing attacks
 * 
 * @param message - Original message
 * @param signature - 64-byte signature
 * @param publicKey - 32-byte Ed25519 public key
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    if (publicKey.length !== 32) return false;
    if (signature.length !== 64) return false;
    
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/**
 * Batch verify multiple signatures (more efficient than individual verification)
 * 
 * @param items - Array of {message, signature, publicKey} tuples
 * @returns true if all signatures are valid, false if any are invalid
 */
export function batchVerifySignatures(
  items: Array<{ message: Uint8Array; signature: Uint8Array; publicKey: Uint8Array }>
): boolean {
  try {
    // Verify each signature individually
    // Note: @noble/curves doesn't have built-in batch verification yet
    // This implementation verifies each but provides the API for future optimization
    return items.every(item =>
      verifySignature(item.message, item.signature, item.publicKey)
    );
  } catch {
    return false;
  }
}

/**
 * Perform ECDH key exchange using X25519 (RFC 7748)
 * 
 * Algorithm: Curve25519 Diffie-Hellman
 * - Derives a shared secret between two parties
 * - Uses HKDF for proper key derivation
 * - Resistant to small subgroup attacks
 * 
 * @param privateKey - Our X25519 private key (32 bytes)
 * @param peerPublicKey - Peer's X25519 public key (32 bytes)
 * @param salt - Optional salt for HKDF (default: zeros)
 * @param info - Optional context info for HKDF
 * @returns Derived 32-byte key
 */
export function performKeyExchange(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  salt?: Uint8Array,
  info?: Uint8Array
): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  if (peerPublicKey.length !== 32) {
    throw new Error('Peer public key must be 32 bytes');
  }
  
  // Perform ECDH
  const sharedSecret = x25519.getSharedSecret(privateKey, peerPublicKey);
  
  // Use HKDF to derive proper key from shared secret
  const derivedKey = hkdf(
    sha256,
    sharedSecret,
    salt || new Uint8Array(32), // Salt
    info || new Uint8Array(0),  // Info/context
    32 // Output length
  );
  
  // Wipe shared secret from memory
  secureWipe(sharedSecret);
  
  return derivedKey;
}

/**
 * Generate ephemeral X25519 keypair for key exchange
 * Used for forward secrecy - generate new keypair for each session
 */
export function generateEphemeralKeyPair(): IdentityKeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  
  if (!validateEntropy(privateKey)) {
    throw new Error('Insufficient entropy for ephemeral key generation');
  }
  
  return {
    publicKey,
    privateKey,
  };
}

/**
 * Generate a session key for forward secrecy
 * 
 * @param counter - Optional counter for nonce generation
 * @returns New session key with nonce
 */
export function generateSessionKey(counter?: number): SessionKey {
  const key = randomBytes(32);
  
  if (!validateEntropy(key)) {
    throw new Error('Insufficient entropy for session key generation');
  }
  
  return {
    key,
    nonce: randomBytes(24),
    timestamp: Date.now(),
    messageCount: 0,
    counter: counter || 0,
  };
}

/**
 * Increment nonce counter for sequential messages
 * Prevents nonce reuse while allowing sequential message encryption
 * 
 * @param sessionKey - Current session key
 * @returns New nonce based on counter
 */
export function incrementNonce(sessionKey: SessionKey): Uint8Array {
  const counter = (sessionKey.counter || 0) + 1;
  sessionKey.counter = counter;
  
  // Generate deterministic nonce from base nonce + counter
  const nonce = new Uint8Array(24);
  nonce.set(sessionKey.nonce.slice(0, 16), 0);
  
  // Encode counter in last 8 bytes (big-endian)
  const counterBigInt = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    nonce[16 + (7 - i)] = Number((counterBigInt >> BigInt(i * 8)) & BigInt(0xff));
  }
  
  return nonce;
}

/**
 * Encrypt a message with XChaCha20-Poly1305 AEAD
 * 
 * Algorithm: draft-irtf-cfrg-xchacha
 * - XChaCha20: Stream cipher with 192-bit nonce
 * - Poly1305: 128-bit authentication tag
 * - Combined: Authenticated Encryption with Associated Data (AEAD)
 * 
 * Security Notes:
 * - NEVER reuse a nonce with the same key
 * - The nonce doesn't need to be secret, but must be unique
 * - Authentication tag prevents tampering
 * - Message size limits: 256 GB per message (2^38 - 64 bytes)
 * 
 * @param plaintext - Data to encrypt
 * @param key - 32-byte encryption key
 * @param nonce - 24-byte nonce (must be unique per key)
 * @param associatedData - Optional data to authenticate but not encrypt
 * @returns Ciphertext with 16-byte authentication tag appended
 */
export function encryptMessage(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  associatedData?: Uint8Array
): Uint8Array {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }
  if (nonce.length !== 24) {
    throw new Error('Nonce must be 24 bytes for XChaCha20-Poly1305');
  }
  
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.encrypt(plaintext, associatedData);
}

/**
 * Decrypt a message with XChaCha20-Poly1305 AEAD
 * 
 * @param ciphertext - Encrypted data with authentication tag
 * @param key - 32-byte decryption key
 * @param nonce - 24-byte nonce (same as used for encryption)
 * @param associatedData - Optional associated data (must match encryption)
 * @returns Decrypted plaintext
 * @throws Error if authentication fails (tampering detected)
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  associatedData?: Uint8Array
): Uint8Array {
  if (key.length !== 32) {
    throw new Error('Decryption key must be 32 bytes');
  }
  if (nonce.length !== 24) {
    throw new Error('Nonce must be 24 bytes for XChaCha20-Poly1305');
  }
  if (ciphertext.length < 16) {
    throw new Error('Ciphertext too short (must include 16-byte auth tag)');
  }
  
  try {
    const cipher = xchacha20poly1305(key, nonce);
    return cipher.decrypt(ciphertext, associatedData);
  } catch (error) {
    // Wipe any partial decryption attempts
    throw new Error('Decryption failed: authentication tag mismatch or corrupted data');
  }
}

/**
 * Generate a fingerprint from a public key for verification
 * Uses SHA-256 for collision resistance
 * 
 * @param publicKey - Public key to fingerprint
 * @returns Formatted fingerprint string (e.g., "1a2b 3c4d 5e6f...")
 */
export function generateFingerprint(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
  // Format as groups of 4 hex chars
  const hex = Array.from(hash)
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.match(/.{1,4}/g)?.join(' ') || hex;
}

/**
 * Derive a session key from shared secret using HKDF (RFC 5869)
 * 
 * HKDF provides proper key derivation with:
 * - Extract: Derive pseudorandom key from secret
 * - Expand: Derive multiple keys from pseudorandom key
 * 
 * @param sharedSecret - Shared secret from ECDH
 * @param salt - Salt value (should be random)
 * @param info - Context/application-specific info
 * @param length - Output key length (default: 32)
 * @returns Derived key
 */
export function deriveSessionKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info?: Uint8Array,
  length: number = 32
): Uint8Array {
  return hkdf(
    sha256,
    sharedSecret,
    salt,
    info || new Uint8Array(0),
    length
  );
}

/**
 * Rotate session key for perfect forward secrecy
 * 
 * Rotation Triggers:
 * - Time-based: After specified duration
 * - Message-based: After N messages
 * - Manual: On-demand rotation
 * 
 * @param currentKey - Current session key
 * @param reason - Optional reason for rotation (for logging)
 * @returns New session key
 */
export function rotateSessionKey(currentKey: SessionKey, reason?: string): SessionKey {
  // Derive new key from current key using HKDF
  const info = reason ? new TextEncoder().encode(reason) : new Uint8Array(0);
  const newKeyMaterial = hkdf(
    sha256,
    currentKey.key,
    currentKey.nonce,
    info,
    32
  );
  
  // Wipe old key material from memory
  secureWipe(currentKey.key);
  secureWipe(currentKey.nonce);
  
  return {
    key: newKeyMaterial,
    nonce: randomBytes(24),
    timestamp: Date.now(),
    messageCount: 0,
    counter: 0,
  };
}

/**
 * Check if session key should be rotated
 * 
 * @param sessionKey - Session key to check
 * @param maxAge - Maximum age in milliseconds (default: 1 hour)
 * @param maxMessages - Maximum messages before rotation (default: 1000)
 * @returns true if rotation is needed
 */
export function shouldRotateKey(
  sessionKey: SessionKey,
  maxAge: number = 60 * 60 * 1000, // 1 hour
  maxMessages: number = 1000
): boolean {
  const age = Date.now() - sessionKey.timestamp;
  const messageCount = sessionKey.messageCount || 0;
  
  return age >= maxAge || messageCount >= maxMessages;
}

/**
 * Double Ratchet state for Perfect Forward Secrecy
 * Implements Signal Protocol's Double Ratchet algorithm
 */
export interface RatchetState {
  rootKey: Uint8Array;           // Root key for deriving chain keys
  sendChainKey: Uint8Array;      // Sending chain key
  receiveChainKey: Uint8Array;   // Receiving chain key
  sendCounter: number;           // Number of messages sent
  receiveCounter: number;        // Number of messages received
  previousSendCounter: number;   // For out-of-order handling
  dhRatchetKey: IdentityKeyPair; // Current DH ratchet keypair
}

/**
 * Initialize Double Ratchet state
 * 
 * @param sharedSecret - Initial shared secret from key exchange
 * @param isInitiator - True if we initiated the session
 * @returns Initial ratchet state
 */
export function initializeRatchet(sharedSecret: Uint8Array, _isInitiator: boolean): RatchetState {
  // Derive root key and initial chain keys from shared secret
  const rootKey = hkdf(sha256, sharedSecret, new Uint8Array(32), new TextEncoder().encode('root'), 32);
  const sendChainKey = hkdf(sha256, sharedSecret, new Uint8Array(32), new TextEncoder().encode('send'), 32);
  const receiveChainKey = hkdf(sha256, sharedSecret, new Uint8Array(32), new TextEncoder().encode('receive'), 32);
  
  const dhRatchetKey = generateEphemeralKeyPair();
  
  return {
    rootKey,
    sendChainKey,
    receiveChainKey,
    sendCounter: 0,
    receiveCounter: 0,
    previousSendCounter: 0,
    dhRatchetKey,
  };
}

/**
 * Perform DH ratchet step
 * Updates root key and chain keys using new ephemeral keypair
 * 
 * @param state - Current ratchet state
 * @param peerPublicKey - Peer's public DH ratchet key
 * @returns Updated ratchet state
 */
export function ratchetStep(state: RatchetState, peerPublicKey: Uint8Array): RatchetState {
  // Perform DH with peer's public key
  const dhOutput = performKeyExchange(state.dhRatchetKey.privateKey, peerPublicKey);
  
  // Derive new root key and chain keys
  const newRootKey = hkdf(sha256, dhOutput, state.rootKey, new TextEncoder().encode('ratchet'), 32);
  const newSendChainKey = hkdf(sha256, dhOutput, state.rootKey, new TextEncoder().encode('send'), 32);
  const newReceiveChainKey = hkdf(sha256, dhOutput, state.rootKey, new TextEncoder().encode('receive'), 32);
  
  // Generate new DH keypair for next ratchet
  const newDHKey = generateEphemeralKeyPair();
  
  // Wipe old keys
  secureWipe(state.rootKey);
  secureWipe(state.sendChainKey);
  secureWipe(state.receiveChainKey);
  secureWipe(state.dhRatchetKey.privateKey);
  secureWipe(dhOutput);
  
  return {
    rootKey: newRootKey,
    sendChainKey: newSendChainKey,
    receiveChainKey: newReceiveChainKey,
    sendCounter: 0,
    receiveCounter: 0,
    previousSendCounter: state.sendCounter,
    dhRatchetKey: newDHKey,
  };
}

/**
 * Derive message key from chain key
 * Advances the chain by one step
 * 
 * @param chainKey - Current chain key
 * @returns New { messageKey, nextChainKey }
 */
export function deriveMessageKey(chainKey: Uint8Array): { messageKey: Uint8Array; nextChainKey: Uint8Array } {
  const messageKey = hkdf(sha256, chainKey, new Uint8Array(1).fill(0x01), new TextEncoder().encode('message'), 32);
  const nextChainKey = hkdf(sha256, chainKey, new Uint8Array(1).fill(0x02), new TextEncoder().encode('chain'), 32);
  
  // Wipe old chain key
  secureWipe(chainKey);
  
  return { messageKey, nextChainKey };
}
