/* Essai de la place d'un drapeau sur le globe d'Information Monde : pour chaque territoire, le globe cadré dessus (rubrique
   Drapeaux) et, à droite, le drapeau tel qu'il est (panneau), dans une seule image.
   Serveur local requis : python3 -m http.server 8799 (à la racine du dépôt).

   node monde/outils/essai_drapeau.mjs --sortie DOSSIER [--reglages FICHIER.json] [--suffixe -b] [--zoom 2] CODE…
     CODE : code ISO du pays (CL, NO…) ou de la subdivision (CA-QC) ; --reglages : réglages à essayer, même forme que
     monde/drapeaux-reglages.json ({"CL": {"mode": "rogner", "k": 0.2, "ax": 0, "ay": 0.5, "echelle": 1}}) ; sans
     réglage pour un code, celui de monde/drapeaux-reglages.json (ou le placement par défaut) ; {"CL": null} = défaut.
   --zoom : multiplie le zoom du cadrage (territoire étroit comme le Chili). Écrit DOSSIER/CODE<suffixe>.png. */
import fs from 'fs';
import path from 'path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const sortie = opt('--sortie') || '.', fichier = opt('--reglages'), suffixe = opt('--suffixe') || '', zoom = Number(opt('--zoom') || 1);
const essais = fichier ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : {};
fs.mkdirSync(sortie, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const etat of [false, true]) {
  const codes = args.filter(c => c.includes('-') === etat); if (!codes.length) continue;
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  p.on('pageerror', e => console.log('ERREUR', e.message));
  await p.addInitScript(e => { sessionStorage.setItem('loggedIn', '1'); sessionStorage.setItem('userRole', 'admin');
    localStorage.setItem('mondeRub', JSON.stringify({ drapeaux: true, aff: e ? 'etat' : 'pays' })); }, etat);
  await p.goto('http://localhost:8799/information-monde.html?essai#' + codes[0]);
  await p.waitForFunction(() => window.__globe && document.getElementById('charge').hidden, null, { timeout: 120000 });
  for (const code of codes) {
    if (!await p.evaluate(c => !!window.__globe.territoire(c), code)) { console.log(code, ': territoire inconnu'); continue; }
    await p.evaluate(c => { location.hash = '#' + c; }, code); await p.waitForTimeout(500);
    if (code in essais) await p.evaluate(([c, o]) => window.__globe.regler(c, o), [code, essais[code]]);
    await p.evaluate(([c, z]) => { const g = window.__globe, v = g.cadrer(c); g.dessinerA(v.rot, Math.min(300, v.k * z), false); }, [code, zoom]);
    await p.waitForTimeout(400);
    await p.evaluate(([c, z]) => { const g = window.__globe, v = g.cadrer(c); g.dessinerA(v.rot, Math.min(300, v.k * z), false); }, [code, zoom]);
    const clip = await p.$eval('.grille', e => { const r = e.getBoundingClientRect(), g = document.getElementById('globe').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: g.height }; });
    const f = path.join(sortie, code + suffixe + '.png');
    await p.screenshot({ path: f, clip }); console.log(f);
  }
  await p.close();
}
await b.close();
