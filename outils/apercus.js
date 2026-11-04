#!/usr/bin/env node
/* Aperçus des raccourcis du tableau de bord (animation 5, 4 novembre 2026, demande de l'utilisateur).
   Filme chaque page 5 s (Playwright, thème sombre, compte admin simulé), sans la barre du haut, et écrit :
     tableau/<page>.jpg   image fixe de la tuile (première image de la vidéo)
     tableau/<page>.webm  vidéo jouée au survol (640×360, VP9, sans son)
     tableau/apercus.json la liste lue par dashboard.js ({ "page.html": { "img": …, "video": [ … ] } })
   Usage (depuis la racine du dépôt) :
     node outils/apercus.js page.html [autre.html …]   une ou plusieurs pages
     node outils/apercus.js --manquantes               toutes les pages du tableau de bord qui n'en ont pas encore
   RÈGLE : toute nouvelle page ajoutée à GROUPES (dashboard.js) reçoit son aperçu avec ce script, dans le même commit. */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER = path.join(RACINE, 'tableau');
const LISTE = path.join(DOSSIER, 'apercus.json');
const DUREE = 5;   // secondes de vidéo

// réglages par page : attente avant de filmer (ms), défilement pendant la vidéo (px), clics à faire avant
const REGLAGES = {
  'information-monde.html': { attente: 4000, defile: 0 },
  'o320.html': { attente: 3000, defile: 0 }, 'turboreacteur.html': { attente: 3000, defile: 0 }, 'pw1500g.html': { attente: 3000, defile: 0 },
  'planetaire.html': { attente: 1500, defile: 0 }, 'pompe-engrenages.html': { attente: 1500, defile: 0 }, 'circuit.html': { attente: 1500, defile: 0 },
  'heure-ete-hiver.html': { attente: 1500, defile: 0 },
};
// pages archivées : pas d'aperçu (elles ne sont plus sur le tableau de bord)
const ARCHIVEES = new Set(['aviation.html', 'aeronefs.html', 'ena.html', 'distant.html', 'osint.html', 'films.html', 'hockey.html', 'bieres.html', 'scifi.html', 'pageTest.html']);

function pagesDuTableau() {
  const s = fs.readFileSync(path.join(RACINE, 'dashboard.js'), 'utf8');
  const i = s.indexOf('const GROUPES'), j = s.indexOf('\n];', i);
  const pages = new Set(s.slice(i, j).match(/[\w-]+\.html/g));
  return [...pages].filter(p => !ARCHIVEES.has(p));
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

(async () => {
  const args = process.argv.slice(2);
  let liste = {}; try { liste = JSON.parse(fs.readFileSync(LISTE, 'utf8')); } catch (e) {}
  const pages = args.includes('--manquantes') ? pagesDuTableau().filter(p => !liste[p]) : args.filter(a => a.endsWith('.html'));
  if (!pages.length) { console.log('Rien à faire. Usage : node outils/apercus.js page.html … | --manquantes'); return; }
  const srv = await serveur(), port = srv.address().port;
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'apercus-'));
  for (const p of pages) {
    const r = { attente: 1800, defile: 360, ...(REGLAGES[p] || {}) };
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: tmp, size: { width: 1280, height: 800 } } });
    await ctx.addInitScript(() => {
      sessionStorage.setItem('loggedIn', '1'); sessionStorage.setItem('userRole', 'admin'); sessionStorage.setItem('userName', 'Frank');
      try { localStorage.setItem('theme', 'dark'); } catch (e) {}
    });
    const page = await ctx.newPage(); const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'load' }).catch(e => console.log(p, 'chargement :', e.message));
    await page.waitForTimeout(r.attente);
    // sans la barre du haut : on coupe sous elle
    const barre = await page.evaluate(() => { const b = document.querySelector('.tb2, .haut'); return b ? Math.ceil(b.getBoundingClientRect().bottom) : 0; });
    const debut = (Date.now() - t0) / 1000;
    if (r.defile) page.evaluate(d => new Promise(fin => { const t = performance.now(), y0 = scrollY;
      const pas = () => { const k = Math.min(1, (performance.now() - t) / (5000 - 400)); scrollTo(0, y0 + d * (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)); k < 1 ? requestAnimationFrame(pas) : fin(); };
      setTimeout(() => requestAnimationFrame(pas), 400); }), r.defile).catch(() => {});
    await page.waitForTimeout(DUREE * 1000 + 300);
    const video = page.video(); await ctx.close(); const brut = await video.path();
    const base = p.replace(/\.html$/, ''), h = Math.min(720, 800 - barre);
    const filtre = `crop=1280:${h}:0:${barre},scale=640:360:force_original_aspect_ratio=increase,crop=640:360`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(debut), '-t', String(DUREE), '-i', brut, '-vf', filtre,
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-an', path.join(DOSSIER, base + '.webm')]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(debut), '-i', brut, '-vf', filtre, '-frames:v', '1', '-q:v', '4', path.join(DOSSIER, base + '.jpg')]);
    liste[p] = { img: `tableau/${base}.jpg`, video: [`tableau/${base}.webm`] };
    const ko = n => (fs.statSync(path.join(DOSSIER, base + n)).size / 1024).toFixed(0) + ' ko';
    console.log(`${p} : image ${ko('.jpg')}, vidéo ${ko('.webm')}`);
  }
  await nav.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  const trie = Object.fromEntries(Object.keys(liste).sort().map(k => [k, liste[k]]));
  fs.writeFileSync(LISTE, JSON.stringify(trie, null, 1) + '\n');
})();
