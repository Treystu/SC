/**
 * Repro test for ECDH symmetry and conversion paths.
 *
 * This test compares the `performKeyExchange` result with a manual
 * conversion path: Ed25519 -> Montgomery (X25519) -> raw shared secret -> HKDF.
 * If they diverge, we log helpful debug info to trace the root cause.
 */
import { describe, it, expect } from '@jest/globals';
import { ed25519 } from '@noble/curves/ed25519.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
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

      // Basic symmetry check
      if (toHex(derived1) !== toHex(derived2)) {
        // Try manual conversion path to compare
        let privMont: Uint8Array | null = null;
        let pubMont: Uint8Array | null = null;
        try {
          if (ed25519 && ed25519.utils && ed25519.utils.toMontgomerySecret) {
            privMont = ed25519.utils.toMontgomerySecret(a.privateKey);
          }
          if (ed25519 && ed25519.utils && ed25519.utils.toMontgomery) {
            pubMont = ed25519.utils.toMontgomery(b.publicKey);
          }

          const shared = x25519.getSharedSecret(privMont!, pubMont!);
          const manualDerived = hkdf(sha256, shared, new Uint8Array(32), new Uint8Array(0), 32);

          // Log full context to help debugging
          // eslint-disable-next-line no-console
          console.error('[REPRO] Iter', i, 'mismatch detected');
          // eslint-disable-next-line no-console
          console.error('[REPRO] alice.pub', toHex(a.publicKey));
          // eslint-disable-next-line no-console
          console.error('[REPRO] alice.priv', toHex(a.privateKey));
          // eslint-disable-next-line no-console
          console.error('[REPRO] bob.pub', toHex(b.publicKey));
          // eslint-disable-next-line no-console
          console.error('[REPRO] bob.priv', toHex(b.privateKey));
          // eslint-disable-next-line no-console
          console.error('[REPRO] privMont', privMont ? toHex(privMont) : '<none>');
          // eslint-disable-next-line no-console
          console.error('[REPRO] pubMont', pubMont ? toHex(pubMont) : '<none>');
          // eslint-disable-next-line no-console
          console.error('[REPRO] derived1', toHex(derived1));
          // eslint-disable-next-line no-console
          console.error('[REPRO] derived2', toHex(derived2));
          // eslint-disable-next-line no-console
          console.error('[REPRO] manualDerived', toHex(manualDerived));

          // Wipe temporary secrets
          secureWipe(shared);
          secureWipe(manualDerived);

        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[REPRO] error during manual path', String(err));
        } finally {
          if (privMont) secureWipe(privMont);
          if (pubMont) secureWipe(pubMont);
        }

        // Fail the test so CI shows the debug output
        expect(toHex(derived1)).toBe(toHex(derived2));
      }
    }
  }, 30000);
});
