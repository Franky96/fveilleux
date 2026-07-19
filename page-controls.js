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

  // Dropdown — admin items hidden by default, shown in wireControls()
  const menu = document.createElement('div');
  menu.id = 'hamburger-menu';
  menu.innerHTML =
    '<a href="https://mail.hostinger.com/" id="btn-webmail" target="_blank" class="hbg-item" onclick="closeHamburger()">✉️ Webmail</a>' +
    '<button id="toggle-version-btn" class="hbg-item" onclick="if(window.toggleVersionBadge)toggleVersionBadge();closeHamburger();">🏷️ Badge version</button>' +
    '<a id="btn-construction" href="beta/dashboard.html" class="hbg-item" onclick="closeHamburger()">🚧 En construction</a>' +
    '<div class="hbg-sep" id="admin-sep"></div>' +
    '<button id="logoutBtn" class="hbg-item">↩ Déconnexion</button>';

  controls.appendChild(btn);
  controls.appendChild(menu);

  // Inject into topbar
  const topbar = document.querySelector('[data-topbar]');
  if (topbar) topbar.appendChild(controls);

  // Wire permissions + logout
  function wireControls() {
    const role    = sessionStorage.getItem('userRole');
    const isAdmin = role === 'admin';

    const webmailBtn = document.getElementById('btn-webmail');
    if (webmailBtn) webmailBtn.style.display = isAdmin ? 'flex' : 'none';

    const badgeBtn = document.getElementById('toggle-version-btn');
    if (badgeBtn) {
      badgeBtn.style.display = isAdmin ? 'flex' : 'none';
      if (isAdmin && window.updateToggleBtn) {
        window.updateToggleBtn(badgeBtn, localStorage.getItem('versionBadgeHidden') === 'true');
      }
    }

    const constructionBtn = document.getElementById('btn-construction');
    if (constructionBtn) constructionBtn.style.display = isAdmin ? 'flex' : 'none';

    const sep = document.getElementById('admin-sep');
    if (sep) sep.style.display = isAdmin ? 'block' : 'none';

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
