const { createHash, randomBytes } = require('crypto');

function hash(data) {
  return Buffer.from(createHash('sha256').update(Buffer.from(data || [])).digest());
}

function toUint8(b) { return Uint8Array.from(b); }

const ed25519 = {
  getPublicKey: (priv) => {
    // deterministic pseudo-public: sha256(priv) truncated
    const h = hash(priv);
    return Uint8Array.from(h.slice(0, 32));
  },
  sign: (message, priv) => {
    // derive public from private and sign as hash(pub || message)
    const pub = ed25519.getPublicKey(priv);
    const h = hash(Buffer.concat([Buffer.from(pub || []), Buffer.from(message || [])]));
    return Uint8Array.from(Buffer.concat([h, h]).slice(0, 64));
  },
  verify: (sig, message, pub) => {
    const expected = (() => {
      const h = hash(Buffer.concat([Buffer.from(pub || []), Buffer.from(message || [])]));
      return Uint8Array.from(Buffer.concat([h, h]).slice(0, 64));
    })();
    return Buffer.from(expected).equals(Buffer.from(sig));
  },
  utils: {
    toMontgomery: (pub) => {
      return toUint8(hash(pub).slice(0, 32));
    },
    toMontgomerySecret: (priv) => {
      return toUint8(hash(priv).slice(0, 32));
    },
    randomSecretKey: () => {
      return toUint8(randomBytes(32));
    }
  }
};

const x25519 = {
  getPublicKey: (priv) => {
    return toUint8(hash(priv).slice(0, 32));
  },
  getSharedSecret: (a, b) => {
    // Derive compressed representations for private and public inputs
    const aDerived = Buffer.from(hash(a || []).slice(0, 32));
    const bDerived = Buffer.from(b || []);
    // Ensure deterministic, symmetric ordering by lexicographic sort
    const first = Buffer.compare(aDerived, bDerived) <= 0 ? aDerived : bDerived;
    const second = Buffer.compare(aDerived, bDerived) <= 0 ? bDerived : aDerived;
    const concat = Buffer.concat([first, second]);
    return toUint8(hash(concat));
  }
};

// Add utils.randomSecretKey for x25519 as well
x25519.utils = {
  randomSecretKey: () => Uint8Array.from(randomBytes(32))
};

module.exports = { ed25519, x25519 };
