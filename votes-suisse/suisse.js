/* Votes Suisse — élections fédérales (Conseil national et Conseil des États), même gabarit que « Votes Canada ».
   Choix en haut de la page : Conseil national · Conseil des États (comme Chambre · Sénat sur Votes États-Unis).
   Projection du Conseil national (projection.json, outils/suisse.py) : simulation faite par le site à partir de la
   moyenne des sondages, appliquée aux listes de 2023 de chaque canton, sièges répartis comme le veut la loi
   (Hagenbach-Bischoff, apparentements). Conseils actuels : Services du Parlement (actuel.json). Élection du
   22 octobre 2023 : OFS (resultats-2023.json, outils/suisse_fixe.py). Évolution : sondages compilés par Wikipédia
   (sondages.json). Contours des 26 cantons : data.json (limites généralisées de l'OFS, état 2026). */
import { domaineY, decouper, placerBulle } from "../votes-quebec/zoom-y.js";
import { preparerSysteme } from "../votes-quebec/systeme.js";
import { sectionPartis, PARTIS, bordDe, trierAxe } from "../votes-quebec/partis.js";
import { equilibrerHaut } from "../votes-quebec/equilibre.js";
import { preparerPleinEcran, infoPlein } from "../votes-quebec/plein.js";
import { regrouper } from "../votes-quebec/hemicycle.js";

const CN = 200, MAJ_CN = 101, CE = 46, MAJ_CE = 24;
const P = ["UDC", "PS", "C", "PLR", "VERT", "PVL"];                                   // partis des sondages (graphique)
const PUCES = ["UDC", "PS", "C", "PLR", "VERT", "PVL", "PEV", "UDF", "MCG", "LEGA"];  // mode Vote de la carte
const HORS_DICO = { AL: "gr", PCS: "g", DS: "dr", LEGA: "dr" };   // partis absents du dictionnaire de la bande
const ORDRE = ["PST", "AL", "PS", "VERT", "PVL", "PEV", "PCS", "C", "PLR", "LEGA", "MCG", "UDC", "UDF", "DS", "IND", "AUT"];   // hémicycle, de gauche à droite
const NOMS = { UDC: "Union démocratique du centre", PS: "Parti socialiste", C: "Le Centre", PLR: "PLR.Les Libéraux-Radicaux", VERT: "Les Vert-e-s",
  PVL: "Vert'libéraux", PEV: "Parti évangélique", UDF: "Union démocratique fédérale", MCG: "Mouvement citoyens genevois", LEGA: "Lega dei Ticinesi",
  PST: "Parti suisse du Travail et solidaritéS", AL: "Alternative (AL)", PCS: "Parti chrétien-social", DS: "Démocrates suisses", IND: "Sans parti", AUT: "Autres" };
const COURT = { UDC: "UDC", PS: "PS", C: "Centre", PLR: "PLR", VERT: "Verts", PVL: "PVL", PEV: "PEV", UDF: "UDF", MCG: "MCG", LEGA: "Lega",
  PST: "PST-Sol", AL: "AL", PCS: "PCS", DS: "DS", IND: "Sans parti", AUT: "Autres" };
const COUL = { UDC: "#2F8F3A", PS: "#E0303E", C: "#F08C1A", PLR: "#2B63C6", VERT: "#7DB823", PVL: "#ABB51F", PEV: "#DDA90F", UDF: "#9A5B3C",
  MCG: "#B88A12", LEGA: "#6F8FCB", PST: "#A3142B", AL: "#B0436B", PCS: "#2AA198", DS: "#7A6A55", IND: "#8D949A", AUT: "#8D949A" };
const DATE_ELECTION = "2023-10-22", PROCHAINE = "2027-10-24";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");
const nomP = p => COURT[p] || p;
const ART = { UDC: "l'UDC", PS: "le PS", C: "Le Centre", PLR: "le PLR", VERT: "les Vert-e-s", PVL: "les Vert'libéraux" };
const sg = (n, mot = "siège") => `${n} ${mot}${n > 1 ? "s" : ""}`;
const ecart = (v, d = 0, u = "") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${nf(Math.abs(v), d)}${u}`;

// barre du haut : date des données et dernière vérification (votes-verif.json, écrit chaque jour par le pipeline aux 3 heures)
let VERIF = null;
const lireVerif = cle => fetch("votes-verif.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(v => { VERIF = v[cle] || null; }).catch(() => {});
function majBarre(nom, donnees) {
  const t = document.querySelector(".t-votes"); if (!t) return;
  t.innerHTML = `${esc(nom)} · ${donnees}${VERIF ? ` · vérifiées le ${esc(VERIF.texte)}` : ""}`;
}
// années des résultats passés en pastille (comme Votes France)
const AN = a => String(a);   // années en texte normal (comme France, Canada et États-Unis)
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };

// type de page : Conseil national (« cn ») ou Conseil des États (« ce »), choix en haut de la page
const HASH = { cn: "#conseil-national", ce: "#conseil-des-etats" };
let TYPE = Object.keys(HASH).find(k => HASH[k] === location.hash) || lireLS("vsType", "cn");
if (!HASH[TYPE]) TYPE = "cn";
let DATA, R23, SOND, PROJ = null, ACT = null, CANT = {}, sel = null, demarre = false;
const MODES = {                                   // groupes de boutons de la carte : futur · présent · passé
  cn: [["proj", "Projection du site", [["lead", "Premier parti"], ["second", "Deuxième"], ["vote", "Vote"]]],
       ["act", "Conseil actuel", [["act", "Élus"]]],
       ["e23", `Élection ${AN(2023)}`, [["e23", "Premier parti"], ["e23vote", "Vote"]]]],
  ce: [["act", "Conseil actuel", [["ceact", "Élus"]]],
       ["e23", `Élection ${AN(2023)}`, [["ce23", "Élus"]]]] };
const GROUPE_DE = { lead: "proj", second: "proj", vote: "proj", act: "act", e23: "e23", e23vote: "e23", ceact: "act", ce23: "e23" };
const modesDispo = () => MODES[TYPE].filter(([g]) => g !== "proj" || PROJ).filter(([g]) => g !== "act" || ACT);
const MODE0 = () => modesDispo()[0][2][0][0];
const etat = { mode: "lead", parti: null, pct: lireLS("viPct", true), chambre: "proj" };
const groupe = () => GROUPE_DE[etat.mode];
const voteMode = () => etat.mode === "vote" || etat.mode === "e23vote";

/* ---------- données par canton ---------- */
const compte = liste => (liste || []).reduce((o, x) => { o[x.p] = (o[x.p] || 0) + 1; return o; }, {});
const somme = o => Object.values(o).reduce((a, b) => a + b, 0);
function preparer() {
  for (const c of DATA.cantons) CANT[c.ab] = c;
}
// sièges d'un canton (Conseil national) selon le groupe affiché
const siegesCanton = (ab, g = groupe()) => g === "proj" ? PROJ.cantons[ab].s : g === "act" ? compte(ACT.cn[ab]) : R23.cantons[ab].s;
const partsCanton = (ab, g = groupe()) => g === "proj" ? PROJ.cantons[ab].p : g === "e23" ? R23.cantons[ab].p : null;
const delegation = (ab, g = groupe()) => g === "act" ? (ACT.ce[ab] || []) : (R23.ce[ab] || []);
const trie = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
// sièges par parti dans la chambre affichée (hémicycle)
function siegesDe(type, g) {
  if (type === "ce") return g === "act" ? compte(Object.values(ACT.ce).flat()) : compte(Object.values(R23.ce).flat());
  if (g === "proj") return Object.fromEntries(Object.entries(PROJ.national).filter(([, x]) => x.s > 0).map(([p, x]) => [p, x.s]));
  if (g === "act") return compte(Object.values(ACT.cn).flat());
  return Object.fromEntries(Object.entries(R23.national).filter(([, x]) => x.s > 0).map(([p, x]) => [p, x.s]));
}
const premier = s => trie(s)[0];

/* ---------- hémicycle (comme Votes France) : rangées en demi-cercle, de la gauche à la droite ---------- */
function hemicycle(svgEl, seats, n, sous) {
  // Conseil national : 8 rangées ; Conseil des États (46) : 4 rangées plus ouvertes, pour que la ligne du centre ne touche
  // pas les sièges ; points et marges calculés pour que rien ne soit coupé en haut, en bas ni sur les côtés
  const R = n > 100 ? 8 : 4, r0 = n > 100 ? 0.4 : 0.5, W = 1000, cx = W / 2, Rmax = 470;
  const rayons = d3.range(R).map(i => r0 + i * (1 - r0) / (R - 1)), tot = d3.sum(rayons);
  const parRangee = rayons.map(r => Math.round(n * r / tot)); parRangee[R - 1] += n - d3.sum(parRangee);
  const pas = Rmax * (1 - r0) / (R - 1), rayon = Math.min(pas * (n > 100 ? 0.42 : 0.38), 0.8 * Math.PI * r0 * Rmax / parRangee[0]);
  const cy = Rmax + rayon + 4, H = Math.ceil(cy + rayon + 4);
  let places = [];
  rayons.forEach((r, i) => { const k = parRangee[i];
    for (let j = 0; j < k; j++) { const a = Math.PI - j * Math.PI / (k - 1); places.push({ a, r, x: cx + Math.cos(a) * r * Rmax, y: cy - Math.sin(a) * r * Rmax }); } });
  // de gauche à droite, même classement que la bande des partis (votes-quebec/partis.js) ; clés hors dictionnaire placées ici
  const ordre = trierAxe(PARTIS.suisse, Object.keys(seats).sort((a, b) => (ORDRE.indexOf(a) + 1 || 99) - (ORDRE.indexOf(b) + 1 || 99)), HORS_DICO);
  const sieges = ordre.flatMap(p => d3.range(seats[p]).map(() => p));
  places = regrouper(places, ordre.map(p => seats[p]));   // chaque parti groupé (votes-quebec/hemicycle.js)
  const marge = Math.max(0, rayon + 4 - (cx - Rmax));     // points des bouts de rangée entiers à gauche et à droite
  const g = d3.select(svgEl).attr("viewBox", `${-marge} 0 ${W + 2 * marge} ${H}`); g.selectAll("*").remove();
  g.selectAll("circle").data(places).join("circle").attr("cx", p => p.x).attr("cy", p => p.y).attr("r", rayon)
    .attr("data-p", (p, i) => sieges[i] || null)   // parti du siège (bande des partis)
    .style("fill", (p, i) => sieges[i] ? COUL[sieges[i]] || COUL.AUT : "var(--soft)")
    .append("title").text((p, i) => sieges[i] ? `${NOMS[sieges[i]] || sieges[i]} (${seats[sieges[i]]})` : "");
  g.append("text").attr("x", cx).attr("y", cy - 50).attr("text-anchor", "middle").attr("class", "vf-hemi-n").text(n);
  g.append("text").attr("x", cx).attr("y", cy - 18).attr("text-anchor", "middle").attr("class", "vf-hemi-maj").text(sous);
}

/* ---------- en-tête, choix du conseil, hémicycle ---------- */
function ajouterChoixType() {
  const tete = document.querySelector(".vue-votes .lv-head"); if (!tete || $("vfType")) return;
  const g = document.createElement("div");
  g.className = "lv-groupe vf-type"; g.id = "vfType"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "Conseil affiché");
  g.innerHTML = `<button type="button" data-t="cn">Conseil national</button><button type="button" data-t="ce">Conseil des États</button>`;
  tete.appendChild(g);
  g.addEventListener("click", e => { const b = e.target.closest("button[data-t]"); if (!b || b.dataset.t === TYPE) return; changerType(b.dataset.t); });
}
function changerType(t) {
  TYPE = t; ecrireLS("vsType", t);
  history.replaceState(null, "", location.pathname + location.search + HASH[t]);
  etat.mode = MODE0(); etat.parti = null; etat.chambre = groupe(); sel = null;
  svg.transition().duration(0).call(ZOOM.transform, d3.zoomIdentity);
  dessinerTete(); outilsCarte(); peindre(); dessinerPanneau();
}
const dernierSondage = () => SOND.sondages.filter(s => !s.e).slice(-1)[0];
function dessinerTete() {
  document.querySelectorAll("#vfType button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === TYPE));
  const ds = dernierSondage();
  if (TYPE === "cn") majBarre("Votes Suisse · Conseil national", `${ds ? `dernier sondage le ${dateFr(ds.d)}` : "aucun sondage"}${PROJ ? " · projection du site" : ""}`);
  else majBarre("Votes Suisse · Conseil des États", ACT ? "élus selon les Services du Parlement" : `élus de ${AN(2023)}`);
  document.querySelector(".vue-votes .vi-badge").textContent = TYPE === "cn" ? "Suisse · Conseil national" : "Suisse · Conseil des États";
  $("viPlan").setAttribute("aria-label", TYPE === "cn" ? "Hémicycle du Conseil national (200 sièges)" : "Hémicycle du Conseil des États (46 sièges)");
  $("viTitre").textContent = TYPE === "cn" ? "Conseil national : intentions de vote et projection" : "Conseil des États : élus par canton";
  $("viSource").innerHTML = TYPE === "cn"
    ? `Sources : sondages compilés par Wikipédia (${[...new Set(SOND.sondages.filter(s => !s.e).map(s => s.f))].map(esc).join(", ")}) · résultats de ${AN(2023)} : Office fédéral de la statistique · élus actuels : Services du Parlement${PROJ ? " · projection : simulation du site" : ""}`
    : `Sources : Services du Parlement (élus actuels et élus de ${AN(2023)}) · contours des cantons : Office fédéral de la statistique`;
  $("viNote").textContent = ""; $("viNote").hidden = true;
  // encadré d'explication retiré de la page : le bouton « Comprendre le système politique et électoral » s'en charge
  // (élément gardé hors de la page pour ne pas toucher au reste du code)
  const ex = document.createElement("div");
  ex.innerHTML = TYPE === "cn"
    ? `<p>Les 200 membres du Conseil national sont élus pour quatre ans à la proportionnelle, canton par canton : chaque canton forme une circonscription et reçoit des sièges selon sa population. Dans les six cantons qui n'ont qu'un siège, le candidat qui a le plus de voix est élu. Il n'y a pas de gouvernement issu d'une majorité : les sept membres du Conseil fédéral sont élus par les deux chambres réunies. Prochaine élection : le ${dateFr(PROCHAINE).replace(/\d{4}$/, "")}${AN(2027)}.</p>`
    : `<p>Le Conseil des États compte 46 membres : deux par canton et un pour chacun des six anciens demi-cantons (Obwald, Nidwald, Bâle-Ville, Bâle-Campagne, Appenzell Rhodes-Extérieures et Appenzell Rhodes-Intérieures). Chaque canton fixe son mode d'élection : majoritaire presque partout, souvent en deux tours, et proportionnel au Jura et à Neuchâtel. Ce sont des élections de personnes plus que de partis : le site n'en fait pas de projection.</p>`;
  let choix = $("vcChambre");
  if (!choix) {
    choix = document.createElement("div"); choix.id = "vcChambre"; choix.className = "lv-groupe vi-periodes vc-choix"; choix.setAttribute("role", "group"); choix.setAttribute("aria-label", "Composition affichée");
    choix.innerHTML = `<button type="button" data-ch="proj">Projection</button><button type="button" data-ch="act">Conseil actuel</button><button type="button" data-ch="e23">Élection ${AN(2023)}</button>`;
    $("viSiegesTitre").after(choix);
    choix.addEventListener("click", e => { const b = e.target.closest("button[data-ch]"); if (!b) return; etat.chambre = b.dataset.ch; dessinerChambre(); });
  }
  dessinerChambre();
}
function dessinerChambre() {
  const dispo = modesDispo().map(([g]) => g);
  if (!dispo.includes(etat.chambre)) etat.chambre = dispo[0];
  document.querySelectorAll("#vcChambre button").forEach(b => { b.hidden = !dispo.includes(b.dataset.ch); b.setAttribute("aria-pressed", b.dataset.ch === etat.chambre); });
  const n = TYPE === "cn" ? CN : CE, maj = TYPE === "cn" ? MAJ_CN : MAJ_CE, s = siegesDe(TYPE, etat.chambre), [lead, nl] = premier(s);
  const nomC = TYPE === "cn" ? "Conseil national" : "Conseil des États";
  const eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  eb.innerHTML = etat.chambre === "proj" ? `${nomC} · projection du site` : etat.chambre === "act" ? `${nomC} · composition actuelle`
    : `${nomC} · élection du 22 octobre ${AN(2023)}`;
  const udcPlr = (s.UDC || 0) + (s.PLR || 0);
  $("viSiegesTitre").textContent = `${nomP(lead)} en tête : ${sg(nl)} sur ${n}` + (TYPE === "cn" ? ` · UDC + PLR : ${udcPlr}${udcPlr >= maj ? " (majorité)" : ""}` : "");
  hemicycle($("viPlan"), s, n, TYPE === "cn" ? `conseillers nationaux · majorité ${maj}` : `conseillers aux États · majorité ${maj}`);
  const N = etat.chambre === "proj" ? PROJ.national : null;
  $("viLegende").innerHTML = Object.keys(s).sort((a, b) => s[b] - s[a] || ORDRE.indexOf(a) - ORDRE.indexOf(b))
    .map(p => `<span style="--c:${COUL[p] || COUL.AUT}"><i></i>${nomP(p)} <b>${s[p]}</b>${N && N[p] ? ` <small>[${N[p].smin}–${N[p].smax}]</small>` : ""}</span>`).join("");
}

/* ---------- carte ---------- */
const MW = 900, MH = 580;
let svg, gZ, gK, gLac, gSel, gLbl, defs, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const partDe = (ab, p, g) => (partsCanton(ab, g) || {})[p] || 0;
// délégation au Conseil des États : couleur du parti, ou deux couleurs (dégradé coupé en diagonale) si elle est partagée
function remplirCE(ab) {
  const d = delegation(ab), ps = [...new Set(d.map(x => x.p))].sort((a, b) => ORDRE.indexOf(a) - ORDRE.indexOf(b));
  if (!ps.length) return ["var(--soft)", 1];
  if (ps.length === 1) return [COUL[ps[0]] || COUL.AUT, d.length === 2 ? 0.95 : 0.8];
  const id = `vsg-${ps[0]}-${ps[1]}`;
  if (defs.select("#" + id).empty()) {
    const lg = defs.append("linearGradient").attr("id", id).attr("x1", 0).attr("y1", 0).attr("x2", 1).attr("y2", 1);
    [[0, ps[0]], [0.5, ps[0]], [0.5, ps[1]], [1, ps[1]]].forEach(([o, p]) => lg.append("stop").attr("offset", o).attr("stop-color", COUL[p] || COUL.AUT));
  }
  return [`url(#${id})`, 0.9];
}
function remplir(ab) {
  if (TYPE === "ce") return remplirCE(ab);
  if (etat.mode === "act") { const s = compte(ACT.cn[ab]), [p, n] = premier(s), tot = somme(s);
    return [COUL[p] || COUL.AUT, tot === 1 ? 0.8 : Math.max(0.5, Math.min(1, 0.3 + 1.2 * n / tot))]; }
  const o = trie(partsCanton(ab) || {});
  if (!o.length) return ["var(--soft)", 1];
  if (etat.mode === "second") { const [p, v] = o[1] || o[0]; return [COUL[p] || COUL.AUT, Math.max(0.45, Math.min(1, (v - 5) / 22))]; }
  if (voteMode()) return [COUL[etat.parti], Math.max(0.06, Math.min(1, partDe(ab, etat.parti) / 45))];
  return [COUL[o[0][0]] || COUL.AUT, Math.max(0.5, Math.min(1, (o[0][1] - 10) / 35))];
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
  const k = f.properties.K;
  if (ANCRE[k]) return ANCRE[k];
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = [0, 0, -1];
  for (const poly of polys) { const c = polylabel(poly.map(r => r.map(xy => PROJ_FN(xy)))); if (c[2] > best[2]) best = c; }
  return ANCRE[k] = best;
}
function placerEtiquettes() {
  const el = svg.node(), base = Math.min(el.clientWidth / MW, el.clientHeight / MH) || 1, px = base * curK, fs = 10.5 / px;   // police de 10,5 px à l'écran
  gLbl.selectAll("g.vi-lab").each(function (f) {
    const [x, y, rad] = ancre(f), room = rad * px, val = voteMode() && etat.pct;
    const g = d3.select(this).style("display", room >= (val ? 13 : 8) ? null : "none");
    g.select("text.vi-val").style("display", val ? null : "none");
    g.select("text.vi-nom").attr("dy", val ? "-0.45em" : "0.35em");
    g.selectAll("text").attr("transform", `translate(${x},${y})`).style("font-size", fs + "px").style("stroke-width", (3 / px) + "px");
  });
}
function zoomVers(f, pad = 0.85) {
  const [[x0, y0], [x1, y1]] = PATH.bounds(f);
  const k = Math.min(30, pad / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
  svg.transition().duration(reduit ? 0 : 700).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}
function construireCarte() {
  for (const g of [DATA.geo, DATA.lacs]) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  // Mercator centré sur la Suisse (proche de la projection oblique de swisstopo à cette échelle)
  PROJ_FN = d3.geoMercator().rotate([-8.23, -46.8]).fitExtent([[10, 10], [MW - 10, MH - 10]], DATA.geo);
  PATH = d3.geoPath(PROJ_FN);
  const boite = (a, b) => ({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [a, b] } });
  Object.assign(PRESETS, { leman: boite([5.95, 46.12], [7.2, 46.95]), be: boite([6.85, 46.35], [8.45, 47.33]), zh: boite([8.35, 47.15], [8.99, 47.7]),
    bale: boite([7.3, 47.3], [8.05, 47.62]), centre: boite([7.95, 46.65], [9.05, 47.25]), ti: boite([8.38, 45.81], [9.2, 46.64]) });
  svg = d3.select("#viCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  defs = svg.append("defs");
  gZ = svg.append("g");
  gK = gZ.append("g"); gLac = gZ.append("g"); gSel = gZ.append("g"); gLbl = gZ.append("g");
  gK.selectAll("path").data(DATA.geo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => CANT[f.properties.K].nom)
    .on("click", (e, f) => choisir(f.properties.K))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.K); } })
    .on("mousemove", infobulle).on("mouseleave", () => { $("viTip").hidden = true; });
  gLac.selectAll("path").data(DATA.lacs.features).join("path").attr("class", "vs-lac").attr("d", PATH).append("title").text(f => f.properties.K);
  const labs = gLbl.selectAll("g.vi-lab").data(DATA.geo.features).join(enter => { const g = enter.append("g").attr("class", "vi-lab");
    g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle");
    g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.8em"); return g; });
  labs.select("text.vi-nom").text(f => f.properties.K);
  ZOOM = d3.zoom().scaleExtent([1, 30]).translateExtent([[-40, -40], [MW + 40, MH + 40]])
    .on("zoom", e => { gZ.attr("transform", e.transform); curK = e.transform.k; curT = e.transform; placerEtiquettes(); });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.node().parentElement.addEventListener("wheel", e => e.preventDefault(), { passive: false });
  svg.on("click", e => { if (e.target === svg.node()) choisir(null); });
  new ResizeObserver(() => placerEtiquettes()).observe(svg.node());
  $("viZoom").addEventListener("click", e => {
    const z = e.target.closest("button")?.dataset.z; if (!z) return;
    if (z === "tout") { sel = null; svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); peindre(); dessinerPanneau(); }
    else if (z === "plus") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1.8);
    else if (z === "moins") svg.transition().duration(reduit ? 0 : 250).call(ZOOM.scaleBy, 1 / 1.8);
    else if (PRESETS[z]) zoomVers(PRESETS[z], 0.95);
  });
  preparerPleinEcran();   // plein écran de la carte et bouton « Info » (votes-quebec/plein.js)
  $("viPct").addEventListener("click", () => { etat.pct = !etat.pct; ecrireLS("viPct", etat.pct); peindre(); });
  $("viModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) changerMode(b.dataset.m); });
  $("viChips").innerHTML = PUCES.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}">${nomP(p)}</button>`).join("");
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b || TYPE !== "cn") return;
    etat.parti = b.dataset.p; if (!voteMode()) etat.mode = groupe() === "e23" ? "e23vote" : PROJ ? "vote" : "e23vote";
    if (etat.chambre !== groupe()) { etat.chambre = groupe(); dessinerChambre(); }
    peindre(); dessinerPanneau(); });
}
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  // ordre commun aux pages d'intentions : futur (projection) · présent (conseil actuel) · passé (élection)
  $("viModes").innerHTML = modesDispo().map(([, lab, ms]) => `<span class="vf-mode-grp"><span class="vf-mode-lab">${lab}</span><span class="lv-groupe">${ms.map(bouton).join("")}</span></span>`).join("");
  $("viChips").style.display = TYPE === "cn" ? "" : "none";
}
function changerMode(m) {
  etat.mode = m;
  if (voteMode() && !etat.parti) etat.parti = "UDC";
  if (etat.chambre !== groupe()) { etat.chambre = groupe(); dessinerChambre(); }
  peindre(); dessinerPanneau();
}
function peindre() {
  document.querySelectorAll("#viModes button[data-m]").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === etat.mode));
  document.querySelectorAll("#viChips button").forEach(b => b.setAttribute("aria-pressed", voteMode() && b.dataset.p === etat.parti));
  $("viChips").setAttribute("aria-disabled", !voteMode());
  gK.selectAll("path").each(function (f) { const [c, o] = remplir(f.properties.K); this.style.fill = c; this.style.fillOpacity = o; });
  const f = sel ? DATA.geo.features.find(x => x.properties.K === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
  $("viPct").hidden = !voteMode(); $("viPct").setAttribute("aria-pressed", etat.pct);
  gLbl.selectAll("text.vi-val").text(f => voteMode() ? nf(partDe(f.properties.K, etat.parti), 0) + " %" : "");
  placerEtiquettes();
  let an = $("vfAnCarte");
  if (!an) { an = document.createElement("div"); an.id = "vfAnCarte"; an.className = "vf-an-carte"; $("viCarte").before(an); }
  const nomC = TYPE === "cn" ? "Conseil national" : "Conseil des États", g = groupe();
  an.innerHTML = g === "act" ? `${nomC} actuel` : g === "e23" ? `${nomC} · élection ${AN(2023)}` : `Projection du site · ${dateFr(PROJ.maj)}`;
  const legende = ps => `<span class="vf-legende">${ps.map(k => `<span style="--c:${COUL[k] || COUL.AUT}"><i></i>${nomP(k)}</span>`).join("")}</span>`;
  const presents = arr => ORDRE.filter(p => arr.includes(p));
  if (TYPE === "ce") {
    const ps = presents(Object.values(g === "act" ? ACT.ce : R23.ce).flat().map(x => x.p));
    $("viEchelle").innerHTML = (g === "e23" ? `<b>2023</b> · ` : "") + `${legende(ps)}<span>· parti des élus du canton ; deux couleurs : délégation partagée entre deux partis (couleur plus claire : un seul siège)</span>`;
    return;
  }
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  const quoi = g === "e23" ? `résultat de ${AN(2023)}` : "projection du site";
  $("viEchelle").innerHTML = (g === "e23" ? `<b>2023</b> · ` : "") + (voteMode()
    ? `<span>0 %</span>${ramp}<span>45 % et +</span><span>· vote ${esc(nomP(p))} dans chaque canton (${quoi})${etat.pct ? " · chiffre = % du parti" : ""}</span>`
    : etat.mode === "act" ? `${legende(presents(Object.values(ACT.cn).flat().map(x => x.p)))}<span>· parti qui a le plus d'élus du canton au Conseil national aujourd'hui (plus foncé : plus de sièges pour lui)</span>`
    : `<span>Couleur : parti ${etat.mode === "second" ? "arrivé deuxième" : "arrivé premier"} en voix dans chaque canton (${quoi}). Plus la couleur est foncée, plus son score est élevé.</span>`);
}
const listeSieges = s => trie(s).map(([p, n]) => `${nomP(p)} ${n}`).join(" · ");
function infobulle(e, f) {
  const ab = f.properties.K, c = CANT[ab], t = $("viTip");
  const box = svg.node().parentNode.getBoundingClientRect();
  let px = e.clientX - box.left + 14; if (px > box.width - 240) px -= 260;
  t.hidden = false; t.style.left = px + "px"; t.style.top = (e.clientY - box.top + 14) + "px";
  if (TYPE === "ce") {
    const d = delegation(ab);
    t.innerHTML = `<b>${esc(c.nom)}</b><small>${sg(c.ce)} au Conseil des États</small><br>${d.map(x => `${esc(x.nom)} (${nomP(x.p)})`).join("<br>")}`;
    return;
  }
  const o23 = trie(R23.cantons[ab].p).slice(0, 3).map(([p, v]) => `${nomP(p)} ${nf(v, 1)} %`).join(" · ");
  t.innerHTML = `<b>${esc(c.nom)}</b><small>${sg(c.s27)} en 2027${c.s27 !== c.s23 ? ` (${c.s23} en 2023)` : ""}</small><br>`
    + (PROJ ? `<small>Projection : ${listeSieges(PROJ.cantons[ab].s)}</small><br>` : "")
    + `<small>2023 : ${o23}</small><br><small>Élus 2023 : ${listeSieges(R23.cantons[ab].s)}</small>`;
}

/* ---------- panneau : toute la Suisse, ou un canton ---------- */
function choisir(ab) { sel = ab; peindre(); dessinerPanneau(); if (ab != null) infoPlein(); }
const jauge = (lab, coul, v, droite = "", max = 40, cls = "") => `<div class="vi-vrow ${cls}"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${Math.min(100, 100 * v / max)}%;background:${coul}"></i></span>`
  + `<span class="vi-num">${nf(v, 1)} %</span><span class="vi-num">${droite}</span></div>`;
const barreSieges = (lab, coul, n, tot, droite = "") => `<div class="vi-vrow vf-gp"><b style="color:${coul}">${lab}</b><span class="vi-jauge"><i style="width:${100 * n / tot}%;background:${coul}"></i></span><span class="vi-num"><b>${n}</b></span><span class="vi-num"><small>${droite}</small></span></div>`;
const replie = (titre, corps, ouvert = false) => `<details class="lv-sg vc-replie"${ouvert ? " open" : ""}><summary><span>${titre}</span></summary>${corps}</details>`;
const ordreSieges = (s, v = {}) => Object.keys({ ...s, ...v }).sort((a, b) => (s[b] || 0) - (s[a] || 0) || (v[b] || 0) - (v[a] || 0));
const listeMembres = (ms, depuisApres = "2023-12-31") => `<ul class="vi-serres">${ms.slice().sort((a, b) => ORDRE.indexOf(a.p) - ORDRE.indexOf(b.p) || a.nom.localeCompare(b.nom, "fr"))
  .map(x => `<li style="--c:${COUL[x.p] || COUL.AUT}"><i></i><span>${esc(x.nom)}${x.depuis && x.depuis > depuisApres ? ` <small>(depuis le ${dateFr(x.depuis)})</small>` : ""}</span><b>${nomP(x.p)}</b></li>`).join("") || "<li>Aucun</li>"}</ul>`;
// tableau des cantons : sièges par parti (les cantons sont cliquables)
const COLS = ["UDC", "PS", "C", "PLR", "VERT", "PVL"];
function tableCantons(src, titre) {
  const lignes = DATA.cantons.map(c => { const s = src(c.ab), aut = somme(s) - COLS.reduce((a, p) => a + (s[p] || 0), 0);
    return `<tr><td><button type="button" class="vi-lien" data-k="${c.ab}">${esc(c.nom)}</button></td>${COLS.map(p => `<td class="${s[p] ? "has" : ""}" style="--c:${COUL[p]}">${s[p] || "·"}</td>`).join("")}<td class="${aut ? "has" : ""}" style="--c:var(--ink)">${aut || "·"}</td></tr>`; }).join("");
  return `<span class="lv-eyebrow">${titre}</span>
    <div class="vi-table"><table><thead><tr><th>Canton</th>${COLS.map(p => `<th style="color:${COUL[p]}">${nomP(p)}</th>`).join("")}<th>Autres</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
}
// apparentements de 2023 dans un canton : groupes de partis dont les listes étaient liées
function apparentements(ab) {
  const ls = R23.cantons[ab].listes; if (CANT[ab].s23 < 2) return "";
  const grp = {};
  ls.forEach(([p, lv]) => { if (lv) (grp[lv] ||= new Set()).add(p); });
  const gs = Object.values(grp).map(s => [...s].filter(p => p !== "AUT").sort((a, b) => ORDRE.indexOf(a) - ORDRE.indexOf(b))).filter(g => g.length > 1);
  if (!gs.length) return "";
  return replie(`Apparentements de ${AN(2023)}`, `<ul class="vi-serres">${gs.map(g => `<li style="--c:${COUL[g[0]] || COUL.AUT}"><i></i>${g.map(nomP).join(" + ")}</li>`).join("")}</ul>
    <p class="lv-muted">Listes liées en ${AN(2023)} (partis entre eux, sans les listes d'un même parti ; « Autres » omis). La projection les reprend telles quelles : elles peuvent changer en ${AN(2027)}.</p>`);
}
function dessinerPanneau() {
  const z = $("viPanneau"), g = groupe();
  if (sel) return panneauCanton(z, sel, g);
  if (TYPE === "ce") {
    const s = siegesDe("ce", g), s23 = siegesDe("ce", "e23"), titre = g === "act" ? "Conseil des États · composition actuelle" : `Conseil des États · élus en ${AN(2023)}`;
    const changes = ACT ? DATA.cantons.flatMap(c => (ACT.ce[c.ab] || []).filter(x => !(R23.ce[c.ab] || []).some(y => y.nom === x.nom && y.p === x.p)).map(x => [c, x])) : [];
    z.innerHTML = `<span class="lv-eyebrow">${titre}</span><h3>Toute la Suisse</h3>
      <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[premier(s)[0]]}"></i>${nomP(premier(s)[0])} : ${premier(s)[1]} / ${CE}</span><span class="vi-pill">Majorité : ${MAJ_CE}</span></div>
      <p class="lv-muted">Deux élus par canton, un par ancien demi-canton. Clique sur un canton pour voir ses élus.</p>
      <span class="lv-eyebrow">Sièges par parti${g === "act" ? " (écart depuis l'élection)" : ""}</span>
      <div class="vi-vrows">${ordreSieges(s).map(p => barreSieges(nomP(p), COUL[p] || COUL.AUT, s[p], 20, g === "act" ? ecart((s[p] || 0) - (s23[p] || 0)) : "")).join("")}</div>
      ${g === "act" && changes.length ? `<span class="lv-eyebrow">Changements depuis l'élection</span><ul class="vi-serres">${changes.map(([c, x]) => `<li style="--c:${COUL[x.p] || COUL.AUT}" data-k="${c.ab}" tabindex="0"><i></i>${esc(c.nom)} · ${esc(x.nom)}<b>${nomP(x.p)}${(R23.ce[c.ab] || []).some(y => y.nom === x.nom) ? " <small>(changement de parti)</small>" : x.depuis ? ` <small>(depuis ${x.depuis.slice(0, 4)})</small>` : ""}</b></li>`).join("")}</ul>` : ""}
      ${tableCE(g)}`;
    return;
  }
  const s = siegesDe("cn", g), [lead, nl] = premier(s), N23 = R23.national;
  const pills = `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[lead]}"></i>${nomP(lead)} en tête : ${nl} / ${CN}</span><span class="vi-pill">UDC + PLR : ${(s.UDC || 0) + (s.PLR || 0)}</span><span class="vi-pill">Majorité : ${MAJ_CN}</span></div>`;
  if (g === "proj") {
    const N = PROJ.national, parts = Object.keys(N).filter(p => N[p].s || N[p].v >= 1).sort((a, b) => N[b].s - N[a].s || N[b].v - N[a].v);
    const changes = DATA.cantons.map(c => [c, PROJ.cantons[c.ab].s, R23.cantons[c.ab].s]).filter(([c, a, b]) => Object.keys({ ...a, ...b }).some(p => (a[p] || 0) !== (b[p] || 0)));
    z.innerHTML = `<span class="lv-eyebrow">Projection du site · ${dateFr(PROJ.maj)}</span><h3>Toute la Suisse</h3>${pills}
      <p class="lv-muted">Si l'élection avait lieu aujourd'hui, avec la moyenne des derniers sondages (${PROJ.sondages.map(x => `${esc(x.f)}, ${dateFr(x.d)}`).join(" ; ")}). Simulation faite par le site, pas par un institut. Clique sur un canton pour son détail.</p>
      <span class="lv-eyebrow">Vote et sièges projetés</span><div class="vi-vrows">${parts.map(p => jauge(nomP(p), COUL[p] || COUL.AUT, N[p].v, `<b>${N[p].s}</b> <small>${N[p].smin}–${N[p].smax}</small>`, 40, "vc-proj vs-proj")).join("")}</div>
      ${replie("Comment la projection est faite", `<div class="vs-methode">
        <p>1. <b>Moyenne des sondages</b> : le dernier sondage de chaque institut publié dans les douze mois qui précèdent le plus récent, à poids égal. Les petits partis (PEV, UDF, MCG, Lega…), rarement mesurés à part, suivent ensemble l'évolution de la case « Autres ».</p>
        <p>2. <b>Écart par canton</b> : chaque parti garde sa géographie de ${AN(2023)} ; ses suffrages de ${AN(2023)} sont multipliés, dans chaque canton et pour chacune de ses listes, par le rapport entre son score dans les sondages et son score national de ${AN(2023)} (écart proportionnel).</p>
        <p>3. <b>Sièges</b> : les sièges de ${AN(2027)} de chaque canton sont répartis comme le prévoit la loi, méthode Hagenbach-Bischoff, avec les apparentements et sous-apparentements de listes de ${AN(2023)} (ils changeront). Refaite avec les suffrages réels, cette répartition redonne exactement les 200 élus de ${AN(2023)}. Dans les six cantons à un siège, la liste en tête l'emporte (en réalité, une élection de personnes).</p>
        <p>4. <b>Fourchette</b> : 90 % de 1000 simulations où le score national de chaque parti varie (erreur de sondage d'environ ±1 à ±2,5 points) et où chaque canton s'écarte un peu de la tendance nationale. Plusieurs derniers sièges se jouent à peu de voix : la fourchette est plus parlante que le chiffre central.</p></div>`)}
      ${replie(`Par rapport à l'élection de ${AN(2023)}`, `<div class="vi-vrows">${parts.filter(p => N23[p]).map(p => `<div class="vi-vrow"><b style="color:${COUL[p] || COUL.AUT}">${nomP(p)}</b><span class="vi-num" style="text-align:left">${ecart(N[p].v - N23[p].v, 1, " pts")} <small>de vote</small></span><span></span><span class="vi-num"><b>${ecart(N[p].s - N23[p].s)}</b> <small>sièges</small></span></div>`).join("")}</div>`)}
      ${tableCantons(ab => PROJ.cantons[ab].s, `Sièges par canton · projection (sièges de ${AN(2027)})`)}
      <details class="lv-sg vf-hors"><summary><span>Cantons où la répartition changerait</span><small>${changes.length}</small></summary>
      <ul class="vi-serres">${changes.map(([c, a, b]) => `<li data-k="${c.ab}" tabindex="0" style="--c:var(--ink)"><i></i>${esc(c.nom)}<b>${Object.keys({ ...a, ...b }).filter(p => (a[p] || 0) !== (b[p] || 0)).sort((x, y) => ((a[y] || 0) - (b[y] || 0)) - ((a[x] || 0) - (b[x] || 0))).map(p => `${nomP(p)} ${ecart((a[p] || 0) - (b[p] || 0))}`).join(", ")}</b></li>`).join("")}</ul>
      <p class="lv-muted">Comparé aux élus de ${AN(2023)} ; Berne et les Grisons perdent un siège en ${AN(2027)}, Lucerne et Fribourg en gagnent un.</p></details>`;
    return;
  }
  if (g === "e23") {
    const parts = Object.keys(N23).filter(p => N23[p].v >= 0.5).sort((a, b) => N23[b].s - N23[a].s || N23[b].v - N23[a].v);
    z.innerHTML = `<span class="lv-eyebrow">Élection du 22 octobre ${AN(2023)}</span><h3>Toute la Suisse</h3>${pills}
      <p class="lv-muted">Résultats officiels (Office fédéral de la statistique). Participation : ${nf(R23.participation, 1)} % de ${nf(R23.inscrits)} électeurs inscrits. Écarts par rapport à 2019 entre parenthèses.</p>
      <span class="lv-eyebrow">Vote et sièges</span>
      <div class="vi-vrows">${parts.map(p => jauge(nomP(p), COUL[p] || COUL.AUT, N23[p].v, `<b>${N23[p].s}</b> <small>(${ecart(N23[p].s - (N23[p].s19 || 0))})</small>`, 40, "vc-proj vs-proj")).join("")}</div>
      ${voteMode() ? meilleurs() : ""}
      ${tableCantons(ab => R23.cantons[ab].s, `Sièges par canton · élus en ${AN(2023)}`)}`;
    return;
  }
  // conseil actuel
  const s23 = siegesDe("cn", "e23");
  const changes = DATA.cantons.map(c => [c, compte(ACT.cn[c.ab]), R23.cantons[c.ab].s]).filter(([c, a, b]) => Object.keys({ ...a, ...b }).some(p => (a[p] || 0) !== (b[p] || 0)));
  z.innerHTML = `<span class="lv-eyebrow">Conseil national · composition actuelle</span><h3>Toute la Suisse</h3>${pills}
    <p class="lv-muted">Parti de chaque conseiller national aujourd'hui (Services du Parlement), changements de parti compris. Le PLD bâlois est compté avec le PLR et l'Alternative zougoise avec les Vert-e-s, comme le fait l'OFS.</p>
    <span class="lv-eyebrow">Sièges par parti (écart depuis l'élection)</span>
    <div class="vi-vrows">${ordreSieges(s).map(p => barreSieges(nomP(p), COUL[p] || COUL.AUT, s[p], 70, ecart((s[p] || 0) - (s23[p] || 0)))).join("")}</div>
    ${tableGroupes()}
    <span class="lv-eyebrow">Changements de parti depuis l'élection, par canton</span>
    <ul class="vi-serres">${changes.map(([c, a, b]) => `<li data-k="${c.ab}" tabindex="0" style="--c:var(--ink)"><i></i>${esc(c.nom)}<b>${Object.keys({ ...a, ...b }).filter(p => (a[p] || 0) !== (b[p] || 0)).map(p => `${nomP(p)} ${ecart((a[p] || 0) - (b[p] || 0))}`).join(", ")}</b></li>`).join("") || "<li>Aucun</li>"}</ul>
    ${tableCantons(ab => compte(ACT.cn[ab]), "Conseillers nationaux actuels par canton")}`;
}
// groupes parlementaires de l'Assemblée fédérale (les deux chambres)
const COUL_GR = { V: "UDC", S: "PS", "M-E": "C", RL: "PLR", G: "VERT", GL: "PVL" };
function tableGroupes() {
  const cn = {}, ce = {};
  Object.values(ACT.cn).flat().forEach(x => { cn[x.g] = (cn[x.g] || 0) + 1; });
  Object.values(ACT.ce).flat().forEach(x => { ce[x.g] = (ce[x.g] || 0) + 1; });
  const gs = Object.keys({ ...cn, ...ce }).sort((a, b) => ((cn[b] || 0) + (ce[b] || 0)) - ((cn[a] || 0) + (ce[a] || 0)));
  return `<span class="lv-eyebrow">Groupes parlementaires (les deux conseils)</span>
    <div class="vi-table"><table><thead><tr><th>Groupe</th><th>Nat.</th><th>États</th><th>Total</th></tr></thead><tbody>${gs.map(g => `<tr><td style="color:${COUL[COUL_GR[g]] || "var(--ink)"};font-weight:700">${esc(ACT.groupes[g] || g)}</td><td>${cn[g] || "·"}</td><td>${ce[g] || "·"}</td><td><b>${(cn[g] || 0) + (ce[g] || 0)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="lv-muted">Le groupe du Centre réunit aussi le PEV ; le groupe UDC, aussi l'UDF, la Lega et le MCG.</p>`;
}
function tableCE(g) {
  const src = g === "act" ? ACT.ce : R23.ce;
  return `<span class="lv-eyebrow">Élus par canton</span><ul class="vi-serres">${DATA.cantons.map(c => { const d = src[c.ab] || [];
    return `<li data-k="${c.ab}" tabindex="0" style="--c:${COUL[d[0]?.p] || COUL.AUT}"><i></i>${esc(c.nom)}<b>${d.map(x => `${esc(x.nom.split(" ").slice(-1)[0])} <small>${nomP(x.p)}</small>`).join(", ")}</b></li>`; }).join("")}</ul>`;
}
// mode Vote, élection 2023 : meilleurs cantons du parti choisi
function meilleurs() {
  const p = etat.parti; if (!p) return "";
  const top = DATA.cantons.map(c => [c, R23.cantons[c.ab].p[p] || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<span class="lv-eyebrow">Meilleurs cantons : ${esc(nomP(p))} en ${AN(2023)}</span><ul class="vi-serres">${top.map(([c, v]) => `<li data-k="${c.ab}" tabindex="0" style="--c:${COUL[p]}"><i></i>${esc(c.nom)}<b>${nf(v, 1)} %</b></li>`).join("")}</ul>`;
}
function panneauCanton(z, ab, g) {
  const c = CANT[ab], r = R23.cantons[ab];
  const lignes = (parts, seats, ref, d = 1) => Object.entries(parts).filter(([, v]) => v >= 0.3).sort((x, y) => y[1] - x[1]).map(([p, v]) =>
    `<div class="vi-vrow${seats[p] ? " win" : ""}"><b style="color:${COUL[p] || COUL.AUT}">${nomP(p)}</b><span class="vi-jauge"><i style="width:${Math.min(100, v * 100 / 50)}%;background:${COUL[p] || COUL.AUT}"></i></span>`
    + `<span class="vi-num">${nf(v, d)} %</span><span class="vi-num">${seats[p] ? `<b>${sg(seats[p])}</b>` : ""}${ref && ref[p] != null ? ` <small>(${ecart(v - ref[p], 1)})</small>` : ""}</span></div>`).join("");
  const blocE23 = `<div class="vi-vrows">${lignes(r.p, r.s, r.p19)}</div><p class="lv-muted">Participation : ${nf(r.part, 1)} % · écart de vote par rapport à 2019 entre parenthèses.${c.s23 === 1 ? " Canton à un siège : élection au scrutin majoritaire (pourcentages des candidats, selon leur parti)." : ""}</p>`;
  const blocProj = PROJ ? `<div class="vi-vrows">${lignes(PROJ.cantons[ab].p, PROJ.cantons[ab].s, null)}</div>` : "";
  const ce = ACT ? ACT.ce[ab] || [] : R23.ce[ab] || [];
  const ce23 = R23.ce[ab] || [], ceChange = ACT && ce23.some(y => !ce.some(x => x.nom === y.nom && x.p === y.p));
  const blocCE = `<span class="lv-eyebrow">Conseil des États · ${sg(c.ce)}${ACT ? " · aujourd'hui" : ` · élus en ${AN(2023)}`}</span>${listeMembres(ce)}`
    + (ceChange ? replie(`Élus en ${AN(2023)}`, listeMembres(ce23, "9999")) : "");
  const tete = `<span class="lv-eyebrow">Canton · ${sg(c.s27)} au Conseil national en ${AN(2027)}${c.s27 !== c.s23 ? ` (${c.s23} en ${AN(2023)})` : ""}</span><h3>${esc(c.nom)}</h3>`;
  const liens = `<div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Toute la Suisse</button><button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button></div>`;
  if (TYPE === "ce") {
    z.innerHTML = `${tete}${liens}${blocCE}
      <span class="lv-eyebrow">Conseil national · élus en ${AN(2023)}</span><div class="vi-vrows">${ordreSieges(r.s).map(p => barreSieges(nomP(p), COUL[p] || COUL.AUT, r.s[p], c.s23)).join("")}</div>`;
    return;
  }
  const actuel = ACT ? `<span class="lv-eyebrow">Conseillers nationaux actuels</span>${listeMembres(ACT.cn[ab] || [])}` : "";
  const top = trie(partsCanton(ab, g === "act" ? "e23" : g))[0];
  const pills = g === "act" ? `<div class="vi-pills"><span class="vi-pill">${listeSieges(compte(ACT.cn[ab]))}</span></div>`
    : `<div class="vi-pills"><span class="vi-pill"><i style="background:${COUL[top[0]]}"></i>Premier parti${g === "proj" ? " (projection)" : ` en ${AN(2023)}`} : ${nomP(top[0])} ${nf(top[1], 1)} %</span><span class="vi-pill">${listeSieges(siegesCanton(ab, g))}</span></div>`;
  const corps = g === "proj"
    ? `<span class="lv-eyebrow">Projection du site · vote et sièges</span>${blocProj}${replie(`Élection du 22 octobre ${AN(2023)}`, blocE23)}${apparentements(ab)}${actuel}`
    : g === "e23" ? `<span class="lv-eyebrow">Élection du 22 octobre ${AN(2023)}</span>${blocE23}${apparentements(ab)}${PROJ ? replie("Projection du site", blocProj) : ""}${actuel}`
    : `${actuel}${replie(`Élection du 22 octobre ${AN(2023)}`, blocE23)}${PROJ ? replie("Projection du site", blocProj) : ""}`;
  z.innerHTML = `${tete}${pills}${liens}${corps}${blocCE}`;
}
document.addEventListener("click", e => {
  if (!e.target.closest("#viPanneau")) return;
  const l = e.target.closest("[data-k]"); if (l) { choisir(l.dataset.k); return; }
  if (e.target.closest("[data-tout]")) { choisir(null); svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); return; }
  if (e.target.closest("[data-zoomsel]") && sel) zoomVers(DATA.geo.features.find(x => x.properties.K === sel), 0.6);
});
document.addEventListener("keydown", e => {
  const l = e.target.closest?.("#viPanneau li[data-k]"); if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(l.dataset.k); }
});

/* ---------- évolution des intentions de vote ---------- */
let periode = lireLS("vsPeriode", 0);   // depuis 2023 par défaut : les sondages sont rares
function dessinerEvolution() {
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 66, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = SOND.sondages.filter(s => !s.e);
  const fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const debut = periode ? d3.max([t(DATE_ELECTION), d3.timeMonth.offset(fin_, -periode)]) : d3.timeDay.offset(t(DATE_ELECTION), -20);
  const dans = d => t(d) >= debut;
  const sond = tous.filter(s => dans(s.d));
  const elecVis = SOND.sondages.filter(s => s.e && dans(s.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === periode));
  $("viEvolSur").innerHTML = periode ? (periode === 12 ? "Dernière année" : `${periode / 12} dernières années`) : `Depuis l'élection de ${AN(2023)}`;
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max([...sond, ...elecVis], s => d3.max(P, p => s[p])) || 35;
  const y = d3.scaleLinear().domain(domaineY(el, [0, Math.ceil((yMax + 3) / 5) * 5], String(periode), dessinerEvolution)).range([H - m.b, m.t]);   // Ctrl + molette : zoom vertical
  // tendance : moyenne pondérée des sondages autour de chaque semaine (noyau gaussien de 45 jours), sur tous les sondages
  const SIGMA = 45, t0 = t(tous[0].d), t1 = t(tous[tous.length - 1].d);
  const dates = [];
  for (let d = new Date(t0); d <= t1; d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / SIGMA) ** 2);
  const cache = {};
  const moy = p => cache[p] ||= datesVis.map(d => { let a = 0, w = 0; for (const s of tous) { if (s[p] == null) continue; const k = poids(d, s); a += k * s[p]; w += k; } return { d, v: a / w }; });
  const nbAutour = d => tous.filter(s => Math.abs(t(d) - t(s.d)) / 864e5 <= 60).length;
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Évolution des intentions de vote au Conseil national depuis 2023");
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : 7)
    .tickFormat(d => d.toLocaleDateString("fr-CA", { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  for (const e of elecVis) {
    svgE.append("line").attr("class", "vi-elec").attr("x1", x(t(e.d))).attr("x2", x(t(e.d))).attr("y1", m.t).attr("y2", H - m.b);
    svgE.append("text").attr("class", "vi-elec-txt").attr("x", x(t(e.d)) + 4).attr("y", m.t + 10).text("Élection " + e.d.slice(0, 4));
  }
  const fin = {};
  for (const p of P) {
    svgE.append("g").selectAll("circle").data(sond.filter(s => s[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s[p])).attr("r", 3.2).style("fill", COUL[p])
      .append("title").text(s => `${s.f}, ${dateFr(s.d)} : ${nomP(p)} ${nf(s[p], 1)} %`);
    const mm = moy(p); fin[p] = mm[mm.length - 1];
    if (mm.length) svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", COUL[p]);
    svgE.append("g").selectAll("rect").data(elecVis).join("rect").attr("class", "vi-elec-pt").attr("width", 8).attr("height", 8)
      .attr("transform", e => `translate(${x(t(e.d))},${y(e[p])}) rotate(45) translate(-4,-4)`).style("fill", COUL[p]);
  }
  const etiq = P.filter(p => fin[p]).map(p => ({ p, y: y(fin[p].v), v: fin[p].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", W - m.r + 6).attr("y", d => d.y + 4).style("fill", d => COUL[d.p]).text(d => `${nomP(d.p)} ${nf(d.v, 0)}`);
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      if (!datesVis.length) return;
      const [mx] = d3.pointer(ev), dt = x.invert(mx), d = datesVis.reduce((a, b) => Math.abs(t(b) - dt) < Math.abs(t(a) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(d))).attr("x2", x(t(d)));
      const vals = P.map(p => [p, moy(p).find(o => o.d === d).v]).sort((a, b) => b[1] - a[1]);
      const n = nbAutour(d);
      tipE.hidden = false; tipE.innerHTML = `<b>Semaine du ${dateFr(d)}</b><small>tendance · ${n} sondage${n > 1 ? "s" : ""} à ±60 jours</small>`
        + vals.map(([p, v]) => `<span style="--c:${COUL[p]}"><i></i>${nomP(p)} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  const der = tous[tous.length - 1], mois = Math.round((new Date() - t(der.d)) / (30.4 * 864e5));
  $("viEvolNote").innerHTML = `${sond.length} sondage${sond.length > 1 ? "s" : ""} nationa${sond.length > 1 ? "ux" : "l"} sur la période (compilés par Wikipédia). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages · losanges : résultat de l'élection de ${AN(2023)}.`
    + (mois >= 3 ? ` <b>Le dernier sondage date du ${dateFr(der.d)} (${der.f}), il y a environ ${mois} mois</b> : en Suisse, les baromètres sont rares entre deux élections.` : "");
}

/* ---------- « Comprendre le système politique et électoral » (votes-quebec/systeme.js) ----------
   Partie 1, système politique : État fédéral, Assemblée fédérale, Conseil fédéral, démocratie directe.
   Partie 2, système électoral : Conseil national (proportionnelle par canton, listes, Hagenbach-Bischoff, apparentements),
   Conseil des États, calendrier et électeurs. Chiffres : élection de 2023 (R23), élus actuels (ACT), cantons (DATA). */
function systemeElectoral() {
  const N = R23.national, S = Object.fromEntries(Object.entries(N).map(([p, x]) => [p, x.s])), V = Object.fromEntries(Object.entries(N).map(([p, x]) => [p, x.v]));
  const partis = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => S[b] - S[a] || V[b] - V[a]);
  const lead = partis[0], pctS = p => 100 * (S[p] || 0) / CN;
  const un = DATA.cantons.filter(c => c.s23 === 1), plusieurs = DATA.cantons.filter(c => c.s23 > 1);
  const nbListes = plusieurs.reduce((a, c) => a + R23.cantons[c.ab].listes.length, 0);
  const sieges1 = plusieurs.reduce((a, c) => a + c.s27, 0);
  const lignes = partis.map(p => `<div class="vi-dlg-vs-ligne" style="--c:${COUL[p]}"><b>${nomP(p)}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${2.5 * V[p]}%"></i><i style="width:${Math.max(0.6, 2.5 * pctS(p))}%"></i></span>
      <small>${nf(V[p], 1)} % des voix<br>${sg(S[p] || 0)} (${nf(pctS(p), 1)} %)</small></div>`).join("");
  const graphique = `<div class="vi-dlg-vs">${lignes}</div><div class="vi-dlg-legende"><span>part des voix</span><span>part des sièges</span></div>`;
  const ce23 = compte(Object.values(R23.ce).flat()), cn23 = S;
  const cf = ACT?.cf || [], cfp = compte(cf);
  const formule = Object.keys(cfp).sort((a, b) => cfp[b] - cfp[a] || ORDRE.indexOf(b) - ORDRE.indexOf(a)).map(p => `${cfp[p]} ${nomP(p)}`).join(", ");
  const tabCantons = `<table class="vi-dlg-tab"><caption>Sièges par canton</caption>
      <thead><tr><th scope="col">Canton</th><th scope="col">Conseil national<small>${AN(2023)}</small></th><th scope="col">Conseil national<small>${AN(2027)}</small></th><th scope="col">Conseil des États</th></tr></thead>
      <tbody>${DATA.cantons.map(c => `<tr style="--c:var(--ink)"><th scope="row">${esc(c.nom)}</th><td>${c.s23}</td><td><b>${c.s27}</b></td><td>${c.ce}</td></tr>`).join("")}</tbody></table>`;
  const tabCF = cf.length ? `<table class="vi-dlg-tab"><caption>Le Conseil fédéral aujourd'hui (Services du Parlement)</caption><tbody>${cf.slice().sort((a, b) => ORDRE.indexOf(b.p) - ORDRE.indexOf(a.p)).map(x => `<tr style="--c:${COUL[x.p] || COUL.AUT}"><th scope="row"><i></i>${esc(x.nom)}</th><td>${esc(NOMS[x.p] || x.p)}</td></tr>`).join("")}</tbody></table>` : "";
  const tabChambres = `<table class="vi-dlg-tab"><caption>Élus en ${AN(2023)}</caption>
      <thead><tr><th scope="col">Parti</th><th scope="col">Conseil national<small>${CN} sièges</small></th><th scope="col">Conseil des États<small>${CE} sièges</small></th><th scope="col">Assemblée fédérale<small>${CN + CE} sièges</small></th></tr></thead>
      <tbody>${ORDRE.filter(p => cn23[p] || ce23[p]).sort((a, b) => ((cn23[b] || 0) + (ce23[b] || 0)) - ((cn23[a] || 0) + (ce23[a] || 0))).map(p => `<tr style="--c:${COUL[p]}"><th scope="row"><i></i>${nomP(p)}</th><td>${cn23[p] || 0}</td><td>${ce23[p] || 0}</td><td><b>${(cn23[p] || 0) + (ce23[p] || 0)}</b></td></tr>`).join("")}</tbody></table>`;
  const politique = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b>26 cantons</b><small>un État fédéral ; six anciens demi-cantons</small></div>
      <div><b>2 chambres</b><small>égales : ${CN} conseillers nationaux et ${CE} conseillers aux États</small></div>
      <div><b>7</b><small>membres du Conseil fédéral, un gouvernement collégial</small></div>
      <div><b class="vi-dlg-long">Démocratie directe</b><small>initiatives et référendums : le peuple vote plusieurs fois par année</small></div>
    </section>
    <section>
      <h3>Un État fédéral</h3>
      <p>La Suisse (officiellement la Confédération suisse) est un <b>État fédéral</b> formé de <b>26 cantons</b>. L'État fédéral date de 1848 ; la Constitution actuelle a été adoptée en 1999 et est en vigueur depuis 2000. Les cantons sont souverains dans tout ce que la Constitution ne confie pas à la Confédération : chacun a sa constitution, son parlement, son gouvernement et ses tribunaux, et les communes ont aussi des pouvoirs importants. Six cantons sont d'anciens <b>demi-cantons</b> (Obwald, Nidwald, Bâle-Ville, Bâle-Campagne, Appenzell Rhodes-Extérieures et Appenzell Rhodes-Intérieures) : ils n'ont qu'un siège au Conseil des États et comptent pour une demi-voix quand il faut la majorité des cantons. La Constitution ne désigne pas de capitale : Berne est la « ville fédérale ».</p>
    </section>
    <section>
      <h3>L'Assemblée fédérale : deux chambres égales</h3>
      <ul>
        <li><b>Le Conseil national</b> représente le peuple : ${CN} membres, répartis entre les cantons selon leur population, chaque canton ayant au moins un siège (voir la partie <a href="#" data-aller="electoral">Système électoral</a>).</li>
        <li><b>Le Conseil des États</b> représente les cantons : ${CE} membres, deux par canton et un par ancien demi-canton, quelle que soit la population. Zurich (${CANT.ZH.s27} conseillers nationaux) y a autant de sièges qu'Uri (${CANT.UR.s27}).</li>
        <li><b>Les deux chambres ont les mêmes pouvoirs</b> : une loi doit être adoptée dans les mêmes termes par l'une et par l'autre. Quand elles ne s'entendent pas, le texte fait la navette entre elles, puis passe au besoin devant une conférence de conciliation.</li>
        <li><b>Un parlement de milice</b> : la plupart des élus gardent une activité professionnelle ; les chambres siègent pendant quatre sessions ordinaires de trois semaines par année.</li>
        <li><b>Les chambres réunies</b> (les ${CN + CE} élus, l'Assemblée fédérale « Chambres réunies ») élisent les membres du Conseil fédéral, le chancelier de la Confédération et les juges du Tribunal fédéral.</li>
        <li><b>Les groupes parlementaires</b> réunissent les élus d'un parti, ou de partis proches, des deux chambres.</li>
      </ul>
      ${tabChambres}
    </section>
    <section>
      <h3>Le Conseil fédéral : un gouvernement collégial</h3>
      <p>Le gouvernement est le <b>Conseil fédéral</b> : <b>sept membres égaux</b>, élus un à un par l'Assemblée fédérale pour quatre ans, en décembre, après chaque élection du Conseil national. Chacun dirige un des sept départements (ministères), mais les décisions sont prises ensemble et défendues par tous : c'est la <b>collégialité</b>. Le <b>président de la Confédération</b> est l'un des sept, élu par l'Assemblée fédérale pour un an seulement ; il dirige les séances et représente le pays, sans pouvoirs de plus, et ne peut pas être réélu à cette fonction l'année suivante.</p>
      <ul>
        <li><b>Pas de motion de censure</b> : pendant la législature, le Parlement ne peut pas renverser le Conseil fédéral, et le Conseil fédéral ne peut pas dissoudre le Parlement. Il n'y a donc ni majorité gouvernementale ni opposition officielle au sens du Canada ou du Québec.</li>
        <li><b>La concordance</b> : les principaux partis se partagent les sièges du gouvernement. De 1959 à 2003, la « formule magique » donnait deux sièges aux radicaux, deux aux démocrates-chrétiens, deux aux socialistes et un à l'UDC ; en 2003, l'UDC, devenue le premier parti, a obtenu un deuxième siège aux dépens des démocrates-chrétiens.${formule ? ` Aujourd'hui : ${formule}.` : ""}</li>
      </ul>
      ${tabCF}
    </section>
    <section>
      <h3>La démocratie directe</h3>
      <p>Les électeurs ne se contentent pas d'élire le Parlement : ils votent aussi sur des textes, lors de <b>votations</b> fédérales qui ont lieu en général quatre fois par année.</p>
      <ul>
        <li><b>L'initiative populaire</b> : 100 000 signatures récoltées en 18 mois permettent de proposer une modification de la Constitution. Elle doit être acceptée par la <b>double majorité</b> : la majorité des votants et la majorité des cantons.</li>
        <li><b>Le référendum facultatif</b> : 50 000 signatures (ou huit cantons), dans les 100 jours qui suivent la publication d'une loi, suffisent pour la soumettre au peuple ; la majorité des votants décide.</li>
        <li><b>Le référendum obligatoire</b> : toute modification de la Constitution, comme l'adhésion à certaines organisations internationales, est soumise d'office au peuple et aux cantons.</li>
      </ul>
      <p>Comme une loi peut toujours être attaquée par référendum, les partis cherchent des compromis larges dès le départ : c'est l'une des raisons de la concordance au gouvernement.</p>
    </section>`;
  const electoral = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>26</b><small>circonscriptions : les cantons</small></div>
      <div><b class="vi-dlg-long">Proportionnelle</b><small>dans les ${plusieurs.length} cantons qui ont plusieurs sièges (${sieges1} sièges en 2027)</small></div>
      <div><b>4 ans</b><small>prochaine élection le 24 octobre 2027</small></div>
      <div><b>${nf(R23.participation, 1)} %</b><small>de participation en 2023</small></div>
    </section>
    <section>
      <h3>Le Conseil national : la proportionnelle canton par canton</h3>
      <p>Chaque canton forme une <b>circonscription</b>. Les ${CN} sièges sont répartis entre les cantons selon leur population résidante, chacun ayant au moins un siège ; la répartition est recalculée avant chaque élection. En ${AN(2027)}, Lucerne et Fribourg gagnent un siège, Berne et les Grisons en perdent un.</p>
      <p>Dans les ${plusieurs.length} cantons qui ont au moins deux sièges, l'élection se fait à la <b>proportionnelle</b> : les sièges sont partagés entre les listes selon leurs suffrages. Dans les six cantons qui n'ont qu'un siège (${un.map(c => esc(c.nom)).join(", ")}), c'est un <b>scrutin majoritaire</b> : le candidat qui a le plus de voix est élu.</p>
      ${tabCantons}
    </section>
    <section>
      <h3>Les listes : panachage et cumul</h3>
      <p>Chaque parti dépose une ou plusieurs <b>listes</b> dans un canton (souvent une liste principale, une liste de jeunes, de seniors…), avec au plus autant de candidats que de sièges. L'électeur reçoit toutes les listes et peut en déposer une telle quelle, ou la modifier : <b>biffer</b> des noms, <b>cumuler</b> un candidat (l'inscrire deux fois) ou <b>panacher</b> (ajouter des candidats d'autres listes). Chaque voix donnée à un candidat compte aussi pour sa liste, et les lignes laissées vides comptent pour la liste choisie. Dans chaque liste, les sièges obtenus vont aux candidats qui ont reçu le plus de voix.</p>
      <p>En ${AN(2023)}, ${nf(R23.candidats)} candidats se présentaient, sur ${nbListes} listes dans les cantons à la proportionnelle.</p>
    </section>
    <section>
      <h3>Des voix aux sièges : Hagenbach-Bischoff et apparentements</h3>
      <p>Les sièges sont répartis selon la <b>méthode Hagenbach-Bischoff</b> : on divise le total des suffrages par le nombre de sièges plus un, et chaque liste obtient autant de sièges que ce quotient entre de fois dans ses suffrages ; les sièges restants vont, un à un, aux listes qui ont la plus forte moyenne de suffrages par siège. Le résultat est le même qu'avec la méthode D'Hondt. Dans un canton de quatre sièges, une liste est sûre d'en avoir un avec plus de 20 % des voix : plus le canton est petit, plus il faut de voix pour être élu.</p>
      <p>Les listes peuvent former des <b>apparentements</b> : elles comptent alors comme une seule liste pour la première répartition, puis se partagent les sièges obtenus selon la même méthode. Des <b>sous-apparentements</b> lient les listes d'un même parti à l'intérieur d'un apparentement. Les petits partis s'apparentent souvent avec un grand parti proche pour que leurs voix ne soient pas perdues.</p>
      ${graphique}
      <p>À l'échelle de la Suisse, les sièges suivent donc les voix d'assez près, sans être exactement proportionnels : en ${AN(2023)}, ${ART[lead] || NOMS[lead]} a obtenu ${nf(V[lead], 1)} % des voix et ${S[lead]} sièges, soit ${nf(pctS(lead), 1)} % du Conseil national.</p>
    </section>
    <section>
      <h3>Le Conseil des États : les règles de chaque canton</h3>
      <p>Chaque canton fixe la façon d'élire ses conseillers aux États. Presque tous utilisent un <b>scrutin majoritaire</b>, souvent en deux tours : la majorité absolue au premier tour, puis la majorité relative au second ; le Jura et Neuchâtel élisent les leurs à la proportionnelle. L'élection a lieu presque partout le même jour que celle du Conseil national ; les seconds tours suivent en novembre. Ces élections de personnes favorisent les candidats capables de rassembler au-delà de leur parti : en ${AN(2023)}, Le Centre a obtenu ${ce23.C || 0} sièges sur ${CE} au Conseil des États, contre ${cn23.C || 0} sur ${CN} au Conseil national.</p>
    </section>
    <section>
      <h3>Quand et comment vote-t-on ?</h3>
      <p>Les deux conseils sont élus pour <b>quatre ans</b>, sans élection anticipée (sauf le cas exceptionnel d'une révision totale de la Constitution) ; l'élection a lieu en octobre (le 22 octobre ${AN(2023)}, puis le 24 octobre ${AN(2027)}). Les citoyens suisses de 18 ans et plus peuvent voter, y compris ceux qui vivent à l'étranger. La plupart votent par correspondance, dans les semaines qui précèdent le scrutin. En ${AN(2023)}, la participation a été de ${nf(R23.participation, 1)} % (${nf(R23.inscrits)} électeurs inscrits).</p>
      <p class="vi-dlg-note">Sur cette page, la projection du Conseil national est une simulation du site : voir « Comment la projection est faite » dans le panneau à droite de la carte.</p>
    </section>`;
  const tuilesPol = politique.slice(0, politique.indexOf("</section>") + 10), tuilesElec = electoral.slice(0, electoral.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const politiqueCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `La Suisse est un <b>État fédéral</b> de 26 cantons, qui ont chacun leur constitution, leur parlement et leur gouvernement.`)}
      ${point(2, `Le Parlement, l'<b>Assemblée fédérale</b>, a deux chambres <b>aux pouvoirs égaux</b> : le Conseil national (${CN} sièges, selon la population) et le Conseil des États (${CE} sièges, deux par canton).`)}
      ${point(3, `Le gouvernement, le <b>Conseil fédéral</b>, compte sept membres élus par les deux chambres réunies ; ils décident ensemble, et la présidence change chaque année.${formule ? ` Aujourd'hui : ${formule}.` : ""}`)}
      ${point(4, `<b>Pas de motion de censure</b> ni de dissolution : le gouvernement ne dépend pas d'une majorité, et les grands partis y sont tous représentés (la concordance).`)}
      ${point(5, `<b>Démocratie directe</b> : avec 100 000 signatures, on peut proposer de changer la Constitution ; avec 50 000, soumettre une loi au peuple.`)}
    </ol>`;
  const electoralCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Proportionnelle par canton</b> : chaque canton élit ses conseillers nationaux sur des listes ; les six cantons à un siège élisent le candidat qui a le plus de voix.`)}
      ${point(2, `<b>Panachage et cumul</b> : l'électeur peut modifier sa liste, ajouter des candidats d'autres listes ou inscrire un candidat deux fois.`)}
      ${point(3, `<b>Hagenbach-Bischoff</b> et <b>apparentements</b> : les listes liées comptent ensemble pour la répartition des sièges.`)}
    </ol>
    ${graphique}
    <ol class="vi-dlg-court" start="4">
      ${point(4, `<b>Conseil des États</b> : chaque canton choisit ses règles, presque toujours un scrutin majoritaire (proportionnelle au Jura et à Neuchâtel).`)}
      ${point(5, `<b>Tous les quatre ans</b>, en octobre : prochaine élection le 24 octobre ${AN(2027)}.`)}
    </ol>`;
  preparerSysteme({ sur: "Suisse · Assemblée fédérale", titre: "Le système politique et électoral de la Suisse",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : l'État fédéral, les deux chambres, le Conseil fédéral et la démocratie directe.", html: politique, court: politiqueCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on élit le Parlement : la proportionnelle par canton, les listes, la répartition des sièges et le Conseil des États.", html: electoral, court: electoralCourt }] });
}

/* ---------- démarrage ---------- */
/* ---------- section « Les partis » (votes-quebec/partis.js) : liste cliquable, fiche de chaque parti ---------- */
function partisEnLice() {
  const N = PROJ?.national || {};
  const ordre = Object.keys(PARTIS.suisse).filter(p => N[p]).sort((a, b) => (N[b].s || 0) - (N[a].s || 0) || (N[b].v || 0) - (N[a].v || 0));
  sectionPartis(PARTIS.suisse, ordre.map(p => ({ cle: p, etiquette: COURT[p] || p, couleur: COUL[p],
    detail: `Conseil national, projection du site : <b>${N[p].s} siège${N[p].s > 1 ? "s" : ""}</b> (${N[p].smin}–${N[p].smax}) · ${nf(N[p].v, 1)} % des voix` })));
}

async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    const facultatif = u => lireJ(u).catch(e => { console.warn(e); return null; });   // un groupe sans données n'apparaît pas
    [DATA, R23, SOND, PROJ, ACT] = await Promise.all([lireJ("votes-suisse/data.json"), lireJ("votes-suisse/resultats-2023.json"), lireJ("votes-suisse/sondages.json"),
      facultatif("votes-suisse/projection.json"), facultatif("votes-suisse/actuel.json"), lireVerif("suisse")]);
    preparer();
    etat.mode = MODE0(); etat.chambre = groupe();
    ajouterChoixType();
    construireCarte(); dessinerTete(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral(); partisEnLice();
    await equilibrerHaut(dessinerEvolution);   // colonnes du haut équilibrées avant d'afficher la page (rien ne bouge ensuite)
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vsPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");   // affiche la page (données prêtes, ou message d'erreur)
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
