const { createHash } = require('crypto');

function sha256(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  return Uint8Array.from(createHash('sha256').update(buf).digest());
}

module.exports = { sha256 };
