import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { SharedSecret } from '../types';

/**
 * Task 2: Implement ECDH key exchange protocol
 * Generates an ephemeral X25519 keypair
 */
export function generateECDHKeypair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Task 2: Implement ECDH key exchange protocol
 * Computes shared secret from ECDH
 */
export function computeSharedSecret(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, peerPublicKey);
}

/**
 * Task 9: Implement perfect forward secrecy with session keys
 * Derives a session key from shared secret using HKDF
 */
export function deriveSessionKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array = new Uint8Array()
): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, info, 32);
}

/**
 * Create a SharedSecret object
 */
export function createSharedSecret(
  peerId: Uint8Array,
  secret: Uint8Array
): SharedSecret {
  return {
    peerId,
    secret,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  };
}
