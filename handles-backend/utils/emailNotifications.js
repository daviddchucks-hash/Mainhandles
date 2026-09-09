const { isEmail } = require('./validate');

function getEmailNotificationSettings(user) {
  const settings = user && user.emailNotifications && typeof user.emailNotifications === 'object'
    ? user.emailNotifications
    : {};
  const fallbackEmail = user && typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const hasConfiguredEmail = Object.prototype.hasOwnProperty.call(settings, 'email');

  return {
    enabled: settings.enabled === true,
    email: hasConfiguredEmail
      ? typeof settings.email === 'string' ? settings.email.trim().toLowerCase() : ''
      : fallbackEmail
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(value, maxLength = 180) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatDate(createdAt) {
  const date = new Date(Number(createdAt));
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  try {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: process.env.NOTIFICATION_TIME_ZONE || 'UTC'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function getFieldLabelMap(formFields) {
  const fields = Array.isArray(formFields)
    ? formFields
    : formFields && typeof formFields === 'object'
      ? Object.values(formFields)
      : [];

  return new Map(
    fields
      .filter((field) => field && field.name)
      .map((field) => [field.name, field.label || field.name])
  );
}

function buildFieldEntries(data, formFields) {
  const labelMap = getFieldLabelMap(formFields);
  return Object.entries(data || {}).map(([key, value]) => ({
    label: labelMap.get(key) || key,
    value: String(value ?? '')
  }));
}

function buildNotificationEmail({
  websiteName,
  formName,
  createdAt,
  data,
  formFields,
  submissionUrl
}) {
  const safeWebsiteName = safeText(websiteName || 'Your website');
  const safeFormName = safeText(formName || 'Untitled form');
  const date = formatDate(createdAt);
  const fieldEntries = buildFieldEntries(data, formFields);
  const subject = `New ${safeFormName} submission for ${safeWebsiteName}`;

  const htmlRows = fieldEntries.length
    ? fieldEntries.map(({ label, value }) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #ececf4;color:#69697a;font-size:13px;vertical-align:top;width:34%;">${escapeHtml(label)}</td>
        <td style="padding:12px 0;border-bottom:1px solid #ececf4;color:#24243a;font-size:14px;word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`).join('')
    : `
      <tr>
        <td style="padding:12px 0;color:#69697a;font-size:14px;">No fields were submitted.</td>
      </tr>`;

  const textFields = fieldEntries.length
    ? fieldEntries.map(({ label, value }) => `${label}: ${value}`).join('\n')
    : 'No fields were submitted.';

  return {
    subject,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f6fb;color:#24243a;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:32px 16px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e7e7f0;border-radius:14px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#6257e5,#8177ee);color:#ffffff;">
          <div style="font-size:21px;font-weight:700;letter-spacing:-.02em;">Handles</div>
          <div style="margin-top:18px;font-size:22px;font-weight:700;line-height:1.25;">New form submission</div>
          <div style="margin-top:6px;color:#ebeaff;font-size:14px;">${escapeHtml(safeWebsiteName)} · ${escapeHtml(safeFormName)}</div>
        </div>
        <div style="padding:28px;">
          <div style="margin-bottom:22px;color:#69697a;font-size:14px;">Received ${escapeHtml(date)}</div>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            ${htmlRows}
          </table>
          <div style="margin-top:28px;">
            <a href="${escapeHtml(submissionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#6257e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">View submission in Handles</a>
          </div>
        </div>
        <div style="padding:18px 28px;background:#fafaff;color:#8a8a9a;font-size:12px;">You received this notification because email notifications are enabled for your Handles account.</div>
      </div>
    </div>
  </body>
</html>`,
    text: `Handles — New form submission

Website: ${safeWebsiteName}
Form: ${safeFormName}
Received: ${date}

${textFields}

View this submission in Handles:
${submissionUrl}`
  };
}

function buildSubmissionUrl(submissionId) {
  const dashboardUrl = (process.env.DASHBOARD_URL || process.env.FRONTEND_ORIGIN || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  const baseUrl = dashboardUrl || 'http://localhost:5500';
  return `${baseUrl}/submissions.html?id=${encodeURIComponent(submissionId)}`;
}

module.exports = {
  buildNotificationEmail,
  buildSubmissionUrl,
  getEmailNotificationSettings,
  isEmail,
  safeText
};