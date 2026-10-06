/* Votes États-Unis — Chambre des représentants, élections de mi-mandat du 3 novembre 2026 ; même gabarit que « Votes Canada ».
   Projection : cote de chaque district selon le consensus de 270toWin (7 prévisionnistes), sur les districts de 2026
   (projection.json, outils/usa.py). Chambre actuelle : membres en exercice selon le Clerk de la Chambre. Élection de 2024 :
   résultat de chaque district (resultats-2024.json, outils/resultats24.py). Chambre actuelle et 2024 : districts de 2024
   (9 États ont été redécoupés depuis). Évolution : vote générique, moyenne et sondages de Silver Bulletin (sondages.json).
   Contours : data.json (outils/usa_geo.py, carte de 270toWin). */

const SIEGES = 435, MAJ = 218;
const P = ["D", "R"];
const NOMS = { D: "Parti démocrate", R: "Parti républicain", I: "Indépendant", AUT: "Autres", VAC: "Siège vacant" };
const COUL = { D: "#2F6BD8", R: "#D63A3A", I: "#8A6FD1", AUT: "#8D949A", VAC: "var(--soft)" };
// cotes du consensus, de la plus démocrate à la plus républicaine
const COTES = ["D3", "D2", "D1", "T", "R1", "R2", "R3"];
const COTE = { D3: ["#1E4CA6", "Sûr D"], D2: ["#4F82DE", "Probable D"], D1: ["#93B5EE", "Penché D"], T: ["#C9A93A", "À égalité"],
  R1: ["#F2A0A0", "Penché R"], R2: ["#E05A5A", "Probable R"], R3: ["#A81E1E", "Sûr R"], N: ["#8D949A", "Non coté"] };
const camp = r => r?.[0] === "D" ? "D" : r?.[0] === "R" ? "R" : "T";
const DATE_ELECTION = "2024-11-05";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
const AN = a => String(a);
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };

// type de page : Chambre des représentants (« ch ») ou Sénat (« sen ») — choix en haut de la page, comme Votes France
let TYPE = location.hash === "#senat" ? "sen" : location.hash === "#chambre" ? "ch" : lireLS("vuType", "ch");
let DATA, PROJ, R24, SOND, NOM26 = {}, NOM24 = {}, AB_DE = {}, ETAT_NOM = {}, F26, F24, sel = null, demarre = false;
const etat = { mode: "cote", parti: null, pct: lireLS("viPct", true), chambre: "proj", st: null };
const groupe = () => etat.mode === "act" ? "act" : etat.mode.startsWith("e24") ? "e24" : "proj";
const SEN = () => PROJ.senat;
const course = f => SEN().etats[f]?.courses[0];                       // course de 2026 dans l'État (une au plus)
const coteSen = f => course(f)?.r;
const delegation = f => { const ps = (SEN().etats[f]?.senateurs || []).map(x => x.p === "I" ? "D" : x.p); return ps[0] === ps[1] ? ps[0] : "S"; };
const COUL_DELEG = { D: "#2F6BD8", R: "#D63A3A", S: "#8A6FD1" };
const voteMode = () => etat.mode === "e24vote";
const cle24 = id => `${AB_DE[id.slice(0, 2)]}-${+id.slice(2)}`;          // « 0612 » → « CA-12 » (résultats de 2024)
const nomDe = id => TYPE === "sen" ? ETAT_NOM[AB_DE[id]] || id : (groupe() === "proj" ? NOM26[id] : NOM24[id]) || NOM26[id] || NOM24[id] || id;
const dans = id => TYPE === "sen" || !etat.st || AB_DE[id.slice(0, 2)] === etat.st;
const r24 = id => R24.circ[cle24(id)];

/* ---------- sièges par chambre affichée ---------- */
const NONREN = { D: ["#8FA9DE", "D (siège non renouvelé)"], I: ["#B7A6E2", "Indépendant (non renouvelé)"], R: ["#E3A0A0", "R (siège non renouvelé)"] };
function partsSenat(k) {
  const n = {};
  for (const e of Object.values(SEN().etats)) e.senateurs.forEach((x, i) => {
    const c = e.courses.find(c => c.siege === i + 1);
    const cle = k === "act" ? (x.p || "VAC") : c ? c.r : "n" + (x.p || "R");
    n[cle] = (n[cle] || 0) + 1;
  });
  if (k === "act") return ["D", "I", "VAC", "R"].filter(p => n[p]).map(p => ({ k: p, n: n[p], c: COUL[p], nom: p === "VAC" ? "Siège vacant" : NOMS[p] }));
  return ["nD", "nI", ...COTES, "nR"].filter(r => n[r]).map(r => r[0] === "n" ? { k: r, n: n[r], c: NONREN[r[1]][0], nom: NONREN[r[1]][1] } : { k: r, n: n[r], c: COTE[r][0], nom: COTE[r][1] });
}
function partsChambre(k) {
  if (TYPE === "sen") return partsSenat(k);
  if (k === "proj") {
    const n = {}; Object.values(PROJ.circ).forEach(c => n[c.r] = (n[c.r] || 0) + 1);
    return COTES.filter(r => n[r]).map(r => ({ k: r, n: n[r], c: COTE[r][0], nom: COTE[r][1] }));
  }
  if (k === "act") {
    const n = {}; Object.values(PROJ.actuel).forEach(a => { const p = a ? a.p : "VAC"; n[p] = (n[p] || 0) + 1; });
    return ["D", "I", "VAC", "R"].filter(p => n[p]).map(p => ({ k: p, n: n[p], c: COUL[p], nom: p === "VAC" ? "Siège vacant" : NOMS[p] }));
  }
  return ["D", "R"].filter(p => R24.sieges[p]).map(p => ({ k: p, n: R24.sieges[p], c: COUL[p], nom: NOMS[p] }));
}
// hémicycle (comme Votes France) : rangées en demi-cercle, de gauche (démocrates) à droite (républicains)
function hemicycle(svgEl, parts, sous, SIEGES = 435) {
  const R = SIEGES > 200 ? 12 : 6, r0 = 0.42, W = 1000, H = 520, cx = W / 2, cy = H - 20, Rmax = 470;
  const rayons = d3.range(R).map(i => r0 + i * (1 - r0) / (R - 1)), somme = d3.sum(rayons);
  const parRangee = rayons.map(r => Math.round(SIEGES * r / somme)); parRangee[R - 1] += SIEGES - d3.sum(parRangee);
  const places = [];
  rayons.forEach((r, i) => { const n = parRangee[i];
    for (let k = 0; k < n; k++) { const a = Math.PI - k * Math.PI / (n - 1); places.push({ a, r, x: cx + Math.cos(a) * r * Rmax, y: cy - Math.sin(a) * r * Rmax }); } });
  places.sort((p, q) => q.a - p.a || p.r - q.r);
  const sieges = parts.flatMap(p => d3.range(p.n).map(() => p));
  const pas = Rmax * (1 - r0) / (R - 1), rayon = Math.min(pas * 0.42, 0.8 * Math.PI * r0 * Rmax / parRangee[0]);
  const g = d3.select(svgEl).attr("viewBox", `0 0 ${W} ${H}`); g.selectAll("*").remove();
  g.selectAll("circle").data(places).join("circle").attr("cx", p => p.x).attr("cy", p => p.y).attr("r", rayon)
    .style("fill", (p, i) => sieges[i] ? (sieges[i].k === "VAC" ? "none" : sieges[i].c) : "var(--soft)")
    .style("stroke", (p, i) => sieges[i]?.k === "VAC" ? "var(--muted)" : null).style("stroke-width", 2)
    .append("title").text((p, i) => sieges[i] ? sieges[i].nom : "");
  g.append("text").attr("x", cx).attr("y", cy - 50).attr("text-anchor", "middle").attr("class", "vf-hemi-n").text(SIEGES);
  g.append("text").attr("x", cx).attr("y", cy - 18).attr("text-anchor", "middle").attr("class", "vf-hemi-maj").text(sous);
}

/* ---------- en-tête, Chambre ---------- */
const CHAMBRES = { proj: "Projection", act: "Chambre actuelle", e24: "Élection 2024" };
function ajouterChoixType() {
  const tete = document.querySelector(".vue-votes .lv-head"); if (!tete || $("vfType")) return;
  const g = document.createElement("div");
  g.className = "lv-groupe vf-type"; g.id = "vfType"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "Chambre affichée");
  g.innerHTML = `<button type="button" data-t="ch">Chambre des représentants</button><button type="button" data-t="sen">Sénat</button>`;
  tete.appendChild(g);
  g.addEventListener("click", e => { const b = e.target.closest("button[data-t]"); if (!b || b.dataset.t === TYPE) return; changerType(b.dataset.t); });
}
function changerType(t) {
  TYPE = t; ecrireLS("vuType", t);
  history.replaceState(null, "", location.pathname + location.search + (t === "sen" ? "#senat" : "#chambre"));
  etat.mode = "cote"; etat.chambre = "proj"; etat.st = null; sel = null; jeu = null;
  svg.transition().duration(0).call(ZOOM.transform, d3.zoomIdentity);
  dessinerTete(); outilsCarte(); tracerDistricts(); peindre(); dessinerPanneau();
}
function dessinerTete() {
  document.querySelectorAll("#vfType button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === TYPE));
  document.querySelector(".t-votes").textContent = TYPE === "sen" ? "Votes États-Unis · Sénat" : "Votes États-Unis · Chambre des représentants";
  document.querySelector(".vue-votes .vi-badge").textContent = TYPE === "sen" ? "États-Unis · Sénat" : "États-Unis · Chambre des représentants";
  $("viPlan").setAttribute("aria-label", TYPE === "sen" ? "Hémicycle du Sénat (100 sièges)" : "Hémicycle de la Chambre des représentants (435 sièges)");
  const sond = SOND.sondages, dernier = sond[sond.length - 1], m = SOND.moyenne[SOND.moyenne.length - 1];
  $("viTitre").textContent = "Élections de mi-mandat du 3 novembre 2026";
  $("viSource").innerHTML = TYPE === "sen" ? `Sénat · consensus de 270toWin du ${dateFr(SEN().maj)} · vote générique : D ${nf(m.D, 1)} %, R ${nf(m.R, 1)} % (moyenne de Silver Bulletin, ${dateFr(m.d)})` : `Chambre des représentants · consensus de 270toWin du ${dateFr(PROJ.maj)} · vote générique : D ${nf(m.D, 1)} %, R ${nf(m.R, 1)} % (moyenne de Silver Bulletin, ${dateFr(m.d)})`;
  $("viNote").textContent = TYPE === "sen" ? "Projection : chaque État où un siège est en jeu est coloré selon la cote de sa course dans le consensus de sept prévisionnistes ; les sièges non renouvelés gardent leur parti." : "Projection : chaque district est coloré selon sa cote dans le consensus de sept prévisionnistes (sûr, probable, penché ou à égalité). Les prévisionnistes ne publient pas de pourcentage par district.";
  let ex = $("vfExplic");
  if (!ex) { ex = document.createElement("div"); ex.id = "vfExplic"; ex.className = "vf-explic"; $("viNote").before(ex); }
  ex.innerHTML = TYPE === "sen" ? `<p>Le Sénat compte 100 sénateurs, deux par État, élus pour six ans ; un tiers des sièges est renouvelé tous les deux ans. Le 3 novembre 2026, 35 sièges sont en jeu : les 33 sièges ordinaires et deux élections partielles (Ohio et Floride). La majorité est de 51 sièges ; à 50 contre 50, le vice-président (JD Vance, républicain) départage.</p>` : `<p>Les 435 membres de la Chambre des représentants sont élus pour deux ans, un par district. En général, le candidat qui a le plus de voix l'emporte (l'Alaska et le Maine utilisent le vote préférentiel). Il faut 218 sièges pour la majorité. Le même jour, 35 des 100 sièges du Sénat sont aussi en jeu. Neuf États ont redessiné leurs districts depuis 2024 : la projection utilise les districts de 2026, la Chambre actuelle et l'élection de 2024 ceux de 2024.</p>`;
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
  document.querySelectorAll("#vcChambre button").forEach(b => { b.hidden = TYPE === "sen" && b.dataset.ch === "e24"; b.setAttribute("aria-pressed", b.dataset.ch === etat.chambre); });
  if (TYPE === "sen") return dessinerChambreSenat();
  const parts = partsChambre(etat.chambre), eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  const somme = side => d3.sum(parts.filter(p => (p.k[0] === side)), p => p.n);
  if (etat.chambre === "proj") {
    const d = somme("D"), r = somme("R"), t = SIEGES - d - r;
    eb.textContent = `Chambre des représentants · consensus du ${dateFr(PROJ.maj)}`;
    $("viSiegesTitre").textContent = d >= MAJ ? `Démocrates favoris : ${d} sièges (majorité ${MAJ})` : r >= MAJ ? `Républicains favoris : ${r} sièges (majorité ${MAJ})` : `Aucun camp n'atteint ${MAJ} : D ${d}, R ${r}, ${t} à égalité`;
  } else {
    const n = Object.fromEntries(parts.map(p => [p.k, p.n])), lead = (n.D || 0) >= (n.R || 0) ? "D" : "R";
    eb.textContent = etat.chambre === "act" ? `Chambre des représentants · membres en exercice au ${dateFr(PROJ.clerk)}` : "Chambre des représentants · élection du 5 novembre 2024";
    $("viSiegesTitre").textContent = `${NOMS[lead]} : ${n[lead]} sièges${n[lead] >= MAJ ? ", majorité" : ""}`;
  }
  hemicycle($("viPlan"), parts, `représentants · majorité ${MAJ}`, 435);
  $("viLegende").innerHTML = parts.map(p => `<span style="--c:${p.k === "VAC" ? "var(--muted)" : p.c}"><i></i>${p.nom} <b>${p.n}</b></span>`).join("");
}

function dessinerChambreSenat() {
  const parts = partsChambre(etat.chambre), eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  const tot = f => d3.sum(parts.filter(f), p => p.n);
  if (etat.chambre === "proj") {
    const d = tot(p => p.k[0] === "D" || p.k === "nD" || p.k === "nI"), r = tot(p => p.k[0] === "R" || p.k === "nR"), t = 100 - d - r;
    eb.textContent = `Sénat · consensus du ${dateFr(SEN().maj)}`;
    $("viSiegesTitre").textContent = d >= 51 ? `Démocrates favoris : ${d} sièges (majorité 51)` : r >= 50 ? `Républicains favoris : ${r} sièges${r === 50 ? " avec le vice-président" : ""}` : `Aucun camp favori : D ${d}, R ${r}, ${t} à égalité`;
  } else {
    const n = Object.fromEntries(parts.map(p => [p.k, p.n]));
    eb.textContent = "Sénat · sénateurs en exercice";
    $("viSiegesTitre").textContent = `Républicains ${n.R || 0}, démocrates ${n.D || 0}${n.I ? ` et ${n.I} indépendants (avec les démocrates)` : ""}`;
  }
  hemicycle($("viPlan"), parts, "sénateurs · majorité 51", 100);
  $("viLegende").innerHTML = parts.map(p => `<span style="--c:${p.k === "VAC" ? "var(--muted)" : p.c}"><i></i>${p.nom} <b>${p.n}</b></span>`).join("");
}

/* ---------- carte ---------- */
const MW = 900, MH = 560;
let svg, gZ, gRid, gReg, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity, jeu = null;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const features = () => TYPE === "sen" ? DATA.geoEtats.features : groupe() === "proj" ? F26 : F24;
function remplir(id) {
  const fade = o => dans(id) ? o : o * 0.22;
  if (TYPE === "sen") {
    if (etat.mode === "act") return [COUL_DELEG[delegation(id)], 0.85];
    const r = coteSen(id); return r ? [COTE[r][0], 0.95] : ["var(--soft)", 1];
  }
  if (groupe() === "proj") { const c = PROJ.circ[id]; return c ? [COTE[c.r]?.[0] || COTE.N[0], fade(0.95)] : ["var(--soft)", 1]; }
  if (etat.mode === "act") { const a = PROJ.actuel[id]; return a ? [COUL[a.p] || COUL.AUT, fade(0.85)] : ["var(--soft)", 1]; }
  const c = r24(id); if (!c) return ["var(--soft)", 1];
  if (voteMode()) return [COUL[etat.parti], fade(Math.max(0.06, Math.min(1, (c.s[etat.parti] || 0) / 75)))];
  return [COUL[c.g] || COUL.AUT, fade(Math.max(0.3, Math.min(1, ((c.s[c.g] || 0) - 45) / 35)))];
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
  const k = f.properties.id + (TYPE === "sen" ? ":st" : DATA.geo26.features.includes(f) ? ":26" : ":24");
  if (ANCRE[k]) return ANCRE[k];
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = [0, 0, -1];
  for (const poly of polys) { const pts = poly.map(r => r.map(xy => PROJ_FN(xy)).filter(Boolean)); if (!pts[0]?.length) continue; const c = polylabel(pts); if (c[2] > best[2]) best = c; }
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
// districts affichés : ceux de 2026 (projection) ou de 2024 (Chambre actuelle, élection de 2024)
function tracerDistricts() {
  const set = TYPE === "sen" ? "st" : groupe() === "proj" ? "26" : "24";
  if (jeu === set) return; jeu = set;
  gRid.selectAll("path").data(features(), f => f.properties.id + set).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => nomDe(f.properties.id))
    .on("click", (e, f) => choisir(f.properties.id))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.id); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  gLbl.selectAll("*").remove();
}
function construireCarte() {
  // 2024 : les 435 districts du Census ; 2026 : les mêmes, sauf dans les États redécoupés (tracés de 2026)
  F24 = DATA.geo24.features;
  const redec = new Set(DATA.redecoupes.map(ab => DATA.etats.find(e => e.ab === ab).fips));
  F26 = [...F24.filter(f => !redec.has(f.properties.id.slice(0, 2))), ...DATA.geo26.features];
  DATA.geoEtats.features.forEach(f => f.properties.id = f.properties.fips);
  for (const f of [...DATA.geo24.features, ...DATA.geo26.features, ...DATA.geoEtats.features])
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  PROJ_FN = d3.geoAlbersUsa().fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.geoEtats);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { ne: boite([-80.5, 38.6], [-69.8, 43.5]), ca: boite([-124.4, 32.5], [-114.1, 42.0]), tx: boite([-106.6, 25.8], [-93.5, 36.5]),
    fl: boite([-87.6, 24.5], [-80.0, 31.0]), gl: boite([-92.5, 39.5], [-78.5, 46.8]) });
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gRid = gZ.append("g"); gReg = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gReg.selectAll("path").data(DATA.geoEtats.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  PRESETS.nyc = { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[-74.3, 40.48], [-73.65, 40.95]] } };
  tracerDistricts();
  ZOOM = d3.zoom().scaleExtent([1, 120]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
    .on("zoom", e => { gZ.attr("transform", e.transform); curK = e.transform.k; curT = e.transform; placerEtiquettes(); });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.node().parentElement.addEventListener("wheel", e => e.preventDefault(), { passive: false });
  svg.on("click", e => { if (e.target === svg.node()) choisir(null); });
  new ResizeObserver(() => placerEtiquettes()).observe(svg.node());
  $("viZoom").addEventListener("click", e => {
    const z = e.target.closest("button")?.dataset.z; if (!z) return;
    if (z === "tout") choisirEtat(null);
    else if (z === "plus") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1.8);
    else if (z === "moins") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1 / 1.8);
    else if (PRESETS[z]) zoomVers(PRESETS[z], 0.95);
  });
  $("viPlein").addEventListener("click", pleinEcran);
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; ecrireLS("viPct", etat.pct); peindre(); });
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").innerHTML = P.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}">${p === "D" ? "Démocrates" : "Républicains"}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return;
    etat.parti = b.dataset.p; if (!voteMode()) changerMode("e24vote"); else { peindre(); if (sel == null) dessinerPanneau(); } });
}
// boutons : futur (projection) · présent (Chambre actuelle) · passé (élection de 2024)
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  $("viChips").style.display = TYPE === "sen" ? "none" : "";
  if (TYPE === "sen") {
    $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">Projection · consensus</span><span class="lv-groupe">${bouton(["cote", "Cote"])}</span></span>`
      + `<span class="vf-mode-grp"><span class="vf-mode-lab">Sénat actuel</span><span class="lv-groupe">${bouton(["act", "Sénateurs"])}</span></span>`;
    return;
  }
  $("viModes").innerHTML = `<span class="vf-mode-grp"><span class="vf-mode-lab">Projection · consensus</span><span class="lv-groupe">${bouton(["cote", "Cote"])}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Chambre actuelle</span><span class="lv-groupe">${bouton(["act", "Représentants"])}</span></span>`
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">Élection 2024</span><span class="lv-groupe">${[["e24", "Élu"], ["e24vote", "Vote"]].map(bouton).join("")}</span></span>`;
}
function changerMode(m) {
  const avant = groupe();
  etat.mode = m;
  if (voteMode() && !etat.parti) etat.parti = "D";
  if (groupe() !== avant && TYPE === "ch") { if (sel != null && !features().some(f => f.properties.id === sel)) sel = null; tracerDistricts(); }
  if (etat.chambre !== groupe()) { etat.chambre = groupe(); dessinerChambre(); }
  peindre(); dessinerPanneau();
}
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", voteMode() && b.dataset.p === etat.parti));
  $("viChips").setAttribute("aria-disabled", !voteMode());
  gRid.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.id); this.style.fill = c; this.style.fillOpacity = o; });
  const f = sel != null ? features().find(x => x.properties.id === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  $("viPct").hidden = !voteMode(); $("viPct").setAttribute("aria-pressed", etat.pct);
  const labs = gLbl.selectAll("g.vi-lab").data(voteMode() && etat.pct ? features().filter(f => dans(f.properties.id)) : [], f => f.properties.id)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => { const c = r24(f.properties.id); return c ? nf(c.s[etat.parti] || 0, 0) + " %" : ""; });
  labs.select("text.vi-nom").text(f => nomDe(f.properties.id));
  placerEtiquettes();
  let an = $("vfAnCarte");
  if (!an) { an = document.createElement("div"); an.id = "vfAnCarte"; an.className = "vf-an-carte"; $("viCarte").before(an); }
  an.innerHTML = TYPE === "sen" ? (groupe() === "act" ? "Sénateurs actuels" : `Sénat · consensus · ${dateFr(SEN().maj)}`) : groupe() === "act" ? "Représentants actuels" : groupe() === "e24" ? "Élection 2024" : `Consensus · ${dateFr(PROJ.maj)}`;
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  $("viEchelle").innerHTML = TYPE === "sen" ? (groupe() === "proj"
    ? `<span class="vf-legende">${COTES.map(r => `<span style="--c:${COTE[r][0]}"><i></i>${COTE[r][1]}</span>`).join("")}<span style="--c:var(--soft)"><i></i>pas d'élection</span></span><span>· cote de la course de 2026 dans chaque État</span>`
    : `<span class="vf-legende">${[["D", "Deux démocrates"], ["R", "Deux républicains"], ["S", "Partagé"]].map(([k, t]) => `<span style="--c:${COUL_DELEG[k]}"><i></i>${t}</span>`).join("")}</span><span>· parti des deux sénateurs actuels (indépendants comptés avec les démocrates)</span>`)
    : groupe() === "proj"
    ? `<span class="vf-legende">${COTES.map(r => `<span style="--c:${COTE[r][0]}"><i></i>${COTE[r][1]}</span>`).join("")}</span><span>· cote de chaque district de 2026 (consensus de 270toWin)</span>`
    : etat.mode === "act" ? `<span class="vf-legende">${["D", "R"].map(k => `<span style="--c:${COUL[k]}"><i></i>${NOMS[k]}</span>`).join("")}<span style="--c:var(--soft)"><i></i>vacant</span></span><span>· parti du représentant actuel (districts de 2024)</span>`
    : voteMode() ? `<span>0 %</span>${ramp}<span>75 % et +</span><span>· vote ${p === "D" ? "démocrate" : "républicain"} en 2024 dans chaque district${etat.pct ? " (chiffre = %)" : ""}</span>`
    : "<span>Couleur : parti élu en 2024 dans chaque district (districts de 2024). Plus la couleur est foncée, plus son score est élevé.</span>";
}
function infobulle(e, f) {
  const id = f.properties.id, t = $("viTip"), box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  if (TYPE === "sen") {
    const c = course(id), sn = SEN().etats[id]?.senateurs || [];
    t.innerHTML = `<b>${esc(nomDe(id))}</b><small>${sn.map(x => `${esc(x.nom)} (${x.p})`).join(" · ")}</small><br>`
      + (c ? `Course de 2026${c.special ? " (partielle)" : ""} : ${COTE[c.r]?.[1]}<br><small>${c.cands.filter(k => ["D", "R", "I"].includes(k.p)).map(k => `${esc(k.nom)} (${k.p})`).join(" · ")}</small>` : "<small>Pas d'élection au Sénat en 2026</small>");
    return;
  }
  if (groupe() === "proj") {
    const c = PROJ.circ[id];
    t.innerHTML = `<b>${esc(nomDe(id))}</b><small>Districts de 2026</small><br>Cote : ${COTE[c?.r]?.[1] || "—"}<br><small>Sortant : ${esc(c?.rep || "—")}${c?.held ? ` (${c.held})` : ""}${c?.ret ? " · ne se représente pas" : ""}</small>`;
  } else {
    const a = PROJ.actuel[id], c = r24(id);
    t.innerHTML = `<b>${esc(nomDe(id))}</b><small>Districts de 2024</small><br>${a ? `Représentant : ${esc(a.nom)} (${a.p})` : "Siège vacant"}<br>`
      + (c ? `<small>2024 : ${Object.entries(c.s).slice(0, 2).map(([k, v]) => `${k} ${nf(v, 1)} %`).join(" · ")}</small>` : "");
  }
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

/* ---------- panneau : tous les États-Unis, un État ou un district ---------- */
function choisir(id) { sel = id; peindre(); dessinerPanneau(); }
function choisirEtat(ab) {
  etat.st = ab; sel = null;
  const f = ab ? DATA.geoEtats.features.find(x => x.properties.fips === DATA.etats.find(e => e.ab === ab).fips) : null;
  if (f) zoomVers(f, 0.9); else svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity);
  peindre(); dessinerPanneau();
}
const menuEtats = () => `<details class="vc-menu"><summary>État : <b>${etat.st ? esc(ETAT_NOM[etat.st]) : "Tous les États-Unis"}</b></summary>
  <div class="vc-menu-liste">${[[null, "Tous les États-Unis"], ...DATA.etats.map(e => [e.ab, e.nom])]
    .map(([k, t]) => `<button type="button" data-regsel="${k || ""}" aria-pressed="${(k || null) === etat.st}">${esc(t)}</button>`).join("")}</div></details>`;
const ligne = (lab, coul, n, total, droite = "") => `<div class="vi-vrow vf-gp vu-cote"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${100 * n / Math.max(1, total)}%;background:${coul}"></i></span><span class="vi-num"><b>${n}</b></span><span class="vi-num"><small>${droite}</small></span></div>`;
const jauge = (lab, coul, v, droite = "", max = 80) => `<div class="vi-vrow"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${coul}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
const liste = (items, couleur, droite) => `<ul class="vi-serres">${items.map(id => `<li data-rid="${id}" tabindex="0" style="--c:${couleur(id)}"><i></i>${esc(nomDe(id))}<b>${droite(id)}</b></li>`).join("") || "<li>Aucun</li>"}</ul>`;
const detenu = c => ["D", "R"].includes(c.held) ? `détenu par ${c.held}` : "nouveau district";
// explication des cotes (repliée dans le panneau)
const explicationCotes = () => replie("Comment lire les cotes", `<div class="vu-explic">
  <p>Les prévisionnistes ne publient pas de pourcentage par course : ils classent chaque course selon les chances de chaque parti. Le consensus de 270toWin réunit les cotes de sept d'entre eux (Cook Political Report, Sabato's Crystal Ball, Inside Elections, etc.).</p>
  <ul>
    <li style="--c:${COTE.D3[0]}"><i></i><span><b>Sûr</b> : pas compétitive ; le parti l'emporte presque certainement.</span></li>
    <li style="--c:${COTE.D2[0]}"><i></i><span><b>Probable</b> : avantage net, mais la course pourrait devenir serrée si la campagne tourne mal pour le favori.</span></li>
    <li style="--c:${COTE.D1[0]}"><i></i><span><b>Penché</b> : compétitive, avec un léger avantage pour un parti ; un renversement n'étonnerait personne.</span></li>
    <li style="--c:${COTE.T[0]}"><i></i><span><b>À égalité</b> (« toss-up ») : aucun favori, les deux partis ont des chances comparables.</span></li>
  </ul>
  <p>Les teintes vont du foncé (sûr) au pâle (penché), en bleu pour les démocrates et en rouge pour les républicains. Les « favoris » de chaque parti additionnent ses courses sûres, probables et penchées.</p></div>`);
const replie = (titre, corps, n = "") => `<details class="lv-sg vc-replie"><summary><span>${titre}</span>${n !== "" ? `<small>${n}</small>` : ""}</summary>${corps}</details>`;
function panneauSenat(z) {
  const E = SEN().etats, fips = Object.keys(E), g = groupe();
  const menu = `<details class="vc-menu"><summary>État : <b>${sel ? esc(nomDe(sel)) : "Tous les États-Unis"}</b></summary>
    <div class="vc-menu-liste">${[[null, "Tous les États-Unis"], ...DATA.etats.map(e => [e.fips, e.nom])]
      .map(([k, t]) => `<button type="button" data-etatsen="${k || ""}" aria-pressed="${(k || null) === sel}">${esc(t)}${k && course(k) ? " ●" : ""}</button>`).join("")}</div></details>`;
  const lst = (items, couleur, droite) => `<ul class="vi-serres">${items.map(f => `<li data-rid="${f}" tabindex="0" style="--c:${couleur(f)}"><i></i>${esc(nomDe(f))}<b>${droite(f)}</b></li>`).join("") || "<li>Aucun</li>"}</ul>`;
  if (sel) {
    const e = E[sel], c = course(sel);
    z.innerHTML = `${menu}<span class="lv-eyebrow">Sénat · ${esc(nomDe(sel))}</span><h3>${esc(nomDe(sel))}</h3>
      <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Tous les États-Unis</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button></div>
      ${c ? `<span class="lv-eyebrow">Course de 2026${c.special ? " · élection partielle" : ""}</span>
        <div class="vi-pills"><span class="vi-pill"><i style="background:${COTE[c.r][0]}"></i>Cote : ${COTE[c.r][1]}</span><span class="vi-pill">Siège détenu par ${esc(c.held)}</span>${c.ret ? `<span class="vi-pill">Le sortant ne se représente pas</span>` : ""}</div>
        ${c.cands.length ? `<ul class="vi-cands">${c.cands.map(k => `<li style="--c:${COUL[k.p] || COUL.AUT}"><i></i><span>${esc(k.nom)}${k.inc ? " <small>(sortant)</small>" : ""}</span><em>${esc(k.p)}</em><b></b></li>`).join("")}</ul>` : ""}`
        : `<p class="lv-muted">Pas d'élection au Sénat dans cet État en 2026.</p>`}
      <span class="lv-eyebrow">Sénateurs actuels</span>
      ${e.senateurs.map(x => `<p class="vi-elu" style="--c:${COUL[x.p] || COUL.AUT}"><b>${esc(x.nom)}</b> · ${NOMS[x.p] || x.p}${x.fin ? ` · mandat jusqu'en ${x.fin === 2026 ? "2027 (siège en jeu)" : x.fin + 1}` : ""}</p>`).join("")}`;
    return;
  }
  if (g === "act") {
    const n = {}; fips.forEach(f => E[f].senateurs.forEach(x => n[x.p] = (n[x.p] || 0) + 1));
    const partages = fips.filter(f => delegation(f) === "S");
    z.innerHTML = `${menu}<span class="lv-eyebrow">Sénat actuel</span><h3>Tous les États-Unis</h3>
      <div class="vi-pills">${["R", "D", "I"].filter(k => n[k]).map(k => `<span class="vi-pill"><i style="background:${COUL[k]}"></i>${NOMS[k]}${k === "I" ? "s" : ""} : ${n[k]}</span>`).join("")}</div>
      <p class="lv-muted">Les indépendants (Angus King, Bernie Sanders) votent avec les démocrates.</p>
      <span class="lv-eyebrow">Sièges par parti</span><div class="vi-vrows">${["R", "D", "I"].filter(k => n[k]).map(k => ligne(k, COUL[k], n[k], 60, `${n[k]} %`)).join("")}</div>
      <span class="lv-eyebrow">États à délégation partagée</span>${lst(partages, () => COUL_DELEG.S, f => E[f].senateurs.map(x => x.p).join(" + "))}`;
    return;
  }
  const n = {}; fips.forEach(f => E[f].courses.forEach(c => n[c.r] = (n[c.r] || 0) + 1));
  const parts = partsSenat("proj"), tot = f => d3.sum(parts.filter(f), p => p.n);
  const d = tot(p => p.k[0] === "D" || p.k === "nD" || p.k === "nI"), r = tot(p => p.k[0] === "R" || p.k === "nR");
  const courses = fips.filter(f => course(f)), egal = courses.filter(f => coteSen(f) === "T");
  const bascules = courses.filter(f => { const c = course(f), k = camp(c.r); return k !== "T" && ["D", "R"].includes(c.held) && k !== (c.held === "I" ? "D" : c.held); });
  const nonren = Object.fromEntries(parts.filter(p => p.k[0] === "n").map(p => [p.k.slice(1), p.n]));
  z.innerHTML = `${menu}<span class="lv-eyebrow">Consensus de 270toWin · ${dateFr(SEN().maj)}</span><h3>Tous les États-Unis</h3>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL.D}"></i>D favoris : ${d}</span><span class="vi-pill"><i style="background:${COUL.R}"></i>R favoris : ${r}</span><span class="vi-pill"><i style="background:${COTE.T[0]}"></i>À égalité : ${100 - d - r}</span><span class="vi-pill">Majorité : 51</span></div>
    ${explicationCotes()}
    <p class="lv-muted">Sièges favoris = sièges non renouvelés en 2026 (${nonren.D || 0} D, ${nonren.I || 0} indépendants, ${nonren.R || 0} R) + courses de 2026 qui penchent vers chaque parti. Clique sur un État pour son détail.</p>
    <span class="lv-eyebrow">Les ${courses.length} courses de 2026, par cote</span><div class="vi-vrows">${COTES.map(k => ligne(COTE[k][1], COTE[k][0], n[k] || 0, 15)).join("")}</div>
    <span class="lv-eyebrow">Courses à égalité</span>${lst(egal, () => COTE.T[0], f => `détenu par ${course(f).held}`)}
    ${replie("Sièges qui changeraient de parti", lst(bascules, f => COUL[camp(coteSen(f))], f => `${camp(coteSen(f))} <small>(détenu par ${course(f).held})</small>`), bascules.length)}
    ${replie("Toutes les courses", lst(courses.sort((a, b) => COTES.indexOf(coteSen(a)) - COTES.indexOf(coteSen(b))), f => COTE[coteSen(f)][0], f => COTE[coteSen(f)][1]), courses.length)}`;
}
function dessinerPanneau() {
  if (TYPE === "sen") return panneauSenat($("viPanneau"));
  const z = $("viPanneau"), g = groupe(), nomZ = etat.st ? ETAT_NOM[etat.st] : "Tous les États-Unis";
  if (sel == null) {
    if (g === "proj") {
      const ids = Object.keys(PROJ.circ).filter(dans), n = {}; ids.forEach(id => { const r = PROJ.circ[id].r; n[r] = (n[r] || 0) + 1; });
      const d = d3.sum(["D3", "D2", "D1"], r => n[r] || 0), r = d3.sum(["R3", "R2", "R1"], k => n[k] || 0), t = n.T || 0;
      const egal = ids.filter(id => PROJ.circ[id].r === "T"), penches = ids.filter(id => ["D1", "R1"].includes(PROJ.circ[id].r));
      const bascules = ids.filter(id => { const c = PROJ.circ[id], k = camp(c.r); return k !== "T" && ["D", "R"].includes(c.held) && k !== c.held; });
      z.innerHTML = `${menuEtats()}<span class="lv-eyebrow">Consensus de 270toWin · ${dateFr(PROJ.maj)}</span><h3>${esc(nomZ)}</h3>
        <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL.D}"></i>D favoris : ${d}</span><span class="vi-pill"><i style="background:${COUL.R}"></i>R favoris : ${r}</span><span class="vi-pill"><i style="background:${COTE.T[0]}"></i>À égalité : ${t}</span>${etat.st ? `<span class="vi-pill">${ids.length} district${ids.length > 1 ? "s" : ""}</span>` : `<span class="vi-pill">Majorité : ${MAJ}</span>`}</div>
        <p class="lv-muted">Cote de chaque district selon sept prévisionnistes. Clique sur un district pour son détail.</p>
        ${explicationCotes()}
        <span class="lv-eyebrow">Districts par cote</span><div class="vi-vrows">${COTES.map(k => ligne(COTE[k][1], COTE[k][0], n[k] || 0, etat.st ? ids.length : 200)).join("")}</div>
        <span class="lv-eyebrow">Courses à égalité</span>${liste(egal, () => COTE.T[0], id => detenu(PROJ.circ[id]))}
        ${replie("Courses penchées (avantage léger)", liste(penches, id => COTE[PROJ.circ[id].r][0], id => COTE[PROJ.circ[id].r][1]), penches.length)}
        ${replie("Districts qui changeraient de parti", liste(bascules, id => COUL[camp(PROJ.circ[id].r)], id => `${camp(PROJ.circ[id].r)} <small>(détenu par ${PROJ.circ[id].held})</small>`), bascules.length)}
        ${etat.st ? `<span class="lv-eyebrow">Tous les districts</span>${liste(ids, id => COTE[PROJ.circ[id].r]?.[0], id => COTE[PROJ.circ[id].r]?.[1] || "")}` : ""}`;
      return;
    }
    const ids = features().map(f => f.properties.id).filter(dans);
    if (g === "act") {
      const n = {}; ids.forEach(id => { const a = PROJ.actuel[id]; const k = a ? a.p : "VAC"; n[k] = (n[k] || 0) + 1; });
      const vac = ids.filter(id => !PROJ.actuel[id]);
      z.innerHTML = `${menuEtats()}<span class="lv-eyebrow">Chambre actuelle · Clerk de la Chambre, ${dateFr(PROJ.clerk)}</span><h3>${esc(nomZ)}</h3>
        <div class="vi-pills">${["R", "D"].map(k => `<span class="vi-pill"><i style="background:${COUL[k]}"></i>${NOMS[k]} : ${n[k] || 0}</span>`).join("")}${n.VAC ? `<span class="vi-pill">${n.VAC} vacant${n.VAC > 1 ? "s" : ""}</span>` : ""}</div>
        <p class="lv-muted">Membres en exercice, dans les districts de 2024 (élus en 2024 ou lors d'une élection partielle).</p>
        <span class="lv-eyebrow">Sièges par parti</span><div class="vi-vrows">${["R", "D", "I", "VAC"].filter(k => n[k]).map(k => ligne(k === "VAC" ? "Vacants" : k, k === "VAC" ? "var(--muted)" : COUL[k], n[k], etat.st ? ids.length : 240, k === "VAC" ? "" : `${nf(100 * n[k] / ids.length, 1)} %`)).join("")}</div>
        ${vac.length ? `<span class="lv-eyebrow">Sièges vacants</span>${liste(vac, () => "var(--muted)", () => "vacant")}` : ""}
        ${etat.st ? `<span class="lv-eyebrow">Délégation</span>${liste(ids, id => COUL[PROJ.actuel[id]?.p] || "var(--muted)", id => esc(PROJ.actuel[id] ? `${PROJ.actuel[id].nom} (${PROJ.actuel[id].p})` : "vacant"))}` : ""}`;
      return;
    }
    const n = {}; ids.forEach(id => { const c = r24(id); if (c) n[c.g] = (n[c.g] || 0) + 1; });
    const marge = id => { const v = Object.values(r24(id)?.s || {}).sort((a, b) => b - a); return (v[0] || 0) - (v[1] || 0); };
    const serres = ids.filter(id => r24(id) && Object.keys(r24(id).s).length > 1 && marge(id) < 5).sort((a, b) => marge(a) - marge(b));
    z.innerHTML = `${menuEtats()}<span class="lv-eyebrow">Élection du 5 novembre 2024</span><h3>${esc(nomZ)}</h3>
      <div class="vi-pills">${["R", "D"].map(k => `<span class="vi-pill"><i style="background:${COUL[k]}"></i>${NOMS[k]} : ${n[k] || 0}</span>`).join("")}</div>
      ${etat.st ? "" : `<span class="lv-eyebrow">Vote populaire et sièges</span><div class="vi-vrows">${["R", "D"].map(k => jauge(k, COUL[k], R24.national[k] || 0, `<b>${R24.sieges[k]}</b> <small>élus</small>`)).join("")}</div>`}
      <span class="lv-eyebrow">Les plus serrées (moins de 5 points)</span>${liste(serres.slice(0, 15), id => COUL[r24(id).g], id => `${r24(id).g} +${nf(marge(id), 1)}`)}
      ${etat.st ? `<span class="lv-eyebrow">Tous les districts</span>${liste(ids, id => COUL[r24(id)?.g] || "var(--muted)", id => r24(id) ? `${esc(r24(id).elu)} (${r24(id).g})` : "")}` : ""}`;
    return;
  }
  // un district
  const id = sel, c = PROJ.circ[id], a = PROJ.actuel[id], res = r24(id), redec = DATA.redecoupes.includes(AB_DE[id.slice(0, 2)]);
  const lignes24 = res ? `<div class="vi-vrows">${res.c.map(k => jauge(esc(k.nom), COUL[k.p] || COUL.AUT, k.v, `<small>${k.p}</small>`, 100)).join("")}</div>` : "<p class=\"lv-muted\">Aucune donnée.</p>";
  const blocProj = c ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${COTE[c.r]?.[0]}"></i>Cote : ${COTE[c.r]?.[1]}</span><span class="vi-pill">${detenu(c).replace("détenu", "Détenu").replace("nouveau", "Nouveau")}</span></div>
      <p class="lv-muted">Sortant : ${esc(c.rep || "—")}${c.ret ? " (ne se représente pas)" : ""}${c.mp != null ? ` · présidentielle 2024 sur ce district : ${c.mp < 0 ? "R" : "D"}+${nf(Math.abs(c.mp), 1)}` : ""}</p>
      ${c.cands.length ? `<ul class="vi-cands">${c.cands.map(k => `<li style="--c:${COUL[k.p] || COUL.AUT}"><i></i><span>${esc(k.nom)}${k.inc ? " <small>(sortant)</small>" : ""}</span><em>${esc(k.p)}</em><b></b></li>`).join("")}</ul>` : ""}` : "";
  const titreProj = `Projection 2026 · consensus du ${dateFr(PROJ.maj)}${g !== "proj" && redec ? " (district redessiné)" : ""}`;
  const titre24 = `Élection du 5 novembre 2024${g === "proj" && redec ? " (anciens districts)" : ""}`;
  const depute = `<p class="vi-elu" style="--c:${a ? COUL[a.p] || COUL.AUT : "var(--soft)"}">${a ? `<b>${esc(a.nom)}</b> · ${NOMS[a.p] || a.p}` : "<b>Siège vacant</b>"}</p>`;
  z.innerHTML = `<span class="lv-eyebrow">District · ${esc(ETAT_NOM[AB_DE[id.slice(0, 2)]])}</span><h3>${esc(nomDe(id))}</h3>
    ${g === "act" ? depute : ""}
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← ${etat.st ? esc(ETAT_NOM[etat.st]) : "Tous les États-Unis"}</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button></div>
    ${g === "proj" ? `<span class="lv-eyebrow">${titreProj}</span>${blocProj}${replie(titre24, lignes24)}`
      : `<span class="lv-eyebrow">${titre24}</span>${lignes24}${replie(titreProj, blocProj)}`}
    ${g === "act" ? "" : `<span class="lv-eyebrow">Représentant actuel${g === "proj" && redec ? " (district de 2024 du même numéro)" : ""}</span>${depute}`}`;
}
document.addEventListener("click", e => {
  if (!e.target.closest("#viPanneau")) return;
  const rs = e.target.closest("[data-regsel]"); if (rs) { choisirEtat(rs.dataset.regsel || null); return; }
  const es = e.target.closest("[data-etatsen]");
  if (es) { const f = es.dataset.etatsen || null; sel = f; if (f) zoomVers(DATA.geoEtats.features.find(x => x.properties.id === f), 0.9); else svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); peindre(); dessinerPanneau(); return; }
  const l = e.target.closest("[data-rid]"); if (l) { choisir(l.dataset.rid); return; }
  if (e.target.closest("[data-tout]")) { if (TYPE === "sen") { sel = null; svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); peindre(); dessinerPanneau(); } else choisirEtat(etat.st); return; }
  if (e.target.closest("[data-zoomsel]") && sel != null) zoomVers(features().find(x => x.properties.id === sel), 0.5);
});
document.addEventListener("keydown", e => {
  const l = e.target.closest?.("#viPanneau [data-rid]"); if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(l.dataset.rid); }
});

/* ---------- évolution du vote générique ---------- */
let periode = lireLS("vuPeriode", 3);   // 3 derniers mois par défaut
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 54, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = SOND.sondages, moyT = SOND.moyenne;
  const fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([t(DATE_ELECTION), d3.timeMonth.offset(fin_, -periode)]) : t(DATE_ELECTION);
  const dans_ = d => t(d) >= debut;
  const sond = tous.filter(s => dans_(s.d)), moy = moyT.filter(s => dans_(s.d));
  const elec = dans_(DATE_ELECTION) ? [{ d: DATE_ELECTION, ...R24.national }] : [];
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  $("viEvolSur").textContent = periode ? `Vote générique · ${periode < 12 ? periode + " derniers mois" : periode === 12 ? "dernière année" : periode / 12 + " dernières années"}` : "Vote générique · depuis l'élection de 2024";
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const vals = [...sond.flatMap(s => [s.D, s.R]), ...moy.flatMap(s => [s.D, s.R]), ...elec.flatMap(e => [e.D, e.R])];
  const y = d3.scaleLinear().domain([Math.floor((d3.min(vals) - 3) / 5) * 5, Math.ceil((d3.max(vals) + 2) / 5) * 5]).range([H - m.b, m.t]);
  const ligneD = d3.line().x(o => x(t(o.d))).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution du vote générique au Congrès");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : periode && periode <= 6 ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", periode && periode <= 6 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elec) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Élection 2024 (vote populaire)");
  }
  const fin = {};
  for (const p of P) {
    svgE.append("g").selectAll("circle").data(sond).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", periode && periode <= 12 ? 3 : 2.2).style("fill", COUL[p]);
    svgE.append("path").attr("class", "vi-ligne").attr("d", ligneD.y(o => y(o[p]))(moy)).style("stroke", COUL[p]);
    svgE.append("g").selectAll("rect").data(elec).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", COUL[p]);
    fin[p] = moy[moy.length - 1]?.[p];
  }
  const etiq = P.map(p => ({ p, y: y(fin[p]), v: fin[p] })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => COUL[d.p]).text(d => `${d.p} ${nf(d.v, 1)}`);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      const [mx] = d3.pointer(ev), dt = x.invert(mx), o = moy.reduce((a, b) => Math.abs(t(b.d) - dt) < Math.abs(t(a.d) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(o.d))).attr("x2", x(t(o.d)));
      const n = tous.filter(s => Math.abs(t(o.d) - t(s.d)) / 864e5 <= 15).length;
      tipE.hidden = false; tipE.innerHTML = `<b>${dateFr(o.d)}</b><small>moyenne de Silver Bulletin · ${n} sondage${n > 1 ? "s" : ""} à ±15 jours</small>`
        + P.map(p => `<span style="--c:${COUL[p]}"><i></i>${p === "D" ? "Démocrates" : "Républicains"} <b>${nf(o[p], 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(o.d)) * r.width / W;
      tipE.style.left = Math.min(r.width - tipE.offsetWidth - 4, Math.max(4, px + 12)) + "px"; tipE.style.top = "8px";
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = `${sond.length} sondages nationaux sur la période (« pour quel parti voterez-vous au Congrès ? »). Lignes : moyenne de Silver Bulletin · points : sondages · losanges : vote populaire à la Chambre en 2024.`;
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, PROJ, R24, SOND] = await Promise.all([lireJ("votes-usa/data.json"), lireJ("votes-usa/projection.json"), lireJ("votes-usa/resultats-2024.json"), lireJ("votes-usa/sondages.json")]);
    DATA.etats.forEach(e => { AB_DE[e.fips] = e.ab; ETAT_NOM[e.ab] = e.nom; });
    DATA.districts.forEach(d => NOM26[d.id] = d.n); DATA.districts24.forEach(d => NOM24[d.id] = d.n);
    ajouterChoixType(); dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution();
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vuPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
