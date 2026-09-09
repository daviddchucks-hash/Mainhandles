const { db } = require('../config/firebase');
const {
  buildNotificationEmail,
  buildSubmissionUrl,
  getEmailNotificationSettings,
  isEmail,
  safeText
} = require('../utils/emailNotifications');
const { sendWithResend } = require('./resend');

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

async function claimNotification(submissionId) {
  const ref = db.ref(`emailNotificationDeliveries/${submissionId}`);
  const now = Date.now();
  const result = await ref.transaction((current) => {
    if (current && current.status === 'sent') return;
    if (
      current &&
      current.status === 'processing' &&
      now - Number(current.claimedAt || 0) < PROCESSING_TIMEOUT_MS
    ) {
      return;
    }

    return {
      status: 'processing',
      claimedAt: now,
      attempts: (Number(current && current.attempts) || 0) + 1
    };
  });

  return result.committed;
}

async function processEmailNotification(submission) {
  const submissionId = submission.id;
  try {
    const userSnap = await db.ref(`users/${submission.userId}`).get();
    if (!userSnap.exists()) {
      console.error(`[email-notifications] Skipping ${submissionId}: owner not found.`);
      return;
    }

    const user = userSnap.val();
    const settings = getEmailNotificationSettings(user);
    if (!settings.enabled) return;
    if (!isEmail(settings.email)) {
      console.error(`[email-notifications] Skipping ${submissionId}: configured notification email is invalid.`);
      return;
    }

    const [formSnap, websiteSnap] = await Promise.all([
      db.ref(`forms/${submission.formId}`).get(),
      db.ref(`websites/${submission.websiteId}`).get()
    ]);

    // These checks keep a malformed or cross-owned record from ever sending
    // a submission to the wrong account.
    if (
      !formSnap.exists() ||
      !websiteSnap.exists() ||
      formSnap.val().userId !== submission.userId ||
      formSnap.val().websiteId !== submission.websiteId ||
      websiteSnap.val().userId !== submission.userId
    ) {
      console.error(`[email-notifications] Skipping ${submissionId}: ownership metadata did not match.`);
      return;
    }

    if (!(await claimNotification(submissionId))) return;

    const form = formSnap.val();
    const website = websiteSnap.val();
    const email = buildNotificationEmail({
      websiteName: website.name,
      formName: form.name,
      createdAt: submission.createdAt,
      data: submission.data,
      formFields: form.fields,
      submissionUrl: buildSubmissionUrl(submissionId)
    });

    try {
      const result = await sendWithResend({
        to: settings.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        submissionId
      });

      await db.ref(`emailNotificationDeliveries/${submissionId}`).update({
        status: 'sent',
        sentAt: Date.now(),
        resendId: result.id || null,
        lastError: null
      });
    } catch (err) {
      await db.ref(`emailNotificationDeliveries/${submissionId}`).update({
        status: 'failed',
        failedAt: Date.now(),
        lastError: safeText(err.message, 500)
      });
      console.error(`[email-notifications] Delivery failed for ${submissionId}: ${err.message}`);
    }
  } catch (err) {
    console.error(`[email-notifications] Could not process ${submissionId}: ${err.message}`);
  }
}

function queueEmailNotification(submission) {
  setImmediate(() => processEmailNotification(submission));
}

module.exports = {
  claimNotification,
  processEmailNotification,
  queueEmailNotification,
  sendWithResend
};