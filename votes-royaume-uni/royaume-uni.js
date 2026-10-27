/* Votes Royaume-Uni — intentions de vote pour la Chambre des communes, même gabarit que « Votes Québec » (votes-quebec/intentions.js),
   « Votes Canada » (votes-canada/canada.js) et « Votes Alberta » (votes-alberta/alberta.js) : assemblée de type Westminster, plan de la salle.
   Projection du site (projection.json, outils/sondages_uk.py) : report proportionnel par pays (Angleterre, Écosse, pays de Galles)
   des résultats de 2024 selon la moyenne des sondages récents, fourchettes de 1000 simulations.
   Chambre actuelle : député et parti de chaque circonscription (actuel.json, API des membres du Parlement).
   Élection du 4 juillet 2024 : résultat de chacune des 650 circonscriptions (resultats-2024.json, outils/royaume_uni_fixe.py).
   Évolution : sondages nationaux depuis l'élection de 2024 (sondages.json).
   Contours des 650 circonscriptions de 2024 (Office for National Statistics) : data.json. */
import { domaineY, decouper, placerBulle } from "../votes-quebec/zoom-y.js";
import { preparerSysteme } from "../votes-quebec/systeme.js";
import { sectionPartis, PARTIS, AXES } from "../votes-quebec/partis.js";
import { equilibrerHaut } from "../votes-quebec/equilibre.js";
import { majLissage } from "../votes-quebec/lissage.js";
import { preparerPleinEcran, infoPlein } from "../votes-quebec/plein.js";
import { preparerGouvernement } from "../votes-quebec/gouvernement.js";

const SIEGES = 650, MAJ = 326;
const P = ["LAB", "CON", "REF", "LD", "VERT", "SNP", "PC"];          // pastilles de la carte
const PG = ["LAB", "CON", "REF", "LD", "VERT", "SNP"];               // courbes du graphique (le Plaid Cymru, à 1 %, ne se lirait pas)
const NOMS = { LAB: "Parti travailliste (Labour)", CON: "Parti conservateur", REF: "Reform UK", LD: "Libéraux-démocrates", VERT: "Verts (Green Party)",
  SNP: "Parti national écossais (SNP)", PC: "Plaid Cymru", SF: "Sinn Féin", DUP: "Parti unioniste démocrate (DUP)", SDLP: "Parti social-démocrate et travailliste (SDLP)",
  ALL: "Alliance", UUP: "Parti unioniste d'Ulster (UUP)", TUV: "Voix unioniste traditionnelle (TUV)", YP: "Your Party", RB: "Restore Britain",
  IND: "Indépendant", SPK: "Président de la Chambre", AUT: "Autres et indépendants", VAC: "Siège vacant" };
const COUL = { LAB: "var(--lab)", CON: "var(--con)", REF: "var(--ref)", LD: "var(--ld)", VERT: "var(--vert)", SNP: "var(--snp)", PC: "var(--pc)",
  SF: "var(--sf)", DUP: "var(--dup)", SDLP: "var(--sdlp)", ALL: "var(--all)", UUP: "var(--uup)", TUV: "var(--tuv)", YP: "var(--yp)", RB: "var(--rb)",
  IND: "var(--aut)", AUT: "var(--aut)", SPK: "var(--spk)", VAC: "var(--soft)" };
const coul = p => COUL[p] || COUL.AUT;
// départage à égalité de sièges (plan de la Chambre) ; la présidence ne siège ni au gouvernement ni dans l'opposition
const SEAT_ORDER = ["LAB", "CON", "REF", "LD", "SNP", "VERT", "PC", "SF", "DUP", "SDLP", "ALL", "UUP", "TUV", "YP", "RB", "IND", "AUT", "SPK", "VAC"];
const DATE_ELECTION = "2024-07-04", PROCHAINE = "2029-08-15";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");

// barre du haut : date des données et dernière vérification (votes-verif.json, écrit chaque jour par le pipeline aux 3 heures)
let VERIF = null;
const lireVerif = cle => fetch("votes-verif.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(v => { VERIF = v[cle] || null; }).catch(() => {});
function majBarre(nom, donnees) {
  const t = document.querySelector(".t-votes"); if (!t) return;
  t.innerHTML = `${esc(nom)} · ${donnees}${VERIF ? ` · vérifiées le ${esc(VERIF.texte)}` : ""}`;
}
const AN = a => String(a);   // années en texte normal (comme France, Canada et États-Unis)
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };

let DATA, PROJ, SOND, R24, ACTJ, CP, CE, CA, SIEGES_DE, sel = null, demarre = false;
// mode de la carte : projection (lead, second, vote), élection de 2024 (e24, e24vote), député actuel (act)
const etat = { mode: "lead", parti: null, pct: lireLS("viPct", true), chambre: "proj", reg: null };
const groupe = () => etat.mode === "act" ? "act" : etat.mode.startsWith("e24") ? "e24" : "proj";
const voteMode = () => etat.mode === "vote" || etat.mode === "e24vote";

/* ---------- données par circonscription (indice = RID, ordre des codes de l'ONS) ---------- */
function preparer() {
  const ordre = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  CP = PROJ.circ.map(c => { const o = ordre(c.s); return { g: o[0][0], parts: c.s, f: c.f, prob: c.prob, fixe: c.fixe, marge: o[0][1] - (o[1] ? o[1][1] : 0) }; });
  CE = R24.circ.map(c => {
    const parts = {};
    for (const [, p, v] of c.c) parts[p] = (parts[p] || 0) + 100 * v / c.valides;
    // vainqueur et avance d'après les candidats (les « autres partis » additionnés ne sont pas un candidat)
    return { g: c.c[0][1], parts, cands: c.c, valides: c.valides, inscrits: c.inscrits, bulletins: c.bulletins, marge: 100 * (c.c[0][2] - (c.c[1] ? c.c[1][2] : 0)) / c.valides };
  });
  CA = ACTJ ? ACTJ.circ : CE.map(c => ({ nom: c.cands[0][0], p: c.g }));
  const compte = arr => arr.reduce((s, c) => { if (c) s[c.g] = (s[c.g] || 0) + 1; return s; }, {});
  SIEGES_DE = {
    proj: Object.fromEntries(Object.entries(PROJ.national).filter(([, x]) => x.s > 0).map(([p, x]) => [p, x.s])),
    e24: compte(CE),
    act: CA.reduce((s, a) => { const k = a ? a.p : "VAC"; s[k] = (s[k] || 0) + 1; return s; }, {}),
  };
}
const etatCirc = (i, g = groupe()) => g === "e24" ? CE[i] : g === "proj" ? CP[i] : null;
const V24 = () => R24.gb.pct;   // parts de 2024 en Grande-Bretagne (comme les sondages)

/* ---------- plan de la Chambre des communes ----------
   Comme le plan de la Chambre des communes du Canada (Votes Canada), à l'horizontale : présidence à gauche, gouvernement en bas,
   opposition en haut (banquettes face à face) ; le surplus du gouvernement va au bout des banquettes d'en face. Le président
   (SPK) occupe le fauteuil. PM : premier ministre, C : chef de l'opposition officielle. */
function chambre(svgEl, seatsBy, n) {
  const S = 10, G = 2.6, STEP = S + G, AISLE = 6, C = 47, ROWS = 7, MID = 22, MARGE = 16;
  const maj = Math.floor(n / 2) + 1, govCap = maj - 1, oppCap = n - maj;
  const x0 = 56, colX = j => x0 + j * STEP + Math.floor(j / 3) * AISLE;
  const H = 2 * (MID + ROWS * STEP) + 2 * MARGE, cy = H / 2, W = colX(C - 1) + S + 8;
  const yTop = r => cy - MID - S - r * STEP, yBot = r => cy + MID + r * STEP;
  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const bench = (y, cap) => { const out = []; for (let j = 0; j < C; j++) for (let r = 0; r < ROWS; r++) out.push({ x: colX(j), y: y(r), j, r }); return out.slice(0, cap); };
  const govSlots = bench(yBot, govCap), oppSlots = bench(yTop, oppCap);
  const order = Object.keys(seatsBy).filter(p => seatsBy[p] > 0 && p !== "VAC" && p !== "SPK").sort((a, b) => seatsBy[b] - seatsBy[a] || SEAT_ORDER.indexOf(a) - SEAT_ORDER.indexOf(b));
  if (seatsBy.VAC) order.push("VAC");
  const gov = order[0], opp = order.slice(1);
  const seatsOf = p => d3.range(seatsBy[p]).map(() => ({ p }));
  const placed = [];
  const gs = seatsOf(gov), pres = seatsBy.SPK ? { p: "SPK" } : null;
  gs.slice(0, govSlots.length).forEach((s, i) => placed.push({ ...s, ...govSlots[i] }));
  const govExtra = gs.slice(govSlots.length);
  govExtra.forEach((s, i) => placed.push({ ...s, ...oppSlots[oppSlots.length - 1 - i] }));
  const oppFree = oppSlots.slice(0, oppSlots.length - govExtra.length), spare = govSlots.slice(Math.min(gs.length, govSlots.length));
  const toOpp = [], toGov = [];
  let room = oppFree.length;
  for (const p of opp) { const ss = seatsOf(p), k = Math.min(room, ss.length); toOpp.push(...ss.slice(0, k)); toGov.push(...ss.slice(k)); room -= k; }
  toOpp.forEach((s, i) => { if (oppFree[i]) placed.push({ ...s, ...oppFree[i] }); });
  toGov.forEach((s, i) => { if (spare[i]) placed.push({ ...s, ...spare[i] }); });
  const g = d3.select(svgEl); g.selectAll("*").remove();
  const txt = (x, y, t, o = {}) => g.append("text").attr("x", x).attr("y", y).attr("text-anchor", o.anchor || "middle").style("fill", o.fill || "var(--muted)")
    .style("font", `${o.w || 600} ${o.size || 7.5}px "Public Sans", system-ui, sans-serif`).style("letter-spacing", o.ls || ".04em").text(t);
  g.append("rect").attr("x", x0 - 4).attr("y", cy - MID + 6).attr("width", colX(C - 1) + S - x0 + 8).attr("height", 2 * MID - 12).attr("rx", 4).style("fill", "var(--soft)");
  const chair = g.append("rect").attr("x", 22).attr("y", cy - 9).attr("width", 18).attr("height", 18).attr("rx", 3);
  if (pres) chair.style("fill", coul("SPK")).attr("data-p", "SPK"); else chair.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 1.4);
  chair.append("title").text(pres ? "Présidence : le Speaker de la Chambre, élu par les députés, ne vote qu'en cas d'égalité." : "Présidence");
  txt(31, cy - 13, "Présidence", { size: 6.5 });
  txt(x0, H - 4, "Gouvernement", { size: 7, anchor: "start" });
  txt(x0, 10, "Opposition", { size: 7, anchor: "start" });
  txt((x0 + colX(C - 1) + S) / 2, cy + 2.6, `majorité : ${maj} sièges`, { size: 7.5 });
  for (const s of placed) {
    const r = g.append("rect").attr("x", s.x).attr("y", s.y).attr("width", S).attr("height", S).attr("rx", 2.2).attr("data-p", s.p);
    if (s.p === "VAC") r.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 0.8); else r.style("fill", coul(s.p));
    r.append("title").text(NOMS[s.p] || s.p);
  }
  const front = (p, cote) => placed.filter(s => s.p === p && s.r === 0 && (cote === "gov" ? s.y > cy : s.y < cy)).sort((a, b) => a.j - b.j)[0];
  const mark = (s, t) => { if (s) txt(s.x + S / 2, s.y + S / 2 + 2.3, t, { size: t.length > 1 ? 5.2 : 6.5, w: 800, fill: "#fff", ls: "0" }); };
  mark(front(gov, "gov"), "PM");
  if (opp[0] && opp[0] !== "VAC") mark(front(opp[0], "opp"), "C");
}

/* ---------- en-tête, plan de la Chambre ---------- */
const CHAMBRES = { proj: "Projection", act: "Chambre actuelle", e24: `Élection ${AN(2024)}` };
function dessinerTete() {
  const sond = SOND.sondages.filter(s => !s.e), dernier = sond[sond.length - 1];
  majBarre("Votes Royaume-Uni", `projection du site du ${dateFr(PROJ.maj)}${dernier ? ` · dernier sondage le ${dateFr(dernier.d)}` : ""}`);
  $("viTitre").textContent = "Intentions de vote pour la Chambre des communes";
  $("viSource").innerHTML = `Sources : ${sond.length} sondages nationaux depuis l'élection du 4 juillet ${AN(2024)}${dernier ? ` (dernier : ${esc(dernier.f)})` : ""}`
    + ` · résultats : Chambre des communes (Commons Library) · contours : Office for National Statistics · députés : Parlement · projection : simulation du site`;
  $("viNote").innerHTML = `Carte des 650 circonscriptions de ${AN(2024)} (nouveau découpage de 2023, utilisé pour la première fois le 4 juillet ${AN(2024)}). Les sondages ne couvrent pas l'Irlande du Nord, dont les 18 sièges gardent le résultat de ${AN(2024)} dans la projection. Contours : Office for National Statistics, Open Government Licence v3.0.`;
  // encadré d'explication retiré de la page : le bouton « Comprendre le système politique et électoral » s'en charge
  let choix = $("vcChambre");
  if (!choix) {
    choix = document.createElement("div"); choix.id = "vcChambre"; choix.className = "lv-groupe vi-periodes vc-choix"; choix.setAttribute("role", "group"); choix.setAttribute("aria-label", "Chambre affichée");
    choix.innerHTML = Object.entries(CHAMBRES).map(([k, t]) => `<button type="button" data-ch="${k}">${t}</button>`).join("");
    $("viSiegesTitre").after(choix);
    choix.addEventListener("click", e => { const b = e.target.closest("button[data-ch]"); if (!b) return; etat.chambre = b.dataset.ch; dessinerChambre(); });
  }
  dessinerChambre();
}
function dessinerChambre() {
  if (!SIEGES_DE[etat.chambre]) etat.chambre = "proj";
  document.querySelectorAll("#vcChambre button").forEach(b => b.setAttribute("aria-pressed", b.dataset.ch === etat.chambre));
  const s = SIEGES_DE[etat.chambre], ordre = Object.keys(s).filter(p => p !== "VAC" && p !== "SPK").sort((a, b) => s[b] - s[a]), lead = ordre[0];
  const statut = s[lead] >= MAJ ? "majoritaire" : "sans majorité";
  $("viSiegesTitre").textContent = etat.chambre === "e24" ? `${NOMS[lead]} : ${s[lead]} sièges élus, gouvernement ${statut}`
    : etat.chambre === "proj" ? `${NOMS[lead]} : ${s[lead]} sièges projetés, ${s[lead] >= MAJ ? "gouvernement majoritaire" : "aucune majorité"}` : `${NOMS[lead]} : ${s[lead]} sièges, gouvernement ${statut}`;
  const eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  eb.innerHTML = etat.chambre === "proj" ? `Chambre des communes · projection du ${dateFr(PROJ.maj)}`
    : etat.chambre === "act" ? "Chambre des communes · composition actuelle" : `Chambre des communes · élection du 4 juillet ${AN(2024)}`;
  chambre($("viPlan"), s, SIEGES);
  $("viLegende").innerHTML = [...SEAT_ORDER].filter(p => s[p]).sort((a, b) => (a === "VAC") - (b === "VAC") || s[b] - s[a])
    .map(p => `<span style="--c:${p === "VAC" ? "var(--muted)" : coul(p)}"><i></i>${p === "VAC" ? "Vacants" : p === "SPK" ? "Président" : p} <b>${s[p]}</b>`
      + (etat.chambre === "proj" && PROJ.national[p] && PROJ.national[p].smax > PROJ.national[p].smin ? ` <small>[${PROJ.national[p].smin}–${PROJ.national[p].smax}]</small>` : "") + "</span>").join("")
    + `<span><small>majorité : ${MAJ}</small></span>`;
}

/* ---------- carte ---------- */
const MW = 560, MH = 760;
let svg, gZ, gRid, gReg, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const partDe = (c, p) => (c && c.parts[p]) || 0;
const deuxieme = c => Object.entries(c.parts).sort((a, b) => b[1] - a[1])[1];
function remplir(i) {
  if (etat.mode === "act") { const a = CA[i]; return a ? [coul(a.p), 0.85] : ["var(--soft)", 1]; }
  const c = etatCirc(i);
  if (!c) return ["var(--soft)", 1];
  if (etat.mode === "second") { const [p, v] = deuxieme(c); return [coul(p), Math.max(0.3, Math.min(1, (v - 10) / 30))]; }
  if (voteMode()) return [coul(etat.parti), Math.max(0.06, Math.min(1, partDe(c, etat.parti) / 50))];
  return [coul(c.g), Math.max(0.45, Math.min(1, (partDe(c, c.g) - 10) / 35))];
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
  const k = f.properties.RID;
  if (ANCRE[k]) return ANCRE[k];
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = [0, 0, -1];
  for (const poly of polys) { const c = polylabel(poly.map(r => r.map(xy => PROJ_FN(xy))), 0.1); if (c[2] > best[2]) best = c; }
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
    g.select("text.vi-nom").style("display", curK >= NAME_ZOOM && room >= LBL_NAME ? null : "none");
    g.selectAll("text").attr("transform", `translate(${x},${y})`).style("font-size", (10.5 / curK) + "px").style("stroke-width", (3 / curK) + "px");
  });
}
function zoomVers(f, pad = 0.85) {
  const [[x0, y0], [x1, y1]] = PATH.bounds(f);
  const k = Math.min(120, pad / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
  svg.transition().duration(reduit ? 0 : 700).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}
function construireCarte() {
  for (const g of [DATA.ridingGeo, DATA.curRegionGeo]) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  // Mercator transverse centrée sur le méridien de 2° O (comme le quadrillage national britannique, « British National Grid »)
  PROJ_FN = d3.geoTransverseMercator().rotate([2, 0]).fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.ridingGeo);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { lon: boite([-0.56, 51.27], [0.34, 51.71]), bir: boite([-2.2, 52.36], [-1.65, 52.65]), man: boite([-2.55, 53.3], [-2.0, 53.62]),
    gla: boite([-4.6, 55.74], [-3.9, 56.0]), bel: boite([-6.15, 54.5], [-5.7, 54.7]) });
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gRid = gZ.append("g"); gReg = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gRid.selectAll("path").data(DATA.ridingGeo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e, f) => choisir(f.properties.RID))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.RID); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  gReg.selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  ZOOM = d3.zoom().scaleExtent([1, 120]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
    .on("zoom", e => { gZ.attr("transform", e.transform); curK = e.transform.k; curT = e.transform; placerEtiquettes(); });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.node().parentElement.addEventListener("wheel", e => e.preventDefault(), { passive: false });
  svg.on("click", e => { if (e.target === svg.node()) choisir(null); });
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
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").innerHTML = P.map(p => `<button type="button" class="vi-chip" style="--c:${coul(p)}" data-p="${p}">${p}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return;
    etat.parti = b.dataset.p; if (!voteMode()) etat.mode = groupe() === "e24" ? "e24vote" : "vote"; peindre(); if (sel == null) dessinerPanneau(); });
}
// boutons de mode, en groupes : futur (projection) · présent (Chambre actuelle) · passé (élection de 2024)
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">Projection</span><span class="lv-groupe">${[["lead", "En tête"], ["second", "Meilleur 2e"], ["vote", "Vote"]].map(bouton).join("")}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Chambre actuelle</span><span class="lv-groupe">${bouton(["act", "Députés"])}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Élection ${AN(2024)}</span><span class="lv-groupe">${[["e24", "Élu"], ["e24vote", "Vote"]].map(bouton).join("")}</span></span>`;
}
function changerMode(m) {
  etat.mode = m;
  if (voteMode() && !etat.parti) etat.parti = "REF";
  if (etat.chambre !== groupe()) { etat.chambre = groupe(); dessinerChambre(); }
  peindre(); dessinerPanneau();
}
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", voteMode() && b.dataset.p === etat.parti));
  $("viChips").setAttribute("aria-disabled", !voteMode());
  gRid.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.RID); this.style.fill = c; this.style.fillOpacity = dans(f.properties.RID) ? o : o * 0.22; });
  const f = sel != null ? DATA.ridingGeo.features.find(x => x.properties.RID === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  $("viPct").hidden = !voteMode(); $("viPct").setAttribute("aria-pressed", etat.pct);
  const labs = gLbl.selectAll("g.vi-lab").data(voteMode() && etat.pct ? DATA.ridingGeo.features : [], f => f.properties.RID)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => { const c = etatCirc(f.properties.RID); return c ? nf(partDe(c, etat.parti), 0) + " %" : ""; });
  labs.select("text.vi-nom").text(f => DATA.ridings[f.properties.RID].n);
  placerEtiquettes();
  // pastille sur la carte (visible en plein écran) : ce que montre la carte
  let an = $("vfAnCarte");
  if (!an) { an = document.createElement("div"); an.id = "vfAnCarte"; an.className = "vf-an-carte"; $("viCarte").before(an); }
  an.innerHTML = groupe() === "act" ? "Députés actuels" : groupe() === "e24" ? `Élection ${AN(2024)}` : `Projection du site · ${dateFr(PROJ.maj)}`;
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${coul(p)} 6%, var(--surface)), ${coul(p)})"></span>` : "";
  const quoi = groupe() === "e24" ? `résultat de l'élection de ${AN(2024)}` : "projection du site";
  $("viEchelle").innerHTML = (groupe() === "e24" ? `<b>${AN(2024)}</b> · ` : "") + (voteMode()
    ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· vote ${p} dans chaque circonscription (${quoi})${etat.pct ? ` · chiffre = % du ${p}, plus de circonscriptions en zoomant` : ""}</span>`
    : etat.mode === "act" ? `<span class="vf-legende">${[...SEAT_ORDER].filter(k => SIEGES_DE.act[k] && k !== "VAC").map(k => `<span style="--c:${coul(k)}"><i></i>${k === "SPK" ? "Président" : k}</span>`).join("")}</span><span>· parti du député actuel (partielles et changements de parti compris)</span>`
    : `<span>Couleur : parti ${etat.mode === "second" ? "arrivé deuxième" : etat.mode === "e24" ? "élu" : "en tête"} dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé.</span>`);
}
function infobulle(e, f) {
  const i = f.properties.RID, r = DATA.ridings[i], t = $("viTip"), a = CA[i], cp = CP[i], ce = CE[i];
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const top3 = c => Object.entries(c.parts).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([p, v]) => `${p} ${nf(v, 0)} %`).join(" · ");
  t.innerHTML = `<b>${esc(r.n)}</b><small>${esc(reg)}</small><br>${a ? `Député : ${esc(a.nom)} (${a.p === "SPK" ? "Président" : a.p})` : "Siège vacant"}<br>`
    + (cp ? `<small>${cp.fixe ? "Résultat de 2024 reconduit" : "Projection"} : ${top3(cp)}</small><br>` : "") + (ce ? `<small>Élu en ${AN(2024)} : ${ce.g} (${nf(ce.parts[ce.g], 1)} %)</small>` : "");
}

/* ---------- panneau : tout le Royaume-Uni, une région ou une circonscription ---------- */
function choisir(i) { sel = i; peindre(); dessinerPanneau(); if (i != null) infoPlein(); }
const jauge = (lab, c, v, droite = "", max = 60, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${c}">${lab}</b><span class="vi-jauge"><i style="width:${v == null ? 0 : Math.min(100, 100 * v / max)}%;background:${c}"></i></span>`
  + `<span class="vi-num">${v == null ? "–" : nf(v, 1) + " %"}</span><span class="vi-num">${droite}</span></div>`;
const REGIONS = () => Object.fromEntries(DATA.regions.map(r => [r.code, { nom: r.name, code: r.code }]));
const dans = i => !etat.reg || DATA.ridings[i].r === etat.reg;
const compter = arr => arr.reduce((o, c, i) => { if (dans(i)) { const k = c ? c.g : "VAC"; o[k] = (o[k] || 0) + 1; } return o; }, {});
function choisirRegion(k) {
  etat.reg = k; sel = null;
  if (k) zoomVers({ type: "FeatureCollection", features: DATA.curRegionGeo.features.filter(f => f.properties.REG === k) }, 0.9);
  else svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity);
  peindre(); dessinerPanneau();
}
// menu « Région » : on clique sur le bouton, puis on choisit une des 12 régions (9 d'Angleterre, Écosse, pays de Galles, Irlande du Nord)
const selecteurRegions = () => `<details class="vc-menu"><summary>Région : <b>${etat.reg ? esc(REGIONS()[etat.reg].nom) : "Tout le Royaume-Uni"}</b></summary>
  <div class="vc-menu-liste">${[[null, "Tout le Royaume-Uni"], ...DATA.regions.map(r => [r.code, r.name])]
    .map(([k, t]) => `<button type="button" data-regsel="${k || ""}" aria-pressed="${(k || null) === etat.reg}">${esc(t)}</button>`).join("")}</div></details>`;
const COURT = { NE: "Nord-Est", NW: "Nord-Ouest", YH: "Yorkshire", EM: "Midlands E.", WM: "Midlands O.", EE: "Est", LON: "Londres", SE: "Sud-Est", SW: "Sud-Ouest", SCO: "Écosse", WAL: "Galles", NI: "Irlande N." };
function tableRegions(src, titre) {
  const regs = DATA.regions.filter(r => !etat.reg || r.code === etat.reg);
  const cols = ["LAB", "CON", "REF", "LD", "VERT", "SNP", "PC"];
  const lignes = regs.map(r => { const n = Object.fromEntries(cols.map(p => [p, 0])); n.AUT = 0;
    DATA.ridings.forEach((x, i) => { if (x.r !== r.code) return; const c = src[i]; if (!c) n.AUT++; else if (n[c.g] != null) n[c.g]++; else n.AUT++; });
    const tot = DATA.ridings.filter(x => x.r === r.code).length;
    return `<tr><td><button type="button" class="vi-lien" data-reg="${r.code}" title="${esc(r.name)}">${esc(COURT[r.code] || r.name)}</button> <small>${tot}</small></td>${cols.map(p => `<td class="${n[p] ? "has" : ""}" style="--c:${coul(p)}">${n[p] || "·"}</td>`).join("")}<td class="${n.AUT ? "has" : ""}" style="--c:var(--ink)">${n.AUT || "·"}</td></tr>`; }).join("");
  return `<span class="lv-eyebrow">${titre}</span>
    <div class="vi-table vuk-table"><table><thead><tr><th>Région</th>${cols.map(p => `<th style="color:${coul(p)}">${p}</th>`).join("")}<th>Autres</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
}
const listeCirc = (items, droite) => `<ul class="vi-serres">${items.map(([i, c]) => `<li data-rid="${i}" tabindex="0" style="--c:${coul(c.g)}"><i></i>${esc(DATA.ridings[i].n)}<b>${droite(c, i)}</b></li>`).join("") || "<li>Aucune</li>"}</ul>`;
const ecart = (v, d = 0, u = "") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${nf(Math.abs(v), d)}${u}`;
const replie = (titre, corps) => `<details class="lv-sg vc-replie"><summary><span>${titre}</span></summary>${corps}</details>`;
function meilleures(arr, quoi) {
  if (!voteMode() || !etat.parti) return "";
  const p = etat.parti, top = arr.map((c, i) => [i, c]).filter(([i, c]) => c && c.parts[p] && dans(i)).sort((a, b) => b[1].parts[p] - a[1].parts[p]).slice(0, 10);
  return `<span class="lv-eyebrow">Meilleures circonscriptions du ${p} (${quoi})</span>${listeCirc(top, c => `${p} ${nf(c.parts[p], quoi === "projection" ? 0 : 1)} %`)}`;
}
// méthode de la projection
function methode() {
  const M = PROJ.moyenne, ci = PROJ.cibles, fa = PROJ.facteurs;
  const liste = l => l.map(x => `${esc(x.f)} (${dateFr(x.d)})`).join(", ");
  const parts = o => ["LAB", "CON", "REF", "LD", "VERT", "SNP", "PC"].filter(p => o[p] >= 0.5).map(p => `${p} ${nf(o[p], 1)} %`).join(" · ");
  return replie("Comment la projection est faite", `<div class="vs-methode">
    <p>1. <b>Moyenne nationale</b> : le dernier sondage de chaque firme, sur les 30 jours qui précèdent le plus récent, à poids égal : ${liste(PROJ.sondages)}. Résultat (Grande-Bretagne) : ${parts(M)}. Les autres partis (dont Restore Britain) se partagent le reste.</p>
    <p>2. <b>Trois pays</b> : l'Écosse et le pays de Galles ont leurs propres sondages (le dernier de chaque firme, 90 jours pour l'Écosse : ${liste(PROJ.ecosse)} ; 180 jours pour le pays de Galles : ${liste(PROJ.galles)}). L'Angleterre en est déduite, pour que les trois pays redonnent la moyenne nationale (poids : votes valides de ${AN(2024)}).</p>
    <p class="lv-muted">Écosse : ${parts(ci.SCO)}. Pays de Galles : ${parts(ci.WAL)}. Angleterre : ${parts(ci.ENG)}.</p>
    <p>3. <b>Report proportionnel</b> : dans chaque circonscription, la part de ${AN(2024)} de chaque parti est multipliée par un facteur propre au parti et au pays, réglé pour retrouver la moyenne du pays, puis les parts sont ramenées à 100 %. Facteurs en Angleterre : ${["LAB", "CON", "REF", "LD", "VERT"].map(p => `${p} ×${nf(fa.ENG[p], 2)}`).join(" · ")}. Un grand parti qui n'avait pas de candidat en ${AN(2024)} part de 1 %. Les indépendants et les petits partis locaux gardent leur niveau de ${AN(2024)} ; la hausse des « Autres » (nouveaux partis) est répartie également.</p>
    <p>4. <b>Irlande du Nord et présidence</b> : les 18 sièges nord-irlandais (partis différents, aucun sondage dans les moyennes) et celui du Speaker (Chorley, qui se représente sous cette étiquette) gardent le résultat de ${AN(2024)}.</p>
    <p>5. <b>Fourchettes</b> : intervalle de 90 % de 1000 simulations où le vote national de chaque parti varie (environ ±10 % de sa part, ±15 % pour les petits partis), où l'Écosse et le pays de Galles s'écartent de la tendance (environ ±10 %) et où chaque circonscription s'écarte du report (environ 15 % de chaque part). Chances : part des simulations.</p>
    <p class="vi-dlg-note">Limites : une simulation de ce genre n'est pas une prévision. Elle ignore le vote tactique (qui peut bouger beaucoup de sièges dans un système à cinq partis), les candidats locaux, les écarts régionaux dans la hausse ou la baisse d'un parti (sauf l'Écosse et le pays de Galles) et les changements de participation. Plus un parti progresse, plus l'écart entre ses voix et ses sièges dépend de ses forteresses de ${AN(2024)}.</p></div>`);
}
function dessinerPanneau() {
  const z = $("viPanneau"), N = PROJ.national, g = groupe();
  if (sel == null) {
    const R = etat.reg ? REGIONS()[etat.reg] : null, nomR = R ? R.nom : "Tout le Royaume-Uni", total = DATA.ridings.filter((x, i) => dans(i)).length;
    const act = compter(CA.map(a => a && { g: a.p })), e24 = compter(CE);
    const pills = sg => { const lead = Object.keys(sg).filter(p => p !== "VAC" && p !== "SPK").sort((a, b) => sg[b] - sg[a])[0];
      return `<div class="vi-pills"><span class="vi-pill"><i style="background:${coul(lead)}"></i>${R ? `${lead} en tête` : `${lead} ${sg[lead] >= MAJ ? "majoritaire" : "sans majorité"}`} : ${sg[lead]} / ${total}</span>`
        + `${R ? `<span class="vi-pill">${total} circonscriptions</span>` : `<span class="vi-pill">Majorité : ${MAJ}</span>`}${sg.VAC ? `<span class="vi-pill">${sg.VAC} sièges vacants</span>` : ""}</div>`; };
    const tete = (eb, sg) => `${selecteurRegions()}<span class="lv-eyebrow">${eb}</span><h3>${esc(nomR)}</h3>${pills(sg)}`;
    if (g === "proj") {
      const RP = R ? PROJ.regions[R.code] : null;
      const s = R ? RP.s : SIEGES_DE.proj;
      const vote = p => R ? RP.v[p] : (N[p] && N[p].v > 0 ? N[p].v : null);
      const fourch = p => R ? RP.fourchette[p] : N[p] ? [N[p].smin, N[p].smax] : null;
      const parts = (R ? Object.keys(RP.v) : Object.keys(N)).filter(p => (vote(p) ?? 0) >= 0.5 || s[p]).sort((a, b) => (s[b] || 0) - (s[a] || 0) || (vote(b) ?? 0) - (vote(a) ?? 0));
      const serres = CP.map((c, i) => [i, c]).filter(([i, c]) => !c.fixe && c.marge < 5 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      const bascules = CP.map((c, i) => [i, c]).filter(([i, c]) => c.g !== CE[i].g && dans(i));
      const chances = !R ? `<div class="vi-pills">${Object.keys(N).filter(p => N[p].plus >= 1 || N[p].maj >= 1).sort((a, b) => N[b].plus - N[a].plus).map(p => `<span class="vi-pill"><i style="background:${coul(p)}"></i>${p} : ${N[p].plus} % de chances d'avoir le plus de sièges · ${N[p].maj} % de majorité</span>`).join("")}</div>` : "";
      z.innerHTML = `${tete(`Projection du site · ${dateFr(PROJ.maj)}`, s)}
        <p class="lv-muted">Si l'élection avait lieu aujourd'hui, sur la carte de 650 circonscriptions. Simulation faite par le site à partir des sondages, pas une prévision. ${R ? "" : "Les parts de vote sont celles de la Grande-Bretagne (les sondages ne couvrent pas l'Irlande du Nord). "}Clique sur une circonscription pour son détail.</p>
        ${chances}
        <span class="lv-eyebrow">Vote et sièges projetés${R ? ` · ${esc(R.nom)}` : ""}</span><div class="vi-vrows">${parts.map(p => { const f = fourch(p);
          return jauge(p === "SPK" ? "Prés." : p, coul(p), vote(p), `<b>${s[p] || 0}</b>${f && f[1] > f[0] ? ` <small>${f[0]}–${f[1]}</small>` : ""}`, 40, "vc-proj"); }).join("")}</div>
        ${methode()}
        ${replie(`Par rapport à l'élection de ${AN(2024)}`, `<div class="vi-vrows">${P.filter(p => vote(p) != null).map(p => { const v24 = R ? R24.regions[R.code].pct[p] || 0 : V24()[p] || 0;
          return `<div class="vi-vrow"><b style="color:${coul(p)}">${p}</b><span class="vi-num" style="text-align:left">${ecart(vote(p) - v24, 1, " pts")} <small>de vote</small></span><span></span><span class="vi-num"><b>${ecart((s[p] || 0) - (e24[p] || 0))}</b> <small>sièges</small></span></div>`; }).join("")}</div>`)}
        ${meilleures(CP, "projection")}
        ${tableRegions(CP, "Sièges par région · parti en tête dans la projection")}
        <span class="lv-eyebrow">Les plus serrées (moins de 5 points)</span>${listeCirc(serres.slice(0, 12), c => c.marge >= 0.05 ? `${c.g} +${nf(c.marge, 1)}` : `${c.g} · égalité`)}
        <details class="lv-sg vf-hors"><summary><span>Circonscriptions qui changeraient de parti par rapport à ${AN(2024)}</span><small>${bascules.length}</small></summary>
        ${listeCirc(bascules, (c, i) => `${c.g} <small>(élu ${CE[i].g})</small>`)}</details>`;
      return;
    }
    if (g === "e24") {
      const serres = CE.map((c, i) => [i, c]).filter(([i, c]) => c.marge < 3 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      const V = R ? R24.regions[R.code].pct : R24.royaume.pct, tot = R ? R24.regions[R.code].valides : R24.royaume.valides;
      const parts = Object.keys(V).filter(p => V[p] >= 0.2 || e24[p]).sort((a, b) => (e24[b] || 0) - (e24[a] || 0) || V[b] - V[a]);
      z.innerHTML = `${tete(`Élection du 4 juillet ${AN(2024)}`, e24)}
        <p class="lv-muted">Résultat officiel dans chaque circonscription (Commons Library). ${nf(tot)} votes valides${R ? "" : `, ${nf(R24.royaume.inscrits)} électeurs inscrits : participation d'environ ${nf(100 * R24.royaume.bulletins / R24.royaume.inscrits, 1)} %`}${R ? "" : ", pour l'ensemble du Royaume-Uni"}. Pour la projection actuelle, choisis « Projection » au-dessus de la carte.</p>
        <span class="lv-eyebrow">Vote et sièges${R ? ` · ${esc(R.nom)}` : ""}</span>
        <div class="vi-vrows">${parts.map(p => jauge(p === "SPK" ? "Prés." : p, coul(p), V[p], `<b>${e24[p] || 0}</b> <small>élus</small>`, 50)).join("")}</div>
        <p class="lv-muted">AUT : indépendants et autres partis. Le Speaker (Chorley) est élu sous l'étiquette « Président » ; Sinn Féin ne siège pas à Westminster.</p>
        ${meilleures(CE, "élection de " + AN(2024))}
        ${tableRegions(CE, `Sièges par région · élus en ${AN(2024)}`)}
        <span class="lv-eyebrow">Les plus serrées en ${AN(2024)} (moins de 3 points)</span>${listeCirc(serres.slice(0, 12), c => `${c.g} +${nf(c.marge, 1)}`)}`;
      return;
    }
    const changes = CA.map((a, i) => [i, a]).filter(([i, a]) => (!a || a.note || a.p !== CE[i].g) && dans(i));
    const pres = ACTJ?.president;
    z.innerHTML = `${tete("Chambre des communes · composition actuelle", act)}
      <p class="lv-muted">Député de chaque circonscription aujourd'hui, selon le Parlement${ACTJ ? ` (liste lue le ${dateFr(ACTJ.date)})` : ""}, partielles et changements de parti compris.${pres ? ` Présidence : ${esc(pres.nom)} (${esc(pres.circ)}).` : ""}</p>
      <span class="lv-eyebrow">Sièges par parti</span>
      <div class="vi-vrows">${SEAT_ORDER.filter(p => act[p]).map(p => `<div class="vi-vrow vf-gp"><b style="color:${p === "VAC" ? "var(--muted)" : coul(p)}">${p === "VAC" ? "Vacants" : p === "SPK" ? "Président" : p}</b><span class="vi-jauge"><i style="width:${100 * act[p] / total}%;background:${p === "VAC" ? "var(--muted)" : coul(p)}"></i></span><span class="vi-num"><b>${act[p]}</b></span><span class="vi-num"><small>${p === "VAC" ? "" : `${ecart(act[p] - (e24[p] || 0))} depuis ${AN(2024)}`}</small></span></div>`).join("")}</div>
      <span class="lv-eyebrow">Changements depuis l'élection : partielles et changements de parti</span>
      <ul class="vi-serres">${changes.map(([i, a]) => `<li data-rid="${i}" tabindex="0" style="--c:${a ? coul(a.p) : "var(--muted)"}"><i></i><span>${esc(DATA.ridings[i].n)}${a ? ` · ${esc(a.nom)}` : ""}${a?.note ? `<br><small>${esc(a.note)}</small>` : ""}</span><b>${a ? (a.p === "SPK" ? "Président" : a.p) : "vacant"}</b></li>`).join("") || "<li>Aucun</li>"}</ul>
      ${tableRegions(CA.map(a => a && { g: a.p }), "Députés actuels par région")}`;
    return;
  }
  const r = DATA.ridings[sel], cp = CP[sel], ce = CE[sel], a = CA[sel], reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const lignesP = c => Object.entries(c.parts).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).map(([p, v]) =>
    `<div class="vi-vrow${p === c.g ? " win" : ""}"><b style="color:${coul(p)}">${p}</b><span class="vi-jauge"><i style="width:${Math.min(100, v * 100 / 70)}%;background:${coul(p)}"></i></span>`
    + `<span class="vi-num">${nf(v, 0)} %</span><span class="vi-num">${c.f[p] ? `<small>${nf(c.f[p][0], 0)}–${nf(c.f[p][1], 0)}</small>` : ""}</span></div>`).join("");
  const ligneE = (c, k) => { const [nom, p, v, lib] = c;
    return `<div class="vi-vrow vuk-cand${k === 0 ? " win" : ""}"><b style="color:${coul(p)}">${esc(lib || (p === "SPK" ? "Spk" : p))}</b><span class="vuk-nom">${esc(nom)}${k === 0 ? " <small>élu</small>" : ""}</span>`
      + `<span class="vi-num">${nf(100 * v / ce.valides, 1)} %</span><span class="vi-num"><small>${nf(v)} voix</small></span></div>`; };
  const lignesE = c => c.cands.slice(0, 8).map(ligneE).join("")
    + (c.cands.length > 8 ? `<details class="lv-sg vf-hors"><summary><span>Autres candidats</span><small>${c.cands.length - 8}</small></summary>${c.cands.slice(8).map((x, k) => ligneE(x, k + 8)).join("")}</details>` : "");
  const chances = Object.entries(cp.prob).map(([p, v]) => `<span class="vi-pill"><i style="background:${coul(p)}"></i>${p} ${v < 1 ? "<1" : v > 99 ? ">99" : v} %</span>`).join("");
  const blocProj = cp.fixe
    ? `<span class="lv-eyebrow">Projection du site</span><p class="lv-muted">${r.r === "NI" ? "Les sondages ne couvrent pas l'Irlande du Nord (partis différents) : la projection garde le résultat de 2024 dans cette circonscription." : "Siège du président de la Chambre, qui se représente sous cette étiquette : la projection garde le résultat de 2024."}</p>`
    : `<span class="lv-eyebrow">Projection du site · fourchette de 90 %</span><div class="vi-vrows">${lignesP(cp)}</div>
    <span class="lv-eyebrow">Chances de l'emporter</span><div class="vi-pills">${chances}</div>`;
  const blocE24 = `<span class="lv-eyebrow">Élection du 4 juillet ${AN(2024)} · ${nf(ce.valides)} votes valides, participation ${nf(100 * ce.bulletins / ce.inscrits, 0)} %</span><div class="vi-vrows">${lignesE(ce)}</div>`;
  const depute = `<p class="vi-elu" style="--c:${a ? coul(a.p) : "var(--soft)"}">${a ? `<b>${esc(a.nom)}</b> · ${NOMS[a.p] || a.p}${a.note ? ` <small>(${esc(a.note)})</small>` : ""}` : "<b>Siège vacant</b> (élection partielle à venir)"}</p>`;
  const pillsC = g === "e24" ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${coul(ce.g)}"></i>Élu en ${AN(2024)} : ${ce.g}</span><span class="vi-pill">Avance : ${nf(ce.marge, 1)} pts</span></div>`
    : `<div class="vi-pills"><span class="vi-pill"><i style="background:${coul(cp.g)}"></i>${cp.fixe ? "Résultat de 2024 reconduit" : "En tête (projection)"} : ${cp.g}</span><span class="vi-pill">Avance : ${nf(cp.marge, 1)} pts</span>`
      + (ce.g !== cp.g ? `<span class="vi-pill">Gain sur ${ce.g} (élu en ${AN(2024)})</span>` : "") + "</div>"
      + (g === "proj" && a && a.p !== ce.g && /partielle/.test(a.note || "") ? `<p class="lv-muted">Le ${a.p} a gagné la circonscription à une partielle depuis ${AN(2024)} ; la projection part du résultat de l'élection générale.</p>` : "");
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(reg)}</span><h3>${esc(r.n)}</h3>
    ${g === "act" ? depute + pillsC : pillsC}
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← ${etat.reg ? esc(REGIONS()[etat.reg].nom) : "Tout le Royaume-Uni"}</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button></div>
    ${g === "e24" ? blocE24 + replie("Projection du site", blocProj) : g === "proj" ? blocProj + replie(`Élection du 4 juillet ${AN(2024)}`, blocE24) : blocE24 + replie("Projection du site", blocProj)}
    ${g === "act" ? "" : `<span class="lv-eyebrow">Député actuel</span>${depute}`}`;
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


/* ---------- évolution des intentions de vote ---------- */
let periode = lireLS("vukPeriode", 12);   // dernière année par défaut (530 sondages depuis l'élection : lisible)
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 54, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = SOND.sondages.filter(s => !s.e);
  const fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([t(DATE_ELECTION), d3.timeMonth.offset(fin_, -periode)]) : d3.timeDay.offset(t(DATE_ELECTION), -20);
  const dans = d => t(d) >= debut;
  const sond = tous.filter(s => dans(s.d));
  const elecVis = SOND.sondages.filter(s => s.e && dans(s.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  $("viEvolSur").innerHTML = periode ? `${periode < 12 ? periode + " derniers mois" : periode === 12 ? "Dernière année" : periode / 12 + " dernières années"}` : `Depuis l'élection de ${AN(2024)}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(PG, p => s[p])) || 50;
  const y = d3.scaleLinear().domain(domaineY(el, [0, Math.ceil((yMax + 4) / 10) * 10], String(periode), dessinerEvolution)).range([H - m.b, m.t]);   // Ctrl + molette : zoom vertical
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien), calculée sur tous les sondages
  const SIGMA = periode && periode <= 6 ? 7 : 14, t0 = t(tous[0].d), t1 = t(tous[tous.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= datesVis.map(d => { let a = 0, w = 0; for (const s of tous) { if (s[p] == null) continue; const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: w > 1e-6 ? a / w : null }; });
  const nbAutour = d => tous.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 14).length;
  const ligne = d3.line().defined(o => o.v != null).x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote pour la Chambre des communes depuis 2024");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : periode && periode <= 6 ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", periode && periode <= 6 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of PG) {
    svgE.append("g").selectAll("circle").data(sond.filter(s => s[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", periode && periode <= 12 ? 2.6 : 1.8).style("fill", coul(p));
    const mm = moy(p).filter(o => o.v != null); fin[p] = mm[mm.length - 1];
    svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(moy(p))).style("stroke", coul(p));
    svgE.append("g").selectAll("rect").data(elecVis.filter(e => e[p] != null)).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", coul(p));
  }
  const etiq = PG.filter(p => fin[p]).map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => coul(d.p)).text(d => `${d.p} ${nf(d.v, 0)}`);
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      if (!datesVis.length) return;
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = datesVis.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = PG.map(p => [p, moy(p).find(o => o.d === d)?.v]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±14 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${coul(p)}"><i></i>${p} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  majLissage({ sigma: SIGMA, court: SIGMA === 14 ? 7 : null });
  $("viEvolNote").innerHTML = `${sond.length} sondage${sond.length > 1 ? "s" : ""} national${sond.length > 1 ? "ux" : ""} sur la période. Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultat de l'élection (Grande-Bretagne).`
    + ` Les firmes publient la Grande-Bretagne ou le Royaume-Uni (Irlande du Nord comprise) ; les deux sont mêlés. Le SNP et le Plaid Cymru ne se présentent qu'en Écosse et au pays de Galles, d'où leurs petits pourcentages nationaux (le Plaid Cymru n'est pas tracé). Restore Britain est compté dans les autres partis jusqu'à ce que les sondages le nomment (2026).`;
}

/* ---------- « Comprendre le système politique et électoral » : grande fenêtre en deux parties (votes-quebec/systeme.js) ----------
   Même structure que Votes Canada et Votes Alberta. Partie 1, système politique : régime, Parlement, formation du gouvernement,
   dévolution. Partie 2, système électoral : mode de scrutin, des voix aux sièges, calendrier, électeurs, carte, référendums.
   Chiffres : résultat de l'élection du 4 juillet 2024 (CE, R24), Chambre actuelle (CA, SIEGES_DE.act) et projection (PROJ). */
function systemeElectoral() {
  if (!CE || !SIEGES_DE) return;
  const N = DATA.ridings.length, nomP = p => NOMS[p] || p;
  const score = c => c.parts[c.g];
  const gagnes = CE.map((c, i) => [i, c]);
  const sousMoitie = gagnes.filter(([, c]) => score(c) < 50).length, sous40 = gagnes.filter(([, c]) => score(c) < 40).length, sous1 = gagnes.filter(([, c]) => c.marge < 1).length;
  const [iBas, cBas] = gagnes.slice().sort((a, b) => a[1].marge - b[1].marge)[0];
  const S = SIEGES_DE.e24, V = R24.royaume.pct, A = SIEGES_DE.act, PR = R24.royaume;
  const nbPays = k => DATA.ridings.filter(r => (k === "ENG" ? !["SCO", "WAL", "NI"].includes(r.r) : r.r === k)).length;
  const partis = ["LAB", "CON", "REF", "LD", "VERT"].filter(p => V[p] != null);
  const pctS = p => 100 * (S[p] || 0) / N, sg = (n, mot = "siège") => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const leadA = Object.keys(A).filter(p => p !== "VAC" && p !== "SPK").sort((a, b) => A[b] - A[a])[0];
  const partielles = CA.map((a, i) => [a, i]).filter(([a]) => a && a.partielle)
    .map(([a, i]) => `${DATA.ridings[i].n} (${dateFr(a.partielle)}, ${a.p})`);
  const lignes = partis.map(p => `<div class="vi-dlg-vs-ligne" style="--c:${coul(p)}"><b>${p}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${V[p]}%"></i><i style="width:${Math.max(0.6, pctS(p))}%"></i></span>
      <small>${nf(V[p], V[p] < 1 ? 2 : 1)} % des voix<br>${sg(S[p] || 0)} (${nf(pctS(p), 0)} %)</small></div>`).join("");
  const graphique = `<div class="vi-dlg-vs">${lignes}</div>
      <div class="vi-dlg-legende"><span>part des voix</span><span>part des sièges</span></div>`;
  const ordreA = [...SEAT_ORDER].filter(p => S[p] || A[p]);
  const tabChambre = `<table class="vi-dlg-tab"><caption>Sièges à la Chambre des communes</caption>
      <thead><tr><th scope="col">Parti</th><th scope="col">Élection ${AN(2024)}<small>${N} sièges · majorité ${MAJ}</small></th><th scope="col">Aujourd'hui<small>selon le Parlement</small></th><th scope="col">Écart</th></tr></thead>
      <tbody>${ordreA.map(p => { const d = (A[p] || 0) - (S[p] || 0);
        return `<tr style="--c:${p === "VAC" ? "var(--muted)" : coul(p)}"><th scope="row"><i></i>${p === "VAC" ? "Vacants" : p === "SPK" ? "Président" : p}</th><td>${S[p] || 0}</td><td><b>${A[p] || 0}</b></td><td class="${p === "VAC" ? "" : d > 0 ? "plus" : d < 0 ? "moins" : ""}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</td></tr>`; }).join("")}</tbody></table>`;
  const tabPays = `<table class="vi-dlg-tab"><caption>Les circonscriptions par pays</caption>
      <thead><tr><th scope="col">Pays</th><th scope="col">Circonscriptions</th><th scope="col">Élus en ${AN(2024)}</th></tr></thead>
      <tbody>${[["ENG", "Angleterre", ["LAB", "CON", "LD", "REF", "VERT"]], ["SCO", "Écosse", ["LAB", "SNP", "LD", "CON"]], ["WAL", "Pays de Galles", ["LAB", "PC", "REF", "CON", "LD"]],
        ["NI", "Irlande du Nord", ["SF", "DUP", "SDLP", "ALL", "UUP", "TUV", "IND"]]].map(([k, nom, ps]) => {
          const idx = DATA.ridings.map((r, i) => [r, i]).filter(([r]) => (k === "ENG" ? !["SCO", "WAL", "NI"].includes(r.r) : r.r === k)).map(([, i]) => i);
          const c = {}; idx.forEach(i => { c[CE[i].g] = (c[CE[i].g] || 0) + 1; });
          return `<tr style="--c:var(--ink)"><th scope="row">${nom}</th><td>${idx.length}</td><td>${ps.filter(p => c[p]).map(p => `${p} <b>${c[p]}</b>`).join(" · ")}</td></tr>`; }).join("")}</tbody></table>`;
  const pol = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b class="vi-dlg-long">Monarchie constitutionnelle</b><small>le roi, chef de l'État, ne gouverne pas</small></div>
      <div><b>2 chambres</b><small>${N} députés élus aux Communes ; les Lords ne sont pas élus</small></div>
      <div><b>${MAJ}</b><small>députés pour une majorité aux Communes</small></div>
      <div><b>4 pays</b><small>Angleterre, Écosse, pays de Galles, Irlande du Nord</small></div>
    </section>
    <section>
      <h3>Le régime politique</h3>
      <p>Le Royaume-Uni est une <b>monarchie constitutionnelle</b> et le berceau du <b>régime parlementaire</b> dit « de Westminster », du nom du palais où siège le Parlement, à Londres. Sa Constitution n'est pas réunie dans un seul texte : elle repose sur des lois, des conventions et des décisions des tribunaux. Le chef de l'État a un rôle surtout symbolique ; le pouvoir réel appartient à un gouvernement issu de la Chambre élue.</p>
      <ul>
        <li><b>Chef de l'État</b> : le roi (Charles III), qui nomme le premier ministre, sanctionne les lois (assentiment royal) et ouvre chaque session du Parlement, mais agit selon les conventions, sur l'avis de ses ministres.</li>
        <li><b>Pouvoir législatif</b> : le <b>Parlement</b>, fait du roi et de deux chambres. La <b>Chambre des communes</b> compte ${N} députés élus ; la <b>Chambre des lords</b> n'est pas élue (pairs nommés, pour la plupart à vie). Les lois passent par les deux, mais les Communes l'emportent : les Lords peuvent retarder un projet de loi, non le bloquer.</li>
        <li><b>Pouvoir exécutif</b> : le <b>premier ministre</b> et le Cabinet, choisis parmi les parlementaires et responsables devant les Communes.</li>
        <li><b>Pouvoir judiciaire</b> : des tribunaux indépendants du gouvernement ; au sommet, la Cour suprême du Royaume-Uni (depuis 2009).</li>
      </ul>
    </section>
    <section>
      <h3>Qui gouverne : le gouvernement responsable</h3>
      <p>Les électeurs ne choisissent pas le premier ministre : ils élisent ${N} députés, un par circonscription, puis le gouvernement doit garder la <b>confiance de la majorité des Communes</b>.</p>
      <ul>
        <li><b>Premier ministre</b> : le roi nomme la personne la plus susceptible d'avoir la confiance des Communes, en pratique le chef du parti qui a le plus de sièges. Il ou elle forme le gouvernement, dirige le Cabinet et propose la date de l'élection.</li>
        <li><b>Majorité</b> : ${MAJ} députés sur ${N}. En pratique la <b>majorité de travail</b> est un peu plus basse : le <b>Speaker</b> (président de la Chambre, élu par les députés et neutre) et ses trois adjoints ne votent pas, et les 7 députés du Sinn Féin, qui refusent de prêter serment au roi, ne siègent pas. Sans majorité, un parti gouverne en minorité ou avec un accord de soutien (« confidence and supply »).</li>
        <li><b>Opposition officielle</b> : le deuxième parti, dont le chef est chef de l'opposition et dirige un « cabinet fantôme » qui surveille chaque ministre. Elle a des droits particuliers dans les débats.</li>
        <li><b>En ${AN(2024)}</b> : le ${nomP("LAB")} a fait élire ${S.LAB} députés (${nf(pctS("LAB"), 0)} % des sièges avec ${nf(V.LAB, 1)} % des voix) et forme le gouvernement depuis le 5 juillet ${AN(2024)} ; les conservateurs, avec ${S.CON} sièges, forment l'opposition officielle. Depuis, des partielles et des changements de parti ont changé la composition : la Chambre compte aujourd'hui ${SEAT_ORDER.filter(p => A[p] && p !== "VAC").map(p => `${A[p]} ${p === "SPK" ? "Président" : p}`).join(", ")}.</li>
      </ul>
      ${tabChambre}
    </section>
    <section>
      <h3>Quatre pays, quatre parlements</h3>
      <p>Depuis 1998, la <b>dévolution</b> a donné des pouvoirs à un Parlement écossais (Holyrood), à un Parlement gallois (le Senedd) et à une Assemblée d'Irlande du Nord, tous élus selon des modes de scrutin proportionnels ou mixtes : santé, éducation, transports, une grande part de la justice. Le Parlement de Westminster garde la défense, la politique étrangère, la monnaie, la sécurité sociale pour l'essentiel et la fiscalité nationale. L'Angleterre, plus peuplée que les trois autres réunis, n'a pas de parlement propre : ses affaires sont traitées à Westminster.</p>
      <p>Les partis changent d'un pays à l'autre : le <b>SNP</b> (Écosse) et le <b>Plaid Cymru</b> (pays de Galles) ne se présentent que chez eux ; en Irlande du Nord, aucun des grands partis britanniques ne gagne de siège, et les 18 circonscriptions se jouent entre unionistes (DUP, UUP, TUV) et nationalistes (Sinn Féin, SDLP), avec Alliance au centre. Les sondages nationaux ne couvrent pas l'Irlande du Nord, d'où la projection de cette page qui y garde le résultat de ${AN(2024)}.</p>
    </section>`;
  const elec = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>${N}</b><small>circonscriptions, un député chacune</small></div>
      <div><b>1 tour</b><small>le candidat qui a le plus de voix est élu</small></div>
      <div><b class="vi-dlg-long">5 ans au plus</b><small>durée d'une législature ; élection avant le ${dateFr(PROCHAINE)}</small></div>
      <div><b>${sous40}</b><small>députés sur ${N} élus en ${AN(2024)} avec moins de 40 % des voix</small></div>
    </section>
    <section>
      <h3>Le mode de scrutin : majoritaire à un tour</h3>
      <p>Les députés sont élus au <b>scrutin majoritaire uninominal à un tour</b> (« first past the post »). Dans chacune des ${N} circonscriptions, les électeurs votent une fois, pour un candidat ; celui qui obtient le plus de voix devient le député, même sans majorité. Une élection générale, ce sont ${N} courses en même temps. En ${AN(2011)}, un référendum sur le vote alternatif (classement des candidats) a été rejeté par environ deux électeurs sur trois.</p>
      <p>Avec cinq partis nationaux, la victoire se joue souvent avec très peu : en ${AN(2024)}, ${sous40} députés ont été élus avec moins de 40 % des voix et seulement ${N - sousMoitie} avec la majorité absolue ; ${sous1} circonscriptions se sont jouées à moins d'un point. La plus serrée : ${esc(DATA.ridings[iBas].n)}, gagnée par le ${cBas.g} par ${nf(cBas.cands[0][2] - cBas.cands[1][2])} voix.</p>
      ${tabPays}
    </section>
    <section>
      <h3>Des voix aux sièges</h3>
      <p>Les sièges ne suivent pas les voix : seul compte le nombre de circonscriptions gagnées. En ${AN(2024)}, le ${nomP("LAB")} a obtenu ${nf(V.LAB, 1)} % des voix et ${S.LAB} sièges (${nf(pctS("LAB"), 0)} %), avec ${nf(PR.voix.LAB / 1e6, 1)} millions de voix, soit moins qu'en ${AN(2017)}. À l'inverse, Reform UK a recueilli ${nf(V.REF, 1)} % des voix (${nf(PR.voix.REF / 1e6, 1)} millions) pour ${sg(S.REF || 0)} : ses voix, réparties partout, n'arrivaient en tête que dans quelques circonscriptions. Les libéraux-démocrates, dont le vote est concentré dans des circonscriptions qu'ils visent, ont obtenu ${S.LD} sièges avec ${nf(V.LD, 1)} %.</p>
      ${graphique}
      <p>C'est ce qui rend la projection de cette page délicate : quand les voix se divisent entre cinq partis, un petit déplacement de quelques points peut faire changer des dizaines de sièges, d'où les fourchettes de la page. Les petits partis régionaux (SNP, Plaid Cymru, partis nord-irlandais) gagnent des sièges grâce à leur concentration géographique.</p>
    </section>
    <section>
      <h3>Quand vote-t-on ?</h3>
      <p>Une législature dure <b>cinq ans au plus</b> depuis sa première séance. Depuis la loi de ${AN(2022)} (<i>Dissolution and Calling of Parliament Act</i>), le premier ministre peut demander au roi de dissoudre le Parlement quand il le veut, comme avant ${AN(2011)} ; le Parlement s'éteint de lui-même au bout de cinq ans. Le Parlement élu le 4 juillet ${AN(2024)} se termine donc au plus tard en ${AN(2029)} : l'élection doit avoir lieu <b>au plus tard le ${dateFr(PROCHAINE)}</b>. Par tradition, on vote un jeudi. Quand un siège se libère (décès, démission, exclusion), une <b>élection partielle</b> a lieu dans cette circonscription seulement${partielles.length ? ` : depuis ${AN(2024)}, ${partielles.join(" ; ")}` : ""}.</p>
    </section>
    <section>
      <h3>Qui vote, et comment</h3>
      <p>Pour voter, il faut avoir 18 ans le jour du vote, être inscrit sur les listes et être citoyen britannique, irlandais ou d'un pays du Commonwealth résidant au Royaume-Uni. Depuis ${AN(2023)} (<i>Elections Act 2022</i>), il faut aussi présenter une <b>pièce d'identité avec photo</b> pour voter en personne en Grande-Bretagne. On vote dans sa circonscription, en personne, par la poste ou par procuration. Chaque circonscription a son propre officier de scrutin (un fonctionnaire de la municipalité), et la <b>Commission électorale</b> surveille les élections et le financement des partis. En ${AN(2024)}, ${nf(PR.valides)} votes valides ont été comptés pour ${nf(PR.inscrits)} électeurs inscrits : une participation d'environ ${nf(100 * PR.bulletins / PR.inscrits, 0)} %, l'une des plus basses depuis le début du suffrage universel.</p>
    </section>
    <section>
      <h3>La carte électorale : ${N} sièges</h3>
      <p>Quatre commissions de délimitation indépendantes (Angleterre, Écosse, pays de Galles, Irlande du Nord) redessinent la carte tous les huit ans environ, pour que chaque circonscription compte à peu près le même nombre d'électeurs (environ 73 000, à 5 % près, sauf exceptions insulaires). La révision de ${AN(2023)} a conservé ${N} sièges et rendu la carte plus égale ; elle a servi pour la première fois le 4 juillet ${AN(2024)}. L'Angleterre y compte ${nbPays("ENG")} sièges, l'Écosse ${nbPays("SCO")}, le pays de Galles ${nbPays("WAL")} et l'Irlande du Nord ${nbPays("NI")}. Le siège du Speaker (Chorley) n'est traditionnellement pas disputé par les grands partis : les travaillistes, les conservateurs, les libéraux-démocrates et Reform UK n'y avaient pas de candidat en ${AN(2024)}.</p>
    </section>
    <section>
      <h3>Référendums</h3>
      <p>Le Parlement est souverain : les référendums ne sont pas obligatoires, mais le gouvernement en convoque parfois. Le dernier au niveau national, le 23 juin ${AN(2016)}, a vu ${nf(51.9, 1)} % des électeurs choisir de quitter l'Union européenne (le « Brexit »). Les référendums sur la dévolution (1997, 1998) et sur l'indépendance de l'Écosse (2014, rejetée à 55 %) étaient régionaux.</p>
      <p class="vi-dlg-note">Pour le Canada, qui a hérité du même régime, voir la page <a href="votes-canada.html">Votes Canada</a>.</p>
    </section>`;
  const tuilesPol = pol.slice(0, pol.indexOf("</section>") + 10), tuilesElec = elec.slice(0, elec.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const polCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `Le Royaume-Uni est une <b>monarchie constitutionnelle</b> : le roi est le chef de l'État, mais il ne gouverne pas.`)}
      ${point(2, `Le Parlement a <b>deux chambres</b> : la Chambre des communes (${N} députés élus) et la Chambre des lords (non élue). Les Communes ont le dernier mot.`)}
      ${point(3, `Le chef du parti qui a le plus de sièges aux Communes devient <b>premier ministre</b> et forme le gouvernement, qui doit garder la confiance des députés.`)}
      ${point(4, `Il faut <b>${MAJ} sièges</b> pour avoir la majorité. En ${AN(2024)}, le ${leadA === "LAB" ? "Parti travailliste" : nomP("LAB")} en a obtenu ${S.LAB} ; la Chambre en compte ${A.LAB} aujourd'hui pour les travaillistes, ${A.CON} pour les conservateurs, ${A.LD} pour les libéraux-démocrates et ${A.REF || 0} pour Reform UK.`)}
      ${point(5, `L'Écosse, le pays de Galles et l'Irlande du Nord ont leur propre parlement pour la santé et l'éducation, mais votent tous pour la Chambre des communes.`)}
    </ol>`;
  const elecCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Un vote, un tour</b> : dans chacune des ${N} circonscriptions, le candidat qui a le plus de voix est élu, même sans majorité.`)}
      ${point(2, `<b>Sièges et voix très éloignés</b> : en ${AN(2024)}, le Labour a eu ${nf(V.LAB, 1)} % des voix et ${S.LAB} sièges ; Reform UK, ${nf(V.REF, 1)} % des voix et ${sg(S.REF || 0)}.`)}
    </ol>
    ${graphique}
    <ol class="vi-dlg-court" start="3">
      ${point(3, `<b>Au plus tard le ${dateFr(PROCHAINE)}</b> : une législature dure cinq ans au plus ; le premier ministre peut demander une élection plus tôt. On vote un jeudi.`)}
      ${point(4, `<b>Pour voter</b> : 18 ans, être inscrit, et une pièce d'identité avec photo en personne. La Commission électorale surveille le scrutin.`)}
      ${point(5, `<b>Carte de ${AN(2024)}</b> : ${N} circonscriptions, ${nbPays("ENG")} en Angleterre, ${nbPays("SCO")} en Écosse, ${nbPays("WAL")} au pays de Galles et ${nbPays("NI")} en Irlande du Nord.`)}
    </ol>`;
  preparerSysteme({ sur: "Royaume-Uni · Chambre des communes", titre: "Le système politique et électoral du Royaume-Uni",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : le régime, le Parlement, la formation du gouvernement et la place des quatre pays.", html: pol, court: polCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on choisit les députés : le mode de scrutin, des voix aux sièges, le calendrier, les électeurs et la carte.", html: elec, court: elecCourt }] });
}

/* ---------- bande « Partis en lice » (votes-quebec/partis.js) ---------- */
function partisEnLice() {
  const N = PROJ.national, e24 = SIEGES_DE.e24 || {}, act = SIEGES_DE.act || {};
  const cles = ["LAB", "CON", "REF", "LD", "VERT", "SNP", "PC", "RB", "YP", "SF", "DUP", "SDLP", "ALL", "UUP", "TUV"].filter(p => PARTIS.royaumeuni[p]);
  sectionPartis(PARTIS.royaumeuni, cles.map(p => ({ cle: p, etiquette: p, couleur: coul(p),
    detail: [N[p] && N[p].s ? `Projection : <b>${N[p].s} siège${N[p].s > 1 ? "s" : ""}</b>${N[p].smax > N[p].smin ? ` (${N[p].smin}–${N[p].smax})` : ""}${N[p].v > 0 ? ` · ${nf(N[p].v, 1)} % des voix` : ""}` : N[p] && N[p].v > 0 ? `Projection : 0 siège · ${nf(N[p].v, 1)} % des voix` : "",
      `Chambre actuelle : ${act[p] || 0} siège${(act[p] || 0) > 1 ? "s" : ""}`, `élection de ${AN(2024)} : ${e24[p] || 0} siège${(e24[p] || 0) > 1 ? "s" : ""}`].filter(Boolean).join(" · ") })), { multi: AXES.royaumeuni });
}

/* ---------- fenêtre « Gouvernement actuel » (votes-quebec/gouvernement.js) : Chambre des communes actuelle en haut, gouvernement dessous ---------- */
async function gouvernement() {
  const g = await fetch("votes-royaume-uni/gouvernement.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
  preparerGouvernement({ donnees: g, pays: "Royaume-Uni", couleur: p => coul(p), dessiner: svg => {
    const s = SIEGES_DE.act, ordre = Object.keys(s).filter(p => p !== "VAC" && p !== "SPK").sort((a, b) => s[b] - s[a]), lead = ordre[0];
    chambre(svg, s, SIEGES);
    return { eyebrow: "Chambre des communes · composition actuelle", titre: `${NOMS[lead] || lead} : ${s[lead]} sièges, gouvernement ${s[lead] >= MAJ ? "majoritaire" : "minoritaire"}`,
      legende: [...SEAT_ORDER].filter(p => s[p]).sort((a, b) => (a === "VAC") - (b === "VAC") || s[b] - s[a])
        .map(p => `<span style="--c:${p === "VAC" ? "var(--muted)" : coul(p)}"><i></i>${p === "VAC" ? "Vacants" : p === "SPK" ? "Président" : p} <b>${s[p]}</b></span>`).join(""),
      note: "Composition actuelle d'après la liste des députés du Parlement (partielles et changements de parti compris)." };
  } });
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, PROJ, SOND, R24, ACTJ] = await Promise.all([lireJ("votes-royaume-uni/data.json"), lireJ("votes-royaume-uni/projection.json"), lireJ("votes-royaume-uni/sondages.json"),
      lireJ("votes-royaume-uni/resultats-2024.json"), lireJ("votes-royaume-uni/actuel.json").catch(() => null), lireVerif("royaume-uni")]);
    preparer();
    dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral(); partisEnLice();
    gouvernement();   // fenêtre « Gouvernement actuel » (votes-quebec/gouvernement.js) : sans attendre le fichier
    await equilibrerHaut(dessinerEvolution);   // colonnes du haut équilibrées avant d'afficher la page (rien ne bouge ensuite)
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vukPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");   // affiche la page (données prêtes, ou message d'erreur)
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
