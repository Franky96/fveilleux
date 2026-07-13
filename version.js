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

  // Bouton toggle thème
  const btn = document.createElement('button');
  btn.id = 'theme-toggle';
  const isLight = document.documentElement.classList.contains('light');
  btn.textContent = isLight ? '🌙 Sombre' : '☀️ Clair';
  btn.onclick = function () {
    const nowLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', nowLight ? 'light' : 'dark');
    btn.textContent = nowLight ? '🌙 Sombre' : '☀️ Clair';
  };
  document.body.appendChild(btn);
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
