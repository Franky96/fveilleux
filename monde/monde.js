/* Information Monde (information-monde.html) : globe des pays (projection orthographique, canvas), drapeau du lieu choisi
   à trois niveaux : pays → subdivision (province, État…) → ville. Les subdivisions et villes ne sont connues que pour les
   pays de SOUS (Canada pour l'instant ; ajouter un pays = contours, noms, drapeaux et liste de villes).
   Données : monde/outils/donnees.py (contours, drapeaux des pays et provinces), monde/outils/fiches.py (villes, fiches).
   Sélecteur de niveau Pays · Province · Ville ; Échap ou clic sur l'océan = remonter d'un niveau.
   Sélection gardée dans l'adresse (#CA, #CA-QC, #Q141810 pour une ville). */
const $ = id => document.getElementById(id);
const ESC = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NOMS = new Intl.DisplayNames(["fr"], { type: "region" });
const NB = new Intl.NumberFormat("fr-CA");
// territoires réunis à leur pays sur le globe (nom anglais de Natural Earth)
const FUSIONS = { SO: ["Somaliland"] };
// entités sans code ISO dans Natural Earth
const SANS_CODE = { "Somaliland": "Somaliland", "N. Cyprus": "Chypre du Nord", "Indian Ocean Ter.": "Territoires australiens de l'océan Indien", "Siachen Glacier": "Glacier de Siachen" };

// subdivisions : code ISO 3166-2 → nom et statut ; villes : liste de fiches.py
const SOUS = {
  CA: {
    fichier: "monde/canada.json", villes: "monde/villes-ca.json", dossier: "monde/drapeaux/ca/",
    titre: "Provinces et territoires", niveau: "Province", federal: "Capitale fédérale",
    noms: {
      "CA-AB": ["Alberta", "Province"], "CA-BC": ["Colombie-Britannique", "Province"], "CA-MB": ["Manitoba", "Province"],
      "CA-NB": ["Nouveau-Brunswick", "Province"], "CA-NL": ["Terre-Neuve-et-Labrador", "Province"], "CA-NS": ["Nouvelle-Écosse", "Province"],
      "CA-ON": ["Ontario", "Province"], "CA-PE": ["Île-du-Prince-Édouard", "Province"], "CA-QC": ["Québec", "Province"],
      "CA-SK": ["Saskatchewan", "Province"], "CA-NT": ["Territoires du Nord-Ouest", "Territoire"], "CA-NU": ["Nunavut", "Territoire"],
      "CA-YT": ["Yukon", "Territoire"],
    },
  },
};

const nomPays = f => { const a2 = f.properties.a2; if (!a2) return SANS_CODE[f.properties.en] || f.properties.en;
  try { const n = NOMS.of(a2); return n && n !== a2 ? n : f.properties.en; } catch { return f.properties.en; } };
const nomCode = (a2, code) => SOUS[a2].noms[code]?.[0] || code;
const nomSous = (a2, s) => nomCode(a2, s.properties.code);
const drapeauPays = a2 => `monde/drapeaux/${a2.toLowerCase()}.svg`;
const drapeauSous = (a2, s) => SOUS[a2].dossier + s.properties.code.split("-")[1].toLowerCase() + ".svg";

// rubriques (en haut de la page) : « Drapeaux » = chaque territoire rempli de son drapeau, au niveau des pays ou des
// États et provinces (Canada seulement pour l'instant) ; les rubriques de statistiques viendront s'ajouter
const RUB = (() => { try { return { drapeaux: true, aff: "pays", ...JSON.parse(localStorage.getItem("mondeRub") || "{}") }; } catch { return { drapeaux: true, aff: "pays" }; } })();
const garderRub = () => { try { localStorage.setItem("mondeRub", JSON.stringify(RUB)); } catch {} };
const modeEtats = () => RUB.drapeaux && RUB.aff === "etat";
let PAYS = [], FRONTIERES, LACS = { type: "FeatureCollection", features: [] }, BOITES_LACS = [], FICHES = {}, STATS = {}, charges = {}, sel = null, memo = {}, survol = null;
const canvas = $("globe"), ctx = canvas.getContext("2d");
const proj = d3.geoOrthographic().clipAngle(90).precision(0.7);
const chemin = d3.geoPath(proj, ctx), grille = d3.geoGraticule10();
const ZOOM_MAX = 300;   // de quoi voir les quartiers d'une ville (demande de l'utilisateur)
let rot = [40, -30, 0], k = 1, R = 300, W = 600, H = 600;   // rotation (vue sur l'Atlantique), zoom, rayon de base, taille du canvas
let C = {};
const couleurs = () => { const s = getComputedStyle(document.documentElement);
  C = Object.fromEntries(["ocean", "grille", "terre", "terre-survol", "frontiere", "choisi", "pays-fond", "sous-trait", "contour", "ville", "ville-trait", "texte-globe", "focus", "focus-pays", "focus-trait", "ville-focus", "ville-focus-trait", "accent"]
    .map(n => [n, s.getPropertyValue("--" + n).trim()])); };

/* ---------- vitesse ---------- */
// cercle englobant (centre, rayon angulaire) et boîte de chaque forme
function cercle(f) {
  const c = d3.geoCentroid(f); let r = 0;
  d3.geoStream(f, { point(x, y) { r = Math.max(r, d3.geoDistance(c, [x, y])); }, lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {}, sphere() {} });
  f._c = c; f._r = r; f._b = d3.geoBounds(f); return f;
}
// version allégée d'une forme : on saute les points à moins de « pas » degrés du dernier gardé, et les îles, lacs ou
// morceaux de ligne plus petits que « pas » (invisibles à ce zoom : moins d'un pixel)
function alleger(geo, pas = 0.12) {
  const petit = a => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of a) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 - x0 < pas && y1 - y0 < pas; };
  const anneau = a => { const o = [a[0]]; for (let i = 1; i < a.length - 1; i++) { const q = o[o.length - 1]; if (Math.abs(a[i][0] - q[0]) + Math.abs(a[i][1] - q[1]) >= pas) o.push(a[i]); }
    o.push(a[a.length - 1]); return o.length >= 4 ? o : a; };
  // un anneau trop simplifié peut changer de sens : d3 le prendrait alors pour tout le reste du globe ; on garde l'original
  const poly = p => { if (petit(p[0])) return null;
    const q = [anneau(p[0]), ...p.slice(1).filter(h => !petit(h)).map(anneau)];
    return d3.geoArea({ type: "Polygon", coordinates: q }) > 2 * Math.PI ? p : q; };
  if (geo.type === "Polygon") { const p = poly(geo.coordinates); return p ? { type: "Polygon", coordinates: p } : geo; }
  if (geo.type === "MultiPolygon") { const ps = geo.coordinates.map(poly).filter(Boolean);
    return ps.length ? { type: "MultiPolygon", coordinates: ps } : { type: "MultiPolygon", coordinates: [] }; }
  if (geo.type === "MultiLineString") return { type: "MultiLineString", coordinates: geo.coordinates.filter(l => !petit(l)).map(anneau) };
  return geo;
}
// niveaux de détail : on saute les points à moins d'un pixel l'un de l'autre au zoom actuel (le tracé reste identique à l'œil)
const PAS = [0.5, 0.3, 0.2, 0.12, 0.08, 0.05, 0.03, 0.02];   // niveaux intermédiaires : juste assez de points à chaque zoom
let pasCourant = null;
function choisirPas() {
  const pxDeg = R * k * Math.PI / 180, tol = rapide ? 2 : 0.8;
  pasCourant = PAS.find(p => p * pxDeg <= tol) ?? null;
}
// forme au niveau de détail courant (calculée une fois par niveau)
function lod(f, pas = pasCourant) {
  if (!pas || !f) return f;
  const c = f._lod || (f._lod = {});
  return c[pas] || (c[pas] = f.type === "Feature" ? { type: "Feature", properties: f.properties, geometry: alleger(f.geometry, pas) } : alleger(f, pas));
}
// calcule d'avance, par petits lots quand le navigateur est libre, tous les niveaux de détail et leurs morceaux :
// pas d'à-coup la première fois qu'on zoome
function prechauffer(formes) {
  const travail = [];
  for (const pas of [...PAS, null]) for (const f of formes) travail.push(() => morceaux(lod(f, pas)));
  const lot = dl => { const fin = performance.now() + Math.max(4, dl?.timeRemaining?.() ?? 8);
    while (travail.length && performance.now() < fin) travail.shift()();
    if (travail.length) suivant(); };
  const suivant = () => window.requestIdleCallback ? requestIdleCallback(lot, { timeout: 200 }) : setTimeout(lot, 16);
  suivant();
}
const centreVue = () => [-rot[0], -rot[1]];
// rayon angulaire de ce qui est à l'écran (la face visible entière quand le globe tient dans le cadre)
let rayonVue = Math.PI / 2, centre = [0, 0];
const majVue = () => { centre = centreVue(); rayonVue = Math.asin(Math.min(1, Math.hypot(W, H) / 2 / (R * k))); };
const enVue = f => !f._c || d3.geoDistance(f._c, centre) < rayonVue + f._r;
// pendant qu'on tourne ou zoome : précision et niveau de détail un peu réduits (sous 1,5 px), dessin plus fin 150 ms après ; dessin complet 150 ms après
let rapide = false, finRapide = null;
function bouger() {
  rapide = true; proj.precision(2); clearTimeout(finRapide);
  finRapide = setTimeout(() => { rapide = false; proj.precision(0.7); dessiner(); }, 150);
}

/* ---------- données des subdivisions et villes ---------- */
// anneaux dans le sens attendu par d3 (horaire) : sinon le polygone couvrirait tout le reste du globe
function sensHoraire(d) {
  for (const s of d.features) if (d3.geoArea(s) > 2 * Math.PI) {
    const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
    for (const p of polys) for (const r of p) r.reverse();
  }
}
// un point dans un lac (boîte d'abord, pour aller vite)
const dansBoite = ([[x0, y0], [x1, y1]], [x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const dansLacMonde = p => BOITES_LACS.some((b, i) => dansBoite(b, p) && d3.geoContains(LACS.features[i], p));
const dansLac = dansLacMonde;
// boîte qui peut passer l'antiméridien (Russie, Fidji…)
const dansBoiteGeo = ([[x0, y0], [x1, y1]], [x, y]) => y >= y0 && y <= y1 && (x0 <= x1 ? x >= x0 && x <= x1 : x >= x0 || x <= x1);
async function charger(a2) {
  if (!SOUS[a2]) return null;
  if (charges[a2]) return charges[a2];
  const [d, villes] = await Promise.all([fetch(SOUS[a2].fichier).then(r => r.json()), fetch(SOUS[a2].villes).then(r => r.ok ? r.json() : []).catch(() => [])]);
  sensHoraire(d);
  d.features.sort((a, b) => nomSous(a2, a).localeCompare(nomSous(a2, b), "fr"));
  // frontières internes : contours de chaque subdivision (ceux du pays sont redessinés par-dessus)
  const mesh = { type: "MultiLineString", coordinates: d.features.flatMap(s => (s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates).flat()) };
  prechauffer([...d.features, mesh]);
  return (charges[a2] = { features: d.features, mesh, villes });
}
const villesDe = (a2, code) => (charges[a2]?.villes || []).filter(v => v.prov === code);

/* ---------- drapeaux sur le globe ---------- */
// image de chaque drapeau, chargée la première fois qu'elle sert, puis tramée une fois par taille (trame() ci-dessous)
const DRAP = new Map();
function imageDrapeau(src) {
  let d = DRAP.get(src);
  if (!d) {
    d = { img: new Image(), ok: false, trames: {} };
    d.pret = new Promise(fin => { d.img.onload = () => { d.ok = true; fin(); dessiner(); }; d.img.onerror = fin; });
    d.img.src = src; DRAP.set(src, d);
  }
  return d.ok ? d : null;
}
const rapport = d => d.img.naturalWidth / d.img.naturalHeight || 1.5;   // largeur : hauteur du drapeau
// drapeau symétrique de gauche à droite (Canada, Mexique…) : écart moyen entre chaque pixel et son reflet
function symetrique(d) {
  if (d.sym !== undefined) return d.sym;
  const t = trame(d, 64, 40), w = t.width, h = t.height, px = t.getContext("2d").getImageData(0, 0, w, h).data;
  let e = 0, n = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w / 2; x += 2) {
    const a = (y * w + x) * 4, b = (y * w + w - 1 - x) * 4;
    e += Math.abs(px[a] - px[b]) + Math.abs(px[a + 1] - px[b + 1]) + Math.abs(px[a + 2] - px[b + 2]); n += 3;
  }
  return (d.sym = e / n < 12);
}
// trame aux proportions et à la taille du drapeau à l'écran (64 à 2048 px dans chaque sens, densité de pixels comprise) :
// le drapeau est étiré dès la trame, comme à l'écran, pour que l'image ne soit pas réduite plus dans un sens que dans
// l'autre (le navigateur lisse alors selon le sens le plus réduit et brouille l'autre : drapeaux flous) ; pendant qu'on
// tourne ou zoome, pas de nouvelle trame (préparer une image coûte) : la plus proche déjà prête
const TAILLES = [64, 128, 256, 512, 1024, 2048];
const tailleTrame = v => TAILLES.find(x => x >= v * Math.min(2, devicePixelRatio || 1)) || 2048;
// f = [fx, fy, ox, oy] : part du cadre occupée par le drapeau et place de son coin haut gauche (fractions du cadre) ;
// autour, les couleurs du bord du drapeau sont prolongées jusqu'au bout du cadre
function trame(d, largeur, hauteur, f = [1, 1, 0, 0]) {
  const [fx, fy, ox, oy] = f, plein = fx >= 1 && fy >= 1;
  const tw = tailleTrame(largeur), th = tailleTrame(hauteur), suf = plein ? "" : "@" + f.map(v => v.toFixed(3)).join(","), cle = tw + "x" + th + suf;
  if (!d.trames[cle]) {
    const pretes = Object.keys(d.trames).filter(c => (c.includes("@") ? c.slice(c.indexOf("@")) : "") === suf);
    if (rapide && pretes.length) {
      const ecart = c => { const [a, b] = c.split("@")[0].split("x").map(Number); return Math.abs(Math.log(a / tw)) + Math.abs(Math.log(b / th)); };
      return d.trames[pretes.reduce((a, b) => ecart(b) < ecart(a) ? b : a)];
    }
    // le SVG est d'abord tramé à ses propres proportions, puis étiré : dessiné directement dans un cadre d'autres proportions,
    // Firefox le garde à ses proportions, centré (drapeau tassé en bande, selon la taille de la trame donc selon le zoom :
    // signalé par l'utilisateur), là où Chrome l'étire
    const x0 = Math.round(tw * ox), y0 = Math.round(th * oy), cw = Math.max(1, Math.round(tw * Math.min(1, fx))), ch = Math.max(1, Math.round(th * Math.min(1, fy)));
    const r = d.img.naturalWidth / d.img.naturalHeight || 1.5;
    const sw = Math.min(4096, Math.max(cw, Math.round(ch * r))), sh = Math.max(1, Math.round(sw / r));
    const s = document.createElement("canvas"); s.width = sw; s.height = sh; s.getContext("2d").drawImage(d.img, 0, 0, sw, sh);
    const c = document.createElement("canvas"); c.width = tw; c.height = th;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(s, x0, y0, cw, ch);
    // couleurs prolongées (demande de l'utilisateur) : la 2e rangée (puis colonne) du bord recopiée jusqu'au bout du cadre,
    // ex. le rouge et le blanc du Canada continuent en haut et en bas
    g.imageSmoothingEnabled = false;
    const bas = y0 + ch, droite = x0 + cw;
    if (y0 > 0 && ch > 2) g.drawImage(c, x0, y0 + 1, cw, 1, x0, 0, cw, y0 + 1);
    if (bas < th && ch > 2) g.drawImage(c, x0, bas - 2, cw, 1, x0, bas - 1, cw, th - bas + 1);
    if (x0 > 0 && cw > 2) g.drawImage(c, x0 + 1, 0, 1, th, 0, 0, x0 + 1, th);
    if (droite < tw && cw > 2) g.drawImage(c, droite - 2, 0, 1, th, droite - 1, 0, tw - droite + 1, th);
    d.trames[cle] = c;
  }
  return d.trames[cle];
}
// le drapeau est placé sur le gros du territoire (plus grand morceau et morceaux à moins de 25° de lui, ex. les îles du
// Nunavut) ; un morceau éloigné (Alaska, outre-mer) a son propre drapeau
function groupeDe(f) {
  if (f._grp) return f._grp;
  let [[x0, y0], [x1, y1]] = d3.geoBounds(plusGrand(f)); if (x1 < x0) x1 += 360;
  const dx = Math.min(x1 - x0 + 2, 25), dy = Math.min(y1 - y0 + 2, 25);
  const dans = c => { let x = c[0]; if (x < x0 - dx) x += 360; return x >= x0 - dx && x <= x1 + dx && c[1] >= y0 - dy && c[1] <= y1 + dy; };
  const M = morceaux(f);
  return (f._grp = { dans, prin: M.filter(m => dans(m._c)).map(m => m.coordinates), loin: M.filter(m => !dans(m._c)) });
}
// place fixe du drapeau (demande de l'utilisateur, d'après ses exemples) : le drapeau couvre tout le cadre du territoire
// (d'ouest en est et du nord au sud, dans une projection azimutale équidistante centrée sur lui, nord en haut) ; pour ne
// pas trop l'étirer (demande de l'utilisateur : le cercle du Groenland devenait ovale, Canada et États-Unis très étirés),
// le drapeau n'est étiré que d'une part de l'écart de proportions (racine cubique par défaut), et le reste :
//  - « rogner » (par défaut) : le drapeau est agrandi jusqu'à couvrir le territoire et rogné par la frontière ; en largeur,
//    deux fois plus du côté opposé au mât, où l'emblème est souvent (cercle du Groenland, canton des États-Unis…) ;
//  - « prolonger » (par défaut pour un drapeau symétrique de gauche à droite) : le drapeau tient dans le territoire, au
//    milieu, et ses couleurs du bord sont prolongées jusqu'au bout (demande de l'utilisateur : tout le rouge du Canada, et
//    le blanc du milieu prolongé en haut et en bas, sans quoi il avait l'air d'un carré) ;
// réglages propres à un drapeau dans monde/drapeaux-reglages.json (REGLAGES) : mode, k (part de l'étirement, 0 = aucun,
// 1 = tout), ax et ay (où va l'écart : 0 = drapeau collé à gauche ou en haut, 1 = à droite ou en bas), echelle
// (agrandit le drapeau autour de cette place) ; les points de la grille sont des points du globe, projetés à chaque
// image : le drapeau reste fixé sur son territoire quand on tourne ou zoome
function placer(polys, F = 1.5, o = {}) {
  let [[x0, y0], [x1, y1]] = d3.geoBounds({ type: "MultiPolygon", coordinates: polys }); if (x1 < x0) x1 += 360;
  const lc = (x0 + x1) / 2, pc = (y0 + y1) / 2;
  const az = d3.geoAzimuthalEquidistant().rotate([-lc, -pc]).scale(1).translate([0, 0]).clipAngle(null).precision(0);
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const c of polys) for (const r of c) for (const g of r) { const [x, y] = az(g); if (x < X0) X0 = x; if (x > X1) X1 = x; if (-y < Y0) Y0 = -y; if (-y > Y1) Y1 = -y; }
  const w = Math.max(X1 - X0, 1e-6), h = Math.max(Y1 - Y0, 1e-6), A = w / h;
  const mode = o.mode || (o.sym ? "prolonger" : "rogner"), k = o.k ?? 1 / 3, ax = o.ax ?? (o.sym ? 0.5 : 1 / 3), ay = o.ay ?? 0.5;
  const Fd = F * Math.pow(A / F, k);   // proportions du drapeau affiché
  let [fw, fh] = (mode === "prolonger") === (Fd > A) ? [w, w / Fd] : [h * Fd, h];
  fw *= o.echelle ?? 1; fh *= o.echelle ?? 1;
  // (au plus 5 radians de large : au-delà, la projection azimutale replie le cadre)
  const red = Math.min(1, 5 / Math.max(fw, fh)); fw *= red; fh *= red;
  // drapeau : bord gauche L, bord haut T (Y croît vers le nord) ; cadre = drapeau et territoire réunis
  const L = X0 + (w - fw) * ax, T = Y1 - (h - fh) * ay;
  const CX0 = Math.min(X0, L), CX1 = Math.max(X1, L + fw), CY1 = Math.max(Y1, T), CY0 = Math.min(Y0, T - fh);
  const CW = CX1 - CX0, CH = CY1 - CY0;
  const f = [fw / CW, fh / CH, (L - CX0) / CW, (CY1 - T) / CH].map(v => Math.round(v * 1000) / 1000);
  // grille fixe de points du cadre ramenés sur le globe (ligne 0 = haut), une case par 7° environ (1 × 1 à 16 × 12) :
  // la même au repos, en mouvement et à tout zoom (une grille qui changeait faisait sauter le drapeau)
  const deg = 180 / Math.PI, gx = Math.max(1, Math.min(16, Math.ceil(CW * deg / 7))), gy = Math.max(1, Math.min(12, Math.ceil(CH * deg / 7)));
  const geo = (x, y) => az.invert([x, -y]), grille = [];
  for (let j = 0; j <= gy; j++) { const l = []; for (let i = 0; i <= gx; i++) l.push(geo(CX0 + CW * i / gx, CY1 - CH * j / gy)); grille.push(l); }
  return { grille, f };
}
// réglages du drapeau d'un territoire (clé : code ISO du pays, ou de la subdivision)
let REGLAGES = {};
const cleDrapeau = f => f.properties.code || f.properties.a2;
const reglage = (f, d) => ({ sym: symetrique(d), ...(REGLAGES[cleDrapeau(f)] || {}) });
// couleur principale du drapeau (la plus fréquente) : fond du reste du territoire
function couleurPrincipale(d) {
  if (d.couleur) return d.couleur;
  const t = trame(d, 64, 40), px = t.getContext("2d").getImageData(0, 0, t.width, t.height).data, n = new Map();
  for (let i = 0; i < px.length; i += 16) { if (px[i + 3] < 200) continue; const q = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4); n.set(q, (n.get(q) || 0) + 1); }
  let q = 0, m = -1; for (const [c, v] of n) if (v > m) { m = v; q = c; }
  return (d.couleur = `rgb(${(q >> 8 & 15) * 17},${(q >> 4 & 15) * 17},${(q & 15) * 17})`);
}
const dansCadre = ([[x0, y0], [x1, y1]], [x, y]) => y >= y0 - 0.01 && y <= y1 + 0.01 && (x0 <= x1 ? x >= x0 - 0.01 && x <= x1 + 0.01 : x >= x0 || x <= x1);
let budget = 0, enAttente = false;   // places calculées par image (les autres à l'image suivante, sans à-coup)
function peindreMorceaux(L, d, place) {
  ctx.beginPath(); for (const m of L) chemin(m);
  ctx.fillStyle = couleurPrincipale(d); ctx.fill();
  const P = place(); if (!P) { enAttente = true; return; }
  // drapeau fixe dans son territoire (demande de l'utilisateur) : plié avec le globe, par une grille de triangles dont
  // chaque sommet est un point du globe projeté (une image plate attachée par ses seuls coins glissait sur un grand pays) ;
  // les cases dont un coin est derrière le globe, ou qui sont hors de l'écran, sont sautées
  const G = P.grille, nx = G[0].length - 1, ny = G.length - 1, vu = g => d3.geoDistance(g, centre) < Math.PI / 2 - 0.005;
  const a = proj(G[0][0]), b = proj(G[0][nx]), c = proj(G[ny][0]);
  const larg = Math.hypot(b[0] - a[0], b[1] - a[1]), haut = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const t = trame(d, larg, haut, P.f), cleT = t.width + "x" + t.height + "@" + P.f;
  const mo = d.motifs?.[cleT] || ((d.motifs ||= {})[cleT] = ctx.createPattern(t, "no-repeat"));
  const pr = G.map(l => l.map(g => vu(g) ? proj(g) : null));
  const dehors = (...q) => q.every(p => p[0] < 0) || q.every(p => p[0] > W) || q.every(p => p[1] < 0) || q.every(p => p[1] > H);
  ctx.save(); ctx.clip();
  ctx.imageSmoothingQuality = "high"; ctx.fillStyle = mo;
  // triangle de sommets écran p0, p1, p2 (image u0,v0 · u1,v0 · u0,v1, ou leur symétrique) : transformation exacte, triangle
  // grossi de 1 px pour qu'aucune couture ne se voie
  const tri = (p0, p1, p2, du, dv, u0, v0) => {
    const m = new DOMMatrix([(p1[0] - p0[0]) / du, (p1[1] - p0[1]) / du, (p2[0] - p0[0]) / dv, (p2[1] - p0[1]) / dv, 0, 0]);
    m.e = p0[0] - m.a * u0 - m.c * v0; m.f = p0[1] - m.b * u0 - m.d * v0;
    mo.setTransform(m);
    const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, g = q => { const dx = q[0] - cx, dy = q[1] - cy, n = Math.hypot(dx, dy) || 1; return [q[0] + dx / n, q[1] + dy / n]; };
    const [q0, q1, q2] = [g(p0), g(p1), g(p2)];
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.closePath(); ctx.fill();
  };
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const A = pr[y][x], B = pr[y][x + 1], Cc = pr[y + 1][x], D = pr[y + 1][x + 1]; if (!A || !B || !Cc || !D || dehors(A, B, Cc, D)) continue;
    const u0 = x / nx * t.width, u1 = (x + 1) / nx * t.width, v0 = y / ny * t.height, v1 = (y + 1) / ny * t.height;
    tri(A, B, Cc, u1 - u0, v1 - v0, u0, v0);                 // haut gauche
    tri(D, Cc, B, u0 - u1, v0 - v1, u1, v1);                 // bas droite (même formule, axes inversés)
  }
  ctx.restore();
}
// vrai si le drapeau est dessiné (image chargée)
function peindreDrapeau(f, src) {
  const d = imageDrapeau(src); if (!d) return false;
  const G = groupeDe(f), L = morceaux(lod(f)).filter(enVue);
  const prin = L.filter(m => G.dans(m._c));
  if (prin.length) peindreMorceaux(prin, d, () => G.place || (budget-- > 0 ? (G.place = placer(G.prin, rapport(d), reglage(f, d))) : null));
  for (const m of L) {
    if (G.dans(m._c)) continue;
    const o = G.loin.find(x => dansCadre(x._b, m._c));
    peindreMorceaux([m], d, () => !o ? null : o._place || (budget-- > 0 ? (o._place = placer([o.coordinates], rapport(d), reglage(f, d))) : null));
  }
  return true;
}

/* ---------- dessin ---------- */
let prevu = false, pret = false;   // (pas de dessin pendant la préparation, sous le chargement : il la ralentissait)
const dessiner = () => { if (prevu || !pret) return; prevu = true; requestAnimationFrame(() => { prevu = false; peindre(); }); };
const visible = p => d3.geoDistance(p, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.01;
let pointsVilles = [];   // villes dessinées (pour le clic)
// remplit ou trace des formes par paquets de polygones : un seul chemin géant rend le canvas très lent (closePath)
// morceaux (polygones) d'une forme, chacun avec son cercle englobant : on saute ceux qui sont hors de l'écran
const morceaux = g => { g = g.geometry || g;
  return g._m || (g._m = (g.type === "MultiPolygon" ? g.coordinates.map(c => ({ type: "Polygon", coordinates: c }))
    : g.type === "MultiLineString" ? g.coordinates.map(c => ({ type: "LineString", coordinates: c })) : [g]).map(cercle)); };
function remplir(formes, couleur, trait = false) {
  ctx[trait ? "strokeStyle" : "fillStyle"] = couleur; ctx.beginPath(); let n = 0;
  const finir = () => trait ? ctx.stroke() : ctx.fill();
  for (const f of formes) for (const m of morceaux(f)) { if (!enVue(m)) continue; chemin(m); if (++n % 40 === 0) { finir(); ctx.beginPath(); } }
  finir();
}
function peindre() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  proj.rotate(rot).scale(R * k).translate([W / 2, H / 2])
    .clipExtent(R * k > Math.min(W, H) / 2 ? [[-2, -2], [W + 2, H + 2]] : null);   // rien hors de l'écran (quand le globe déborde du cadre)
  ctx.beginPath(); chemin({ type: "Sphere" }); ctx.fillStyle = C.ocean; ctx.fill();
  ctx.beginPath(); chemin(grille); ctx.strokeStyle = C.grille; ctx.lineWidth = 1; ctx.stroke();
  // contours au niveau de détail du zoom : côtes réalistes de près comme de loin, même en mouvement (demande de l'utilisateur)
  choisirPas(); majVue();
  budget = 15; enAttente = false;
  const paysSel = sel?.pays, survole = survol && !survol.sous ? survol.pays : null;
  // fond uni (en mode Drapeaux au niveau Pays : seulement sous les pays dont le drapeau n'est pas encore chargé)
  const drapPays = RUB.drapeaux && !modeEtats(), aDrapeau = f => drapPays && f.properties.a2 && DRAP.get(drapeauPays(f.properties.a2))?.ok;
  remplir(PAYS.filter(f => enVue(f) && !aDrapeau(f) && (RUB.drapeaux || (f._a2 !== paysSel?._a2 && f._a2 !== survole?._a2))).map(f => lod(f)), C.terre);
  if (!RUB.drapeaux && survole && survole !== paysSel) { ctx.beginPath(); chemin(lod(survole)); ctx.fillStyle = C["terre-survol"]; ctx.fill(); }
  const paysDessin = lod(paysSel);
  // subdivisions du pays choisi : elles remplissent aussi le pays (même carte que leurs frontières : la côte correspond),
  // par-dessus le contour du pays (qui bouche les éventuels interstices) ; la choisie (ou survolée) en couleur
  const S = paysSel && charges[paysSel.properties.a2], fondPays = sel?.sous ? C["focus-pays"] : C.focus;   // sans rubrique : territoire choisi en blanc, plus neutre (demande de l'utilisateur)
  if (RUB.drapeaux) {
    // rubrique Drapeaux : chaque pays, ou chaque État et province (pays qui en ont), rempli de son drapeau
    if (!modeEtats()) { for (const f of PAYS) if (f.properties.a2 && enVue(f)) peindreDrapeau(f, drapeauPays(f.properties.a2)); }
    else for (const [a2, X] of Object.entries(charges)) if (X) for (const s of X.features) peindreDrapeau(s, drapeauSous(a2, s));
  } else {
    if (paysSel) remplir([paysDessin], fondPays);
    if (S) remplir(S.features.map(f => lod(f)), fondPays);
    if (S) for (const s of S.features) if (s === sel.sous || s === survol?.sous) {
      ctx.globalAlpha = s === sel.sous ? 1 : 0.6; remplir([lod(s)], s === sel.sous ? C.focus : C["terre-survol"]); ctx.globalAlpha = 1; }
  }
  // lacs et plans d'eau : couleur de l'eau, par-dessus les terres (tous, même en mouvement)
  remplir(LACS.features.filter(enVue).map(f => lod(f)), C.ocean);
  // frontières : plus marquées entre deux drapeaux
  ctx.lineWidth = RUB.drapeaux ? 1.1 : 0.6; remplir([lod(FRONTIERES)], RUB.drapeaux ? "rgba(8,12,18,.75)" : C.frontiere, true);
  if (RUB.drapeaux) {
    // frontières des États et provinces, puis le territoire choisi (et survolé) en contour, par-dessus les drapeaux
    if (modeEtats()) for (const X of Object.values(charges)) if (X) { ctx.lineWidth = 0.7; remplir([lod(X.mesh)], C.frontiere, true); }
    // (au niveau États et provinces, seule une province choisie est soulignée, pas tout le pays)
    const ch = sel?.sous || (modeEtats() && charges[paysSel?.properties.a2] ? null : paysSel), sv = survol && (survol.sous || survol.pays);
    if (sv && sv !== ch) { ctx.lineWidth = 1.5; remplir([lod(sv)], C["texte-globe"], true); }
    // (le halo sombre seulement à l'arrêt : sur un grand pays aux milliers d'îles, chaque trait coûte cher)
    if (ch) { if (!rapide) { ctx.lineWidth = 3; remplir([lod(ch)], C.frontiere, true); } ctx.lineWidth = 1.6; remplir([lod(ch)], C.choisi, true); }
  } else {
    if (S) { ctx.lineWidth = 0.8; remplir([lod(S.mesh)], C["focus-trait"], true); }
    if (paysSel && !S) { ctx.lineWidth = 1.4; remplir([paysDessin], C["focus-trait"], true); }
  }
  // villes de la subdivision choisie : un point par ville (carré pour une capitale), partout pareil (demande de l'utilisateur)
  pointsVilles = [];
  if (S && sel.sous) {
    ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.textBaseline = "middle";
    const liste = villesDe(paysSel.properties.a2, sel.sous.properties.code).filter(v => visible([v.lon, v.lat]));
    for (const v of liste) {
      const [x, y] = proj([v.lon, v.lat]), choisie = v === sel.ville, r = choisie ? 6.5 : v === survol?.ville ? 5.5 : 4.5;
      pointsVilles.push({ v, x, y });
      ctx.beginPath(); v.cap ? ctx.rect(x - r, y - r, 2 * r, 2 * r) : ctx.arc(x, y, r, 0, 2 * Math.PI);
      // (sans rubrique, sur la province blanche : points sombres, ville choisie à la couleur d'accent)
      ctx.fillStyle = RUB.drapeaux ? (choisie ? C.choisi : C.ville) : (choisie ? C.accent : C["ville-focus"]); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = RUB.drapeaux ? C["ville-trait"] : C["ville-focus-trait"]; ctx.stroke();
    }
    // noms sans chevauchement (demande de l'utilisateur) : ville choisie, capitales, puis par population ; pour chacune,
    // à droite, à gauche, dessus, dessous puis en diagonale, la première place libre (ni sur un nom, ni sur un point) ;
    // sinon pas de nom (la bulle au survol et la liste le donnent)
    const touche = (a, b) => !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3]);
    const points = pointsVilles.map(({ v, x, y }) => ({ v, b: [x - 7, y - 7, x + 7, y + 7] }));
    const pris = [];
    const ordre = [...pointsVilles].sort((a, b) => (b.v === sel.ville) - (a.v === sel.ville) || !!b.v.cap - !!a.v.cap || (b.v.pop || 0) - (a.v.pop || 0));
    for (const { v, x, y } of ordre) {
      const w = ctx.measureText(v.nom).width, h = 14, e = 9;
      const places = [[x + e, y, "left"], [x - e, y, "right"], [x, y - e - 2, "center"], [x, y + e + 2, "center"],
                      [x + e - 2, y - e, "left"], [x + e - 2, y + e, "left"], [x - e + 2, y - e, "right"], [x - e + 2, y + e, "right"]];
      for (const [tx, ty, al] of places) {
        const x0 = al === "left" ? tx : al === "right" ? tx - w : tx - w / 2, b = [x0 - 2, ty - h / 2, x0 + w + 2, ty + h / 2];
        if (b[0] < 0 || b[2] > W || b[1] < 0 || b[3] > H) continue;
        if (pris.some(p => touche(b, p)) || points.some(p => p.v !== v && touche(b, p.b))) continue;
        pris.push(b);
        ctx.textAlign = al; ctx.lineWidth = 3; ctx.strokeStyle = C.ocean; ctx.strokeText(v.nom, tx, ty);
        ctx.fillStyle = C["texte-globe"]; ctx.fillText(v.nom, tx, ty);
        break;
      }
    }
    ctx.textAlign = "left";
  }
  // relief (rubrique Drapeaux) : le globe s'assombrit doucement vers ses bords, lumière légère en haut à gauche
  if (RUB.drapeaux) {
    const rr = R * k, cx = W / 2, cy = H / 2;
    const o = ctx.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr);
    o.addColorStop(0, "rgba(0,0,0,0)"); o.addColorStop(1, "rgba(0,0,0,.32)");
    const l = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, 0, cx - rr * 0.35, cy - rr * 0.4, rr * 0.9);
    l.addColorStop(0, "rgba(255,255,255,.10)"); l.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath(); chemin({ type: "Sphere" }); ctx.fillStyle = o; ctx.fill(); ctx.fillStyle = l; ctx.fill();
  }
  ctx.beginPath(); chemin({ type: "Sphere" }); ctx.strokeStyle = C.contour; ctx.lineWidth = 1.5; ctx.stroke();
  if (enAttente) dessiner();   // places de drapeaux pas encore calculées : à l'image suivante
}
function taille() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = Math.round(canvas.clientWidth); H = Math.round(canvas.clientHeight) || W;
  R = Math.min(W, H) / 2 - 6; canvas.width = W * dpr; canvas.height = H * dpr;
  if (pret) peindre(); else introTaille();   // (pendant la préparation, sous l'esquisse : pas de dessin)
}

/* ---------- repérage d'un point ---------- */
function sousLe([x, y]) {
  let proche = null, dmin = 12;
  for (const p of pointsVilles) { const d = Math.hypot(p.x - x, p.y - y); if (d < dmin) { dmin = d; proche = p.v; } }
  if (proche) return { pays: sel.pays, sous: sel.sous, ville: proche };
  const p = proj.invert([x, y]); if (!p || !visible(p)) return Math.hypot(x - W / 2, y - H / 2) < R * k ? { ocean: true } : null;
  if (dansLac(p)) return { ocean: true };
  const pays = PAYS.find(f => dansBoiteGeo(f._b, p) && d3.geoContains(f, p)); if (!pays) return { ocean: true };
  const S = (pays === sel?.pays || modeEtats()) && charges[pays.properties.a2];
  return { pays, sous: S ? S.features.find(s => d3.geoContains(s, p)) || null : null, ville: null };
}

/* ---------- déplacement animé vers un lieu ---------- */
// plus grand morceau (France sans l'outre-mer, États-Unis sans l'Alaska) : son centre
function plusGrand(f) {
  if (f.geometry.type !== "MultiPolygon") return f;
  let best, aire = -1;
  for (const c of f.geometry.coordinates) { const g = { type: "Polygon", coordinates: c }, a = d3.geoArea(g); if (a > aire) { aire = a; best = g; } }
  return best;
}
let anim = null;
const arreter = () => { if (anim) { anim.stop(); anim = null; } };
// pas de zoom automatique (demande de l'utilisateur) : le globe tourne seulement pour amener le lieu au centre
function allerA(cible) {
  const c = cible.lon != null ? [cible.lon, cible.lat] : d3.geoCentroid(plusGrand(cible)), k2 = k;
  const r0 = rot.slice(), k0 = k, r2 = [-c[0], -c[1], 0];
  r2[0] = r0[0] + ((((r2[0] - r0[0]) % 360) + 540) % 360 - 180);   // le plus court chemin en longitude
  arreter();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { rot = r2; k = k2; return dessiner(); }
  const ir = d3.interpolate(r0, r2), lk = d3.interpolate(Math.log(k0), Math.log(k2));
  anim = d3.timer(t => { const u = d3.easeCubicInOut(Math.min(1, t / 1000)); rot = ir(u); k = Math.exp(lk(u)); bouger(); peindre(); if (u >= 1) arreter(); });
}

/* ---------- choix ---------- */
async function choisir(pays, sous = null, ville = null, { bouger = true } = {}) {
  if (!bouger) arreter();
  const a2 = pays.properties.a2;
  const S = await charger(a2);
  if (ville && S && !sous) sous = S.features.find(s => s.properties.code === ville.prov) || null;
  // mémoire des niveaux du dessous : on peut remonter puis redescendre au même endroit
  if (memo.pays !== pays) memo = { pays };
  if (sous) { if (memo.sous !== sous) memo.ville = null; memo.sous = sous; }
  if (ville) memo.ville = ville;
  sel = { pays, sous, ville }; $("bulle").hidden = true;
  history.replaceState(null, "", "#" + (ville ? ville.q : sous ? sous.properties.code : a2 || encodeURIComponent(pays.properties.en)));
  if (bouger) allerA(ville || sous || pays);
  fiche(); dessiner();
}
function monter() {
  if (!sel) return;
  // remonter ne déplace pas le globe
  if (sel.ville) choisir(sel.pays, sel.sous, null, { bouger: false });
  else if (sel.sous) choisir(sel.pays, null, null, { bouger: false });
}

// date d'adoption, proportions et début de l'article de Wikipédia sur le drapeau (fiches.py)
function infos(cle) {
  const f = FICHES[cle]; if (!f) return "";
  const lignes = [f.adopte && `<div><dt>Adopté</dt><dd>${ESC(f.adopte)}</dd></div>`, f.ratio && `<div><dt>Proportions</dt><dd>${ESC(f.ratio)}</dd></div>`].filter(Boolean).join("");
  return `${lignes ? `<dl class="infos">${lignes}</dl>` : ""}${f.resume ? `<p class="resume">${ESC(f.resume)} <a href="${ESC(f.wiki)}" target="_blank" rel="noopener">Wikipédia</a><span class="lic"> (CC BY-SA)</span></p>` : ""}`;
}
function imageVille(v) {
  const d = v.drapeau, alt = `Drapeau : ${ESC(v.nom)}`;
  if (!d) return { img: `<p>Aucun drapeau trouvé dans Wikidata ni dans l'article Wikipédia de la ville.</p>`, credit: "" };
  const ancien = d.ancien ? `<br>Version de ${ESC(d.ancien.replace("-", " à "))} : la version actuelle n'est pas encore dans les sources libres.` : "";
  if (d.libre) return { img: `<img src="${ESC(d.src)}" alt="${alt}" referrerpolicy="no-referrer">`,
    credit: `<a href="${ESC(d.page)}" target="_blank" rel="noopener">Wikimedia Commons</a> · ${ESC(d.licence)}${d.auteur ? " · " + ESC(d.auteur) : ""}${ancien}` };
  return { img: `<a href="${ESC(d.page)}" target="_blank" rel="noopener" title="Voir le fichier sur Wikipédia"><img src="${ESC(d.src)}" alt="${alt}" referrerpolicy="no-referrer"></a>`,
    credit: `Drapeau non libre (droit d'auteur de la ville) : vignette affichée depuis Wikipédia, <a href="${ESC(d.page)}" target="_blank" rel="noopener">voir le fichier</a>` };
}
// fiche du pays en mode normal (sans rubrique, demande de l'utilisateur) : 20 statistiques importantes, drapeau au-dessus
// (monde/outils/stats.py → monde/stats.json : Banque mondiale, dernière valeur connue avec son année ; langues et monnaie
// en codes ISO d'Unicode CLDR, nommées en français par le navigateur ; capitale de Wikidata)
const LANGUE = new Intl.DisplayNames(["fr"], { type: "language" }), MONNAIE = new Intl.DisplayNames(["fr"], { type: "currency" });
const nombre = (v, d = 1) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const argent = v => v >= 1e12 ? `${nombre(v / 1e12, 2)} billion${v >= 2e12 ? "s" : ""} $ US` : v >= 1e9 ? `${nombre(v / 1e9, 1)} milliard${v >= 2e9 ? "s" : ""} $ US`
  : v >= 1e6 ? `${nombre(v / 1e6, 0)} millions $ US` : `${NB.format(Math.round(v))} $ US`;
const STATS_FICHE = [
  ["Identité", [["cap", "Capitale", x => x.join(" · ")], ["langues", "Langues officielles", x => x.map(l => { try { return LANGUE.of(l); } catch { return l; } }).join(", ")],
    ["mon", "Monnaie", x => x.map(m => { try { return MONNAIE.of(m); } catch { return m; } }).join(", ")]]],
  ["Population", [["pop", "Population", v => NB.format(v)], ["sup", "Superficie", v => `${v < 10 ? nombre(v) : NB.format(Math.round(v))} km²`],
    ["dens", "Densité", v => `${nombre(v, v < 1 ? 2 : v < 10 ? 1 : 0)} hab./km²`], ["urb", "Population urbaine", v => `${nombre(v)} %`],
    ["vie", "Espérance de vie", v => `${nombre(v)} ans`], ["fec", "Fécondité", v => `${nombre(v, 2)} enfant${v >= 2 ? "s" : ""} par femme`],
    ["mort", "Mortalité infantile", v => `${nombre(v)} ‰`]]],
  ["Économie", [["pib", "PIB", argent], ["pibh", "PIB par habitant", v => `${NB.format(Math.round(v))} $ US`],
    ["croiss", "Croissance du PIB", v => `${v > 0 ? "+" : ""}${nombre(v)} %`], ["infl", "Inflation", v => `${nombre(v)} %`],
    ["chom", "Chômage", v => `${nombre(v)} %`], ["expo", "Exportations", v => `${nombre(v, 0)} % du PIB`]]],
  ["Société et environnement", [["net", "Internautes", v => `${nombre(v, 0)} % de la population`], ["sante", "Dépenses de santé", v => `${nombre(v)} % du PIB`],
    ["co2", "CO₂ par habitant", v => `${nombre(v)} t`], ["foret", "Forêts", v => `${nombre(v, v < 1 ? 2 : 0)} % du territoire`]]],
];
// pays au panneau enrichi (demande de l'utilisateur : « dynamiser » le panneau, le Canada pour commencer) : couleur du
// pays, photo libre de droits (copiée dans monde/images, Wikimedia limitant le débit) et jauges comparées au monde
const DECOR = {
  CA: { couleur: "#d52b1e", photo: { src: "monde/images/ca.jpg", legende: "Lac Moraine, parc national Banff (Alberta)",
    auteur: "Gorgo", licence: "domaine public", page: "https://commons.wikimedia.org/wiki/File:Moraine_Lake_17092005.jpg" } },
};
// jauge d'une statistique : valeur du pays (couleur du pays) et repère du monde ; pourcentages sur 0-100, totaux en part
// du monde, le reste sur une échelle qui contient les deux valeurs
const POURCENT = new Set(["urb", "net", "foret"]), PART = { pop: "de la population mondiale", pib: "du PIB mondial" };
function jauge(cle, v, f) {
  const M = STATS.monde || {};
  if (PART[cle]) { const w = M[cle]?.[0]; return w ? `<span class="j-txt">${nombre(100 * v / w, v / w < 0.01 ? 2 : 1)} % ${PART[cle]}</span>` : ""; }
  let w = M[cle]?.[0];
  if (cle === "dens") { const P = Object.entries(STATS.pays || {}).filter(([c, p]) => c !== "AQ" && p.sup && p.pop); w = P.reduce((a, [, p]) => a + p.pop[0], 0) / P.reduce((a, [, p]) => a + p.sup, 0); }
  if (w == null) return "";
  const bas = Math.min(0, v, w), haut = POURCENT.has(cle) ? 100 : Math.max(v, w) * 1.15, t = x => 100 * (x - bas) / (haut - bas || 1);
  return `<span class="jauge" aria-hidden="true"><i style="left:${t(Math.min(0, v)).toFixed(1)}%;width:${Math.abs(t(v) - t(0)).toFixed(1)}%"></i><b style="left:${t(w).toFixed(1)}%"></b></span>
    <span class="j-txt">Monde : ${ESC(f(w))}</span>`;
}
function ficheStats(a2) {
  const x = STATS.pays?.[a2] || {}, dec = DECOR[a2];
  // territoire absent de la Banque mondiale (Taïwan…) : seulement ce qui est connu, et une note plutôt que 17 « non disponible »
  const bm = ["pop", "pib", "vie"].some(c => x[c]);
  const val = (cle, f) => { const v = x[cle]; if (v == null || (Array.isArray(v) && !v.length)) return `<dd class="nd">non disponible</dd>`;
    const ann = Array.isArray(v) && typeof v[0] === "number" ? v[1] : null, brut = ann ? v[0] : v;
    return `<dd>${ESC(f(brut))}${ann ? ` <small>${ann}</small>` : ""}${dec && typeof brut === "number" ? jauge(cle, brut, f) : ""}</dd>`; };
  const groupes = STATS_FICHE.map(([t, L]) => [t, bm ? L : L.filter(([c]) => x[c] != null)]).filter(([, L]) => L.length);
  return `<div class="stats${dec ? " deco" : ""}"${dec ? ` style="--pays:${dec.couleur}"` : ""}>${groupes.map(([titre, L]) => `<h3>${titre}</h3><dl>${L.map(([cle, lib, f]) => `<div><dt>${lib}</dt>${val(cle, f)}</div>`).join("")}</dl>`).join("")}
    ${bm ? "" : `<p class="vide">La Banque mondiale ne publie pas de statistiques pour ce territoire.</p>`}
    <p class="credit">Banque mondiale, Indicateurs du développement dans le monde (CC BY 4.0) : dernière valeur connue, année en petit ;
    langues et monnaie : Unicode CLDR ; capitale et superficie : Wikidata (CC0) ; densité : population / superficie${STATS.meta?.genere ? ` · compilé le ${new Date(STATS.meta.genere + "T12:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}` : ""}.</p></div>`;
}
function capitale(a2, v) {
  if (!v.cap) return "";
  return v.cap === a2 ? SOUS[a2].federal : `Capitale ${SOUS[a2].noms[v.cap]?.[1] === "Territoire" ? "territoriale" : "provinciale"}`;
}
function fiche() {
  const { pays, sous, ville } = sel, a2 = pays.properties.a2, np = nomPays(pays), S = charges[a2], sd = SOUS[a2];
  // sélecteur de niveau : Pays · Province · Ville (les niveaux mémorisés restent cliquables)
  const ms = memo.sous, mv = memo.ville, niv = ville ? 2 : sous ? 1 : 0;
  const bout = (i, lab, nom, ok) => `<button type="button" data-niv="${i}" aria-pressed="${niv === i}"${ok ? "" : " disabled"}><small>${lab}</small><span>${ESC(nom)}</span></button>`;
  $("niveaux").innerHTML = bout(0, "Pays", np, true)
    + (sd ? bout(1, sd.niveau, ms ? nomSous(a2, ms) : "—", !!ms) + bout(2, "Ville", mv ? mv.nom : "—", !!mv) : "");
  $("niveaux").querySelectorAll("[data-niv]").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.niv; if (i === 0) choisir(pays); else if (i === 1) choisir(pays, ms); else choisir(pays, ms, mv); }));

  let nom, genre, img, credit = "", code = "", extra = "", cle;
  if (ville) {
    nom = ville.nom; genre = ["Ville", capitale(a2, ville)].filter(Boolean).join(" · ");
    ({ img, credit } = imageVille(ville)); cle = ville.q;
    extra = `<div class="code">${[ville.pop && `Population (recensement de 2021) : ${NB.format(ville.pop)}`].filter(Boolean).join("<br>")}</div>`;
  } else if (sous) {
    nom = nomSous(a2, sous); genre = sd.noms[sous.properties.code]?.[1] || "Subdivision";
    img = `<img src="${drapeauSous(a2, sous)}" alt="Drapeau : ${ESC(nom)}">`; code = sous.properties.code; cle = code;
  } else {
    nom = np; genre = "Pays ou territoire"; cle = a2;
    img = a2 ? `<img src="${drapeauPays(a2)}" alt="Drapeau : ${ESC(nom)}">` : `<p>Pas de drapeau dans cette collection : territoire sans code ISO 3166 (statut non reconnu ou contesté).</p>`;
    code = a2 || "";
  }
  // mode normal, niveau Pays : fiche de statistiques ; rubrique Drapeaux (ou province, ville) : fiche du drapeau
  const stats = !RUB.drapeaux && !sous && !ville && a2, dec = stats && DECOR[a2];
  // (panneau enrichi : photo du pays avec le drapeau en médaillon, à la place du cadre du drapeau)
  if (dec) { const ph = dec.photo; img = `<figure class="hero" style="--pays:${dec.couleur}"><img src="${ph.src}" alt="${ESC(ph.legende)}"><span class="hero-drapeau">${img}</span></figure>`;
    credit = `${ESC(ph.legende)} · photo : ${ESC(ph.auteur)}, ${ESC(ph.licence)} (<a href="${ph.page}" target="_blank" rel="noopener">Wikimedia Commons</a>)`; }
  $("fiche").innerHTML = `<div class="genre">${ESC(genre)}</div><h2>${ESC(nom)}</h2>
    ${dec ? img : `<div class="drapeau${stats ? " petit" : ""}">${img}</div>`}${credit ? `<p class="credit">${credit}</p>` : ""}
    ${code ? `<div class="code">ISO 3166 : ${ESC(code)}</div>` : ""}${extra}${stats ? ficheStats(a2) : infos(cle)}`;

  // listes : villes de la subdivision, puis subdivisions du pays
  let html = "";
  if (!sd) html = `<p class="vide">Les drapeaux des subdivisions de ce pays ne sont pas encore ajoutés.</p>`;
  else if (S) {
    if (sous) {
      const vs = villesDe(a2, sous.properties.code);
      html += `<h3>Villes · ${vs.length}</h3>` + (vs.length ? `<ul>${vs.map(v => `<li><button type="button" data-v="${v.q}"${v === ville ? ' aria-current="true"' : ""}>
        ${v.drapeau ? `<img src="${ESC(v.drapeau.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i class="sans" aria-hidden="true"></i>`}<span>${ESC(v.nom)}</span></button></li>`).join("")}</ul>`
        : `<p class="vide">Aucune ville connue.</p>`)
        + `<p class="note">Les 5 villes les plus peuplées au recensement de 2021, et la capitale (carré sur le globe).</p>`;
    }
    html += `<h3>${ESC(sd.titre)} · ${S.features.length}</h3><ul>${S.features.map((s, i) => `<li><button type="button" data-i="${i}"${s === sous ? ' aria-current="true"' : ""}>
      <img src="${drapeauSous(a2, s)}" alt="" loading="lazy"><span>${ESC(nomSous(a2, s))}</span></button></li>`).join("")}</ul>`;
  }
  $("sous").innerHTML = html;
  $("sous").querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => choisir(pays, S.features[+b.dataset.i])));
  $("sous").querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => choisir(pays, sous, S.villes.find(v => v.q === b.dataset.v))));
}

/* ---------- interactions ---------- */
const pointeurs = new Map(); let depart = null, bouge = false, pince = null;
const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId); pointeurs.set(e.pointerId, pos(e));
  arreter();
  if (pointeurs.size === 1) { depart = { p: pos(e), rot: rot.slice() }; bouge = false; }
  if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; pince = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; bouge = true; }
});
canvas.addEventListener("pointermove", e => {
  const p = pos(e);
  if (!pointeurs.has(e.pointerId)) { if (e.pointerType === "mouse" && !rapide) survoler(p); return; }
  pointeurs.set(e.pointerId, p);
  if (pince && pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; k = Math.max(1, Math.min(ZOOM_MAX, pince.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pince.d)); bouger(); return dessiner(); }
  if (!depart) return;
  const dx = p[0] - depart.p[0], dy = p[1] - depart.p[1];
  if (!bouge && Math.hypot(dx, dy) < 4) return;
  bouge = true; canvas.classList.add("tire"); $("bulle").hidden = true;
  const f = 180 / (Math.PI * R * k);   // degrés par pixel
  rot = [depart.rot[0] + dx * f, Math.max(-90, Math.min(90, depart.rot[1] - dy * f)), 0];
  bouger(); dessiner();
});
const fin = e => {
  const p = pointeurs.get(e.pointerId); pointeurs.delete(e.pointerId);
  if (pointeurs.size < 2) pince = null;
  if (pointeurs.size === 0) {
    canvas.classList.remove("tire");
    if (!bouge && p && e.type === "pointerup") {
      const t = sousLe(p);
      if (t?.ocean) monter();
      else if (t) choisir(t.pays, t.sous, t.ville, { bouger: false });
    }
    depart = null;
  }
};
canvas.addEventListener("pointerup", fin); canvas.addEventListener("pointercancel", fin);
canvas.addEventListener("pointerleave", () => { if (survol) { survol = null; $("bulle").hidden = true; dessiner(); } });
canvas.addEventListener("wheel", e => { e.preventDefault(); arreter(); k = Math.max(1, Math.min(ZOOM_MAX, k * Math.exp(-e.deltaY * 0.0015))); bouger(); dessiner(); }, { passive: false });
document.addEventListener("keydown", e => { if (e.key !== "Escape" || e.target.closest("input")) return;
  if (boite.classList.contains("plein")) return basculerPlein();   // plein écran de secours : Échap en sort
  monter(); });

/* ---------- plein écran : le globe prend tout l'écran ; « Info » montre le panneau par-dessus (ouvert d'office sur grand écran) ---------- */
const boite = canvas.closest(".globe"), panneau = document.querySelector(".panneau"), repere = document.createComment("place du panneau");
const ecran = () => document.fullscreenElement || document.webkitFullscreenElement;
const enPlein = () => ecran() === boite || boite.classList.contains("plein");
function info(ouvrir) {
  if (ouvrir && panneau.parentElement !== boite) { panneau.before(repere); boite.appendChild(panneau); panneau.classList.add("flottant"); }
  if (!ouvrir && panneau.parentElement === boite) { repere.replaceWith(panneau); panneau.classList.remove("flottant"); }
  $("info").setAttribute("aria-pressed", ouvrir);
}
let etaitPlein = false;
function etatPlein() {
  const on = enPlein();
  $("plein").textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran"; $("plein").setAttribute("aria-pressed", on);
  $("info").hidden = !on;
  if (on && !etaitPlein) info(innerWidth > 900);
  if (!on) info(false);
  etaitPlein = on;
  requestAnimationFrame(taille);
}
function basculerPlein() {
  if (ecran()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else if (boite.classList.contains("plein")) { boite.classList.remove("plein"); document.body.classList.remove("plein-actif"); etatPlein(); }
  else if (boite.requestFullscreen || boite.webkitRequestFullscreen) (boite.requestFullscreen || boite.webkitRequestFullscreen).call(boite);
  else { boite.classList.add("plein"); document.body.classList.add("plein-actif"); etatPlein(); }   // iPhone : pas de plein écran d'élément
}
$("plein").addEventListener("click", basculerPlein);
$("info").addEventListener("click", () => info($("info").getAttribute("aria-pressed") !== "true"));
document.addEventListener("fullscreenchange", etatPlein);
document.addEventListener("webkitfullscreenchange", etatPlein);
let survolPrevu = null;
function survoler(p) {
  if (survolPrevu) { survolPrevu = p; return; } survolPrevu = p;
  requestAnimationFrame(() => {
    const q = survolPrevu; survolPrevu = null;
    let t = sousLe(q); if (t?.ocean) t = null;
    const b = $("bulle"), change = t?.pays !== survol?.pays || t?.sous !== survol?.sous || t?.ville !== survol?.ville;
    survol = t;
    if (t) { b.textContent = t.ville ? t.ville.nom : t.sous ? nomSous(t.pays.properties.a2, t.sous) : nomPays(t.pays); b.style.left = q[0] + "px"; b.style.top = q[1] + "px"; b.hidden = false; }
    else b.hidden = true;
    canvas.style.cursor = t ? "pointer" : "";
    if (change) dessiner();
  });
}
const zoomer = f => { arreter(); k = Math.max(1, Math.min(ZOOM_MAX, k * f)); bouger(); dessiner(); };
$("zPlus").addEventListener("click", () => zoomer(1.6));
$("zMoins").addEventListener("click", () => zoomer(1 / 1.6));
$("zTout").addEventListener("click", () => { arreter(); k = 1; dessiner(); });

// recherche : pays, subdivisions et villes connues
async function remplirChoix() {
  const opts = PAYS.map(f => [nomPays(f), f, null, null]);
  for (const [a2, sd] of Object.entries(SOUS)) {
    const pays = PAYS.find(f => f.properties.a2 === a2); if (!pays) continue;
    for (const [code, [nom]] of Object.entries(sd.noms)) opts.push([`${nom} (${nomPays(pays)})`, pays, code, null]);
    const S = await charger(a2);
    for (const v of S.villes) opts.push([`${v.nom} (${nomCode(a2, v.prov)}, ${nomPays(pays)})`, pays, v.prov, v]);
  }
  opts.sort((a, b) => a[0].localeCompare(b[0], "fr"));
  $("choix").innerHTML = opts.map(o => `<option value="${ESC(o[0])}"></option>`).join("");
  const parNom = new Map(opts.map(o => [o[0].toLocaleLowerCase("fr"), o]));
  const aller = () => {
    const o = parNom.get($("cherche").value.trim().toLocaleLowerCase("fr")); if (!o) return;
    $("cherche").value = ""; $("cherche").blur();
    const S = charges[o[1].properties.a2];
    choisir(o[1], o[2] && S ? S.features.find(s => s.properties.code === o[2]) || null : null, o[3]);
  };
  $("cherche").addEventListener("change", aller);
  $("cherche").addEventListener("keydown", e => { if (e.key === "Enter") aller(); });
}

async function depuisAdresse(bouger) {
  // à l'arrivée (sans adresse) : le Groenland, globe tourné vers l'Atlantique (demande de l'utilisateur)
  const h = decodeURIComponent(location.hash.slice(1)) || "GL";
  if (!location.hash.slice(1)) bouger = false;
  if (/^Q\d+$/.test(h)) for (const a2 of Object.keys(SOUS)) {
    const S = await charger(a2), v = S?.villes.find(x => x.q === h);
    if (v) return choisir(PAYS.find(f => f.properties.a2 === a2), null, v, { bouger });
  }
  const a2 = h.slice(0, 2).toUpperCase(), sub = h.length > 3 ? h.toUpperCase() : null;
  const pays = PAYS.find(f => f.properties.a2 === a2) || PAYS.find(f => f.properties.en === h) || PAYS.find(f => f.properties.a2 === "GL");
  const S = await charger(pays.properties.a2);
  return choisir(pays, sub && S ? S.features.find(s => s.properties.code === sub) || null : null, null, { bouger });
}

/* ---------- rubriques ---------- */
function majRubriques() {
  $("rubDrapeaux").setAttribute("aria-pressed", RUB.drapeaux);
  $("affNiveau").hidden = !RUB.drapeaux;
  $("affNiveau").querySelectorAll("[data-aff]").forEach(b => b.setAttribute("aria-pressed", b.dataset.aff === RUB.aff));
  $("affNote").hidden = !modeEtats();
}
$("rubDrapeaux").addEventListener("click", () => { RUB.drapeaux = !RUB.drapeaux; garderRub(); majRubriques(); if (sel) fiche(); dessiner(); });
$("affNiveau").addEventListener("click", e => { const b = e.target.closest("[data-aff]"); if (!b) return; RUB.aff = b.dataset.aff; garderRub(); majRubriques(); dessiner(); });
majRubriques();

/* ---------- ouverture : globe esquissé pendant la préparation ---------- */
// même place, même taille, même vue, mêmes côtes et même quadrillage que le vrai globe (dessiné dessous) : à la fin, l'esquisse se fond
// dans le vrai globe sans que rien ne bouge ; chaque drapeau arrivé se pose en vignette sur son territoire (à demi), puis
// s'allume quand sa place est calculée ; le contour se remplit à la couleur d'accent (avancement)
const SVG = "http://www.w3.org/2000/svg";
const intro = { proj: d3.geoOrthographic().clipAngle(90).precision(0.7), vignettes: [], w: 0, h: 0 };
// territoires dessinés dans la rubrique (pays, ou provinces à la place de leur pays au niveau États et provinces)
const dessineDrapeau = f => f.properties.code ? modeEtats() : !!f.properties.a2 && !(modeEtats() && SOUS[f.properties.a2]);
function introTaille() {
  const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight) || w, r = Math.min(w, h) / 2 - 6;
  if (!w || (w === intro.w && h === intro.h && (intro.terre || !PAYS.length))) return;
  intro.w = w; intro.h = h; intro.r = r;
  const el = $("intro"), P = intro.proj.rotate(rot).scale(r).translate([w / 2, h / 2]), chem = d3.geoPath(P);
  for (const [n, v] of [["w", w], ["h", h], ["r", r], ["cx", w / 2], ["cy", h / 2]]) el.style.setProperty("--" + n, v + "px");
  el.classList.toggle("relief", RUB.drapeaux);
  for (const s of el.querySelectorAll("svg")) s.setAttribute("viewBox", `0 0 ${w} ${h}`);
  for (const c of el.querySelectorAll("circle")) { c.setAttribute("cx", w / 2); c.setAttribute("cy", h / 2); c.setAttribute("r", r); }
  $("chargeAnneau").setAttribute("transform", `rotate(-90 ${w / 2} ${h / 2})`);   // (l'avancement part du haut)
  el.querySelector(".intro-grille").setAttribute("d", chem(grille) || "");
  // terres et lacs en silhouette, une fois les contours arrivés (un seul chemin, résolution grossière : ~30 ms)
  if (PAYS.length) { const gros = d3.geoPath(intro.proj.precision(2));
    el.querySelector(".intro-terre").setAttribute("d", gros({ type: "FeatureCollection", features: PAYS }) || "");
    el.querySelector(".intro-lacs").setAttribute("d", gros(LACS) || ""); intro.proj.precision(0.7);
    intro.terre = true; requestAnimationFrame(() => el.classList.add("terre")); }
  // lignes de 30° (méridiens puis parallèles), créées une fois : leur tracé animé ne recommence pas si la taille change
  const g = el.querySelector(".intro-traits"), L = d3.geoGraticule().step([30, 30]).lines();
  if (!g.childNodes.length) L.forEach((l, i) => { const p = document.createElementNS(SVG, "path"); p.setAttribute("pathLength", 1); p.style.setProperty("--i", i); g.appendChild(p); });
  L.forEach((l, i) => g.childNodes[i].setAttribute("d", chem(l) || ""));
  introVignettes();
  requestAnimationFrame(() => el.classList.add("vu"));
}
// vignettes sur une seule toile, au centre du plus grand morceau, à peu près à la taille du territoire (4 px à 7 % du
// rayon de haut), les petites par-dessus ; trame de 64 × 40 (celle de couleurPrincipale : rien de plus à préparer)
let introPrevu = false;
function introVignettes() {
  if (introPrevu) return; introPrevu = true;
  requestAnimationFrame(() => { introPrevu = false;
    const t = $("introDrapeaux"), dpr = Math.min(2, devicePixelRatio || 1), g = t.getContext("2d"), r = intro.r;
    if (t.width !== Math.round(intro.w * dpr) || t.height !== Math.round(intro.h * dpr)) { t.width = Math.round(intro.w * dpr); t.height = Math.round(intro.h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, intro.w, intro.h); g.imageSmoothingQuality = "high";
    g.lineWidth = 0.5; g.strokeStyle = "rgba(0,0,0,.45)";
    for (const v of intro.vignettes) {
      const [x, y] = intro.proj(v.c), h = Math.max(4, Math.min(0.07 * r, 0.22 * r * Math.sqrt(v.aire))), w = h * v.ratio;
      g.globalAlpha = v.place ? 1 : 0.55; g.drawImage(trame(v.d, 64, 40), x - w / 2, y - h / 2, w, h);
      g.strokeRect(x - w / 2, y - h / 2, w, h);
    }
  });
}
function introVignette(f, src) {
  const d = DRAP.get(src); if (!d?.ok || !dessineDrapeau(f)) return null;
  const m = plusGrand(f), c = d3.geoCentroid(m);
  if (d3.geoDistance(c, centreVue()) > 1.4) return null;   // face cachée ou trop près du bord
  const v = { d, c, aire: d3.geoArea(m), ratio: Math.min(2.5, Math.max(1, rapport(d))), place: false };
  // (rangées de la plus grande à la plus petite)
  const i = intro.vignettes.findIndex(o => o.aire < v.aire); intro.vignettes.splice(i < 0 ? intro.vignettes.length : i, 0, v);
  introVignettes();
  return v;
}

/* ---------- démarrage ---------- */
// chargement au début, avec l'avancement (demande de l'utilisateur) : ce qui coûte est fait d'avance pour que le globe soit
// fluide ensuite : tous les drapeaux chargés, avec leur couleur principale et leur place sur le globe, et les niveaux de
// détail (et morceaux) de chaque forme
const pause = () => new Promise(r => setTimeout(r, 0));
const avance = (p, t) => { const a = $("chargeAnneau");
  a.style.strokeDashoffset = (100 - 100 * p).toFixed(1); a.style.opacity = p > 0.005 ? 1 : 0;
  $("chargePct").textContent = Math.round(100 * p) + " %"; if (t) $("chargeEtape").textContent = t; };
const compte = (n, total) => { $("chargeCompte").textContent = `${n} / ${total} drapeaux`; };
async function preparerTout() {
  const cibles = PAYS.filter(f => f.properties.a2).map(f => [f, drapeauPays(f.properties.a2)]);
  for (const [a2, X] of Object.entries(charges)) if (X) for (const s of X.features) cibles.push([s, drapeauSous(a2, s)]);
  let n = 0; avance(0.1, "Drapeaux…"); compte(0, cibles.length);
  const vign = [];   // vignette de chaque cible (allumée quand sa place est calculée)
  await Promise.all(cibles.map(([f, src], j) => { imageDrapeau(src);
    return DRAP.get(src).pret.then(() => { vign[j] = introVignette(f, src); compte(++n, cibles.length); avance(0.1 + 0.3 * n / cibles.length); }); }));
  const travail = cibles.map(([f, src]) => () => { const d = DRAP.get(src); if (!d.ok) return;
    couleurPrincipale(d); const G = groupeDe(f), r = rapport(d), rg = reglage(f, d);
    G.place ||= placer(G.prin, r, rg); for (const o of G.loin) o._place ||= placer([o.coordinates], r, rg); });
  const formes = [...PAYS, ...LACS.features, FRONTIERES, ...Object.values(charges).filter(Boolean).flatMap(X => [...X.features, X.mesh])];
  for (const pas of [...PAS, null]) for (const f of formes) travail.push(() => morceaux(lod(f, pas)));
  avance(0.4, "Place des drapeaux…");
  for (let i = 0, allumes = 0; i < travail.length;) {
    const fin = performance.now() + 40; while (i < travail.length && performance.now() < fin) travail[i++]();
    if (allumes < Math.min(i, cibles.length)) { for (; allumes < Math.min(i, cibles.length); allumes++) if (vign[allumes]) vign[allumes].place = true; introVignettes(); }
    avance(0.4 + 0.55 * i / travail.length, i < cibles.length ? null : "Contours au fil du zoom…"); await pause();
  }
  avance(0.97, "Premier dessin…"); await pause();
}
(async () => {
  couleurs(); introTaille(); avance(0.02, "Contours des pays…");
  // (l'esquisse suit la taille du cadre, plein écran compris, jusqu'à ce que le vrai globe soit prêt)
  new ResizeObserver(() => FRONTIERES ? taille() : introTaille()).observe(canvas);
  const [w, fiches, lacs] = await Promise.all([fetch("monde/pays.json").then(r => r.json()), fetch("monde/fiches.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch("monde/lacs.json").then(r => r.json()).catch(() => null)]);
  FICHES = fiches;
  STATS = await fetch("monde/stats.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  REGLAGES = await fetch("monde/drapeaux-reglages.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  // territoires réunis à leur pays (demande de l'utilisateur : le Somaliland avec la Somalie) : une seule forme, sans
  // frontière entre eux, avec le drapeau, la fiche et les statistiques du pays
  const G = w.objects.countries.geometries, dans = g => FUSIONS[g.properties?.a2] || Object.values(FUSIONS).some(L => L.includes(g.properties?.en));
  for (const [a2, L] of Object.entries(FUSIONS)) {
    const P = G.find(g => g.properties?.a2 === a2), A = G.filter(g => L.includes(g.properties?.en)); if (!P || !A.length) continue;
    w.objects.countries.geometries = G.filter(g => !A.includes(g));
    P._fusion = topojson.merge(w, [P, ...A]);
  }
  PAYS = topojson.feature(w, w.objects.countries).features;
  for (const f of PAYS) { const g = w.objects.countries.geometries.find(x => x.properties === f.properties); if (g?._fusion) f.geometry = g._fusion; }
  PAYS.forEach(cercle);
  FRONTIERES = topojson.mesh(w, { type: "GeometryCollection", geometries: G }, (a, b) => a !== b && !(dans(a) && dans(b)));
  for (const f of PAYS) f._a2 = f.properties.a2 || f.properties.en;
  if (lacs) { sensHoraire(lacs); LACS = lacs; lacs.features.forEach(cercle); BOITES_LACS = lacs.features.map(f => f._b); }
  taille();
  await Promise.all(Object.keys(SOUS).map(charger));
  // lieu de l'adresse choisi tout de suite, mais le globe ne tourne vers lui qu'une fois le vrai globe montré
  // (pendant la préparation, il garde la vue de l'esquisse)
  const versLieu = !!location.hash.slice(1);   // (choisir() écrit ensuite le lieu dans l'adresse)
  await depuisAdresse(false);
  remplirChoix();
  try { await preparerTout(); } catch (e) { console.error(e); }
  pret = true; peindre(); avance(1, "Prêt");
  $("charge").classList.add("fini");
  setTimeout(() => { $("charge").hidden = true; intro.vignettes = []; $("introDrapeaux").width = 0;
    if (versLieu && sel) allerA(sel.ville || sel.sous || sel.pays); }, 500);
  addEventListener("hashchange", () => depuisAdresse(true));
  // accès pour le test de cohérence du rendu (information-monde.html?essai) : globe dessiné à un angle et un zoom donnés
  if (new URLSearchParams(location.search).has("essai")) window.__globe = {
    dessinerA(r, kk, enMouvement) { arreter(); rot = r; k = kk; if (enMouvement) bouger(); else { clearTimeout(finRapide); rapide = false; proj.precision(0.7); } peindre(); },
    proj, PAYS, LACS, dansLac, C, DRAP, charges, groupeDe, W: () => W, H: () => H, R: () => R, k: () => k,
    // réglage d'un drapeau à l'essai (monde/outils/essai_drapeau.mjs) : place recalculée, puis le territoire cadré
    territoire: cle => cle.includes("-") ? charges[cle.slice(0, 2)]?.features.find(s => s.properties.code === cle)
      : PAYS.filter(f => f.properties.a2 === cle).sort((x, y) => y._r - x._r)[0],   // (deux « AU » : l'Australie, et les îles Ashmore-et-Cartier)
    regler(cle, o) { const f = this.territoire(cle); if (o) REGLAGES[cle] = o; else delete REGLAGES[cle]; delete f._grp; dessiner(); },
    cadrer(cle) {
      const f = this.territoire(cle), G = groupeDe(f), M = morceaux(f).filter(m => G.dans(m._c));
      const c = d3.geoCentroid({ type: "MultiPolygon", coordinates: G.prin }), r = Math.max(...M.map(m => d3.geoDistance(c, m._c) + m._r));
      return { rot: [-c[0], -c[1], 0], k: Math.max(1, Math.min(ZOOM_MAX, 0.4 * Math.min(W, H) / (R * Math.sin(Math.min(r, Math.PI / 2))))) };
    } };
  addEventListener("themechange", () => { couleurs(); dessiner(); });
})();
