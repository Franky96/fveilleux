const SITE_VERSION = '1.4.2';

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

})();

// Section ouverte depuis la page Archives : son bouton « ← Accueil » ramène aux Archives.
// Le retour à l'accueil (dashboard) efface ce souvenir.
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  if (page === 'dashboard.html' || page === 'index.html') { sessionStorage.removeItem('retourArchives'); return; }
  if (page === 'archive.html' || sessionStorage.getItem('retourArchives') !== '1') return;
  const go = () => document.querySelectorAll('a[href="dashboard.html"]').forEach(a => {
    if (!/accueil|^\s*←\s*$/i.test(a.textContent)) return;   // seulement les boutons de retour
    a.href = 'archive.html';
    if (/accueil/i.test(a.textContent)) a.textContent = a.textContent.replace(/accueil/i, 'Archives');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
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
