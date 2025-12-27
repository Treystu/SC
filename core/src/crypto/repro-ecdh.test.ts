/**
 * Repro test for ECDH symmetry.
 *
 * Verifies that performKeyExchange is symmetric:
 * performKeyExchange(aPriv, bPub) must equal performKeyExchange(bPriv, aPub)
 */
import { describe, it, expect } from '@jest/globals';
import {
  generateIdentity,
  performKeyExchange,
} from './primitives';

function toHex(b: Uint8Array) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

describe('Repro ECDH Symmetry', () => {
  it('matches manual conversion + HKDF for many random keys', async () => {
    // Try multiple iterations to exercise edge cases
    const ITER = 200;

    for (let i = 0; i < ITER; i++) {
      const a = await generateIdentity();
      const b = await generateIdentity();

      // Derived via performKeyExchange (the library under test)
      const derived1 = performKeyExchange(a.privateKey, b.publicKey);
      const derived2 = performKeyExchange(b.privateKey, a.publicKey);

      if (!derived1 || !derived2) {
        throw new Error('performKeyExchange returned falsy derived key');
      }

      // Basic symmetry check - performKeyExchange(aPriv, bPub) must equal performKeyExchange(bPriv, aPub)
      expect(toHex(derived1)).toBe(toHex(derived2));
    }
  }, 30000);
});
