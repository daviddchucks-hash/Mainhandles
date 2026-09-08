(function () {
  if (!requireLogin()) return;
  initAppNav('settings');

  const user = Auth.getUser();
  const avatarEl = document.getElementById('avatarInitial');
  if (user && avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  document.getElementById('name').value = user ? user.name : '';
  document.getElementById('email').value = user ? user.email : '';

  const profileForm = document.getElementById('profileForm');
  const profileError = document.getElementById('profileError');
  const profileSuccess = document.getElementById('profileSuccess');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    profileError.classList.remove('is-visible');
    profileSuccess.classList.remove('is-visible');
    const name = document.getElementById('name').value.trim();
    if (!name) {
      profileError.textContent = 'Please enter your name.';
      profileError.classList.add('is-visible');
      return;
    }

    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = 'Saving...';
    try {
      const { user: updated } = await Api.updateAccount({ name });
      Auth.setSession(Auth.getToken(), updated);
      profileSuccess.textContent = 'Profile updated.';
      profileSuccess.classList.add('is-visible');
      document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = updated.name; });
      avatarEl.textContent = updated.name.charAt(0).toUpperCase();
    } catch (err) {
      profileError.textContent = err.message;
      profileError.classList.add('is-visible');
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = 'Save changes';
    }
  });

  const passwordForm = document.getElementById('passwordForm');
  const passwordError = document.getElementById('passwordError');
  const passwordSuccess = document.getElementById('passwordSuccess');
  const savePasswordBtn = document.getElementById('savePasswordBtn');

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordError.classList.remove('is-visible');
    passwordSuccess.classList.remove('is-visible');

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    savePasswordBtn.disabled = true;
    savePasswordBtn.textContent = 'Updating...';
    try {
      await Api.updateAccount({ currentPassword, newPassword });
      passwordSuccess.textContent = 'Password updated.';
      passwordSuccess.classList.add('is-visible');
      passwordForm.reset();
    } catch (err) {
      passwordError.textContent = err.message;
      passwordError.classList.add('is-visible');
    } finally {
      savePasswordBtn.disabled = false;
      savePasswordBtn.textContent = 'Update password';
    }
  });

  const apiKeyError = document.getElementById('apiKeyError');
  const apiKeyForm = document.getElementById('apiKeyForm');
  const apiKeysWrap = document.getElementById('apiKeysWrap');
  const newApiKeyNotice = document.getElementById('newApiKeyNotice');
  const createApiKeyBtn = document.getElementById('createApiKeyBtn');
  const webhookError = document.getElementById('webhookError');
  const webhookFormEl = document.getElementById('webhookForm');
  const webhooksWrap = document.getElementById('webhooksWrap');
  const newWebhookNotice = document.getElementById('newWebhookNotice');
  const createWebhookBtn = document.getElementById('createWebhookBtn');
  const webhookWebsite = document.getElementById('webhookWebsite');
  const webhookFormSelect = document.getElementById('webhookForm');
  let settingsWebsites = [];
  let settingsForms = [];

  function showSettingsError(element, message) {
    element.textContent = message;
    element.classList.add('is-visible');
  }

  function clearSettingsError(element) {
    element.textContent = '';
    element.classList.remove('is-visible');
  }

  function showSecretNotice(element, label, secret) {
    element.innerHTML = `<strong>${escapeHtml(label)}</strong><br><code>${escapeHtml(secret)}</code><br><span>Copy it now — Handles will not show it again.</span>`;
    element.hidden = false;
  }

  async function loadApiKeys() {
    try {
      const { apiKeys } = await Api.listApiKeys();
      if (!apiKeys.length) {
        apiKeysWrap.innerHTML = '<div class="empty-state" style="padding:24px 0;"><p>No API keys yet.</p></div>';
        return;
      }
      apiKeysWrap.innerHTML = apiKeys.map((key) => `
        <div class="list-row">
          <div class="list-row-main">
            <h3>${escapeHtml(key.name)} ${key.revokedAt ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge badge-success">Active</span>'}</h3>
            <div class="meta"><code>${escapeHtml(key.prefix)}…</code> · created ${timeAgo(key.createdAt)}${key.lastUsedAt ? ` · last used ${timeAgo(key.lastUsedAt)}` : ''}</div>
          </div>
          ${key.revokedAt ? '' : `<button class="btn btn-danger btn-sm" onclick="revokeApiKey('${key.id}')">Revoke</button>`}
        </div>
      `).join('');
    } catch (err) {
      apiKeysWrap.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  window.revokeApiKey = async function (id) {
    if (!confirm('Revoke this API key? Applications using it will stop working immediately.')) return;
    try {
      await Api.revokeApiKey(id);
      showToast('API key revoked', 'success');
      loadApiKeys();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  apiKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearSettingsError(apiKeyError);
    newApiKeyNotice.hidden = true;
    createApiKeyBtn.disabled = true;
    createApiKeyBtn.textContent = 'Creating...';
    try {
      const { apiKey, secret } = await Api.createApiKey({ name: document.getElementById('apiKeyName').value.trim() });
      showSecretNotice(newApiKeyNotice, `New API key: ${apiKey.name}`, secret);
      apiKeyForm.reset();
      loadApiKeys();
    } catch (err) {
      showSettingsError(apiKeyError, err.message);
    } finally {
      createApiKeyBtn.disabled = false;
      createApiKeyBtn.textContent = 'Create key';
    }
  });

  function populateWebhookForms() {
    const websiteId = webhookWebsite.value;
    const forms = websiteId ? settingsForms.filter((form) => form.websiteId === websiteId) : settingsForms;
    webhookFormSelect.innerHTML = '<option value="">All forms</option>' +
      forms.map((form) => `<option value="${form.id}">${escapeHtml(form.name)}</option>`).join('');
  }

  webhookWebsite.addEventListener('change', populateWebhookForms);

  async function loadWebhooks() {
    try {
      const { webhooks } = await Api.listWebhooks();
      const websiteNames = Object.fromEntries(settingsWebsites.map((site) => [site.id, site.name]));
      const formNames = Object.fromEntries(settingsForms.map((form) => [form.id, form.name]));
      if (!webhooks.length) {
        webhooksWrap.innerHTML = '<div class="empty-state" style="padding:24px 0;"><p>No webhooks yet.</p></div>';
        return;
      }
      webhooksWrap.innerHTML = webhooks.map((webhook) => {
        const scope = webhook.formId
          ? `${websiteNames[webhook.websiteId] || 'Website'} / ${formNames[webhook.formId] || 'Form'}`
          : (webhook.websiteId ? websiteNames[webhook.websiteId] || 'Website' : 'All websites');
        return `
          <div class="list-row" id="webhook-${webhook.id}">
            <div class="list-row-main">
              <h3>${escapeHtml(webhook.name)} ${webhook.enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-muted">Disabled</span>'}</h3>
              <div class="meta">${escapeHtml(webhook.endpointUrl)} · ${escapeHtml(scope)} · ${escapeHtml(webhook.event)}</div>
              <div class="webhook-deliveries" id="deliveries-${webhook.id}" hidden></div>
            </div>
            <div class="list-row-actions">
              <button class="btn btn-secondary btn-sm" onclick="testWebhook('${webhook.id}')">Send test</button>
              <button class="btn btn-ghost btn-sm" onclick="showWebhookDeliveries('${webhook.id}')">History</button>
              <button class="btn btn-ghost btn-sm" onclick="toggleWebhook('${webhook.id}', ${!webhook.enabled})">${webhook.enabled ? 'Disable' : 'Enable'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteWebhook('${webhook.id}')">Delete</button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      webhooksWrap.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  window.toggleWebhook = async function (id, enabled) {
    try {
      await Api.updateWebhook(id, { enabled });
      showToast(enabled ? 'Webhook enabled' : 'Webhook disabled', 'success');
      loadWebhooks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.deleteWebhook = async function (id) {
    if (!confirm('Delete this webhook and its delivery history?')) return;
    try {
      await Api.deleteWebhook(id);
      showToast('Webhook deleted', 'success');
      loadWebhooks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.testWebhook = async function (id) {
    try {
      await Api.testWebhook(id);
      showToast('Test webhook queued', 'success');
      setTimeout(() => showWebhookDeliveries(id), 800);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.showWebhookDeliveries = async function (id) {
    const target = document.getElementById(`deliveries-${id}`);
    if (!target) return;
    target.hidden = false;
    target.innerHTML = 'Loading delivery history…';
    try {
      const { deliveries } = await Api.listWebhookDeliveries(id);
      target.innerHTML = deliveries.length
        ? deliveries.map((delivery) => `
          <div class="delivery-row">
            <span>${escapeHtml(delivery.status)} · ${delivery.attempts || 0} attempt(s) · ${timeAgo(delivery.createdAt)}</span>
            ${delivery.status !== 'delivered' ? `<button class="btn btn-ghost btn-sm" onclick="retryWebhookDelivery('${id}', '${delivery.id}')">Retry</button>` : ''}
          </div>`).join('')
        : 'No deliveries yet.';
    } catch (err) {
      target.innerHTML = escapeHtml(err.message);
    }
  };

  window.retryWebhookDelivery = async function (webhookId, deliveryId) {
    try {
      await Api.retryWebhookDelivery(webhookId, deliveryId);
      showToast('Webhook retry queued', 'success');
      setTimeout(() => showWebhookDeliveries(webhookId), 800);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  webhookFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearSettingsError(webhookError);
    newWebhookNotice.hidden = true;
    createWebhookBtn.disabled = true;
    createWebhookBtn.textContent = 'Creating...';
    try {
      const { webhook, secret } = await Api.createWebhook({
        name: document.getElementById('webhookName').value.trim(),
        endpointUrl: document.getElementById('webhookEndpoint').value.trim(),
        event: 'submission.created',
        websiteId: webhookWebsite.value || null,
        formId: webhookFormSelect.value || null
      });
      showSecretNotice(newWebhookNotice, `Signing secret: ${webhook.name}`, secret);
      webhookFormEl.reset();
      populateWebhookForms();
      loadWebhooks();
    } catch (err) {
      showSettingsError(webhookError, err.message);
    } finally {
      createWebhookBtn.disabled = false;
      createWebhookBtn.textContent = 'Create webhook';
    }
  });

  async function loadDeveloperSettings() {
    try {
      const [{ websites }, { forms }] = await Promise.all([Api.listWebsites(), Api.listForms()]);
      settingsWebsites = websites;
      settingsForms = forms;
      webhookWebsite.innerHTML = '<option value="">All websites</option>' +
        websites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join('');
      populateWebhookForms();
      await Promise.all([loadApiKeys(), loadWebhooks()]);
    } catch (err) {
      showSettingsError(webhookError, err.message);
    }
  }

  loadDeveloperSettings();
})();
