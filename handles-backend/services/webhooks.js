const { db } = require('../config/firebase');
const { decryptSecret } = require('../utils/secrets');
const { EVENT_NAME, webhookMatches, signWebhookBody, webhookPayload } = require('../utils/webhook');
const DEFAULT_TIMEOUT_MS = 10000;
const RETRY_DELAYS_MS = [1000, 5000, 30000];

function safeDelivery(id, delivery) {
  const { payload, ...safe } = delivery || {};
  return { id, ...safe };
}

async function createDelivery(webhookId, webhook, submission, options = {}) {
  const deliveryRef = db.ref('webhookDeliveries').push();
  const deliveryId = deliveryRef.key;
  const payload = webhookPayload(submission, !!options.test, deliveryId);
  const now = Date.now();
  const delivery = {
    webhookId,
    userId: webhook.userId,
    event: EVENT_NAME,
    submissionId: options.test ? null : submission.id,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    payload: JSON.stringify(payload)
  };
  await deliveryRef.set(delivery);
  return { id: deliveryId, ...delivery };
}

async function queueSubmissionCreated(submission) {
  try {
    const snap = await db.ref('webhooks').orderByChild('userId').equalTo(submission.userId).get();
    const deliveries = [];
    snap.forEach((child) => {
      const webhook = child.val();
      if (webhookMatches(webhook, submission)) {
        deliveries.push(createDelivery(child.key, webhook, submission));
      }
    });
    const created = await Promise.all(deliveries);
    created.forEach((delivery) => {
      setImmediate(() => processDelivery(delivery.id).catch((err) => {
        console.error('Webhook delivery worker failed:', err.message);
      }));
    });
  } catch (err) {
    // Webhook work is deliberately isolated from form submission success.
    console.error('Could not enqueue webhook delivery:', err.message);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableStatus(status) {
  return status === 429 || status >= 500;
}

async function sendAttempt(webhook, delivery, payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const secret = decryptSecret(webhook.secretEncrypted);
  const signature = signWebhookBody(secret, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WEBHOOK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(webhook.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Handles-Webhooks/1.0',
        'X-Handles-Signature': signature,
        'X-Handles-Event': EVENT_NAME,
        'X-Handles-Delivery': delivery.id
      },
      body,
      signal: controller.signal
    });
    const responseBody = await response.text();
    return {
      ok: response.ok,
      retryable: retryableStatus(response.status),
      status: response.status,
      responseBody: responseBody.slice(0, 2000)
    };
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      error: err.name === 'AbortError' ? 'Webhook request timed out.' : err.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordAttempt(deliveryId, attempt, result) {
  const now = Date.now();
  const history = {
    attemptedAt: now,
    status: result.ok ? 'delivered' : 'failed',
    responseStatus: result.status || null,
    error: result.error || null
  };
  await db.ref(`webhookDeliveries/${deliveryId}`).update({
    attempts: attempt,
    updatedAt: now,
    lastAttemptAt: now,
    responseStatus: result.status || null,
    responseBody: result.responseBody || null,
    lastError: result.error || null,
    [`attemptHistory/${attempt}`]: history
  });
}

async function processDelivery(deliveryId) {
  const deliverySnap = await db.ref(`webhookDeliveries/${deliveryId}`).get();
  if (!deliverySnap.exists()) return;
  const delivery = deliverySnap.val();
  const webhookSnap = await db.ref(`webhooks/${delivery.webhookId}`).get();
  if (!webhookSnap.exists()) {
    await db.ref(`webhookDeliveries/${deliveryId}`).update({
      status: 'failed',
      lastError: 'Webhook no longer exists.',
      updatedAt: Date.now()
    });
    return;
  }
  const webhook = webhookSnap.val();
  const payload = delivery.payload || (delivery.submissionId
    ? JSON.stringify(webhookPayload({
      id: delivery.submissionId,
      websiteId: webhook.websiteId,
      formId: webhook.formId,
      data: {},
      read: false,
      createdAt: Date.now()
    }))
    : null);
  if (!payload) return;

  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendAttempt(webhook, { id: deliveryId }, payload);
    await recordAttempt(deliveryId, attempt, result);
    if (result.ok) {
      await db.ref(`webhookDeliveries/${deliveryId}`).update({
        status: 'delivered',
        deliveredAt: Date.now(),
        nextAttemptAt: null,
        updatedAt: Date.now()
      });
      return;
    }
    if (!result.retryable || attempt >= maxAttempts) {
      await db.ref(`webhookDeliveries/${deliveryId}`).update({
        status: 'failed',
        nextAttemptAt: null,
        updatedAt: Date.now()
      });
      return;
    }
    const nextAttemptAt = Date.now() + RETRY_DELAYS_MS[attempt - 1];
    await db.ref(`webhookDeliveries/${deliveryId}`).update({ nextAttemptAt, status: 'retrying' });
    await wait(RETRY_DELAYS_MS[attempt - 1]);
  }
}

async function retryDelivery(userId, deliveryId) {
  const deliverySnap = await db.ref(`webhookDeliveries/${deliveryId}`).get();
  if (!deliverySnap.exists()) {
    const err = new Error('Delivery not found.');
    err.status = 404;
    throw err;
  }
  const delivery = deliverySnap.val();
  if (delivery.userId !== userId) {
    const err = new Error('You do not have access to this delivery.');
    err.status = 403;
    throw err;
  }
  await db.ref(`webhookDeliveries/${deliveryId}`).update({
    status: 'pending',
    updatedAt: Date.now(),
    nextAttemptAt: null,
    lastError: null
  });
  setImmediate(() => processDelivery(deliveryId).catch((err) => {
    console.error('Manual webhook retry failed:', err.message);
  }));
  return { id: deliveryId, ...delivery, status: 'pending' };
}

module.exports = {
  EVENT_NAME,
  webhookMatches,
  signWebhookBody,
  webhookPayload,
  safeDelivery,
  createDelivery,
  queueSubmissionCreated,
  processDelivery,
  retryDelivery
};