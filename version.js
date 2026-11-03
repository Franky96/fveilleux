const SITE_VERSION = '2.0';

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
    // en haut à gauche (visuel 2.0), petit et sans bloquer les clics sur ce qui est dessous (bouton « ← Accueil ») ;
    // le tableau de bord le place à côté du nom du site (data-version-place)
    if (!badge.hasAttribute('data-version-place')) Object.assign(badge.style, {
      top: 'calc(4px + env(safe-area-inset-top))', bottom: 'auto', left: '4px', fontSize: '0.65rem', padding: '0.1rem 0.4rem',
      borderRadius: '4px', pointerEvents: 'none', lineHeight: '1.3',
      // couleurs de la marque, comme le logo : dégradé foncé, texte noir
      background: 'linear-gradient(90deg,#1e6585,#23753f)', color: '#071016', fontWeight: '700' });
    // le badge flottant des pages : admin seulement, masquable ; celui du nom du site (tableau de bord) : toujours, pour tous
    const isAdmin = sessionStorage.getItem('userRole') === 'admin';
    const hidden = localStorage.getItem('versionBadgeHidden') === 'true';
    if (!badge.hasAttribute('data-version-place') && (!isAdmin || hidden)) badge.style.display = 'none';
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
  const badge = document.querySelector('[data-version-badge]:not([data-version-place])');
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
