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
  cascade();
})();

/* ---------- arrivée : les groupes et les cartes apparaissent en cascade (une fois, au chargement) ---------- */
function cascade() {
  if (!document.body.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  const pas = n => Math.min(n * 45, 650);   // décalage entre deux éléments, plafonné pour les longues listes
  document.querySelectorAll('.groupe:not([hidden])').forEach(g => {
    const h = g.querySelector(':scope > header');
    if (h) h.animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, delay: 80 + pas(i), easing: 'ease-out', fill: 'backwards' });
    g.querySelectorAll('.carte:not([hidden])').forEach(c => {
      i++;
      c.animate([{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, delay: 120 + pas(i), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    });
  });
}

/* ---------- barre du haut : compte, thème, voile au défilement ---------- */
const nom = sessionStorage.getItem('userName') || '';
const bm = $('b-moi'), menu = $('menu');
bm.textContent = INVITE ? '👤' : (nom.trim()[0] || '•').toUpperCase();
bm.title = INVITE ? 'Invité' : `${nom}${ADMIN ? ' · administrateur' : ''}`;
$('m-admin').hidden = !ADMIN;
$('m-archives').hidden = INVITE || ARCHIVES_PAGE;
$('m-webmail').hidden = !(ADMIN || PERMS.includes('webmail'));
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

/* ---------- retour d'une page de votes : animation inverse de celle des pages de votes ----------
   1) le logo et la version glissent de la gauche jusqu'au milieu, rapprochés ; 2) au milieu, le titre « Outils de Frank » réapparaît entre eux */
{
  let v = null;
  try { v = JSON.parse(sessionStorage.getItem('tb2LogoGauche') || 'null'); sessionStorage.removeItem('tb2LogoGauche'); } catch (e) {}
  const m = document.querySelector('.haut .marque'), nom = m && m.querySelector('.nom');
  if (v && m && Date.now() - v.t < 15000 && m.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const r = m.getBoundingClientRect(), centre = r.left + r.width / 2;
    const ln = nom && getComputedStyle(nom).display !== 'none' ? nom.getBoundingClientRect().width : 0, ecart = parseFloat(getComputedStyle(m).columnGap) || 10;
    // le logo est centré par la mise en page : pendant que le titre est replié, il est déjà à sa place serrée, au milieu
    const serre = r.width - (ln ? ln + ecart : 0), dx0 = v.x - (ln ? centre - serre / 2 : r.left), dx1 = 0;
    if (Math.abs(dx0) > 4) {
      const T = 1250, P = 0.64, opt = { duration: T, delay: 120, fill: 'backwards' };
      m.animate([{ transform: `translateX(${dx0}px)`, offset: 0, easing: 'cubic-bezier(.65,0,.25,1)' }, { transform: `translateX(${dx1}px)`, offset: P, easing: 'ease-in-out' },
        { transform: 'none', offset: 1 }], opt);
      if (ln) {
        Object.assign(nom.style, { display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap' });
        nom.animate([{ width: '0px', marginLeft: -ecart + 'px', opacity: 0, offset: 0 }, { width: '0px', marginLeft: -ecart + 'px', opacity: 0, offset: P, easing: 'ease-in-out' },
          { width: ln + 'px', marginLeft: '0px', opacity: 1, offset: 1 }], { ...opt, fill: 'both' })
          .finished.then(() => { nom.style.cssText = ''; }).catch(() => { nom.style.cssText = ''; });
      }
    }
  }
}
