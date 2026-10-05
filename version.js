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

// Mise à jour automatique : si le site a été redéployé depuis l'ouverture de la page (onglet resté ouvert,
// page restaurée par le téléphone), elle se recharge d'elle-même. Vérifié au retour sur l'onglet et toutes les 2 min.
// Jamais pendant une saisie (champ actif) : on attend que le champ soit quitté.
(function () {
  if (location.protocol === 'file:') return;
  const url = new URL('api/version.php', document.currentScript ? document.currentScript.src : location.href).href;
  let depart = null, attente = false;
  const enSaisie = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  const verifier = async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      const v = (await r.json()).v;
      if (!v) return;
      if (depart === null) { depart = v; return; }
      if (v === depart) return;
      if (enSaisie()) { if (!attente) { attente = true; document.addEventListener('focusout', () => { attente = false; setTimeout(verifier, 300); }, { once: true }); } return; }
      // garde-fou : au plus un rechargement automatique par 30 s
      const dernier = +sessionStorage.getItem('majAuto') || 0;
      if (Date.now() - dernier < 30000) return;
      sessionStorage.setItem('majAuto', String(Date.now()));
      location.reload();
    } catch (e) { /* hors ligne : on réessaiera */ }
  };
  verifier();
  setInterval(verifier, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verifier(); });
  // page restaurée depuis le cache arrière/avant du navigateur : elle peut dater de plusieurs jours
  window.addEventListener('pageshow', e => { if (e.persisted) { depart === null ? location.reload() : verifier(); } });
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
