/* Votes Allemagne — intentions de vote au Bundestag, même gabarit que « Votes Québec » (votes-quebec/intentions.js)
   et « Votes Canada » (votes-canada/canada.js).
   Sondages : secondes voix (Zweitstimme) de tous les instituts compilés par wahlrecht.de depuis l'élection du
   23 février 2025 (sondages.json, outils/sondages_de.py). Projection : simulation faite par le site à partir de la
   moyenne récente des sondages, selon la loi électorale de 2023 (projection.json, même script). Bundestag actuel :
   groupe et Land de chaque député (bundestag.json, même script). Élection de 2025 : résultat officiel de la
   Bundeswahlleiterin (resultats-2025.json) ; contours des 299 circonscriptions (data.json, outils/allemagne_geo.py). */
import { domaineY, decouper, placerBulle } from "../votes-quebec/zoom-y.js";
import { preparerSysteme } from "../votes-quebec/systeme.js";
import { sectionPartis, PARTIS, AXES, bordDe, trierAxe } from "../votes-quebec/partis.js";
import { equilibrerHaut } from "../votes-quebec/equilibre.js";
import { preparerPleinEcran, infoPlein } from "../votes-quebec/plein.js";
import { regrouper } from "../votes-quebec/hemicycle.js";

const SIEGES = 630, MAJ = 316;
// partis du graphique d'évolution et des pastilles de la carte (la CDU et la CSU forment l'Union : un seul groupe, des sondages communs)
const P = ["Union", "AfD", "SPD", "Grüne", "Linke", "BSW", "FDP"];
const CHIPS = ["Union", "AfD", "SPD", "Grüne", "Linke", "BSW", "FDP", "FW", "SSW"];
const LAB = { Union: "CDU/CSU", AUT: "Autres", IND: "Indép.", FL: "Non-inscrits", VAC: "Vacants" };
const lab = p => LAB[p] || p;
const NOMS = { CDU: "Union chrétienne-démocrate (CDU)", CSU: "Union chrétienne-sociale en Bavière (CSU)", Union: "Union CDU/CSU",
  SPD: "Parti social-démocrate (SPD)", AfD: "Alternative pour l'Allemagne (AfD)", Grüne: "Alliance 90 / Les Verts (Grüne)",
  Linke: "La Gauche (Die Linke)", BSW: "Alliance Sahra Wagenknecht (BSW)", FDP: "Parti libéral-démocrate (FDP)",
  FW: "Électeurs libres (Freie Wähler)", SSW: "Association des électeurs du Schleswig du Sud (SSW)", AUT: "Autres partis",
  IND: "Candidats indépendants", FL: "Députés non inscrits (fraktionslos)", VAC: "Siège vacant" };
const COUL = { CDU: "var(--cdu)", CSU: "var(--csu)", Union: "var(--cdu)", SPD: "var(--spd)", AfD: "var(--afd)", Grüne: "var(--gru)",
  Linke: "var(--lin)", BSW: "var(--bsw)", FDP: "var(--fdp)", FW: "var(--fw)", SSW: "var(--ssw)", AUT: "var(--vaut)", IND: "var(--vaut)",
  FL: "var(--fl)", VAC: "var(--soft)" };
// ordre de l'hémicycle, de gauche à droite (vu de la présidence)
const ORDRE = ["Linke", "BSW", "SPD", "Grüne", "SSW", "Union", "CDU", "CSU", "FDP", "FW", "AfD", "AUT", "IND", "FL", "VAC"];
const DATE_ELECTION = "2025-02-23";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");
const AN = a => String(a);   // années en texte normal (comme France, Canada et États-Unis)
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };
const ecart = (v, d = 0, u = "") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${nf(Math.abs(v), d)}${u}`;

// barre du haut : date des données et dernière vérification (votes-verif.json, écrit par le pipeline aux 3 heures)
let VERIF = null;
const lireVerif = cle => fetch("votes-verif.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(v => { VERIF = v[cle] || null; }).catch(() => {});
function majBarre(nom, donnees) {
  const t = document.querySelector(".t-votes"); if (!t) return;
  t.innerHTML = `${esc(nom)} · ${donnees}${VERIF ? ` · vérifiées le ${esc(VERIF.texte)}` : ""}`;
}

let DATA, R25, PROJ, SOND, BT, CE, CP, SIEGES_DE, NUM_LAND, sel = null, demarre = false;
// mode de la carte : projection (lead, second, vote), élection de 2025 (e25 : élu de la 1re voix, e25z : 2e voix en tête, e25vote)
// vue de la carte : circ (299 circonscriptions) ou lander (16 Länder, régions)
const etat = { mode: "lead", parti: null, pct: lireLS("viPct", true), chambre: "proj", reg: null, vue: lireLS("vaVue", "circ") };
const enLander = () => etat.vue === "lander";
const groupe = () => etat.mode.startsWith("e25") ? "e25" : "proj";
const voteMode = () => etat.mode === "vote" || etat.mode === "e25vote";
const secondes = () => voteMode() || etat.mode === "e25z";      // la carte montre les secondes voix (sinon : premières voix)

/* ---------- données par circonscription (indice = RID, même ordre que data.json) ---------- */
function preparer() {
  const parId = o => Object.fromEntries(o.map(c => [c.id, c]));
  const r25 = parId(R25.circ), p = PROJ ? parId(PROJ.circ) : {};
  const tete = parts => Object.entries(parts).sort((a, b) => b[1] - a[1]);
  CE = DATA.ridings.map(r => { const c = r25[r.id]; return c && { g: c.g, e: c.e, z: c.z, siege: c.siege, elu: c.elu, marge: c.marge, particip: c.particip, gz: tete(c.z)[0][0] }; });
  CP = DATA.ridings.map(r => { const c = p[r.id]; return c && { g: c.g, e: c.e, z: c.z, siege: c.siege, marge: c.marge, gz: tete(c.z)[0][0] }; });
  NUM_LAND = Object.fromEntries(DATA.regions.map((r, i) => [r.code, i + 1]));
  SIEGES_DE = {
    proj: PROJ ? Object.fromEntries(Object.entries(PROJ.national).filter(([, x]) => x.s > 0).map(([k, x]) => [k, x.s])) : null,
    e25: R25.sieges,
    act: BT ? { ...BT.groupes, ...(BT.vacants ? { VAC: BT.vacants } : {}) } : null,
  };
}
const srcCirc = (g = groupe()) => g === "e25" ? CE : CP;
const partsDe = c => c ? (secondes() ? c.z : c.e) : null;
const partDe = (parts, p) => !parts ? 0 : p === "Union" ? (parts.CDU || 0) + (parts.CSU || 0) : parts[p] || 0;
const unionDe = sg => (sg.CDU || 0) + (sg.CSU || 0) + (sg.Union || 0);
// sièges regroupés par groupe parlementaire (CDU et CSU ensemble) ; avec parl = true, le député du SSW compte parmi les
// non-inscrits, comme au Bundestag (pour comparer les élus de 2025 à la composition actuelle)
const parGroupe = (sg, parl = false) => { const o = {}; for (const [k, n] of Object.entries(sg)) { const g = k === "CDU" || k === "CSU" ? "Union" : parl && k === "SSW" ? "FL" : k; o[g] = (o[g] || 0) + n; } return o; };

/* ---------- hémicycle (comme Votes États-Unis et Votes France) ---------- */
function hemicycle(svgEl, parts, sous) {
  // 630 sièges : le nombre de rangées est choisi pour que les sièges soient aussi espacés le long des rangées
  // qu'entre les rangées (avec 12 rangées comme ailleurs, ils se touchaient presque) ; rayon du point = 40 % de cet écart
  const r0 = 0.34, W = 1000, H = 520, cx = W / 2, cy = H - 20, Rmax = 470;
  const repartir = R => { const rayons = d3.range(R).map(i => r0 + i * (1 - r0) / (R - 1)), somme = d3.sum(rayons);
    const parRangee = rayons.map(r => Math.round(SIEGES * r / somme)); parRangee[R - 1] += SIEGES - d3.sum(parRangee);
    const ecart = Math.min(Rmax * (1 - r0) / (R - 1), ...rayons.map((r, i) => Math.PI * r * Rmax / (parRangee[i] - 1)));
    return { R, rayons, parRangee, ecart }; };
  const { R, rayons, parRangee, ecart } = d3.range(10, 21).map(repartir).reduce((a, b) => b.ecart > a.ecart ? b : a);
  let places = [];
  rayons.forEach((r, i) => { const n = parRangee[i];
    for (let k = 0; k < n; k++) { const a = Math.PI - k * Math.PI / (n - 1); places.push({ a, r, x: cx + Math.cos(a) * r * Rmax, y: cy - Math.sin(a) * r * Rmax }); } });
  places = regrouper(places, parts.map(p => p.n));   // chaque parti groupé (votes-quebec/hemicycle.js)
  const sieges = parts.flatMap(p => d3.range(p.n).map(() => p));
  const rayon = ecart * 0.4;
  const g = d3.select(svgEl).attr("viewBox", `0 0 ${W} ${H}`); g.selectAll("*").remove();
  g.selectAll("circle").data(places).join("circle").attr("cx", p => p.x).attr("cy", p => p.y).attr("r", rayon)
    .attr("data-p", (p, i) => sieges[i] ? (sieges[i].k === "Union" ? "Union CDU CSU" : sieges[i].k) : null)   // parti du siège (bande des partis)
    .style("fill", (p, i) => sieges[i] ? (sieges[i].k === "VAC" ? "none" : sieges[i].c) : "var(--soft)")
    .style("stroke", (p, i) => sieges[i]?.k === "VAC" ? "var(--muted)" : null).style("stroke-width", 2)
    .append("title").text((p, i) => sieges[i] ? sieges[i].nom : "");
  g.append("text").attr("x", cx).attr("y", cy - 50).attr("text-anchor", "middle").attr("class", "vf-hemi-n").text(SIEGES);
  g.append("text").attr("x", cx).attr("y", cy - 18).attr("text-anchor", "middle").attr("class", "vf-hemi-maj").text(sous);
}

/* ---------- en-tête, choix du Bundestag affiché ---------- */
const CHAMBRES = { proj: "Projection", act: "Bundestag actuel", e25: "Élection 2025" };
function dessinerTete() {
  const sond = SOND.sondages.filter(s => !s.e), dernier = sond[sond.length - 1];
  majBarre("Votes Allemagne", PROJ ? `projection du site au ${dateFr(PROJ.maj.date)} · dernier sondage le ${dateFr(dernier.d)}` : `dernier sondage le ${dateFr(dernier.d)}`);
  $("viTitre").textContent = "Intentions de vote au Bundestag";
  const inst = new Set(sond.map(s => s.f)).size;
  $("viSource").innerHTML = `Sources : wahlrecht.de (${sond.length} sondages de ${inst} instituts depuis l'élection du 23 février ${AN(2025)}) · Bundeswahlleiterin · bundestag.de`
    + (dernier ? ` · dernier sondage : ${esc(dernier.f)}` : "");
  $("viNote").textContent = ""; $("viNote").hidden = true;
  // encadré d'explication retiré de la page : le bouton « Comprendre le système politique et électoral » s'en charge
  // (élément gardé hors de la page pour ne pas toucher au reste du code)
  const ex = document.createElement("div");
  ex.innerHTML = `<p>Les 630 députés du Bundestag sont élus à la proportionnelle : chaque électeur a deux voix, la première pour un candidat de son Wahlkreis, la seconde pour la liste d'un parti. Ce sont les secondes voix qui fixent le nombre de sièges de chaque parti, s'il obtient au moins 5 % (ou trois Wahlkreise). Aucun parti n'a la majorité seul : le chancelier est élu par une coalition d'au moins 316 députés. La prochaine élection est prévue au début de ${AN(2029)}, sauf dissolution.</p>`;
  let choix = $("vcChambre");
  if (!choix) {
    choix = document.createElement("div"); choix.id = "vcChambre"; choix.className = "lv-groupe vi-periodes vc-choix"; choix.setAttribute("role", "group"); choix.setAttribute("aria-label", "Bundestag affiché");
    choix.innerHTML = Object.entries(CHAMBRES).filter(([k]) => SIEGES_DE[k]).map(([k, t]) => `<button type="button" data-ch="${k}">${t.replace("2025", AN(2025))}</button>`).join("");
    $("viSiegesTitre").after(choix);
    choix.addEventListener("click", e => { const b = e.target.closest("button[data-ch]"); if (!b) return; etat.chambre = b.dataset.ch;
      if (etat.chambre !== "act" && etat.chambre !== groupe()) changerMode(etat.chambre === "e25" ? "e25" : "lead"); else { dessinerChambre(); dessinerPanneau(); } });
  }
  dessinerChambre();
}
function dessinerChambre() {
  if (!SIEGES_DE[etat.chambre]) etat.chambre = SIEGES_DE.proj ? "proj" : "e25";
  document.querySelectorAll("#vcChambre button").forEach(b => b.setAttribute("aria-pressed", b.dataset.ch === etat.chambre));
  const s = SIEGES_DE[etat.chambre], G = parGroupe(s);
  const premier = Object.keys(G).filter(p => p !== "VAC" && p !== "FL").sort((a, b) => G[b] - G[a])[0];
  const coal = etat.chambre === "proj" ? null : (G.Union || 0) + (G.SPD || 0);
  $("viSiegesTitre").textContent = etat.chambre === "proj" ? `${lab(premier)} : ${G[premier]} sièges, premier groupe${G[premier] >= MAJ ? " (majorité absolue)" : " · aucune majorité seul"}`
    : `${lab(premier)} : ${G[premier]} sièges · coalition CDU/CSU–SPD : ${coal}`;
  const eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  eb.innerHTML = etat.chambre === "proj" ? `Bundestag · projection du site au ${dateFr(PROJ.maj.date)}`
    : etat.chambre === "act" ? `Bundestag · composition au ${dateFr(BT.date)}` : `Bundestag · élection du 23 février ${AN(2025)}`;
  // de gauche à droite, même classement que la bande des partis (votes-quebec/partis.js)
  const parts = trierAxe(PARTIS.allemagne, ORDRE.filter(k => s[k])).map(k => ({ k, n: s[k], c: COUL[k] || COUL.AUT, nom: `${NOMS[k] || k} : ${s[k]} sièges`, bord: k === "VAC" ? "vac" : bordDe(PARTIS.allemagne, k) }));
  hemicycle($("viPlan"), parts, `sièges · majorité ${MAJ}`);
  const legende = Object.keys(s).filter(k => k !== "VAC").sort((a, b) => s[b] - s[a] || ORDRE.indexOf(a) - ORDRE.indexOf(b));
  if (s.VAC) legende.push("VAC");
  $("viLegende").innerHTML = legende.map(k => `<span style="--c:${k === "VAC" ? "var(--muted)" : COUL[k] || COUL.AUT}"><i></i>${lab(k)} <b>${s[k]}</b></span>`).join("");
}

/* ---------- carte ---------- */
const MW = 600, MH = 720;
let svg, gZ, gRid, gLand, gHach, gReg, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
function tri(parts) { return Object.entries(parts || {}).filter(([p]) => p !== "AUT" && p !== "IND").sort((a, b) => b[1] - a[1]); }
function remplir(i) {
  const c = srcCirc()[i]; if (!c) return ["var(--soft)", 1];
  if (voteMode()) return [COUL[etat.parti], Math.max(0.06, Math.min(1, partDe(c.z, etat.parti) / 50))];
  if (etat.mode === "second") { const [p, v] = tri(c.e)[1] || ["AUT", 0]; return [COUL[p] || COUL.AUT, Math.max(0.3, Math.min(1, (v - 8) / 27))]; }
  if (etat.mode === "e25z") return [COUL[c.gz] || COUL.AUT, Math.max(0.3, Math.min(1, (c.z[c.gz] - 15) / 30))];
  return [COUL[c.g] || COUL.AUT, Math.max(0.3, Math.min(1, (c.e[c.g] - 15) / 30))];
}
// vue Länder : voix de tout le Land selon le mode (projection : secondes voix projetées ; 2025 : premières voix pour
// « Élu 1re voix », secondes voix sinon)
const partsLand = L => groupe() === "e25" ? (etat.mode === "e25" ? R25.lands[L]?.e : R25.lands[L]?.z) : PROJ.lands[L];
function remplirLand(L) {
  const parts = partsLand(L); if (!parts) return ["var(--soft)", 1];
  if (voteMode()) return [COUL[etat.parti], Math.max(0.06, Math.min(1, partDe(parts, etat.parti) / 50))];
  const deux = etat.mode === "second", [p, v] = tri(parts)[deux ? 1 : 0] || ["AUT", 0];
  return [COUL[p] || COUL.AUT, Math.max(0.3, Math.min(1, deux ? (v - 8) / 27 : (v - 15) / 30))];
}
// pôle d'inaccessibilité (polylabel, Mapbox) : point le plus au cœur d'un polygone ; [x, y, rayon libre]
function polylabel(rings, precision = 0.5) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings[0]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const segDist2 = (px, py, a, b) => { let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) { const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
    dx = px - x; dy = py - y; return dx * dx + dy * dy; };
  const dist = (x, y) => { let inside = false, m = Infinity;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      m = Math.min(m, segDist2(x, y, a, b)); }
    return (inside ? 1 : -1) * Math.sqrt(m); };
  const cell = (x, y, h) => { const d = dist(x, y); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  const size = Math.min(maxX - minX, maxY - minY); if (!size) return [minX, minY, 0];
  let h = size / 2, q = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) q.push(cell(x + h, y + h, h));
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (q.length) {
    q.sort((a, b) => b.max - a.max); const c = q.shift();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2; q.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y, best.d];
}
const ANCRE = {};
function ancre(f) {
  const k = f.properties.RID ?? "L" + f.properties.REG;   // circonscription ou Land
  if (ANCRE[k]) return ANCRE[k];
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = [0, 0, -1];
  for (const poly of polys) { const c = polylabel(poly.map(r => r.map(xy => PROJ_FN(xy)))); if (c[2] > best[2]) best = c; }
  return ANCRE[k] = best;
}
const LBL_MIN_CIRC = 14, LBL_NAME = 70, NAME_ZOOM = 6;
function placerEtiquettes() {
  const el = svg.node(), px = Math.min(el.clientWidth / MW, el.clientHeight / MH) * curK;
  const hx = el.clientWidth / 2 / (px / curK), hy = el.clientHeight / 2 / (px / curK);
  gLbl.selectAll("g.vi-lab").each(function (f) {
    const [x, y, rad] = ancre(f), room = rad * px, sx = curT.applyX(x), sy = curT.applyY(y);
    const show = Math.abs(sx - MW / 2) <= hx && Math.abs(sy - MH / 2) <= hy && room >= LBL_MIN_CIRC;
    const g = d3.select(this).style("display", show ? null : "none");
    if (!show) return;
    g.select("text.vi-nom").style("display", (curK >= NAME_ZOOM || enLander()) && room >= LBL_NAME ? null : "none");
    g.selectAll("text").attr("transform", `translate(${x},${y})`).style("font-size", (10.5 / curK) + "px").style("stroke-width", (3 / curK) + "px");
  });
}
function zoomVers(f, pad = 0.85) {
  const [[x0, y0], [x1, y1]] = PATH.bounds(f);
  const k = Math.min(60, pad / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
  svg.transition().duration(reduit ? 0 : 700).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}
function construireCarte() {
  for (const g of [DATA.ridingGeo, DATA.curRegionGeo]) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  // conique conforme de Lambert centrée sur l'Allemagne
  PROJ_FN = d3.geoConicConformal().rotate([-10.4, 0]).parallels([48.7, 53.7]).fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.curRegionGeo);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { ber: boite([13.08, 52.33], [13.77, 52.68]), ruhr: boite([6.35, 50.85], [7.95, 51.75]), ham: boite([9.72, 53.38], [10.33, 53.74]),
    mun: boite([11.33, 48.03], [11.78, 48.26]), fra: boite([8.35, 49.85], [9.15, 50.32]), est: boite([9.9, 50.2], [15.05, 54.7]) });
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  // hachures : circonscriptions dont le vainqueur n'obtient pas de siège (couverture insuffisante par les secondes voix)
  svg.append("defs").html(`<pattern id="vaHach" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><rect width="2" height="5" style="fill:var(--surface)" opacity="0.75"></rect></pattern>`);
  gZ = svg.append("g");
  gRid = gZ.append("g"); gLand = gZ.append("g"); gHach = gZ.append("g"); gReg = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gRid.selectAll("path").data(DATA.ridingGeo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e, f) => choisir(f.properties.RID))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.RID); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  gReg.selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  gLand.selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-rid va-land").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => nomLand(f.properties.REG))
    .on("click", (e, f) => choisirLand(f.properties.REG))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisirLand(f.properties.REG); } })
    .on("mousemove", infobulleLand).on("mouseleave", () => { $("viTip").hidden = true; });
  ZOOM = d3.zoom().scaleExtent([1, 60]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
    .on("zoom", e => { gZ.attr("transform", e.transform); curK = e.transform.k; curT = e.transform;
      svg.select("#vaHach").attr("patternTransform", `rotate(45) scale(${1 / curK})`); placerEtiquettes(); });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.node().parentElement.addEventListener("wheel", e => e.preventDefault(), { passive: false });
  // clic hors de la carte : vue Länder, le Land choisi est désélectionné ; vue Wahlkreis, le Wahlkreis choisi
  svg.on("click", e => { if (e.target !== svg.node()) return; if (enLander()) { if (etat.reg) choisirLand(null); } else choisir(null); });
  new ResizeObserver(() => placerEtiquettes()).observe(svg.node());
  $("viZoom").addEventListener("click", e => {
    const z = e.target.closest("button")?.dataset.z; if (!z) return;
    if (z === "tout") choisirRegion(null);
    else if (z === "plus") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1.8);
    else if (z === "moins") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1 / 1.8);
    else if (PRESETS[z]) zoomVers(PRESETS[z], 0.95);
  });
  preparerPleinEcran();   // plein écran de la carte et bouton « Info » (votes-quebec/plein.js)
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; ecrireLS("viPct", etat.pct); peindre(); });
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m);
    const v = e.target.closest("button[data-vue-carte]"); if (v) changerVue(v.dataset.vueCarte); });
  $("viChips").innerHTML = CHIPS.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}">${lab(p)}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return;
    etat.parti = b.dataset.p; if (!voteMode()) etat.mode = groupe() === "e25" ? "e25vote" : "vote"; peindre(); if (sel == null) dessinerPanneau(); });
}
// boutons de mode, en groupes : futur (projection) · passé (élection de 2025). Pas de groupe « présent » : la page
// n'a pas le député actuel de chaque circonscription (le Bundestag actuel est dans l'hémicycle et le panneau)
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">Carte</span><span class="lv-groupe">${[["circ", "Wahlkreis (circonscription)"], ["lander", "Länder (régions)"]]
      .map(([v, t]) => `<button type="button" data-vue-carte="${v}" aria-pressed="${v === etat.vue}">${t}</button>`).join("")}</span></span>`
    + (CP.some(Boolean) ? `<span class="vf-mode-grp"><span class="vf-mode-lab">Projection</span><span class="lv-groupe">${[["lead", "En tête"], ["second", "Meilleur 2e"], ["vote", "Vote"]].map(bouton).join("")}</span></span>` : "")
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Élection ${AN(2025)}</span><span class="lv-groupe">${[["e25", "Élu 1re voix"], ["e25z", "2e voix en tête"], ["e25vote", "Vote"]].map(bouton).join("")}</span></span>`;
}
// Wahlkreise ⇄ Länder : chaque vue repart de toute l'Allemagne (sélection d'un Wahlkreis ou d'un Land levée, zoom remis)
function changerVue(v) {
  if (v === etat.vue) return;
  etat.vue = v; ecrireLS("vaVue", v); sel = null; etat.reg = null; $("viTip").hidden = true;
  if (curK !== 1) svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity);
  peindre(); dessinerPanneau();
}
function changerMode(m) {
  etat.mode = m;
  if (voteMode() && !etat.parti) etat.parti = "Union";
  if (etat.chambre !== groupe()) { etat.chambre = groupe(); dessinerChambre(); }
  peindre(); dessinerPanneau();
}
const sansSiege = i => { const c = srcCirc()[i]; return !enLander() && c && !c.siege && (etat.mode === "lead" || etat.mode === "e25"); };
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", voteMode() && b.dataset.p === etat.parti));
  $("viChips").setAttribute("aria-disabled", !voteMode());
  document.querySelectorAll("#viModes button[data-vue-carte]").forEach(b => b.setAttribute("aria-pressed", b.dataset.vueCarte === etat.vue));
  gRid.style("display", enLander() ? "none" : null); gLand.style("display", enLander() ? null : "none");
  gRid.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.RID); this.style.fill = c; this.style.fillOpacity = dans(f.properties.RID) ? o : o * 0.22; });
  gLand.selectAll("path").each(function (f) { const L = f.properties.REG, [c, o] = remplirLand(L); this.style.fill = c; this.style.fillOpacity = !etat.reg || etat.reg === L ? o : o * 0.3; });
  gHach.selectAll("path").data(DATA.ridingGeo.features.filter(f => sansSiege(f.properties.RID)), f => f.properties.RID)
    .join("path").attr("d", PATH).style("fill", "url(#vaHach)").style("pointer-events", "none");
  const f = enLander() ? (etat.reg ? DATA.curRegionGeo.features.find(x => x.properties.REG === etat.reg) : null)
    : sel != null ? DATA.ridingGeo.features.find(x => x.properties.RID === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  $("viPct").hidden = !voteMode(); $("viPct").setAttribute("aria-pressed", etat.pct);
  const labs = gLbl.selectAll("g.vi-lab").data(voteMode() && etat.pct ? (enLander() ? DATA.curRegionGeo.features : DATA.ridingGeo.features.filter(f => dans(f.properties.RID))) : [], f => f.properties.RID ?? "L" + f.properties.REG)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => { const parts = f.properties.RID == null ? partsLand(f.properties.REG) : srcCirc()[f.properties.RID]?.z;
    return parts ? nf(partDe(parts, etat.parti), 0) + " %" : ""; });
  labs.select("text.vi-nom").text(f => f.properties.RID == null ? nomLand(f.properties.REG) : DATA.ridings[f.properties.RID].n);
  placerEtiquettes();
  let an = $("vfAnCarte");
  if (!an) { an = document.createElement("div"); an.id = "vfAnCarte"; an.className = "vf-an-carte"; $("viCarte").before(an); }
  an.innerHTML = groupe() === "e25" ? `Élection ${AN(2025)}` : `Projection du site · ${dateFr(PROJ.maj.date)}`;
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  const quoi = groupe() === "e25" ? `résultat de ${AN(2025)}` : "projection du site";
  const hach = `<span>· hachures : vainqueur de la 1<sup>re</sup> voix sans siège (pas assez de secondes voix pour son parti dans le Land)</span>`;
  // rappel des deux voix, sous la légende des deux vues
  const VOIX = `<span class="va-voix"><b>1<sup>re</sup> voix</b> (Erststimme) : un candidat dans chaque <b>Wahlkreis</b> · <b>2<sup>e</sup> voix</b> (Zweitstimme) : la liste d'un parti dans chaque <b>Land</b>, qui fixe les sièges</span>`;
  if (enLander()) {   // vue Länder : voix de tout le Land
    const voix = groupe() === "e25" && etat.mode === "e25" ? "premières voix (candidats des Wahlkreise)" : `secondes voix (listes du Land)${groupe() === "proj" ? " projetées" : ""}`;
    $("viEchelle").innerHTML = (groupe() === "e25" ? `<b>2025</b> · ` : "") + (voteMode()
      ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· secondes voix du parti ${lab(p)} dans chaque Land (${quoi})${etat.pct ? ` · chiffre = % de ${lab(p)}` : ""}</span>`
      : `<span>Couleur : parti ${etat.mode === "second" ? "arrivé deuxième" : "en tête"} des ${voix} dans chaque Land (${quoi}). Plus la couleur est foncée, plus son score est élevé. Clique sur un Land pour son détail.</span>`) + VOIX;
    return;
  }
  $("viEchelle").innerHTML = (groupe() === "e25" ? `<b>2025</b> · ` : "") + (voteMode()
    ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· secondes voix du parti ${lab(p)} dans chaque Wahlkreis (${quoi})${etat.pct ? ` · chiffre = % de ${lab(p)}, plus de Wahlkreise en zoomant` : ""}</span>`
    : etat.mode === "e25z" ? `<span>Couleur : parti arrivé en tête des secondes voix (listes du Land) dans chaque Wahlkreis en ${AN(2025)}. Plus la couleur est foncée, plus son score est élevé.</span>`
    : `<span>Couleur : parti ${etat.mode === "second" ? "arrivé deuxième" : etat.mode === "e25" ? "élu" : "en tête"} à la 1<sup>re</sup> voix (candidat du Wahlkreis) dans chaque Wahlkreis (${quoi}). Plus la couleur est foncée, plus son score est élevé.</span>${etat.mode === "second" ? "" : hach}`) + VOIX;
}
function infobulle(e, f) {
  const i = f.properties.RID, r = DATA.ridings[i], t = $("viTip"), cp = CP[i], ce = CE[i];
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const top3 = parts => tri(parts).slice(0, 3).map(([p, v]) => `${lab(p)} ${nf(v, 0)} %`).join(" · ");
  t.innerHTML = `<b>${esc(r.n)}</b><small>${esc(reg)} · Wahlkreis ${+r.id}</small><br>`
    + (ce ? (ce.siege ? `Élu en 2025 : ${esc(ce.elu || "")} (${lab(ce.g)}, ${nf(ce.e[ce.g], 1)} %)` : `En tête en 2025 : ${lab(ce.g)} (${nf(ce.e[ce.g], 1)} %), sans siège`) + "<br>" : "")
    + (ce ? `<small>2e voix 2025 : ${top3(ce.z)}</small><br>` : "") + (cp ? `<small>Projection, 1re voix : ${top3(cp.e)}</small>` : "");
}

function infobulleLand(e, f) {
  const L = f.properties.REG, t = $("viTip"), box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const top3 = parts => tri(parts || {}).slice(0, 3).map(([p, v]) => `${lab(p)} ${nf(v, 0)} %`).join(" · ");
  const sg = d => Object.entries(d || {}).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${lab(p)} ${n}`).join(" · ");
  const n = DATA.ridings.filter(r => r.r === L).length;
  t.innerHTML = `<b>${esc(nomLand(L))}</b><small>Land · ${n} Wahlkreis${n > 1 ? "e" : ""}</small><br>`
    + (PROJ ? `<small>Projection, 2e voix : ${top3(PROJ.lands[L])}</small><br><small>Sièges (projection) : ${sg(PROJ.sieges_land[L])}</small><br>` : "")
    + `<small>2e voix 2025 : ${top3(R25.lands[L]?.z)}</small>`;
}
// clic sur un Land (vue Länder) : son panneau, sans zoomer (les autres Länder restent visibles et cliquables)
function choisirLand(L) { etat.reg = L; sel = null; peindre(); dessinerPanneau(); if (L) infoPlein(); }

/* ---------- panneau : toute l'Allemagne, un Land ou une circonscription ---------- */
function choisir(i) { sel = i; peindre(); dessinerPanneau(); if (i != null) infoPlein(); }
const jauge = (labl, coul, v, droite = "", max = 50, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${coul}">${labl}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${coul}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
const dans = i => !etat.reg || DATA.ridings[i].r === etat.reg;
const nomLand = L => DATA.regions.find(r => r.code === L)?.name || L;
function choisirRegion(L) {
  etat.reg = L; sel = null;
  if (L && !enLander()) zoomVers({ type: "FeatureCollection", features: DATA.curRegionGeo.features.filter(f => f.properties.REG === L) }, 0.9);
  else if (!enLander() || curK !== 1) svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity);
  peindre(); dessinerPanneau();
}
const selecteurRegions = () => `<details class="vc-menu"><summary>Land : <b>${etat.reg ? esc(nomLand(etat.reg)) : "Toute l'Allemagne"}</b></summary>
  <div class="vc-menu-liste">${[[null, "Toute l'Allemagne"], ...DATA.regions.map(r => [r.code, r.name])]
    .map(([k, t]) => `<button type="button" data-regsel="${k || ""}" aria-pressed="${(k || null) === etat.reg}">${esc(t)}</button>`).join("")}</div></details>`;
// tableau des sièges par Land (projection, élection de 2025 ou Bundestag actuel)
function tableLands(parLand, titre, cols) {
  const lignes = DATA.regions.filter(r => !etat.reg || r.code === etat.reg).map(r => { const n = parLand[r.code] || {};
    const tot = Object.values(n).reduce((a, b) => a + b, 0);
    return `<tr><td><button type="button" class="vi-lien" data-reg="${r.code}">${esc(r.name)}</button></td>${cols.map(p => `<td class="${n[p] ? "has" : ""}" style="--c:${COUL[p]}">${n[p] || "·"}</td>`).join("")}<td><b>${tot}</b></td></tr>`; }).join("");
  return `<span class="lv-eyebrow">${titre}</span>
    <div class="vi-table"><table><thead><tr><th>Land</th>${cols.map(p => `<th style="color:${COUL[p]}">${lab(p)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
}
const listeCirc = (items, droite) => `<ul class="vi-serres">${items.map(([i, c]) => `<li data-rid="${i}" tabindex="0" style="--c:${COUL[c.g] || COUL.AUT}"><i></i>${esc(DATA.ridings[i].n)}<b>${droite(c)}</b></li>`).join("") || "<li>Aucune</li>"}</ul>`;
function meilleures(arr, quoi) {
  if (!voteMode() || !etat.parti) return "";
  const p = etat.parti, top = arr.map((c, i) => [i, c]).filter(([i, c]) => c && partDe(c.z, p) && dans(i)).sort((a, b) => partDe(b[1].z, p) - partDe(a[1].z, p)).slice(0, 10);
  return `<span class="lv-eyebrow">Meilleurs Wahlkreise de ${lab(p)} · secondes voix (${quoi})</span>${listeCirc(top.map(([i, c]) => [i, { ...c, g: p === "Union" ? (c.z.CSU ? "CSU" : "CDU") : p }]), c => `${nf(partDe(c.z, p), 1)} %`)}`;
}
// coalitions : simple arithmétique des sièges (la CDU/CSU exclut toute coalition avec l'AfD et avec Die Linke)
const COALITIONS = [["Union", "SPD"], ["Union", "Grüne"], ["Union", "SPD", "Grüne"], ["Union", "SPD", "FDP"], ["Union", "Grüne", "FDP"], ["SPD", "Grüne", "Linke"], ["SPD", "Grüne", "FDP"], ["Union", "AfD"]];
function coalitions(sg) {
  const G = parGroupe(sg), exclue = c => c.includes("Union") && (c.includes("AfD") || c.includes("Linke"));
  const lignes = COALITIONS.filter(c => c.every(p => G[p])).map(c => [c, d3.sum(c, p => G[p])]).sort((a, b) => exclue(a[0]) - exclue(b[0]) || b[1] - a[1]);
  return `<span class="lv-eyebrow">Coalitions possibles (calcul des sièges seulement) · majorité ${MAJ}</span>
    <div class="vi-vrows">${lignes.map(([c, n]) => `<div class="vi-vrow va-proj"><b style="white-space:nowrap">${c.map(p => `<span style="color:${COUL[p]}">${lab(p)}</span>`).join(" + ")}</b><span></span><span class="vi-num"><b>${n}</b></span><span class="vi-num"><small>${exclue(c) ? "exclue" : n >= MAJ ? "majorité" : `manque ${MAJ - n}`}</small></span></div>`).join("")}</div>
    <p class="va-note">La CDU/CSU s'interdit toute coalition avec l'AfD et avec Die Linke (décision de la CDU de 2018).</p>`;
}
function dessinerPanneau() {
  const z = $("viPanneau"), g = groupe();
  if (sel == null) {
    const L = etat.reg, nomR = L ? nomLand(L) : "Toute l'Allemagne", total = DATA.ridings.filter((x, i) => dans(i)).length;
    const tete = (eb, sg, n) => { const G = parGroupe(sg), lead = Object.keys(G).filter(p => p !== "VAC" && p !== "FL").sort((a, b) => G[b] - G[a])[0];
      return `${selecteurRegions()}<span class="lv-eyebrow">${eb}</span><h3>${esc(nomR)}</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[lead]}"></i>${lab(lead)} : ${G[lead]} / ${n} sièges</span>${L ? `<span class="vi-pill">${total} Wahlkreise</span>` : `<span class="vi-pill">Majorité : ${MAJ}</span>`}</div>`; };
    const lignesVS = (vote, sg, ref, cols) => cols.filter(p => vote[p] >= 0.5 || sg[p]).sort((a, b) => (sg[b] || 0) - (sg[a] || 0) || (vote[b] || 0) - (vote[a] || 0))
      .map(p => jauge(lab(p), COUL[p] || COUL.AUT, vote[p] || 0, `<b>${sg[p] || 0}</b>${ref ? ` <small>${ecart((sg[p] || 0) - (ref[p] || 0))}</small>` : ""}`, 50, "va-proj")).join("");
    const COLS = ["CDU", "CSU", "AfD", "SPD", "Grüne", "Linke", "BSW", "FDP", "FW", "SSW"];
    if (g === "proj" && etat.chambre !== "act") {
      const N = PROJ.national, sg = L ? (PROJ.sieges_land[L] || {}) : SIEGES_DE.proj, n = L ? Object.values(sg).reduce((a, b) => a + b, 0) : SIEGES;
      const vote = L ? PROJ.lands[L] : Object.fromEntries(Object.entries(N).map(([p, x]) => [p, x.v]));
      const ref = L ? R25.lands[L].sieges : R25.sieges;
      const sans = CP.map((c, i) => [i, c]).filter(([i, c]) => c && !c.siege && dans(i));
      const serres = CP.map((c, i) => [i, c]).filter(([i, c]) => c && c.marge < 3 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      const bascules = CP.map((c, i) => [i, c]).filter(([i, c]) => c && CE[i] && c.g !== CE[i].g && dans(i));
      const m = PROJ.moyenne;
      z.innerHTML = `${tete("Projection du site · si l'élection avait lieu aujourd'hui", sg, n)}
        <p class="lv-muted">Simulation faite par cette page, pas la projection d'un institut : moyenne du dernier sondage de chacun des ${m.sondages.length} instituts publiés entre le ${dateFr(PROJ.maj.debut)} et le ${dateFr(PROJ.maj.dernier)}, puis répartition des 630 sièges selon la loi de 2023 (Sainte-Laguë, seuil de 5 %${PROJ.clause.length ? `, clause des trois Wahlkreise pour ${PROJ.clause.map(lab).join(", ")}` : ""}, SSW exempté). ${enLander() ? "Clique sur un Land pour son détail." : "Clique sur un Wahlkreis pour son détail."}</p>
        <span class="lv-eyebrow">Secondes voix (listes du Land) et sièges${L ? ` · ${esc(nomR)} (écart uniforme sur ${AN(2025)})` : ""} <small>· écart avec ${AN(2025)}</small></span>
        <div class="vi-vrows">${lignesVS(vote, sg, ref, COLS)}</div>
        ${L ? "" : `<p class="va-note">CDU et CSU : intentions de l'Union partagées selon leur rapport de ${AN(2025)} (la CSU ne se présente qu'en Bavière).${PROJ.clause.includes("CSU") ? " Sous 5 % des voix du pays, la CSU entrerait grâce à ses Wahlkreise." : ""}</p>${coalitions(sg)}`}
        ${meilleures(CP, "projection")}
        ${tableLands(PROJ.sieges_land, "Sièges par Land · projection", ["CDU", "CSU", "AfD", "SPD", "Grüne", "Linke", "BSW", "FDP", "SSW"].filter(p => SIEGES_DE.proj[p]))}
        <details class="lv-sg vf-hors"><summary><span>Wahlkreise gagnés sans siège (projection)</span><small>${sans.length}</small></summary>
        ${listeCirc(sans, c => `${lab(c.g)} <small>sans siège</small>`)}</details>
        <span class="lv-eyebrow">Les plus serrés à la première voix (moins de 3 points)</span>${listeCirc(serres.slice(0, 12), c => c.marge >= 0.05 ? `${lab(c.g)} +${nf(c.marge, 1)}` : `${lab(c.g)} <small>moins de 0,1 pt</small>`)}
        <details class="lv-sg vf-hors"><summary><span>Wahlkreise qui changeraient de parti par rapport à ${AN(2025)}</span><small>${bascules.length}</small></summary>
        ${listeCirc(bascules, c => `${lab(c.g)} <small>(${lab(CE[bascules.find(([, x]) => x === c)[0]].g)} en ${AN(2025)})</small>`)}</details>`;
      return;
    }
    if (etat.chambre === "act") {
      const A = L ? (BT.lands[L] || {}) : SIEGES_DE.act, n = Object.values(A).reduce((a, b) => a + b, 0);
      const ref = parGroupe(L ? R25.lands[L].sieges : R25.sieges, true);
      z.innerHTML = `${tete(`Bundestag · composition au ${dateFr(BT.date)}`, A, L ? n : SIEGES)}
        <p class="lv-muted">Groupe parlementaire de chaque député en exercice (bundestag.de), avec l'écart par rapport aux élus de ${AN(2025)}. La CDU et la CSU forment un seul groupe. La carte montre l'élection de ${AN(2025)} ou la projection.</p>
        <span class="lv-eyebrow">Sièges par groupe <small>· écart avec les élus de ${AN(2025)}</small></span>
        <div class="vi-vrows">${ORDRE.filter(p => A[p]).sort((a, b) => A[b] - A[a]).map(p => `<div class="vi-vrow vf-gp"><b style="color:${COUL[p]}">${lab(p)}</b><span class="vi-jauge"><i style="width:${100 * A[p] / (L ? n : 250)}%;background:${p === "VAC" ? "var(--muted)" : COUL[p]}"></i></span><span class="vi-num"><b>${A[p]}</b></span><span class="vi-num"><small>${p === "VAC" ? "" : ecart(A[p] - (ref[p] || 0))}</small></span></div>`).join("")}</div>
        ${L ? "" : `<p class="va-note">Coalition au pouvoir : CDU/CSU et SPD, ${(A.Union || 0) + (A.SPD || 0)} sièges sur ${SIEGES}. Le député du SSW, élu en ${AN(2025)}, siège parmi les non-inscrits (un groupe demande au moins 32 députés).</p>`}
        ${BT.fraktionslos.length ? `<span class="lv-eyebrow">Députés non inscrits</span><ul class="vi-serres">${BT.fraktionslos.filter(x => !L || x.land === L).map(x => `<li style="--c:var(--fl)"><i></i>${esc(x.nom)}<b>${esc(nomLand(x.land))}</b></li>`).join("") || "<li>Aucun</li>"}</ul>` : ""}
        ${tableLands(BT.lands, "Députés par Land et par groupe", ["Union", "AfD", "SPD", "Grüne", "Linke", "FL"])}`;
      return;
    }
    // élection de 2025
    const sg = L ? R25.lands[L].sieges : R25.sieges, n = L ? Object.values(sg).reduce((a, b) => a + b, 0) : SIEGES;
    const zv = L ? R25.lands[L].z : R25.z, ev = L ? R25.lands[L].e : R25.e;
    const sans = CE.map((c, i) => [i, c]).filter(([i, c]) => c && !c.siege && dans(i));
    const serres = CE.map((c, i) => [i, c]).filter(([i, c]) => c && c.marge < 3 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
    const gagnes = CE.reduce((o, c, i) => { if (c && dans(i)) o[c.g] = (o[c.g] || 0) + 1; return o; }, {});
    z.innerHTML = `${tete(`Élection du 23 février ${AN(2025)}`, sg, n)}
      <p class="lv-muted">Résultat officiel (Bundeswahlleiterin). Participation : ${nf(100 * (L ? R25.lands[L].votants / R25.lands[L].inscrits : R25.votants / R25.inscrits), 1)} %. Barres : secondes voix ; à droite, sièges obtenus.</p>
      <span class="lv-eyebrow">Secondes voix (listes du Land) et sièges${L ? ` · ${esc(nomR)}` : ""}</span>
      <div class="vi-vrows">${lignesVS(zv, sg, null, COLS)}</div>
      <span class="lv-eyebrow">Premières voix et Wahlkreise gagnés</span>
      <div class="vi-vrows">${COLS.filter(p => ev[p] >= 0.5).sort((a, b) => (gagnes[b] || 0) - (gagnes[a] || 0) || ev[b] - ev[a]).map(p => jauge(lab(p), COUL[p], ev[p], `<b>${gagnes[p] || 0}</b> <small>circ.</small>`, 50, "va-proj")).join("")}</div>
      ${meilleures(CE, "élection de " + AN(2025))}
      ${tableLands(Object.fromEntries(Object.entries(R25.lands).map(([k, x]) => [k, x.sieges])), `Sièges par Land · élus en ${AN(2025)}`, ["CDU", "CSU", "AfD", "SPD", "Grüne", "Linke", "SSW"])}
      <details class="lv-sg vf-hors"${L ? " open" : ""}><summary><span>Wahlkreise gagnés sans siège (couverture insuffisante)</span><small>${sans.length}</small></summary>
      <p class="va-note">Depuis la réforme de 2023, un parti n'a pas plus de sièges dans un Land que ses secondes voix ne lui en donnent : ses vainqueurs de Wahlkreis au plus faible pourcentage restent alors sans siège.</p>
      ${listeCirc(sans, c => `${lab(c.g)} ${nf(c.e[c.g], 1)} %`)}</details>
      <span class="lv-eyebrow">Les plus serrés en ${AN(2025)} (moins de 3 points)</span>${listeCirc(serres.slice(0, 12), c => c.marge >= 0.05 ? `${lab(c.g)} +${nf(c.marge, 1)}` : `${lab(c.g)} <small>moins de 0,1 pt</small>`)}`;
    return;
  }
  const r = DATA.ridings[sel], cp = CP[sel], ce = CE[sel], reg = nomLand(r.r);
  const lignes = (parts, g) => Object.entries(parts).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).map(([p, v]) =>
    `<div class="vi-vrow${p === g ? " win" : ""}"><b style="color:${COUL[p] || COUL.AUT}">${lab(p)}</b><span class="vi-jauge"><i style="width:${Math.min(100, v * 100 / 50)}%;background:${COUL[p] || COUL.AUT}"></i></span>`
    + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num"></span></div>`).join("");
  const replie = (titre, corps) => `<details class="lv-sg vc-replie"><summary><span>${titre}</span></summary><div class="vi-vrows">${corps}</div></details>`;
  const bloc = (titre, corps, ouvert) => ouvert ? `<span class="lv-eyebrow">${titre}</span><div class="vi-vrows">${corps}</div>` : replie(titre, corps);
  const e25 = ce ? bloc(`${AN(2025)} · première voix · Erststimme (candidat du Wahlkreis)`, lignes(ce.e, ce.g), g === "e25" && !secondes()) + bloc(`${AN(2025)} · seconde voix · Zweitstimme (liste du Land)`, lignes(ce.z, ce.gz), g === "e25" && secondes()) : "";
  const pr = cp ? bloc("Projection · première voix · Erststimme (candidat du Wahlkreis)", lignes(cp.e, cp.g), g === "proj" && !secondes()) + bloc("Projection · seconde voix · Zweitstimme (liste du Land)", lignes(cp.z, cp.gz), true) : "";
  const elu = ce ? `<p class="vi-elu" style="--c:${COUL[ce.g] || COUL.AUT}">${ce.siege ? `<b>${esc(ce.elu || "")}</b> · ${NOMS[ce.g] || ce.g} <small>(élu en 2025 avec ${nf(ce.e[ce.g], 1)} % des premières voix)</small>`
    : `<b>Aucun député de Wahlkreis</b> <small>: le candidat ${lab(ce.g)} est arrivé en tête (${nf(ce.e[ce.g], 1)} %), mais son parti n'avait pas assez de sièges dans le Land pour tous ses vainqueurs (couverture par les secondes voix).</small>`}</p>` : "";
  const pills = g === "e25" ? (ce ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[ce.g]}"></i>En tête en 2025 : ${lab(ce.g)}</span><span class="vi-pill">Avance : ${nf(ce.marge, 1)} pts</span>${ce.siege ? "" : `<span class="va-sans-siege">sans siège</span>`}<span class="vi-pill">Participation : ${nf(ce.particip, 1)} %</span></div>` : "")
    : (cp ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[cp.g]}"></i>En tête (projection) : ${lab(cp.g)}</span><span class="vi-pill">Avance : ${nf(cp.marge, 1)} pts</span>${cp.siege ? "" : `<span class="va-sans-siege">sans siège</span>`}`
      + (ce && ce.g !== cp.g ? `<span class="vi-pill">Gain sur ${lab(ce.g)} (${AN(2025)})</span>` : "") + "</div>" : "");
  z.innerHTML = `<span class="lv-eyebrow">Wahlkreis ${+r.id} · ${esc(reg)}</span><h3>${esc(r.n)}</h3>
    ${pills}
    <span class="lv-eyebrow">Député élu en ${AN(2025)}</span>${elu}
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← ${etat.reg ? esc(nomLand(etat.reg)) : "Toute l'Allemagne"}</button><button type="button" class="vi-lien" data-reg="${r.r}">${esc(reg)}</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>
      <a class="vi-lien" href="https://www.bundeswahlleiterin.de/bundestagswahlen/2025/ergebnisse/bund-99/land-${NUM_LAND[r.r]}/wahlkreis-${+r.id}.html" target="_blank" rel="noopener">Résultat officiel ↗</a></div>
    ${g === "proj" ? pr + e25 : e25 + pr}
    ${cp ? `<p class="va-note">Projection : écart uniforme (les points gagnés ou perdus par chaque parti dans la moyenne des sondages depuis ${AN(2025)}) appliqué au résultat du Wahlkreis ; estimation grossière, les sondages ne mesurant que les secondes voix au niveau national.</p>` : ""}`;
}
document.addEventListener("click", e => {
  if (!e.target.closest("#viPanneau")) return;
  const l = e.target.closest("[data-rid]"); if (l) { choisir(+l.dataset.rid); return; }
  const rs = e.target.closest("[data-regsel]"); if (rs) { choisirRegion(rs.dataset.regsel || null); return; }
  const rg = e.target.closest("[data-reg]"); if (rg) { choisirRegion(rg.dataset.reg); return; }
  if (e.target.closest("[data-tout]")) { choisirRegion(etat.reg); return; }
  if (e.target.closest("[data-zoomsel]") && sel != null) zoomVers(DATA.ridingGeo.features.find(x => x.properties.RID === sel), 0.5);
});
document.addEventListener("keydown", e => {
  const l = e.target.closest?.("#viPanneau [data-rid]"); if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(+l.dataset.rid); }
});

/* ---------- évolution des intentions de vote (secondes voix) ---------- */
let periode = lireLS("vaPeriode", 3);   // 3 derniers mois par défaut
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 74, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = SOND.sondages.filter(s => !s.e);
  const fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([t(DATE_ELECTION), d3.timeMonth.offset(fin_, -periode)]) : t(DATE_ELECTION);
  const dansP = d => t(d) >= debut;
  const sond = tous.filter(s => dansP(s.d));
  const elecVis = SOND.sondages.filter(s => s.e && dansP(s.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  $("viEvolSur").innerHTML = periode ? `${periode < 12 ? periode + " derniers mois" : "Dernière année"}` : `Depuis l'élection de ${AN(2025)}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(P, p => s[p])) || 40;
  const y = d3.scaleLinear().domain(domaineY(el, [0, Math.ceil((yMax + 4) / 10) * 10], String(periode), dessinerEvolution)).range([H - m.b, m.t]);
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien), calculée sur tous les sondages
  const SIGMA = periode && periode <= 6 ? 8 : 14, t0 = t(tous[0].d), t1 = t(tous[tous.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dansP);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= datesVis.map(d => { let a = 0, w = 0; for (const s of tous) { if (s[p] == null) continue; const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: w ? a / w : null }; }).filter(o => o.v != null);
  const nbAutour = d => tous.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 21).length;
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote au Bundestag (secondes voix) depuis 2025");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : periode && periode <= 6 ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", periode && periode <= 6 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  // seuil de 5 %
  if (y.domain()[0] < 5 && y.domain()[1] > 5) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(5)).attr("y2", y(5)).style("stroke-dasharray", "2 4");
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", m.l + 4).attr("y", y(5) - 4).text("seuil de 5 %");
  }
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of P) {
    svgE.append("g").selectAll("circle").data(sond.filter(s => s[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", periode && periode <= 12 ? 3 : 2).style("fill", COUL[p]);
    const mm = moy(p); fin[p] = mm[mm.length - 1];
    if (mm.length) svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", COUL[p]);
    svgE.append("g").selectAll("rect").data(elecVis.filter(e => e[p] != null)).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", COUL[p]);
  }
  const etiq = P.filter(p => fin[p]).map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => COUL[d.p]).text(d => `${lab(d.p)} ${nf(d.v, 0)}`);
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = datesVis.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = P.map(p => [p, moy(p).find(o => o.d === d)?.v]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±21 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${COUL[p]}"><i></i>${lab(p)} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  const inst = new Set(sond.map(s => s.f)).size;
  $("viEvolNote").textContent = `${sond.length} sondage${sond.length > 1 ? "s" : ""} de ${inst} institut${inst > 1 ? "s" : ""} sur la période (wahlrecht.de), secondes voix. Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultat de l'élection. Le BSW n'est plus publié à part par certains instituts.`;
}

/* ---------- « Comprendre le système politique et électoral » : grande fenêtre en deux parties (votes-quebec/systeme.js) ----------
   Les chiffres viennent du résultat officiel de 2025 (R25 : voix, sièges, Wahlkreise sans siège), du Bundestag
   actuel (BT) et des Wahlkreise (DATA.ridings). */
const BUNDESRAT = { BW: 6, BY: 6, BE: 4, BB: 4, HB: 3, HH: 3, HE: 5, MV: 3, NI: 6, NW: 6, RP: 4, SL: 3, SN: 4, ST: 4, SH: 4, TH: 4 };   // 69 voix
function systemeElectoral() {
  const N = DATA.ridings.length, S = R25.sieges, V = R25.z, G = parGroupe(S);
  const sg = (n, mot = "siège") => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const vz = R25.voix_z, valides = R25.valides_z;
  const qualifies = Object.keys(S), perdus = 100 - d3.sum(qualifies, p => V[p] || 0);
  const manqueBSW = Math.ceil(0.05 * valides - (vz.BSW || 0));
  const sans = R25.circ.filter(c => !c.siege), sansPar = sans.reduce((o, c) => { o[c.g] = (o[c.g] || 0) + 1; return o; }, {});
  const particip = 100 * R25.votants / R25.inscrits;
  const coal = (G.Union || 0) + (G.SPD || 0);
  const A = BT ? parGroupe(BT.groupes) : null, GP = parGroupe(S, true);   // GP : élus de 2025 par groupe (SSW parmi les non-inscrits)
  const changeA = A ? Object.keys({ ...A, ...GP }).filter(p => (A[p] || 0) !== (GP[p] || 0)) : [];
  // graphique : part des voix (secondes voix) et part des sièges en 2025, par groupe
  const partis = ["Union", "AfD", "SPD", "Grüne", "Linke", "BSW", "FDP", "SSW"];
  const voix = p => p === "Union" ? V.CDU + V.CSU : V[p] || 0, pctS = p => 100 * (G[p] || 0) / SIEGES;
  const lignes = partis.map(p => `<div class="vi-dlg-vs-ligne" style="--c:${COUL[p]}"><b>${lab(p)}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${2 * voix(p)}%"></i><i style="width:${Math.max(0.6, 2 * pctS(p))}%"></i></span>
      <small>${nf(voix(p), voix(p) < 1 ? 2 : 1)} % des voix<br>${sg(G[p] || 0)} (${nf(pctS(p), pctS(p) < 1 && pctS(p) > 0 ? 1 : 0)} %)</small></div>`).join("");
  const graphique = `<div class="vi-dlg-vs">${lignes}</div>
      <div class="vi-dlg-legende"><span>part des secondes voix</span><span>part des sièges</span></div>`;
  const tabChambre = `<table class="vi-dlg-tab"><caption>Sièges au Bundestag</caption>
      <thead><tr><th scope="col">Groupe</th><th scope="col">Élection 2025<small>${SIEGES} sièges · majorité ${MAJ}</small></th>${A ? `<th scope="col">Aujourd'hui<small>bundestag.de</small></th><th scope="col">Écart</th>` : ""}</tr></thead>
      <tbody>${ORDRE.filter(p => GP[p] || (A && A[p])).sort((a, b) => (GP[b] || 0) - (GP[a] || 0) || (A ? (A[b] || 0) - (A[a] || 0) : 0)).map(p => { const d = A ? (A[p] || 0) - (GP[p] || 0) : 0;
        return `<tr style="--c:${COUL[p]}"><th scope="row"><i></i>${lab(p)}${p === "FL" ? " <small>(dont le SSW)</small>" : ""}</th><td>${GP[p] || 0}</td>${A ? `<td><b>${A[p] || 0}</b></td><td class="${d > 0 ? "plus" : d < 0 ? "moins" : ""}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</td>` : ""}</tr>`; }).join("")}</tbody></table>`;
  const nbLand = DATA.ridings.reduce((o, r) => { o[r.r] = (o[r.r] || 0) + 1; return o; }, {});
  const tabLands = `<table class="vi-dlg-tab"><caption>Les 16 Länder : Wahlkreise, élus de 2025 et voix au Bundesrat</caption>
      <thead><tr><th scope="col">Land</th><th scope="col">Wahlkreise<small>${N} au total</small></th><th scope="col">Députés élus en 2025<small>${SIEGES} au total</small></th><th scope="col">Voix au Bundesrat<small>69 au total</small></th></tr></thead>
      <tbody>${DATA.regions.map(r => `<tr style="--c:var(--ink)"><th scope="row">${esc(r.name)}</th><td>${nbLand[r.code] || 0}</td><td><b>${Object.values(R25.lands[r.code].sieges).reduce((a, b) => a + b, 0)}</b></td><td>${BUNDESRAT[r.code]}</td></tr>`).join("")}</tbody></table>`;
  const politique = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b class="vi-dlg-long">République fédérale</b><small>régime parlementaire ; Loi fondamentale de 1949</small></div>
      <div><b>2 chambres</b><small>le Bundestag élu (${SIEGES} députés) et le Bundesrat des Länder (69 voix)</small></div>
      <div><b>${MAJ}</b><small>voix au Bundestag pour élire le chancelier (majorité absolue des membres)</small></div>
      <div><b>16 Länder</b><small>dont 3 villes-États : Berlin, Hambourg et Brême</small></div>
    </section>
    <section>
      <h3>Le régime politique</h3>
      <p>L'Allemagne est une <b>république fédérale</b> dotée d'un <b>régime parlementaire</b>. Ses règles de base sont dans la <b>Loi fondamentale</b> (Grundgesetz) du 23 mai 1949, d'abord écrite pour l'Allemagne de l'Ouest et devenue la constitution de toute l'Allemagne à la réunification, le 3 octobre 1990. Le pouvoir réel appartient au gouvernement fédéral, dirigé par le chancelier, qui dépend du Bundestag élu.</p>
      <ul>
        <li><b>Chef de l'État</b> : le <b>président fédéral</b> (Bundespräsident), élu pour cinq ans par l'Assemblée fédérale (les députés du Bundestag et autant de délégués élus par les parlements des Länder) ; il ne peut faire que deux mandats de suite. Son rôle est surtout de représentation : il signe les lois, propose un candidat au poste de chancelier et nomme les ministres sur proposition du chancelier. Frank-Walter Steinmeier occupe le poste depuis 2017 (réélu en 2022).</li>
        <li><b>Pouvoir législatif</b> : le <b>Bundestag</b>, élu par les citoyens, et le <b>Bundesrat</b>, où siègent les gouvernements des Länder.</li>
        <li><b>Pouvoir exécutif</b> : le <b>gouvernement fédéral</b>, formé du chancelier et des ministres fédéraux. Le chancelier fixe les grandes orientations de la politique du gouvernement.</li>
        <li><b>Pouvoir judiciaire</b> : la <b>Cour constitutionnelle fédérale</b>, à Karlsruhe, veille au respect de la Loi fondamentale et peut annuler une loi. Ses 16 juges sont élus pour 12 ans, moitié par le Bundestag, moitié par le Bundesrat, à la majorité des deux tiers.</li>
      </ul>
    </section>
    <section>
      <h3>Le Parlement : Bundestag et Bundesrat</h3>
      <ul>
        <li><b>Le Bundestag</b> : ${SIEGES} députés élus pour quatre ans (voir la partie <a href="#" data-aller="electoral">Système électoral</a>). Il vote les lois et le budget, élit le chancelier et contrôle le gouvernement. Sa présidente est Julia Klöckner (CDU) depuis mars 2025.</li>
        <li><b>Le Bundesrat</b> : les Länder participent aux lois fédérales par cette chambre, qui n'est pas élue directement : chaque gouvernement de Land y envoie ses membres et vote en bloc, avec 3 à 6 voix selon sa population (69 voix en tout). Son accord est obligatoire pour les lois qui touchent aux compétences ou aux finances des Länder ; pour les autres, son opposition peut être levée par un nouveau vote du Bundestag.</li>
      </ul>
    </section>
    <section>
      <h3>Qui gouverne : le chancelier et la coalition</h3>
      <p>Le chancelier (Bundeskanzler) n'est pas élu directement par les citoyens : le Bundestag l'élit, sur proposition du président fédéral, à la <b>majorité absolue de ses membres</b>, soit ${MAJ} voix sur ${SIEGES}. Comme aucun parti n'obtient seul cette majorité avec la proportionnelle, le gouvernement repose presque toujours sur une <b>coalition</b> de plusieurs partis, qui négocient un contrat de coalition après l'élection.</p>
      <ul>
        <li><b>Depuis 2025</b> : Friedrich Merz (CDU) a été élu chancelier le 6 mai 2025, au second tour de scrutin du même jour, à la tête d'une coalition de la CDU/CSU et du SPD (${coal} sièges sur ${SIEGES} à l'élection).</li>
        <li><b>Motion de censure constructive</b> : le Bundestag ne peut renverser le chancelier qu'en élisant en même temps son successeur à la majorité absolue. Cela n'a réussi qu'une fois, en 1982 (Helmut Kohl a remplacé Helmut Schmidt).</li>
        <li><b>Question de confiance</b> : le chancelier peut demander au Bundestag de lui renouveler sa confiance ; s'il la perd, le président fédéral peut dissoudre le Bundestag. C'est ce qui a mené à l'élection anticipée du 23 février 2025, après la question de confiance perdue par Olaf Scholz en décembre 2024.</li>
        <li><b>Groupes parlementaires</b> : il faut au moins 5 % des députés (32) pour former un groupe (Fraktion). La CDU et la CSU, qui ne se présentent jamais l'une contre l'autre (la CSU seulement en Bavière, la CDU ailleurs), forment un seul groupe.${A && changeA.length ? ` Depuis l'élection, la composition a changé : ${changeA.map(p => `${lab(p)} ${GP[p] || 0} → ${A[p] || 0}`).join(", ")}.` : ""}</li>
      </ul>
      ${tabChambre}
    </section>
    <section>
      <h3>L'État fédéral et les Länder</h3>
      <p>L'Allemagne compte <b>16 Länder</b>, dont trois villes-États (Berlin, Hambourg et Brême). Chacun a sa constitution, son parlement élu (Landtag, ou Bürgerschaft et Chambre des députés dans les villes-États) et son gouvernement, dirigé par un ministre-président (un bourgmestre dans les villes-États). La Fédération s'occupe notamment des affaires étrangères, de la défense et de la monnaie ; les Länder, de l'éducation, de la police, de la culture et des communes. Ce sont aussi les Länder qui appliquent la plupart des lois fédérales.</p>
      ${tabLands}
    </section>`;
  const electoral = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>2 voix</b><small>une pour un candidat du Wahlkreis, une pour la liste d'un parti</small></div>
      <div><b>${SIEGES}</b><small>sièges depuis ${AN(2025)}, répartis à la proportionnelle des secondes voix</small></div>
      <div><b>5 %</b><small>des secondes voix du pays, ou trois Wahlkreise, pour avoir des sièges</small></div>
      <div><b>4 ans</b><small>durée de la législature ; prochaine élection prévue au début de ${AN(2029)}</small></div>
    </section>
    <section>
      <h3>Deux voix sur le même bulletin</h3>
      <p>Chaque électeur a <b>deux voix</b>. Avec la <b>première voix</b> (Erststimme), il choisit un candidat dans son Wahlkreis (circonscription) : il y en a ${N}, et le candidat arrivé en tête l'emporte, au scrutin majoritaire à un tour. Avec la <b>seconde voix</b> (Zweitstimme), il choisit la liste d'un parti dans son Land. On peut donner ses deux voix à des partis différents.</p>
      <p>C'est la <b>seconde voix</b> qui compte le plus : elle fixe le nombre de sièges de chaque parti. La première voix sert à désigner une partie des personnes qui occuperont ces sièges.</p>
    </section>
    <section>
      <h3>Des voix aux sièges</h3>
      <p>Les ${SIEGES} sièges sont répartis entre les partis à la proportionnelle de leurs secondes voix dans tout le pays, par la méthode de Sainte-Laguë, puis les sièges de chaque parti sont répartis entre ses listes des 16 Länder. Dans chaque Land, les sièges d'un parti vont d'abord à ses candidats qui ont gagné un Wahlkreis, puis aux suivants de sa liste.</p>
      <ul>
        <li><b>Seuil de 5 %</b> : seuls les partis qui obtiennent au moins 5 % des secondes voix du pays ont des sièges. Exceptions : un parti qui gagne au moins <b>trois Wahlkreise</b> participe quand même à la répartition, et les <b>partis des minorités nationales</b>, comme le SSW de la minorité danoise du Schleswig-Holstein, sont exemptés du seuil.</li>
        <li><b>En ${AN(2025)}</b> : ${nf(perdus, 1)} % des secondes voix sont allées à des partis sans siège. Le BSW (${nf(V.BSW, 2)} %) a manqué le seuil d'environ ${nf(Math.round(manqueBSW / 100) * 100)} voix, et le FDP (${nf(V.FDP, 1)} %) a quitté le Bundestag. Le SSW (${nf(V.SSW, 2)} %) a obtenu ${sg(S.SSW || 0)} grâce à l'exemption.</li>
      </ul>
      ${graphique}
    </section>
    <section>
      <h3>La réforme de 2023 : 630 sièges, et des Wahlkreise sans élu</h3>
      <p>Avant, un parti qui gagnait plus de Wahlkreise dans un Land que ses secondes voix ne lui donnaient de sièges les gardait toutes (mandats excédentaires), et les autres partis recevaient des sièges de compensation : le Bundestag élu en 2021 comptait ainsi 736 députés. La réforme adoptée en 2023 fixe le Bundestag à <b>${SIEGES} sièges</b> et supprime ces deux mécanismes.</p>
      <p>En échange, gagner son Wahlkreis ne suffit plus : il faut que le parti ait assez de sièges dans le Land (<b>couverture par les secondes voix</b>, Zweitstimmendeckung). S'il en a moins que de vainqueurs, ceux qui ont le plus faible pourcentage de premières voix n'obtiennent pas de siège, et le Wahlkreis n'a pas de député élu directement. En ${AN(2025)}, c'est arrivé dans <b>${sans.length} Wahlkreise</b> sur ${N} : ${Object.entries(sansPar).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${n} ${lab(p)}`).join(", ")}.</p>
      <p>La réforme supprimait aussi l'exception des trois Wahlkreise ; la Cour constitutionnelle fédérale l'a maintenue en juillet 2024, en attendant de nouvelles règles.</p>
    </section>
    <section>
      <h3>Quand vote-t-on ?</h3>
      <p>Le Bundestag est élu pour <b>quatre ans</b>. L'élection suivante a lieu de 46 à 48 mois après la première séance du Bundestag (le 25 mars 2025 pour celui-ci), donc au <b>début de 2029</b>, un dimanche. Le Bundestag ne peut pas se dissoudre lui-même : une élection anticipée n'est possible que si le chancelier perd une question de confiance (comme en décembre 2024) ou si le Bundestag n'arrive pas à élire de chancelier à la majorité absolue.</p>
    </section>
    <section>
      <h3>Qui vote, et comment</h3>
      <p>Votent les citoyens allemands de 18 ans et plus, y compris, sous conditions, ceux qui vivent à l'étranger. On vote au bureau de vote le jour de l'élection, ou par correspondance sans avoir à se justifier. L'élection est organisée par la <b>directrice fédérale des élections</b> (Bundeswahlleiterin), qui est aussi présidente de l'Office fédéral de la statistique. En ${AN(2025)}, ${nf(R25.votants / 1e6, 1)} millions d'électeurs sur ${nf(R25.inscrits / 1e6, 1)} millions ont voté : une participation de ${nf(particip, 1)} %, la plus élevée depuis la réunification.</p>
    </section>`;
  const tuilesPol = politique.slice(0, politique.indexOf("</section>") + 10), tuilesElec = electoral.slice(0, electoral.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const politiqueCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `L'Allemagne est une <b>république fédérale</b> à régime parlementaire. Le <b>président fédéral</b> (Frank-Walter Steinmeier) est le chef de l'État, mais il a surtout un rôle de représentation.`)}
      ${point(2, `Le <b>chancelier</b> dirige le gouvernement. Il est élu par le Bundestag à la majorité absolue (${MAJ} voix sur ${SIEGES}) : presque toujours grâce à une <b>coalition</b> de plusieurs partis.`)}
      ${point(3, `Depuis mai 2025, le chancelier est <b>Friedrich Merz</b> (CDU), avec une coalition CDU/CSU–SPD (${coal} sièges).`)}
      ${point(4, `Le Bundestag ne peut renverser le chancelier qu'en élisant un successeur en même temps : c'est la <b>motion de censure constructive</b>.`)}
      ${point(5, `Les <b>16 Länder</b> ont leur parlement et leur gouvernement, et participent aux lois fédérales par le <b>Bundesrat</b> (69 voix).`)}
    </ol>`;
  const electoralCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Deux voix</b> : la 1<sup>re</sup> pour un candidat du Wahlkreis (${N} Wahlkreise), la 2<sup>e</sup> pour la liste d'un parti.`)}
      ${point(2, `<b>La 2<sup>e</sup> voix décide</b> : les ${SIEGES} sièges sont répartis à la proportionnelle des secondes voix, entre les partis qui ont au moins <b>5 %</b> (ou trois Wahlkreise ; le SSW de la minorité danoise est exempté).`)}
      ${point(3, `<b>Depuis la réforme de 2023</b>, le Bundestag a toujours ${SIEGES} sièges. Un vainqueur de Wahlkreis peut rester sans siège si son parti n'a pas assez de secondes voix dans le Land : ${sans.length} Wahlkreise en ${AN(2025)}.`)}
    </ol>
    ${graphique}
    <ol class="vi-dlg-court" start="4">
      ${point(4, `<b>Tous les quatre ans</b> (prochaine élection au début de ${AN(2029)}), sauf élection anticipée après une question de confiance perdue, comme en ${AN(2025)}.`)}
      ${point(5, `<b>Pour voter</b> : être citoyen allemand et avoir 18 ans. En ${AN(2025)}, la participation a été de ${nf(particip, 1)} %.`)}
    </ol>`;
  preparerSysteme({ sur: "Allemagne · Bundestag", titre: "Le système politique et électoral de l'Allemagne",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : la république fédérale, le président, le chancelier et sa coalition, le Bundestag, le Bundesrat et les Länder.", html: politique, court: politiqueCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on élit le Bundestag : les deux voix, la proportionnelle, le seuil de 5 %, la réforme de 2023 et le calendrier.", html: electoral, court: electoralCourt }] });
}

/* ---------- démarrage ---------- */
/* ---------- section « Les partis » (votes-quebec/partis.js) : liste cliquable, fiche de chaque parti ---------- */
function partisEnLice() {
  const N = PROJ?.national || {}, e25 = SIEGES_DE.e25 || {};
  const ordre = Object.keys(PARTIS.allemagne).filter(p => p !== "Union" && (N[p] || e25[p])).sort((a, b) => (N[b]?.s || 0) - (N[a]?.s || 0) || (N[b]?.v || 0) - (N[a]?.v || 0));
  sectionPartis(PARTIS.allemagne, ordre.map(p => ({ cle: p, etiquette: p, couleur: COUL[p],
    detail: [N[p] ? `Projection du site : <b>${N[p].s} siège${N[p].s > 1 ? "s" : ""}</b> · ${nf(N[p].v, 1)} % des secondes voix` : "", `élection de 2025 : ${e25[p] || 0} siège${(e25[p] || 0) > 1 ? "s" : ""}`].filter(Boolean).join(" · ") })), { multi: AXES.allemagne });
}

async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    const facultatif = u => lireJ(u).catch(e => { console.warn(e); return null; });
    [DATA, R25, SOND, PROJ, BT] = await Promise.all([lireJ("votes-allemagne/data.json"), lireJ("votes-allemagne/resultats-2025.json"), lireJ("votes-allemagne/sondages.json"),
      facultatif("votes-allemagne/projection.json"), facultatif("votes-allemagne/bundestag.json"), lireVerif("allemagne")]);
    if (!PROJ) { etat.mode = "e25"; etat.chambre = "e25"; }
    preparer();
    dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral(); partisEnLice();
    await equilibrerHaut(dessinerEvolution);   // colonnes du haut équilibrées avant d'afficher la page (rien ne bouge ensuite)
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vaPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
