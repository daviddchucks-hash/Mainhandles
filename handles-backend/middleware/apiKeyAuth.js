const { db } = require('../config/firebase');
const { hashSecret, safeEqualHex } = require('../utils/secrets');

function invalidKey(res) {
  return res.status(401).json({ error: 'Missing or invalid API key.' });
}

async function requireApiKey(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token || !token.startsWith('hdl_live_')) {
    return invalidKey(res);
  }

  try {
    const prefix = token.slice(0, 18);
    const snap = await db.ref('apiKeys').orderByChild('prefix').equalTo(prefix).get();
    let match = null;
    snap.forEach((child) => {
      const key = child.val();
      const expiresAt = key.expiresAt ? new Date(`${key.expiresAt}T23:59:59.999Z`).getTime() : null;
      if (!match && !key.revokedAt && (!expiresAt || expiresAt >= Date.now()) && safeEqualHex(key.hash, hashSecret(token))) {
        match = { id: child.key, ...key };
      }
    });

    if (!match) return invalidKey(res);
    req.apiKeyId = match.id;
    req.userId = match.userId;
    req.apiKey = match;

    // Do not make API calls wait on analytics metadata.
    db.ref(`apiKeys/${match.id}`).update({ lastUsedAt: Date.now() }).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireApiKey };