(function () {
  if (!requireLogin()) return;
  initAppNav('developer');

  const user = Auth.getUser();
  const avatarEl = document.getElementById('avatarInitial');
  if (user && avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  const apiKeyError = document.getElementById('apiKeyError');
  const apiKeyForm = document.getElementById('apiKeyForm');
  const apiKeysWrap = document.getElementById('apiKeysWrap');
  const newApiKeyNotice = document.getElementById('newApiKeyNotice');
  const createApiKeyBtn = document.getElementById('createApiKeyBtn');
  const apiKeyExpiresAt = document.getElementById('apiKeyExpiresAt');
  const webhookError = document.getElementById('webhookError');
  const webhookFormEl = document.getElementById('webhookForm');
  const webhooksWrap = document.getElementById('webhooksWrap');
  const newWebhookNotice = document.getElementById('newWebhookNotice');
  const createWebhookBtn = document.getElementById('createWebhookBtn');
  const webhookWebsite = document.getElementById('webhookWebsite');
  const webhookFormSelect = document.getElementById('webhookForm');
  const editWebhookModal = document.getElementById('editWebhookModal');
  const editWebhookForm = document.getElementById('editWebhookForm');
  const editWebhookError = document.getElementById('editWebhookError');
  const editWebhookWebsite = document.getElementById('editWebhookWebsite');
  const editWebhookFormScope = document.getElementById('editWebhookFormScope');
  const saveEditWebhookBtn = document.getElementById('saveEditWebhookBtn');
  let settingsWebsites = [];
  let settingsForms = [];
  let webhooksById = {};
  let editingWebhookId = null;

  function todayDate() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  apiKeyExpiresAt.min = todayDate();

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
      const today = todayDate();
      apiKeysWrap.innerHTML = apiKeys.map((key) => {
        const expired = key.expiresAt && key.expiresAt < today;
        const status = key.revokedAt
          ? '<span class="badge badge-danger">Revoked</span>'
          : (expired ? '<span class="badge badge-danger">Expired</span>' : '<span class="badge badge-success">Active</span>');
        const expiry = key.expiresAt ? ` · expires ${escapeHtml(key.expiresAt)}` : ' · no expiry';
        return `
          <div class="list-row">
            <div class="list-row-main">
              <h3>${escapeHtml(key.name)} ${status}</h3>
              <div class="meta"><code>${escapeHtml(key.prefix)}…</code> · created ${timeAgo(key.createdAt)}${key.lastUsedAt ? ` · last used ${timeAgo(key.lastUsedAt)}` : ''}${expiry}</div>
            </div>
            ${key.revokedAt ? '' : `<button class="btn btn-danger btn-sm" onclick="revokeApiKey('${key.id}')">Revoke</button>`}
          </div>
        `;
      }).join('');
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
      const { apiKey, secret } = await Api.createApiKey({
        name: document.getElementById('apiKeyName').value.trim(),
        expiresAt: apiKeyExpiresAt.value
      });
      showSecretNotice(newApiKeyNotice, `New API key: ${apiKey.name}`, secret);
      apiKeyForm.reset();
      apiKeyExpiresAt.min = todayDate();
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

  window.openWebhookCreate = function () {
    const form = document.getElementById('webhookForm');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('webhookName').focus();
  };

  const connectWebhookBtn = document.getElementById('connectWebhookBtn');
  if (connectWebhookBtn) connectWebhookBtn.addEventListener('click', window.openWebhookCreate);

  async function loadWebhooks() {
    try {
      const { webhooks } = await Api.listWebhooks();
      webhooksById = Object.fromEntries(webhooks.map((webhook) => [webhook.id, webhook]));
      const websiteNames = Object.fromEntries(settingsWebsites.map((site) => [site.id, site.name]));
      const formNames = Object.fromEntries(settingsForms.map((form) => [form.id, form.name]));
      if (!webhooks.length) {
        webhooksWrap.innerHTML = '<div class="empty-state" style="padding:24px 0;"><p>No webhooks yet.</p><button type="button" class="btn btn-primary btn-sm" onclick="openWebhookCreate()">Connect your first webhook</button></div>';
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
              <button class="btn btn-ghost btn-sm" onclick="editWebhook('${webhook.id}')">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="testWebhook('${webhook.id}')">Send test</button>
              <button class="btn btn-ghost btn-sm" onclick="showWebhookDeliveries('${webhook.id}')">History</button>
              <button class="btn btn-ghost btn-sm" onclick="rotateWebhookSecret('${webhook.id}')">Rotate secret</button>
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

  function populateEditWebhookForms() {
    const websiteId = editWebhookWebsite.value;
    const forms = websiteId ? settingsForms.filter((form) => form.websiteId === websiteId) : settingsForms;
    editWebhookFormScope.innerHTML = '<option value="">All forms</option>' +
      forms.map((form) => `<option value="${form.id}">${escapeHtml(form.name)}</option>`).join('');
  }

  editWebhookWebsite.addEventListener('change', populateEditWebhookForms);

  window.editWebhook = function (id) {
    const webhook = webhooksById[id];
    if (!webhook) return;
    editingWebhookId = id;
    editWebhookError.classList.remove('is-visible');
    document.getElementById('editWebhookName').value = webhook.name;
    document.getElementById('editWebhookEndpoint').value = webhook.endpointUrl;
    editWebhookWebsite.value = webhook.websiteId || '';
    populateEditWebhookForms();
    editWebhookFormScope.value = webhook.formId || '';
    document.getElementById('editWebhookEnabled').checked = webhook.enabled;
    editWebhookModal.classList.add('is-open');
  };

  function closeEditWebhook() {
    editingWebhookId = null;
    editWebhookModal.classList.remove('is-open');
  }

  document.getElementById('closeEditWebhookBtn').addEventListener('click', closeEditWebhook);
  document.getElementById('cancelEditWebhookBtn').addEventListener('click', closeEditWebhook);
  editWebhookModal.addEventListener('click', (e) => {
    if (e.target === editWebhookModal) closeEditWebhook();
  });

  editWebhookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingWebhookId) return;
    editWebhookError.classList.remove('is-visible');
    saveEditWebhookBtn.disabled = true;
    saveEditWebhookBtn.textContent = 'Saving...';
    try {
      await Api.updateWebhook(editingWebhookId, {
        name: document.getElementById('editWebhookName').value.trim(),
        endpointUrl: document.getElementById('editWebhookEndpoint').value.trim(),
        websiteId: editWebhookWebsite.value || null,
        formId: editWebhookFormScope.value || null,
        enabled: document.getElementById('editWebhookEnabled').checked
      });
      closeEditWebhook();
      showToast('Webhook updated', 'success');
      loadWebhooks();
    } catch (err) {
      editWebhookError.textContent = err.message;
      editWebhookError.classList.add('is-visible');
    } finally {
      saveEditWebhookBtn.disabled = false;
      saveEditWebhookBtn.textContent = 'Save webhook';
    }
  });

  window.rotateWebhookSecret = async function (id) {
    if (!confirm('Rotate this signing secret? The current secret will stop working immediately.')) return;
    try {
      const { webhook, secret } = await Api.rotateWebhookSecret(id);
      showSecretNotice(newWebhookNotice, `New signing secret: ${webhook.name}`, secret);
      showToast('Webhook secret rotated', 'success');
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
    createWebhookBtn.textContent = 'Connecting...';
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
      createWebhookBtn.textContent = 'Connect webhook';
    }
  });

  async function loadDeveloperSettings() {
    try {
      const [{ websites }, { forms }] = await Promise.all([Api.listWebsites(), Api.listForms()]);
      settingsWebsites = websites;
      settingsForms = forms;
      webhookWebsite.innerHTML = '<option value="">All websites</option>' +
        websites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join('');
      editWebhookWebsite.innerHTML = '<option value="">All websites</option>' +
        websites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join('');
      populateWebhookForms();
      populateEditWebhookForms();
      await Promise.all([loadApiKeys(), loadWebhooks()]);
    } catch (err) {
      showSettingsError(webhookError, err.message);
    }
  }

  loadDeveloperSettings();
})();