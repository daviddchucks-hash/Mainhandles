/**
 * Shared app-shell behavior for authenticated pages: redirects guests to
 * login, highlights the active nav link, wires up logout, and shows the
 * current user's name.
 */
function requireLogin() {
  if (!Auth.isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function initAppNav(activePage) {
  const links = document.querySelectorAll('[data-nav-link]');
  links.forEach((link) => {
    if (link.getAttribute('data-nav-link') === activePage) {
      link.classList.add('is-active');
    }
  });

  const user = Auth.getUser();
  const nameEls = document.querySelectorAll('[data-user-name]');
  nameEls.forEach((el) => {
    el.textContent = user ? user.name : '';
  });

  const logoutBtns = document.querySelectorAll('[data-logout]');
  logoutBtns.forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    Auth.logout();
  }));

  const menuToggle = document.querySelector('[data-menu-toggle]');
  const sidebar = document.querySelector('[data-sidebar]');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('is-open'));
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === undefined || str === null ? '' : String(str);
  return div.innerHTML;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60]
  ];
  for (const [name, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${name}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
