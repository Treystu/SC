import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/hashes/utils';
import { SessionKey } from '../types';
import { SESSION_KEY_LIFETIME } from '../types/message';

/**
 * Task 4: Implement ChaCha20-Poly1305 for message encryption
 * Task 6: Implement message encryption/decryption
 * Encrypts data using ChaCha20-Poly1305
 */
export function encryptMessage(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  additionalData?: Uint8Array
): Uint8Array {
  const cipher = chacha20poly1305(key, nonce, additionalData);
  return cipher.encrypt(plaintext);
}

/**
 * Task 6: Implement message encryption/decryption
 * Decrypts data using ChaCha20-Poly1305
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  additionalData?: Uint8Array
): Uint8Array {
  const cipher = chacha20poly1305(key, nonce, additionalData);
  return cipher.decrypt(ciphertext);
}

/**
 * Task 9: Implement perfect forward secrecy with session keys
 * Creates a new session key
 */
export function createSessionKey(keyId?: Uint8Array): SessionKey {
  const now = Date.now();
  return {
    keyId: keyId || randomBytes(32),
    key: randomBytes(32),
    nonce: randomBytes(12),
    createdAt: now,
    expiresAt: now + SESSION_KEY_LIFETIME,
  };
}

/**
 * Task 10: Create session key rotation logic
 * Checks if a session key needs rotation
 */
export function shouldRotateKey(sessionKey: SessionKey): boolean {
  return Date.now() >= sessionKey.expiresAt;
}

/**
 * Task 10: Create session key rotation logic
 * Rotates a session key by creating a new one
 */
export function rotateSessionKey(oldKey: SessionKey): SessionKey {
  return createSessionKey(oldKey.keyId);
}
