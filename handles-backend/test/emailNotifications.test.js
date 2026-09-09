const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNotificationEmail,
  buildSubmissionUrl,
  getEmailNotificationSettings,
  isEmail
} = require('../utils/emailNotifications');
const { fromAddress, sendWithResend } = require('../services/resend');

test('notification settings default to disabled and fall back to the account email', () => {
  assert.deepEqual(
    getEmailNotificationSettings({ email: 'Owner@Example.com' }),
    { enabled: false, email: 'owner@example.com' }
  );
  assert.deepEqual(
    getEmailNotificationSettings({
      email: 'owner@example.com',
      emailNotifications: { enabled: true, email: 'alerts@example.com' }
    }),
    { enabled: true, email: 'alerts@example.com' }
  );
  assert.deepEqual(
    getEmailNotificationSettings({
      email: 'owner@example.com',
      emailNotifications: { enabled: false, email: '' }
    }),
    { enabled: false, email: '' }
  );
});

test('notification email validation rejects malformed addresses', () => {
  assert.equal(isEmail('owner@example.com'), true);
  assert.equal(isEmail('not-an-email'), false);
  assert.equal(isEmail('owner@example'), false);
});

test('notification email includes branding, metadata, every field, and a safe dashboard link', () => {
  const email = buildNotificationEmail({
    websiteName: 'Acme <Studio>',
    formName: 'Contact',
    createdAt: Date.parse('2026-09-09T10:00:00.000Z'),
    formFields: [
      { name: 'full_name', label: 'Full name' },
      { name: 'message', label: 'Message' }
    ],
    data: {
      full_name: 'Ada Lovelace',
      message: '<script>alert("x")</script>'
    },
    submissionUrl: buildSubmissionUrl('sub_123')
  });

  assert.equal(email.subject, 'New Contact submission for Acme <Studio>');
  assert.match(email.html, /Handles/);
  assert.match(email.html, /Acme &lt;Studio&gt;/);
  assert.match(email.html, /Full name/);
  assert.match(email.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(email.text, /Ada Lovelace/);
  assert.match(email.text, /submissions.html\?id=sub_123/);
});

test('missing Resend key fails locally without making a request', async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;
  delete process.env.RESEND_API_KEY;
  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  await assert.rejects(
    sendWithResend({
      to: 'owner@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
      submissionId: 'sub_missing_key'
    }),
    /RESEND_API_KEY is not configured/
  );

  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

test('Resend failures include the API status and use an idempotency key', async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalName = process.env.RESEND_FROM_NAME;
  const originalEmail = process.env.RESEND_FROM_EMAIL;
  const originalFetch = global.fetch;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_FROM_NAME = 'Handles';
  process.env.RESEND_FROM_EMAIL = 'notifications@example.com';

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: false,
      status: 422,
      async text() {
        return JSON.stringify({ message: 'invalid from address' });
      }
    };
  };

  await assert.rejects(
    sendWithResend({
      to: 'owner@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
      submissionId: 'sub_422'
    }),
    /Resend API failed \(422\)/
  );
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers['Idempotency-Key'], 'handles-submission-sub_422');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(fromAddress(), 'Handles <notifications@example.com>');

  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalName === undefined) delete process.env.RESEND_FROM_NAME;
  else process.env.RESEND_FROM_NAME = originalName;
  if (originalEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalEmail;
});