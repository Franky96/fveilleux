// Présidentielle en Bulgarie (page « En direct ») : lecture des pages de la CIK par un navigateur sans tête.
// results.cik.bg est derrière Cloudflare : une requête sans navigateur (urllib, curl) reçoit un défi (403, « cf-mitigated: challenge »),
// et un même navigateur est de nouveau mis au défi après trois ou quatre pages. Un contexte neuf par page passe (vérifié le 26 octobre 2026 :
// 33 pages en 40 s). Appelé par bg.py quand la lecture directe est refusée.
// Usage : node navigateur.mjs DOSSIER URL…   → DOSSIER/<n>.html (n = rang de l'adresse) et DOSSIER/etat.json { url: statut }
// Il faut le module playwright (npm i playwright ; npx playwright install chromium). Seuls les hôtes de la CIK sont lus.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = await import("playwright"); }
const { chromium } = pw;

const [dossier, ...urls] = process.argv.slice(2);
if (!dossier || !urls.length) { console.error("Usage : node navigateur.mjs DOSSIER URL…"); process.exit(2); }
mkdirSync(dossier, { recursive: true });
const PERMIS = /^https:\/\/(results|map)\.cik\.bg\//;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const nav = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
const etat = {};
for (const [i, u] of urls.entries()) {
  if (!PERMIS.test(u)) { etat[u] = "refusé"; continue; }
  let fait = false;
  for (let essai = 0; essai < 3 && !fait; essai++) {
    const ctx = await nav.newContext({ userAgent: UA, proxy, ignoreHTTPSErrors: !!proxy, locale: "bg-BG" });
    const page = await ctx.newPage();
    try {
      const r = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      const st = r ? r.status() : 0;
      if (st === 200) { writeFileSync(join(dossier, `${i}.html`), await r.body()); etat[u] = 200; fait = true; }
      else if (st === 404) { etat[u] = 404; fait = true; }
      else {
        // défi : il se résout parfois seul (le titre change), sinon nouvel essai dans un contexte neuf
        for (let k = 0; k < 12 && /moment|момент/i.test(await page.title().catch(() => "moment")); k++) await page.waitForTimeout(1000);
        if (!/moment|момент/i.test(await page.title().catch(() => "moment"))) {
          const html = await page.content();
          if (/class="(main-title|election-type)/.test(html)) { writeFileSync(join(dossier, `${i}.html`), html); etat[u] = 200; fait = true; }
        }
        if (!fait) etat[u] = st;
      }
    } catch (e) { etat[u] = "erreur : " + e.message.split("\n")[0]; }
    await ctx.close();
    if (!fait) await new Promise(res => setTimeout(res, 1500 * (essai + 1)));
  }
}
await nav.close();
writeFileSync(join(dossier, "etat.json"), JSON.stringify(etat, null, 1));
console.log(Object.values(etat).filter(s => s === 200).length + " / " + urls.length + " pages lues");
