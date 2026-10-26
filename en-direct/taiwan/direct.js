/* En direct : élections locales à Taïwan du samedi 28 novembre 2026 (九合一, « neuf en un »), page en-direct-taiwan.html.
   Seules les 22 courses de maire et de chef de comté sont suivies : 6 municipalités spéciales (直轄市), 3 villes provinciales (市) et
   13 comtés (縣). Scrutin uninominal à un tour : le candidat qui a le plus de voix l'emporte. Bureaux ouverts de 8 h à 16 h, heure de Taïwan
   (UTC+8), soit de 19 h le vendredi à 3 h le samedi, heure du Québec. Même cadre que le direct de la Colombie-Britannique (en-direct/cb-2026) :
   lecture chaque minute avec décompte, résumé par parti, carte avec zooms et plein écran, fiche, endroits suivis avec alertes, classement.

   Données : api/direct-tw.php (relais des pages de résultats de la Commission électorale centrale, CEC, cache 45 s : pas d'en-tête CORS) ;
   à défaut, en-direct/taiwan/resultats.json (copie du pipeline GitHub, outils/tw.py). Les deux rendent les pages HTML de la CEC
   (une par course, « pages ») ; on les lit ici en reconnaissant les candidats de la liste (courses.json) et les en-têtes des colonnes
   (得票數, 推薦政黨…) : l'ordre des colonnes importe peu. Démo (admin) : ?demo=2022 lit l'élection de 2022 refaite au même format
   (demo-2022.json, outils/demo.py) ; &avance=40 la ramène à environ 40 % des bureaux dépouillés.
   Carte : en-direct/taiwan/municipalites.json (limites des comtés du Centre national de cartographie, 內政部國土測繪中心, Licence de données
   ouvertes du gouvernement de Taïwan 1.0, outils/carte.sh) ; Kinmen et Matsu, au large de la Chine, en encarts. */

const RAFRAICHIR = 60;                                         // secondes entre deux lectures
const NB = 22;
const OUVERTURE = new Date("2026-11-28T08:00:00+08:00"), FERMETURE = new Date("2026-11-28T16:00:00+08:00");
const SITE_CEC = "https://web.cec.gov.tw/central";
const SERRE = 5;                                               // lutte serrée : moins de 5 points d'écart
const PARAMS = new URLSearchParams(location.search);
const DEMO = sessionStorage.getItem("userRole") === "admin" && PARAMS.has("demo") ? (PARAMS.get("demo") || "2022") : null;
const AVANCE = DEMO && PARAMS.has("avance") ? Math.max(1, Math.min(100, +PARAMS.get("avance") || 40)) : null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const secQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" });
const deux = n => String(n).padStart(2, "0");
const ilYa = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${deux(Math.floor(s / 60) % 60)}`; };
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };
// noms chinois : variantes de caractères ramenées à une seule forme ; la CEC écrit certains caractères rares dans la zone privée d'Unicode
const VARIANTES = { "臺": "台", "溫": "温", "啟": "啓", "黃": "黄", "羣": "群", "峯": "峰", "衞": "衛", "綫": "線", "眞": "真", "裏": "裡", "爲": "為", "槪": "概" };
const normZh = s => String(s ?? "").replace(/[-]/g, "").replace(/[\s　·．・.\-]/g, "").replace(/./g, c => VARIANTES[c] || c);

/* ---------- partis ---------- */
const PARTIS = {
  kmt: { court: "KMT", nom: "Kuomintang (KMT, 中國國民黨)", chef: "Cheng Li-wun (鄭麗文), présidente du parti depuis novembre 2025", c: "#2347A6" },
  dpp: { court: "PDP", nom: "Parti démocrate progressiste (PDP, 民主進步黨)", chef: "Lai Ching-te (賴清德), président de la République et du parti", c: "#1B9431" },
  tpp: { court: "PPT", nom: "Parti populaire taïwanais (PPT, 台灣民眾黨)", chef: "Huang Kuo-chang (黃國昌), président du parti depuis janvier 2025", c: "#1FB5B5" },
  ind: { court: "Ind.", nom: "Sans parti (無黨籍)", c: "#6B7280" },
  aut: { court: "Autres", nom: "Autres partis", c: "#A3A8B1" },
};
const ORDRE_P = ["kmt", "dpp", "tpp", "ind", "aut"];
const coulP = p => PARTIS[p]?.c || PARTIS.aut.c;
const partiDe = aff => /國民黨/.test(aff) ? "kmt" : /民主進步黨/.test(aff) ? "dpp" : /民[眾衆]黨/.test(aff) ? "tpp" : /無黨|未經政黨推薦|^$/.test(aff) ? "ind" : "aut";
const AFF_FR = { "台灣團結聯盟": "Union pour la solidarité de Taïwan", "台灣工黨": "Parti travailliste de Taïwan", "台灣麻將最大黨": "« Parti du mahjong »",
  "台灣SoR無法黨": "Parti SoR de Taïwan", "三勢團結促進聯盟": "Alliance pour l'unité des trois forces", "司法正義黨": "Parti de la justice",
  "司法改革黨": "Parti de la réforme judiciaire", "時代力量": "Parti du nouveau pouvoir", "台灣動物保護黨": "Parti pour la protection des animaux",
  "台灣基進": "Parti de construction de l'État taïwanais", "親民黨": "Parti du peuple d'abord", "新黨": "Nouveau Parti", "台灣維新": "Parti de la restauration de Taïwan",
  "共和黨": "Parti républicain", "台澎黨": "Parti Taïwan-Penghu", "勞動黨": "Parti du travail", "綠黨": "Parti vert de Taïwan",
  "台灣民眾黨": "Parti populaire taïwanais", "中國國民黨": "Kuomintang", "民主進步黨": "Parti démocrate progressiste", "無黨籍": "sans parti" };
const nomParti = k => k.p === "aut" ? `${AFF_FR[k.aff] || "autre parti"}${k.aff ? ` (${k.aff})` : ""}` : PARTIS[k.p].nom;
const courtParti = k => k.p === "aut" ? (AFF_FR[k.aff] ? AFF_FR[k.aff].replace(/^Parti (de la |du |de |pour la )?/, "").replace(/^« |»$/g, "") : "Autre") : PARTIS[k.p].court;

const TYPES = { mun: "Municipalité spéciale (直轄市)", ville: "Ville provinciale (市)", comte: "Comté (縣)" };
const POSTE = { mun: "maire", ville: "maire", comte: "chef de comté" };
const COURT = { "10018": "Hsinchu (ville)", "10004": "Hsinchu (comté)", "10020": "Chiayi (ville)", "10010": "Chiayi (comté)", "09007": "Matsu (Lienchiang)", "09020": "Kinmen" };
// grandes régions (zooms) et place des étiquettes quand le centre du plus grand morceau tombe mal (Nouveau Taipei entoure Taipei)
const ZONES = { nord: ["63000", "65000", "10017", "68000", "10018", "10004"], centre: ["10005", "66000", "10007", "10008", "10009"],
  sud: ["10020", "10010", "67000", "64000", "10013"], est: ["10002", "10015", "10014"], penghu: ["10016"], kinmen: ["09020"], matsu: ["09007"] };
const ANCRE = { "65000": [121.62, 24.86], "64000": [120.62, 22.98], "10013": [120.62, 22.45], "10002": [121.62, 24.6] };

let GEO = null, COURSES = {}, SONDAGES = {}, NOTE_SOND = "", RES = null, brut = null, lu = null;
let sel = null, carteMarge = false, carteGains = false, prochaine = 0;
const nomC = code => COURSES[code]?.fr || code;
const courtC = code => COURT[code] || nomC(code).replace(/^comté de /, "");
const Maj1 = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- lecture des pages de la CEC ----------
   Une page par course (code de 17 chiffres dans l'adresse : 5 premiers = comté), plus parfois celle de tout Taïwan. Dans chaque tableau,
   les en-têtes (th) donnent les colonnes : 姓名 (nom), 得票數 (voix), 推薦政黨 (parti), 當選 (élu), 號次 (numéro). Un nom de la liste
   officielle reconnaît la ligne ; un inconnu est gardé sur la page de sa course avec le parti lu dans sa colonne. Sans en-têtes : voix =
   plus grand entier de la ligne hors pourcentages et hors numéro. « 已送投票所數/總投票所數: a/b » = bureaux dépouillés. */
let INDEX = null;                                              // nom normalisé → [{ code, cand }]
function indexer() {
  INDEX = new Map();
  for (const [code, C] of Object.entries(COURSES)) for (const k of DEMO ? C.r22.cands : C.cands) {     // démo : candidats de 2022
    const n = normZh(k.zh); if (!INDEX.has(n)) INDEX.set(n, []); INDEX.get(n).push({ code, cand: k });
  }
}
const entier = t => { const s = String(t ?? "").replace(/[\s ]/g, ""); return /^\d{1,3}(,\d{3})+$|^\d+$/.test(s) ? +s.replace(/,/g, "") : null; };
function trouverCand(texte, code) {
  const n = normZh(texte); if (n.length < 2) return null;
  let L = INDEX.get(n);
  if (!L) for (const [nom, l] of INDEX) if (nom.length >= 2 && n.includes(nom) && n.length <= nom.length + 12) { L = l; break; }   // « 蔣萬安 6號 », nom suivi du parti
  if (!L) return null;
  return code ? L.find(x => x.code === code) || null : L.length === 1 ? L[0] : null;
}
function ajouter(out, code, cand, voix, elu) {
  const c = out.circ[code] ||= { cands: {}, sec: null };
  const prev = c.cands[cand.zh];
  if (!prev || voix > prev.voix) c.cands[cand.zh] = { ...cand, voix, elu: !!elu || !!prev?.elu };
  else if (elu) prev.elu = true;
}
const COL = { nom: /姓名|候選人|Candidate|Name/i, voix: /得票數|^票數|Votes?$/i, parti: /政黨|推薦|Party/i, pct: /得票率|%|Percent/i, elu: /當選|Elected/i, no: /號次|^No\.?$/i };
function colonnes(table) {
  const th = [...(table.tHead?.rows[0]?.cells || table.querySelector("tr")?.querySelectorAll("th") || [])].map(x => x.textContent.replace(/\s+/g, ""));
  const ix = {}; for (const [k, re] of Object.entries(COL)) ix[k] = th.findIndex(t => re.test(t) && !(k === "voix" && /有效|無效|率/.test(t)));
  return { th, ix };
}
function lirePage(p, out) {
  const code = String(p.code || (/\/(\d{17})\.html/.exec(p.url || "") || [])[1] || "").slice(0, 5);
  const page = COURSES[code] ? code : null;                    // null : page de tout Taïwan (ou inconnue)
  const doc = new DOMParser().parseFromString(p.corps, "text/html");
  const texte = doc.body.textContent.replace(/\s+/g, " ");
  const m = /已送投票所數\s*\/\s*總投票所數\s*[:：]?\s*([\d,]+)\s*\/\s*([\d,]+)/.exec(texte);
  const t = /資料時間\s*[:：]?\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(texte);
  if (t) out.heureCec = `${+t[3]} h ${t[4]}`;
  if (m) { const sec = [+m[1].replace(/,/g, ""), +m[2].replace(/,/g, "")]; if (page) (out.circ[page] ||= { cands: {}, sec: null }).sec = sec; else out.resume.sec = sec; }
  for (const table of doc.querySelectorAll("table")) {
    const { th, ix } = colonnes(table);
    // tableau des totaux : votes valides, votants, inscrits, participation
    if (page && th.some(x => /有效票|投票數|選舉人數|投票權人|投票率/.test(x)) && ix.nom < 0) {
      const v = [...(table.tBodies[0]?.rows[0]?.cells || [])].map(x => x.textContent.trim());
      const c = out.circ[page] ||= { cands: {}, sec: null };
      th.forEach((h, i) => { const n = entier(v[i]), f = parseFloat(String(v[i] || "").replace(/,/g, ""));
        if (/^有效票/.test(h) && n != null) c.valides = n; else if (/^投票數/.test(h) && n != null) c.votants = n;
        else if (/選舉人數|投票權人總數/.test(h) && n != null) c.inscrits = n; else if (/投票率/.test(h) && !isNaN(f)) c.part = f; });
      continue;
    }
    for (const tr of table.querySelectorAll("tr")) {
      const tds = [...tr.children].filter(x => x.tagName === "TD"); if (tds.length < 2) continue;
      const cells = tds.map(x => x.textContent.replace(/\s+/g, " ").trim());
      let trouve = ix.nom >= 0 ? trouverCand(cells[ix.nom], page) : null;
      if (!trouve) for (const x of cells) { trouve = trouverCand(x, page); if (trouve) break; }
      let cand = trouve?.cand, code2 = trouve?.code || page;
      if (!cand && page && ix.nom >= 0 && ix.voix >= 0 && /\p{Script=Han}/u.test(cells[ix.nom] || "")) {     // candidat absent de la liste
        const aff = ix.parti >= 0 ? cells[ix.parti].replace(/\s*推薦$/, "").trim() : "";
        cand = { zh: cells[ix.nom].replace(/[-]/g, ""), fr: "", p: partiDe(aff), aff: aff || "無黨籍", bio: "" };
      }
      if (!cand || !code2) continue;
      if (ix.parti >= 0 && cells[ix.parti]) { const aff = cells[ix.parti].replace(/\s*推薦$/, "").trim(); cand = { ...cand, p: partiDe(aff), aff: aff || "無黨籍" }; }   // étiquette lue sur la page de la CEC
      let voix = ix.voix >= 0 ? entier(cells[ix.voix]) : null;
      if (voix == null) { const ns = cells.map((x, i) => i === ix.no || i === ix.pct || /[%.]/.test(x) ? null : entier(x)).filter(v => v != null); voix = ns.length ? Math.max(...ns) : null; }
      if (voix == null) continue;
      const elu = (ix.elu >= 0 && /當選|✓|✔|★|◎|^\*$/.test(cells[ix.elu])) || /當選/.test(tr.textContent)
        || !!tr.querySelector("img[alt*='當選'], img[title*='當選'], img[src*='elect' i], .elected");
      ajouter(out, code2, cand, voix, elu);
    }
  }
}
function normaliser(d) {
  if (!INDEX) indexer();
  const out = { maj: d.maj ? new Date(d.maj) : null, circ: {}, resume: {}, pages: 0, demo: d.demo || null };
  const pages = (d.pages || []).slice().sort((a, b) => (String(a.code).startsWith("0000") ? -1 : 0) - (String(b.code).startsWith("0000") ? -1 : 0));
  for (const p of pages) { out.pages++; try { lirePage(p, out); } catch { /* page illisible */ } }
  for (const c of Object.values(out.circ)) finir(c);
  out.lus = Object.values(out.circ).filter(c => c.total > 0).length;
  return out;
}
function finir(c) {
  c.cands = (Array.isArray(c.cands) ? c.cands : Object.values(c.cands)).sort((a, b) => b.voix - a.voix);
  c.total = c.cands.reduce((s, k) => s + k.voix, 0);
  c.frac = c.sec && c.sec[1] ? Math.min(1, c.sec[0] / c.sec[1]) : null;
  c.final = c.total > 0 && (c.cands.some(k => k.elu) || (c.frac != null && c.frac >= 1));
}
// démo partielle : les résultats complets de 2022 ramenés à environ p % des bureaux (variable d'une course à l'autre)
const alea = k => ((Math.imul(k + 1, 2654435761) >>> 0) % 1000) / 1000;
function demoPartielle(R, p) {
  for (const [code, c] of Object.entries(R.circ)) {
    const n = +code, f = p >= 100 ? 1 : Math.max(0, Math.min(1, p / 100 * (0.35 + 1.3 * alea(n))));
    const t = c.sec?.[1] || 100;
    c.cands = c.cands.map((k, j) => ({ ...k, elu: f >= 1 && k.elu, voix: Math.round(k.voix * f * (f >= 1 ? 1 : 0.85 + 0.3 * alea(n * 31 + j))) }));
    c.sec = [Math.round(t * f), t]; c.valides = null;
    finir(c);
  }
  R.lus = Object.values(R.circ).filter(c => c.total > 0).length;
  return R;
}

/* ---------- lecture : relais du site, sinon copie du pipeline (ou démo) ---------- */
async function lireRelais() {
  const r = await fetch("api/direct-tw.php?type=resultats", { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { const d = await r.json(); return d && "pages" in d ? d : null; } catch { return null; }   // pas de PHP (serveur local) : copie du pipeline
}
async function lireCopie() {
  const r = await fetch("en-direct/taiwan/resultats.json", { cache: "no-cache" });
  return r.ok ? { ...(await r.json()), publie: r.headers.get("last-modified") } : null;
}
async function lire() {
  if (DEMO) { const r = await fetch(`en-direct/taiwan/demo-${encodeURIComponent(DEMO)}.json`, { cache: "no-cache" }); if (!r.ok) throw new Error(`Démo « ${DEMO} » introuvable.`); return { ...(await r.json()), via: "demo" }; }
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
    if (RES && AVANCE) demoPartielle(RES, AVANCE);
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
const ferme = () => DEMO !== null || new Date() >= FERMETURE;
const g22 = code => COURSES[code]?.r22?.cands?.[0] || null;           // élu de 2022
const gain = (code, k) => { const w = g22(code); return !!(w && k && w.p !== k.p && normZh(w.zh) !== normZh(k.zh)); };   // pas un gain : l'élu de 2022 qui a changé d'étiquette
const popTot = () => Object.values(COURSES).reduce((s, c) => s + (c.pop || 0), 0);
function bilan() {
  const s = Object.fromEntries(ORDRE_P.map(p => [p, { elus: 0, avance: 0, voix: 0, pop: 0, s22: 0, pop22: 0, v22: 0, sortants: 0 }]));
  for (const [code, C] of Object.entries(COURSES)) {
    const w = g22(code); if (w) { s[w.p].s22++; s[w.p].pop22 += C.pop || 0; }
    for (const k of C.r22?.cands || []) s[k.p].v22 += k.voix;
    s[C.sortant.p].sortants++;
    const c = enCirc(code); if (!c) continue;
    const a = tete(c); s[a.p][c.final ? "elus" : "avance"]++; s[a.p].pop += C.pop || 0;
    for (const k of c.cands) s[k.p].voix += k.voix;
  }
  return s;
}

/* ---------- état, heures ---------- */
function dessinerEtat() {
  const b = $("lvBanniere");
  $("edAvant").hidden = ferme();
  const lien = `<a href="${esc(brut?.source || SITE_CEC)}" target="_blank" rel="noopener">site de la Commission électorale centrale</a>`;
  b.hidden = false;
  if (DEMO) b.innerHTML = `<b>DÉMO · résultats de ${esc(RES?.demo || DEMO)}</b> : élection du 26 novembre 2022 (Chiayi : 18 décembre), pages refaites au format du site de la CEC pour tester la lecture${AVANCE ? `, ramenées à environ ${AVANCE} % des bureaux dépouillés (chiffres partiels fictifs)` : ""}. Les candidats de 2022 ne sont pas ceux de 2026. Retire « ?demo » de l'adresse pour revenir au direct.`;
  else if (RES?.pages && !auMoinsUn() && ferme() && brut?.disponible && !Object.keys(RES.circ).length) b.innerHTML = `La CEC publie des pages, mais leur présentation n'a pas pu être lue ici. En attendant une correction, voir le ${lien}.`;
  else if (!auMoinsUn()) b.innerHTML = ferme()
    ? `<b>Bureaux fermés</b> : dépouillement à la main dans chacun des quelque 18 000 bureaux, en attente des premiers chiffres de la CEC (vérification chaque minute).`
    : `Les résultats du dépouillement s'afficheront ici après la fermeture des bureaux, le <b>samedi 28 novembre à 16 h, heure de Taïwan (3 h du matin, heure du Québec)</b>.`;
  else b.innerHTML = `<b>Résultats non officiels</b> du dépouillement, publiés par la CEC au fil de la soirée ; les élus seront proclamés au plus tard le 4 décembre.`;
  if (!RES) { $("lvEtat").textContent = ferme() ? "Résultats indisponibles pour le moment · nouvel essai chaque minute" : "Avant le vote · les résultats commencent à la fermeture des bureaux"; dessinerVerifs(); return; }
  if (!auMoinsUn()) { $("lvEtat").textContent = ferme() ? "En attente des premiers résultats · vérification chaque minute" : "Avant le vote · les résultats commencent à la fermeture des bureaux"; dessinerVerifs(); return; }
  const fin = Object.values(RES.circ).filter(c => c.final && c.total > 0).length, B = bureaux();
  $("lvEtat").innerHTML = [DEMO ? "<b>DÉMO · résultats de 2022</b>" : "<b>Résultats non officiels</b>", `${RES.lus} course${RES.lus > 1 ? "s" : ""} sur ${NB} avec des résultats`,
    fin ? `${fin} entièrement dépouillée${fin > 1 ? "s" : ""}` : "", B.t ? `${nf(100 * B.f / B.t, B.f / B.t < 0.01 ? 2 : 1)} % des bureaux` : "",
    RES.heureCec ? `données de la CEC de ${RES.heureCec} (heure de Taïwan)` : ""].filter(Boolean).join(" · ");
  dessinerVerifs();
}
function bureaux() {
  let f = 0, t = 0;
  for (const code of Object.keys(COURSES)) { const c = RES?.circ?.[code]; if (c?.sec) { f += c.sec[0]; t += c.sec[1]; } }
  if (!t && RES?.resume?.sec) [f, t] = RES.resume.sec;
  return { f, t };
}
function dessinerVerifs() {
  const el = $("lvHeures"); el.hidden = !brut || !!DEMO || !ferme(); if (el.hidden) return;
  const m = Date.now(), verif = brut.via === "relais" && brut.ageCache != null ? new Date(lu - brut.ageCache * 1000) : null;
  const publie = brut.via === "copie" && brut.publie ? new Date(brut.publie) : null;
  el.innerHTML = `<span><b>Vérifiées</b> sur le <a href="${esc(brut.source || SITE_CEC)}" target="_blank" rel="noopener">site de la CEC</a> ${verif ? `par le site à ${secQc(verif)} (il y a ${ilYa(m - verif)})`
    : `par la copie de secours du pipeline${publie && !isNaN(publie) ? `, mise en ligne à ${heureQc(publie)} (il y a ${ilYa(m - publie)})` : ""}`}`
    + (lu ? ` · relues par cette page à ${secQc(lu)}` : "") + ` · heures du Québec</span>`;
}
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date(), avant = m < OUVERTURE, cible = avant ? OUVERTURE : FERMETURE, ms = Math.max(0, cible - m);
  const j = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  $("edCompte").innerHTML = `<span class="lv-eyebrow">${avant ? "Ouverture des bureaux" : "Fermeture des bureaux"}</span>
    <h3>${avant ? "Les bureaux ouvrent dans" : "Les bureaux ferment dans"}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${[[j, "jours"], [deux(h), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>Samedi 28 novembre, de <b>8 h à 16 h, heure de Taïwan</b>, soit du <b>vendredi 27 novembre à 19 h au samedi 28 à 3 h, heure du Québec</b>. Taïwan (UTC+8, sans heure d'été) aura alors 13 heures d'avance sur le Québec, revenu à l'heure normale le 1er novembre.</p>`;
}
function dessinerHeures() {
  const m = new Date();
  const L = [
    ["Fin des sondages publiés", "Dès le mercredi 18 novembre", "La loi électorale interdit de publier ou de commenter des sondages dans les dix jours précédant le vote", new Date("2026-11-28T16:00:00+08:00")],
    ["Jour du vote", "Samedi 28 novembre, de 8 h à 16 h (heure de Taïwan)", "Du vendredi 27 à 19 h au samedi 28 à 3 h, heure du Québec · au bureau de son lieu d'inscription au registre des ménages, sans vote par anticipation ni par la poste", FERMETURE],
    ["Dépouillement", "Dès 16 h (3 h au Québec)", "À la main et en public, dans chaque bureau ; la CEC publie les résultats au fur et à mesure, la plupart des courses sont connues dans la soirée (nuit de vendredi à samedi au Québec)", new Date("2026-11-28T23:00:00+08:00")],
    ["Proclamation des élus", "Au plus tard le vendredi 4 décembre", "Par les commissions électorales des municipalités et des comtés ; recomptage possible sur demande en cas d'écart très faible", new Date("2026-12-04T18:00:00+08:00")],
    ["Entrée en fonction", "Vendredi 25 décembre", "Mandat de quatre ans, renouvelable une seule fois de suite", new Date("2026-12-25T18:00:00+08:00")],
  ];
  $("edHeures").innerHTML = L.map(([t, a, b, fin]) => `<li class="${m > fin ? "ed-passe" : ""}"><b>${t}</b><span>${a}<small>${b}</small></span></li>`).join("");
}

/* ---------- résumé : courses gagnées ou menées par parti ---------- */
function dessinerSieges() {
  const s = bilan(), tot = p => s[p].elus + s[p].avance, voixT = ORDRE_P.reduce((x, p) => x + s[p].voix, 0), v22T = ORDRE_P.reduce((x, p) => x + s[p].v22, 0), P = popTot();
  const ordre = ORDRE_P.filter(p => tot(p) > 0).sort((a, b) => tot(b) - tot(a) || ORDRE_P.indexOf(a) - ORDRE_P.indexOf(b));
  const pct = n => (100 * n / NB) + "%";
  $("lvBarre").innerHTML = ordre.map(p => `<span class="lv-seg" style="width:${pct(tot(p))};--c:${coulP(p)}" title="${esc(PARTIS[p].nom)} : ${tot(p)} course${tot(p) > 1 ? "s" : ""} (${s[p].elus} gagnée${s[p].elus > 1 ? "s" : ""}, ${s[p].avance} en tête)">`
    + `<i class="lv-elus" style="width:${100 * s[p].elus / tot(p)}%"></i><b>${esc(PARTIS[p].court)} ${tot(p)}</b></span>`).join("");
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").pop();
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const lead = ordre[0];
  $("edProvSur").textContent = DEMO ? "DÉMO · 22 maires et chefs de comté en 2022" : "22 maires et chefs de comté";
  $("lvSiegesTitre").textContent = !lead ? (ferme() ? "Aucune course dépouillée pour l'instant" : "Les 22 courses : résultats dès la fermeture des bureaux (3 h, heure du Québec)")
    : `${PARTIS[lead].nom} : ${tot(lead)} course${tot(lead) > 1 ? "s" : ""} sur ${NB} (${s[lead].elus} gagnée${s[lead].elus > 1 ? "s" : ""}, ${s[lead].avance} en tête)`;
  const montres = ORDRE_P.filter(p => tot(p) > 0 || s[p].voix > 0 || s[p].s22 > 0 || s[p].sortants > 0);
  $("lvPartis").innerHTML = montres.sort((a, b) => tot(b) - tot(a) || s[b].s22 - s[a].s22 || ORDRE_P.indexOf(a) - ORDRE_P.indexOf(b)).map(p => {
    const v = voixT ? 100 * s[p].voix / voixT : null, Pp = PARTIS[p], ok = auMoinsUn();
    const avant = `2022 : ${s[p].s22} · ${nf(100 * s[p].v22 / v22T, 1)} % des voix`;
    return `<div class="lv-parti" style="--c:${Pp.c}" title="${esc(Pp.nom)}${Pp.chef ? " · " + esc(Pp.chef) : ""}"><i></i><span class="lv-pnom">${esc(Pp.court)}</span>`
      + `<b>${ok ? tot(p) : s[p].sortants}</b><small>${ok ? `${s[p].elus} gagnée${s[p].elus > 1 ? "s" : ""} · ${s[p].avance} en tête · ${nf(100 * s[p].pop / P, 0)} % de la population · ` : `sortant${s[p].sortants > 1 ? "s" : ""} · `}${avant}</small>`
      + `<span class="lv-pvote">${v != null ? nf(v, 1) + " %" : ""}</span></div>`;
  }).join("");
  const fin = Object.values(RES?.circ || {}).filter(c => c.final && c.total > 0).length, B = bureaux();
  const ins = Object.values(RES?.circ || {}).reduce((x, c) => x + (c.inscrits || 0), 0), vot = Object.values(RES?.circ || {}).reduce((x, c) => x + (c.votants || 0), 0);
  $("edKv").innerHTML = [[`${RES?.lus || 0} / ${NB}`, "courses avec des résultats"], [nf(fin), "courses entièrement dépouillées"],
    [B.t ? nf(100 * B.f / B.t, B.f / B.t < 0.01 ? 2 : 1) + " %" : "—", `des bureaux dépouillés${B.t ? ` (${nf(B.f)} sur ${nf(B.t)})` : ""}`],
    [voixT ? nf(voixT) : "—", "voix valides comptées"], [ins && vot ? nf(100 * vot / ins, 1) + " %" : "—", "participation"]]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>${lead ? `${PARTIS[lead].court} en tête` : "22 courses"}</b><span>${RES?.lus || 0}/${NB} avec résultats</span></div>`
    + `<div class="lv-bp-barre">${ordre.map(p => `<span style="width:${pct(tot(p))};--c:${coulP(p)}"><i style="width:${100 * s[p].elus / tot(p)}%"></i></span>`).join("")}</div>`
    + `<div class="lv-bp-partis">${lead ? ordre.map(p => `<span style="--c:${coulP(p)}"><i></i>${esc(PARTIS[p].court)} <b>${tot(p)}</b></span>`).join("") : `<span>En attente des premiers résultats</span>`}</div>`;
}

/* ---------- carte : île principale et Penghu, Kinmen et Matsu en encarts ---------- */
let svg, gZ, ZOOM, PATH, PATHS = {}, MW = 560, MH = 700, tip, gSuiv, gSel, gLab, kZoom = 1, ENCARTS = [];
const chemin = f => PATHS[f.properties.n] || PATH;
const dChemin = f => chemin(f)(f);
function remplir(code) {
  const c = enCirc(code);
  if (!c) return ["var(--soft)", 1];
  const a = tete(c);
  if (carteGains) return gain(code, a) ? [coulP(a.p), 1] : ["var(--soft)", 1];
  if (carteMarge) return [coulP(a.p), Math.max(0.2, Math.min(1, 0.2 + ecartPts(c) / 40))];
  return [coulP(a.p), c.final || c.frac == null ? 1 : 0.35 + 0.6 * c.frac];
}
function dessinerCarte() {
  if (!gZ) return;
  gZ.selectAll("path.lv-rid").each(function (f) { const [col, op] = remplir(f.properties.n); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null ? [] : GEO.features.filter(f => f.properties.n === sel)).join("path").attr("class", "lv-selline").attr("d", dChemin);
  dessinerContoursSuivis(); dessinerLegende(); etiquettes();
}
function dessinerLegende() {
  const s = bilan(), pres = ORDRE_P.filter(p => s[p].elus + s[p].avance > 0);
  $("edLegende").innerHTML = (pres.length ? pres : ["kmt", "dpp", "tpp", "ind"]).map(p => `<span class="ed-legende-k" style="--c:${coulP(p)}"><i></i>${esc(PARTIS[p].court)} en tête</span>`).join("")
    + `<span>${carteGains ? "· seulement les courses qui changent de parti par rapport à 2022" : carteMarge ? "· couleur d'autant plus foncée que l'écart est grand (pleine à 32 points et plus)" : "· plus la couleur est pâle, moins il y a de bureaux dépouillés"} · gris : aucun résultat · Kinmen et Matsu (au large de la Chine) en encarts</span>`;
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  b.setAttribute("aria-pressed", carteSuivis); b.textContent = carteSuivis ? `★ Suivis (${suivies.size})` : "★ Suivis";
  b.style.setProperty("--c", "#B7860B");
  if (!gSuiv) return;
  const d = carteSuivis ? GEO.features.filter(f => suivies.has(f.properties.n)) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-halo").attr("d", dChemin);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-ligne").attr("d", dChemin).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
// étiquettes des courses : seulement celles qui ont la place au zoom courant (Taipei, Keelung… apparaissent en zoomant)
let LAB = [];
function etiquettes() {
  if (!gLab) return;
  const vis = LAB.filter(l => l.aire * kZoom * kZoom > 1400 || l.encart);
  gLab.selectAll("text").data(vis, l => l.code).join(
    e => e.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").style("pointer-events", "none")
      .style("font-weight", 700).style("fill", "var(--ink)").style("paint-order", "stroke").style("stroke", "var(--surface)").style("stroke-linejoin", "round"))
    .attr("x", l => l.x).attr("y", l => l.y).text(l => l.txt)
    .style("font-size", l => (l.encart ? 9 : 10.5) / kZoom + "px").style("stroke-width", 2.6 / kZoom + "px");
}
function infobulle(e, f) {
  const code = f.properties.n, c = enCirc(code), C = COURSES[code];
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 12, box.width - 250) + "px"; tip.style.top = Math.min(e.clientY - box.top + 12, box.height - 130) + "px";
  const w = g22(code);
  const nom = `<b>${suivies.has(code) ? "★ " : ""}${esc(Maj1(nomC(code)))} · ${esc(C.zh)}</b>`;
  tip.innerHTML = nom + (c ? c.cands.slice(0, 3).map(k => `<span class="ed-tip-l" style="--c:${coulP(k.p)}"><span><i></i>${esc(k.fr ? k.fr.replace(/ \(.*\)$/, "") : k.zh)} (${esc(courtParti(k))})</span><b>${nf(pctC(c, k), 1)} %</b></span>`).join("")
    + `<small>${c.final ? "terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % des bureaux" : "dépouillement en cours"}${w ? ` · 2022 : ${esc(PARTIS[w.p].court)}` : ""}</small>`
    : `<br><small>${ferme() ? "Aucun résultat" : `${C.cands.length} candidatures`}${w ? ` · 2022 : ${esc(PARTIS[w.p].court)} ${nf(w.pct, 1)} %` : ""}</small>`);
}
function construireCarte() {
  if (svg) return;
  const ILES = new Set(["09020", "09007"]);
  const principal = { type: "FeatureCollection", features: GEO.features.filter(f => !ILES.has(f.properties.n)) };
  const proj = d3.geoMercator().fitExtent([[24, 58], [MW - 14, MH - 52]], principal);
  PATH = d3.geoPath(proj);
  // encarts : Matsu en haut à gauche (au-dessus de Penghu), Kinmen en bas à gauche (sous Penghu), dans la mer
  const [xa, ya] = proj([120.45, 24.78]), [xb, yb] = proj([120.25, 23.05]);
  ENCARTS = [{ code: "09007", titre: "Matsu · 連江縣", box: [[14, 108], [Math.max(150, Math.min(xa, 200)), Math.max(ya, 280)]] },
    { code: "09020", titre: "Kinmen · 金門縣", box: [[14, Math.min(yb, MH - 210)], [Math.max(150, Math.min(xb, 200)), MH - 60]] }];
  for (const E of ENCARTS) {
    const f = GEO.features.find(x => x.properties.n === E.code); if (!f) continue;
    const [[x0, y0], [x1, y1]] = E.box;
    PATHS[E.code] = d3.geoPath(d3.geoMercator().fitExtent([[x0 + 10, y0 + 22], [x1 - 10, y1 - 8]], f));
  }
  svg = d3.select($("lvCarte")).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove();
  gZ = svg.append("g");
  const gE = gZ.append("g");
  gE.selectAll("rect").data(ENCARTS).join("rect").attr("class", "vf-encarts").attr("rx", 6)
    .attr("x", E => E.box[0][0]).attr("y", E => E.box[0][1]).attr("width", E => E.box[1][0] - E.box[0][0]).attr("height", E => E.box[1][1] - E.box[0][1]);
  gE.selectAll("text").data(ENCARTS).join("text").attr("x", E => E.box[0][0] + 8).attr("y", E => E.box[0][1] + 14).text(E => E.titre)
    .style("font-size", "9.5px").style("font-weight", 700).style("fill", "var(--muted)");
  gZ.append("g").selectAll("path").data(GEO.features).join("path").attr("class", "lv-rid").attr("d", dChemin)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => `${Maj1(nomC(f.properties.n))} (${f.properties.nom})`)
    .on("click", (e, f) => choisir(f.properties.n))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.n); } })
    .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  gSuiv = gZ.append("g"); gSel = gZ.append("g"); gLab = gZ.append("g");
  // étiquettes : centre du plus grand morceau (ou point choisi), aire à l'écran pour savoir si elles tiennent
  LAB = GEO.features.map(f => {
    const code = f.properties.n, P = chemin(f), polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const gros = polys.map(c => ({ type: "Polygon", coordinates: c })).sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
    const [x, y] = ANCRE[code] ? proj(ANCRE[code]) : P.centroid(gros);
    const encart = ILES.has(code);
    return { code, x, y: encart ? y + 2 : y, aire: P.area(f), encart, txt: encart ? "" : courtC(code) };
  }).filter(l => l.txt);
  ZOOM = d3.zoom().scaleExtent([1, 40]).translateExtent([[-80, -80], [MW + 80, MH + 80]])
    .on("zoom", e => { gZ.attr("transform", e.transform); if (e.transform.k !== kZoom) { kZoom = e.transform.k; etiquettes(); } });
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(40, 0.85 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  const borne = codes => { let b = [[Infinity, Infinity], [-Infinity, -Infinity]];
    for (const f of GEO.features) if (codes.includes(f.properties.n)) { const [[a, c], [d, e]] = chemin(f).bounds(f); b = [[Math.min(b[0][0], a), Math.min(b[0][1], c)], [Math.max(b[1][0], d), Math.max(b[1][1], e)]]; }
    return b; };
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (ZONES[z]) { const E = ENCARTS.find(x => ZONES[z].includes(x.code)); vers(E ? E.box : borne(ZONES[z])); }
  else if (COURSES[z]) vers(borne([z]));
  else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
  else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
}
let info = () => {};
const plein = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || $("lvCarte").parentElement.classList.contains("lv-plein");
function preparerCarte() {
  tip = $("lvTip");
  $("lvZoom").innerHTML = `<button type="button" data-z="tout">Tout Taïwan</button><button type="button" data-z="nord">Nord</button><button type="button" data-z="centre">Centre</button>`
    + `<button type="button" data-z="sud">Sud</button><button type="button" data-z="est">Est</button><button type="button" data-z="penghu">Penghu</button>`
    + `<button type="button" data-z="kinmen">Kinmen</button><button type="button" data-z="matsu">Matsu</button>`
    + `<button type="button" data-z="plus" aria-label="Zoomer">+</button><button type="button" data-z="moins" aria-label="Dézoomer">−</button>`
    + `<span class="lv-groupe" role="group" aria-label="Affichage de la carte (un seul à la fois, ou aucun)"><button type="button" data-z="marge" id="edMarge" aria-pressed="false" title="Couleur du parti en tête, d'autant plus foncée que l'écart est grand">Écart</button>`
    + `<button type="button" data-z="gains" id="edGains" aria-pressed="false" title="Seulement les courses qui changent de parti par rapport à 2022">Gains</button></span>`;
  const carte = $("lvCarte").parentElement;
  carte.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau")) e.preventDefault(); }, { passive: false });
  carte.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "plein") pleinEcran();
    else if (z === "marge" || z === "gains") basculer(z);
    else zoomer(z);
  });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "twCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
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
const nomCand = k => `${esc(k.zh)}${k.fr ? ` <span style="font-weight:500">· ${esc(k.fr)}</span>` : ""}`;
function avatar(k) {
  const ini = esc((String(k.zh || "").replace(/[-]/g, "")[0] || "?"));
  return `<span class="lv-ava lv-ini" style="--c:${coulP(k.p)}" aria-hidden="true">${ini}</span>`;
}
function sondagesHtml(code, n = 3) {
  const L = (SONDAGES[code] || []).slice(-n).reverse(); if (!L.length) return "";
  const C = COURSES[code], noms = [...new Set(L.flatMap(x => Object.keys(x.v)))].sort((a, b) => Math.max(...L.map(x => x.v[b] ?? 0)) - Math.max(...L.map(x => x.v[a] ?? 0))).slice(0, 3);
  const cand = zh => C.cands.find(k => k.zh === zh) || { zh, p: "aut" };
  return `<span class="lv-eyebrow">Derniers sondages</span><div class="ed-sond"><table><thead><tr><th>Sondeur</th>${noms.map(z => `<th style="color:${coulP(cand(z).p)}">${esc(z)}</th>`).join("")}</tr></thead><tbody>`
    + L.map(x => `<tr><td><b><a href="${esc(x.u)}" target="_blank" rel="noopener" style="color:inherit">${esc(x.s)}</a></b><small>${esc(x.d)}</small></td>${noms.map(z => `<td>${x.v[z] != null ? nf(x.v[z], x.v[z] % 1 ? 1 : 0) + " %" : "—"}</td>`).join("")}</tr>`).join("")
    + `</tbody></table></div>`;
}
function bloc2022(code) {
  const r = COURSES[code]?.r22; if (!r) return "";
  const w = r.cands[0];
  return `<p class="lv-muted lv-proj">En ${r.date === "2022-12-18" ? "décembre 2022 (vote reporté)" : "2022"} : ${r.cands.slice(0, 3).map(k => `<b style="color:${coulP(k.p)}">${esc(courtParti(k))}</b> ${nf(k.pct, 1)} %`).join(" · ")} (${esc(w.zh)}${w.fr ? `, ${esc(w.fr)}` : ""}, élu·e)</p>`;
}
function dessinerPanneau() {
  const p = $("lvPanneau");
  if (sel == null) {
    const six = ZONES.nord.concat(ZONES.centre, ZONES.sud).filter(c => COURSES[c]?.type === "mun").sort((a, b) => COURSES[b].pop - COURSES[a].pop);
    p.innerHTML = `<span class="lv-eyebrow">22 courses</span><h3>Clique sur une municipalité ou un comté</h3>
      <p class="lv-muted">Couleur : parti en tête. Plus la couleur est pâle, moins il y a de bureaux dépouillés ; gris : aucun résultat. « Gains » ne montre que les courses qui changent de parti par rapport à 2022.</p>
      <span class="lv-eyebrow">Les six municipalités spéciales (${nf(100 * six.reduce((s, c) => s + COURSES[c].pop, 0) / popTot(), 0)} % de la population)</span>
      <div class="ed-regions">${six.map(code => { const c = enCirc(code), C = COURSES[code];
        const L = c ? c.cands.slice(0, 3).map(k => [k, pctC(c, k)]) : [];
        return `<div role="button" tabindex="0" data-choisir="${code}" style="cursor:pointer"><span><b>${esc(nomC(code))}</b><small>${c ? (c.final ? "terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % bur." : "") : esc(C.zh)}</small></span>`
          + (c ? `<span class="ed-mini">${L.map(([k, v]) => `<i style="width:${v}%;background:${coulP(k.p)}" title="${esc(k.zh)} ${nf(v, 1)} %"></i>`).join("")}</span><small>${esc(tete(c).zh)} ${nf(pctC(c, tete(c)), 1)} %</small>`
            : `<small>Sortant : ${esc(C.sortant.zh)} (${esc(PARTIS[C.sortant.p].court)})</small>`) + `</div>`; }).join("")}</div>
      <div class="lv-kv"><div><b>${RES?.lus || 0}</b><span>avec résultats</span></div><div><b>${NB - (RES?.lus || 0)}</b><span>sans résultat</span></div><div><b>${nf(popTot() / 1e6, 1)} M</b><span>habitants</span></div></div>`;
    return;
  }
  const C = COURSES[sel], c = enCirc(sel), w = g22(sel);
  let html = `<span class="lv-eyebrow">${esc(TYPES[C.type])} · ${nf((C.pop || 0) / 1e6, C.pop < 1e6 ? 2 : 1)} M d'habitants</span><h3>${esc(Maj1(C.fr))} · ${esc(C.zh)}</h3>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${sel}" aria-pressed="${suivies.has(sel)}" style="--c:#B7860B">${suivies.has(sel) ? "★ Suivi" : "☆ Suivre"}</button></div>`
    + `<p class="lv-muted">Élection du ${POSTE[C.type]}. ${C.sortant.p ? `Titulaire : ${esc(C.sortant.zh)} (${esc(C.sortant.fr)}, ${esc(PARTIS[C.sortant.p].court)}), ${esc(C.sortant.statut)}.` : ""}</p>`;
  if (c) {
    const [a, b] = c.cands, ecart = b ? a.voix - b.voix : a.voix;
    html += `<div class="lv-chips"><span class="lv-chip ${c.final ? "fin" : ""}">${c.final ? "Dépouillement terminé" : c.sec ? `${nf(c.sec[0])} / ${nf(c.sec[1])} bureaux (${nf(100 * c.frac, 0)} %)` : "Dépouillement en cours"}</span>`
      + (gain(sel, a) ? `<span class="lv-chip" style="--c:${coulP(a.p)}">Gain ${esc(courtParti(a))} (2022 : ${esc(PARTIS[w.p].court)})</span>` : "")
      + (c.inscrits && c.votants ? `<span class="lv-chip">Participation ${nf(100 * c.votants / c.inscrits, 1)} %</span>` : "") + `</div>`
      + `<p class="lv-tete" style="--c:${coulP(a.p)}"><b>${esc(a.fr ? a.fr.replace(/ \(.*\)$/, "") : a.zh)}</b> (${esc(courtParti(a))}) ${a.elu || c.final ? "élu·e" : "en tête"}${b ? ` par ${nf(ecart)} voix (${nf(pctC(c, a) - pctC(c, b), 1)} pt)` : ""}</p>`
      + `<table class="lv-cands"><tbody>${c.cands.map(k => `<tr style="--c:${coulP(k.p)}"><td>${avatar(k)}</td>`
        + `<td><b>${nomCand(k)}</b>${k.elu ? ' <span class="lv-sortant">élu·e</span>' : k.sortant ? ' <span class="lv-sortant">sortant·e</span>' : ""}<small>${esc(nomParti(k))}</small><span class="lv-jauge"><i style="width:${Math.min(100, pctC(c, k))}%"></i></span></td>`
        + `<td class="lv-num"><b>${nf(pctC(c, k), 1)} %</b><small>${nf(k.voix)}</small></td></tr>`).join("")}</tbody></table>`;
  } else {
    html += `<div class="lv-chips"><span class="lv-chip">${ferme() ? "Aucun résultat pour l'instant" : "Vote le 28 novembre"}</span></div>`;
    const L = C.cands.slice().sort((x, y) => ORDRE_P.indexOf(x.p) - ORDRE_P.indexOf(y.p));
    html += `<span class="lv-eyebrow">Candidatures (${L.length})</span><ul class="lv-liste">${L.map(k => `<li style="--c:${coulP(k.p)}">${avatar(k)}<span><b>${nomCand(k)}${k.sortant ? ' <span class="lv-sortant">sortant·e</span>' : ""}</b><small>${esc(nomParti(k))}${k.bio ? " · " + esc(k.bio) : ""}</small></span></li>`).join("")}</ul>`;
  }
  html += bloc2022(sel) + (DEMO ? "" : sondagesHtml(sel));
  p.innerHTML = html;
}

/* ---------- endroits suivis, alertes, classement ---------- */
let suivies = new Set(lireLS(localStorage, "twSuivies", []));
let carteSuivis = lireLS(localStorage, "twCarteSuivies", false), triClassement = lireLS(localStorage, "twTri", "serre");
const K_CONNUS = DEMO ? "twConnusDemo" : "twConnus";
let connus = lireLS(sessionStorage, K_CONNUS, null);
function basculerSuivie(code) {
  suivies.has(code) ? suivies.delete(code) : suivies.add(code);
  ecrireLS(localStorage, "twSuivies", [...suivies]);
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
function ligne(code) {
  const c = enCirc(code), a = c && tete(c), C = COURSES[code];
  return `<li class="lv-ligne" data-rid="${code}" tabindex="0"><button type="button" class="lv-etoile" data-suivre="${code}" aria-pressed="${suivies.has(code)}" aria-label="Suivre ${esc(nomC(code))}">${suivies.has(code) ? "★" : "☆"}</button>`
    + `<span class="lv-nom" style="--c:${a ? coulP(a.p) : "var(--soft)"}"><i></i>${esc(Maj1(courtC(code)))} <small>${esc(C.zh)}</small></span>`
    + `<span class="lv-ecart">${a ? `${esc(courtParti(a))} +${nf(ecartPts(c), 1)} pt` : `2022 : ${esc(PARTIS[g22(code)?.p]?.court || "—")}`}<small>${c ? (c.final ? "terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % bur." : "") : ""}</small></span></li>`;
}
function dessinerSuivi() {
  $("lvSuivies").innerHTML = suivies.size ? `<ul class="lv-lignes">${[...suivies].filter(k => COURSES[k]).sort((a, b) => courtC(a).localeCompare(courtC(b), "fr")).map(ligne).join("")}</ul>`
    : `<p class="lv-muted">Clique sur ☆ dans la fiche ou le classement pour suivre une course : elle s'affiche ici, et une alerte apparaît quand le parti en tête change.</p>`;
  const TRIS = [["serre", "Plus serrées"], ["pop", "Population"], ["nom", "Par nom"]];
  $("lvPPChoix").innerHTML = TRIS.map(([k, l]) => `<button type="button" data-tri="${k}" aria-pressed="${triClassement === k}">${l}</button>`).join("");
  const codes = Object.keys(COURSES).sort((a, b) => {
    if (triClassement === "nom") return courtC(a).localeCompare(courtC(b), "fr");
    if (triClassement === "pop") return (COURSES[b].pop || 0) - (COURSES[a].pop || 0);
    const ca = enCirc(a), cb = enCirc(b);
    return (ca ? ecartPts(ca) : 999) - (cb ? ecartPts(cb) : 999) || (COURSES[b].pop || 0) - (COURSES[a].pop || 0);
  });
  $("lvParParti").innerHTML = `<ul class="lv-lignes">${codes.map(ligne).join("")}</ul>`;
}
function surveiller() {
  const now = {};
  for (const code of Object.keys(COURSES)) { const c = enCirc(code); if (c) now[code] = tete(c).p; }
  if (connus) for (const code of suivies) if (now[code] && connus[code] && now[code] !== connus[code])
    alerter(`${Maj1(nomC(code))} : ${PARTIS[now[code]].court} passe en tête devant ${PARTIS[connus[code]].court}`, coulP(now[code]));
  connus = now; ecrireLS(sessionStorage, K_CONNUS, connus);
}
function alerter(txt, c) {
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", c); el.textContent = "★ " + txt;
  $("lvAlertes").appendChild(el); setTimeout(() => el.remove(), 12000);
}

/* ---------- blocs du bas : courses et candidats, sondages, comment ça marche, partis ---------- */
function dessinerTextes() {
  const blocs = $("edBlocs"), s = bilan();
  const groupes = [["mun", "Municipalités spéciales (直轄市) : élection du maire"], ["ville", "Villes provinciales (市) : élection du maire"], ["comte", "Comtés (縣) : élection du chef de comté"]];
  const parCourse = code => { const C = COURSES[code], L = C.cands.slice().sort((x, y) => ORDRE_P.indexOf(x.p) - ORDRE_P.indexOf(y.p));
    return `<li class="ed-q" style="--c:${coulP(C.sortant.p)}"><header><b>${esc(Maj1(C.fr))} · ${esc(C.zh)}</b><span>${nf((C.pop || 0) / 1e6, C.pop < 1e6 ? 2 : 1)} M hab.</span></header>`
      + `<p>${L.map(k => `<span style="color:${coulP(k.p)};font-weight:700">●</span> ${esc(k.zh)}${k.fr ? ` (${esc(k.fr)})` : ""}, ${esc(courtParti(k))}${k.sortant ? " · <i>sortant·e</i>" : ""}`).join("<br>")}</p>`
      + `<details><summary>Titulaire et 2022</summary><p>Titulaire : ${esc(C.sortant.zh)} (${esc(C.sortant.fr)}, ${esc(PARTIS[C.sortant.p].court)}), ${esc(C.sortant.statut)}. ${bloc2022(code).replace(/<\/?p[^>]*>/g, "")}</p></details>`
      + `<button type="button" class="vi-lien" data-aller="${code}">Voir la fiche</button></li>`; };
  const ord = t => Object.keys(COURSES).filter(c => COURSES[c].type === t).sort((a, b) => (COURSES[b].pop || 0) - (COURSES[a].pop || 0));
  const sondes = ["63000", "65000", "66000", "64000", "67000", "68000", "10017", "10018", "10004"].filter(c => SONDAGES[c]?.length);
  const ligneS = (code, x) => { const C = COURSES[code], noms = Object.keys(x.v).sort((a, b) => x.v[b] - x.v[a]), cand = zh => C.cands.find(k => k.zh === zh) || { p: "aut" };
    return `<tr><td><b>${esc(courtC(code))}</b><small><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.s)}</a> · ${esc(x.d)}</small></td>`
      + `<td style="text-align:left">${noms.slice(0, 3).map(z => `<span style="color:${coulP(cand(z).p)};font-weight:700">${esc(z)}</span> ${nf(x.v[z], x.v[z] % 1 ? 1 : 0)} %`).join(" · ")}</td>`
      + `<td class="ed-sond-barre"><span class="ed-mini" role="img" aria-label="${esc(noms.map(z => `${z} ${x.v[z]} %`).join(", "))}">${noms.map(z => `<i style="width:${x.v[z]}%;background:${coulP(cand(z).p)}"></i>`).join("")}<i style="width:${Math.max(0, x.autres || 0)}%"></i></span></td></tr>`; };
  blocs.innerHTML = `<section class="ed-bloc" aria-labelledby="twCoursesTitre"><h3 id="twCoursesTitre">Les 22 courses</h3>
      <p>${Object.values(COURSES).reduce((n, C) => n + C.cands.length, 0)} candidatures enregistrées du 31 août au 4 septembre 2026 (listes de l'Agence centrale de presse et de Focus Taiwan) ; les numéros sur le bulletin ont été tirés au sort fin octobre. Les sortants sont signalés ; ${NB - Object.values(COURSES).filter(C => C.cands.some(k => k.sortant)).length} titulaires ne se représentent pas, la plupart limités à deux mandats de suite.</p>
      ${groupes.map(([t, titre]) => `<h4 class="lv-eyebrow">${esc(titre)}</h4><ol class="ed-qs">${ord(t).map(parCourse).join("")}</ol>`).join("")}</section>`
    + (sondes.length ? `<section class="ed-bloc" aria-labelledby="twSondTitre"><h3 id="twSondTitre">Sondages des grandes courses</h3>
      <p>${esc(NOTE_SOND)}</p>
      <div class="ed-sond"><table><thead><tr><th>Course · sondeur</th><th style="text-align:left">Intentions de vote</th><th class="ed-sond-barre">Répartition</th></tr></thead><tbody>
      ${sondes.map(code => SONDAGES[code].slice(-2).reverse().map(x => ligneS(code, x)).join("")).join("")}</tbody></table></div></section>` : "")
    + `<section class="ed-bloc" aria-labelledby="twVoterTitre"><h3 id="twVoterTitre">Comment ça marche, et les enjeux</h3>
      <div class="ed-voter">
        <div><h4>Neuf élections en une</h4><p>Le même jour, 19,65 millions d'électeurs choisissent 11 051 élus locaux dans neuf types d'élections (d'où le nom 九合一, « neuf en un ») : maires et chefs de comté, conseillers, chefs de canton, représentants et chefs de village. Cette page suit seulement les 22 maires et chefs de comté.</p></div>
        <div><h4>Le mode de scrutin</h4><p>Uninominal à un tour : le candidat qui obtient le plus de voix l'emporte, sans second tour ni seuil. Mandat de quatre ans, renouvelable une fois de suite. Six municipalités spéciales (Taipei, Nouveau Taipei, Taoyuan, Taichung, Tainan, Kaohsiung) regroupent environ 70 % de la population.</p></div>
        <div><h4>Qui vote, et comment</h4><ul><li>Citoyens de 20 ans et plus inscrits depuis au moins quatre mois au registre des ménages de la municipalité ou du comté (le référendum de 2022 pour abaisser l'âge à 18 ans a échoué).</li><li>Vote en personne seulement, au bureau du lieu d'inscription : ni vote par anticipation, ni par la poste, ni à l'étranger. Beaucoup de Taïwanais rentrent chez eux pour voter.</li><li>Pièce d'identité nationale, sceau personnel ou signature ; un bulletin par élection.</li></ul></div>
        <div><h4>Le dépouillement</h4><p>Dès 16 h, chaque bulletin est montré et lu à voix haute dans le bureau même, devant les observateurs ; les feuilles de résultats remontent aux commissions électorales locales, puis à la CEC, qui publie les chiffres au fur et à mesure (« bureaux dépouillés »). Ces résultats sont non officiels jusqu'à la proclamation des élus.</p></div>
        <div><h4>Les enjeux</h4><p>Premier grand test depuis l'élection présidentielle de 2024 et l'échec de la campagne de destitution (rappel) massive des députés du KMT en 2025, et répétition générale avant la présidentielle de 2028. Le KMT, majoritaire avec le PPT au Yuan législatif, défend ${s.kmt.sortants} des 22 postes ; le PDP du président Lai Ching-te en tient ${s.dpp.sortants}. Le KMT et le PPT présentent des candidats communs (Nouveau Taipei, Hsinchu, Chiayi) ; les principales luttes : Taipei, Nouveau Taipei, Taichung (sortants KMT limités à deux mandats), Kaohsiung, le comté de Hsinchu, Keelung.</p></div>
        <div><h4>En 2022</h4><p>Lors des dernières élections locales, le KMT avait remporté ${s.kmt.s22} des 22 postes (dont Chiayi, vote reporté au 18 décembre), le PDP ${s.dpp.s22}, le PPT ${s.tpp.s22} (Hsinchu) et des candidats sans parti ${s.ind.s22} (Miaoli, Kinmen) : la pire défaite locale du PDP, dont la présidente Tsai Ing-wen avait quitté la direction le soir même.</p></div>
      </div></section>`
    + `<section class="ed-bloc" aria-labelledby="twPartisTitre"><h3 id="twPartisTitre">Les partis</h3><div class="lv-partis">${["kmt", "dpp", "tpp"].map(p => { const n = Object.values(COURSES).flatMap(C => C.cands).filter(k => k.p === p).length;
      return `<div class="lv-parti" style="--c:${PARTIS[p].c}"><i></i><span class="lv-pnom">${esc(PARTIS[p].nom.replace(/, [^)]*\)/, ")"))}</span><b>${n}</b><small>candidat·e·s · ${esc(PARTIS[p].chef)} · ${s[p].sortants} sortant${s[p].sortants > 1 ? "s" : ""} · ${s[p].s22} en 2022</small></div>`; }).join("")}</div></section>`;
  $("edSource").innerHTML = `Sources : résultats du dépouillement de la <a href="${SITE_CEC}" target="_blank" rel="noopener">Commission électorale centrale</a> (中央選舉委員會, non officiels jusqu'à la proclamation des élus), lus par le site toutes les 45 secondes, ou toutes les 5 minutes par une copie de secours ;
    candidatures : Agence centrale de presse (CNA) et Focus Taiwan, 4 et 7 septembre 2026 ; résultats de 2022 : base de données électorale de la CEC (db.cec.gov.tw) ;
    population : ministère de l'Intérieur, registre des ménages, ${esc(popMois())} ; sondages : maisons de sondage et médias (lien sur chaque ligne), compilation de Wikipédia en chinois ;
    carte : limites des municipalités et des comtés du Centre national de cartographie (內政部國土測繪中心), contours simplifiés, <a href="https://data.gov.tw/license" target="_blank" rel="noopener">Licence de données ouvertes du gouvernement de Taïwan 1.0</a>. Cette page est temporaire.`;
}
let POP_MOIS = "";
const popMois = () => { const m = /^(\d{3})(\d{2})$/.exec(POP_MOIS); return m ? `${["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][+m[2] - 1]} ${+m[1] + 1911}` : "2026"; };

function dessiner() { dessinerEtat(); dessinerSieges(); dessinerCarte(); dessinerPanneau(); dessinerSuivi(); }
function choisir(code, defiler = true) {
  sel = code; dessinerCarte(); dessinerPanneau();
  if (plein()) info(true);
  else if (defiler && innerWidth <= 900) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function demarrer() {
  try {
    const [geo, courses, sond] = await Promise.all([
      fetch("en-direct/taiwan/municipalites.json", { cache: "no-cache" }).then(r => r.json()),
      fetch("en-direct/taiwan/courses.json", { cache: "no-cache" }).then(r => r.json()),
      fetch("en-direct/taiwan/sondages.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    GEO = geo; COURSES = courses.courses; POP_MOIS = courses.popMois || ""; SONDAGES = sond.courses || {}; NOTE_SOND = sond.note || "";
    // contours dans le sens attendu par d3 (sinon un polygone couvre toute la sphère)
    for (const f of GEO.features) if (d3.geoArea(f) > 2 * Math.PI) { const rev = x => x.map(r => r.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
    GEO.features = GEO.features.filter(f => COURSES[f.properties.n]);
  } catch (e) { $("lvEtat").textContent = "Chargement impossible : " + e.message; return; }
  dessinerHeures(); dessinerTextes(); preparerCarte(); construireCarte();
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-suivre]"); if (s) { e.stopPropagation(); basculerSuivie(s.dataset.suivre); return; }
    const t = e.target.closest("[data-tri]"); if (t) { triClassement = t.dataset.tri; ecrireLS(localStorage, "twTri", triClassement); dessinerSuivi(); return; }
    const a = e.target.closest("[data-aller]"); if (a) { choisir(a.dataset.aller, false); $("lvCarte").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const l = e.target.closest(".lv-ligne, [data-choisir]"); if (l) choisir(l.dataset.rid || l.dataset.choisir);
  });
  document.addEventListener("keydown", e => {
    const l = e.target.closest?.(".lv-ligne, [data-choisir]");
    if (l && (e.key === "Enter" || e.key === " ") && e.target === l) { e.preventDefault(); choisir(l.dataset.rid || l.dataset.choisir, false); }
  });
  $("lvPPReplier").addEventListener("click", () => { const ouvert = $("lvPPSection").hasAttribute("data-ferme"); $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); });
  $("lvMaj").addEventListener("click", actualiser);
  dessiner();
  await actualiser();
  setInterval(() => { if (!document.hidden && Date.now() >= prochaine) actualiser(); afficherDecompte(); }, 1000);
  setInterval(dessinerHeures, 60000);
}
demarrer();
