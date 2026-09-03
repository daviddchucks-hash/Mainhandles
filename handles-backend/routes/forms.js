const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { isNonEmptyString } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const FIELD_TYPES = new Set(['text', 'email', 'tel', 'number', 'date', 'time', 'textarea', 'select', 'checkbox']);

function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 40) {
    return 'A form needs between 1 and 40 fields.';
  }
  const seen = new Set();
  for (const f of fields) {
    if (!f || !isNonEmptyString(f.name, 60) || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.name)) {
      return 'Each field needs a valid name (letters, numbers, underscore, starting with a letter).';
    }
    if (seen.has(f.name)) return `Duplicate field name: ${f.name}`;
    seen.add(f.name);
    if (!isNonEmptyString(f.label, 120)) return 'Each field needs a label.';
    if (f.type && !FIELD_TYPES.has(f.type)) return `Unsupported field type: ${f.type}`;
  }
  return null;
}

function normalizeFields(fields) {
  return fields.map((f) => ({
    name: f.name.trim(),
    label: f.label.trim(),
    type: FIELD_TYPES.has(f.type) ? f.type : 'text',
    required: !!f.required
  }));
}

async function getOwnedForm(userId, formId) {
  const snap = await db.ref(`forms/${formId}`).get();
  if (!snap.exists()) {
    const err = new Error('Form not found.');
    err.status = 404;
    throw err;
  }
  const form = snap.val();
  if (form.userId !== userId) {
    const err = new Error('You do not have access to this form.');
    err.status = 403;
    throw err;
  }
  return form;
}

async function getOwnedWebsite(userId, websiteId) {
  const snap = await db.ref(`websites/${websiteId}`).get();
  if (!snap.exists() || snap.val().userId !== userId) {
    const err = new Error('Website not found.');
    err.status = 404;
    throw err;
  }
  return snap.val();
}

// GET /api/forms?websiteId=optional
router.get('/', async (req, res, next) => {
  try {
    const { websiteId } = req.query;
    const snap = await db.ref('forms').orderByChild('userId').equalTo(req.userId).get();
    let forms = [];
    snap.forEach((child) => forms.push({ id: child.key, ...child.val() }));
    if (websiteId) forms = forms.filter((f) => f.websiteId === websiteId);
    forms.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ forms });
  } catch (err) {
    next(err);
  }
});

// POST /api/forms
router.post('/', async (req, res, next) => {
  try {
    const { websiteId, name, fields } = req.body || {};
    if (!isNonEmptyString(websiteId, 200)) {
      return res.status(400).json({ error: 'websiteId is required.' });
    }
    await getOwnedWebsite(req.userId, websiteId);

    if (!isNonEmptyString(name, 150)) {
      return res.status(400).json({ error: 'Please provide a form name.' });
    }
    const fieldError = validateFields(fields);
    if (fieldError) return res.status(400).json({ error: fieldError });

    const id = db.ref('forms').push().key;
    const form = {
      userId: req.userId,
      websiteId,
      name: name.trim(),
      fields: normalizeFields(fields),
      enabled: true,
      createdAt: Date.now()
    };
    await db.ref(`forms/${id}`).set(form);
    res.status(201).json({ form: { id, ...form } });
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:id
router.get('/:id', async (req, res, next) => {
  try {
    const form = await getOwnedForm(req.userId, req.params.id);
    res.json({ form: { id: req.params.id, ...form } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/forms/:id - rename, edit fields, enable/disable
router.patch('/:id', async (req, res, next) => {
  try {
    await getOwnedForm(req.userId, req.params.id);
    const { name, fields, enabled } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      if (!isNonEmptyString(name, 150)) return res.status(400).json({ error: 'Please provide a valid form name.' });
      updates.name = name.trim();
    }
    if (fields !== undefined) {
      const fieldError = validateFields(fields);
      if (fieldError) return res.status(400).json({ error: fieldError });
      updates.fields = normalizeFields(fields);
    }
    if (enabled !== undefined) {
      updates.enabled = !!enabled;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    await db.ref(`forms/${req.params.id}`).update(updates);
    const snap = await db.ref(`forms/${req.params.id}`).get();
    res.json({ form: { id: req.params.id, ...snap.val() } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/forms/:id - cascades to its submissions
router.delete('/:id', async (req, res, next) => {
  try {
    await getOwnedForm(req.userId, req.params.id);
    const formId = req.params.id;

    const updates = { [`forms/${formId}`]: null };
    const subsSnap = await db.ref('submissions').orderByChild('formId').equalTo(formId).get();
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
