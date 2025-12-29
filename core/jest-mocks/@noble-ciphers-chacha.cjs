// Minimal CJS shim for @noble/ciphers/chacha.js used in tests
const crypto = require('crypto');

function concatUint8(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function xchacha20poly1305(key, nonce) {
  // Very small, non-cryptographic but reversible shim for tests.
  // Encrypt: AES-256-CTR using derived key and append 16-byte tag (HMAC-SHA256 truncated)
  const derived = crypto.createHash('sha256').update(Buffer.from(key)).update(Buffer.from(nonce)).digest();
  return {
    encrypt: (plaintext, aad) => {
      const iv = derived.slice(0, 16);
      const cipher = crypto.createCipheriv('aes-256-ctr', derived, iv);
      const ct = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
      const hmac = crypto.createHmac('sha256', derived).update(ct);
      if (aad) hmac.update(Buffer.from(aad));
      const tag = hmac.digest().slice(0, 16);
      return concatUint8([new Uint8Array(ct), new Uint8Array(tag)]);
    },
    decrypt: (ciphertextWithTag, aad) => {
      if (ciphertextWithTag.length < 16) throw new Error('Ciphertext too short');
      const tag = Buffer.from(ciphertextWithTag.slice(ciphertextWithTag.length - 16));
      const ct = Buffer.from(ciphertextWithTag.slice(0, ciphertextWithTag.length - 16));
      const hmac = crypto.createHmac('sha256', derived).update(ct);
      if (aad) hmac.update(Buffer.from(aad));
      const expectTag = hmac.digest().slice(0, 16);
      if (!crypto.timingSafeEqual(tag, expectTag)) throw new Error('Decryption failed: tag mismatch');
      const iv = derived.slice(0, 16);
      const decipher = crypto.createDecipheriv('aes-256-ctr', derived, iv);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return new Uint8Array(pt);
    }
  };
}

module.exports = { xchacha20poly1305 };
