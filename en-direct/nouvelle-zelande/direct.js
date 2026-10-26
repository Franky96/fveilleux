/* En direct (en-direct-nouvelle-zelande.html, cadre « gen » du gabarit) : élections générales en Nouvelle-Zélande du samedi 7 novembre 2026.
   Scrutin mixte (MMP) : 120 sièges (plus les sièges en surplus), 71 circonscriptions (64 générales et 7 maories, limites de 2025) et
   49 sièges de liste. Deux votes : le vote de parti donne le partage des sièges (Sainte-Laguë entre les partis à 5 % ou avec une
   circonscription), le vote de circonscription élit le député de chaque circonscription. Même cadre que l'élection en C.-B.
   (en-direct/cb-2026/direct.js) : lecture chaque minute avec décompte, sièges et voix par parti, carte avec zooms et plein écran,
   fiche, circonscriptions suivies avec alertes, classement ; choix « Vote de parti · Vote de circonscription » (edChoix).

   Données : api/direct-nz.php (relais du flux XML de la Commission électorale, cache 45 s : pas d'en-tête CORS) ; à défaut,
   en-direct/nouvelle-zelande/resultats.json (copie du pipeline GitHub, outils/nz.py). Les deux rendent les fichiers XML bruts
   (election.xml, e01.xml…e71.xml, parties.xml, candidates.xml, electorates.xml), lus ici par normaliser().
   Démo (administrateurs) : ?demo=2023 (résultats officiels de 2023, même flux, archive de la Commission ; demo-2023.json) ou
   ?demo=simulation (simulation de la Commission pour les médias, données de 2023 dévoilées peu à peu).
   Carte : en-direct/nouvelle-zelande/circonscriptions.json (limites de 2025 de la Representation Commission, Stats NZ, CC BY 4.0,
   découpées au littoral par les SA3 « Clipped » de Stats NZ ; îles Chatham en encart). Listes : candidats.json (flux de la
   Commission, avant le vote). 2023 : resultats-2023.json (résultats officiels, anciennes limites). */

const RAFRAICHIR = 60;                                         // secondes entre deux lectures
const SIEGES = 120, NB = 71, SEUIL = 5;
const OUVERTURE = new Date("2026-11-07T09:00:00+13:00"), FERMETURE = new Date("2026-11-07T19:00:00+13:00");   // heure avancée de la N.-Z.
const SITE_RES = "https://www.electionresults.govt.nz/";
const DOSSIER = "en-direct/nouvelle-zelande/";
const SERRE = 5;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const secQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" });
const heureNz = d => d.toLocaleString("fr-CA", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Pacific/Auckland" });
const deux = n => String(n).padStart(2, "0");
const ilYa = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${deux(Math.floor(s / 60) % 60)}`; };
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };
const pl = (n, s, p = s + "s") => `${nf(n)} ${n > 1 ? p : s}`;

// démo (administrateurs seulement) : ?demo=2023 ou ?demo=simulation
const DEMO = (() => {
  const d = new URLSearchParams(location.search).get("demo");
  let admin = false; try { admin = sessionStorage.getItem("userRole") === "admin"; } catch { /* stockage bloqué */ }
  return admin && (d === "2023" || d === "simulation") ? d : null;
})();
const DEMO_TXT = { "2023": "DÉMO · résultats de 2023", simulation: "DÉMO · simulation de la Commission électorale (données de 2023)" };

/* ---------- partis (abréviations du flux de la Commission ; liste des partis enregistrés pour 2026) ---------- */
const PARTIS = {
  NAT: { court: "National", nom: "Parti national", chef: "Christopher Luxon, premier ministre (Botany)", c: "#00529F", bloc: "d" },
  LAB: { court: "Travaillistes", nom: "Parti travailliste", chef: "Chris Hipkins, chef de l'opposition (Remutaka)", c: "#D82A20", bloc: "g" },
  GP: { court: "Verts", nom: "Parti vert d'Aotearoa Nouvelle-Zélande", chef: "Marama Davidson et Chlöe Swarbrick, cocheffes (liste ; Auckland Central)", c: "#098137", bloc: "g" },
  ACT: { court: "ACT", nom: "ACT New Zealand", chef: "David Seymour, vice-premier ministre (Epsom)", c: "#E8C500", bloc: "d" },
  NZF: { court: "NZ First", nom: "New Zealand First", chef: "Winston Peters, ministre des Affaires étrangères (liste)", c: "#3A3A3A", bloc: "d" },
  TPMAO: { court: "Te Pāti Māori", nom: "Te Pāti Māori (Parti maori)", chef: "Debbie Ngarewa-Packer (Te Tai Hauāuru) et Rawiri Waititi (Waiariki), coprésidents", c: "#B2001A", bloc: "g" },
  OPP: { court: "Opportunity", nom: "Opportunity Party (anciennement TOP)", chef: "Qiulae Wong", c: "#20B5A3", bloc: null },
  TTTP: { court: "Te Tai Tokerau", nom: "Te Tai Tokerau Party", chef: "Mariameno Kapa-Kingi (Te Tai Tokerau)", c: "#8A5A2B", bloc: null },
  IND: { court: "Ind.", nom: "Indépendant·e", c: "#6B7280", bloc: null },
};
const ORDRE_P = ["NAT", "LAB", "GP", "ACT", "NZF", "TPMAO", "OPP", "TTTP"];
const AUTRE = "#A3A8B1";
const BLOCS = { d: { nom: "Coalition sortante", partis: "National + ACT + NZ First", c: "#00529F" }, g: { nom: "Gauche", partis: "Travaillistes + Verts + Te Pāti Māori", c: "#D82A20" } };
const infoP = a => PARTIS[a] || { court: NOM_P[a] && NOM_P[a].length <= 20 ? NOM_P[a] : a, nom: NOM_P[a] || a, c: AUTRE, bloc: null };
const coulP = a => infoP(a).c;
const rangP = a => { const i = ORDRE_P.indexOf(a); return i < 0 ? 99 : i; };
let NOM_P = {};                                                 // abréviation → nom officiel (partis hors du tableau)

/* ---------- sondages : intentions de vote (vote de parti), les 10 plus récents ----------
   Compilation de Wikipédia (« Opinion polling for the 2026 New Zealand general election », 26 octobre 2026), chaque sondage relié à sa
   publication. TPM : Te Pāti Māori ; OPP : Opportunity. */
const SONDAGES = [
  { s: "1 News–Verian", d: "15–19 oct.", n: 1003, u: "https://www.1news.co.nz/2026/10/20/poll-national-jumps-leaving-labours-position-perilous/", v: { NAT: 32, LAB: 27, GP: 16, ACT: 11, NZF: 8, TPMAO: 0.7, OPP: 7 } },
  { s: "The Post / Freshwater Strategy", d: "9–19 oct.", n: 1458, u: "https://www.thepost.co.nz/politics/361101225/postfreshwater-strategy-poll-fraction-point-could-decide-who-governs", v: { NAT: 27.6, LAB: 28.7, GP: 14.3, ACT: 9, NZF: 11.8, TPMAO: 2, OPP: 5.4 } },
  { s: "1 News–Verian", d: "8–12 oct.", n: 1007, u: "https://www.1news.co.nz/2026/10/13/poll-hipkins-and-luxon-now-neck-and-neck-opportunity-on-track-for-10-mps/", v: { NAT: 28, LAB: 28, GP: 15, ACT: 10, NZF: 10, TPMAO: 0.4, OPP: 8 } },
  { s: "Anacta", d: "6–10 oct.", n: 1352, u: "https://www.thepost.co.nz/nz-news/361100468/labour-and-national-below-30-labours-pollster-tells-corporate-clients", v: { NAT: 28, LAB: 29, GP: 15, ACT: 9, NZF: 10, TPMAO: 1.9, OPP: 5.4 } },
  { s: "Taxpayers' Union–Curia", d: "1–5 oct.", n: 1000, u: "https://www.taxpayers.org.nz/oct2026_nztucurpolljjhhfas", v: { NAT: 28.5, LAB: 28.2, GP: 13.3, ACT: 9.2, NZF: 12, TPMAO: 1.4, OPP: 4.8 } },
  { s: "1 News–Verian", d: "1–5 oct.", n: 1001, u: "https://www.1news.co.nz/2026/10/06/poll-opportunity-still-in-kingmaker-seat-as-greens-hold-strong/", v: { NAT: 29, LAB: 28, GP: 16, ACT: 9, NZF: 10, TPMAO: 0.6, OPP: 7 } },
  { s: "RNZ–Reid Research", d: "24 sept.–1er oct.", n: 1000, u: "https://www.rnz.co.nz/news/politics_election-2026/1749693/rnz-reid-research-poll-national-crashes-greens-surge-opportunity-kingmaker", v: { NAT: 25.9, LAB: 30.8, GP: 14.8, ACT: 9, NZF: 10.6, TPMAO: 2, OPP: 5.5 } },
  { s: "1 News–Verian", d: "23–27 sept.", n: 1004, u: "https://www.1news.co.nz/2026/09/28/poll-greens-surge-to-best-result-ever-as-national-labour-slide-further/", v: { NAT: 28, LAB: 28, GP: 16, ACT: 11, NZF: 9, TPMAO: 1.2, OPP: 6 } },
  { s: "Roy Morgan", d: "31 août–27 sept.", n: 859, u: "https://www.roymorgan.com/findings/10351-nz-national-voting-intention-september-2026", v: { NAT: 31, LAB: 23.5, GP: 16, ACT: 11, NZF: 10, TPMAO: 2, OPP: 6.5 } },
  { s: "The Post / Freshwater Strategy", d: "4–11 sept.", n: 1011, u: "https://freshwaterstrategy.com/2026/09/15/the-post-freshwater-strategy-september-polling-data/", v: { NAT: 26.5, LAB: 28, GP: 13.6, ACT: 8.7, NZF: 12.6, TPMAO: 2.2, OPP: 6.3 } },
];
const P_SOND = ["NAT", "LAB", "GP", "ACT", "NZF", "TPMAO", "OPP"];
const MOY = Object.fromEntries(P_SOND.map(p => [p, SONDAGES.slice(0, 5).reduce((s, x) => s + x.v[p], 0) / 5]));

/* ---------- 2023 : circonscriptions renommées ou redécoupées (limites de 2025) ---------- */
const RENOMMEES = { "Mt Maunganui": "Bay of Plenty", "East Cape": "East Coast", "Ōtāhuhu": "Panmure-Ōtāhuhu", "Wellington Bays": "Rongotai", "Wellington North": "Wellington Central" };
const REFONTES = { Kapiti: "Ōtaki, Mana et Ōhāriu", Kenepuru: "Ōtaki, Mana et Ōhāriu", Glendene: "Kelston, New Lynn et Te Atatū", Henderson: "Kelston, New Lynn et Te Atatū", "Waitākere": "Kelston, New Lynn et Te Atatū" };

// zooms (noms des circonscriptions générales de 2025)
const ZONES = {
  akl: ["Auckland Central", "Botany", "East Coast Bays", "Epsom", "Glendene", "Henderson", "Māngere", "Manurewa", "Maungakiekie", "Mt Albert", "Mt Roskill", "North Shore", "Northcote", "Ōtāhuhu", "Pakuranga", "Papakura", "Takanini", "Tāmaki", "Upper Harbour", "Waitākere", "Whangaparāoa"],
  wlg: ["Wellington Bays", "Wellington North", "Hutt South", "Remutaka", "Kenepuru"],
  chc: ["Christchurch Central", "Christchurch East", "Ilam", "Wigram", "Banks Peninsula", "Waimakariri", "Selwyn"],
  ham: ["Hamilton East", "Hamilton West", "Waikato"],
  nord: n => !["Banks Peninsula", "Christchurch Central", "Christchurch East", "Dunedin", "Ilam", "Invercargill", "Kaikōura", "Nelson", "Rangitata", "Selwyn", "Southland", "Taieri", "Waimakariri", "Waitaki", "West Coast-Tasman", "Wigram"].includes(n),
  sud: n => ["Banks Peninsula", "Christchurch Central", "Christchurch East", "Dunedin", "Ilam", "Invercargill", "Kaikōura", "Nelson", "Rangitata", "Selwyn", "Southland", "Taieri", "Waimakariri", "Waitaki", "West Coast-Tasman", "Wigram"].includes(n),
};

let GEO = null, LISTES = null, LISTES_FLUX = null, R23 = { circ: {}, national: {} }, RES = null, brut = null, lu = null;
let sel = null, carteMarge = false, carteGains = false, prochaine = 0;
let vote = lireLS(localStorage, "nzVote", "parti"), couche = lireLS(localStorage, "nzCouche", "g");
if (!["parti", "circ"].includes(vote)) vote = "parti";
if (!["g", "m"].includes(couche)) couche = "g";

/* ---------- noms ---------- */
// « LUXON, Christopher » → « Christopher Luxon » ; « McLELLAN, Tracey » → « Tracey McLellan »
const cap = w => w ? w[0].toLocaleUpperCase("en-NZ") + w.slice(1).toLocaleLowerCase("en-NZ") : w;
function nomAff(s) {
  const i = String(s ?? "").indexOf(",");
  if (i < 0) return String(s ?? "");
  const fam = s.slice(0, i).trim().split(/([\s\-'’])/).map(t => /^[\s\-'’]$/.test(t) || !t ? t
    : t === t.toLocaleUpperCase("en-NZ") ? cap(t) : t.replace(/^(Mc|Mac)(.+)$/, (m, a, b) => a + cap(b))).join("");
  return `${s.slice(i + 1).trim()} ${fam}`;
}

/* ---------- lecture du flux XML de la Commission électorale ----------
   election.xml : <statistics> (bureaux dépouillés, voix, circonscriptions définitives) et <partystatus> (voix de parti et sièges
   projetés par la Commission : party_seats, candidate_seats, total_seats) ; eNN.xml : <electorate e_no final updated>, <statistics>
   (total_voting_places, …_counted, percent_voting_places_counted, total_votes_cast), <partyvotes>, <candidatevotes> ;
   parties.xml (p_no, abbrev, short_name, registered), candidates.xml (c_no, candidate_name, electorate, party, list_no),
   electorates.xml (e_no, electorate_name). */
const xml = s => { try { const d = new DOMParser().parseFromString(s, "application/xml"); return d.querySelector("parsererror") ? null : d; } catch { return null; } };
const txt = (el, sel) => el?.querySelector(sel)?.textContent?.trim() ?? "";
const num = (el, sel) => { const t = txt(el, sel).replace(/,/g, ""); return t === "" || isNaN(+t) ? null : +t; };
function listesDe(f) {
  if (!f["parties.xml"] || !f["candidates.xml"] || !f["electorates.xml"]) return null;
  const P = xml(f["parties.xml"]), C = xml(f["candidates.xml"]), E = xml(f["electorates.xml"]);
  if (!P || !C || !E) return null;
  const maories = new Set(["Hauraki-Waikato", "Ikaroa-Rāwhiti", "Tāmaki Makaurau", "Te Tai Hauāuru", "Te Tai Tokerau", "Te Tai Tonga", "Waiariki"]);
  const partis = {}, circ = {};
  for (const p of P.querySelectorAll("party")) { const a = txt(p, "abbrev"); partis[p.getAttribute("p_no")] = { a: a === "TOP" ? "OPP" : a, nom: txt(p, "short_name"), reg: txt(p, "registered") === "yes" }; }
  for (const e of E.querySelectorAll("electorate")) { const nom = txt(e, "electorate_name"); circ[e.getAttribute("e_no")] = { nom, t: maories.has(nom) ? "m" : "g" }; }
  const cands = [...C.querySelectorAll("candidate")].map(c => ({ c: c.getAttribute("c_no"), nom: txt(c, "candidate_name"), e: txt(c, "electorate"), p: txt(c, "party"), l: +txt(c, "list_no") || 0 }));
  return { partis, circ, cands };
}
function normaliser(d) {
  const f = d.fichiers || {};
  const L = listesDe(f) || LISTES_FLUX || LISTES;
  if (listesDe(f)) LISTES_FLUX = L;
  const abP = p => p && p !== "0" && L.partis[p] ? L.partis[p].a : "IND";
  for (const p of Object.values(L.partis)) NOM_P[p.a] ||= p.nom;
  const candDe = Object.fromEntries(L.cands.map(c => [c.c, c]));
  const out = { maj: null, stats: {}, partis: {}, circ: {}, lus: 0, L };
  const El = f["election.xml"] && xml(f["election.xml"]);
  if (El) {
    const r = El.documentElement;
    out.maj = r.getAttribute("updated") ? new Date(r.getAttribute("updated") + "+13:00") : null;   // heure de la N.-Z. (avancée en novembre)
    out.stats = { places: num(r, "statistics > total_voting_places_counted"), pctPlaces: num(r, "statistics > percent_voting_places_counted"),
      votes: num(r, "statistics > total_votes_cast"), pctVotes: num(r, "statistics > percent_votes_cast"), finales: num(r, "statistics > total_electorates_final") };
    for (const p of r.querySelectorAll("partystatus > party")) {
      const a = abP(p.getAttribute("p_no"));
      out.partis[a] = { v: num(p, "votes") || 0, pct: num(p, "percent_votes") || 0, circ: num(p, "candidate_seats") || 0, liste: num(p, "party_seats") || 0, tot: num(p, "total_seats") || 0 };
    }
  }
  for (const [nomF, corps] of Object.entries(f)) {
    if (!/^e\d+\.xml$/.test(nomF)) continue;
    const D = xml(corps); if (!D) continue;
    const r = D.documentElement, e = String(+r.getAttribute("e_no")), ci = L.circ[e]; if (!ci) continue;
    const pv = [...r.querySelectorAll("partyvotes > party")].map(p => ({ p: abP(p.getAttribute("p_no")), v: num(p, "votes") || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const cands = [...r.querySelectorAll("candidatevotes > candidate")].map(c => {
      const k = candDe[c.getAttribute("c_no")] || {};
      return { c: c.getAttribute("c_no"), nom: nomAff(k.nom || "?"), p: abP(k.p), v: num(c, "votes") || 0, l: k.l || 0 };
    }).sort((a, b) => b.v - a.v);
    const tp = num(r, "statistics > total_voting_places"), cp = num(r, "statistics > total_voting_places_counted"), pp = num(r, "statistics > percent_voting_places_counted");
    const totC = cands.reduce((s, k) => s + k.v, 0), totP = pv.reduce((s, k) => s + k.v, 0);
    const frac = pp != null ? Math.min(1, pp / 100) : tp ? Math.min(1, cp / tp) : null;
    out.circ[ci.nom] = { e, nom: ci.nom, t: ci.t, cands, pv, totC, totP, sec: tp ? [cp, tp] : null, frac,
      final: r.getAttribute("final") === "true" && totC > 0, inf: [num(r, "statistics > total_candidate_informals"), num(r, "statistics > total_party_informals")] };
  }
  out.lus = Object.values(out.circ).filter(c => c.totC > 0 || c.totP > 0).length;
  out.nbCirc = Object.keys(L.circ).length;
  return out;
}

/* ---------- lecture : relais du site, sinon copie du pipeline ---------- */
async function lireRelais() {
  const q = new URLSearchParams({ type: "resultats" });
  if (DEMO) q.set("demo", DEMO);
  if (LISTES_FLUX && !DEMO) q.set("listes", "0");                       // listes déjà lues : seulement les voix
  const r = await fetch("api/direct-nz.php?" + q, { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { const d = await r.json(); return d && d.fichiers ? d : null; } catch { return null; }   // pas de PHP (serveur local) : copie
}
async function lireCopie() {
  const r = await fetch(DOSSIER + (DEMO ? `demo-${DEMO}.json` : "resultats.json"), { cache: "no-cache" });
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
const enCirc = nom => { const c = RES?.circ?.[nom]; return c && (vote === "parti" ? c.totP > 0 : c.totC > 0) ? c : null; };
const avecVoix = nom => { const c = RES?.circ?.[nom]; return c && c.totC > 0 ? c : null; };
const auMoinsUn = () => !!RES?.lus;
// liste affichée : candidats (vote de circonscription) ou partis (vote de parti), chaque ligne { p, v, nom? }
const lignes = c => vote === "parti" ? c.pv : c.cands;
const totL = c => vote === "parti" ? c.totP : c.totC;
const pctL = (c, k) => totL(c) ? 100 * k.v / totL(c) : 0;
const tete = c => lignes(c)?.[0] || null;
const ecartPts = c => lignes(c).length > 1 ? pctL(c, lignes(c)[0]) - pctL(c, lignes(c)[1]) : 100;
const nbCirc = () => RES?.nbCirc || NB;

/* ---------- répartition des sièges (MMP, loi électorale de 1993, art. 191-192) ----------
   Partis admis : enregistrés, avec au moins 5 % des votes de parti valides ou une circonscription. On retire de 120 les
   circonscriptions gagnées par des indépendants ou des partis non admis (sans liste). Sainte-Laguë : quotients voix / 1, 3, 5, 7…,
   les plus forts l'emportent. Chaque parti garde ses circonscriptions ; s'il en gagne plus que sa part, la différence s'ajoute aux
   120 sièges (sièges en surplus, « overhang »), les autres partis gardant leur part. */
function mmp(voix, circs, reg) {
  const totV = Object.values(voix).reduce((s, v) => s + v, 0);
  const admis = Object.keys(voix).filter(p => reg(p) && (100 * voix[p] / (totV || 1) >= SEUIL || (circs[p] || 0) > 0));
  const hors = Object.entries(circs).filter(([p]) => !admis.includes(p)).reduce((s, [, n]) => s + n, 0);
  const n = SIEGES - hors, q = [];
  for (const p of admis) for (let k = 0; k < n; k++) q.push({ p, q: voix[p] / (2 * k + 1), d: 2 * k + 1 });
  q.sort((a, b) => b.q - a.q);
  const part = Object.fromEntries(admis.map(p => [p, 0]));
  for (const x of q.slice(0, n)) part[x.p]++;
  const r = {}; let surplus = 0;
  for (const p of new Set([...admis, ...Object.keys(circs)])) {
    const c = circs[p] || 0, a = part[p] ?? 0;
    if (!admis.includes(p)) { if (c) r[p] = { tot: c, circ: c, liste: 0, part: 0, admis: false }; continue; }
    const tot = Math.max(a, c); surplus += Math.max(0, c - a);
    r[p] = { tot, circ: c, liste: tot - c, part: a, admis: true, surplus: Math.max(0, c - a) };
  }
  const total = SIEGES + surplus;
  return { r, total, maj: Math.floor(total / 2) + 1, surplus, hors, admis, totV, dernier: q[n - 1], suivant: q[n] };
}
const regP = a => !!Object.values(RES?.L?.partis || LISTES?.partis || {}).find(p => p.a === a && p.reg);
// projection des résultats en cours (vote de parti national + candidats en tête dans chaque circonscription)
function projection() {
  const voix = {}, circs = {};
  for (const [a, p] of Object.entries(RES?.partis || {})) if (p.v > 0) voix[a] = p.v;
  if (!Object.keys(voix).length) for (const c of Object.values(RES?.circ || {})) for (const k of c.pv) voix[k.p] = (voix[k.p] || 0) + k.v;   // sans election.xml
  for (const c of Object.values(RES?.circ || {})) if (c.totC > 0) circs[c.cands[0].p] = (circs[c.cands[0].p] || 0) + 1;
  return Object.keys(voix).length ? { ...mmp(voix, circs, regP), source: "resultats" } : null;
}
// avant les résultats : moyenne des 5 derniers sondages, sans circonscription gagnée par un parti sous 5 %
function projSondages() { return { ...mmp(Object.fromEntries(P_SOND.map(p => [p, MOY[p] * 1000])), {}, () => true), source: "sondages" }; }
function circParParti() {
  const s = {};
  for (const c of Object.values(RES?.circ || {})) {
    if (!(c.totC > 0)) continue;
    const p = c.cands[0].p, x = s[p] ||= { elus: 0, avance: 0, voix: 0 };
    x[c.final ? "elus" : "avance"]++;
  }
  for (const c of Object.values(RES?.circ || {})) for (const k of c.cands) (s[k.p] ||= { elus: 0, avance: 0, voix: 0 }).voix += k.v;
  return s;
}

/* ---------- état, heures ---------- */
function dessinerEtat() {
  const b = $("lvBanniere"), ferme = DEMO || new Date() >= FERMETURE;
  $("edAvant").hidden = !!(ferme && auMoinsUn());
  const lien = `<a href="${SITE_RES}" target="_blank" rel="noopener">site de la Commission électorale</a>`;
  b.hidden = false;
  if (DEMO) {
    const hors = Object.keys(RES?.circ || {}).filter(n => !PAR_NOM[n]);
    b.innerHTML = `<b>${DEMO_TXT[DEMO]}</b> : ${DEMO === "2023" ? "résultats officiels de l'élection du 14 octobre 2023, lus dans le même flux XML de la Commission électorale, pour vérifier la lecture des résultats"
      : "simulation publiée par la Commission électorale pour l'essai des médias (données de 2023 dévoilées peu à peu)"}. Ce ne sont <b>pas</b> les résultats de 2026.`
      + (hors.length ? ` Sur la carte (limites de 2025), ${pl(hors.length, "circonscription")} de 2023 n'existe${hors.length > 1 ? "nt" : ""} plus sous ce nom : ${hors.map(esc).join(", ")}.` : "");
  } else if (RES && !auMoinsUn() && ferme && brut?.disponible && Object.keys(brut.fichiers || {}).length && RES.stats.votes > 0) b.innerHTML = `La Commission électorale publie des résultats, mais leur présentation n'a pas pu être lue ici. En attendant une correction, voir le ${lien}.`;
  else if (!auMoinsUn()) b.innerHTML = ferme
    ? `<b>Bureaux fermés</b> : en attente des premiers résultats de la Commission électorale (vérification chaque minute). Les votes par anticipation, comptés pendant la journée, sont publiés en premier.`
    : `Les résultats préliminaires s'afficheront ici après la fermeture des bureaux, le <b>samedi 7 novembre à 19 h, heure de la Nouvelle-Zélande (1 h du matin le samedi, heure du Québec)</b>. En attendant, la barre des sièges montre la projection de la moyenne des sondages.`;
  else b.innerHTML = `<b>Résultats préliminaires et non officiels</b> : les votes spéciaux (inscription tardive, vote à l'étranger, hors circonscription…), environ un vote sur cinq, ne sont comptés qu'après le soir du vote. Résultats officiels : vendredi 27 novembre.`;
  if (!RES) { $("lvEtat").textContent = "Résultats indisponibles pour le moment · nouvel essai chaque minute"; return; }
  if (!auMoinsUn()) { $("lvEtat").textContent = (DEMO ? DEMO_TXT[DEMO] + " · " : "") + "En attente des premiers résultats · vérification chaque minute"; dessinerVerifs(); return; }
  const S = RES.stats, fin = Object.values(RES.circ).filter(c => c.final).length;
  $("lvEtat").innerHTML = [DEMO ? `<b>${DEMO_TXT[DEMO]}</b>` : fin === nbCirc() ? "<b>Résultats officiels</b>" : "<b>Résultats préliminaires</b>",
    S.pctPlaces != null ? `${nf(S.pctPlaces, 1)} % des bureaux de vote dépouillés` : `${RES.lus} circonscriptions sur ${nbCirc()} avec des résultats`,
    S.votes ? `${nf(S.votes)} votes comptés` : "", fin ? `${fin} circonscription${fin > 1 ? "s" : ""} au résultat officiel` : ""].filter(Boolean).join(" · ");
  dessinerVerifs();
}
function dessinerVerifs() {
  const el = $("lvHeures"); el.hidden = !brut; if (el.hidden) return;
  const m = Date.now(), verif = brut.via === "relais" && brut.ageCache != null ? new Date(lu - brut.ageCache * 1000) : null;
  const publie = brut.via === "copie" && brut.publie ? new Date(brut.publie) : null;
  const flux = RES?.maj && !isNaN(RES.maj) ? `Données de la Commission du ${RES.maj.toLocaleString("fr-CA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Pacific/Auckland" })} (heure de la N.-Z. ; ${heureQc(RES.maj)} au Québec) · ` : "";
  el.innerHTML = `<span>${flux}<b>Vérifiées</b> sur le <a href="${SITE_RES}" target="_blank" rel="noopener">flux de la Commission électorale</a> ${verif ? `par le site à ${secQc(verif)} (il y a ${ilYa(m - verif)})`
    : `par ${DEMO ? "la copie de démonstration" : "la copie de secours du pipeline"}${publie && !isNaN(publie) ? `, mise en ligne à ${heureQc(publie)} (il y a ${ilYa(m - publie)})` : ""}`}`
    + (lu ? ` · relues par cette page à ${secQc(lu)}` : "") + ` · heures du Québec</span>`;
}
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date(), avant = m < OUVERTURE, cible = avant ? OUVERTURE : FERMETURE, ms = Math.max(0, cible - m);
  const j = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  $("edCompte").innerHTML = m >= FERMETURE ? `<span class="lv-eyebrow">Bureaux fermés</span><h3>Le dépouillement est commencé</h3>
    <p>Les bureaux ont fermé le samedi 7 novembre à <b>19 h, heure de la Nouvelle-Zélande</b> (1 h du matin, heure du Québec). Les résultats préliminaires arrivent au fil de la soirée.</p>`
    : `<span class="lv-eyebrow">${avant ? "Ouverture des bureaux" : "Fermeture des bureaux"}</span>
    <h3>${avant ? "Les bureaux ouvrent dans" : "Les bureaux ferment dans"}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${[[j, "jours"], [deux(h), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>Samedi 7 novembre à <b>${avant ? "9 h" : "19 h"}, heure de la Nouvelle-Zélande</b> (${avant ? "le vendredi 6 à 15 h" : "le samedi 7 à 1 h du matin"}, heure du Québec). En novembre, la Nouvelle-Zélande (heure avancée, UTC+13) a 18 heures d'avance sur le Québec.</p>`;
}
function dessinerHeures() {
  const m = new Date();
  const L = [
    ["Vote à l'étranger", "Depuis le mercredi 21 octobre", "En ligne (téléchargement et envoi du bulletin) ou dans les ambassades et hauts-commissariats", new Date("2026-11-06T19:00:00+13:00")],
    ["Vote par anticipation", "Du lundi 26 octobre au vendredi 6 novembre", "Dans n'importe quel bureau d'anticipation du pays, sans justification", new Date("2026-11-06T19:00:00+13:00")],
    ["Jour du vote", "Samedi 7 novembre, de 9 h à 19 h (heure de la N.-Z.)", "Du vendredi 6 novembre, 15 h, au samedi 7 novembre, 1 h du matin, heure du Québec", FERMETURE],
    ["Résultats préliminaires", "Dès 19 h (1 h du matin au Québec)", "Votes par anticipation d'abord (comptés pendant la journée), puis ceux du jour, bureau par bureau ; l'essentiel est connu dans la soirée", new Date("2026-11-08T03:00:00+13:00")],
    ["Votes spéciaux et résultats officiels", "Vendredi 27 novembre", "Après la vérification de tous les votes, dont les votes spéciaux (environ 20 %), qui peuvent faire changer quelques sièges de liste ou circonscriptions serrées", new Date("2026-11-27T18:00:00+13:00")],
    ["Retour des brefs", "Jeudi 3 décembre", "Proclamation des élus (sauf recomptage judiciaire) ; d'ici là, négociations pour former le gouvernement", new Date("2026-12-03T18:00:00+13:00")],
  ];
  $("edHeures").innerHTML = L.map(([t, a, b, fin]) => `<li class="${m > fin ? "ed-passe" : ""}"><b>${t}</b><span>${a}<small>${b}</small></span></li>`).join("");
}

/* ---------- choix du vote affiché ---------- */
function dessinerChoix() {
  const el = $("edChoix"); el.hidden = false;
  const pr = projection(), cp = circParParti();
  const tete1 = pr ? Object.entries(pr.r).sort((a, b) => b[1].tot - a[1].tot)[0] : null;
  const tete2 = Object.entries(cp).sort((a, b) => (b[1].elus + b[1].avance) - (a[1].elus + a[1].avance))[0];
  const B = [["parti", "Vote de parti", tete1 && auMoinsUn() ? `${infoP(tete1[0]).court} ${tete1[1].tot} sièges` : "partage des 120 sièges", tete1 && auMoinsUn() ? coulP(tete1[0]) : ""],
    ["circ", "Vote de circonscription", tete2 && tete2[1].elus + tete2[1].avance ? `${infoP(tete2[0]).court} ${tete2[1].elus + tete2[1].avance} circ.` : `${NB} députés de circonscription`, tete2 ? coulP(tete2[0]) : ""]];
  el.innerHTML = B.map(([k, l, s, c]) => `<button type="button" data-vote="${k}" aria-pressed="${vote === k}" style="${c ? `--c:${c}` : ""}">${l}<small>${esc(s)}</small></button>`).join("");
}
function choisirVote(k) {
  vote = k; ecrireLS(localStorage, "nzVote", k);
  dessiner();
}

/* ---------- sièges et voix par parti ---------- */
function etiquettes() {
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
}
function barreBlocs(r, total, maj) {
  const t = k => ORDRE_P.filter(p => PARTIS[p].bloc === k).reduce((s, p) => s + (r[p]?.tot || 0), 0);
  const d = t("d"), g = t("g"), autres = total - d - g;
  return `<b style="color:var(--ink)">${BLOCS.d.nom}</b> (${BLOCS.d.partis}) : <b style="color:var(--ink)">${d}</b>${d >= maj ? " · majorité" : ""} · `
    + `<b style="color:var(--ink)">${BLOCS.g.nom}</b> (${BLOCS.g.partis}) : <b style="color:var(--ink)">${g}</b>${g >= maj ? " · majorité" : ""}`
    + (autres ? ` · autres : <b style="color:var(--ink)">${autres}</b>${r.OPP?.tot ? ` (dont Opportunity ${r.OPP.tot}, hors des deux blocs)` : ""}` : "")
    + ` · majorité : ${maj} sur ${total}`
    + `<span class="ed-mini" role="img" aria-label="${BLOCS.d.nom} ${d}, ${BLOCS.g.nom} ${g}, autres ${autres}" style="margin-top:6px"><i style="width:${100 * d / total}%;background:${BLOCS.d.c}"></i><i style="width:${100 * autres / total}%;background:${AUTRE}"></i><i style="width:${100 * g / total}%;background:${BLOCS.g.c}"></i></span>`;
}
function dessinerSieges() {
  if (vote === "parti") dessinerSiegesParti(); else dessinerSiegesCirc();
}
function dessinerSiegesParti() {
  const res = auMoinsUn(), pr = (res && projection()) || projSondages(), r = pr.r, total = pr.total;
  const ordre = Object.keys(r).filter(p => r[p].tot > 0).sort((a, b) => rangP(a) - rangP(b) || r[b].tot - r[a].tot);
  const pct = n => (100 * n / total) + "%";
  $("edProvSur").textContent = res ? `Chambre des représentants · ${total} sièges${pr.surplus ? ` (120 + ${pr.surplus} en surplus)` : ""} · majorité ${pr.maj} · projection du site d'après le vote de parti`
    : `Chambre des représentants · 120 sièges · majorité 61 · avant les résultats : projection de la moyenne des 5 derniers sondages`;
  $("lvBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${pct(r[p].tot)};--c:${coulP(p)}" title="${esc(infoP(p).nom)} : ${pl(r[p].tot, "siège")} (${r[p].circ} de circonscription, ${r[p].liste} de liste${r[p].surplus ? `, dont ${r[p].surplus} en surplus` : ""})">`
    + `<i class="lv-elus" style="width:${100 * r[p].circ / r[p].tot}%"></i><b>${esc(infoP(p).court)} ${r[p].tot}</b></span>`).join("");
  etiquettes();
  const mq = $("edMajMarque"); mq.hidden = false; mq.style.left = (100 * pr.maj / total) + "%"; mq.querySelector("span").textContent = `${pr.maj}`;
  const tD = ORDRE_P.filter(p => PARTIS[p].bloc === "d").reduce((s, p) => s + (r[p]?.tot || 0), 0), tG = ORDRE_P.filter(p => PARTIS[p].bloc === "g").reduce((s, p) => s + (r[p]?.tot || 0), 0);
  const quoi = res ? "" : " (sondages)";
  $("lvSiegesTitre").textContent = tD >= pr.maj ? `La coalition sortante obtiendrait la majorité : ${tD} sièges sur ${total}${quoi}`
    : tG >= pr.maj ? `La gauche obtiendrait la majorité : ${tG} sièges sur ${total}${quoi}`
    : `Aucun bloc majoritaire : coalition sortante ${tD}, gauche ${tG} (majorité ${pr.maj})${quoi}`;
  $("edQTexte").hidden = false;
  $("edQTexte").innerHTML = barreBlocs(r, total, pr.maj) + (res ? "" : `<small>Projection du site : moyenne des 5 derniers sondages ci-dessous, répartie par Sainte-Laguë entre les partis à 5 % ou plus, en supposant qu'aucun parti sous le seuil ne gagne de circonscription (Te Pāti Māori, sous 5 % dans les sondages, aurait des sièges s'il garde une circonscription maorie).</small>`);
  const voixT = pr.totV || 1;
  const montres = [...new Set([...ORDRE_P.slice(0, 7), ...Object.keys(r), ...Object.keys(RES?.partis || {}).filter(p => (RES.partis[p].pct || 0) >= 1)])];
  const vx = p => res ? (RES.partis[p]?.v ?? 0) : (MOY[p] || 0) * 1000;
  $("lvPartis").innerHTML = montres.sort((a, b) => (r[b]?.tot || 0) - (r[a]?.tot || 0) || vx(b) - vx(a)).map(p => {
    const P = infoP(p), x = r[p], v = 100 * vx(p) / voixT, n23 = R23.national?.[p];
    return `<div class="lv-parti" style="--c:${P.c}" title="${esc(P.nom)}${P.chef ? " · " + esc(P.chef) : ""}"><i></i><span class="lv-pnom">${esc(P.court)}</span>`
      + `<b>${x?.tot || 0}</b><small>${x?.tot ? `${x.circ} circ. + ${x.liste} liste${x.surplus ? ` (${x.surplus} en surplus)` : ""} · ` : v < SEUIL && !x?.circ ? "sous le seuil de 5 % · " : ""}2023 : ${n23 ? `${n23.sieges} siège${n23.sieges > 1 ? "s" : ""}, ${nf(n23.pct, 1)} %` : "—"}</small>`
      + `<span class="lv-pvote">${vx(p) ? nf(v, 1) + " %" : ""}</span></div>`;
  }).join("");
  const S = RES?.stats || {};
  const ec = res && Object.values(RES.partis).some(p => p.tot) ? Object.entries(RES.partis).filter(([, p]) => p.tot).sort((a, b) => rangP(a[0]) - rangP(b[0])).map(([a, p]) => `${infoP(a).court} ${p.tot}`).join(" · ") : null;
  $("edKv").innerHTML = [[S.pctPlaces != null && res ? nf(S.pctPlaces, 1) + " %" : "—", "des bureaux de vote dépouillés"], [res && S.votes ? nf(S.votes) : "—", "votes comptés"],
    [`${pr.admis.length}`, `partis admis à la répartition (5 % ou une circonscription)`], [pr.surplus ? `+${pr.surplus}` : "0", "siège(s) en surplus (overhang)"],
    [ec ? `${Object.values(RES.partis).reduce((x, p) => x + p.tot, 0)} sièges` : "—", ec ? `projection de la Commission : ${ec}` : "projection de la Commission électorale (le soir du vote)"]]
    .map(([v, l]) => `<div><b>${v}</b><span>${esc(l)}</span></div>`).join("");
  barrePlein(ordre.map(p => [p, r[p].tot, r[p].circ]), total, pr.maj, res ? "Sièges projetés" : "Sondages", `majorité ${pr.maj} · ${total} sièges`);
}
function dessinerSiegesCirc() {
  const s = circParParti(), tot = p => (s[p]?.elus || 0) + (s[p]?.avance || 0), n = nbCirc();
  const voixT = Object.values(s).reduce((x, k) => x + k.voix, 0);
  const ordre = Object.keys(s).filter(p => tot(p) > 0).sort((a, b) => rangP(a) - rangP(b) || tot(b) - tot(a));
  const pct = k => (100 * k / n) + "%";
  $("edProvSur").textContent = `Les ${n} circonscriptions (${n === 71 ? "64 générales, 7 maories" : "limites de 2020"}) · vote de circonscription (député élu au scrutin majoritaire)`;
  $("lvBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${pct(tot(p))};--c:${coulP(p)}" title="${esc(infoP(p).nom)} : ${pl(tot(p), "circonscription")} (${s[p].elus} au résultat officiel, ${s[p].avance} en tête)">`
    + `<i class="lv-elus" style="width:${100 * s[p].elus / tot(p)}%"></i><b>${esc(infoP(p).court)} ${tot(p)}</b></span>`).join("");
  etiquettes();
  $("edMajMarque").hidden = true;
  const lead = ordre.slice().sort((a, b) => tot(b) - tot(a))[0];
  $("lvSiegesTitre").textContent = !lead ? (new Date() < FERMETURE && !DEMO ? "Circonscriptions : les résultats commencent à la fermeture des bureaux" : "Aucune circonscription dépouillée pour l'instant")
    : `${infoP(lead).nom} en tête dans ${pl(tot(lead), "circonscription")} sur ${n}`;
  $("edQTexte").hidden = false;
  $("edQTexte").innerHTML = lead ? `Les circonscriptions ne décident pas du partage des sièges (c'est le vote de parti), sauf pour un parti sous 5 % qui en gagne une, ou un parti qui en gagne plus que sa part (sièges en surplus).`
    + `<small>${["d", "g"].map(k => `${BLOCS[k].nom} : ${ORDRE_P.filter(p => PARTIS[p].bloc === k).reduce((x, p) => x + tot(p), 0)} circonscriptions`).join(" · ")}</small>`
    : `Chaque électeur vote aussi pour un député de sa circonscription (générale, ou maorie s'il est inscrit sur la liste électorale maorie).`;
  const montres = [...new Set([...ORDRE_P.slice(0, 7), ...ordre])];
  $("lvPartis").innerHTML = montres.sort((a, b) => tot(b) - tot(a) || (s[b]?.voix || 0) - (s[a]?.voix || 0) || rangP(a) - rangP(b)).map(p => {
    const P = infoP(p), v = voixT ? 100 * (s[p]?.voix || 0) / voixT : null, n23 = R23.national?.[p];
    return `<div class="lv-parti" style="--c:${P.c}" title="${esc(P.nom)}${P.chef ? " · " + esc(P.chef) : ""}"><i></i><span class="lv-pnom">${esc(P.court)}</span>`
      + `<b>${auMoinsUn() ? tot(p) : "—"}</b><small>${auMoinsUn() && tot(p) ? `${s[p].elus ? `${s[p].elus} officielles · ` : ""}${s[p].avance} en tête · ` : ""}2023 : ${n23 ? pl(n23.circ, "circ.", "circ.") : "—"}</small>`
      + `<span class="lv-pvote">${v ? nf(v, 1) + " %" : ""}</span></div>`;
  }).join("");
  const fin = Object.values(RES?.circ || {}).filter(c => c.final).length, S = RES?.stats || {};
  const serres = Object.values(RES?.circ || {}).filter(c => c.totC > 0 && c.cands.length > 1 && 100 * (c.cands[0].v - c.cands[1].v) / c.totC < SERRE).length;
  $("edKv").innerHTML = [[`${RES?.lus || 0} / ${n}`, "circonscriptions avec des résultats"], [nf(fin), "au résultat officiel"], [S.pctPlaces != null && auMoinsUn() ? nf(S.pctPlaces, 1) + " %" : "—", "des bureaux de vote dépouillés"],
    [nf(serres), `luttes serrées (moins de ${SERRE} points)`], [voixT ? nf(voixT) : "—", "votes de circonscription comptés"]]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  barrePlein(ordre.map(p => [p, tot(p), s[p].elus]), n, null, "Circonscriptions", `${RES?.lus || 0}/${n} avec résultats`);
}
function barrePlein(L, total, maj, titre, sous) {
  const lead = L.slice().sort((a, b) => b[1] - a[1])[0];
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>${lead ? `${esc(infoP(lead[0]).court)} en tête` : titre}</b><span>${esc(sous)}</span></div>`
    + `<div class="lv-bp-barre">${L.map(([p, n, i]) => `<span style="width:${100 * n / total}%;--c:${coulP(p)}"><i style="width:${n ? 100 * i / n : 0}%"></i></span>`).join("")}${maj ? `<em style="left:${100 * maj / total}%"></em>` : ""}</div>`
    + `<div class="lv-bp-partis">${L.length ? L.map(([p, n]) => `<span style="--c:${coulP(p)}"><i></i>${esc(infoP(p).court)} <b>${n}</b></span>`).join("") : `<span>En attente des premiers résultats</span>`}</div>`;
}

/* ---------- carte ---------- */
let svg, gZ, ZOOM, PATH, MW = 560, MH = 700, tip, gSuiv, gSel, PAR_NOM = {}, TYPE = {};
const FEATS = () => GEO[couche === "m" ? "maori" : "general"].features;
// circonscription de 2023 comparable (même nom, ou renommée sans grand changement)
const avant23 = nom => R23.circ?.[nom] || R23.circ?.[RENOMMEES[nom]] || null;
const gagnant23 = nom => { const a = avant23(nom); return a ? (vote === "parti" ? a.pv?.[0]?.p : a.gagnant) : null; };
function remplir(nom) {
  const c = enCirc(nom);
  if (!c) return ["var(--soft)", 1];
  const p = tete(c).p;
  if (carteGains) return gagnant23(nom) && gagnant23(nom) !== p ? [coulP(p), 1] : ["var(--soft)", 1];
  if (carteMarge) return [coulP(p), Math.max(0.2, Math.min(1, 0.2 + ecartPts(c) / 40))];
  return [coulP(p), c.final || c.frac == null ? 1 : 0.35 + 0.6 * c.frac];
}
function dessinerCarte() {
  if (!gZ) return;
  gZ.selectAll("g.nz-couche").attr("display", function () { return this.dataset.t === couche ? null : "none"; });
  gZ.selectAll("path.lv-rid").each(function (f) { if (f.properties.t !== couche) return; const [col, op] = remplir(f.properties.nom); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null ? [] : FEATS().filter(f => f.properties.nom === sel)).join("path").attr("class", "lv-selline").attr("d", PATH);
  for (const b of document.querySelectorAll("[data-z^=couche]")) b.setAttribute("aria-pressed", b.dataset.z === "couche-" + couche);
  dessinerContoursSuivis(); dessinerLegende();
}
function dessinerLegende() {
  const pres = [...new Set(FEATS().map(f => enCirc(f.properties.nom)).filter(Boolean).map(c => tete(c).p))].sort((a, b) => rangP(a) - rangP(b));
  $("edLegende").innerHTML = (pres.length ? pres : ["NAT", "LAB", "GP", "ACT"]).map(p => `<span class="ed-legende-k" style="--c:${coulP(p)}"><i></i>${esc(infoP(p).court)} en tête</span>`).join("")
    + `<span>· ${vote === "parti" ? "vote de parti" : "vote de circonscription (candidat en tête)"} · ${couche === "m" ? "7 circonscriptions maories (électeurs de la liste maorie, elles recouvrent les générales)" : "64 circonscriptions générales"}`
    + ` · ${carteGains ? "seulement les circonscriptions qui changent de parti par rapport à 2023 (même nom ou renommée)" : carteMarge ? "couleur d'autant plus foncée que l'écart est grand (pleine à 32 points et plus)" : "plus la couleur est pâle, moins il y a de bureaux dépouillés"} · gris : aucun résultat · îles Chatham en encart</span>`;
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  b.setAttribute("aria-pressed", carteSuivis); b.textContent = carteSuivis ? `★ Suivies (${suivies.size})` : "★ Suivies";
  if (!gSuiv) return;
  const d = carteSuivis ? FEATS().filter(f => suivies.has(f.properties.nom)) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, f => f.properties.nom).join("path").attr("class", "lv-suivi-halo").attr("d", PATH);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, f => f.properties.nom).join("path").attr("class", "lv-suivi-ligne").attr("d", PATH).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
function infobulle(e, f) {
  const nom = f.properties.nom, c = enCirc(nom), g23 = gagnant23(nom);
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 12, box.width - 240) + "px"; tip.style.top = Math.min(e.clientY - box.top + 12, box.height - 120) + "px";
  const titre = `<b>${suivies.has(nom) ? "★ " : ""}${esc(nom)}${f.properties.t === "m" ? " (maorie)" : ""}</b>`;
  const ref = g23 ? ` · 2023 : ${esc(infoP(g23).court)}` : REFONTES[nom] ? " · nouvelle en 2026" : "";
  tip.innerHTML = titre + (c ? lignes(c).slice(0, 3).map(k => `<span class="ed-tip-l" style="--c:${coulP(k.p)}"><span><i></i>${esc(k.nom ? `${k.nom} (${infoP(k.p).court})` : infoP(k.p).nom)}</span><b>${nf(pctL(c, k), 1)} %</b></span>`).join("")
    + `<small>${vote === "parti" ? "vote de parti · " : ""}${c.final ? "résultat officiel" : c.frac != null ? nf(100 * c.frac, 0) + " % des bureaux" : "dépouillement en cours"}${ref}</small>`
    : `<br><small>Aucun résultat${ref}</small>`);
}
// îles Chatham : morceaux rapprochés (encart) ; sans eux pour cadrer les zooms
const sansChatham = f => {
  if (!f.properties.chatham) return f;
  const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return { ...f, geometry: { type: "MultiPolygon", coordinates: polys.filter(p => p[0][0][0] < 177) } };
};
function construireCarte() {
  if (svg) return;
  const tous = { type: "FeatureCollection", features: GEO.general.features };
  const proj = d3.geoTransverseMercator().rotate([-173, 0]).fitExtent([[10, 90], [MW - 10, MH - 50]], tous);
  PATH = d3.geoPath(proj);
  svg = d3.select($("lvCarte")).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove();
  gZ = svg.append("g");
  for (const [t, cle] of [["g", "general"], ["m", "maori"]]) {
    gZ.append("g").attr("class", "nz-couche").attr("data-t", t).selectAll("path").data(GEO[cle].features).join("path").attr("class", "lv-rid").attr("d", PATH)
      .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => f.properties.nom)
      .on("click", (e, f) => choisir(f.properties.nom))
      .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.nom); } })
      .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  }
  // cadre de l'encart des îles Chatham
  const ch = GEO.general.features.find(f => f.properties.chatham);
  if (ch) {
    const g = ch.geometry, polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).filter(p => p[0][0][0] >= 177);
    const [[x0, y0], [x1, y1]] = PATH.bounds({ type: "MultiPolygon", coordinates: polys });
    gZ.append("rect").attr("x", x0 - 8).attr("y", y0 - 8).attr("width", x1 - x0 + 16).attr("height", y1 - y0 + 16).attr("rx", 4)
      .attr("fill", "none").attr("stroke", "var(--rule)").attr("stroke-width", 1).attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none");
    gZ.append("text").attr("class", "nz-chatham-t").attr("x", (x0 + x1) / 2).attr("y", y1 + 20).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "var(--muted)").attr("pointer-events", "none").text("Îles Chatham (encart)");
  }
  gSuiv = gZ.append("g"); gSel = gZ.append("g");
  ZOOM = d3.zoom().scaleExtent([1, 60]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => { gZ.attr("transform", e.transform); gZ.select(".nz-chatham-t").attr("display", e.transform.k > 1.8 ? "none" : null); });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(60, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (ZONES[z]) {
    const t = ZONES[z], dans = typeof t === "function" ? t : n => t.includes(n);
    vers(PATH.bounds({ type: "FeatureCollection", features: GEO.general.features.filter(f => dans(f.properties.nom)).map(sansChatham) }));
  }
  else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
  else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
}
let info = () => {};
function preparerCarte() {
  tip = $("lvTip");
  $("lvZoom").innerHTML = `<button type="button" data-z="tout">Tout le pays</button><button type="button" data-z="nord">Île du Nord</button><button type="button" data-z="sud">Île du Sud</button>`
    + `<button type="button" data-z="akl">Auckland</button><button type="button" data-z="ham">Hamilton</button><button type="button" data-z="wlg">Wellington</button><button type="button" data-z="chc">Christchurch</button>`
    + `<button type="button" data-z="plus" aria-label="Zoomer">+</button><button type="button" data-z="moins" aria-label="Dézoomer">−</button>`
    + `<span class="lv-groupe" role="group" aria-label="Circonscriptions affichées"><button type="button" data-z="couche-g" aria-pressed="${couche === "g"}" title="Les 64 circonscriptions générales">Générales</button><button type="button" data-z="couche-m" aria-pressed="${couche === "m"}" title="Les 7 circonscriptions maories (électeurs inscrits sur la liste maorie) : elles recouvrent les générales">Maories</button></span>`
    + `<span class="lv-groupe" role="group" aria-label="Affichage de la carte (un seul à la fois, ou aucun)"><button type="button" data-z="marge" id="edMarge" aria-pressed="false" title="Couleur du parti en tête, d'autant plus foncée que l'écart est grand">Écart</button><button type="button" data-z="gains" id="edGains" aria-pressed="false" title="Seulement les circonscriptions qui changent de parti par rapport à 2023">Gains</button></span>`;
  const carte = $("lvCarte").parentElement;
  carte.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau")) e.preventDefault(); }, { passive: false });
  carte.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "plein") pleinEcran();
    else if (z === "marge" || z === "gains") basculer(z);
    else if (z.startsWith("couche-")) { couche = z.slice(7); ecrireLS(localStorage, "nzCouche", couche); if (sel && TYPE[sel] !== couche) sel = null; dessinerCarte(); dessinerPanneau(); dessinerSuivi(); }
    else zoomer(z);
  });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "nzCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
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
function basculer(z) {
  carteMarge = z === "marge" && !carteMarge;
  carteGains = z === "gains" && !carteGains;
  $("edMarge").setAttribute("aria-pressed", carteMarge); $("edGains").setAttribute("aria-pressed", carteGains);
  dessinerCarte();
}

/* ---------- fiche (panneau de droite) ---------- */
function tableCands(c) {
  return `<table class="lv-cands"><tbody>${c.cands.map(k => `<tr style="--c:${coulP(k.p)}"><td>${avatar(k.p, k.nom)}</td>`
    + `<td><b>${esc(k.nom)}</b>${c.final && k === c.cands[0] ? ' <span class="lv-sortant">élu·e</span>' : ""}<small>${esc(infoP(k.p).nom)}${k.l ? ` · ${k.l}<sup>e</sup> sur la liste` : ""}</small><span class="lv-jauge"><i style="width:${Math.min(100, 100 * k.v / (c.totC || 1))}%"></i></span></td>`
    + `<td class="lv-num"><b>${nf(100 * k.v / (c.totC || 1), 1)} %</b><small>${nf(k.v)}</small></td></tr>`).join("")}</tbody></table>`;
}
function tablePartis(c) {
  const L = c.pv.slice(0, 8);
  return `<table class="lv-cands"><tbody>${L.map(k => `<tr style="--c:${coulP(k.p)}"><td><span class="lv-ava lv-ini" style="--c:${coulP(k.p)}" aria-hidden="true">${esc({ TPMAO: "TPM" }[k.p] || k.p.slice(0, 4))}</span></td>`
    + `<td><b>${esc(infoP(k.p).nom)}</b><span class="lv-jauge"><i style="width:${Math.min(100, 100 * k.v / (c.totP || 1))}%"></i></span></td>`
    + `<td class="lv-num"><b>${nf(100 * k.v / (c.totP || 1), 1)} %</b><small>${nf(k.v)}</small></td></tr>`).join("")}</tbody></table>`
    + (c.pv.length > 8 ? `<p class="lv-muted">… et ${c.pv.length - 8} autres partis.</p>` : "");
}
function dessinerPanneau() {
  const p = $("lvPanneau");
  if (sel == null) {
    const n = couche === "m" ? 7 : 64;
    p.innerHTML = `<span class="lv-eyebrow">Circonscriptions ${couche === "m" ? "maories" : "générales"}</span><h3>Clique sur une circonscription</h3>
      <p class="lv-muted">Couleur : ${vote === "parti" ? "parti en tête au vote de parti" : "parti du candidat en tête"}. Plus la couleur est pâle, moins il y a de bureaux dépouillés ; gris : aucun résultat. « Gains » ne montre que les circonscriptions qui changent de parti par rapport à 2023 (même nom ou simplement renommée). Chaque électeur vote dans une circonscription générale <b>ou</b> maorie, selon la liste électorale où il est inscrit : le bouton « Maories » montre les 7 circonscriptions maories, qui recouvrent les générales.</p>
      <div class="lv-kv"><div><b>${FEATS().filter(f => enCirc(f.properties.nom)).length}</b><span>avec résultats</span></div><div><b>${n}</b><span>circonscriptions ${couche === "m" ? "maories" : "générales"}</span></div><div><b>${NB}</b><span>en tout (+ 49 sièges de liste)</span></div></div>`;
    return;
  }
  const c = avecVoix(sel) || (RES?.circ?.[sel]?.totP > 0 ? RES.circ[sel] : null), a23 = avant23(sel), g23 = a23?.gagnant;
  let html = `<span class="lv-eyebrow">Circonscription ${TYPE[sel] === "m" ? "maorie" : "générale"}</span><h3>${esc(sel)}</h3>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${esc(sel)}" aria-pressed="${suivies.has(sel)}" style="--c:#B7860B">${suivies.has(sel) ? "★ Suivie" : "☆ Suivre"}</button></div>`;
  if (c && c.totC > 0) {
    const [a, b] = c.cands, ecart = b ? a.v - b.v : a.v;
    html += `<div class="lv-chips"><span class="lv-chip ${c.final ? "fin" : ""}">${c.final ? "Résultat officiel" : c.sec ? `${nf(c.sec[0])} / ${nf(c.sec[1])} bureaux (${nf(100 * c.frac, 0)} %)` : c.frac != null ? `${nf(100 * c.frac, 0)} % des bureaux` : "Dépouillement en cours"}</span>`
      + (g23 && g23 !== a.p ? `<span class="lv-chip" style="--c:${coulP(a.p)}">Gain ${esc(infoP(a.p).court)} (2023 : ${esc(infoP(g23).court)})</span>` : "") + `</div>`
      + `<p class="lv-tete" style="--c:${coulP(a.p)}"><b>${esc(a.nom)}</b> (${esc(infoP(a.p).court)}) ${c.final ? "élu·e" : "en tête"}${b ? ` par ${nf(ecart)} voix (${nf(100 * ecart / c.totC, 1)} pt)` : ""}</p>`;
    const blocC = `<span class="lv-eyebrow">Vote de circonscription</span>${tableCands(c)}`, blocP = c.totP ? `<span class="lv-eyebrow">Vote de parti dans la circonscription</span>${tablePartis(c)}` : "";
    html += vote === "parti" ? blocP + blocC : blocC + blocP;
  } else {
    html += `<div class="lv-chips"><span class="lv-chip">Aucun résultat pour l'instant</span></div>`;
    const e = Object.entries((LISTES_FLUX || LISTES).circ).find(([, x]) => x.nom === sel)?.[0];
    const L = (LISTES_FLUX || LISTES).cands.filter(k => k.e === e).map(k => ({ ...k, a: (LISTES_FLUX || LISTES).partis[k.p]?.a || "IND" }))
      .sort((x, y) => rangP(x.a) - rangP(y.a) || x.nom.localeCompare(y.nom, "fr"));
    if (L.length) html += `<span class="lv-eyebrow">Candidatures (${L.length})</span><ul class="lv-liste">${L.map(k => `<li style="--c:${coulP(k.a)}">${avatar(k.a, nomAff(k.nom))}<span><b>${esc(nomAff(k.nom))}</b><small>${esc(infoP(k.a).nom)}${k.l ? ` · ${k.l}<sup>e</sup> sur la liste` : ""}</small></span></li>`).join("")}</ul>`;
  }
  if (a23?.cands?.length) html += `<p class="lv-muted lv-proj">En 2023${RENOMMEES[sel] ? ` (${esc(RENOMMEES[sel])}, renommée)` : ""}, anciennes limites : ${a23.cands.map(k => `<b style="color:${coulP(k.p)}">${esc(infoP(k.p).court)}</b> ${nf(k.pct, 1)} %`).join(" · ")} (${esc(nomAff(a23.cands[0].nom))} élu·e) · vote de parti : ${a23.pv.slice(0, 3).map(k => `${esc(infoP(k.p).court)} ${nf(k.pct, 1)} %`).join(" · ")}</p>`;
  else if (REFONTES[sel]) html += `<p class="lv-muted lv-proj">Nouvelle circonscription en 2026, issue du redécoupage de ${esc(REFONTES[sel])} : pas de résultat comparable en 2023.</p>`;
  p.innerHTML = html;
}
// initiales cerclées de la couleur du parti (pas de photos)
function avatar(parti, nom) {
  const mots = String(nom || "").trim().split(/\s+/), ini = esc(((mots[0] || "")[0] || "") + ((mots.length > 1 ? mots[mots.length - 1] : "")[0] || "")).toUpperCase();
  return `<span class="lv-ava lv-ini" style="--c:${coulP(parti)}" aria-hidden="true">${ini}</span>`;
}

/* ---------- circonscriptions suivies, alertes, classement ---------- */
let suivies = new Set(lireLS(localStorage, "nzSuivies", []));
let carteSuivis = lireLS(localStorage, "nzCarteSuivies", false), triClassement = lireLS(localStorage, "nzTri", "serre");
let connus = lireLS(sessionStorage, "nzConnus" + (DEMO || ""), null);
function basculerSuivie(nom) {
  suivies.has(nom) ? suivies.delete(nom) : suivies.add(nom);
  ecrireLS(localStorage, "nzSuivies", [...suivies]);
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
function ligne(nom) {
  const c = enCirc(nom), a = c && tete(c);
  return `<li class="lv-ligne" data-rid="${esc(nom)}" tabindex="0"><button type="button" class="lv-etoile" data-suivre="${esc(nom)}" aria-pressed="${suivies.has(nom)}" aria-label="Suivre ${esc(nom)}">${suivies.has(nom) ? "★" : "☆"}</button>`
    + `<span class="lv-nom" style="--c:${a ? coulP(a.p) : "var(--soft)"}"><i></i>${esc(nom)}${TYPE[nom] === "m" ? " <small>(maorie)</small>" : ""}</span>`
    + `<span class="lv-ecart">${a ? `${esc(infoP(a.p).court)} +${nf(ecartPts(c), 1)} pt` : "—"}<small>${c ? (c.final ? "officiel" : c.frac != null ? nf(100 * c.frac, 0) + " % bureaux" : "") : ""}</small></span></li>`;
}
function dessinerSuivi() {
  $("lvSuivies").innerHTML = suivies.size ? `<ul class="lv-lignes">${[...suivies].filter(k => PAR_NOM[k]).sort((a, b) => a.localeCompare(b, "fr")).map(ligne).join("")}</ul>`
    : `<p class="lv-muted">Clique sur ☆ dans la fiche ou le classement pour suivre une circonscription : elle s'affiche ici, et une alerte apparaît quand le candidat en tête change de parti.</p>`;
  const TRIS = [["serre", "Plus serrées"], ["nom", "Par nom"], ["maories", "Maories"]];
  $("lvPPChoix").innerHTML = TRIS.map(([k, l]) => `<button type="button" data-tri="${k}" aria-pressed="${triClassement === k}">${l}</button>`).join("");
  const noms = Object.keys(PAR_NOM).filter(n => triClassement !== "maories" || TYPE[n] === "m").sort((a, b) => {
    if (triClassement === "nom") return a.localeCompare(b, "fr");
    const ca = enCirc(a), cb = enCirc(b);
    return (ca ? ecartPts(ca) : 999) - (cb ? ecartPts(cb) : 999) || a.localeCompare(b, "fr");
  });
  $("edClassSur").textContent = `Les ${NB} circonscriptions · ${vote === "parti" ? "écart au vote de parti" : "écart entre les deux premiers candidats"}`;
  $("lvParParti").innerHTML = `<ul class="lv-lignes">${noms.map(ligne).join("")}</ul>`;
}
function surveiller() {
  const now = {};
  for (const nom of Object.keys(PAR_NOM)) { const c = avecVoix(nom); if (c) now[nom] = c.cands[0].p; }
  if (connus) for (const nom of suivies) if (now[nom] && connus[nom] && now[nom] !== connus[nom])
    alerter(`${nom} : ${infoP(now[nom]).court} passe en tête devant ${infoP(connus[nom]).court}`, coulP(now[nom]));
  connus = now; ecrireLS(sessionStorage, "nzConnus" + (DEMO || ""), connus);
}
function alerter(t, c) {
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", c); el.textContent = "★ " + t;
  $("lvAlertes").appendChild(el); setTimeout(() => el.remove(), 12000);
}

/* ---------- blocs du bas : partis, sondages, calcul des sièges, comment ça marche ---------- */
function bloc(id, titre) {
  let s = $(id);
  if (!s) { s = document.createElement("section"); s.className = "ed-bloc"; s.id = id; s.setAttribute("aria-labelledby", id + "T"); $("edBlocs").appendChild(s); }
  return s;
}
function dessinerTextes() {
  const L = LISTES, nbC = a => L.cands.filter(k => L.partis[k.p]?.a === a).length;
  bloc("nzPartis").innerHTML = `<h3 id="nzPartisT">Les partis et leurs chefs</h3>
    <p>Élection annoncée le 21 janvier 2026 par le premier ministre Christopher Luxon, à la fin du mandat de trois ans. Le gouvernement sortant est une coalition du Parti national, d'ACT et de New Zealand First (formée après l'élection de 2023) ; l'opposition réunit les travaillistes, les Verts et Te Pāti Māori. ${Object.values(L.partis).filter(p => p.reg).length} partis enregistrés et ${nf(L.cands.length)} candidatures (liste de la Commission électorale). Opportunity, au-dessus de 5 % dans la plupart des sondages, pourrait faire la différence entre les deux camps.</p>
    <div class="lv-partis ed-reps">${ORDRE_P.filter(p => PARTIS[p].chef).map(p => { const P = PARTIS[p], n23 = R23.national?.[p];
      return `<div class="lv-parti" style="--c:${P.c}"><i></i><span class="lv-pnom">${esc(P.nom)}</span><b>${MOY[p] != null ? nf(MOY[p], 1) + " %" : ""}</b><small>${esc(P.chef)} · ${nbC(p)} candidatures${n23 ? ` · 2023 : ${nf(n23.pct, 1)} %, ${pl(n23.sieges, "siège")}` : ""}${MOY[p] != null ? " · moyenne des 5 derniers sondages" : ""}</small></div>`; }).join("")}</div>`;

  const pr = projSondages();
  bloc("nzSondages").innerHTML = `<h3 id="nzSondagesT">Sondages récents (vote de parti)</h3>
    <p>Moyenne des cinq derniers : ${P_SOND.map(p => `${esc(PARTIS[p].court)} <b style="color:var(--ink)">${nf(MOY[p], 1)} %</b>`).join(" · ")}. Répartie par la méthode officielle (voir plus bas), elle donnerait ${Object.entries(pr.r).filter(([, x]) => x.tot).sort((a, b) => rangP(a[0]) - rangP(b[0])).map(([p, x]) => `${esc(PARTIS[p].court)} ${x.tot}`).join(", ")} : coalition sortante ${ORDRE_P.filter(p => PARTIS[p].bloc === "d").reduce((s, p) => s + (pr.r[p]?.tot || 0), 0)}, gauche ${ORDRE_P.filter(p => PARTIS[p].bloc === "g").reduce((s, p) => s + (pr.r[p]?.tot || 0), 0)} (majorité 61).</p>
    <div class="ed-sond"><table><thead><tr><th>Sondeur</th>${P_SOND.map(p => `<th>${esc(PARTIS[p].court)}</th>`).join("")}<th>Échantillon</th><th class="ed-sond-barre">Coalition · autres · gauche</th></tr></thead><tbody>${SONDAGES.map(x => {
      const d = x.v.NAT + x.v.ACT + x.v.NZF, g = x.v.LAB + x.v.GP + x.v.TPMAO, a = Math.max(0, 100 - d - g);
      return `<tr><td><b><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.s)}</a></b><small>${esc(x.d)} 2026</small></td>${P_SOND.map(p => `<td>${nf(x.v[p], x.v[p] % 1 ? 1 : 0)}</td>`).join("")}<td>${nf(x.n)}</td>`
        + `<td class="ed-sond-barre"><span class="ed-mini" role="img" aria-label="Coalition ${nf(d, 1)} %, autres ${nf(a, 1)} %, gauche ${nf(g, 1)} %"><i style="width:${d}%;background:${BLOCS.d.c}"></i><i style="width:${a}%;background:${AUTRE}"></i><i style="width:${g}%;background:${BLOCS.g.c}"></i></span></td></tr>`;
    }).join("")}</tbody></table></div>
    <p>En pourcentage du vote de parti. Compilation : Wikipédia, « Opinion polling for the 2026 New Zealand general election » (consultée le 26 octobre 2026), chaque sondage relié à sa publication.</p>`;
  dessinerCalcul();

  bloc("nzVoter").innerHTML = `<h3 id="nzVoterT">Comment ça marche</h3>
    <div class="ed-voter">
      <div><h4>Deux votes (MMP)</h4><p>Depuis 1996, scrutin proportionnel mixte : chaque électeur vote pour un <b>parti</b> (vote de parti) et pour un <b>député</b> de sa circonscription (vote de circonscription). Le vote de parti décide du nombre de sièges de chaque parti ; les sièges de liste complètent ses circonscriptions.</p></div>
      <div><h4>Seuil : 5 % ou une circonscription</h4><p>Seuls les partis qui ont au moins 5 % du vote de parti, <b>ou</b> qui gagnent au moins une circonscription, ont droit à des sièges de liste. C'est pourquoi la circonscription d'Epsom (ACT) ou les circonscriptions maories (Te Pāti Māori) pèsent tant.</p></div>
      <div><h4>Sièges en surplus</h4><p>Un parti qui gagne plus de circonscriptions que ne lui en donne son vote de parti les garde toutes : la Chambre compte alors plus de 120 sièges (122 en 2023, avec 2 sièges de plus pour Te Pāti Māori ; 123 après une partielle). La majorité monte d'autant.</p></div>
      <div><h4>Circonscriptions maories</h4><p>Les électeurs maoris choisissent d'être inscrits sur la liste générale ou sur la liste maorie ; ceux de la liste maorie votent dans l'une des 7 circonscriptions maories, qui couvrent tout le pays par-dessus les 64 générales. Limites redessinées en 2025 : une circonscription de moins dans l'île du Nord (71 au lieu de 72), donc 49 sièges de liste.</p></div>
      <div><h4>Le soir du vote</h4><p>Les votes par anticipation sont comptés pendant la journée et publiés dès la fermeture, puis ceux des bureaux du jour. Ces résultats sont <b>préliminaires</b> : les votes spéciaux sont vérifiés et comptés ensuite (résultats officiels le 27 novembre), ce qui peut déplacer un siège de liste ou une circonscription serrée.</p></div>
      <div><h4>Les enjeux</h4><p>La coalition National–ACT–NZ First peut-elle garder la majorité de 61 sièges, ou les travaillistes de Chris Hipkins, avec les Verts et Te Pāti Māori, la lui ravir ? Les sondages placent National et les travaillistes au coude-à-coude, et Opportunity, hors des deux blocs, pourrait tenir la balance.</p></div>
    </div>`;

  $("edSource").innerHTML = `Sources : résultats du flux XML de la <a href="${SITE_RES}" target="_blank" rel="noopener">Commission électorale</a> (Electoral Commission | Te Kaitiaki Take Kōwhiri), préliminaires et non officiels jusqu'au 27 novembre, lus par le site toutes les 45 secondes ou toutes les 5 minutes par une copie de secours ; projection des sièges calculée par le site selon la loi électorale de 1993 (art. 191 et 192), à comparer à celle de la Commission ;
    partis et candidatures : flux de la Commission (octobre 2026) ; élection de 2023 : résultats officiels de la Commission (archive.electionresults.govt.nz), anciennes limites ;
    carte : circonscriptions générales et maories de 2025 de la Representation Commission, publiées par Stats NZ (<a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">CC BY 4.0</a>), découpées au littoral par les SA3 2023 de Stats NZ (CC BY 4.0), simplifiées ;
    sondages : publications des sondeurs, compilées par Wikipédia (CC BY-SA). Chefs et dates : Commission électorale et presse néo-zélandaise. Cette page est temporaire.`;
}
// calcul des sièges en direct (ou avec les sondages avant les résultats)
function dessinerCalcul() {
  const res = auMoinsUn(), pr = (res && projection()) || projSondages(), r = pr.r;
  const voix = p => res ? (RES.partis[p]?.v ?? 0) : MOY[p] * 1000;
  const L = [...new Set([...Object.keys(r), ...ORDRE_P.slice(0, 7)])].filter(p => voix(p) > 0 || r[p]).sort((a, b) => voix(b) - voix(a));
  const q = x => x ? `${esc(infoP(x.p).court)} : ${res ? nf(voix(x.p)) : nf(MOY[x.p], 1) + " %"} ÷ ${x.d} = ${res ? nf(x.q) : nf(x.q / 1000, 2)}` : "—";
  bloc("nzCalcul").innerHTML = `<h3 id="nzCalculT">Le calcul des sièges ${res ? (DEMO ? `(${DEMO_TXT[DEMO]})` : "(résultats en cours)") : "(moyenne des sondages)"}</h3>
    <p>Méthode de la loi électorale : (1) on écarte les partis sous 5 % du vote de parti qui n'ont gagné aucune circonscription ; (2) on retire des 120 sièges ceux des circonscriptions gagnées par un candidat indépendant ou d'un parti écarté${pr.hors ? ` (ici ${pr.hors})` : ""} ; (3) on divise les voix de chaque parti admis par 1, 3, 5, 7… (Sainte-Laguë) et les ${SIEGES - pr.hors} plus grands quotients donnent les sièges ; (4) chaque parti garde ses circonscriptions et reçoit la différence en sièges de liste ; s'il a plus de circonscriptions que de sièges, il les garde et la Chambre grandit (sièges en surplus). ${res ? "Avec les résultats préliminaires, les circonscriptions sont attribuées au candidat en tête." : "Avant les résultats, la moyenne des sondages et aucune circonscription gagnée par un parti sous le seuil."}</p>
    <div class="ed-sond"><table><thead><tr><th>Parti</th><th>Vote de parti</th><th>Admis</th><th>Part (Sainte-Laguë)</th><th>Circonscriptions</th><th>Liste</th><th>Total</th></tr></thead><tbody>${L.map(p => {
      const x = r[p], v = 100 * voix(p) / (pr.totV || 1);
      return `<tr><td><b style="color:${coulP(p)}">●</b> <b>${esc(infoP(p).nom)}</b></td><td>${nf(v, 2)} %</td><td>${x?.admis ? "oui" : x ? "non (sans liste)" : "non"}</td><td>${x?.admis ? x.part : "—"}</td><td>${x?.circ || 0}</td><td>${x?.liste || 0}</td><td><b>${x?.tot || 0}</b>${x?.surplus ? ` (+${x.surplus} surplus)` : ""}</td></tr>`;
    }).join("")}<tr><td><b>Total</b></td><td></td><td></td><td>${SIEGES - pr.hors}</td><td>${Object.values(r).reduce((s, x) => s + x.circ, 0)}</td><td>${Object.values(r).reduce((s, x) => s + x.liste, 0)}</td><td><b>${pr.total}</b> · majorité ${pr.maj}</td></tr></tbody></table></div>
    <p>Dernier quotient retenu : ${q(pr.dernier)} ; premier quotient écarté : ${q(pr.suivant)}${res && pr.dernier && pr.suivant ? ` (il manquerait environ ${nf(Math.ceil((pr.dernier.q - pr.suivant.q) * pr.suivant.d))} voix de parti à ${esc(infoP(pr.suivant.p).court)} pour prendre ce dernier siège)` : ""}.${res && Object.values(RES.partis).some(x => x.tot) ? " La Commission publie aussi sa propre projection (encadré du haut) ; les deux doivent concorder." : ""}</p>`;
}

// téléphone : moins de boutons de zoom (les commandes couvraient le nord de la carte)
document.head.insertAdjacentHTML("beforeend", `<style>@media (max-width: 600px) { .vue-direct .lv-zoom [data-z="nord"], .vue-direct .lv-zoom [data-z="sud"], .vue-direct .lv-zoom [data-z="ham"] { display: none; } }</style>`);
function dessiner() {
  dessinerEtat(); dessinerChoix(); dessinerSieges(); dessinerCarte(); dessinerPanneau(); dessinerSuivi(); dessinerCompte();
  if ($("nzCalcul")) dessinerCalcul();
}
function choisir(nom, defiler = true) {
  if (TYPE[nom] && TYPE[nom] !== couche) { couche = TYPE[nom]; ecrireLS(localStorage, "nzCouche", couche); }
  sel = nom; dessinerCarte(); dessinerPanneau(); info($("lvInfo").getAttribute("aria-pressed") === "true" || false);
  if (defiler && innerWidth <= 900 && !document.querySelector(".lv-cartecard.lv-plein, .lv-cartecard:fullscreen")) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function demarrer() {
  const [geo, listes, r23] = await Promise.all([
    fetch(DOSSIER + "circonscriptions.json", { cache: "no-cache" }).then(r => r.json()),
    fetch(DOSSIER + "candidats.json", { cache: "no-cache" }).then(r => r.json()),
    fetch(DOSSIER + "resultats-2023.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : { circ: {}, national: {} }).catch(() => ({ circ: {}, national: {} })),
  ]);
  GEO = geo; LISTES = listes; R23 = r23;
  for (const p of Object.values(LISTES.partis)) NOM_P[p.a] ||= p.nom;
  for (const f of [...GEO.general.features, ...GEO.maori.features]) { PAR_NOM[f.properties.nom] = true; TYPE[f.properties.nom] = f.properties.t; }
  dessinerHeures(); dessinerTextes(); preparerCarte(); construireCarte();
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-suivre]"); if (s) { e.stopPropagation(); basculerSuivie(s.dataset.suivre); return; }
    const t = e.target.closest("[data-tri]"); if (t) { triClassement = t.dataset.tri; ecrireLS(localStorage, "nzTri", triClassement); dessinerSuivi(); return; }
    const v = e.target.closest("[data-vote]"); if (v) { choisirVote(v.dataset.vote); return; }
    const l = e.target.closest(".lv-ligne"); if (l) choisir(l.dataset.rid);
  });
  document.addEventListener("keydown", e => {
    const l = e.target.closest?.(".lv-ligne");
    if (l && (e.key === "Enter" || e.key === " ") && e.target === l) { e.preventDefault(); choisir(l.dataset.rid, false); }
  });
  $("lvPPReplier").addEventListener("click", () => { const ouvert = $("lvPPSection").hasAttribute("data-ferme"); $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); });
  $("lvMaj").addEventListener("click", actualiser);
  dessiner();
  await actualiser();
  setInterval(() => { if (!document.hidden && Date.now() >= prochaine) actualiser(); afficherDecompte(); }, 1000);
  setInterval(dessinerHeures, 60000);
}
demarrer();
