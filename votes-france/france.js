/* Votes France — intentions de vote aux législatives, même gabarit que « Votes Québec » (votes-quebec/intentions.js).
   Base : l'Assemblée élue en 2024 (577 sièges, hémicycle) et le 1er tour par circonscription (data.json, ministère de l'Intérieur).
   Assemblée actuelle : groupes parlementaires et député de chaque circonscription (données ouvertes de l'Assemblée,
   ajoutées à data.json par outils/assemblee_fr.py) — c'est l'état le plus récent tant qu'aucun sondage législatif récent n'existe.
   Intentions de vote : législatives (sondages.json, rares depuis la fin de 2025) et présidentielle 2027 (sondages-pres.json),
   tableaux Wikipédia qui citent chaque sondeur. Aucune projection en sièges (2 tours : trop incertain par circonscription). */

const SIEGES = 577, MAJ = 289;
const NOMS = { EXG: "Extrême gauche", NFP: "Gauche (NFP)", DVG: "Divers gauche", REG: "Régionalistes", ENS: "Ensemble (centre)", DVC: "Divers centre",
  LR: "Les Républicains", DVD: "Divers droite", RN: "RN et alliés (UDR)", EXD: "Extrême droite", DIV: "Divers" };
const COURT = { EXG: "EXG", NFP: "NFP", DVG: "DVG", REG: "Rég.", ENS: "ENS", DVC: "DVC", LR: "LR", DVD: "DVD", RN: "RN-UDR", EXD: "EXD", DIV: "Div." };
const COUL = { EXG: "#7A1A1A", NFP: "#A01D6C", DVG: "#E07AAE", REG: "#6E6585", ENS: "#F5A623", DVC: "#D4AF0F", LR: "#1B8FD0",
  DVD: "#64BDE6", RN: "#8B6331", EXD: "#B08D57", DIV: "#A58FD4" };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };


let DATA, SOND, PRES, BLOCS, PAR_ID = {}, GP = {}, sel = null, demarre = false;
const etat = { mode: "actuel", parti: null, pct: lireLS("vfPct", true) };

/* ---------- moyennes des derniers sondages ---------- */
function moyenneRecente(n = 3) {
  const s = SOND.sondages.filter(x => !x.e).slice(-n);
  if (!s.length) return null;
  const moy = Object.fromEntries(BLOCS.map(b => [b, d3.mean(s, x => x[b] || 0)]));
  return { moy, n: s.length, de: s[0].d, a: s[s.length - 1].d, firmes: [...new Set(s.map(x => x.f))] };
}
// présidentielle : moyenne des sondages des 30 derniers jours (au moins 3), par candidat présent
function presRecente() {
  const s = PRES.sondages, fin = new Date(s[s.length - 1].d + "T12:00:00");
  let r = s.filter(x => (fin - new Date(x.d + "T12:00:00")) / 864e5 <= 30);
  if (r.length < 3) r = s.slice(-3);
  const cands = {};
  for (const x of r) for (const [k, v] of Object.entries(x.v)) (cands[k] ||= []).push(v);
  const moy = Object.entries(cands).filter(([, v]) => v.length >= Math.ceil(r.length / 2)).map(([k, v]) => [k, d3.mean(v)]).sort((a, b) => b[1] - a[1]);
  return { moy, n: r.length, de: r[0].d, a: r[r.length - 1].d };
}
const nomCourt = n => n.split(" ").slice(-1)[0].replace(/^(Pen|Villepin|Aignan)$/, m => ({ Pen: "Le Pen", Villepin: "de Villepin", Aignan: "Dupont-Aignan" })[m]);

/* ---------- en-tête et hémicycle : Assemblée actuelle ---------- */
function dessinerTete() {
  const A = DATA.assemblee, lead = A.groupes.slice().sort((a, b) => b.n - a.n)[0], p = presRecente();
  $("viTitre").textContent = "Intentions de vote et Assemblée actuelle";
  $("viSource").innerHTML = `Assemblée nationale au ${dateFr(A.date)} (députés en exercice) · présidentielle 2027 : moyenne de ${p.n} sondages du ${dateFr(p.de)} au ${dateFr(p.a)}`;
  $("viNote").textContent = "Aucun sondage d'intentions de vote aux législatives n'a été publié depuis octobre 2025 (registre de la Commission des sondages) : la page montre donc l'Assemblée telle qu'elle est aujourd'hui, et les intentions de vote de la présidentielle 2027. Prochaines législatives au plus tard en 2029, sauf dissolution.";
  $("viSiegesTitre").textContent = lead.n >= MAJ ? `${lead.nom} : ${lead.n} sièges, majorité absolue` : `Aucune majorité absolue · premier groupe : ${lead.id} (${lead.n} sièges)`;
  hemicycle($("viPlan"), [...A.groupes.map(g => ({ k: g.id, n: g.n, c: g.c, nom: g.nom })), ...(A.vacants ? [{ k: "VAC", n: A.vacants, c: "var(--soft)", nom: "Siège vacant" }] : [])]);
  $("viLegende").innerHTML = A.groupes.map(g => `<span style="--c:${g.c}" title="${esc(g.nom)}"><i></i>${esc(g.id)} <b>${g.n}</b></span>`).join("")
    + (A.vacants ? `<span style="--c:var(--soft)"><i></i>Vacants <b>${A.vacants}</b></span>` : "");
}
// hémicycle : rangées en demi-cercle, sièges répartis par angle de gauche à droite (groupes en quartiers)
function hemicycle(svgEl, parts) {
  const R = 14, r0 = 0.42, W = 1000, H = 520, cx = W / 2, cy = H - 20, Rmax = 470;
  const rayons = d3.range(R).map(i => r0 + i * (1 - r0) / (R - 1));
  const somme = d3.sum(rayons);
  const parRangee = rayons.map(r => Math.round(SIEGES * r / somme));
  parRangee[R - 1] += SIEGES - d3.sum(parRangee);
  const places = [];
  rayons.forEach((r, i) => { const n = parRangee[i];
    for (let k = 0; k < n; k++) { const a = Math.PI - k * Math.PI / (n - 1); places.push({ a, r, x: cx + Math.cos(a) * r * Rmax, y: cy - Math.sin(a) * r * Rmax }); } });
  places.sort((p, q) => q.a - p.a || p.r - q.r);
  const sieges = parts.flatMap(p => d3.range(p.n).map(() => p));
  const pas = Rmax * (1 - r0) / (R - 1), rayon = pas * 0.42;
  const g = d3.select(svgEl).attr("viewBox", `0 0 ${W} ${H}`); g.selectAll("*").remove();
  g.selectAll("circle").data(places).join("circle").attr("cx", p => p.x).attr("cy", p => p.y).attr("r", rayon)
    .style("fill", (p, i) => sieges[i] ? sieges[i].c : "var(--soft)").append("title").text((p, i) => sieges[i] ? sieges[i].nom : "");
  g.append("text").attr("x", cx).attr("y", cy - 50).attr("text-anchor", "middle").attr("class", "vf-hemi-n").text(SIEGES);
  g.append("text").attr("x", cx).attr("y", cy - 18).attr("text-anchor", "middle").attr("class", "vf-hemi-maj").text(`députés · majorité ${MAJ}`);
}

/* ---------- carte : France métropolitaine + outre-mer en encarts (projection composite) ---------- */
const MW = 600, MH = 600;
let svg, gZ, gCirc, gDep, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity;
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const partDe = (c, b) => (c && c.s[b]) || 0;
const deuxieme = c => Object.entries(c.s).sort((a, b) => b[1] - a[1])[1] || [c.g, 0];
function remplir(id) {
  const c = PAR_ID[id];
  if (!c) return ["var(--soft)", 1];
  if (etat.mode === "actuel") return c.act ? [GP[c.act.gp]?.c || "#8D949A", 0.92] : ["var(--soft)", 1];
  if (etat.mode === "second") { const [b, v] = deuxieme(c); return [COUL[b], Math.max(0.3, Math.min(1, (v - 10) / 30))]; }
  if (etat.mode === "vote") return [COUL[etat.parti], Math.max(0.06, Math.min(1, partDe(c, etat.parti) / 50))];
  return [COUL[c.g], Math.max(0.35, Math.min(1, (partDe(c, c.g) - 15) / 35))];
}
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
  const k = f.properties.id;
  if (ANCRE[k]) return ANCRE[k];
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = [0, 0, -1];
  for (const poly of polys) {
    const rings = poly.map(r => r.map(xy => PROJ_FN(xy)).filter(Boolean));
    if (rings[0] && rings[0].length > 2) { const c = polylabel(rings); if (c[2] > best[2]) best = c; }
  }
  return ANCRE[k] = best;
}
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
  const k = Math.min(80, pad / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
  svg.transition().duration(reduit ? 0 : 700).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}
const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
const PRESETS = { idf: boite([1.95, 48.55], [2.75, 49.1]), paris: boite([2.22, 48.81], [2.47, 48.91]), lyon: boite([4.7, 45.62], [5.05, 45.88]),
  marseille: boite([5.2, 43.17], [5.62, 43.42]) };
function construireCarte() {
  for (const g of [DATA.geo, DATA.deps]) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  PROJ_FN = d3.geoConicConformalFrance().fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.geo);
  PATH = d3.geoPath(PROJ_FN);
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gCirc = gZ.append("g"); gDep = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gCirc.selectAll("path").data(DATA.geo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => PAR_ID[f.properties.id]?.n || f.properties.id)
    .on("click", (e, f) => choisir(f.properties.id))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.id); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  gDep.selectAll("path").data(DATA.deps.features).join("path").attr("class", "lv-reg vf-dep").attr("d", PATH);
  ZOOM = d3.zoom().scaleExtent([1, 80]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
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
    else if (z === "plein") pleinEcran();
    else if (PRESETS[z]) zoomVers(PRESETS[z], 0.95);
  });
  $("viModes").innerHTML = [["actuel", "Député actuel"], ["lead", "Élu en 2024"], ["second", "Meilleur 2e (2024)"], ["vote", "Vote 2024"]]
    .map(([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`).join("");
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  const choix = BLOCS.filter(b => DATA.national[b] >= 2);
  $("viChips").innerHTML = choix.map(b => `<button type="button" class="vi-chip" style="--c:${COUL[b]}" data-p="${b}">${COURT[b]}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return; etat.parti = b.dataset.p; etat.mode = "vote"; peindre(); });
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; ecrireLS("vfPct", etat.pct); peindre(); });
}
function changerMode(m) {
  etat.mode = m;
  if (m === "vote" && !etat.parti) etat.parti = Object.keys(DATA.sieges).sort((a, b) => DATA.sieges[b] - DATA.sieges[a])[0];
  peindre();
}
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", etat.mode === "vote" && b.dataset.p === etat.parti));
  $("viChips").setAttribute("aria-disabled", etat.mode !== "vote");
  $("viPct").hidden = etat.mode !== "vote"; $("viPct").setAttribute("aria-pressed", etat.pct);
  gCirc.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.id); this.style.fill = c; this.style.fillOpacity = o; });
  const f = sel != null ? DATA.geo.features.find(x => x.properties.id === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  const labs = gLbl.selectAll("g.vi-lab").data(etat.mode === "vote" && etat.pct ? DATA.geo.features : [], f => f.properties.id)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => nf(partDe(PAR_ID[f.properties.id], etat.parti), 0) + " %");
  labs.select("text.vi-nom").text(f => PAR_ID[f.properties.id]?.n || "");
  placerEtiquettes();
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  $("viEchelle").innerHTML = etat.mode === "vote"
    ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· ${NOMS[p]} au 1er tour de 2024 dans chaque circonscription${etat.pct ? " (chiffre = %, plus de circonscriptions en zoomant)" : ""}</span>`
    : etat.mode === "second" ? "Couleur : bloc arrivé deuxième au 1er tour de 2024 dans chaque circonscription. Plus la couleur est foncée, plus son score est élevé."
    : etat.mode === "lead" ? "Couleur : bloc du député élu en 2024. Plus la couleur est foncée, plus son score au 1er tour était élevé. Outre-mer en encarts ; les Français de l'étranger sont dans le panneau."
    : `<span class="vf-legende">${DATA.assemblee.groupes.map(g => `<span style="--c:${g.c}"><i></i>${esc(g.id)}</span>`).join("")}<span style="--c:var(--soft)"><i></i>vacant</span></span><span>· groupe du député actuel (Assemblée au ${dateFr(DATA.assemblee.date)})</span>`;
}
function infobulle(e, f) {
  const c = PAR_ID[f.properties.id], t = $("viTip"), box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  t.innerHTML = c ? `<b>${esc(c.n)}</b><small>${esc(c.r)} · ${nf(c.e)} inscrits</small><br>${c.act ? `Député : ${esc(c.act.nom)} (${esc(c.act.gp)})` : "Siège vacant"}<br>`
    + `<small>Élu en 2024 : ${esc(c.elu)} (${esc(c.gnu)})</small><br>`
    + `<small>1er tour : ${Object.entries(c.s).slice(0, 3).map(([b, v]) => `${COURT[b]} ${nf(v, 1)} %`).join(" · ")}</small>` : f.properties.id;
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

/* ---------- panneau ---------- */
function choisir(id) { sel = id; peindre(); dessinerPanneau(); }
const jauge = (lab, coul, v, droite = "", max = 50, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${coul}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
const ligneVote = (b, v, droite = "") => jauge(COURT[b], COUL[b], v, droite);
function dessinerPanneau() {
  const z = $("viPanneau"), s = DATA.sieges, nat = DATA.national, A = DATA.assemblee;
  if (sel == null) {
    const r = moyenneRecente(), p = presRecente();
    const groupes = A.groupes.slice().sort((a, b) => b.n - a.n), lead = groupes[0];
    const COLS = ["RN", "EPR", "LFI-NFP", "SOC", "DR"];
    const parReg = DATA.regions.map(reg => { const n = { AUT: 0 }; COLS.forEach(b => n[b] = 0);
      DATA.circ.filter(c => c.r === reg).forEach(c => { const g = c.act?.gp; if (g && n[g] != null) n[g]++; else n.AUT++; });
      return `<tr><td><button type="button" class="vi-lien" data-reg="${esc(reg)}">${esc(reg)}</button></td>${COLS.map(b => `<td class="${n[b] ? "has" : ""}" style="--c:${GP[b]?.c || "var(--ink)"}">${n[b] || "·"}</td>`).join("")}<td class="${n.AUT ? "has" : ""}" style="--c:var(--ink)">${n.AUT || "·"}</td></tr>`; }).join("");
    const horsCarte = DATA.circ.filter(c => !DATA.geo.features.some(f => f.properties.id === c.id));
    z.innerHTML = `<span class="lv-eyebrow">Assemblée nationale · ${dateFr(A.date)}</span><h3>Toute la France</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${lead.c}"></i>Premier groupe : ${esc(lead.id)} ${lead.n} / 577</span><span class="vi-pill">Majorité absolue : ${MAJ}</span>${A.vacants ? `<span class="vi-pill">${A.vacants} sièges vacants</span>` : ""}</div>
      <span class="lv-eyebrow">Groupes parlementaires</span>
      <div class="vi-vrows">${groupes.map(g => `<div class="vi-vrow vf-gp" title="${esc(g.nom)}"><b style="color:${g.c}">${esc(g.id)}</b><span class="vi-jauge"><i style="width:${100 * g.n / 130}%;background:${g.c}"></i></span><span class="vi-num"><b>${g.n}</b></span><span class="vi-num"><small>${nf(100 * g.n / 577, 1)} %</small></span></div>`).join("")}</div>
      <span class="lv-eyebrow">Présidentielle 2027 · moyenne de ${p.n} sondages (1er tour)</span>
      <div class="vi-vrows">${p.moy.slice(0, 8).map(([k, v]) => jauge(esc(nomCourt(k)), PRES.candidats[k]?.c || "#8D949A", v, `<small>${esc(PRES.candidats[k]?.parti || "")}</small>`, 50, "vf-pres")).join("")}</div>
      <p class="lv-muted lv-source">${dateFr(p.de)} – ${dateFr(p.a)} · premier scénario de chaque sondage</p>`
      + (r ? `<span class="lv-eyebrow">Législatives · dernier sondage le ${dateFr(r.a)}</span><div class="vi-vrows">${BLOCS.filter(b => r.moy[b] >= 1).sort((a, b) => r.moy[b] - r.moy[a])
          .map(b => ligneVote(b, r.moy[b])).join("")}</div><p class="lv-muted lv-source">Moyenne des ${r.n} derniers sondages législatifs (${r.firmes.map(esc).join(", ")}) · aucun depuis</p>` : "")
      + `<span class="lv-eyebrow">Élection de 2024 : 1er tour et sièges</span><div class="vi-vrows">${BLOCS.filter(b => s[b] || nat[b] >= 1).sort((a, b) => (s[b] || 0) - (s[a] || 0)).map(b => ligneVote(b, nat[b] || 0, `<b>${s[b] || 0}</b> <small>élus</small>`)).join("")}</div>
      <span class="lv-eyebrow">Députés actuels par région</span>
      <div class="vi-table"><table><thead><tr><th>Région</th>${COLS.map(b => `<th style="color:${GP[b]?.c}">${b.replace("-NFP", "")}</th>`).join("")}<th>Autres</th></tr></thead><tbody>${parReg}</tbody></table></div>
      <span class="lv-eyebrow">Hors carte (${horsCarte.length})</span>
      <ul class="vi-serres">${horsCarte.map(c => `<li data-id="${c.id}" tabindex="0" style="--c:${c.act ? GP[c.act.gp]?.c : "var(--soft)"}"><i></i>${esc(c.n)}<b>${c.act ? esc(c.act.gp) : "vacant"}</b></li>`).join("")}</ul>`;
    return;
  }
  const c = PAR_ID[sel]; if (!c) return;
  const tracee = DATA.geo.features.some(f => f.properties.id === c.id), g = c.act ? GP[c.act.gp] : null;
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(c.r)}</span><h3>${esc(c.n)}</h3>
    <p class="vi-elu" style="--c:${g ? g.c : "var(--soft)"}">${c.act ? `<b>${esc(c.act.nom)}</b> · ${esc(g?.nom || c.act.gp)}` : "<b>Siège vacant</b> (élection partielle à venir)"}</p>
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Toute la France</button>${tracee ? `<button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>` : ""}</div>
    <span class="lv-eyebrow">Élection de 2024</span>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[c.g]}"></i>Élu${c.t === 1 ? " dès le 1er tour" : " au 2e tour"} : ${esc(c.elu)} (${esc(c.gnu)})</span>
      <span class="vi-pill">${nf(c.e)} inscrits</span><span class="vi-pill">Participation (1er tour) : ${nf(c.part, 1)} %</span></div>
    <span class="lv-eyebrow">1er tour (30 juin 2024), par bloc</span>
    <div class="vi-vrows">${Object.entries(c.s).filter(([, v]) => v >= 0.5).map(([b, v]) => ligneVote(b, v)).join("")}</div>
    <span class="lv-eyebrow">Candidats en tête au 1er tour</span>
    <ul class="vi-cands">${c.c.map(k => `<li style="--c:${COUL[k.b]}"><i></i><span>${esc(k.nom)}</span><em>${esc(k.nu)}</em><b>${nf(k.p, 1)} %</b></li>`).join("")}</ul>`;
}
document.addEventListener("click", e => {
  if (!e.target.closest("#viPanneau")) return;
  const l = e.target.closest("[data-id]"); if (l) { choisir(l.dataset.id); return; }
  const rg = e.target.closest("[data-reg]");
  if (rg) { const fs = DATA.geo.features.filter(f => PAR_ID[f.properties.id]?.r === rg.dataset.reg); if (fs.length) zoomVers({ type: "FeatureCollection", features: fs }, 0.85); return; }
  if (e.target.closest("[data-tout]")) { choisir(null); svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); return; }
  if (e.target.closest("[data-zoomsel]") && sel != null) zoomVers(DATA.geo.features.find(x => x.properties.id === sel), 0.5);
});

/* ---------- évolution des intentions de vote : présidentielle 2027 ou législatives ---------- */
let periode = lireLS("vfPeriode", 0), serie = lireLS("vfSerie", "pres");
function donneesSerie() {
  if (serie === "pres") {
    // candidats suivis : ceux qui font au moins 4 % en moyenne sur les sondages des 6 derniers mois
    const fin = new Date(PRES.sondages[PRES.sondages.length - 1].d + "T12:00:00"), cands = {};
    for (const x of PRES.sondages.filter(x => (fin - new Date(x.d + "T12:00:00")) / 864e5 <= 183)) for (const [k, v] of Object.entries(x.v)) (cands[k] ||= []).push(v);
    const lignes = Object.entries(cands).filter(([, v]) => d3.mean(v) >= 4 && v.length >= 3).map(([k]) => k);
    return { lignes, lab: k => nomCourt(k), coul: k => PRES.candidats[k]?.c || "#8D949A", debut: "2023-03-01", sigma: 30,
      points: PRES.sondages.map(x => ({ d: x.d, f: x.f, n: x.n, v: x.v })), elections: [], titre: "Présidentielle 2027 · 1er tour",
      note: n => `${n} sondage${n > 1 ? "s" : ""} sur la période (1er tour, premier scénario de chaque sondage : les candidats testés varient d'un sondage à l'autre ; source : tableau Wikipédia qui cite la notice de chaque sondage). Lignes : tendance · points : sondages.` };
  }
  const lignes = ["NFP", "ENS", "LR", "RN", "EXD"];
  return { lignes, lab: k => COURT[k], coul: k => COUL[k], debut: "2024-06-01", sigma: 45,
    points: SOND.sondages.filter(x => !x.e).map(x => ({ d: x.d, f: x.f, n: x.n, v: Object.fromEntries(BLOCS.filter(b => x[b] != null).map(b => [b, x[b]])) })),
    elections: SOND.sondages.filter(x => x.e).map(x => ({ d: x.d, v: Object.fromEntries(BLOCS.map(b => [b, x[b] || 0])) })), titre: "Législatives · 1er tour",
    note: n => `${n} sondage${n > 1 ? "s" : ""} sur la période (intentions de vote aux législatives, premier scénario ; aucun publié depuis octobre 2025). Lignes : tendance · points : sondages · losanges : 1er tour de 2024.` };
}
function dessinerEvolution() {
  const S = donneesSerie();
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 84, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = S.points;
  const debutTout = t(S.debut), fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([debutTout, d3.timeMonth.offset(fin_, -periode)]) : debutTout;
  const dans = d => t(d) >= debut;
  const sond = tous.filter(s => dans(s.d)), elecVis = S.elections.filter(e => dans(e.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  const tout = document.querySelector('#viPeriodes [data-per="0"]'); if (tout) tout.textContent = `Depuis ${S.debut.slice(0, 4)}`;
  document.querySelectorAll("#vfSerie button").forEach(b => b.setAttribute("aria-pressed", b.dataset.s === serie));
  $("viEvolSur").textContent = `${S.titre} · ${periode ? (periode < 12 ? `${periode} derniers mois` : periode === 12 ? "dernière année" : `${periode / 12} dernières années`) : `depuis ${S.debut.slice(0, 4)}`}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(S.lignes, p => s.v[p] || 0)) || 40;
  const y = d3.scaleLinear().domain([0, Math.ceil((yMax + 4) / 10) * 10]).range([H - m.b, m.t]);
  // tendance : moyenne pondérée (noyau gaussien), seulement sur les sondages où le candidat ou le bloc figure
  const dates = [];
  if (tous.length) for (let d = t(tous[0].d); d <= t(tous[tous.length - 1].d); d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (tous.length && dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / S.sigma) ** 2);
  const moy = p => { const avec = tous.filter(s => s.v[p] != null), premier = avec[0]?.d, dernier = avec[avec.length - 1]?.d;
    return datesVis.filter(d => d >= premier && d <= dernier).map(d => { let a = 0, w = 0; for (const s of avec) { const k = poids(d, s); a += k * s.v[p]; w += k; } return { d, v: a / w }; }); };
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote");
  const court = periode && periode <= 6;
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : W < 1000 ? 5 : court ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", court ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Législatives 2024 (1er tour)");
  }
  const fin = {};
  for (const p of S.lignes) {
    svgE.append("g").selectAll("circle").data(sond.filter(s => s.v[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s.v[p])).attr("r", 3.2).style("fill", S.coul(p));
    const mm = moy(p); if (mm.length) fin[p] = mm[mm.length - 1];
    if (mm.length > 1) svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", S.coul(p));
    svgE.append("g").selectAll("rect").data(elecVis).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e.v[p] || 0)}) rotate(45) translate(-4,-4)`).style("fill", S.coul(p));
  }
  const etiq = S.lignes.filter(p => fin[p]).map(p => ({ p, y: y(fin[p].v), v: fin[p].v, x: x(t(fin[p].d)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", d => d.x + 6).attr("y", d => d.y + 4).style("fill", d => S.coul(d.p)).text(d => `${S.lab(d.p)} ${nf(d.v, 0)}`);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  const pts = [...sond, ...elecVis.map(e => ({ ...e, f: "Législatives 2024 (1er tour)", n: "" }))];
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      if (!pts.length) return;
      const [mx] = d3.pointer(ev), dt = x.invert(mx), s = pts.reduce((a, b) => Math.abs(t(b.d) - dt) < Math.abs(t(a.d) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(s.d))).attr("x2", x(t(s.d)));
      tipE.hidden = false; tipE.innerHTML = `<b>${esc(s.f)}</b><small>${dateFr(s.d)}${s.n ? ` · ${esc(s.n)} répondants` : ""}</small>`
        + Object.entries(s.v).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span style="--c:${S.coul(k)}"><i></i>${esc(S.lab(k))} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(s.d)) * r.width / W;
      tipE.style.left = Math.min(r.width - tipE.offsetWidth - 4, Math.max(4, px + 12)) + "px"; tipE.style.top = "8px";
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = S.note(sond.length);
}
function ajouterChoixSerie() {
  const tete = document.querySelector(".vi-evol-tete"); if (!tete || $("vfSerie")) return;
  const g = document.createElement("div");
  g.className = "lv-groupe vi-periodes"; g.id = "vfSerie"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "Élection");
  g.innerHTML = `<button type="button" data-s="pres">Présidentielle 2027</button><button type="button" data-s="leg">Législatives</button>`;
  tete.insertBefore(g, $("viPeriodes"));
  g.addEventListener("click", e => { const b = e.target.closest("button[data-s]"); if (!b) return; serie = b.dataset.s; ecrireLS("vfSerie", serie); dessinerEvolution(); });
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    let ASS;
    [DATA, SOND, PRES, ASS] = await Promise.all([lireJ("votes-france/data.json"), lireJ("votes-france/sondages.json"), lireJ("votes-france/sondages-pres.json"), lireJ("votes-france/assemblee.json")]);
    BLOCS = DATA.blocs; DATA.circ.forEach(c => { PAR_ID[c.id] = c; c.act = ASS.act[c.id] || null; });
    DATA.assemblee = ASS;
    // couleurs officielles des groupes ; les trop foncées sont éclaircies pour rester lisibles sur fond sombre
    const PLUS_CLAIR = { RN: "#4656B0", GDR: "#B3263A", UDDPLR: "#4C7FC4" };
    DATA.assemblee.groupes.forEach(g => { if (PLUS_CLAIR[g.id]) g.c = PLUS_CLAIR[g.id]; GP[g.id] = g; });
    dessinerTete(); construireCarte(); peindre(); dessinerPanneau(); ajouterChoixSerie(); dessinerEvolution();
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return; periode = +b.dataset.per; ecrireLS("vfPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
}
demarrer();
