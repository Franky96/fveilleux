const SITE_VERSION = '1.2';

(function () {
  const badge = document.querySelector('[data-version-badge]');
  if (!badge) return;
  badge.textContent = SITE_VERSION;

  const isAdmin = sessionStorage.getItem('userRole') === 'admin';
  const hidden = localStorage.getItem('versionBadgeHidden') === 'true';

  if (!isAdmin || hidden) {
    badge.style.display = 'none';
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
