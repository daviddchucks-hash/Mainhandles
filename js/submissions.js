(function () {
  if (!requireLogin()) return;
  initAppNav('submissions');

  const user = Auth.getUser();
  const avatarEl = document.getElementById('avatarInitial');
  if (user && avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  const wrap = document.getElementById('submissionsWrap');
  const websiteFilter = document.getElementById('websiteFilter');
  const formFilter = document.getElementById('formFilter');
  const readFilter = document.getElementById('readFilter');
  const searchInput = document.getElementById('searchInput');

  const detailModal = document.getElementById('detailModal');
  const detailMeta = document.getElementById('detailMeta');
  const detailFields = document.getElementById('detailFields');
  const toggleReadBtn = document.getElementById('toggleReadBtn');
  const deleteDetailBtn = document.getElementById('deleteDetailBtn');

  const params = new URLSearchParams(window.location.search);
  let websites = [];
  let forms = [];
  let allForms = [];
  let currentDetailId = null;
  let searchDebounce = null;

  function closeDetail() {
    detailModal.classList.remove('is-open');
    currentDetailId = null;
  }
  document.getElementById('closeDetailBtn').addEventListener('click', closeDetail);
  document.getElementById('closeDetailBtn2').addEventListener('click', closeDetail);
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeDetail(); });

  async function openDetail(id) {
    try {
      const { submission } = await Api.getSubmission(id);
      currentDetailId = id;
      const websiteName = (websites.find((w) => w.id === submission.websiteId) || {}).name || 'Unknown site';
      const formName = (allForms.find((f) => f.id === submission.formId) || {}).name || 'Unknown form';
      detailMeta.innerHTML = `<strong>${escapeHtml(websiteName)}</strong> — ${escapeHtml(formName)} · received ${timeAgo(submission.createdAt)}`;

      const entries = Object.entries(submission.data || {});
      detailFields.innerHTML = entries.length
        ? entries.map(([k, v]) => `<div class="kv-row"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(String(v))}</div></div>`).join('')
        : '<div class="kv-row"><div class="v">No fields were submitted.</div></div>';

      toggleReadBtn.textContent = submission.read ? 'Mark unread' : 'Mark read';
      detailModal.classList.add('is-open');

      if (!submission.read) {
        await Api.markSubmission(id, true);
        loadSubmissions(false);
        toggleReadBtn.textContent = 'Mark unread';
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  window.openDetail = openDetail;

  toggleReadBtn.addEventListener('click', async () => {
    if (!currentDetailId) return;
    const nowUnread = toggleReadBtn.textContent === 'Mark unread';
    try {
      await Api.markSubmission(currentDetailId, !nowUnread);
      toggleReadBtn.textContent = nowUnread ? 'Mark read' : 'Mark unread';
      loadSubmissions(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  deleteDetailBtn.addEventListener('click', async () => {
    if (!currentDetailId) return;
    if (!confirm('Delete this submission? This cannot be undone.')) return;
    try {
      await Api.deleteSubmission(currentDetailId);
      showToast('Submission deleted', 'success');
      closeDetail();
      loadSubmissions();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  websiteFilter.addEventListener('change', () => {
    populateFormFilter();
    loadSubmissions();
  });
  formFilter.addEventListener('change', () => loadSubmissions());
  readFilter.addEventListener('change', () => loadSubmissions());
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadSubmissions(), 350);
  });

  function populateFormFilter() {
    const websiteId = websiteFilter.value;
    forms = websiteId ? allForms.filter((f) => f.websiteId === websiteId) : allForms;
    const current = formFilter.value;
    formFilter.innerHTML = '<option value="">All forms</option>' +
      forms.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
    if (forms.some((f) => f.id === current)) formFilter.value = current;
  }

  async function loadSubmissions(showSpinner = true) {
    if (showSpinner) wrap.innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading submissions...</div>';
    try {
      const { submissions } = await Api.listSubmissions({
        websiteId: websiteFilter.value,
        formId: formFilter.value,
        read: readFilter.value,
        search: searchInput.value
      });

      const websiteNames = Object.fromEntries(websites.map((w) => [w.id, w.name]));
      const formNames = Object.fromEntries(allForms.map((f) => [f.id, f.name]));

      if (submissions.length === 0) {
        wrap.innerHTML = `
          <div class="empty-state">
            <div class="icon">✉</div>
            <h3>No submissions found</h3>
            <p>Try adjusting your filters, or wait for visitors to submit your forms.</p>
          </div>`;
        return;
      }

      wrap.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Preview</th><th>Website</th><th>Form</th><th>Received</th><th>Status</th></tr></thead>
            <tbody>
              ${submissions.map((s) => `
                <tr class="clickable ${!s.read ? 'is-unread' : ''}" onclick="openDetail('${s.id}')">
                  <td>${escapeHtml(previewText(s.data))}</td>
                  <td>${escapeHtml(websiteNames[s.websiteId] || 'Unknown')}</td>
                  <td>${escapeHtml(formNames[s.formId] || 'Unknown')}</td>
                  <td>${timeAgo(s.createdAt)}</td>
                  <td>${s.read ? '<span class="badge badge-muted">Read</span>' : '<span class="badge badge-primary">Unread</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><h3>Couldn't load submissions</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  function previewText(data) {
    const values = Object.values(data || {});
    const text = values.join(' · ');
    return text.length > 70 ? text.slice(0, 70) + '…' : (text || '(empty submission)');
  }

  async function init() {
    try {
      const [{ websites: w }, { forms: f }] = await Promise.all([Api.listWebsites(), Api.listForms()]);
      websites = w;
      allForms = f;

      websiteFilter.innerHTML = '<option value="">All websites</option>' +
        websites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join('');

      const qWebsiteId = params.get('websiteId');
      const qFormId = params.get('formId');
      if (qWebsiteId) websiteFilter.value = qWebsiteId;
      populateFormFilter();
      if (qFormId) formFilter.value = qFormId;

      await loadSubmissions();

      const qId = params.get('id');
      if (qId) openDetail(qId);
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><h3>Couldn't load submissions</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  init();
})();
