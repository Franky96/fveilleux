/* Votes Québec — onglet « Votes Québec » : intentions de vote à jour.
   Tant que Qc125 n'a publié aucun sondage postérieur à l'élection du 5 octobre 2026, la page montre le résultat
   de l'élection (election-2026.json, Élections Québec). Ensuite : projection Qc125 par circonscription (data.json).
   Évolution : tous les sondages nationaux depuis l'élection de 2022 (sondages.json, Qc125).
   Carte et panneaux : mêmes fonctions que la « carte actuelle » de la simulation Loi 39 (loi39.js) — parti en tête,
   meilleur deuxième, vote par parti avec le % de chaque circonscription ; plan de l'Assemblée au lieu de la barre. */
import { domaineY, decouper, placerBulle } from "./zoom-y.js";
import { preparerSysteme } from "./systeme.js";
import { sectionPartis, PARTIS, AXES } from "./partis.js";
import { equilibrerHaut } from "./equilibre.js";
import { preparerPleinEcran, infoPlein } from "./plein.js";

const SIEGES = 127, MAJ = 64;
const P5 = ["PQ", "PLQ", "CAQ", "PCQ", "QS"];                // ordre de data.json (ridings[].s)
const NOMS = { PQ: "Parti québécois", PLQ: "Parti libéral", CAQ: "Coalition avenir Québec", PCQ: "Parti conservateur", QS: "Québec solidaire", AUT: "Autres" };
const COUL = { PQ: "var(--pq)", PLQ: "var(--plq)", CAQ: "var(--caq)", PCQ: "var(--pcq)", QS: "var(--qs)", AUT: "var(--aut)" };
const DATE_ELECTION = "2026-10-05";
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

let DATA, ELEC, SOND, DEP = null, MODE, ETAT, sel = null, demarre = false;   // DEP : députés en poste (liste officielle, deputes.json)
const etat = { mode: "lead", parti: null, pct: (() => { try { return localStorage.getItem("viPct") !== "0"; } catch { return true; } })() };                   // mode de la carte (comme la carte actuelle de Loi 39)
const SEAT_ORDER = ["QS", "PQ", "PLQ", "CAQ", "PCQ"];      // départage à égalité de sièges (plan de l'Assemblée)

/* ---------- état courant : résultat de l'élection, ou projection Qc125 ---------- */
/* ---------- démo (votes-quebec-demo.html) : sondages fictifs après l'élection, projetés par écart uniforme ---------- */
const DEMO = !!window.VI_DEMO;
const SONDAGES_DEMO = [   // intentions fictives : le PQ s'effrite, la CAQ remonte (exemple seulement)
  ["2026-10-22", "Léger", 29, 24, 13, 20, 12], ["2026-11-05", "Pallas Data", 28, 25, 15, 19, 11], ["2026-11-19", "Léger", 27, 24, 16, 20, 11],
  ["2026-12-03", "Mainstreet Research", 26, 25, 18, 19, 10], ["2026-12-17", "Léger", 26, 24, 19, 19, 11], ["2027-01-14", "Pallas Data", 25, 24, 21, 18, 10],
  ["2027-01-28", "Léger", 24, 25, 22, 18, 10], ["2027-02-11", "Research Co.", 24, 23, 24, 18, 10],
];
function ajouterDemo() {
  for (const [d, f, PQ, PLQ, CAQ, PCQ, QS] of SONDAGES_DEMO) SOND.sondages.push({ d, f, e: false, n: "1 000", PQ, PLQ, CAQ, PCQ, QS });
}
// écart uniforme : chaque parti gagne ou perd, dans chaque circonscription, ce qu'il gagne ou perd au national
function etatDemo(apres) {
  const recents = apres.slice(-4), nat = Object.fromEntries(P5.map(p => [p, d3.mean(recents, s => s[p])]));
  const ecart = Object.fromEntries(P5.map(p => [p, nat[p] - ELEC.national[p]]));
  const sieges = {};
  const circ = DATA.ridings.map(r => {
    const c = ELEC.circ[r.n]; if (!c) return null;
    const parts = {};
    for (const [p, v] of Object.entries(c.s)) parts[p] = Math.max(0.5, v + (ecart[p] || 0));
    const tot = Object.values(parts).reduce((a, b) => a + b, 0);
    for (const p in parts) parts[p] = 100 * parts[p] / tot;
    const ordre = Object.entries(parts).sort((a, b) => b[1] - a[1]);
    sieges[ordre[0][0]] = (sieges[ordre[0][0]] || 0) + 1;
    return { g: ordre[0][0], parts: Object.fromEntries(ordre), marge: ordre[0][1] - ordre[1][1], e: r.e };
  });
  return { titre: "Intentions de vote (démo)", national: { ...nat, AUT: 100 - P5.reduce((a, p) => a + nat[p], 0) }, sieges, circ, libProj: "Projection (démo)",
    source: `<b>Démo</b> · intentions de vote fictives (moyenne des ${recents.length} derniers sondages inventés) · projection par écart uniforme à partir du résultat de 2026`,
    note: "Exemple seulement : les sondages après le 5 octobre 2026 sont inventés pour montrer la page quand les vraies intentions de vote arriveront." };
}

function construireEtat() {
  if (DEMO) ajouterDemo();
  const apres = SOND.sondages.filter(s => !s.e && s.d > DATE_ELECTION);
  MODE = apres.length ? "projection" : "election";
  if (DEMO && apres.length) return etatDemo(apres);
  if (MODE === "election") {
    const circ = DATA.ridings.map(r => {
      const c = ELEC.circ[r.n];
      if (!c) return null;
      const ordre = Object.entries(c.s).sort((a, b) => b[1] - a[1]);
      return { g: c.g, parts: c.s, marge: ordre[0][1] - (ordre[1] ? ordre[1][1] : 0), cands: c.c, final: c.f, part: c.part, e: r.e };
    });
    return { titre: "Résultat de l'élection du 5 octobre 2026", national: ELEC.national, sieges: ELEC.sieges, circ,
      source: `Élections Québec · ${ELEC.final ? "résultats officiels" : `résultats préliminaires (${nf(ELEC.bureaux, 1)} % des bureaux)`} · participation ${nf(ELEC.participation, 1)} %`,
      note: "Les intentions de vote remplaceront ce résultat dès que Qc125 publiera un premier sondage après l'élection." };
  }
  // projection Qc125 : gagnant prédit par circonscription, vote national pondéré par le nombre d'électeurs
  const nat = Object.fromEntries(P5.map(p => [p, 0])); let tot = 0;
  const sieges = {};
  const circ = DATA.ridings.map(r => {
    const e = r.e || 1; tot += e;
    P5.forEach((p, j) => nat[p] += e * r.s[j]);
    const ordre = P5.map((p, j) => [p, r.s[j]]).sort((a, b) => b[1] - a[1] || (r.o || []).indexOf(P5.indexOf(a[0])) - (r.o || []).indexOf(P5.indexOf(b[0])));
    sieges[ordre[0][0]] = (sieges[ordre[0][0]] || 0) + 1;
    return { g: ordre[0][0], parts: Object.fromEntries(ordre), marge: ordre[0][1] - ordre[1][1], e: r.e, qc125: true };
  });
  const somme = Object.values(nat).reduce((a, b) => a + b, 0);
  P5.forEach(p => nat[p] = 100 * nat[p] / somme);
  const dernier = apres[apres.length - 1];
  return { titre: "Intentions de vote", national: nat, sieges, circ, libProj: "Projection Qc125",
    // les dates (projection, dernier sondage) sont dans la barre du haut
    source: `Source : Qc125 · dernier sondage : ${esc(dernier.f)}`,
    note: `${apres.length} sondage${apres.length > 1 ? "s" : ""} publié${apres.length > 1 ? "s" : ""} depuis l'élection.` };
}

/* ---------- plan de l'Assemblée nationale (même dessin que la simulation Loi 39) ----------
   Présidence en haut, gouvernement à gauche (exactement la majorité, présidence comprise), opposition à droite ;
   le surplus va aux banquettes du bas. PM : premier ministre, C : chef de l'opposition officielle. */
function chamber(svgEl, seatsBy, n) {
  const P = P5;
  const S = 10, G = 2.6, STEP = S + G, AISLE = 7, C = 15, ROWS = 3, MID = 24;
  const maj = Math.floor(n / 2) + 1, govCap = maj - 1, oppCap = n - maj, K = 4;
  const RH = Math.max(ROWS, Math.ceil((govCap - ROWS * C) / K), Math.ceil((oppCap - ROWS * C) / K));
  const x0 = 50, colX = j => x0 + j * STEP + Math.floor(j / 3) * AISLE;
  const xR = colX(C - 1) + S + 16, rightX = k => xR + k * STEP;
  const H = 2 * (MID + RH * STEP) + 8, cy = H / 2, W = rightX(K - 1) + S + 8;
  const yTop = r => cy - MID - S - r * STEP, yBot = r => cy + MID + r * STEP;
  // plan à l'horizontale (comme la Chambre des communes) : présidence à gauche, opposition en haut, gouvernement en bas
  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const bench = y => { const out = []; for (let j = 0; j < C; j++) for (let r = 0; r < ROWS; r++) out.push({ x: colX(j), y: y(r), j, r }); return out; };
  const end = y => { const out = []; for (let k = 0; k < K; k++) for (let r = 0; r < RH; r++) out.push({ x: rightX(k), y: y(r), j: C + k, r }); return out; };
  const side = (y, cap) => { const all = [...bench(y), ...end(y)].slice(0, cap), nb = C * ROWS;
    return [...all.slice(0, nb), ...all.slice(nb).sort((a, b) => a.j - b.j || b.r - a.r)]; };
  const govSlots = side(yBot, govCap), oppSlots = side(yTop, oppCap);
  const order = [...P, "AUT"].filter(p => seatsBy[p] > 0).sort((a, b) => seatsBy[b] - seatsBy[a] || SEAT_ORDER.indexOf(a) - SEAT_ORDER.indexOf(b));
  const gov = order[0], opp = order.slice(1);
  const seatsOf = p => d3.range(seatsBy[p]).map(() => ({ p }));
  const placed = [];
  let gs = seatsOf(gov);
  const pres = gs.length ? gs.splice(0, 1)[0] : null;
  gs.slice(0, govSlots.length).forEach((s, i) => placed.push({ ...s, ...govSlots[i] }));
  const govExtra = gs.slice(govSlots.length);
  govExtra.forEach((s, i) => placed.push({ ...s, ...oppSlots[oppSlots.length - 1 - i] }));
  const oppFree = oppSlots.slice(0, oppSlots.length - govExtra.length), spare = govSlots.slice(Math.min(gs.length, govSlots.length));
  const toOpp = [], toGov = [], cut = [];
  let room = oppFree.length;
  for (const p of opp) {
    const ss = seatsOf(p);
    if (ss.length <= room) { toOpp.push(...ss); room -= ss.length; }
    else if (room > 0) { cut.push(ss.slice(0, room), ss.slice(room)); room = 0; }
    else toGov.push(...ss);
  }
  [...toOpp, ...(cut[0] || [])].forEach((s, i) => { if (oppFree[i]) placed.push({ ...s, ...oppFree[i] }); });
  [...toGov, ...(cut[1] || [])].forEach((s, i) => { if (spare[i]) placed.push({ ...s, ...spare[i] }); });
  const g = d3.select(svgEl); g.selectAll("*").remove();
  const rect = (x, y, w, h) => g.append("rect").attr("x", x).attr("y", y).attr("width", w).attr("height", h);
  const txt = (x, y, t, o = {}) => g.append("text").attr("x", x).attr("y", y).attr("text-anchor", o.anchor || "middle")
    .attr("transform", o.rot ? `rotate(-90 ${x} ${y})` : null).style("fill", o.fill || "var(--muted)")
    .style("font", `${o.w || 600} ${o.size || 7.5}px "Public Sans", system-ui, sans-serif`).style("letter-spacing", o.ls || ".04em").text(t);
  rect(x0 - 4, cy - MID + 6, colX(C - 1) + S - x0 + 8, 2 * MID - 12).attr("rx", 4).style("fill", "var(--soft)");
  const chair = rect(22, cy - 9, 18, 18).attr("rx", 3);
  if (pres) chair.style("fill", COUL[pres.p]).attr("data-p", pres.p); else chair.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 1.4);   // data-p : parti du siège (bande des partis)
  chair.append("title").text(pres ? `Présidence : député du ${pres.p}, compté dans ses ${seatsBy[pres.p]} sièges. Il ne vote qu'en cas d'égalité.` : "Présidence");
  txt(31, cy - 13, "Présidence", { size: 6.5 });
  txt(x0, cy + MID + ROWS * STEP + 9, "Gouvernement", { size: 7, anchor: "start" });
  txt(x0, cy - MID - ROWS * STEP - 3, "Opposition", { size: 7, anchor: "start" });
  txt((x0 + colX(C - 1) + S) / 2, cy + 2.6, `majorité : ${maj} sièges`, { size: 7.5 });
  for (const s of placed) { const r = rect(s.x, s.y, S, S).attr("rx", 2.2).attr("data-p", s.p).style("fill", COUL[s.p]); r.append("title").text(NOMS[s.p]); }
  const front = (p, cote) => placed.filter(s => s.p === p && s.r === 0 && s.j < C && (cote === "gov" ? s.y > cy : s.y < cy))
    .sort((a, b) => Math.abs(a.j - 7) - Math.abs(b.j - 7))[0];
  const mark = (s, t) => { if (s) txt(s.x + S / 2, s.y + S / 2 + 2.3, t, { size: t.length > 1 ? 5.2 : 6.5, w: 800, fill: "var(--surface)", ls: "0" }); };
  mark(front(gov, "gov"), "PM");
  if (opp[0]) mark(front(opp[0], "opp"), "C");
}

/* ---------- en-tête, plan de l'Assemblée, partis ---------- */
function dessinerTete() {
  const vrais = SOND.sondages.filter(s => !s.e && !(DEMO && s.d > DATE_ELECTION)), dernierS = vrais[vrais.length - 1];
  majBarre(DEMO ? "Votes Québec · démo (intentions fictives)" : "Votes Québec",
    (MODE === "election" ? "résultat de l'élection du 5 octobre 2026" : DEMO ? "projection fictive" : `projection Qc125 du ${esc(DATA.maj?.texte || "—")}`) + (dernierS ? ` · dernier sondage le ${dateFr(dernierS.d)}` : ""));
  $("viTitre").textContent = ETAT.titre;
  $("viSource").innerHTML = ETAT.source;
  $("viNote").textContent = ETAT.note;
  const s = ETAT.sieges, ordre = Object.keys(s).filter(p => s[p] > 0).sort((a, b) => s[b] - s[a]);
  const lead = ordre[0];
  $("viSiegesTitre").textContent = `${NOMS[lead]} : ${s[lead]} sièges, gouvernement ${s[lead] >= MAJ ? "majoritaire" : "minoritaire"}`;
  chamber($("viPlan"), s, SIEGES);
  // sous le plan, en petit : sièges de chaque parti (comme Votes France)
  $("viLegende").innerHTML = [...P5, "AUT"].filter(p => s[p]).sort((a, b) => s[b] - s[a])
    .map(p => `<span style="--c:${COUL[p]}"><i></i>${NOMS[p]} <b>${s[p]}</b></span>`).join("");
}

/* ---------- carte (fonctions de la « carte actuelle » de Loi 39) ---------- */
const MW = 600, MH = 704;
let svg, gZ, gRid, gReg, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const partDe = (c, p) => (c && c.parts[p]) || 0;
const deuxieme = c => Object.entries(c.parts).filter(([p]) => p !== "AUT").sort((a, b) => b[1] - a[1])[1];
// carte actuelle : parti du député en poste (liste officielle ; sinon le gagnant du 5 octobre 2026)
const partiActuel = nomCirc => DEP?.deputes?.[nomCirc]?.p || ELEC.circ[nomCirc]?.g || null;
function remplir(i) {
  if (etat.mode === "act") { const p = partiActuel(DATA.ridings[i].n); return p ? [COUL[p] || COUL.AUT, 0.85] : ["var(--soft)", 1]; }
  const c = ETAT.circ[i];
  if (!c) return ["var(--soft)", 1];
  if (etat.mode === "second") { const [p, v] = deuxieme(c); return [COUL[p], Math.max(0.3, Math.min(1, (v - 10) / 30))]; }
  if (etat.mode === "vote") return [COUL[etat.parti], Math.max(0.06, Math.min(1, partDe(c, etat.parti) / 50))];
  return [COUL[c.g], Math.max(0.3, Math.min(1, (partDe(c, c.g) - 15) / 35))];
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
  for (const poly of polys) { const c = polylabel(poly.map(r => r.map(xy => PROJ_FN(xy)))); if (c[2] > best[2]) best = c; }
  return ANCRE[k] = best;
}
// étiquette d'une circonscription : % du parti choisi au cœur de la circonscription, si elle est assez grande à l'écran ;
// son nom en plus, seulement très zoomé (mêmes seuils que Loi 39)
const LBL_MIN_CIRC = 14, LBL_NAME = 70, NAME_ZOOM = 5;
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
  const k = Math.min(60, pad / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
  svg.transition().duration(reduit ? 0 : 700).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}
function construireCarte() {
  for (const g of [DATA.ridingGeo, DATA.curRegionGeo].filter(Boolean)) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  PROJ_FN = d3.geoConicConformal().rotate([71.6, 0]).parallels([46, 60]).fitExtent([[12, 12], [MW - 12, 648]], DATA.curRegionGeo || DATA.ridingGeo);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { mtl: boite([-74.05, 45.36], [-73.35, 45.78]), qc: boite([-71.55, 46.68], [-71.0, 46.98]), sud: boite([-75.6, 45.0], [-70.0, 47.3]) });
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gRid = gZ.append("g"); gReg = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gRid.selectAll("path").data(DATA.ridingGeo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e, f) => choisir(f.properties.RID))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.RID); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  if (DATA.curRegionGeo) gReg.selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  ZOOM = d3.zoom().scaleExtent([1, 60]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
    .on("zoom", e => { gZ.attr("transform", e.transform); curK = e.transform.k; curT = e.transform; placerEtiquettes(); });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.node().parentElement.addEventListener("wheel", e => e.preventDefault(), { passive: false });
  svg.on("click", e => { if (e.target === svg.node()) choisir(null); });
  new ResizeObserver(() => placerEtiquettes()).observe(svg.node());
  $("viZoom").addEventListener("click", e => {
    const z = e.target.closest("button")?.dataset.z; if (!z) return;
    if (z === "tout") { choisir(null); svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); }
    else if (z === "plus") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1.8);
    else if (z === "moins") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1 / 1.8);
    else if (PRESETS[z]) zoomVers(PRESETS[z], 0.95);
  });
  preparerPleinEcran();   // plein écran de la carte et bouton « Info » (votes-quebec/plein.js)
  // modes de la carte : parti en tête, meilleur deuxième, vote d'un parti
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; try { localStorage.setItem("viPct", etat.pct ? "1" : "0"); } catch {} peindre(); });
  // ordre commun aux pages d'intentions : futur (projection) · présent · passé ; juste après l'élection, seule l'élection existe
  $("viModes").className = "vf-modes";
  $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">${MODE === "election" ? "Élection 2026" : esc(ETAT.libProj)}</span><span class="lv-groupe">`
    + [["lead", "En tête"], ["second", "Meilleur 2e"], ["vote", "Vote"]].map(([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`).join("") + "</span></span>"
    // carte actuelle (présent) : député en poste, sa photo et son résultat du 5 octobre 2026 (demande de l'utilisateur :
    // la projection ne montre que les pourcentages)
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Carte actuelle</span><span class="lv-groupe"><button type="button" data-m="act" aria-pressed="${etat.mode === "act"}">Députés</button></span></span>`;
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").innerHTML = P5.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}">${p}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return; etat.parti = b.dataset.p; if (etat.mode !== "vote") etat.mode = "vote"; peindre(); });
}
function changerMode(m) {
  etat.mode = m;
  // parti par défaut pour le vote : celui qui a le plus de sièges
  if (m === "vote" && !etat.parti) etat.parti = Object.keys(ETAT.sieges).sort((a, b) => ETAT.sieges[b] - ETAT.sieges[a])[0];
  peindre(); dessinerPanneau();
}
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", etat.mode === "vote" && b.dataset.p === etat.parti));
  $("viChips").setAttribute("aria-disabled", etat.mode !== "vote");
  gRid.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.RID); this.style.fill = c; this.style.fillOpacity = o; });
  const f = sel != null ? DATA.ridingGeo.features.find(x => x.properties.RID === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  // étiquettes : en mode Vote, le % du parti dans chaque circonscription
  $("viPct").hidden = etat.mode !== "vote"; $("viPct").setAttribute("aria-pressed", etat.pct);
  const labs = gLbl.selectAll("g.vi-lab").data(etat.mode === "vote" && etat.pct ? DATA.ridingGeo.features : [], f => f.properties.RID)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => { const c = ETAT.circ[f.properties.RID]; return c ? nf(partDe(c, etat.parti), 0) + " %" : ""; });
  labs.select("text.vi-nom").text(f => DATA.ridings[f.properties.RID].n);
  placerEtiquettes();
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  const quoi = MODE === "election" ? "résultat de l'élection" : ETAT.libProj.toLowerCase();
  $("viEchelle").innerHTML = etat.mode === "act"
    ? `<span class="vf-legende">${[...P5, "AUT"].filter(p => DATA.ridings.some(r => partiActuel(r.n) === p)).map(p => `<span style="--c:${COUL[p]}"><i></i>${p === "AUT" ? "Autres" : p}</span>`).join("")}</span><span>· parti du député en poste (liste de l'Assemblée nationale ; à défaut, élu du 5 octobre 2026). Clique sur une circonscription pour le député et sa photo.</span>`
    : etat.mode === "vote"
    ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· vote ${p} dans chaque circonscription${etat.pct ? ` (chiffre = % du ${p}, plus de circonscriptions en zoomant)` : ""}</span>`
    : etat.mode === "second" ? `Couleur : parti arrivé deuxième dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé. Le survol donne les trois premiers.`
    : `Couleur : parti en tête dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé.`;
}
// gagnant de la circonscription (candidat du parti en tête ; le premier en voix s'il manque)
const deputeDe = c => c?.cands?.length ? c.cands.find(k => k.p === c.g) || c.cands[0] : null;
const ecartVoix = c => { const d = deputeDe(c), autre = (c?.cands || []).filter(k => k !== d).sort((a, b) => b.v - a.v)[0]; return d && autre ? d.v - autre.v : null; };
function infobulle(e, f) {
  const i = f.properties.RID, c = ETAT.circ[i], r = DATA.ridings[i], t = $("viTip");
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 220) px -= 240;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  t.innerHTML = `<b>${esc(r.n)}</b><small>${esc(reg)} · ${nf(r.e)} électeurs</small><br>`
    + (c ? Object.entries(c.parts).filter(([p]) => p !== "AUT").slice(0, 3).map(([p, v]) => `${p} ${nf(v, MODE === "election" ? 1 : 0)} %`).join(" · ") : "Aucune donnée")
    + (etat.mode === "act" ? (() => { const d = DEP?.deputes?.[r.n], g = deputeDe(ELEC.circ[r.n] && { g: ELEC.circ[r.n].g, cands: ELEC.circ[r.n].c });
        return (d || g) ? `<br><small>Député : ${esc((d || g).nom)} (${d ? d.p : g.p})</small>` : ""; })() : "");
}

/* ---------- panneau : tout le Québec, ou une circonscription ---------- */
function choisir(i) { sel = i; peindre(); dessinerPanneau(); if (i != null) infoPlein(); }
// député de la circonscription : celui de la liste officielle de l'Assemblée nationale (deputes.json, suit les dépouillements
// judiciaires, démissions, partielles et changements d'allégeance), avec son résultat du 5 octobre 2026 s'il y a été élu ;
// absent de la liste : le gagnant du résultat d'Élections Québec, avec une note ; sans la liste (fichier illisible) : ce gagnant aussi
const normNom = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
function blocDepute(nomCirc) {
  const e = ELEC.circ[nomCirc], ce = e && { g: e.g, cands: e.c }, gagnant = ce ? deputeDe(ce) : null;
  const off = DEP?.deputes?.[nomCirc], vacant = DEP?.vacants?.includes(nomCirc);
  const resultat = k => k && e ? `Élu le 5 octobre 2026 avec ${nf(k.v)} voix (${nf(e.s[k.p] || 0, 1)} %)${ecartVoix(ce) != null ? ` · ${nf(ecartVoix(ce))} voix d'avance` : ""}${e.f ? "" : " · résultat préliminaire"}` : "";
  // absent de la liste officielle (dépouillement judiciaire, assermentation à venir…) : le candidat élu le soir de l'élection,
  // qui siège jusqu'à preuve du contraire (demande de l'utilisateur), avec une note
  const note = vacant && gagnant ? `<small class="vi-note-dep" style="display:block;margin-top:4px;font-style:italic">Pas encore dans la <a href="${esc(DEP.source)}" target="_blank" rel="noopener">liste de l'Assemblée nationale</a> (dépouillement judiciaire, contestation ou assermentation en cours) : candidat élu selon Élections Québec.</small>` : "";
  const k = off || gagnant; if (!k) return "";
  const p = off ? off.p : gagnant.p, memeQueGagnant = off && gagnant && normNom(off.nom) === normNom(gagnant.nom);
  // photo officielle, relayée par le serveur (api/photo-depute.php : Chrome bloque celles d'assnat.qc.ca, type invalide)
  const photo = off?.photo ? `<img src="api/photo-depute.php?c=${encodeURIComponent(nomCirc)}" alt="" loading="lazy" onerror="this.closest('.vi-depute').classList.remove('avec-photo'); this.remove()">` : "";
  return `<span class="lv-eyebrow">Député de la circonscription</span>
    <p class="vi-elu vi-depute${photo ? " avec-photo" : ""}" style="--c:${COUL[p] || COUL.AUT}">${photo}<b>${off ? `<a href="${esc(off.url)}" target="_blank" rel="noopener">${esc(off.nom)}</a>` : esc(gagnant.nom)}</b><span>${esc(off ? (NOMS[p] || off.allegeance) : (NOMS[p] || gagnant.sigle))}</span>
      <small>${!off ? resultat(gagnant) : memeQueGagnant ? resultat(gagnant) : "Député en poste selon l'Assemblée nationale"}</small>${note}</p>`;
}
function dessinerPanneau() {
  const z = $("viPanneau"), s = ETAT.sieges, nat = ETAT.national;
  if (sel == null && etat.mode === "act") {
    const n = {}; for (const r of DATA.ridings) { const p = partiActuel(r.n); if (p) n[p] = (n[p] || 0) + 1; }
    const ordre = Object.keys(n).sort((a, b) => n[b] - n[a]), lead = ordre[0];
    z.innerHTML = `<span class="lv-eyebrow">Carte actuelle · 127 circonscriptions</span><h3>Assemblée nationale aujourd'hui</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[lead]}"></i>${lead} ${n[lead] >= MAJ ? "majoritaire" : "minoritaire"} : ${n[lead]} / 127</span><span class="vi-pill">Majorité : ${MAJ}</span></div>
      <p class="lv-muted">Parti du député en poste dans chaque circonscription, d'après la <a href="${esc(DEP?.source || "https://www.assnat.qc.ca/fr/deputes/index.html")}" target="_blank" rel="noopener">liste de l'Assemblée nationale</a>${DEP?.vacants?.length ? ` ; ${DEP.vacants.map(esc).join(", ")} : candidat élu le 5 octobre 2026 selon Élections Québec, pas encore sur la liste` : ""}. Clique sur une circonscription pour le député, sa photo et son résultat.</p>
      <div class="vi-vrows">${ordre.map(p => `<div class="vi-vrow"><b style="color:${COUL[p]}">${p === "AUT" ? "Autres" : p}</b><span class="vi-jauge"><i style="width:${100 * n[p] / 127}%;background:${COUL[p]}"></i></span><span class="vi-num"><b>${n[p]}</b> <small>sièges</small></span><span></span></div>`).join("")}</div>`;
    return;
  }
  if (sel == null) {
    const ordre = [...P5].sort((a, b) => (s[b] || 0) - (s[a] || 0) || nat[b] - nat[a]), lead = ordre[0];
    const lignes = ordre.map(p => `<div class="vi-vrow"><b style="color:${COUL[p]}">${p}</b><span class="vi-jauge"><i style="width:${Math.min(100, nat[p] * 2)}%;background:${COUL[p]}"></i></span>`
      + `<span class="vi-num">${nf(nat[p], 1)} %</span><span class="vi-num"><b>${s[p] || 0}</b> <small>sièges</small></span></div>`).join("");
    const parReg = DATA.regions.map(r => { const n = Object.fromEntries(P5.map(p => [p, 0]));
      DATA.ridings.forEach((x, i) => { if (x.r === r.code && ETAT.circ[i] && n[ETAT.circ[i].g] != null) n[ETAT.circ[i].g]++; });
      return `<tr><td><button type="button" class="vi-lien" data-reg="${r.code}">${esc(r.name)}</button></td>${P5.map(p => `<td class="${n[p] ? "has" : ""}" style="--c:${COUL[p]}">${n[p] || "·"}</td>`).join("")}</tr>`; }).join("");
    const serres = ETAT.circ.map((c, i) => [i, c]).filter(([, c]) => c && c.marge < 5).sort((a, b) => a[1].marge - b[1].marge);
    z.innerHTML = `<span class="lv-eyebrow">${MODE === "election" ? "Élection 2026" : "Intentions de vote"} · 127 circonscriptions</span><h3>Tout le Québec</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[lead]}"></i>${lead} ${s[lead] >= MAJ ? "majoritaire" : "minoritaire"} : ${s[lead]} / 127</span><span class="vi-pill">Majorité : ${MAJ}</span></div>
      <p class="lv-muted">${MODE === "election" ? "Résultat dans chaque circonscription : le parti en tête l'emporte." : `${ETAT.libProj} dans chaque circonscription : le parti en tête l'emporte.`} Clique sur une circonscription pour son détail.</p>
      <span class="lv-eyebrow">Vote et sièges</span><div class="vi-vrows">${lignes}</div>
      <span class="lv-eyebrow">Sièges par région</span>
      <div class="vi-table"><table><thead><tr><th>Région</th>${P5.map(p => `<th style="color:${COUL[p]}">${p}</th>`).join("")}</tr></thead><tbody>${parReg}</tbody></table></div>
      <span class="lv-eyebrow">Les plus serrées (moins de 5 points)</span>
      <ul class="vi-serres">${serres.slice(0, 12).map(([i, c]) => `<li data-rid="${i}" tabindex="0" style="--c:${COUL[c.g]}"><i></i>${esc(DATA.ridings[i].n)}<b>${c.g} +${nf(c.marge, 1)}</b></li>`).join("") || "<li>Aucune</li>"}</ul>`;
    return;
  }
  const r = DATA.ridings[sel], c = ETAT.circ[sel], reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const liens = `<div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Tout le Québec</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>
      ${r.id ? `<a class="vi-lien" href="https://qc125.com/${r.id}f.htm" target="_blank" rel="noopener">Fiche Qc125 ↗</a>` : ""}</div>`;
  // carte actuelle : député en poste (photo), puis le résultat de l'élection du 5 octobre 2026 dans la circonscription
  if (etat.mode === "act") {
    const e = ELEC.circ[r.n], ce = e && { g: e.g, cands: e.c }, gagnant = ce ? deputeDe(ce) : null;
    const res = e ? Object.entries(e.s).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]) : [];
    z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(reg)}</span><h3>${esc(r.n)}</h3>${blocDepute(r.n)}
      <div class="vi-pills"><span class="vi-pill">${nf(r.e)} électeurs</span></div>${liens}`
      + (e ? `<span class="lv-eyebrow">Élection du 5 octobre 2026</span>
      <div class="vi-vrows">${res.map(([p, v]) => `<div class="vi-vrow${p === e.g ? " win" : ""}"><b style="color:${COUL[p]}">${p === "AUT" ? "Autres" : p}</b>`
        + `<span class="vi-jauge"><i style="width:${Math.min(100, v * 2)}%;background:${COUL[p]}"></i></span><span class="vi-num">${nf(v, 1)} %</span><span></span></div>`).join("")}</div>
      <span class="lv-eyebrow">Candidats en tête</span><ul class="vi-cands">${e.c.map(k => `<li class="${k === gagnant ? "vi-cand-elu" : ""}" style="--c:${COUL[k.p]}"><i></i><span>${esc(k.nom)}${k === gagnant ? " <small>élu</small>" : ""}</span><em>${esc(k.sigle)}</em><b>${nf(k.v)}</b></li>`).join("")}</ul>`
        + (e.part ? `<p class="lv-muted">Participation : ${nf(e.part, 1)} %${e.f ? "" : " · résultat préliminaire"}</p>` : "") : "");
    return;
  }
  if (!c) { z.innerHTML = `<span class="lv-eyebrow">${esc(reg)}</span><h3>${esc(r.n)}</h3><p class="lv-muted">Aucune donnée.</p>`; return; }
  const parts = Object.entries(c.parts).filter(([, v]) => v >= 0.5);
  // projection : seulement les pourcentages ; juste après l'élection (pas encore de sondage), son résultat avec les candidats
  const dep = MODE === "election" ? deputeDe(c) : null;
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(reg)}</span><h3>${esc(r.n)}</h3>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[c.g]}"></i>${MODE === "election" ? "Élu" : "En tête"} : ${c.g}</span>
      <span class="vi-pill">Avance : ${nf(c.marge, 1)} pts</span><span class="vi-pill">${nf(r.e)} électeurs</span></div>${liens}
    <span class="lv-eyebrow">${MODE === "election" ? "Résultat" : ETAT.libProj}</span>
    <div class="vi-vrows">${parts.map(([p, v]) => `<div class="vi-vrow${p === c.g ? " win" : ""}"><b style="color:${COUL[p]}">${p === "AUT" ? "Autres" : p}</b>`
      + `<span class="vi-jauge"><i style="width:${Math.min(100, v * 2)}%;background:${COUL[p]}"></i></span><span class="vi-num">${nf(v, MODE === "election" ? 1 : 0)} %</span><span></span></div>`).join("")}</div>`
    + (c.cands ? `<span class="lv-eyebrow">Candidats en tête</span><ul class="vi-cands">${c.cands.map(k => `<li class="${k === dep ? "vi-cand-elu" : ""}" style="--c:${COUL[k.p]}"><i></i><span>${esc(k.nom)}${k === dep ? ` <small>${c.final ? "député" : "en avance"}</small>` : ""}</span><em>${esc(k.sigle)}</em><b>${nf(k.v)}</b></li>`).join("")}</ul>` : "")
    + (c.part ? `<p class="lv-muted">Participation : ${nf(c.part, 1)} %${c.final ? "" : " · résultat préliminaire"}</p>` : "")
    + (MODE === "election" ? "" : `<p class="lv-muted">Pour le député en poste et sa photo : « Carte actuelle · Députés » au-dessus de la carte.</p>`);
}
document.addEventListener("click", e => {
  if (!e.target.closest("#viPanneau")) return;
  const l = e.target.closest("[data-rid]"); if (l) { choisir(+l.dataset.rid); return; }
  const rg = e.target.closest("[data-reg]");
  if (rg) { const f = DATA.curRegionGeo?.features.find(x => x.properties.REG === rg.dataset.reg); if (f) zoomVers(f, 0.85); return; }
  if (e.target.closest("[data-tout]")) { choisir(null); svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); return; }
  if (e.target.closest("[data-zoomsel]") && sel != null) zoomVers(DATA.ridingGeo.features.find(x => x.properties.RID === sel), 0.5);
});

/* ---------- évolution des intentions de vote ---------- */
// bouton « ⓘ Moyenne lissée » en bas à droite du graphique : ouvre un petit rectangle d'info sur le calcul de la courbe
// (demande de l'utilisateur) ; se ferme au second clic, par Échap ou par un clic ailleurs
function expliquerLissage() {
  const note = $("viEvolNote"); if (!note || $("viLisseBtn")) return;
  note.insertAdjacentHTML("afterend", `<div style="display:flex;justify-content:flex-end;position:relative">
    <button type="button" class="vi-lien" id="viLisseBtn" aria-expanded="false" aria-controls="viLisseTxt" style="font-size:0.78rem;padding:2px 9px">ⓘ Moyenne lissée</button>
    <div id="viLisseTxt" role="dialog" aria-label="Moyenne lissée" hidden style="position:absolute;right:0;bottom:calc(100% + 8px);z-index:30;width:min(380px,86vw);padding:12px 14px;
      border-radius:10px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);box-shadow:0 12px 32px rgba(0,0,0,.35);font-size:0.84rem;line-height:1.45">
      <b>Comment la courbe est calculée</b><br>
      Chaque ligne est une moyenne lissée des sondages, pas le dernier sondage. Pour chaque semaine, on fait la moyenne de tous les
      sondages, chacun pondéré selon son éloignement dans le temps : un sondage de la même semaine compte pleinement, un sondage d'il y a
      trois semaines environ 60 %, un d'il y a six semaines à peine 15 % (courbe en cloche, écart-type de 21 jours ; 10 jours à 6 mois ou moins).
      Ça atténue les écarts entre maisons de sondage, mais quand les sondages récents sont rares, la ligne garde la trace des plus anciens :
      juste après une élection, elle peut encore refléter ceux d'avant le vote. Points : les sondages ; losanges : les élections.</div></div>`);
  const btn = $("viLisseBtn"), boite = $("viLisseTxt");
  const ouvrir = v => { boite.hidden = !v; btn.setAttribute("aria-expanded", v); };
  btn.addEventListener("click", e => { e.stopPropagation(); ouvrir(boite.hidden); });
  document.addEventListener("click", e => { if (!boite.hidden && !boite.contains(e.target)) ouvrir(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !boite.hidden) { ouvrir(false); btn.focus(); } });
}

// période affichée (mois ; 0 = depuis l'élection de 2022), gardée d'une visite à l'autre
let periode = (() => { try { return +localStorage.getItem("viPeriode") || 0; } catch { return 0; } })();
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 54, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = SOND.sondages.filter(s => !s.e);
  const fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([t("2022-10-01"), d3.timeMonth.offset(fin_, -periode)]) : t("2022-10-01");
  const dans = d => t(d) >= debut;
  const sond = tous.filter(s => dans(s.d));
  const elections = SOND.sondages.filter(s => s.e).map(s => ({ d: s.d, ...Object.fromEntries(P5.map(p => [p, s[p]])) }));
  if (!elections.some(x => x.d === DATE_ELECTION)) elections.push({ d: DATE_ELECTION, ...Object.fromEntries(P5.map(p => [p, ELEC.national[p]])) });
  const elecVis = elections.filter(e => dans(e.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  $("viEvolSur").textContent = periode ? `${periode < 12 ? periode + " derniers mois" : periode === 12 ? "Dernière année" : periode / 12 + " dernières années"}` : "Depuis l'élection de 2022";
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(P5, p => s[p])) || 40;
  const y = d3.scaleLinear().domain(domaineY(el, [0, Math.ceil((yMax + 4) / 10) * 10], String(periode), dessinerEvolution)).range([H - m.b, m.t]);   // molette : zoom vertical
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien, écart-type 21 jours),
  // calculée seulement entre le premier et le dernier sondage
  // (la tendance est calculée sur tous les sondages, puis coupée à la période : pas d'effet de bord au début)
  const SIGMA = periode && periode <= 6 ? 10 : 21, t0 = t(tous[0].d), t1 = t(tous[tous.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= datesVis.map(d => { let a = 0, w = 0; for (const s of tous) { const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: a / w }; });
  const nbAutour = d => tous.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 30).length;
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote depuis 2022");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : periode && periode <= 6 ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", periode && periode <= 6 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    const aDroite = x(t(e.d)) > W / 2;   // étiquette à gauche du trait près du bord droit
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + (aDroite ? -4 : 4)).attr("y", m.t + 10).attr("text-anchor", aDroite ? "end" : "start").text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of P5) {
    svgE.append("g").selectAll("circle").data(sond).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", periode && periode <= 12 ? 3.2 : 2.2).style("fill", COUL[p]);
    const mm = moy(p); fin[p] = mm[mm.length - 1];
    svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", COUL[p]);
    svgE.append("g").selectAll("rect").data(elecVis).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", COUL[p]);
  }
  // étiquettes de fin de ligne (écartées pour ne pas se chevaucher)
  const etiq = P5.map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => COUL[d.p]).text(d => `${d.p} ${nf(d.v, 0)}`);
  // survol : moyenne à la date la plus proche
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = datesVis.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = P5.map(p => [p, moy(p).find(o => o.d === d).v]).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±30 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${COUL[p]}"><i></i>${p} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = `${sond.length} sondage${sond.length > 1 ? "s" : ""} nationa${sond.length > 1 ? "ux" : "l"} sur la période (Qc125${DEMO ? `, dont ${sond.filter(x => x.d > DATE_ELECTION).length} fictifs pour la démo` : ""}). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultats des élections.`;
}

/* ---------- démarrage ---------- */
/* ---------- « Comprendre le système politique et électoral » : grande fenêtre en deux parties (votes-quebec/systeme.js) ----------
   Partie 1, système politique : régime, institutions, formation du gouvernement. Partie 2, système électoral : mode de
   scrutin, des voix aux sièges, calendrier, électeurs, carte, réforme. Le texte suit la Loi électorale et le Règlement de
   l'Assemblée nationale ; les chiffres viennent du résultat de l'élection du 5 octobre 2026 (election-2026.json) et de la
   simulation Loi 39 (loi39-resume.json, lue à la première ouverture). */
function systemeElectoral() {
  if (!ELEC) return;
  const N = Object.keys(ELEC.circ).length, MAJ = Math.floor(N / 2) + 1;
  const circ = Object.entries(ELEC.circ), gagnant = c => Math.max(...Object.values(c.s));
  const sousMoitie = circ.filter(([, c]) => gagnant(c) < 50).length, sous40 = circ.filter(([, c]) => gagnant(c) < 40).length;
  const [plusBas, cBas] = circ.slice().sort((a, b) => gagnant(a[1]) - gagnant(b[1]))[0];
  const brut = ELEC.circ["Vachon"], vachon = brut && { g: brut.g, cands: brut.c }, dV = deputeDe(vachon), eV = ecartVoix(vachon);   // course la plus serrée
  const S = ELEC.sieges, V = ELEC.national, partis = P5.filter(p => V[p] != null).sort((a, b) => (S[b] || 0) - (S[a] || 0) || V[b] - V[a]);
  const lead = partis[0], deux = partis[1], pctS = p => 100 * (S[p] || 0) / N;
  const lignes = partis.map(p => `<div class="vi-dlg-vs-ligne" style="--c:${COUL[p]}"><b>${p}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${2 * V[p]}%"></i><i style="width:${Math.max(0.6, 2 * pctS(p))}%"></i></span>
      <small>${nf(V[p], 1)} % des voix<br>${S[p] || 0} siège${(S[p] || 0) > 1 ? "s" : ""} (${nf(pctS(p), 0)} %)</small></div>`).join("");
  const politique = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b class="vi-dlg-long">Monarchie constitutionnelle</b><small>le roi règne sans gouverner ; il est représenté par le lieutenant-gouverneur</small></div>
      <div><b>1 chambre</b><small>l'Assemblée nationale (${N} députés)</small></div>
      <div><b>${MAJ}</b><small>députés pour qu'un gouvernement soit majoritaire</small></div>
      <div><b>Fédération</b><small>le Québec est une des 10 provinces du Canada</small></div>
    </section>
    <section>
      <h3>Le régime politique</h3>
      <p>Le Québec est une <b>province du Canada</b>, une <b>monarchie constitutionnelle</b> dotée d'un <b>régime parlementaire</b> de tradition britannique (dit « de Westminster ») : le chef de l'État est un monarque au rôle surtout symbolique, et le pouvoir réel appartient à un gouvernement issu de l'assemblée élue.</p>
      <ul>
        <li><b>Chef de l'État</b> : le roi du Canada (Charles III depuis 2022), représenté au Québec par le <b>lieutenant-gouverneur</b>, nommé par le gouverneur général sur recommandation du premier ministre du Canada. Il sanctionne les lois, nomme le premier ministre et dissout l'Assemblée, toujours selon les règles et les conventions du régime, sur l'avis du gouvernement.</li>
        <li><b>Pouvoir législatif</b> : le Parlement du Québec, formé du lieutenant-gouverneur et de l'<b>Assemblée nationale</b>, la seule chambre depuis l'abolition du Conseil législatif en 1968. Les députés adoptent les lois et le budget, et contrôlent le gouvernement (période des questions, commissions).</li>
        <li><b>Pouvoir exécutif</b> : le <b>premier ministre</b> et le Conseil des ministres, choisis parmi les élus.</li>
        <li><b>Pouvoir judiciaire</b> : des tribunaux indépendants du gouvernement ; en droit privé, le Québec applique son propre Code civil, hérité de la tradition française.</li>
      </ul>
    </section>
    <section>
      <h3>Qui gouverne : le gouvernement responsable</h3>
      <p>Le premier ministre n'est pas élu directement. Les électeurs élisent des députés (voir la partie <a href="#" data-aller="electoral">Système électoral</a>), puis le gouvernement doit garder la <b>confiance de la majorité de l'Assemblée</b> pour rester en place.</p>
      <ul>
        <li><b>Premier ministre</b> : le lieutenant-gouverneur nomme la personne la plus susceptible d'obtenir la confiance de l'Assemblée, en pratique le chef du parti qui a le plus de sièges.</li>
        <li><b>Gouvernement majoritaire</b> : un parti qui a au moins ${MAJ} députés sur ${N} contrôle l'Assemblée et peut faire adopter ses lois seul.</li>
        <li><b>Gouvernement minoritaire</b> : si aucun parti n'atteint ${MAJ} sièges, le parti qui gouverne a besoin de l'appui (ou de l'abstention) d'au moins un autre parti pour les votes importants, comme le budget. Une défaite sur une question de confiance peut faire tomber le gouvernement et mener à une élection anticipée.${S[lead] < MAJ ? ` C'est le cas depuis 2026 : le ${NOMS[lead]} a ${S[lead]} sièges, ${MAJ - S[lead]} de moins que la majorité.` : ""}</li>
        <li><b>Opposition officielle</b> : le deuxième parti en nombre de sièges${deux ? ` (en 2026, le ${NOMS[deux]}, ${S[deux]} sièges)` : ""} ; son chef est le chef de l'opposition officielle.</li>
        <li><b>Groupe parlementaire</b> : un parti est reconnu comme groupe (temps de parole, budget de recherche, places en commission) s'il a au moins 12 députés ou s'il a obtenu au moins 20 % des voix.</li>
        <li><b>Présidence</b> : les députés élisent l'un d'entre eux président de l'Assemblée. Il dirige les débats en toute neutralité et ne vote qu'en cas d'égalité.</li>
      </ul>
    </section>
    <section>
      <h3>Québec et Ottawa : le partage des pouvoirs</h3>
      <p>La Constitution du Canada partage les compétences entre les deux ordres de gouvernement. Québec s'occupe notamment de la santé, de l'éducation, du droit civil, des municipalités et des ressources naturelles ; Ottawa, de la défense, de la monnaie, du droit criminel et des affaires étrangères. Les Québécois élisent donc aussi des députés à la Chambre des communes (voir la page <a href="votes-canada.html">Votes Canada</a>).</p>
    </section>`;
  const electoral = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>${N}</b><small>circonscriptions, un député chacune</small></div>
      <div><b>1 tour</b><small>le candidat qui a le plus de voix est élu</small></div>
      <div><b>4 ans</b><small>élection à date fixe ; prochaine le 7 octobre 2030</small></div>
      <div><b>${nf(ELEC.participation, 1)} %</b><small>de participation en 2026</small></div>
    </section>
    <section>
      <h3>Le mode de scrutin : majoritaire à un tour</h3>
      <p>Le Québec utilise le <b>scrutin majoritaire uninominal à un tour</b>, le même mode que pour la Chambre des communes à Ottawa. Le territoire est découpé en ${N} circonscriptions. Dans chacune, les électeurs votent une seule fois, pour un candidat ; celui qui obtient le plus de voix devient le député, même s'il n'a pas la majorité. Il n'y a ni deuxième tour ni vote pour une liste de parti : une élection générale, ce sont ${N} courses en même temps.</p>
      <p>Comme les votes se partagent souvent entre quatre ou cinq partis, on peut gagner avec bien moins de la moitié des voix. En 2026, <b>${sousMoitie} des ${N} députés</b> ont été élus avec moins de 50 % des voix, et ${sous40} avec moins de 40 %. Le score le plus bas : ${nf(gagnant(cBas), 1)} % dans ${esc(plusBas)}.${dV && eV != null ? ` À Vachon, ${esc(dV.nom)} (${dV.p}) l'a emporté par ${nf(eV)} voix.` : ""}</p>
    </section>
    <section>
      <h3>Des voix aux sièges</h3>
      <p>Les sièges ne sont pas répartis selon le pourcentage de voix de chaque parti à l'échelle du Québec : seul compte le nombre de circonscriptions gagnées. Un parti dont l'appui est concentré dans quelques régions peut obtenir plus de sièges qu'un parti dont l'appui est réparti partout, même avec moins de voix.</p>
      <div class="vi-dlg-vs">${lignes}</div>
      <div class="vi-dlg-legende"><span>part des voix</span><span>part des sièges</span></div>
      <p>En 2026, le ${NOMS[lead]} a obtenu ${nf(V[lead], 1)} % des voix et ${S[lead]} sièges, soit ${nf(pctS(lead), 0)} % de l'Assemblée.${(S.CAQ || 0) === 0 && V.CAQ ? ` La Coalition avenir Québec, avec ${nf(V.CAQ, 1)} % des voix, n'a fait élire aucun député : elle n'est arrivée première dans aucune circonscription.` : ""} Ce sont ces sièges qui déterminent ensuite qui gouverne (voir la partie <a href="#" data-aller="politique">Système politique</a>).</p>
    </section>
    <section>
      <h3>Quand vote-t-on ?</h3>
      <p>Depuis 2013, les élections générales ont lieu à <b>date fixe</b> : le premier lundi d'octobre, tous les quatre ans. Après celle du 5 octobre 2026, la prochaine est prévue le <b>7 octobre 2030</b>. Une élection peut toutefois avoir lieu plus tôt si l'Assemblée est dissoute, par exemple quand un gouvernement minoritaire perd la confiance des députés. Quand un siège se libère entre deux élections (démission, décès), une élection partielle a lieu dans cette circonscription seulement.</p>
    </section>
    <section>
      <h3>Qui vote, et comment</h3>
      <p>Pour voter, il faut être citoyen canadien, avoir 18 ans le jour du vote, être domicilié au Québec depuis au moins six mois et être inscrit sur la liste électorale. On vote dans sa circonscription : le jour de l'élection, par anticipation les jours précédents, ou au bureau du directeur du scrutin. Les élections sont organisées par Élections Québec, un organisme indépendant qui relève de l'Assemblée nationale.</p>
    </section>
    <section>
      <h3>La carte électorale</h3>
      <p>Les limites des circonscriptions sont tracées par une commission indépendante, la Commission de la représentation électorale, et revues après deux élections générales. Chaque circonscription doit compter à peu près le même nombre d'électeurs (au plus 25 % de plus ou de moins que la moyenne), sauf exceptions prévues par la loi pour de très grands territoires peu peuplés et pour les Îles-de-la-Madeleine. L'Assemblée comptait 125 sièges de 1989 à 2022 ; elle en compte ${N} depuis l'élection de 2026.</p>
    </section>
    <section>
      <h3>Et si le mode de scrutin changeait ?</h3>
      <p>Le débat sur une réforme revient régulièrement, justement à cause de l'écart entre les voix et les sièges. En 2019, le projet de loi n<sup>o</sup> 39 proposait un <b>mode mixte compensatoire régional</b> : 80 députés élus dans des circonscriptions comme aujourd'hui, et 45 sièges de région attribués aux partis pour rapprocher leur part des sièges de leur part des voix (un parti devait obtenir au moins 10 % des voix à l'échelle du Québec pour y avoir droit). Le projet n'a jamais été adopté.</p>
      <p class="vi-dlg-note" id="viSystemeL39">La page <a href="loi39.html">Loi 39</a> simule ce mode de scrutin avec le résultat de 2026.</p>
    </section>`;
  // versions courtes : l'essentiel en quelques points, mêmes chiffres clés et même graphique des voix et des sièges
  const tuilesPol = politique.slice(0, politique.indexOf("</section>") + 10), tuilesElec = electoral.slice(0, electoral.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const politiqueCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `Le Québec est une <b>province du Canada</b> et une <b>monarchie constitutionnelle</b> : le roi est le chef de l'État, mais il ne gouverne pas.`)}
      ${point(2, `Les électeurs élisent les <b>${N} députés</b> de l'Assemblée nationale, qui votent les lois et le budget.`)}
      ${point(3, `Le chef du parti qui a le plus de sièges devient <b>premier ministre</b> et forme le gouvernement, qui doit garder la confiance des députés.`)}
      ${point(4, `Avec <b>${MAJ} sièges</b> ou plus, le gouvernement est <b>majoritaire</b> ; sinon, il est <b>minoritaire</b> et a besoin de l'appui d'un autre parti.${S[lead] < MAJ ? ` Depuis 2026, le ${NOMS[lead]} gouverne en minorité avec ${S[lead]} sièges.` : ""}`)}
      ${point(5, `Québec gère notamment la santé, l'éducation et le droit civil ; Ottawa, la défense, la monnaie et le droit criminel.`)}
    </ol>`;
  const electoralCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Un vote, un tour</b> : dans chacune des ${N} circonscriptions, le candidat qui a le plus de voix est élu, même sans majorité. En 2026, ${sousMoitie} députés sur ${N} ont gagné avec moins de 50 % des voix.`)}
      ${point(2, `<b>Les sièges ne suivent pas les voix</b> : seul compte le nombre de circonscriptions gagnées.`)}
    </ol>
    <div class="vi-dlg-vs">${lignes}</div>
    <div class="vi-dlg-legende"><span>part des voix</span><span>part des sièges</span></div>
    <ol class="vi-dlg-court" start="3">
      ${point(3, `<b>Tous les quatre ans</b>, le premier lundi d'octobre (prochaine élection : 7 octobre 2030), sauf élection anticipée.`)}
      ${point(4, `<b>Pour voter</b> : être citoyen canadien, avoir 18 ans et habiter au Québec depuis six mois.`)}
      ${point(5, `Une réforme vers un mode <b>mixte compensatoire</b> (projet de loi 39) a été proposée en 2019, puis abandonnée : voir la simulation <a href="loi39.html">Loi 39</a>.`)}
    </ol>`;
  let l39 = false;
  preparerSysteme({ sur: "Québec · Assemblée nationale", titre: "Le système politique et électoral du Québec",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : le régime, les institutions et la formation du gouvernement.", html: politique, court: politiqueCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on choisit les députés : le mode de scrutin, des voix aux sièges, le calendrier et les électeurs.", html: electoral, court: electoralCourt }],
    aLOuverture: () => {
      if (l39) return; l39 = true;                        // résumé de la simulation Loi 39, lu à la première ouverture
      fetch("votes-quebec/loi39-resume.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(L => {
        if (!L?.loi39) return;
        const ordre = Object.keys(L.loi39).sort((a, b) => L.loi39[b] - L.loi39[a]), m39 = Math.floor(L.sieges_loi39 / 2) + 1, t = ordre[0];
        const mA = Math.floor(L.sieges_actuel / 2) + 1, ecart = p => L.loi39[p] - L.actuel[p];
        const el = $("viSystemeL39"); el.className = "vi-dlg-l39";
        el.innerHTML = `<table class="vi-dlg-tab"><caption>Sièges selon le mode de scrutin, avec le ${esc(L.texte)}</caption>
          <thead><tr><th scope="col">Parti</th><th scope="col">Mode actuel<small>${L.sieges_actuel} sièges · majorité ${mA}</small></th><th scope="col">Loi 39<small>${L.sieges_loi39} sièges · majorité ${m39}</small></th><th scope="col">Écart</th></tr></thead>
          <tbody>${ordre.map(p => `<tr style="--c:${COUL[p]}"><th scope="row"><i></i>${p}</th><td>${L.actuel[p]}</td><td><b>${L.loi39[p]}</b></td><td class="${ecart(p) > 0 ? "plus" : ecart(p) < 0 ? "moins" : ""}">${ecart(p) > 0 ? "+" : ecart(p) < 0 ? "−" : "±"}${Math.abs(ecart(p))}</td></tr>`).join("")}</tbody></table>
          <p>Avec la loi 39, le ${esc(NOMS[t] || t)} resterait en tête mais ${L.loi39[t] >= m39 ? "serait majoritaire" : `serait minoritaire (${L.loi39[t]} sièges sur ${m39} nécessaires)`}. <a href="loi39.html">Voir la simulation complète →</a></p>`;
      }).catch(() => {});
    } });
}
/* ---------- section « Les partis » (votes-quebec/partis.js) : liste cliquable, fiche de chaque parti ---------- */
function partisEnLice() {
  const S = ELEC?.sieges || {}, V = ELEC?.national || {};
  sectionPartis(PARTIS.quebec, P5.slice().sort((a, b) => (S[b] || 0) - (S[a] || 0) || (V[b] || 0) - (V[a] || 0)).map(p => ({ cle: p, etiquette: p, couleur: COUL[p],
    detail: `Élection du 5 octobre 2026 : <b>${S[p] || 0} siège${(S[p] || 0) > 1 ? "s" : ""}</b> sur 127 · ${nf(V[p] || 0, 1)} % des voix` })), { multi: AXES.quebec });
}

async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, ELEC, SOND, , DEP] = await Promise.all([lireJ("votes-quebec/data.json"), lireJ("votes-quebec/election-2026.json"), lireJ("votes-quebec/sondages.json"), lireVerif("quebec"),
      lireJ("votes-quebec/deputes.json").catch(() => null)]);
    ETAT = construireEtat();
    expliquerLissage();
    dessinerTete(); construireCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral(); partisEnLice();
    await equilibrerHaut(dessinerEvolution);   // colonnes du haut équilibrées avant d'afficher la page (rien ne bouge ensuite)
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; try { localStorage.setItem("viPeriode", periode); } catch {} dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");   // affiche la page (données prêtes, ou message d'erreur)
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
