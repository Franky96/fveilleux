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

let PAYS = [], FRONTIERES, LACS = { type: "FeatureCollection", features: [] }, BOITES_LACS = [], FICHES = {}, charges = {}, sel = null, memo = {}, survol = null;
const canvas = $("globe"), ctx = canvas.getContext("2d");
const proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
const chemin = d3.geoPath(proj, ctx), grille = d3.geoGraticule10();
let rot = [96, -45, 0], k = 1, R = 300, W = 600, H = 600;   // rotation (centre sur le Canada), zoom, rayon de base, taille du canvas
let C = {};
const couleurs = () => { const s = getComputedStyle(document.documentElement);
  C = Object.fromEntries(["ocean", "grille", "terre", "terre-survol", "frontiere", "choisi", "pays-fond", "sous-trait", "contour", "ville", "ville-trait", "texte-globe"]
    .map(n => [n, s.getPropertyValue("--" + n).trim()])); };

/* ---------- données des subdivisions et villes ---------- */
// anneaux dans le sens attendu par d3 (horaire) : sinon le polygone couvrirait tout le reste du globe
function sensHoraire(d) {
  for (const s of d.features) if (d3.geoArea(s) > 2 * Math.PI) {
    const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
    for (const p of polys) for (const r of p) r.reverse();
  }
}
// un point dans un lac (boîte d'abord, pour aller vite)
const dansLac = ([x, y]) => BOITES_LACS.some(([[x0, y0], [x1, y1]], i) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && d3.geoContains(LACS.features[i], [x, y]));
async function charger(a2) {
  if (!SOUS[a2]) return null;
  if (charges[a2]) return charges[a2];
  const [d, villes] = await Promise.all([fetch(SOUS[a2].fichier).then(r => r.json()), fetch(SOUS[a2].villes).then(r => r.ok ? r.json() : []).catch(() => [])]);
  sensHoraire(d);
  d.features.sort((a, b) => nomSous(a2, a).localeCompare(nomSous(a2, b), "fr"));
  // frontières internes : contours de chaque subdivision (ceux du pays sont redessinés par-dessus)
  const mesh = { type: "MultiLineString", coordinates: d.features.flatMap(s => (s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates).flat()) };
  return (charges[a2] = { features: d.features, mesh, villes });
}
const villesDe = (a2, code) => (charges[a2]?.villes || []).filter(v => v.prov === code);

/* ---------- dessin ---------- */
let prevu = false;
const dessiner = () => { if (prevu) return; prevu = true; requestAnimationFrame(() => { prevu = false; peindre(); }); };
const visible = p => d3.geoDistance(p, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.01;
let pointsVilles = [];   // villes dessinées (pour le clic)
function peindre() {
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  proj.rotate(rot).scale(R * k).translate([W / 2, H / 2]);
  ctx.beginPath(); chemin({ type: "Sphere" }); ctx.fillStyle = C.ocean; ctx.fill();
  ctx.beginPath(); chemin(grille); ctx.strokeStyle = C.grille; ctx.lineWidth = 1; ctx.stroke();
  const paysSel = sel?.pays;
  for (const f of PAYS) {
    ctx.beginPath(); chemin(f);
    ctx.fillStyle = f === paysSel ? (sel.sous ? C["pays-fond"] : C.choisi) : f === survol?.pays && !survol.sous ? C["terre-survol"] : C.terre; ctx.fill();
  }
  // subdivisions du pays choisi : la choisie (ou survolée) en couleur, frontières internes
  const S = paysSel && charges[paysSel.properties.a2];
  if (S) for (const s of S.features) if (s === sel.sous || s === survol?.sous) {
    ctx.beginPath(); chemin(s); ctx.fillStyle = s === sel.sous ? C.choisi : C["terre-survol"]; ctx.globalAlpha = s === sel.sous ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1; }
  // lacs et plans d'eau : couleur de l'eau, par-dessus les terres
  ctx.beginPath(); chemin(LACS); ctx.fillStyle = C.ocean; ctx.fill();
  ctx.beginPath(); chemin(FRONTIERES); ctx.strokeStyle = C.frontiere; ctx.lineWidth = 0.6; ctx.stroke();
  if (S) {
    ctx.beginPath(); chemin(S.mesh); ctx.strokeStyle = C["sous-trait"]; ctx.lineWidth = 0.8; ctx.stroke();
  }
  if (paysSel) { ctx.beginPath(); chemin(paysSel); ctx.strokeStyle = C["sous-trait"]; ctx.lineWidth = 1.4; ctx.stroke(); }
  // villes de la subdivision choisie : point (carré pour une capitale), nom quand on est assez près
  pointsVilles = [];
  if (S && sel.sous) {
    ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.textBaseline = "middle";
    const liste = villesDe(paysSel.properties.a2, sel.sous.properties.code).filter(v => visible([v.lon, v.lat]));
    for (const v of liste) {
      const [x, y] = proj([v.lon, v.lat]), choisie = v === sel.ville, r = choisie ? 6.5 : v === survol?.ville ? 5.5 : 4.5;
      pointsVilles.push({ v, x, y });
      ctx.beginPath(); v.cap ? ctx.rect(x - r, y - r, 2 * r, 2 * r) : ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = choisie ? C.choisi : C.ville; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C["ville-trait"]; ctx.stroke();
    }
    // noms : les plus peuplées d'abord, sans chevauchement
    const pris = [];
    for (const { v, x, y } of [...pointsVilles].sort((a, b) => (b.v === sel.ville) - (a.v === sel.ville) || (b.v.pop || 0) - (a.v.pop || 0))) {
      const w = ctx.measureText(v.nom).width, bx = [x + 8, y - 8, x + 12 + w, y + 8];
      if (k < 5 && v !== sel.ville && !v.cap) continue;
      if (pris.some(b => !(bx[2] < b[0] || bx[0] > b[2] || bx[3] < b[1] || bx[1] > b[3]))) continue;
      pris.push(bx);
      ctx.lineWidth = 3; ctx.strokeStyle = C.ocean; ctx.strokeText(v.nom, x + 9, y); ctx.fillStyle = C["texte-globe"]; ctx.fillText(v.nom, x + 9, y);
    }
  }
  ctx.beginPath(); chemin({ type: "Sphere" }); ctx.strokeStyle = C.contour; ctx.lineWidth = 1.5; ctx.stroke();
}
function taille() {
  const dpr = devicePixelRatio || 1;
  W = Math.round(canvas.clientWidth); H = Math.round(canvas.clientHeight) || W;
  R = Math.min(W, H) / 2 - 6; canvas.width = W * dpr; canvas.height = H * dpr; peindre();
}

/* ---------- repérage d'un point ---------- */
function sousLe([x, y]) {
  let proche = null, dmin = 12;
  for (const p of pointsVilles) { const d = Math.hypot(p.x - x, p.y - y); if (d < dmin) { dmin = d; proche = p.v; } }
  if (proche) return { pays: sel.pays, sous: sel.sous, ville: proche };
  const p = proj.invert([x, y]); if (!p || !visible(p)) return Math.hypot(x - W / 2, y - H / 2) < R * k ? { ocean: true } : null;
  if (dansLac(p)) return { ocean: true };
  const pays = PAYS.find(f => d3.geoContains(f, p)); if (!pays) return { ocean: true };
  const S = pays === sel?.pays && charges[pays.properties.a2];
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
  anim = d3.timer(t => { const u = d3.easeCubicInOut(Math.min(1, t / 1000)); rot = ir(u); k = Math.exp(lk(u)); peindre(); if (u >= 1) arreter(); });
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
  if (sel.ville) choisir(sel.pays, sel.sous);
  else if (sel.sous) choisir(sel.pays);
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
    extra = `<div class="code">${ville.pop ? `Population (recensement de 2021) : ${NB.format(ville.pop)}` : ""}</div>`;
  } else if (sous) {
    nom = nomSous(a2, sous); genre = sd.noms[sous.properties.code]?.[1] || "Subdivision";
    img = `<img src="${drapeauSous(a2, sous)}" alt="Drapeau : ${ESC(nom)}">`; code = sous.properties.code; cle = code;
  } else {
    nom = np; genre = "Pays ou territoire"; cle = a2;
    img = a2 ? `<img src="${drapeauPays(a2)}" alt="Drapeau : ${ESC(nom)}">` : `<p>Pas de drapeau dans cette collection : territoire sans code ISO 3166 (statut non reconnu ou contesté).</p>`;
    code = a2 || "";
  }
  $("fiche").innerHTML = `<div class="genre">${ESC(genre)}</div><h2>${ESC(nom)}</h2>
    <div class="drapeau">${img}</div>${credit ? `<p class="credit">${credit}</p>` : ""}
    ${code ? `<div class="code">ISO 3166 : ${ESC(code)}</div>` : ""}${extra}${infos(cle)}`;

  // listes : villes de la subdivision, puis subdivisions du pays
  let html = "";
  if (!sd) html = `<p class="vide">Les drapeaux des subdivisions de ce pays ne sont pas encore ajoutés.</p>`;
  else if (S) {
    if (sous) {
      const vs = villesDe(a2, sous.properties.code);
      html += `<h3>Villes · ${vs.length}</h3>` + (vs.length ? `<ul>${vs.map(v => `<li><button type="button" data-v="${v.q}"${v === ville ? ' aria-current="true"' : ""}>
        ${v.drapeau ? `<img src="${ESC(v.drapeau.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i class="sans" aria-hidden="true"></i>`}<span>${ESC(v.nom)}</span></button></li>`).join("")}</ul>`
        : `<p class="vide">Aucune ville de 100 000 habitants et plus ni capitale.</p>`)
        + `<p class="note">Villes de 100 000 habitants et plus au recensement de 2021, et capitales (carré sur le globe).</p>`;
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
canvas.addEventListener("wheel", e => { e.preventDefault(); arreter(); k = Math.max(1, Math.min(40, k * Math.exp(-e.deltaY * 0.0015))); dessiner(); }, { passive: false });
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
const zoomer = f => { arreter(); k = Math.max(1, Math.min(40, k * f)); dessiner(); };
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
  const h = decodeURIComponent(location.hash.slice(1)) || "CA";
  if (/^Q\d+$/.test(h)) for (const a2 of Object.keys(SOUS)) {
    const S = await charger(a2), v = S?.villes.find(x => x.q === h);
    if (v) return choisir(PAYS.find(f => f.properties.a2 === a2), null, v, { bouger });
  }
  const a2 = h.slice(0, 2).toUpperCase(), sub = h.length > 3 ? h.toUpperCase() : null;
  const pays = PAYS.find(f => f.properties.a2 === a2) || PAYS.find(f => f.properties.en === h) || PAYS.find(f => f.properties.a2 === "CA");
  const S = await charger(pays.properties.a2);
  return choisir(pays, sub && S ? S.features.find(s => s.properties.code === sub) || null : null, null, { bouger });
}

/* ---------- démarrage ---------- */
(async () => {
  couleurs();
  const [w, fiches, lacs] = await Promise.all([fetch("monde/pays.json").then(r => r.json()), fetch("monde/fiches.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch("monde/lacs.json").then(r => r.json()).catch(() => null)]);
  FICHES = fiches;
  if (lacs) { sensHoraire(lacs); LACS = lacs; BOITES_LACS = lacs.features.map(f => d3.geoBounds(f)); }
  PAYS = topojson.feature(w, w.objects.countries).features;
  FRONTIERES = topojson.mesh(w, w.objects.countries, (a, b) => a !== b);
  new ResizeObserver(taille).observe(canvas);
  taille();
  await depuisAdresse(true);
  remplirChoix();
  addEventListener("hashchange", () => depuisAdresse(true));
  addEventListener("themechange", () => { couleurs(); dessiner(); });
})();
