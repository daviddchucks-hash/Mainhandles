const crypto = require('crypto');

const EVENT_NAME = 'submission.created';

function webhookMatches(webhook, submission) {
  if (webhook.enabled === false) return false;
  if (webhook.userId !== submission.userId) return false;
  if (webhook.websiteId && webhook.websiteId !== submission.websiteId) return false;
  if (webhook.formId && webhook.formId !== submission.formId) return false;
  return webhook.event === EVENT_NAME;
}

function signWebhookBody(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

function webhookPayload(submission, isTest = false, deliveryId = null) {
  return {
    id: isTest ? `evt_test_${deliveryId}` : `evt_${submission.id}`,
    object: 'event',
    type: EVENT_NAME,
    createdAt: Date.now(),
    test: isTest,
    data: {
      object: {
        id: submission.id,
        websiteId: submission.websiteId,
        formId: submission.formId,
        data: submission.data,
        read: submission.read,
        createdAt: submission.createdAt
      }
    }
  };
}

module.exports = { EVENT_NAME, webhookMatches, signWebhookBody, webhookPayload };