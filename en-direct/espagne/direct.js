/* En direct : élections générales en Espagne du dimanche 29 novembre 2026 (élections anticipées : dissolution des Cortes le 6 octobre
   par le décret royal 806/2026, après le rejet de deux décrets sur le logement par le PP, Vox et Junts). Vue principale : le Congrès
   des députés (350 sièges, 52 circonscriptions : 50 provinces, Ceuta et Melilla ; listes fermées, d'Hondt, seuil de 3 % des voix
   valides, blancs compris, dans chaque circonscription ; majorité absolue 176). Le Sénat (listes ouvertes, vote par candidat, îles
   comme circonscriptions) n'est pas affiché. Reprend le cadre de la soirée de la Colombie-Britannique (en-direct/cb-2026/direct.js) :
   lecture chaque minute avec décompte, sièges et voix par parti, blocs, carte des provinces avec zooms et plein écran, fiche,
   circonscriptions suivies avec alertes, classement.

   Données : api/direct-es.php (relais du site de résultats du ministère de l'Intérieur, cache 45 s) ; à défaut,
   en-direct/espagne/resultats.json (copie du pipeline GitHub, en-direct/espagne/outils/es.py). Les deux rendent les fichiers bruts.
   Le format de 2026 n'est pas connu d'avance (site de 2023 fermé) : lireJson() parcourt n'importe quel JSON et y reconnaît les
   provinces (noms officiels ou code INE), les candidatures (sigles des partis) et leurs voix ; lireHtml() fait de même avec des tableaux.
   Les sièges sont toujours recalculés ici (d'Hondt, seuil de 3 %) et comparés à ceux publiés, s'il y en a.
   Démo (admin) : ?demo=2023 lit en-direct/espagne/demo-2023.json (voix définitives de 2023 dans une forme JSON plausible, pas une copie
   du format officiel) ; &avance=40 simule un dépouillement partiel.
   Carte : en-direct/espagne/circonscriptions.json (IGN/CNIG, CC BY 4.0, via es-atlas ; Canaries en encart, outils/carte.py).
   2023 : en-direct/espagne/resultats-2023.json (Intérieur, outils/resultados2023.py). Sondages : en-direct/espagne/sondages.json
   (Wikipédia, CC BY-SA, outils/sondages.py). */

const RAFRAICHIR = 60;                                         // secondes entre deux lectures
const NB = 350, MAJ = 176, NC = 52, SEUIL = 0.03;
const OUVERTURE = new Date("2026-11-29T09:00:00+01:00"), FERMETURE = new Date("2026-11-29T20:00:00+01:00");   // heure de la péninsule (CET)
const FERME_CANARIES = new Date("2026-11-29T21:00:00+01:00");  // 20 h aux Canaries (UTC+0) : premiers chiffres officiels après
const SITE_INFO = "https://29neleccionesgenerales.es/";
const SERRE = 1;                                               // dernier siège serré : moins de 1 % des voix valides
const P_URL = new URLSearchParams(location.search);
const ADMIN = (() => { try { return sessionStorage.getItem("userRole") === "admin"; } catch { return false; } })();
const DEMO = ADMIN && /^20\d\d$/.test(P_URL.get("demo") || "") ? +P_URL.get("demo") : null;
const AVANCE = DEMO && P_URL.has("avance") ? Math.max(0, Math.min(100, +P_URL.get("avance") || 0)) : null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const secQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" });
const deux = n => String(n).padStart(2, "0");
const ilYa = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${deux(Math.floor(s / 60) % 60)}`; };
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };
const pl = (n, mot) => `${nf(n)} ${mot}${n > 1 ? "s" : ""}`;

/* ---------- partis (candidatures de 2026 : listes publiées au BOE le 28 octobre ; chefs de file d'après la presse) ----------
   bloc : g = gauche et partenaires de l'investiture de 2023, p = pivots (Junts a rompu avec le PSOE en octobre 2025 ; CC), d = PP + Vox et alliés.
   rang : ordre sur la barre des sièges (gauche à gauche, droite à droite). Résultats de 2023 : resultats-2023.json. */
const PARTIS = {
  podemos: { court: "Podemos", nom: "Podemos", chef: "Irene Montero", c: "#6E2B83", bloc: "g", rang: 1, avant: "Dans Sumar en 2023 (5 sièges)" },
  adelante: { court: "Adelante", nom: "Adelante Andalucía", chef: "têtes de liste provinciales", c: "#1C9C5B", bloc: "g", rang: 2 },
  bng: { court: "BNG", nom: "Bloc nationaliste galicien", chef: "Néstor Rego", c: "#78BDE6", bloc: "g", rang: 3 },
  bildu: { court: "EH Bildu", nom: "Euskal Herria Bildu (gauche indépendantiste basque)", chef: "Oskar Matute", c: "#A5C21C", bloc: "g", rang: 4 },
  erc: { court: "ERC", nom: "Gauche républicaine de Catalogne", chef: "Gabriel Rufián", c: "#F5A623", bloc: "g", rang: 5 },
  fa: { court: "FA", nom: "Frente Amplio (IU, Mouvement Sumar, Comuns, Más Madrid…)", chef: "Ada Colau", c: "#D9306B", bloc: "g", rang: 6, avant: "Successeur de Sumar (31 sièges, 12,3 % en 2023)" },
  sumar: { court: "Sumar", nom: "Sumar (coalition de 2023)", chef: "Yolanda Díaz (2023)", c: "#E51C55", bloc: "g", rang: 6 },
  fv: { court: "Compromís", nom: "Front valencià (Compromís, EUPV, Podem)", c: "#EE7F1A", bloc: "g", rang: 7, avant: "Dans Sumar en 2023" },
  psoe: { court: "PSOE", nom: "Parti socialiste ouvrier espagnol (PSC en Catalogne)", chef: "Pedro Sánchez (président du gouvernement sortant)", c: "#E3171E", bloc: "g", rang: 8 },
  pnv: { court: "PNV", nom: "Parti nationaliste basque (EAJ-PNV)", chef: "Maribel Vaquero", c: "#1E6B3A", bloc: "g", rang: 9 },
  junts: { court: "Junts", nom: "Ensemble pour la Catalogne (indépendantiste)", chef: "Míriam Nogueras", c: "#1BB5A6", bloc: "p", rang: 10 },
  cc: { court: "CC", nom: "Coalition canarienne", chef: "Cristina Valido", c: "#F2CF00", bloc: "p", rang: 11 },
  aut: { court: "Autres", nom: "Autres candidatures", c: "#A3A8B1", bloc: "p", rang: 12 },
  salf: { court: "SALF", nom: "Se Acabó La Fiesta (droite populiste)", chef: "Alvise Pérez", c: "#7A4E2D", bloc: "d", rang: 13 },
  upn: { court: "UPN", nom: "Union du peuple navarrais", chef: "dans la liste du PP en 2026", c: "#25408F", bloc: "d", rang: 14 },
  vox: { court: "Vox", nom: "Vox (droite radicale)", chef: "Santiago Abascal", c: "#5BB227", bloc: "d", rang: 15 },
  pp: { court: "PP", nom: "Parti populaire (avec UPN en Navarre)", chef: "Alberto Núñez Feijóo", c: "#1D84CE", bloc: "d", rang: 16 },
};
const ORDRE_P = Object.keys(PARTIS).sort((a, b) => PARTIS[a].rang - PARTIS[b].rang);
const coulP = p => PARTIS[p]?.c || PARTIS.aut.c;
const courtP = p => PARTIS[p]?.court || p;
const libP = (p, sig) => p === "aut" ? String(sig).slice(0, 18) : courtP(p);     // candidature hors liste : son sigle
const BLOCS = { g: "Gauche et partenaires", p: "Junts, CC et autres", d: "PP + Vox et alliés" };
// sigles (normalisés) → parti : l'ordre compte (ERC avant Podem, Sumar avant Compromís : « SUMAR - COMPROMÍS » en 2023)
const REGLES = [["erc", /^erc|esquerrarepublicana/], ["junts", /junts|jxcat/], ["bildu", /bildu/], ["pnv", /pnv|^eaj/], ["bng", /^bng|bloquenacionalista/],
  ["upn", /^upn$|uniondelpueblonavarro/], ["pp", /^pp|partidopopular|upnpp/], ["psoe", /psoe|^psc|^pse|socialista/], ["vox", /^vox/],
  ["sumar", /sumar/], ["fv", /compromis|frontvalencia|^fv$/], ["fa", /frenteamplio|^fa$|^fa[a-z]/], ["podemos", /podemos|^podem/],
  ["cc", /^cca|^cc$|^cc[a-z0-9]|coalicioncanaria/], ["salf", /salf|seacabolafiesta/], ["adelante", /adelante/]];
function partiDe(sig) {
  const n = norm(sig);
  for (const [p, rx] of REGLES) if (rx.test(n)) return p === "sumar" && DEMO !== 2023 ? "fa" : p;   // en 2026, le mouvement Sumar est dans le FA
  return "aut";
}
const NON_CAND = /^(blancos?|votosenblanco|nulos?|votosnulos|abstencion|abstenciones|participacion|censo|votantes|total|totales|validos|votosvalidos|candidaturas)$/;
const AUTRES_SIG = /^(otros|otras|restodecandidaturas|resto)$/;

/* ---------- état ---------- */
let GEO = null, PROV = {}, R23 = { prov: {}, nat: null }, SOND = null, RES = null, brut = null, lu = null;
let sel = null, carteMarge = false, carteGains = false, prochaine = 0;
let ALIAS = new Map();                                         // nom normalisé → code de province

/* ---------- d'Hondt (seuil de 3 % des voix valides, blancs compris) ---------- */
function dhondt(partis, sieges, valides) {
  const ok = partis.filter(k => k.p !== "aut-groupe" && k.v > 0 && k.v >= SEUIL * valides);
  const n = new Map(ok.map(k => [k, 0])), attribues = [];
  for (let i = 0; i < sieges; i++) {
    let best = null, bq = -1;
    for (const k of ok) { const q = k.v / (n.get(k) + 1); if (q > bq || (q === bq && best && k.v > best.v)) { bq = q; best = k; } }
    if (!best) break;
    n.set(best, n.get(best) + 1); attribues.push([best, bq]);
  }
  // dernier siège : qui l'a, qui le suit, et combien de voix il manque au suivant pour le prendre
  let dernier = null;
  if (attribues.length) {
    const [a, qa] = attribues[attribues.length - 1];
    let b = null, qb = -1;
    for (const k of ok) { const q = k.v / (n.get(k) + 1); if (k !== a && q > qb) { qb = q; b = k; } }
    if (b) dernier = { a: a.p, b: b.p, la: libP(a.p, a.sig), lb: libP(b.p, b.sig), manque: Math.max(1, Math.ceil(qa * (n.get(b) + 1) - b.v)) };
  }
  return { sieges: new Map([...n].map(([k, s]) => [k.sig, s])), dernier };
}

/* ---------- lecture générique des fichiers du ministère ---------- */
function provDe(texte) { const k = norm(texte); return k ? ALIAS.get(k) || null : null; }
const estNat = t => /^(totalespana|espana|totalnacional|nacional|total)$/.test(norm(t));
const nombre = v => typeof v === "number" ? v : typeof v === "string" && /^\s*-?[\d.,\s ]+\s*$/.test(v) ? parseNum(v) : null;
function parseNum(s) {
  let t = String(s).trim().replace(/[\s ]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");          // 1.234.567,8 (Espagne)
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");                          // 1,234,567.8
  else t = t.replace(",", ".");
  const v = +t; return isFinite(v) ? v : null;
}
const feuille = o => o && typeof o === "object" && !Array.isArray(o) && Object.values(o).every(v => v === null || typeof v !== "object");
const CLE_VOIX = k => /vot/i.test(k) && !/porc|pct|%|dif|anterior|prev|2023|blanc|nul|valid|votante|cand.*tot/i.test(k);
const CLE_SIEGES = k => /electo|elegid|escan|esca[ñn]|carg|seat|diput/i.test(k) && !/porc|pct|anterior|prev|dif|2023|juego|total|tot$/i.test(k);
const CLE_NOM = k => /sig|abrev|acron|nombre|denom|name|partido|cand|formac|label|texto/i.test(k);
function candidat(o) {
  if (!feuille(o)) return null;
  const e = Object.entries(o);
  // nom de la candidature : sigle d'abord, puis dénomination ; jamais un nom de province (lignes plates « province, sigle, voix »)
  const txt = e.filter(([k, v]) => typeof v === "string" && /[a-z]/i.test(v) && !provDe(v) && !/prov|circ|ambito|comunidad/i.test(k));
  const nom = [/sig|abrev|acron/i, /denom|partido|cand|formac/i, /nombre|name|label|texto/i].reduce((r, rx) => r || txt.find(([k]) => rx.test(k))?.[1], null) || txt.find(([, v]) => /[a-z]{2}/i.test(v))?.[1];
  if (!nom) return null;
  let voix = e.find(([k, v]) => CLE_VOIX(k) && nombre(v) != null);
  if (!voix) { const ent = e.filter(([k, v]) => !CLE_SIEGES(k) && !/porc|pct|%|cod|id$|orden/i.test(k) && Number.isInteger(nombre(v))).sort((a, b) => nombre(b[1]) - nombre(a[1])); voix = ent[0]; }
  if (!voix) return null;
  const s = e.find(([k, v]) => CLE_SIEGES(k) && Number.isInteger(nombre(v)));
  return { sig: String(nom).trim(), v: nombre(voix[1]), e: s ? nombre(s[1]) : null };
}
function cible(out, ctx) { return ctx.prov ? (out.prov[ctx.prov] ||= { partis: {}, tot: {} }) : ctx.nat ? (out.nat ||= { partis: {}, tot: {} }) : null; }
function ajouterCand(t, c) {
  const nc = norm(c.sig);
  if (NON_CAND.test(nc)) { if (/blanc/.test(nc)) t.tot.blancs = Math.max(t.tot.blancs || 0, c.v); else if (/nul/.test(nc)) t.tot.nuls = Math.max(t.tot.nuls || 0, c.v); return; }
  const p = AUTRES_SIG.test(nc) ? "aut-groupe" : partiDe(c.sig);
  const prev = t.partis[c.sig];
  if (!prev || c.v > prev.v) t.partis[c.sig] = { sig: c.sig, p, v: c.v, e: c.e ?? prev?.e ?? null };
}
// totaux d'une circonscription : clés usuelles (censo, votantes, nulos, blancos, escrutinio…)
function totaux(o, t) {
  for (const [k, v0] of Object.entries(o)) {
    if (v0 && typeof v0 === "object" && !Array.isArray(v0) && /escrut|mesa|avance|progres/i.test(k)) { totaux(v0, t); continue; }
    const v = nombre(v0); if (v == null) continue;
    const kk = norm(k);
    if (/censo|electores|inscrit/.test(kk) && !/cera|ext|porc|pct/.test(kk)) t.censo = v;
    else if (/^(votantes|votos?totales|totalvotantes)/.test(kk) && !/porc|pct|anterior|prev/.test(kk)) t.votants = v;
    else if (/nulo/.test(kk) && !/porc|pct|anterior|prev/.test(kk)) t.nuls = v;
    else if (/blanco/.test(kk) && !/porc|pct|anterior|prev/.test(kk)) t.blancs = v;
    else if (/validos/.test(kk) && !/porc|pct|anterior|prev/.test(kk)) t.valides = v;
    else if (/(escrut|mesas?).*(porc|pct)|(porc|pct).*(escrut|mesas?)|^porcentaje$|^pct$/.test(kk) && v >= 0 && v <= 100) t.pct ??= v;
    else if (/mesas?(escrut|contab|computad|informad)|escrutadas?$/.test(kk)) t.mesasF = v;
    else if (/mesas?(tot|previst)|totalmesas|^mesas$/.test(kk)) t.mesasT = v;
    else if (/escanos?(en)?(juego|total|aelegir)|^sieges$|^diputados$/.test(kk)) t.sieges = v;
  }
}
// la province (ou l'ensemble de l'Espagne) que décrit un objet : nom officiel, ou code INE sous une clé « provincia », « circunscripcion »…
function provObjet(o) {
  let p = null, nat = false;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") { if (!p && /nom|name|desc|ambito|prov|circ|denom|titulo|label/i.test(k)) p = provDe(v); if (/nom|name|ambito|desc/i.test(k) && estNat(v)) nat = true; }
    if (!p && /prov|circ|^cp$|codprov/i.test(k) && !/com|ca$|auton/i.test(k)) { const n = nombre(v); if (Number.isInteger(n) && n >= 1 && n <= 52) p = deux(n); else if (n === 99) nat = true; }
  }
  return { p, nat: nat && !p };
}
function lireJson(o, out, ctx = {}) {
  if (Array.isArray(o)) {
    const cands = o.map(x => { const c = candidat(x); return c && { ...c, ou: provObjet(x) }; }).filter(Boolean);
    // liste de candidatures (pas une liste de provinces décrites par des objets plats)
    if (cands.length >= 2 && cands.length >= o.length / 2 && cands.filter(c => provDe(c.sig) || estNat(c.sig)).length < cands.length / 2) {
      // lignes plates « province, sigle, voix » : chacune dans sa province ; sinon toutes dans la circonscription en cours
      for (const c of cands) { const t = cible(out, c.ou.p ? { prov: c.ou.p } : c.ou.nat ? { nat: true } : ctx); if (t) ajouterCand(t, c); }
      return;
    }
    for (const x of o) lireJson(x, out, ctx);
    return;
  }
  if (!o || typeof o !== "object") return;
  const { p, nat } = provObjet(o);
  const c2 = p ? { prov: p } : nat ? { nat: true } : ctx;
  if (p || nat) totaux(o, cible(out, c2).tot);
  for (const v of Object.values(o)) if (v && typeof v === "object") lireJson(v, out, c2);
}
function lireHtml(corps, out) {
  const doc = new DOMParser().parseFromString(corps, "text/html");
  let courant = null;
  for (const el of doc.querySelectorAll("h1,h2,h3,h4,h5,caption,tr,option[selected]")) {
    const tx = el.textContent.replace(/\s+/g, " ").trim();
    if (el.tagName !== "TR") { const c = provDe(tx) || provDe(tx.split(/[-–:(|]/)[0]); if (c) courant = c; continue; }
    if (!courant) continue;
    const cells = [...el.children].map(td => td.textContent.replace(/\s+/g, " ").trim());
    const nom = cells.find(t => /[a-z]/i.test(t) && partiDe(t) !== "aut") || cells.find(t => AUTRES_SIG.test(norm(t)) || NON_CAND.test(norm(t)));
    if (!nom) continue;
    const nombres = cells.filter(t => !/%/.test(t)).map(t => nombre(t)).filter(v => Number.isInteger(v));
    if (nombres.length) ajouterCand(out.prov[courant] ||= { partis: {}, tot: {} }, { sig: nom, v: Math.max(...nombres), e: null });
  }
}
function normaliser(d) {
  const out = { maj: d.maj ? new Date(d.maj) : null, prov: {}, nat: null, pages: 0 };
  for (const pg of d.pages || []) {
    out.pages++;
    try { if (pg.type === "json" || /^\s*[[{]/.test(pg.corps)) lireJson(JSON.parse(pg.corps), out); else if (pg.type !== "js") lireHtml(pg.corps, out); } catch { /* fichier illisible */ }
  }
  if (AVANCE != null) simulerAvance(out);
  for (const [code, c] of Object.entries(out.prov)) finir(code, c);
  out.lus = Object.values(out.prov).filter(c => c.total > 0).length;
  return out;
}
// une circonscription : voix valides, avancement, sièges (recalculés ; ceux publiés gardés pour comparer)
function finir(code, c) {
  const L = Object.values(c.partis).sort((a, b) => b.v - a.v), t = c.tot;
  c.cands = L.filter(k => k.p !== "aut-groupe");
  c.autres = L.filter(k => k.p === "aut-groupe").reduce((s, k) => s + k.v, 0);
  c.total = L.reduce((s, k) => s + k.v, 0);
  c.valides = t.valides && t.valides >= c.total ? t.valides : c.total + (t.blancs || 0);
  c.frac = t.pct != null ? Math.min(1, t.pct / 100) : t.mesasT ? Math.min(1, (t.mesasF || 0) / t.mesasT) : null;
  c.final = c.frac === 1;
  c.s = Number.isInteger(t.sieges) && t.sieges >= 1 && t.sieges <= 40 ? t.sieges : PROV[code]?.s || 0;   // ceux de la source (démo 2023 : Madrid 37), sinon le décret de 2026
  const r = dhondt(c.cands, c.s, c.valides);
  for (const k of c.cands) k.calc = r.sieges.get(k.sig) || 0;
  c.dernier = r.dernier;
  const pub = c.cands.reduce((s, k) => s + (k.e || 0), 0);
  c.publies = c.cands.some(k => k.e != null) && pub > 0;
  c.ecartSieges = c.publies && c.cands.some(k => (k.e || 0) !== k.calc);
  for (const k of c.cands) k.sieges = c.publies ? (k.e || 0) : k.calc;
}
// démo : dépouillement partiel simulé (avancement différent par province, voix réduites d'autant, léger bruit par parti)
function simulerAvance(out) {
  if (out.nat) out.nat.tot = {};                               // totaux nationaux recalculés à partir des provinces
  const h = s => { let x = 2166136261; for (const ch of String(s)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return ((x >>> 0) % 1000) / 1000; };
  for (const [code, c] of Object.entries(out.prov)) {
    const f = Math.max(0, Math.min(1, (AVANCE / 100) * (0.45 + 1.1 * h(code)) - 0.05 * h(code + "x")));
    if (f <= 0) { delete out.prov[code]; continue; }
    for (const k of Object.values(c.partis)) { k.v = Math.round(k.v * f * (0.93 + 0.14 * h(code + k.sig))); k.e = null; }
    for (const x of ["blancs", "nuls", "votants", "valides"]) if (c.tot[x]) c.tot[x] = Math.round(c.tot[x] * f);
    c.tot.pct = f >= 1 ? 100 : Math.round(f * 1000) / 10;
  }
}

/* ---------- lecture : démo, relais du site, sinon copie du pipeline ---------- */
async function lireRelais() {
  const r = await fetch("api/direct-es.php?type=resultats", { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { const d = await r.json(); return d && d.pages ? d : null; } catch { return null; }   // pas de PHP (serveur local) : copie du pipeline
}
async function lireCopie() {
  const r = await fetch("en-direct/espagne/resultats.json", { cache: "no-cache" });
  return r.ok ? { ...(await r.json()), publie: r.headers.get("last-modified") } : null;
}
async function lire() {
  if (DEMO) { const r = await fetch(`en-direct/espagne/demo-${DEMO}.json`, { cache: "no-cache" }); return r.ok ? { ...(await r.json()), via: "demo" } : null; }
  let relais = null, copie = null;
  try { relais = await lireRelais(); } catch (e) { if (/Session/.test(e.message)) throw e; }
  if (!relais?.disponible) copie = await lireCopie().catch(() => null);
  if (relais?.disponible) return { ...relais, via: "relais" };
  if (copie?.disponible) return { ...copie, via: "copie" };
  return relais ? { ...relais, via: "relais" } : copie ? { ...copie, via: "copie" } : null;
}
async function actualiser() {
  prochaine = Date.now() + RAFRAICHIR * 1000;
  $("lvEtat").textContent = "Mise à jour…";
  try {
    brut = await lire(); lu = new Date();
    RES = brut ? normaliser(brut) : null;
    surveiller(); dessiner();
  } catch (e) { $("lvEtat").textContent = e.message; }
}
function afficherDecompte() {
  const reste = Math.max(0, Math.ceil((prochaine - Date.now()) / 1000));
  $("lvDecompte").textContent = document.hidden ? "en pause" : reste + " s";
  $("lvMaj").style.setProperty("--fait", (1 - reste / RAFRAICHIR).toFixed(3));
  $("lvMaj").title = `Lecture automatique toutes les ${RAFRAICHIR} s · prochaine dans ${reste} s`;
  if (lu) dessinerVerifs();
  dessinerCompte();
}

/* ---------- accès aux résultats ---------- */
const enProv = code => { const c = RES?.prov?.[code]; return c && c.total > 0 ? c : null; };
const pctC = (c, k) => c.valides ? 100 * k.v / c.valides : 0;
const tete = c => c?.cands?.[0] || null;
const ecartPts = c => c.cands.length > 1 ? pctC(c, c.cands[0]) - pctC(c, c.cands[1]) : 100;
const auMoinsUn = () => !!RES?.lus;
const ferme = () => DEMO != null || new Date() >= FERMETURE;
function sieges() {
  const s = Object.fromEntries(ORDRE_P.map(p => [p, { s: 0, fin: 0, voix: 0 }]));
  for (const c of Object.values(RES?.prov || {})) {
    if (!(c.total > 0)) continue;
    for (const k of c.cands) { const x = s[k.p] || s.aut; x.s += k.sieges; if (c.final) x.fin += k.sieges; x.voix += k.v; }
    s.aut.voix += c.autres;
  }
  return s;
}
function natTotaux() {
  let valides = 0, votants = 0, censo = 0, blancs = 0, nuls = 0, fait = 0, connu = false;
  for (const [code, c] of Object.entries(RES?.prov || {})) {
    if (!(c.total > 0)) continue;
    valides += c.valides; votants += c.tot.votants || 0; censo += c.tot.censo || 0; blancs += c.tot.blancs || 0; nuls += c.tot.nuls || 0;
    if (c.frac != null) { fait += (PROV[code]?.s || 0) * c.frac; connu = true; }
  }
  const n = RES?.nat?.tot || {};
  // avancement : celui de l'ensemble de l'Espagne s'il est publié, sinon moyenne des circonscriptions pondérée par les sièges
  const pct = n.pct != null ? n.pct : n.mesasT ? 100 * (n.mesasF || 0) / n.mesasT : connu ? 100 * fait / NB : null;
  const vt = n.votants || votants, ce = n.censo || censo;
  return { valides, votants: vt, censo: ce, blancs: n.blancs || blancs, nuls: n.nuls || nuls, pct, part: vt && ce ? 100 * vt / ce : null };
}

/* ---------- état, heures ---------- */
function lienRes() {
  const u = brut?.pages?.find(p => p.url && /^https:/.test(p.url))?.url;
  const site = u ? new URL(u).origin + "/" : SITE_INFO;
  return `<a href="${esc(site)}" target="_blank" rel="noopener">site du ministère de l'Intérieur</a>`;
}
function dessinerEtat() {
  const b = $("lvBanniere"), f = ferme();
  $("edAvant").hidden = f;
  b.hidden = false;
  if (DEMO) b.innerHTML = `<b>DÉMO · résultats de ${DEMO}</b> : voix définitives de l'élection du 23 juillet 2023 (ministère de l'Intérieur), lues par le même code que le soir du vote${AVANCE != null ? `, avec un dépouillement partiel simulé (${AVANCE} %)` : ""}. Ce ne sont pas des résultats de 2026.`;
  else if (RES?.pages && !auMoinsUn() && f && brut?.disponible) b.innerHTML = `Le ministère publie des résultats, mais leur présentation n'a pas pu être lue ici. En attendant une correction, voir le ${lienRes()}.`;
  else if (!auMoinsUn()) b.innerHTML = f
    ? `<b>Bureaux fermés dans la péninsule</b> : sondages de sortie des urnes à 20 h ; les premiers chiffres officiels du ministère arrivent après la fermeture aux Canaries (21 h dans la péninsule, 15 h au Québec). Vérification chaque minute.`
    : `Les résultats provisoires s'afficheront ici après la fermeture des bureaux, ce <b>dimanche 29 novembre à 20 h, heure de la péninsule (14 h, heure du Québec)</b> ; premiers chiffres officiels vers 21 h (15 h au Québec), après la fermeture aux Canaries.`;
  else b.innerHTML = `<b>Résultats provisoires et non officiels</b> du ministère de l'Intérieur (dépouillement du soir, sans le vote des Espagnols de l'étranger, ajouté au recensement général du 4 au 7 décembre). Sièges recalculés par ce site (d'Hondt, seuil de 3 %).`;
  if (!RES) { $("lvEtat").textContent = "Résultats indisponibles pour le moment · nouvel essai chaque minute"; dessinerVerifs(); return; }
  if (!auMoinsUn()) { $("lvEtat").textContent = "En attente des premiers résultats · vérification chaque minute"; dessinerVerifs(); return; }
  const fin = Object.values(RES.prov).filter(c => c.final).length, n = natTotaux();
  $("lvEtat").innerHTML = [DEMO ? `<b>DÉMO · ${DEMO}</b>` : "<b>Résultats provisoires</b>", `${RES.lus} circonscription${RES.lus > 1 ? "s" : ""} sur ${NC} avec des résultats`,
    fin ? `${fin} entièrement dépouillée${fin > 1 ? "s" : ""}` : "", n.pct != null ? `${nf(n.pct, n.pct < 1 ? 2 : 1)} % dépouillé` : ""].filter(Boolean).join(" · ");
  dessinerVerifs();
}
function dessinerVerifs() {
  const el = $("lvHeures"); el.hidden = !brut; if (el.hidden) return;
  if (brut.via === "demo") { el.innerHTML = `<span>Fichier de démonstration · relu par cette page à ${secQc(lu)} · heures du Québec</span>`; return; }
  const m = Date.now(), verif = brut.via === "relais" && brut.ageCache != null ? new Date(lu - brut.ageCache * 1000) : null;
  const publie = brut.via === "copie" && brut.publie ? new Date(brut.publie) : null;
  el.innerHTML = `<span><b>Vérifiées</b> sur le ${lienRes()} ${verif ? `par le site à ${secQc(verif)} (il y a ${ilYa(m - verif)})`
    : `par la copie de secours du pipeline${publie && !isNaN(publie) ? `, mise en ligne à ${heureQc(publie)} (il y a ${ilYa(m - publie)})` : ""}`}`
    + (lu ? ` · relues par cette page à ${secQc(lu)}` : "") + ` · heures du Québec</span>`;
}
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date(), avant = m < OUVERTURE, cible = avant ? OUVERTURE : FERMETURE, ms = Math.max(0, cible - m);
  const j = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  $("edCompte").innerHTML = `<span class="lv-eyebrow">${avant ? "Ouverture des bureaux" : "Fermeture des bureaux"}</span>
    <h3>${avant ? "Les bureaux ouvrent dans" : "Les bureaux ferment dans"}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${[[j, "jour" + (j > 1 ? "s" : "")], [deux(h), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>Dimanche 29 novembre à <b>${avant ? "9 h" : "20 h"}, heure de la péninsule</b> (${avant ? "3 h" : "14 h"}, heure du Québec). L'Espagne péninsulaire a six heures de plus que le Québec ; les Canaries, cinq (bureaux ouverts de 9 h à 20 h, heure locale).</p>`;
}
function dessinerHeures() {
  const m = new Date();
  const L = [
    ["Campagne électorale", "Du vendredi 13 au vendredi 27 novembre", "Samedi 28 : journée de réflexion. Sondages interdits de publication en Espagne à partir du 24 novembre.", new Date("2026-11-28T00:00:00+01:00")],
    ["Vote par correspondance", "Demandes jusqu'au 19 novembre, envoi jusqu'au 25", "Espagnols de l'étranger (CERA) : jusqu'au 26 novembre ; leurs votes sont comptés le 4 décembre", new Date("2026-11-26T23:59:00+01:00")],
    ["Jour du vote", "Dimanche 29 novembre, de 9 h à 20 h (heure de la péninsule)", "De 3 h à 14 h, heure du Québec · Canaries : 9 h à 20 h, heure locale (4 h à 15 h au Québec)", FERMETURE],
    ["Participation", "Avances du ministère à 14 h et à 18 h", "8 h et midi, heure du Québec", new Date("2026-11-29T18:00:00+01:00")],
    ["Sondages de sortie des urnes", "Dès 20 h (14 h au Québec)", "Diffusés par les télévisions à la fermeture dans la péninsule", FERMETURE],
    ["Premiers chiffres officiels", "Vers 21 h (15 h au Québec)", "Après la fermeture aux Canaries ; dépouillement provisoire du ministère de l'Intérieur jusque tard dans la soirée", FERME_CANARIES],
    ["Recensement général", "Du 4 au 7 décembre", "Décompte officiel par les commissions électorales provinciales, avec les votes de l'étranger (un siège peut encore changer)", new Date("2026-12-07T20:00:00+01:00")],
    ["Nouvelles Cortes", "Mercredi 23 décembre", "Session constitutive ; puis vote d'investiture du président du gouvernement (176 voix au premier tour, majorité simple au second)", new Date("2026-12-23T12:00:00+01:00")],
  ];
  $("edHeures").innerHTML = L.map(([t, a, b, fin]) => `<li class="${m > fin ? "ed-passe" : ""}"><b>${t}</b><span>${a}<small>${b}</small></span></li>`).join("");
}

/* ---------- sièges, voix et blocs ---------- */
function dessinerSieges() {
  const s = sieges(), voixT = ORDRE_P.reduce((x, p) => x + s[p].voix, 0), n = natTotaux(), ok = auMoinsUn();
  const ordre = ORDRE_P.filter(p => s[p].s > 0);
  const pct = x => (100 * x / NB) + "%";
  $("lvBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${pct(s[p].s)};--c:${coulP(p)}" title="${esc(PARTIS[p].nom)} : ${pl(s[p].s, "siège")} (${s[p].fin} dans des circonscriptions entièrement dépouillées)">`
    + `<i class="lv-elus" style="width:${100 * s[p].fin / s[p].s}%"></i><b>${esc(courtP(p))} ${s[p].s}</b></span>`).join("");
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const mq = $("edMajMarque"); mq.style.left = (100 * MAJ / NB) + "%"; mq.querySelector("span").textContent = `${MAJ} : majorité`; mq.hidden = false;
  const tot = { g: 0, p: 0, d: 0 }; for (const p of ORDRE_P) tot[PARTIS[p].bloc] += s[p].s;
  const lead = ORDRE_P.filter(p => s[p].s > 0).sort((a, b) => s[b].s - s[a].s || s[b].voix - s[a].voix)[0];
  $("lvSiegesTitre").textContent = !ok ? (ferme() ? "Aucune circonscription dépouillée pour l'instant" : "Sièges : les résultats commencent à la fermeture des bureaux")
    : s[lead].s >= MAJ ? `${PARTIS[lead].nom} : ${s[lead].s} sièges, majorité absolue` : `${courtP(lead)} en tête avec ${pl(s[lead].s, "siège")} (majorité : ${MAJ})`
      + (tot.d >= MAJ ? ` · PP + Vox et alliés : ${tot.d}, au-delà de la majorité` : tot.g >= MAJ ? ` · gauche et partenaires : ${tot.g}, au-delà de la majorité` : "");
  // blocs : résultat en cours, sinon 2023 et la moyenne des sondages
  const b23 = { g: 0, p: 0, d: 0 }; for (const k of R23.nat?.partis || []) b23[PARTIS[k.p]?.bloc || "p"] += k.e;
  const q = $("edQTexte"); q.hidden = false;
  const bl = x => ok ? x : null;
  q.innerHTML = `<b>Blocs</b> · ${["g", "p", "d"].map(k => `<span style="color:var(--ink);white-space:nowrap"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;background:${k === "g" ? coulP("psoe") : k === "d" ? coulP("pp") : coulP("aut")}"></i>${BLOCS[k]} <b>${bl(tot[k]) ?? "—"}</b></span>`).join(" · ")}`
    + `<small>Gauche et partenaires : PSOE, FA, Compromís, Podemos, ERC, EH Bildu, PNV, BNG, Adelante (ceux qui ont investi Pedro Sánchez en 2023, sauf Junts). PP + Vox et alliés : avec UPN et SALF. Majorité absolue : ${MAJ} sur ${NB}. En 2023 : ${b23.g} · ${b23.p} · ${b23.d}.</small>`;
  // cartes des partis
  const moyS = moyenneSondages();
  const montres = ORDRE_P.filter(p => p !== "aut" && (s[p].s > 0 || s[p].voix > 0 || (!ok && PARTIS[p].chef && !(DEMO !== 2023 && ["sumar", "upn"].includes(p)) && !(DEMO === 2023 && ["fa", "fv", "podemos", "salf"].includes(p)))));
  if (ok && s.aut.voix) montres.push("aut");
  $("lvPartis").innerHTML = montres.sort((a, b) => s[b].s - s[a].s || s[b].voix - s[a].voix || (moyS[b] || 0) - (moyS[a] || 0) || (R23v(b) - R23v(a))).map(p => {
    const v = voixT && n.valides ? 100 * s[p].voix / n.valides : null, P = PARTIS[p], a23 = R23p(p);
    return `<div class="lv-parti" style="--c:${P.c}" title="${esc(P.nom)}${P.chef ? " · " + esc(P.chef) : ""}"><i></i><span class="lv-pnom">${esc(P.court)}</span>`
      + `<b>${ok ? s[p].s : "—"}</b><small>${ok ? `${nf(s[p].voix)} voix · ` : moyS[p] != null ? `sondages : ${nf(moyS[p], 1)} % · ` : ""}2023 : ${a23 ? `${pl(a23.e, "siège")}, ${nf(a23.pct, 1)} %` : P.avant ? esc(P.avant) : "absent"}</small>`
      + `<span class="lv-pvote">${v != null ? nf(v, 1) + " %" : ""}</span></div>`;
  }).join("");
  const fin = Object.values(RES?.prov || {}).filter(c => c.final).length;
  const ecarts = Object.values(RES?.prov || {}).filter(c => c.ecartSieges).length, publies = Object.values(RES?.prov || {}).filter(c => c.publies).length;
  $("edKv").innerHTML = [[`${RES?.lus || 0} / ${NC}`, "circonscriptions avec des résultats"], [nf(fin), "entièrement dépouillées"],
    [n.pct != null ? nf(n.pct, n.pct < 1 ? 2 : 1) + " %" : "—", "des bureaux dépouillés"], [n.part != null ? nf(n.part, 1) + " %" : "—", DEMO ? "participation (étranger compris)" : "participation (sans l'étranger)"],
    [n.valides ? nf(n.valides) : "—", `voix valides${n.blancs ? ` · ${nf(n.blancs)} blancs` : ""}${n.nuls ? ` · ${nf(n.nuls)} nuls` : ""}`],
    [publies ? (ecarts ? `${ecarts} écart${ecarts > 1 ? "s" : ""}` : "identiques") : ok ? "calculés" : "—", publies ? `sièges recalculés ici et sièges publiés (${publies} circ.)` : "sièges : d'Hondt, seuil de 3 %, par ce site"]]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>${lead ? (s[lead].s >= MAJ ? `${courtP(lead)} majoritaire` : `${courtP(lead)} en tête`) : "Sièges"}</b><span>majorité ${MAJ} · ${RES?.lus || 0}/${NC} circ.</span></div>`
    + `<div class="lv-bp-barre">${ordre.map(p => `<span style="width:${pct(s[p].s)};--c:${coulP(p)}"><i style="width:${100 * s[p].fin / s[p].s}%"></i></span>`).join("")}<em style="left:${100 * MAJ / NB}%"></em></div>`
    + `<div class="lv-bp-partis">${lead ? ordre.slice().sort((a, b) => s[b].s - s[a].s).slice(0, 8).map(p => `<span style="--c:${coulP(p)}"><i></i>${esc(courtP(p))} <b>${s[p].s}</b></span>`).join("") : `<span>En attente des premiers résultats</span>`}</div>`;
}
// résultat de 2023 d'un parti : ligne nationale, sinon somme des provinces (candidatures sous 1 % des voix nationales)
const R23p = p => {
  const k = (R23.nat?.partis || []).find(x => x.p === p); if (k) return { e: k.e, pct: 100 * k.v / R23.nat.valides };
  let v = 0, e = 0; for (const t of Object.values(R23.prov || {})) for (const x of t.partis) if (x.p === p) { v += x.v; e += x.e; }
  return v && R23.nat ? { e, pct: 100 * v / R23.nat.valides } : null;
};
const R23v = p => R23p(p)?.pct || 0;
function moyenneSondages() {
  const L = (SOND?.sondages || []).slice(0, 5), out = {};
  for (const p of ["pp", "psoe", "vox", "fa", "podemos", "salf"]) {
    const v = L.map(x => x.v[p] ?? (p === "fa" ? x.v.sumar : undefined)).filter(x => x != null);
    if (v.length) out[p] = v.reduce((a, b) => a + b, 0) / v.length;
  }
  return out;
}

/* ---------- carte ---------- */
let svg, gZ, ZOOM, PATH, MW = 640, MH = 520, tip, gSuiv, gSel, gPetits, kZoom = 1;
const PETITS = ["51", "52"];                                   // Ceuta et Melilla : un cercle cliquable en plus du contour (trop petit)
const ZONES = {
  mad: f => f.properties.n === "28", cat: f => f.properties.ca === "CT", pv: f => ["PV", "NC"].includes(f.properties.ca),
  and: f => f.properties.ca === "AN", gal: f => f.properties.ca === "GA", can: f => f.properties.ca === "CN", cm: f => PETITS.includes(f.properties.n),
};
const ZOOMS = [["tout", "Toute l'Espagne"], ["mad", "Madrid"], ["cat", "Catalogne"], ["pv", "Pays basque et Navarre"], ["and", "Andalousie"], ["gal", "Galice"], ["can", "Canaries"], ["cm", "Ceuta et Melilla"]];
const gagnant23 = code => { const L = R23.prov[code]?.partis; if (!L?.length) return null; const p = L.slice().sort((a, b) => b.v - a.v)[0].p; return p === "sumar" && DEMO !== 2023 ? "fa" : p; };
function remplir(code) {
  const c = enProv(code);
  if (!c) return ["var(--soft)", 1];
  const p = tete(c).p;
  if (carteGains) return gagnant23(code) && gagnant23(code) !== p ? [coulP(p), 1] : ["var(--soft)", 1];
  if (carteMarge) return [coulP(p), Math.max(0.2, Math.min(1, 0.2 + ecartPts(c) / 25))];
  return [coulP(p), c.final || c.frac == null ? 1 : 0.3 + 0.65 * c.frac];
}
function dessinerCarte() {
  if (!gZ) return;
  gZ.selectAll(".lv-rid").each(function (f) { const [col, op] = remplir(f.properties.n); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null ? [] : GEO.features.filter(f => f.properties.n === sel)).join("path").attr("class", "lv-selline").attr("d", PATH);
  gPetits.selectAll("circle.es-sel").data(sel && PETITS.includes(sel) ? GEO.features.filter(f => f.properties.n === sel) : []).join("circle").attr("class", "es-sel lv-selline")
    .attr("cx", f => PATH.centroid(f)[0]).attr("cy", f => PATH.centroid(f)[1]).attr("r", 7 / kZoom);
  dessinerContoursSuivis(); dessinerLegende();
}
function dessinerLegende() {
  const pres = ORDRE_P.filter(p => GEO.features.some(f => enProv(f.properties.n) && tete(enProv(f.properties.n)).p === p));
  $("edLegende").innerHTML = (pres.length ? pres : ["pp", "psoe", "vox", "bildu", "pnv"]).map(p => `<span class="ed-legende-k" style="--c:${coulP(p)}"><i></i>${esc(courtP(p))} en tête</span>`).join("")
    + `<span>${carteGains ? "· seulement les circonscriptions où le parti en tête change par rapport à 2023 (Sumar compté comme FA)" : carteMarge ? "· couleur d'autant plus foncée que l'écart entre les deux premiers est grand (pleine à 20 points et plus)" : "· plus la couleur est pâle, moins il y a de bureaux dépouillés"} · gris : aucun résultat · Canaries en encart, Ceuta et Melilla agrandies (cercles)</span>`;
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  b.setAttribute("aria-pressed", carteSuivis); b.textContent = carteSuivis ? `★ Suivies (${suivies.size})` : "★ Suivies";
  b.style.setProperty("--c", "#B7860B");
  if (!gSuiv) return;
  const d = carteSuivis ? GEO.features.filter(f => suivies.has(f.properties.n)) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-halo").attr("d", PATH);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-ligne").attr("d", PATH).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
function infobulle(e, f) {
  const code = f.properties.n, c = enProv(code), g23 = gagnant23(code);
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = Math.max(4, Math.min(e.clientX - box.left + 12, box.width - 250)) + "px"; tip.style.top = Math.max(4, Math.min(e.clientY - box.top + 12, box.height - 140)) + "px";
  const nom = `<b>${suivies.has(code) ? "★ " : ""}${esc(PROV[code].nom)} · ${pl(PROV[code].s, "siège")}</b>`;
  tip.innerHTML = nom + (c ? c.cands.slice(0, 4).map(k => `<span class="ed-tip-l" style="--c:${coulP(k.p)}"><span><i></i>${esc(libP(k.p, k.sig))}${k.sieges ? ` · ${k.sieges}` : ""}</span><b>${nf(pctC(c, k), 1)} %</b></span>`).join("")
    + `<small>${c.final ? "dépouillement terminé" : c.frac != null ? nf(100 * c.frac, 1) + " % dépouillé" : "dépouillement en cours"}${g23 ? ` · 2023 : ${esc(courtP(g23))} en tête` : ""}</small>`
    : `<br><small>Aucun résultat${g23 ? ` · 2023 : ${esc(courtP(g23))} en tête` : ""}</small>`);
}
function construireCarte() {
  if (svg) return;
  const proj = d3.geoConicConformal().rotate([4, 0]).parallels([36, 43]).fitExtent([[10, 58], [MW - 10, MH - 40]], GEO)   // place pour les boutons du haut et du bas;
  PATH = d3.geoPath(proj);
  svg = d3.select($("lvCarte")).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove();
  gZ = svg.append("g");
  // cadre de l'encart des Canaries
  const [[x0, y0], [x1, y1]] = GEO.encart;
  gZ.append("path").attr("d", PATH({ type: "LineString", coordinates: [[x0, y1], [x1, y1], [x1, y0]] })).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", 0.35)
    .attr("stroke-width", 1).attr("vector-effect", "non-scaling-stroke").attr("stroke-dasharray", "4 3").style("color", "var(--muted)");
  gZ.append("g").selectAll("path").data(GEO.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => `${f.properties.nom} (${f.properties.s} sièges)`)
    .on("click", (e, f) => choisir(f.properties.n))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.n); } })
    .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  gPetits = gZ.append("g");
  gPetits.selectAll("circle.lv-rid").data(GEO.features.filter(f => PETITS.includes(f.properties.n))).join("circle").attr("class", "lv-rid")
    .attr("cx", f => PATH.centroid(f)[0]).attr("cy", f => PATH.centroid(f)[1]).attr("r", 6).attr("aria-hidden", "true")
    .on("click", (e, f) => choisir(f.properties.n)).on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  gSuiv = gZ.append("g"); gSel = gZ.append("g");
  ZOOM = d3.zoom().scaleExtent([1, 80]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => {
    gZ.attr("transform", e.transform); kZoom = e.transform.k;
    gPetits.selectAll("circle.lv-rid").attr("r", 6 / kZoom); gPetits.selectAll("circle.es-sel").attr("r", 7 / kZoom);
  });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(80, 0.85 / Math.max((x1 - x0) / MW, (y1 - y0) / MH, 0.002));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (z === "cm") vers(PATH.bounds({ type: "FeatureCollection", features: GEO.features.filter(f => ["51", "52", "11", "29"].includes(f.properties.n)) }));
  else if (ZONES[z]) vers(PATH.bounds({ type: "FeatureCollection", features: GEO.features.filter(ZONES[z]) }));
  else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
  else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
}
let info = () => {};
function preparerCarte() {
  tip = $("lvTip");
  const etroit = innerWidth <= 600;                            // téléphone : moins de raccourcis (le pincement sert à zoomer)
  $("lvZoom").innerHTML = ZOOMS.filter(([k]) => !etroit || ["tout", "mad", "cat", "can", "cm"].includes(k)).map(([k, l]) => `<button type="button" data-z="${k}">${esc(l)}</button>`).join("")
    + `<button type="button" data-z="plus" aria-label="Zoomer">+</button><button type="button" data-z="moins" aria-label="Dézoomer">−</button>`
    + `<span class="lv-groupe" role="group" aria-label="Affichage de la carte (un seul à la fois, ou aucun)"><button type="button" data-z="marge" id="edMarge" aria-pressed="false" title="Couleur du parti en tête, d'autant plus foncée que l'écart est grand">Écart</button><button type="button" data-z="gains" id="edGains" aria-pressed="false" title="Seulement les circonscriptions où le parti en tête change par rapport à 2023">Gains</button></span>`;
  const carte = $("lvCarte").parentElement;
  carte.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau")) e.preventDefault(); }, { passive: false });
  carte.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "plein") pleinEcran();
    else if (z === "marge" || z === "gains") basculer(z);
    else zoomer(z);
  });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "esCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
  const ecran = () => document.fullscreenElement || document.webkitFullscreenElement;
  const repere = document.createComment("place de la fiche");
  info = ouvrir => {
    const pan = $("lvPanneau");
    if (ouvrir && pan.parentElement !== carte) { pan.before(repere); carte.appendChild(pan); pan.classList.add("lv-panneau-plein"); }
    if (!ouvrir && pan.parentElement === carte) { repere.replaceWith(pan); pan.classList.remove("lv-panneau-plein"); }
    $("lvInfo").setAttribute("aria-pressed", ouvrir);
  };
  $("lvInfo").addEventListener("click", () => info($("lvInfo").getAttribute("aria-pressed") !== "true"));
  let avant = false;
  const plein = () => !!ecran() || carte.classList.contains("lv-plein");
  const etatPlein = () => {
    const on = plein();
    $("lvPlein").setAttribute("aria-pressed", on);
    $("lvPlein").textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    if (on && !avant) info(innerWidth > 900);
    if (!on) info(false);
    avant = on;
  };
  function pleinEcran() {
    if (ecran()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (carte.classList.contains("lv-plein")) { carte.classList.remove("lv-plein"); document.body.classList.remove("lv-plein-actif"); etatPlein(); }
    else if (carte.requestFullscreen || carte.webkitRequestFullscreen) (carte.requestFullscreen || carte.webkitRequestFullscreen).call(carte);
    else { carte.classList.add("lv-plein"); document.body.classList.add("lv-plein-actif"); etatPlein(); }   // iPhone : couche fixe
  }
  document.addEventListener("fullscreenchange", etatPlein);
  document.addEventListener("webkitfullscreenchange", etatPlein);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && carte.classList.contains("lv-plein")) pleinEcran(); });
}
// Écart / Gains : un seul à la fois, ou aucun
function basculer(z) {
  carteMarge = z === "marge" && !carteMarge;
  carteGains = z === "gains" && !carteGains;
  $("edMarge").setAttribute("aria-pressed", carteMarge); $("edGains").setAttribute("aria-pressed", carteGains);
  dessinerCarte();
}

/* ---------- fiche (panneau de droite) ---------- */
const sigle = (p, sig = "") => `<span class="lv-ava lv-ini" style="--c:${coulP(p)}" aria-hidden="true">${esc((p === "aut" ? sig.replace(/[^A-Za-zÀ-ÿ]/g, "") || "·" : courtP(p)).replace(/^EH /, "").slice(0, 3).toUpperCase())}</span>`;
function phraseDernier(c) {
  const d = c.dernier; if (!d) return "";
  return `Dernier siège : <b style="color:${coulP(d.a)}">${esc(d.la)}</b>, que ${esc(d.lb)} prendrait avec ${nf(d.manque)} voix de plus (${nf(100 * d.manque / c.valides, 2)} % des voix valides).`;
}
function dessinerPanneau() {
  const p = $("lvPanneau");
  if (sel == null) {
    const n = RES?.lus || 0;
    p.innerHTML = `<span class="lv-eyebrow">Circonscriptions</span><h3>Clique sur une province</h3>
      <p class="lv-muted">Chaque province (et Ceuta, Melilla) élit un nombre fixe de députés à la proportionnelle : listes fermées, méthode d'Hondt, seuil de 3 % des voix valides (blancs compris) dans la circonscription. Couleur : parti en tête ; plus pâle, moins de bureaux dépouillés. « Gains » ne montre que les provinces où le parti en tête change par rapport à 2023.</p>
      <div class="lv-kv"><div><b>${n}</b><span>avec résultats</span></div><div><b>${NC - n}</b><span>sans résultat</span></div><div><b>${MAJ}</b><span>majorité absolue</span></div></div>
      <p class="lv-muted">Plus grandes circonscriptions : Madrid (38 sièges, un de plus qu'en 2023), Barcelone (32), Valence (16), Alicante et Séville (12). Cadix perd un siège (8). Soria élit 2 députés, Ceuta et Melilla 1 chacune.</p>`;
    return;
  }
  const c = enProv(sel), g23 = gagnant23(sel), r23 = R23.prov[sel], P = PROV[sel];
  let html = `<span class="lv-eyebrow">Circonscription · ${esc(P.es)} · ${pl(c?.s || P.s, "siège")}</span><h3>${esc(P.nom)}</h3>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${sel}" aria-pressed="${suivies.has(sel)}" style="--c:#B7860B">${suivies.has(sel) ? "★ Suivie" : "☆ Suivre"}</button></div>`;
  if (c) {
    const [a, b] = c.cands, ecart = b ? a.v - b.v : a.v;
    html += `<div class="lv-chips"><span class="lv-chip ${c.final ? "fin" : ""}">${c.final ? "Dépouillement terminé" : c.frac != null ? `${nf(100 * c.frac, 1)} % dépouillé` : "Dépouillement en cours"}</span>`
      + (g23 && g23 !== a.p ? `<span class="lv-chip" style="--c:${coulP(a.p)}">${esc(courtP(a.p))} passe en tête (2023 : ${esc(courtP(g23))})</span>` : "")
      + (c.ecartSieges ? `<span class="lv-chip">Sièges publiés ≠ recalcul (voir ci-dessous)</span>` : "") + `</div>`
      + `<p class="lv-tete" style="--c:${coulP(a.p)}"><b>${esc(courtP(a.p) === "Autres" ? a.sig : PARTIS[a.p].nom)}</b> en tête${b ? ` par ${nf(ecart)} voix (${nf(pctC(c, a) - pctC(c, b), 1)} pt)` : ""}</p>`
      + `<table class="lv-cands"><tbody>${c.cands.map(k => `<tr style="--c:${coulP(k.p)}"><td>${sigle(k.p, k.sig)}</td>`
        + `<td><b>${esc(k.sig)}</b>${k.sieges ? ` <span class="lv-sortant">${pl(k.sieges, "siège")}</span>` : ""}<small>${esc(PARTIS[k.p]?.nom || "")}${k.v < SEUIL * c.valides ? " · sous le seuil de 3 %" : ""}${c.publies && (k.e || 0) !== k.calc ? ` · recalcul : ${k.calc}` : ""}</small><span class="lv-jauge"><i style="width:${Math.min(100, pctC(c, k))}%"></i></span></td>`
        + `<td class="lv-num"><b>${nf(pctC(c, k), 1)} %</b><small>${nf(k.v)}</small></td></tr>`).join("")}`
      + (c.autres ? `<tr style="--c:${coulP("aut")}"><td>${sigle("aut")}</td><td><b>Autres candidatures</b><small>regroupées par la source</small></td><td class="lv-num"><b>${nf(100 * c.autres / c.valides, 1)} %</b><small>${nf(c.autres)}</small></td></tr>` : "")
      + (c.tot.blancs ? `<tr><td></td><td><b>Votes blancs</b><small>comptent dans les voix valides (seuil de 3 %)</small></td><td class="lv-num"><b>${nf(100 * c.tot.blancs / c.valides, 1)} %</b><small>${nf(c.tot.blancs)}</small></td></tr>` : "")
      + `</tbody></table>`
      + `<p class="lv-muted">${phraseDernier(c)} Seuil de 3 % : ${nf(Math.ceil(SEUIL * c.valides))} voix.${c.tot.votants && c.tot.censo ? ` Participation : ${nf(100 * c.tot.votants / c.tot.censo, 1)} %.` : ""}</p>`;
  } else html += `<div class="lv-chips"><span class="lv-chip">Aucun résultat pour l'instant</span></div>`;
  if (r23?.partis?.length && DEMO !== 2023) {
    const L = r23.partis.slice().sort((x, y) => y.v - x.v);
    html += `<p class="lv-muted lv-proj">En 2023 : ${L.filter(k => k.e > 0 || 100 * k.v / r23.valides >= 5).slice(0, 5).map(k => `<b style="color:${coulP(k.p)}">${esc(k.sig)}</b> ${nf(100 * k.v / r23.valides, 1)} %${k.e ? ` (${k.e})` : ""}`).join(" · ")}${P.s !== r23.sieges ? ` · ${r23.sieges} sièges à pourvoir en 2023, ${P.s} en 2026` : ""}</p>`;
  }
  p.innerHTML = html;
}

/* ---------- circonscriptions suivies, alertes, classement ---------- */
let suivies = new Set(lireLS(localStorage, "esSuivies", []));
let carteSuivis = lireLS(localStorage, "esCarteSuivies", false), triClassement = lireLS(localStorage, "esTri", "serre");
let connus = DEMO ? null : lireLS(sessionStorage, "esConnus", null);
function basculerSuivie(code) {
  suivies.has(code) ? suivies.delete(code) : suivies.add(code);
  ecrireLS(localStorage, "esSuivies", [...suivies]);
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
const manquePct = c => c?.dernier ? 100 * c.dernier.manque / c.valides : 999;
function ligne(code) {
  const c = enProv(code), a = c && tete(c);
  const rep = c ? c.cands.filter(k => k.sieges).map(k => `${libP(k.p, k.sig)} ${k.sieges}`).join(" · ") : "";
  return `<li class="lv-ligne" data-rid="${code}" tabindex="0" title="${esc(rep)}${c?.dernier ? ` · dernier siège : ${c.dernier.la}, que ${c.dernier.lb} prendrait avec ${nf(c.dernier.manque)} voix de plus` : ""}"><button type="button" class="lv-etoile" data-suivre="${code}" aria-pressed="${suivies.has(code)}" aria-label="Suivre ${esc(PROV[code].nom)}">${suivies.has(code) ? "★" : "☆"}</button>`
    + `<span class="lv-nom" style="--c:${a ? coulP(a.p) : "var(--soft)"}"><i></i>${esc(PROV[code].nom)} <small>(${PROV[code].s})</small></span>`
    + `<span class="lv-ecart">${c?.dernier ? `${esc(c.dernier.la)} › ${esc(c.dernier.lb)} ${nf(manquePct(c), 2)} %` : a ? `${esc(courtP(a.p))} +${nf(ecartPts(c), 1)} pt` : "—"}<small> · ${c ? (c.final ? "terminé" : c.frac != null ? nf(100 * c.frac, 0) + " %" : "") : ""}</small></span></li>`;
}
function dessinerSuivi() {
  $("lvSuivies").innerHTML = suivies.size ? `<ul class="lv-lignes">${[...suivies].filter(k => PROV[k]).sort((a, b) => PROV[a].nom.localeCompare(PROV[b].nom, "fr")).map(ligne).join("")}</ul>`
    : `<p class="lv-muted">Clique sur ☆ dans la fiche ou le classement pour suivre une circonscription : elle s'affiche ici, et une alerte apparaît quand le parti en tête ou la répartition des sièges change.</p>`;
  const TRIS = [["serre", "Dernier siège serré"], ["sieges", "Par sièges"], ["nom", "Par nom"]];
  $("lvPPChoix").innerHTML = TRIS.map(([k, l]) => `<button type="button" data-tri="${k}" aria-pressed="${triClassement === k}">${l}</button>`).join("");
  const codes = Object.keys(PROV).sort((a, b) => {
    if (triClassement === "nom") return PROV[a].nom.localeCompare(PROV[b].nom, "fr");
    if (triClassement === "sieges") return PROV[b].s - PROV[a].s || PROV[a].nom.localeCompare(PROV[b].nom, "fr");
    return manquePct(enProv(a)) - manquePct(enProv(b)) || PROV[a].nom.localeCompare(PROV[b].nom, "fr");
  });
  $("lvParParti").innerHTML = `<p class="lv-muted">« PP › Vox 0,36 % » : le PP a le dernier siège de la province ; Vox le prendrait avec 0,36 % des voix valides de plus.</p><ul class="lv-lignes">${codes.map(ligne).join("")}</ul>`;
}
function surveiller() {
  const now = {};
  for (const code of Object.keys(PROV)) {
    const c = enProv(code); if (!c) continue;
    const s = {}; for (const k of c.cands) if (k.sieges) s[k.p] = (s[k.p] || 0) + k.sieges;
    now[code] = { t: tete(c).p, s };
  }
  if (connus) for (const code of suivies) {
    const a = now[code], b = connus[code]; if (!a || !b) continue;
    if (a.t !== b.t) alerter(`${PROV[code].nom} : ${courtP(a.t)} passe en tête devant ${courtP(b.t)}`, coulP(a.t));
    else for (const p of Object.keys({ ...a.s, ...b.s })) if ((a.s[p] || 0) > (b.s?.[p] || 0)) { alerter(`${PROV[code].nom} : ${courtP(p)} gagne un siège (${a.s[p]})`, coulP(p)); break; }
  }
  connus = now; if (!DEMO) ecrireLS(sessionStorage, "esConnus", connus);
}
function alerter(txt, c) {
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", c); el.textContent = "★ " + txt;
  $("lvAlertes").appendChild(el); setTimeout(() => el.remove(), 12000);
}

/* ---------- blocs du bas : partis, sondages, fonctionnement et enjeux ---------- */
function dessinerTextes() {
  const moy = moyenneSondages();
  const cartes = ORDRE_P.filter(p => PARTIS[p].chef && p !== "sumar" && p !== "upn").sort((a, b) => (moy[b] || 0) - (moy[a] || 0) || R23v(b) - R23v(a));
  const S = SOND?.sondages || [];
  const cols = [["pp", "PP"], ["psoe", "PSOE"], ["vox", "Vox"], ["fa", "FA*"], ["podemos", "Podemos"], ["salf", "SALF"]];
  const v = (x, p) => x.v[p] ?? (p === "fa" ? x.v.sumar : null);
  const siegeMoy = t => { if (!t) return null; const [a, b] = String(t).split("/").map(Number); return b ? (a + b) / 2 : a; };
  const ppvox = x => { const a = siegeMoy(x.e.pp), b = siegeMoy(x.e.vox); return a != null && b != null ? a + b : null; };
  $("edBlocs").innerHTML = `
    <section class="ed-bloc" aria-labelledby="esPartisTitre"><h3 id="esPartisTitre">Qui se présente</h3>
      <p>Élections anticipées : Pedro Sánchez a fait dissoudre les Cortes le 6 octobre 2026 (décret royal 806/2026), neuf mois avant la fin de la législature, après le rejet de deux décrets sur le logement par le PP, Vox et Junts. À gauche du PSOE, Sumar a laissé place au Frente Amplio d'Ada Colau ; Podemos se présente seul ; Compromís forme le Front valencià ; UPN figure sur la liste du PP en Navarre. Moyenne des cinq derniers sondages entre parenthèses.</p>
      <div class="lv-partis ed-reps">${cartes.map(p => { const P = PARTIS[p], a = R23p(p);
        return `<div class="lv-parti" style="--c:${P.c}"><i></i><span class="lv-pnom">${esc(P.court)}</span><b>${moy[p] != null ? nf(moy[p], 1) + " %" : ""}</b><small>${esc(P.nom)} · tête de liste : ${esc(P.chef)} · 2023 : ${a ? `${pl(a.e, "siège")}, ${nf(a.pct, 1)} %` : esc(P.avant || "absent")}</small></div>`; }).join("")}</div>
    </section>
    <section class="ed-bloc" aria-labelledby="esSondTitre"><h3 id="esSondTitre">Derniers sondages</h3>
      <p>Les ${S.length} plus récents (dates du terrain). Intentions de vote en % ; sièges projetés de PP + Vox quand le sondeur les publie (majorité : 176). *FA : Frente Amplio avec le Front valencià ; avant sa création (octobre), Sumar. La loi interdit d'en publier en Espagne à partir du 24 novembre.</p>
      <div class="ed-sond"><table><thead><tr><th>Sondeur · média</th>${cols.map(([, l]) => `<th>${l}</th>`).join("")}<th>PP + Vox (sièges)</th><th>Échantillon</th><th class="ed-sond-barre">Répartition</th></tr></thead><tbody>${S.map(x => `<tr><td><b>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.s)}</a>` : esc(x.s)}</b><small>${esc(x.d)}${x.media ? " · " + esc(x.media) : ""}</small></td>`
        + cols.map(([p]) => `<td>${v(x, p) != null ? nf(v(x, p), 1) : "–"}</td>`).join("") + `<td>${ppvox(x) != null ? `<b style="color:${ppvox(x) >= MAJ ? coulP("pp") : "inherit"}">${nf(ppvox(x), 0)}</b>` : "–"}</td><td>${x.n ? nf(x.n) : "–"}</td>`
        + `<td class="ed-sond-barre"><span class="ed-mini" role="img" aria-label="${cols.map(([p, l]) => `${l} ${v(x, p) ?? "?"} %`).join(", ")}">${["podemos", "fa", "psoe", "salf", "vox", "pp"].map(p => v(x, p) != null ? `<i style="width:${v(x, p)}%;background:${coulP(p)}"></i>` : "").join("")}</span></td></tr>`).join("")}</tbody></table></div>
      <p>Compilation : Wikipédia, « <a href="${esc(SOND?.source || "#")}" target="_blank" rel="noopener">Opinion polling for the 2026 Spanish general election</a> » (CC BY-SA 4.0), d'après les articles des médias (liens sur les noms) ; sondages commandés par un parti écartés.</p>
    </section>
    <section class="ed-bloc" aria-labelledby="esSystTitre"><h3 id="esSystTitre">Comment ça marche</h3>
      <div class="ed-voter">
        <div><h4>Le Congrès des députés</h4><p>350 sièges, 52 circonscriptions : les 50 provinces (au moins 2 sièges chacune, le reste selon la population) et les villes autonomes de Ceuta et Melilla (1 siège chacune, au scrutin majoritaire). Listes fermées et bloquées ; les sièges de chaque province sont répartis à la proportionnelle par la méthode d'Hondt entre les listes qui ont au moins 3 % des voix valides (votes blancs compris).</p></div>
        <div><h4>La majorité</h4><p>Le président du gouvernement est investi par le Congrès : majorité absolue (176 voix) au premier vote, ou plus de oui que de non au second, 48 heures plus tard. Les partis régionaux (catalans, basques, galiciens, canariens) pèsent souvent sur l'investiture : en 2023, Pedro Sánchez l'a été avec 179 voix.</p></div>
        <div><h4>Le soir du vote</h4><p>Bureaux ouverts de 9 h à 20 h (heure de la péninsule ; 3 h à 14 h au Québec), une heure plus tard aux Canaries. Le ministère de l'Intérieur publie le dépouillement provisoire, bureau par bureau, à partir de 21 h environ. Le vote des Espagnols de l'étranger (CERA) n'est compté qu'au recensement général, du 4 au 7 décembre : il fait parfois basculer un siège (Madrid en 2023).</p></div>
        <div><h4>Le Sénat</h4><p>208 sénateurs élus au suffrage direct (4 par province péninsulaire, par île dans les Baléares et les Canaries, 2 à Ceuta et Melilla ; Formentera a désormais son propre siège), plus une soixantaine désignés par les parlements régionaux. Vote pour des candidats individuels (listes ouvertes, jusqu'à 3 noms sur 4) : non affiché sur cette page, centrée sur le Congrès.</p></div>
        <div><h4>Les enjeux</h4><p>Crise du logement (grandes manifestations de l'automne), affaires de corruption touchant le PSOE (affaire Koldo), immigration (crise de Ceuta de l'été 2026). Les sondages donnent au PP et à Vox ensemble une majorité absolue ; la question est de savoir si le PP pourra gouverner sans Vox, et si la gauche, divisée entre FA et Podemos, perd des sièges dans les petites provinces, où le seuil effectif dépasse de loin 3 %.</p></div>
        <div><h4>Les blocs</h4><p>Sur cette page, « gauche et partenaires » regroupe le PSOE, le FA, Compromís, Podemos, ERC, EH Bildu, le PNV, le BNG et Adelante ; « PP + Vox et alliés », le PP, Vox, UPN et SALF ; Junts (qui a rompu avec le PSOE en 2025) et la Coalition canarienne sont comptés à part. En 2023 : 171 sièges de chaque côté, et 8 pour Junts et CC.</p></div>
      </div>
    </section>`;
  $("edSource").innerHTML = `Sources : résultats provisoires du <a href="${SITE_INFO}" target="_blank" rel="noopener">ministère de l'Intérieur</a> (non officiels jusqu'au recensement général du 4 au 7 décembre ; sièges recalculés par ce site) ;
    élection de 2023 : ministère de l'Intérieur, fichiers d'infoelectoral (02202307), compilés par github.com/nachorojo/elecciones ; sièges par circonscription : décret royal 806/2026 ;
    carte : Instituto Geográfico Nacional (IGN/CNIG), données sous licence CC BY 4.0 (scne.es), via es-atlas, Canaries déplacées en encart ;
    sondages : Wikipédia (CC BY-SA 4.0) et les médias cités ; partis et têtes de liste : presse et Wikipédia. Couleurs des partis : usuelles, approximatives.`;
}

function dessiner() { dessinerEtat(); dessinerSieges(); dessinerCarte(); dessinerPanneau(); dessinerSuivi(); }
function choisir(code, defiler = true) {
  sel = code; dessinerCarte(); dessinerPanneau();
  const plein = !!document.querySelector(".lv-cartecard.lv-plein, .lv-cartecard:fullscreen");
  if (plein) info(true);
  else if (defiler && innerWidth <= 900) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function demarrer() {
  try {
    const [geo, r23, sond] = await Promise.all([
      fetch("en-direct/espagne/circonscriptions.json", { cache: "no-cache" }).then(r => r.json()),
      fetch("en-direct/espagne/resultats-2023.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("en-direct/espagne/sondages.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    GEO = geo; if (r23) R23 = r23; SOND = sond;
    // contours dans le sens attendu par d3 (sinon un polygone couvre toute la sphère)
    for (const f of GEO.features) if (d3.geoArea(f) > 2 * Math.PI) f.geometry.coordinates = f.geometry.coordinates.map(p => p.map(r => r.slice().reverse()));
    for (const f of GEO.features) {
      const pr = f.properties; PROV[pr.n] = pr;
      for (const a of [pr.nom, pr.es, ...(pr.alias || [])]) { ALIAS.set(norm(a), pr.n); for (const part of String(a).split(/\s*[\/-]\s*/)) if (part.length > 3) ALIAS.set(norm(part), pr.n); }
    }
    dessinerHeures(); dessinerTextes(); preparerCarte(); construireCarte();
  } catch (e) { $("lvEtat").textContent = "Chargement impossible : " + e.message; return; }
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-suivre]"); if (s) { e.stopPropagation(); basculerSuivie(s.dataset.suivre); return; }
    const t = e.target.closest("[data-tri]"); if (t) { triClassement = t.dataset.tri; ecrireLS(localStorage, "esTri", triClassement); dessinerSuivi(); return; }
    const l = e.target.closest(".lv-ligne"); if (l) choisir(l.dataset.rid);
  });
  document.addEventListener("keydown", e => {
    const l = e.target.closest?.(".lv-ligne");
    if (l && (e.key === "Enter" || e.key === " ") && e.target === l) { e.preventDefault(); choisir(l.dataset.rid); }
  });
  $("lvPPReplier").addEventListener("click", () => { const ouvert = $("lvPPSection").hasAttribute("data-ferme"); $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); });
  $("lvMaj").addEventListener("click", actualiser);
  dessiner();
  await actualiser();
  setInterval(() => { if (!document.hidden && Date.now() >= prochaine) actualiser(); afficherDecompte(); }, 1000);
  setInterval(dessinerHeures, 60000);
}
demarrer();
