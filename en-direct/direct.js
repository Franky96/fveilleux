/* Page « En direct » (en-direct.html) : élection générale en Colombie-Britannique du samedi 24 octobre 2026 (élection anticipée,
   93 circonscriptions, majorité 47). Reprend les blocs de l'ancien direct de l'élection québécoise (votes-quebec/live.js) et du
   référendum en Alberta (archivé : en-direct/alberta-2026/) : lecture chaque minute avec décompte, sièges et voix par parti, carte
   des circonscriptions avec zooms et plein écran, fiche, circonscriptions suivies avec alertes, classement.

   Données : api/cb.php (relais des pages de résultats d'Elections BC, cache 45 s : pas d'en-tête CORS) ; à défaut,
   en-direct/resultats.json (copie du pipeline GitHub, en-direct/outils/cb.py). Les deux rendent les pages brutes ; on les lit ici
   en reconnaissant les candidats de la liste officielle (en-direct/candidats.json) : l'ordre des colonnes importe peu.
   Carte : en-direct/circonscriptions.json (93 circonscriptions de 2023, BC Data Catalogue, Open Government Licence – British Columbia),
   découpées au littoral (terres d'OpenStreetMap simplifiées, osmdata.openstreetmap.de, ODbL) : la mer et les îles se voient.
   Élection de 2024 (mêmes circonscriptions) : en-direct/resultats-2024.json (gains, comparaison). */

const RAFRAICHIR = 60;                                         // secondes entre deux lectures
const NB = 93, MAJ = 47;
const OUVERTURE = new Date("2026-10-24T08:00:00-07:00"), FERMETURE = new Date("2026-10-24T20:00:00-07:00");   // heure avancée du Pacifique
const SITE_RES = "https://elections.bc.ca/resources/results/provincial-election-results/";
const SERRE = 5;                                               // lutte serrée : moins de 5 points d'écart

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const secQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" });
const heureCb = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Vancouver" });
const deux = n => String(n).padStart(2, "0");
const ilYa = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${deux(Math.floor(s / 60) % 60)}`; };
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };

/* ---------- partis (liste officielle des candidats d'Elections BC, 3 octobre 2026) ---------- */
const PARTIS = {
  ndp: { court: "NPD", nom: "Nouveau Parti démocratique de la C.-B.", chef: "David Eby (premier ministre sortant)", c: "#F37021", s24: 47, v24: 44.86 },
  con: { court: "PCCB", nom: "Parti conservateur de la C.-B.", chef: "Lorne Doerkson (chef par intérim)", c: "#1A4E8C", s24: 44, v24: 43.28 },
  grn: { court: "Verts", nom: "Parti vert de la C.-B.", chef: "Emily Lowan", c: "#3A9A3E", s24: 2, v24: 8.24 },
  ctr: { court: "CentreBC", nom: "CentreBC", chef: "Elenore Sturko", c: "#8E5BB5", s24: 0 },
  one: { court: "OneBC", nom: "OneBC", chef: "Dallas Brodie (cheffe par intérim)", c: "#9B2335", s24: 0 },
  ind: { court: "Ind.", nom: "Indépendants", c: "#6B7280", s24: 0 },
  aut: { court: "Autres", nom: "Autres partis", c: "#A3A8B1", s24: 0 },
};
const ORDRE_P = ["ndp", "con", "grn", "ctr", "one", "ind", "aut"];
const coulP = p => PARTIS[p]?.c || PARTIS.aut.c;

// grandes régions (pour les zooms) : préfixes des codes ou noms
const ZONES = {
  van: n => /^Vancouver/.test(n),
  sur: n => /^Surrey/.test(n),
  vic: n => /^(Victoria|Saanich|Oak Bay|Esquimalt|Langford)/.test(n),
  ok: n => /^(Kelowna|Penticton|Vernon|West Kelowna)/.test(n),
  gv: n => !/Sea to Sky/.test(n) && /^(Vancouver|Burnaby|Surrey|Richmond|Delta|Coquitlam|Port Coquitlam|Port Moody|New Westminster|North Vancouver|West Vancouver|Langley|Maple Ridge|Pitt Meadows)/.test(n),
};

let GEO = null, PAR_CODE = {}, CANDS = {}, R24 = {}, RES = null, brut = null, lu = null;
let sel = null, carteMarge = false, carteGains = false, prochaine = 0;

/* ---------- lecture des pages d'Elections BC ----------
   On ne suppose pas l'ordre des colonnes : dans chaque ligne de tableau (ou objet JSON), un nom de candidat de la liste officielle
   donne la circonscription et le parti ; le plus grand nombre entier de la ligne (hors pourcentages) donne les voix. */
let INDEX = null;                                        // nom normalisé → [{ code, cand }]
function indexer() {
  INDEX = new Map();
  for (const [code, L] of Object.entries(CANDS)) for (const c of L) {
    const k = norm(c.nom); if (!INDEX.has(k)) INDEX.set(k, []); INDEX.get(k).push({ code, cand: c });
  }
}
const entier = t => { const s = String(t).trim(); return /^\d{1,3}([ ,  ]?\d{3})*$|^\d+$/.test(s) ? +s.replace(/\D/g, "") : null; };
function trouverCand(texte, code) {
  const k = norm(texte); if (k.length < 4) return null;
  let L = INDEX.get(k);
  if (!L) for (const [nom, l] of INDEX) if (k.includes(nom) && nom.length >= 6) { L = l; break; }   // « Pam Alexis (BC NDP) », « ✔ Pam Alexis »
  if (!L) return null;
  return (code && L.find(x => x.code === code)) || (L.length === 1 ? L[0] : null);
}
function trouverCirc(texte) {
  const k = norm(texte); if (!k) return null;
  for (const [code, nom] of Object.entries(PAR_CODE)) if (norm(nom) === k || norm(code) === k) return code;
  return null;
}
function ajouter(out, code, cand, voix, elu) {
  const c = out.circ[code] ||= { cands: {}, sec: null };
  const prev = c.cands[cand.nom];
  if (!prev || voix > prev.voix) c.cands[cand.nom] = { nom: cand.nom, parti: cand.parti, aff: cand.aff, voix, elu: !!elu || !!prev?.elu };
}
function sections(out, code, txt) {
  const m = /(\d[\d,]*)\s*(?:of|\/|sur|de)\s*(\d[\d,]*)/i.exec(txt);
  if (code && m && /poll|ballot|box|report|section|count|urne/i.test(txt)) out.circ[code] ||= { cands: {}, sec: null }, out.circ[code].sec = [+m[1].replace(/,/g, ""), +m[2].replace(/,/g, "")];
}
// rapport « Results by Candidate » d'Elections BC (results.elections.bc.ca, Results_<n>_GE-2026-10-24_Candidate.html) : une ligne
// tr[data-ed] par candidat (td[data-canname], affiliation, voix, %), puis les totaux et deux lignes « … ballot boxes | a of b reported »
const AFF = { "bc ndp": "ndp", "conservative party": "con", "bc green party": "grn", "centrebc": "ctr", "onebc": "one", "independent": "ind", "unaffiliated": "ind" };
function lireRapportEbc(doc, out) {
  const lignes = doc.querySelectorAll("#tblReport tr[data-ed]");
  if (!lignes.length) return false;
  const boites = {};
  for (const tr of lignes) {
    const code = trouverCirc(tr.dataset.ed); if (!code) continue;
    const c = out.circ[code] ||= { cands: {}, sec: null };
    const tds = [...tr.children].map(td => td.textContent.replace(/\s+/g, " ").trim());
    const nomTd = tr.querySelector("td[data-canname]");
    if (nomTd) {
      const nom = (nomTd.dataset.canname || nomTd.textContent).trim();
      const cand = trouverCand(nom, code)?.cand || { nom, parti: AFF[(tds[2] || "").toLowerCase()] || "aut", aff: tds[2] || "" };
      ajouter(out, code, cand, entier(tds[3]) ?? 0, /elected|✓|✔/i.test(tr.textContent) || !!tr.querySelector(".elected, [class*=elect], img[alt*=lect i]"));
      continue;
    }
    if (/^Rejected/i.test(tds[1] || "")) { c.rej = entier(tds[3]) ?? 0; continue; }
    const m = /ballot boxes\s*\|\s*([\d,]+)\s+of\s+([\d,]+)/i.exec(tds.join(" "));
    if (m) { const b = boites[code] ||= [0, 0]; b[0] += +m[1].replace(/,/g, ""); b[1] += +m[2].replace(/,/g, ""); c.sec = b.slice(); }
  }
  // résumé du haut : urnes dépouillées, participation préliminaire, électeurs inscrits
  const t = doc.body.textContent.replace(/\s+/g, " ");
  const num = re => { const m = re.exec(t); return m ? +m[1].replace(/,/g, "") : null; };
  out.resume = { urnes: num(/([\d.]+)\s*%\s*Of ballot boxes reporting/i), part: num(/([\d.]+)\s*%\s*Preliminary Voter Turnout/i),
    consid: num(/([\d,]+)\s*Total Votes Considered/i), inscrits: num(/([\d,]+)\s*Registered voters/i) };
  return true;
}
function lireHtml(corps, out) {
  const doc = new DOMParser().parseFromString(corps, "text/html");
  if (lireRapportEbc(doc, out)) return;
  let courant = null;
  for (const el of doc.querySelectorAll("h1,h2,h3,h4,h5,caption,tr,p,div.ed,span.ed")) {
    if (el.tagName !== "TR") { const c = trouverCirc(el.textContent) || trouverCirc(el.textContent.split(/[-–:(]/)[0]); if (c) courant = c; sections(out, courant, el.textContent); continue; }
    const cells = [...el.children].map(td => td.textContent.replace(/\s+/g, " ").trim());
    for (const t of cells) { const c = trouverCirc(t); if (c) { courant = c; break; } }
    let cand = null; for (const t of cells) { cand = trouverCand(t, courant); if (cand) break; }
    if (!cand) { sections(out, courant, cells.join(" ")); continue; }
    courant = cand.code;
    const nombres = cells.filter(t => !/%/.test(t)).map(entier).filter(v => v != null);
    const elu = cells.some(t => /^(elected|élu|élue|✓|✔|y|yes)$/i.test(t)) || !!el.querySelector("img[alt*=lect i], .elected, [class*=elected]");
    if (nombres.length) ajouter(out, cand.code, cand.cand, Math.max(...nombres), elu);
  }
}
function lireJson(o, out, cle = "", circ = null) {
  if (Array.isArray(o)) { for (const x of o) lireJson(x, out, cle, circ); return; }
  if (!o || typeof o !== "object") return;
  const vals = Object.entries(o);
  for (const [, v] of vals) if (typeof v === "string") { const c = trouverCirc(v); if (c) { circ = c; break; } }
  let cand = null;
  for (const [, v] of vals) if (typeof v === "string") { cand = trouverCand(v, circ); if (cand) break; }
  if (cand) {
    const num = vals.filter(([k, v]) => typeof v === "number" || (typeof v === "string" && entier(v) != null)).map(([k, v]) => [k, typeof v === "number" ? v : entier(v)]);
    const voix = num.find(([k]) => /vote/i.test(k) && !/pct|percent|%/i.test(k)) || num.filter(([k, v]) => Number.isInteger(v)).sort((a, b) => b[1] - a[1])[0];
    const elu = vals.some(([k, v]) => /elect|winner|elu/i.test(k) && (v === true || /^(y|yes|true|elected)$/i.test(String(v))));
    if (voix) ajouter(out, cand.code, cand.cand, voix[1], elu);
  } else if (circ) {
    const rep = vals.find(([k]) => /report|counted|complete/i.test(k)), tot = vals.find(([k]) => /total.*(poll|box)|(poll|box).*total|expected/i.test(k));
    if (rep && tot && +rep[1] >= 0 && +tot[1] > 0) { out.circ[circ] ||= { cands: {}, sec: null }; out.circ[circ].sec = [+rep[1], +tot[1]]; }
  }
  for (const [k, v] of vals) if (v && typeof v === "object") lireJson(v, out, k, circ);
}
function normaliser(d) {
  if (!INDEX) indexer();
  const out = { maj: d.maj ? new Date(d.maj) : null, circ: {}, pages: 0 };
  for (const p of d.pages || []) {
    out.pages++;
    try { if (p.type === "json" || /^\s*[[{]/.test(p.corps)) lireJson(JSON.parse(p.corps), out); else lireHtml(p.corps, out); } catch { /* page illisible */ }
  }
  for (const c of Object.values(out.circ)) {
    c.cands = Object.values(c.cands).sort((a, b) => b.voix - a.voix);
    c.total = c.cands.reduce((s, k) => s + k.voix, 0);
    c.final = c.cands.some(k => k.elu) || (c.sec && c.sec[1] && c.sec[0] >= c.sec[1]);
    c.frac = c.sec && c.sec[1] ? Math.min(1, c.sec[0] / c.sec[1]) : null;
  }
  out.lus = Object.values(out.circ).filter(c => c.total > 0).length;
  return out;
}

/* ---------- lecture : relais du site, sinon copie du pipeline ---------- */
async function lireRelais() {
  const r = await fetch("api/cb.php?type=resultats", { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { const d = await r.json(); return d && d.pages ? d : null; } catch { return null; }   // pas de PHP (serveur local) : copie du pipeline
}
async function lireCopie() {
  const r = await fetch("en-direct/resultats.json", { cache: "no-cache" });
  return r.ok ? { ...(await r.json()), publie: r.headers.get("last-modified") } : null;
}
async function lire() {
  let relais = null, copie = null;
  try { relais = await lireRelais(); } catch (e) { if (/Session/.test(e.message)) throw e; }
  if (!relais?.disponible) copie = await lireCopie().catch(() => null);
  if (relais?.disponible) return { ...relais, via: "relais" };
  if (copie?.disponible) return { ...copie, via: "copie" };
  return relais ? { ...relais, via: "relais" } : copie ? { ...copie, via: "copie" } : null;
}
async function actualiser() {
  prochaine = Date.now() + RAFRAICHIR * 1000;
  $("lvEtat").textContent = "Mise à jour…";
  try {
    brut = await lire(); lu = new Date();
    RES = brut ? normaliser(brut) : null;
    surveiller(); dessiner();
  } catch (e) { $("lvEtat").textContent = e.message; }
}
function afficherDecompte() {
  const reste = Math.max(0, Math.ceil((prochaine - Date.now()) / 1000));
  $("lvDecompte").textContent = document.hidden ? "en pause" : reste + " s";
  $("lvMaj").style.setProperty("--fait", (1 - reste / RAFRAICHIR).toFixed(3));
  $("lvMaj").title = `Lecture automatique toutes les ${RAFRAICHIR} s · prochaine dans ${reste} s`;
  if (lu) dessinerVerifs();
  dessinerCompte();
}

/* ---------- accès aux résultats ---------- */
const enCirc = code => { const c = RES?.circ?.[code]; return c && c.total > 0 ? c : null; };
const pctC = (c, k) => c.total ? 100 * k.voix / c.total : 0;
const tete = c => c?.cands?.[0] || null;
const ecartPts = c => c.cands.length > 1 ? pctC(c, c.cands[0]) - pctC(c, c.cands[1]) : 100;
const auMoinsUn = () => !!RES?.lus;
function sieges() {
  const s = Object.fromEntries(ORDRE_P.map(p => [p, { elus: 0, avance: 0, voix: 0 }]));
  for (const c of Object.values(RES?.circ || {})) {
    if (!(c.total > 0)) continue;
    s[tete(c).parti][c.final ? "elus" : "avance"]++;
    for (const k of c.cands) s[k.parti].voix += k.voix;
  }
  return s;
}

/* ---------- état, heures ---------- */
function dessinerEtat() {
  const b = $("lvBanniere"), ferme = new Date() >= FERMETURE;
  $("edAvant").hidden = ferme;
  const lien = `<a href="${SITE_RES}" target="_blank" rel="noopener">site d'Elections BC</a>`;
  b.hidden = false;
  if (RES?.pages && !auMoinsUn() && ferme && brut?.disponible) b.innerHTML = `Elections BC publie des résultats, mais leur présentation n'a pas pu être lue ici. En attendant une correction, voir le ${lien}.`;
  else if (!auMoinsUn()) b.innerHTML = ferme
    ? `<b>Bureaux fermés</b> : en attente des premiers résultats d'Elections BC (vérification chaque minute). Pour cette élection anticipée, le dépouillement se fait à la main : les premiers chiffres peuvent tarder.`
    : `Les résultats préliminaires s'afficheront ici après la fermeture des bureaux, ce <b>samedi 24 octobre à 20 h, heure du Pacifique (23 h, heure du Québec)</b>.`;
  else b.hidden = true;
  if (!RES) { $("lvEtat").textContent = "Résultats indisponibles pour le moment · nouvel essai chaque minute"; return; }
  if (!auMoinsUn()) { $("lvEtat").textContent = "En attente des premiers résultats · vérification chaque minute"; dessinerVerifs(); return; }
  const fin = Object.values(RES.circ).filter(c => c.final).length;
  $("lvEtat").innerHTML = ["<b>Résultats préliminaires</b>", `${RES.lus} circonscription${RES.lus > 1 ? "s" : ""} sur ${NB} avec des résultats`, fin ? `${fin} entièrement dépouillée${fin > 1 ? "s" : ""}` : "",
    RES.resume?.urnes != null ? `${nf(RES.resume.urnes, RES.resume.urnes < 1 ? 2 : 1)} % des urnes` : ""].filter(Boolean).join(" · ");
  dessinerVerifs();
}
function dessinerVerifs() {
  const el = $("lvHeures"); el.hidden = !brut; if (el.hidden) return;
  const m = Date.now(), verif = brut.via === "relais" && brut.ageCache != null ? new Date(lu - brut.ageCache * 1000) : null;
  const publie = brut.via === "copie" && brut.publie ? new Date(brut.publie) : null;
  el.innerHTML = `<span><b>Vérifiées</b> sur le <a href="${SITE_RES}" target="_blank" rel="noopener">site d'Elections BC</a> ${verif ? `par le site à ${secQc(verif)} (il y a ${ilYa(m - verif)})`
    : `par la copie de secours du pipeline${publie && !isNaN(publie) ? `, mise en ligne à ${heureQc(publie)} (il y a ${ilYa(m - publie)})` : ""}`}`
    + (lu ? ` · relues par cette page à ${secQc(lu)}` : "") + ` · heures du Québec</span>`;
}
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date(), cible = m < OUVERTURE ? OUVERTURE : FERMETURE, ms = Math.max(0, cible - m);
  const h = Math.floor(ms / 36e5), mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  $("edCompte").innerHTML = `<span class="lv-eyebrow">${m < OUVERTURE ? "Ouverture des bureaux" : "Fermeture des bureaux"}</span>
    <h3>${m < OUVERTURE ? "Les bureaux ouvrent dans" : "Les bureaux ferment dans"}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${[[deux(h), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>Samedi 24 octobre à <b>${m < OUVERTURE ? "8 h" : "20 h"}, heure du Pacifique</b> (${m < OUVERTURE ? "11 h" : "23 h"}, heure du Québec). La Colombie-Britannique a trois heures de moins que le Québec.</p>`;
}
function dessinerHeures() {
  const m = new Date();
  const L = [
    ["Vote par anticipation", "Du vendredi 16 au mercredi 21 octobre", "Dans n'importe quel bureau d'anticipation de la province", new Date("2026-10-21T20:00:00-07:00")],
    ["Jour du vote", "Samedi 24 octobre, de 8 h à 20 h (heure du Pacifique)", "De 11 h à 23 h, heure du Québec", FERMETURE],
    ["Dépouillement préliminaire", "Dès 20 h (23 h au Québec)", "Comptage à la main pour cette élection anticipée : les résultats arrivent au fil de la soirée", FERMETURE],
    ["Dépouillement final", "Du 6 au 10 novembre (prévu)", "Votes par correspondance et bulletins non comptés le soir du vote ; recomptages judiciaires possibles dans les luttes très serrées", new Date("2026-11-10T20:00:00-08:00")],
    ["Jour du rapport des brefs", "Mercredi 18 novembre", "Résultats officiels", new Date("2026-11-18T20:00:00-08:00")],
  ];
  $("edHeures").innerHTML = L.map(([t, a, b, fin]) => `<li class="${m > fin ? "ed-passe" : ""}"><b>${t}</b><span>${a}<small>${b}</small></span></li>`).join("");
}

/* ---------- sièges et voix par parti ---------- */
function dessinerSieges() {
  const s = sieges(), tot = p => s[p].elus + s[p].avance, voixT = ORDRE_P.reduce((x, p) => x + s[p].voix, 0);
  const ordre = ORDRE_P.filter(p => tot(p) > 0).sort((a, b) => tot(b) - tot(a) || ORDRE_P.indexOf(a) - ORDRE_P.indexOf(b));
  const pct = n => (100 * n / NB) + "%";
  $("lvBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${pct(tot(p))};--c:${coulP(p)}" title="${esc(PARTIS[p].nom)} : ${tot(p)} siège${tot(p) > 1 ? "s" : ""} (${s[p].elus} élu${s[p].elus > 1 ? "s" : ""}, ${s[p].avance} en tête)">`
    + `<i class="lv-elus" style="width:${100 * s[p].elus / tot(p)}%"></i><b>${esc(PARTIS[p].court)} ${tot(p)}</b></span>`).join("");
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const lead = ordre[0];
  $("lvSiegesTitre").textContent = !lead ? (new Date() < FERMETURE ? "Sièges : les résultats commencent à la fermeture des bureaux" : "Aucune circonscription dépouillée pour l'instant")
    : tot(lead) >= MAJ ? `${PARTIS[lead].nom} : ${tot(lead)} sièges, au-delà de la majorité (${MAJ})` : `${PARTIS[lead].nom} en tête avec ${tot(lead)} siège${tot(lead) > 1 ? "s" : ""} (majorité : ${MAJ})`;
  const montres = ORDRE_P.filter(p => tot(p) > 0 || s[p].voix > 0 || PARTIS[p].s24 > 0 || ["ctr", "one"].includes(p));
  $("lvPartis").innerHTML = montres.sort((a, b) => tot(b) - tot(a) || s[b].voix - s[a].voix || ORDRE_P.indexOf(a) - ORDRE_P.indexOf(b)).map(p => {
    const v = voixT ? 100 * s[p].voix / voixT : null, P = PARTIS[p];
    return `<div class="lv-parti" style="--c:${P.c}" title="${esc(P.nom)}${P.chef ? " · " + esc(P.chef) : ""}"><i></i><span class="lv-pnom">${esc(P.court)}</span>`
      + `<b>${auMoinsUn() ? tot(p) : "—"}</b><small>${auMoinsUn() ? `${s[p].elus} élu${s[p].elus > 1 ? "s" : ""} · ${s[p].avance} en tête · ` : ""}2024 : ${P.s24} siège${P.s24 > 1 ? "s" : ""}${P.v24 ? `, ${nf(P.v24, 1)} %` : ""}</small>`
      + `<span class="lv-pvote">${v != null ? nf(v, 1) + " %" : ""}</span></div>`;
  }).join("");
  const fin = Object.values(RES?.circ || {}).filter(c => c.final).length;
  const R = RES?.resume || {};
  $("edKv").innerHTML = [[`${RES?.lus || 0} / ${NB}`, "circonscriptions avec des résultats"], [nf(fin), "circonscriptions entièrement dépouillées"],
    [R.urnes != null ? nf(R.urnes, R.urnes < 1 ? 2 : 1) + " %" : "—", "des urnes dépouillées"], [R.part != null ? nf(R.part, 1) + " %" : "—", "participation préliminaire"],
    [voixT ? nf(voixT) : "—", `voix valides comptées${R.inscrits ? ` · ${nf(R.inscrits)} inscrits` : ""}`]]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>${lead ? (tot(lead) >= MAJ ? `${PARTIS[lead].court} majoritaire` : `${PARTIS[lead].court} en tête`) : "Sièges"}</b><span>majorité ${MAJ} · ${RES?.lus || 0}/${NB} circ.</span></div>`
    + `<div class="lv-bp-barre">${ordre.map(p => `<span style="width:${pct(tot(p))};--c:${coulP(p)}"><i style="width:${100 * s[p].elus / tot(p)}%"></i></span>`).join("")}<em style="left:${100 * MAJ / NB}%"></em></div>`
    + `<div class="lv-bp-partis">${lead ? ordre.map(p => `<span style="--c:${coulP(p)}"><i></i>${esc(PARTIS[p].court)} <b>${tot(p)}</b></span>`).join("") : `<span>En attente des premiers résultats</span>`}</div>`;
}

/* ---------- carte ---------- */
let svg, gZ, ZOOM, PATH, MW = 560, MH = 640, tip, gSuiv, gSel;
const gagnant24 = code => R24[code]?.gagnant || null;
function remplir(code) {
  const c = enCirc(code);
  if (!c) return ["var(--soft)", 1];
  const p = tete(c).parti;
  if (carteGains) return gagnant24(code) && gagnant24(code) !== p ? [coulP(p), 1] : ["var(--soft)", 1];
  if (carteMarge) return [coulP(p), Math.max(0.2, Math.min(1, 0.2 + ecartPts(c) / 40))];
  return [coulP(p), c.final || c.frac == null ? 1 : 0.35 + 0.6 * c.frac];
}
function dessinerCarte() {
  if (!gZ) return;
  gZ.selectAll("path.lv-rid").each(function (f) { const [col, op] = remplir(f.properties.n); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null ? [] : GEO.features.filter(f => f.properties.n === sel)).join("path").attr("class", "lv-selline").attr("d", PATH);
  dessinerContoursSuivis(); dessinerLegende();
}
function dessinerLegende() {
  const s = sieges(), pres = ORDRE_P.filter(p => s[p].elus + s[p].avance > 0);
  $("edLegende").innerHTML = (pres.length ? pres : ["ndp", "con", "grn"]).map(p => `<span class="ed-legende-k" style="--c:${coulP(p)}"><i></i>${esc(PARTIS[p].court)} en tête</span>`).join("")
    + `<span>${carteGains ? "· seulement les circonscriptions qui changent de parti par rapport à 2024" : carteMarge ? "· couleur d'autant plus foncée que l'écart est grand (pleine à 32 points et plus)" : "· plus la couleur est pâle, moins il y a d'urnes dépouillées"} · gris : aucun résultat</span>`;
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  b.setAttribute("aria-pressed", carteSuivis); b.textContent = carteSuivis ? `★ Suivies (${suivies.size})` : "★ Suivies";
  if (!gSuiv) return;
  const d = carteSuivis ? GEO.features.filter(f => suivies.has(f.properties.n)) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-halo").attr("d", PATH);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-ligne").attr("d", PATH).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
function infobulle(e, f) {
  const code = f.properties.n, c = enCirc(code);
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 12, box.width - 240) + "px"; tip.style.top = Math.min(e.clientY - box.top + 12, box.height - 120) + "px";
  const nom = `<b>${suivies.has(code) ? "★ " : ""}${esc(PAR_CODE[code])}</b>`;
  tip.innerHTML = nom + (c ? c.cands.slice(0, 3).map(k => `<span class="ed-tip-l" style="--c:${coulP(k.parti)}"><span><i></i>${esc(k.nom)} (${esc(PARTIS[k.parti]?.court || k.aff)})</span><b>${nf(pctC(c, k), 1)} %</b></span>`).join("")
    + `<small>${c.final ? "terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % des urnes" : "dépouillement en cours"}${gagnant24(code) ? ` · 2024 : ${esc(PARTIS[gagnant24(code)].court)}` : ""}</small>`
    : `<br><small>Aucun résultat${gagnant24(code) ? ` · 2024 : ${esc(PARTIS[gagnant24(code)].court)}` : ""}</small>`);
}
function construireCarte() {
  if (svg) return;
  const proj = d3.geoConicConformal().rotate([126, 0]).parallels([49, 58]).fitExtent([[10, 10], [MW - 10, MH - 10]], GEO);
  PATH = d3.geoPath(proj);
  svg = d3.select($("lvCarte")).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove();
  // mer : fond bleuté sous les circonscriptions, découpées au littoral (les îles se voient)
  // (teinte du fond de la carte à peine bleutée, sombre en thème sombre ; terres opaques dessous : une circonscription pâle
  // — peu d'urnes dépouillées — se mêle au fond des terres, pas au bleu de la mer)
  svg.append("rect").attr("x", -2000).attr("y", -2000).attr("width", MW + 4000).attr("height", MH + 4000).style("fill", "color-mix(in srgb, var(--surface) 86%, #2a78c8)").style("pointer-events", "none");
  gZ = svg.append("g");
  gZ.append("g").selectAll("path").data(GEO.features).join("path").attr("d", PATH).style("fill", "var(--surface)").style("stroke", "none").style("pointer-events", "none");
  gZ.append("g").selectAll("path").data(GEO.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => f.properties.nom)
    .on("click", (e, f) => choisir(f.properties.n))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.n); } })
    .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  gSuiv = gZ.append("g"); gSel = gZ.append("g");
  ZOOM = d3.zoom().scaleExtent([1, 80]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => gZ.attr("transform", e.transform));
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(80, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (ZONES[z]) vers(PATH.bounds({ type: "FeatureCollection", features: GEO.features.filter(f => ZONES[z](f.properties.nom)) }));
  else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
  else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
}
let info = () => {};
function preparerCarte() {
  tip = $("lvTip");
  const carte = $("lvCarte").parentElement;
  carte.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau")) e.preventDefault(); }, { passive: false });
  carte.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "plein") pleinEcran();
    else if (z === "marge" || z === "gains") basculer(z);
    else zoomer(z);
  });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "cbCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
  const ecran = () => document.fullscreenElement || document.webkitFullscreenElement;
  const repere = document.createComment("place de la fiche");
  info = ouvrir => {
    const pan = $("lvPanneau");
    if (ouvrir && pan.parentElement !== carte) { pan.before(repere); carte.appendChild(pan); pan.classList.add("lv-panneau-plein"); }
    if (!ouvrir && pan.parentElement === carte) { repere.replaceWith(pan); pan.classList.remove("lv-panneau-plein"); }
    $("lvInfo").setAttribute("aria-pressed", ouvrir);
  };
  $("lvInfo").addEventListener("click", () => info($("lvInfo").getAttribute("aria-pressed") !== "true"));
  let avant = false;
  const plein = () => !!ecran() || carte.classList.contains("lv-plein");
  const etatPlein = () => {
    const on = plein();
    $("lvPlein").setAttribute("aria-pressed", on);
    $("lvPlein").textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    if (on && !avant) info(innerWidth > 900);
    if (!on) info(false);
    avant = on;
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
// Écart / Gains : un seul à la fois, ou aucun
function basculer(z) {
  carteMarge = z === "marge" && !carteMarge;
  carteGains = z === "gains" && !carteGains;
  $("edMarge").setAttribute("aria-pressed", carteMarge); $("edGains").setAttribute("aria-pressed", carteGains);
  dessinerCarte();
}

/* ---------- fiche (panneau de droite) ---------- */
function dessinerPanneau() {
  const p = $("lvPanneau");
  if (sel == null) {
    p.innerHTML = `<span class="lv-eyebrow">Circonscriptions</span><h3>Clique sur une circonscription</h3>
      <p class="lv-muted">Couleur : parti en tête. Plus la couleur est pâle, moins il y a d'urnes dépouillées ; gris : aucun résultat. « Gains » ne montre que les circonscriptions qui changent de parti par rapport à 2024 (mêmes limites).</p>
      <div class="lv-kv"><div><b>${RES?.lus || 0}</b><span>avec résultats</span></div><div><b>${NB - (RES?.lus || 0)}</b><span>sans résultat</span></div><div><b>${MAJ}</b><span>majorité</span></div></div>`;
    return;
  }
  const c = enCirc(sel), g24 = gagnant24(sel), r24 = R24[sel];
  let html = `<span class="lv-eyebrow">Circonscription · ${esc(sel)}</span><h3>${esc(PAR_CODE[sel])}</h3>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${sel}" aria-pressed="${suivies.has(sel)}" style="--c:#B7860B">${suivies.has(sel) ? "★ Suivie" : "☆ Suivre"}</button></div>`;
  if (c) {
    const [a, b] = c.cands, ecart = b ? a.voix - b.voix : a.voix;
    html += `<div class="lv-chips"><span class="lv-chip ${c.final ? "fin" : ""}">${c.final ? "Dépouillement terminé" : c.sec ? `${nf(c.sec[0])} / ${nf(c.sec[1])} urnes (${nf(100 * c.frac, 0)} %)` : "Dépouillement en cours"}</span>`
      + (g24 && g24 !== a.parti ? `<span class="lv-chip" style="--c:${coulP(a.parti)}">Gain ${esc(PARTIS[a.parti].court)} (2024 : ${esc(PARTIS[g24].court)})</span>` : "") + `</div>`
      + `<p class="lv-tete" style="--c:${coulP(a.parti)}"><b>${esc(a.nom)}</b> (${esc(PARTIS[a.parti]?.court || a.aff)}) ${a.elu || c.final ? "élu·e" : "en tête"}${b ? ` par ${nf(ecart)} voix (${nf(pctC(c, a) - pctC(c, b), 1)} pt)` : ""}</p>`
      + `<table class="lv-cands"><tbody>${c.cands.map(k => `<tr style="--c:${coulP(k.parti)}"><td><i class="lv-pt" style="background:${coulP(k.parti)}"></i></td>`
        + `<td><b>${esc(k.nom)}</b>${k.elu ? ' <span class="lv-sortant">élu·e</span>' : ""}<small>${esc(k.aff || PARTIS[k.parti]?.nom)}</small><span class="lv-jauge"><i style="width:${Math.min(100, pctC(c, k))}%"></i></span></td>`
        + `<td class="lv-num"><b>${nf(pctC(c, k), 1)} %</b><small>${nf(k.voix)}</small></td></tr>`).join("")}</tbody></table>`;
  } else {
    html += `<div class="lv-chips"><span class="lv-chip">Aucun résultat pour l'instant</span></div>`;
    const L = (CANDS[sel] || []).slice().sort((x, y) => ORDRE_P.indexOf(x.parti) - ORDRE_P.indexOf(y.parti) || x.nom.localeCompare(y.nom, "fr"));
    if (L.length) html += `<span class="lv-eyebrow">Candidatures (${L.length})</span><ul class="lv-liste">${L.map(k => `<li style="--c:${coulP(k.parti)}"><i class="lv-pt" style="background:${coulP(k.parti)}"></i><span><b>${esc(k.nom)}</b><small>${esc(k.aff)}</small></span></li>`).join("")}</ul>`;
  }
  if (r24?.cands?.length) html += `<p class="lv-muted lv-proj">En 2024 : ${r24.cands.slice(0, 3).map(k => `<b style="color:${coulP(k.parti)}">${esc(PARTIS[k.parti]?.court || k.parti)}</b> ${nf(k.pct, 1)} %`).join(" · ")} (${esc(r24.cands[0].nom)} élu·e)</p>`;
  p.innerHTML = html;
}

/* ---------- circonscriptions suivies, alertes, classement ---------- */
let suivies = new Set(lireLS(localStorage, "cbSuivies", []));
let carteSuivis = lireLS(localStorage, "cbCarteSuivies", false), triClassement = lireLS(localStorage, "cbTri", "serre");
let connus = lireLS(sessionStorage, "cbConnus", null);
function basculerSuivie(code) {
  suivies.has(code) ? suivies.delete(code) : suivies.add(code);
  ecrireLS(localStorage, "cbSuivies", [...suivies]);
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
function ligne(code) {
  const c = enCirc(code), a = c && tete(c);
  return `<li class="lv-ligne" data-rid="${code}" tabindex="0"><button type="button" class="lv-etoile" data-suivre="${code}" aria-pressed="${suivies.has(code)}" aria-label="Suivre ${esc(PAR_CODE[code])}">${suivies.has(code) ? "★" : "☆"}</button>`
    + `<span class="lv-nom" style="--c:${a ? coulP(a.parti) : "var(--soft)"}"><i></i>${esc(PAR_CODE[code])}</span>`
    + `<span class="lv-ecart">${a ? `${esc(PARTIS[a.parti].court)} +${nf(ecartPts(c), 1)} pt` : "—"}<small>${c ? (c.final ? "terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % urnes" : "") : ""}</small></span></li>`;
}
function dessinerSuivi() {
  $("lvSuivies").innerHTML = suivies.size ? `<ul class="lv-lignes">${[...suivies].filter(k => PAR_CODE[k]).sort((a, b) => PAR_CODE[a].localeCompare(PAR_CODE[b], "fr")).map(ligne).join("")}</ul>`
    : `<p class="lv-muted">Clique sur ☆ dans la fiche ou le classement pour suivre une circonscription : elle s'affiche ici, et une alerte apparaît quand le parti en tête change.</p>`;
  const TRIS = [["serre", "Plus serrées"], ["nom", "Par nom"]];
  $("lvPPChoix").innerHTML = TRIS.map(([k, l]) => `<button type="button" data-tri="${k}" aria-pressed="${triClassement === k}">${l}</button>`).join("");
  const codes = Object.keys(PAR_CODE).sort((a, b) => {
    if (triClassement === "nom") return PAR_CODE[a].localeCompare(PAR_CODE[b], "fr");
    const ca = enCirc(a), cb = enCirc(b);
    return (ca ? ecartPts(ca) : 999) - (cb ? ecartPts(cb) : 999) || PAR_CODE[a].localeCompare(PAR_CODE[b], "fr");
  });
  $("lvParParti").innerHTML = `<ul class="lv-lignes">${codes.map(ligne).join("")}</ul>`;
}
function surveiller() {
  const now = {};
  for (const code of Object.keys(PAR_CODE)) { const c = enCirc(code); if (c) now[code] = tete(c).parti; }
  if (connus) for (const code of suivies) if (now[code] && connus[code] && now[code] !== connus[code])
    alerter(`${PAR_CODE[code]} : ${PARTIS[now[code]].court} passe en tête devant ${PARTIS[connus[code]].court}`, coulP(now[code]));
  connus = now; ecrireLS(sessionStorage, "cbConnus", connus);
}
function alerter(txt, c) {
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", c); el.textContent = "★ " + txt;
  $("lvAlertes").appendChild(el); setTimeout(() => el.remove(), 12000);
}

/* ---------- textes fixes ---------- */
function dessinerTextes() {
  $("edPartis").innerHTML = `<span class="lv-eyebrow">Les partis</span><h3 id="edPartisTitre">Qui se présente</h3>
    <p class="lv-muted">Élection anticipée déclenchée par le premier ministre David Eby le 22 septembre 2026 (la prochaine élection à date fixe aurait eu lieu en octobre 2028). 353 candidatures dans les 93 circonscriptions ; BC United, deuxième parti en 2020, a été radié de la liste des partis enregistrés.</p>
    <div class="lv-partis">${ORDRE_P.filter(p => PARTIS[p].chef).map(p => { const n = Object.values(CANDS).flat().filter(k => k.parti === p).length;
      return `<div class="lv-parti" style="--c:${PARTIS[p].c}"><i></i><span class="lv-pnom">${esc(PARTIS[p].nom)}</span><b>${n}</b><small>candidat·e·s · chef : ${esc(PARTIS[p].chef)}${PARTIS[p].s24 ? ` · ${PARTIS[p].s24} sièges en 2024` : ""}</small></div>`; }).join("")}</div>`;
  $("edSource").innerHTML = `Sources : résultats préliminaires d'<a href="${SITE_RES}" target="_blank" rel="noopener">Elections BC</a> (non officiels jusqu'au dépouillement final du 6 au 10 novembre) ;
    liste des candidats d'Elections BC (3 octobre 2026) ; circonscriptions de 2023, BC Data Catalogue (Open Government Licence – British Columbia), découpées au littoral d'OpenStreetMap (© contributeurs d'OpenStreetMap, ODbL) ; élection de 2024 : Elections BC.`;
}

function dessiner() { dessinerEtat(); dessinerSieges(); dessinerCarte(); dessinerPanneau(); dessinerSuivi(); }
function choisir(code, defiler = true) {
  sel = code; dessinerCarte(); dessinerPanneau(); info($("lvInfo").getAttribute("aria-pressed") === "true" || false);
  if (defiler && innerWidth <= 900 && !document.querySelector(".lv-cartecard.lv-plein, .lv-cartecard:fullscreen")) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function demarrer() {
  const [geo, cands, r24] = await Promise.all([
    fetch("en-direct/circonscriptions.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("en-direct/candidats.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("en-direct/resultats-2024.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : { circ: {} }).catch(() => ({ circ: {} })),
  ]);
  GEO = geo; CANDS = cands.circ; R24 = r24.circ || {};
  for (const f of GEO.features) PAR_CODE[f.properties.n] = f.properties.nom;
  dessinerHeures(); dessinerTextes(); preparerCarte(); construireCarte();
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-suivre]"); if (s) { e.stopPropagation(); basculerSuivie(s.dataset.suivre); return; }
    const t = e.target.closest("[data-tri]"); if (t) { triClassement = t.dataset.tri; ecrireLS(localStorage, "cbTri", triClassement); dessinerSuivi(); return; }
    const l = e.target.closest(".lv-ligne"); if (l) choisir(l.dataset.rid);
  });
  $("lvPPReplier").addEventListener("click", () => { const ouvert = $("lvPPSection").hasAttribute("data-ferme"); $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); });
  $("lvMaj").addEventListener("click", actualiser);
  dessiner();
  await actualiser();
  setInterval(() => { if (!document.hidden && Date.now() >= prochaine) actualiser(); afficherDecompte(); }, 1000);
  setInterval(dessinerHeures, 60000);
}
demarrer();
