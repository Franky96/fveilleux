const SITE_VERSION = '2.0';

// Fiabilité (3 novembre 2026) : l'hébergeur répond parfois « 503 » (page HTML « The server is temporarily busy »)
// sans même lancer PHP. Toute requête du site vers /api/ qui reçoit ce 503 est donc refaite, quelques fois, avec de
// courtes pauses : la requête n'avait rien fait, la refaire est sans risque. Les 503 envoyés par nos scripts (JSON,
// ex. « résultats indisponibles ») ne sont pas touchés. Chargé par presque toutes les pages, avant leurs modules.
(function () {
  if (window.__fetchFiable || !window.fetch) return;
  window.__fetchFiable = true;
  const f0 = window.fetch.bind(window);
  window.fetch = async function (entree, options) {
    let url;
    try { url = new URL(typeof entree === 'string' || entree instanceof URL ? entree : entree.url, location.href); } catch (e) { return f0(entree, options); }
    const rejouable = typeof entree === 'string' || entree instanceof URL;   // un objet Request ne se renvoie pas tel quel
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || !rejouable) return f0(entree, options);
    for (let essai = 0; ; essai++) {
      const res = await f0(entree, options);
      const html = (res.headers.get('content-type') || '').includes('text/html');
      if (res.status !== 503 || !html || essai >= 6) return res;
      await new Promise(r => setTimeout(r, 250 + Math.random() * 250 + Math.min(150 * essai, 900)));
    }
  };
})();

// Bascule clair / sombre animée (3 novembre 2026, demande de l'utilisateur) : le nouveau thème se répand en cercle à partir du
// bouton cliqué (View Transitions ; sinon, ou en mouvement réduit, bascule directe). appliquer() fait le vrai changement.
window.basculerThemeAnime = function (bouton, appliquer) {
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (bouton) { bouton.classList.remove('theme-tourne'); void bouton.offsetWidth; bouton.classList.add('theme-tourne'); }
  if (!document.startViewTransition || reduit || !bouton) { appliquer(); return; }
  const r = bouton.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(appliquer);
  t.ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
    { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
};
(function () {
  const st = document.createElement('style');
  st.textContent = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}'
    + '::view-transition-old(root){z-index:1}::view-transition-new(root){z-index:2}'
    + '.theme-tourne{animation:themeTourne .6s cubic-bezier(.2,.9,.3,1.25)}'
    + '@keyframes themeTourne{from{transform:rotate(-140deg) scale(.55)}}'
    + '@media (prefers-reduced-motion: reduce){.theme-tourne{animation:none}}';
  document.head.appendChild(st);
})();

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
