(async function () {
  if (!requireLogin()) return;
  initAppNav('dashboard');

  const user = Auth.getUser();
  const avatarEl = document.getElementById('avatarInitial');
  if (user && avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

  const statsWrap = document.getElementById('statsWrap');
  const recentWrap = document.getElementById('recentWrap');

  try {
    const [{ stats, recentSubmissions }, { websites }, { forms }] = await Promise.all([
      Api.getDashboard(),
      Api.listWebsites(),
      Api.listForms()
    ]);
    const websiteNames = Object.fromEntries(websites.map((w) => [w.id, w.name]));
    const formNames = Object.fromEntries(forms.map((f) => [f.id, f.name]));

    statsWrap.innerHTML = `
      <div class="stats-grid">
        <div class="card stat-card">
          <div class="label">Total websites</div>
          <div class="value">${stats.totalWebsites}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Total forms</div>
          <div class="value">${stats.totalForms}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Total submissions</div>
          <div class="value">${stats.totalSubmissions}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Unread submissions</div>
          <div class="value accent">${stats.unreadSubmissions}</div>
        </div>
      </div>
    `;

    if (recentSubmissions.length === 0) {
      recentWrap.innerHTML = `
        <div class="empty-state">
          <div class="icon">✉</div>
          <h3>No submissions yet</h3>
          <p>Once your forms start receiving visitor submissions, they'll show up here.</p>
        </div>`;
      return;
    }

    recentWrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Preview</th><th>Website / Form</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>
            ${recentSubmissions.map((s) => `
              <tr class="clickable ${!s.read ? 'is-unread' : ''}" onclick="window.location.href='submissions.html?id=${s.id}'">
                <td>${escapeHtml(previewText(s.data))}</td>
                <td>${escapeHtml(websiteNames[s.websiteId] || 'Unknown site')} — ${escapeHtml(formNames[s.formId] || 'Unknown form')}</td>
                <td>${timeAgo(s.createdAt)}</td>
                <td>${s.read ? '<span class="badge badge-muted">Read</span>' : '<span class="badge badge-primary">Unread</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    statsWrap.innerHTML = `<div class="empty-state"><h3>Couldn't load dashboard</h3><p>${escapeHtml(err.message)}</p></div>`;
  }

  function previewText(data) {
    const values = Object.values(data || {});
    const text = values.join(' · ');
    return text.length > 70 ? text.slice(0, 70) + '…' : (text || '(empty submission)');
  }
})();
