const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function getOwnedSubmission(userId, id) {
  const snap = await db.ref(`submissions/${id}`).get();
  if (!snap.exists()) {
    const err = new Error('Submission not found.');
    err.status = 404;
    throw err;
  }
  const submission = snap.val();
  if (submission.userId !== userId) {
    const err = new Error('You do not have access to this submission.');
    err.status = 403;
    throw err;
  }
  return submission;
}

// GET /api/submissions?websiteId=&formId=&read=true|false&search=
router.get('/', async (req, res, next) => {
  try {
    const { websiteId, formId, read, search } = req.query;

    const snap = await db.ref('submissions').orderByChild('userId').equalTo(req.userId).get();
    let submissions = [];
    snap.forEach((child) => submissions.push({ id: child.key, ...child.val() }));

    if (websiteId) submissions = submissions.filter((s) => s.websiteId === websiteId);
    if (formId) submissions = submissions.filter((s) => s.formId === formId);
    if (read === 'true') submissions = submissions.filter((s) => s.read === true);
    if (read === 'false') submissions = submissions.filter((s) => s.read === false);

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      submissions = submissions.filter((s) =>
        Object.values(s.data || {}).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    submissions.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

// GET /api/submissions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const submission = await getOwnedSubmission(req.userId, req.params.id);
    res.json({ submission: { id: req.params.id, ...submission } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/submissions/:id - mark read/unread
router.patch('/:id', async (req, res, next) => {
  try {
    await getOwnedSubmission(req.userId, req.params.id);
    const { read } = req.body || {};
    if (typeof read !== 'boolean') {
      return res.status(400).json({ error: '"read" must be true or false.' });
    }
    await db.ref(`submissions/${req.params.id}`).update({ read });
    const snap = await db.ref(`submissions/${req.params.id}`).get();
    res.json({ submission: { id: req.params.id, ...snap.val() } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/submissions/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await getOwnedSubmission(req.userId, req.params.id);
    await db.ref(`submissions/${req.params.id}`).remove();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
