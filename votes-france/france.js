/* Votes France — intentions de vote aux législatives, même gabarit que « Votes Québec » (votes-quebec/intentions.js).
   Base : l'Assemblée élue en 2024 (577 sièges, hémicycle) et le 1er tour par circonscription (data.json, ministère de l'Intérieur).
   Assemblée actuelle : groupes parlementaires et député de chaque circonscription (données ouvertes de l'Assemblée,
   ajoutées à data.json par outils/assemblee_fr.py) — c'est l'état le plus récent tant qu'aucun sondage législatif récent n'existe.
   Intentions de vote : législatives (sondages.json, rares depuis la fin de 2025) et présidentielle 2027 (sondages-pres.json),
   tableaux Wikipédia qui citent chaque sondeur. Aucune projection en sièges (2 tours : trop incertain par circonscription). */
import { domaineY, decouper, placerBulle } from "../votes-quebec/zoom-y.js";
import { preparerSysteme } from "../votes-quebec/systeme.js";
import { sectionPartis, PARTIS, bordDe, trierAxe } from "../votes-quebec/partis.js";
import { equilibrerHaut } from "../votes-quebec/equilibre.js";
import { preparerPleinEcran, infoPlein } from "../votes-quebec/plein.js";
import { regrouper } from "../votes-quebec/hemicycle.js";

const SIEGES = 577, MAJ = 289;
const NOMS = { EXG: "Extrême gauche", NFP: "Gauche (NFP)", DVG: "Divers gauche", REG: "Régionalistes", ENS: "Ensemble (centre)", DVC: "Divers centre",
  LR: "Les Républicains", DVD: "Divers droite", RN: "RN et alliés (UDR)", EXD: "Extrême droite", DIV: "Divers" };
const COURT = { EXG: "EXG", NFP: "NFP", DVG: "DVG", REG: "Rég.", ENS: "ENS", DVC: "DVC", LR: "LR", DVD: "DVD", RN: "RN-UDR", EXD: "EXD", DIV: "Div." };
// Une seule palette par famille politique, partout sur la page (blocs de 2024, groupes actuels, candidats) :
// LFI rouge · PS rose · écologistes vert · PCF rouge sombre · Ensemble/Renaissance orange · MoDem orange foncé ·
// Horizons bleu ciel · LR bleu · RN bleu indigo · Reconquête brun
const FAMILLE = { LO: "#7A1A1A", EXG: "#7A1A1A", NPA: "#8E1B1B", PCF: "#B5172B", GDR: "#B5172B", LFI: "#C00D0D", "LFI-NFP": "#C00D0D",
  "Picardie debout": "#D95F43", "Debout !": "#D95F43", PS: "#E8579A", SOC: "#E8579A", "Place publique": "#E8579A", "La Convention": "#E8579A", GRS: "#C8507A",
  "Écologistes": "#3E9B4F", ECOS: "#3E9B4F", LIOT: "#E0C040", Renaissance: "#F5A623", Ensemble: "#F5A623", EPR: "#F5A623", MoDem: "#F07E26", DEM: "#F07E26",
  Horizons: "#2AA7DE", HOR: "#2AA7DE", "République unie": "#8E7CC3", LR: "#1B5FB0", DR: "#1B5FB0", "Nous France": "#1B5FB0", DLF: "#5C7BA8",
  RN: "#4656B0", UDDPLR: "#7484D6", UDR: "#7484D6", "Reconquête": "#8C6B3E", "Résistons": "#A0896B", NI: "#8D949A", "Indépendant": "#8D949A" };
const COUL = { EXG: "#7A1A1A", NFP: "#CC2443", DVG: "#F09AC0", REG: "#6E6585", ENS: "#F5A623", DVC: "#D4AF0F", LR: "#1B5FB0",
  DVD: "#6C8FC7", RN: "#4656B0", EXD: "#8C6B3E", DIV: "#8D949A" };
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
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };


let DATA, SOND, PRES, P22, BLOCS, PAR_ID = {}, GP = {}, sel = null, demarre = false;
// type de page : « leg » (législatives : Assemblée, élection de 2024) ou « pres » (présidentielle 2027 : sondages, 2022)
let TYPE = location.hash === "#legislatives" ? "leg" : location.hash === "#presidentielle" ? "pres" : lireLS("vfType", "pres");
const etat = { mode: TYPE === "leg" ? "actuel" : "lead", parti: null, cand: null, pct: lireLS("vfPct", true) };
// boutons de la carte : la situation actuelle à part, puis les modes de la dernière élection, groupés
const MODES = { leg: { actuel: [["actuel", "Députés"]], titre: "Élection", an: 2024, election: [["lead", "Élu"], ["second", "Meilleur 2e"], ["vote", "Vote"]] },
  pres: { actuel: [], titre: "Présidentielle", an: 2022, election: [["lead", "En tête"], ["second", "Meilleur 2e"], ["vote", "Vote"]] } };
// année d'un résultat, en évidence (pastille contrastée)
const AN = a => String(a);   // années en texte normal (comme Canada et États-Unis) : plus de pastilles blanches partout
// date avec l'année en pastille ; période sur une même année : « 1 septembre – 29 septembre 2026 »
const jourMois = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long" }).replace(/^1 /, "1er ");
const dateAn = iso => `${jourMois(iso)} ${AN(iso.slice(0, 4))}`;
const periodeAn = (de, a) => de.slice(0, 4) === a.slice(0, 4) ? `${jourMois(de)} – ${dateAn(a)}` : `${dateAn(de)} – ${dateAn(a)}`;
const coulC = n => FAMILLE[P22.candidats[n]?.parti || PRES.candidats[n]?.parti] || P22.candidats[n]?.c || PRES.candidats[n]?.c || "#8D949A";
const parti22 = n => P22.candidats[n]?.parti || PRES.candidats[n]?.parti || "";

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
  document.querySelectorAll("#vfType button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === TYPE));
  const carte = $("viPlan").closest("section"), eyebrow = carte.querySelector(".lv-eyebrow");
  let bloc = $("vfCands");
  if (!bloc) { bloc = document.createElement("div"); bloc.id = "vfCands"; bloc.className = "vf-cands"; $("viLegende").after(bloc); }
  $("viPlan").style.display = $("viLegende").style.display = TYPE === "leg" ? "" : "none";
  bloc.hidden = TYPE === "leg";
  // court texte d'explication du système politique, selon le mode
  // encadré d'explication retiré de la page : le bouton « Comprendre le système politique et électoral » s'en charge
  // (élément gardé hors de la page pour ne pas toucher au reste du code)
  const ex = document.createElement("div");
  ex.innerHTML = TYPE === "pres"
    ? `<p>Le président de la République est élu directement par les électeurs pour 5 ans, et ne peut pas faire plus de deux mandats de suite (Emmanuel Macron ne peut donc pas se représenter en 2027). Si personne n'obtient plus de 50 % des voix au 1er tour, les deux premiers s'affrontent au 2e tour, deux semaines plus tard. Le président nomme le Premier ministre, qui dirige le gouvernement, mais ce gouvernement doit pouvoir survivre aux votes de l'Assemblée nationale.</p>`
    : `<p>Les 577 députés de l'Assemblée nationale sont élus pour 5 ans, un par circonscription, en deux tours : on est élu dès le 1er tour avec plus de 50 % des voix (et au moins 25 % des inscrits) ; sinon, les candidats qui ont au moins 12,5 % des inscrits passent au 2e tour, et le premier l'emporte. Les députés se regroupent en groupes parlementaires (15 membres au moins). Le Premier ministre est nommé par le président, mais son gouvernement peut être renversé par une motion de censure votée à la majorité absolue (289 députés) ; le président peut, lui, dissoudre l'Assemblée et provoquer des élections anticipées, comme en juin 2024.</p>`;
  const dS = s => s.sondages.filter(x => !x.e).map(x => x.d).sort().pop();
  majBarre(TYPE === "leg" ? "Votes France · législatives" : "Votes France · présidentielle 2027",
    TYPE === "leg" ? `Assemblée au ${dateFr(A.date)} · dernier sondage le ${dateFr(dS(SOND))}` : `dernier sondage le ${dateFr(dS(PRES))}`);
  document.querySelector(".vue-votes .vi-badge").textContent = TYPE === "leg" ? "France · législatives" : "France · présidentielle 2027";
  if (TYPE === "pres") {
    const [top] = p.moy;
    $("viTitre").textContent = "Présidentielle 2027 : intentions de vote";
    // les dates (dernier sondage, vérification) sont dans la barre du haut : ici, seulement ce qu'elle ne dit pas
    $("viSource").innerHTML = `Premier tour en avril 2027 · moyenne des sondages publiés depuis le ${dateFr(p.de)}`;
    $("viNote").textContent = "Les candidats testés varient d'un sondage à l'autre (plusieurs scénarios) : la moyenne garde le premier scénario de chaque sondage.";
    eyebrow.textContent = `Présidentielle 2027 · 1er tour · moyenne de ${p.n} sondages`;
    $("viSiegesTitre").textContent = `${nomCourt(top[0])} en tête : ${nf(top[1], 1)} %`;
    const max = Math.max(40, top[1]);
    bloc.innerHTML = p.moy.filter(([, v]) => v >= 1).map(([k, v]) => `<div class="vf-cand" style="--c:${coulC(k)}"><span><b>${esc(k)}</b><small>${esc(parti22(k))}${P22.national[k] != null ? ` · <span class="vf-avant">${nf(P22.national[k], 1)} % en 2022</span>` : ""}</small></span>`
      + `<span class="vf-cand-barre"><i style="width:${100 * v / max}%"></i></span><b class="vf-cand-v">${nf(v, 1)} %</b></div>`).join("")
      + `<p class="lv-muted lv-source">Les deux premiers se qualifient pour le 2e tour.</p>`;
    return;
  }
  eyebrow.textContent = `Assemblée nationale · 577 sièges · majorité absolue ${MAJ}`;
  $("viTitre").textContent = "Législatives : l'Assemblée actuelle";
  $("viSource").innerHTML = "Députés en exercice · Assemblée élue en juillet 2024";
  $("viNote").textContent = "Aucun sondage d'intentions de vote aux législatives n'a été publié depuis octobre 2025 (registre de la Commission des sondages) : la page montre l'Assemblée telle qu'elle est aujourd'hui. Prochaines législatives au plus tard en 2029, sauf dissolution.";
  $("viSiegesTitre").textContent = lead.n >= MAJ ? `${lead.nom} : ${lead.n} sièges, majorité absolue` : `Aucune majorité absolue · premier groupe : ${lead.id} (${lead.n} sièges)`;
  // groupes de gauche à droite (même classement que la bande des partis)
  const parG = Object.fromEntries(A.groupes.map(g => [g.id, g]));
  hemicycle($("viPlan"), [...trierAxe(PARTIS.france, A.groupes.map(g => g.id)).map(k => { const g = parG[k]; return { k: g.id, n: g.n, c: g.c, nom: g.nom, bord: bordDe(PARTIS.france, g.id) }; }),
    ...(A.vacants ? [{ k: "VAC", n: A.vacants, c: "var(--soft)", nom: "Siège vacant", bord: "vac" }] : [])]);
  $("viLegende").innerHTML = A.groupes.map(g => `<span style="--c:${g.c}" title="${esc(g.nom)}"><i></i>${esc(g.id)} <b>${g.n}</b></span>`).join("")
    + (A.vacants ? `<span style="--c:var(--soft)"><i></i>Vacants <b>${A.vacants}</b></span>` : "");
}
// hémicycle : rangées en demi-cercle, groupes de gauche à droite, chacun groupé en quartier (regrouper)
function hemicycle(svgEl, parts) {
  const R = 14, r0 = 0.42, W = 1000, H = 520, cx = W / 2, cy = H - 20, Rmax = 470;
  const rayons = d3.range(R).map(i => r0 + i * (1 - r0) / (R - 1));
  const somme = d3.sum(rayons);
  const parRangee = rayons.map(r => Math.round(SIEGES * r / somme));
  parRangee[R - 1] += SIEGES - d3.sum(parRangee);
  let places = [];
  rayons.forEach((r, i) => { const n = parRangee[i];
    for (let k = 0; k < n; k++) { const a = Math.PI - k * Math.PI / (n - 1); places.push({ a, r, x: cx + Math.cos(a) * r * Rmax, y: cy - Math.sin(a) * r * Rmax }); } });
  places = regrouper(places, parts.map(p => p.n));   // chaque parti groupé (votes-quebec/hemicycle.js)
  const sieges = parts.flatMap(p => d3.range(p.n).map(() => p));
  const pas = Rmax * (1 - r0) / (R - 1), rayon = pas * 0.42;
  const g = d3.select(svgEl).attr("viewBox", `0 0 ${W} ${H}`); g.selectAll("*").remove();
  g.selectAll("circle").data(places).join("circle").attr("cx", p => p.x).attr("cy", p => p.y).attr("r", rayon)
    .attr("data-p", (p, i) => sieges[i]?.k || null)   // groupe ou bloc du siège (bande des partis)
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
const voteMode = () => etat.mode === "vote";
const partVue = (c, b) => partDe(c, b);
function remplir(id) {
  const c = PAR_ID[id];
  if (!c) return ["var(--soft)", 1];
  if (TYPE === "pres") {
    const s22 = Object.entries(P22.circ[id] || {});
    if (!s22.length) return ["var(--soft)", 1];
    if (etat.mode === "second") { const [n, v] = s22[1]; return [coulC(n), Math.max(0.3, Math.min(1, (v - 10) / 30))]; }
    if (etat.mode === "vote") return [coulC(etat.cand), Math.max(0.06, Math.min(1, (P22.circ[id][etat.cand] || 0) / 50))];
    return [coulC(s22[0][0]), Math.max(0.35, Math.min(1, (s22[0][1] - 15) / 30))];
  }
  if (etat.mode === "actuel") return c.act ? [GP[c.act.gp]?.c || "#8D949A", 0.92] : ["var(--soft)", 1];
  if (etat.mode === "second") { const [b, v] = deuxieme(c); return [COUL[b], Math.max(0.3, Math.min(1, (v - 10) / 30))]; }
  if (voteMode()) return [COUL[etat.parti], Math.max(0.06, Math.min(1, partVue(c, etat.parti) / 50))];
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
    else if (PRESETS[z]) zoomVers(PRESETS[z], 0.95);
  });
  preparerPleinEcran();   // plein écran de la carte et bouton « Info » (votes-quebec/plein.js)
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return;
    if (TYPE === "pres") etat.cand = b.dataset.p;
    else etat.parti = b.dataset.p;
    if (!voteMode()) etat.mode = "vote"; peindre(); });
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; ecrireLS("vfPct", etat.pct); peindre(); });
}
// boutons de mode et pastilles, selon le type de page
function outilsCarte() {
  const M = MODES[TYPE], bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  // ordre commun aux pages d'intentions : futur (intentions, aucune à jour ici) · présent (assemblée actuelle) · passé (élection)
  $("viModes").innerHTML = (M.actuel.length ? `<span class="vf-mode-grp"><span class="vf-mode-lab">Assemblée actuelle</span><span class="lv-groupe">${M.actuel.map(bouton).join("")}</span></span>` : "")
    + `<span class="vf-mode-grp"><span class="vf-mode-lab">${M.titre} ${M.an}</span><span class="lv-groupe">${M.election.map(bouton).join("")}</span></span>`;
  $("viChips").innerHTML = TYPE === "pres"
    ? Object.entries(P22.national).filter(([, v]) => v >= 4).map(([k]) => `<button type="button" class="vi-chip" style="--c:${coulC(k)}" data-p="${esc(k)}">${esc(nomCourt(k))}</button>`).join("")
    : BLOCS.filter(b => DATA.national[b] >= 2).map(b => `<button type="button" class="vi-chip" style="--c:${COUL[b]}" data-p="${b}">${COURT[b]}</button>`).join("");
}
function changerMode(m) {
  etat.mode = m;
  dessinerPanneau();
  if (m === "vote" && TYPE === "leg" && !etat.parti) etat.parti = Object.keys(DATA.sieges).sort((a, b) => DATA.sieges[b] - DATA.sieges[a])[0];
  if (m === "vote" && TYPE === "pres" && !etat.cand) etat.cand = Object.keys(P22.national)[0];
  peindre();
}
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  const choisi = TYPE === "pres" ? etat.cand : etat.parti;
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", voteMode() && b.dataset.p === choisi));
  $("viChips").setAttribute("aria-disabled", !voteMode());
  $("viPct").hidden = !voteMode(); $("viPct").setAttribute("aria-pressed", etat.pct);
  gCirc.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.id); this.style.fill = c; this.style.fillOpacity = o; });
  const f = sel != null ? DATA.geo.features.find(x => x.properties.id === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  const labs = gLbl.selectAll("g.vi-lab").data(voteMode() && etat.pct && (TYPE === "pres" ? etat.cand : etat.parti) ? DATA.geo.features : [], f => f.properties.id)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => nf(TYPE === "pres" ? (P22.circ[f.properties.id]?.[etat.cand] || 0) : partVue(PAR_ID[f.properties.id], etat.parti), 0) + " %");
  labs.select("text.vi-nom").text(f => PAR_ID[f.properties.id]?.n || "");
  placerEtiquettes();
  let an = $("vfAnCarte");
  if (!an) { an = document.createElement("div"); an.id = "vfAnCarte"; an.className = "vf-an-carte"; $("viCarte").before(an); }
  an.innerHTML = TYPE === "pres" ? `Présidentielle ${AN(2022)} · 1er tour`
    : etat.mode === "actuel" ? `Assemblée au ${dateAn(DATA.assemblee.date)}` : `Législatives ${AN(2024)} · ${etat.mode === "lead" ? "élus" : "1er tour"}`;
  if (TYPE === "pres") {
    const q = etat.cand, rampe = q ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${coulC(q)} 6%, var(--surface)), ${coulC(q)})"></span>` : "";
    $("viEchelle").innerHTML = (etat.mode === "vote"
      ? `<span>0 %</span>${rampe}<span>50 % et +</span><span>· ${esc(q)} au 1er tour de 2022 dans chaque circonscription${etat.pct ? " (chiffre = %)" : ""}</span>`
      : etat.mode === "second" ? "Couleur : candidat arrivé deuxième au 1er tour de la présidentielle 2022 dans chaque circonscription."
      : `<span class="vf-legende">${Object.entries(P22.national).filter(([, v]) => v >= 4).map(([k]) => `<span style="--c:${coulC(k)}"><i></i>${esc(nomCourt(k))}</span>`).join("")}</span><span>· candidat en tête au 1er tour de 2022 dans chaque circonscription (plus foncé = score plus élevé)</span>`);
    return;
  }
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  $("viEchelle").innerHTML = (etat.mode === "vote"
    ? `<span>0 %</span>${ramp}<span>50 % et +</span><span>· ${NOMS[p]} au 1er tour de 2024 dans chaque circonscription${etat.pct ? " (chiffre = %, plus de circonscriptions en zoomant)" : ""}</span>`
    : etat.mode === "second" ? "Couleur : bloc arrivé deuxième au 1er tour de 2024 dans chaque circonscription. Plus la couleur est foncée, plus son score est élevé."
    : etat.mode === "lead" ? "Couleur : bloc du député élu en 2024. Plus la couleur est foncée, plus son score au 1er tour était élevé. Outre-mer en encarts ; les Français de l'étranger sont dans le panneau."
    : `<span class="vf-legende">${DATA.assemblee.groupes.map(g => `<span style="--c:${g.c}"><i></i>${esc(g.id)}</span>`).join("")}<span style="--c:var(--soft)"><i></i>vacant</span></span><span>· groupe du député actuel (Assemblée au ${dateFr(DATA.assemblee.date)})</span>`);
}
function infobulle(e, f) {
  const c = PAR_ID[f.properties.id], t = $("viTip"), box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 230) px -= 250;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  t.innerHTML = c ? `<b>${esc(c.n)}</b><small>${esc(c.r)}${TYPE === "leg" && etat.mode === "actuel" ? "" : ` · ${nf(c.e)} inscrits`}</small><br>${c.act ? `Député : ${esc(c.act.nom)} (${esc(c.act.gp)})` : "Siège vacant"}<br>`
    + (TYPE === "pres" ? `<small>Présidentielle ${AN(2022)} ${Object.entries(P22.circ[c.id] || {}).slice(0, 3).map(([k, v]) => `${esc(nomCourt(k))} ${nf(v, 1)} %`).join(" · ")}</small>`
      : etat.mode === "actuel" ? `<small>${c.act ? esc(GP[c.act.gp]?.nom || c.act.gp) : ""}</small>`
    : `<small>Élu en ${AN(2024)} : ${esc(c.elu)} (${esc(c.gnu)})</small><br><small>1er tour : ${Object.entries(c.s).slice(0, 3).map(([b, v]) => `${COURT[b]} ${nf(v, 1)} %`).join(" · ")}</small>`) : f.properties.id;
}

/* ---------- panneau ---------- */
function choisir(id) { sel = id; peindre(); dessinerPanneau(); if (id != null) infoPlein(); }
const jauge = (lab, coul, v, droite = "", max = 50, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${coul}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
const ligneVote = (b, v, droite = "") => jauge(COURT[b], COUL[b], v, droite);
function panneauPres(z) {
  const horsCarte = DATA.circ.filter(c => !DATA.geo.features.some(f => f.properties.id === c.id));
  const tete = id => Object.keys(P22.circ[id] || {})[0];
  if (sel == null) {
    const COLS = Object.keys(P22.national).slice(0, 3);
    const parReg = DATA.regions.map(reg => { const n = { AUT: 0 }; COLS.forEach(k => n[k] = 0);
      DATA.circ.filter(c => c.r === reg).forEach(c => { const k = tete(c.id); if (n[k] != null) n[k]++; else n.AUT++; });
      return `<tr><td><button type="button" class="vi-lien" data-reg="${esc(reg)}">${esc(reg)}</button></td>${COLS.map(k => `<td class="${n[k] ? "has" : ""}" style="--c:${coulC(k)}">${n[k] || "·"}</td>`).join("")}<td class="${n.AUT ? "has" : ""}" style="--c:var(--ink)">${n.AUT || "·"}</td></tr>`; }).join("");
    const n22 = Object.entries(P22.national);
    z.innerHTML = `<span class="lv-eyebrow">Présidentielle ${AN(2022)} · 1er tour (10 avril)</span><h3>Toute la France</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${coulC(n22[0][0])}"></i>${esc(nomCourt(n22[0][0]))} ${nf(n22[0][1], 1)} %</span><span class="vi-pill"><i style="background:${coulC(n22[1][0])}"></i>${esc(nomCourt(n22[1][0]))} ${nf(n22[1][1], 1)} %</span></div>
      <p class="lv-muted">Ce que montre la carte : le dernier vrai vote dans chaque circonscription. Les intentions de vote pour 2027 sont en haut de la page.</p>
      <span class="lv-eyebrow">Résultat national</span>
      <div class="vi-vrows">${Object.entries(P22.national).map(([k, v]) => jauge(esc(nomCourt(k)), coulC(k), v, `<small>${esc(parti22(k))}</small>`, 50, "vf-pres")).join("")}</div>
      <span class="lv-eyebrow">En tête en ${AN(2022)}, par région (circonscriptions)</span>
      <div class="vi-table"><table><thead><tr><th>Région</th>${COLS.map(k => `<th style="color:${coulC(k)}">${esc(nomCourt(k))}</th>`).join("")}<th>Autres</th></tr></thead><tbody>${parReg}</tbody></table></div>
      <details class="lv-sg vf-hors"><summary><span>Hors carte : outre-mer et Français de l'étranger</span><small>${horsCarte.length}</small></summary>
      <ul class="vi-serres">${horsCarte.map(c => `<li data-id="${c.id}" tabindex="0" style="--c:${coulC(tete(c.id))}"><i></i>${esc(c.n)}<b>${esc(nomCourt(tete(c.id) || ""))}</b></li>`).join("")}</ul></details>`;
    return;
  }
  const c = PAR_ID[sel]; if (!c) return;
  const tracee = DATA.geo.features.some(f => f.properties.id === c.id), s22 = Object.entries(P22.circ[c.id] || {});
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(c.r)}</span><h3>${esc(c.n)}</h3>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${coulC(s22[0]?.[0])}"></i>En tête en 2022 : ${esc(nomCourt(s22[0]?.[0] || ""))}</span><span class="vi-pill">${nf(c.e)} inscrits</span></div>
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Toute la France</button>${tracee ? `<button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>` : ""}</div>
    <span class="lv-eyebrow">Présidentielle ${AN(2022)} · 1er tour (10 avril 2022)</span>
    <div class="vi-vrows">${s22.filter(([, v]) => v >= 0.5).map(([k, v]) => jauge(esc(nomCourt(k)), coulC(k), v, `<small>${esc(parti22(k))}</small>`, 50, "vf-pres")).join("")}</div>
    <p class="lv-muted">Député actuel : ${c.act ? `${esc(c.act.nom)} (${esc(c.act.gp)})` : "siège vacant"}</p>`;
}
function dessinerPanneau() {
  const z = $("viPanneau"), s = DATA.sieges, nat = DATA.national, A = DATA.assemblee;
  if (TYPE === "pres") return panneauPres(z);
  if (sel == null) {
    // le panneau suit la carte : Assemblée actuelle (bouton « Députés ») ou élection de 2024 (Élu, Meilleur 2e, Vote)
    const horsCarte = DATA.circ.filter(c => !DATA.geo.features.some(f => f.properties.id === c.id));
    const table = (titre, COLS, coul, lab, de) => { const lignes = DATA.regions.map(reg => { const n = { AUT: 0 }; COLS.forEach(b => n[b] = 0);
        DATA.circ.filter(c => c.r === reg).forEach(c => { const k = de(c); if (k && n[k] != null) n[k]++; else n.AUT++; });
        return `<tr><td><button type="button" class="vi-lien" data-reg="${esc(reg)}">${esc(reg)}</button></td>${COLS.map(b => `<td class="${n[b] ? "has" : ""}" style="--c:${coul(b)}">${n[b] || "·"}</td>`).join("")}<td class="${n.AUT ? "has" : ""}" style="--c:var(--ink)">${n.AUT || "·"}</td></tr>`; }).join("");
      return `<span class="lv-eyebrow">${titre}</span><div class="vi-table"><table><thead><tr><th>Région</th>${COLS.map(b => `<th style="color:${coul(b)}">${lab(b)}</th>`).join("")}<th>Autres</th></tr></thead><tbody>${lignes}</tbody></table></div>`; };
    const hors = (couleur, droite) => `<details class="lv-sg vf-hors"><summary><span>Hors carte : outre-mer et Français de l'étranger</span><small>${horsCarte.length}</small></summary>
      <ul class="vi-serres">${horsCarte.map(c => `<li data-id="${c.id}" tabindex="0" style="--c:${couleur(c)}"><i></i>${esc(c.n)}<b>${droite(c)}</b></li>`).join("")}</ul></details>`;
    if (etat.mode === "actuel") {
      const groupes = A.groupes.slice().sort((a, b) => b.n - a.n), lead = groupes[0];
      z.innerHTML = `<span class="lv-eyebrow">Assemblée nationale actuelle</span><h3>Toute la France</h3>
        <div class="vi-pills"><span class="vi-pill"><i style="background:${lead.c}"></i>Premier groupe : ${esc(lead.id)} ${lead.n} / 577</span><span class="vi-pill">Majorité absolue : ${MAJ}</span>${A.vacants ? `<span class="vi-pill">${A.vacants} sièges vacants</span>` : ""}</div>
        <span class="lv-eyebrow">Groupes parlementaires</span>
        <div class="vi-vrows">${groupes.map(g => `<div class="vi-vrow vf-gp" title="${esc(g.nom)}"><b style="color:${g.c}">${esc(g.id)}</b><span class="vi-jauge"><i style="width:${100 * g.n / 130}%;background:${g.c}"></i></span><span class="vi-num"><b>${g.n}</b></span><span class="vi-num"><small>${nf(100 * g.n / 577, 1)} %</small></span></div>`).join("")}</div>
        ${table("Députés actuels par région", ["RN", "EPR", "LFI-NFP", "SOC", "DR"], b => GP[b]?.c || "var(--ink)", b => b.replace("-NFP", ""), c => c.act?.gp)}
        ${hors(c => c.act ? GP[c.act.gp]?.c : "var(--soft)", c => c.act ? esc(c.act.gp) : "vacant")}`;
      return;
    }
    const tete = BLOCS.filter(b => s[b]).sort((a, b) => s[b] - s[a]);
    z.innerHTML = `<span class="lv-eyebrow">Élection de ${AN(2024)} · 30 juin et 7 juillet</span><h3>Toute la France</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[tete[0]]}"></i>Premier bloc : ${COURT[tete[0]]} ${s[tete[0]]} / 577</span><span class="vi-pill">Majorité absolue : ${MAJ}</span></div>
      <span class="lv-eyebrow">1er tour et sièges</span><div class="vi-vrows">${BLOCS.filter(b => s[b] || nat[b] >= 1).sort((a, b) => (s[b] || 0) - (s[a] || 0)).map(b => ligneVote(b, nat[b] || 0, `<b>${s[b] || 0}</b> <small>élus</small>`)).join("")}</div>
      ${table(`Élus en ${AN(2024)} par région`, tete.slice(0, 5), b => COUL[b], b => COURT[b], c => c.g)}
      ${hors(c => COUL[c.g], c => `${COURT[c.g]} <small>${esc(c.elu)}</small>`)}`;
    return;
  }
  const c = PAR_ID[sel]; if (!c) return;
  const tracee = DATA.geo.features.some(f => f.properties.id === c.id), g = c.act ? GP[c.act.gp] : null;
  if (etat.mode === "actuel") {   // mode « Député actuel » : seulement l'état actuel (l'élection de 2024 est dans les autres modes)
    const voisins = DATA.circ.filter(x => x.d === c.d && x.id !== c.id);
    z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(c.r)}</span><h3>${esc(c.n)}</h3>
      <p class="vi-elu" style="--c:${g ? g.c : "var(--soft)"}">${c.act ? `<b>${esc(c.act.nom)}</b> · député en exercice` : "<b>Siège vacant</b> (élection partielle à venir)"}</p>
      ${g ? `<div class="vi-pills"><span class="vi-pill"><i style="background:${g.c}"></i>${esc(g.nom)}</span><span class="vi-pill">Groupe de ${g.n} députés (${nf(100 * g.n / 577, 1)} %)</span></div>` : ""}
      <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Toute la France</button>${tracee ? `<button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>` : ""}</div>
      ${voisins.length ? `<span class="lv-eyebrow">Les autres députés du département (${esc(c.dn)})</span>
      <ul class="vi-serres">${voisins.map(x => `<li data-id="${x.id}" tabindex="0" style="--c:${x.act ? GP[x.act.gp]?.c : "var(--soft)"}"><i></i>${esc(x.n.replace(/^.*\(/, "").replace(")", " circ."))} · ${x.act ? esc(x.act.nom) : "vacant"}<b>${x.act ? esc(x.act.gp) : "—"}</b></li>`).join("")}</ul>` : ""}
      <p class="lv-muted">Assemblée au ${dateAn(DATA.assemblee.date)}. Pour le résultat de l'élection de ${AN(2024)} dans cette circonscription : bouton « Élu » (Élection 2024, au-dessus de la carte).</p>`;
    return;
  }
  z.innerHTML = `<span class="lv-eyebrow">Circonscription · ${esc(c.r)}</span><h3>${esc(c.n)}</h3>
    <p class="vi-elu" style="--c:${g ? g.c : "var(--soft)"}">${c.act ? `<b>${esc(c.act.nom)}</b> · ${esc(g?.nom || c.act.gp)}` : "<b>Siège vacant</b> (élection partielle à venir)"}</p>
    <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Toute la France</button>${tracee ? `<button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>` : ""}</div>
    <span class="lv-eyebrow">Élection de ${AN(2024)}</span>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[c.g]}"></i>Élu${c.t === 1 ? " dès le 1er tour" : " au 2e tour"} : ${esc(c.elu)} (${esc(c.gnu)})</span>
      <span class="vi-pill">${nf(c.e)} inscrits</span><span class="vi-pill">Participation (1er tour) : ${nf(c.part, 1)} %</span></div>
    <span class="lv-eyebrow">1er tour (30 juin ${AN(2024)}), par bloc</span>
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
let periode = lireLS("vfPeriode", 0);
const serie_ = () => TYPE;
function donneesSerie() {
  if (serie_() === "pres") {
    // candidats suivis : ceux qui font au moins 4 % en moyenne sur les sondages des 6 derniers mois
    const fin = new Date(PRES.sondages[PRES.sondages.length - 1].d + "T12:00:00"), cands = {};
    for (const x of PRES.sondages.filter(x => (fin - new Date(x.d + "T12:00:00")) / 864e5 <= 183)) for (const [k, v] of Object.entries(x.v)) (cands[k] ||= []).push(v);
    const lignes = Object.entries(cands).filter(([, v]) => d3.mean(v) >= 4 && v.length >= 3).map(([k]) => k);
    return { lignes, lab: k => nomCourt(k), coul: k => PRES.candidats[k]?.c || "#8D949A", debut: "2023-03-01", sigma: 30,
      points: PRES.sondages.map(x => ({ d: x.d, f: x.f, n: x.n, v: x.v })), elections: [], titre: `Présidentielle ${AN(2027)} · 1er tour`,
      note: n => `${n} sondage${n > 1 ? "s" : ""} sur la période (1er tour, premier scénario de chaque sondage ; source : tableau Wikipédia qui cite la notice de chaque sondage). Lignes : tendance · points : sondages.` };
  }
  const lignes = ["NFP", "ENS", "LR", "RN", "EXD"];
  return { lignes, lab: k => COURT[k], coul: k => COUL[k], debut: "2024-06-01", sigma: 45,
    points: SOND.sondages.filter(x => !x.e).map(x => ({ d: x.d, f: x.f, n: x.n, v: Object.fromEntries(BLOCS.filter(b => x[b] != null).map(b => [b, x[b]])) })),
    elections: SOND.sondages.filter(x => x.e).map(x => ({ d: x.d, v: Object.fromEntries(BLOCS.map(b => [b, x[b] || 0])) })), titre: "Législatives · 1er tour",
    note: n => `${n} sondage${n > 1 ? "s" : ""} sur la période (intentions de vote aux législatives, premier scénario). Lignes : tendance · points : sondages · losanges : 1er tour de 2024.` };
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
  $("viEvolSur").innerHTML = `${S.titre} · ${periode ? (periode < 12 ? `${periode} derniers mois` : periode === 12 ? "dernière année" : `${periode / 12} dernières années`) : `depuis ${AN(S.debut.slice(0, 4))}`}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(S.lignes, p => s.v[p] || 0)) || 40;
  const y = d3.scaleLinear().domain(domaineY(el, [0, Math.ceil((yMax + 4) / 10) * 10], TYPE + periode, dessinerEvolution)).range([H - m.b, m.t]);   // molette : zoom vertical
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
  decouper(svgE, el, y, m, W, H);
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
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = S.note(sond.length);
  // législatives : moyenne des derniers sondages, sous le graphique (le panneau de droite reste consacré à la carte)
  let boite = $("vfSondMoy");
  if (!boite) { boite = document.createElement("div"); boite.id = "vfSondMoy"; boite.className = "vf-sondmoy"; $("viEvolNote").before(boite); }
  const rs = TYPE === "leg" ? moyenneRecente() : null;
  boite.hidden = !rs;
  if (rs) boite.innerHTML = `<span class="lv-eyebrow">Derniers sondages · moyenne des ${rs.n} derniers (${rs.firmes.map(esc).join(", ")})</span>
    <div class="vf-legende">${BLOCS.filter(b => rs.moy[b] >= 1).sort((a, b) => rs.moy[b] - rs.moy[a]).map(b => `<span style="--c:${COUL[b]}"><i></i>${COURT[b]} <b>${nf(rs.moy[b], 1)} %</b></span>`).join("")}</div>`;
}
// choix législatives / présidentielle, en haut de la page : change toute la page
function ajouterChoixType() {
  const tete = document.querySelector(".vue-votes .lv-head"); if (!tete || $("vfType")) return;
  const g = document.createElement("div");
  g.className = "lv-groupe vf-type"; g.id = "vfType"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "Élection affichée");
  g.innerHTML = `<button type="button" data-t="pres">Présidentielle 2027</button><button type="button" data-t="leg">Législatives</button>`;
  tete.appendChild(g);
  g.addEventListener("click", e => { const b = e.target.closest("button[data-t]"); if (!b || b.dataset.t === TYPE) return; changerType(b.dataset.t); });
}
function changerType(t) {
  TYPE = t; ecrireLS("vfType", t);
  history.replaceState(null, "", location.pathname + location.search + (t === "leg" ? "#legislatives" : "#presidentielle"));
  etat.mode = t === "leg" ? "actuel" : "lead";
  sel = null; outilsCarte(); dessinerTete(); peindre(); dessinerPanneau(); dessinerEvolution();
}

/* ---------- « Comprendre le système politique et électoral » : grande fenêtre en deux parties (votes-quebec/systeme.js) ----------
   Même cadre que Votes Québec (intentions.js, systemeElectoral()), commune aux deux vues (présidentielle et législatives).
   Partie 1, système politique : Cinquième République, président, gouvernement, Parlement, Assemblée actuelle, État unitaire.
   Partie 2, système électoral : législatives à deux tours, des voix aux sièges (2024), dissolution, présidentielle, électeurs.
   Les chiffres viennent des données de la page : data.json (législatives 2024), assemblee.json (Assemblée actuelle),
   pres2022.json (présidentielle 2022) et sondages-pres.json (sondages 2027). */
function systemeElectoral() {
  const A = DATA.assemblee, S = DATA.sieges, V = DATA.national, N = SIEGES, circ = DATA.circ;
  const HORS = ["Outre-mer", "Français de l'étranger"];
  const nOM = circ.filter(c => c.r === HORS[0]).length, nEtr = circ.filter(c => c.r === HORS[1]).length;
  const nRegMetro = DATA.regions.filter(r => !HORS.includes(r)).length;
  const inscrits = d3.sum(circ, c => c.e), part = d3.sum(circ, c => c.e * c.part) / inscrits;   // participation au 1er tour, pondérée par les inscrits
  const auPremier = circ.filter(c => c.t === 1).length;
  // Assemblée actuelle : groupes regroupés par grandes familles (les groupes inconnus vont dans « Autres groupes »)
  const nGr = A.groupes.filter(g => g.id !== "NI").length, gros = A.groupes.slice().sort((a, b) => b.n - a.n)[0];
  const FAM = [["Gauche (NFP)", ["LFI-NFP", "SOC", "ECOS", "GDR"], COUL.NFP], ["Bloc central", ["EPR", "DEM", "HOR"], COUL.ENS],
    ["Droite (DR)", ["DR"], FAMILLE.DR], ["RN et UDR", ["RN", "UDDPLR"], FAMILLE.RN], ["LIOT", ["LIOT"], FAMILLE.LIOT], ["Non-inscrits", ["NI"], FAMILLE.NI]];
  const connus = new Set(FAM.flatMap(f => f[1])), autres = A.groupes.filter(g => !connus.has(g.id)).map(g => g.id);
  const fams = [...FAM, ...(autres.length ? [["Autres groupes", autres, "#8D949A"]] : [])]
    .map(([nom, ids, c]) => ({ nom, c, ids: ids.filter(id => A.groupes.some(g => g.id === id)), n: d3.sum(A.groupes.filter(g => ids.includes(g.id)), g => g.n) }))
    .filter(f => f.n > 0).sort((a, b) => b.n - a.n);
  const famMax = fams[0];
  const tabAssemblee = `<table class="vi-dlg-tab"><caption>Assemblée nationale au ${dateFr(A.date)} · majorité absolue ${MAJ}</caption>
      <thead><tr><th scope="col">Famille<small>groupes parlementaires</small></th><th scope="col">Députés</th><th scope="col">Manque<small>pour ${MAJ}</small></th></tr></thead>
      <tbody>${fams.map(f => `<tr style="--c:${f.c}"><th scope="row"><i></i>${esc(f.nom)}<small style="display:block;margin-left:18px;font-weight:400;color:var(--muted)">${f.ids.map(id => `<abbr title="${esc(A.groupes.find(g => g.id === id)?.nom || id)}">${esc(id)}</abbr>`).join(", ")}</small></th><td><b>${f.n}</b></td><td class="moins">${f.n >= MAJ ? "—" : `−${MAJ - f.n}`}</td></tr>`).join("")}
      ${A.vacants ? `<tr style="--c:var(--muted)"><th scope="row"><i></i>Sièges vacants</th><td>${A.vacants}</td><td></td></tr>` : ""}</tbody></table>`;
  // législatives 2024 : part des voix au 1er tour (par bloc) et part des sièges
  const pctS = b => 100 * (S[b] || 0) / N;
  const grands = BLOCS.filter(b => (S[b] || 0) >= 20).sort((a, b) => S[b] - S[a] || V[b] - V[a]);
  const reste = BLOCS.filter(b => !grands.includes(b)), vReste = d3.sum(reste, b => V[b] || 0), sReste = d3.sum(reste, b => S[b] || 0);
  const ligneVs = (lab, c, v, s) => `<div class="vi-dlg-vs-ligne" style="--c:${c}"><b>${lab}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${2 * v}%"></i><i style="width:${Math.max(0.6, 200 * s / N)}%"></i></span>
      <small>${nf(v, 1)} % des voix<br>${s} siège${s > 1 ? "s" : ""} (${nf(100 * s / N, 0)} %)</small></div>`;
  const lignes = grands.map(b => ligneVs(b === "RN" ? "RN" : COURT[b], COUL[b], V[b], S[b])).join("") + (sReste || vReste ? ligneVs("Autres", "#8D949A", vReste, sReste) : "");
  const graphique = `<div class="vi-dlg-vs">${lignes}</div>
      <div class="vi-dlg-legende"><span>part des voix (1er tour)</span><span>part des sièges</span></div>`;
  const DIT = { NFP: "le Nouveau Front populaire", ENS: "Ensemble, la coalition du centre", RN: "le bloc du RN et de ses alliés (UDR)", LR: "Les Républicains", DVD: "les divers droite" };
  const dit = b => DIT[b] || NOMS[b], Dit = b => dit(b)[0].toUpperCase() + dit(b).slice(1);
  const premierV = grands.slice().sort((a, b) => V[b] - V[a])[0], premierS = grands[0];
  const ecarts = grands.map(b => [b, pctS(b) - V[b]]).sort((a, b) => b[1] - a[1]), [gagne, plus] = ecarts[0];
  const devant = grands.filter(b => S[b] > S[premierV]), rang = ["deuxième", "troisième", "quatrième", "cinquième"][devant.length - 1];
  const phraseVs = (devant.length
    ? `En 2024, ${dit(premierV)} est arrivé en tête des voix au 1er tour (${nf(V[premierV], 1)} %), mais n'a obtenu que ${S[premierV]} sièges (${nf(pctS(premierV), 0)} %)${rang ? ` : il n'est que ${rang} en sièges` : ""}, derrière ${devant.map(b => `${dit(b)} (${S[b]} sièges, soit ${nf(pctS(b), 0)} %, avec ${nf(V[b], 1)} % des voix)`).join(" et ")}.`
    : `En 2024, ${dit(premierS)} est arrivé en tête des voix (${nf(V[premierS], 1)} %) et des sièges (${S[premierS]}).`)
    + (plus > 2 && !devant.includes(gagne) ? ` ${Dit(gagne)} a obtenu ${nf(pctS(gagne), 0)} % des sièges avec ${nf(V[gagne], 1)} % des voix.` : "");
  // présidentielle : 2022 (données) et moyenne des sondages 2027
  const p22 = Object.entries(P22.national), pr = presRecente(), haut = pr.moy[0]?.[1] || 0;
  const politique = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b class="vi-dlg-long">République <span style="white-space:nowrap">semi-présidentielle</span></b><small>la Cinquième République, fondée par la Constitution de 1958</small></div>
      <div><b>2 chambres</b><small>l'Assemblée nationale (${N} députés) et le Sénat (348 sénateurs)</small></div>
      <div><b>${MAJ}</b><small>députés pour renverser le gouvernement (motion de censure)</small></div>
      <div><b class="vi-dlg-long">État unitaire</b><small>les lois sont votées à Paris pour tout le pays ; ce n'est pas une fédération</small></div>
    </section>
    <section>
      <h3>Le régime : la Cinquième République</h3>
      <p>La France vit sous la <b>Cinquième République</b>, fondée par la Constitution du 4 octobre 1958. C'est un régime <b>semi-présidentiel</b> : le pouvoir exécutif a deux têtes. Le <b>président de la République</b>, élu directement par les électeurs, a des pouvoirs propres ; le <b>Premier ministre</b> et son gouvernement dirigent la politique du pays au quotidien et doivent garder l'appui de l'Assemblée nationale, comme dans un régime parlementaire.</p>
      <ul>
        <li><b>Pouvoir exécutif</b> : le président de la République, le Premier ministre et les ministres.</li>
        <li><b>Pouvoir législatif</b> : le Parlement, formé de l'Assemblée nationale et du Sénat. Il vote les lois et le budget, et contrôle le gouvernement.</li>
        <li><b>Pouvoir judiciaire</b> : des tribunaux indépendants ; le <b>Conseil constitutionnel</b> vérifie que les lois respectent la Constitution.</li>
      </ul>
    </section>
    <section>
      <h3>Le président de la République</h3>
      <p>Le président est élu au <b>suffrage universel direct</b> pour <b>5 ans</b> et ne peut pas faire plus de <b>deux mandats de suite</b> (voir la partie <a href="#" data-aller="electoral">Système électoral</a>). Il n'est pas responsable devant le Parlement : les députés ne peuvent pas le renverser. Certains de ses pouvoirs n'ont besoin de la signature d'aucun ministre :</p>
      <ul>
        <li><b>nommer le Premier ministre</b> ;</li>
        <li><b>dissoudre l'Assemblée nationale</b> et provoquer des élections anticipées (au plus une fois par an) ;</li>
        <li><b>soumettre un projet de loi au référendum</b> ;</li>
        <li>prendre des <b>pouvoirs exceptionnels</b> en cas de crise grave (article 16, utilisé une seule fois, en 1961) ;</li>
        <li>nommer trois des neuf membres du Conseil constitutionnel et le saisir.</li>
      </ul>
      <p>Il est aussi le <b>chef des armées</b>, préside le Conseil des ministres, promulgue les lois et négocie les traités. Si la présidence devient vacante, le président du Sénat assure l'intérim jusqu'à une nouvelle élection.</p>
    </section>
    <section>
      <h3>Le Premier ministre et le gouvernement</h3>
      <p>Le président nomme le Premier ministre, puis les ministres sur sa proposition. Le gouvernement « détermine et conduit la politique de la nation » et répond de ses actes devant l'<b>Assemblée nationale</b>. Le président choisit donc en pratique une personne que l'Assemblée ne renversera pas.</p>
      <ul>
        <li><b>Motion de censure</b> : déposée par au moins un dixième des députés, elle renverse le gouvernement si elle est votée par la <b>majorité absolue des membres de l'Assemblée, soit ${MAJ} députés</b>. Seuls les votes pour comptent : s'abstenir revient à soutenir le gouvernement. Avant décembre 2024, une seule motion de censure avait abouti, en 1962.</li>
        <li><b>Article 49.3</b> : le Premier ministre peut faire adopter un texte sans vote, en engageant la responsabilité du gouvernement. Le texte est adopté, sauf si une motion de censure est votée. Depuis 2008, cette arme est limitée aux budgets de l'État et de la Sécurité sociale, plus un autre texte par session.</li>
        <li><b>Cohabitation</b> : quand l'Assemblée a une majorité opposée au président, celui-ci doit nommer un Premier ministre issu de cette majorité, qui gouverne alors à sa place pour l'essentiel. C'est arrivé trois fois : 1986-1988, 1993-1995 et 1997-2002.</li>
        <li>Un ministre ne peut pas être député ou sénateur en même temps : son suppléant prend son siège.</li>
      </ul>
    </section>
    <section>
      <h3>Le Parlement : deux chambres</h3>
      <ul>
        <li><b>L'Assemblée nationale</b> : ${N} députés élus directement pour 5 ans, un par circonscription. Elle seule peut renverser le gouvernement, et elle a le <b>dernier mot</b> sur les lois si les deux chambres ne s'entendent pas, à la demande du gouvernement.</li>
        <li><b>Le Sénat</b> : 348 sénateurs élus au <b>suffrage indirect</b> pour 6 ans, par des élus locaux, et renouvelé par moitié tous les 3 ans. Il représente les collectivités territoriales. Il examine toutes les lois, mais ne peut pas renverser le gouvernement ; il ne peut pas non plus être dissous. Une révision de la Constitution exige l'accord des deux chambres.</li>
        <li>Un projet de loi fait la <b>navette</b> entre les deux chambres jusqu'à ce qu'elles adoptent le même texte ; en cas de désaccord, une commission mixte paritaire (7 députés et 7 sénateurs) cherche un compromis.</li>
      </ul>
    </section>
    <section>
      <h3>L'Assemblée aujourd'hui : aucune majorité</h3>
      <p>Depuis les élections anticipées de 2024, l'Assemblée est divisée en <b>${nGr} groupes</b> parlementaires (au moins 15 députés chacun), plus des non-inscrits. Aucun groupe, ni aucune grande famille politique, n'approche les ${MAJ} sièges de la majorité absolue : le plus grand groupe, ${esc(gros.nom)} (${esc(gros.id)}), a ${gros.n} députés, et la plus grande famille, ${esc(famMax.nom)}, ${famMax.n}. Chaque gouvernement doit donc chercher des appuis ou, au moins, éviter qu'une majorité de députés vote contre lui.</p>
      ${tabAssemblee}
    </section>
    <section>
      <h3>Le Conseil constitutionnel</h3>
      <p>Ses neuf membres sont nommés pour 9 ans : trois par le président de la République, trois par le président de l'Assemblée nationale et trois par le président du Sénat. Quand il est saisi, il vérifie, avant leur promulgation, que les lois respectent la Constitution, et depuis 2010, tout justiciable peut contester une loi déjà en vigueur devant lui (question prioritaire de constitutionnalité). Il veille aussi à la régularité des élections présidentielles et législatives, et proclame le résultat de la présidentielle.</p>
    </section>
    <section>
      <h3>Un État unitaire décentralisé</h3>
      <p>Contrairement au Canada ou aux États-Unis, la France n'est pas une fédération : il n'y a qu'un Parlement, et les lois sont les mêmes partout. Depuis les lois de décentralisation de 1982, des <b>collectivités territoriales</b> élues gèrent toutefois de nombreux services : les <b>régions</b> (${nRegMetro} en métropole, plus celles d'outre-mer) s'occupent des transports régionaux, des lycées et du développement économique ; les <b>départements</b>, de l'aide sociale, des collèges et des routes ; les <b>communes</b>, près de 35 000, des écoles, de l'urbanisme et de l'état civil. Elles n'ont pas de pouvoir législatif, sauf quelques collectivités d'outre-mer dotées d'une large autonomie, comme la Nouvelle-Calédonie.</p>
    </section>`;
  const electoral = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>${N}</b><small>circonscriptions, un député chacune</small></div>
      <div><b>2 tours</b><small>aux législatives comme à la présidentielle</small></div>
      <div><b>5 ans</b><small>mandat des députés, sauf dissolution (comme en 2024)</small></div>
      <div><b>${nf(part, 1)} %</b><small>de participation au 1er tour des législatives de 2024</small></div>
    </section>
    <section>
      <h3>Les législatives : majoritaire à deux tours</h3>
      <p>Les ${N} députés sont élus au <b>scrutin uninominal majoritaire à deux tours</b> : ${N - nOM - nEtr} circonscriptions en métropole, ${nOM} en outre-mer et ${nEtr} pour les Français de l'étranger. Dans chacune, on vote pour un candidat (accompagné d'un suppléant), pas pour une liste.</p>
      <ul>
        <li><b>1er tour</b> : un candidat est élu tout de suite s'il obtient <b>plus de 50 % des voix</b> et au moins <b>25 % des inscrits</b>. C'est rare : en 2024, seuls ${auPremier} députés sur ${N} ont été élus dès le 1er tour.</li>
        <li><b>2e tour</b>, une semaine plus tard : peuvent rester les candidats qui ont obtenu au moins <b>12,5 % des inscrits</b> (si un seul ou aucun n'y arrive, les deux premiers). Celui qui a le plus de voix l'emporte, même sans majorité.</li>
        <li>Quand trois candidats ou plus se qualifient, on parle de <b>triangulaire</b> (ou de quadrangulaire). Un candidat peut se <b>désister</b> pour ne pas diviser son camp et favoriser un candidat proche, ou faire barrage à un adversaire.</li>
      </ul>
      <p>Le seuil de 12,5 % se calcule sur les <b>inscrits</b>, pas sur les votants : plus la participation est forte, plus il est facile de l'atteindre, et plus les triangulaires sont nombreuses.</p>
    </section>
    <section>
      <h3>Des voix aux sièges</h3>
      <p>Les sièges ne sont pas répartis selon les voix obtenues à l'échelle du pays : seul compte le nombre de circonscriptions gagnées, souvent au 2e tour, grâce aux reports de voix et aux désistements.</p>
      ${graphique}
      <p>${phraseVs} Entre les deux tours de 2024, de nombreux candidats de gauche et du centre arrivés troisièmes se sont désistés pour faire barrage au RN. Ce sont ces sièges qui décident ensuite qui peut gouverner (voir la partie <a href="#" data-aller="politique">Système politique</a>).</p>
    </section>
    <section>
      <h3>Quand vote-t-on ?</h3>
      <p>Les députés sont élus pour <b>5 ans</b>. Depuis 2002, les législatives suivaient la présidentielle de quelques semaines, ce qui donnait en général une majorité au président élu. Mais le président peut <b>dissoudre</b> l'Assemblée : le 9 juin 2024, au soir des élections européennes, il l'a fait, et des législatives anticipées ont eu lieu les 30 juin et 7 juillet. Une nouvelle dissolution est impossible dans l'année qui suit ; depuis l'été 2025, elle est de nouveau possible. Sans dissolution, les prochaines législatives auront lieu au plus tard en 2029. Quand un siège se libère et que le suppléant ne peut pas le prendre, une <b>élection partielle</b> a lieu dans la circonscription.</p>
    </section>
    <section>
      <h3>La présidentielle</h3>
      <p>Le président est élu au <b>suffrage universel direct</b>, lui aussi en <b>deux tours</b>. Un candidat qui obtient plus de 50 % des voix au 1er tour est élu ; sinon, deux semaines plus tard, seuls les <b>deux premiers</b> s'affrontent au 2e tour. Aucun président de la Cinquième République n'a été élu dès le 1er tour.</p>
      <ul>
        <li><b>Pour être candidat</b>, il faut recueillir au moins <b>500 parrainages</b> d'élus (maires, parlementaires, conseillers départementaux et régionaux…), venant d'au moins 30 départements ou collectivités d'outre-mer, sans plus d'un dixième dans un même département. Les noms des parrains sont publiés.</li>
        <li>En 2022, ${p22.length} candidats se sont présentés ; au 1er tour, ${esc(p22[0][0])} (${nf(p22[0][1], 1)} %) et ${esc(p22[1][0])} (${nf(p22[1][1], 1)} %) se sont qualifiés pour le 2e tour.</li>
        <li>La prochaine présidentielle aura lieu en <b>avril 2027</b>. Emmanuel Macron, élu en 2017 et réélu en 2022, ne peut pas se représenter.${haut && haut < 50 ? ` Dans la moyenne des ${pr.n} sondages les plus récents, le candidat en tête recueille ${nf(haut, 1)} % au 1er tour : un 2e tour est presque certain.` : ""}</li>
      </ul>
    </section>
    <section>
      <h3>Le Sénat et les autres élections</h3>
      <p>Les sénateurs sont élus au <b>suffrage indirect</b>, dans chaque département, par des « grands électeurs » : députés, sénateurs, conseillers régionaux et départementaux, et surtout des délégués des conseils municipaux. Les départements qui élisent trois sénateurs ou plus votent à la proportionnelle, les autres au scrutin majoritaire à deux tours. Les Français votent aussi aux <b>municipales</b>, aux <b>départementales</b> et aux <b>régionales</b> (tous les 6 ans), et aux <b>européennes</b> (tous les 5 ans, à la proportionnelle).</p>
    </section>
    <section>
      <h3>Qui vote, et comment</h3>
      <p>Pour voter, il faut avoir la <b>nationalité française</b>, avoir <b>18 ans</b>, jouir de ses droits civiques et être <b>inscrit sur les listes électorales</b> ; l'inscription est automatique à 18 ans pour les jeunes recensés. Les citoyens des autres pays de l'Union européenne qui habitent en France peuvent voter aux municipales et aux européennes, mais pas aux législatives ni à la présidentielle. On vote en général le dimanche, en personne, au bureau de vote de sa commune ; un électeur absent peut donner une <b>procuration</b> à un autre électeur, qui vote à sa place. Le vote par correspondance n'existe pas, sauf pour les Français de l'étranger aux législatives.</p>
    </section>
    <section>
      <h3>Outre-mer et Français de l'étranger</h3>
      <p>Les départements, régions et collectivités d'outre-mer élisent <b>${nOM} députés</b>, de la Guadeloupe à la Polynésie française. Depuis 2012, les Français établis hors de France ont aussi leurs <b>${nEtr} députés</b>, chacun pour une grande zone du monde (l'Amérique du Nord forme une circonscription, par exemple) ; ils peuvent voter à l'ambassade ou au consulat, et aux législatives, aussi par internet. Le Sénat compte également 12 sénateurs des Français de l'étranger.</p>
    </section>`;
  // versions courtes : l'essentiel en quelques points, mêmes chiffres clés et même graphique des voix et des sièges
  const tuilesPol = politique.slice(0, politique.indexOf("</section>") + 10), tuilesElec = electoral.slice(0, electoral.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const politiqueCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `La France est une <b>république semi-présidentielle</b> (la Cinquième République, depuis 1958) : le pouvoir exécutif est partagé entre le président de la République et le Premier ministre.`)}
      ${point(2, `Le <b>président</b> est élu directement pour 5 ans, deux mandats de suite au plus. Il nomme le Premier ministre, peut dissoudre l'Assemblée et est le chef des armées.`)}
      ${point(3, `Le <b>gouvernement</b> doit survivre aux votes de l'Assemblée nationale : une motion de censure votée par <b>${MAJ} députés</b> le renverse.`)}
      ${point(4, `Le Parlement a <b>deux chambres</b> : ${N} députés élus directement, qui ont le dernier mot, et 348 sénateurs élus par des élus locaux. Aujourd'hui, aucun groupe n'a la majorité : le plus grand, ${esc(gros.id)}, a ${gros.n} sièges.`)}
      ${point(5, `La France est un <b>État unitaire</b> : un seul Parlement fait les lois pour tout le pays ; régions, départements et communes gèrent des services locaux.`)}
    </ol>`;
  const electoralCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Deux tours</b> dans chacune des ${N} circonscriptions : on est élu au 1er tour avec plus de 50 % des voix (et 25 % des inscrits) ; sinon, les candidats qui ont au moins 12,5 % des inscrits passent au 2e tour, et le premier l'emporte. En 2024, ${auPremier} députés seulement ont été élus dès le 1er tour.`)}
      ${point(2, `<b>Les sièges ne suivent pas les voix</b> : seul compte le nombre de circonscriptions gagnées, et les désistements entre les deux tours pèsent lourd.`)}
    </ol>
    ${graphique}
    <ol class="vi-dlg-court" start="3">
      ${point(3, `<b>Tous les 5 ans</b>, sauf dissolution : le président a dissous l'Assemblée en juin 2024 ; les prochaines législatives auront lieu au plus tard en 2029.`)}
      ${point(4, `<b>La présidentielle</b> se joue aussi en deux tours, à deux semaines d'écart ; il faut 500 parrainages d'élus pour être candidat. Prochaine élection : avril 2027.`)}
      ${point(5, `<b>Pour voter</b> : être Français, avoir 18 ans et être inscrit sur les listes électorales ; procuration possible. L'outre-mer élit ${nOM} députés et les Français de l'étranger, ${nEtr}.`)}
    </ol>`;
  preparerSysteme({ sur: "France · Cinquième République", titre: "Le système politique et électoral de la France",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : le président, le gouvernement, le Parlement et le partage des pouvoirs.", html: politique, court: politiqueCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on choisit les élus : les législatives à deux tours, des voix aux sièges, la présidentielle et les électeurs.", html: electoral, court: electoralCourt }] });
}

/* ---------- démarrage ---------- */
/* ---------- section « Les partis » (votes-quebec/partis.js) : liste cliquable, fiche de chaque parti ---------- */
function partisEnLice() {
  const A = DATA.assemblee;
  sectionPartis(PARTIS.france, A.groupes.slice().sort((a, b) => b.n - a.n).map(g => ({ cle: g.id, etiquette: g.id, couleur: g.c,
    detail: `Assemblée nationale aujourd'hui : <b>${g.n} député${g.n > 1 ? "s" : ""}</b> sur 577` })),
    { titre: "Groupes de l'Assemblée", note: "Les députés siègent par groupe : un groupe réunit un parti et ses alliés.", axe: true });
}

async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    let ASS;
    [DATA, SOND, PRES, ASS, P22] = await Promise.all([lireJ("votes-france/data.json"), lireJ("votes-france/sondages.json"), lireJ("votes-france/sondages-pres.json"),
      lireJ("votes-france/assemblee.json"), lireJ("votes-france/pres2022.json"), lireVerif("france")]);
    BLOCS = DATA.blocs; DATA.circ.forEach(c => { PAR_ID[c.id] = c; c.act = ASS.act[c.id] || null; });
    DATA.assemblee = ASS;
    // couleurs officielles des groupes ; les trop foncées sont éclaircies pour rester lisibles sur fond sombre
    DATA.assemblee.groupes.forEach(g => { g.c = FAMILLE[g.id] || g.c; GP[g.id] = g; });   // même palette que les partis
    ajouterChoixType(); dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral(); partisEnLice();
    await equilibrerHaut(dessinerEvolution);   // colonnes du haut équilibrées avant d'afficher la page (rien ne bouge ensuite)
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return; periode = +b.dataset.per; ecrireLS("vfPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");   // affiche la page (données prêtes, ou message d'erreur)
}
demarrer();
