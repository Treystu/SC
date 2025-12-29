// Jest-friendly CommonJS shim for @noble/hashes/utils
const crypto = require('crypto');

function randomBytes(n) {
  return Uint8Array.from(crypto.randomBytes(n));
}

function bytesToHex(b) {
  return Buffer.from(b).toString('hex');
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

module.exports = { randomBytes, bytesToHex, hexToBytes };
