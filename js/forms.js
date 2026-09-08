(function () {
  if (!requireLogin()) return;
  initAppNav('forms');

  const user = Auth.getUser();
  const avatarEl = document.getElementById('avatarInitial');
  if (user && avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  const wrap = document.getElementById('formsWrap');
  const websiteFilter = document.getElementById('websiteFilter');
  const modal = document.getElementById('formModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalError = document.getElementById('modalError');
  const formIdInput = document.getElementById('formId');
  const formWebsiteSelect = document.getElementById('formWebsite');
  const formNameInput = document.getElementById('formName');
  const fieldRows = document.getElementById('fieldRows');
  const saveBtn = document.getElementById('saveFormBtn');

  const snippetModal = document.getElementById('snippetModal');

  const params = new URLSearchParams(window.location.search);
  const initialWebsiteId = params.get('websiteId') || '';

  let websites = [];
  let fieldRowCount = 0;
  let formsById = {};
  const FIELD_TYPES = ['text', 'email', 'tel', 'number', 'date', 'time', 'textarea', 'select', 'checkbox'];

  function fieldRowHtml(field) {
    const rowId = `fr${++fieldRowCount}`;
    const f = field || { name: '', label: '', type: 'text', required: false };
    return `
      <div class="field-row" data-row-id="${rowId}">
        <input type="text" placeholder="field_name" class="fr-name" value="${escapeHtml(f.name)}">
        <input type="text" placeholder="Label" class="fr-label" value="${escapeHtml(f.label)}">
        <select class="fr-type">
          ${FIELD_TYPES.map((t) => `<option value="${t}" ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <label class="checkbox-row" style="font-size:12px;"><input type="checkbox" class="fr-required" ${f.required ? 'checked' : ''}> Req.</label>
        <button type="button" class="remove-field" title="Remove field">&times;</button>
      </div>`;
  }

  function addFieldRow(field) {
    const div = document.createElement('div');
    div.innerHTML = fieldRowHtml(field);
    const row = div.firstElementChild;
    row.querySelector('.remove-field').addEventListener('click', () => row.remove());
    fieldRows.appendChild(row);
  }

  document.getElementById('addFieldBtn').addEventListener('click', () => addFieldRow());

  function collectFields() {
    return Array.from(fieldRows.querySelectorAll('.field-row')).map((row) => ({
      name: row.querySelector('.fr-name').value.trim(),
      label: row.querySelector('.fr-label').value.trim(),
      type: row.querySelector('.fr-type').value,
      required: row.querySelector('.fr-required').checked
    }));
  }

  function openModal(mode, formData) {
    modalError.classList.remove('is-visible');
    fieldRows.innerHTML = '';
    formIdInput.value = '';
    formNameInput.value = '';

    formWebsiteSelect.innerHTML = websites.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');

    if (mode === 'edit' && formData) {
      modalTitle.textContent = 'Edit form';
      formIdInput.value = formData.id;
      formWebsiteSelect.value = formData.websiteId;
      formWebsiteSelect.disabled = true;
      formNameInput.value = formData.name;
      formData.fields.forEach((f) => addFieldRow(f));
    } else {
      modalTitle.textContent = 'Add form';
      formWebsiteSelect.disabled = false;
      if (initialWebsiteId) formWebsiteSelect.value = initialWebsiteId;
      addFieldRow({ name: 'name', label: 'Name', type: 'text', required: true });
      addFieldRow({ name: 'email', label: 'Email', type: 'email', required: true });
      addFieldRow({ name: 'message', label: 'Message', type: 'textarea', required: false });
    }
    modal.classList.add('is-open');
  }

  function closeModal() { modal.classList.remove('is-open'); }

  document.getElementById('openCreateBtn').addEventListener('click', () => {
    if (websites.length === 0) {
      showToast('Add a website first', 'error');
      return;
    }
    openModal('create');
  });
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn.addEventListener('click', async () => {
    modalError.classList.remove('is-visible');
    const name = formNameInput.value.trim();
    const websiteId = formWebsiteSelect.value;
    const fields = collectFields();

    if (!name) return showFormError('Please name your form.');
    if (!websiteId) return showFormError('Please choose a website.');
    if (fields.length === 0) return showFormError('Add at least one field.');
    for (const f of fields) {
      if (!f.name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.name)) {
        return showFormError(`Field name "${f.name}" is invalid. Use letters, numbers, and underscores, starting with a letter.`);
      }
      if (!f.label) return showFormError('Every field needs a label.');
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      if (formIdInput.value) {
        await Api.updateForm(formIdInput.value, { name, fields });
        showToast('Form updated', 'success');
      } else {
        await Api.createForm({ websiteId, name, fields });
        showToast('Form created', 'success');
      }
      closeModal();
      loadForms();
    } catch (err) {
      showFormError(err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save form';
    }
  });

  function showFormError(msg) {
    modalError.textContent = msg;
    modalError.classList.add('is-visible');
  }

  window.editForm = function (id) {
    Api.getForm(id).then(({ form }) => openModal('edit', form)).catch((e) => showToast(e.message, 'error'));
  };

  window.deleteForm = async function (id, name) {
    if (!confirm(`Delete "${name}"? This also deletes all of its submissions. This cannot be undone.`)) return;
    try {
      await Api.deleteForm(id);
      showToast('Form deleted', 'success');
      loadForms();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.toggleForm = async function (id, enabled) {
    try {
      await Api.updateForm(id, { enabled });
      showToast(enabled ? 'Form enabled' : 'Form disabled', 'success');
      loadForms();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  function htmlAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inputSnippet(field, index) {
    const id = `handles-${field.name}-${index}`;
    const required = field.required ? ' required' : '';
    const label = escapeHtml(field.label || field.name);
    const name = htmlAttribute(field.name);
    const fieldId = htmlAttribute(id);

    if (field.type === 'textarea') {
      return `  <label for="${fieldId}">${label}</label>\n` +
        `  <textarea id="${fieldId}" name="${name}"${required}></textarea>`;
    }
    if (field.type === 'select') {
      return `  <label for="${fieldId}">${label}</label>\n` +
        `  <select id="${fieldId}" name="${name}"${required}>\n` +
        `    <option value="">Select ${label}</option>\n` +
        `  </select>`;
    }
    if (field.type === 'checkbox') {
      return `  <label><input type="checkbox" id="${fieldId}" name="${name}" value="true"${required}> ${label}</label>`;
    }
    return `  <label for="${fieldId}">${label}</label>\n` +
      `  <input type="${field.type || 'text'}" id="${fieldId}" name="${name}"${required}>`;
  }

  window.showSnippet = function (formId) {
    const form = formsById[formId];
    if (!form) {
      showToast('Form details are still loading. Try again.', 'error');
      return;
    }

    // The website ID makes the script URL unique per website. It also gives
    // us a stable cache key when the same website has multiple forms.
    const scriptUrl = `https://mainhandles.onrender.com/forms.js?websiteId=${encodeURIComponent(form.websiteId)}`;
    const scriptTag = `<script src="${htmlAttribute(scriptUrl)}"><\/script>`;
    const formTag = `data-handles-form="${formId}"`;
    document.getElementById('scriptSnippet').textContent = scriptTag;
    document.getElementById('formSnippet').textContent = formTag;
    const fields = (form.fields || []).map(inputSnippet).join('\n\n');
    document.getElementById('fullSnippet').textContent =
`${scriptTag}

<form ${formTag}>
${fields}
  <button type="submit">Send</button>
</form>`;
    snippetModal.classList.add('is-open');
  };
  document.getElementById('closeSnippetBtn').addEventListener('click', () => snippetModal.classList.remove('is-open'));
  document.getElementById('closeSnippetBtn2').addEventListener('click', () => snippetModal.classList.remove('is-open'));
  snippetModal.addEventListener('click', (e) => { if (e.target === snippetModal) snippetModal.classList.remove('is-open'); });

  document.querySelectorAll('.snippet-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-copy-target'));
      navigator.clipboard.writeText(target.textContent).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1500);
      }).catch(() => showToast('Could not copy — please select and copy manually.', 'error'));
    });
  });

  websiteFilter.addEventListener('change', () => loadForms());

  async function loadForms() {
    try {
      const [{ websites: sites }, { forms }] = await Promise.all([Api.listWebsites(), Api.listForms()]);
      websites = sites;
      formsById = Object.fromEntries(forms.map((form) => [form.id, form]));

      if (websiteFilter.options.length <= 1) {
        websiteFilter.innerHTML = '<option value="">All websites</option>' +
          websites.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
        if (initialWebsiteId) websiteFilter.value = initialWebsiteId;
      }

      const websiteNames = Object.fromEntries(websites.map((w) => [w.id, w.name]));
      const activeFilter = websiteFilter.value;
      const filtered = activeFilter ? forms.filter((f) => f.websiteId === activeFilter) : forms;

      if (websites.length === 0) {
        wrap.innerHTML = `
          <div class="empty-state">
            <div class="icon">▤</div>
            <h3>Add a website first</h3>
            <p>Forms belong to a website — add one before creating your first form.</p>
            <a class="btn btn-primary" href="websites.html">+ Add website</a>
          </div>`;
        return;
      }

      if (filtered.length === 0) {
        wrap.innerHTML = `
          <div class="empty-state">
            <div class="icon">▤</div>
            <h3>No forms yet</h3>
            <p>Create a form to get its integration snippet.</p>
            <button class="btn btn-primary" onclick="document.getElementById('openCreateBtn').click()">+ Add form</button>
          </div>`;
        return;
      }

      wrap.innerHTML = filtered.map((f) => `
        <div class="list-row">
          <div class="list-row-main">
            <h3>${escapeHtml(f.name)} ${f.enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-muted">Disabled</span>'}</h3>
            <div class="meta">${escapeHtml(websiteNames[f.websiteId] || 'Unknown site')} · ${f.fields.length} field${f.fields.length === 1 ? '' : 's'} · created ${timeAgo(f.createdAt)}</div>
          </div>
          <div class="list-row-actions">
            <button class="btn btn-secondary btn-sm" onclick="showSnippet('${f.id}')">Get snippet</button>
            <a class="btn btn-ghost btn-sm" href="submissions.html?formId=${f.id}">Submissions</a>
            <button class="btn btn-ghost btn-sm" onclick="editForm('${f.id}')">Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleForm('${f.id}', ${!f.enabled})">${f.enabled ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteForm('${f.id}', '${escapeHtml(f.name).replace(/'/g, "\\'")}')">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><h3>Couldn't load forms</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  loadForms();
})();
