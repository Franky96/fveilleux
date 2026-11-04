#!/usr/bin/env node
/* Aperçus des raccourcis du tableau de bord (animation 5, 4 novembre 2026, demande de l'utilisateur).
   Filme chaque page 5 s (Playwright, thème sombre, compte admin), cadrée sur sa partie la plus visuelle, et écrit :
     tableau/<page>.jpg   image fixe de la tuile (dernière image de la vidéo)
     tableau/<page>.webm  vidéo jouée au survol (640×360, VP9, sans son)
     tableau/apercus.json la liste lue par dashboard.js ({ "page.html": { "img": …, "video": [ … ] } })
   Usage (depuis la racine du dépôt) :
     node outils/apercus.js page.html [autre.html …]   une ou plusieurs pages
     node outils/apercus.js --manquantes               toutes les pages du tableau de bord qui n'en ont pas encore
     --url http://127.0.0.1:8794                       filmer une copie de test avec PHP (pages qui lisent des données :
                                                       ouvre d'abord api/test-login.php?r=admin) ; sans --url : serveur statique intégré
   RÈGLE : toute nouvelle page ajoutée à GROUPES (dashboard.js) reçoit son aperçu avec ce script, dans le même commit,
   avec un réglage dans REGLAGES si elle a une partie visuelle à cadrer ou quelque chose à faire bouger. */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER = path.join(RACINE, 'tableau');
const LISTE = path.join(DOSSIER, 'apercus.json');
const DUREE = 5;   // secondes de vidéo
const L = 1280, H = 800;   // fenêtre filmée

/* ---------- réglages par page ----------
   cadre   sélecteurs (le plus grand élément visible de chacun, réunis) ou fonction (exécutée dans la page) qui rend { x, y, w, h } ;
           le cadre est élargi au format 16:9 ; sans cadre : le haut de la page, sous la barre
   avant   actions avant de filmer (fermer un menu, démarrer un moteur…) ; pendant : actions pendant les 5 s
   attente pause avant de filmer (ms) ; defile : défilement pendant la vidéo (px) */
const clic = (pg, sel) => pg.click(sel, { timeout: 3000 }).catch(() => {});
const tape = (pg, sel, texte, delai = 220) => pg.type(sel, texte, { delay: delai }).catch(() => {});
const orbite = async pg => {   // fait tourner la caméra d'une scène 3D en glissant la souris
  const x = 520, y = 460; await pg.mouse.move(x, y); await pg.mouse.down();
  for (let k = 1; k <= 60; k++) { await pg.mouse.move(x - k * 4, y + Math.sin(k / 12) * 18); await pg.waitForTimeout(70); }
  await pg.mouse.up();
};
const categorie = { cadre: ['.tete', '.cartes-zone'], attente: 300, defile: 0,
  pendant: async pg => {   // survol des cartes l'une après l'autre : leur icône réagit
    const c = pg.locator('.carte:not([hidden])'), n = Math.min(await c.count(), 6);
    for (let k = 0; k < n; k++) { await c.nth(k).hover().catch(() => {}); await pg.waitForTimeout(4600 / n); }
  } };
const votes = {
  avant: async pg => {
    await pg.waitForSelector('svg.vi-plan', { timeout: 15000 }).catch(() => {});
    await pg.evaluate(() => { const e = document.querySelector('svg.vi-plan'); if (e) scrollTo(0, scrollY + e.getBoundingClientRect().top - 150); });
  },
  cadre: ['svg.vi-plan', '#viEvol'], attente: 150, defile: 0,
};
const jeu = noms => ({
  attente: 600, defile: 0, cadre: () => ({ x: 240, y: 0, w: 800, h: 450 }),
  pendant: async pg => {
    const champs = await pg.$$('#noms input, .player-name-input');
    for (let k = 0; k < Math.min(champs.length, noms.length); k++) { await champs[k].fill(''); await champs[k].type(noms[k], { delay: 150 }); await pg.waitForTimeout(250); }
  },
});
const REGLAGES = {
  'moteurs.html': categorie, 'informatique.html': categorie, 'jeuxdesociete.html': categorie, 'chips.html': categorie,
  'o320.html': { avant: async pg => { await clic(pg, '#menu-toggle'); await clic(pg, 'button:has-text("Démarrage auto")'); }, attente: 3500, cadre: ['canvas'], defile: 0, pendant: orbite },
  'turboreacteur.html': { avant: async pg => { await pg.check('#toggle-autorotate').catch(() => {}); await clic(pg, 'button:has-text("Décollage")'); }, attente: 2000, cadre: ['#engine-canvas'], defile: 0 },
  'pw1500g.html': { avant: async pg => { await clic(pg, '#menu-toggle'); await clic(pg, 'button:has-text("Décollage")'); }, attente: 2500, cadre: ['#engine-canvas'], defile: 0, pendant: orbite },
  'planetaire.html': { avant: async pg => { if ((await pg.textContent('#pp').catch(() => '')).includes('▶')) await clic(pg, '#pp'); }, attente: 800, cadre: ['svg'], defile: 0 },
  'pompe-engrenages.html': { attente: 1500, cadre: ['#svg'], defile: 0 },
  'heure-ete-hiver.html': {
    avant: async pg => pg.evaluate(() => document.getElementById('annee').scrollIntoView({ block: 'center' })), attente: 800, cadre: ['#annee'], defile: 0,
    pendant: async pg => { for (const t of ['Heure normale toute', 'Heure avancée toute', "On change l'heure"]) { await pg.waitForTimeout(1100); await clic(pg, `button:has-text("${t}")`); } },
  },
  'information-monde.html': { attente: 5000, cadre: ['#globe'], defile: 0 },
  'circuit.html': {
    attente: 600, defile: 0, cadre: () => ({ x: 0, y: 90, w: 1000, h: 562 }),
    pendant: async pg => {
      for (const [t, x, y] of [['CLK', 220, 330], ['SW', 220, 480], ['AND', 450, 400], ['NOT', 650, 400], ['LED', 850, 400]]) {
        await clic(pg, `button[data-type="${t}"]`); await pg.mouse.click(x, y); await pg.waitForTimeout(650);
      }
      await clic(pg, '#btn-play');
    },
  },
  'crypteur.html': {
    attente: 600, defile: 0,
    avant: async pg => pg.evaluate(() => document.querySelector('.enc-bit')?.scrollIntoView({ block: 'center' })),
    cadre: () => { const r = [...document.querySelectorAll('.enc-bit, .res-value')].map(e => e.getBoundingClientRect());
      const x = Math.min(...r.map(a => a.left)), y = Math.min(...r.map(a => a.top));
      return { x, y: y - 20, w: Math.max(...r.map(a => a.right)) - x, h: Math.max(...r.map(a => a.bottom)) - y + 20 }; },
    pendant: async pg => { for (const k of [1, 3, 4, 6, 9, 10, 2, 7]) { await pg.locator('.enc-bit').nth(k).click({ timeout: 1000 }).catch(() => {}); await pg.waitForTimeout(480); } },
  },
  'converter.html': {
    attente: 500, defile: 0,
    cadre: () => { const r = [...document.querySelectorAll('.conv-input')].map(e => e.parentElement.getBoundingClientRect());
      const x = Math.min(...r.map(a => a.left)), y = Math.min(...r.map(a => a.top));
      return { x, y, w: Math.max(...r.map(a => a.right)) - x, h: Math.max(...r.map(a => a.bottom)) - y }; },
    pendant: async pg => tape(pg, '#input-dec', '3735928559', 380),
  },
  'tcpip.html': { attente: 500, defile: 0, cadre: ['.tcp-container'], pendant: async pg => { await tape(pg, '#ip-input', '192.168.1.42', 200); await clic(pg, 'button:has-text("Calculer")'); } },
  'csdb.html': { attente: 500, defile: 0, cadre: ['.tb2-rangee', '.csdb-container'], pendant: async pg => { await tape(pg, '#hex-input', '10 80 08 41 00 00', 140); await clic(pg, '#decode-btn'); } },
  'qr-transfer.html': { attente: 800, defile: 0, cadre: ['.hero', '.mode-btn'] },
  'shape-transfer.html': { attente: 800, defile: 0, cadre: ['.hero', '.mode-btn'] },
  'intentions-simulations.html': { attente: 0, defile: 0 }, 'loi39.html': { attente: 200, defile: 0 }, 'en-direct.html': { attente: 800, defile: 0 },
  'votes-alberta.html': votes, 'votes-canada.html': votes, 'votes-usa.html': votes, 'votes-france.html': votes,
  'votes-allemagne.html': votes, 'votes-suisse.html': votes, 'votes-royaume-uni.html': votes,
  '7wonders.html': jeu(['Frank', 'Julie', 'Alex']), 'flip7.html': jeu(['Frank', 'Julie']), 'qwirkle.html': jeu(['Frank', 'Julie']),
  'ladamepique.html': jeu(['Frank', 'Julie', 'Alex', 'Sam']), 'tickettoride.html': jeu(['Frank', 'Julie']),
  'tickettoride-rs.html': jeu(['Frank', 'Julie']), 'compteurgeneral.html': jeu(['Frank', 'Julie']),
};
// pages archivées : pas d'aperçu (elles ne sont plus sur le tableau de bord)
const ARCHIVEES = new Set(['aviation.html', 'aeronefs.html', 'ena.html', 'distant.html', 'osint.html', 'films.html', 'hockey.html', 'bieres.html', 'scifi.html', 'pageTest.html']);

function pagesDuTableau() {
  const s = fs.readFileSync(path.join(RACINE, 'dashboard.js'), 'utf8');
  const i = s.indexOf('const GROUPES'), j = s.indexOf('\n];', i);
  return [...new Set(s.slice(i, j).match(/[\w-]+\.html/g))].filter(p => !ARCHIVEES.has(p));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
function serveur() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const f = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(srv));
  });
}

// cadre en 16:9 dans la fenêtre, sous la barre du haut
function cadre16x9(r, haut) {
  const dispo = H - haut;
  let w = Math.min(L, Math.max(r.w, r.h * 16 / 9, 640)), h = w * 9 / 16;
  if (h > dispo) { h = dispo; w = h * 16 / 9; }
  const x = Math.max(0, Math.min(L - w, r.x + r.w / 2 - w / 2));
  const y = Math.max(haut, Math.min(H - h, r.y - 8));
  const pair = n => Math.round(n / 2) * 2;
  return { x: pair(x), y: pair(y), w: pair(w), h: pair(h) };
}

(async () => {
  const args = process.argv.slice(2);
  const iu = args.indexOf('--url'), urlTest = iu >= 0 ? args[iu + 1].replace(/\/$/, '') : '';
  let liste = {}; try { liste = JSON.parse(fs.readFileSync(LISTE, 'utf8')); } catch (e) {}
  const pages = args.includes('--manquantes') ? pagesDuTableau().filter(p => !liste[p]) : args.filter(a => a.endsWith('.html'));
  if (!pages.length) { console.log('Rien à faire. Usage : node outils/apercus.js page.html … | --manquantes [--url …]'); return; }
  const srv = urlTest ? null : await serveur(), base = urlTest || `http://127.0.0.1:${srv.address().port}`;
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apercus-'));
  for (const p of pages) {
    const r = { attente: 1800, defile: 0, ...(REGLAGES[p] || {}) };
    const ctx = await nav.newContext({ viewport: { width: L, height: H }, recordVideo: { dir: tmp, size: { width: L, height: H } } });
    await ctx.addInitScript(() => {
      sessionStorage.setItem('loggedIn', '1'); sessionStorage.setItem('userRole', 'admin'); sessionStorage.setItem('userName', 'Frank');
      try { localStorage.setItem('theme', 'dark'); } catch (e) {}
    });
    if (urlTest) await ctx.request.get(`${base}/api/test-login.php?r=admin`).catch(() => {});
    const page = await ctx.newPage(); const t0 = Date.now();
    await page.goto(`${base}/${p}`, { waitUntil: 'load', timeout: 60000 }).catch(e => console.log(p, 'chargement :', e.message));
    if (r.avant) await r.avant(page).catch(e => console.log(p, 'avant :', e.message));
    await page.waitForTimeout(r.attente);
    const haut = await page.evaluate(() => { const b = document.querySelector('.tb2, .haut'); return b ? Math.ceil(b.getBoundingClientRect().bottom) : 0; });
    let zone = null;
    if (typeof r.cadre === 'function') zone = await page.evaluate(r.cadre).catch(() => null);
    else if (r.cadre) zone = await page.evaluate(sels => {
      const rs = sels.map(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length)
        .map(e => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]).filter(Boolean);
      if (!rs.length) return null;
      const x = Math.min(...rs.map(a => a.left)), y = Math.min(...rs.map(a => a.top));
      return { x, y, w: Math.max(...rs.map(a => a.right)) - x, h: Math.max(...rs.map(a => a.bottom)) - y };
    }, r.cadre);
    const c = cadre16x9(zone || { x: 0, y: haut, w: L, h: H - haut }, haut);
    const debut = (Date.now() - t0) / 1000 + 0.35;   // la vidéo de Playwright a un léger retard
    if (r.defile) page.evaluate(d => new Promise(fin => { const t = performance.now(), y0 = scrollY;
      const pas = () => { const k = Math.min(1, (performance.now() - t) / 4600); scrollTo(0, y0 + d * (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)); k < 1 ? requestAnimationFrame(pas) : fin(); };
      setTimeout(() => requestAnimationFrame(pas), 400); }), r.defile).catch(() => {});
    const fin = page.waitForTimeout(DUREE * 1000 + 300);
    if (r.pendant) await r.pendant(page).catch(e => console.log(p, 'pendant :', e.message));
    await fin;
    const video = page.video(); await ctx.close(); const brut = await video.path();
    const nom = p.replace(/\.html$/, '');
    const filtre = `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=640:360`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(debut), '-t', String(DUREE), '-i', brut, '-vf', filtre,
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-an', path.join(DOSSIER, nom + '.webm')]);
    // image de la tuile : la fin de la vidéo (page remplie, animations terminées)
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-sseof', '-0.3', '-i', path.join(DOSSIER, nom + '.webm'), '-frames:v', '1', '-q:v', '4', path.join(DOSSIER, nom + '.jpg')]);
    liste[p] = { img: `tableau/${nom}.jpg`, video: [`tableau/${nom}.webm`] };
    const ko = n => (fs.statSync(path.join(DOSSIER, nom + n)).size / 1024).toFixed(0) + ' ko';
    console.log(`${p} : image ${ko('.jpg')}, vidéo ${ko('.webm')}`);
    fs.rmSync(brut, { force: true });
  }
  await nav.close(); if (srv) srv.close();
  const trie = Object.fromEntries(Object.keys(liste).sort().map(k => [k, liste[k]]));
  fs.writeFileSync(LISTE, JSON.stringify(trie, null, 1) + '\n');
})();
