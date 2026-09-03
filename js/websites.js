(function () {
  if (!requireLogin()) return;
  initAppNav('websites');

  const user = Auth.getUser();
  const avatarEl = document.getElementById('avatarInitial');
  if (user && avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  const wrap = document.getElementById('websitesWrap');
  const modal = document.getElementById('websiteModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalError = document.getElementById('modalError');
  const form = document.getElementById('websiteForm');
  const idInput = document.getElementById('websiteId');
  const nameInput = document.getElementById('websiteName');
  const urlInput = document.getElementById('websiteUrl');
  const saveBtn = document.getElementById('saveWebsiteBtn');

  let formsCountByWebsite = {};

  function openModal(mode, website) {
    modalError.classList.remove('is-visible');
    form.reset();
    if (mode === 'edit' && website) {
      modalTitle.textContent = 'Edit website';
      idInput.value = website.id;
      nameInput.value = website.name;
      urlInput.value = website.url;
    } else {
      modalTitle.textContent = 'Add website';
      idInput.value = '';
    }
    modal.classList.add('is-open');
  }

  function closeModal() {
    modal.classList.remove('is-open');
  }

  document.getElementById('openCreateBtn').addEventListener('click', () => openModal('create'));
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn.addEventListener('click', async () => {
    modalError.classList.remove('is-visible');
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    if (!name || !url) {
      modalError.textContent = 'Please fill in both fields.';
      modalError.classList.add('is-visible');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      if (idInput.value) {
        await Api.updateWebsite(idInput.value, { name, url });
        showToast('Website updated', 'success');
      } else {
        await Api.createWebsite({ name, url });
        showToast('Website added', 'success');
      }
      closeModal();
      loadWebsites();
    } catch (err) {
      modalError.textContent = err.message;
      modalError.classList.add('is-visible');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save website';
    }
  });

  async function deleteWebsite(id, name) {
    if (!confirm(`Delete "${name}"? This also deletes all of its forms and submissions. This cannot be undone.`)) return;
    try {
      await Api.deleteWebsite(id);
      showToast('Website deleted', 'success');
      loadWebsites();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  window.editWebsite = function (id) {
    Api.getWebsite(id).then(({ website }) => openModal('edit', website)).catch((e) => showToast(e.message, 'error'));
  };
  window.deleteWebsiteHandler = deleteWebsite;

  async function loadWebsites() {
    try {
      const [{ websites }, { forms }] = await Promise.all([Api.listWebsites(), Api.listForms()]);
      formsCountByWebsite = {};
      forms.forEach((f) => {
        formsCountByWebsite[f.websiteId] = (formsCountByWebsite[f.websiteId] || 0) + 1;
      });

      if (websites.length === 0) {
        wrap.innerHTML = `
          <div class="empty-state">
            <div class="icon">◧</div>
            <h3>No websites yet</h3>
            <p>Add your first website to start creating forms for it.</p>
            <button class="btn btn-primary" onclick="document.getElementById('openCreateBtn').click()">+ Add website</button>
          </div>`;
        return;
      }

      wrap.innerHTML = websites.map((w) => `
        <div class="list-row">
          <div class="list-row-main">
            <h3>${escapeHtml(w.name)}</h3>
            <div class="meta">${escapeHtml(w.url)} · ${formsCountByWebsite[w.id] || 0} form${(formsCountByWebsite[w.id] || 0) === 1 ? '' : 's'} · added ${timeAgo(w.createdAt)}</div>
          </div>
          <div class="list-row-actions">
            <a class="btn btn-secondary btn-sm" href="forms.html?websiteId=${w.id}">View forms</a>
            <button class="btn btn-ghost btn-sm" onclick="editWebsite('${w.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteWebsiteHandler('${w.id}', '${escapeHtml(w.name).replace(/'/g, "\\'")}')">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><h3>Couldn't load websites</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  loadWebsites();
})();
