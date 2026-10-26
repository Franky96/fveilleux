/* Page « En direct » (en-direct.html) : élections de mi-mandat aux États-Unis du mardi 3 novembre 2026. Les 435 sièges de la Chambre
   des représentants (majorité 218), 35 sièges du Sénat (33 de la classe 2, et deux élections spéciales : Ohio et Floride) et 36 gouverneurs.
   Même cadre que les autres soirées de novembre (bloc « gen » du gabarit) et mêmes blocs que la soirée de la Colombie-Britannique
   (archivée : en-direct/cb-2026/) : lecture chaque minute avec décompte, sièges par parti, carte avec zooms et plein écran, fiche,
   courses suivies avec alertes, classement ; choix Chambre · Sénat · Gouverneurs.

   Résultats : api/usa.php (relais des flux de CNN, cache 30 s) ; sinon les flux de CNN lus directement (ils permettent la lecture
   depuis un autre site) ; sinon en-direct/etats-unis/resultats.json (copie du pipeline GitHub, en-direct/etats-unis/outils/usa.py).
   Avant les résultats : cotes du consensus de 270toWin, sortants et candidats (votes-usa/projection.json, pipeline de Votes États-Unis ;
   gouverneurs : en-direct/etats-unis/gouverneurs.json), carte en-direct/etats-unis/carte.json (Census, comme Votes États-Unis).
   Démo (admin) : en-direct.html?demo=2024 (résultats de 2024, même format ; districts de 2026 : quelques États redécoupés ne correspondent pas). */

const RAFRAICHIR = 60;                                         // secondes entre deux lectures
const PARAMS = new URLSearchParams(location.search), DEMO = PARAMS.get("demo") === "2024" ? "2024" : null;
const ANNEE = DEMO || "2026";
const SERRE = 5;                                               // lutte serrée : moins de 5 points d'écart
const SITE_RES = "https://www.cnn.com/election/2026/results";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const secQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" });
const deux = n => String(n).padStart(2, "0");
const ilYa = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${deux(Math.floor(s / 60) % 60)}`; };
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };
const h = t => t.replace(":", " h ").replace(/ h 00$/, " h");   // « 19:30 » → « 19 h 30 »

/* ---------- partis, cotes ---------- */
const PARTIS = {
  D: { court: "D", nom: "Parti démocrate", pl: "démocrates", c: "#2F6BD8" },
  R: { court: "R", nom: "Parti républicain", pl: "républicains", c: "#D63A3A" },
  I: { court: "Ind.", nom: "Indépendants", pl: "indépendants", c: "#8A6FD1" },
  A: { court: "Autres", nom: "Autres partis", pl: "autres", c: "#8D949A" },
};
const groupe = p => p === "D" || p === "R" || p === "I" ? p : "A";
const coulP = p => PARTIS[groupe(p)].c;
const nomParti = p => ({ D: "démocrate", R: "républicain", I: "indépendant", L: "libertarien", G: "vert", C: "Constitution" }[p] || p || "autre");
const COTES = ["D3", "D2", "D1", "T", "R1", "R2", "R3"];
const COTE = { D3: ["#1E4CA6", "Sûr D"], D2: ["#4F82DE", "Probable D"], D1: ["#93B5EE", "Penché D"], T: ["#C9A93A", "À égalité"],
  R1: ["#F2A0A0", "Penché R"], R2: ["#E05A5A", "Probable R"], R3: ["#A81E1E", "Sûr R"], N: ["#8D949A", "Non coté"] };

/* ---------- heures de fermeture (dernière fermeture dans l'État, heure de l'Est = heure du Québec, mardi 3 novembre) ----------
   270toWin, « 2026 Poll Closing Times » (d'après The Green Papers) ; un État sur deux fuseaux est classé à sa dernière fermeture. */
const FERMETURES = [
  ["19:00", "GA IN KY SC VA VT"], ["19:30", "NC OH WV"], ["20:00", "AL CT DE DC FL IL ME MD MA MS MO NH NJ OK PA RI TN"], ["20:30", "AR"],
  ["21:00", "AZ CO IA KS LA MI MN NE NM NY ND SD TX WI WY"], ["22:00", "MT NV UT"], ["23:00", "CA ID OR WA"], ["00:00", "HI"], ["01:00", "AK"],
];
const quand = hh => new Date(`2026-11-0${hh < "12" ? 4 : 3}T${hh}:00-05:00`);
const PREMIERE = new Date("2026-11-03T18:00:00-05:00");          // premières fermetures : est de l'Indiana et du Kentucky
const DERNIERE = quand("01:00");
const FERME_ETAT = {}; for (const [hh, L] of FERMETURES) for (const ab of L.split(" ")) FERME_ETAT[ab] = hh;
const etatFerme = ab => DEMO || new Date() >= quand(FERME_ETAT[ab] || "01:00");

/* ---------- données ---------- */
let CARTE = null, PROJ = null, GOUV = null, ETATS = {}, AB = {}, RES = null, brut = null, lu = null, prochaine = 0;
let vue = lireLS(localStorage, "usVue", "H"); if (!["H", "S", "G"].includes(vue)) vue = "H";
let mode = null;                                                // res · prev · gains (null : selon qu'il y a des résultats)
let sel = null;
const VUES = { H: { nom: "Chambre", long: "Chambre des représentants", n: 435, maj: 218, unite: "siège" }, S: { nom: "Sénat", long: "Sénat", n: 100, maj: 51, unite: "siège" },
  G: { nom: "Gouverneurs", long: "Gouverneurs", n: 50, maj: 26, unite: "gouverneur" } };
const nomEtat = fips => ETATS[fips]?.nom || fips;

// courses de chaque vue : identifiant → { nom, etat, cote, sortant, held, cands }
const COURSES = { H: {}, S: {}, G: {} };
function preparerCourses() {
  for (const f of CARTE.districts.features) {
    const id = f.properties.id, c = PROJ.circ?.[id] || {}, act = PROJ.actuel?.[id];
    COURSES.H[id] = { id, nom: f.properties.n, etat: id.slice(0, 2), cote: c.r || "N", held: c.held || act?.p || "", sortant: c.rep || act?.nom || "",
      ret: !!c.ret, cands: c.cands || [], mc: c.mc, mp: c.mp };
  }
  for (const [fips, e] of Object.entries(PROJ.senat?.etats || {})) for (const c of e.courses || []) {
    const sortant = e.senateurs.find(s => s.fin === 2026) || {};
    COURSES.S[fips] = { id: fips, nom: nomEtat(fips), etat: fips, cote: c.r || "N", held: c.held || sortant.p || "", sortant: sortant.nom || "", special: !!c.special,
      ret: !!c.ret, cands: c.cands || [], autre: e.senateurs.find(s => s !== sortant) };
  }
  for (const [fips, e] of Object.entries(GOUV.etats)) if (e.course)
    COURSES.G[fips] = { id: fips, nom: nomEtat(fips), etat: fips, cote: e.r || "N", held: e.p, sortant: e.gov, ret: !!e.ret, limite: !!e.limite, cands: e.cands || [] };
}
// sièges qui ne sont pas en élection (Sénat : classes 1 et 3 ; gouverneurs : 14 États)
function horsCourse(v) {
  const n = { D: 0, R: 0, I: 0, A: 0 };
  if (v === "S") for (const [fips, e] of Object.entries(PROJ.senat?.etats || {})) for (const s of e.senateurs) { if (!(COURSES.S[fips] && s.fin === 2026)) n[groupe(s.p)]++; }
  if (v === "G") for (const e of Object.values(GOUV.etats)) if (!e.course) n[groupe(e.p)]++;
  return n;
}

/* ---------- lecture des flux de CNN : clé « 2026-HG-CA-13 », « 2026-SG-OH », « 2026-S2G-OH » (spéciale), « 2026-GG-AZ » ---------- */
function normaliser(d) {
  const out = { maj: d.maj ? new Date(d.maj) : null, H: {}, S: {}, G: {}, lus: 0 };
  for (const [t, L] of Object.entries(d.courses || {})) for (const r of L || []) {
    const m = /^\d{4}-(H|S2?|G)G-([A-Z]{2})(?:-(\d+))?$/.exec(r.k || ""); if (!m) continue;
    const fips = AB[m[2]]; if (!fips) continue;
    const v = m[1] === "H" ? "H" : m[1] === "G" ? "G" : "S";
    let id = fips;
    if (v === "H") { id = fips + deux(+m[3] || 0); if (!COURSES.H[id] && COURSES.H[fips + "00"]) id = fips + "00"; }   // district unique : « -1 » chez CNN, « 00 » ici
    if (!COURSES[v][id] && !DEMO) continue;
    const cands = (r.cands || []).map(c => ({ nom: c.nom, p: c.p, v: c.v || 0, g: !!c.g, sortant: !!c.sortant, tour2: !!c.tour2 })).sort((a, b) => b.v - a.v || b.g - a.g);
    const total = cands.reduce((s, c) => s + c.v, 0);
    const gagnant = cands.find(c => c.g);
    out[v][id] = { cands, total, pct: r.pct, appel: !!gagnant, gagnant, tour2: cands.some(c => c.tour2), ferme: r.ferme, maj: r.maj ? new Date(r.maj) : null };
  }
  for (const v of ["H", "S", "G"]) out.lus += Object.values(out[v]).filter(a => a.total > 0 || a.appel).length;
  return out;
}

/* ---------- lecture : relais du site, puis flux de CNN directement, puis copie du pipeline ---------- */
async function lireRelais() {
  const r = await fetch(`api/usa.php?annee=${ANNEE}`, { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { const d = await r.json(); return d && d.courses ? d : null; } catch { return null; }   // pas de PHP (serveur local)
}
async function lireCnn() {
  const courses = {};
  await Promise.all(["HG", "SG", "GG"].map(async t => {
    const r = await fetch(`https://politics.api.cnn.io/results/national-races/${ANNEE}-${t}.json`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json().catch(() => null); if (!Array.isArray(d)) return;
    courses[t] = d.filter(x => (x.electionType || "G") === "G").map(x => ({ k: x.ecKey, st: x.stateAbbreviation, pct: x.percentReporting, ferme: x.raceEmbargo?.pollsClosed,
      maj: x.voteTimestamp, cands: (x.candidates || []).map(c => ({ nom: c.fullName, p: c.candidatePartyCode, v: c.voteNum || 0, g: !!c.winner, sortant: !!c.isIncumbent, tour2: !!c.runoffCandidate })) }));
  }));
  return Object.keys(courses).length ? { disponible: true, maj: new Date().toISOString(), courses } : null;
}
async function lireCopie() {
  if (DEMO) return null;
  const r = await fetch("en-direct/etats-unis/resultats.json", { cache: "no-cache" });
  return r.ok ? { ...(await r.json()), publie: r.headers.get("last-modified") } : null;
}
async function lire() {
  let d = null;
  try { d = await lireRelais(); } catch (e) { if (/Session/.test(e.message)) throw e; }
  if (d?.disponible) return { ...d, via: "relais" };
  const cnn = await lireCnn().catch(() => null);
  if (cnn) return { ...cnn, via: "cnn" };
  const copie = await lireCopie().catch(() => null);
  if (copie?.disponible) return { ...copie, via: "copie" };
  return d ? { ...d, via: "relais" } : null;
}
async function actualiser() {
  prochaine = Date.now() + RAFRAICHIR * 1000;
  $("lvEtat").textContent = "Mise à jour…";
  try {
    brut = await lire(); lu = new Date();
    RES = brut ? normaliser(brut) : null;
    if (mode === null && RES?.lus) mode = "res";
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
const res = (v, id) => { const a = RES?.[v]?.[id]; return a && (a.total > 0 || a.appel) ? a : null; };
const pctC = (a, c) => a.total ? 100 * c.v / a.total : 0;
const tete = a => a?.gagnant || a?.cands?.[0] || null;
const ecartPts = a => a.cands.length > 1 && a.total ? pctC(a, a.cands[0]) - pctC(a, a.cands[1]) : 100;
const modeCarte = () => mode || (RES?.lus ? "res" : "prev");
function sieges(v) {
  const s = { D: { elus: 0, avance: 0, voix: 0, hors: 0, gains: 0 }, R: { elus: 0, avance: 0, voix: 0, hors: 0, gains: 0 }, I: { elus: 0, avance: 0, voix: 0, hors: 0, gains: 0 }, A: { elus: 0, avance: 0, voix: 0, hors: 0, gains: 0 } };
  const hc = horsCourse(v); for (const p in hc) s[p].hors = hc[p];
  let avec = 0, appels = 0;
  for (const [id, c] of Object.entries(COURSES[v])) {
    const a = res(v, id); if (!a) continue;
    avec++; const t = tete(a), p = groupe(t.p);
    if (a.appel) { s[p].elus++; appels++; } else s[p].avance++;
    if (c.held && groupe(c.held) !== p) s[p].gains++;
    for (const k of a.cands) s[groupe(k.p)].voix += k.v;
  }
  return { s, avec, appels };
}
const tot = (s, p) => s[p].elus + s[p].avance + s[p].hors;

/* ---------- état, heures ---------- */
function dessinerEtat() {
  const b = $("lvBanniere"), m = new Date();
  $("edAvant").hidden = !!DEMO || m >= DERNIERE;
  const lien = `<a href="${SITE_RES}" target="_blank" rel="noopener">site de CNN</a>`;
  b.hidden = false;
  if (DEMO) b.innerHTML = `<b>DÉMO · résultats de 2024</b> : élection de 2024 lue au même format que le soir du 3 novembre, pour vérifier la page (districts de 2026 : quelques États redécoupés ne correspondent pas ; Sénat : sièges de la classe 1).`;
  else if (!RES?.lus) b.innerHTML = m >= PREMIERE
    ? `<b>Premiers bureaux fermés</b> : en attente des premiers résultats (vérification chaque minute). Les votes par correspondance sont comptés plus tôt dans certains États, plus tard dans d'autres : les premiers chiffres peuvent pencher d'un côté puis de l'autre.`
    : `Les résultats s'afficheront ici dès la fermeture des premiers bureaux, ce <b>mardi 3 novembre à 18 h, heure du Québec</b> (même heure qu'à New York). Les derniers ferment à 1 h (Alaska).`;
  else b.hidden = true;
  if (!RES) { $("lvEtat").textContent = "Résultats indisponibles pour le moment · nouvel essai chaque minute"; return; }
  if (!RES.lus) { $("lvEtat").textContent = "En attente des premiers résultats · vérification chaque minute"; dessinerVerifs(); return; }
  const { avec, appels } = sieges(vue), n = Object.keys(COURSES[vue]).length;
  $("lvEtat").innerHTML = [`<b>${DEMO ? "Démo · 2024" : "Résultats non officiels"}</b>`, `${VUES[vue].nom} : ${avec} course${avec > 1 ? "s" : ""} sur ${n} avec des résultats`,
    appels ? `${appels} appelée${appels > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  dessinerVerifs();
}
function dessinerVerifs() {
  const el = $("lvHeures"); el.hidden = !brut; if (el.hidden) return;
  const m = Date.now(), verif = brut.via === "relais" && brut.ageCache != null ? new Date(lu - brut.ageCache * 1000) : null;
  const publie = brut.via === "copie" && brut.publie ? new Date(brut.publie) : null;
  el.innerHTML = `<span><b>Vérifiées</b> dans les résultats de CNN ${verif ? `par le site à ${secQc(verif)} (il y a ${ilYa(m - verif)})` : brut.via === "cnn" ? "directement par cette page"
    : `par la copie de secours du pipeline${publie && !isNaN(publie) ? `, mise en ligne à ${heureQc(publie)} (il y a ${ilYa(m - publie)})` : ""}`}`
    + (lu ? ` · relues par cette page à ${secQc(lu)}` : "") + ` · heure du Québec (= heure de l'Est)</span>`;
}
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date();
  const prochaineF = m < PREMIERE ? ["18:00", "est de l'Indiana et du Kentucky"] : FERMETURES.find(([hh]) => quand(hh) > m);
  if (!prochaineF) return;
  const cible = m < PREMIERE ? PREMIERE : quand(prochaineF[0]), ms = Math.max(0, cible - m);
  const j = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % (j ? 24 : 1e9), mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  const cases = j ? [[j, j > 1 ? "jours" : "jour"], [deux(hh), "heures"], [deux(mi), "minutes"]] : [[deux(hh), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]];
  const qui = m < PREMIERE ? prochaineF[1] : prochaineF[1].split(" ").map(ab => nomEtat(AB[ab]) || ab).join(", ");
  $("edCompte").innerHTML = `<span class="lv-eyebrow">${m < PREMIERE ? "Premières fermetures des bureaux" : "Prochaine fermeture des bureaux"}</span>
    <h3>${m < PREMIERE ? "Les premiers bureaux ferment dans" : `${h(prochaineF[0])} : fermeture dans`}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${cases.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>${m < PREMIERE ? "Mardi 3 novembre à <b>18 h, heure du Québec</b> : " : ""}${esc(qui)}. Le Québec est à l'heure de l'Est, comme New York : toutes les heures de cette page sont aussi celles du Québec.</p>`;
}
function dessinerHeures() {
  const m = new Date(), n = (L, v) => L.split(" ").filter(ab => COURSES[v][AB[ab]]).length;
  $("edHeures").innerHTML = FERMETURES.map(([hh, L]) => `<li class="${!DEMO && m > quand(hh) ? "ed-passe" : ""}"><b>${h(hh)}</b><span>${L.split(" ").map(ab => esc(ab === "DC" ? "D.C." : nomEtat(AB[ab]) || ab)).join(", ")}`
    + `<small>${[[n(L, "S"), "Sénat"], [n(L, "G"), "gouverneur"]].filter(([k]) => k).map(([k, t]) => `${k} course${k > 1 ? "s" : ""} au ${t === "Sénat" ? "Sénat" : t === "gouverneur" ? "poste de gouverneur" : t}`).join(" · ") || "Chambre seulement"}</small></span></li>`).join("");
}

/* ---------- sièges et voix ---------- */
function dessinerChoix() {
  const el = $("edChoix"); el.hidden = false;
  el.innerHTML = Object.entries(VUES).map(([k, V]) => `<button type="button" data-vue="${k}" aria-pressed="${vue === k}">${V.nom} <small>${k === "H" ? "435 sièges" : k === "S" ? `${Object.keys(COURSES.S).length} courses` : `${Object.keys(COURSES.G).length} courses`}</small></button>`).join("");
}
function dessinerSieges() {
  const V = VUES[vue], { s, avec } = sieges(vue), voixT = ["D", "R", "I", "A"].reduce((x, p) => x + s[p].voix, 0);
  $("edProvSur").textContent = vue === "H" ? "Chambre des représentants · 435 sièges · majorité 218" : vue === "S" ? "Sénat · 100 sièges · majorité 51 (50 avec le vice-président, républicain)"
    : "Gouverneurs · 50 États · 36 en élection";
  const ordre = ["D", "I", "A", "R"], pct = n => (100 * n / V.n) + "%";
  const reste = V.n - ordre.reduce((x, p) => x + tot(s, p), 0);
  const segs = ordre.filter(p => tot(s, p) > 0).map(p => ({ p, n: tot(s, p) }));
  if (!avec && vue !== "G" && !RES?.lus) {
    // avant les résultats : prévisions des analystes (sièges hors élection compris)
    const n = {}; for (const c of Object.values(COURSES[vue])) n[c.cote] = (n[c.cote] || 0) + 1;
    const hors = horsCourse(vue);
    $("lvBarre").innerHTML = [["hD", hors.D + hors.I, "#7E98CC", "D hors élection"], ...COTES.map(k => [k, n[k] || 0, COTE[k][0], COTE[k][1]]), ["hR", hors.R, "#D88F8F", "R hors élection"]]
      .filter(([, k]) => k).map(([k, x, c, l]) => `<span class="lv-seg" style="width:${pct(x)};--c:${c}" title="${esc(l)} : ${x}"><b>${x}</b></span>`).join("");
  } else {
    $("lvBarre").innerHTML = [...segs.filter(x => x.p !== "R"), ...(reste > 0 ? [{ p: null, n: reste }] : []), ...segs.filter(x => x.p === "R")].map(({ p, n }) => p === null
      ? `<span class="lv-seg" style="width:${pct(n)};--c:var(--soft)" title="${n} à venir"><b>${n}</b></span>`
      : `<span class="lv-seg" style="width:${pct(n)};--c:${coulP(p)}" title="${esc(PARTIS[p].nom)} : ${n} (${s[p].elus} élus, ${s[p].avance} en tête${s[p].hors ? `, ${s[p].hors} hors élection` : ""})">`
        + `<i class="lv-elus" style="width:${100 * (s[p].elus + s[p].hors) / n}%"></i><b>${esc(PARTIS[p].court)} ${n}</b></span>`).join("");
  }
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const mq = $("edMajMarque"); mq.hidden = false; mq.style.left = (100 * (vue === "S" ? 50 : V.maj - 0.5) / V.n) + "%";
  mq.querySelector("span").textContent = vue === "S" ? "Contrôle : 51 (50 + VP)" : vue === "G" ? "Majorité des États : 26" : "Majorité 218";
  const D = tot(s, "D") + (vue === "S" ? tot(s, "I") : 0), R = tot(s, "R");
  $("lvSiegesTitre").textContent = !avec ? (DEMO ? "Démo" : new Date() < PREMIERE ? `${V.long} : les résultats commencent à 18 h, heure du Québec` : `${V.long} : en attente des premiers résultats`)
    : vue === "H" ? (D >= 218 ? `Les démocrates atteignent la majorité : ${D} sièges` : R >= 218 ? `Les républicains gardent la majorité : ${R} sièges` : `Chambre : D ${D} · R ${R} (majorité : 218)`)
    : vue === "S" ? (D >= 51 ? `Les démocrates prennent le Sénat : ${D} sièges (indépendants compris)` : R >= 50 ? `Les républicains gardent le Sénat : ${R} sièges` : `Sénat : D ${D} (avec les indépendants) · R ${R}`)
    : `Gouverneurs : D ${tot(s, "D")} · R ${R}`;
  const act = { D: 0, R: 0, I: 0, A: 0, V: 0 };
  if (vue === "H") for (const id of Object.keys(COURSES.H)) { const a = PROJ.actuel?.[id]; a?.p ? act[groupe(a.p)]++ : act.V++; }
  if (vue === "S") for (const e of Object.values(PROJ.senat?.etats || {})) for (const x of e.senateurs) act[groupe(x.p)]++;
  if (vue === "G") for (const e of Object.values(GOUV.etats)) act[groupe(e.p)]++;
  const prev = p => { let n = 0; for (const c of Object.values(COURSES[vue])) if (c.cote[0] === p) n++; return n; };
  $("lvPartis").innerHTML = ["D", "R", "I", "A"].filter(p => p === "D" || p === "R" || tot(s, p) || act[p]).map(p => {
    const v = voixT ? 100 * s[p].voix / voixT : null, P = PARTIS[p];
    return `<div class="lv-parti" style="--c:${P.c}" title="${esc(P.nom)}"><i></i><span class="lv-pnom">${esc(P.nom)}</span>`
      + `<b>${avec ? tot(s, p) : act[p]}</b><small>${avec ? `${s[p].elus} élu${s[p].elus > 1 ? "s" : ""} · ${s[p].avance} en tête${s[p].hors ? ` · ${s[p].hors} hors élection` : ""}${s[p].gains ? ` · ${s[p].gains} gain${s[p].gains > 1 ? "s" : ""}` : ""}`
        : `en poste aujourd'hui${(p === "D" || p === "R") && vue !== "G" ? ` · prévisions : ${prev(p)} course${prev(p) > 1 ? "s" : ""} penchant de ce côté` : ""}`}</small>`
      + `<span class="lv-pvote">${v != null && v > 0 ? nf(v, 1) + " %" : ""}</span></div>`;
  }).join("");
  const n = Object.keys(COURSES[vue]).length, toss = Object.values(COURSES[vue]).filter(c => c.cote === "T").length;
  $("edKv").innerHTML = [[`${avec} / ${n}`, "courses avec des résultats"], [nf(sieges(vue).appels), "courses appelées"],
    [s.D.gains || s.R.gains ? `D ${s.D.gains} · R ${s.R.gains}` : "—", "sièges gagnés sur l'autre parti"], [nf(toss), "courses à égalité selon les prévisions"],
    [voixT ? `D ${nf(100 * s.D.voix / voixT, 1)} · R ${nf(100 * s.R.voix / voixT, 1)}` : "—", vue === "H" ? "vote populaire de la Chambre (%)" : "voix des courses dépouillées (%)"]]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>${V.nom}</b><span>${vue === "S" ? "contrôle 51 (50 + VP)" : `majorité ${V.maj}`} · ${avec}/${n} courses</span></div>`
    + `<div class="lv-bp-barre">${[...segs.filter(x => x.p !== "R"), ...(reste > 0 ? [{ p: null, n: reste }] : []), ...segs.filter(x => x.p === "R")].map(({ p, n: k }) => `<span style="width:${pct(k)};--c:${p ? coulP(p) : "var(--soft)"}"><i style="width:${p ? 100 * (s[p].elus + s[p].hors) / k : 0}%"></i></span>`).join("")}<em style="left:${100 * (vue === "S" ? 50 : V.maj - 0.5) / V.n}%"></em></div>`
    + `<div class="lv-bp-partis">${["D", "R"].map(p => `<span style="--c:${coulP(p)}"><i></i>${p} <b>${avec ? tot(s, p) : act[p]}</b></span>`).join("")}</div>`;
}

/* ---------- carte ---------- */
let svg, gZ, gD, gE, gSuiv, gSel, ZOOM, PATH, MW = 960, MH = 600, tip;
const ZONES = { ne: [[-80.5, 38.6], [-69.8, 43.5]], nyc: [[-74.3, 40.48], [-73.65, 40.95]], gl: [[-92.5, 39.5], [-78.5, 46.8]], ca: [[-124.4, 32.5], [-114.1, 42.0]],
  tx: [[-106.6, 25.8], [-93.5, 36.5]], fl: [[-87.6, 24.5], [-80.0, 31.0]] };
const featsVue = () => vue === "H" ? CARTE.districts.features : CARTE.etats.features;
const idDe = f => vue === "H" ? f.properties.id : f.properties.fips;
function remplir(id) {
  const c = COURSES[vue][id];
  if (!c) return ["var(--soft)", 0.25];                         // pas d'élection dans cet État
  const md = modeCarte(), a = res(vue, id);
  if (md === "prev") return [COTE[c.cote]?.[0] || COTE.N[0], 1];
  if (!a) return ["var(--soft)", 1];
  const p = tete(a).p;
  if (md === "gains") return c.held && groupe(c.held) !== groupe(p) ? [coulP(p), a.appel ? 1 : 0.55] : ["var(--soft)", 1];
  return [coulP(p), a.appel ? 1 : a.pct == null ? 0.6 : 0.3 + 0.55 * Math.min(1, a.pct / 100)];
}
function dessinerCarte() {
  if (!gZ) return;
  gD.selectAll("path").each(function (f) { const [col, op] = remplir(idDe(f)); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null ? [] : featsVue().filter(f => idDe(f) === sel)).join("path").attr("class", "lv-selline").attr("d", PATH);
  dessinerContoursSuivis(); dessinerLegende();
}
function dessinerLegende() {
  const md = modeCarte();
  $("edLegende").innerHTML = md === "prev"
    ? COTES.map(k => `<span class="ed-legende-k" style="--c:${COTE[k][0]}"><i></i>${COTE[k][1]}</span>`).join("") + `<span>· prévisions des analystes (consensus de 270toWin)${vue !== "H" ? " · gris pâle : pas d'élection" : ""}</span>`
    : ["D", "R", "I"].map(p => `<span class="ed-legende-k" style="--c:${coulP(p)}"><i></i>${PARTIS[p].court === "Ind." ? "Indépendant" : p === "D" ? "Démocrate" : "Républicain"} en tête</span>`).join("")
      + `<span>${md === "gains" ? "· seulement les sièges qui changent de parti" : "· plus la couleur est pâle, moins le vote est dépouillé ; pleine : course appelée"} · gris : aucun résultat${vue !== "H" ? " · gris pâle : pas d'élection" : ""}</span>`;
}
function dessinerZooms() {
  $("lvZoom").innerHTML = `<button type="button" data-z="tout">États-Unis</button><button type="button" data-z="ne">Nord-Est</button><button type="button" data-z="nyc">New York</button>`
    + `<button type="button" data-z="gl">Grands Lacs</button><button type="button" data-z="ca">Californie</button><button type="button" data-z="tx">Texas</button><button type="button" data-z="fl">Floride</button>`
    + `<button type="button" data-z="plus" aria-label="Zoomer">+</button><button type="button" data-z="moins" aria-label="Dézoomer">−</button>`
    + `<span class="lv-groupe" role="group" aria-label="Affichage de la carte">${[["res", "Résultats", "Couleur du parti en tête"], ["prev", "Prévisions", "Cote de chaque course selon les analystes (consensus de 270toWin)"], ["gains", "Gains", "Seulement les sièges qui changent de parti"]]
      .map(([k, l, t]) => `<button type="button" data-z="m-${k}" aria-pressed="${modeCarte() === k}" title="${t}">${l}</button>`).join("")}</span>`;
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis"), ici = [...suivies].filter(k => k.startsWith(vue + ":")).map(k => k.slice(2));
  b.setAttribute("aria-pressed", carteSuivis); b.textContent = carteSuivis ? `★ Suivies (${ici.length})` : "★ Suivies";
  if (!gSuiv) return;
  const d = carteSuivis ? featsVue().filter(f => ici.includes(idDe(f))) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, idDe).join("path").attr("class", "lv-suivi-halo").attr("d", PATH);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, idDe).join("path").attr("class", "lv-suivi-ligne").attr("d", PATH).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
function infobulle(e, f) {
  const id = idDe(f), c = COURSES[vue][id], a = res(vue, id);
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 12, box.width - 250) + "px"; tip.style.top = Math.min(e.clientY - box.top + 12, box.height - 130) + "px";
  const nom = `<b>${suivies.has(vue + ":" + id) ? "★ " : ""}${esc(c?.nom || f.properties.nom || id)}</b>`;
  if (!c) { tip.innerHTML = nom + `<br><small>Pas d'élection ${vue === "S" ? "au Sénat" : "au poste de gouverneur"} cette année</small>`; return; }
  tip.innerHTML = nom + (a ? a.cands.slice(0, 3).map(k => `<span class="ed-tip-l" style="--c:${coulP(k.p)}"><span><i></i>${esc(k.nom)} (${esc(k.p)})${k.g ? " ✓" : ""}</span><b>${nf(pctC(a, k), 1)} %</b></span>`).join("")
    + `<small>${a.appel ? "course appelée" : a.pct != null ? `${nf(a.pct)} % du vote dépouillé (estimation)` : "dépouillement en cours"} · sortant : ${esc(c.held || "?")}</small>`
    : `<br><small>${COTE[c.cote]?.[1] || "Non coté"} · sortant : ${esc(c.sortant)} (${esc(c.held)})${etatFerme(ETATS[c.etat]?.ab) ? " · aucun résultat" : ` · bureaux fermés à ${h(FERME_ETAT[ETATS[c.etat]?.ab] || "01:00")}`}</small>`);
}
function construireCarte() {
  const proj = d3.geoAlbersUsa().fitExtent([[10, 10], [MW - 10, MH - 10]], CARTE.etats);
  PATH = d3.geoPath(proj);
  svg = d3.select($("lvCarte")).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove();
  gZ = svg.append("g"); gD = gZ.append("g"); gE = gZ.append("g"); gSuiv = gZ.append("g"); gSel = gZ.append("g");
  ZOOM = d3.zoom().scaleExtent([1, 120]).translateExtent([[-60, -60], [MW + 60, MH + 60]]).on("zoom", e => gZ.attr("transform", e.transform));
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  tracer();
}
// districts (Chambre) ou États (Sénat, gouverneurs), frontières des États par-dessus
function tracer() {
  gD.selectAll("path").remove();
  gD.selectAll("path").data(featsVue(), idDe).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", f => COURSES[vue][idDe(f)] ? 0 : -1).attr("role", "button").attr("aria-label", f => COURSES[vue][idDe(f)]?.nom || f.properties.nom)
    .on("click", (e, f) => { if (COURSES[vue][idDe(f)]) choisir(idDe(f)); })
    .on("keydown", (e, f) => { if ((e.key === "Enter" || e.key === " ") && COURSES[vue][idDe(f)]) { e.preventDefault(); choisir(idDe(f)); } })
    .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  gE.selectAll("path").data(vue === "H" ? CARTE.etats.features : []).join("path").attr("class", "lv-reg").attr("d", PATH);
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(120, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (ZONES[z]) vers(PATH.bounds({ type: "Feature", geometry: { type: "MultiPoint", coordinates: ZONES[z] } }));
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
    else if (z.startsWith("m-")) { mode = z.slice(2); dessinerZooms(); dessinerCarte(); }
    else zoomer(z);
  });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "usCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
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

/* ---------- fiche (panneau de droite) ---------- */
const avatar = (p, nom) => {
  const mots = String(nom || "").trim().split(/\s+/), ini = esc(((mots[0] || "")[0] || "") + ((mots.length > 1 ? mots[mots.length - 1] : "")[0] || "")).toUpperCase();
  return `<span class="lv-ava lv-ini" style="--c:${coulP(p)}" aria-hidden="true">${ini}</span>`;
};
const marge = x => x == null ? "—" : x < 0 ? `R +${nf(-x, 1)}` : x > 0 ? `D +${nf(x, 1)}` : "égalité";
function dessinerPanneau() {
  const el = $("lvPanneau");
  if (sel == null || !COURSES[vue][sel]) {
    const n = Object.keys(COURSES[vue]).length;
    el.innerHTML = `<span class="lv-eyebrow">${VUES[vue].long}</span><h3>Clique sur ${vue === "H" ? "un district" : "un État"}</h3>
      <p class="lv-muted">${vue === "H" ? "Les 435 districts sont en élection (mandats de deux ans)." : vue === "S" ? `${n} sièges sur 100 sont en élection : la classe 2 et deux élections spéciales (Ohio, Floride).` : `${n} États élisent leur gouverneur.`}
      Avant les résultats, « Prévisions » colore chaque course selon le consensus des analystes ; ensuite, « Résultats » montre le parti en tête (plus pâle tant que le dépouillement avance, pleine quand la course est appelée), et « Gains » seulement les sièges qui changent de parti.</p>
      <div class="lv-kv"><div><b>${Object.keys(RES?.[vue] || {}).filter(id => res(vue, id)).length}</b><span>avec résultats</span></div><div><b>${n}</b><span>courses</span></div><div><b>${VUES[vue].maj}</b><span>${vue === "S" ? "contrôle (51, ou 50 + VP)" : "majorité"}</span></div></div>`;
    return;
  }
  const c = COURSES[vue][sel], a = res(vue, sel), cle = vue + ":" + sel, ab = ETATS[c.etat]?.ab;
  let html = `<span class="lv-eyebrow">${vue === "H" ? `District · ${ab}-${sel.slice(2) === "00" ? "unique" : +sel.slice(2)}` : vue === "S" ? `Sénat${c.special ? " · élection spéciale" : ""}` : "Gouverneur"}</span><h3>${esc(c.nom)}</h3>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${cle}" aria-pressed="${suivies.has(cle)}" style="--c:#B7860B">${suivies.has(cle) ? "★ Suivie" : "☆ Suivre"}</button></div>`;
  if (a) {
    const t = tete(a), b = a.cands.find(k => k !== t), gain = c.held && groupe(c.held) !== groupe(t.p);
    html += `<div class="lv-chips"><span class="lv-chip ${a.appel ? "fin" : ""}">${a.appel ? `Appelée : ${esc(t.nom)}` : a.pct != null ? `${nf(a.pct)} % du vote dépouillé (estimation)` : "Dépouillement en cours"}</span>`
      + (gain ? `<span class="lv-chip" style="--c:${coulP(t.p)}">Gain ${esc(t.p)} (sortant : ${esc(c.held)})</span>` : "") + (a.tour2 ? `<span class="lv-chip">2e tour</span>` : "") + `</div>`
      + `<p class="lv-tete" style="--c:${coulP(t.p)}"><b>${esc(t.nom)}</b> (${esc(t.p)}) ${a.appel ? "élu·e" : "en tête"}${b && a.total ? ` par ${nf(t.v - b.v)} voix (${nf(pctC(a, t) - pctC(a, b), 1)} pt)` : ""}</p>`
      + `<table class="lv-cands"><tbody>${a.cands.map(k => `<tr style="--c:${coulP(k.p)}"><td>${avatar(k.p, k.nom)}</td>`
        + `<td><b>${esc(k.nom)}</b>${k.g ? ' <span class="lv-sortant">élu·e</span>' : ""}${k.sortant ? ' <span class="lv-sortant">sortant·e</span>' : ""}<small>${esc(nomParti(k.p))}</small><span class="lv-jauge"><i style="width:${Math.min(100, pctC(a, k))}%"></i></span></td>`
        + `<td class="lv-num"><b>${a.total ? nf(pctC(a, k), 1) + " %" : "—"}</b><small>${nf(k.v)}</small></td></tr>`).join("")}</tbody></table>`;
  } else {
    html += `<div class="lv-chips"><span class="lv-chip">${etatFerme(ab) ? "Aucun résultat pour l'instant" : `Bureaux fermés à ${h(FERME_ETAT[ab] || "01:00")} (heure du Québec)`}</span></div>`;
    if (c.cands.length) html += `<span class="lv-eyebrow">Candidatures (${c.cands.length})</span><ul class="lv-liste">${c.cands.slice().sort((x, y) => "DRIL".indexOf(x.p) - "DRIL".indexOf(y.p)).map(k => `<li style="--c:${coulP(k.p)}">${avatar(k.p, k.nom)}<span><b>${esc(k.nom)}</b><small>${esc(nomParti(k.p))}${k.inc ? " · sortant·e" : ""}</small></span></li>`).join("")}</ul>`;
  }
  html += `<p class="lv-muted lv-proj">Prévisions : <b style="color:${COTE[c.cote]?.[0]}">${COTE[c.cote]?.[1] || "Non coté"}</b> (consensus de 270toWin) · sortant : ${esc(c.sortant || "siège vacant")} (${esc(c.held || "—")})${c.limite ? ", limite de mandats" : c.ret ? ", ne se représente pas" : ""}`
    + (vue === "H" && (c.mc != null || c.mp != null) ? `<br>En 2024 : Chambre ${marge(c.mc)} · présidentielle ${c.mp == null ? "—" : c.mp < 0 ? `Trump +${nf(-c.mp, 1)}` : `Harris +${nf(c.mp, 1)}`}` : "")
    + (vue === "S" && c.autre ? `<br>Autre sénateur (pas en élection) : ${esc(c.autre.nom)} (${esc(c.autre.p)}), jusqu'en ${c.autre.fin + 1}` : "") + `</p>`;
  el.innerHTML = html;
}

/* ---------- courses suivies, alertes, classement ---------- */
let suivies = new Set(lireLS(localStorage, "usSuivies", []));
let carteSuivis = lireLS(localStorage, "usCarteSuivies", false), triClassement = lireLS(localStorage, "usTri", "serre");
let connus = lireLS(sessionStorage, "usConnus", null);
function basculerSuivie(cle) {
  suivies.has(cle) ? suivies.delete(cle) : suivies.add(cle);
  ecrireLS(localStorage, "usSuivies", [...suivies]);
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
const nomCle = cle => { const [v, id] = cle.split(":"), c = COURSES[v]?.[id]; return c ? (v === "H" ? c.nom : `${c.nom} · ${v === "S" ? "Sénat" : "gouverneur"}`) : cle; };
function ligne(cle) {
  const [v, id] = cle.split(":"), c = COURSES[v]?.[id], a = res(v, id), t = a && tete(a);
  return `<li class="lv-ligne" data-cle="${cle}" tabindex="0"><button type="button" class="lv-etoile" data-suivre="${cle}" aria-pressed="${suivies.has(cle)}" aria-label="Suivre ${esc(nomCle(cle))}">${suivies.has(cle) ? "★" : "☆"}</button>`
    + `<span class="lv-nom" style="--c:${t ? coulP(t.p) : COTE[c?.cote]?.[0] || "var(--soft)"}"><i></i>${esc(nomCle(cle))}</span>`
    + `<span class="lv-ecart">${t ? `${esc(t.p)} ${a.total ? "+" + nf(ecartPts(a), 1) + " pt" : ""}${a.appel ? " ✓" : ""}` : esc(COTE[c?.cote]?.[1] || "—")}<small>${a ? (a.appel ? "appelée" : a.pct != null ? nf(a.pct) + " % dépouillé" : "") : ""}</small></span></li>`;
}
function dessinerSuivi() {
  $("lvSuiviesTitre").textContent = "Suivies"; $("lvCarteSuivis").title = "Entourer sur la carte les courses suivies";
  $("lvSuivies").innerHTML = suivies.size ? `<ul class="lv-lignes">${[...suivies].filter(k => COURSES[k[0]]?.[k.slice(2)]).sort((x, y) => nomCle(x).localeCompare(nomCle(y), "fr")).map(ligne).join("")}</ul>`
    : `<p class="lv-muted">Clique sur ☆ dans la fiche ou le classement pour suivre une course (Chambre, Sénat ou gouverneur) : elle s'affiche ici, et une alerte apparaît quand le parti en tête change ou que la course est appelée.</p>`;
  const TRIS = [["serre", "Plus serrées"], ["cote", "Prévisions"], ["nom", "Par nom"]];
  $("lvPPChoix").innerHTML = TRIS.map(([k, l]) => `<button type="button" data-tri="${k}" aria-pressed="${triClassement === k}">${l}</button>`).join("");
  $("edClassSur").textContent = `${VUES[vue].long} · ${Object.keys(COURSES[vue]).length} courses`;
  const ids = Object.keys(COURSES[vue]).sort((x, y) => {
    const cx = COURSES[vue][x], cy = COURSES[vue][y];
    if (triClassement === "nom") return cx.nom.localeCompare(cy.nom, "fr", { numeric: true });
    if (triClassement === "cote") return Math.abs(COTES.indexOf(cx.cote) - 3) - Math.abs(COTES.indexOf(cy.cote) - 3) || cx.nom.localeCompare(cy.nom, "fr", { numeric: true });
    const ax = res(vue, x), ay = res(vue, y);
    return (ax && !ax.appel ? ecartPts(ax) : ax ? 500 + ecartPts(ax) : 999) - (ay && !ay.appel ? ecartPts(ay) : ay ? 500 + ecartPts(ay) : 999) || cx.nom.localeCompare(cy.nom, "fr", { numeric: true });
  });
  $("lvParParti").innerHTML = `<ul class="lv-lignes">${ids.map(id => ligne(vue + ":" + id)).join("")}</ul>`;
}
function surveiller() {
  const now = {};
  for (const v of ["H", "S", "G"]) for (const id of Object.keys(COURSES[v])) { const a = res(v, id); if (a) now[v + ":" + id] = [tete(a).p, a.appel]; }
  if (connus) for (const cle of suivies) {
    const n = now[cle], o = connus[cle]; if (!n || !o) continue;
    if (n[1] && !o[1]) alerter(`${nomCle(cle)} : course appelée pour ${tete(res(cle[0], cle.slice(2))).nom} (${n[0]})`, coulP(n[0]));
    else if (n[0] !== o[0]) alerter(`${nomCle(cle)} : ${n[0]} passe en tête devant ${o[0]}`, coulP(n[0]));
  }
  // seuils de contrôle (Chambre, Sénat), annoncés une fois
  if (connus && RES?.lus) for (const v of ["H", "S"]) {
    const { s } = sieges(v), D = tot(s, "D") + (v === "S" ? tot(s, "I") : 0) - s.D.avance - (v === "S" ? s.I.avance : 0), R = tot(s, "R") - s.R.avance;
    const cle = `ctl-${v}`, qui = v === "H" ? (D >= 218 ? "D" : R >= 218 ? "R" : null) : (D >= 51 ? "D" : R >= 50 ? "R" : null);
    if (qui && connus[cle] !== qui) alerter(`${v === "H" ? "Chambre" : "Sénat"} : contrôle ${qui === "D" ? "démocrate" : "républicain"} assuré par les courses appelées`, coulP(qui));
    if (qui) now[cle] = qui;
  }
  connus = now; ecrireLS(sessionStorage, "usConnus", connus);
}
function alerter(txt, c) {
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", c); el.textContent = "★ " + txt;
  $("lvAlertes").appendChild(el); setTimeout(() => el.remove(), 12000);
}

/* ---------- blocs du bas : enjeux, courses à surveiller, vote générique, comment ça marche ---------- */
function dessinerBlocs(sond) {
  const act = { D: 0, R: 0, V: 0 }; for (const id of Object.keys(COURSES.H)) { const a = PROJ.actuel?.[id]; a?.p ? (act[a.p === "R" ? "R" : "D"]++) : act.V++; }
  const sen = { D: 0, R: 0, I: 0 }; for (const e of Object.values(PROJ.senat?.etats || {})) for (const x of e.senateurs) sen[groupe(x.p)]++;
  const gv = { D: 0, R: 0 }; for (const e of Object.values(GOUV.etats)) gv[e.p === "R" ? "R" : "D"]++;
  const serrees = v => Object.values(COURSES[v]).filter(c => ["T", "D1", "R1"].includes(c.cote)).sort((a, b) => Math.abs(COTES.indexOf(a.cote) - 3) - Math.abs(COTES.indexOf(b.cote) - 3) || a.nom.localeCompare(b.nom, "fr"));
  const puce = (v, c) => `<li><button type="button" class="vi-lien" data-aller="${v}:${c.id}" style="color:${COTE[c.cote][0]}">${esc(c.nom)}</button> <small>${COTE[c.cote][1]} · ${c.held === "D" || c.held === "R" ? "sortant " + c.held : "nouveau siège ou vacant"}</small></li>`;
  const moy = sond?.moyenne?.at(-1), L = (sond?.sondages || []).slice(-8).reverse();
  $("edBlocs").innerHTML = `
    <section class="ed-bloc" aria-labelledby="usEnjeuxTitre"><span class="lv-eyebrow">Les enjeux</span><h3 id="usEnjeuxTitre">Ce qui se joue</h3>
      <div class="ed-voter">
        <div><h4>Chambre des représentants</h4><p>Aujourd'hui : <b style="color:${coulP("R")}">${act.R} républicains</b>, <b style="color:${coulP("D")}">${act.D} démocrates</b>${act.V ? `, ${act.V} siège${act.V > 1 ? "s" : ""} vacant${act.V > 1 ? "s" : ""}` : ""}. Il faut 218 sièges : les démocrates doivent en gagner environ ${Math.max(0, 218 - act.D)} de plus qu'aujourd'hui.</p></div>
        <div><h4>Sénat</h4><p>Aujourd'hui : <b style="color:${coulP("R")}">${sen.R} républicains</b>, <b style="color:${coulP("D")}">${sen.D} démocrates</b> et ${sen.I} indépendants qui votent avec eux. Le vice-président J. D. Vance départage une égalité : les démocrates doivent arriver à 51, soit un gain net de ${Math.max(0, 51 - sen.D - sen.I)} sièges.</p></div>
        <div><h4>Gouverneurs</h4><p>Aujourd'hui : <b style="color:${coulP("R")}">${gv.R} républicains</b>, <b style="color:${coulP("D")}">${gv.D} démocrates</b>. ${Object.keys(COURSES.G).length} États élisent leur gouverneur, dont plusieurs postes laissés libres par la limite de mandats.</p></div>
      </div></section>
    <section class="ed-bloc" aria-labelledby="usSurvTitre"><span class="lv-eyebrow">Prévisions des analystes · consensus de 270toWin${PROJ.senat?.maj ? ` au ${new Date(PROJ.senat.maj + "T12:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}` : ""}</span><h3 id="usSurvTitre">Les courses à surveiller</h3>
      <div class="ed-voter">
        <div><h4>Sénat</h4><ul>${serrees("S").map(c => puce("S", c)).join("") || "<li>Aucune course serrée</li>"}</ul></div>
        <div><h4>Gouverneurs</h4><ul>${serrees("G").map(c => puce("G", c)).join("") || "<li>Aucune course serrée</li>"}</ul></div>
        <div><h4>Chambre : ${serrees("H").filter(c => c.cote === "T").length} districts à égalité</h4><ul>${serrees("H").filter(c => c.cote === "T").map(c => puce("H", c)).join("")}</ul></div>
      </div></section>
    ${moy ? `<section class="ed-bloc" aria-labelledby="usGenTitre"><span class="lv-eyebrow">Sondages · ${esc(sond.source || "")}</span><h3 id="usGenTitre">Vote générique pour le Congrès</h3>
      <p>Moyenne au ${new Date(moy.d + "T12:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })} : <b style="color:${coulP("D")}">démocrates ${nf(moy.D, 1)} %</b> · <b style="color:${coulP("R")}">républicains ${nf(moy.R, 1)} %</b> (écart ${marge(moy.D - moy.R)}). Évolution complète dans l'onglet États-Unis.</p>
      <div class="ed-sond"><table><thead><tr><th>Sondeur</th><th>Date</th><th>D</th><th>R</th><th>Écart</th></tr></thead><tbody>${L.map(x => `<tr><td>${esc(String(x.f).replace(/\^.*$/, ""))}<small>${esc(x.n || "")}</small></td><td>${esc(x.d)}</td><td>${nf(x.D, 1)}</td><td>${nf(x.R, 1)}</td><td>${marge(x.D - x.R)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="ed-bloc" aria-labelledby="usCommentTitre"><span class="lv-eyebrow">Comment ça marche</span><h3 id="usCommentTitre">Le soir du vote et après</h3>
      <div class="ed-voter">
        <div><h4>Qui annonce les gagnants</h4><p>Il n'y a pas de résultat national officiel le soir même : chaque État compte ses votes, et les médias « appellent » une course quand l'issue ne fait plus de doute. Les résultats officiels viennent des certifications des États, en novembre et décembre.</p></div>
        <div><h4>Des comptes qui changent</h4><p>Selon l'État, les votes par correspondance sont comptés avant ou après ceux du jour du vote : les premiers chiffres peuvent pencher d'un côté puis de l'autre. La Californie, l'Arizona et le Nevada mettent souvent plusieurs jours à finir.</p></div>
        <div><h4>Règles particulières</h4><ul><li>Géorgie : 2e tour le 1er décembre si personne n'a 50 %.</li><li>Maine et Alaska : vote préférentiel (classement des candidats).</li><li>Californie et Washington : deux candidats du même parti peuvent s'affronter.</li><li>Louisiane : nouvelles primaires fermées pour le Congrès en 2026.</li></ul></div>
        <div><h4>Et ensuite</h4><p>Le nouveau Congrès entre en fonction le 3 janvier 2027 ; la plupart des gouverneurs élus, en janvier. Les représentants ont des mandats de deux ans, les sénateurs de six ans (un tiers du Sénat à chaque élection), les gouverneurs de quatre ans (deux au New Hampshire et au Vermont).</p></div>
      </div></section>`;
  $("edSource").innerHTML = `Sources : résultats non officiels et appels des courses compilés par <a href="${SITE_RES}" target="_blank" rel="noopener">CNN</a> (flux publics de résultats) ;
    prévisions : consensus de <a href="https://www.270towin.com/2026-house-election/consensus-2026-house-forecast" target="_blank" rel="noopener">270toWin</a> (Cook Political Report, Sabato's Crystal Ball, Inside Elections, etc.), avec les candidats et les sortants ;
    Chambre actuelle : Clerk de la Chambre des représentants ; heures de fermeture : 270toWin d'après The Green Papers ; districts et États : Census Bureau (comme Votes États-Unis) ; vote générique : ${esc(sond?.source || "Silver Bulletin")}.`;
}

function dessiner() { dessinerEtat(); dessinerChoix(); dessinerSieges(); dessinerZooms(); dessinerCarte(); dessinerPanneau(); dessinerSuivi(); }
function changerVue(v) {
  if (v === vue) return;
  vue = v; ecrireLS(localStorage, "usVue", vue); sel = null;
  tracer(); dessiner();
}
function choisir(id, defiler = true) {
  sel = id; dessinerCarte(); dessinerPanneau(); info($("lvInfo").getAttribute("aria-pressed") === "true" || false);
  if (defiler && innerWidth <= 900 && !document.querySelector(".lv-cartecard.lv-plein, .lv-cartecard:fullscreen")) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function aller(cle) {
  const [v, id] = cle.split(":"); changerVue(v); choisir(id, false);
  $("lvCarte").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function demarrer() {
  const [carte, proj, gouv, sond] = await Promise.all([
    fetch("en-direct/etats-unis/carte.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("votes-usa/projection.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("en-direct/etats-unis/gouverneurs.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("votes-usa/sondages.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  CARTE = carte; PROJ = proj; GOUV = gouv;
  // anneaux dans le sens de d3, polygone par polygone (un îlot à l'envers peindrait tout le globe)
  const sens = q => d3.geoArea({ type: "Polygon", coordinates: q }) > 2 * Math.PI ? q.map(x => x.slice().reverse()) : q;
  for (const f of [...CARTE.districts.features, ...CARTE.etats.features])
    f.geometry.coordinates = f.geometry.type === "Polygon" ? sens(f.geometry.coordinates) : f.geometry.coordinates.map(sens);
  for (const f of CARTE.etats.features) { ETATS[f.properties.fips] = f.properties; AB[f.properties.ab] = f.properties.fips; }
  AB.DC = AB.DC || "11";
  preparerCourses();
  dessinerHeures(); dessinerBlocs(sond); preparerCarte(); construireCarte();
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-suivre]"); if (s) { e.stopPropagation(); basculerSuivie(s.dataset.suivre); return; }
    const t = e.target.closest("[data-tri]"); if (t) { triClassement = t.dataset.tri; ecrireLS(localStorage, "usTri", triClassement); dessinerSuivi(); return; }
    const v = e.target.closest("#edChoix [data-vue]"); if (v) { changerVue(v.dataset.vue); return; }
    const a = e.target.closest("[data-aller]"); if (a) { aller(a.dataset.aller); return; }
    const l = e.target.closest(".lv-ligne"); if (l) { const [lv, id] = l.dataset.cle.split(":"); if (lv !== vue) changerVue(lv); choisir(id); }
  });
  $("lvPPReplier").addEventListener("click", () => { const ouvert = $("lvPPSection").hasAttribute("data-ferme"); $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); });
  $("lvMaj").addEventListener("click", actualiser);
  dessiner();
  await actualiser();
  setInterval(() => { if (!document.hidden && Date.now() >= prochaine) actualiser(); afficherDecompte(); }, 1000);
  setInterval(dessinerHeures, 60000);
}
demarrer();
