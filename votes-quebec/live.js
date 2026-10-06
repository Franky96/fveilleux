/* Votes Québec — onglet « En direct » : résultats de l'élection générale du 5 octobre 2026.
   Données : api/live.php (relais des données ouvertes d'Élections Québec, actualisées toutes les 2 à 5 min).
   Carte : les 127 circonscriptions de votes-quebec/data.json (mêmes contours que la carte actuelle de la simulation).
   Participation : taux préliminaire de la journée (CSV d'Élections Québec), puis taux final de chaque circonscription.
   Démo (admin) : votes-quebec.html?demo=40#live rejoue 2022 à 40 % des bureaux dépouillés. */

const SIEGES = 127, MAJ = Math.floor(SIEGES / 2) + 1;      // 64
const PARTIS = ["PQ", "PLQ", "CAQ", "PCQ", "QS", "AUT"];
const NOMS = { PQ: "Parti québécois", PLQ: "Parti libéral", CAQ: "Coalition avenir Québec", PCQ: "Parti conservateur", QS: "Québec solidaire", AUT: "Autres et indépendants" };
const COUL = { PQ: "var(--pq)", PLQ: "var(--plq)", CAQ: "var(--caq)", PCQ: "var(--pcq)", QS: "var(--qs)", AUT: "var(--aut)" };
const RAFRAICHIR = 60;                                       // secondes entre deux lectures

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

// sigle d'Élections Québec → parti de la carte (« PCQ/CPQ » est le Parti canadien : rangé dans Autres)
function partiDe(abrev) {
  const a = String(abrev || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (a === "PQ") return "PQ";
  if (a.startsWith("PLQ")) return "PLQ";
  if (a.includes("CAQ")) return "CAQ";
  if (a === "QS") return "QS";
  if (a.startsWith("PCOQ") || /^PCQE/.test(a)) return "PCQ";
  return "AUT";
}

let PROJ_FN, DATA, PATH, ZOOM, svg, gZ, gRid, gSel, tip, resultats = null, candidatures = null, parRid = {}, sel = null, minuterie = null, demarre = false;
const PARAMS = new URLSearchParams(location.search);
const DEMO = sessionStorage.getItem("userRole") === "admin" && PARAMS.has("demo") ? Math.max(0, Math.min(100, +PARAMS.get("demo") || 40)) : null;

/* ---------- prédiction (projection Qc125 d'avant le vote) ---------- */
const PROJ_P = ["PQ", "PLQ", "CAQ", "PCQ", "QS"];          // ordre des parts dans data.json (ridings[].s)
let cartePred = false;                                       // carte entière de la prédiction (au lieu des résultats)
let prediction = sessionStorage.getItem("lvPrediction") === "1", gPred = null, ancrages = null, zoomK = 1;
// rang d'un parti dans la projection Qc125 d'une circonscription (0 = en tête) ; autres partis après les 5 principaux
function rangProjection(i, parti) {
  const r = DATA.ridings[i], j = PROJ_P.indexOf(parti);
  if (j < 0) return 99;
  return PROJ_P.map((_, k) => k).sort((a, b) => r.s[b] - r.s[a] || (r.o || []).indexOf(a) - (r.o || []).indexOf(b)).indexOf(j);
}
// gagnant prédit : plus grande part ; égalité départagée par l'ordre publié par Qc125 (ridings[].o)
function predit(i) {
  const r = DATA.ridings[i]; let w = r.o && r.o.length ? r.o[0] : 0;
  for (const j of (r.o && r.o.length ? r.o : PROJ_P.map((_, k) => k))) if (r.s[j] > r.s[w]) w = j;
  return PROJ_P[w];
}
// Pôle d'inaccessibilité (polylabel, Mapbox) : point le plus au cœur d'un polygone, même s'il est très irrégulier
function polylabel(rings, precision = 0.5){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings[0]){ minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const segDist2 = (px, py, a, b) => { let x = a[0], y = a[1], dx = b[0]-x, dy = b[1]-y;
    if (dx || dy){ const t = ((px-x)*dx + (py-y)*dy) / (dx*dx + dy*dy); if (t > 1){ x = b[0]; y = b[1]; } else if (t > 0){ x += dx*t; y += dy*t; } }
    dx = px-x; dy = py-y; return dx*dx + dy*dy; };
  const dist = (x, y) => { let inside = false, m = Infinity;       // distance signée au contour (positive dedans)
    for (const ring of rings) for (let i = 0, j = ring.length-1; i < ring.length; j = i++){
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]) + a[0]) inside = !inside;
      m = Math.min(m, segDist2(x, y, a, b)); }
    return (inside ? 1 : -1) * Math.sqrt(m); };
  const cell = (x, y, h) => { const d = dist(x, y); return {x, y, h, d, max: d + h*Math.SQRT2}; };
  const size = Math.min(maxX-minX, maxY-minY); if (!size) return [minX, minY, 0];
  let h = size/2, q = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) q.push(cell(x+h, y+h, h));
  let best = cell((minX+maxX)/2, (minY+maxY)/2, 0);
  while (q.length){
    q.sort((a, b) => b.max - a.max); const c = q.shift();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h/2; q.push(cell(c.x-h, c.y-h, h), cell(c.x+h, c.y-h, h), cell(c.x-h, c.y+h, h), cell(c.x+h, c.y+h, h));
  }
  return [best.x, best.y, best.d];
}

function ancrer() {
  if (ancrages) return ancrages;
  ancrages = DATA.ridingGeo.features.map(f => {
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    let best = [0, 0, -1];
    for (const p of polys) { const c = polylabel(p.map(ring => ring.map(xy => PROJ_FN(xy))), 0.3); if (c[2] > best[2]) best = c; }
    return { RID: f.properties.RID, x: best[0], y: best[1], r: best[2] };   // r : rayon libre autour du point
  });
  return ancrages;
}
function dessinerPrediction() {
  $("lvPred").setAttribute("aria-pressed", prediction);
  if (!gPred) return;
  gPred.style("display", prediction && !cartePred && !carteParticip ? null : "none");   // inutile sur la carte de prédiction
  if (!prediction || cartePred) return;
  // pas de chevauchement : au zoom actuel, on garde d'abord les pastilles des grandes circonscriptions
  // et on masque celles qui toucheraient une pastille déjà placée (elles réapparaissent en zoomant)
  const MIN = 14 / zoomK, gardes = [];
  for (const d of [...ancrer()].sort((a, b) => b.r - a.r))
    if (gardes.every(o => (o.x - d.x) ** 2 + (o.y - d.y) ** 2 >= MIN * MIN)) gardes.push(d);
  const g = gPred.selectAll("g.lv-pred").data(gardes, d => d.RID).join(enter => {
    const e = enter.append("g").attr("class", "lv-pred");
    e.append("circle").attr("class", "lv-pred-halo"); e.append("circle").attr("class", "lv-pred-pt"); return e; });
  g.attr("transform", d => `translate(${d.x},${d.y})`);
  // taille constante à l'écran : rayon et contour divisés par le zoom
  g.select(".lv-pred-halo").attr("r", 6.4 / zoomK);
  g.select(".lv-pred-pt").attr("r", 5 / zoomK).style("fill", d => COUL[predit(d.RID)]).style("stroke-width", 1.6 / zoomK);
}

/* ---------- participation ---------- */
let participation = null, partRid = {}, carteParticip = false;
// circonscription d'Élections Québec → rang dans DATA.ridings : par nom, sinon par numéro via la liste des candidatures
// (certains fichiers abrègent les noms, ex. « Riv.-du-Loup-Témis.-Basques »)
function rangDe(nom, code) {
  const parNom = Object.fromEntries(DATA.ridings.map((r, i) => [norm(r.n), i]));
  if (parNom[norm(nom)] != null) return parNom[norm(nom)];
  const k = (candidatures || []).find(x => +x.code_circonscription === +code);
  return k ? parNom[norm(k.nom_circonscription)] : null;
}
function indexerParticipation() {
  partRid = {};
  for (const c of participation?.circonscriptions || []) { const i = rangDe(c.nom, c.code); if (i != null) partRid[i] = c.taux; }
}
// taux d'une circonscription : final une fois tous ses bureaux dépouillés, sinon le préliminaire de la journée
function tauxParticip(i) {
  const c = parRid[i];
  if (c && c.isResultatsFinaux && +c.tauxParticipation) return { v: +c.tauxParticipation, final: true };
  return partRid[i] != null ? { v: partRid[i], final: false } : null;
}
// ensemble du Québec : taux final, sinon le préliminaire publié par Élections Québec, sinon la moyenne des circonscriptions
function tauxGlobal() {
  const st = resultats?.statistiques;
  if (st?.isResultatsFinaux && +st.tauxParticipationTotal) return { v: +st.tauxParticipationTotal, final: true };
  if (participation?.ensemble) return { v: participation.ensemble, final: false };
  const v = Object.values(partRid);
  return v.length ? { v: v.reduce((a, b) => a + b, 0) / v.length, final: false, moyenne: true } : null;
}
// dégradé noir → blanc : noir jusqu'à 10 %, blanc à partir de 90 %, linéaire (en clarté perçue) entre les deux
const clarteParticip = v => Math.max(0, Math.min(1, (v - 10) / 80));
const couleurParticip = v => d3.interpolateLab("#000000", "#ffffff")(clarteParticip(v));
let gPart = null;
// pourcentage écrit sur chaque circonscription, taille constante à l'écran ; masqué si elle est trop petite au zoom actuel
function dessinerEtiquettesParticip() {
  if (!gPart) return;
  gPart.style("display", carteParticip ? null : "none");
  if (!carteParticip) return;
  const pts = ancrer().map(a => ({ ...a, t: tauxParticip(a.RID) })).filter(a => a.t && a.r * zoomK >= 9);
  gPart.selectAll("text").data(pts, d => d.RID).join("text")
    .attr("x", d => d.x).attr("y", d => d.y).attr("dy", "0.35em").attr("text-anchor", "middle")
    .style("font-size", (10 / zoomK) + "px").style("fill", d => clarteParticip(d.t.v) > 0.55 ? "#000" : "#fff")
    .text(d => nf(d.t.v, 0) + " %");
}

function dessinerParticip() {
  const g = tauxGlobal(), el = $("lvParticip");
  $("lvCarteParticip").setAttribute("aria-pressed", carteParticip);
  el.setAttribute("aria-pressed", carteParticip);
  if (!g) { el.hidden = true; return; }
  el.hidden = false;
  const maj = participation?.maj ? new Date(participation.maj) : null;
  el.querySelector("b").textContent = nf(g.v, 1) + " %";
  el.querySelector("small").textContent = g.final ? "Participation finale"
    : `Participation préliminaire${g.moyenne ? " (moyenne)" : ""}${maj && !isNaN(maj) ? " · " + maj.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : ""}`;
}

/* ---------- suivi : circonscriptions suivies (étoiles + alertes) et tableau par parti ---------- */
const SERRE = 5;                                             // lutte serrée : moins de 5 points d'écart
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };
// circonscriptions suivies, par parti : { QS: ["Rosemont", …], … } (gardées d'une visite à l'autre)
let suivis = lireLS(localStorage, "lvSuivisParti", null);
let partiSuivi = lireLS(localStorage, "lvPartiSuivi", null); // parti du tableau « Suivi par parti »
let partiVue = lireLS(localStorage, "lvPartiVue", null);     // parti affiché dans « Suivies »
// la démo garde son propre journal : elle ne se mélange pas au direct
const K_JOURNAL = DEMO !== null ? "lvJournalDemo" : "lvJournal", K_CONNUS = DEMO !== null ? "lvConnusDemo" : "lvConnus";
let journal = lireLS(sessionStorage, K_JOURNAL, []);         // changements récents de la soirée
let connus = lireLS(sessionStorage, K_CONNUS, null);         // dernier meneur vu par circonscription suivie
// ancienne liste sans parti : chaque circonscription va au gagnant prédit
function preparerSuivis() {
  if (suivis) return;
  suivis = {};
  for (const n of lireLS(localStorage, "lvSuivies", [])) {
    const i = DATA.ridings.findIndex(r => r.n === n); if (i < 0) continue;
    (suivis[predit(i)] ||= []).push(n);
  }
  ecrireLS(localStorage, "lvSuivisParti", suivis);
}
/* Enregistrement : invité → ce navigateur seulement ; compte connecté → serveur (api/suivis.php), avec copie locale.
   Premier passage d'un appareil : union de ce qui est déjà ici et de ce qui est sur le serveur (rien ne se perd),
   ensuite le serveur fait foi (les changements faits sur un autre appareil arrivent au retour sur l'onglet). */
const COMPTE = !!sessionStorage.getItem("userRole") && sessionStorage.getItem("userRole") !== "guest";
const CLE_SYNC = "lvSuivisSync_" + (sessionStorage.getItem("userId") || sessionStorage.getItem("userName") || "compte");
let envoi = null, envoiEnCours = false;
function envoyerSuivis() {
  envoiEnCours = true;
  return fetch("api/suivis.php", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suivis }) })
    .catch(() => {}).finally(() => { envoiEnCours = false; });
}
function sauverSuivis() {
  ecrireLS(localStorage, "lvSuivisParti", suivis);           // copie locale (invité, hors ligne)
  if (!COMPTE) return;
  clearTimeout(envoi); envoiEnCours = true;
  envoi = setTimeout(envoyerSuivis, 400);
}
async function chargerSuivisServeur() {
  if (!COMPTE || !DATA || envoiEnCours) return;
  try {
    const r = await fetch("api/suivis.php", { credentials: "include", cache: "no-store" });
    if (!r.ok || envoiEnCours) return;                       // serveur indisponible : on garde la copie locale
    const d = await r.json();
    preparerSuivis();
    const serveur = d.exists && d.data && d.data.suivis && typeof d.data.suivis === "object" ? d.data.suivis : null;
    let fusion;
    if (serveur && lireLS(localStorage, CLE_SYNC, false)) fusion = serveur;
    else {                                                   // première fois sur cet appareil : union
      fusion = {};
      for (const P of PROJ_P) { const u = [...new Set([...((serveur || {})[P] || []), ...(suivis[P] || [])])]; if (u.length) fusion[P] = u; }
    }
    const change = JSON.stringify(fusion) !== JSON.stringify(suivis);
    suivis = fusion; ecrireLS(localStorage, "lvSuivisParti", suivis);
    if (!serveur || JSON.stringify(fusion) !== JSON.stringify(serveur)) await envoyerSuivis();
    ecrireLS(localStorage, CLE_SYNC, true);
    if (change) { dessinerSuivi(); dessinerPanneau(); }
  } catch { /* hors ligne : copie locale */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) chargerSuivisServeur(); });

const estSuiviePour = (i, P) => !!suivis && (suivis[P] || []).includes(DATA.ridings[i].n);
const estSuivie = i => PROJ_P.some(P => estSuiviePour(i, P));
const partisDe = i => PROJ_P.filter(P => estSuiviePour(i, P));
const sigle = o => o.p === "AUT" ? o.lab : o.p;

// état d'une circonscription : résultats dès que le dépouillement a commencé, sinon projection Qc125
// proj = true : toujours la projection, même pendant le dépouillement (bouton « Prédictions » des suivies)
function etat(i, proj = false) {
  const c = parRid[i];
  if (!proj && c && c.tete) return { res: true, final: !!c.isResultatsFinaux, frac: c.frac,
    ordre: c.cands.map(k => ({ p: k.parti, lab: k.abreviationPartiPolitique, v: +k.tauxVote || 0, n: +k.nbVoteTotal || 0 })) };
  const r = DATA.ridings[i];
  return { res: false, final: false, frac: 0, ordre: PROJ_P.map((p, j) => ({ p, lab: p, v: r.s[j] })).sort((a, b) => b.v - a.v) };
}
// position d'un parti dans une circonscription : groupe du tableau, écart (points) et adversaire
function position(i, P, proj = false) {
  const e = etat(i, proj), [a, b] = e.ordre, moi = e.ordre.find(o => o.p === P);
  // ecart : en points ; voix : écart en nombre de votes (résultats seulement)
  if (!moi) return { e, g: "loin", ecart: -a.v, voix: e.res ? -a.n : null, contre: a };
  if (a.p === P) { const ecart = moi.v - (b ? b.v : 0); return { e, g: e.final ? "elus" : ecart < SERRE ? "avSerre" : "avance", ecart, voix: e.res ? moi.n - (b ? b.n : 0) : null, contre: b }; }
  const ecart = moi.v - a.v;
  return { e, g: e.final ? "perdu" : -ecart < SERRE ? "retSerre" : "loin", ecart, voix: e.res ? moi.n - a.n : null, contre: a };
}
const bureaux = e => !e.res ? "proj." : e.final ? "final" : nf(100 * e.frac, 0) + " % bur.";
const etoile = (i, P) => { const on = estSuiviePour(i, P);
  return `<button type="button" class="lv-etoile" data-suivre="${i}" data-parti="${P}" aria-pressed="${on}" aria-label="${on ? "Ne plus suivre" : "Suivre"} ${esc(DATA.ridings[i].n)} pour ${P}">${on ? "★" : "☆"}</button>`; };
function ligne(i, pos, P) {
  const lead = pos.e.ordre[0], pts = nf(Math.abs(pos.ecart), 1) + " pt";
  const txt = Math.abs(pos.ecart) < 0.05 && pos.contre ? `égalité avec ${esc(sigle(pos.ecart >= 0 ? pos.contre : lead))}`
    : pos.ecart >= 0 ? `+${pts}${pos.contre ? " sur " + esc(sigle(pos.contre)) : ""}` : `−${pts} vs ${esc(sigle(pos.contre))}`;
  return `<li class="lv-ligne" data-rid="${i}" tabindex="0">${etoile(i, P)}<span class="lv-nom" style="--c:${COUL[lead.p]}"><i></i>${esc(DATA.ridings[i].n)}</span>`
    + `<span class="lv-ecart ${pos.ecart < 0 ? "neg" : ""}">${txt}</span><span class="lv-bur">${bureaux(pos.e)}</span></li>`;
}

// statut d'une circonscription suivie pour un parti
// pendant le dépouillement, les suivies se classent en NOMBRE DE VOTES d'écart (serrée : moins de 1 000 voix) ;
// celles sans résultat restent à part (« Pas encore de résultats », selon la projection, en points)
const SERRE_VOIX = 1000, TRANCHE_VOIX = 250;
const STATUTS = { serre: "Serrées", avance: "En avance", retard: "En retard", fini: "Terminées", attente: "Pas encore de résultats" };
const cleTri = pos => pos.voix != null ? pos.voix : pos.ecart;      // votes si résultats, sinon points de projection
const txtEcart = (pos, P) => pos.voix != null
  ? (pos.voix === 0 ? `${P} à égalité` : `${P} ${pos.voix > 0 ? "+" : "−"}${nf(Math.abs(pos.voix))} voix`)
  : (Math.abs(pos.ecart) < 0.05 ? `${P} à égalité` : `${P} ${pos.ecart >= 0 ? "+" : "−"}${nf(Math.abs(pos.ecart), 1)} pt`);
function statut(i, P, proj = false) {
  const pos = position(i, P, proj);
  if (pos.e.final) return { g: "fini", lab: (pos.voix ?? pos.ecart) >= 0 ? "Remportée" : "Perdue", pos };
  if (pos.e.res) {
    if (Math.abs(pos.voix) < SERRE_VOIX) return { g: "serre", lab: "Serrée", pos };
    return pos.voix > 0 ? { g: "avance", lab: "En avance", pos } : { g: "retard", lab: "En retard", pos };
  }
  if (!proj && Object.values(parRid).some(c => c.tete)) return { g: "attente", lab: "Pas encore de résultats", pos };
  if (Math.abs(pos.ecart) < SERRE) return { g: "serre", lab: "Serrée", pos };
  return pos.ecart > 0 ? { g: "avance", lab: pos.e.res ? "En avance" : "Prévue gagnante", pos } : { g: "retard", lab: pos.e.res ? "En retard" : "Prévue perdante", pos };
}
// circonscription suivie : seulement le nom (bordure : couleur du meneur) ; le détail s'affiche au survol
let suivisProj = lireLS(localStorage, "lvSuivisProj", false);  // « Prédictions » : chiffres de la projection Qc125 même pendant le vote
function troisPremiers(i, e) {
  const r = DATA.ridings[i], c = parRid[i];
  if (e.res) return c.cands.slice(0, 3).map(k => ({ p: k.parti, lab: sigle({ p: k.parti, lab: k.abreviationPartiPolitique }), nom: `${k.prenom} ${k.nom}`, v: +k.tauxVote || 0, n: k.nbVoteTotal }));
  const cand = (candidatures || []).filter(k => norm(k.nom_circonscription) === norm(r.n));
  return e.ordre.slice(0, 3).map(o => { const k = cand.find(x => partiDe(x.abreviation_parti) === o.p);
    return { p: o.p, lab: o.p, nom: k ? `${k.prenom_bulletin_vote} ${k.nom_bulletin_vote}` : NOMS[o.p], v: o.v, n: null }; });
}
let suivisDetail = lireLS(localStorage, "lvSuivisDetail", false); // « Détaillé » : rectangles avec candidats, pourcentages et votes
function vignette(i, P) {
  const st = statut(i, P, suivisProj), e = st.pos.e;
  if (suivisDetail) {
    const pos = st.pos;
    return `<article class="lv-vigd" data-rid="${i}" tabindex="0" style="--c:${COUL[e.ordre[0].p]}">
      <header><b>${esc(DATA.ridings[i].n)}</b>${etoile(i, P)}</header>
      <div class="lv-vigd-etat"><span>${e.res ? (e.final ? "Final" : nf(100 * e.frac, 0) + " % bur.") : "Projection"}</span>`
      + `<span class="lv-st st-${st.g}${pos.ecart < 0 ? " neg" : ""}" style="--c:${COUL[P]}">${st.lab} · ${txtEcart(pos, P)}</span></div>
      <ol>${troisPremiers(i, e).map(k => `<li class="${k.p === P ? "moi" : ""}" style="--c:${COUL[k.p]}"><i></i><span>${esc(k.nom)}</span><em>${esc(k.lab)}</em>`
        + `<b>${nf(k.v, 1)} %</b><small>${k.n != null ? nf(k.n) : ""}</small></li>`).join("")}</ol>
    </article>`;
  }
  return `<button type="button" class="lv-vig${e.ordre[0].p === P ? " mene" : ""}" data-rid="${i}" data-vp="${P}" style="--c:${COUL[e.ordre[0].p]}">${esc(DATA.ridings[i].n)}</button>`;
}
function detailVignette(i, P) {
  const st = statut(i, P, suivisProj), pos = st.pos, e = pos.e;
  return `<b>${esc(DATA.ridings[i].n)}</b><small>${e.res ? (e.final ? "Résultat final" : nf(100 * e.frac, 0) + " % des bureaux dépouillés") : "Projection Qc125"} · ${st.lab} · ${txtEcart(pos, P)}`
    + `${pos.voix != null ? ` (${pos.ecart >= 0 ? "+" : "−"}${nf(Math.abs(pos.ecart), 1)} pt)` : ""}</small>`
    + `<ol>${troisPremiers(i, e).map(k => `<li class="${k.p === P ? "moi" : ""}" style="--c:${COUL[k.p]}"><i></i><span>${esc(k.nom)}</span><em>${esc(k.lab)}</em><b>${nf(k.v, 1)} %</b><small>${k.n != null ? nf(k.n) : ""}</small></li>`).join("")}</ol>`;
}
// infobulle des circonscriptions suivies (survol ou focus clavier)
function bulleSuivi(el) {
  const t = $("lvVTip");
  if (!el) { t.hidden = true; return; }
  t.innerHTML = detailVignette(+el.dataset.rid, el.dataset.vp); t.hidden = false;
  const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8;
  if (y < 8) y = r.bottom + 8;
  t.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + "px"; t.style.top = y + "px";
}
document.addEventListener("mouseover", e => { const v = e.target.closest?.(".lv-vig"); if (v) bulleSuivi(v); });
document.addEventListener("mouseout", e => { const v = e.target.closest?.(".lv-vig"); if (v && !v.contains(e.relatedTarget)) bulleSuivi(null); });
document.addEventListener("focusin", e => { const v = e.target.closest?.(".lv-vig"); bulleSuivi(v || null); });
addEventListener("scroll", () => bulleSuivi(null), { passive: true });

// luttes serrées : une rangée par écart arrondi (+3, +2, +1, égalité, −1, −2…), la plus grande avance en haut
// en votes : tranches de 250 voix (+750 à 999, +500 à 749 … égalité … −500 à 749)
function rangees(ids, V) {
  const par = new Map();
  const voix = ids.some(i => position(i, V, suivisProj).voix != null);
  for (const i of ids) {
    const pos = position(i, V, suivisProj);
    const k = voix ? (pos.voix === 0 ? 0 : Math.sign(pos.voix) * (Math.floor(Math.abs(pos.voix) / TRANCHE_VOIX) + 1)) : (Math.round(pos.ecart) || 0);
    if (!par.has(k)) par.set(k, []); par.get(k).push(i);
  }
  const etiquette = k => k === 0 ? "Égalité" : voix
    ? `${k > 0 ? "+" : "−"}${nf((Math.abs(k) - 1) * TRANCHE_VOIX || 1)} à ${nf(Math.abs(k) * TRANCHE_VOIX - 1)}`
    : (k > 0 ? "+" : "−") + Math.abs(k) + (Math.abs(k) > 1 ? " pts" : " pt");
  return [...par.entries()].sort((a, b) => b[0] - a[0]).map(([k, l]) =>
    `<div class="lv-rangee${voix ? " voix" : ""}"><span class="lv-rangee-ecart ${k > 0 ? "pos" : k < 0 ? "neg" : "nul"}" style="--c:${COUL[V]}">${etiquette(k)}${voix && k ? "<small>voix</small>" : ""}</span>`
    + `<div class="lv-vigs${suivisDetail ? " det" : ""}">${l.map(i => vignette(i, V)).join("")}</div></div>`).join("");
}

function dessinerSuivi() {
  if (!DATA) return;
  preparerSuivis();
  dessinerContoursSuivis();
  // --- circonscriptions suivies, par parti : de la plus grande avance au plus grand retard
  const nb = P => (suivis[P] || []).filter(n => DATA.ridings.some(r => r.n === n)).length;
  const V = partiVue && PROJ_P.includes(partiVue) ? partiVue : PROJ_P.find(P => nb(P)) || "PQ";
  const ids = DATA.ridings.map((_, i) => i).filter(i => estSuiviePour(i, V)).sort((a, b) => cleTri(position(b, V, suivisProj)) - cleTri(position(a, V, suivisProj)));   // +3, +2, +1, 0, −1, −2…
  $("lvSuivisProj").setAttribute("aria-pressed", suivisProj);
  $("lvSuivisDetail").setAttribute("aria-pressed", suivisDetail);
  document.querySelector("#vue-live .lv-grid").classList.toggle("suivi-det", suivisDetail);
  $("lvSuiviesChoix").innerHTML = PROJ_P.map(p => `<button type="button" data-pv="${p}" style="--c:${COUL[p]}" aria-pressed="${p === V}">${p}${nb(p) ? ` <small>${nb(p)}</small>` : ""}</button>`).join("");
  // regroupées par statut : serrées d'abord (celles à surveiller), puis en avance, en retard, terminées
  const gs = { serre: [], avance: [], retard: [], fini: [], attente: [] };
  for (const i of ids) gs[statut(i, V, suivisProj).g].push(i);
  const avantResS = suivisProj || !Object.values(parRid).some(c => c.tete);
  const resume = ids.length ? `<div class="lv-suiv-resume"><b>${NOMS[V]}</b> · ${ids.length} suivie${ids.length > 1 ? "s" : ""}`
    + Object.entries(gs).filter(([, l]) => l.length).map(([g, l]) => ` · <span class="lv-st st-${g}" style="--c:${COUL[V]}">${l.length} ${STATUTS[g].toLowerCase()}</span>`).join("")
    + (avantResS ? ` <span class="lv-muted">(selon la projection Qc125)</span>` : "") + `</div>` : "";
  const cartes = ids.length
    ? Object.entries(gs).filter(([, l]) => l.length).map(([g, l]) => `<section class="lv-suiv-grp"><h4>${STATUTS[g]}${g === "serre" ? ` <small>${avantResS ? `moins de ${SERRE} pts d'écart` : `moins de ${nf(SERRE_VOIX)} voix d'écart`}</small>` : g === "attente" ? ` <small>selon la projection Qc125</small>` : ""}</h4>`
      + (g === "serre" ? rangees(l, V) : `<div class="lv-vigs${suivisDetail ? " det" : ""}">${l.map(i => vignette(i, V)).join("")}</div>`) + `</section>`).join("")
    : `<p class="lv-muted lv-vide">Aucune circonscription suivie pour ${NOMS[V]}.<br>Pour en ajouter : clique sur ☆ dans le tableau « Suivi par parti » ci-dessous (avec ${V} choisi), ou sur « Suivre pour ${V} » dans la fiche d'une circonscription.</p>`;
  const jr = journal.length ? `<aside class="lv-suiv-journal"><h4>Changements récents <button type="button" class="lv-effacer" id="lvEffacerJournal">Effacer</button></h4><ul class="lv-journal">${journal.slice(0, 8).map(j =>
      `<li><time>${esc(j.h)}</time>${esc(j.txt)}</li>`).join("")}</ul>`
    + (journal.length > 8 ? `<details><summary>${journal.length - 8} plus ancien${journal.length - 8 > 1 ? "s" : ""}</summary><ul class="lv-journal">${journal.slice(8).map(j =>
      `<li><time>${esc(j.h)}</time>${esc(j.txt)}</li>`).join("")}</ul></details>` : "") + `</aside>` : "";
  $("lvSuivies").innerHTML = resume + `<div class="lv-suiv-corps${jr ? " avec-journal" : ""}"><div class="lv-suiv-cartes">${cartes}</div>${jr}</div>`;
  // --- tableau par parti
  const s = sieges(), tot = p => s[p].elus + s[p].avance;
  // parti par défaut : celui qui mène en sièges, ou avant les résultats celui qui en a le plus dans la projection
  const nPred = {}; DATA.ridings.forEach((_, i) => { const p = predit(i); nPred[p] = (nPred[p] || 0) + 1; });
  const P = partiSuivi || [...PROJ_P].sort((a, b) => tot(b) - tot(a) || (nPred[b] || 0) - (nPred[a] || 0))[0];
  partiCourant = P;
  $("lvPPChoix").innerHTML = PROJ_P.map(p => `<button type="button" data-pp="${p}" style="--c:${COUL[p]}" aria-pressed="${p === P}">${p}</button>`).join("");
  const grp = { elus: [], avSerre: [], retSerre: [], avance: [], perdu: [], loin: [] };
  DATA.ridings.forEach((_, i) => { const pos = position(i, P); grp[pos.g].push([i, pos]); });
  for (const k in grp) grp[k].sort((x, y) => y[1].ecart - x[1].ecart);   // +3, +2, +1, 0, −1, −2…
  const avantRes = !Object.values(parRid).some(c => c.tete), menes = grp.elus.length + grp.avSerre.length + grp.avance.length;
  // garde les groupes ouverts/fermés par l'utilisateur d'un rendu à l'autre
  const etatsOuv = Object.fromEntries([...$("lvParParti").querySelectorAll("details[data-g]")].map(d => [d.dataset.g, d.open]));
  const bloc = (titre, liste, ouvert, note = "", g = titre.slice(0, 12)) => `<details class="lv-sg" data-g="${esc(g)}" ${(etatsOuv[g] ?? ouvert) && liste.length ? "open" : ""}><summary><span>${titre}</span><small>${liste.length}</small></summary>`
    + (liste.length ? `${note}<ul class="lv-lignes">${liste.map(([i, pos]) => ligne(i, pos, P)).join("")}</ul>` : "") + `</details>`;
  $("lvParParti").innerHTML = `<p class="lv-muted">${avantRes ? `Avant le dépouillement : écarts selon la projection Qc125. ` : ""}<b style="color:var(--ink)">${NOMS[P]}</b> : `
      + `${avantRes ? "" : `${grp.elus.length} élu${grp.elus.length > 1 ? "s" : ""}, `}${menes - grp.elus.length} ${avantRes ? "prévue" + (menes > 1 ? "s" : "") : "en avance"} `
      + `(dont ${grp.avSerre.length} serrée${grp.avSerre.length > 1 ? "s" : ""}) et ${grp.retSerre.length} à moins de ${SERRE} points. `
      + `Plafond : <b style="color:var(--ink)">${menes + grp.retSerre.length}</b> sièges ; plancher : <b style="color:var(--ink)">${menes - grp.avSerre.length}</b>.</p>`
    + bloc(`En avance de moins de ${SERRE} pts — à risque`, grp.avSerre, true)
    + bloc(`En retard de moins de ${SERRE} pts — à portée`, grp.retSerre, true)
    + (avantRes ? "" : bloc("Élu·e·s", grp.elus, false))
    + bloc(avantRes ? "Prévues confortables" : "En avance confortable", grp.avance, false)
    + bloc("Hors de portée", [...grp.perdu, ...grp.loin], false, `<p class="lv-muted">Perdues ou en retard de ${SERRE} points et plus.</p>`);
}

// après chaque lecture : avertit des changements dans les circonscriptions suivies
function surveiller() {
  // direct, avant les premiers résultats : on repart à zéro (efface ce qu'un essai ou la démo aurait laissé)
  if (DEMO === null && !Object.values(parRid).some(c => c.tete)) {
    if (journal.length || !connus || Object.keys(connus).length) { journal = []; connus = {}; ecrireLS(sessionStorage, K_JOURNAL, journal); ecrireLS(sessionStorage, K_CONNUS, connus); }
    return;
  }
  const vu = {};
  for (let i = 0; i < DATA.ridings.length; i++) {
    if (!estSuivie(i)) continue;
    const e = etat(i); if (!e.res) continue;
    vu[DATA.ridings[i].n] = { p: e.ordre[0].p, lab: sigle(e.ordre[0]), f: e.final, i, pour: partisDe(i).join(", ") };
  }
  if (connus) for (const [n, v] of Object.entries(vu)) {
    const avant = connus[n];
    if (!avant) alerter(v.i, v.p, `${n} : premiers résultats, ${v.lab} en avance`, v.pour);
    else if (avant.lab !== v.lab) alerter(v.i, v.p, `${n} : ${v.lab} passe devant ${avant.lab}`, v.pour);
    else if (v.f && !avant.f) alerter(v.i, v.p, `${n} : ${v.lab} remporte la circonscription`, v.pour);
  }
  connus = { ...(connus || {}), ...vu };
  ecrireLS(sessionStorage, K_CONNUS, connus);
}
function alerter(i, p, txt, pour) {
  const h = new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  journal.unshift({ h, txt }); journal = journal.slice(0, 30); ecrireLS(sessionStorage, K_JOURNAL, journal);
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", COUL[p]); el.setAttribute("role", "status");
  el.innerHTML = `${esc(txt)}<small>${h} · suivie pour ${esc(pour)} · clique pour la voir</small>`;
  el.addEventListener("click", () => { el.remove(); choisir(i); $("lvCarte").scrollIntoView({ behavior: "smooth", block: "center" }); });
  $("lvAlertes").prepend(el);
  setTimeout(() => el.remove(), 15000);
}
let partiCourant = null;
function basculerSuivi(i, P) {
  preparerSuivis();
  const n = DATA.ridings[i].n, liste = suivis[P] || [];
  suivis[P] = estSuiviePour(i, P) ? liste.filter(x => x !== n) : [...liste, n];
  sauverSuivis();
  if (estSuiviePour(i, P)) { partiVue = P; ecrireLS(localStorage, "lvPartiVue", P); }
  if (connus && estSuivie(i)) { const e = etat(i); if (e.res) connus[n] = { p: e.ordre[0].p, lab: sigle(e.ordre[0]), f: e.final }; }  // pas d'alerte pour l'état actuel
  dessinerSuivi(); dessinerPanneau();
}
// ajouter/retirer un suivi redessine des blocs au-dessus du bouton : on garde le bouton cliqué au même endroit à l'écran
function garderPlace(b, faire) {
  const zone = b.closest("[id]"), zoneId = zone && zone.id, sel_ = `[data-suivre="${b.dataset.suivre}"][data-parti="${b.dataset.parti}"]`;
  const avant = b.getBoundingClientRect().top, avantZone = zone ? zone.getBoundingClientRect().top : 0;
  faire();
  const z = zoneId && document.getElementById(zoneId), nb = z && z.querySelector(sel_);
  const dy = nb ? nb.getBoundingClientRect().top - avant : z ? z.getBoundingClientRect().top - avantZone : 0;
  if (dy) window.scrollBy(0, dy);
  if (nb) nb.focus({ preventScroll: true });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-suivre]");
  if (b) { e.stopPropagation(); garderPlace(b, () => basculerSuivi(+b.dataset.suivre, b.dataset.parti)); return; }
  if (e.target.closest("#lvEffacerJournal")) { journal = []; ecrireLS(sessionStorage, K_JOURNAL, journal); dessinerSuivi(); return; }
  if (e.target.closest("#lvSuivisDetail")) { suivisDetail = !suivisDetail; ecrireLS(localStorage, "lvSuivisDetail", suivisDetail); bulleSuivi(null); dessinerSuivi(); return; }
  if (e.target.closest("#lvSuivisProj")) { suivisProj = !suivisProj; ecrireLS(localStorage, "lvSuivisProj", suivisProj); bulleSuivi(null); dessinerSuivi(); return; }
  const pv = e.target.closest("[data-pv]");
  if (pv) { partiVue = pv.dataset.pv; ecrireLS(localStorage, "lvPartiVue", partiVue); dessinerSuivi(); return; }
  const pp = e.target.closest("[data-pp]");
  if (pp) { partiSuivi = pp.dataset.pp; ecrireLS(localStorage, "lvPartiSuivi", partiSuivi); dessinerSuivi(); return; }
  const l = e.target.closest(".lv-ligne, .lv-vig, .lv-vigd");
  if (l) choisir(+l.dataset.rid, false);                     // sélectionne sans faire défiler la page
});
// « Suivi par parti » : repliée par défaut, l'état choisi est gardé
function replierPP(ouvert) {
  $("lvPPSection").toggleAttribute("data-ferme", !ouvert);
  $("lvPPReplier").setAttribute("aria-expanded", ouvert);
}
replierPP(lireLS(localStorage, "lvPPOuvert", false));
$("lvPPReplier").addEventListener("click", () => { const o = $("lvPPReplier").getAttribute("aria-expanded") !== "true"; replierPP(o); ecrireLS(localStorage, "lvPPOuvert", o); });
document.addEventListener("keydown", e => {
  const l = e.target.closest?.(".lv-ligne, .lv-vigd");
  if (l && (e.key === "Enter" || e.key === " ") && e.target === l) { e.preventDefault(); choisir(+l.dataset.rid, false); }
});

/* ---------- photos des candidats (sites des partis, voir outils/photos.py) ---------- */
let PHOTOS = {};
// photo ronde cerclée de la couleur du parti ; initiales si pas de photo ou si l'image ne se charge pas
function avatar(parti, circ, prenom, nom) {
  const ini = esc(((prenom || "").trim()[0] || "") + ((nom || "").trim()[0] || "")).toUpperCase();
  const url = (PHOTOS[parti] || {})[circ];
  const repli = `<span class="lv-ava lv-ini" style="--c:${COUL[parti]}" aria-hidden="true">${ini}</span>`;
  if (!url) return repli;
  return `<img class="lv-ava" style="--c:${COUL[parti]}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-nom="${esc(`${prenom || ""} ${nom || ""}`.trim())}" data-parti="${parti}"
    onerror="this.outerHTML=this.dataset.repli" data-repli="${esc(repli)}">`;
}

// survol d'une photo : la même photo en grand, à côté
function grandePhoto(img) {
  const z = $("lvPhoto");
  if (!img) { z.hidden = true; return; }
  z.style.setProperty("--c", COUL[img.dataset.parti] || "var(--rule)");
  z.innerHTML = `<img src="${esc(img.currentSrc || img.src)}" alt="" referrerpolicy="no-referrer"><span>${esc(img.dataset.nom || "")}</span>`;
  z.hidden = false;
  const r = img.getBoundingClientRect(), w = z.offsetWidth, h = z.offsetHeight;
  let x = r.left - w - 12; if (x < 8) x = r.right + 12;
  z.style.left = Math.min(innerWidth - w - 8, x) + "px";
  z.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2)) + "px";
}
document.addEventListener("mouseover", e => { const im = e.target.closest?.("img.lv-ava"); if (im) grandePhoto(im); });
document.addEventListener("mouseout", e => { if (e.target.closest?.("img.lv-ava")) grandePhoto(null); });
addEventListener("scroll", () => grandePhoto(null), { passive: true });

/* ---------- chargement ---------- */
async function lire(type) {
  const q = type === "resultats" && DEMO !== null ? `type=demo&p=${DEMO}` : `type=${type}`;
  const r = await fetch(`api/live.php?${q}`, { credentials: "include", cache: "no-store" });
  if (!r.ok && r.status !== 503) throw new Error(r.status === 401 ? "Session expirée : reconnecte-toi." : `Erreur ${r.status}`);
  return r.json();
}

// décompte jusqu'à la prochaine lecture automatique (affiché dans le bouton « Mettre à jour »)
let prochaine = 0;
function afficherDecompte() {
  const reste = Math.max(0, Math.ceil((prochaine - Date.now()) / 1000));
  $("lvDecompte").textContent = document.hidden ? "en pause" : reste + " s";
  $("lvMaj").style.setProperty("--fait", (1 - reste / RAFRAICHIR).toFixed(3));
  $("lvMaj").title = `Lecture automatique toutes les ${RAFRAICHIR} s · prochaine dans ${reste} s`;
}
async function actualiser() {
  prochaine = Date.now() + RAFRAICHIR * 1000;
  $("lvEtat").textContent = "Mise à jour…";
  lire("participation").then(d => { participation = d && d.disponible ? d : participation; indexerParticipation(); dessinerParticip(); if (carteParticip) { dessinerCarte(); dessinerPanneau(); } }).catch(() => {});
  try {
    const d = await lire("resultats");
    resultats = d && d.circonscriptions ? d : null;
    if (d && d.erreur) $("lvEtat").textContent = d.erreur;
    indexer(); surveiller(); dessiner();
  } catch (e) { $("lvEtat").textContent = e.message; }
}

// circonscriptions des résultats → rang dans DATA.ridings (appariement par nom, les numéros changent d'une carte à l'autre)
function indexer() {
  parRid = {};
  if (!resultats) return;
  for (const c of resultats.circonscriptions) {
    const i = rangDe(c.nomCirconscription, c.numeroCirconscription);
    if (i == null) continue;
    // par votes ; à égalité (début de soirée, 0 vote partout), dans l'ordre de la projection Qc125 de la circonscription
    const cands = (c.candidats || []).map(k => ({ ...k, parti: partiDe(k.abreviationPartiPolitique) }))
      .sort((a, b) => b.nbVoteTotal - a.nbVoteTotal || rangProjection(i, a.parti) - rangProjection(i, b.parti));
    const votes = cands.reduce((s, k) => s + (k.nbVoteTotal || 0), 0);
    parRid[i] = { ...c, cands, votes, tete: votes > 0 ? cands[0] : null, frac: c.nbBureauTotal ? c.nbBureauComplete / c.nbBureauTotal : 0 };
  }
}

/* ---------- interface ---------- */
function sieges() {
  const s = Object.fromEntries(PARTIS.map(p => [p, { elus: 0, avance: 0 }]));
  for (const c of Object.values(parRid)) if (c.tete) s[c.tete.parti][c.isResultatsFinaux ? "elus" : "avance"]++;
  return s;
}

function dessinerBarre() {
  const s = sieges(), tot = p => s[p].elus + s[p].avance;
  const ordre = PARTIS.filter(p => tot(p) > 0).sort((a, b) => tot(b) - tot(a) || PARTIS.indexOf(a) - PARTIS.indexOf(b));
  const pct = n => (100 * n / SIEGES) + "%";
  $("lvBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${pct(tot(p))};--c:${COUL[p]}" title="${NOMS[p]} : ${tot(p)} siège${tot(p) > 1 ? "s" : ""}">`
    + `<i class="lv-elus" style="width:${100 * s[p].elus / tot(p)}%"></i><b>${p === "AUT" ? "Aut." : p} ${tot(p)}</b></span>`).join("");
  // étiquette selon la place : « PQ 54 », sinon « 54 », sinon rien
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const lead = ordre[0];
  const decides = Object.values(parRid).filter(c => c.tete).length;
  $("lvSiegesTitre").textContent = !decides ? "Aucune circonscription dépouillée pour l'instant"
    : tot(lead) >= MAJ ? `${NOMS[lead]} : ${tot(lead)} sièges, au-delà de la majorité` : `${NOMS[lead]} en tête avec ${tot(lead)} sièges`;
  // légende par parti : sièges (élus + en avance) et vote national
  const vote = {};
  for (const p of resultats?.statistiques?.partisPolitiques || []) {
    const k = partiDe(p.abreviationPartiPolitique); vote[k] = (vote[k] || 0) + (+p.tauxVoteTotal || 0);
  }
  $("lvPartis").innerHTML = PARTIS.filter(p => tot(p) > 0 || vote[p] > 0.05).sort((a, b) => tot(b) - tot(a) || (vote[b] || 0) - (vote[a] || 0)).map(p =>
    `<div class="lv-parti" style="--c:${COUL[p]}"><i></i><span class="lv-pnom">${p === "AUT" ? "Autres" : p}</span>`
    + `<b>${tot(p)}</b><small>${s[p].elus} élu${s[p].elus > 1 ? "s" : ""} · ${s[p].avance} en avance</small><span class="lv-pvote">${vote[p] != null ? nf(vote[p], 1) + " %" : "—"}</span></div>`).join("");
}

function dessinerEtat() {
  const st = resultats?.statistiques;
  const banniere = $("lvBanniere");
  if (!resultats) {
    banniere.hidden = false;
    banniere.innerHTML = `Les résultats commenceront à s'afficher après la fermeture des bureaux de vote, le <b>5 octobre à 20 h</b>, et seront mis à jour toutes les 2 à 5 minutes. En attendant, clique sur une circonscription pour voir ses candidatures.`;
    $("lvEtat").textContent = "En attente des premiers résultats · vérification chaque minute";
    return;
  }
  banniere.hidden = !resultats.demo;
  if (resultats.demo) banniere.innerHTML = `<b>Démo</b> : élections 2022 rejouées à ${DEMO} % des bureaux dépouillés, sur la carte 2026 (certaines circonscriptions n'existaient pas en 2022). Retire « ?demo » de l'adresse pour revenir au direct.`;
  const maj = st?.iso8601DateMAJ ? new Date(String(st.iso8601DateMAJ).replace(",", ".")) : null;
  $("lvEtat").innerHTML = [
    st?.isResultatsFinaux ? "<b>Résultats finaux</b>" : "<b>Résultats préliminaires</b>",
    `bureaux dépouillés ${nf(st?.nbBureauVoteRempli)} / ${nf(st?.nbBureauVote)} (${nf(st?.tauxBureauVoteRempli, 1)} %)`,
    maj && !isNaN(maj) ? `données d'Élections Québec de ${maj.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}` : "",
  ].filter(Boolean).join(" · ");
}

function remplir(i) {
  if (carteParticip) { const t = tauxParticip(i); return t ? [couleurParticip(t.v), 1] : ["var(--soft)", 0.5]; }
  if (cartePred) {                                           // carte de prédiction : gagnant Qc125, plus foncé si sa part est forte
    const r = DATA.ridings[i], p = predit(i), v = r.s[PROJ_P.indexOf(p)];
    return [COUL[p], Math.max(0.35, Math.min(1, (v - 15) / 35))];
  }
  const c = parRid[i];
  if (!c || !c.tete) return ["var(--soft)", 1];
  return [COUL[c.tete.parti], c.isResultatsFinaux ? 1 : 0.35 + 0.6 * c.frac];
}

/* contour des circonscriptions suivies pour un parti (bouton « Suivis » de la carte) */
let gSuiv = null, carteSuivis = lireLS(localStorage, "lvCarteSuivis", null);
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  if (b) { b.setAttribute("aria-pressed", !!carteSuivis); b.style.setProperty("--c", carteSuivis ? COUL[carteSuivis] : ""); b.textContent = carteSuivis ? `★ Suivis : ${carteSuivis}` : "★ Suivis"; }
  if (!gSuiv || !suivis) return;
  const fs = carteSuivis ? DATA.ridingGeo.features.filter(f => estSuiviePour(f.properties.RID, carteSuivis)) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(fs, f => f.properties.RID).join("path").attr("class", "lv-suivi-halo").attr("d", PATH);
  gSuiv.selectAll("path.lv-suivi-ligne").data(fs, f => f.properties.RID).join("path").attr("class", "lv-suivi-ligne").attr("d", PATH).style("stroke", COUL[carteSuivis]);
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
function menuSuivis(ouvrir) {
  const m = $("lvMenuSuivis"), b = $("lvCarteSuivis");
  if (ouvrir) {
    preparerSuivis();
    const nb = P => (suivis[P] || []).length;
    m.innerHTML = PROJ_P.map(P => `<button type="button" role="menuitemradio" data-cs="${P}" aria-checked="${carteSuivis === P}" style="--c:${COUL[P]}"><i></i>${NOMS[P]}<small>${nb(P)}</small></button>`).join("")
      + `<button type="button" role="menuitemradio" data-cs="" aria-checked="${!carteSuivis}" style="--c:var(--rule)"><i></i>Aucun contour<small></small></button>`;
  }
  m.hidden = !ouvrir; b.setAttribute("aria-expanded", ouvrir);
  if (ouvrir) {                                              // reste dans la carte (qui coupe ce qui dépasse) : aligné à droite du bouton si besoin
    m.style.left = "0px";
    const carte = $("lvCarte").parentElement.getBoundingClientRect(), r = m.getBoundingClientRect();
    if (r.right > carte.right - 8) m.style.left = Math.max(carte.left + 8 - b.getBoundingClientRect().left, carte.right - 8 - r.right) + "px";
  }
  if (ouvrir) (m.querySelector('[aria-checked="true"]') || m.querySelector("button")).focus();
}
document.addEventListener("click", e => {
  if (e.target.closest("#lvCarteSuivis")) { menuSuivis($("lvMenuSuivis").hidden); return; }
  const c = e.target.closest("[data-cs]");
  if (c) { carteSuivis = c.dataset.cs || null; ecrireLS(localStorage, "lvCarteSuivis", carteSuivis); menuSuivis(false); dessinerContoursSuivis(); $("lvCarteSuivis").focus(); return; }
  if (!e.target.closest("#lvMenuSuivis") && $("lvMenuSuivis") && !$("lvMenuSuivis").hidden) menuSuivis(false);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("lvMenuSuivis") && !$("lvMenuSuivis").hidden) { menuSuivis(false); $("lvCarteSuivis").focus(); } });

function dessinerCarte() {
  gRid.selectAll("path").each(function (f) { const [col, op] = remplir(f.properties.RID); this.style.fill = col; this.style.fillOpacity = op; });
  dessinerEtiquettesParticip();
  dessinerContoursSuivis();
  const f = sel != null ? DATA.ridingGeo.features.find(x => x.properties.RID === sel) : null;
  gSel.selectAll("path").data(f ? [f] : []).join("path").attr("class", "lv-selline").attr("d", PATH);
}

function dessinerPanneau() {
  const p = $("lvPanneau");
  if (sel == null && carteParticip) {
    const g = tauxGlobal(), liste = Object.keys(DATA.ridings).map(i => [+i, tauxParticip(+i)]).filter(([, t]) => t).sort((a, b) => b[1].v - a[1].v);
    const ligne = ([i, t]) => `<li><span class="lv-pk" style="background:${couleurParticip(t.v)}"></span>${esc(DATA.ridings[i].n)}<b>${nf(t.v, 1)} %</b></li>`;
    p.innerHTML = `<span class="lv-eyebrow">Taux de participation</span><h3>${g ? `${nf(g.v, 2)} % dans l'ensemble du Québec` : "Pas encore de taux publié"}</h3>
      <p class="lv-muted">${g && g.final ? "Taux final." : "Taux préliminaire publié par Élections Québec pendant la journée du vote ; il peut différer du taux final."} Chaque circonscription passe au taux final une fois tous ses bureaux dépouillés.</p>
      <div class="lv-pgrad" role="img" aria-label="Dégradé : noir jusqu'à 10 %, blanc à partir de 90 %">${g ? `<i style="left:${g.v}%" title="Québec : ${nf(g.v, 1)} %"></i>` : ""}</div>
      <div class="lv-pechelle">${[10, 30, 50, 70, 90].map(v => `<span style="left:${v}%">${v} %</span>`).join("")}</div>`
      + (liste.length ? `<div class="lv-pcols"><div><span class="lv-eyebrow">Plus fortes</span><ol class="lv-plist">${liste.slice(0, 5).map(ligne).join("")}</ol></div>
        <div><span class="lv-eyebrow">Plus faibles</span><ol class="lv-plist">${liste.slice(-5).reverse().map(ligne).join("")}</ol></div></div>` : "")
      + `<p class="lv-muted lv-source">Source : Élections Québec (taux préliminaire de la journée, puis résultats).</p>`;
    return;
  }
  if (sel == null && cartePred) {
    const n = {}; DATA.ridings.forEach((_, i) => { const p = predit(i); n[p] = (n[p] || 0) + 1; });
    const ordre = Object.keys(n).sort((a, b) => n[b] - n[a]);
    p.innerHTML = `<span class="lv-eyebrow">Carte de prédiction</span><h3>${NOMS[ordre[0]]} : ${n[ordre[0]]} sièges prédits</h3>
      <p class="lv-muted">Chaque circonscription a la couleur du gagnant prédit par la projection Qc125 d'avant le vote ; plus la couleur est foncée, plus sa part prévue est forte. ${n[ordre[0]] >= MAJ ? "Majorité prédite." : `Il manquerait ${MAJ - n[ordre[0]]} siège${MAJ - n[ordre[0]] > 1 ? "s" : ""} pour la majorité (${MAJ}).`}</p>
      <div class="lv-partis lv-partis-pred">${ordre.map(pp => `<div class="lv-parti" style="--c:${COUL[pp]}"><i></i><span class="lv-pnom">${pp}</span><b>${n[pp]}</b><small>sièges prédits</small></div>`).join("")}</div>
      <p class="lv-muted">Clique sur « Carte prédiction » de nouveau pour revenir aux résultats.</p>`;
    return;
  }
  if (sel == null) {
    const n = Object.values(parRid).filter(c => c.tete).length;
    p.innerHTML = `<span class="lv-eyebrow">Circonscriptions</span><h3>Clique sur une circonscription</h3>
      <p class="lv-muted">Couleur : parti en tête. Plus la couleur est pâle, moins il y a de bureaux de vote dépouillés ; gris : aucun résultat.</p>
      <div class="lv-kv"><div><b>${n}</b><span>avec résultats</span></div><div><b>${SIEGES - n}</b><span>sans résultat</span></div><div><b>${MAJ}</b><span>majorité</span></div></div>`
      + (prediction ? (() => {
        const faits = Object.entries(parRid).filter(([, c]) => c.tete), justes = faits.filter(([i, c]) => c.tete.parti === predit(+i)).length;
        return `<p class="lv-muted lv-proj"><b>Pastille prédiction</b> : chaque pastille montre le gagnant prédit par la projection Qc125 d'avant le vote.`
          + (faits.length ? ` Elle est juste dans <b>${justes} / ${faits.length}</b> circonscriptions dépouillées.` : "") + `</p>`; })() : "");
    return;
  }
  const r = DATA.ridings[sel], c = parRid[sel], reg = DATA.regions.find(x => x.code === r.r)?.name || "";
  // avant les résultats : partis principaux dans l'ordre de leur projection Qc125 ici, puis les autres par nom
  const cand = (candidatures || []).filter(k => norm(k.nom_circonscription) === norm(r.n))
    .sort((a, b) => rangProjection(sel, partiDe(a.abreviation_parti)) - rangProjection(sel, partiDe(b.abreviation_parti))
      || String(a.nom_bulletin_vote).localeCompare(String(b.nom_bulletin_vote), "fr"));
  const sortant = (prenom, nom) => cand.some(k => k.depute_sortant === "O" && norm(k.nom_bulletin_vote) === norm(nom) && norm(k.prenom_bulletin_vote) === norm(prenom));
  let html = `<span class="lv-eyebrow">${esc(reg)}</span><h3>${esc(r.n)}</h3>`
    + `<div class="lv-suivre-pour"><span>Suivre pour</span>${PROJ_P.map(P => `<button type="button" class="lv-suivre" data-suivre="${sel}" data-parti="${P}" style="--c:${COUL[P]}" aria-pressed="${estSuiviePour(sel, P)}">${estSuiviePour(sel, P) ? "★" : "☆"} ${P}</button>`).join("")}</div>`;
  if (c && c.tete) {
    const [a, b] = c.cands, ecart = b ? a.nbVoteTotal - b.nbVoteTotal : a.nbVoteTotal;
    html += `<div class="lv-chips"><span class="lv-chip ${c.isResultatsFinaux ? "fin" : ""}">${c.isResultatsFinaux ? "Résultat final" : `${nf(c.nbBureauComplete)} / ${nf(c.nbBureauTotal)} bureaux (${nf(100 * c.frac, 0)} %)`}</span></div>
      <p class="lv-tete" style="--c:${COUL[a.parti]}"><b>${esc(a.prenom)} ${esc(a.nom)}</b> (${esc(a.parti === "AUT" ? a.abreviationPartiPolitique : a.parti)}) ${c.isResultatsFinaux ? "élu·e" : "en avance"}
        ${b ? `par ${nf(ecart)} voix (${nf(a.tauxVote - b.tauxVote, 1)} pt)` : ""}</p>
      <table class="lv-cands"><tbody>${c.cands.map(k => `<tr style="--c:${COUL[k.parti]}">
        <td>${avatar(k.parti, r.n, k.prenom, k.nom)}</td>
        <td><b>${esc(k.prenom)} ${esc(k.nom)}</b>${sortant(k.prenom, k.nom) ? ' <span class="lv-sortant">sortant·e</span>' : ""}<small>${esc(k.abreviationPartiPolitique)} · ${nf(k.nbVoteAvance)} par anticipation</small>
          <span class="lv-jauge"><i style="width:${Math.min(100, k.tauxVote)}%"></i></span></td>
        <td class="lv-num"><b>${nf(k.tauxVote, 1)} %</b><small>${nf(k.nbVoteTotal)}</small></td></tr>`).join("")}</tbody></table>
      <div class="lv-kv"><div><b>${tauxParticip(sel) ? nf(tauxParticip(sel).v, 1) + " %" : "—"}</b><span>participation${tauxParticip(sel)?.final ? "" : " (prélim.)"}</span></div><div><b>${nf(c.nbElecteurInscrit)}</b><span>inscrits</span></div>
        <div><b>${nf(c.nbVoteRejete)}</b><span>rejetés (${nf(c.tauxVoteRejete, 1)} %)</span></div></div>`;
  } else {
    const tp = tauxParticip(sel);
    html += `<div class="lv-chips"><span class="lv-chip">Aucun résultat pour l'instant</span>${tp ? `<span class="lv-chip">Participation préliminaire : ${nf(tp.v, 1)} %</span>` : ""}</div>`;
    if (cand.length) html += `<span class="lv-eyebrow">Candidatures (${cand.length})</span><ul class="lv-liste">${cand.map(k => {
      const pa = partiDe(k.abreviation_parti);
      return `<li style="--c:${COUL[pa]}">${avatar(pa, r.n, k.prenom_bulletin_vote, k.nom_bulletin_vote)}<span><b>${esc(k.prenom_bulletin_vote)} ${esc(k.nom_bulletin_vote)}</b>${k.depute_sortant === "O" ? ' <span class="lv-sortant">sortant·e</span>' : ""}<small>${esc(k.nom_parti || "Indépendant")}</small></span></li>`;
    }).join("")}</ul>`;
  }
  // projection Qc125 d'avant le vote, pour comparer
  const proj = ["PQ", "PLQ", "CAQ", "PCQ", "QS"].map((p, j) => [p, r.s[j]]).sort((x, y) => y[1] - x[1]).slice(0, 3);
  html += `<p class="lv-muted lv-proj">Projection Qc125 avant le vote : ${proj.map(([pp, v]) => `<b style="color:${COUL[pp]}">${pp}</b> ${nf(v)} %`).join(" · ")}</p>`;
  p.innerHTML = html;
}

function dessiner() { dessinerEtat(); dessinerBarre(); dessinerCarte(); dessinerPrediction(); dessinerPanneau(); dessinerSuivi(); }

function choisir(i, defiler = true) { sel = i; dessinerCarte(); dessinerPanneau(); if (defiler && innerWidth <= 900 && !document.querySelector(".lv-cartecard.lv-plein, .lv-cartecard:fullscreen")) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" }); }

function infobulle(e, f) {
  const i = f.properties.RID, r = DATA.ridings[i], c = parRid[i];
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = (e.clientX - box.left + 12) + "px"; tip.style.top = (e.clientY - box.top + 12) + "px";
  if (carteParticip) {
    const t = tauxParticip(i);
    tip.innerHTML = `<b>${esc(r.n)}</b>${t ? `Participation : ${nf(t.v, 1)} %<br><small>${t.final ? "taux final" : "taux préliminaire"}</small>` : "<small>Pas de taux publié</small>"}`;
    return;
  }
  if (cartePred) {
    const top = PROJ_P.map((p, j) => [p, r.s[j]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    tip.innerHTML = `<b>${esc(r.n)}</b>Prédiction : ${top.map(([p, v]) => `${p} ${nf(v)} %`).join(" · ")}<br><small>projection Qc125 d'avant le vote</small>`;
    return;
  }
  tip.innerHTML = `<b>${estSuivie(i) ? "★ " : ""}${esc(r.n)}</b>` + (prediction ? `<small>Prédiction : ${predit(i)}</small><br>` : "") + (c && c.tete ? `${c.cands.slice(0, 3).map(k => `${esc(k.parti === "AUT" ? k.abreviationPartiPolitique : k.parti)} ${nf(k.tauxVote, 0)} %`).join(" · ")}<br><small>${nf(100 * c.frac, 0)} % des bureaux</small>` : "<small>Aucun résultat</small>");
}

/* ---------- carte ---------- */
function construireCarte() {
  const MW = 600, MH = 704;
  for (const g of [DATA.ridingGeo, DATA.curRegionGeo].filter(Boolean)) for (const f of g.features)
    if (d3.geoArea(f) > 2 * Math.PI) { const rev = q => q.map(x => x.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
  const proj = PROJ_FN = d3.geoConicConformal().rotate([71.6, 0]).parallels([46, 60]).fitExtent([[12, 12], [MW - 12, 648]], DATA.curRegionGeo || DATA.ridingGeo);
  PATH = d3.geoPath(proj);
  svg = d3.select("#lvCarte").attr("viewBox", `0 0 ${MW} ${MH}`);
  gZ = svg.append("g");
  gRid = gZ.append("g");
  gRid.selectAll("path").data(DATA.ridingGeo.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => DATA.ridings[f.properties.RID].n)
    .on("click", (e, f) => choisir(f.properties.RID))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.RID); } })
    .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  if (DATA.curRegionGeo) gZ.append("g").selectAll("path").data(DATA.curRegionGeo.features).join("path").attr("class", "lv-reg").attr("d", PATH);
  gSuiv = gZ.append("g");
  gSel = gZ.append("g");
  gPred = gZ.append("g").attr("class", "lv-preds");
  gPart = gZ.append("g").attr("class", "lv-ptxt");
  ZOOM = d3.zoom().scaleExtent([1, 40]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => {
    gZ.attr("transform", e.transform);
    if ((prediction || carteParticip) && Math.abs(e.transform.k - zoomK) > 1e-3) { zoomK = e.transform.k; dessinerPrediction(); dessinerEtiquettesParticip(); }
    zoomK = e.transform.k;
  });
  svg.call(ZOOM).on("dblclick.zoom", null);
  // souris dans la carte : la molette zoome seulement, la page ne défile jamais (même au zoom minimum/maximum)
  svg.node().parentElement.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau, .lv-menu")) e.preventDefault(); }, { passive: false });
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  const vers = (lon0, lat0, lon1, lat1) => {
    const [x0, y0] = proj([lon0, lat1]), [x1, y1] = proj([lon1, lat0]);
    const k = Math.min(40, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  $("lvCarte").parentElement.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
    else if (z === "mtl") vers(-74.1, 45.33, -73.3, 45.75);
    else if (z === "qc") vers(-71.55, 46.68, -71.0, 47.0);
    else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
    else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
    else if (z === "plein") pleinEcran();
    else if (z === "cartepred" || z === "pred" || z === "particip") basculer(z);
  });
  // Pastille prédiction / Carte prédiction / Participation : une seule à la fois, ou aucune
  function basculer(z) {
      cartePred = z === "cartepred" && !cartePred;
      prediction = z === "pred" && !prediction;
      carteParticip = z === "particip" && !carteParticip;
      sessionStorage.setItem("lvPrediction", prediction ? "1" : "0");
      $("lvCartePred").setAttribute("aria-pressed", cartePred);
      dessinerCarte(); dessinerPrediction(); dessinerParticip(); dessinerPanneau();
  }
  $("lvParticip").addEventListener("click", () => { basculer("particip"); if (innerWidth <= 900) $("lvCarte").scrollIntoView({ behavior: "smooth", block: "start" }); });
  tip = $("lvTip");
  const carte = $("lvCarte").parentElement;
  const ecran = () => document.fullscreenElement || document.webkitFullscreenElement;
  // « Info » (plein écran seulement) : la fiche de circonscription passe par-dessus la carte, puis reprend sa place
  const repere = document.createComment("place de la fiche");
  const info = ouvrir => {
    const pan = $("lvPanneau");
    if (ouvrir && pan.parentElement !== carte) { pan.before(repere); carte.appendChild(pan); pan.classList.add("lv-panneau-plein"); }
    if (!ouvrir && pan.parentElement === carte) { repere.replaceWith(pan); pan.classList.remove("lv-panneau-plein"); }
    $("lvInfo").setAttribute("aria-pressed", ouvrir);
  };
  $("lvInfo").addEventListener("click", () => info($("lvInfo").getAttribute("aria-pressed") !== "true"));
  const etatPlein = () => {
    const on = !!ecran() || carte.classList.contains("lv-plein");
    $("lvPlein").setAttribute("aria-pressed", on);
    $("lvPlein").textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    if (!on) info(false);
  };
  function pleinEcran() {
    if (ecran()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (carte.classList.contains("lv-plein")) { carte.classList.remove("lv-plein"); document.body.classList.remove("lv-plein-actif"); etatPlein(); }
    else if (carte.requestFullscreen || carte.webkitRequestFullscreen) (carte.requestFullscreen || carte.webkitRequestFullscreen).call(carte);
    else { carte.classList.add("lv-plein"); document.body.classList.add("lv-plein-actif"); etatPlein(); }   // iPhone : couche fixe
  }
  document.addEventListener("fullscreenchange", etatPlein);
  document.addEventListener("webkitfullscreenchange", etatPlein);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && carte.classList.contains("lv-plein")) pleinEcran(); });
}

/* ---------- démarrage (au premier affichage de l'onglet) ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  try {
    DATA = await (await fetch("votes-quebec/data.json", { cache: "no-cache" })).json();
    construireCarte();
    fetch("votes-quebec/photos.json", { cache: "no-cache" }).then(x => x.ok ? x.json() : {}).then(d => { PHOTOS = d || {}; dessinerPanneau(); }).catch(() => {});
    lire("candidatures").then(d => { candidatures = d.liste || null; indexer(); indexerParticipation(); dessiner(); dessinerParticip(); }).catch(() => {});
    chargerSuivisServeur();
    await actualiser();
  } catch (e) { $("lvEtat").textContent = "Chargement impossible : " + e.message; }
  // lecture régulière, seulement quand l'onglet est visible
  // chaque seconde : décompte ; à zéro, nouvelle lecture (seulement si l'onglet est visible)
  minuterie = setInterval(() => {
    if (!document.hidden && !$("vue-live").hidden && Date.now() >= prochaine) actualiser();
    afficherDecompte();
  }, 1000);
  afficherDecompte();
  $("lvMaj").addEventListener("click", actualiser);
}
window.addEventListener("vue-live", demarrer);
if (!$("vue-live").hidden) demarrer();
