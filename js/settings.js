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
})();
