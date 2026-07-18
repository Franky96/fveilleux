const SITE_VERSION = '1.3.2';

// Applique le thème sauvegardé le plus tôt possible pour éviter le flash
(function () {
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light');
  }
})();

(function () {
  // Badge de version
  const badge = document.querySelector('[data-version-badge]');
  if (badge) {
    badge.textContent = SITE_VERSION;
    const isAdmin = sessionStorage.getItem('userRole') === 'admin';
    const hidden = localStorage.getItem('versionBadgeHidden') === 'true';
    if (!isAdmin || hidden) badge.style.display = 'none';
  }

  // Toggle thème (style interrupteur iOS)
  const toggle = document.createElement('div');
  toggle.id = 'theme-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Basculer mode clair/sombre');
  const isLight = document.documentElement.classList.contains('light');
  toggle.setAttribute('aria-checked', isLight ? 'true' : 'false');
  const knob = document.createElement('span');
  knob.id = 'theme-toggle-knob';
  toggle.appendChild(knob);
  toggle.onclick = function () {
    const nowLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', nowLight ? 'light' : 'dark');
    toggle.setAttribute('aria-checked', nowLight ? 'true' : 'false');
  };

  // Sur les pages avec bouton déconnexion : insère le toggle juste avant
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn && logoutBtn.parentNode) {
    toggle.classList.add('theme-toggle--inline');
    logoutBtn.parentNode.insertBefore(toggle, logoutBtn);
  } else {
    toggle.classList.add('theme-toggle--fixed');
    document.body.appendChild(toggle);
  }
})();

window.toggleVersionBadge = function () {
  const hidden = localStorage.getItem('versionBadgeHidden') === 'true';
  const newHidden = !hidden;
  localStorage.setItem('versionBadgeHidden', newHidden);
  const badge = document.querySelector('[data-version-badge]');
  if (badge) badge.style.display = newHidden ? 'none' : '';
  const btn = document.getElementById('toggle-version-btn');
  if (btn) updateToggleBtn(btn, newHidden);
};

window.updateToggleBtn = function (btn, hidden) {
  if (hidden) {
    btn.style.borderColor = '#3a3a3a';
    btn.style.color = '#555';
  } else {
    btn.style.borderColor = '#ff4444';
    btn.style.color = '#ff4444';
  }
};
