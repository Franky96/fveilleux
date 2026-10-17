/* Page « En direct » (en-direct.html) : référendum en Alberta du 19 octobre 2026 (10 questions, résultats non contraignants).
   Reprend l'ancien direct de l'élection québécoise du 5 octobre 2026 (votes-quebec/live.js) : mêmes blocs, mêmes réglages
   (lecture chaque minute avec décompte, carte des circonscriptions avec zooms et plein écran, fiche, participation,
   circonscriptions suivies avec alertes, mode démo), avec des questions et leurs réponses à la place des partis.

   Données : api/alberta.php (relais des pages de résultats d'Élections Alberta, cache 45 s : le navigateur ne peut pas les lire
   lui-même, pas d'en-tête CORS) ; à défaut, en-direct/resultats.json (copie du pipeline GitHub, toutes les 5 minutes le soir du
   vote, en-direct/outils/alberta.py). Les deux rendent les pages brutes (texte et tableaux) ; on les interprète ici.
   Carte : en-direct/circonscriptions.json (87 circonscriptions de 2017, Elections Alberta, Licence du gouvernement ouvert – Alberta).
   Démo (admin) : en-direct.html?demo=40 → résultats FICTIFS (en-direct/demo.json) à environ 40 % des sections dépouillées. */

const RAFRAICHIR = 60;                                       // secondes entre deux lectures
const NB = 87;
const OUVERTURE = new Date("2026-10-19T09:00:00-06:00"), FERMETURE = new Date("2026-10-19T20:00:00-06:00");   // heure avancée des Rocheuses
const FIN_DEPOUILLEMENT = new Date("2026-10-21T20:00:00-06:00"), OFFICIELS = new Date("2026-10-29T10:00:00-06:00");
const SITE_RES = "https://officialresults.elections.ab.ca/";
const SERRE = 5;                                             // lutte serrée : moins de 5 points d'écart

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };
const region = n => n <= 26 ? "Calgary" : n <= 46 ? "Edmonton" : "Reste de l'Alberta";

/* ---------- les 10 questions (ordre des bulletins et du dépouillement : la 10 d'abord) ----------
   Libellés officiels en anglais (décrets 109/2026, 110/2026 et 160/2026, elections.ab.ca) ; aucune version française officielle
   n'a été publiée : la traduction est celle du site, fidèle mais non officielle. */
const ORDRE = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const OUI_NON = [{ court: "Oui", en: "Yes" }, { court: "Non", en: "No" }];
const Q = {
  10: { court: "Séparation", titre: "Rester au Canada ou lancer le processus de séparation", decret: "décret 160/2026",
    fr: "L'Alberta devrait-elle demeurer une province du Canada, ou le gouvernement de l'Alberta devrait-il entamer le processus juridique exigé par la Constitution canadienne pour tenir un référendum provincial contraignant sur la séparation ou non de l'Alberta du Canada ?",
    en: "Should Alberta remain a province of Canada, or should the Government of Alberta commence the legal process required under the Canadian Constitution to hold a binding provincial referendum on whether or not Alberta should separate from Canada?",
    rep: [{ court: "Rester au Canada", long: "Option 1 : l'Alberta devrait demeurer une province du Canada.", en: "Option 1: Alberta should remain a province of Canada." },
          { court: "Processus de séparation", long: "Option 2 : le gouvernement de l'Alberta devrait entamer le processus juridique exigé par la Constitution canadienne pour tenir un référendum provincial contraignant sur la séparation ou non de l'Alberta du Canada.",
            en: "Option 2: The Government of Alberta should commence the legal process required under the Canadian Constitution to hold a binding provincial referendum on whether or not Alberta should separate from Canada." }],
    c: ["var(--ed-rester)", "var(--ed-sep)"], mots: /remain a province|separate from canada/i },
  1: { court: "Immigration", titre: "Contrôle accru de l'immigration", decret: "décret 110/2026",
    fr: "Appuyez-vous la prise d'un plus grand contrôle de l'immigration par le gouvernement de l'Alberta, afin de ramener l'immigration à des niveaux plus soutenables, de donner la priorité à l'immigration économique et d'accorder aux Albertains la priorité pour les nouveaux emplois ?",
    en: "Do you support the Government of Alberta taking increased control over immigration for the purposes of decreasing immigration to more sustainable levels, prioritizing economic migration and giving Albertans first priority on new employment opportunities?",
    mots: /increased control over immigration/i, sond: [65, 26, 10] },
  2: { court: "Programmes publics", titre: "Programmes provinciaux réservés selon le statut d'immigration", decret: "décret 110/2026",
    fr: "Appuyez-vous l'adoption par le gouvernement de l'Alberta d'une loi prévoyant que seuls les citoyens canadiens, les résidents permanents et les personnes ayant un statut d'immigration approuvé par l'Alberta seront admissibles aux programmes financés par la province, comme les soins de santé, l'éducation et les autres services sociaux ?",
    en: "Do you support the Government of Alberta introducing a law mandating that only Canadian citizens, permanent residents and individuals with an Alberta-approved immigration status will be eligible for provincially-funded programs, such as health care, education and other social services?",
    mots: /alberta.?approved immigration status/i, sond: [58, 32, 10] },
  3: { court: "Délai de 12 mois", titre: "Résidence de 12 mois avant l'aide sociale (statut temporaire)", decret: "décret 110/2026",
    fr: "En supposant que tous les citoyens canadiens et résidents permanents continuent d'être admissibles aux programmes de soutien social comme aujourd'hui, appuyez-vous l'adoption par le gouvernement de l'Alberta d'une loi obligeant toute personne ayant un statut d'immigration légal non permanent à résider en Alberta pendant au moins 12 mois avant d'être admissible à un programme de soutien social financé par la province ?",
    en: "Assuming that all Canadian citizens and permanent residents continue to qualify for social support programs as they do now, do you support the Government of Alberta introducing a law requiring all individuals with a non-permanent legal immigration status to reside in Alberta for at least 12 months before qualifying for any provincially-funded social support programs?",
    mots: /at least 12 months/i, sond: [60, 26, 14] },
  4: { court: "Frais santé et éducation", titre: "Frais pour la santé et l'éducation (statut temporaire)", decret: "décret 110/2026",
    fr: "En supposant que tous les citoyens canadiens et résidents permanents continuent d'avoir accès aux soins de santé et à l'éducation publics comme aujourd'hui, appuyez-vous l'imposition par le gouvernement de l'Alberta de frais ou d'une prime raisonnables aux personnes ayant un statut d'immigration non permanent vivant en Alberta, pour leur utilisation et celle de leur famille des systèmes de santé et d'éducation ?",
    en: "Assuming that all Canadian citizens and permanent residents continue to qualify for public health care and education as they do now, do you support the Government of Alberta charging a reasonable fee or premium to individuals with a non-permanent immigration status living in Alberta for their and their family's use of the healthcare and education systems?",
    mots: /reasonable fee or premium/i, sond: [60, 28, 13] },
  5: { court: "Preuve de citoyenneté", titre: "Preuve de citoyenneté pour voter", decret: "décret 110/2026",
    fr: "Appuyez-vous l'adoption par le gouvernement de l'Alberta d'une loi obligeant les électeurs à fournir une preuve de citoyenneté, comme un passeport, un certificat de naissance ou une carte de citoyenneté, pour voter à une élection provinciale en Alberta ?",
    en: "Do you support the Government of Alberta introducing a law requiring individuals to provide proof of citizenship, such as a passport, birth certificate or citizenship card, to vote in an Alberta provincial election?",
    mots: /proof of citizenship/i, sond: [66, 24, 9] },
  6: { court: "Choix des juges", titre: "Juges des cours supérieures choisis par les provinces", decret: "décret 109/2026 (question constitutionnelle)",
    fr: "Appuyez-vous le gouvernement de l'Alberta dans une démarche, avec les gouvernements d'autres provinces volontaires, visant à modifier la Constitution canadienne pour que ce soient les gouvernements provinciaux, et non le gouvernement fédéral, qui choisissent les juges nommés à la Cour du Banc du Roi et à la Cour d'appel des provinces ?",
    en: "Do you support the Government of Alberta working with the governments of other willing provinces to amend the Canadian Constitution to have provincial governments, and not the federal government, select the justices appointed to provincial King's Bench and Appeal courts?",
    mots: /king.s bench/i, sond: [45, 31, 23] },
  7: { court: "Abolition du Sénat", titre: "Abolition du Sénat fédéral non élu", decret: "décret 109/2026 (question constitutionnelle)",
    fr: "Appuyez-vous le gouvernement de l'Alberta dans une démarche, avec les gouvernements d'autres provinces volontaires, visant à modifier la Constitution canadienne pour abolir le Sénat fédéral non élu ?",
    en: "Do you support the Government of Alberta working with the governments of other willing provinces to amend the Canadian Constitution to abolish the unelected federal Senate?",
    mots: /abolish the unelected federal senate/i, sond: [39, 33, 28] },
  8: { court: "Retrait des programmes fédéraux", titre: "Retrait des programmes fédéraux avec pleine compensation", decret: "décret 109/2026 (question constitutionnelle)",
    fr: "Appuyez-vous le gouvernement de l'Alberta dans une démarche, avec les gouvernements d'autres provinces volontaires, visant à modifier la Constitution canadienne pour permettre aux provinces de se retirer des programmes fédéraux qui empiètent sur les compétences provinciales, comme la santé, l'éducation et les services sociaux, sans qu'une province perde le financement fédéral qui s'y rattache pour ses propres programmes sociaux ?",
    en: "Do you support the Government of Alberta working with the governments of other willing provinces to amend the Canadian Constitution to allow provinces to opt out of federal programs that intrude on provincial jurisdiction such as health care, education, and social services, without a province losing any of the associated federal funding for use in its social programs?",
    mots: /opt out of federal programs/i, sond: [41, 40, 18] },
  9: { court: "Primauté des lois provinciales", titre: "Priorité des lois provinciales sur les lois fédérales", decret: "décret 109/2026 (question constitutionnelle)",
    fr: "Appuyez-vous le gouvernement de l'Alberta dans une démarche, avec les gouvernements d'autres provinces volontaires, visant à modifier la Constitution canadienne pour mieux protéger les droits des provinces contre l'ingérence fédérale, en donnant priorité aux lois d'une province portant sur des compétences provinciales ou partagées lorsqu'elles entrent en conflit avec des lois fédérales ?",
    en: "Do you support the Government of Alberta working with the governments of other willing provinces to amend the Canadian Constitution to better protect provincial rights from federal interference by giving a province's laws dealing with provincial or shared areas of constitutional jurisdiction priority over federal laws when the province's laws and federal laws conflict?",
    mots: /better protect provincial rights/i, sond: [46, 33, 20] },
};
for (let k = 1; k <= 9; k++) Object.assign(Q[k], { rep: OUI_NON, c: ["var(--ed-oui)", "var(--ed-non)"] });

// sondages sur la question 10 (rester / lancer le processus / indécis), du plus récent au plus ancien
// compilation de Wikipédia (« 2026 Alberta independence referendum »), d'après les publications des sondeurs
const SONDAGES = [
  { s: "Léger", d: "2–4 oct. 2026", r: 70, p: 22, i: 7, n: 1001, m: "en ligne" },
  { s: "Ipsos", d: "18–22 sept. 2026", r: 70, p: 20, i: 10, n: 600, m: "en ligne" },
  { s: "Janet Brown (CBC)", d: "8–21 sept. 2026", r: 72, p: 23, i: 4, n: 1200, m: "téléphone et en ligne" },
  { s: "Abacus Data", d: "4–7 sept. 2026", r: 64, p: 24, i: 9, n: 1000, m: "en ligne" },
  { s: "Research Co.", d: "24–26 août 2026", r: 74, p: 22, i: 4, n: 750, m: "en ligne" },
  { s: "Léger", d: "21–23 août 2026", r: 65, p: 23, i: 10, n: 1001, m: "en ligne" },
  { s: "Angus Reid", d: "10–13 août 2026", r: 61, p: 33, i: 5, n: 1017, m: "en ligne" },
  { s: "Pollara", d: "19 juin–2 juil. 2026", r: 70, p: 23, i: 7, n: 1007, m: "en ligne" },
  { s: "Spark", d: "7–12 juin 2026", r: 65, p: 21, i: 9, n: 777, m: "en ligne" },
  { s: "Léger", d: "29 mai–1er juin 2026", r: 68, p: 24, i: 8, n: 1014, m: "en ligne" },
  { s: "Ipsos", d: "28 mai–1er juin 2026", r: 72, p: 19, i: 10, n: 600, m: "en ligne" },
  { s: "Angus Reid", d: "22–24 mai 2026", r: 60, p: 35, i: 5, n: 800, m: "en ligne" },
];

/* ---------- état ---------- */
let GEO = null, PAR_NUM = {}, PAR_NOM = {}, RES = null, brut = null;
let q = ORDRE.includes(lireLS(localStorage, "edQuestion", 10)) ? lireLS(localStorage, "edQuestion", 10) : 10;
let sel = null, carteMarge = false, carteParticip = false, demarre = false, prochaine = 0;
const PARAMS = new URLSearchParams(location.search);
const DEMO = sessionStorage.getItem("userRole") === "admin" && PARAMS.has("demo") ? Math.max(0, Math.min(100, +PARAMS.get("demo") || 40)) : null;

/* ---------- lecture des pages brutes d'Élections Alberta ---------- */
// premier nombre entier d'une cellule (« 642,501 61.7% » → 642501) ; nombre décimal (« 35.9 ») ; « 12 of 71 » → [12, 71]
const ent = s => { const m = String(s ?? "").replace(/ /g, " ").match(/(?:^|\s)(\d{1,3}(?:[,\s]\d{3})+|\d+)(?![\d.%])/); return m ? +m[1].replace(/[,\s]/g, "") : null; };
const dec = s => { const m = String(s ?? "").match(/\d+(?:[.,]\d+)?/); return m ? +m[0].replace(",", ".") : null; };
const surX = s => { const m = String(s ?? "").match(/(\d[\d,\s]*?)\s*(?:of|\/|de|sur)\s*(\d[\d,\s]*)/i); return m ? [+m[1].replace(/[,\s]/g, ""), +m[2].replace(/[,\s]/g, "")] : null; };

// numéro de la question d'une page : en-tête Option 1/Option 2 → 10 ; sinon mots du libellé ; sinon « Question N » unique ; sinon l'événement
function questionDe(p, evt) {
  const entetes = (p.tables || []).flatMap(t => t.slice(0, 6).flat()).join(" ").toLowerCase();
  if (/option\s*1|remain/.test(entetes) && /option\s*2|commence|separat/.test(entetes)) return 10;
  const txt = `${p.titre || ""} ${p.texte || ""}`;
  const parMots = ORDRE.filter(k => Q[k].mots.test(txt));
  if (parMots.length === 1) return parMots[0];
  const nums = [...new Set([...txt.matchAll(/question\s*(?:no\.?|number|#)?\s*(\d{1,2})\b/gi)].map(m => +m[1]).filter(n => n >= 1 && n <= 10))];
  if (nums.length === 1) return nums[0];
  const k = evt - 202600;
  return k >= 1 && k <= 10 ? k : null;
}

// un tableau de résultats : une ligne d'en-tête avec une colonne par réponse, puis une ligne par circonscription (et le total)
function lireTable(t) {
  for (let h = 0; h < Math.min(6, t.length); h++) {
    const H = t[h].map(c => String(c).toLowerCase().trim());
    const iA = H.findIndex(c => /^(yes|oui)\b|option\s*1\b|remain|rester/.test(c));
    const iB = H.findIndex(c => /^(no|non)\b|option\s*2\b|commence|s[eé]par/.test(c));
    if (iA < 0 || iB < 0 || iA === iB) continue;
    const col = re => H.findIndex(c => re.test(c));
    const iNum = col(/^(ed|no\.?|#|ed\s*(no\.?|number|#)|electoral division (no\.?|number)|n[o°]\.?)$/);
    const iNom = col(/name|nom|jurisdiction|division|circonscription/);
    const iSecR = col(/reported|complete|counted|d[eé]pouill|rempli/);
    const iSecT = H.findIndex((c, i) => i !== iSecR && /location|poll|station|section|bureau/.test(c) && !/reported|complete|counted|d[eé]pouill/.test(c));
    const iPart = col(/turnout|participation/);
    const iVot = H.findIndex(c => /electors who voted|ballots cast|total ballots|votants|ont vot/.test(c) && !/turnout/.test(c));
    const iIns = col(/names on list|registered|inscrit|electors on list|list of electors/);
    const iRej = H.map((c, i) => /reject|declin|spoil|blank|rejet/.test(c) ? i : -1).filter((i, k, a) => i >= 0 && a.indexOf(i) === k)
      .filter((i, k, a) => k === 0 || H[i] !== H[a[k - 1]]);           // colspan répété : une seule fois
    const lire = row => {
      const r = { a: ent(row[iA]) || 0, b: ent(row[iB]) || 0, rej: iRej.reduce((s, i) => s + (ent(row[i]) || 0), 0),
        vot: iVot >= 0 ? ent(row[iVot]) : null, ins: iIns >= 0 ? ent(row[iIns]) : null, part: iPart >= 0 ? dec(row[iPart]) : null, sec: [null, null] };
      const x = (iSecR >= 0 && surX(row[iSecR])) || (iSecT >= 0 && surX(row[iSecT]));
      if (x) r.sec = x;
      else if (iSecR >= 0 && iSecT >= 0) r.sec = [ent(row[iSecR]), ent(row[iSecT])];
      else if (iSecR >= 0) r.sec = [ent(row[iSecR]), null];
      else if (iSecT >= 0) r.sec = [null, ent(row[iSecT])];
      return r;
    };
    const circ = {}; let prov = null;
    for (const row of t.slice(h + 1)) {
      let n = iNum >= 0 ? ent(row[iNum]) : null;
      if (!(n >= 1 && n <= NB) || (iNom >= 0 && PAR_NOM[norm(row[iNom])] && PAR_NOM[norm(row[iNom])] !== n)) {
        n = PAR_NOM[norm(row[iNom >= 0 ? iNom : 0])] || PAR_NOM[norm(row[1] || "")] || null;
      }
      if (n) { circ[n] = lire(row); continue; }
      if (!prov && /total|province|provincial|alberta/i.test(row.slice(0, Math.max(1, Math.min(iA, 3))).join(" "))) prov = lire(row);
    }
    if (!Object.keys(circ).length && !prov) continue;
    return { circ, prov, cols: { secR: iSecR >= 0, secT: iSecT >= 0 } };
  }
  return null;
}

function lirePage(p, evt) {
  const k = questionDe(p, evt);
  if (!k) return null;
  for (const t of p.tables || []) {
    const r = lireTable(t);
    if (!r) continue;
    // circonscriptions : fraction dépouillée, résultat final ; total : ligne de la province, sinon la somme
    const S = { a: 0, b: 0, rej: 0, vot: 0, ins: 0, f: 0, t: 0, nf: 0, nt: 0 };
    for (const c of Object.values(r.circ)) {
      c.frac = c.sec[0] != null && c.sec[1] ? Math.min(1, c.sec[0] / c.sec[1]) : null;
      c.final = c.frac === 1;                                  // avancement non publié : ni pâli, ni « terminé »
      for (const x of ["a", "b", "rej"]) S[x] += c[x];
      S.vot += c.vot || 0; S.ins += c.ins || 0;
      if (c.sec[0] != null) { S.f += c.sec[0]; S.nf++; } if (c.sec[1] != null) { S.t += c.sec[1]; S.nt++; }
    }
    const P = r.prov || {};
    const tot = { a: P.a || S.a, b: P.b || S.b, rej: P.rej || S.rej, vot: P.vot || S.vot || null, ins: P.ins || S.ins || null,
      sec: [P.sec?.[0] ?? (S.nf ? S.f : null), P.sec?.[1] ?? (S.nt ? S.t : null)], part: P.part ?? null };
    if (tot.part == null && tot.vot && tot.ins) tot.part = 100 * tot.vot / tot.ins;
    return { q: k, circ: r.circ, tot };
  }
  return { q: k, inconnu: true };
}

function normaliser(d) {
  const out = { maj: d.maj ? new Date(d.maj) : null, demo: !!d.demo, via: d.via, questions: {}, publiees: 0, inconnues: 0 };
  for (const [evt, p] of Object.entries(d.pages || {})) {
    if (p.statut !== 200) continue;
    const r = lirePage(p, +evt);
    if (!r || out.questions[r.q]) continue;
    out.questions[r.q] = r; out.publiees++; if (r.inconnu) out.inconnues++;
  }
  return out;
}

// démo : les résultats fictifs complets ramenés à p % des sections (variable d'une circonscription à l'autre ;
// la question 10 est dépouillée d'abord, puis les questions 1 à 9 dans l'ordre)
const alea = k => ((Math.imul(k + 1, 2654435761) >>> 0) % 1000) / 1000;
function demoPartielle(R, p) {
  for (const [k, D] of Object.entries(R.questions)) {
    if (D.inconnu) continue;
    const o = ORDRE.indexOf(+k), S = { a: 0, b: 0, rej: 0, vot: 0, f: 0, t: 0, ins: 0 }, part0 = D.tot?.part;
    for (const [n, c] of Object.entries(D.circ)) {
      const base = Math.min(1, p / 100 * (0.4 + 1.2 * alea(+n)));
      const f = p >= 100 ? 1 : Math.max(0, Math.min(1, base * 1.15 - 0.07 * o));
      const t = c.sec[1] || 100, g = (x, j) => Math.round(x * f * (f >= 1 ? 1 : 0.9 + 0.2 * alea(+n * 31 + j)));
      Object.assign(c, { a: g(c.a, o), b: g(c.b, o + 11), rej: Math.round(c.rej * f), vot: Math.round((c.vot || 0) * f),
        part: c.part != null ? c.part * f : null, sec: [Math.round(t * f), t] });
      c.frac = c.sec[0] / t; c.final = c.frac >= 1;
      for (const x of ["a", "b", "rej", "vot"]) S[x] += c[x];
      S.f += c.sec[0]; S.t += t; S.ins += c.ins || 0;
    }
    D.tot = { a: S.a, b: S.b, rej: S.rej, vot: S.vot, ins: S.ins || null, sec: [S.f, S.t], part: S.ins ? 100 * S.vot / S.ins : part0 != null ? part0 * S.f / S.t : null };
  }
  return R;
}

/* ---------- lecture ---------- */
async function lireRelais() {
  const r = await fetch("api/alberta.php?type=resultats", { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { const d = await r.json(); return d && d.pages ? d : null; } catch { return null; }   // pas de PHP (serveur local) : copie du pipeline
}
async function lireCopie() {
  const r = await fetch("en-direct/resultats.json", { cache: "no-cache" });
  return r.ok ? r.json() : null;
}
async function lire() {
  if (DEMO !== null) { const r = await fetch("en-direct/demo.json", { cache: "no-cache" }); return { ...(await r.json()), via: "demo" }; }
  let relais = null, copie = null;
  try { relais = await lireRelais(); } catch (e) { if (/Session/.test(e.message)) throw e; }
  if (!relais?.disponible) copie = await lireCopie().catch(() => null);
  // la source qui a des résultats ; à défaut, celle qui a répondu (« pas encore publié »)
  if (relais?.disponible) return { ...relais, via: "relais" };
  if (copie?.disponible) return { ...copie, via: "copie" };
  return relais ? { ...relais, via: "relais" } : copie ? { ...copie, via: "copie" } : null;
}

async function actualiser() {
  prochaine = Date.now() + RAFRAICHIR * 1000;
  $("lvEtat").textContent = "Mise à jour…";
  try {
    brut = await lire();
    RES = brut ? normaliser(brut) : null;
    if (RES && DEMO !== null) demoPartielle(RES, DEMO);
    surveiller(); dessiner();
  } catch (e) { $("lvEtat").textContent = e.message; }
}
function afficherDecompte() {
  const reste = Math.max(0, Math.ceil((prochaine - Date.now()) / 1000));
  $("lvDecompte").textContent = document.hidden ? "en pause" : reste + " s";
  $("lvMaj").style.setProperty("--fait", (1 - reste / RAFRAICHIR).toFixed(3));
  $("lvMaj").title = `Lecture automatique toutes les ${RAFRAICHIR} s · prochaine dans ${reste} s`;
}

/* ---------- accès aux résultats ---------- */
const D = k => RES?.questions?.[k] && !RES.questions[k].inconnu ? RES.questions[k] : null;
const aRes = c => !!c && (c.a + c.b) > 0;
const pct = (c, i) => { const t = c.a + c.b; return t ? 100 * (i ? c.b : c.a) / t : 0; };
const tete = c => c.a >= c.b ? 0 : 1;
const marge = c => pct(c, 0) - pct(c, 1);
const nomRep = (k, i) => Q[k].rep[i].court;
const coul = (k, i) => Q[k].c[i];
const enCirc = (k, n) => D(k)?.circ?.[n] || null;
const auMoinsUn = () => ORDRE.some(k => D(k) && aRes(D(k).tot));
const fracT = t => t?.sec?.[0] != null && t.sec[1] ? Math.min(1, t.sec[0] / t.sec[1]) : null;   // fraction des sections dépouillées (null : non publiée)
const fracTxt = c => c.frac == null ? (c.final ? "final" : "") : c.final ? "final" : nf(100 * c.frac, 0) + " % sect.";

/* ---------- interface : état, compte à rebours ---------- */
function dessinerEtat() {
  const b = $("lvBanniere"), maintenant = new Date();
  const ferme = maintenant >= FERMETURE;
  $("edAvant").hidden = ferme && DEMO === null || DEMO !== null;
  const lien = `<a href="${SITE_RES}" target="_blank" rel="noopener">site des résultats d'Élections Alberta</a>`;
  b.hidden = false;
  if (DEMO !== null) b.innerHTML = `<b>Démo : résultats fictifs</b>, inventés pour tester la page (environ ${DEMO} % des sections dépouillées). Ils ne disent rien du vrai résultat. Retire « ?demo » de l'adresse pour revenir au direct.`;
  else if (RES?.inconnues && !auMoinsUn()) b.innerHTML = `Élections Alberta publie des résultats, mais leur présentation n'a pas pu être lue ici. En attendant une correction, voir le ${lien}.`;
  else if (!auMoinsUn()) b.innerHTML = ferme
    ? `<b>Bureaux fermés</b> : en attente des premiers résultats d'Élections Alberta (vérification chaque minute). Le dépouillement se fait à la main, la question 10 d'abord, et peut durer jusqu'à 48 heures.`
    : `Les résultats non officiels s'afficheront ici après la fermeture des bureaux, le <b>lundi 19 octobre à 20 h, heure de l'Alberta (22 h, heure du Québec)</b>, au fil du dépouillement : la question 10 d'abord, puis les questions 1 à 9. En attendant : les questions, les sondages et comment voter, plus bas.`;
  else b.hidden = true;
  const st = D(q)?.tot;
  const maj = RES?.maj && !isNaN(RES.maj) ? RES.maj : null;
  if (!RES) { $("lvEtat").textContent = "Résultats indisponibles pour le moment · nouvel essai chaque minute"; return; }
  if (!auMoinsUn()) { $("lvEtat").innerHTML = `En attente des premiers résultats · vérification chaque minute${maj ? ` · Élections Alberta consulté à ${heureQc(maj)} (heure du Québec)` : ""}`; return; }
  $("lvEtat").innerHTML = [
    DEMO !== null ? "<b>Démo · chiffres fictifs</b>" : "<b>Résultats non officiels</b>",
    `${RES.publiees - RES.inconnues} question${RES.publiees - RES.inconnues > 1 ? "s" : ""} sur 10 en dépouillement`,
    fracT(st) != null ? `question ${q} : sections ${nf(st.sec[0])} / ${nf(st.sec[1])} (${nf(100 * fracT(st), 1)} %)` : "",
    maj ? `lu à ${heureQc(maj)} (heure du Québec)${RES.via === "copie" ? " · copie du pipeline" : ""}` : "",
  ].filter(Boolean).join(" · ");
}

const deux = n => String(n).padStart(2, "0");
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date(), cible = m < OUVERTURE ? OUVERTURE : FERMETURE, ms = Math.max(0, cible - m);
  const j = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  $("edCompte").innerHTML = `<span class="lv-eyebrow">${m < OUVERTURE ? "Ouverture des bureaux" : "Fermeture des bureaux"}</span>
    <h3>${m < OUVERTURE ? "Les bureaux ouvrent dans" : "Les bureaux ferment dans"}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${[[j, "jour" + (j > 1 ? "s" : "")], [deux(h), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>${m < OUVERTURE ? "Lundi 19 octobre à <b>9 h, heure de l'Alberta</b> (11 h, heure du Québec)." : "Lundi 19 octobre à <b>20 h, heure de l'Alberta</b> (22 h, heure du Québec)."} L'Alberta a deux heures de moins que le Québec.</p>`;
}
function dessinerHeures() {
  const m = new Date();
  const L = [
    ["Vote par anticipation", "Du mardi 13 au samedi 17 octobre, de 9 h à 20 h", "11 h à 22 h, heure du Québec · dans n'importe quel bureau d'anticipation de sa circonscription", new Date("2026-10-17T20:00:00-06:00")],
    ["Jour du vote", "Lundi 19 octobre, de 9 h à 20 h (heure de l'Alberta)", "De 11 h à 22 h, heure du Québec · au bureau de vote assigné", FERMETURE],
    ["Dépouillement", "Dès la fermeture, à 20 h (22 h au Québec)", "Les votes par anticipation et par correspondance sont comptés dès 17 h (19 h au Québec), mais rien n'est publié avant la fermeture. Comptage à la main, la question 10 d'abord.", FERMETURE],
    ["Fin du dépouillement non officiel", "Au plus tard le mercredi 21 octobre, 20 h", "48 heures après la fermeture (règle pour 7 questions ou plus) · 22 h, heure du Québec", FIN_DEPOUILLEMENT],
    ["Résultats officiels", "Jeudi 29 octobre, 10 h (heure de l'Alberta)", "Midi, heure du Québec · après vérification par les directeurs du scrutin", OFFICIELS],
  ];
  $("edHeures").innerHTML = L.map(([t, a, b, fin]) => `<li class="${m > fin ? "ed-passe" : ""}"><b>${t}</b><span>${a}<small>${b}</small></span></li>`).join("");
}

/* ---------- choix de la question et résultat de l'Alberta ---------- */
function dessinerChoix() {
  $("edChoix").innerHTML = ORDRE.map(k => {
    const d = D(k), t = d?.tot, ok = t && aRes(t), i = ok ? tete(t) : 0;
    const etat = !RES?.questions?.[k] ? (auMoinsUn() ? "pas encore" : "en attente") : RES.questions[k].inconnu ? "format illisible"
      : ok ? `${k === 10 ? (i ? "Séparation" : "Rester") : nomRep(k, i)} ${nf(pct(t, i), 0)} %${fracT(t) != null ? ` · ${nf(100 * fracT(t), 0)} % sect.` : ""}` : "0 vote";
    return `<button type="button" data-q="${k}" aria-pressed="${k === q}" style="${ok ? `--c:${coul(k, i)}` : ""}" title="Question ${k} : ${esc(Q[k].titre)}">Q${k} · ${esc(Q[k].court)}<small>${esc(etat)}</small></button>`;
  }).join("");
}
function dessinerProvince() {
  const d = D(q), t = d?.tot, ok = t && aRes(t), Qk = Q[q];
  $("edProvSur").textContent = `Question ${q} · ${Qk.decret} · ensemble de l'Alberta`;
  $("edQTexte").innerHTML = `${esc(Qk.fr)}<small>Traduction non officielle ; libellé officiel en anglais plus bas.</small>`;
  const fini = ok && fracT(t) === 1;
  $("lvSiegesTitre").textContent = !ok ? `${Qk.titre} · en attente des premiers résultats`
    : fini ? `${nomRep(q, tete(t))} l'emporte : ${nf(pct(t, tete(t)), 1)} % (dépouillement terminé)` : `${nomRep(q, tete(t))} en tête : ${nf(pct(t, tete(t)), 1)} %`;
  $("lvBarre").innerHTML = ok ? [0, 1].map(i => `<span class="lv-seg" style="width:${pct(t, i)}%;--c:${coul(q, i)}" title="${esc(nomRep(q, i))} : ${nf(pct(t, i), 1)} % (${nf(i ? t.b : t.a)} voix)"><i class="lv-elus" style="width:100%"></i><b>${esc(nomRep(q, i))} ${nf(pct(t, i), 1)} %</b></span>`).join("") : "";
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {        // étiquette selon la place : « Oui 62,4 % », sinon « 62,4 % », sinon rien
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").slice(-2).join(" ");
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  // sondage avant le vote (pour comparer) : moyenne des 5 derniers pour la question 10, Research Co. (août) pour les autres
  const s5 = SONDAGES.slice(0, 5), moy = x => s5.reduce((s, p) => s + p[x], 0) / s5.length;
  const sond = q === 10 ? [moy("r"), moy("p")] : Qk.sond ? Qk.sond.slice(0, 2) : null;
  $("lvPartis").innerHTML = [0, 1].map(i => `<div class="lv-parti" style="--c:${coul(q, i)}"><i></i><span class="lv-pnom">${esc(nomRep(q, i))}</span>`
    + `<b>${ok ? nf(pct(t, i), 1) + " %" : "—"}</b><small>${ok ? `${nf(i ? t.b : t.a)} voix` : "aucun vote compté"}${sond ? ` · sondages : ${nf(sond[i], 0)} %` : ""}</small></div>`).join("");
  const kv = [];
  kv.push(fracT(t) != null ? [`${nf(t.sec[0])} / ${nf(t.sec[1])}`, `sections dépouillées (${nf(100 * fracT(t), 1)} %)`]
    : t?.sec?.[1] ? [nf(t.sec[1]), "sections de vote (avancement non publié)"] : ["—", "sections dépouillées"]);
  kv.push([t?.part != null ? nf(t.part, 1) + " %" : "—", "participation" + (t?.part != null && !fini ? " (partielle)" : "")]);
  kv.push([ok ? nf(t.a + t.b) : "—", t?.rej ? `votes valides · ${nf(t.rej)} rejetés` : "votes valides"]);
  $("edKv").innerHTML = kv.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  // par grande région (somme des circonscriptions) : Calgary (1–26), Edmonton (27–46), reste (47–87)
  if (ok && d.circ) {
    const R = {}; for (const [n, c] of Object.entries(d.circ)) { const r = region(+n); R[r] ||= { a: 0, b: 0, k: 0 }; R[r].a += c.a; R[r].b += c.b; if (aRes(c)) R[r].k++; }
    $("edRegions").innerHTML = ["Calgary", "Edmonton", "Reste de l'Alberta"].filter(r => R[r]).map(r => { const c = R[r], ok2 = aRes(c);
      return `<div><span><b>${r}</b><small>${ok2 ? `${esc(nomRep(q, 0))} ${nf(pct(c, 0), 1)} % · ${esc(nomRep(q, 1))} ${nf(pct(c, 1), 1)} %` : "aucun résultat"}</small></span>`
        + `<span class="ed-mini">${ok2 ? `<i style="width:${pct(c, 0)}%;background:${coul(q, 0)}"></i><i style="width:${pct(c, 1)}%;background:${coul(q, 1)}"></i>` : ""}</span></div>`; }).join("");
  } else $("edRegions").innerHTML = "";
  // version compacte pour le plein écran
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>Q${q} · ${esc(Qk.court)}</b><span>${ok ? (fracT(t) != null ? `${nf(100 * fracT(t), 0)} % des sections` : "") : "en attente"}</span></div>`
    + `<div class="lv-bp-barre">${ok ? [0, 1].map(i => `<span style="width:${pct(t, i)}%;--c:${coul(q, i)}"><i style="width:100%"></i></span>`).join("") : ""}<em style="left:50%"></em></div>`
    + `<div class="lv-bp-partis">${ok ? [0, 1].map(i => `<span style="--c:${coul(q, i)}"><i></i>${esc(nomRep(q, i))} <b>${nf(pct(t, i), 1)} %</b></span>`).join("") : `<span>En attente des premiers résultats</span>`}</div>`;
}

/* ---------- participation ---------- */
const tauxParticip = n => { const c = enCirc(q, n) || enCirc(10, n); return c && c.part != null ? { v: c.part, final: !!c.final } : null; };
const aParticip = () => GEO && GEO.features.some(f => tauxParticip(f.properties.n));
const clarteParticip = v => Math.max(0, Math.min(1, (v - 10) / 80));     // noir jusqu'à 10 %, blanc à partir de 90 %
const couleurParticip = v => d3.interpolateLab("#000000", "#ffffff")(clarteParticip(v));
function dessinerParticip() {
  const t = (D(q) || D(10))?.tot, el = $("lvParticip"), ok = aParticip();
  $("lvCarteParticip").hidden = !ok;
  if (!ok && carteParticip) carteParticip = false;
  $("lvCarteParticip").setAttribute("aria-pressed", carteParticip); el.setAttribute("aria-pressed", carteParticip);
  if (!t || t.part == null) { el.hidden = true; return; }
  el.hidden = false;
  el.querySelector("b").textContent = nf(t.part, 1) + " %";
  el.querySelector("small").textContent = fracT(t) === 1 ? "Participation (non officielle)" : `Participation · ${fracT(t) != null ? nf(100 * fracT(t), 0) + " % des sections" : "non officielle"}`;
}

/* ---------- carte ---------- */
let svg, gZ, ZOOM, VUES = [], MW = 500, MH = 820, LARGE = null, zoomK = 1, tip, gSuiv, gSel, gPart;
function remplir(n) {
  if (carteParticip) { const t = tauxParticip(n); return t ? [couleurParticip(t.v), 1] : ["var(--soft)", 0.5]; }
  const c = enCirc(q, n);
  if (!aRes(c)) return ["var(--soft)", 1];
  const i = tete(c);
  if (carteMarge) return [coul(q, i), Math.max(0.2, Math.min(1, 0.2 + Math.abs(marge(c)) / 50))];   // 0 pt : pâle · 40 pts et plus : plein
  return [coul(q, i), c.final || c.frac == null ? 1 : 0.35 + 0.6 * c.frac];
}
function dessinerCarte() {
  if (!gZ) return;
  gZ.selectAll("path.lv-rid").each(function (f) { const [col, op] = remplir(f.properties.n); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null ? [] : VUES.flatMap(v => v.feats.filter(f => f.properties.n === sel).map(f => v.path(f)))).join("path").attr("class", "lv-selline").attr("d", d => d);
  dessinerContoursSuivis(); dessinerEtiquettesParticip(); dessinerLegende();
}
function dessinerLegende() {
  const L = $("edLegende");
  if (carteParticip) { L.innerHTML = `<span>Participation :</span><span class="vi-ramp" style="background:linear-gradient(90deg,#000 0 10%,#585858 40%,#dbdbdb 80%,#fff 90% 100%)"></span><span>10 % → 90 % et plus</span>`; return; }
  L.innerHTML = [0, 1].map(i => `<span class="ed-legende-k" style="--c:${coul(q, i)}"><i></i>${esc(nomRep(q, i))} en tête</span>`).join("")
    + `<span>${carteMarge ? "· couleur d'autant plus foncée que l'écart est grand (pleine à 40 points et plus)" : "· plus la couleur est pâle, moins il y a de sections dépouillées"} · gris : aucun résultat</span>`;
}
// pôle d'inaccessibilité (polylabel, Mapbox) : point le plus au cœur d'un polygone (étiquettes de participation)
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
  let h = size / 2; const file = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) file.push(cell(x + h, y + h, h));
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (file.length) {
    file.sort((a, b) => b.max - a.max); const c = file.shift();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2; file.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y, best.d];
}
let ancrages = null;
function ancrer() {
  if (ancrages) return ancrages;
  ancrages = VUES.flatMap(v => v.feats.map(f => {
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    let best = [0, 0, -1];
    for (const p of polys) { const c = polylabel(p.map(ring => ring.map(xy => v.proj(xy))), 0.3); if (c[2] > best[2]) best = c; }
    return { n: f.properties.n, cle: v.id + f.properties.n, x: best[0], y: best[1], r: best[2] };
  }));
  return ancrages;
}
function dessinerEtiquettesParticip() {
  if (!gPart) return;
  gPart.style("display", carteParticip ? null : "none");
  if (!carteParticip) return;
  const pts = ancrer().map(a => ({ ...a, t: tauxParticip(a.n) })).filter(a => a.t && a.r * zoomK >= 9);
  gPart.selectAll("text").data(pts, d => d.cle).join("text").attr("x", d => d.x).attr("y", d => d.y).attr("dy", "0.35em").attr("text-anchor", "middle")
    .style("font-size", (10 / zoomK) + "px").style("fill", d => clarteParticip(d.t.v) > 0.55 ? "#000" : "#fff").text(d => nf(d.t.v, 0) + " %");
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  b.setAttribute("aria-pressed", carteSuivis); b.style.setProperty("--c", "#B7860B"); b.textContent = carteSuivis ? `★ Suivies (${suivies.size})` : "★ Suivies";
  if (!gSuiv) return;
  const d = carteSuivis ? VUES.flatMap(v => v.feats.filter(f => suivies.has(f.properties.n)).map(f => ({ k: v.id + f.properties.n, d: v.path(f) }))) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, x => x.k).join("path").attr("class", "lv-suivi-halo").attr("d", x => x.d);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, x => x.k).join("path").attr("class", "lv-suivi-ligne").attr("d", x => x.d).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}

function infobulle(e, f) {
  const n = f.properties.n, c = enCirc(q, n);
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  const x = e.clientX - box.left + 12, y = e.clientY - box.top + 12;
  tip.style.left = Math.min(x, box.width - 230) + "px"; tip.style.top = Math.min(y, box.height - 90) + "px";
  const nom = `<b>${suivies.has(n) ? "★ " : ""}${esc(PAR_NUM[n])}</b>`;
  if (carteParticip) { const t = tauxParticip(n); tip.innerHTML = nom + (t ? `Participation : ${nf(t.v, 1)} %<br><small>${t.final ? "dépouillement terminé" : "partielle (sections dépouillées)"}</small>` : "<small>Pas de taux publié</small>"); return; }
  tip.innerHTML = nom + `<small>Question ${q} · ${esc(Q[q].court)}</small>` + (aRes(c)
    ? [0, 1].map(i => `<span class="ed-tip-l" style="--c:${coul(q, i)}"><span><i></i>${esc(nomRep(q, i))}</span><b>${nf(pct(c, i), 1)} %</b></span>`).join("") + `<small>${c.final ? "dépouillement terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % des sections dépouillées" : ""}</small>`
    : "<br><small>Aucun résultat</small>");
}

function construireCarte() {
  const el = $("lvCarte"), box = el.getBoundingClientRect();
  // une seule carte de l'Alberta, pas d'encarts : Calgary et Edmonton se voient en zoomant (boutons de zoom)
  void box;
  if (svg) return;
  LARGE = false; ancrages = null;
  MW = 500; MH = 820;
  const projDe = () => d3.geoConicConformal().rotate([115, 0]).parallels([50, 58]);
  const proj = projDe().fitExtent([[12, 12], [500 - 12, MH - 12]], GEO);
  VUES = [{ id: "ab", proj, path: d3.geoPath(proj), feats: GEO.features }];
  svg = d3.select(el).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove(); svg.on(".zoom", null);
  gZ = svg.append("g");
  for (const v of VUES) {
    gZ.append("g").selectAll("path").data(v.feats).join("path").attr("class", "lv-rid").attr("d", v.path)
      .attr("tabindex", v.id === "ab" ? 0 : -1).attr("role", "button").attr("aria-label", f => f.properties.nom)
      .on("click", (e, f) => choisir(f.properties.n))
      .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(f.properties.n); } })
      .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  }
  gSuiv = gZ.append("g"); gSel = gZ.append("g"); gPart = gZ.append("g").attr("class", "lv-ptxt");
  ZOOM = d3.zoom().scaleExtent([1, 40]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => {
    gZ.attr("transform", e.transform);
    if (carteParticip && Math.abs(e.transform.k - zoomK) > 1e-3) { zoomK = e.transform.k; dessinerEtiquettesParticip(); }
    zoomK = e.transform.k;
  });
  zoomK = 1;
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(40, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  const fc = (a, b) => ({ type: "FeatureCollection", features: GEO.features.filter(f => f.properties.n >= a && f.properties.n <= b) });
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (z === "cal" || z === "edm") vers(VUES[0].path.bounds(z === "cal" ? fc(1, 26) : fc(27, 46)));
  else if (z === "rd") vers(VUES[0].path.bounds(fc(78, 79)));
  else if (z === "leth") vers(VUES[0].path.bounds(fc(71, 72)));
  else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
  else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
}
function preparerCarte() {
  tip = $("lvTip");
  const carte = $("lvCarte").parentElement;
  // souris dans la carte : la molette zoome seulement, la page ne défile pas
  carte.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau")) e.preventDefault(); }, { passive: false });
  carte.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "plein") pleinEcran();
    else if (z === "marge" || z === "particip") basculer(z);
    else zoomer(z);
  });
  $("lvParticip").addEventListener("click", () => { basculer("particip"); if (innerWidth <= 900) $("lvCarte").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "edCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
  // « Info » (plein écran) : la fiche passe par-dessus la carte (d'office sur grand écran et au clic d'une circonscription)
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
  plein = () => !!ecran() || carte.classList.contains("lv-plein");
  const etatPlein = () => {
    const on = plein();
    $("lvPlein").setAttribute("aria-pressed", on);
    $("lvPlein").textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    if (on && !avant) info(innerWidth > 900);
    if (!on) info(false);
    avant = on;
    setTimeout(recaler, 60);
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
  let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(recaler, 200); });
}
let info = () => {}, plein = () => false;
function recaler() { const avant = LARGE; construireCarte(); if (LARGE !== avant) dessinerCarte(); }
// Écart / Participation : un seul à la fois, ou aucun
function basculer(z) {
  carteMarge = z === "marge" && !carteMarge;
  carteParticip = z === "particip" && !carteParticip;
  $("edMarge").setAttribute("aria-pressed", carteMarge);
  dessinerParticip(); dessinerCarte(); dessinerPanneau();
}

/* ---------- fiche (panneau de droite) ---------- */
function ligneQuestion(k, c, courante) {
  const ok = aRes(c), i = ok ? tete(c) : 0;
  return `<li><button type="button" data-q="${k}" aria-current="${courante}"><span class="ed-qn">Q${k}</span><span class="ed-qlab">${esc(Q[k].court)}</span>`
    + `<span class="ed-qv">${ok ? `${esc(nomRep(k, i))} ${nf(pct(c, i), 1)} %` : "—"}${ok && c.frac != null && !c.final ? ` <small>${nf(100 * c.frac, 0)} %</small>` : ""}</span>`
    + `<span class="ed-mini">${ok ? `<i style="width:${pct(c, 0)}%;background:${coul(k, 0)}"></i><i style="width:${pct(c, 1)}%;background:${coul(k, 1)}"></i>` : ""}</span></button></li>`;
}
function dessinerPanneau() {
  const p = $("lvPanneau");
  if (sel == null && carteParticip) {
    const t = (D(q) || D(10))?.tot, liste = GEO.features.map(f => [f.properties.n, tauxParticip(f.properties.n)]).filter(([, x]) => x).sort((a, b) => b[1].v - a[1].v);
    const ligne = ([n, x]) => `<li><span class="lv-pk" style="background:${couleurParticip(x.v)}"></span>${esc(PAR_NUM[n])}<b>${nf(x.v, 1)} %</b></li>`;
    p.innerHTML = `<span class="lv-eyebrow">Taux de participation</span><h3>${t?.part != null ? `${nf(t.part, 1)} % dans l'ensemble de l'Alberta` : "Pas encore de taux publié"}</h3>
      <p class="lv-muted">Taux publié avec les résultats non officiels ; il ne compte que les sections déjà dépouillées et deviendra final avec les résultats officiels (29 octobre).</p>
      <div class="lv-pgrad" role="img" aria-label="Dégradé : noir jusqu'à 10 %, blanc à partir de 90 %">${t?.part != null ? `<i style="left:${t.part}%"></i>` : ""}</div>
      <div class="lv-pechelle">${[10, 30, 50, 70, 90].map(v => `<span style="left:${v}%">${v} %</span>`).join("")}</div>`
      + (liste.length ? `<div class="lv-pcols"><div><span class="lv-eyebrow">Plus fortes</span><ol class="lv-plist">${liste.slice(0, 5).map(ligne).join("")}</ol></div>
        <div><span class="lv-eyebrow">Plus faibles</span><ol class="lv-plist">${liste.slice(-5).reverse().map(ligne).join("")}</ol></div></div>` : "");
    return;
  }
  if (sel == null) {
    const d = D(q), n = d ? Object.values(d.circ).filter(aRes).length : 0, fin = d ? Object.values(d.circ).filter(c => c.final).length : 0;
    p.innerHTML = `<span class="lv-eyebrow">Ensemble de l'Alberta · les 10 questions</span><h3>Clique sur une circonscription</h3>
      <p class="lv-muted">Couleur : réponse en tête à la question ${q}. Plus la couleur est pâle, moins il y a de sections dépouillées ; gris : aucun résultat.</p>
      <div class="lv-kv"><div><b>${n}</b><span>avec résultats</span></div><div><b>${fin}</b><span>dépouillement terminé</span></div><div><b>${NB - n}</b><span>sans résultat</span></div></div>
      <ul class="ed-qliste">${ORDRE.map(k => ligneQuestion(k, D(k)?.tot, k === q)).join("")}</ul>`;
    return;
  }
  const c = enCirc(q, sel), suiv = suivies.has(sel);
  p.innerHTML = `<span class="lv-eyebrow">${esc(region(sel))} · circonscription n<sup>o</sup> ${sel}</span><h3>${esc(PAR_NUM[sel])}</h3>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${sel}" style="--c:#C99A1E" aria-pressed="${suiv}">${suiv ? "★ Suivie" : "☆ Suivre"}</button></div>`
    + `<div class="lv-chips"><span class="lv-chip ${c?.final ? "fin" : ""}">${!c ? "Aucun résultat pour l'instant" : c.final ? "Dépouillement terminé (non officiel)" : c.frac != null ? `${nf(c.sec[0])} / ${nf(c.sec[1])} sections (${nf(100 * c.frac, 0)} %)` : "Dépouillement en cours"}</span>`
    + `${c?.part != null ? `<span class="lv-chip">Participation : ${nf(c.part, 1)} %</span>` : ""}</div>`
    + (aRes(c) ? `<p class="lv-tete" style="--c:${coul(q, tete(c))}"><b>${esc(nomRep(q, tete(c)))}</b> ${c.final ? "l'emporte" : "en tête"} à la question ${q}, par ${nf(Math.abs(c.a - c.b))} voix (${nf(Math.abs(marge(c)), 1)} pt)</p>`
      + `<table class="lv-cands"><tbody>${[0, 1].map(i => `<tr style="--c:${coul(q, i)}"><td><span class="lv-pt"></span></td><td><b>${esc(nomRep(q, i))}</b>${Q[q].rep[i].long ? `<small>${esc(Q[q].rep[i].long)}</small>` : ""}`
        + `<span class="lv-jauge"><i style="width:${pct(c, i)}%"></i></span></td><td class="lv-num"><b>${nf(pct(c, i), 1)} %</b><small>${nf(i ? c.b : c.a)}</small></td></tr>`).join("")}</tbody></table>` : "")
    + `<span class="lv-eyebrow">Les 10 questions dans ${esc(PAR_NUM[sel])}</span><ul class="ed-qliste">${ORDRE.map(k => ligneQuestion(k, enCirc(k, sel), k === q)).join("")}</ul>`
    + (c ? `<div class="lv-kv"><div><b>${c.vot != null ? nf(c.vot) : "—"}</b><span>électeurs ayant voté</span></div><div><b>${c.ins != null ? nf(c.ins) : "—"}</b><span>inscrits</span></div><div><b>${nf(c.rej)}</b><span>bulletins rejetés (Q${q})</span></div></div>` : "");
}

/* ---------- circonscriptions suivies (étoiles, alertes) et classement ---------- */
let suivies = new Set(lireLS(localStorage, "edSuivies", []).filter(n => n >= 1 && n <= NB));
let carteSuivis = lireLS(localStorage, "edCarteSuivies", false), suivisDetail = lireLS(localStorage, "edSuivisDetail", false);
let triClassement = lireLS(localStorage, "edTri", "serre");
const K_JOURNAL = DEMO !== null ? "edJournalDemo" : "edJournal", K_CONNUS = DEMO !== null ? "edConnusDemo" : "edConnus";
let journal = lireLS(sessionStorage, K_JOURNAL, []), connus = lireLS(sessionStorage, K_CONNUS, null);
/* invité → ce navigateur seulement ; compte connecté → serveur (api/suivis.php?ens=alberta), avec copie locale ;
   premier passage d'un appareil : union de ce qui est ici et sur le serveur, ensuite le serveur fait foi */
const COMPTE = !!sessionStorage.getItem("userRole") && sessionStorage.getItem("userRole") !== "guest";
const CLE_SYNC = "edSuiviesSync_" + (sessionStorage.getItem("userId") || sessionStorage.getItem("userName") || "compte");
let envoi = null, envoiEnCours = false;
const envoyerSuivies = () => { envoiEnCours = true;
  return fetch("api/suivis.php?ens=alberta", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suivis: { AB: [...suivies] } }) })
    .catch(() => {}).finally(() => { envoiEnCours = false; }); };
function sauverSuivies() {
  ecrireLS(localStorage, "edSuivies", [...suivies]);
  if (!COMPTE) return;
  clearTimeout(envoi); envoiEnCours = true; envoi = setTimeout(envoyerSuivies, 400);
}
async function chargerSuiviesServeur() {
  if (!COMPTE || envoiEnCours) return;
  try {
    const r = await fetch("api/suivis.php?ens=alberta", { credentials: "include", cache: "no-store" });
    if (!r.ok || envoiEnCours || !(r.headers.get("content-type") || "").includes("json")) return;
    const d = await r.json(), serveur = Array.isArray(d?.data?.suivis?.AB) ? d.data.suivis.AB.map(Number) : null;
    const fusion = new Set(serveur && lireLS(localStorage, CLE_SYNC, false) ? serveur : [...(serveur || []), ...suivies]);
    const change = [...fusion].sort().join() !== [...suivies].sort().join();
    suivies = fusion; ecrireLS(localStorage, "edSuivies", [...suivies]);
    if (!serveur || [...fusion].sort().join() !== [...serveur].sort().join()) await envoyerSuivies();
    ecrireLS(localStorage, CLE_SYNC, true);
    if (change) { dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis(); }
  } catch { /* hors ligne : copie locale */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) chargerSuiviesServeur(); });

function statut(n) {
  const c = enCirc(q, n);
  if (!aRes(c)) return { g: "attente", c };
  if (Math.abs(marge(c)) < SERRE) return { g: "serre", c };
  return { g: tete(c) ? "b" : "a", c };
}
const etoile = n => { const on = suivies.has(n);
  return `<button type="button" class="lv-etoile" data-suivre="${n}" aria-pressed="${on}" aria-label="${on ? "Ne plus suivre" : "Suivre"} ${esc(PAR_NUM[n])}">${on ? "★" : "☆"}</button>`; };
const txtMarge = c => aRes(c) ? (Math.abs(marge(c)) < 0.05 ? "égalité" : `${esc(nomRep(q, tete(c)))} +${nf(Math.abs(marge(c)), 1)} pt`) : "—";
function vignette(n) {
  const { c } = statut(n), i = aRes(c) ? tete(c) : null, col = i == null ? "var(--rule)" : coul(q, i);
  if (suivisDetail) return `<article class="lv-vigd" data-rid="${n}" tabindex="0" style="--c:${col}"><header><b>${esc(PAR_NUM[n])}</b>${etoile(n)}</header>
      <div class="lv-vigd-etat"><span>${aRes(c) ? (c.final ? "Terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % sect." : "En cours") : "Aucun résultat"}</span><span class="lv-st">${txtMarge(c)}</span></div>
      <ol>${[0, 1].map(k => `<li class="${k === i ? "moi" : ""}" style="--c:${coul(q, k)}"><i></i><span>${esc(nomRep(q, k))}</span><em></em><b>${aRes(c) ? nf(pct(c, k), 1) + " %" : "—"}</b><small>${aRes(c) ? nf(k ? c.b : c.a) : ""}</small></li>`).join("")}</ol></article>`;
  return `<button type="button" class="lv-vig${i === 0 ? " mene" : ""}" data-rid="${n}" style="--c:${col}">${esc(PAR_NUM[n])}</button>`;
}
function bulleSuivi(el) {
  const t = $("lvVTip");
  if (!el) { t.hidden = true; return; }
  const n = +el.dataset.rid, c = enCirc(q, n);
  t.innerHTML = `<b>${esc(PAR_NUM[n])}</b><small>Question ${q} · ${aRes(c) ? (c.final ? "dépouillement terminé" : c.frac != null ? nf(100 * c.frac, 0) + " % des sections" : "en cours") : "aucun résultat"}</small>`
    + `<ol>${[0, 1].map(k => `<li style="--c:${coul(q, k)}"><i></i><span>${esc(nomRep(q, k))}</span><em></em><b>${aRes(c) ? nf(pct(c, k), 1) + " %" : "—"}</b><small>${aRes(c) ? nf(k ? c.b : c.a) : ""}</small></li>`).join("")}</ol>`;
  t.hidden = false;
  const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
  t.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px"; t.style.top = y + "px";
}
document.addEventListener("mouseover", e => { const v = e.target.closest?.(".lv-vig"); if (v) bulleSuivi(v); });
document.addEventListener("mouseout", e => { const v = e.target.closest?.(".lv-vig"); if (v && !v.contains(e.relatedTarget)) bulleSuivi(null); });
document.addEventListener("focusin", e => { bulleSuivi(e.target.closest?.(".lv-vig") || null); });
addEventListener("scroll", () => bulleSuivi(null), { passive: true });

function dessinerSuivi() {
  if (!GEO) return;
  $("lvSuivisDetail").setAttribute("aria-pressed", suivisDetail);
  document.querySelector("#vue-direct .lv-grid").classList.toggle("suivi-det", suivisDetail);
  const ids = [...suivies].sort((a, b) => (aRes(enCirc(q, b)) ? marge(enCirc(q, b)) : -999) - (aRes(enCirc(q, a)) ? marge(enCirc(q, a)) : -999));
  const NOMS_G = { serre: `Serrées <small>moins de ${SERRE} points d'écart</small>`, a: `${esc(nomRep(q, 0))} en tête`, b: `${esc(nomRep(q, 1))} en tête`, attente: "Pas encore de résultats" };
  const gs = { serre: [], a: [], b: [], attente: [] };
  for (const n of ids) gs[statut(n).g].push(n);
  const resume = ids.length ? `<div class="lv-suiv-resume"><b>${ids.length} suivie${ids.length > 1 ? "s" : ""}</b> · question ${q}`
    + Object.entries(gs).filter(([, l]) => l.length).map(([g, l]) => ` · ${l.length} ${g === "serre" ? "serrée" + (l.length > 1 ? "s" : "") : g === "attente" ? "sans résultat" : "« " + esc(nomRep(q, g === "a" ? 0 : 1)) + " » en tête"}`).join("") + `</div>` : "";
  const cartes = ids.length ? Object.entries(gs).filter(([, l]) => l.length).map(([g, l]) => `<section class="lv-suiv-grp"><h4>${NOMS_G[g]}</h4>`
      + `<div class="lv-vigs${suivisDetail ? " det" : ""}">${l.map(vignette).join("")}</div></section>`).join("")
    : `<p class="lv-muted lv-vide">Aucune circonscription suivie.<br>Pour en ajouter : clique sur ☆ dans le classement ci-dessous, ou sur « Suivre » dans la fiche d'une circonscription (clic sur la carte). Une alerte s'affiche quand la réponse en tête à la question 10 change dans une circonscription suivie.</p>`;
  const jr = journal.length ? `<aside class="lv-suiv-journal"><h4>Changements récents <button type="button" class="lv-effacer" id="lvEffacerJournal">Effacer</button></h4><ul class="lv-journal">${journal.slice(0, 8).map(j => `<li><time>${esc(j.h)}</time>${esc(j.txt)}</li>`).join("")}</ul>`
    + (journal.length > 8 ? `<details><summary>${journal.length - 8} plus ancien${journal.length - 8 > 1 ? "s" : ""}</summary><ul class="lv-journal">${journal.slice(8).map(j => `<li><time>${esc(j.h)}</time>${esc(j.txt)}</li>`).join("")}</ul></details>` : "") + `</aside>` : "";
  $("lvSuivies").innerHTML = resume + `<div class="lv-suiv-corps${jr ? " avec-journal" : ""}"><div class="lv-suiv-cartes">${cartes}</div>${jr}</div>`;
  // classement des 87 circonscriptions pour la question affichée
  $("lvPPChoix").innerHTML = [["serre", "Serrées d'abord"], ["a", `% ${nomRep(q, 0)}`]].map(([k, l]) => `<button type="button" data-tri="${k}" style="--c:var(--ink)" aria-pressed="${triClassement === k}">${esc(l)}</button>`).join("");
  const tous = GEO.features.map(f => f.properties.n);
  const tri = (a, b) => triClassement === "a" ? pct(enCirc(q, b), 0) - pct(enCirc(q, a), 0) : Math.abs(marge(enCirc(q, a))) - Math.abs(marge(enCirc(q, b)));
  const grp = { serre: [], a: [], b: [], attente: [] };
  for (const n of tous) grp[statut(n).g].push(n);
  for (const k of ["serre", "a", "b"]) grp[k].sort(tri);
  grp.attente.sort((a, b) => a - b);
  const etatsOuv = Object.fromEntries([...$("lvParParti").querySelectorAll("details[data-g]")].map(d => [d.dataset.g, d.open]));
  const ligne = n => { const c = enCirc(q, n), i = aRes(c) ? tete(c) : null;
    return `<li class="lv-ligne" data-rid="${n}" tabindex="0">${etoile(n)}<span class="lv-nom" style="--c:${i == null ? "var(--rule)" : coul(q, i)}"><i></i>${esc(PAR_NUM[n])}</span>`
      + `<span class="lv-ecart">${aRes(c) ? `${esc(nomRep(q, 0))} ${nf(pct(c, 0), 1)} %` : "—"}</span><span class="lv-bur">${aRes(c) ? fracTxt(c) : ""}</span></li>`; };
  const bloc = (g, titre, ouvert) => `<details class="lv-sg" data-g="${g}" ${(etatsOuv[g] ?? ouvert) && grp[g].length ? "open" : ""}><summary><span>${titre}</span><small>${grp[g].length}</small></summary>`
    + (grp[g].length ? `<ul class="lv-lignes">${grp[g].map(ligne).join("")}</ul>` : "") + `</details>`;
  const na = grp.a.length + grp.serre.filter(n => tete(enCirc(q, n)) === 0).length, nb = grp.b.length + grp.serre.length - grp.serre.filter(n => tete(enCirc(q, n)) === 0).length;
  $("lvParParti").innerHTML = `<p class="lv-muted">Question ${q} · <b style="color:var(--ink)">${esc(nomRep(q, 0))}</b> en tête dans ${na} circonscription${na > 1 ? "s" : ""}, <b style="color:var(--ink)">${esc(nomRep(q, 1))}</b> dans ${nb} ; ${grp.attente.length} sans résultat. Clique sur ☆ pour suivre une circonscription.</p>`
    + bloc("serre", `Serrées (moins de ${SERRE} points)`, true) + bloc("a", `${esc(nomRep(q, 0))} en tête`, false) + bloc("b", `${esc(nomRep(q, 1))} en tête`, false) + bloc("attente", "Sans résultat", false);
}
// après chaque lecture : alerte quand la réponse en tête à la question 10 change dans une circonscription suivie
function surveiller() {
  const d = D(10);
  if (DEMO === null && !auMoinsUn()) {                         // direct, avant les résultats : on repart à zéro
    if (journal.length || !connus || Object.keys(connus).length) { journal = []; connus = {}; ecrireLS(sessionStorage, K_JOURNAL, journal); ecrireLS(sessionStorage, K_CONNUS, connus); }
    return;
  }
  if (!d) return;
  const vu = {};
  for (const n of suivies) { const c = d.circ[n]; if (aRes(c)) vu[n] = { t: tete(c), f: !!c.final }; }
  if (connus) for (const [n, v] of Object.entries(vu)) {
    const avant = connus[n], nom = PAR_NUM[n], r = `« ${nomRep(10, v.t)} »`;
    if (!avant) alerter(+n, v.t, `${nom} : premiers résultats à la question 10, ${r} en tête`);
    else if (avant.t !== v.t) alerter(+n, v.t, `${nom} : ${r} passe en tête à la question 10`);
    else if (v.f && !avant.f) alerter(+n, v.t, `${nom} : dépouillement terminé à la question 10, ${r} l'emporte`);
  }
  connus = { ...(connus || {}), ...vu };
  ecrireLS(sessionStorage, K_CONNUS, connus);
}
function alerter(n, i, txt) {
  const h = new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  journal.unshift({ h, txt }); journal = journal.slice(0, 30); ecrireLS(sessionStorage, K_JOURNAL, journal);
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", coul(10, i)); el.setAttribute("role", "status");
  el.innerHTML = `${esc(txt)}<small>${h} · circonscription suivie · clique pour la voir</small>`;
  el.addEventListener("click", () => { el.remove(); choisirQuestion(10); choisir(n); $("lvCarte").scrollIntoView({ behavior: "smooth", block: "center" }); });
  $("lvAlertes").prepend(el);
  setTimeout(() => el.remove(), 15000);
}
function basculerSuivie(n) {
  if (suivies.has(n)) suivies.delete(n); else suivies.add(n);
  sauverSuivies();
  const c = D(10)?.circ?.[n];
  if (connus && suivies.has(n) && aRes(c)) connus[n] = { t: tete(c), f: !!c.final };   // pas d'alerte pour l'état actuel
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
// ajouter/retirer un suivi redessine des blocs au-dessus du bouton : on garde le bouton cliqué au même endroit à l'écran
function garderPlace(b, faire) {
  const zone = b.closest("[id]"), zoneId = zone && zone.id, s = `[data-suivre="${b.dataset.suivre}"]`;
  const avant = b.getBoundingClientRect().top, avantZone = zone ? zone.getBoundingClientRect().top : 0;
  faire();
  const z = zoneId && document.getElementById(zoneId), nb = z && z.querySelector(s);
  const dy = nb ? nb.getBoundingClientRect().top - avant : z ? z.getBoundingClientRect().top - avantZone : 0;
  if (dy) window.scrollBy(0, dy);
  if (nb) nb.focus({ preventScroll: true });
}
document.addEventListener("click", e => {
  if (!e.target.closest?.("#vue-direct")) return;
  const b = e.target.closest("[data-suivre]");
  if (b) { e.stopPropagation(); garderPlace(b, () => basculerSuivie(+b.dataset.suivre)); return; }
  if (e.target.closest("#lvEffacerJournal")) { journal = []; ecrireLS(sessionStorage, K_JOURNAL, journal); dessinerSuivi(); return; }
  if (e.target.closest("#lvSuivisDetail")) { suivisDetail = !suivisDetail; ecrireLS(localStorage, "edSuivisDetail", suivisDetail); bulleSuivi(null); dessinerSuivi(); return; }
  const tr = e.target.closest("[data-tri]");
  if (tr) { triClassement = tr.dataset.tri; ecrireLS(localStorage, "edTri", triClassement); dessinerSuivi(); return; }
  const qq = e.target.closest("[data-q]");
  if (qq) { choisirQuestion(+qq.dataset.q); if (qq.dataset.aller) document.querySelector(".ed-prov").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const l = e.target.closest(".lv-ligne, .lv-vig, .lv-vigd");
  if (l) choisir(+l.dataset.rid, false);
});
document.addEventListener("keydown", e => {
  const l = e.target.closest?.(".lv-ligne, .lv-vigd");
  if (l && (e.key === "Enter" || e.key === " ") && e.target === l) { e.preventDefault(); choisir(+l.dataset.rid, false); }
});
function replierPP(ouvert) { $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); }

/* ---------- blocs du bas : questions, sondages, comment voter ---------- */
function dessinerTextes() {
  $("edQuestions").innerHTML = `<h3 id="edQuestionsTitre">Les 10 questions</h3>
    <p>Une consultation : le décret précise que les résultats des questions 1 à 5 et 10 ne sont pas contraignants. Chaque question est sur son propre bulletin, numéroté et de couleur différente, remis dans cet ordre (la question 10 en premier) ; on peut ne répondre qu'à certaines. Les questions 1 à 9 se répondent par oui ou non, la question 10 par l'option 1 ou l'option 2. Les libellés officiels sont en anglais ; la traduction française ci-dessous est celle du site, non officielle.</p>
    <ol class="ed-qs">${ORDRE.map(k => { const Qk = Q[k];
      return `<li class="ed-q" style="--c:${Qk.c[0]}"><header><b>Question ${k} · ${esc(Qk.titre)}</b><span>${esc(Qk.decret)}</span></header><p>${esc(Qk.fr)}</p>`
        + (k === 10 ? `<ul>${Qk.rep.map(r => `<li>${esc(r.long)}</li>`).join("")}</ul>` : "")
        + `<details><summary>Libellé officiel (anglais)</summary><p>${esc(Qk.en)}${k === 10 ? "<br>" + Qk.rep.map(r => esc(r.en)).join("<br>") : ""}</p></details>`
        + (Qk.sond ? `<span class="ed-q-sond">Sondage Research Co. (24–26 août 2026) : oui <b>${Qk.sond[0]} %</b> · non <b>${Qk.sond[1]} %</b> · ne sait pas ${Qk.sond[2]} %</span>` : "")
        + `<button type="button" class="vi-lien" data-q="${k}" data-aller="1">Voir les résultats de cette question</button></li>`; }).join("")}</ol>`;
  const s5 = SONDAGES.slice(0, 5), moy = x => s5.reduce((s, p) => s + p[x], 0) / s5.length;
  $("edSondages").innerHTML = `<h3 id="edSondagesTitre">Sondages sur la question 10</h3>
    <p>Rester une province du Canada (option 1) ou lancer le processus juridique vers un référendum contraignant sur la séparation (option 2). Moyenne des cinq derniers : <b style="color:var(--ink)">${nf(moy("r"), 0)} %</b> pour rester, <b style="color:var(--ink)">${nf(moy("p"), 0)} %</b> pour le processus, ${nf(moy("i"), 0)} % d'indécis.</p>
    <div class="ed-sond"><table><thead><tr><th>Sondeur</th><th>Rester</th><th>Processus</th><th>Indécis</th><th>Écart</th><th>Échantillon</th><th class="ed-sond-barre">Répartition</th></tr></thead><tbody>${SONDAGES.map(p => `<tr><td><b>${esc(p.s)}</b><small>${esc(p.d)} · ${esc(p.m)}</small></td>`
      + `<td>${p.r} %</td><td>${p.p} %</td><td>${p.i} %</td><td>+${p.r - p.p}</td><td>${nf(p.n)}</td><td class="ed-sond-barre"><span class="ed-mini" role="img" aria-label="Rester ${p.r} %, processus ${p.p} %, indécis ${p.i} %"><i style="width:${p.r}%;background:var(--ed-rester)"></i><i style="width:${p.p}%;background:var(--ed-sep)"></i><i style="width:${p.i}%"></i></span></td></tr>`).join("")}</tbody></table></div>
    <p>Compilation : Wikipédia, « 2026 Alberta independence referendum » (sondages publiés par les maisons de sondage). Les questions 1 à 9 : sondage Research Co. du 24 au 26 août 2026, dans chaque question ci-dessus.</p>`;
  $("edVoter").innerHTML = `<h3 id="edVoterTitre">Comment voter</h3>
    <div class="ed-voter">
      <div><h4>Qui peut voter</h4><p>Toute personne de citoyenneté canadienne, âgée d'au moins 18 ans le jour du vote et qui réside habituellement en Alberta. On peut s'inscrire au bureau de vote même sans inscription préalable.</p></div>
      <div><h4>Où et quand</h4><ul><li>Jour du vote : lundi 19 octobre, de 9 h à 20 h (heure de l'Alberta ; 11 h à 22 h au Québec), au bureau assigné selon l'adresse (carte « Where to Vote » ou <a href="https://www.elections.ab.ca/where-to-vote-tool/" target="_blank" rel="noopener">outil Where Do I Vote</a>).</li><li>Par anticipation : du 13 au 17 octobre, de 9 h à 20 h, dans n'importe quel bureau d'anticipation de sa circonscription.</li><li>Par correspondance (bulletin spécial) : demandes closes le 25 septembre, bulletins reçus au plus tard le 16 octobre à 17 h.</li></ul></div>
      <div><h4>Pièce d'identité</h4><p>Un permis de conduire ou une carte d'identité de l'Alberta portant le nom et l'adresse actuelle ; ou deux pièces parmi plus de 50 documents acceptés (facture, relevé bancaire, carte d'assurance maladie…), dont une avec l'adresse de résidence ; ou un formulaire d'attestation (locataires, réserves et établissements, refuges, résidences étudiantes). <a href="https://www.elections.ab.ca/voters/id-required-to-vote/" target="_blank" rel="noopener">Liste complète</a>.</p></div>
      <div><h4>Les bulletins</h4><p>Dix bulletins séparés, numérotés et de couleurs différentes (tous blancs par correspondance), remis dans l'ordre : la question 10 d'abord. Questions 1 à 9 : marquer « oui » ou « non ». Question 10 : un « X » à côté d'une seule des deux options. On n'est pas obligé de répondre à toutes les questions. Le personnel électoral ne peut pas expliquer les questions.</p></div>
      <div><h4>Congé pour voter</h4><p>La loi électorale garantit trois heures consécutives hors du travail pendant les heures de vote, un jour d'anticipation ou le jour du vote ; sinon l'employeur doit accorder (et payer) le temps qui manque.</p></div>
      <div><h4>En français</h4><p>Élections Alberta publie un <a href="https://www.elections.ab.ca/uploads/Language-Guide-French.pdf" target="_blank" rel="noopener">guide du vote en français</a> (PDF). Renseignements : 1-877-422-VOTE (8683) · <a href="https://www.elections.ab.ca/elections/referendum/" target="_blank" rel="noopener">page du référendum</a>.</p></div>
    </div>`;
  $("edSource").innerHTML = `Résultats : <a href="${SITE_RES}" target="_blank" rel="noopener">Élections Alberta</a>, résultats non officiels (les officiels seront annoncés le 29 octobre), lus par le site toutes les 45 secondes, ou toutes les 5 minutes par une copie de secours. Questions : décrets 109/2026, 110/2026 et 160/2026 (<a href="https://www.elections.ab.ca/elections/referendum/" target="_blank" rel="noopener">elections.ab.ca</a>), traduction non officielle. Carte : circonscriptions électorales de 2017 d'Elections Alberta, contours simplifiés ; contient de l'information visée par la <a href="https://open.alberta.ca/licence" target="_blank" rel="noopener">Licence du gouvernement ouvert – Alberta</a>. Cette page est temporaire.`;
}

/* ---------- ensemble ---------- */
function dessiner() {
  dessinerEtat(); dessinerCompte(); dessinerHeures(); dessinerChoix(); dessinerProvince(); dessinerParticip();
  dessinerCarte(); dessinerPanneau(); dessinerSuivi();
}
function choisirQuestion(k) {
  if (!Q[k]) return;
  q = k; ecrireLS(localStorage, "edQuestion", q);
  dessinerEtat(); dessinerChoix(); dessinerProvince(); dessinerParticip(); dessinerCarte(); dessinerPanneau(); dessinerSuivi();
}
function choisir(n, defiler = true) {
  sel = n; dessinerCarte(); dessinerPanneau();
  if (plein()) info(true);
  else if (defiler && innerWidth <= 900) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function demarrer() {
  if (demarre) return; demarre = true;
  dessinerTextes(); dessinerHeures();
  replierPP(lireLS(localStorage, "edClassementOuvert", false));
  $("lvPPReplier").addEventListener("click", () => { const o = $("lvPPReplier").getAttribute("aria-expanded") !== "true"; replierPP(o); ecrireLS(localStorage, "edClassementOuvert", o); });
  try {
    GEO = await (await fetch("en-direct/circonscriptions.json", { cache: "no-cache" })).json();
    // contours dans le sens attendu par d3 (sinon un polygone couvre toute la sphère)
    for (const f of GEO.features) if (d3.geoArea(f) > 2 * Math.PI) { const rev = x => x.map(r => r.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
    for (const f of GEO.features) { PAR_NUM[f.properties.n] = f.properties.nom; PAR_NOM[norm(f.properties.nom)] = f.properties.n; }
    preparerCarte(); construireCarte();
    chargerSuiviesServeur();
    await actualiser();
  } catch (e) { $("lvEtat").textContent = "Chargement impossible : " + e.message; }
  // chaque seconde : décompte (et compte à rebours) ; à zéro, nouvelle lecture (seulement si l'onglet est visible)
  setInterval(() => {
    if (!document.hidden && Date.now() >= prochaine) actualiser();
    afficherDecompte(); dessinerCompte();
  }, 1000);
  afficherDecompte();
  $("lvMaj").addEventListener("click", actualiser);
}
window.addEventListener("vue-direct", demarrer);
if (!$("vue-direct").hidden) demarrer();
