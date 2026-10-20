/* Information Monde : test de cohérence du rendu du globe (le dessin correspond-il à la carte ?).
   Dessine le globe sous plusieurs angles et zooms, en mouvement et à l'arrêt (information-monde.html?essai, window.__globe),
   et compare la nature de pixels loin des côtes (terre ou eau) avec les données (pays, lacs).
   Quelques différences restent normales : traits de frontière, halo des noms de villes.
   Usage (serveur local sur le port 8799, à la racine du dépôt) : node monde/outils/essai_globe.mjs
   (Playwright et Chromium de l'environnement : chemins ci-dessous, à adapter au besoin) */
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.addInitScript(() => { sessionStorage.setItem('loggedIn','1'); sessionStorage.setItem('userRole','admin'); localStorage.setItem('mondeRub', '{"drapeaux":false}'); });   // géométrie seule (sans drapeaux)
await p.goto('http://localhost:8799/information-monde.html?essai#ZZ'); await p.waitForTimeout(3000);
const res = await p.evaluate(async () => {
  const G = window.__globe, cv = document.getElementById('globe'), ctx = cv.getContext('2d');
  const hex = h => { const m = h.match(/\w\w/g).map(x => parseInt(x, 16)); return m; };
  const ocean = hex(G.C.ocean);
  const estEau = ([r, g, b]) => Math.abs(r - ocean[0]) + Math.abs(g - ocean[1]) + Math.abs(b - ocean[2]) < 45;   // quadrillage léger toléré
  const attendu = ll => { if (!ll) return null; if (G.dansLac(ll)) return 'eau'; const [x, y] = ll; return G.PAYS.some(f => { const [[x0, y0], [x1, y1]] = f._b; return y >= y0 && y <= y1 && (x0 <= x1 ? x >= x0 && x <= x1 : x >= x0 || x <= x1) && d3.geoContains(f, ll); }) ? 'terre' : 'eau'; };
  const out = []; let tot = 0, faux = 0;
  for (const kk of [1, 3, 8]) for (const enMvt of [false, true]) for (let lam = -180; lam < 180; lam += 60) for (const phi of [-50, 0, 50]) {
    G.dessinerA([lam, phi, 0], kk, enMvt);
    const W = G.W(), H = G.H(), dpr = cv.width / W, img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const proj = G.proj; let n = 0, f = 0;
    for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
      const x = (i + 0.5) * W / 14, y = (j + 0.5) * H / 14;
      if (Math.hypot(x - W / 2, y - H / 2) > G.R() * kk - 4) continue;
      const lab = attendu(proj.invert([x, y]));
      // loin d'une côte : les 4 voisins à 3 px ont la même nature
      if ([[3,0],[-3,0],[0,3],[0,-3]].some(([dx, dy]) => attendu(proj.invert([x + dx, y + dy])) !== lab)) continue;
      const o = (Math.round(y * dpr) * cv.width + Math.round(x * dpr)) * 4, pix = [img[o], img[o + 1], img[o + 2]];
      n++; if ((estEau(pix) ? 'eau' : 'terre') !== lab) f++;
    }
    tot += n; faux += f;
    if (f > 0) out.push({ k: kk, mvt: enMvt, rot: [lam, phi], points: n, faux: f });
  }
  return { tot, faux, cas: out.slice(0, 12) };
});
console.log(JSON.stringify(res));
await b.close();
