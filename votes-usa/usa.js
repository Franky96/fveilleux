/* Votes États-Unis — projections pour le Congrès (Chambre des représentants et Sénat) et intentions de vote pour la
   présidentielle de 2028 ; même gabarit que « Votes Canada ».
   Projection : cote de chaque district selon le consensus de 270toWin (7 prévisionnistes), sur les districts de 2026
   (projection.json, outils/usa.py). Chambre actuelle : membres en exercice selon le Clerk de la Chambre. Élection de 2024 :
   résultat de chaque district (resultats-2024.json, outils/resultats24.py). Chambre actuelle et 2024 : districts de 2024
   (9 États ont été redécoupés depuis). Évolution : vote générique, moyenne et sondages de Silver Bulletin (sondages.json).
   Présidentielle : sondages des primaires et duels de l'élection générale (presidentielle.json, outils/presidentielle.py),
   résultats de 2024 et 2020 par État (presidentielles.json, outils/resultats_pres.py).
   Contours : data.json (outils/usa_geo.py, carte de 270toWin). */
import { domaineY, decouper, placerBulle } from "../votes-quebec/zoom-y.js";
import { preparerSysteme } from "../votes-quebec/systeme.js";
import { activerSigles, PARTIS } from "../votes-quebec/partis.js";

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
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");

// barre du haut : date des données et dernière vérification (votes-verif.json, écrit chaque jour par le pipeline aux 3 heures)
let VERIF = null;
const lireVerif = cle => fetch("votes-verif.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(v => { VERIF = v[cle] || null; }).catch(() => {});
function majBarre(nom, donnees) {
  const t = document.querySelector(".t-votes"); if (!t) return;
  t.innerHTML = `${esc(nom)} · ${donnees}${VERIF ? ` · vérifiées le ${esc(VERIF.texte)}` : ""}`;
}
const AN = a => String(a);
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloqué */ } };

// type de page : Chambre des représentants (« ch »), Sénat (« sen ») ou présidentielle (« pres ») — choix en haut de la page, comme Votes France
const HASH = { ch: "#chambre", sen: "#senat", pres: "#presidentielle" };
let TYPE = Object.keys(HASH).find(k => HASH[k] === location.hash) || lireLS("vuType", "ch");
if (!HASH[TYPE]) TYPE = "ch";
let DATA, PROJ, R24, SOND, PRES, RP, NOM26 = {}, NOM24 = {}, AB_DE = {}, ETAT_NOM = {}, F26, F24, sel = null, demarre = false;
const MODE0 = { ch: "cote", sen: "cote", pres: "p24" };            // mode de carte par défaut de chaque type
const etat = { mode: MODE0[TYPE], parti: null, pct: lireLS("viPct", true), chambre: "proj", st: null };
const groupe = () => TYPE === "pres" ? (etat.mode.startsWith("p20") ? "p20" : "p24")
  : etat.mode === "act" ? "act" : etat.mode.startsWith("e24") ? "e24" : "proj";
const SEN = () => PROJ.senat;
const course = f => SEN().etats[f]?.courses[0];                       // course de 2026 dans l'État (une au plus)
const coteSen = f => course(f)?.r;
const delegation = f => { const ps = (SEN().etats[f]?.senateurs || []).map(x => x.p === "I" ? "D" : x.p); return ps[0] === ps[1] ? ps[0] : "S"; };
const COUL_DELEG = { D: "#2F6BD8", R: "#D63A3A", S: "#8A6FD1" };
const voteMode = () => etat.mode.endsWith("vote");
const cle24 = id => `${AB_DE[id.slice(0, 2)]}-${+id.slice(2)}`;          // « 0612 » → « CA-12 » (résultats de 2024)
const nomDe = id => TYPE !== "ch" ? ETAT_NOM[AB_DE[id]] || id : (groupe() === "proj" ? NOM26[id] : NOM24[id]) || NOM26[id] || NOM24[id] || id;
const dans = id => TYPE !== "ch" || !etat.st || AB_DE[id.slice(0, 2)] === etat.st;
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
  g.className = "lv-groupe vf-type"; g.id = "vfType"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "Élection affichée");
  g.innerHTML = `<button type="button" data-t="ch">Chambre des représentants</button><button type="button" data-t="sen">Sénat</button><button type="button" data-t="pres">Présidentielle ${AN(2028)}</button>`;
  tete.appendChild(g);
  g.addEventListener("click", e => { const b = e.target.closest("button[data-t]"); if (!b || b.dataset.t === TYPE) return; changerType(b.dataset.t); });
}
function changerType(t) {
  TYPE = t; ecrireLS("vuType", t);
  history.replaceState(null, "", location.pathname + location.search + HASH[t]);
  etat.mode = MODE0[t]; etat.parti = null; etat.chambre = "proj"; etat.st = null; sel = null; jeu = null;
  svg.transition().duration(0).call(ZOOM.transform, d3.zoomIdentity);
  dessinerTete(); outilsCarte(); tracerDistricts(); peindre(); dessinerPanneau(); dessinerEvolution();
}
function dessinerTete() {
  document.querySelectorAll("#vfType button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === TYPE));
  let ex = $("vfExplic");
  if (!ex) { ex = document.createElement("div"); ex.id = "vfExplic"; ex.className = "vf-explic"; $("viNote").before(ex); }
  creerChoix();
  if (TYPE === "pres") return dessinerTetePres(ex);
  const mg = SOND.moyenne[SOND.moyenne.length - 1];
  majBarre(TYPE === "sen" ? "Votes États-Unis · Sénat" : "Votes États-Unis · Chambre",
    `consensus 270toWin du ${dateFr(TYPE === "sen" ? SEN().maj : PROJ.maj)} · vote générique au ${dateFr(mg.d)}`);
  document.querySelector(".vue-votes .vi-badge").textContent = TYPE === "sen" ? "États-Unis · Sénat" : "États-Unis · Chambre des représentants";
  $("viPlan").setAttribute("aria-label", TYPE === "sen" ? "Hémicycle du Sénat (100 sièges)" : "Hémicycle de la Chambre des représentants (435 sièges)");
  $("viTitre").textContent = TYPE === "sen" ? "Sénat : projection" : "Chambre des représentants : projection";
  // les dates (consensus, vote générique, vérification) sont dans la barre du haut : ici, seulement ce qu'elle ne dit pas
  $("viSource").innerHTML = `Source : consensus de sept prévisionnistes (270toWin) · vote générique : D ${nf(mg.D, 1)} %, R ${nf(mg.R, 1)} % (moyenne de Silver Bulletin)`;
  $("viNote").textContent = ""; $("viNote").hidden = true;
  ex.innerHTML = TYPE === "sen" ? `<p>Le Sénat compte 100 sénateurs, deux par État, élus pour six ans ; un tiers des sièges est renouvelé tous les deux ans. À la prochaine élection, 35 sièges sont en jeu : les 33 sièges ordinaires et deux élections partielles (Ohio et Floride). La majorité est de 51 sièges ; à 50 contre 50, le vice-président (JD Vance, républicain) départage.</p>` : `<p>Les 435 membres de la Chambre des représentants sont élus pour deux ans, un par district. En général, le candidat qui a le plus de voix l'emporte (l'Alaska et le Maine utilisent le vote préférentiel). Il faut 218 sièges pour la majorité. Neuf États ont redessiné leurs districts depuis 2024 : la projection utilise les districts de 2026, la Chambre actuelle et l'élection de 2024 ceux de 2024.</p>`;
  dessinerChambre();
}
// choix du rectangle du haut : chambre affichée (Congrès) ou primaires et duels (présidentielle)
function creerChoix() {
  if ($("vcChambre")) return;
  const choix = document.createElement("div"); choix.id = "vcChambre"; choix.className = "lv-groupe vi-periodes vc-choix"; choix.setAttribute("role", "group"); choix.setAttribute("aria-label", "Chambre affichée");
  choix.innerHTML = Object.entries(CHAMBRES).map(([k, t]) => `<button type="button" data-ch="${k}">${t}</button>`).join("");
  $("viSiegesTitre").after(choix);
  choix.addEventListener("click", e => { const b = e.target.closest("button[data-ch]"); if (!b) return; etat.chambre = b.dataset.ch; dessinerChambre(); });
  const cp = document.createElement("div"); cp.id = "vuChoixPres"; cp.className = "lv-groupe vi-periodes vc-choix"; cp.setAttribute("role", "group"); cp.setAttribute("aria-label", "Intentions de vote affichées");
  cp.innerHTML = Object.entries(CHOIX_PRES).map(([k, t]) => `<button type="button" data-cp="${k}">${t}</button>`).join("");
  choix.after(cp);
  cp.addEventListener("click", e => { const b = e.target.closest("button[data-cp]"); if (!b) return; etatP.choix = b.dataset.cp; ecrireLS("vuPresChoix", etatP.choix); dessinerChambre(); dessinerEvolution(); });
  const bloc = document.createElement("div"); bloc.id = "vuCands"; bloc.className = "vf-cands vu-cands"; $("viLegende").after(bloc);
  bloc.addEventListener("click", e => { const b = e.target.closest("[data-duel]"); if (!b) return; etatP.duel = b.dataset.duel; dessinerChambre(); dessinerEvolution(); });
}
function dessinerChambre() {
  const pres = TYPE === "pres";
  $("viPlan").style.display = $("viLegende").style.display = pres ? "none" : "";
  $("vuCands").hidden = !pres; $("vcChambre").hidden = pres; $("vuChoixPres").hidden = !pres;
  if (pres) return dessinerChambrePres();
  document.querySelectorAll("#vcChambre button").forEach(b => { b.hidden = TYPE === "sen" && b.dataset.ch === "e24"; b.setAttribute("aria-pressed", b.dataset.ch === etat.chambre); });
  if (TYPE === "sen") return dessinerChambreSenat();
  const parts = partsChambre(etat.chambre), eb = $("viPlan").closest("section").querySelector(".lv-eyebrow");
  const somme = side => d3.sum(parts.filter(p => (p.k[0] === side)), p => p.n);
  if (etat.chambre === "proj") {
    const d = somme("D"), r = somme("R"), t = SIEGES - d - r;
    eb.textContent = "Chambre des représentants · consensus 270toWin";
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
    eb.textContent = "Sénat · consensus 270toWin";
    $("viSiegesTitre").textContent = d >= 51 ? `Démocrates favoris : ${d} sièges (majorité 51)` : r >= 50 ? `Républicains favoris : ${r} sièges${r === 50 ? " avec le vice-président" : ""}` : `Aucun camp favori : D ${d}, R ${r}, ${t} à égalité`;
  } else {
    const n = Object.fromEntries(parts.map(p => [p.k, p.n]));
    eb.textContent = "Sénat · sénateurs en exercice";
    $("viSiegesTitre").textContent = `Républicains ${n.R || 0}, démocrates ${n.D || 0}${n.I ? ` et ${n.I} indépendants (avec les démocrates)` : ""}`;
  }
  hemicycle($("viPlan"), parts, "sénateurs · majorité 51", 100);
  $("viLegende").innerHTML = parts.map(p => `<span style="--c:${p.k === "VAC" ? "var(--muted)" : p.c}"><i></i>${p.nom} <b>${p.n}</b></span>`).join("");
}

/* ---------- présidentielle 2028 : en-tête, primaires et duels ---------- */
const CHOIX_PRES = { D: "Primaire démocrate", R: "Primaire républicaine", duels: "Duels", marches: "Marchés de prédiction" };
const etatP = { choix: lireLS("vuPresChoix", "D"), duel: null };
if (!CHOIX_PRES[etatP.choix]) etatP.choix = "D";
// fonction de chaque personnalité testée dans les sondages (information d'appoint sous le nom)
const ROLES = {
  "Kamala Harris": "Vice-présidente de 2021 à 2025, candidate en 2024", "Gavin Newsom": "Gouverneur de Californie",
  "Pete Buttigieg": "Secrétaire aux Transports de 2021 à 2025", "Alexandria Ocasio-Cortez": "Représentante de New York",
  "Josh Shapiro": "Gouverneur de Pennsylvanie", "JB Pritzker": "Gouverneur de l'Illinois", "Cory Booker": "Sénateur du New Jersey",
  "Tim Walz": "Gouverneur du Minnesota, colistier en 2024", "Mark Kelly": "Sénateur de l'Arizona", "Andy Beshear": "Gouverneur du Kentucky",
  "Jon Ossoff": "Sénateur de la Géorgie", "Gretchen Whitmer": "Gouverneure du Michigan", "Wes Moore": "Gouverneur du Maryland",
  "Stephen A. Smith": "Commentateur sportif", "Chris Murphy": "Sénateur du Connecticut", "Ro Khanna": "Représentant de Californie",
  "JD Vance": "Vice-président", "Marco Rubio": "Secrétaire d'État", "Donald Trump Jr.": "Fils aîné de Donald Trump",
  "Ron DeSantis": "Gouverneur de Floride", "Ted Cruz": "Sénateur du Texas", "Nikki Haley": "Ambassadrice à l'ONU de 2017 à 2018, candidate en 2024",
  "Robert F. Kennedy Jr.": "Secrétaire à la Santé", "Vivek Ramaswamy": "Entrepreneur, candidat en 2024",
  "Donald Trump": "Président (ne peut pas se représenter)", "Tucker Carlson": "Animateur", "Byron Donalds": "Représentant de Floride" };
const PALETTE = ["#2F6BD8", "#E0812A", "#2E9E5B", "#8E5CC4", "#C8463D", "#1AA3B8", "#9C7A4A", "#D64F94", "#5E7387", "#A3A82C", "#3F51B5"];
const COUL_CAND = {};
const nomCourt = n => ({ "Donald Trump Jr.": "Trump Jr.", "Robert F. Kennedy Jr.": "Kennedy", "Stephen A. Smith": "Smith" })[n] || n.split(" ").slice(-1)[0];
const jours = (a, b) => (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5;
const pl = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const ge = n => `${n} grand${n > 1 ? "s" : ""} électeur${n > 1 ? "s" : ""}`;
// moyenne récente d'une primaire : sondages des 30 jours précédant le dernier (au moins les 5 derniers) ;
// chaque sondage teste sa propre liste : la moyenne d'un candidat ne compte que les sondages où il figure
function moyennePrimaire(p) {
  const S = PRES.primaires[p].sondages, fin = S[S.length - 1].d;
  let rec = S.filter(x => jours(x.d, fin) <= 30); if (rec.length < 5) rec = S.slice(-5);
  const c = {}; rec.forEach(x => Object.entries(x.v).forEach(([k, v]) => (c[k] ||= []).push(v)));
  return { n: rec.length, de: rec[0].d, moy: Object.entries(c).map(([k, v]) => ({ k, v: d3.mean(v), n: v.length })).sort((a, b) => b.v - a.v) };
}
// couleur de chaque candidat : rang dans la moyenne récente de sa primaire (même couleur dans le rectangle et le graphique)
function couleursPrimaires() {
  for (const p of ["D", "R"]) {
    const ordre = moyennePrimaire(p).moy.map(x => x.k), freq = {};
    PRES.primaires[p].sondages.forEach(x => Object.keys(x.v).forEach(k => freq[k] = (freq[k] || 0) + 1));
    Object.keys(freq).sort((a, b) => freq[b] - freq[a]).forEach(k => { if (!ordre.includes(k)) ordre.push(k); });
    ordre.forEach((k, i) => COUL_CAND[k] = PALETTE[i % PALETTE.length]);
  }
}
const dernierSondagePres = () => d3.max([...PRES.primaires.D.sondages, ...PRES.primaires.R.sondages, ...PRES.duels.flatMap(x => x.sondages)], x => x.d);
// duels sondés depuis un an, du plus sondé au moins sondé ; moyenne des cinq derniers sondages de chacun
function duelsActifs() {
  const fin = dernierSondagePres();
  return PRES.duels.filter(x => jours(x.sondages[x.sondages.length - 1].d, fin) <= 365)
    .sort((a, b) => b.sondages.length - a.sondages.length || (b.sondages[b.sondages.length - 1].d > a.sondages[a.sondages.length - 1].d ? 1 : -1));
}
const duelChoisi = () => { const L = duelsActifs(); return L.find(x => x.titre === etatP.duel) || L[0]; };
// marchés de prédiction (Polymarket, Kalshi) : moyenne des deux plateformes quand les deux ont le marché
const MAR = () => PRES.marches;
const moyMarche = x => { const v = [x.polymarket, x.kalshi].filter(y => y != null); return v.length ? d3.mean(v) : null; };
const partiMarche = k => d3.mean([MAR().parti.polymarket[k], MAR().parti.kalshi[k]]);
const chanceInvest = (p, nom) => { const x = MAR()?.[p === "D" ? "nomD" : "nomR"].find(y => y.nom === nom); return x ? moyMarche(x) : null; };
const moyDuel = x => { const r = x.sondages.slice(-5); return { R: d3.mean(r, s => s.R), D: d3.mean(r, s => s.D), n: r.length }; };
function dessinerTetePres(ex) {
  majBarre("Votes États-Unis · présidentielle 2028", `dernier sondage le ${dateFr(dernierSondagePres())}${MAR() ? ` · marchés au ${dateFr(MAR().maj)}` : ""}`);
  document.querySelector('#vuChoixPres [data-cp="marches"]').hidden = !MAR();
  if (!MAR() && etatP.choix === "marches") etatP.choix = "D";
  document.querySelector(".vue-votes .vi-badge").textContent = "États-Unis · Présidentielle 2028";
  $("viTitre").textContent = `Présidentielle ${AN(2028)} : intentions de vote`;
  $("viSource").innerHTML = "Source : sondages nationaux compilés par Wikipédia (avec un lien vers chacun) · moyennes publiées de 270toWin et RealClearPolling · marchés de prédiction Polymarket et Kalshi";
  $("viNote").textContent = ""; $("viNote").hidden = true;
  ex.innerHTML = `<p>Le président est élu pour quatre ans par un collège de 538 grands électeurs, répartis entre les États selon leur population (le District de Columbia en a 3). Dans 48 États et dans le District de Columbia, le candidat en tête remporte tous les grands électeurs ; le Maine et le Nebraska en donnent deux au gagnant de l'État et un au gagnant de chaque district. Il faut 270 grands électeurs pour être élu. Donald Trump ne peut pas se représenter (22e amendement). Chaque parti choisit son candidat lors de primaires, État par État, de janvier à juin ${AN(2028)} ; l'élection aura lieu le 7 novembre ${AN(2028)}.</p>`;
  dessinerChambre();
}
function dessinerChambrePres() {
  document.querySelectorAll("#vuChoixPres button").forEach(b => b.setAttribute("aria-pressed", b.dataset.cp === etatP.choix));
  const eb = $("viPlan").closest("section").querySelector(".lv-eyebrow"), bloc = $("vuCands");
  if (etatP.choix === "duels") {
    const L = duelsActifs(), ch = duelChoisi(), m = moyDuel(ch), tete = m.D >= m.R ? "D" : "R", autre = tete === "D" ? "R" : "D", ecart = Math.abs(m.D - m.R);
    eb.textContent = "Élection générale · duels testés dans les sondages";
    $("viSiegesTitre").textContent = ecart < 0.05 ? `${nomCourt(ch.R)} et ${nomCourt(ch.D)} à égalité` : `${nomCourt(ch[tete])} devant ${nomCourt(ch[autre])} : +${nf(ecart, 1)} point${ecart >= 2 ? "s" : ""}`;
    bloc.innerHTML = L.map(x => { const a = moyDuel(x);
      return `<button type="button" class="vu-duel" data-duel="${esc(x.titre)}" aria-pressed="${x === ch}">
        <span class="vu-duel-noms"><b style="color:${COUL.R}">${esc(x.R)} <span>${nf(a.R, 0)} %</span></b><small>${pl(x.sondages.length, "sondage")}</small><b style="color:${COUL.D}"><span>${nf(a.D, 0)} %</span> ${esc(x.D)}</b></span>
        <span class="vu-duel-barre"><i style="width:${a.R}%;background:${COUL.R}"></i><i style="width:${a.D}%;background:${COUL.D}"></i></span></button>`; }).join("")
      + `<p class="lv-muted lv-source">Moyenne des cinq derniers sondages de chaque duel (ou de tous s'il y en a moins) ; l'espace entre les deux barres : indécis et autres candidats. Clique sur un duel pour voir son évolution.</p>`;
    return;
  }
  if (etatP.choix === "marches") {
    const D = partiMarche("D"), R = partiMarche("R"), fav = D >= R ? "D" : "R", G = MAR().gagnant, max = Math.max(30, ...G.map(moyMarche));
    eb.textContent = "Marchés de prédiction · Polymarket et Kalshi";
    $("viSiegesTitre").textContent = `${fav === "D" ? "Démocrates" : "Républicains"} favoris : ${nf(Math.max(D, R), 0)} % de chances`;
    const src = x => [x.polymarket != null ? `Polymarket ${nf(x.polymarket, 1)} %` : "", x.kalshi != null ? `Kalshi ${nf(x.kalshi, 1)} %` : ""].filter(Boolean).join(" · ");
    bloc.innerHTML = `<span class="lv-eyebrow">Parti gagnant</span>
      <div class="ac-barre" role="img" aria-label="Démocrates ${nf(D, 0)} %, républicains ${nf(R, 0)} %"><span style="flex:${D};background:${COUL.D}">Démocrates ${nf(D, 0)} %</span><span style="flex:${R};background:${COUL.R}">Républicains ${nf(R, 0)} %</span><i style="left:50%"></i></div>
      <p class="lv-muted lv-source">Démocrates : Polymarket ${nf(MAR().parti.polymarket.D, 1)} %, Kalshi ${nf(MAR().parti.kalshi.D, 1)} % · républicains : Polymarket ${nf(MAR().parti.polymarket.R, 1)} %, Kalshi ${nf(MAR().parti.kalshi.R, 1)} %</p>
      <span class="lv-eyebrow">Chances de remporter la présidence</span>`
      + G.map(x => { const v = moyMarche(x), sous = [ROLES[x.nom], src(x)].filter(Boolean).join(" · ");
        return `<div class="vf-cand" style="--c:${COUL[x.p] || COUL.AUT}"><span><b>${esc(x.nom)}${x.p ? ` <small>(${x.p})</small>` : ""}</b><small>${esc(sous)}</small></span>`
          + `<span class="vf-cand-barre"><i style="width:${100 * v / max}%"></i></span><b class="vf-cand-v">${nf(v, 1)} %</b></div>`; }).join("")
      + `<p class="lv-muted lv-source">Prix du contrat « oui », qui paie 1 $ si la personne (ou le parti) gagne : un prix de 20 cents équivaut à 20 % de chances selon les parieurs. Ce ne sont pas des sondages : les marchés réagissent vite aux nouvelles, mais ceux des personnalités moins connues sont peu actifs. Moyenne des deux plateformes quand les deux ont le marché.</p>`;
    return;
  }
  const p = etatP.choix, M = moyennePrimaire(p), top = M.moy[0], ag = PRES.primaires[p].agregats, max = Math.max(40, top.v);
  eb.textContent = `Primaire ${p === "D" ? "démocrate" : "républicaine"} · moyenne de ${M.n} sondages`;
  $("viSiegesTitre").textContent = `${nomCourt(top.k)} en tête : ${nf(top.v, 1)} %`;
  bloc.innerHTML = M.moy.filter(x => x.v >= 1).map(x => { const ci = chanceInvest(p, x.k);
    const sous = [ROLES[x.k], x.n < M.n ? `testé dans ${x.n} sondage${x.n > 1 ? "s" : ""} sur ${M.n}` : "", ci != null ? `chances d'investiture selon les marchés : ${nf(ci, ci < 1 ? 1 : 0)} %` : ""].filter(Boolean).join(" · ");
    return `<div class="vf-cand" style="--c:${COUL_CAND[x.k]}"><span><b>${esc(x.k)}</b><small>${esc(sous)}</small></span>`
      + `<span class="vf-cand-barre"><i style="width:${100 * x.v / max}%"></i></span><b class="vf-cand-v">${nf(x.v, 1)} %</b></div>`; }).join("")
    + `<p class="lv-muted lv-source">Moyenne des sondages publiés depuis le ${dateFr(M.de)} ; chaque sondage teste sa propre liste de candidats (la moyenne d'un candidat ne compte que les sondages où il figure).`
    + (ag.length ? ` Moyennes publiées : ${ag.map(a => `${esc(a.nom)} (${dateFr(a.d)}) : ${Object.entries(a.v).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${esc(nomCourt(k))} ${nf(v, 1)} %`).join(", ")}`).join(" · ")}.` : "") + "</p>";
}

/* ---------- carte ---------- */
const MW = 900, MH = 560;
let svg, gZ, gRid, gReg, gSel, gLbl, PATH, PROJ_FN, ZOOM, curK = 1, curT = d3.zoomIdentity, jeu = null;
const PRESETS = {};
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const features = () => TYPE !== "ch" ? DATA.geoEtats.features : groupe() === "proj" ? F26 : F24;
// présidentielle : résultat de l'année affichée dans un État (clé : code FIPS), nuance selon l'écart entre les deux premiers
const anPres = () => groupe() === "p20" ? "2020" : "2024";
const RES = () => RP[anPres()];
const resEtat = id => RES().etats[AB_DE[id]];
const nuance = x => { const m = Math.abs(x.D - x.R); return x.g + (m >= 15 ? "3" : m >= 5 ? "2" : "1"); };
const ecartTxt = x => `${x.g} +${nf(Math.abs(x.D - x.R), 1)}`;
function remplir(id) {
  const fade = o => dans(id) ? o : o * 0.22;
  if (TYPE === "pres") {
    const x = resEtat(id); if (!x) return ["var(--soft)", 1];
    if (voteMode()) return [COUL[etat.parti], Math.max(0.06, Math.min(1, (x[etat.parti] - 20) / 50))];
    return [COTE[nuance(x)][0], 0.95];
  }
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
  const k = f.properties.id + (TYPE !== "ch" ? ":st" : DATA.geo26.features.includes(f) ? ":26" : ":24");
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
  const set = TYPE !== "ch" ? "st" : groupe() === "proj" ? "26" : "24";
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
  $("viChips").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return;
    etat.parti = b.dataset.p; if (!voteMode()) changerMode(TYPE === "pres" ? groupe() + "vote" : "e24vote"); else { peindre(); if (sel == null) dessinerPanneau(); } });
}
// pastilles du mode Vote : partis (Chambre) ou candidats de l'élection affichée (présidentielle)
function majChips() {
  const lab = p => TYPE === "pres" ? `${RES().noms[p].split(" ").slice(-1)[0]} (${p})` : p === "D" ? "Démocrates" : "Républicains";
  $("viChips").innerHTML = P.map(p => `<button type="button" class="vi-chip" style="--c:${COUL[p]}" data-p="${p}" aria-pressed="${voteMode() && p === etat.parti}">${esc(lab(p))}</button>`).join("");
}
// boutons : futur (projection) · présent (Chambre actuelle) · passé (élection de 2024) ; présidentielle : élections passées seulement
// (pas de projection par État pour 2028 : trop peu de sondages par État)
function outilsCarte() {
  const bouton = ([m, t]) => `<button type="button" data-m="${m}" aria-pressed="${m === etat.mode}">${t}</button>`;
  $("viModes").className = "vf-modes";
  $("viChips").style.display = TYPE === "sen" ? "none" : "";
  majChips();
  if (TYPE === "pres") {
    $("viModes").innerHTML = ["2024", "2020"].map(a => `<span class="vf-mode-grp"><span class="vf-mode-lab">Présidentielle ${AN(a)}</span><span class="lv-groupe">${[["p" + a.slice(2), "En tête"], ["p" + a.slice(2) + "vote", "Vote"]].map(bouton).join("")}</span></span>`).join("");
    return;
  }
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
  if (TYPE === "pres") majChips();
  else if (etat.chambre !== groupe()) { etat.chambre = groupe(); dessinerChambre(); }
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
  // étiquettes : pourcentage (mode Vote) ; présidentielle, mode En tête : grands électeurs de chaque État
  const avecLab = voteMode() ? etat.pct : TYPE === "pres";
  const labs = gLbl.selectAll("g.vi-lab").data(avecLab ? features().filter(f => dans(f.properties.id) && (TYPE !== "pres" || resEtat(f.properties.id))) : [], f => f.properties.id)
    .join(enter => { const g = enter.append("g").attr("class", "vi-lab");
      g.append("text").attr("class", "vi-lbl vi-nom").attr("text-anchor", "middle").attr("dy", "-0.85em");
      g.append("text").attr("class", "vi-lbl vi-val").attr("text-anchor", "middle").attr("dy", "0.35em"); return g; });
  labs.select("text.vi-val").text(f => { if (TYPE === "pres") { const x = resEtat(f.properties.id); return voteMode() ? nf(x[etat.parti], 0) + " %" : x.ve; }
    const c = r24(f.properties.id); return c ? nf(c.s[etat.parti] || 0, 0) + " %" : ""; });
  labs.select("text.vi-nom").text(f => nomDe(f.properties.id));
  placerEtiquettes();
  let an = $("vfAnCarte");
  if (!an) { an = document.createElement("div"); an.id = "vfAnCarte"; an.className = "vf-an-carte"; $("viCarte").before(an); }
  an.innerHTML = TYPE === "pres" ? `Présidentielle ${AN(anPres())}` : TYPE === "sen" ? (groupe() === "act" ? "Sénateurs actuels" : `Sénat · consensus · ${dateFr(SEN().maj)}`) : groupe() === "act" ? "Représentants actuels" : groupe() === "e24" ? "Élection 2024" : `Consensus · ${dateFr(PROJ.maj)}`;
  const p = etat.parti, ramp = p ? `<span class="vi-ramp" style="background:linear-gradient(90deg, color-mix(in srgb, ${COUL[p]} 6%, var(--surface)), ${COUL[p]})"></span>` : "";
  if (TYPE === "pres") {
    const N = RES().noms, court = k => N[k].split(" ").slice(-1)[0];
    $("viEchelle").innerHTML = voteMode()
      ? `<span>20 %</span>${ramp}<span>70 % et +</span><span>· vote pour ${esc(N[p])} en ${anPres()} dans chaque État${etat.pct ? " (chiffre = %)" : ""}</span>`
      : `<span class="vf-legende">${[["D3", "+15 et plus"], ["D2", "+5 à 15"], ["D1", "moins de 5"], ["R1", "moins de 5"], ["R2", "+5 à 15"], ["R3", "+15 et plus"]].map(([k, t]) => `<span style="--c:${COTE[k][0]}"><i></i>${esc(court(k[0]))} ${t}</span>`).join("")}</span><span>· écart entre les deux premiers dans chaque État en ${anPres()} ; chiffre : grands électeurs de l'État</span>`;
    return;
  }
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
  if (TYPE === "pres") {
    const x = resEtat(id), N = RES().noms; if (!x) { t.hidden = true; return; }
    t.innerHTML = `<b>${esc(nomDe(id))}</b><small>${ge(x.ve)} · présidentielle ${anPres()}</small><br>`
      + ["R", "D"].sort((a, b) => x[b] - x[a]).map(k => `${esc(N[k].split(" ").slice(-1)[0])} ${nf(x[k], 1)} %`).join(" · ") + `<br><small>Écart : ${ecartTxt(x)}</small>`;
    return;
  }
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
  z.innerHTML = `${menu}<span class="lv-eyebrow">Consensus de 270toWin</span><h3>Tous les États-Unis</h3>
    <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL.D}"></i>D favoris : ${d}</span><span class="vi-pill"><i style="background:${COUL.R}"></i>R favoris : ${r}</span><span class="vi-pill"><i style="background:${COTE.T[0]}"></i>À égalité : ${100 - d - r}</span><span class="vi-pill">Majorité : 51</span></div>
    ${explicationCotes()}
    <p class="lv-muted">Sièges favoris = sièges non renouvelés en 2026 (${nonren.D || 0} D, ${nonren.I || 0} indépendants, ${nonren.R || 0} R) + courses de 2026 qui penchent vers chaque parti. Clique sur un État pour son détail.</p>
    <span class="lv-eyebrow">Les ${courses.length} courses de 2026, par cote</span><div class="vi-vrows">${COTES.map(k => ligne(COTE[k][1], COTE[k][0], n[k] || 0, 15)).join("")}</div>
    <span class="lv-eyebrow">Courses à égalité</span>${lst(egal, () => COTE.T[0], f => `détenu par ${course(f).held}`)}
    ${replie("Sièges qui changeraient de parti", lst(bascules, f => COUL[camp(coteSen(f))], f => `${camp(coteSen(f))} <small>(détenu par ${course(f).held})</small>`), bascules.length)}
    ${replie("Toutes les courses", lst(courses.sort((a, b) => COTES.indexOf(coteSen(a)) - COTES.indexOf(coteSen(b))), f => COTE[coteSen(f)][0], f => COTE[coteSen(f)][1]), courses.length)}`;
}
// présidentielle : tous les États-Unis ou un État (résultats de 2024 et 2020, délégation actuelle au Congrès)
const ETATS_P = () => [...DATA.etats, { fips: "11", ab: "DC", nom: "District de Columbia" }].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
function panneauPres(z) {
  const an = anPres(), R = RES(), N = R.noms, autreAn = an === "2024" ? "2020" : "2024", A = RP[autreAn];
  const court = k => N[k].split(" ").slice(-1)[0];
  const menu = `<details class="vc-menu"><summary>État : <b>${sel ? esc(nomDe(sel)) : "Tous les États-Unis"}</b></summary>
    <div class="vc-menu-liste">${[[null, "Tous les États-Unis"], ...ETATS_P().map(e => [e.fips, e.nom])]
      .map(([k, t]) => `<button type="button" data-etatsen="${k || ""}" aria-pressed="${(k || null) === sel}">${esc(t)}</button>`).join("")}</div></details>`;
  const fipsDe = ab => ETATS_P().find(e => e.ab === ab).fips;
  const lst = (abs, droite) => `<ul class="vi-serres">${abs.map(ab => `<li data-rid="${fipsDe(ab)}" tabindex="0" style="--c:${COTE[nuance(R.etats[ab])][0]}"><i></i>${esc(ETAT_NOM[ab])}<b>${droite(ab)}</b></li>`).join("") || "<li>Aucun</li>"}</ul>`;
  const jauges = (x, noms) => `<div class="vi-vrows">${["R", "D"].sort((a, b) => x[b] - x[a]).map(k => jauge(esc(noms[k].split(" ").slice(-1)[0]), COUL[k], x[k], `<small>${k}</small>`, 100)).join("")}${jauge("Autres", COUL.AUT, x.AUT, "", 100)}</div>`;
  const districts = (res, ab) => Object.entries(res.districts).filter(([k]) => k.startsWith(ab + "-"));
  if (sel) {
    const ab = AB_DE[sel], x = R.etats[ab];
    const gagne = k => { const n = x.veg[k] + d3.sum(districts(R, ab), ([, d]) => d.veg[k]); return n ? `${court(k)} : ${ge(n)}` : ""; };
    const e24 = RP["2024"].etats[ab], e20 = RP["2020"].etats[ab];
    const vire = (e24.R - e24.D) - (e20.R - e20.D);                      // déplacement de l'écart de 2020 à 2024 (positif : vers les républicains)
    const sen = SEN().etats[sel]?.senateurs || [], reps = Object.entries(PROJ.actuel).filter(([id]) => id.startsWith(sel));
    const nrep = {}; reps.forEach(([, a]) => { const k = a ? a.p : "VAC"; nrep[k] = (nrep[k] || 0) + 1; });
    const blocAn = (res, a) => { const v = res.etats[ab], ds = districts(res, ab);
      return `${jauges(v, res.noms)}<p class="lv-muted">Écart : ${ecartTxt(v)} · ${v.voix.toLocaleString("fr-CA")} voix${ds.length ? ` · par district : ${ds.map(([k, d]) => `${k} ${ecartTxt(d)}`).join(", ")}` : ""}</p>`; };
    z.innerHTML = `${menu}<span class="lv-eyebrow">État · ${ge(x.ve)}${ab === "DC" ? " (capitale fédérale)" : ""}</span><h3>${esc(nomDe(sel))}</h3>
      <div class="vi-liens"><button type="button" class="vi-lien" data-tout>← Tous les États-Unis</button>${ab !== "DC" ? `<button type="button" class="vi-lien" data-zoomsel>Zoomer ici</button>` : ""}</div>
      <div class="vi-pills">${["R", "D"].filter(k => gagne(k)).map(k => `<span class="vi-pill"><i style="background:${COUL[k]}"></i>${gagne(k)}</span>`).join("")}</div>
      <span class="lv-eyebrow">Présidentielle du ${dateFr(R.date)}</span>${blocAn(R, an)}
      ${replie(`Présidentielle du ${dateFr(A.date)}`, blocAn(A, autreAn))}
      <p class="lv-muted">De 2020 à 2024, l'écart s'est déplacé de ${nf(Math.abs(vire), 1)} point${Math.abs(vire) >= 2 ? "s" : ""} vers les ${vire < 0 ? "démocrates" : "républicains"}.${e20.ve !== e24.ve ? ` Grands électeurs : ${e20.ve} en 2020, ${e24.ve} depuis 2024 (nouvelle répartition après le recensement de 2020).` : ""}</p>
      ${ab === "DC" ? `<p class="lv-muted">Le District de Columbia n'a pas de sénateur et n'élit à la Chambre qu'une déléguée sans droit de vote.</p>`
        : `<span class="lv-eyebrow">Au Congrès aujourd'hui</span>
      ${sen.map(s => `<p class="vi-elu" style="--c:${COUL[s.p] || COUL.AUT}"><b>${esc(s.nom)}</b> · sénateur${s.p ? ` (${s.p})` : ""}</p>`).join("")}
      <p class="lv-muted">Représentants : ${["R", "D", "I", "VAC"].filter(k => nrep[k]).map(k => `${nrep[k]} ${k === "VAC" ? `vacant${nrep[k] > 1 ? "s" : ""}` : k}`).join(" · ")}</p>`}`;
    return;
  }
  const abs = Object.keys(R.etats), marge = ab => Math.abs(R.etats[ab].D - R.etats[ab].R);
  const serres = abs.filter(ab => marge(ab) < 5).sort((a, b) => marge(a) - marge(b));
  const bascules = abs.filter(ab => RP["2024"].etats[ab].g !== RP["2020"].etats[ab].g);
  const dBasc = Object.keys(RP["2024"].districts).filter(k => RP["2024"].districts[k].g !== RP["2020"].districts[k]?.g);
  const tous = abs.slice().sort((a, b) => (R.etats[b].D - R.etats[b].R) - (R.etats[a].D - R.etats[a].R));
  const vainq = R.ve.D > R.ve.R ? "D" : "R";
  z.innerHTML = `${menu}<span class="lv-eyebrow">Présidentielle du ${dateFr(R.date)}</span><h3>Tous les États-Unis</h3>
    <div class="vi-pills">${[vainq, vainq === "D" ? "R" : "D"].map(k => `<span class="vi-pill"><i style="background:${COUL[k]}"></i>${esc(N[k])} : ${R.ve[k]}</span>`).join("")}<span class="vi-pill">Majorité : 270</span></div>
    <span class="lv-eyebrow">Grands électeurs</span>
    <div class="ac-barre" role="img" aria-label="${esc(N.D)} ${R.ve.D}, ${esc(N.R)} ${R.ve.R}"><span style="flex:${R.ve.D};background:${COUL.D}">${esc(court("D"))} ${R.ve.D}</span><span style="flex:${R.ve.R};background:${COUL.R}">${esc(court("R"))} ${R.ve.R}</span><i style="left:${100 * 270 / 538}%" title="majorité : 270"></i></div>
    <span class="lv-eyebrow">Vote populaire</span>${jauges(R.national, N)}
    <p class="lv-muted">${esc(N.R)} : ${R.voix.R.toLocaleString("fr-CA")} voix · ${esc(N.D)} : ${R.voix.D.toLocaleString("fr-CA")} voix. Clique sur un État pour son détail.</p>
    <span class="lv-eyebrow">Les plus serrés (moins de 5 points)</span>${lst(serres, ab => `${ecartTxt(R.etats[ab])} <small>· ${R.etats[ab].ve}</small>`)}
    ${replie(an === "2024" ? "États qui ont changé de camp depuis 2020" : "États qui changeront de camp en 2024", lst(bascules, ab => `${RP["2020"].etats[ab].g} → ${RP["2024"].etats[ab].g} <small>· ${R.etats[ab].ve}</small>`)
      + (dBasc.length ? `<p class="lv-muted">Districts : ${dBasc.map(k => `${k} (${RP["2020"].districts[k].g} → ${RP["2024"].districts[k].g})`).join(", ")}.</p>` : ""), bascules.length)}
    ${replie("Tous les États, du plus démocrate au plus républicain", lst(tous, ab => `${ecartTxt(R.etats[ab])} <small>· ${R.etats[ab].ve}</small>`), tous.length)}
    <p class="lv-muted">Chiffre après l'écart : grands électeurs de l'État. Le Maine et le Nebraska donnent aussi un grand électeur par district (${an} : ${Object.entries(R.districts).filter(([k, d]) => d.g !== R.etats[k.slice(0, 2)].g).map(([k, d]) => `${k} à ${court(d.g)}`).join(", ") || "aucun district contre le gagnant de l'État"}).</p>`;
}
function dessinerPanneau() {
  if (TYPE === "pres") return panneauPres($("viPanneau"));
  if (TYPE === "sen") return panneauSenat($("viPanneau"));
  const z = $("viPanneau"), g = groupe(), nomZ = etat.st ? ETAT_NOM[etat.st] : "Tous les États-Unis";
  if (sel == null) {
    if (g === "proj") {
      const ids = Object.keys(PROJ.circ).filter(dans), n = {}; ids.forEach(id => { const r = PROJ.circ[id].r; n[r] = (n[r] || 0) + 1; });
      const d = d3.sum(["D3", "D2", "D1"], r => n[r] || 0), r = d3.sum(["R3", "R2", "R1"], k => n[k] || 0), t = n.T || 0;
      const egal = ids.filter(id => PROJ.circ[id].r === "T"), penches = ids.filter(id => ["D1", "R1"].includes(PROJ.circ[id].r));
      const bascules = ids.filter(id => { const c = PROJ.circ[id], k = camp(c.r); return k !== "T" && ["D", "R"].includes(c.held) && k !== c.held; });
      z.innerHTML = `${menuEtats()}<span class="lv-eyebrow">Consensus de 270toWin</span><h3>${esc(nomZ)}</h3>
        <div class="vi-pills"><span class="vi-pill"><i style="background:${COUL.D}"></i>D favoris : ${d}</span><span class="vi-pill"><i style="background:${COUL.R}"></i>R favoris : ${r}</span><span class="vi-pill"><i style="background:${COTE.T[0]}"></i>À égalité : ${t}</span>${etat.st ? `<span class="vi-pill">${ids.length} district${ids.length > 1 ? "s" : ""}</span>` : `<span class="vi-pill">Majorité : ${MAJ}</span>`}</div>
        <p class="lv-muted">Cote de chaque district selon sept prévisionnistes (ils ne publient pas de pourcentage par district). Clique sur un district pour son détail.</p>
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
      z.innerHTML = `${menuEtats()}<span class="lv-eyebrow">Chambre actuelle · Clerk de la Chambre</span><h3>${esc(nomZ)}</h3>
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
  const titreProj = `Projection 2026 · consensus${g !== "proj" && redec ? " (district redessiné)" : ""}`;
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
  if (es) { const f = es.dataset.etatsen || null, ft = f && DATA.geoEtats.features.find(x => x.properties.id === f); sel = f;
    if (ft) zoomVers(ft, 0.9); else if (!f) svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); peindre(); dessinerPanneau(); return; }
  const l = e.target.closest("[data-rid]"); if (l) { choisir(l.dataset.rid); return; }
  if (e.target.closest("[data-tout]")) { if (TYPE !== "ch") { sel = null; svg.transition().duration(reduit ? 0 : 600).call(ZOOM.transform, d3.zoomIdentity); peindre(); dessinerPanneau(); } else choisirEtat(etat.st); return; }
  const fz = e.target.closest("[data-zoomsel]") && sel != null && features().find(x => x.properties.id === sel); if (fz) zoomVers(fz, 0.5);
});
document.addEventListener("keydown", e => {
  const l = e.target.closest?.("#viPanneau [data-rid]"); if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(l.dataset.rid); }
});

/* ---------- évolution du vote générique ---------- */
let periode = lireLS("vuPeriode", 3);   // 3 derniers mois par défaut
function dessinerEvolution() {
  if (TYPE === "pres") return dessinerEvolutionPres();
  $("viEvolTitre").textContent = "Évolution du vote générique";
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
  const y = d3.scaleLinear().domain(domaineY(el, [Math.floor((d3.min(vals) - 3) / 5) * 5, Math.ceil((d3.max(vals) + 2) / 5) * 5], "generique" + periode, dessinerEvolution)).range([H - m.b, m.t]);   // molette : zoom vertical
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
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      const [mx] = d3.pointer(ev), dt = x.invert(mx), o = moy.reduce((a, b) => Math.abs(t(b.d) - dt) < Math.abs(t(a.d) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(o.d))).attr("x2", x(t(o.d)));
      const n = tous.filter(s => Math.abs(t(o.d) - t(s.d)) / 864e5 <= 15).length;
      tipE.hidden = false; tipE.innerHTML = `<b>${dateFr(o.d)}</b><small>moyenne de Silver Bulletin · ${n} sondage${n > 1 ? "s" : ""} à ±15 jours</small>`
        + P.map(p => `<span style="--c:${COUL[p]}"><i></i>${p === "D" ? "Démocrates" : "Républicains"} <b>${nf(o[p], 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(o.d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = `${sond.length} sondages nationaux sur la période (« pour quel parti voterez-vous au Congrès ? »). Lignes : moyenne de Silver Bulletin · points : sondages · losanges : vote populaire à la Chambre en 2024.`;
}

/* ---------- évolution des intentions de vote : présidentielle 2028 (primaire choisie ou duel choisi) ---------- */
function seriePres() {
  if (etatP.choix === "marches") {
    const k = MAR().parti.kalshi;
    return { lignes: ["D", "R"], lab: k => k === "D" ? "Démocrates" : "Républicains", coul: k => COUL[k], direct: true, titre: "Marchés · parti gagnant",
      points: MAR().historique.filter(x => x.R != null).map(x => ({ d: x.d, f: "Polymarket", n: "", v: { D: x.D, R: x.R } })),
      note: n => `Chances de victoire de chaque parti selon Polymarket, prix quotidien (${pl(n, "jour")} sur la période). Kalshi aujourd'hui : démocrates ${nf(k.D, 1)} %, républicains ${nf(k.R, 1)} %.` };
  }
  if (etatP.choix === "duels") {
    const x = duelChoisi();
    return { lignes: ["R", "D"], lab: k => nomCourt(x[k]), coul: k => COUL[k], sigma: 45, titre: `Duel ${nomCourt(x.R)}–${nomCourt(x.D)}`,
      points: x.sondages.map(s => ({ d: s.d, f: s.f, n: s.n, v: { R: s.R, D: s.D } })),
      note: n => `${pl(n, "sondage")} sur la période (élection générale, ${x.R} contre ${x.D}). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages.` };
  }
  const p = etatP.choix, S = PRES.primaires[p].sondages, fin = S[S.length - 1].d, c = {};
  // candidats suivis : au moins 4 % en moyenne et 3 sondages sur les 6 derniers mois
  S.filter(x => jours(x.d, fin) <= 183).forEach(x => Object.entries(x.v).forEach(([k, v]) => (c[k] ||= []).push(v)));
  return { lignes: Object.entries(c).filter(([, v]) => d3.mean(v) >= 4 && v.length >= 3).map(([k]) => k), lab: nomCourt, coul: k => COUL_CAND[k] || COUL.AUT,
    sigma: 30, titre: `Primaire ${p === "D" ? "démocrate" : "républicaine"}`, points: S,
    note: n => `${pl(n, "sondage")} sur la période (sondages nationaux de la primaire ${p === "D" ? "démocrate" : "républicaine"} ; chaque sondage teste sa propre liste de candidats). Lignes : tendance (moyenne pondérée des sondages voisins) · points : sondages.` };
}
function dessinerEvolutionPres() {
  const S = seriePres();
  const el = $("viEvol"), W = el.clientWidth || 800, H = Math.max(260, Math.min(560, W * 0.6));
  const m = { t: 16, r: 92, b: 28, l: 34 };
  const t = s => new Date(s + "T12:00:00");
  const tous = S.points;
  // marchés : historique depuis l'ouverture du marché (juillet 2025) ; sondages : depuis 2024
  const debutTout = t(S.direct && tous.length ? tous[0].d : "2024-01-01"), fin_ = d3.max([new Date(), ...tous.map(s => t(s.d))]);
  const depuis = S.direct ? `depuis ${debutTout.toLocaleDateString("fr-CA", { month: "long", year: "numeric" })}` : "depuis 2024";
  // un duel n'a souvent que quelques sondages : s'il y en a moins de cinq sur la période choisie, on montre tout depuis 2024
  const debutDe = per => per ? d3.max([debutTout, d3.timeMonth.offset(fin_, -per)]) : debutTout;
  const per = etatP.choix === "duels" && tous.filter(s => t(s.d) >= debutDe(periode)).length < 5 ? 0 : periode;
  const debut = debutDe(per);
  const dans_ = d => t(d) >= debut, sond = tous.filter(s => dans_(s.d));
  document.querySelectorAll("#viPeriodes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.per === per));
  $("viEvolSur").textContent = `${S.titre} · ${per ? (per < 12 ? `${per} derniers mois` : per === 12 ? "dernière année" : `${per / 12} dernières années`) : depuis}`;
  $("viEvolTitre").textContent = S.direct ? "Évolution des chances de victoire" : "Évolution des intentions de vote";
  const x = d3.scaleTime().domain([debut, fin_]).range([m.l, W - m.r]);
  const yMax = d3.max(sond, s => d3.max(S.lignes, p => s.v[p] || 0)) || 40;
  const yMin = etatP.choix === "marches" ? Math.max(0, Math.floor((d3.min(sond, s => Math.min(s.v.R, s.v.D)) - 6) / 10) * 10)
    : etatP.choix === "duels" ? Math.max(0, Math.floor((d3.min(sond, s => Math.min(s.v.R, s.v.D)) - 6) / 10) * 10) : 0;
  const y = d3.scaleLinear().domain(domaineY(el, [yMin || 0, Math.ceil((yMax + 4) / 10) * 10], S.titre + per, dessinerEvolution)).range([H - m.b, m.t]);   // molette : zoom vertical
  // tendance : moyenne pondérée (noyau gaussien) aux semaines, seulement sur les sondages où le candidat figure
  const dates = [];
  if (tous.length) for (let d = t(tous[0].d); d <= t(tous[tous.length - 1].d); d = new Date(+d + 7 * 864e5)) dates.push(d.toISOString().slice(0, 10));
  if (tous.length && dates[dates.length - 1] !== tous[tous.length - 1].d) dates.push(tous[tous.length - 1].d);
  const datesVis = dates.filter(dans_);
  const poids = (d, s) => Math.exp(-0.5 * ((t(d) - t(s.d)) / 864e5 / S.sigma) ** 2);
  const moy = p => { const avec = tous.filter(s => s.v[p] != null), premier = avec[0]?.d, dernier = avec[avec.length - 1]?.d;
    return datesVis.filter(d => d >= premier && d <= dernier).map(d => { let a = 0, w = 0; for (const s of avec) { const k = poids(d, s); a += k * s.v[p]; w += k; } return { d, v: a / w }; }); };
  const ligne = d3.line().x(o => x(t(o.d))).y(o => y(o.v)).curve(d3.curveMonotoneX);
  const svgE = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", `Évolution des intentions de vote : ${S.titre}`);
  const court = per && per <= 6;
  svgE.append("g").attr("class", "vi-axe").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : W < 1000 ? 5 : court ? 6 : 8)
    .tickFormat(d => d.toLocaleDateString("fr-CA", court ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" })).tickSizeOuter(0));
  svgE.append("g").attr("class", "vi-axe vi-grille").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(v => v + " %"));
  const fin = {};
  for (const p of S.lignes) {
    // marchés : un prix par jour, tracé tel quel (pas de points ni de moyenne)
    if (!S.direct) svgE.append("g").selectAll("circle").data(sond.filter(s => s.v[p] != null)).join("circle").attr("class", "vi-pt").attr("cx", s => x(t(s.d))).attr("cy", s => y(s.v[p])).attr("r", 3.2).style("fill", S.coul(p));
    const mm = S.direct ? sond.filter(s => s.v[p] != null).map(s => ({ d: s.d, v: s.v[p] })) : moy(p); if (mm.length) fin[p] = mm[mm.length - 1];
    if (mm.length > 1) svgE.append("path").attr("class", "vi-ligne").attr("d", ligne(mm)).style("stroke", S.coul(p));
  }
  const etiq = S.lignes.filter(p => fin[p]).map(p => ({ p, y: y(fin[p].v), v: fin[p].v, x: x(t(fin[p].d)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiq.length; i++) if (etiq[i].y - etiq[i - 1].y < 13) etiq[i].y = etiq[i - 1].y + 13;
  svgE.append("g").selectAll("text").data(etiq).join("text").attr("class", "vi-fin").attr("x", d => d.x + 6).attr("y", d => d.y + 4).style("fill", d => S.coul(d.p)).text(d => `${S.lab(d.p)} ${nf(d.v, 0)}`);
  decouper(svgE, el, y, m, W, H);
  const tipE = $("viEvolTip"), repere = svgE.append("line").attr("class", "vi-repere").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
  svgE.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
    .on("mousemove", ev => {
      if (!sond.length) return;
      const [mx] = d3.pointer(ev), dt = x.invert(mx), s = sond.reduce((a, b) => Math.abs(t(b.d) - dt) < Math.abs(t(a.d) - dt) ? b : a);
      repere.style("display", null).attr("x1", x(t(s.d))).attr("x2", x(t(s.d)));
      tipE.hidden = false; tipE.innerHTML = `<b>${esc(s.f)}</b><small>${dateFr(s.d)}${s.n ? ` · ${esc(s.n)}` : ""}</small>`
        + Object.entries(s.v).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span style="--c:${S.coul(k)}"><i></i>${esc(etatP.choix === "duels" || S.direct ? S.lab(k) : k)} <b>${nf(v, 1)} %</b></span>`).join("");
      const r = el.getBoundingClientRect(), px = x(t(s.d)) * r.width / W;
      placerBulle(tipE, px, r.width);
    })
    .on("mouseleave", () => { repere.style("display", "none"); tipE.hidden = true; });
  $("viEvolNote").textContent = S.note(sond.length) + (per !== periode ? ` Trop peu de sondages sur la période choisie : tout est affiché ${depuis}.` : "");
}

/* ---------- « Comprendre le système politique et électoral » : grande fenêtre en deux parties (votes-quebec/systeme.js) ----------
   Une seule fenêtre pour les trois vues (Chambre, Sénat, présidentielle). Partie 1, système politique : régime présidentiel,
   président, Congrès, Cour suprême, fédéralisme, qui contrôle quoi aujourd'hui. Partie 2, système électoral : Chambre, Sénat,
   présidentielle et collège électoral, calendrier, électeurs. Les chiffres viennent des données de la page : Chambre actuelle et
   Sénat (projection.json), élection de 2024 à la Chambre (resultats-2024.json), présidentielles de 2024 et 2020
   (presidentielles.json), districts redécoupés (data.json). */
// jour du scrutin fédéral : le mardi qui suit le premier lundi de novembre
const jourElection = an => { const j = new Date(Date.UTC(an, 10, 1)).getUTCDay(); return `${an}-11-${String(2 + (8 - j) % 7).padStart(2, "0")}`; };
function systemeElectoral() {
  if (!R24 || !RP || !PROJ) return;
  const P24 = RP["2024"], P20 = RP["2020"], pct = (n, t) => 100 * n / t;
  const vainq = r => r.ve.R > r.ve.D ? "R" : "D", perd = r => vainq(r) === "R" ? "D" : "R";
  const g24 = vainq(P24), g20 = vainq(P20), court = (r, k) => r.noms[k].split(" ").slice(-1)[0];
  const veTot = P24.ve.R + P24.ve.D, veMaj = Math.floor(veTot / 2) + 1;
  const totVoix = (P24.voix.R + P24.voix.D) / ((P24.national.R + P24.national.D) / 100);   // avec les autres candidats
  // États : écart entre les deux premiers en 2024
  const E = P24.etats, abs = Object.keys(E), marge = ab => Math.abs(E[ab].D - E[ab].R);
  const serres = abs.filter(ab => marge(ab) < 5).sort((a, b) => marge(a) - marge(b)), veSerres = d3.sum(serres, ab => E[ab].ve);
  const largues = abs.filter(ab => marge(ab) >= 15).length, plusSerre = serres[0];
  const basculesSerres = serres.filter(ab => P20.etats[ab] && P20.etats[ab].g !== E[ab].g).length;
  const voixPlusSerre = plusSerre && Math.round(marge(plusSerre) / 100 * E[plusSerre].voix / 1000) * 1000;
  const veChange = abs.filter(ab => P20.etats[ab] && P20.etats[ab].ve !== E[ab].ve).length;
  // Chambre : élection de 2024
  const H = R24.circ, nH = Object.keys(H).length, majH = Math.floor(nH / 2) + 1;
  const ecartH = c => { const v = Object.values(c.s).sort((a, b) => b - a); return v[0] - (v[1] || 0); };
  const sansDuel = Object.values(H).filter(c => !(c.s.D != null && c.s.R != null)).length;
  const serresH = Object.values(H).filter(c => Object.keys(c.s).length > 1 && ecartH(c) < 5).length, surs = Object.values(H).filter(c => ecartH(c) >= 20).length;
  const parEtat = {}; Object.keys(H).forEach(k => { const ab = k.split("-")[0]; parEtat[ab] = (parEtat[ab] || 0) + 1; });
  const grosAb = Object.keys(parEtat).sort((a, b) => parEtat[b] - parEtat[a])[0], unSeul = Object.keys(parEtat).filter(ab => parEtat[ab] === 1).length;
  const tH = R24.sieges.R >= R24.sieges.D ? "R" : "D";
  // Congrès aujourd'hui : Chambre (Clerk) et Sénat (indépendants comptés avec les démocrates)
  const nA = { R: 0, D: 0, I: 0, VAC: 0 }; Object.values(PROJ.actuel).forEach(a => nA[a ? a.p : "VAC"] = (nA[a ? a.p : "VAC"] || 0) + 1);
  const nS = { R: 0, D: 0, I: 0, VAC: 0 }; Object.values(SEN().etats).forEach(e => e.senateurs.forEach(x => nS[x.p || "VAC"] = (nS[x.p || "VAC"] || 0) + 1));
  const presParti = g24, majCh = nA.R >= majH ? "R" : nA.D + nA.I >= majH ? "D" : null;
  const majSen = nS.R >= 51 ? "R" : nS.D + nS.I >= 51 ? "D" : nS.R === nS.D + nS.I ? presParti : null;   // à 50-50, le vice-président départage
  const unifie = majCh === presParti && majSen === presParti;
  const PARTI = { R: "républicain", D: "démocrate" }, PARTIS = { R: "républicains", D: "démocrates" };
  const etatCongres = unifie
    ? `Aujourd'hui, le gouvernement est <b>unifié</b>&nbsp;: la Maison-Blanche (${esc(P24.noms[presParti])}, élu en ${P24.date.slice(0, 4)}), la Chambre et le Sénat sont tous ${PARTIS[presParti]}.`
    : `Aujourd'hui, le gouvernement est <b>divisé</b>&nbsp;: la Maison-Blanche est ${PARTI[presParti]} (${esc(P24.noms[presParti])}, élu en ${P24.date.slice(0, 4)}), la Chambre ${majCh ? `est ${PARTI[majCh]}` : "n'a pas de majorité claire"} et le Sénat ${majSen ? `est ${PARTI[majSen]}` : "n'a pas de majorité claire"}.`;
  const courses = Object.values(SEN().etats).flatMap(e => e.courses), partielles = courses.filter(c => c.special).length;
  // prochaine élection fédérale
  const auj = new Date().toISOString().slice(0, 10);
  let anP = +auj.slice(0, 4); if (anP % 2 || auj > jourElection(anP)) anP += anP % 2 ? 1 : 2;
  const prochaine = `le ${dateFr(jourElection(anP))} (${anP % 4 ? "élections de mi-mandat" : "présidentielle"})`;
  // graphique part des voix / part des sièges : même échelle pour la Chambre et la présidentielle
  const lignesH = [tH, tH === "R" ? "D" : "R"].map(k => ({ lab: k, c: COUL[k], v: R24.national[k], s: pct(R24.sieges[k], nH), n: `${R24.sieges[k]} sièges (${nf(pct(R24.sieges[k], nH), 0)} %)` }));
  const lignesP = [g24, perd(P24)].map(k => ({ lab: esc(court(P24, k)), c: COUL[k], v: P24.national[k], s: pct(P24.ve[k], veTot), n: `${P24.ve[k]} sur ${veTot} (${nf(pct(P24.ve[k], veTot), 0)} %)` }));
  const echelle = 100 / (Math.ceil(Math.max(...[...lignesH, ...lignesP].flatMap(l => [l.v, l.s])) / 10) * 10);
  const graphe = (L, unite) => `<div class="vi-dlg-vs">${L.map(l => `<div class="vi-dlg-vs-ligne" style="--c:${l.c}"><b>${l.lab}</b>
      <span class="vi-dlg-vs-barres"><i style="width:${echelle * l.v}%"></i><i style="width:${Math.max(0.6, echelle * l.s)}%"></i></span>
      <small>${nf(l.v, 1)} % des voix<br>${l.n}</small></div>`).join("")}</div>
    <div class="vi-dlg-legende"><span>part des voix</span><span>part des ${unite}</span></div>`;
  const grapheH = graphe(lignesH, "sièges"), grapheP = graphe(lignesP, "grands électeurs");
  const sGagnant = pct(P24.ve[g24], veTot);

  const politique = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système politique">
      <div><b class="vi-dlg-long">République fédérale</b><small>à régime présidentiel : le président ne dépend pas du Congrès</small></div>
      <div><b>2 chambres</b><small>le Congrès : ${nH} représentants et 100 sénateurs</small></div>
      <div><b>4 ans</b><small>mandat du président, deux mandats au plus</small></div>
      <div><b>50 États</b><small>chacun avec sa constitution, son gouverneur et sa législature</small></div>
    </section>
    <section>
      <h3>Le régime politique</h3>
      <p>Les États-Unis sont une <b>république fédérale</b> dotée d'un <b>régime présidentiel</b>. La Constitution de 1787, toujours en vigueur, sépare nettement trois pouvoirs et donne à chacun des moyens de freiner les deux autres : c'est le principe des <b>freins et contrepoids</b> (« checks and balances »).</p>
      <ul>
        <li><b>Pouvoir exécutif</b> : le <b>président</b>, à la fois chef de l'État et chef du gouvernement, et commandant en chef des forces armées.</li>
        <li><b>Pouvoir législatif</b> : le <b>Congrès</b>, formé de deux chambres, la Chambre des représentants et le Sénat. Il adopte les lois et le budget.</li>
        <li><b>Pouvoir judiciaire</b> : les tribunaux fédéraux, avec au sommet la <b>Cour suprême</b>, qui peut invalider une loi ou une décision contraire à la Constitution.</li>
      </ul>
    </section>
    <section>
      <h3>Le président</h3>
      <p>Le président est élu pour <b>quatre ans</b> (voir la partie <a href="#" data-aller="electoral">Système électoral</a>). Depuis le 22<sup>e</sup> amendement (1951), personne ne peut être élu plus de <b>deux fois</b>. Il faut avoir au moins 35 ans, être citoyen de naissance et résider aux États-Unis depuis au moins 14 ans.</p>
      <ul>
        <li><b>Gouvernement</b> : le président choisit les secrétaires (l'équivalent des ministres), qui dirigent les départements fédéraux. Ils ne sont pas membres du Congrès, et le Sénat doit confirmer leur nomination.</li>
        <li><b>Veto</b> : le président peut refuser de signer une loi adoptée par le Congrès. Le Congrès peut passer outre si les <b>deux tiers</b> des membres de chaque chambre votent de nouveau la loi.</li>
        <li><b>Vice-président</b> : élu en même temps que le président, il le remplace en cas de décès, de démission ou de destitution. Il préside le Sénat, mais n'y vote que pour <b>départager une égalité</b> (50 contre 50).</li>
      </ul>
    </section>
    <section>
      <h3>Le Congrès : deux chambres égales</h3>
      <p>Une loi doit être adoptée dans les mêmes termes par les deux chambres, puis signée par le président (ou adoptée malgré son veto).</p>
      <ul>
        <li><b>Chambre des représentants</b> : ${nH} membres élus pour <b>deux ans</b>, répartis entre les États selon leur population après chaque recensement (tous les dix ans) ; chaque État en a au moins un. Les projets de loi sur les impôts doivent commencer à la Chambre. Les représentants élisent leur président (le « speaker »), chef de la majorité, qui vient tout de suite après le vice-président dans l'ordre de succession. Il faut ${majH} sièges pour la majorité.</li>
        <li><b>Sénat</b> : 100 sénateurs, <b>deux par État</b> quelle que soit sa population, élus pour <b>six ans</b> ; un tiers des sièges est renouvelé tous les deux ans. Le Sénat <b>confirme les nominations</b> du président (secrétaires, juges, ambassadeurs) à la majorité, et <b>ratifie les traités</b> aux deux tiers. Selon ses règles, il faut en général 60 voix sur 100 pour mettre fin au débat sur un projet de loi (l'obstruction, ou « filibuster »).</li>
        <li><b>Destitution</b> : la Chambre peut <b>mettre en accusation</b> le président ou un juge, à la majorité ; le Sénat le <b>juge</b>, et il faut les deux tiers des sénateurs pour le démettre.</li>
      </ul>
    </section>
    <section>
      <h3>Pas de vote de confiance</h3>
      <p>Contrairement au Québec et au Canada (voir les pages <a href="votes-quebec.html">Votes Québec</a> et <a href="votes-canada.html">Votes Canada</a>), il n'y a pas de premier ministre ni de gouvernement responsable devant les élus. Le président ne dépend pas de la confiance du Congrès : le Congrès ne peut pas le renverser, sauf par une destitution pour une faute grave, et le président ne peut pas dissoudre le Congrès ni déclencher d'élection. Les élections ont toujours lieu aux dates prévues.</p>
      <p>La Maison-Blanche et le Congrès sont donc parfois contrôlés par des partis différents : on parle de <b>gouvernement divisé</b>. Le président doit alors négocier avec l'autre parti pour faire adopter ses lois et son budget.</p>
      <table class="vi-dlg-tab"><caption>Le Congrès aujourd'hui</caption>
        <thead><tr><th scope="col">Parti</th><th scope="col">Chambre<small>${nH} sièges · majorité ${majH}</small><small>au ${dateFr(PROJ.clerk)}</small></th><th scope="col">Sénat<small>100 sièges · majorité 51</small></th></tr></thead>
        <tbody>${["R", "D", "I", "VAC"].filter(k => nA[k] || nS[k]).map(k => `<tr style="--c:${k === "VAC" ? "var(--muted)" : COUL[k]}"><th scope="row"><i></i>${k === "VAC" ? "Sièges vacants" : NOMS[k] + (k === "I" ? "s" : "")}</th><td>${nA[k] || 0}</td><td>${nS[k] || 0}</td></tr>`).join("")}</tbody></table>
      <p>${etatCongres}${nS.I ? ` Les ${nS.I} sénateurs indépendants votent avec les démocrates.` : ""}</p>
    </section>
    <section>
      <h3>La Cour suprême</h3>
      <p>La Cour suprême compte <b>neuf juges</b> (un nombre fixé par une loi, inchangé depuis 1869). Le président les nomme, le Sénat confirme leur nomination, et ils restent en poste <b>à vie</b>, sauf démission ou destitution. Comme leurs décisions s'imposent au Congrès, au président et aux États, chaque nomination est un enjeu politique majeur.</p>
    </section>
    <section>
      <h3>Le fédéralisme : Washington et les 50 États</h3>
      <p>Les <b>50 États</b> ont chacun leur constitution, leur <b>gouverneur</b> élu et leur <b>législature</b> (à deux chambres partout, sauf au Nebraska). Ils gardent tous les pouvoirs que la Constitution ne confie pas au gouvernement fédéral : droit criminel et civil, écoles, routes, organisation des élections. Le District de Columbia, où se trouve la capitale, Washington, n'est pas un État : il n'a pas de sénateur et n'est représenté à la Chambre que par un délégué sans droit de vote.</p>
      <p>Pour modifier la Constitution, il faut l'appui des deux tiers de chaque chambre du Congrès, puis la ratification par les trois quarts des États (38 sur 50).</p>
    </section>`;

  const electoral = `
    <section class="vi-dlg-chiffres" aria-label="En bref : système électoral">
      <div><b>${veTot}</b><small>grands électeurs élisent le président ; il en faut ${veMaj}</small></div>
      <div><b>${nH}</b><small>districts, un représentant chacun, élu pour deux ans</small></div>
      <div><b>2 ans</b><small>entre deux élections ; prochaine le ${dateFr(jourElection(anP))}</small></div>
      <div><b>${nf(sGagnant, 0)} %</b><small>des grands électeurs pour ${esc(P24.noms[g24])} en ${P24.date.slice(0, 4)}, avec ${nf(P24.national[g24], 1)} % des voix</small></div>
    </section>
    <section>
      <h3>Quand vote-t-on ?</h3>
      <p>Les élections fédérales ont lieu à <b>date fixe</b> : le mardi qui suit le premier lundi de novembre, les années paires. Tous les deux ans, on élit toute la Chambre des représentants et un tiers du Sénat. Une fois sur deux, on élit aussi le président ; l'autre fois, à mi-chemin du mandat présidentiel, ce sont les <b>élections de mi-mandat</b>, souvent défavorables au parti du président. Prochaine élection : <b>${prochaine}</b>.</p>
    </section>
    <section>
      <h3>La Chambre : un district, un représentant</h3>
      <p>Chaque État est découpé en autant de districts qu'il reçoit de sièges après le recensement : de 1 (dans ${unSeul} États) à ${parEtat[grosAb]} (${esc(ETAT_NOM[grosAb] || grosAb)}). Dans chaque district, en général, le candidat qui a le plus de voix est élu, même sans majorité : c'est le <b>scrutin majoritaire à un tour</b>, comme au Québec et au Canada. L'Alaska et le Maine utilisent le <b>vote préférentiel</b> : les électeurs classent les candidats, et on redistribue les voix des derniers jusqu'à ce qu'un candidat ait la majorité.</p>
      <p>Avant l'élection, chaque parti choisit son candidat lors d'une <b>primaire</b> organisée par l'État. En Californie et dans l'État de Washington, les deux premiers de la primaire, tous partis confondus, passent à l'élection : deux candidats du même parti peuvent s'y affronter. Un siège qui se libère en cours de mandat est comblé par une élection partielle.</p>
    </section>
    <section>
      <h3>Des voix aux sièges : la Chambre en 2024</h3>
      <p>${Math.abs(pct(R24.sieges[tH], nH) - R24.national[tH]) < 3 ? "Au niveau national, la Chambre a reflété d'assez près le vote populaire en 2024, mais" : "Les sièges ne suivent pas forcément le vote populaire, et"} la plupart des districts ne sont pas disputés : en 2024, <b>${surs} districts sur ${nH}</b> ont été gagnés par 20 points ou plus, et seulement ${serresH} par moins de 5 points. Dans ${sansDuel} districts, un des deux grands partis n'avait même pas de candidat à l'élection.</p>
      ${grapheH}
      <p>En 2024, le ${NOMS[tH]} a obtenu ${nf(R24.national[tH], 1)} % des voix et ${R24.sieges[tH]} sièges sur ${nH}, soit ${nf(pct(R24.sieges[tH], nH), 1)} % de la Chambre${R24.sieges[tH] >= majH ? (R24.sieges[tH] - majH <= 5 ? `, juste assez pour la majorité (${majH})` : `, la majorité (${majH})`) : ""}. Le reste des voix est allé à de petits partis et à des indépendants.</p>
    </section>
    <section>
      <h3>Le découpage des districts</h3>
      <p>Après chaque recensement, les États redessinent leurs districts, qui doivent avoir à peu près la même population. Dans la plupart des États, c'est la législature qui trace la carte ; quelques-uns, comme la Californie, confient cette tâche à une commission indépendante. Le parti au pouvoir peut dessiner les districts à son avantage : c'est le <b>découpage partisan</b> (« gerrymandering »), qui consiste à concentrer les électeurs adverses dans quelques districts ou à les disperser dans plusieurs. Depuis 2019, la Cour suprême considère que les tribunaux fédéraux ne peuvent pas juger ce découpage partisan.${DATA.redecoupes?.length ? ` Depuis 2024, ${DATA.redecoupes.length} États ont redessiné leurs districts sans attendre le prochain recensement (voir la carte de la Chambre).` : ""}</p>
    </section>
    <section>
      <h3>Le Sénat : tout l'État vote</h3>
      <p>Les sénateurs sont élus directement par les électeurs de tout l'État (depuis le 17<sup>e</sup> amendement, en 1913), en général au scrutin majoritaire à un tour. Les deux sièges d'un État ne sont jamais en jeu à la même élection ordinaire. Quelques États, comme la Géorgie, tiennent un second tour si personne n'obtient la majorité. Quand un siège se libère, le gouverneur nomme en général un remplaçant jusqu'à une élection partielle.${courses.length ? ` À la prochaine élection, ${courses.length} sièges sont en jeu${partielles ? `, dont ${partielles} élection${partielles > 1 ? "s" : ""} partielle${partielles > 1 ? "s" : ""}` : ""}.` : ""}</p>
    </section>
    <section>
      <h3>La présidentielle : primaires, puis collège électoral</h3>
      <p>L'élection se déroule en plusieurs étapes.</p>
      <ul>
        <li><b>Les primaires</b> : de janvier à juin, chaque parti désigne son candidat, État par État, lors de primaires (un vote) ou de caucus (des assemblées de membres). Les délégués ainsi gagnés votent ensuite pour le candidat lors de la convention nationale du parti, l'été.</li>
        <li><b>Le collège électoral</b> : en novembre, les électeurs de chaque État votent pour un candidat, mais ce sont des <b>grands électeurs</b> qui élisent le président. Chaque État en a autant que de représentants et de sénateurs (au moins trois), et le District de Columbia en a trois : ${veTot} au total. Il faut <b>${veMaj}</b> grands électeurs pour être élu.</li>
        <li><b>Le gagnant prend tout</b> : dans 48 États et dans le District de Columbia, le candidat en tête remporte tous les grands électeurs de l'État, même par quelques voix. Le Maine et le Nebraska en donnent deux au gagnant de l'État et un au gagnant de chaque district.</li>
        <li><b>Après le vote</b> : les grands électeurs votent en décembre, le Congrès compte leurs voix le 6 janvier, et le président entre en fonction le 20 janvier. Si personne n'atteint ${veMaj}, c'est la Chambre qui élit le président, à raison d'une voix par État.</li>
      </ul>
      ${grapheP}
      <p>En ${P24.date.slice(0, 4)}, ${esc(P24.noms[g24])} a obtenu ${nf(P24.national[g24], 1)} % des voix, mais ${P24.ve[g24]} grands électeurs, soit ${nf(sGagnant, 0)} % du collège. En ${P20.date.slice(0, 4)}, ${esc(P20.noms[g20])} avait obtenu ${nf(P20.national[g20], 1)} % des voix et ${P20.ve[g20]} grands électeurs (${nf(pct(P20.ve[g20], P20.ve.R + P20.ve.D), 0)} %). Le collège électoral amplifie donc la victoire, et il peut même la renverser : en 2000 et en 2016, le candidat élu avait obtenu moins de voix que son adversaire à l'échelle du pays.${veChange ? ` La répartition des grands électeurs suit le recensement : entre 2020 et 2024, ${veChange} États en ont gagné ou perdu.` : ""}</p>
    </section>
    <section>
      <h3>Une élection décidée dans quelques États</h3>
      <p>La plupart des États votent toujours pour le même parti : en ${P24.date.slice(0, 4)}, ${largues} des ${abs.length} États (en comptant le District de Columbia) ont été gagnés par 15 points ou plus. Les candidats font donc campagne surtout dans les <b>États serrés</b> (« swing states »), qui décident de l'élection.${plusSerre ? ` L'État le plus serré (${esc(ETAT_NOM[plusSerre] || plusSerre)}) a été gagné par environ ${nf(voixPlusSerre)} voix, et ses ${E[plusSerre].ve} grands électeurs sont tous allés au gagnant.` : ""}</p>
      ${serres.length ? `<table class="vi-dlg-tab"><caption>Les ${serres.length} États gagnés par moins de 5 points en ${P24.date.slice(0, 4)} (${veSerres} grands électeurs)</caption>
        <thead><tr><th scope="col">État</th><th scope="col">Écart<small>en ${P24.date.slice(0, 4)}</small></th><th scope="col">Grands<small>électeurs</small></th></tr></thead>
        <tbody>${serres.map(ab => `<tr style="--c:${COUL[E[ab].g]}"><th scope="row"><i></i>${esc(ETAT_NOM[ab] || ab)}</th><td><b>${ecartTxt(E[ab]).replace(" ", "&nbsp;")}</b></td><td>${E[ab].ve}</td></tr>`).join("")}</tbody></table>
      <p>${basculesSerres ? `${basculesSerres} de ces ${serres.length} États avaient voté pour l'autre parti en ${P20.date.slice(0, 4)}.` : `Ces ${serres.length} États avaient tous voté pour le même parti en ${P20.date.slice(0, 4)}.`}</p>` : ""}
    </section>
    <section>
      <h3>Qui vote, et comment</h3>
      <p>Pour voter, il faut être citoyen américain et avoir 18 ans (depuis le 26<sup>e</sup> amendement, en 1971). Il n'y a pas d'organisme électoral national comme Élections Québec : chaque État, avec ses comtés, organise le vote et fixe ses propres règles. Les listes électorales relèvent aussi des États : il faut être inscrit sur celle de son État (le Dakota du Nord est le seul à ne pas exiger d'inscription). Les règles sur la pièce d'identité, le vote anticipé et le vote par la poste varient beaucoup d'un État à l'autre. En ${P24.date.slice(0, 4)}, environ ${nf(Math.round(totVoix / 1e6))} millions d'électeurs ont voté à la présidentielle.</p>
    </section>`;

  // versions courtes : l'essentiel en quelques points, mêmes chiffres clés et mêmes graphiques des voix et des sièges
  const tuilesPol = politique.slice(0, politique.indexOf("</section>") + 10), tuilesElec = electoral.slice(0, electoral.indexOf("</section>") + 10);
  const point = (n, html) => `<li><b>${n}</b><span>${html}</span></li>`;
  const politiqueCourt = `${tuilesPol}
    <ol class="vi-dlg-court">
      ${point(1, `Les États-Unis sont une <b>république fédérale</b> à <b>régime présidentiel</b> : trois pouvoirs séparés, qui se freinent les uns les autres.`)}
      ${point(2, `Le <b>président</b> est chef de l'État et du gouvernement, élu pour quatre ans, deux fois au plus. Il ne dépend pas de la confiance du Congrès et ne peut pas le dissoudre.`)}
      ${point(3, `Le <b>Congrès</b> a deux chambres : la Chambre des représentants (${nH} membres, deux ans) et le Sénat (100 membres, deux par État, six ans). Une loi doit passer dans les deux, puis être signée par le président, dont le veto peut être renversé aux deux tiers.`)}
      ${point(4, `La <b>Cour suprême</b> (neuf juges nommés à vie par le président et confirmés par le Sénat) peut invalider une loi contraire à la Constitution.`)}
      ${point(5, `Les <b>50 États</b> ont leur gouverneur et leur législature. ${etatCongres}`)}
    </ol>`;
  const electoralCourt = `${tuilesElec}
    <ol class="vi-dlg-court">
      ${point(1, `<b>Tous les deux ans</b>, en novembre : toute la Chambre et un tiers du Sénat ; le président, une fois sur deux. Prochaine élection : ${prochaine}.`)}
      ${point(2, `<b>Chambre</b> : dans chacun des ${nH} districts, le candidat qui a le plus de voix est élu (vote préférentiel en Alaska et au Maine). Les États redessinent les districts après chaque recensement, parfois à l'avantage d'un parti.`)}
    </ol>
    ${grapheH}
    <ol class="vi-dlg-court" start="3">
      ${point(3, `<b>Sénat</b> : les électeurs de tout l'État élisent leurs deux sénateurs, à des élections différentes.`)}
      ${point(4, `<b>Président</b> : chaque parti choisit son candidat lors de primaires, puis ${veTot} grands électeurs élisent le président ; il en faut ${veMaj}. Dans presque tous les États, le gagnant prend tous les grands électeurs de l'État.`)}
    </ol>
    ${grapheP}
    <ol class="vi-dlg-court" start="5">
      ${point(5, `On peut donc être élu <b>sans avoir le plus de voix</b> : c'est arrivé en 2000 et en 2016. Chaque État organise le vote et fixe ses règles (inscription, vote anticipé, vote par la poste).`)}
    </ol>`;
  preparerSysteme({ sur: "États-Unis · Congrès et présidence", titre: "Le système politique et électoral des États-Unis",
    parties: [
      { id: "politique", onglet: "Système politique", chapeau: "Qui gouverne et comment : le président, le Congrès, la Cour suprême et le partage des pouvoirs avec les États.", html: politique, court: politiqueCourt },
      { id: "electoral", onglet: "Système électoral", chapeau: "Comment on choisit les élus : la Chambre, le Sénat, la présidentielle et le collège électoral, le calendrier et les électeurs.", html: electoral, court: electoralCourt }] });
}

/* ---------- démarrage ---------- */
async function demarrer() {
  if (demarre) return; demarre = true;
  activerSigles(PARTIS.usa, $("viPlan").closest("section"));   // rectangle de l\'assemblée : nom complet et brève description des partis au survol
  try {
    const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u + " : " + r.status); return r.json(); });
    [DATA, PROJ, R24, SOND, PRES, RP] = await Promise.all([lireJ("votes-usa/data.json"), lireJ("votes-usa/projection.json"), lireJ("votes-usa/resultats-2024.json"),
      lireJ("votes-usa/sondages.json"), lireJ("votes-usa/presidentielle.json"), lireJ("votes-usa/presidentielles.json"), lireVerif("usa")]);
    DATA.etats.forEach(e => { AB_DE[e.fips] = e.ab; ETAT_NOM[e.ab] = e.nom; });
    AB_DE["11"] = "DC"; ETAT_NOM.DC = "District de Columbia";             // présidentielle seulement (pas de district ni de sénateur)
    couleursPrimaires();
    DATA.districts.forEach(d => NOM26[d.id] = d.n); DATA.districts24.forEach(d => NOM24[d.id] = d.n);
    ajouterChoixType(); dessinerTete(); construireCarte(); outilsCarte(); peindre(); dessinerPanneau(); dessinerEvolution(); systemeElectoral();
    $("viPeriodes").addEventListener("click", e => { const b = e.target.closest("button[data-per]"); if (!b) return;
      periode = +b.dataset.per; ecrireLS("vuPeriode", periode); dessinerEvolution(); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(dessinerEvolution, 200); });
  } catch (e) { $("viSource").textContent = "Chargement impossible : " + e.message; console.error(e); }
  $("vue-votes").removeAttribute("aria-busy");   // affiche la page (données prêtes, ou message d'erreur)
}
window.addEventListener("vue-votes", demarrer);
if (!$("vue-votes").hidden) demarrer();
