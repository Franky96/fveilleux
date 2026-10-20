/* Information monde (information-monde.html) : globe des pays (projection orthographique, canvas), drapeau du pays choisi,
   puis de ses subdivisions quand on les a (SOUS : Canada pour l'instant ; ajouter un pays = un fichier de contours, les noms
   et un dossier de drapeaux). Données : monde/outils/donnees.py. Sélection gardée dans l'adresse (#CA, #CA-QC). */
const $ = id => document.getElementById(id);
const ESC = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NOMS = new Intl.DisplayNames(["fr"], { type: "region" });
// entités sans code ISO dans Natural Earth
const SANS_CODE = { "Somaliland": "Somaliland", "N. Cyprus": "Chypre du Nord", "Indian Ocean Ter.": "Territoires australiens de l'océan Indien", "Siachen Glacier": "Glacier de Siachen" };

// subdivisions : code ISO 3166-2 → nom et statut
const SOUS = {
  CA: {
    fichier: "monde/canada.json", dossier: "monde/drapeaux/ca/", titre: "Provinces et territoires",
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
const nomSous = (a2, s) => SOUS[a2].noms[s.properties.code]?.[0] || s.properties.code;
const drapeauPays = a2 => `monde/drapeaux/${a2.toLowerCase()}.svg`;
const drapeauSous = (a2, s) => SOUS[a2].dossier + s.properties.code.split("-")[1].toLowerCase() + ".svg";

let PAYS = [], FRONTIERES, sousCharges = {}, sel = null, survol = null;
const canvas = $("globe"), ctx = canvas.getContext("2d");
const proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
const chemin = d3.geoPath(proj, ctx), grille = d3.geoGraticule10();
let rot = [96, -45, 0], k = 1, R = 300, W = 600;   // rotation (centre sur le Canada), zoom, rayon de base, taille
let C = {};
const couleurs = () => { const s = getComputedStyle(document.documentElement);
  C = Object.fromEntries(["ocean", "grille", "terre", "terre-survol", "frontiere", "choisi", "pays-fond", "sous-trait", "contour"].map(n => [n, s.getPropertyValue("--" + n).trim()])); };

/* ---------- dessin ---------- */
let prevu = false;
const dessiner = () => { if (prevu) return; prevu = true; requestAnimationFrame(() => { prevu = false; peindre(); }); };
function peindre() {
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W);
  proj.rotate(rot).scale(R * k).translate([W / 2, W / 2]);
  ctx.beginPath(); chemin({ type: "Sphere" }); ctx.fillStyle = C.ocean; ctx.fill();
  ctx.beginPath(); chemin(grille); ctx.strokeStyle = C.grille; ctx.lineWidth = 1; ctx.stroke();
  const paysSel = sel?.pays;
  for (const f of PAYS) {
    ctx.beginPath(); chemin(f);
    ctx.fillStyle = f === paysSel ? (sel.sous ? C["pays-fond"] : C.choisi) : f === survol?.pays && !survol.sous ? C["terre-survol"] : C.terre; ctx.fill();
  }
  ctx.beginPath(); chemin(FRONTIERES); ctx.strokeStyle = C.frontiere; ctx.lineWidth = 0.6; ctx.stroke();
  // subdivisions du pays choisi : la choisie (ou survolée) en couleur, frontières internes
  const S = paysSel && sousCharges[paysSel.properties.a2];
  if (S) {
    for (const s of S.features) if (s === sel.sous || s === survol?.sous) {
      ctx.beginPath(); chemin(s); ctx.fillStyle = s === sel.sous ? C.choisi : C["terre-survol"]; ctx.globalAlpha = s === sel.sous ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.beginPath(); chemin(S.mesh); ctx.strokeStyle = C["sous-trait"]; ctx.lineWidth = 0.8; ctx.stroke();
  }
  if (paysSel) { ctx.beginPath(); chemin(paysSel); ctx.strokeStyle = C["sous-trait"]; ctx.lineWidth = 1.4; ctx.stroke(); }
  ctx.beginPath(); chemin({ type: "Sphere" }); ctx.strokeStyle = C.contour; ctx.lineWidth = 1.5; ctx.stroke();
}
function taille() {
  const w = Math.round(canvas.clientWidth), dpr = devicePixelRatio || 1;
  W = w; R = w / 2 - 6; canvas.width = w * dpr; canvas.height = w * dpr; peindre();
}

/* ---------- repérage d'un point ---------- */
function sousLe([x, y]) {
  const p = proj.invert([x, y]); if (!p || d3.geoDistance(p, [-rot[0], -rot[1]]) > Math.PI / 2) return null;
  const pays = PAYS.find(f => d3.geoContains(f, p)); if (!pays) return null;
  const S = pays === sel?.pays && sousCharges[pays.properties.a2];
  return { pays, sous: S ? S.features.find(s => d3.geoContains(s, p)) || null : null };
}

/* ---------- déplacement animé vers un lieu ---------- */
// plus grand morceau (France sans l'outre-mer, États-Unis sans l'Alaska) : centre et zoom pour qu'il remplisse le globe
function plusGrand(f) {
  if (f.geometry.type !== "MultiPolygon") return f;
  let best, aire = -1;
  for (const c of f.geometry.coordinates) { const g = { type: "Polygon", coordinates: c }, a = d3.geoArea(g); if (a > aire) { aire = a; best = g; } }
  return best;
}
let anim = null;
function allerA(f) {
  const g = plusGrand(f), c = d3.geoCentroid(g);
  let r = 0; d3.geoStream(g, { point(x, y) { r = Math.max(r, d3.geoDistance(c, [x, y])); }, lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {}, sphere() {} });
  const k2 = Math.max(1, Math.min(30, 0.55 / Math.sin(Math.min(Math.PI / 2, Math.max(r, 0.004)))));
  const r0 = rot.slice(), k0 = k, r2 = [-c[0], -c[1], 0];
  // le plus court chemin en longitude
  r2[0] = r0[0] + ((((r2[0] - r0[0]) % 360) + 540) % 360 - 180);
  if (anim) anim.stop();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { rot = r2; k = k2; return dessiner(); }
  const ir = d3.interpolate(r0, r2), lk = d3.interpolate(Math.log(k0), Math.log(k2));
  anim = d3.timer(t => { const u = d3.easeCubicInOut(Math.min(1, t / 1000)); rot = ir(u); k = Math.exp(lk(u)); peindre(); if (u >= 1) { anim.stop(); anim = null; } });
}

/* ---------- choix ---------- */
async function chargerSous(a2) {
  if (!SOUS[a2] || sousCharges[a2]) return sousCharges[a2];
  const d = await (await fetch(SOUS[a2].fichier)).json();
  // anneaux dans le sens attendu par d3 (horaire) : sinon le polygone couvrirait tout le reste du globe
  for (const s of d.features) if (d3.geoArea(s) > 2 * Math.PI) {
    const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
    for (const p of polys) for (const r of p) r.reverse();
  }
  d.features.sort((a, b) => nomSous(a2, a).localeCompare(nomSous(a2, b), "fr"));
  sousCharges[a2] = { features: d.features, mesh: { type: "MultiLineString", coordinates: [] } };
  // frontières internes : contours de chaque subdivision (ceux du pays sont redessinés par-dessus)
  sousCharges[a2].mesh.coordinates = d.features.flatMap(s => (s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates).flat());
  return sousCharges[a2];
}
async function choisir(pays, sous = null, { bouger = true } = {}) {
  if (anim && !bouger) { anim.stop(); anim = null; }
  sel = { pays, sous }; $("bulle").hidden = true;
  const a2 = pays.properties.a2;
  history.replaceState(null, "", "#" + (sous ? sous.properties.code : a2 || encodeURIComponent(pays.properties.en)));
  if (bouger) allerA(sous || pays);
  fiche();
  if (SOUS[a2]) { await chargerSous(a2); fiche(); }
  dessiner();
}
function fiche() {
  const { pays, sous } = sel, a2 = pays.properties.a2, np = nomPays(pays);
  $("fil").innerHTML = sous ? `<button type="button" id="filPays">${ESC(np)}</button><span aria-hidden="true">›</span><span>${ESC(nomSous(a2, sous))}</span>` : "";
  $("filPays")?.addEventListener("click", () => choisir(pays));
  const nom = sous ? nomSous(a2, sous) : np, genre = sous ? SOUS[a2].noms[sous.properties.code]?.[1] || "Subdivision" : "Pays ou territoire";
  const img = sous ? drapeauSous(a2, sous) : a2 ? drapeauPays(a2) : null;
  $("fiche").innerHTML = `<div class="genre">${ESC(genre)}</div><h2>${ESC(nom)}</h2>
    <div class="drapeau">${img ? `<img src="${img}" alt="Drapeau : ${ESC(nom)}">` : `<p>Pas de drapeau dans cette collection : territoire sans code ISO 3166 (statut non reconnu ou contesté).</p>`}</div>
    ${a2 ? `<div class="code">ISO 3166 : ${ESC(sous ? sous.properties.code : a2)}</div>` : ""}`;
  const S = sousCharges[a2];
  $("sous").innerHTML = !SOUS[a2] ? `<p class="vide">Les drapeaux des subdivisions de ce pays ne sont pas encore ajoutés.</p>`
    : !S ? "" : `<h3>${ESC(SOUS[a2].titre)} · ${S.features.length}</h3><ul>${S.features.map((s, i) => `<li><button type="button" data-i="${i}"${s === sous ? ' aria-current="true"' : ""}>
      <img src="${drapeauSous(a2, s)}" alt="" loading="lazy"><span>${ESC(nomSous(a2, s))}</span></button></li>`).join("")}</ul>`;
  $("sous").querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => choisir(pays, S.features[+b.dataset.i])));
}

/* ---------- interactions ---------- */
const pointeurs = new Map(); let depart = null, bouge = false, pince = null;
const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId); pointeurs.set(e.pointerId, pos(e));
  if (anim) { anim.stop(); anim = null; }
  if (pointeurs.size === 1) { depart = { p: pos(e), rot: rot.slice() }; bouge = false; }
  if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; pince = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; bouge = true; }
});
canvas.addEventListener("pointermove", e => {
  const p = pos(e);
  if (!pointeurs.has(e.pointerId)) { if (e.pointerType === "mouse") survoler(p); return; }
  pointeurs.set(e.pointerId, p);
  if (pince && pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; k = Math.max(1, Math.min(40, pince.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pince.d)); return dessiner(); }
  if (!depart) return;
  const dx = p[0] - depart.p[0], dy = p[1] - depart.p[1];
  if (!bouge && Math.hypot(dx, dy) < 4) return;
  bouge = true; canvas.classList.add("tire"); $("bulle").hidden = true;
  const f = 180 / (Math.PI * R * k);   // degrés par pixel
  rot = [depart.rot[0] + dx * f, Math.max(-90, Math.min(90, depart.rot[1] - dy * f)), 0];
  dessiner();
});
const fin = e => {
  const p = pointeurs.get(e.pointerId); pointeurs.delete(e.pointerId);
  if (pointeurs.size < 2) pince = null;
  if (pointeurs.size === 0) {
    canvas.classList.remove("tire");
    if (!bouge && p && e.type === "pointerup") { const t = sousLe(p); if (t) choisir(t.pays, t.sous); }
    depart = null;
  }
};
canvas.addEventListener("pointerup", fin); canvas.addEventListener("pointercancel", fin);
canvas.addEventListener("pointerleave", () => { if (survol) { survol = null; $("bulle").hidden = true; dessiner(); } });
canvas.addEventListener("wheel", e => { e.preventDefault(); if (anim) { anim.stop(); anim = null; } k = Math.max(1, Math.min(40, k * Math.exp(-e.deltaY * 0.0015))); dessiner(); }, { passive: false });
let survolPrevu = null;
function survoler(p) {
  if (survolPrevu) { survolPrevu = p; return; } survolPrevu = p;
  requestAnimationFrame(() => {
    const q = survolPrevu; survolPrevu = null;
    const t = sousLe(q), b = $("bulle");
    const change = t?.pays !== survol?.pays || t?.sous !== survol?.sous;
    survol = t;
    if (t) { b.textContent = t.sous ? nomSous(t.pays.properties.a2, t.sous) : nomPays(t.pays); b.style.left = q[0] + "px"; b.style.top = q[1] + "px"; b.hidden = false; }
    else b.hidden = true;
    canvas.style.cursor = t ? "pointer" : "";
    if (change) dessiner();
  });
}
const zoomer = f => { if (anim) { anim.stop(); anim = null; } k = Math.max(1, Math.min(40, k * f)); dessiner(); };
$("zPlus").addEventListener("click", () => zoomer(1.6));
$("zMoins").addEventListener("click", () => zoomer(1 / 1.6));
$("zTout").addEventListener("click", () => { if (anim) { anim.stop(); anim = null; } k = 1; dessiner(); });

// recherche : pays et subdivisions connues
function remplirChoix() {
  const opts = PAYS.map(f => [nomPays(f), f, null]);
  for (const [a2, S] of Object.entries(SOUS)) { const pays = PAYS.find(f => f.properties.a2 === a2); if (!pays) continue;
    for (const [code, [nom]] of Object.entries(S.noms)) opts.push([`${nom} (${nomPays(pays)})`, pays, code]); }
  opts.sort((a, b) => a[0].localeCompare(b[0], "fr"));
  $("choix").innerHTML = opts.map(o => `<option value="${ESC(o[0])}"></option>`).join("");
  const parNom = new Map(opts.map(o => [o[0].toLocaleLowerCase("fr"), o]));
  const aller = async () => {
    const o = parNom.get($("cherche").value.trim().toLocaleLowerCase("fr")); if (!o) return;
    $("cherche").value = ""; $("cherche").blur();
    if (!o[2]) return choisir(o[1]);
    const S = await chargerSous(o[1].properties.a2); choisir(o[1], S.features.find(s => s.properties.code === o[2]) || null);
  };
  $("cherche").addEventListener("change", aller);
  $("cherche").addEventListener("keydown", e => { if (e.key === "Enter") aller(); });
}

async function depuisAdresse(bouger) {
  const h = decodeURIComponent(location.hash.slice(1)) || "CA", [a2, sub] = [h.slice(0, 2).toUpperCase(), h.length > 3 ? h.toUpperCase() : null];
  const pays = PAYS.find(f => f.properties.a2 === a2) || PAYS.find(f => f.properties.en === h) || PAYS.find(f => f.properties.a2 === "CA");
  if (sub && SOUS[pays.properties.a2]) { const S = await chargerSous(pays.properties.a2); return choisir(pays, S.features.find(s => s.properties.code === sub) || null, { bouger }); }
  return choisir(pays, null, { bouger });
}

/* ---------- démarrage ---------- */
(async () => {
  couleurs();
  const w = await (await fetch("monde/pays.json")).json();
  PAYS = topojson.feature(w, w.objects.countries).features;
  FRONTIERES = topojson.mesh(w, w.objects.countries, (a, b) => a !== b);
  new ResizeObserver(taille).observe(canvas);
  taille();
  remplirChoix();
  await depuisAdresse(true);
  addEventListener("hashchange", () => depuisAdresse(true));
  addEventListener("themechange", () => { couleurs(); dessiner(); });
})();
