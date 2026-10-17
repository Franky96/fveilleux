/* Votes Alberta — intentions de vote provinciales, même gabarit que « Votes Québec » (votes-quebec/intentions.js) et
   « Votes Canada » (votes-canada/canada.js : assemblée de type Westminster, plan de la salle).
   Projection du site (projection.json, outils/sondages_ab.py) : report proportionnel régional (Calgary, Edmonton, reste
   de l'Alberta) des résultats de 2023 selon la moyenne des sondages récents, fourchettes de 2000 simulations.
   Assemblée actuelle : député et caucus de chaque circonscription (actuel.json, assembly.ab.ca).
   Élection du 29 mai 2023 : résultat officiel de chaque circonscription (resultats-2023.json, outils/alberta_fixe.py).
   Évolution : sondages provinciaux depuis l'élection de 2023 (sondages.json).
   Contours des 87 circonscriptions (carte de 2017, utilisée en 2019 et en 2023) : data.json. */
import { domaineY, decouper, placerBulle } from "../votes-quebec/zoom-y.js";
import { preparerSysteme } from "../votes-quebec/systeme.js";
import { sectionPartis, PARTIS } from "../votes-quebec/partis.js";
import { equilibrerHaut } from "../votes-quebec/equilibre.js";
import { preparerPleinEcran, infoPlein } from "../votes-quebec/plein.js";

const SIEGES = 87, MAJ = 44;
const P = ["UCP", "NPD", "PT", "LIB", "VERT"];                       // pastilles de la carte et courbes du graphique
const NOMS = { UCP: "Parti conservateur uni", NPD: "Nouveau Parti démocratique", PT: "Progressive Tory", LIB: "Parti libéral", VERT: "Parti vert",
  RPA: "Parti républicain", IND: "Indépendant", WLC: "Wildrose Loyalty Coalition", TIP: "Independence Party", SM: "Solidarity Movement",
  WIPA: "Wildrose Independence", APA: "Advantage Party", "CP-A": "Parti communiste", REF: "Reform Party", BPA: "Buffalo Party",
  PAPA: "Pro-Life Alberta", AUT: "Autres", VAC: "Siège vacant" };
const COUL = { UCP: "var(--ucp)", NPD: "var(--npd)", PT: "var(--pt)", LIB: "var(--lib)", VERT: "var(--vert)", RPA: "var(--rpa)",
  IND: "var(--aut)", AUT: "var(--aut)", VAC: "var(--soft)" };
const coul = p => COUL[p] || COUL.AUT;
const SEAT_ORDER = ["UCP", "NPD", "PT", "LIB", "VERT", "IND", "AUT", "VAC"];   // départage à égalité de sièges (plan de l'Assemblée)
const DATE_ELECTION = "2023-05-29", PROCHAINE = "2027-10-18";
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
const jourMois = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long" }).replace(/^1 /, "1er ");
const dateAn = iso => `${jourMois(iso)} ${AN(iso.slice(0, 4))}`;
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };

let DATA, PROJ, SOND, R23, ACTJ, CP, CE, CA, SIEGES_DE, sel = null, demarre = false;
// mode de la carte : projection (lead, second, vote), élection de 2023 (e23, e23vote), député actuel (act)
const etat = { mode: "lead", parti: null, pct: lireLS("viPct", true), chambre: "proj", reg: null };
const groupe = () => etat.mode === "act" ? "act" : etat.mode.startsWith("e23") ? "e23" : "proj";
const voteMode = () => etat.mode === "vote" || etat.mode === "e23vote";

/* ---------- données par circonscription (indice = RID, numéro − 1) ---------- */
function preparer() {
  const ordre = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  CP = PROJ.circ.map(c => { const o = ordre(c.s); return { g: o[0][0], parts: c.s, f: c.f, prob: c.prob, marge: o[0][1] - (o[1] ? o[1][1] : 0) }; });
  CE = R23.circ.map(c => {
    const parts = {};
    for (const [, p, v] of c.c) parts[p] = (parts[p] || 0) + 100 * v / c.valides;
    const o = ordre(parts); return { g: o[0][0], parts, cands: c.c, valides: c.valides, inscrits: c.inscrits, bulletins: c.bulletins, marge: o[0][1] - o[1][1] };
  });
  CA = ACTJ ? ACTJ.circ : CE.map(c => ({ nom: c.cands[0][0], p: c.g }));
  const compte = arr => arr.reduce((s, c) => { if (c) s[c.g] = (s[c.g] || 0) + 1; return s; }, {});
  SIEGES_DE = {
    proj: Object.fromEntries(Object.entries(PROJ.national).filter(([, x]) => x.s > 0).map(([p, x]) => [p, x.s])),
    e23: compte(CE),
    act: CA.reduce((s, a) => { const k = a ? a.p : "VAC"; s[k] = (s[k] || 0) + 1; return s; }, {}),
  };
}
const etatCirc = (i, g = groupe()) => g === "e23" ? CE[i] : g === "proj" ? CP[i] : null;
const V23 = () => R23.province.pct;

/* ---------- plan de l'Assemblée législative ----------
   Comme le plan de la Chambre des communes (Votes Canada), à l'horizontale : présidence à gauche, gouvernement en bas,
   opposition en haut (banquettes face à face) ; le surplus du gouvernement va au bout des banquettes d'en face.
   PM : première ministre, C : chef de l'opposition officielle. */
function chambre(svgEl, seatsBy, n) {
  const S = 10, G = 2.6, STEP = S + G, AISLE = 6, C = 15, ROWS = 3, MID = 22, MARGE = 16;
  const maj = Math.floor(n / 2) + 1, govCap = maj - 1, oppCap = n - maj;
  const x0 = 56, colX = j => x0 + j * STEP + Math.floor(j / 3) * AISLE;
  const H = 2 * (MID + ROWS * STEP) + 2 * MARGE, cy = H / 2, W = colX(C - 1) + S + 8;
  const yTop = r => cy - MID - S - r * STEP, yBot = r => cy + MID + r * STEP;
  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const bench = (y, cap) => { const out = []; for (let j = 0; j < C; j++) for (let r = 0; r < ROWS; r++) out.push({ x: colX(j), y: y(r), j, r }); return out.slice(0, cap); };
  const govSlots = bench(yBot, govCap), oppSlots = bench(yTop, oppCap);
  const order = Object.keys(seatsBy).filter(p => seatsBy[p] > 0 && p !== "VAC").sort((a, b) => seatsBy[b] - seatsBy[a] || SEAT_ORDER.indexOf(a) - SEAT_ORDER.indexOf(b));
  if (seatsBy.VAC) order.push("VAC");
  const gov = order[0], opp = order.slice(1);
  const seatsOf = p => d3.range(seatsBy[p]).map(() => ({ p }));
  const placed = [];
  const gs = seatsOf(gov), pres = gs.length ? gs.splice(0, 1)[0] : null;
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
  if (pres) chair.style("fill", coul(pres.p)).attr("data-p", pres.p); else chair.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 1.4);
  chair.append("title").text(pres ? `Présidence : député ${pres.p}, compté dans ses ${seatsBy[pres.p]} sièges. Il ne vote qu'en cas d'égalité.` : "Présidence");
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

/* ---------- en-tête, plan de l'Assemblée ---------- */
const CHAMBRES = { proj: "Projection", act: "Assemblée actuelle", e23: `Élection ${AN(2023)}` };
function dessinerTete() {
  const sond = SOND.sondages.filter(s => !s.e), dernier = sond[sond.length - 1];
  majBarre("Votes Alberta", `projection du site du ${dateFr(PROJ.maj)}${dernier ? ` · dernier sondage le ${dateFr(dernier.d)}` : ""}`);
  $("viTitre").textContent = "Intentions de vote provinciales";
  $("viSource").innerHTML = `Sources : ${sond.length} sondages provinciaux depuis l'élection du 29 mai ${AN(2023)}${dernier ? ` (dernier : ${esc(dernier.f)})` : ""}`
    + ` · résultats et carte : Elections Alberta · députés : Assemblée législative · projection : simulation du site`;
  $("viNote").innerHTML = `Carte des 87 circonscriptions de ${AN(2017)}, utilisée en ${AN(2019)} et en ${AN(2023)}. La prochaine élection se fera sans doute sur une nouvelle carte de 91 sièges : un comité de députés doit la proposer au plus tard le 2 novembre 2026. Tant qu'elle n'est pas publiée, la projection reste sur la carte actuelle. Contours : Open Government Licence – Alberta.`;
  let ex = $("vfExplic");
  if (!ex) { ex = document.createElement("div"); ex.id = "vfExplic"; ex.className = "vf-explic"; $("viNote").before(ex); }
  ex.innerHTML = `<p>Les 87 députés de l'Assemblée législative de l'Alberta sont élus au scrutin majoritaire à un tour, un par circonscription : le candidat qui a le plus de voix l'emporte, même sans majorité. Le parti qui a la confiance de l'Assemblée forme le gouvernement ; avec 44 sièges ou plus, il est majoritaire. Prochaine élection : à date fixe le 18 octobre ${AN(2027)} (elle peut être devancée).</p>`;
  let choix = $("vcChambre");
  if (!choix) {
    choix = document.createElement("div"); choix.id = "vcChambre"; choix.className = "lv-groupe vi-periodes vc-choix"; choix.setAttribute("role", "group"); choix.setAttribute("aria-label", "Assemblée affichée");
    choix.innerHTML = Object.entries(CHAMBRES).map(([k, t]) => `<button type="button" data-ch="${k}">${t}</button>`).join("");
    $("viSiegesTitre").after(choix);
    choix.addEventListener("click", e => { const b = e.target.closest("button[data-ch]"); if (!b) return; etat.chambre = b.dataset.ch; dessinerChambre(); });
  }
  dessinerChambre();
}
function dessinerChambre() {
  if (!SIEGES_DE[etat.chambre]) etat.chambre = "proj";
  document.querySelectorAll("#vcChambre button").forEach(b => b.setAttribute("aria-pressed", b.dataset.ch === etat.chambre));
  const s = SIEGES_DE[etat.chambre], ordre = Object.keys(s).filter(p => p !== "VAC").sort((a, b) => s[b] - s[a]), lead = ordre[0];
  const statut = s[lead] >= MAJ ? "majoritaire" : "minoritaire";
  $("viSiegesTitre").textContent = etat.chambre === "e23" ? `${NOMS[lead]} : ${s[lead]} sièges élus, gouvernement ${statut}`
    : etat.chambre === "proj" ? `${NOMS[lead]} : ${s[lead]} sièges projetés, gouvernement ${statut}` : `${NOMS[lead]} : ${s[lead]} sièges, gouvernement ${statut}`;
  const eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  eb.innerHTML = etat.chambre === "proj" ? `Assemblée législative · projection du ${dateFr(PROJ.maj)}`
    : etat.chambre === "act" ? "Assemblée législative · composition actuelle" : `Assemblée législative · élection du 29 mai ${AN(2023)}`;
  chambre($("viPlan"), s, SIEGES);
  $("viLegende").innerHTML = [...SEAT_ORDER].filter(p => s[p]).sort((a, b) => (a === "VAC") - (b === "VAC") || s[b] - s[a])
    .map(p => `<span style="--c:${p === "VAC" ? "var(--muted)" : coul(p)}"><i></i>${p === "VAC" ? "Vacants" : p} <b>${s[p]}</b>`
      + (etat.chambre === "proj" && PROJ.national[p] ? ` <small>[${PROJ.national[p].smin}–${PROJ.national[p].smax}]</small>` : "") + "</span>").join("")
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
  if (voteMode()) return [coul(etat.parti), Math.max(0.06, Math.min(1, partDe(c, etat.parti) / 70))];
  return [coul(c.g), Math.max(0.3, Math.min(1, (partDe(c, c.g) - 25) / 40))];
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
  // Mercator transverse centrée sur le méridien de 115° O (comme la projection officielle « 10TM » de l'Alberta)
  PROJ_FN = d3.geoTransverseMercator().rotate([115, 0]).fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.ridingGeo);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { cal: boite([-114.32, 50.84], [-113.86, 51.22]), edm: boite([-113.72, 53.39], [-113.27, 53.68]),
    rd: boite([-114.05, 52.17], [-113.62, 52.40]), leth: boite([-113.0, 49.6], [-112.7, 49.78]), sud: boite([-115.2, 49.0], [-110.0, 52.0]) });
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
    etat.parti = b.dataset.p; if (!voteMode()) etat.mode = groupe() === "e23" ? "e23vote" : "vote"; peindre(); if (sel == null) dessinerPanneau(); });
}
// boutons de mode, en groupes : futur (projection) · présent (Assemblée actuelle) · passé (élection de 2023)
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">Projection</span><span class="lv-groupe">${[["lead", "En tête"], ["second", "Meilleur 2e"], ["vote", "Vote"]].map(bouton).join("")}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Assemblée actuelle</span><span class="lv-groupe">${bouton(["act", "Députés"])}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Élection ${AN(2023)}</span><span class="lv-groupe">${[["e23", "Élu"], ["e23vote", "Vote"]].map(bouton).join("")}</span></span>`;
}
function changerMode(m) {
  etat.mode = m;
  if (voteMode() && !etat.parti) etat.parti = "UCP";
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
  an.innerHTML = groupe() === "act" ? "Députés actuels" : groupe() === "e23" ? `Élection ${AN(2023)}` : `Projection du site · ${dateFr(PROJ.maj)}`;
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${coul(p)} 6%, var(--surface)), ${coul(p)})"></span>` : "";
  const quoi = groupe() === "e23" ? `résultat de l'élection de ${AN(2023)}` : "projection du site";
  $("viEchelle").innerHTML = (groupe() === "e23" ? `<b>2023</b> · ` : "") + (voteMode()
    ? `<span>0 %</span>${ramp}<span>70 % et +</span><span>· vote ${p} dans chaque circonscription (${quoi})${etat.pct ? ` · chiffre = % du ${p}, plus de circonscriptions en zoomant` : ""}</span>`
    : etat.mode === "act" ? `<span class="vf-legende">${[...SEAT_ORDER].filter(k => SIEGES_DE.act[k] && k !== "VAC").map(k => `<span style="--c:${coul(k)}"><i></i>${k}</span>`).join("")}</span><span>· caucus du député actuel (partielles et changements de caucus compris)</span>`
    : `<span>Couleur : parti ${etat.mode === "second" ? "arrivé deuxième" : etat.mode === "e23" ? "élu" : "en tête"} dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé.</span>`);
}
function infobulle(e, f) {
  const i = f.properties.RID, r = DATA.ridings[i], t = $("viTip"), a = CA[i], cp = CP[i], ce = CE[i];
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const top3 = c => Object.entries(c.parts).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([p, v]) => `${p} ${nf(v, 0)} %`).join(" · ");
  t.innerHTML = `<b>${esc(r.n)}</b><small>${esc(reg)}</small><br>${a ? `Député : ${esc(a.nom)} (${a.p})` : "Siège vacant"}<br>`
    + (cp ? `<small>Projection : ${top3(cp)}</small><br>` : "") + (ce ? `<small>Élu en 2023 : ${ce.g} (${nf(ce.parts[ce.g], 1)} %)</small>` : "");
}

/* ---------- panneau : toute l'Alberta, une région ou une circonscription ---------- */
function choisir(i) { sel = i; peindre(); dessinerPanneau(); if (i != null) infoPlein(); }
const jauge = (lab, c, v, droite = "", max = 60, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${c}">${lab}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${c}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
const REGIONS = () => Object.fromEntries(DATA.regions.map(r => [r.code, { nom: r.name, code: r.code }]));
const dans = i => !etat.reg || DATA.ridings[i].r === etat.reg;
const compter = arr => arr.reduce((o, c, i) => { if (dans(i)) { const k = c ? c.g : "VAC"; o[k] = (o[k] || 0) + 1; } return o; }, {});
function choisirRegion(k) {
  etat.reg = k; sel = null;
  if (k) zoomVers({ type: "FeatureCollection", features: DATA.curRegionGeo.features.filter(f => f.properties.REG === k) }, 0.9);
  else svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity);
  peindre(); dessinerPanneau();
}
// menu « Région » : on clique sur le bouton, puis on choisit la région des sondeurs
const selecteurRegions = () => `<details class="vc-menu"><summary>Région : <b>${etat.reg ? esc(REGIONS()[etat.reg].nom) : "Toute l'Alberta"}</b></summary>
  <div class="vc-menu-liste">${[[null, "Toute l'Alberta"], ...DATA.regions.map(r => [r.code, r.name])]
    .map(([k, t]) => `<button type="button" data-regsel="${k || ""}" aria-pressed="${(k || null) === etat.reg}">${esc(t)}</button>`).join("")}</div></details>`;
function tableRegions(src, titre) {
  const regs = DATA.regions.filter(r => !etat.reg || r.code === etat.reg);
  const cols = ["UCP", "NPD", "PT"];
  const lignes = regs.map(r => { const n = Object.fromEntries(cols.map(p => [p, 0])); n.AUT = 0;
    DATA.ridings.forEach((x, i) => { if (x.r !== r.code) return; const c = src[i]; if (!c) n.AUT++; else if (n[c.g] != null) n[c.g]++; else n.AUT++; });
    const tot = DATA.ridings.filter(x => x.r === r.code).length;
    return `<tr><td><button type="button" class="vi-lien" data-reg="${r.code}">${esc(r.name)}</button> <small>${tot}</small></td>${cols.map(p => `<td class="${n[p] ? "has" : ""}" style="--c:${coul(p)}">${n[p] || "·"}</td>`).join("")}<td class="${n.AUT ? "has" : ""}" style="--c:var(--ink)">${n.AUT || "·"}</td></tr>`; }).join("");
  return `<span class="lv-eyebrow">${titre}</span>
    <div class="vi-table"><table><thead><tr><th>Région</th>${cols.map(p => `<th style="color:${coul(p)}">${p}</th>`).join("")}<th>Autres</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
}
const listeCirc = (items, droite) => `<ul class="vi-serres">${items.map(([i, c]) => `<li data-rid="${i}" tabindex="0" style="--c:${coul(c.g)}"><i></i>${esc(DATA.ridings[i].n)}<b>${droite(c, i)}</b></li>`).join("") || "<li>Aucune</li>"}</ul>`;
const ecart = (v, d = 0, u = "") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${nf(Math.abs(v), d)}${u}`;
const replie = (titre, corps) => `<details class="lv-sg vc-replie"><summary><span>${titre}</span></summary>${corps}</details>`;
function meilleures(arr, quoi) {
  if (!voteMode() || !etat.parti) return "";
  const p = etat.parti, top = arr.map((c, i) => [i, c]).filter(([i, c]) => c && c.parts[p] && dans(i)).sort((a, b) => b[1].parts[p] - a[1].parts[p]).slice(0, 10);
  return `<span class="lv-eyebrow">Meilleures circonscriptions du ${p} (${quoi})</span>${listeCirc(top, c => `${p} ${nf(c.parts[p], quoi === "projection" ? 0 : 1)} %`)}`;
}
// méthode de la projection, et comparaison avec 338Canada (la seule autre projection publique complète)
function methode() {
  const M = PROJ.moyenne, rq = PROJ.rapports, nomR = k => REGIONS()[k].nom;
  const liste = l => l.map(x => `${esc(x.f)} (${dateFr(x.d)})`).join(", ");
  return replie("Comment la projection est faite", `<div class="vs-methode">
    <p>1. <b>Moyenne provinciale</b> : le sondage le plus récent de chaque firme, sur les 90 jours qui précèdent le dernier, à poids égal : ${liste(PROJ.sondages)}. Résultat : UCP ${nf(M.UCP, 1)} %, NPD ${nf(M.NPD, 1)} %. Les petits partis se partagent le reste selon les sondages qui les nomment.</p>
    <p>2. <b>Trois régions</b> : Calgary (circonscriptions 01 à 26), Edmonton (27 à 46) et le reste de l'Alberta (47 à 87, banlieues comprises). Les sondeurs ne découpent pas leurs régions comme les circonscriptions (souvent la région métropolitaine) : on compare donc le rapport « région / province » de l'UCP et du NPD dans les sondages régionaux récents (${liste(PROJ.regionaux)}) au même rapport dans les sondages régionaux de la première année après l'élection, et on applique cet écart aux résultats réels de ${AN(2023)}. Les trois régions sont ensuite calées pour redonner la moyenne provinciale.</p>
    <p>3. <b>Report proportionnel</b> : dans chaque circonscription, les parts de ${AN(2023)} de l'UCP et du NPD sont multipliées par un même facteur pour toute la région, réglé pour retrouver la moyenne régionale. Les petits partis reçoivent la même part partout : leur vote de ${AN(2023)}, sur des listes incomplètes, ne dit pas où ils sont forts.</p>
    <p>4. <b>Fourchettes</b> : intervalle de 90 % de 2000 simulations où le vote provincial varie (environ ±3 points par parti), où chaque région s'écarte de la tendance (environ ±3 points sur l'écart UCP-NPD) et chaque circonscription aussi (environ 8 % de chaque part). Chances : part des simulations.</p>
    <p class="vi-dlg-note">À comparer : <b>338Canada</b> (Philippe J. Fournier), projection du 26 septembre ${AN(2026)} : UCP 45 sièges [34–63], NPD 42 [24–53], avec UCP 48 % et NPD 43 %. Sa mise à jour précède les sondages Léger et Abacus d'octobre, plus serrés ; ses fourchettes, plus larges, ne sont pas calculées de la même façon.</p>
    <p class="lv-muted">Rapports région / province retenus : ${REG_ORDRE.map(k => `${esc(nomR(k))} UCP ${nf(rq[k][0], 2)} · NPD ${nf(rq[k][1], 2)}`).join(" ; ")}.</p></div>`);
}
const REG_ORDRE = ["cal", "edm", "rest"];
function dessinerPanneau() {
  const z = $("viPanneau"), N = PROJ.national, g = groupe();
  if (sel == null) {
    const R = etat.reg ? REGIONS()[etat.reg] : null, nomR = R ? R.nom : "Toute l'Alberta", total = DATA.ridings.filter((x, i) => dans(i)).length;
    const act = compter(CA.map(a => a && { g: a.p })), e23 = compter(CE);
    const pills = sg => { const lead = Object.keys(sg).filter(p => p !== "VAC").sort((a, b) => sg[b] - sg[a])[0];
      return `<div class="vi-pills"><span class="vi-pill"><i style="background:${coul(lead)}"></i>${R ? `${lead} en tête` : `${lead} ${sg[lead] >= MAJ ? "majoritaire" : "minoritaire"}`} : ${sg[lead]} / ${total}</span>`
        + `${R ? `<span class="vi-pill">${total} circonscriptions</span>` : `<span class="vi-pill">Majorité : ${MAJ}</span>`}${sg.VAC ? `<span class="vi-pill">${sg.VAC} sièges vacants</span>` : ""}</div>`; };
    const tete = (eb, sg) => `${selecteurRegions()}<span class="lv-eyebrow">${eb}</span><h3>${esc(nomR)}</h3>${pills(sg)}`;
    if (g === "proj") {
      const RP = R ? PROJ.regions[R.code] : null;
      const s = R ? RP.s : SIEGES_DE.proj;
      const vote = p => R ? RP.v[p] : N[p]?.v;
      const fourch = p => R ? RP.fourchette[p] : N[p] ? [N[p].smin, N[p].smax] : null;
      const parts = (R ? Object.keys(RP.v) : Object.keys(N)).filter(p => vote(p) >= 0.5 || s[p]).sort((a, b) => (s[b] || 0) - (s[a] || 0) || vote(b) - vote(a));
      const serres = CP.map((c, i) => [i, c]).filter(([i, c]) => c.marge < 5 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      const bascules = CP.map((c, i) => [i, c]).filter(([i, c]) => c.g !== CE[i].g && dans(i));
      const chances = !R ? `<div class="vi-pills">${["UCP", "NPD"].map(p => `<span class="vi-pill"><i style="background:${coul(p)}"></i>${p} : ${N[p].plus} % de chances d'avoir le plus de sièges</span>`).join("")}</div>` : "";
      z.innerHTML = `${tete(`Projection du site · ${dateFr(PROJ.maj)}`, s)}
        <p class="lv-muted">Si l'élection avait lieu aujourd'hui, sur la carte actuelle de 87 circonscriptions. Simulation faite par le site à partir des sondages, pas une prévision. Clique sur une circonscription pour son détail.</p>
        ${chances}
        <span class="lv-eyebrow">Vote et sièges projetés${R ? ` · ${esc(R.nom)}` : ""}</span><div class="vi-vrows">${parts.map(p => { const f = fourch(p);
          return jauge(p, coul(p), vote(p), `<b>${s[p] || 0}</b>${f && f[1] ? ` <small>${f[0]}–${f[1]}</small>` : ""}`, 60, "vc-proj"); }).join("")}</div>
        ${methode()}
        ${replie(`Par rapport à l'élection de ${AN(2023)}`, `<div class="vi-vrows">${["UCP", "NPD", "PT", "LIB", "VERT"].filter(p => vote(p) != null).map(p => { const v23 = R ? R23.regions[R.code].pct[p] || 0 : V23()[p] || 0;
          return `<div class="vi-vrow"><b style="color:${coul(p)}">${p}</b><span class="vi-num" style="text-align:left">${ecart(vote(p) - v23, 1, " pts")} <small>de vote</small></span><span></span><span class="vi-num"><b>${ecart((s[p] || 0) - (e23[p] || 0))}</b> <small>sièges</small></span></div>`; }).join("")}</div>`)}
        ${meilleures(CP, "projection")}
        ${tableRegions(CP, "Sièges par région · parti en tête dans la projection")}
        <span class="lv-eyebrow">Les plus serrées (moins de 5 points)</span>${listeCirc(serres.slice(0, 12), c => c.marge >= 0.05 ? `${c.g} +${nf(c.marge, 1)}` : `${c.g} · égalité`)}
        <details class="lv-sg vf-hors"><summary><span>Circonscriptions qui changeraient de parti par rapport à 2023</span><small>${bascules.length}</small></summary>
        ${listeCirc(bascules, (c, i) => `${c.g} <small>(élu ${CE[i].g})</small>`)}</details>`;
      return;
    }
    if (g === "e23") {
      const serres = CE.map((c, i) => [i, c]).filter(([i, c]) => c.marge < 3 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      const V = R ? R23.regions[R.code].pct : V23(), tot = R ? R23.regions[R.code].valides : R23.province.valides;
      const parts = Object.keys(V).filter(p => V[p] >= 0.2).sort((a, b) => (e23[b] || 0) - (e23[a] || 0) || V[b] - V[a]);
      z.innerHTML = `${tete(`Élection du 29 mai ${AN(2023)}`, e23)}
        <p class="lv-muted">Résultat officiel dans chaque circonscription (Elections Alberta). ${nf(tot)} votes valides${R ? "" : `, ${nf(R23.province.inscrits)} électeurs inscrits : participation d'environ ${nf(100 * R23.province.bulletins / R23.province.inscrits, 1)} %`}. Pour la projection actuelle, choisis « Projection » au-dessus de la carte.</p>
        <span class="lv-eyebrow">Vote et sièges${R ? ` · ${esc(R.nom)}` : ""}</span>
        <div class="vi-vrows">${parts.map(p => jauge(p, coul(p), V[p], `<b>${e23[p] || 0}</b> <small>élus</small>`, 70)).join("")}</div>
        <p class="lv-muted">PT : Parti albertain en ${AN(2023)}, devenu le Progressive Tory Party en décembre 2025. AUT : indépendants et autres partis.</p>
        ${meilleures(CE, "élection de " + AN(2023))}
        ${tableRegions(CE, `Sièges par région · élus en ${AN(2023)}`)}
        <span class="lv-eyebrow">Les plus serrées en ${AN(2023)} (moins de 3 points)</span>${listeCirc(serres.slice(0, 12), c => `${c.g} +${nf(c.marge, 1)}`)}`;
      return;
    }
    const changes = CA.map((a, i) => [i, a]).filter(([i, a]) => (!a || a.note || a.p !== CE[i].g) && dans(i));
    const pres = ACTJ?.president;
    z.innerHTML = `${tete("Assemblée législative · composition actuelle", act)}
      <p class="lv-muted">Député de chaque circonscription aujourd'hui, selon l'Assemblée législative${ACTJ ? ` (liste lue le ${dateFr(ACTJ.date)})` : ""}, partielles et changements de caucus compris.${pres ? ` Présidence : ${esc(pres.nom)} (${pres.p}, ${esc(pres.circ)}), depuis le ${dateFr(pres.depuis)}.` : ""}</p>
      <span class="lv-eyebrow">Sièges par parti</span>
      <div class="vi-vrows">${SEAT_ORDER.filter(p => act[p]).map(p => `<div class="vi-vrow vf-gp"><b style="color:${p === "VAC" ? "var(--muted)" : coul(p)}">${p === "VAC" ? "Vacants" : p}</b><span class="vi-jauge"><i style="width:${100 * act[p] / total}%;background:${p === "VAC" ? "var(--muted)" : coul(p)}"></i></span><span class="vi-num"><b>${act[p]}</b></span><span class="vi-num"><small>${p === "VAC" ? "" : `${ecart(act[p] - (e23[p] || 0))} depuis 2023`}</small></span></div>`).join("")}</div>
      <span class="lv-eyebrow">Changements depuis l'élection : partielles et changements de caucus</span>
      <ul class="vi-serres">${changes.map(([i, a]) => `<li data-rid="${i}" tabindex="0" style="--c:${a ? coul(a.p) : "var(--muted)"}"><i></i><span>${esc(DATA.ridings[i].n)}${a ? ` · ${esc(a.nom)}` : ""}${a?.note ? `<br><small>${esc(a.note)}</small>` : ""}</span><b>${a ? a.p : "vacant"}</b></li>`).join("") || "<li>Aucun</li>"}</ul>
      ${tableRegions(CA.map(a => a && { g: a.p }), "Députés actuels par région")}`;
    return;
  }
  const r = DATA.ridings[sel], cp = CP[sel], ce = CE[sel], a = CA[sel], reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const lignesP = c => Object.entries(c.parts).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).map(([p, v]) =>
    `<div class="vi-vrow${p === c.g ? " win" : ""}"><b style="color:${coul(p)}">${p}</b><span class="vi-jauge"><i style="width:${Math.min(100, v * 100 / 70)}%;background:${coul(p)}"></i></span>`
    + `<span class="vi-num">${nf(v, 0)} %</span><span class="vi-num">${c.f[p] ? `<small>${nf(c.f[p][0], 0)}–${nf(c.f[p][1], 0)}</small>` : ""}</span></div>`).join("");
  const lignesE = c => c.cands.map(([nom, p, v], k) =>
    `<div class="vi-vrow vab-cand${k === 0 ? " win" : ""}"><b style="color:${coul(p)}">${esc(p)}</b><span class="vab-nom">${esc(nom)}${k === 0 ? " <small>élu</small>" : ""}</span>`
    + `<span class="vi-num">${nf(100 * v / c.valides, 1)} %</span><span class="vi-num"><small>${nf(v)} voix</small></span></div>`).join("");
  const chances = Object.entries(cp.prob).map(([p, v]) => `<span class="vi-pill"><i style="background:${coul(p)}"></i>${p} ${v < 1 ? "<1" : v > 99 ? ">99" : v} %</span>`).join("");
  const blocProj = `<span class="lv-eyebrow">Projection du site · fourchette de 90 %</span><div class="vi-vrows">${lignesP(cp)}</div>
    <span class="lv-eyebrow">Chances de l'emporter</span><div class="vi-pills">${chances}</div>`;
  const blocE23 = `<span class="lv-eyebrow">Élection du 29 mai ${AN(2023)} · ${nf(ce.valides)} votes valides, participation ${nf(100 * ce.bulletins / ce.inscrits, 0)} %</span><div class="vi-vrows">${lignesE(ce)}</div>`;
  const depute = `<p class="vi-elu" style="--c:${a ? coul(a.p) : "var(--soft)"}">${a ? `<b>${esc(a.nom)}</b> · ${NOMS[a.p] || a.p}${a.note ? ` <small>(${esc(a.note)})</small>` : ""}` : "<b>Siège vacant</b> (élection partielle à venir)"}</p>`;
  const pillsC = g === "e23" ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${coul(ce.g)}"></i>Élu en ${AN(2023)} : ${ce.g}</span><span class="vi-pill">Avance : ${nf(ce.marge, 1)} pts</span></div>`
    : `<div class="vi-pills"><span class="vi-pill"><i style="background:${coul(cp.g)}"></i>En tête (projection) : ${cp.g}</span><span class="vi-pill">Avance : ${nf(cp.marge, 1)} pts</span>`
      + (ce.g !== cp.g ? `<span class="vi-pill">Gain sur ${ce.g} (élu en ${AN(2023)})</span>` : "") + "</div>"
      + (g === "proj" && a && a.p !== ce.g && /partielle/.test(a.note || "") ? `<p class="lv-muted">Le ${a.p} a gagné la circonscription à une partielle depuis ${AN(2023)} ; la projection part du résultat de l'élection générale.</p>` : "");
  z.innerHTML = `<span class="lv-eyebrow">Circonscription ${r.id} · ${esc(reg)}</span><h3>${esc(r.n)}</h3>
    ${g === "act" ? depute + pillsC : pillsC}
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← ${etat.reg ? esc(REGIONS()[etat.reg].nom) : "Toute l'Alberta"}</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button></div>
    ${g === "e23" ? blocE23 + replie("Projection du site", blocProj) : g === "proj" ? blocProj + replie(`Élection du 29 mai ${AN(2023)}`, blocE23) : blocE23 + replie("Projection du site", blocProj)}
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
let periode = lireLS("vabPeriode", 0);   // depuis l'élection de 2023 par défaut
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
  $("viEvolSur").innerHTML = periode ? `${periode < 12 ? periode + " derniers mois" : periode === 12 ? "Dernière année" : periode / 12 + " dernières années"}` : `Depuis l'élection de ${AN(2023)}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(P, p => s[p])) || 50;
  const y = d3.scaleLinear().domain(domaineY(el, [0, Math.ceil((yMax + 4) / 10) * 10], String(periode), dessinerEvolution)).range([H - m.b, m.t]);   // Ctrl + molette : zoom vertical
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien), calculée sur tous les sondages
  const SIGMA = periode && periode <= 6 ? 14 : 30, t0 = t(tous[0].d), t1 = t(tous[tous.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= datesVis.map(d => { let a = 0, w = 0; for (const s of tous) { if (s[p] == null) continue; const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: w > 1e-6 ? a / w : null }; });
  const nbAutour = d => tous.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 30).length;
  const ligne = d3.line().defined(o => o.v != null).x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote provinciales en Alberta depuis 2023");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : periode && periode <= 6 ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", periode && periode <= 6 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of P) {
    svgE.append("g").selectAll("circle").data(sond.filter(s => s[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", periode && periode <= 12 ? 3.4 : 2.6).style("fill", coul(p));
    const mm = moy(p).filter(o => o.v != null); fin[p] = mm[mm.length - 1];
    svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(moy(p))).style("stroke", coul(p));
    svgE.append("g").selectAll("rect").data(elecVis.filter(e => e[p] != null)).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", coul(p));
  }
  const etiq = P.filter(p => fin[p]).map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => coul(d.p)).text(d => `${d.p} ${nf(d.v, 0)}`);
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      if (!datesVis.length) return;
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = datesVis.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = P.map(p => [p, moy(p).find(o => o.d === d)?.v]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±30 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${coul(p)}"><i></i>${p} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").innerHTML = `${sond.length} sondage${sond.length > 1 ? "s" : ""} provincia${sond.length > 1 ? "ux" : "l"} sur la période. Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultat de l'élection.`
    + ` Janet Brown (septembre ${AN(2026)}) est compté à 45-45, sans les 9 % d'enclins « non précisés » (41-41 avec eux) ; Cardinal (septembre ${AN(2025)}) est gardé tel quel malgré un Parti républicain à 11 % ; Abacus (décembre ${AN(2025)}), non vérifiable, est écarté. PT : Parti albertain puis Progressive Tory (même parti). Depuis avril ${AN(2026)}, Léger ne publie plus les petits partis.`;
}

/* ---------- « Comprendre le système politique et électoral » : grande fenêtre en deux parties (votes-quebec/systeme.js) ----------
   Même structure que Votes Canada (systemeElectoral() dans votes-canada/canada.js). Partie 1, système politique : régime,
   Assemblée législative, formation du gouvernement, place dans la fédération. Partie 2, système électoral : mode de scrutin,
   des voix aux sièges, calendrier, électeurs, carte, démocratie directe. Chiffres : résultat de l'élection du 29 mai 2023
   (CE, R23), Assemblée actuelle (CA, SIEGES_DE.act) et projection (PROJ). */
function systemeElectoral() {
  if (!CE || !SIEGES_DE) return;
  const N = DATA.ridings.length, nomP = p => NOMS[p] || p;
  const score = c => c.parts[c.g];
  const gagnes = CE.map((c, i) => [i, c]);
  const sousMoitie = gagnes.filter(([, c]) => score(c) < 50).length, sous1 = gagnes.filter(([, c]) => c.marge < 1).length;
  const [iBas, cBas] = gagnes.slice().sort((a, b) => a[1].marge - b[1].marge)[0];
  const S = SIEGES_DE.e23, V = V23(), A = SIEGES_DE.act, RG = R23.regions, PR = R23.province;
  const partis = ["UCP", "NPD", "VERT", "PT", "LIB"].filter(p => V[p] != null);
  const pctS = p => 100 * (S[p] || 0) / N, sg = (n, mot = "siège") => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const leadA = Object.keys(A).filter(p => p !== "VAC").sort((a, b) => A[b] - A[a])[0];
  const lignes = partis.map(p => `<div class="vi-dlg-vs-ligne" style="--c:${coul(p)}"><b>${p}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${V[p]}%"></i><i style="width:${Math.max(0.6, pctS(p))}%"></i></span>
      <small>${nf(V[p], V[p] < 1 ? 2 : 1)} % des voix<br>${sg(S[p] || 0)} (${nf(pctS(p), 0)} %)</small></div>`).join("");
  const graphique = `<div class="vi-dlg-vs">${lignes}</div>
      <div class="vi-dlg-legende"><span>part des voix</span><span>part des sièges</span></div>`;
  const ordreA = [...SEAT_ORDER].filter(p => S[p] || A[p]);
  const tabAssemblee = `<table class="vi-dlg-tab"><caption>Sièges à l'Assemblée législative</caption>
      <thead><tr><th scope="col">Parti</th><th scope="col">Élection ${AN(2023)}<small>${N} sièges · majorité ${MAJ}</small></th><th scope="col">Aujourd'hui<small>selon l'Assemblée</small></th><th scope="col">Écart</th></tr></thead>
      <tbody>${ordreA.map(p => { const d = (A[p] || 0) - (S[p] || 0);
        return `<tr style="--c:${p === "VAC" ? "var(--muted)" : coul(p)}"><th scope="row"><i></i>${p === "VAC" ? "Vacants" : p}</th><td>${S[p] || 0}</td><td><b>${A[p] || 0}</b></td><td class="${p === "VAC" ? "" : d > 0 ? "plus" : d < 0 ? "moins" : ""}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</td></tr>`; }).join("")}</tbody></table>`;
  const nomReg = { cal: "Calgary", edm: "Edmonton", rest: "Reste de l'Alberta" };
  const tabRegions = `<table class="vi-dlg-tab"><caption>Les trois régions en ${AN(2023)}</caption>
      <thead><tr><th scope="col">Région</th><th scope="col">Sièges</th><th scope="col">UCP<small>voix · sièges</small></th><th scope="col">NPD<small>voix · sièges</small></th></tr></thead>
      <tbody>${REG_ORDRE.map(k => `<tr style="--c:var(--ink)"><th scope="row">${nomReg[k]}</th><td>${(RG[k].s.UCP || 0) + (RG[k].s.NPD || 0)}</td><td>${nf(RG[k].pct.UCP, 1)} % · <b>${RG[k].s.UCP || 0}</b></td><td>${nf(RG[k].pct.NPD, 1)} % · <b>${RG[k].s.NPD || 0}</b></td></tr>`).join("")}</tbody></table>`;
  const pol = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b class="vi-dlg-long">Monarchie constitutionnelle</b><small>le roi, chef de l'État, est représenté par le lieutenant-gouverneur</small></div>
      <div><b>1 chambre</b><small>${N} députés élus à l'Assemblée législative</small></div>
      <div><b>${MAJ}</b><small>députés pour qu'un gouvernement soit majoritaire</small></div>
      <div><b>1905</b><small>l'Alberta devient une province du Canada</small></div>
    </section>
    <section>
      <h3>Le régime politique</h3>
      <p>L'Alberta est une des dix <b>provinces</b> de la fédération canadienne. Comme le Canada et les autres provinces, c'est une <b>monarchie constitutionnelle</b> dotée d'un <b>régime parlementaire</b> de tradition britannique (dit « de Westminster ») : le chef de l'État a un rôle surtout symbolique, et le pouvoir réel appartient à un gouvernement issu de l'assemblée élue.</p>
      <ul>
        <li><b>Chef de l'État</b> : le roi du Canada, représenté en Alberta par le <b>lieutenant-gouverneur</b>, nommé par le gouverneur général sur l'avis du premier ministre du Canada. Il sanctionne les lois, nomme le premier ministre de la province et dissout l'Assemblée, selon les conventions du régime, sur l'avis du gouvernement.</li>
        <li><b>Pouvoir législatif</b> : l'<b>Assemblée législative de l'Alberta</b>, à Edmonton, la capitale. Une seule chambre : la province n'a pas de Sénat. Elle adopte les lois provinciales et le budget, et contrôle le gouvernement (période des questions, comités).</li>
        <li><b>Pouvoir exécutif</b> : le <b>premier ministre</b> (ou la première ministre) et le Conseil exécutif (les ministres), choisis parmi les députés.</li>
        <li><b>Pouvoir judiciaire</b> : des tribunaux indépendants du gouvernement : la Cour de justice, la Cour du Banc du Roi et la Cour d'appel de l'Alberta ; au-dessus, la Cour suprême du Canada.</li>
      </ul>
    </section>
    <section>
      <h3>Qui gouverne : le gouvernement responsable</h3>
      <p>Le premier ministre n'est pas élu directement. Les électeurs élisent ${N} députés, un par circonscription, puis le gouvernement doit garder la <b>confiance de la majorité de l'Assemblée</b>.</p>
      <ul>
        <li><b>Premier ministre</b> : le lieutenant-gouverneur nomme la personne la plus susceptible d'obtenir la confiance de l'Assemblée, en pratique le chef du parti qui a le plus de sièges.</li>
        <li><b>Gouvernement majoritaire</b> : au moins ${MAJ} députés sur ${N}. <b>Minoritaire</b> sinon : il lui faut alors l'appui d'un autre parti pour les votes de confiance, comme le budget. L'Alberta n'a jamais eu de gouvernement minoritaire : le premier parti a toujours eu la majorité des sièges.</li>
        <li><b>En ${AN(2023)}</b> : le ${nomP("UCP")} a fait élire ${S.UCP} députés, assez pour un gouvernement majoritaire ; le ${nomP("NPD")}, avec ${S.NPD} sièges, forme l'opposition officielle. Depuis, ${A.PT ? `un député exclu de l'UCP siège pour le Progressive Tory Party, ` : ""}des partielles ont eu lieu et le NPD a gagné Calgary-Shaw en septembre ${AN(2026)} : l'Assemblée compte aujourd'hui ${SEAT_ORDER.filter(p => A[p]).map(p => `${A[p]} ${p}`).join(", ")}.</li>
        <li><b>Présidence</b> : les députés élisent l'un d'entre eux président de l'Assemblée. Il dirige les débats, reste neutre et ne vote qu'en cas d'égalité.</li>
      </ul>
      ${tabAssemblee}
    </section>
    <section>
      <h3>De longues dynasties</h3>
      <p>La vie politique albertaine est marquée par de très longs règnes d'un seul parti : les libéraux de 1905 à 1921, les Fermiers unis de 1921 à 1935, le Crédit social de 1935 à 1971, puis les progressistes-conservateurs pendant 44 ans, de 1971 à 2015. Le NPD a gouverné de 2015 à 2019. Le Parti conservateur uni, né en 2017 de la fusion des progressistes-conservateurs et du Wildrose, gouverne depuis 2019.</p>
    </section>
    <section>
      <h3>Edmonton et Ottawa : le partage des pouvoirs</h3>
      <p>La Constitution du Canada partage les compétences. La province s'occupe notamment de la santé, de l'éducation, des municipalités, du droit civil, de l'administration de la justice et des <b>ressources naturelles</b> (pétrole et gaz, qu'elle possède depuis 1930) ; le fédéral, de la défense, de la monnaie, du droit criminel et des affaires étrangères. Les relations avec Ottawa, en particulier sur l'énergie et l'environnement, sont au cœur du débat albertain : un référendum provincial de neuf questions, dont une, non contraignante, sur l'avenir de l'Alberta au sein du Canada, a lieu le 19 octobre ${AN(2026)}. Pour la Chambre des communes, voir la page <a href="votes-canada.html">Votes Canada</a>.</p>
    </section>`;
  const elec = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>${N}</b><small>circonscriptions, un député chacune</small></div>
      <div><b>1 tour</b><small>le candidat qui a le plus de voix est élu</small></div>
      <div><b class="vi-dlg-long">18 octobre 2027</b><small>date fixe de la prochaine élection (elle peut être devancée)</small></div>
      <div><b>${sousMoitie}</b><small>députés sur ${N} élus en ${AN(2023)} avec moins de 50 % des voix</small></div>
    </section>
    <section>
      <h3>Le mode de scrutin : majoritaire à un tour</h3>
      <p>Les députés sont élus au <b>scrutin majoritaire uninominal à un tour</b>, comme à Ottawa et dans les autres provinces. Dans chacune des ${N} circonscriptions, les électeurs votent une fois, pour un candidat ; celui qui obtient le plus de voix devient le député, même sans majorité. Une élection générale, ce sont ${N} courses en même temps.</p>
      <p>En ${AN(2023)}, l'élection s'est jouée presque entièrement entre deux partis : l'UCP et le NPD ont obtenu ensemble ${nf(V.UCP + V.NPD, 1)} % des voix. Seuls ${sousMoitie} députés ont été élus avec moins de 50 % des voix, mais ${sous1} circonscriptions se sont jouées à moins d'un point ; la plus serrée : ${esc(DATA.ridings[iBas].n)}, gagnée par le ${cBas.g} par ${nf(cBas.cands[0][2] - cBas.cands[1][2])} voix.</p>
      <p>Ce n'a pas toujours été le cas : aux élections de 1926 à 1955, Calgary et Edmonton élisaient plusieurs députés au vote unique transférable, et les autres circonscriptions votaient par ordre de préférence.</p>
    </section>
    <section>
      <h3>Des voix aux sièges</h3>
      <p>Les sièges ne suivent pas exactement les voix : seul compte le nombre de circonscriptions gagnées. En ${AN(2023)}, le ${nomP("UCP")} a obtenu ${nf(V.UCP, 1)} % des voix et ${S.UCP} sièges (${nf(pctS("UCP"), 0)} %) ; le ${nomP("NPD")}, ${nf(V.NPD, 1)} % des voix et ${S.NPD} sièges.</p>
      ${graphique}
      <p>Le vote est très régional. Le NPD a remporté les ${RG.edm.s.NPD} circonscriptions d'Edmonton avec ${nf(RG.edm.pct.NPD, 1)} % des voix, l'UCP ${RG.rest.s.UCP} des ${(RG.rest.s.UCP || 0) + (RG.rest.s.NPD || 0)} circonscriptions du reste de l'Alberta avec ${nf(RG.rest.pct.UCP, 1)} %, et <b>Calgary</b> s'est partagée presque à égalité (NPD ${nf(RG.cal.pct.NPD, 1)} %, UCP ${nf(RG.cal.pct.UCP, 1)} %, ${RG.cal.s.NPD} sièges contre ${RG.cal.s.UCP}). C'est à Calgary que se joue l'élection (voir la partie <a href="#" data-aller="politique">Système politique</a> pour la formation du gouvernement).</p>
      ${tabRegions}
    </section>
    <section>
      <h3>Quand vote-t-on ?</h3>
      <p>La loi fixe la date des élections générales : le <b>troisième lundi d'octobre de la quatrième année civile</b> qui suit la dernière élection (règle adoptée en 2024 ; l'élection avait lieu au printemps auparavant). Après celle du 29 mai ${AN(2023)}, la prochaine est prévue le <b>18 octobre ${AN(2027)}</b>. Le lieutenant-gouverneur peut toutefois dissoudre l'Assemblée plus tôt, sur l'avis du premier ministre ; une législature dure au plus cinq ans. Quand un siège se libère, une <b>élection partielle</b> a lieu dans cette circonscription seulement : Lethbridge-West (décembre 2024), Edmonton-Strathcona, Edmonton-Ellerslie et Olds-Didsbury-Three Hills (juin 2025), Calgary-Shaw (septembre 2026, gagnée par le NPD).</p>
    </section>
    <section>
      <h3>Qui vote, et comment</h3>
      <p>Pour voter, il faut être citoyen canadien, avoir 18 ans le jour du vote et résider habituellement en Alberta. On vote dans sa circonscription : le jour de l'élection, par anticipation, ou par bulletin spécial (par la poste). Les élections sont organisées par <b>Elections Alberta</b>, un organisme indépendant dirigé par le directeur général des élections, qui rend des comptes à l'Assemblée. En ${AN(2023)}, ${nf(PR.valides)} votes valides ont été comptés pour ${nf(PR.inscrits)} électeurs inscrits : une participation d'environ ${nf(100 * PR.bulletins / PR.inscrits, 0)} %.</p>
    </section>
    <section>
      <h3>La carte électorale : 87 sièges, bientôt 91</h3>
      <p>Une commission indépendante redessine les circonscriptions toutes les deux élections environ. Chaque circonscription doit compter à peu près le même nombre d'habitants (au plus 25 % de plus ou de moins que la moyenne) ; quelques grandes circonscriptions peu peuplées du Nord peuvent descendre plus bas. La carte actuelle de ${N} circonscriptions date de 2017 et a servi en ${AN(2019)} et en ${AN(2023)}.</p>
      <p>Pour ${AN(2027)}, la commission créée en 2025 a recommandé 89 circonscriptions en mars 2026. Le gouvernement a écarté son rapport en avril 2026 et confié la carte à un comité de cinq députés (trois UCP, deux NPD), chargé de proposer <b>91 circonscriptions</b> au plus tard le 2 novembre 2026. Avec 91 sièges, la majorité passerait à 46. Cette page garde la carte de 87 sièges tant que la nouvelle n'est pas publiée.</p>
    </section>
    <section>
      <h3>Démocratie directe</h3>
      <p>Depuis 2021, des lois permettent aux électeurs de demander par pétition la <b>révocation</b> de leur député, ou la tenue d'un <b>référendum</b> sur une loi, une politique ou une modification constitutionnelle. Le gouvernement peut aussi consulter la population : un référendum de neuf questions a lieu le 19 octobre ${AN(2026)}, en dehors de toute élection générale.</p>
      <p class="vi-dlg-note">Au Québec, un projet de mode de scrutin mixte (projet de loi n<sup>o</sup> 39) n'a jamais été adopté : la page <a href="loi39.html">Loi 39</a> le simule.</p>
    </section>`;
  const tuilesPol = pol.slice(0, pol.indexOf("</section>") + 10), tuilesElec = elec.slice(0, elec.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const polCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `L'Alberta est une <b>province</b> du Canada et une <b>monarchie constitutionnelle</b> : le roi est le chef de l'État, représenté par le lieutenant-gouverneur, mais il ne gouverne pas.`)}
      ${point(2, `Le Parlement de la province a <b>une seule chambre</b> : l'Assemblée législative, ${N} députés élus.`)}
      ${point(3, `Le chef du parti qui a le plus de sièges devient <b>premier ministre</b> et forme le gouvernement, qui doit garder la confiance des députés.`)}
      ${point(4, `Avec <b>${MAJ} sièges</b> ou plus, le gouvernement est <b>majoritaire</b>. En ${AN(2023)}, l'UCP en a obtenu ${S.UCP} ; il en compte ${A.UCP} aujourd'hui${leadA === "UCP" && A.UCP >= MAJ ? ", toujours majoritaire" : ""}, contre ${A.NPD} au NPD${A.PT ? ` et ${A.PT} au Progressive Tory` : ""}.`)}
      ${point(5, `La province gère notamment la santé, l'éducation et les <b>ressources naturelles</b> ; Ottawa, la défense, la monnaie et le droit criminel. Un référendum sur neuf questions, dont l'avenir de l'Alberta au Canada, a lieu le 19 octobre ${AN(2026)}.`)}
    </ol>`;
  const elecCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Un vote, un tour</b> : dans chacune des ${N} circonscriptions, le candidat qui a le plus de voix est élu, même sans majorité.`)}
      ${point(2, `<b>Un vote très régional</b> : en ${AN(2023)}, le NPD a gagné tout Edmonton, l'UCP presque tout le reste de la province, et Calgary s'est partagée ${RG.cal.s.NPD} sièges contre ${RG.cal.s.UCP}. Résultat : UCP ${S.UCP} sièges avec ${nf(V.UCP, 1)} % des voix, NPD ${S.NPD} avec ${nf(V.NPD, 1)} %.`)}
    </ol>
    ${graphique}
    <ol class="vi-dlg-court" start="3">
      ${point(3, `<b>Date fixe</b> : le troisième lundi d'octobre, tous les quatre ans ; prochaine élection prévue le 18 octobre ${AN(2027)}, sauf élection anticipée.`)}
      ${point(4, `<b>Pour voter</b> : être citoyen canadien, avoir 18 ans et résider en Alberta. Elections Alberta, un organisme indépendant, organise le scrutin.`)}
      ${point(5, `<b>Nouvelle carte</b> : 91 circonscriptions sont prévues pour ${AN(2027)} (majorité à 46) ; un comité de députés doit la proposer d'ici le 2 novembre 2026.`)}
    </ol>`;
  preparerSysteme({ sur: "Alberta · Assemblée législative", titre: "Le système politique et électoral de l'Alberta",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : le régime, l'Assemblée législative, la formation du gouvernement et la place de l'Alberta dans la fédération.", html: pol, court: polCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on choisit les députés : le mode de scrutin, des voix aux sièges, le calendrier, les électeurs et la carte.", html: elec, court: elecCourt }] });
}

/* ---------- bande « Partis en lice » (votes-quebec/partis.js) ---------- */
function partisEnLice() {
  const N = PROJ.national, e23 = SIEGES_DE.e23 || {}, act = SIEGES_DE.act || {};
  const cles = ["UCP", "NPD", "PT", "LIB", "VERT", "RPA"].filter(p => PARTIS.alberta[p]);
  sectionPartis(PARTIS.alberta, cles.map(p => ({ cle: p, etiquette: p, couleur: coul(p),
    detail: [N[p] ? `Projection : <b>${N[p].s} siège${N[p].s > 1 ? "s" : ""}</b>${N[p].smax ? ` (${N[p].smin}–${N[p].smax})` : ""} · ${nf(N[p].v, 1)} % des voix` : "",
      `Assemblée actuelle : ${act[p] || 0} siège${(act[p] || 0) > 1 ? "s" : ""}`, `élection de 2023 : ${e23[p] || 0} siège${(e23[p] || 0) > 1 ? "s" : ""}`].filter(Boolean).join(" · ") })));
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, PROJ, SOND, R23, ACTJ] = await Promise.all([lireJ("votes-alberta/data.json"), lireJ("votes-alberta/projection.json"), lireJ("votes-alberta/sondages.json"),
      lireJ("votes-alberta/resultats-2023.json"), lireJ("votes-alberta/actuel.json").catch(() => null), lireVerif("alberta")]);
    preparer();
    dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral(); partisEnLice();
    await equilibrerHaut(dessinerEvolution);   // colonnes du haut équilibrées avant d'afficher la page (rien ne bouge ensuite)
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vabPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");   // affiche la page (données prêtes, ou message d'erreur)
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
