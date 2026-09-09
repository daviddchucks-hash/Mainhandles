const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function getOwnedFormIds(userId) {
  const snap = await db.ref('forms').orderByChild('userId').equalTo(userId).get();
  const formIds = new Set();
  snap.forEach((child) => formIds.add(child.key));
  return formIds;
}

async function listOwnedSubmissions(userId) {
  const [userSubmissionSnap, ownedFormIds] = await Promise.all([
    db.ref('submissions').orderByChild('userId').equalTo(userId).get(),
    getOwnedFormIds(userId)
  ]);

  const submissions = new Map();
  userSubmissionSnap.forEach((child) => {
    submissions.set(child.key, { id: child.key, ...child.val() });
  });

  // Older submissions may not have the current userId metadata (for example,
  // if they were created before ownership was stored on each submission).
  // The form is still an authoritative ownership boundary, so include those
  // records by the user's owned form IDs as well.
  const formSubmissionSnaps = await Promise.all(
    Array.from(ownedFormIds, (formId) =>
      db.ref('submissions').orderByChild('formId').equalTo(formId).get()
    )
  );
  formSubmissionSnaps.forEach((snap) => {
    snap.forEach((child) => {
      if (!submissions.has(child.key)) {
        submissions.set(child.key, { id: child.key, ...child.val() });
      }
    });
  });

  return Array.from(submissions.values());
}

async function getOwnedSubmission(userId, id) {
  const snap = await db.ref(`submissions/${id}`).get();
  if (!snap.exists()) {
    const err = new Error('Submission not found.');
    err.status = 404;
    throw err;
  }
  const submission = snap.val();
  if (submission.userId === userId) return submission;

  // Keep access to submissions created by older versions of the API where
  // userId was not copied onto the submission record.
  const formSnap = submission.formId
    ? await db.ref(`forms/${submission.formId}`).get()
    : null;
  if (formSnap && formSnap.exists() && formSnap.val().userId === userId) {
    return submission;
  }

  {
    const err = new Error('You do not have access to this submission.');
    err.status = 403;
    throw err;
  }
}

// GET /api/submissions?websiteId=&formId=&read=true|false&search=
router.get('/', async (req, res, next) => {
  try {
    const { websiteId, formId, read, search } = req.query;

    let submissions = await listOwnedSubmissions(req.userId);

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
