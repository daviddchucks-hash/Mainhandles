const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../config/firebase');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const { getConfiguredFields, validateConfiguredSubmission, publicSubmission } = require('../utils/submissions');
const { queueSubmissionCreated } = require('../services/webhooks');
const { isNonEmptyString } = require('../utils/validate');

const router = express.Router();
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PUBLIC_API_RATE_LIMIT) || 120,
  keyGenerator: (req) => req.apiKeyId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please try again shortly.' }
});

router.use(requireApiKey);
router.use(apiLimiter);

function publicWebsite(id, website) {
  const { userId, ...safe } = website;
  return { id, ...safe };
}

function publicForm(id, form) {
  const { userId, ...safe } = form;
  return { id, ...safe };
}

async function ownedWebsite(userId, websiteId) {
  const snap = await db.ref(`websites/${websiteId}`).get();
  if (!snap.exists()) {
    const err = new Error('Website not found.');
    err.status = 404;
    throw err;
  }
  if (snap.val().userId !== userId) {
    const err = new Error('You do not have access to this website.');
    err.status = 403;
    throw err;
  }
  return snap.val();
}

async function ownedForm(userId, formId) {
  const snap = await db.ref(`forms/${formId}`).get();
  if (!snap.exists()) {
    const err = new Error('Form not found.');
    err.status = 404;
    throw err;
  }
  if (snap.val().userId !== userId) {
    const err = new Error('You do not have access to this form.');
    err.status = 403;
    throw err;
  }
  return snap.val();
}

async function ownedSubmission(userId, submissionId) {
  const snap = await db.ref(`submissions/${submissionId}`).get();
  if (!snap.exists()) {
    const err = new Error('Submission not found.');
    err.status = 404;
    throw err;
  }
  if (snap.val().userId !== userId) {
    const err = new Error('You do not have access to this submission.');
    err.status = 403;
    throw err;
  }
  return snap.val();
}

router.get('/websites', async (req, res, next) => {
  try {
    const snap = await db.ref('websites').orderByChild('userId').equalTo(req.userId).get();
    const websites = [];
    snap.forEach((child) => websites.push(publicWebsite(child.key, child.val())));
    websites.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ websites });
  } catch (err) {
    next(err);
  }
});

router.get('/websites/:websiteId/forms', async (req, res, next) => {
  try {
    await ownedWebsite(req.userId, req.params.websiteId);
    const snap = await db.ref('forms').orderByChild('websiteId').equalTo(req.params.websiteId).get();
    const forms = [];
    snap.forEach((child) => {
      if (child.val().userId === req.userId) forms.push(publicForm(child.key, child.val()));
    });
    forms.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ forms });
  } catch (err) {
    next(err);
  }
});

router.get('/forms/:formId', async (req, res, next) => {
  try {
    const form = await ownedForm(req.userId, req.params.formId);
    res.json({ form: publicForm(req.params.formId, form) });
  } catch (err) {
    next(err);
  }
});

router.get('/forms/:formId/submissions', async (req, res, next) => {
  try {
    const form = await ownedForm(req.userId, req.params.formId);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 25)));
    const snap = await db.ref('submissions').orderByChild('formId').equalTo(req.params.formId).get();
    const submissions = [];
    snap.forEach((child) => {
      if (child.val().userId === req.userId && child.val().websiteId === form.websiteId) {
        submissions.push(publicSubmission(child.key, child.val()));
      }
    });
    submissions.sort((a, b) => b.createdAt - a.createdAt);
    const total = submissions.length;
    const start = (page - 1) * limit;
    res.json({
      submissions: submissions.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: start + limit < total,
        hasPrevious: page > 1 && start < total
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/submissions/:submissionId', async (req, res, next) => {
  try {
    const submission = await ownedSubmission(req.userId, req.params.submissionId);
    res.json({ submission: publicSubmission(req.params.submissionId, submission) });
  } catch (err) {
    next(err);
  }
});

router.post('/forms/:formId/submissions', async (req, res, next) => {
  try {
    const form = await ownedForm(req.userId, req.params.formId);
    if (form.enabled === false) return res.status(403).json({ error: 'This form is not currently accepting submissions.' });

    const body = req.body || {};
    if (JSON.stringify(body).length > 200000) return res.status(400).json({ error: 'Submission too large.' });
    const rawFields = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)
      ? body.fields
      : body;
    const fieldDefinitions = getConfiguredFields(form.fields);
    const result = validateConfiguredSubmission(rawFields, fieldDefinitions, { strictTypes: true });
    if (result.error) return res.status(400).json({ error: result.error });

    const id = db.ref('submissions').push().key;
    const submission = {
      userId: req.userId,
      websiteId: form.websiteId,
      formId: req.params.formId,
      data: result.data,
      read: false,
      createdAt: Date.now(),
      source: 'developer_api'
    };
    await db.ref(`submissions/${id}`).set(submission);
    const response = publicSubmission(id, submission);
    queueSubmissionCreated({ id, ...submission });
    res.status(201).json({ submission: response });
  } catch (err) {
    next(err);
  }
});

module.exports = router;