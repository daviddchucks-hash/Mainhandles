const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.JWT_SECRET = 'test-only-secret';

const {
  createApiKey,
  hashSecret,
  safeEqualHex,
  createWebhookSecret,
  encryptSecret,
  decryptSecret
} = require('../utils/secrets');
const {
  getConfiguredFields,
  validateConfiguredSubmission,
  publicSubmission
} = require('../utils/submissions');
const { isDateOnly } = require('../utils/validate');
const { webhookMatches, signWebhookBody } = require('../utils/webhook');

test('API keys are random, prefixed, and stored as one-way hashes', () => {
  const first = createApiKey();
  const second = createApiKey();
  assert.match(first.token, /^hdl_live_[A-Za-z0-9_-]+$/);
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashSecret(first.token));
  assert.equal(safeEqualHex(first.hash, hashSecret(first.token)), true);
  assert.equal(safeEqualHex(first.hash, hashSecret(second.token)), false);
  assert.equal(first.hash.includes(first.token), false);
});

test('webhook secrets encrypt and decrypt without storing plaintext', () => {
  const secret = createWebhookSecret();
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
});

test('API-key expiration accepts real calendar dates only', () => {
  assert.equal(isDateOnly('2030-02-28'), true);
  assert.equal(isDateOnly('2030-02-30'), false);
  assert.equal(isDateOnly('not-a-date'), false);
});

test('developer submissions accept configured fields and reject invalid required/type data', () => {
  const fields = getConfiguredFields([
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'age', label: 'Age', type: 'number', required: false }
  ]);
  const valid = validateConfiguredSubmission({ Email: 'person@example.com', age: '42' }, fields, { strictTypes: true });
  assert.deepEqual(valid.data, { email: 'person@example.com', age: '42' });
  assert.match(validateConfiguredSubmission({ age: '42' }, fields, { strictTypes: true }).error, /Email/);
  assert.match(validateConfiguredSubmission({ email: 'not-an-email' }, fields, { strictTypes: true }).error, /valid email/);
  assert.equal(validateConfiguredSubmission({ email: 'person@example.com', extra: 'ignored' }, fields, { strictTypes: true }).data.extra, undefined);
});

test('legacy public submission validation remains permissive for field types', () => {
  const fields = [{ name: 'email', label: 'Email', type: 'email', required: true }];
  const result = validateConfiguredSubmission({ email: 'legacy-value' }, fields);
  assert.deepEqual(result.data, { email: 'legacy-value' });
});

test('submission responses never expose owner or visitor IP', () => {
  const safe = publicSubmission('sub_1', {
    userId: 'user_1',
    ip: '127.0.0.1',
    formId: 'form_1',
    data: { name: 'Ada' }
  });
  assert.deepEqual(safe, { id: 'sub_1', formId: 'form_1', data: { name: 'Ada' } });
});

test('webhook scope and signature are deterministic', () => {
  const submission = { userId: 'user_1', websiteId: 'site_1', formId: 'form_1' };
  assert.equal(webhookMatches({ userId: 'user_1', event: 'submission.created', enabled: true }, submission), true);
  assert.equal(webhookMatches({ userId: 'user_1', event: 'submission.created', enabled: true, websiteId: 'site_2' }, submission), false);
  assert.equal(webhookMatches({ userId: 'user_1', event: 'submission.created', enabled: true, formId: 'form_2' }, submission), false);
  assert.equal(webhookMatches({ userId: 'user_2', event: 'submission.created', enabled: true }, submission), false);
  const body = JSON.stringify({ id: 'evt_1', data: { ok: true } });
  const expected = `sha256=${crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex')}`;
  assert.equal(signWebhookBody('whsec_test', body), expected);
});