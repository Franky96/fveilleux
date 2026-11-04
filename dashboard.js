// Tableau de bord (visuel 2.0, novembre 2026) : recherche, raccourcis de chaque compte, tout le site groupé par thème,
// notifications d'événements (selon les permissions) et de vérifications (administrateurs seulement).
import { db, doc, getDoc } from "./firebase-config.js";

if (!sessionStorage.getItem('loggedIn')) window.location.href = 'index.html';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sansAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const ROLE = sessionStorage.getItem('userRole'), ADMIN = ROLE === 'admin', INVITE = ROLE === 'guest';
const ANC = { loi39: 'votes-quebec', qrlink: 'qr-transfer', shapelink: 'shape-transfer' };   // anciens noms de permissions
const PERMS = JSON.parse(sessionStorage.getItem('userPermissions') || '[]').map(k => ANC[k] || k);
const a = k => ADMIN || PERMS.includes(k);

/* ---------- tout le site, par thème : [page, icône, nom, description, permission, sous-pages [page, nom, permission]] ---------- */
const GROUPES = [
  { nom: 'Aviation et moteurs', ic: '✈️', c: '--c-avia', pages: [
    ['moteurs.html', '🌀', 'Moteurs', 'Simulateurs de moteurs et notions connexes', 'moteurs', [
      ['Simulateurs', [['pt6a21.html', 'PT6A-21', 'pt6a21'], ['o320.html', 'O-320', 'o320']]],
      ['Aperçus', [['turboreacteur.html', 'CFM56-7B', 'turboreacteur'], ['pw1500g.html', 'PW1500G', 'pw1500g']]],
      ['Connexe', [['helice.html', 'Hélice', 'helice'], ['planetaire.html', 'Engrenages planétaires', 'planetaire'], ['pompe-engrenages.html', 'Pompe à engrenages', 'pompe-engrenages']]]]],
    ['aviation.html', '🛩️', 'Aviation', 'Outils, météo et aéronefs', 'aviation', [['aeronefs.html', 'Aéronefs', 'aeronefs']]],
    ['ena.html', '🛠️', 'ÉNA', "École nationale d'aérotechnique", 'ena'],
  ]},
  { nom: 'Avionique et informatique', ic: '💻', c: '--c-info', pages: [
    ['informatique.html', '💻', 'Informatique', 'Outils techniques et avioniques', 'informatique', [
      ['Avionique', [['arinc429.html', 'ARINC 429', 'arinc429'], ['csdb.html', 'CSDB', 'csdb'], ['crypteur.html', 'Encodeur BNR', 'crypteur'], ['converter.html', 'Convertisseur', 'converter']]],
      ['Réseau', [['tcpip.html', 'TCP/IP', 'tcpip'], ['qr-transfer.html', 'QR Transfert', 'qr-transfer'], ['shape-transfer.html', 'Shape Transfert', 'shape-transfer']]],
      ['Circuits', [['chips.html', 'Simulateurs de puces', 'chips'], ['circuit.html', 'Circuit logique', 'circuit']]]]],
    ['distant.html', '🖥️', 'Connexion à distance', 'Manuels de maintenance du cégep, dans le navigateur', 'distant'],
  ]},
  { nom: 'Politique et monde', ic: '🌎', c: '--c-pol', pages: [
    ['intentions-simulations.html', '🗳️', 'Intentions de vote et simulations', 'Sondages, projections et soirées électorales', 'votes-quebec', [
      ['Section', [['intentions-simulations.html', 'Accueil', 'votes-quebec'], ['en-direct.html', 'En direct', 'votes-quebec']]],
      ['Québec', [['votes-quebec.html', 'Québec', 'votes-quebec'], ['loi39.html', 'Loi 39', 'votes-quebec']]],
      ['Amérique', [['votes-alberta.html', 'Alberta', 'votes-quebec'], ['votes-canada.html', 'Canada', 'votes-quebec'], ['votes-usa.html', 'États-Unis', 'votes-quebec']]],
      ['Europe', [['votes-france.html', 'France', 'votes-quebec'], ['votes-allemagne.html', 'Allemagne', 'votes-quebec'], ['votes-suisse.html', 'Suisse', 'votes-quebec'], ['votes-royaume-uni.html', 'Royaume-Uni', 'votes-quebec']]]]],
    ['information-monde.html', '🗺️', 'Information Monde', 'Globe des pays et leurs drapeaux', 'monde'],
    ['osint.html', '🌐', 'OSINT Map', 'Avions, satellites, séismes en direct', 'osint'],
    ['heure-ete-hiver.html', '🕰️', "Heure d'été ou d'hiver ?", "Le soleil toute l'année selon l'heure gardée", 'heure'],
  ]},
  { nom: 'Loisirs', ic: '🎲', c: '--c-lois', pages: [
    ['jeuxdesociete.html', '🎲', 'Jeux de société', 'Outils et compagnons de jeux', 'jeuxdesociete', [
      ['Jeux', [['7wonders.html', '7 Wonders', '7wonders'], ['ladamepique.html', 'Dame de pique', 'ladamepique'], ['flip7.html', 'Flip 7', 'flip7'], ['qwirkle.html', 'Qwirkle', 'qwirkle'], ['tickettoride.html', 'Ticket to Ride', 'tickettoride']]],
      ['Outils', [['compteurgeneral.html', 'Compteur général', 'compteurgeneral']]]]],
    ['cadeaux.html', '🎁', 'Listes de cadeaux', 'Les idées de cadeaux de chacun', 'cadeaux'],
    ['films.html', '🎬', 'Films et séries', 'Ma liste de visionnement', 'films'],
    ['hockey.html', '🏒', 'Hockey', 'Statistiques LNH', 'hockey'],
    ['bieres.html', '🍺', 'Bières', 'Vive la zythologie', 'bieres'],
    ['scifi.html', '🚀', 'Science-fiction', 'Archives galactiques', 'scifi'],
  ]},
  { nom: 'Travail et outils', ic: '🧰', c: '--c-trav', pages: [
    ['rona.html', '👷', 'RONA S&S', 'Suivi des trousses de premiers soins', 'rona'],
    ['liens.html', '🌍', 'Liens utiles', 'Ressources et favoris', 'liens'],
    ['pageTest.html', '🧪', 'Page de tests', 'Essais HTML et JavaScript', 'pageTest'],
  ]},
];

/* ---------- page d'arrivée d'une section, quand elle n'est pas sa page habituelle (ligne et raccourci) :
   Intentions de vote → la soirée En direct des États-Unis (demande de l'utilisateur, 4 novembre 2026 ; retirer après la soirée) ---------- */
const ARRIVEE = { 'intentions-simulations.html': 'en-direct.html' };
const arrivee = h => ARRIVEE[h] || h;

/* ---------- ce que la personne peut voir : permission de la page (ou d'une de ses sous-pages), hors sections archivées ---------- */
let ARCHIVES = [];
function visibles() {
  const out = [];
  for (const g of GROUPES) {
    const pages = [];
    for (const [h, e, n, d, k, s] of g.pages) {
      if (ARCHIVES.includes(k)) continue;
      // sous-pages : liste simple, ou groupes étiquetés [['Étiquette', [[href, nom, perm], …]], …]
      const grp = (s || []).length && Array.isArray(s[0][1]) ? s : (s || []).length ? [['', s]] : [];
      const sg = grp.map(([t, l]) => [t, l.filter(([, , sk]) => !ARCHIVES.includes(sk) && (a(k) || a(sk)))]).filter(([, l]) => l.length);
      const sous = sg.flatMap(([, l]) => l);
      if (a(k) || sous.length) pages.push({ h, e, n, d, k, sous, sg: sg.length > 1 ? sg : sg.map(([, l]) => ['', l]) });
    }
    if (pages.length) out.push({ ...g, pages });
  }
  return out;
}

/* ---------- tout le site ---------- */
let VUE = [];
function rendreGroupes() {
  $('groupes').innerHTML = VUE.map((g, gi) => `<section class="groupe" style="--c:var(${g.c});--i:${gi + 4}">
  <header><span class="ic">${g.ic}</span><h3>${esc(g.nom)}</h3><span class="nb">${g.pages.length}</span></header>
  ${g.pages.map(p => `<div class="ligne" data-cherche="${esc((p.n + ' ' + p.d + ' ' + p.sous.map(x => x[1]).join(' ')).toLowerCase())}">
    <span class="em">${p.e}</span><span><a class="lien" href="${arrivee(p.h)}"><b>${esc(p.n)}</b></a><small>${esc(p.d)}</small></span><span class="fl">›</span>
    ${p.sous.length ? `<span class="sous${p.sg[0][0] ? ' etiq' : ''}">${p.sg.map(([t, l]) => `<span class="sg">${t ? `<i>${esc(t)}</i>` : ''}<span>${l.map(([sh, sn]) => `<a href="${sh}" data-n="${esc(sn.toLowerCase())}">${esc(sn)}</a>`).join('')}</span></span>`).join('')}</span>` : ''}</div>`).join('')}
</section>`).join('');
  if (!VUE.length) $('groupes').innerHTML = '<p class="vide" style="display:block">Aucune section ne t\'est ouverte pour le moment.</p>';
}

/* ---------- recherche : filtre les lignes et les sous-pages ; Entrée ouvre le premier résultat ; « / » pour y aller ---------- */
const q = $('q');
q.addEventListener('input', () => {
  const t = sansAcc(q.value.trim().toLowerCase()); let n = 0;
  document.querySelectorAll('.groupe').forEach(g => {
    let vis = 0;
    g.querySelectorAll('.ligne').forEach(l => {
      const ok = !t || sansAcc(l.dataset.cherche).includes(t);
      l.classList.toggle('cache', !ok); if (ok) vis++;
      l.querySelectorAll('.sous a').forEach(x => { x.style.outline = t && sansAcc(x.dataset.n).includes(t) ? '2px solid var(--c)' : ''; });
    });
    g.classList.toggle('cache', !vis); n += vis; g.querySelector('header .nb').textContent = vis;
  });
  $('vide').style.display = n ? 'none' : 'block';
  $('sect-raccourcis').classList.toggle('cache', !!t);
});
// recherche derrière la loupe (en haut à droite) : ouverte par la loupe ou « / », fermée par Échap ou la loupe (champ vidé)
const zq = $('zone-q'), bq = $('b-cherche');
function recherche(ouvrir) {
  zq.classList.toggle('ouvert', ouvrir); bq.setAttribute('aria-expanded', ouvrir);
  bq.setAttribute('aria-label', ouvrir ? 'Fermer la recherche' : 'Rechercher une page'); q.tabIndex = ouvrir ? 0 : -1;
  if (ouvrir) q.focus({ preventScroll: true }); else { if (q.value) { q.value = ''; q.dispatchEvent(new Event('input')); } q.blur(); }
}
bq.addEventListener('click', () => recherche(!zq.classList.contains('ouvert')));
zq.addEventListener('click', e => { if (e.target !== bq && !bq.contains(e.target)) recherche(true); });
// clic ailleurs avec un champ vide : la barre se replie
addEventListener('pointerdown', e => { if (zq.classList.contains('ouvert') && !zq.contains(e.target) && !q.value) recherche(false); });
q.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const s = [...document.querySelectorAll('.sous a')].find(x => x.style.outline) || document.querySelector('.ligne:not(.cache) .lien'); if (s) location.href = s.getAttribute('href'); }
  if (e.key === 'Escape') { recherche(false); bq.focus(); }
});
addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); recherche(true); } });

/* ---------- raccourcis de chaque compte (pas pour l'invité), enregistrés sur le serveur (api/prefs.php) ---------- */
const APERCUS = { 'pt6a21.html': 'tableau/pt6.jpg', 'votes-quebec.html': 'tableau/votes.jpg', 'arinc429.html': 'tableau/arinc.jpg', 'helice.html': 'tableau/helice.jpg' };
const DESC = { 'pt6a21.html': 'Simulateur 3D du turbopropulseur : coupe, flux, démarrage et instruments', 'votes-quebec.html': 'Intentions de vote, carte des 127 circonscriptions et simulation Loi 39',
  'arinc429.html': 'Décodeur de mots de 32 bits', 'helice.html': 'Régulateur, drapeau et inversion, en 3D', 'loi39.html': 'Mode mixte compensatoire régional, simulé', 'csdb.html': 'Décodeur CSDB', 'en-direct.html': 'Soirées électorales en direct' };
const EMO = { 'pt6a21.html': '🛩️', 'helice.html': '💨', 'arinc429.html': '🔢', 'csdb.html': '📶', 'loi39.html': '⚖️', 'votes-quebec.html': '🗳️', 'en-direct.html': '🔴' };
const NOMS = { 'votes-quebec.html': 'Votes Québec', 'votes-alberta.html': 'Votes Alberta', 'votes-canada.html': 'Votes Canada', 'votes-usa.html': 'Votes États-Unis', 'votes-france.html': 'Votes France',
  'votes-allemagne.html': 'Votes Allemagne', 'votes-suisse.html': 'Votes Suisse', 'votes-royaume-uni.html': 'Votes Royaume-Uni' };
const INFOS = {};
const DEFAUT = ['pt6a21.html', 'votes-quebec.html', 'arinc429.html', 'helice.html'];
let CATALOGUE = [], liste = [], perso = false;
const page = h => CATALOGUE.find(p => p.h === h);
const zone = $('raccourcis'), bp = $('b-perso');
function catalogue() {
  CATALOGUE = [];
  for (const g of VUE) for (const p of g.pages) {
    CATALOGUE.push({ h: p.h, e: p.e, n: p.n, d: p.d, c: g.c, g: g.nom });
    for (const [sh, sn] of p.sous) CATALOGUE.push({ h: sh, e: EMO[sh] || p.e, n: NOMS[sh] || sn, d: DESC[sh] || `Dans ${p.n}`, c: g.c, g: g.nom });
  }
}
const cleLocale = () => 'raccourcis.' + (sessionStorage.getItem('userId') || '');
async function chargerRaccourcis() {
  let l = null;
  try { const r = await fetch('api/prefs.php', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) l = (await r.json()).raccourcis; } catch (e) { /* hors ligne */ }
  if (!Array.isArray(l)) { try { l = JSON.parse(localStorage.getItem(cleLocale())); } catch (e) {} }
  liste = (Array.isArray(l) ? l : DEFAUT).filter(page).slice(0, 8);
}
let envoi = null;
function enregistrer() {
  try { localStorage.setItem(cleLocale(), JSON.stringify(liste)); } catch (e) {}
  clearTimeout(envoi);
  envoi = setTimeout(() => fetch('api/prefs.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'raccourcis', raccourcis: liste }) }).catch(() => {}), 400);
}
function rendreRacc() {
  zone.classList.toggle('perso', perso);
  zone.innerHTML = liste.map((h, k) => { const p = page(h), img = APERCUS[h];
    return `<a class="tuile" href="${arrivee(h)}" style="--c:var(${p.c});--i:${k + 2}" draggable="${perso}" data-k="${k}">
      <span class="ctl"><button type="button" data-g="${k}" aria-label="Plus tôt">‹</button><button type="button" data-d="${k}" aria-label="Plus tard">›</button><button type="button" class="x" data-x="${k}" aria-label="Retirer ${esc(p.n)}">×</button></span>
      <div class="vue${img ? '' : ' ico'}"${img ? ` style="background-image:url('${img}')"` : ''}>${img ? '' : p.e}</div>
      <div class="corps"><span class="titre">${esc(p.n)}</span><span class="desc">${esc(p.d)}</span>${INFOS[h] ? `<span class="info">${INFOS[h]}</span>` : ''}</div></a>`; }).join('')
    + (liste.length < 8 ? `<button class="ajout" type="button" id="b-ajout"><span>＋</span>Ajouter un raccourci</button>` : '')
    + (!liste.length && !perso ? '<p class="vide-racc">Aucun raccourci. Clique sur « Personnaliser » pour en ajouter.</p>' : '');
}
zone.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (perso && e.target.closest('.tuile') && !b) { e.preventDefault(); return; }   // en personnalisation, une tuile ne s'ouvre pas
  if (!b) return;
  e.preventDefault();
  if (b.id === 'b-ajout') { ouvrirChoix(); return; }
  const k = +(b.dataset.x ?? b.dataset.g ?? b.dataset.d);
  if (b.dataset.x !== undefined) liste.splice(k, 1);
  else { const j = b.dataset.g !== undefined ? k - 1 : k + 1; if (j < 0 || j >= liste.length) return; [liste[k], liste[j]] = [liste[j], liste[k]]; }
  enregistrer(); rendreRacc();
});
let glisse = null;
zone.addEventListener('dragstart', e => { const t = e.target.closest('.tuile'); if (!perso || !t) return; glisse = +t.dataset.k; t.classList.add('glisse'); e.dataTransfer.effectAllowed = 'move'; });
zone.addEventListener('dragover', e => { if (glisse !== null) e.preventDefault(); });
zone.addEventListener('drop', e => { const t = e.target.closest('.tuile'); if (glisse === null || !t) return; e.preventDefault();
  const [x] = liste.splice(glisse, 1); liste.splice(+t.dataset.k, 0, x); glisse = null; enregistrer(); rendreRacc(); });
zone.addEventListener('dragend', () => { glisse = null; rendreRacc(); });
bp.addEventListener('click', () => { perso = !perso; bp.textContent = perso ? '✓ Terminé' : '✎ Personnaliser'; bp.classList.toggle('on', perso); $('aide-perso').hidden = !perso; rendreRacc(); });
// choix d'un raccourci : seulement les pages que la personne peut voir
const dlg = $('choix'), cq = $('choix-q');
function rendreChoix() {
  const t = sansAcc(cq.value.trim().toLowerCase());
  $('choix-liste').innerHTML = CATALOGUE.filter(p => !liste.includes(p.h) && (!t || sansAcc((p.n + ' ' + p.d + ' ' + p.g).toLowerCase()).includes(t)))
    .map(p => `<button class="opt" type="button" data-h="${p.h}"><span class="em">${p.e}</span><span><b>${esc(p.n)}</b><small>${esc(p.d)}</small></span><span class="grp">${esc(p.g)}</span></button>`).join('') || '<p style="color:var(--muted);padding:12px">Rien à ajouter.</p>';
}
function ouvrirChoix() { cq.value = ''; rendreChoix(); dlg.showModal(); cq.focus(); }
cq.addEventListener('input', rendreChoix);
$('choix-liste').addEventListener('click', e => { const o = e.target.closest('[data-h]'); if (!o) return; liste.push(o.dataset.h); enregistrer(); dlg.close(); rendreRacc(); });
$('choix-x').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

/* ---------- notifications ---------- */
// Événements : evenements.json (soirées électorales, résultats officiels), filtrés selon les permissions.
// Vérifications : api/notifs.php, que le serveur ne donne qu'aux administrateurs.
let EVTS = [], VERIFS = [], onglet = 'evt';
const ETATS = { ok: ['#3fae6a', 'OK'], alerte: ['#e3a72f', 'À surveiller'], erreur: ['#e0503f', 'Erreur'] };
const rel = d => { const m = Math.round((d - Date.now()) / 60000), x = Math.abs(m);
  const t = x < 60 ? `${x} min` : x < 1440 ? `${Math.round(x / 60)} h` : `${Math.round(x / 1440)} j`; return m >= 0 ? `dans ${t}` : `il y a ${t}`; };
const etatEvt = e => { const n = Date.now(); return n >= e.debut && n <= e.fin ? 'cours' : n < e.debut ? 'venir' : 'fini'; };
const icsDate = d => d.toISOString().replace(/[-:]|\.\d+/g, '');
const ics = e => 'data:text/calendar;charset=utf-8,' + encodeURIComponent(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//fveilleux//FR', 'BEGIN:VEVENT',
  `UID:${e.id}@fveilleux.com`, `DTSTART:${icsDate(e.debut)}`, `DTEND:${icsDate(e.fin)}`, `SUMMARY:${e.titre}`, `URL:https://fveilleux.com/${e.page}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
const jour = d => d.toLocaleString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).replace(' h 00', ' h');
function itemEvt(e) {
  const st = etatEvt(e), c = st === 'cours' ? '#ef4444' : st === 'venir' ? 'var(--c-pol)' : 'var(--faint)';
  const lib = { cours: 'En cours', venir: 'À venir', fini: 'Terminé' }[st], quand = st === 'cours' ? `fin ${rel(e.fin)}` : rel(st === 'venir' ? e.debut : e.fin);
  return `<details class="n-item" style="--c:${c}"><summary><span class="n-ic${st === 'cours' ? ' vif' : ''}"></span><span class="n-titre">${esc(e.titre)}</span><span class="n-quand">${quand}</span>
    <span class="n-sous"><span class="etat">${lib}</span> ${esc(e.quand || jour(e.debut))}</span></summary>
    <div class="n-det">${e.desc ? `<p>${esc(e.desc)}</p>` : ''}<dl>${(e.infos || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="n-actions"><a href="${esc(e.page)}">Ouvrir la page →</a>${st !== 'fini' ? `<a href="${ics(e)}" download="${esc(e.id)}.ics">📅 Ajouter à mon calendrier</a>` : ''}</div></div></details>`;
}
function itemVerif(v) {
  const [c, lib] = ETATS[v.etat] || ETATS.ok;
  return `<details class="n-item" style="--c:${c}"><summary><span class="n-ic"></span><span class="n-titre">${esc(v.titre)}</span><span class="n-quand">${v.quand ? rel(v.quand) : ''}</span>
    <span class="n-sous"><span class="etat">${lib}</span> ${esc(v.sous)}</span></summary>
    <div class="n-det">${v.desc ? `<p>${esc(v.desc)}</p>` : ''}<dl>${v.quand ? `<dt>Vérifié</dt><dd>${jour(v.quand)}</dd>` : ''}${(v.infos || []).map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join('')}</dl>
    <div class="n-actions">${v.page ? `<a href="${esc(v.page)}">Ouvrir la page →</a>` : ''}<a href="https://github.com/franky96/fveilleux/actions" target="_blank" rel="noopener">Historique des passages ↗</a></div></div></details>`;
}
const panneau = $('notifs');
function rendreNotifs() {
  const ord = { cours: 0, venir: 1, fini: 2 }, evts = EVTS.slice().sort((x, y) => ord[etatEvt(x)] - ord[etatEvt(y)] || x.debut - y.debut);
  const voitVerifs = ADMIN && VERIFS.length > 0;
  if (!voitVerifs && onglet === 'verif') onglet = 'evt';
  $('n-tab-verif').hidden = !voitVerifs;
  document.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', b.dataset.onglet === onglet));
  const actifs = evts.filter(e => etatEvt(e) === 'venir'), alertes = VERIFS.filter(v => v.etat !== 'ok').length;
  $('n-nb-evt').textContent = actifs.length;
  $('n-nb-verif').textContent = alertes ? `${alertes} ⚠` : VERIFS.length;
  if (onglet === 'evt') {
    const titres = { cours: 'En ce moment', venir: 'À venir', fini: 'Récemment terminés' }; let h = '', der = '';
    for (const e of evts) { const st = etatEvt(e); if (st === 'cours') continue;   // en cours : déjà dans la pastille « En direct »
      if (st !== der) { h += `<div class="n-groupe">${titres[st]}</div>`; der = st; } h += itemEvt(e); }
    $('n-liste').innerHTML = h || '<p style="color:var(--muted);padding:12px">Aucun événement à venir.</p>';
    $('n-pied').textContent = 'Heures du Québec. Les événements suivent tes permissions.';
  } else {
    const o = { erreur: 0, alerte: 1, ok: 2 };
    $('n-liste').innerHTML = VERIFS.slice().sort((x, y) => o[x.etat] - o[y.etat] || (y.quand || 0) - (x.quand || 0)).map(itemVerif).join('');
    $('n-pied').textContent = 'Visible par les administrateurs seulement.';
  }
  // pastilles : « En direct » (une par soirée en cours) mène droit à sa page ; « À venir » ouvre le panneau des événements
  // (séparées à la demande de l'utilisateur, 4 novembre 2026)
  const enCours = evts.filter(e => etatEvt(e) === 'cours'), aVenir = evts.filter(e => etatEvt(e) === 'venir');
  let pills = enCours.map(e => `<a class="signal signal-direct" href="${esc(arrivee(e.page))}" style="--c:#ef4444" title="${esc(e.titre)} : ouvrir la page"><span class="pt vif"></span><b>En direct</b> ${esc(e.titre.split(' · ')[0])}</a>`).join('');
  const p = aVenir[0];
  if (p) {
    const auj = p.debut.toDateString() === new Date().toDateString(), proche = p.debut - Date.now() < 12 * 3600e3;
    pills += `<button class="signal" type="button" data-ouvre="evt" style="--c:var(--c-pol)"><span class="pt${proche ? ' vif' : ''}"></span><b>${auj ? "Aujourd'hui" : 'À venir'}</b> ${esc(p.titre.split(' · ')[0])} · ${rel(p.debut)}${aVenir.length > 1 ? ` <span class="nb">+${aVenir.length - 1}</span>` : ''}</button>`;
  } else if (evts.length && !enCours.length) pills += `<button class="signal" type="button" data-ouvre="evt" style="--c:var(--faint)"><span class="pt"></span>Événements</button>`;
  if (voitVerifs) pills += `<button class="signal" type="button" data-ouvre="verif" style="--c:${VERIFS.some(v => v.etat === 'erreur') ? '#e0503f' : alertes ? '#e3a72f' : '#3fae6a'}"><span class="pt"></span>${alertes ? `<b>${alertes} à surveiller</b> · ` : ''}${VERIFS.length - alertes} vérification${VERIFS.length - alertes > 1 ? 's' : ''} OK</button>`;
  $('signaux').innerHTML = pills;
}
$('signaux').addEventListener('click', e => { const b = e.target.closest('[data-ouvre]'); if (!b) return;
  const meme = !panneau.hidden && onglet === b.dataset.ouvre; onglet = b.dataset.ouvre; rendreNotifs(); panneau.hidden = meme; });
document.querySelectorAll('[data-onglet]').forEach(b => b.addEventListener('click', () => { onglet = b.dataset.onglet; rendreNotifs(); }));
$('n-x').addEventListener('click', () => { panneau.hidden = true; });
addEventListener('click', e => { if (document.contains(e.target) && !e.target.closest('.signaux-zone')) panneau.hidden = true; });   // (un bouton redessiné pendant le clic n'est plus dans la page)
addEventListener('keydown', e => { if (e.key === 'Escape') panneau.hidden = true; });

async function chargerNotifs() {
  try {
    const r = await fetch('evenements.json', { cache: 'no-cache' });
    const d = r.ok ? await r.json() : { evenements: [] }, limite = Date.now() - 7 * 864e5;   // terminés depuis plus de 7 jours : retirés
    EVTS = (d.evenements || []).filter(e => !e.perm || a(e.perm)).map(e => ({ ...e, debut: new Date(e.debut), fin: new Date(e.fin || e.debut) })).filter(e => e.fin >= limite);
  } catch (e) { EVTS = []; }
  if (ADMIN) {
    try { const r = await fetch('api/notifs.php', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) VERIFS = ((await r.json()).verifs || []).map(v => ({ ...v, quand: v.quand ? new Date(v.quand) : null })); }
    catch (e) { VERIFS = []; }
  }
  rendreNotifs();
}

/* ---------- compte, thème, date ---------- */
const nom = sessionStorage.getItem('userName') || '';
const h = new Date().getHours();
$('salut').textContent = (h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir') + (INVITE ? '' : nom ? ', ' + nom : '');
$('date').textContent = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
const bm = $('b-moi'), menu = $('menu');
bm.textContent = INVITE ? '👤' : (nom.trim()[0] || '•').toUpperCase();
bm.title = INVITE ? 'Invité' : `${nom}${ADMIN ? ' · administrateur' : ''}`;
$('m-admin').hidden = !ADMIN;
$('m-archives').hidden = $('m-concept').hidden = INVITE;
$('m-webmail').hidden = !(ADMIN || PERMS.includes('webmail'));
bm.addEventListener('click', () => { menu.hidden = !menu.hidden; bm.setAttribute('aria-expanded', !menu.hidden); });
addEventListener('click', e => { if (!e.target.closest('.moi-zone')) { menu.hidden = true; bm.setAttribute('aria-expanded', 'false'); } });
$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/login.php', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => {});
  sessionStorage.clear();
  window.location.href = 'index.html';
});
const bt = $('b-theme');
const majT = () => { bt.textContent = document.documentElement.classList.contains('light') ? '☾' : '☀︎'; };
bt.addEventListener('click', () => {
  const appliquer = () => { const c = document.documentElement.classList.toggle('light'); try { localStorage.setItem('theme', c ? 'light' : 'dark'); } catch (e) {} majT(); };
  if (window.basculerThemeAnime) window.basculerThemeAnime(bt, appliquer); else appliquer();   // en cercle depuis le bouton (version.js)
});
majT();
$('pied-liens').innerHTML = INVITE ? '' : '<a href="archive.html">Archives</a>';

/* ---------- démarrage ---------- */
(async () => {
  try { const s = await getDoc(doc(db, 'systeme', 'config')); if (s.exists()) ARCHIVES = (s.data().archivedSections || []).map(k => ANC[k] || k); } catch (e) { /* hors ligne : rien d'archivé */ }
  VUE = visibles(); rendreGroupes(); catalogue();
  if (!INVITE) {
    await chargerRaccourcis();
    // pourcentages du dernier résultat sur la tuile Votes Québec
    if (a('votes-quebec')) try {
      const r = await (await fetch('votes-quebec/loi39-resume.json', { cache: 'no-cache' })).json();
      INFOS['votes-quebec.html'] = Object.entries(r.vote || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([p, v]) => `<span class="puce">${esc(p)} <b>${v.toLocaleString('fr-CA', { minimumFractionDigits: 1 })} %</b></span>`).join('');
    } catch (e) {}
    INFOS['pt6a21.html'] = '<span class="puce">550 <b>shp</b></span><span class="puce">AMM 72</span>';
    $('sect-raccourcis').hidden = false; rendreRacc();
  }
  chargerNotifs();
  setInterval(rendreNotifs, 60000);
})();

/* ---------- barre du haut : voile flou seulement quand la page défile ---------- */
{ const h = document.querySelector('.haut'); const f = () => h.classList.toggle('colle', scrollY > 4); addEventListener('scroll', f, { passive: true }); f(); }

/* fin de l'arrivée en cascade : les rendus suivants (personnalisation, recherche) ne rejouent pas l'animation */
setTimeout(() => document.body.classList.remove('arrivee'), 2600);
