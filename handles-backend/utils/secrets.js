const crypto = require('crypto');

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function createApiKey() {
  const token = `hdl_live_${crypto.randomBytes(24).toString('base64url')}`;
  return {
    token,
    prefix: token.slice(0, 18),
    hash: hashSecret(token)
  };
}

function createWebhookSecret() {
  return `whsec_${crypto.randomBytes(32).toString('base64url')}`;
}

// Webhook signing secrets must be recoverable by the delivery worker, but are
// encrypted at rest so a database read cannot reveal them directly.
function encryptionKey() {
  return crypto.createHash('sha256')
    .update(process.env.WEBHOOK_ENCRYPTION_KEY || process.env.JWT_SECRET || '')
    .digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')
  ].join('.');
}

function decryptSecret(value) {
  const [ivText, tagText, encryptedText] = String(value || '').split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted secret.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivText, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = {
  hashSecret,
  safeEqualHex,
  createApiKey,
  createWebhookSecret,
  encryptSecret,
  decryptSecret
};