const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../config/firebase');
const { sanitizeSubmissionFields } = require('../utils/validate');

const router = express.Router();

// Public endpoint - hit directly by visitor browsers on customer websites.
// Rate limited per-IP to curb spam/abuse.
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please try again shortly.' }
});

function getConfiguredFields(formFields) {
  if (Array.isArray(formFields)) return formFields.filter(Boolean);
  if (formFields && typeof formFields === 'object') return Object.values(formFields).filter(Boolean);
  return [];
}

function comparableFieldName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Older customer sites often use first-name/firstName while a dashboard form
// uses first_name. Keep the dashboard's canonical key, but accept these
// harmless naming variations so a valid form is not discarded as empty.
function mapIncomingFieldNames(rawFields, fields) {
  if (!rawFields || typeof rawFields !== 'object') return {};

  const aliases = new Map();
  fields.forEach((field) => {
    if (!field || !field.name) return;
    aliases.set(comparableFieldName(field.name), field.name);
    if (field.label) aliases.set(comparableFieldName(field.label), field.name);
  });

  const mapped = {};
  Object.keys(rawFields).forEach((key) => {
    if (key === 'handles_hp') return;
    const target = fields.some((field) => field && field.name === key)
      ? key
      : aliases.get(comparableFieldName(key));
    if (target && mapped[target] === undefined) mapped[target] = rawFields[key];
  });
  return mapped;
}

// POST /api/public/submit/:formId
router.post('/submit/:formId', submitLimiter, async (req, res, next) => {
  try {
    const { formId } = req.params;
    const body = req.body || {};

    // Basic request size guard (belt-and-suspenders alongside express.json limit)
    if (JSON.stringify(body).length > 200000) {
      return res.status(413).json({ error: 'Submission too large.' });
    }

    const formSnap = await db.ref(`forms/${formId}`).get();
    if (!formSnap.exists()) {
      return res.status(404).json({ error: 'This form no longer exists.' });
    }
    const form = formSnap.val();

    if (form.enabled === false) {
      return res.status(403).json({ error: 'This form is not currently accepting submissions.' });
    }

    // Honeypot: if the hidden "handles_hp" field was filled, it's a bot -
    // pretend success without saving anything.
    if (body.handles_hp) {
      return res.status(201).json({ success: true });
    }

    // `fields` is the current payload shape. Falling back to the body keeps
    // older embeds working if they posted the field values at the top level.
    const rawFields = body.fields && typeof body.fields === 'object'
      ? body.fields
      : body;
    const fieldDefinitions = getConfiguredFields(form.fields);
    const allowedFieldNames = fieldDefinitions
      .map((field) => field && field.name)
      .filter(Boolean);
    const data = sanitizeSubmissionFields(
      mapIncomingFieldNames(rawFields, fieldDefinitions),
      allowedFieldNames
    );

    const requiredMissing = fieldDefinitions
      .filter((f) => f.required)
      .filter((f) => {
        const value = data[f.name];
        return value === undefined || value === null ||
          (typeof value === 'string' && value.trim() === '');
      });
    if (requiredMissing.length > 0) {
      return res.status(400).json({
        error: `Missing required field(s): ${requiredMissing.map((f) => f.label).join(', ')}`
      });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Submission contained no valid fields.' });
    }

    const id = db.ref('submissions').push().key;
    const submission = {
      userId: form.userId,
      websiteId: form.websiteId,
      formId,
      data,
      read: false,
      createdAt: Date.now(),
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 100)
    };

    await db.ref(`submissions/${id}`).set(submission);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/form/:formId - lets the integration script know which
// fields exist (used for lightweight client-side validation), no PII returned.
router.get('/form/:formId', async (req, res, next) => {
  try {
    const snap = await db.ref(`forms/${req.params.formId}`).get();
    if (!snap.exists()) return res.status(404).json({ error: 'Form not found.' });
    const form = snap.val();
    res.json({
      form: {
        id: req.params.formId,
        name: form.name,
        enabled: form.enabled,
        fields: getConfiguredFields(form.fields)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
