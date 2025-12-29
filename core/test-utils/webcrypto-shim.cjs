// Minimal WebCrypto-like shim for Ed25519 and digest used in tests
// Use local CJS shims to avoid importing ESM-only @noble packages in Jest.
const { ed25519, x25519 } = require('../jest-mocks/@noble-curves-ed25519.cjs');
const { sha256 } = require('../jest-mocks/@noble-hashes-sha2.cjs');
const { bytesToHex } = require('../jest-mocks/@noble-hashes-utils.cjs');

function toBase64Url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

const subtle = {
  async generateKey(alg, extractable, keyUsages) {
    if (!alg || String(alg.name).toLowerCase() !== 'ed25519') throw new Error('Unsupported algorithm');
    const { randomBytes } = require('crypto');
    const priv = Uint8Array.from(randomBytes(32));
    const pub = ed25519.getPublicKey ? await ed25519.getPublicKey(priv) : ed25519.utils.toMontgomery ? ed25519.utils.toMontgomery(priv) : new Uint8Array(32);
    const publicKey = { type: 'public', algorithm: { name: 'Ed25519' }, usages: ['verify'], raw: new Uint8Array(pub), extractable: true };
    const privateKey = { type: 'private', algorithm: { name: 'Ed25519' }, usages: ['sign'], raw: new Uint8Array(priv), extractable: true };
    return { publicKey, privateKey };
  },

  async exportKey(format, key) {
    if (format === 'raw') return key.raw.buffer;
    if (format === 'jwk') {
      if (key.type === 'public') {
        return {
          kty: 'OKP',
          crv: 'Ed25519',
          x: toBase64Url(key.raw),
        };
      } else {
        return {
          kty: 'OKP',
          crv: 'Ed25519',
          x: toBase64Url(await (ed25519.getPublicKey ? ed25519.getPublicKey(key.raw) : (ed25519.utils && ed25519.utils.toMontgomery ? ed25519.utils.toMontgomery(key.raw) : key.raw))),
          d: toBase64Url(key.raw),
        };
      }
    }
    throw new Error('Unsupported export format: ' + format);
  },

  async importKey(format, keyData, alg, extractable, keyUsages) {
    if (format === 'raw') {
      const raw = new Uint8Array(keyData);
      const type = keyUsages && keyUsages.includes('verify') ? 'public' : 'private';
      return { type, algorithm: { name: 'Ed25519' }, usages: keyUsages || [], raw };
    }
    if (format === 'jwk') {
      if (keyData.d) {
        const raw = new Uint8Array(fromBase64Url(keyData.d));
        return { type: 'private', algorithm: { name: 'Ed25519' }, usages: ['sign'], raw };
      }
      const raw = new Uint8Array(fromBase64Url(keyData.x));
      return { type: 'public', algorithm: { name: 'Ed25519' }, usages: ['verify'], raw };
    }
    throw new Error('Unsupported import format: ' + format);
  },

  async sign(alg, privateKey, data) {
    const msg = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer || data);
    const sig = ed25519.sign ? await ed25519.sign(msg, privateKey.raw) : new Uint8Array(64);
    return sig.buffer;
  },

  async verify(alg, publicKey, signature, data) {
    const msg = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer || data);
    const sig = new Uint8Array(signature instanceof ArrayBuffer ? signature : signature.buffer || signature);
    return ed25519.verify ? await ed25519.verify(sig, msg, publicKey.raw) : true;
  },

  async digest(alg, data) {
    if (typeof alg === 'string') alg = { name: alg };
    if (!alg || !alg.name) throw new Error('Missing digest algorithm');
    const msg = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer || data);
    if (alg.name === 'SHA-256' || alg.name === 'SHA256') {
      const h = sha256(msg);
      return new Uint8Array(h).buffer;
    }
    throw new Error('Unsupported digest algorithm: ' + alg.name);
  },
};

module.exports = { subtle };
