(function () {
  // Hamburger functions (global so onclick attrs work)
  window.toggleHamburger = function () {
    const menu = document.getElementById('hamburger-menu');
    const btn  = document.getElementById('hamburger-btn');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    btn.classList.toggle('open', open);
  };
  window.closeHamburger = function () {
    const menu = document.getElementById('hamburger-menu');
    const btn  = document.getElementById('hamburger-btn');
    if (menu) menu.classList.remove('open');
    if (btn)  btn.classList.remove('open');
  };
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#hamburger-btn') && !e.target.closest('#hamburger-menu')) {
      closeHamburger();
    }
  });

  // Build controls wrapper
  const controls = document.createElement('div');
  controls.className = 'page-topbar-controls';

  // Move toggle (created by theme-toggle.js) into controls
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.classList.remove('theme-toggle--fixed');
    controls.appendChild(toggle);
  }

  // Hamburger button
  const btn = document.createElement('button');
  btn.id = 'hamburger-btn';
  btn.setAttribute('aria-label', 'Menu');
  btn.onclick = window.toggleHamburger;
  btn.innerHTML = '<span></span><span></span><span></span>';

  // Dropdown
  const menu = document.createElement('div');
  menu.id = 'hamburger-menu';
  menu.innerHTML =
    '<a href="https://mail.hostinger.com/" id="btn-webmail" target="_blank" class="hbg-item" onclick="closeHamburger()">✉️ Webmail</a>' +
    '<div class="hbg-sep" id="admin-sep"></div>' +
    '<button id="logoutBtn" class="hbg-item">🚪 Déconnexion</button>';

  controls.appendChild(btn);
  controls.appendChild(menu);

  // Inject into topbar
  const topbar = document.querySelector('[data-topbar]');
  if (topbar) topbar.appendChild(controls);

  // Wire permissions + logout
  function wireControls() {
    const perms = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
    const role  = sessionStorage.getItem('userRole');

    const webmailBtn = document.getElementById('btn-webmail');
    if (webmailBtn) webmailBtn.style.display = perms.includes('webmail') ? 'flex' : 'none';

    if (role === 'admin') {
      const sep = document.getElementById('admin-sep');
      if (sep) sep.style.display = 'block';
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await fetch('/api/login.php', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout' }),
        }).catch(() => {});
        sessionStorage.clear();
        window.location.href = 'index.html';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireControls);
  } else {
    wireControls();
  }
})();
