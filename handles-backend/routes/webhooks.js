const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { createWebhookSecret, encryptSecret } = require('../utils/secrets');
const { isNonEmptyString, isUrl } = require('../utils/validate');
const { EVENT_NAME, safeDelivery, createDelivery, processDelivery, retryDelivery } = require('../services/webhooks');

const router = express.Router();
router.use(requireAuth);

function publicWebhook(id, webhook) {
  const { userId, secretEncrypted, ...safe } = webhook;
  return { id, ...safe };
}

async function getOwnedWebhook(userId, webhookId) {
  const snap = await db.ref(`webhooks/${webhookId}`).get();
  if (!snap.exists()) {
    const err = new Error('Webhook not found.');
    err.status = 404;
    throw err;
  }
  if (snap.val().userId !== userId) {
    const err = new Error('You do not have access to this webhook.');
    err.status = 403;
    throw err;
  }
  return snap.val();
}

async function validateScope(userId, websiteId, formId) {
  if (formId) {
    const formSnap = await db.ref(`forms/${formId}`).get();
    if (!formSnap.exists()) {
      const err = new Error('Form not found.');
      err.status = 404;
      throw err;
    }
    const form = formSnap.val();
    if (form.userId !== userId) {
      const err = new Error('You do not have access to this form.');
      err.status = 403;
      throw err;
    }
    if (websiteId && form.websiteId !== websiteId) {
      const err = new Error('The selected form does not belong to the selected website.');
      err.status = 400;
      throw err;
    }
    return { websiteId: websiteId || form.websiteId, formId };
  }
  if (websiteId) {
    const websiteSnap = await db.ref(`websites/${websiteId}`).get();
    if (!websiteSnap.exists()) {
      const err = new Error('Website not found.');
      err.status = 404;
      throw err;
    }
    if (websiteSnap.val().userId !== userId) {
      const err = new Error('You do not have access to this website.');
      err.status = 403;
      throw err;
    }
  }
  return { websiteId: websiteId || null, formId: null };
}

router.get('/', async (req, res, next) => {
  try {
    const snap = await db.ref('webhooks').orderByChild('userId').equalTo(req.userId).get();
    const webhooks = [];
    snap.forEach((child) => webhooks.push(publicWebhook(child.key, child.val())));
    webhooks.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, endpointUrl, event, websiteId, formId, enabled } = req.body || {};
    if (!isNonEmptyString(name, 120)) return res.status(400).json({ error: 'Please provide a webhook name.' });
    if (!isUrl(endpointUrl)) return res.status(400).json({ error: 'Please provide a valid endpoint URL.' });
    if (event !== EVENT_NAME) return res.status(400).json({ error: `Only ${EVENT_NAME} is currently supported.` });
    const scope = await validateScope(req.userId, websiteId || null, formId || null);
    const secret = createWebhookSecret();
    const id = db.ref('webhooks').push().key;
    const webhook = {
      userId: req.userId,
      name: name.trim(),
      endpointUrl: endpointUrl.trim(),
      event,
      websiteId: scope.websiteId,
      formId: scope.formId,
      enabled: enabled !== false,
      secretEncrypted: encryptSecret(secret),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await db.ref(`webhooks/${id}`).set(webhook);
    res.status(201).json({ webhook: publicWebhook(id, webhook), secret });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rotate-secret', async (req, res, next) => {
  try {
    const webhook = await getOwnedWebhook(req.userId, req.params.id);
    const secret = createWebhookSecret();
    const updates = {
      secretEncrypted: encryptSecret(secret),
      updatedAt: Date.now()
    };
    await db.ref(`webhooks/${req.params.id}`).update(updates);
    res.json({ webhook: publicWebhook(req.params.id, { ...webhook, ...updates }), secret });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const current = await getOwnedWebhook(req.userId, req.params.id);
    const { name, endpointUrl, enabled, event, websiteId, formId } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      if (!isNonEmptyString(name, 120)) return res.status(400).json({ error: 'Please provide a valid webhook name.' });
      updates.name = name.trim();
    }
    if (endpointUrl !== undefined) {
      if (!isUrl(endpointUrl)) return res.status(400).json({ error: 'Please provide a valid endpoint URL.' });
      updates.endpointUrl = endpointUrl.trim();
    }
    if (enabled !== undefined) updates.enabled = !!enabled;
    if (event !== undefined && event !== EVENT_NAME) return res.status(400).json({ error: `Only ${EVENT_NAME} is currently supported.` });
    if (websiteId !== undefined || formId !== undefined) {
      const scope = await validateScope(req.userId, websiteId || null, formId || null);
      updates.websiteId = scope.websiteId;
      updates.formId = scope.formId;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update.' });
    updates.updatedAt = Date.now();
    await db.ref(`webhooks/${req.params.id}`).update(updates);
    res.json({ webhook: publicWebhook(req.params.id, { ...current, ...updates }) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getOwnedWebhook(req.userId, req.params.id);
    const deliveries = await db.ref('webhookDeliveries').orderByChild('webhookId').equalTo(req.params.id).get();
    const updates = { [`webhooks/${req.params.id}`]: null };
    deliveries.forEach((child) => { updates[`webhookDeliveries/${child.key}`] = null; });
    await db.ref().update(updates);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/deliveries', async (req, res, next) => {
  try {
    await getOwnedWebhook(req.userId, req.params.id);
    const snap = await db.ref('webhookDeliveries').orderByChild('webhookId').equalTo(req.params.id).get();
    const deliveries = [];
    snap.forEach((child) => deliveries.push(safeDelivery(child.key, child.val())));
    deliveries.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ deliveries: deliveries.slice(0, 100) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/test', async (req, res, next) => {
  try {
    const webhook = await getOwnedWebhook(req.userId, req.params.id);
    const delivery = await createDelivery(req.params.id, webhook, {
      id: null,
      userId: req.userId,
      websiteId: webhook.websiteId || null,
      formId: webhook.formId || null,
      data: { handles_test: true },
      read: false,
      createdAt: Date.now()
    }, { test: true });
    setImmediate(() => processDelivery(delivery.id).catch((err) => console.error('Test webhook failed:', err.message)));
    res.status(202).json({ delivery: safeDelivery(delivery.id, delivery) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/deliveries/:deliveryId/retry', async (req, res, next) => {
  try {
    await getOwnedWebhook(req.userId, req.params.id);
    const deliverySnap = await db.ref(`webhookDeliveries/${req.params.deliveryId}`).get();
    if (!deliverySnap.exists()) return res.status(404).json({ error: 'Delivery not found.' });
    if (deliverySnap.val().webhookId !== req.params.id) {
      return res.status(403).json({ error: 'You do not have access to this delivery.' });
    }
    const delivery = await retryDelivery(req.userId, req.params.deliveryId);
    res.status(202).json({ delivery: safeDelivery(delivery.id, delivery) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;