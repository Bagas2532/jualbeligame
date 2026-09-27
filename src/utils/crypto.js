const crypto = require('crypto');

// Server-side encryption at rest for account credentials handed over during escrow.
// Key must be a 32-byte value, provided as base64 via ACCOUNT_SECRET_KEY_BASE64.
// This protects data in the database; it is separate from TLS in transit.
function getKey() {
  const key = Buffer.from(process.env.ACCOUNT_SECRET_KEY_BASE64 || '', 'base64');
  if (key.length !== 32) {
    throw new Error('ACCOUNT_SECRET_KEY_BASE64 must decode to exactly 32 bytes');
  }
  return key;
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decrypt({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// Constant-time comparison for webhook signatures
function safeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { encrypt, decrypt, safeEqual };
