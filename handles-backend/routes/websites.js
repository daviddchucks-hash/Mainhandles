const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { isNonEmptyString, isUrl } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// GET /api/websites - list this user's websites
router.get('/', async (req, res, next) => {
  try {
    const snap = await db.ref('websites').orderByChild('userId').equalTo(req.userId).get();
    const websites = [];
    snap.forEach((child) => {
      websites.push({ id: child.key, ...child.val() });
    });
    websites.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ websites });
  } catch (err) {
    next(err);
  }
});

// POST /api/websites - create a website
router.post('/', async (req, res, next) => {
  try {
    const { name, url } = req.body || {};
    if (!isNonEmptyString(name, 200)) {
      return res.status(400).json({ error: 'Please provide a website name.' });
    }
    if (!isUrl(url)) {
      return res.status(400).json({ error: 'Please provide a valid URL (including http:// or https://).' });
    }

    const id = db.ref('websites').push().key;
    const website = {
      userId: req.userId,
      name: name.trim(),
      url: url.trim(),
      createdAt: Date.now()
    };
    await db.ref(`websites/${id}`).set(website);
    res.status(201).json({ website: { id, ...website } });
  } catch (err) {
    next(err);
  }
});

// Helper: fetch a website and verify ownership. Throws 404/403-style errors.
async function getOwnedWebsite(userId, websiteId) {
  const snap = await db.ref(`websites/${websiteId}`).get();
  if (!snap.exists()) {
    const err = new Error('Website not found.');
    err.status = 404;
    throw err;
  }
  const website = snap.val();
  if (website.userId !== userId) {
    const err = new Error('You do not have access to this website.');
    err.status = 403;
    throw err;
  }
  return website;
}

// GET /api/websites/:id
router.get('/:id', async (req, res, next) => {
  try {
    const website = await getOwnedWebsite(req.userId, req.params.id);
    res.json({ website: { id: req.params.id, ...website } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/websites/:id
router.patch('/:id', async (req, res, next) => {
  try {
    await getOwnedWebsite(req.userId, req.params.id);
    const { name, url } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      if (!isNonEmptyString(name, 200)) return res.status(400).json({ error: 'Please provide a valid website name.' });
      updates.name = name.trim();
    }
    if (url !== undefined) {
      if (!isUrl(url)) return res.status(400).json({ error: 'Please provide a valid URL.' });
      updates.url = url.trim();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }
    await db.ref(`websites/${req.params.id}`).update(updates);
    const snap = await db.ref(`websites/${req.params.id}`).get();
    res.json({ website: { id: req.params.id, ...snap.val() } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/websites/:id - cascades to its forms and submissions
router.delete('/:id', async (req, res, next) => {
  try {
    await getOwnedWebsite(req.userId, req.params.id);
    const websiteId = req.params.id;

    const formsSnap = await db.ref('forms').orderByChild('websiteId').equalTo(websiteId).get();
    const formIds = [];
    formsSnap.forEach((child) => formIds.push(child.key));

    const updates = {};
    updates[`websites/${websiteId}`] = null;

    for (const formId of formIds) {
      updates[`forms/${formId}`] = null;
    }

    // Remove submissions belonging to this website
    const subsSnap = await db.ref('submissions').orderByChild('websiteId').equalTo(websiteId).get();
    subsSnap.forEach((child) => {
      updates[`submissions/${child.key}`] = null;
    });

    await db.ref().update(updates);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
