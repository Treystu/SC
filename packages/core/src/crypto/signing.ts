import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/hashes/utils';
import { Identity } from '../types';

/**
 * Task 5: Generate and store identity keypair on device
 * Creates a new Ed25519 keypair for user identity
 */
export function generateIdentity(displayName?: string): Identity {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  return {
    publicKey,
    privateKey,
    createdAt: Date.now(),
    displayName,
  };
}

/**
 * Task 3: Implement Ed25519 for message signing
 * Signs data using Ed25519 private key
 */
export function signMessage(data: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(data, privateKey);
}

/**
 * Task 7: Implement message signing/verification
 * Verifies Ed25519 signature
 */
export function verifySignature(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, data, publicKey);
  } catch {
    return false;
  }
}

/**
 * Generate a random nonce for ChaCha20-Poly1305
 */
export function generateNonce(): Uint8Array {
  return randomBytes(12); // 96-bit nonce for ChaCha20-Poly1305
}

/**
 * Generate a random key for ChaCha20-Poly1305
 */
export function generateKey(): Uint8Array {
  return randomBytes(32); // 256-bit key
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): Uint8Array {
  return randomBytes(32);
}
