const { safeText } = require('../utils/emailNotifications');

const RESEND_API_URL = 'https://api.resend.com/emails';

function fromAddress() {
  const email = (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev')
    .replace(/[\r\n<>]/g, '')
    .trim();
  const name = (process.env.RESEND_FROM_NAME || 'Handles')
    .replace(/[\r\n<>]/g, '')
    .trim() || 'Handles';
  return `${name} <${email}>`;
}

async function sendWithResend({ to, subject, html, text, submissionId }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `handles-submission-${submissionId}`
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      html,
      text
    })
  });

  const responseText = await response.text();
  let responseBody = {};
  try {
    responseBody = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseBody = { message: responseText };
  }

  if (!response.ok) {
    const message = safeText(responseBody.message || responseBody.error || `Resend returned ${response.status}`, 500);
    throw new Error(`Resend API failed (${response.status}): ${message}`);
  }

  return responseBody;
}

module.exports = { fromAddress, sendWithResend };