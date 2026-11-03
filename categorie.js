// Pages de catégorie, visuel 2.0 (Moteurs, Informatique, Jeux de société, Archives).
// <body data-parent="moteurs"> : la permission du groupe ; <body data-mode="archives"> : la page Archives.
// Chaque <a class="carte" data-section="…"> est caché si la personne n'y a pas droit ou si la section est archivée.
import { db, doc, getDoc } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const ANC = { qrlink: 'qr-transfer', shapelink: 'shape-transfer' };   // anciens noms de permissions
const PERMS = JSON.parse(sessionStorage.getItem('userPermissions') || '[]').map(k => ANC[k] || k);
const ROLE = sessionStorage.getItem('userRole');
const ADMIN = ROLE === 'admin', INVITE = ROLE === 'guest';
const PARENT = document.body.dataset.parent || '';
const ARCHIVES_PAGE = document.body.dataset.mode === 'archives';

if (!sessionStorage.getItem('loggedIn')) location.href = 'index.html';

/* ---------- cartes visibles ---------- */
(async () => {
  let archivees = [];
  try { const s = await getDoc(doc(db, 'systeme', 'config')); if (s.exists()) archivees = (s.data().archivedSections || []).map(k => ANC[k] || k); }
  catch (e) { /* hors ligne : rien d'archivé */ }

  const cartes = [...document.querySelectorAll('.carte[data-section]')];
  for (const c of cartes) {
    const s = c.dataset.section, p = c.dataset.parent;
    let voir;
    if (ARCHIVES_PAGE) {
      // seulement les sections archivées auxquelles on a droit ; une page dont tout le groupe est archivé passe par la carte du groupe
      voir = archivees.includes(s) && !(p && archivees.includes(p)) && (ADMIN || PERMS.includes(s) || (p && PERMS.includes(p)));
      c.addEventListener('click', () => sessionStorage.setItem('retourArchives', '1'));   // son bouton d'accueil ramènera ici (version.js)
    } else {
      // groupe entier archivé (ouvert depuis Archives) : on montre ses pages, archivées avec lui
      const archivee = archivees.includes(s) && !archivees.includes(PARENT);
      voir = !archivee && (ADMIN || PERMS.includes(PARENT) || PERMS.includes(s));
    }
    c.hidden = !voir;
  }
  let total = 0;
  document.querySelectorAll('.groupe').forEach(g => {
    const n = g.querySelectorAll('.carte:not([hidden])').length;
    g.hidden = !n; total += n;
    const nb = g.querySelector('.nb'); if (nb) nb.textContent = n;
  });
  const vide = document.querySelector('.vide'); if (vide) vide.style.display = total ? 'none' : 'block';
  document.querySelector('.cartes-zone')?.classList.add('pret');
})();

/* ---------- barre du haut : compte, thème, voile au défilement ---------- */
const nom = sessionStorage.getItem('userName') || '';
const bm = $('b-moi'), menu = $('menu');
bm.textContent = INVITE ? '👤' : (nom.trim()[0] || '•').toUpperCase();
bm.title = INVITE ? 'Invité' : `${nom}${ADMIN ? ' · administrateur' : ''}`;
$('m-admin').hidden = !ADMIN;
$('m-archives').hidden = INVITE || ARCHIVES_PAGE;
$('m-webmail').hidden = !(ADMIN || PERMS.includes('webmail'));
$('m-version').hidden = !ADMIN;
$('m-version').addEventListener('click', () => { if (window.toggleVersionBadge) window.toggleVersionBadge(); menu.hidden = true; });
bm.addEventListener('click', () => { menu.hidden = !menu.hidden; bm.setAttribute('aria-expanded', !menu.hidden); });
addEventListener('click', e => { if (!e.target.closest('.moi-zone')) { menu.hidden = true; bm.setAttribute('aria-expanded', 'false'); } });
$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/login.php', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
  sessionStorage.clear();
  location.href = 'index.html';
});
const bt = $('b-theme');
const majT = () => { bt.textContent = document.documentElement.classList.contains('light') ? '☾' : '☀︎'; };
bt.addEventListener('click', () => {
  const appliquer = () => { const c = document.documentElement.classList.toggle('light'); try { localStorage.setItem('theme', c ? 'light' : 'dark'); } catch (e) {} majT(); };
  if (window.basculerThemeAnime) window.basculerThemeAnime(bt, appliquer); else appliquer();   // en cercle depuis le bouton (version.js)
});
majT();
{ const h = document.querySelector('.haut'); const f = () => h.classList.toggle('colle', scrollY > 4); addEventListener('scroll', f, { passive: true }); f(); }
