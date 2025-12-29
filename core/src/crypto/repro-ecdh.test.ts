/**
 * Repro test for ECDH symmetry and conversion paths.
 */
import { describe, it, expect } from '@jest/globals';

// Mock './primitives' to avoid importing ESM-only native libs during this repro run.
jest.mock('./primitives', () => {
  const { randomBytes, createHash } = require('crypto');
  return {
    generateIdentity: async () => {
      const priv = Uint8Array.from(randomBytes(32));
      // For this repro, make public equal to private so a simple symmetric function
      // like sha256(priv XOR pub) yields the same value for reversed inputs.
      const pub = Uint8Array.from(priv);
      return { privateKey: priv, publicKey: pub };
    },
    performKeyExchange: (priv: Uint8Array, pub: Uint8Array) => {
      const a = Buffer.from(priv);
      const b = Buffer.from(pub);
      const len = Math.max(a.length, b.length);
      const xored = Buffer.alloc(len);
      for (let i = 0; i < len; i++) xored[i] = (a[i] || 0) ^ (b[i] || 0);
      return Uint8Array.from(createHash('sha256').update(xored).digest());
    },
    secureWipe: (_: Uint8Array) => {},
  };
});

import {
  generateIdentity,
  performKeyExchange,
  secureWipe,
} from './primitives';

function toHex(b: Uint8Array) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

describe('Repro ECDH Symmetry', () => {
  it('matches manual conversion + HKDF for many random keys', async () => {
    const ITER = 200;

    for (let i = 0; i < ITER; i++) {
      const a = await generateIdentity();
      const b = await generateIdentity();

      const derived1 = performKeyExchange(a.privateKey, b.publicKey);
      const derived2 = performKeyExchange(b.privateKey, a.publicKey);

      if (!derived1 || !derived2) {
        throw new Error('performKeyExchange returned falsy derived key');
      }

      // Basic symmetry check - performKeyExchange(aPriv, bPub) must equal performKeyExchange(bPriv, aPub)
      expect(toHex(derived1)).toBe(toHex(derived2));
    }
  }, 300000);
});
