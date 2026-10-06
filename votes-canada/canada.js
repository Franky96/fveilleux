/* Votes Canada — intentions de vote fédérales, même gabarit que « Votes Québec » (votes-quebec/intentions.js).
   Projection Qc125 (qc125.com/canada) : sièges et vote national avec leur fourchette, projection de chaque circonscription
   (projection.json, outils/canada.py). Chambre des communes actuelle : député de chaque circonscription selon la carte
   de Qc125 (changements de parti, sièges vacants). Élection du 28 avril 2025 : résultat de chaque circonscription.
   Évolution : tous les sondages nationaux depuis l'élection de 2025 (sondages.json, outils/sondages_ca.py).
   Contours des 343 circonscriptions (découpage de 2023) : data.json (outils/canada_geo.py). */

const SIEGES = 343, MAJ = 172;
const P = ["PLC", "PCC", "BQ", "NPD", "PVC"];
const NOMS = { PLC: "Parti libéral", PCC: "Parti conservateur", BQ: "Bloc québécois", NPD: "Nouveau Parti démocratique", PVC: "Parti vert",
  PPC: "Parti populaire", IND: "Indépendant", AUT: "Autres", VAC: "Siège vacant" };
const COUL = { PLC: "#D7262E", PCC: "#2D5BC4", BQ: "#21A9C9", NPD: "#F28A1D", PVC: "#3D9B35", PPC: "#7B4FB3", IND: "#8D949A", AUT: "#8D949A", VAC: "var(--soft)" };
const SEAT_ORDER = ["PLC", "PCC", "BQ", "NPD", "PVC", "IND", "AUT", "VAC"];   // départage à égalité de sièges (plan de la Chambre)
const DATE_ELECTION = "2025-04-28";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
// années : texte normal (pas de pastille, contrairement à Votes France)
const AN = a => String(a);   // années en texte normal sur cette page
const jourMois = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long" });
const dateAn = iso => `${jourMois(iso)} ${AN(iso.slice(0, 4))}`;
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };

let DATA, PROJ, SOND, CP, CE, CA, SIEGES_DE, E25NAT, sel = null, demarre = false;
// mode de la carte : projection (lead, second, vote), élection de 2025 (e25, e25vote), député actuel (act)
const etat = { mode: "lead", parti: null, pct: lireLS("viPct", true), chambre: "proj", reg: null };   // la chambre suit le mode de la carte (projection par défaut)
const groupe = () => etat.mode === "act" ? "act" : etat.mode.startsWith("e25") ? "e25" : "proj";
const voteMode = () => etat.mode === "vote" || etat.mode === "e25vote";

/* ---------- données par circonscription (indice = RID) ---------- */
function preparer() {
  const ordre = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  CP = DATA.ridings.map(r => { const c = PROJ.circ[r.id]; if (!c) return null;
    const parts = Object.fromEntries(Object.entries(c.s).map(([p, [v]]) => [p, v])), o = ordre(parts);
    return { g: o[0][0], parts, moe: Object.fromEntries(Object.entries(c.s).map(([p, [, m]]) => [p, m])), marge: o[0][1] - (o[1] ? o[1][1] : 0) }; });
  CE = DATA.ridings.map(r => { const c = PROJ.circ[r.id]; if (!c) return null;
    const o = ordre(c.e25); return { g: o[0][0], parts: c.e25, marge: o[0][1] - (o[1] ? o[1][1] : 0) }; });
  CA = DATA.ridings.map(r => PROJ.circ[r.id]?.act ?? null);
  const compte = arr => arr.reduce((s, c) => { if (c) s[c.g] = (s[c.g] || 0) + 1; return s; }, {});
  SIEGES_DE = {
    proj: Object.fromEntries(Object.entries(PROJ.national).filter(([, x]) => x.s > 0).map(([p, x]) => [p, x.s])),
    e25: compte(CE),
    act: CA.reduce((s, a) => { const k = a ? a.p : "VAC"; s[k] = (s[k] || 0) + 1; return s; }, {}),
  };
  const e = SOND.sondages.find(s => s.e && s.d === DATE_ELECTION);
  E25NAT = e ? Object.fromEntries(P.map(p => [p, e[p]])) : {};
}
const etatCirc = (i, g = groupe()) => g === "e25" ? CE[i] : g === "proj" ? CP[i] : null;

/* ---------- plan de la Chambre des communes ----------
   Comme le plan de l'Assemblée nationale (Votes Québec), mais à l'horizontale : présidence à gauche, gouvernement en bas,
   opposition en haut (banquettes face à face) ; le surplus du gouvernement va au bout des banquettes d'en face.
   PM : premier ministre, C : chef de l'opposition officielle. */
function chambre(svgEl, seatsBy, n) {
  const S = 10, G = 2.6, STEP = S + G, AISLE = 6, C = 26, ROWS = 6, MID = 22, K = 3, MARGE = 16;
  const maj = Math.floor(n / 2) + 1, govCap = maj - 1, oppCap = n - maj;
  const RH = Math.max(ROWS, Math.ceil((govCap - ROWS * C) / K), Math.ceil((oppCap - ROWS * C) / K));
  const x0 = 56, colX = j => x0 + j * STEP + Math.floor(j / 2) * AISLE;
  const xR = colX(C - 1) + S + 12, endX = k => xR + k * STEP;
  const H = 2 * (MID + RH * STEP) + 2 * MARGE, cy = H / 2, W = endX(K - 1) + S + 6;
  const yTop = r => cy - MID - S - r * STEP, yBot = r => cy + MID + r * STEP;
  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const bench = y => { const out = []; for (let j = 0; j < C; j++) for (let r = 0; r < ROWS; r++) out.push({ x: colX(j), y: y(r), j, r }); return out; };
  const end = y => { const out = []; for (let k = 0; k < K; k++) for (let r = 0; r < RH; r++) out.push({ x: endX(k), y: y(r), j: C + k, r }); return out; };
  const side = (y, cap) => { const all = [...bench(y), ...end(y)].slice(0, cap), nb = C * ROWS;
    return [...all.slice(0, nb), ...all.slice(nb).sort((a, b) => a.j - b.j || b.r - a.r)]; };
  const govSlots = side(yBot, govCap), oppSlots = side(yTop, oppCap);
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
  if (pres) chair.style("fill", COUL[pres.p]); else chair.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 1.4);
  chair.append("title").text(pres ? `Présidence : député du ${pres.p}, compté dans ses ${seatsBy[pres.p]} sièges. Il ne vote qu'en cas d'égalité.` : "Présidence");
  txt(31, cy - 13, "Présidence", { size: 6.5 });
  txt(x0, H - 4, "Gouvernement", { size: 7, anchor: "start" });
  txt(x0, 10, "Opposition", { size: 7, anchor: "start" });
  txt((x0 + colX(C - 1) + S) / 2, cy + 2.6, `majorité : ${maj} sièges`, { size: 7.5 });
  for (const s of placed) {
    const r = g.append("rect").attr("x", s.x).attr("y", s.y).attr("width", S).attr("height", S).attr("rx", 2.2);
    if (s.p === "VAC") r.style("fill", "none").style("stroke", "var(--muted)").attr("stroke-width", 0.8); else r.style("fill", COUL[s.p]);
    r.append("title").text(NOMS[s.p] || s.p);
  }
  const front = (p, cote) => placed.filter(s => s.p === p && s.r === 0 && s.j < C && (cote === "gov" ? s.y > cy : s.y < cy))
    .sort((a, b) => Math.abs(a.j - C / 2) - Math.abs(b.j - C / 2))[0];
  const mark = (s, t) => { if (s) txt(s.x + S / 2, s.y + S / 2 + 2.3, t, { size: t.length > 1 ? 5.2 : 6.5, w: 800, fill: "#fff", ls: "0" }); };
  mark(front(gov, "gov"), "PM");
  if (opp[0] && opp[0] !== "VAC") mark(front(opp[0], "opp"), "C");
}

/* ---------- en-tête, plan de la Chambre ---------- */
const CHAMBRES = { proj: "Projection Qc125", act: "Chambre actuelle", e25: "Élection 2025" };
function dessinerTete() {
  const sond = SOND.sondages.filter(s => !s.e && s.d > DATE_ELECTION), dernier = sond[sond.length - 1];
  $("viTitre").textContent = "Intentions de vote fédérales";
  $("viSource").innerHTML = `Projection Qc125 du ${dateAn(PROJ.maj.date)} · ${sond.length} sondages depuis l'élection du 28 avril ${AN(2025)}`
    + (dernier ? ` · dernier : ${esc(dernier.f)}, ${dateAn(dernier.d)}` : "");
  $("viNote").textContent = "Projection : chaque circonscription est colorée selon le parti en tête dans la projection de Qc125 ; le nombre de sièges est celui de Qc125 (moyenne de ses simulations), avec sa fourchette.";
  let ex = $("vfExplic");
  if (!ex) { ex = document.createElement("div"); ex.id = "vfExplic"; ex.className = "vf-explic"; $("viNote").before(ex); }
  ex.innerHTML = `<p>Les 343 députés de la Chambre des communes sont élus au scrutin majoritaire à un tour, un par circonscription : le candidat qui a le plus de voix l'emporte, même sans majorité. Le parti qui obtient la confiance de la Chambre forme le gouvernement ; avec 172 sièges ou plus, il est majoritaire. La prochaine élection est prévue au plus tard le 15 octobre ${AN(2029)}, sauf dissolution.</p>`;
  // choix de la chambre affichée : projection, chambre actuelle ou élection de 2025
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
  const s = SIEGES_DE[etat.chambre], ordre = Object.keys(s).filter(p => p !== "VAC").sort((a, b) => s[b] - s[a]), lead = ordre[0];
  const statut = s[lead] >= MAJ ? "majoritaire" : "minoritaire";
  $("viSiegesTitre").textContent = etat.chambre === "act" ? `${NOMS[lead]} : ${s[lead]} sièges, gouvernement ${statut}`
    : etat.chambre === "e25" ? `${NOMS[lead]} : ${s[lead]} sièges élus, gouvernement ${statut}` : `${NOMS[lead]} : ${s[lead]} sièges, gouvernement ${statut}`;
  const eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  eb.innerHTML = etat.chambre === "proj" ? `Chambre des communes · projection du ${dateAn(PROJ.maj.date)}`
    : etat.chambre === "act" ? "Chambre des communes · composition actuelle" : `Chambre des communes · élection du 28 avril ${AN(2025)}`;
  chambre($("viPlan"), s, SIEGES);
  $("viLegende").innerHTML = [...SEAT_ORDER].filter(p => s[p]).sort((a, b) => (a === "VAC") - (b === "VAC") || s[b] - s[a])
    .map(p => `<span style="--c:${p === "VAC" ? "var(--muted)" : COUL[p]}"><i></i>${p === "VAC" ? "Vacants" : p} <b>${s[p]}</b>`
      + (etat.chambre === "proj" && PROJ.national[p] ? ` <small>[${PROJ.national[p].smin}–${PROJ.national[p].smax}]</small>` : "") + "</span>").join("");
}

/* ---------- carte ---------- */
const MW = 760, MH = 620;
let svg, gZ, gRid, gReg, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const partDe = (c, p) => (c && c.parts[p]) || 0;
const deuxieme = c => Object.entries(c.parts).filter(([p]) => p !== "IND").sort((a, b) => b[1] - a[1])[1] || Object.entries(c.parts).sort((a, b) => b[1] - a[1])[1];
function remplir(i) {
  if (etat.mode === "act") { const a = CA[i]; return a ? [COUL[a.p] || COUL.AUT, 0.85] : ["var(--soft)", 1]; }
  const c = etatCirc(i);
  if (!c) return ["var(--soft)", 1];
  if (etat.mode === "second") { const [p, v] = deuxieme(c); return [COUL[p] || COUL.AUT, Math.max(0.3, Math.min(1, (v - 10) / 30))]; }
  if (voteMode()) return [COUL[etat.parti], Math.max(0.06, Math.min(1, partDe(c, etat.parti) / 60))];
  return [COUL[c.g] || COUL.AUT, Math.max(0.3, Math.min(1, (partDe(c, c.g) - 20) / 40))];
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
const LBL_MIN_CIRC = 14, LBL_NAME = 70, NAME_ZOOM = 8;
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
  const k = Math.min(200, pad / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
  svg.transition().duration(reduit ? 0 : 700).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}
function construireCarte() {
  for (const g of [DATA.ridingGeo, DATA.curRegionGeo]) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  // conique conforme de Lambert (Statistique Canada) : parallèles 49° et 77°
  PROJ_FN = d3.geoConicConformal().rotate([96, 0]).parallels([49, 77]).fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.curRegionGeo);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { sudqc: boite([-79.6, 44.9], [-64.0, 49.4]), mtl: boite([-74.1, 45.38], [-73.42, 45.72]), tor: boite([-79.9, 43.45], [-78.9, 44.1]),
    ott: boite([-76.05, 45.18], [-75.4, 45.6]), van: boite([-123.35, 49.0], [-122.45, 49.38]) });
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gRid = gZ.append("g"); gReg = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gRid.selectAll("path").data(DATA.ridingGeo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e, f) => choisir(f.properties.RID))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.RID); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  gReg.selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  ZOOM = d3.zoom().scaleExtent([1, 200]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
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
  $("viPlein").addEventListener("click", pleinEcran);   // bouton en bas de la carte, hors de la barre de zoom
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; ecrireLS("viPct", etat.pct); peindre(); });
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").innerHTML = P.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}">${p}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return;
    etat.parti = b.dataset.p; if (!voteMode()) etat.mode = groupe() === "e25" ? "e25vote" : "vote"; peindre(); if (sel == null) dessinerPanneau(); });
}
// boutons de mode, en groupes (comme Votes France) : projection · élection de 2025 · chambre actuelle
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  // projection d'abord (le sujet de la page) ; élection de 2025 et chambre actuelle ensuite, pour comparer
  $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">Projection Qc125</span><span class="lv-groupe">${[["lead", "En tête"], ["second", "Meilleur 2e"], ["vote", "Vote"]].map(bouton).join("")}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Élection ${AN(2025)}</span><span class="lv-groupe">${[["e25", "Élu"], ["e25vote", "Vote"]].map(bouton).join("")}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Chambre actuelle</span><span class="lv-groupe">${bouton(["act", "Députés"])}</span></span>`;
}
function changerMode(m) {
  etat.mode = m;
  if (voteMode() && !etat.parti) etat.parti = "PLC";
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
  an.innerHTML = groupe() === "act" ? "Députés actuels" : groupe() === "e25" ? `Élection ${AN(2025)}` : `Projection Qc125 · ${dateAn(PROJ.maj.date)}`;
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  const quoi = groupe() === "e25" ? `résultat de l'élection de ${AN(2025)}` : "projection Qc125";
  $("viEchelle").innerHTML = (groupe() === "e25" ? AN(2025) : "") + (voteMode()
    ? `<span>0 %</span>${ramp}<span>60 % et +</span><span>· vote ${p} dans chaque circonscription (${quoi})${etat.pct ? ` · chiffre = % du ${p}, plus de circonscriptions en zoomant` : ""}</span>`
    : etat.mode === "act" ? `<span class="vf-legende">${[...SEAT_ORDER].filter(k => SIEGES_DE.act[k] && k !== "VAC").map(k => `<span style="--c:${COUL[k]}"><i></i>${k}</span>`).join("")}<span style="--c:var(--soft)"><i></i>vacant</span></span><span>· parti du député actuel (changements de parti compris)</span>`
    : `<span>Couleur : parti ${etat.mode === "second" ? "arrivé deuxième" : etat.mode === "e25" ? "élu" : "en tête"} dans chaque circonscription (${quoi}). Plus la couleur est foncée, plus son score est élevé.</span>`);
}
function infobulle(e, f) {
  const i = f.properties.RID, r = DATA.ridings[i], t = $("viTip"), a = CA[i], cp = CP[i], ce = CE[i];
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  const reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const top3 = c => Object.entries(c.parts).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([p, v]) => `${p} ${nf(v, 0)} %`).join(" · ");
  t.innerHTML = `<b>${esc(r.n)}</b><small>${esc(reg)}</small><br>${a ? `Député : ${esc(a.nom)} (${a.p})` : "Siège vacant"}<br>`
    + (cp ? `<small>Projection : ${top3(cp)}</small><br>` : "") + (ce ? `<small>Élu en ${AN(2025)} : ${ce.g} (${nf(ce.parts[ce.g], 1)} %)</small>` : "");
}
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

/* ---------- panneau : tout le Canada, ou une circonscription ---------- */
function choisir(i) { sel = i; peindre(); dessinerPanneau(); }
const jauge = (lab, coul, v, droite = "", max = 60, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${coul}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
/* ---------- provinces : menu « Province » ; projection de Qc125 quand sa région est la province elle-même
   (Québec, Ontario, Alberta, Colombie-Britannique), sinon sièges des circonscriptions et vote moyen non pondéré ---------- */
const REGIONS = () => Object.fromEntries(DATA.regions.map(r => {
  const q = Object.values(PROJ.regions || {}).find(x => x.provs.length === 1 && x.provs[0] === r.code);
  return [r.code, { nom: r.name, provs: [r.code], parts: q ? q.parts : null }];
}));
const dans = i => !etat.reg || REGIONS()[etat.reg].provs.includes(DATA.ridings[i].r);
const regionDe = prov => prov;
const compter = arr => arr.reduce((o, c, i) => { if (dans(i)) { const k = c ? c.g : "VAC"; o[k] = (o[k] || 0) + 1; } return o; }, {});
function choisirRegion(k, prov = null) {
  etat.reg = k; sel = null;
  const provs = prov ? [prov] : k ? REGIONS()[k].provs : null;
  if (provs) zoomVers({ type: "FeatureCollection", features: DATA.curRegionGeo.features.filter(f => provs.includes(f.properties.REG)) }, 0.9);
  else svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity);
  peindre(); dessinerPanneau();
}
// menu « Province » : on clique sur le bouton, puis on choisit la province
const selecteurRegions = () => `<details class="vc-menu"><summary>Province : <b>${etat.reg ? esc(REGIONS()[etat.reg].nom) : "Tout le Canada"}</b></summary>
  <div class="vc-menu-liste">${[[null, "Tout le Canada"], ...DATA.regions.map(r => [r.code, r.name])]
    .map(([k, t]) => `<button type="button" data-regsel="${k || ""}" aria-pressed="${(k || null) === etat.reg}">${esc(t)}</button>`).join("")}</div></details>`;
// panneau adapté à ce que montre la carte : projection (par défaut), élection de 2025 ou députés actuels
function tableProvinces(src, titre, autres = "Autres") {
  const provs = DATA.regions.filter(r => !etat.reg || REGIONS()[etat.reg].provs.includes(r.code));
  if (provs.length < 2) return "";
  const lignes = provs.map(r => { const n = Object.fromEntries(P.map(p => [p, 0])); n.AUT = 0;
    DATA.ridings.forEach((x, i) => { if (x.r !== r.code) return; const c = src[i]; if (!c) n.AUT++; else if (n[c.g] != null) n[c.g]++; else n.AUT++; });
    return `<tr><td><button type="button" class="vi-lien" data-reg="${r.code}">${esc(r.name)}</button></td>${P.map(p => `<td class="${n[p] ? "has" : ""}" style="--c:${COUL[p]}">${n[p] || "·"}</td>`).join("")}<td class="${n.AUT ? "has" : ""}" style="--c:var(--ink)">${n.AUT || "·"}</td></tr>`; }).join("");
  return `<span class="lv-eyebrow">${titre}</span>
    <div class="vi-table"><table><thead><tr><th>Province</th>${P.map(p => `<th style="color:${COUL[p]}">${p}</th>`).join("")}<th>${autres}</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
}
const listeCirc = (items, droite) => `<ul class="vi-serres">${items.map(([i, c]) => `<li data-rid="${i}" tabindex="0" style="--c:${COUL[c.g] || COUL.AUT}"><i></i>${esc(DATA.ridings[i].n)}<b>${droite(c)}</b></li>`).join("") || "<li>Aucune</li>"}</ul>`;
const ecart = (v, d = 0, u = "") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${nf(Math.abs(v), d)}${u}`;
// en mode Vote : meilleures circonscriptions du parti choisi
function meilleures(arr, quoi) {
  if (!voteMode() || !etat.parti) return "";
  const p = etat.parti, top = arr.map((c, i) => [i, c]).filter(([i, c]) => c && c.parts[p] && dans(i)).sort((a, b) => b[1].parts[p] - a[1].parts[p]).slice(0, 10);
  return `<span class="lv-eyebrow">Meilleures circonscriptions du ${p} (${quoi})</span>${listeCirc(top, c => `${p} ${nf(c.parts[p], quoi === "projection" ? 0 : 1)} %`)}`;
}
function dessinerPanneau() {
  const z = $("viPanneau"), N = PROJ.national, g = groupe();
  if (sel == null) {
    const R = etat.reg ? REGIONS()[etat.reg] : null, nomR = R ? R.nom : "Tout le Canada", total = DATA.ridings.filter((x, i) => dans(i)).length;
    const act = compter(CA.map(a => a && { g: a.p })), e25 = compter(CE);
    const pills = sg => { const lead = Object.keys(sg).filter(p => p !== "VAC").sort((a, b) => sg[b] - sg[a])[0];
      return `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[lead]}"></i>${R ? `${lead} en tête` : `${lead} ${sg[lead] >= MAJ ? "majoritaire" : "minoritaire"}`} : ${sg[lead]} / ${total}</span>`
        + `${R ? `<span class="vi-pill">${total} circonscriptions</span>` : `<span class="vi-pill">Majorité : ${MAJ}</span>`}${sg.VAC ? `<span class="vi-pill">${sg.VAC} sièges vacants</span>` : ""}</div>`; };
    const tete = (eb, sg) => `${selecteurRegions()}<span class="lv-eyebrow">${eb}</span><h3>${esc(nomR)}</h3>${pills(sg)}`;
    if (g === "proj") {
      // vote et sièges : projection régionale de Qc125 (ou nationale) ; territoires : sièges des circonscriptions, vote moyen non pondéré
      const s = R ? (R.parts ? Object.fromEntries(Object.entries(R.parts).filter(([, x]) => x.s > 0).map(([p, x]) => [p, x.s])) : compter(CP)) : SIEGES_DE.proj;
      const NN = R ? (R.parts || Object.fromEntries(P.map(p => { const idx = CP.map((c, i) => i).filter(dans), v = d3.mean(idx, i => CP[i]?.parts[p] || 0); return [p, { v, s: s[p] || 0 }]; }).filter(([, x]) => x.v >= 0.5))) : N;
      const parts = Object.keys(NN).filter(p => NN[p].v >= 0.5).sort((a, b) => (NN[b].s || 0) - (NN[a].s || 0) || NN[b].v - NN[a].v);
      const serres = CP.map((c, i) => [i, c]).filter(([i, c]) => c && c.marge < 5 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      const bascules = CP.map((c, i) => [i, c]).filter(([i, c]) => c && CE[i] && c.g !== CE[i].g && dans(i));
      z.innerHTML = `${tete(`Projection Qc125 · ${dateAn(PROJ.maj.date)}`, s)}
        <p class="lv-muted">Si l'élection avait lieu aujourd'hui. ${R && !R.parts ? "Vote : moyenne simple des circonscriptions (Qc125 ne publie pas de projection pour cette province seule)." : "Sièges : moyenne des simulations de Qc125, suivie de sa fourchette."} Clique sur une circonscription pour son détail.</p>
        <span class="lv-eyebrow">Vote et sièges projetés${R ? ` · ${esc(R.nom)}` : ""}</span><div class="vi-vrows">${parts.map(p => jauge(p, COUL[p], NN[p].v, `<b>${NN[p].s || 0}</b>${NN[p].smax != null ? ` <small>${NN[p].smin}–${NN[p].smax}</small>` : ""}`, 60, "vc-proj")).join("")}</div>
        <span class="lv-eyebrow">Par rapport à l'élection de ${AN(2025)}</span>
        <div class="vi-vrows">${P.filter(p => R ? (s[p] || e25[p]) : E25NAT[p] != null).map(p => `<div class="vi-vrow"><b style="color:${COUL[p]}">${p}</b><span class="vi-num" style="text-align:left">${R ? `<small>${e25[p] || 0} élus en ${AN(2025)}</small>` : `${ecart(N[p].v - E25NAT[p], 1, " pts")} <small>de vote</small>`}</span><span></span><span class="vi-num"><b>${ecart((s[p] || 0) - (e25[p] || 0))}</b> <small>sièges</small></span></div>`).join("")}</div>
        ${meilleures(CP, "projection")}
        ${tableProvinces(CP, "Sièges par province · parti en tête dans la projection")}
        <span class="lv-eyebrow">Les plus serrées (moins de 5 points)</span>${listeCirc(serres.slice(0, 12), c => c.marge ? `${c.g} +${nf(c.marge, 0)}` : `${c.g} · égalité`)}
        <details class="lv-sg vf-hors"><summary><span>Circonscriptions qui changeraient de parti par rapport à ${AN(2025)}</span><small>${bascules.length}</small></summary>
        ${listeCirc(bascules, c => `${c.g} <small>(élu ${CE[bascules.find(([, x]) => x === c)[0]].g})</small>`)}</details>`;
      return;
    }
    if (g === "e25") {
      const serres = CE.map((c, i) => [i, c]).filter(([i, c]) => c && c.marge < 3 && dans(i)).sort((a, b) => a[1].marge - b[1].marge);
      z.innerHTML = `${tete(`Élection du 28 avril ${AN(2025)}`, e25)}
        <p class="lv-muted">Résultat officiel dans chaque circonscription (découpage de 2023). Pour la projection actuelle, choisis « Projection Qc125 » au-dessus de la carte.</p>
        ${R ? `<span class="lv-eyebrow">Sièges · ${esc(R.nom)}</span>
        <div class="vi-vrows">${P.filter(p => e25[p]).sort((a, b) => e25[b] - e25[a]).map(p => `<div class="vi-vrow vf-gp"><b style="color:${COUL[p]}">${p}</b><span class="vi-jauge"><i style="width:${100 * e25[p] / total}%;background:${COUL[p]}"></i></span><span class="vi-num"><b>${e25[p]}</b></span><span class="vi-num"><small>élus</small></span></div>`).join("")}</div>`
        : `<span class="lv-eyebrow">Vote et sièges</span>
        <div class="vi-vrows">${P.filter(p => E25NAT[p] != null).sort((a, b) => (e25[b] || 0) - (e25[a] || 0)).map(p => jauge(p, COUL[p], E25NAT[p], `<b>${e25[p] || 0}</b> <small>élus</small>`)).join("")}</div>`}
        ${meilleures(CE, "élection de " + AN(2025))}
        ${tableProvinces(CE, `Sièges par province · élus en ${AN(2025)}`)}
        <span class="lv-eyebrow">Les plus serrées en ${AN(2025)} (moins de 3 points)</span>${listeCirc(serres.slice(0, 12), c => `${c.g} +${nf(c.marge, 1)}`)}`;
      return;
    }
    const changes = CA.map((a, i) => [i, a]).filter(([i, a]) => (!a || a.note) && dans(i));
    z.innerHTML = `${tete("Chambre des communes · composition actuelle", act)}
      <p class="lv-muted">Député de chaque circonscription aujourd'hui, changements de parti compris (carte de Qc125, ${dateAn(PROJ.maj.date)}).</p>
      <span class="lv-eyebrow">Sièges par parti</span>
      <div class="vi-vrows">${SEAT_ORDER.filter(p => act[p]).map(p => `<div class="vi-vrow vf-gp"><b style="color:${p === "VAC" ? "var(--muted)" : COUL[p]}">${p === "VAC" ? "Vacants" : p}</b><span class="vi-jauge"><i style="width:${100 * act[p] / (R ? total : 200)}%;background:${p === "VAC" ? "var(--muted)" : COUL[p]}"></i></span><span class="vi-num"><b>${act[p]}</b></span><span class="vi-num"><small>${p === "VAC" ? "" : `${ecart(act[p] - (e25[p] || 0))} depuis ${AN(2025)}`}</small></span></div>`).join("")}</div>
      <span class="lv-eyebrow">Changements depuis l'élection : sièges vacants et changements de parti</span>
      <ul class="vi-serres">${changes.map(([i, a]) => `<li data-rid="${i}" tabindex="0" style="--c:${a ? COUL[a.p] : "var(--muted)"}"><i></i>${esc(DATA.ridings[i].n)}${a ? ` · ${esc(a.nom)}` : ""}<b>${a ? `${a.p} <small>(${esc(a.note.replace(/^Élu(e)? avec le /, "élu "))})</small>` : "vacant"}</b></li>`).join("") || "<li>Aucun</li>"}</ul>
      ${tableProvinces(CA.map(a => a && { g: a.p }), "Députés actuels par province", "Autres / vac.")}`;
    return;
  }
  const r = DATA.ridings[sel], cp = CP[sel], ce = CE[sel], a = CA[sel], reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  const lignes = (c, moe) => Object.entries(c.parts).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).map(([p, v]) =>
    `<div class="vi-vrow${p === c.g ? " win" : ""}"><b style="color:${COUL[p] || COUL.AUT}">${p}</b><span class="vi-jauge"><i style="width:${Math.min(100, v * 100 / 60)}%;background:${COUL[p] || COUL.AUT}"></i></span>`
    + `<span class="vi-num">${nf(v, moe ? 0 : 1)} %</span><span class="vi-num">${moe && moe[p] != null ? `<small>± ${moe[p]}</small>` : ""}</span></div>`).join("");
  const blocProj = cp ? `<span class="lv-eyebrow">Projection Qc125 · ${dateAn(PROJ.maj.date)}</span><div class="vi-vrows">${lignes(cp, cp.moe)}</div>` : "";
  const blocE25 = ce ? `<span class="lv-eyebrow">Élection du 28 avril ${AN(2025)}</span><div class="vi-vrows">${lignes(ce)}</div>` : "";
  const depute = `<p class="vi-elu" style="--c:${a ? COUL[a.p] || COUL.AUT : "var(--soft)"}">${a ? `<b>${esc(a.nom)}</b> · ${NOMS[a.p] || a.p}${a.note ? ` <small>(${esc(a.note)})</small>` : ""}` : "<b>Siège vacant</b> (élection partielle à venir)"}</p>`;
  const pillsC = g === "e25" ? (ce ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[ce.g]}"></i>Élu en ${AN(2025)} : ${ce.g}</span><span class="vi-pill">Avance : ${nf(ce.marge, 1)} pts</span></div>` : "")
    : (cp ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[cp.g]}"></i>En tête (projection) : ${cp.g}</span><span class="vi-pill">${cp.marge ? `Avance : ${nf(cp.marge, 0)} pts` : "À égalité (projection arrondie)"}</span>`
      + (ce && ce.g !== cp.g ? `<span class="vi-pill">Gain sur ${ce.g} (élu en ${AN(2025)})</span>` : "") + "</div>" : "");
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(reg)}</span><h3>${esc(r.n)}</h3>
    ${g === "act" ? depute + pillsC : pillsC}
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← ${etat.reg ? esc(REGIONS()[etat.reg].nom) : "Tout le Canada"}</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>
      <a class="vi-lien" href="https://qc125.com/canada/${r.id}f.htm" target="_blank" rel="noopener">Fiche Qc125 ↗</a></div>
    ${g === "e25" ? blocE25 + blocProj : blocProj + blocE25}
    ${g === "act" ? "" : `<span class="lv-eyebrow">Député actuel</span>${depute}`}`;
}
document.addEventListener("click", e => {
  if (!e.target.closest("#viPanneau")) return;
  const l = e.target.closest("[data-rid]"); if (l) { choisir(+l.dataset.rid); return; }
  const rs = e.target.closest("[data-regsel]"); if (rs) { choisirRegion(rs.dataset.regsel || null); return; }
  const rg = e.target.closest("[data-reg]");
  if (rg) { choisirRegion(regionDe(rg.dataset.reg), rg.dataset.reg); return; }
  if (e.target.closest("[data-tout]")) { choisirRegion(etat.reg); return; }
  if (e.target.closest("[data-zoomsel]") && sel != null) zoomVers(DATA.ridingGeo.features.find(x => x.properties.RID === sel), 0.5);
});
document.addEventListener("keydown", e => {
  const l = e.target.closest?.("#viPanneau [data-rid]"); if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(+l.dataset.rid); }
});

/* ---------- évolution des intentions de vote ---------- */
let periode = lireLS("vcPeriode", 3);   // 3 derniers mois par défaut
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 54, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = SOND.sondages.filter(s => !s.e);
  const fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([t(DATE_ELECTION), d3.timeMonth.offset(fin_, -periode)]) : t(DATE_ELECTION);
  const dans = d => t(d) >= debut;
  const sond = tous.filter(s => dans(s.d));
  const elecVis = SOND.sondages.filter(s => s.e && dans(s.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  $("viEvolSur").innerHTML = periode ? `${periode < 12 ? periode + " derniers mois" : periode === 12 ? "Dernière année" : periode / 12 + " dernières années"}` : `Depuis l'élection de ${AN(2025)}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(P, p => s[p])) || 40;
  const y = d3.scaleLinear().domain([0, Math.ceil((yMax + 4) / 10) * 10]).range([H - m.b, m.t]);
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien), calculée sur tous les sondages
  const SIGMA = periode && periode <= 6 ? 10 : 18, t0 = t(tous[0].d), t1 = t(tous[tous.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= datesVis.map(d => { let a = 0, w = 0; for (const s of tous) { if (s[p] == null) continue; const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: a / w }; });
  const nbAutour = d => tous.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 30).length;
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote fédérales depuis 2025");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : periode && periode <= 6 ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", periode && periode <= 6 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of P) {
    svgE.append("g").selectAll("circle").data(sond.filter(s => s[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", periode && periode <= 12 ? 3.2 : 2.2).style("fill", COUL[p]);
    const mm = moy(p); fin[p] = mm[mm.length - 1];
    svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", COUL[p]);
    svgE.append("g").selectAll("rect").data(elecVis).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", COUL[p]);
  }
  const etiq = P.map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => COUL[d.p]).text(d => `${d.p} ${nf(d.v, 0)}`);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = datesVis.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = P.map(p => [p, moy(p).find(o => o.d === d).v]).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±30 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${COUL[p]}"><i></i>${p} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      tipE.style.left = Math.min(r.width - tipE.offsetWidth - 4, Math.max(4, px + 12)) + "px"; tipE.style.top = "8px";
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = `${sond.length} sondage${sond.length > 1 ? "s" : ""} nationa${sond.length > 1 ? "ux" : "l"} sur la période (Qc125). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultat de l'élection.`;
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, PROJ, SOND] = await Promise.all([lireJ("votes-canada/data.json"), lireJ("votes-canada/projection.json"), lireJ("votes-canada/sondages.json")]);
    preparer();
    dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution();
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vcPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
