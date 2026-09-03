const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { isEmail, isNonEmptyString, sanitizeEmailKey } = require('../utils/validate');

const router = express.Router();

// Slow down brute-force login/register attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

function signToken(uid) {
  return jwt.sign({ uid }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function publicUser(uid, user) {
  return { id: uid, name: user.name, email: user.email, createdAt: user.createdAt };
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Please provide your name.' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const emailKey = sanitizeEmailKey(email);
    const existing = await db.ref(`emailIndex/${emailKey}`).get();
    if (existing.exists()) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const uid = db.ref('users').push().key;
    const now = Date.now();

    const user = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      createdAt: now
    };

    await db.ref(`users/${uid}`).set(user);
    await db.ref(`emailIndex/${emailKey}`).set(uid);

    const token = signToken(uid);
    res.status(201).json({ token, user: publicUser(uid, user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid email and password.' });
    }

    const emailKey = sanitizeEmailKey(email);
    const uidSnap = await db.ref(`emailIndex/${emailKey}`).get();
    if (!uidSnap.exists()) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const uid = uidSnap.val();

    const userSnap = await db.ref(`users/${uid}`).get();
    if (!userSnap.exists()) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = userSnap.val();

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(uid);
    res.json({ token, user: publicUser(uid, user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const snap = await db.ref(`users/${req.userId}`).get();
    if (!snap.exists()) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: publicUser(req.userId, snap.val()) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/account - update name and/or password
router.patch('/account', requireAuth, async (req, res, next) => {
  try {
    const { name, currentPassword, newPassword } = req.body || {};
    const userRef = db.ref(`users/${req.userId}`);
    const snap = await userRef.get();
    if (!snap.exists()) return res.status(404).json({ error: 'User not found.' });
    const user = snap.val();

    const updates = {};

    if (name !== undefined) {
      if (!isNonEmptyString(name, 120)) {
        return res.status(400).json({ error: 'Please provide a valid name.' });
      }
      updates.name = name.trim();
    }

    if (newPassword !== undefined) {
      if (typeof currentPassword !== 'string') {
        return res.status(400).json({ error: 'Current password is required to set a new password.' });
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      }
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    await userRef.update(updates);
    const updated = { ...user, ...updates };
    res.json({ user: publicUser(req.userId, updated) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
