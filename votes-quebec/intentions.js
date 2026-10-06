/* Votes Québec — onglet « Votes Québec » : intentions de vote à jour.
   Tant que Qc125 n'a publié aucun sondage postérieur à l'élection du 5 octobre 2026, la page montre le résultat
   de l'élection (election-2026.json, Élections Québec). Ensuite : projection Qc125 par circonscription (data.json).
   Évolution : tous les sondages nationaux depuis l'élection de 2022 (sondages.json, Qc125).
   Carte et panneaux : mêmes fonctions que la « carte actuelle » de la simulation Loi 39 (loi39.js) — parti en tête,
   meilleur deuxième, vote par parti avec le % de chaque circonscription ; plan de l'Assemblée au lieu de la barre. */

const SIEGES = 127, MAJ = 64;
const P5 = ["PQ", "PLQ", "CAQ", "PCQ", "QS"];                // ordre de data.json (ridings[].s)
const NOMS = { PQ: "Parti québécois", PLQ: "Parti libéral", CAQ: "Coalition avenir Québec", PCQ: "Parti conservateur", QS: "Québec solidaire", AUT: "Autres" };
const COUL = { PQ: "var(--pq)", PLQ: "var(--plq)", CAQ: "var(--caq)", PCQ: "var(--pcq)", QS: "var(--qs)", AUT: "var(--aut)" };
const DATE_ELECTION = "2026-10-05";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });

let DATA, ELEC, SOND, MODE, ETAT, sel = null, demarre = false;
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
    source: `Projection Qc125 du ${DATA.maj?.texte || "—"} · dernier sondage : ${esc(dernier.f)}, ${dateFr(dernier.d)}`,
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
  svgEl.setAttribute("viewBox", `0 0 ${H} ${W}`);
  const RX = (x, y) => H - y, RY = (x, y) => x;
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
  const rect = (x, y, w, h) => g.append("rect").attr("x", RX(x, y) - h).attr("y", RY(x, y)).attr("width", h).attr("height", w);
  const txt = (x, y, t, o = {}) => g.append("text").attr("x", x).attr("y", y).attr("text-anchor", o.anchor || "middle")
    .attr("transform", o.rot ? `rotate(-90 ${x} ${y})` : null).style("fill", o.fill || "var(--muted)")
    .style("font", `${o.w || 600} ${o.size || 7.5}px "Public Sans", system-ui, sans-serif`).style("letter-spacing", o.ls || ".04em").text(t);
  rect(x0 - 4, cy - MID + 6, colX(C - 1) + S - x0 + 8, 2 * MID - 12).attr("rx", 4).style("fill", "var(--soft)");
  const chair = rect(22, cy - 9, 18, 18).attr("rx", 3);
  if (pres) chair.style("fill", COUL[pres.p]); else chair.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 1.4);
  chair.append("title").text(pres ? `Présidence : député du ${pres.p}, compté dans ses ${seatsBy[pres.p]} sièges. Il ne vote qu'en cas d'égalité.` : "Présidence");
  txt(RX(0, cy), RY(22, cy) - 4, "Présidence", { size: 6.5 });
  txt(RX(0, cy + MID + ROWS * STEP / 2), RY(x0, 0) - 6, "Gouvernement", { size: 7 });
  txt(RX(0, cy - MID - ROWS * STEP / 2), RY(x0, 0) - 6, "Opposition", { size: 7 });
  txt(RX(0, cy) + 2.6, RY((x0 + colX(C - 1) + S) / 2, 0), `majorité : ${maj} sièges`, { size: 7.5, rot: true });
  for (const s of placed) { const r = rect(s.x, s.y, S, S).attr("rx", 2.2).style("fill", COUL[s.p]); r.append("title").text(NOMS[s.p]); }
  const front = (p, cote) => placed.filter(s => s.p === p && s.r === 0 && s.j < C && (cote === "gov" ? s.y > cy : s.y < cy))
    .sort((a, b) => Math.abs(a.j - 7) - Math.abs(b.j - 7))[0];
  const mark = (s, t) => { if (s) txt(RX(s.x, s.y + S / 2), RY(s.x + S / 2, 0) + 2.6, t, { size: t.length > 1 ? 5.2 : 6.5, w: 800, fill: "var(--surface)", ls: "0" }); };
  mark(front(gov, "gov"), "PM");
  if (opp[0]) mark(front(opp[0], "opp"), "C");
}

/* ---------- en-tête, plan de l'Assemblée, partis ---------- */
function dessinerTete() {
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
function remplir(i) {
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
  $("viPlein").addEventListener("click", pleinEcran);   // bouton en bas de la carte, hors de la barre de zoom
  // modes de la carte : parti en tête, meilleur deuxième, vote d'un parti
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; try { localStorage.setItem("viPct", etat.pct ? "1" : "0"); } catch {} peindre(); });
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").innerHTML = P5.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}">${p}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return; etat.parti = b.dataset.p; if (etat.mode !== "vote") etat.mode = "vote"; peindre(); });
}
function changerMode(m) {
  etat.mode = m;
  // parti par défaut pour le vote : celui qui a le plus de sièges
  if (m === "vote" && !etat.parti) etat.parti = Object.keys(ETAT.sieges).sort((a, b) => ETAT.sieges[b] - ETAT.sieges[a])[0];
  peindre();
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
  $("viEchelle").innerHTML = etat.mode === "vote"
    ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· vote ${p} dans chaque circonscription${etat.pct ? ` (chiffre = % du ${p}, plus de circonscriptions en zoomant)` : ""}</span>`
    : etat.mode === "second" ? `Couleur : parti arrivé deuxième dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé. Le survol donne les trois premiers.`
    : `Couleur : parti en tête dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé.`;
}
function infobulle(e, f) {
  const i = f.properties.RID, c = ETAT.circ[i], r = DATA.ridings[i], t = $("viTip");
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 220) px -= 240;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  t.innerHTML = `<b>${esc(r.n)}</b><small>${esc(reg)} · ${nf(r.e)} électeurs</small><br>`
    + (c ? Object.entries(c.parts).filter(([p]) => p !== "AUT").slice(0, 3).map(([p, v]) => `${p} ${nf(v, MODE === "election" ? 1 : 0)} %`).join(" · ") : "Aucune donnée");
}
// plein écran de la carte (API du navigateur, sinon couche fixe sur iPhone)
function pleinEcran() {
  const carte = $("viCarte").parentElement, ecran = document.fullscreenElement || document.webkitFullscreenElement;
  if (ecran) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else if (carte.classList.contains("lv-plein")) { carte.classList.remove("lv-plein"); document.body.classList.remove("lv-plein-actif"); majPlein(); }
  else if (carte.requestFullscreen || carte.webkitRequestFullscreen) (carte.requestFullscreen || carte.webkitRequestFullscreen).call(carte);
  else { carte.classList.add("lv-plein"); document.body.classList.add("lv-plein-actif"); majPlein(); }
}
function majPlein() {
  const carte = $("viCarte").parentElement, on = !!(document.fullscreenElement || document.webkitFullscreenElement) || carte.classList.contains("lv-plein");
  $("viPlein").setAttribute("aria-pressed", on); $("viPlein").textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
}
document.addEventListener("fullscreenchange", majPlein);
document.addEventListener("webkitfullscreenchange", majPlein);

/* ---------- panneau : tout le Québec, ou une circonscription ---------- */
function choisir(i) { sel = i; peindre(); dessinerPanneau(); }
function dessinerPanneau() {
  const z = $("viPanneau"), s = ETAT.sieges, nat = ETAT.national;
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
  if (!c) { z.innerHTML = `<span class="lv-eyebrow">${esc(reg)}</span><h3>${esc(r.n)}</h3><p class="lv-muted">Aucune donnée.</p>`; return; }
  const parts = Object.entries(c.parts).filter(([, v]) => v >= 0.5);
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(reg)}</span><h3>${esc(r.n)}</h3>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[c.g]}"></i>${MODE === "election" ? "Élu" : "En tête"} : ${c.g}</span>
      <span class="vi-pill">Avance : ${nf(c.marge, 1)} pts</span><span class="vi-pill">${nf(r.e)} électeurs</span></div>
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Tout le Québec</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>
      ${r.id ? `<a class="vi-lien" href="https://qc125.com/${r.id}f.htm" target="_blank" rel="noopener">Fiche Qc125 ↗</a>` : ""}</div>
    <span class="lv-eyebrow">${MODE === "election" ? "Résultat" : ETAT.libProj}</span>
    <div class="vi-vrows">${parts.map(([p, v]) => `<div class="vi-vrow${p === c.g ? " win" : ""}"><b style="color:${COUL[p]}">${p === "AUT" ? "Autres" : p}</b>`
      + `<span class="vi-jauge"><i style="width:${Math.min(100, v * 2)}%;background:${COUL[p]}"></i></span><span class="vi-num">${nf(v, MODE === "election" ? 1 : 0)} %</span><span></span></div>`).join("")}</div>`
    + (c.cands ? `<span class="lv-eyebrow">Candidats en tête</span><ul class="vi-cands">${c.cands.map(k => `<li style="--c:${COUL[k.p]}"><i></i><span>${esc(k.nom)}</span><em>${esc(k.sigle)}</em><b>${nf(k.v)}</b></li>`).join("")}</ul>` : "")
    + (c.part ? `<p class="lv-muted">Participation : ${nf(c.part, 1)} %${c.final ? "" : " · résultat préliminaire"}</p>` : "");
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
  const y = d3.scaleLinear().domain([0, Math.ceil((yMax + 4) / 10) * 10]).range([H - m.b, m.t]);
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
      tipE.style.left = Math.min(r.width - tipE.offsetWidth - 4, Math.max(4, px + 12)) + "px"; tipE.style.top = "8px";
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = `${sond.length} sondage${sond.length > 1 ? "s" : ""} nationa${sond.length > 1 ? "ux" : "l"} sur la période (Qc125${DEMO ? `, dont ${sond.filter(x => x.d > DATE_ELECTION).length} fictifs pour la démo` : ""}). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultats des élections.`;
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, ELEC, SOND] = await Promise.all([lireJ("votes-quebec/data.json"), lireJ("votes-quebec/election-2026.json"), lireJ("votes-quebec/sondages.json")]);
    ETAT = construireEtat();
    dessinerTete(); construireCarte(); peindre(); dessinerPanneau(); dessinerEvolution();
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; try { localStorage.setItem("viPeriode", periode); } catch {} dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
