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

  const notificationForm = document.getElementById('notificationForm');
  const notificationError = document.getElementById('notificationError');
  const notificationSuccess = document.getElementById('notificationSuccess');
  const saveNotificationBtn = document.getElementById('saveNotificationBtn');
  const notificationsEnabled = document.getElementById('notificationsEnabled');
  const notificationEmail = document.getElementById('notificationEmail');
  const notificationStatus = document.getElementById('notificationStatus');
  const notificationSummaryStatus = document.getElementById('notificationSummaryStatus');
  const notificationSummaryEmail = document.getElementById('notificationSummaryEmail');

  function showNotificationSettings(settings) {
    const enabled = settings && settings.enabled === true;
    const email = settings && settings.email ? settings.email : '';
    notificationsEnabled.checked = enabled;
    notificationEmail.value = email;
    notificationStatus.textContent = enabled ? 'Enabled' : 'Disabled';
    notificationStatus.className = `badge ${enabled ? 'badge-success' : 'badge-muted'}`;
    notificationSummaryStatus.textContent = `Email notifications: ${enabled ? 'Enabled' : 'Disabled'}`;
    notificationSummaryEmail.textContent = `Notification email: ${email || '—'}`;
  }

  (async function loadNotificationSettings() {
    try {
      const { settings } = await Api.getNotifications();
      showNotificationSettings(settings);
    } catch (err) {
      notificationError.textContent = err.message;
      notificationError.classList.add('is-visible');
      notificationStatus.textContent = 'Unavailable';
      notificationStatus.className = 'badge badge-danger';
    }
  })();

  notificationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    notificationError.classList.remove('is-visible');
    notificationSuccess.classList.remove('is-visible');

    const enabled = notificationsEnabled.checked;
    const email = notificationEmail.value.trim();
    if (enabled && !email) {
      notificationError.textContent = 'Enter a notification email before enabling alerts.';
      notificationError.classList.add('is-visible');
      return;
    }

    saveNotificationBtn.disabled = true;
    saveNotificationBtn.textContent = 'Saving...';
    try {
      const { settings } = await Api.updateNotifications({ enabled, email });
      showNotificationSettings(settings);
      notificationSuccess.textContent = 'Email notification settings saved.';
      notificationSuccess.classList.add('is-visible');
    } catch (err) {
      notificationError.textContent = err.message;
      notificationError.classList.add('is-visible');
    } finally {
      saveNotificationBtn.disabled = false;
      saveNotificationBtn.textContent = 'Save notification settings';
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

})();
