// Minimal HKDF-SHA256 shim for @noble/hashes/hkdf.js used in tests
const crypto = require('crypto');

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', Buffer.from(key)).update(Buffer.from(data)).digest();
}

function hkdf(_hash, ikm, salt, info, length) {
  // HKDF extract
  const prk = salt && salt.length ? hmacSha256(salt, ikm) : hmacSha256(new Uint8Array(32), ikm);

  // HKDF expand
  const okm = [];
  let previous = Buffer.alloc(0);
  const n = Math.ceil(length / 32);
  for (let i = 0; i < n; i++) {
    const input = Buffer.concat([previous, Buffer.from(info || ''), Buffer.from([i + 1])]);
    previous = hmacSha256(prk, input);
    okm.push(previous);
  }
  const out = Buffer.concat(okm).slice(0, length);
  return new Uint8Array(out);
}

module.exports = { hkdf };
