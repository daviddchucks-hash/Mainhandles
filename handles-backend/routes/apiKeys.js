const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { createApiKey } = require('../utils/secrets');
const { isNonEmptyString, isDateOnly } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

function publicKey(id, key) {
  return {
    id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt || null,
    expiresAt: key.expiresAt || null,
    revokedAt: key.revokedAt || null
  };
}

router.get('/', async (req, res, next) => {
  try {
    const snap = await db.ref('apiKeys').orderByChild('userId').equalTo(req.userId).get();
    const keys = [];
    snap.forEach((child) => keys.push(publicKey(child.key, child.val())));
    keys.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ apiKeys: keys });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, expiresAt } = req.body || {};
    if (!isNonEmptyString(name, 100)) {
      return res.status(400).json({ error: 'Please provide a name for this API key.' });
    }
    if (!isDateOnly(expiresAt)) {
      return res.status(400).json({ error: 'Please provide a valid expiration date (YYYY-MM-DD).' });
    }

    const generated = createApiKey();
    const id = db.ref('apiKeys').push().key;
    const key = {
      userId: req.userId,
      name: name.trim(),
      prefix: generated.prefix,
      hash: generated.hash,
      createdAt: Date.now(),
      expiresAt,
      revokedAt: null
    };
    await db.ref(`apiKeys/${id}`).set(key);
    // The raw token is intentionally returned only at creation time.
    res.status(201).json({ apiKey: publicKey(id, key), secret: generated.token });
  } catch (err) {
    next(err);
  }
});

async function revoke(req, res, next) {
  try {
    const ref = db.ref(`apiKeys/${req.params.id}`);
    const snap = await ref.get();
    if (!snap.exists()) return res.status(404).json({ error: 'API key not found.' });
    if (snap.val().userId !== req.userId) return res.status(403).json({ error: 'You do not have access to this API key.' });
    const revokedAt = Date.now();
    await ref.update({ revokedAt });
    res.json({ apiKey: publicKey(req.params.id, { ...snap.val(), revokedAt }) });
  } catch (err) {
    next(err);
  }
}

router.post('/:id/revoke', revoke);
router.delete('/:id', revoke);

module.exports = router;