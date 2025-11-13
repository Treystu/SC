/**
 * Cryptographic primitives for Sovereign Communications
 * Uses @noble libraries for secure, audited cryptography
 */

import { ed25519 } from '@noble/curves/ed25519';
import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

/**
 * Identity keypair for signing and key exchange
 */
export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Session key for symmetric encryption
 */
export interface SessionKey {
  key: Uint8Array;
  nonce: Uint8Array;
  timestamp: number;
}

/**
 * Generate a new Ed25519 identity keypair
 */
export function generateIdentity(): IdentityKeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKey,
    privateKey,
  };
}

/**
 * Sign a message with Ed25519
 */
export function signMessage(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

/**
 * Verify a message signature with Ed25519
 */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/**
 * Perform ECDH key exchange using X25519
 * Converts Ed25519 keys to X25519 format
 */
export function performKeyExchange(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Uint8Array {
  // Convert Ed25519 keys to X25519
  const x25519Private = ed25519.utils.randomPrivateKey(); // TODO: Proper conversion
  const sharedSecret = x25519.getSharedSecret(x25519Private, peerPublicKey);
  return sha256(sharedSecret); // Derive 32-byte key
}

/**
 * Generate a session key for forward secrecy
 */
export function generateSessionKey(): SessionKey {
  return {
    key: randomBytes(32),
    nonce: randomBytes(24),
    timestamp: Date.now(),
  };
}

/**
 * Encrypt a message with XChaCha20-Poly1305
 */
export function encryptMessage(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.encrypt(plaintext);
}

/**
 * Decrypt a message with XChaCha20-Poly1305
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}

/**
 * Generate a fingerprint from a public key for verification
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
 * Derive a shared secret from ECDH and create session key
 */
export function deriveSessionKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  // Simple HKDF-like derivation
  const combined = new Uint8Array(sharedSecret.length + salt.length);
  combined.set(sharedSecret, 0);
  combined.set(salt, sharedSecret.length);
  return sha256(combined);
}

/**
 * Rotate session key (for perfect forward secrecy)
 */
export function rotateSessionKey(currentKey: SessionKey): SessionKey {
  const newKeyMaterial = sha256(new Uint8Array([...currentKey.key, ...currentKey.nonce]));
  return {
    key: newKeyMaterial,
    nonce: randomBytes(24),
    timestamp: Date.now(),
  };
}
