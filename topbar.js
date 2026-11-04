/* Barre du haut 2.0 commune à tout le site (3 novembre 2026, demande de l'utilisateur : une barre cohérente partout).
   Retour dans le coin gauche (si la page en a un), logo et « Outils de Frank » au milieu, thème et menu du compte à droite —
   la même que le tableau de bord et les pages de catégorie, qui l'ont dans leur propre balisage.
   Chargée avec defer : elle prend le lien de retour de la page (le premier lien « ← … » vers une page .html, ou
   <body data-retour="page.html" data-retour-nom="Nom">), puis cache les anciens boutons (retour, interrupteur de thème,
   menu hamburger, badge de version flottant). Le reste de la page ne change pas. */
(function () {
  if (window.__topbar2 || document.querySelector('.tb2')) return;
  window.__topbar2 = true;
  const D = document, B = D.body, html = D.documentElement;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = sessionStorage.getItem('userRole'), ADMIN = role === 'admin', INVITE = role === 'guest';
  const PERMS = (() => { try { return JSON.parse(sessionStorage.getItem('userPermissions') || '[]'); } catch (e) { return []; } })();
  const nom = sessionStorage.getItem('userName') || '';

  /* ---------- retour : celui de la page ---------- */
  let retour = null, lienPage = null;
  if (B.dataset.retour) retour = { h: B.dataset.retour, n: B.dataset.retourNom || 'Retour' };
  else {
    lienPage = [...D.querySelectorAll('a[href]')].find(a => /\.html(\?|#|$)/.test(a.getAttribute('href')) && /^\s*(\u2190|&#8592;)/.test(a.textContent));
    if (lienPage) {
      let n = lienPage.textContent.replace(/^\s*\u2190\s*/, '').trim();
      const h = lienPage.getAttribute('href');
      const NOMS = { 'dashboard.html': 'Accueil', 'moteurs.html': 'Moteurs', 'informatique.html': 'Informatique', 'jeuxdesociete.html': 'Jeux de soci\u00e9t\u00e9', 'aviation.html': 'Aviation', 'archive.html': 'Archives', 'intentions-simulations.html': 'Intentions de vote' };
      if (NOMS[h.split(/[?#]/)[0]]) n = NOMS[h.split(/[?#]/)[0]];   // libellé uniforme : le nom de la page où l'on retourne
      if (!n) n = 'Retour';
      retour = { h, n };
    }
  }
  // section ouverte depuis les Archives : le retour y ramène (comme version.js)
  if (retour && retour.h === 'dashboard.html' && sessionStorage.getItem('retourArchives') === '1') retour = { h: 'archive.html', n: 'Archives' };

  /* ---------- style (préfixé .tb2 : style.css et les styles des pages ne s'y appliquent pas) ---------- */
  const fonts = D.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
  D.head.appendChild(fonts);
  const st = D.createElement('style');
  st.textContent = `
.tb2{--tb-bg:#0a0e11;--tb-panel:#121a20;--tb-panel2:#17212a;--tb-line:#212d36;--tb-line2:#2d3c47;--tb-text:#e3eaef;--tb-muted:#8a99a5;
  --m1:#1e6585;--m2:#23753f;--m3:#45379e;--m4:#8f5a1a;
  position:sticky;top:0;z-index:2147483000;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:14px;
  width:100%;margin:0;padding:10px max(18px,env(safe-area-inset-right)) 10px max(18px,env(safe-area-inset-left));
  font:15px/1.4 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--tb-text);text-align:left;letter-spacing:normal;
  background:color-mix(in srgb,var(--tb-bg) 88%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2);
  border-bottom:1px solid color-mix(in srgb,var(--tb-line2) 70%,transparent)}
html.light .tb2{--tb-bg:#f2f4f6;--tb-panel:#ffffff;--tb-panel2:#f6f8fa;--tb-line:#e0e6eb;--tb-line2:#c9d3db;--tb-text:#16212b;--tb-muted:#566571}
.tb2 *{box-sizing:border-box}
.tb2 a{color:inherit;text-decoration:none}
.tb2 .tb2-retour{justify-self:start;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:6px 12px;border-radius:999px;border:1px solid var(--tb-line2);
  background:var(--tb-panel);color:var(--tb-muted);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb2 .tb2-retour:hover{color:var(--tb-text);border-color:var(--m1)}
.tb2 .tb2-vide{justify-self:start}
.tb2 .tb2-marque{grid-column:2;display:flex;align-items:center;gap:10px;font:700 20px/1 "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.02em;white-space:nowrap}
.tb2 .tb2-logo{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;position:relative;overflow:hidden;flex:none;
  background:conic-gradient(from 210deg,var(--m1),var(--m2),var(--m4),var(--m3),var(--m1))}
.tb2 .tb2-logo::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.18),transparent 55%)}
.tb2 .tb2-logo span{position:relative;z-index:1;font:800 17px/1 "Barlow Condensed","Arial Narrow",sans-serif;color:#071016;letter-spacing:-.3px;-webkit-text-stroke:2px #a9b4bd;paint-order:stroke fill}
html.light .tb2 .tb2-logo span{color:#fff;-webkit-text-stroke-color:#071016}
.tb2 .tb2-logo i{font-style:normal;font-size:12px;opacity:.62}
.tb2 .tb2-badge{font:700 11.5px/1.3 "IBM Plex Mono",ui-monospace,monospace;padding:2px 7px;border-radius:999px;color:#071016;background:linear-gradient(90deg,var(--m1),var(--m2))}
.tb2 .tb2-outils{grid-column:3;justify-self:end;display:flex;align-items:center;gap:8px}
.tb2 .tb2-rond{width:38px;height:38px;margin:0;padding:0;border-radius:50%;border:1px solid var(--tb-line2);background:var(--tb-panel);color:var(--tb-text);
  display:grid;place-items:center;cursor:pointer;font:16px/1 "IBM Plex Sans",system-ui,sans-serif;box-shadow:none}
.tb2 .tb2-rond:hover{border-color:var(--m1)}
.tb2 .tb2-moi{font:700 16px/1 "Barlow Condensed","Arial Narrow",sans-serif;background:var(--tb-panel2)}
.tb2 .tb2-zone{position:relative}
.tb2 .tb2-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:210px;padding:6px;background:var(--tb-panel);border:1px solid var(--tb-line2);border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.3)}
.tb2 .tb2-menu[hidden],.tb2 .tb2-menu [hidden]{display:none!important}
.tb2 .tb2-menu a,.tb2 .tb2-menu button{display:flex;gap:10px;width:100%;margin:0;padding:9px 10px;border:0;border-radius:8px;background:none;color:var(--tb-text);text-align:left;cursor:pointer;font:14px/1.3 "IBM Plex Sans",system-ui,sans-serif}
.tb2 .tb2-menu a:hover,.tb2 .tb2-menu button:hover{background:var(--tb-panel2)}
.tb2 .tb2-menu hr{border:none;border-top:1px solid var(--tb-line);margin:4px 0}
.tb2 :focus-visible{outline:2px solid var(--m1);outline-offset:2px}
html.tb2-fixe .tb2{position:fixed;left:0;right:0;top:0}
html.tb2-actif .page-container,html.tb2-actif .sidebar,html.tb2-actif .page-content{min-height:calc(100dvh - var(--tb2-h))!important}
html.tb2-actif .sidebar[style*="100vh"]{height:calc(100dvh - var(--tb2-h))!important}
html.tb2-fixe body{padding-top:var(--tb2-h)!important;box-sizing:border-box}
.tb2.tb2-infos{grid-template-columns:auto minmax(0,1fr) auto}
.tb2 .tb2-gauche{display:flex;align-items:center;gap:12px;min-width:0}
.tb2.tb2-infos .tb2-marque{grid-column:auto}
.tb2.tb2-infos .tb2-nom{display:none}
.tb2.tb2-infos .tb2-outils{grid-column:3}
.tb2 .tb2-site{display:contents}
.tb2 .tb2-site .titre{grid-column:2;margin:0;text-align:center;font:600 13px/1.35 "IBM Plex Sans",system-ui,sans-serif;color:var(--tb-text);text-wrap:balance;min-width:0}
.tb2 .tb2-site .titre > [hidden]{display:none}
@media (max-width:640px){.tb2{gap:8px}.tb2 .tb2-nom{display:none}.tb2 .tb2-retour{width:34px;height:34px;padding:0;justify-content:center}.tb2 .tb2-rnom{display:none}.tb2 .tb2-rond{width:34px;height:34px}}
/* anciens boutons remplacés par la barre */
html.tb2-actif #theme-toggle,html.tb2-actif .page-topbar-controls,html.tb2-actif #hamburger-btn,html.tb2-actif #hamburger-menu,
html.tb2-actif .header-controls,html.tb2-actif .archive-btn,html.tb2-actif [data-version-badge]:not(.tb2-badge),html.tb2-actif .tb2-cache{display:none!important}
.tb2-theme-tourne{animation:tb2Tourne .6s cubic-bezier(.2,.9,.3,1.25)}
@keyframes tb2Tourne{from{transform:rotate(-140deg) scale(.55)}}
::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}
::view-transition-old(root){z-index:1}::view-transition-new(root){z-index:2}
@media (prefers-reduced-motion: reduce){.tb2-theme-tourne{animation:none}}`;
  D.head.appendChild(st);

  /* ---------- la barre ---------- */
  const bar = D.createElement('header');
  bar.className = 'tb2';
  bar.innerHTML = `${retour ? `<a class="tb2-retour" href="${esc(retour.h)}" title="Retour : ${esc(retour.n)}" aria-label="Retour : ${esc(retour.n)}">\u2190<span class="tb2-rnom"> ${esc(retour.n)}</span></a>` : '<span class="tb2-vide"></span>'}
  <a class="tb2-marque" href="dashboard.html" title="Retour \u00e0 l'accueil"><span class="tb2-logo" aria-hidden="true"><span>O<i>d</i>F</span></span><span class="tb2-nom">Outils de Frank</span><span class="tb2-badge">${esc(typeof SITE_VERSION !== 'undefined' ? SITE_VERSION : '2.0')}</span></a>
  <div class="tb2-outils">
    <button class="tb2-rond" type="button" data-tb="theme" title="Th\u00e8me clair ou sombre"></button>
    <div class="tb2-zone">
      <button class="tb2-rond tb2-moi" type="button" data-tb="moi" aria-haspopup="menu" aria-expanded="false"></button>
      <div class="tb2-menu" role="menu" hidden>
        <a href="admin.html" role="menuitem" ${ADMIN ? '' : 'hidden'}>\u2699\ufe0f Administration</a>
        <a href="dashboard.html" role="menuitem">\u{1f3e0} Accueil</a>
        <a href="archive.html" role="menuitem" ${INVITE ? 'hidden' : ''}>\u{1f4c1} Archives</a>
        <a href="https://mail.hostinger.com/" target="_blank" rel="noopener" role="menuitem" ${ADMIN || PERMS.includes('webmail') ? '' : 'hidden'}>\u2709\ufe0f Webmail</a>
        <hr>
        <button type="button" role="menuitem" data-tb="sortir">\u21a9 D\u00e9connexion</button>
      </div>
    </div>
  </div>`;
  // avant d'insérer : une page « application » tient exactement dans l'écran ; ses blocs pleine hauteur seront raccourcis de la barre
  const tientDansLecran = D.documentElement.scrollHeight <= innerHeight + 2;
  const pleins = tientDansLecran ? [B, ...B.querySelectorAll(':scope > *, :scope > * > *')].filter(el => {
    const c = getComputedStyle(el); return c.position !== 'fixed' && c.display !== 'none' && Math.abs(el.getBoundingClientRect().height - innerHeight) < 2;
  }) : [];
  const cb = getComputedStyle(B), corpsEnLigne = /flex|grid/.test(cb.display) && !(cb.display.includes('flex') && cb.flexDirection.startsWith('column') && cb.alignItems !== 'center');
  B.insertBefore(bar, B.firstChild);
  // pages qui affichaient leurs mises à jour dans une barre à elles (Intentions de vote, En direct : .site-top .titre) :
  // une seule barre, avec le retour et le logo à gauche, les mises à jour au milieu (demande de l'utilisateur, 4 novembre 2026).
  // La ligne d'info est déplacée telle quelle, dans un conteneur .site-top « transparent » : les scripts qui la mettent à jour la retrouvent.
  const titreInfos = D.querySelector('.site-top .titre');
  if (titreInfos) {
    // animation au chargement : le logo et la version partent du milieu et glissent jusqu'à leur place, à gauche (demande de l'utilisateur)
    const marque = bar.querySelector('.tb2-marque');
    marque.querySelector('.tb2-nom').style.display = 'none';
    const avant = marque.getBoundingClientRect();
    const vieux = titreInfos.closest('.site-top'), gauche = D.createElement('div'), env = D.createElement('div');
    gauche.className = 'tb2-gauche';
    gauche.append(bar.querySelector('.tb2-retour, .tb2-vide'), bar.querySelector('.tb2-marque'));
    env.className = 'site-top tb2-site'; env.appendChild(titreInfos);
    bar.prepend(gauche); gauche.after(env);
    bar.classList.add('tb2-infos');
    vieux.style.display = 'none';
    marque.querySelector('.tb2-nom').style.display = '';
    // une seule fois par visite : pas en passant d'un onglet (d'une page) à l'autre de la section
    let dejaVu = false;
    try { dejaVu = sessionStorage.getItem('tb2GlisseVu') === '1'; sessionStorage.setItem('tb2GlisseVu', '1'); } catch (e) {}
    if (!dejaVu && !matchMedia('(prefers-reduced-motion: reduce)').matches && marque.animate) {
      const apres = marque.getBoundingClientRect(), dx = avant.left - apres.left;
      if (Math.abs(dx) > 4) {
        marque.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 750, delay: 150, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'backwards' });
        titreInfos.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: 650, easing: 'ease-out', fill: 'backwards' });
      }
    }
  }
  html.classList.add('tb2-actif');
  // corps en flex ou en grille (barre de côté, contenu centré) : la barre est fixée en haut et le corps décalé d'autant
  if (corpsEnLigne || bar.getBoundingClientRect().top > 2 || bar.getBoundingClientRect().width < innerWidth - 20) html.classList.add('tb2-fixe');
  if (lienPage) {
    // ancien retour : retiré ; dans un en-tête en grille (retour | titre | boutons), seulement rendu invisible pour que le titre reste centré
    const pc = getComputedStyle(lienPage.parentElement);
    if (pc.display.includes('grid') && pc.gridTemplateColumns.split(' ').length >= 3) lienPage.style.visibility = 'hidden';
    else lienPage.classList.add('tb2-cache');
  }

  /* ---------- thème : en cercle depuis le bouton, comme ailleurs ---------- */
  const bt = bar.querySelector('[data-tb="theme"]');
  const majT = () => { bt.textContent = html.classList.contains('light') ? '\u263e' : '\u2600\ufe0e'; };
  const appliquer = () => {
    const c = html.classList.toggle('light');
    try { localStorage.setItem('theme', c ? 'light' : 'dark'); } catch (e) {}
    majT();
    const t = D.getElementById('theme-toggle'); if (t) t.setAttribute('aria-checked', c ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('themechange', { detail: { light: c } }));   // pages qui dessinent elles-mêmes (canvas, 3D)
  };
  bt.addEventListener('click', () => {
    bt.classList.remove('tb2-theme-tourne'); void bt.offsetWidth; bt.classList.add('tb2-theme-tourne');
    if (!D.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { appliquer(); return; }
    const r = bt.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    D.startViewTransition(appliquer).ready.then(() => html.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  });
  majT();
  new MutationObserver(majT).observe(html, { attributes: true, attributeFilter: ['class'] });

  /* ---------- menu du compte ---------- */
  const bm = bar.querySelector('[data-tb="moi"]'), menu = bar.querySelector('.tb2-menu');
  bm.textContent = INVITE ? '\u{1f464}' : (nom.trim()[0] || '\u2022').toUpperCase();
  bm.title = INVITE ? 'Invit\u00e9' : `${nom}${ADMIN ? ' \u00b7 administrateur' : ''}`;
  bm.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; bm.setAttribute('aria-expanded', !menu.hidden); });
  D.addEventListener('click', e => { if (!e.target.closest('.tb2-zone')) { menu.hidden = true; bm.setAttribute('aria-expanded', 'false'); } });
  bar.querySelector('[data-tb="sortir"]').addEventListener('click', async () => {
    await fetch('/api/login.php', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
    sessionStorage.clear();
    location.href = 'index.html';
  });

  /* ---------- éléments collés en haut de la page : glissent sous la barre au lieu de passer dessous ---------- */
  const h = () => bar.getBoundingClientRect().height;
  html.style.setProperty('--tb2-h', h() + 'px');
  for (const el of pleins) {
    if (el === B) continue;   // le corps garde sa hauteur : la barre est dedans, ses enfants pleine hauteur sont raccourcis
    const c = getComputedStyle(el);
    if (Math.abs(parseFloat(c.minHeight) - innerHeight) < 2) el.style.minHeight = 'calc(100dvh - var(--tb2-h))';   // min-height: 100vh
    else { el.style.height = 'calc(100dvh - var(--tb2-h))'; el.style.maxHeight = 'calc(100dvh - var(--tb2-h))'; }
  }
  // les pages qui calculent leur taille (canevas, scène 3D) la recalculent avec la barre
  requestAnimationFrame(() => dispatchEvent(new Event('resize')));
  // corps en flex centré (Admin…) : le contenu part du haut, sous la barre (sinon un contenu plus haut que l'écran est coupé en haut)
  if (html.classList.contains('tb2-fixe') && getComputedStyle(B).alignItems === 'center' && getComputedStyle(B).flexDirection.startsWith('row')) B.style.alignItems = 'flex-start';
  addEventListener('resize', () => html.style.setProperty('--tb2-h', h() + 'px'));
  requestAnimationFrame(() => {
    for (const el of D.querySelectorAll('body *')) {
      if (el === bar || bar.contains(el)) continue;
      const c = getComputedStyle(el);
      if (c.position === 'sticky' && parseFloat(c.top) < 30) el.style.top = `calc(var(--tb2-h) + ${parseFloat(c.top) || 0}px)`;
    }
  });
})();
