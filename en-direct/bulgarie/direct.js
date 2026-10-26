/* Page « En direct » : présidentielle en Bulgarie, 2e tour du dimanche 1er novembre 2026 (Iliana Iotova contre Andrey Gyurov ; 1er tour
   le 25 octobre). Même cadre que les autres soirées (bloc « gen » du gabarit, classes lv-* et ed-*) : compte à rebours et heures,
   choix 1er tour · 2e tour (edChoix, le 2e par défaut), barre à deux candidats avec le repère de 50 %, participation, carte des
   31 circonscriptions électorales (МИР) colorée selon le candidat en tête (pâle tant que les protocoles ne sont pas tous traités),
   modes Écart et Participation, fiche, vote à l'étranger (МИР 32) à part, suivies avec alertes, classement, blocs du bas.

   Résultats : api/direct-bg.php (relais des pages de la CIK, results.cik.bg, cache 45 s, JSON compact) ; à défaut (results.cik.bg est
   derrière Cloudflare, qui peut refuser le relais), en-direct/bulgarie/resultats.json, copie du pipeline GitHub (en-direct/bulgarie/outils/bg.py,
   avec un navigateur sans tête au besoin, navigateur.mjs ; .github/workflows/bg-election.yml). Même format pour les deux : la plus récente
   (heure des données de la CIK) est affichée.
   1er tour : en-direct/bulgarie/tour1.json (même format, tenu à jour par le pipeline jusqu'aux résultats définitifs).
   2e tour de 2021 (comparaison, et démo ?demo=2021 réservée aux administrateurs) : en-direct/bulgarie/demo-2021.json, lu sur les pages de
   la CIK par le même bg.py : la démo vérifie l'interprétation avant le soir du vote.
   Carte : en-direct/bulgarie/circonscriptions.json (en-direct/bulgarie/outils/geo.py : geoBoundaries, domaine public ; arrondissements
   de Sofia d'OpenStreetMap, ODbL). */

const DOSSIER = "en-direct/bulgarie/";
const RAFRAICHIR = 60;                                              // secondes entre deux lectures
const OUVERTURE = new Date("2026-11-01T07:00:00+02:00"), FERMETURE = new Date("2026-11-01T20:00:00+02:00");   // heure normale de l'Est européen
const OUV1 = new Date("2026-10-25T07:00:00+02:00");
const SITE = "https://results.cik.bg/";
const NB = 31, ETR = "32";                                          // 31 circonscriptions sur la carte, la 32e : vote à l'étranger

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const heureQc = d => d.toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }).replace(":", " h ").replace(/ h 00$/, " h");
const secQc = d => d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" });
const heureBg = d => d.toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Sofia" }).replace(":", " h ").replace(/ h 00$/, " h");
const jourBg = d => d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Sofia" });
const deux = n => String(n).padStart(2, "0");
const ilYa = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${deux(Math.floor(s / 60) % 60)}`; };
const lireLS = (st, k, d) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
const ecrireLS = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } };

// démo (administrateurs seulement) : ?demo=2021 = 2e tour du 21 novembre 2021, lu sur les pages de la CIK dans le même format
const DEMO = (() => {
  const d = new URLSearchParams(location.search).get("demo");
  let admin = false; try { admin = sessionStorage.getItem("userRole") === "admin"; } catch { /* stockage bloqué */ }
  return admin && d === "2021" ? d : null;
})();

/* ---------- candidats (listes de la CIK ; reconnus par leur nom, les numéros changeant d'une élection à l'autre) ---------- */
const CANDS = {
  iot: { re: /Йотова/, nom: "Iliana Iotova", court: "Iotova", vp: "Kiril Valchev", g: "f", c: "#C62D2D",
    qui: "Présidente sortante (depuis le 23 janvier 2026, après la démission de Roumen Radev, dont elle était la vice-présidente depuis 2017)",
    appui: "Candidature d'un comité d'initiative, appuyée par Bulgarie progressiste (parti du premier ministre Roumen Radev), le BSP – Gauche unie et d'autres partis",
    vpQui: "directeur général de l'agence de presse BTA" },
  gyu: { re: /Гюров/, nom: "Andrey Gyurov", court: "Gyurov", vp: "Georgi Kandev", g: "m", c: "#1F6FD1",
    qui: "Ancien premier ministre par intérim (19 février au 8 mai 2026), ancien sous-gouverneur de la Banque nationale de Bulgarie",
    appui: "Candidature d'un comité d'initiative, appuyée par l'opposition réformiste et proeuropéenne : Continuons le changement et Bulgarie démocratique (PP-DB)",
    vpQui: "ancien secrétaire général du ministère de l'Intérieur" },
  kos: { re: /Костадин Тодоров Костадинов/, nom: "Kostadin Kostadinov", court: "Kostadinov", c: "#6B4E9B", appui: "Renaissance (Vazrajdane), droite nationaliste" },
  vas: { re: /Радостин Петев Василев/, nom: "Radostin Vasilev", court: "Vasilev", c: "#D9822B", appui: "MECh" },
  mih: { re: /Ивелин Людмилов Михайлов/, nom: "Ivelin Mihaylov", court: "Mihaylov", c: "#8D6E4F", appui: "Velitchie (Grandeur)" },
  hri: { re: /Иван Маркос Христанов/, nom: "Ivan Hristanov", court: "Hristanov", c: "#3E8E8F", appui: "Comité d'initiative, appuyé par Edinenie" },
  rad: { re: /Румен Георгиев Радев/, nom: "Roumen Radev", court: "Radev", vp: "Iliana Iotova", g: "m", c: "#C62D2D", appui: "Président sortant en 2021, appuyé par le BSP et d'autres partis" },
  ger: { re: /Герджиков/, nom: "Anastas Gerdjikov", court: "Gerdjikov", vp: "Nevyana Miteva", g: "m", c: "#1F6FD1", appui: "Recteur de l'Université de Sofia, appuyé par le GERB" },
};
const NSP = { nom: "Je ne soutiens personne", court: "Personne", bg: "Не подкрепям никого", c: "#9AA0A6" };
const AUTRE_C = "#A3A8B1";
// translittération officielle du bulgare (loi de 2009) pour les autres candidats
const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya" };
const latin = s => String(s).replace(/[а-яА-Я]/g, ch => { const l = TR[ch.toLowerCase()] ?? ch; return ch === ch.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); });
function infoCand(c) {                                             // c = { n, nom (« Prénom Patronyme Nom и … »), comite }
  const k = Object.keys(CANDS).find(k => CANDS[k].re.test(String(c.nom).split(" и ")[0]));   // le candidat à la présidence (Iotova était colistière en 2021)
  if (k) return { k, ...CANDS[k] };
  const [pres, vp] = String(c.nom).split(" и "), m = pres.trim().split(/\s+/), v = (vp || "").trim().split(/\s+/);
  return { k: "n" + c.n, nom: latin(`${m[0]} ${m[m.length - 1]}`), court: latin(m[m.length - 1]), vp: vp ? latin(`${v[0]} ${v[v.length - 1]}`) : "", c: AUTRE_C, appui: latin(c.comite || "") };
}

/* ---------- données ---------- */
let T1 = null, T2 = null, R21 = null, brut2 = null, lu = null, GEO = null, NOMS = {}, NOMS_BG = {};
let tour = DEMO ? 2 : lireLS(sessionStorage, "bgTour", 2), sel = null, carteMarge = false, carteParticip = false, prochaine = 0;
// prépare un tour : candidats reconnus, totaux nationaux et par circonscription
function preparer(d) {
  if (!d?.disponible) return null;                                  // sans candidats : participation seule (avant la fermeture)
  const info = {}; for (const c of d.cands || []) info[c.n] = infoCand(c);
  const nat = { pct: d.pct, final: !!d.final, nsp: d.nsp || 0, cands: (d.cands || []).map(c => ({ n: c.n, v: c.v, elu: c.elu, ...info[c.n] })) };
  const mir = {};
  for (const [k, m] of Object.entries(d.mir || {})) {
    const cands = Object.entries(m.v || {}).map(([n, v]) => ({ n: +n, v, ...(info[n] || infoCand({ n, nom: "?" })) })).sort((a, b) => b.v - a.v);
    const total = cands.reduce((s, c) => s + c.v, 0) + (m.nsp || 0);
    mir[k] = { cands, nsp: m.nsp || 0, total, pct: m.pct, final: !!m.final, activite: m.activite || [] };
  }
  nat.cands.sort((a, b) => b.v - a.v);
  nat.total = nat.cands.reduce((s, c) => s + c.v, 0) + nat.nsp;
  return { ...d, info, nat, mirs: mir };
}
const D = () => tour === 1 ? T1 : T2;
const enMir = (k, d = D()) => { const m = d?.mirs?.[k]; return m && m.total > 0 && m.cands.length ? m : null; };
const pc = (m, v) => m?.total ? 100 * v / m.total : 0;
const ecart = m => m.cands.length > 1 ? pc(m, m.cands[0].v) - pc(m, m.cands[1].v) : 100;
const aRes = (d = D()) => !!(d?.nat?.total > 0 && d.nat.cands.length);
const fermes = () => DEMO || new Date() >= FERMETURE;
const fraction = m => m.final ? 1 : m.pct != null ? Math.min(1, m.pct / 100) : null;
// participation : dernière heure publiée (20 h une fois les protocoles saisis), sinon le protocole final
function particip(act, proto) {
  const a = (act || []).filter(x => x.inscrits > 0);
  const der = a[a.length - 1];
  if (proto?.votants && proto?.inscrits && !a.some(x => x.h === "20:00")) return { pct: 100 * proto.votants / (a[0]?.inscrits || proto.inscrits), h: "fin", votants: proto.votants };
  return der ? { pct: der.pct, h: der.h, votants: der.votants, inscrits: der.inscrits } : null;
}
const hLib = h => h === "fin" ? "au total" : h === "20:00" ? "à 20 h (fermeture)" : `à ${String(h).replace(/^0/, "").replace(":00", " h").replace(":", " h ")}`;

/* ---------- lecture : relais du site, sinon copie du pipeline ---------- */
async function lireRelais() {
  const r = await fetch("api/direct-bg.php?tour=2", { credentials: "include", cache: "no-store" });
  if (r.status === 401) throw new Error("Session expirée : reconnecte-toi.");
  try { return await r.json(); } catch { return null; }            // pas de PHP (serveur local) : copie du pipeline
}
async function lireCopie(f) {
  const r = await fetch(DOSSIER + f, { cache: "no-cache" });
  return r.ok ? { ...(await r.json()), publie: r.headers.get("last-modified") } : null;
}
const quand = d => Date.parse(d?.donnees || "") || 0;
async function lire2() {
  if (DEMO) { const d = await lireCopie(`demo-${DEMO}.json`); return d && { ...d, via: "demo" }; }
  let relais = null, copie = null;
  try { relais = await lireRelais(); } catch (e) { if (/Session/.test(e.message)) throw e; }
  copie = await lireCopie("resultats.json").catch(() => null);
  const okR = !!relais?.disponible, okC = !!copie?.disponible;
  // les deux : la plus récente (heure des données de la CIK), le relais à égalité
  if (okR && (!okC || quand(relais) >= quand(copie))) return { ...relais, via: "relais" };
  if (okC) return { ...copie, via: "copie", raisonRelais: relais?.raison };
  return relais || copie ? { ...(relais || copie), via: relais ? "relais" : "copie" } : null;
}
let derT1 = 0;
async function actualiser() {
  prochaine = Date.now() + RAFRAICHIR * 1000;
  $("lvEtat").textContent = "Mise à jour…";
  try {
    if (Date.now() - derT1 > 10 * 60e3) {                         // 1er tour : toutes les 10 minutes, relais ou copie (la plus récente)
      const [r1, c1] = await Promise.all([fetch("api/direct-bg.php?tour=1", { credentials: "include", cache: "no-store" }).then(r => r.json()).catch(() => null), lireCopie("tour1.json").catch(() => null)]);
      const t1 = r1?.disponible && r1.cands?.length && (!c1?.disponible || quand(r1) >= quand(c1)) ? r1 : c1;
      if (t1) { T1 = preparer(t1); derT1 = Date.now(); }
    }
    brut2 = await lire2(); lu = new Date();
    T2 = preparer(brut2);
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

/* ---------- état, heures ---------- */
function dessinerEtat() {
  const b = $("lvBanniere"), d = D(), lien = `<a href="${SITE}" target="_blank" rel="noopener">site de la CIK</a>`;
  $("edAvant").hidden = fermes();
  b.hidden = false;
  if (DEMO) b.innerHTML = `<b>DÉMO · résultats de 2021</b> : 2e tour du 21 novembre 2021 (Roumen Radev contre Anastas Gerdjikov), lu sur les pages de la CIK dans le même format que le soir du vote. Ce ne sont pas les résultats de 2026.`;
  else if (tour === 1) b.innerHTML = T1?.final ? `1er tour du 25 octobre 2026 : <b>résultats définitifs</b> de la CIK.`
    : `1er tour du 25 octobre 2026 : résultats de la CIK${T1?.pct != null ? ` (${nf(T1.pct, 2)} % des protocoles traités)` : ""}, <b>non définitifs</b>.`;
  else if (!aRes(T2)) b.innerHTML = fermes()
    ? `<b>Bureaux fermés</b> : en attente des premiers résultats de la CIK (vérification chaque minute ; au 1er tour, les premiers chiffres sont arrivés vers 23 h à Sofia, ${heureQc(new Date("2026-11-01T23:00:00+02:00"))} au Québec). Les télés bulgares publient des sondages à la sortie des urnes dès 20 h. <button type="button" class="vi-lien" data-tour="1">Voir le 1er tour</button>`
    : `Les résultats du 2e tour s'afficheront ici après la fermeture des bureaux, <b>dimanche 1er novembre à 20 h à Sofia (${heureQc(FERMETURE)}, heure du Québec)</b>. En attendant : <button type="button" class="vi-lien" data-tour="1">résultats du 1er tour</button>.`;
  else b.innerHTML = T2.final ? `<b>Résultats définitifs</b> de la Commission électorale centrale (CIK).`
    : `<b>Résultats préliminaires</b> de la CIK, au fil du traitement des protocoles des bureaux de vote : non définitifs.${brut2?.perime ? " La CIK ne répond plus : derniers chiffres lus." : ""}`;
  if (!d) { $("lvEtat").textContent = tour === 1 ? "Résultats indisponibles pour le moment · nouvel essai chaque minute"
    : fermes() ? "Bureaux fermés · en attente des premiers résultats de la CIK · vérification chaque minute" : "Avant le vote · lecture des résultats chaque minute dès la fermeture"; dessinerVerifs(); return; }
  if (!aRes(d)) { $("lvEtat").innerHTML = (fermes() ? "<b>Bureaux fermés</b> · en attente des premiers résultats · vérification chaque minute" : "<b>Vote en cours</b> · résultats à la fermeture des bureaux")
    + (particip(d.activite, d.proto) ? ` · participation ${partTxt(d)} (CIK)` : ""); dessinerVerifs(); return; }
  const n = Object.keys(d.mirs).filter(k => k !== ETR && enMir(k, d)).length, fin = Object.keys(d.mirs).filter(k => k !== ETR && d.mirs[k].final).length;
  $("lvEtat").innerHTML = [DEMO ? "<b>DÉMO · résultats de 2021</b>" : `<b>${tour === 1 ? "1er tour" : "2e tour"} · ${d.final ? "résultats définitifs" : "résultats préliminaires"}</b>`,
    d.pct != null ? `${nf(d.pct, 2)} % des protocoles traités` : "", `${n} circonscription${n > 1 ? "s" : ""} sur ${NB} avec des résultats`, fin && !d.final ? `${fin} complète${fin > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  dessinerVerifs();
}
function dessinerVerifs() {
  const el = $("lvHeures"), d = tour === 1 ? T1 : brut2;
  el.hidden = !d?.disponible; if (el.hidden) return;
  const m = Date.now(), donnees = d.donnees ? new Date(d.donnees) : null;
  const verif = tour === 2 && brut2?.via === "relais" && brut2.ageCache != null ? new Date(lu - brut2.ageCache * 1000) : null;
  const copie = d.publie ? new Date(d.publie) : d.maj ? new Date(d.maj) : null;
  el.innerHTML = `<span>${donnees ? `<b>Données de la CIK</b> de ${heureBg(donnees)} à Sofia (${heureQc(donnees)} au Québec) · ` : d.final ? "<b>Données définitives de la CIK</b> · " : ""}`
    + (verif ? `vérifiées sur le <a href="${SITE}" target="_blank" rel="noopener">site de la CIK</a> par le site à ${secQc(verif)} (il y a ${ilYa(m - verif)})`
      : `copie ${DEMO ? "de démonstration" : "de secours du pipeline"}${copie && !isNaN(copie) ? `, mise en ligne à ${heureQc(copie)} (il y a ${ilYa(m - copie)})` : ""}`)
    + (lu ? ` · relues par cette page à ${secQc(lu)}` : "") + ` · heures du Québec</span>`;
}
function dessinerCompte() {
  if ($("edAvant").hidden) return;
  const m = new Date(), cible = m < OUVERTURE ? OUVERTURE : FERMETURE, ms = Math.max(0, cible - m);
  const j = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  const avant = m < OUVERTURE;
  $("edCompte").innerHTML = `<span class="lv-eyebrow">2e tour · ${avant ? "ouverture des bureaux" : "fermeture des bureaux"}</span>
    <h3>${avant ? "Les bureaux ouvrent dans" : "Les bureaux ferment dans"}</h3>
    <div class="ed-compte-n" role="timer" aria-live="off">${[[j, "jour" + (j > 1 ? "s" : "")], [deux(h), "heures"], [deux(mi), "minutes"], [deux(s), "secondes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <p>Dimanche 1er novembre à <b>${avant ? "7 h" : "20 h"}, heure de Sofia</b> (${heureQc(cible)}, heure du Québec). La Bulgarie a sept heures de plus que le Québec à la fermeture (six à l'ouverture : le Québec revient à l'heure normale à 2 h dans la nuit du 31 octobre au 1er novembre ; la Bulgarie l'a fait le 25 octobre).</p>`;
}
function dessinerHeures() {
  const m = new Date(), h = s => new Date(`2026-11-01T${s}:00+02:00`);
  const L = [
    ["1er tour", "Dimanche 25 octobre", `Iotova et Gyurov en tête ; participation historiquement basse${T1 && ["20:00", "fin"].includes(particip(T1.activite, T1.proto)?.h) ? ` (${partTxt(T1)})` : ""}`, new Date("2026-10-26T00:00:00+02:00")],
    ["Ouverture des bureaux", "Dimanche 1er novembre, 7 h à Sofia", `${heureQc(OUVERTURE)} au Québec (nuit de samedi à dimanche)`, OUVERTURE],
    ["Participation à 11 h et à 16 h", "Publiée par la CIK en cours de journée", `${heureQc(h("11:00"))} et ${heureQc(h("16:00"))} au Québec`, h("16:30")],
    ["Fermeture des bureaux", "20 h à Sofia", `${heureQc(FERMETURE)} au Québec · sondages à la sortie des urnes des télés bulgares dès la fermeture`, FERMETURE],
    ["Résultats préliminaires de la CIK", "Dans la soirée et la nuit", `Au 1er tour, premiers chiffres vers 23 h à Sofia (${heureQc(h("23:00"))} au Québec), 95 % des protocoles le lendemain à 6 h`, new Date("2026-11-02T08:00:00+02:00")],
    ["Résultats définitifs", "Proclamés par la CIK dans les jours suivants", "Après vérification de tous les protocoles", new Date("2026-11-05T20:00:00+02:00")],
    ["Entrée en fonction", "22 janvier 2027", "Le mandat de cinq ans commence après le serment devant l'Assemblée nationale", new Date("2027-01-22T12:00:00+02:00")],
  ];
  $("edHeures").innerHTML = L.map(([t, a, b, fin]) => `<li class="${m > fin ? "ed-passe" : ""}"><b>${t}</b><span>${a}<small>${b}</small></span></li>`).join("");
}
const partTxt = d => { const p = particip(d.activite, d.proto); return p ? `${nf(p.pct, 1)} % ${hLib(p.h)}` : "—"; };

/* ---------- choix du tour et résultat national ---------- */
function dessinerChoix() {
  const el = $("edChoix"); el.hidden = false;
  const etat = d => !d ? "en attente" : !aRes(d) ? "aucun résultat" : `${d.nat.cands[0].court} ${nf(pc(d.nat, d.nat.cands[0].v), 1)} %${d.final ? "" : d.pct != null ? ` · ${nf(d.pct, 0)} %` : ""}`;
  el.innerHTML = [[1, "1er tour · 25 oct.", T1], [2, DEMO ? "2e tour · démo 2021" : "2e tour · 1er nov.", T2]].map(([t, l, d]) =>
    `<button type="button" data-tour="${t}" aria-pressed="${tour === t}" style="${aRes(d) ? `--c:${d.nat.cands[0].c}` : ""}">${l}<small>${esc(etat(d))}</small></button>`).join("");
}
// candidats montrés : tous au 2e tour ; au 1er, les cinq premiers puis « autres »
function montres(m) {
  if (tour === 2 || m.cands.length <= 6) return m.cands.map(c => ({ ...c }));
  const t = m.cands.slice(0, 5), reste = m.cands.slice(5);
  return [...t, { k: "aut", nom: `${reste.length} autres candidats`, court: "Autres", c: AUTRE_C, v: reste.reduce((s, c) => s + c.v, 0) }];
}
function dessinerNational() {
  const d = D(), ok = aRes(d), m = d?.nat;
  $("edProvSur").textContent = tour === 1 ? "1er tour · 25 octobre 2026 · ensemble des votes (Bulgarie et étranger)" : DEMO ? "Démo · 2e tour du 21 novembre 2021 · ensemble des votes" : "2e tour · 1er novembre 2026 · ensemble des votes (Bulgarie et étranger)";
  const q = $("edQTexte");
  q.hidden = false;
  q.innerHTML = tour === 1 ? `27 candidatures (président et vice-président élus ensemble). Pour être élu au 1er tour, il fallait plus de la moitié des votes valides <i>et</i> une participation de plus de 50 % : les deux premiers vont au 2e tour.`
    : `Au 2e tour, la candidature qui obtient le plus de voix est élue, quelle que soit la participation. Pourcentages de la CIK : sur les votes valides, y compris « ${NSP.bg} » (${NSP.nom.toLowerCase()}).`;
  const lead = ok ? m.cands[0] : null, sec = ok ? m.cands[1] : null;
  const elu = lead && (d.final || lead.elu) && tour === 2;
  $("lvSiegesTitre").textContent = !ok ? (tour === 2 && !fermes() ? "2e tour : Iliana Iotova contre Andrey Gyurov · résultats à la fermeture des bureaux" : "En attente des premiers résultats")
    : elu ? `${lead.nom} ${lead.g === "f" ? "élue présidente" : "élu président"} : ${nf(pc(m, lead.v), 1)} %`
    : tour === 1 ? `${lead.nom} et ${sec.nom} au 2e tour${d.final ? "" : " (résultats préliminaires)"}`
    : `${lead.nom} en tête : ${nf(pc(m, lead.v), 1)} % contre ${nf(pc(m, sec?.v || 0), 1)} %${d.pct != null && !d.final ? ` (${nf(d.pct, 1)} % des protocoles)` : ""}`;
  // barre : au 2e tour, un candidat de chaque côté et les « personne » au milieu ; repère de 50 % des votes valides
  const segs = !ok ? [] : tour === 2 && m.cands.length === 2 ? [{ ...m.cands[0] }, { ...NSP, v: m.nsp }, { ...m.cands[1] }]
    : [...montres(m), { ...NSP, v: m.nsp }];
  $("lvBarre").innerHTML = segs.filter(s => s.v > 0).map(s => `<span class="lv-seg" style="width:${pc(m, s.v)}%;--c:${s.c}" title="${esc(s.nom)} : ${nf(pc(m, s.v), 1)} % (${nf(s.v)} voix)"><i class="lv-elus" style="width:100%"></i><b>${esc(s.court)} ${nf(pc(m, s.v), 1)} %</b></span>`).join("");
  for (const seg of $("lvBarre").querySelectorAll(".lv-seg")) {        // étiquette selon la place : « Iotova 52,1 % », sinon « 52,1 % », sinon rien
    const b = seg.querySelector("b"); if (!b) continue;
    if (b.offsetWidth > seg.clientWidth - 6) b.textContent = b.textContent.split(" ").slice(-2).join(" ");
    if (b.offsetWidth > seg.clientWidth - 4) b.remove();
  }
  const mq = $("edMajMarque"); mq.hidden = !ok; mq.style.left = "50%"; mq.querySelector("span").textContent = "50 %";
  // cartes des candidats : voix, % ; comparaison avec l'autre tour (ou 2021)
  const autre = DEMO ? null : tour === 2 ? T1 : T2, cmpLib = tour === 2 ? "1er tour" : "2e tour";
  const cartes = ok ? [...montres(m), { ...NSP, k: "nsp", v: m.nsp }] : tour === 2 && T1 ? ["iot", "gyu"].map(k => ({ ...CANDS[k], k, v: null })) : [];
  $("lvPartis").innerHTML = cartes.map(c => {
    const a = autre && aRes(autre) && (c.k === "nsp" ? { v: autre.nat.nsp } : autre.nat.cands.find(x => x.k === c.k));
    const cmp = a ? `${cmpLib} : ${nf(pc(autre.nat, a.v), 1)} %` : "";
    return `<div class="lv-parti" style="--c:${c.c}" title="${esc(c.nom)}${c.vp ? " · vice-présidence : " + esc(c.vp) : ""}"><i></i><span class="lv-pnom">${esc(c.court)}</span>`
      + `<b>${c.v != null ? nf(pc(m, c.v), 1) + " %" : "—"}</b><small>${c.v != null ? nf(c.v) + " voix" : esc(c.nom)}${cmp ? " · " + cmp : ""}</small>`
      + `<span class="lv-pvote">${c.elu && tour === 1 ? "au 2e tour" : ""}</span></div>`;
  }).join("");
  // chiffres clés : protocoles, participation (le grand sujet), votes valides, « personne », étranger
  // comparaisons à la même heure (11 h, 16 h, 20 h) ; au total une fois le protocole final publié
  const p = d ? particip(d.activite, d.proto) : null;
  const memeH = x => !x || !p ? null : p.h === "fin" ? particip(x.activite, x.proto) : (() => { const a = (x.activite || []).find(y => y.h === p.h); return a ? { pct: a.pct, h: a.h } : null; })();
  const p1 = memeH(T1), p21 = memeH(R21);
  const etr = d && enMir(ETR, d);
  const kv = [
    [d?.pct != null ? nf(d.pct, 2) + " %" : "—", d?.final ? "protocoles traités · résultats définitifs" : `protocoles traités${d?.sic ? ` (${nf(d.sic)} bureaux)` : ""}`],
    [p ? nf(p.pct, 1) + " %" : "—", `participation ${p ? hLib(p.h) : ""}${tour === 2 && !DEMO && p1 ? ` · 1er tour : ${nf(p1.pct, 1)} %` : ""}${p21 && !DEMO ? ` · 2e tour 2021 : ${nf(p21.pct, 1)} %` : ""}`],
    [ok ? nf(m.total) : "—", "votes valides comptés"],
    [ok ? nf(pc(m, m.nsp), 1) + " %" : "—", `« ${NSP.bg} » (${NSP.nom.toLowerCase()})`],
    [etr ? `${esc(etr.cands[0].court)} ${nf(pc(etr, etr.cands[0].v), 1)} %` : "—", `vote à l'étranger (МИР 32)${etr ? ` · ${nf(etr.total)} votes` : ""}`],
  ];
  $("edKv").innerHTML = kv.map(([v, l], i) => `<div${i === 4 && etr ? ` data-rid="${ETR}" tabindex="0" role="button" style="cursor:pointer" title="Voir le vote à l'étranger"` : ""}><b>${v}</b><span>${l}</span></div>`).join("");
  $("lvBarrePlein").innerHTML = `<div class="lv-bp-tete"><b>${ok ? `${esc(lead.court)} ${nf(pc(m, lead.v), 1)} %` : tour === 1 ? "1er tour" : "2e tour"}</b><span>${ok ? (d.final ? "définitif" : d.pct != null ? `${nf(d.pct, 0)} % des protocoles` : "") : "en attente"}</span></div>`
    + `<div class="lv-bp-barre">${segs.filter(s => s.v > 0).map(s => `<span style="width:${pc(m, s.v)}%;--c:${s.c}"><i style="width:100%"></i></span>`).join("")}<em style="left:50%"></em></div>`
    + `<div class="lv-bp-partis">${ok ? m.cands.slice(0, tour === 2 ? 2 : 3).map(c => `<span style="--c:${c.c}"><i></i>${esc(c.court)} <b>${nf(pc(m, c.v), 1)} %</b></span>`).join("") : `<span>En attente des premiers résultats</span>`}</div>`;
}

/* ---------- carte ---------- */
let svg, gZ, ZOOM, PATH, MW = 760, MH = 500, tip, gSuiv, gSel;
const ZONES = { sof: ["23", "24", "25"], plo: ["16", "17"], soff: ["23", "24", "25", "26"] };
const echPart = v => d3.interpolateYlGnBu(Math.max(0, Math.min(1, (v - 10) / 45)));   // 10 % : très pâle · 55 % et plus : foncé
function remplir(k) {
  const d = D();
  if (carteParticip) { const m = d?.mirs?.[k], p = m && particip(m.activite); return p ? [echPart(p.pct), 1] : ["var(--soft)", 1]; }
  const m = enMir(k);
  if (!m) return ["var(--soft)", 1];
  const c = m.cands[0].c;
  if (carteMarge) return [c, Math.max(0.2, Math.min(1, 0.2 + ecart(m) / 40))];
  const f = fraction(m);
  return [c, f == null ? 1 : 0.35 + 0.65 * f];
}
function dessinerCarte() {
  if (!gZ) return;
  gZ.selectAll("path.lv-rid").each(function (f) { const [col, op] = remplir(String(f.properties.n)); this.style.fill = col; this.style.fillOpacity = op; });
  gSel.selectAll("path").data(sel == null || sel === ETR ? [] : GEO.features.filter(f => String(f.properties.n) === sel)).join("path").attr("class", "lv-selline").attr("d", PATH);
  dessinerContoursSuivis(); dessinerLegende();
}
function dessinerLegende() {
  const d = D();
  let html;
  if (carteParticip) html = [15, 25, 35, 45, 55].map(v => `<span class="ed-legende-k" style="--c:${echPart(v)}"><i></i>${v} %</span>`).join("") + `<span>· participation par circonscription (dernière heure publiée) · gris : pas encore publiée</span>`;
  else {
    const pres = aRes(d) ? [...new Map(Object.keys(d.mirs).filter(k => k !== ETR && enMir(k, d)).map(k => d.mirs[k].cands[0]).map(c => [c.k, c])).values()] : ["iot", "gyu"].map(k => ({ k, ...CANDS[k] }));
    html = pres.map(c => `<span class="ed-legende-k" style="--c:${c.c}"><i></i>${esc(c.court)} en tête</span>`).join("")
      + `<span>${carteMarge ? "· couleur d'autant plus foncée que l'écart est grand (pleine à 32 points et plus)" : "· plus la couleur est pâle, moins de protocoles sont traités"} · gris : aucun résultat</span>`;
  }
  const etr = d && enMir(ETR, d);
  html += `<span data-rid="${ETR}" tabindex="0" role="button" style="cursor:pointer;display:block;margin-top:4px">🌍 <b>Vote à l'étranger (МИР 32, hors carte)</b> : ${etr ? etr.cands.slice(0, 2).map(c => `<span style="color:${c.c};font-weight:700">${esc(c.court)} ${nf(pc(etr, c.v), 1)} %</span>`).join(" · ") + ` · ${nf(etr.total)} votes${etr.final ? "" : etr.pct != null ? ` · ${nf(etr.pct, 0)} % des protocoles` : ""}` : "aucun résultat"} ›</span>`;
  $("edLegende").innerHTML = html;
}
function dessinerContoursSuivis() {
  const b = $("lvCarteSuivis");
  b.setAttribute("aria-pressed", carteSuivis); b.textContent = carteSuivis ? `★ Suivies (${suivies.size})` : "★ Suivies";
  if (!gSuiv) return;
  const d = carteSuivis ? GEO.features.filter(f => suivies.has(String(f.properties.n))) : [];
  gSuiv.selectAll("path.lv-suivi-halo").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-halo").attr("d", PATH);
  gSuiv.selectAll("path.lv-suivi-ligne").data(d, f => f.properties.n).join("path").attr("class", "lv-suivi-ligne").attr("d", PATH).style("stroke", "#F5B83D");
  gSuiv.selectAll("path.lv-suivi-ligne").raise();
}
function infobulle(e, f) {
  const k = String(f.properties.n), m = enMir(k), d = D();
  tip.hidden = false;
  const box = svg.node().parentNode.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 12, box.width - 240) + "px"; tip.style.top = Math.min(e.clientY - box.top + 12, box.height - 130) + "px";
  const p = d?.mirs?.[k] && particip(d.mirs[k].activite);
  tip.innerHTML = `<b>${suivies.has(k) ? "★ " : ""}${esc(NOMS[k])}</b>` + (m ? m.cands.slice(0, 3).map(c => `<span class="ed-tip-l" style="--c:${c.c}"><span><i></i>${esc(c.court)}</span><b>${nf(pc(m, c.v), 1)} %</b></span>`).join("")
    + `<small>${m.final ? "complet" : m.pct != null ? nf(m.pct, 0) + " % des protocoles" : ""}${p ? ` · participation ${nf(p.pct, 1)} % ${hLib(p.h)}` : ""}</small>`
    : `<br><small>Aucun résultat${p ? ` · participation ${nf(p.pct, 1)} % ${hLib(p.h)}` : ""}</small>`);
}
function construireCarte() {
  if (svg) return;
  const proj = d3.geoMercator().fitExtent([[10, 10], [MW - 10, MH - 10]], GEO);
  PATH = d3.geoPath(proj);
  svg = d3.select($("lvCarte")).attr("viewBox", `0 0 ${MW} ${MH}`);
  svg.selectAll("*").remove();
  gZ = svg.append("g");
  gZ.append("g").selectAll("path").data(GEO.features).join("path").attr("class", "lv-rid").attr("d", PATH)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => NOMS[f.properties.n])
    .on("click", (e, f) => choisir(String(f.properties.n)))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(String(f.properties.n)); } })
    .on("mousemove", infobulle).on("mouseleave", () => { tip.hidden = true; });
  gSuiv = gZ.append("g"); gSel = gZ.append("g");
  ZOOM = d3.zoom().scaleExtent([1, 40]).translateExtent([[-100, -100], [MW + 100, MH + 100]]).on("zoom", e => gZ.attr("transform", e.transform));
  svg.call(ZOOM).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) { sel = null; dessinerCarte(); dessinerPanneau(); } });
  dessinerCarte();
}
function zoomer(z) {
  const vers = ([[x0, y0], [x1, y1]]) => {
    const k = Math.min(40, 0.9 / Math.max((x1 - x0) / MW, (y1 - y0) / MH));
    svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity.translate(MW / 2, MH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  if (z === "tout") svg.transition().duration(600).call(ZOOM.transform, d3.zoomIdentity);
  else if (ZONES[z]) vers(PATH.bounds({ type: "FeatureCollection", features: GEO.features.filter(f => ZONES[z].includes(String(f.properties.n))) }));
  else if (z === "plus") svg.transition().duration(250).call(ZOOM.scaleBy, 1.6);
  else if (z === "moins") svg.transition().duration(250).call(ZOOM.scaleBy, 1 / 1.6);
}
let info = () => {}, plein = () => false;
function preparerCarte() {
  tip = $("lvTip");
  $("lvZoom").innerHTML = `<button type="button" data-z="tout">Toute la Bulgarie</button><button type="button" data-z="sof">Sofia</button><button type="button" data-z="plo">Plovdiv</button>`
    + `<button type="button" data-z="plus" aria-label="Zoom avant">+</button><button type="button" data-z="moins" aria-label="Zoom arrière">−</button>`
    + `<span class="lv-groupe" role="group" aria-label="Affichage de la carte (un seul à la fois, ou aucun)"><button type="button" data-z="marge" id="edMarge" aria-pressed="false" title="Couleur du candidat en tête, d'autant plus foncée que l'écart est grand">Écart</button>`
    + `<button type="button" data-z="particip" id="edParticip" aria-pressed="false" title="Taux de participation par circonscription">Participation</button></span>`;
  const carte = $("lvCarte").parentElement;
  carte.addEventListener("wheel", e => { if (!e.target.closest(".lv-panneau")) e.preventDefault(); }, { passive: false });
  carte.addEventListener("click", e => {
    const z = e.target.closest(".lv-zoom button")?.dataset.z; if (!z) return;
    if (z === "plein") pleinEcran();
    else if (z === "marge" || z === "particip") basculer(z);
    else zoomer(z);
  });
  $("lvCarteSuivis").addEventListener("click", () => { carteSuivis = !carteSuivis; ecrireLS(localStorage, "bgCarteSuivies", carteSuivis); dessinerContoursSuivis(); });
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
// Écart / Participation : un seul à la fois, ou aucun
function basculer(z) {
  carteMarge = z === "marge" && !carteMarge;
  carteParticip = z === "particip" && !carteParticip;
  $("edMarge").setAttribute("aria-pressed", carteMarge); $("edParticip").setAttribute("aria-pressed", carteParticip);
  dessinerCarte();
}

/* ---------- fiche (panneau de droite) ---------- */
function ligneCands(m, c) {
  return `<tr style="--c:${c.c}"><td>${avatar(c)}</td><td><b>${esc(c.nom)}</b>${c.elu ? ` <span class="lv-sortant">${tour === 1 ? "qualifié·e" : c.g === "f" ? "élue" : "élu"}</span>` : ""}<small>${c.vp ? "avec " + esc(c.vp) : esc(c.appui || "")}</small>`
    + `<span class="lv-jauge"><i style="width:${Math.min(100, pc(m, c.v))}%"></i></span></td><td class="lv-num"><b>${nf(pc(m, c.v), 1)} %</b><small>${nf(c.v)}</small></td></tr>`;
}
function resume(d, k, lib) {                                         // une ligne : résultat d'un autre tour (ou de 2021) dans la circonscription
  const m = d && enMir(k, d); if (!m) return "";
  return `<p class="lv-muted lv-proj">${lib} : ${m.cands.slice(0, 3).map(c => `<b style="color:${c.c}">${esc(c.court)}</b> ${nf(pc(m, c.v), 1)} %`).join(" · ")}`
    + `${m.final || m.pct == null ? "" : ` (${nf(m.pct, 0)} % des protocoles)`}${(() => { const p = particip(m.activite); return p ? ` · participation ${nf(p.pct, 1)} % ${hLib(p.h)}` : ""; })()}</p>`;
}
function dessinerPanneau() {
  const p = $("lvPanneau"), d = D();
  if (sel == null) {
    const n = d ? Object.keys(d.mirs).filter(k => k !== ETR && enMir(k, d)).length : 0;
    p.innerHTML = `<span class="lv-eyebrow">Circonscriptions électorales (МИР)</span><h3>Clique sur une circonscription</h3>
      <p class="lv-muted">31 circonscriptions sur la carte : les 28 provinces, mais Sofia-ville en compte trois (23, 24 et 25) et la province de Plovdiv deux (la ville, 16, et le reste, 17). Le vote à l'étranger forme la 32e, hors carte (lien sous la carte). Couleur : candidat en tête ; plus pâle tant que les protocoles ne sont pas tous traités.</p>
      <div class="lv-kv"><div><b>${n}</b><span>avec résultats</span></div><div><b>${NB - n}</b><span>sans résultat</span></div><div><b>${d?.pct != null ? nf(d.pct, 1) + " %" : "—"}</b><span>protocoles</span></div></div>`;
    return;
  }
  const m = enMir(sel), brutM = d?.mirs?.[sel];
  let html = `<span class="lv-eyebrow">${sel === ETR ? "Hors carte" : "Circonscription"} · МИР ${esc(sel)} · ${tour === 1 ? "1er tour" : DEMO ? "démo 2021" : "2e tour"}</span><h3>${esc(NOMS[sel])}</h3>`
    + `<p class="lv-muted" style="margin-top:-6px">${esc(NOMS_BG[sel])}</p>`
    + `<div class="lv-suivre-pour"><button type="button" class="lv-suivre" data-suivre="${sel}" aria-pressed="${suivies.has(sel)}" style="--c:#B7860B">${suivies.has(sel) ? "★ Suivie" : "☆ Suivre"}</button></div>`;
  if (m) {
    const [a, b] = m.cands, ec = b ? a.v - b.v : a.v;
    html += `<div class="lv-chips"><span class="lv-chip ${m.final ? "fin" : ""}">${m.final ? "Protocoles tous traités" : m.pct != null ? `${nf(m.pct, 2)} % des protocoles` : "Traitement en cours"}</span></div>`
      + `<p class="lv-tete" style="--c:${a.c}"><b>${esc(a.nom)}</b> en tête${b ? ` par ${nf(ec)} voix (${nf(pc(m, a.v) - pc(m, b.v), 1)} pt)` : ""}</p>`
      + `<table class="lv-cands"><tbody>${montres(m).map(c => ligneCands(m, c)).join("")}`
      + `<tr style="--c:${NSP.c}"><td>${avatar({ ...NSP, k: "nsp" })}</td><td><b>${NSP.nom}</b><small>« ${NSP.bg} »</small><span class="lv-jauge"><i style="width:${pc(m, m.nsp)}%"></i></span></td><td class="lv-num"><b>${nf(pc(m, m.nsp), 1)} %</b><small>${nf(m.nsp)}</small></td></tr></tbody></table>`;
  } else html += `<div class="lv-chips"><span class="lv-chip">Aucun résultat pour l'instant</span></div>`;
  const act = (brutM?.activite || []).filter(x => x.inscrits > 0);
  if (act.length) html += `<p class="lv-muted">Participation : ${act.map(x => `${hLib(x.h).replace(/^à /, "")} <b>${nf(x.pct, 1)} %</b>`).join(" · ")} (${nf(act[act.length - 1].inscrits)} inscrits)</p>`;
  else if (sel === ETR) html += `<p class="lv-muted">À l'étranger, pas de liste électorale préalable : la CIK ne publie pas de taux de participation.</p>`;
  if (tour === 2 && !DEMO) html += resume(T1, sel, "1er tour (25 oct.)");
  if (tour === 1) html += resume(T2, sel, DEMO ? "Démo 2021" : "2e tour (1er nov.)");
  if (!DEMO) html += resume(R21, sel, "2e tour de 2021 (Radev contre Gerdjikov)");
  p.innerHTML = html;
}
// initiales cerclées de la couleur du candidat (pas de photos : aucune source officielle libre)
function avatar(c) {
  const mots = String(c.nom || "").trim().split(/\s+/);
  const ini = c.k === "nsp" ? "∅" : c.k === "aut" ? "+" : ((mots[0] || "")[0] || "") + ((mots.length > 1 ? mots[mots.length - 1] : "")[0] || "");
  return `<span class="lv-ava lv-ini" style="--c:${c.c}" aria-hidden="true">${esc(ini.toUpperCase())}</span>`;
}

/* ---------- circonscriptions suivies, alertes, classement ---------- */
let suivies = new Set(lireLS(localStorage, "bgSuivies", []));
let carteSuivis = lireLS(localStorage, "bgCarteSuivies", false), triClassement = lireLS(localStorage, "bgTri", "serre");
let connus = lireLS(sessionStorage, DEMO ? "bgConnusDemo" : "bgConnus", null);
function basculerSuivie(k) {
  suivies.has(k) ? suivies.delete(k) : suivies.add(k);
  ecrireLS(localStorage, "bgSuivies", [...suivies]);
  dessinerSuivi(); dessinerPanneau(); dessinerContoursSuivis();
}
const ordreMir = () => Object.keys(NOMS).sort((a, b) => +a - +b);
function ligne(k) {
  const m = enMir(k), a = m && m.cands[0], d = D(), p = d?.mirs?.[k] && particip(d.mirs[k].activite);
  const droite = triClassement === "part" ? (p ? `${nf(p.pct, 1)} %` : "—") : a ? `${esc(a.court)} +${nf(ecart(m), 1)} pt` : "—";
  return `<li class="lv-ligne" data-rid="${k}" tabindex="0"><button type="button" class="lv-etoile" data-suivre="${k}" aria-pressed="${suivies.has(k)}" aria-label="Suivre ${esc(NOMS[k])}">${suivies.has(k) ? "★" : "☆"}</button>`
    + `<span class="lv-nom" style="--c:${a ? a.c : "var(--soft)"}"><i></i>${k === ETR ? "🌍 " : ""}${esc(NOMS[k])}</span>`
    + `<span class="lv-ecart">${droite}<small>${triClassement === "part" ? (p ? hLib(p.h).replace(/^à /, "") : "") : m ? (m.final ? "complet" : m.pct != null ? nf(m.pct, 0) + " % protocoles" : "") : ""}</small></span></li>`;
}
function dessinerSuivi() {
  $("lvSuivies").innerHTML = suivies.size ? `<ul class="lv-lignes">${[...suivies].filter(k => NOMS[k]).sort((a, b) => +a - +b).map(ligne).join("")}</ul>`
    : `<p class="lv-muted">Clique sur ☆ dans la fiche ou le classement pour suivre une circonscription : elle s'affiche ici, et une alerte apparaît quand le candidat en tête y change.</p>`;
  const TRIS = [["serre", "Plus serrées"], ["part", "Participation"], ["num", "Par numéro"]];
  $("lvPPChoix").innerHTML = TRIS.map(([k, l]) => `<button type="button" data-tri="${k}" aria-pressed="${triClassement === k}">${l}</button>`).join("");
  const d = D(), pa = k => { const p = d?.mirs?.[k] && particip(d.mirs[k].activite); return p ? p.pct : -1; };
  const codes = ordreMir().sort((a, b) => {
    if (triClassement === "num") return +a - +b;
    if (triClassement === "part") return pa(b) - pa(a) || +a - +b;
    const ma = enMir(a), mb = enMir(b);
    return (ma ? ecart(ma) : 999) - (mb ? ecart(mb) : 999) || +a - +b;
  });
  $("lvParParti").innerHTML = `<ul class="lv-lignes">${codes.map(ligne).join("")}</ul>`;
}
// alertes (2e tour) : candidat en tête qui change dans une circonscription suivie, ou dans l'ensemble
function surveiller() {
  if (!T2) return;
  const now = {};
  for (const k of Object.keys(NOMS)) { const m = enMir(k, T2); if (m) now[k] = m.cands[0].k; }
  if (aRes(T2)) now.nat = T2.nat.cands[0].k;
  const nomK = k => T2.nat.cands.find(c => c.k === k)?.court || k;
  if (connus) {
    for (const k of suivies) if (now[k] && connus[k] && now[k] !== connus[k]) alerter(`${NOMS[k]} : ${nomK(now[k])} passe en tête devant ${nomK(connus[k])}`, T2.info && Object.values(T2.info).find(c => c.k === now[k])?.c);
    if (now.nat && connus.nat && now.nat !== connus.nat) alerter(`Ensemble de la Bulgarie : ${nomK(now.nat)} passe en tête`, Object.values(T2.info).find(c => c.k === now.nat)?.c);
  }
  connus = now; ecrireLS(sessionStorage, DEMO ? "bgConnusDemo" : "bgConnus", connus);
}
function alerter(txt, c) {
  const el = document.createElement("div");
  el.className = "lv-alerte"; el.style.setProperty("--c", c || "#B7860B"); el.textContent = "★ " + txt;
  $("lvAlertes").appendChild(el); setTimeout(() => el.remove(), 12000);
}

/* ---------- blocs du bas : candidats, participation, sondages, comment ça marche ---------- */
// sondages : compilation de Wikipédia (« 2026 Bulgarian presidential election »), indécis et abstentionnistes exclus, lue le 26 octobre 2026
const SOND2 = [{ s: "Sova Harris", d: "13–17 oct. 2026", n: 1000, iot: 65.8, gyu: 34.2 }];
const SOND1 = [
  { s: "Gallup International", d: "14–22 oct.", n: 1001, iot: 44.2, gyu: 30.4, kos: 12.7 },
  { s: "Alpha Research", d: "18–22 oct.", n: 1000, iot: 41.1, gyu: 28.3, kos: 12.8 },
  { s: "Trend", d: "14–20 oct.", n: 1002, iot: 45.9, gyu: 27.8, kos: 10.9 },
  { s: "Myara", d: "8–19 oct.", n: 1009, iot: 43.4, gyu: 28.9, kos: 10.2 },
  { s: "Market Links", d: "13–19 oct.", n: 1006, iot: 47.3, gyu: 30.6, kos: 10.3 },
  { s: "Sova Harris", d: "13–17 oct.", n: 1000, iot: 49.2, gyu: 24.8, kos: 9.5 },
];
function dessinerBlocs() {
  const r1 = k => { if (!aRes(T1)) return null; const c = T1.nat.cands.find(x => x.k === k); return c ? pc(T1.nat, c.v) : null; };
  const etr1 = T1 && enMir(ETR, T1);
  const cand = k => { const c = CANDS[k], v = r1(k), e = etr1?.cands.find(x => x.k === k);
    return `<li class="ed-q" style="--c:${c.c}"><header><b>${esc(c.nom)}</b><span>vice-présidence : ${esc(c.vp)}</span></header><p>${esc(c.qui)}.</p><p>${esc(c.appui)}.</p>`
      + `<p class="lv-muted">Colistier : ${esc(c.vp)}, ${esc(c.vpQui)}.</p>`
      + (v != null ? `<span class="ed-q-sond">1er tour : <b>${nf(v, 2)} %</b>${e ? ` · à l'étranger : <b>${nf(pc(etr1, e.v), 1)} %</b>` : ""}${T1.final ? "" : ` (${nf(T1.pct, 1)} % des protocoles)`}</span>` : "") + `</li>`; };
  const kos = r1("kos");
  const blocCands = `<section class="ed-bloc" aria-labelledby="edCandsTitre"><h3 id="edCandsTitre">Le 2e tour : Iotova contre Gyurov</h3>
    <p>Iliana Iotova, vice-présidente depuis 2017, est présidente depuis le 23 janvier 2026 : Roumen Radev a alors démissionné pour se lancer en politique avec Bulgarie progressiste, et il est premier ministre depuis mai 2026. Andrey Gyurov a dirigé le gouvernement par intérim nommé par Iliana Iotova avant les législatives anticipées. Le 2e tour oppose les deux premiers du 1er tour${kos != null ? ` ; Kostadin Kostadinov (Renaissance, droite nationaliste) a fini troisième avec ${nf(kos, 1)} %` : ""}.</p>
    <ol class="ed-qs">${cand("iot")}${cand("gyu")}</ol></section>`;
  // participation par heure : 1er tour 2026, 2e tour 2026, 2e tour 2021
  const heures = ["11:00", "16:00", "20:00"], val = (d, h) => { const x = (d?.activite || []).find(a => a.h === h); return x ? `${nf(x.pct, 2)} %` : "—"; };
  const fin = d => { const p = d && particip(d.activite, d.proto); return p ? `${nf(p.pct, 2)} %` : "—"; };
  const part1 = () => { const p = T1 && particip(T1.activite, T1.proto);
    return p && (p.h === "20:00" || p.h === "fin") ? `${nf(p.pct, 1)} % des inscrits, d'après la CIK` : `environ 22 % des inscrits selon les décomptes parallèles des sondeurs${p ? ` (${nf(p.pct, 2)} % ${hLib(p.h)} d'après la CIK)` : ""}`; };
  const lignes = [["1er tour 2026 (25 oct.)", T1], [DEMO ? "2e tour (démo 2021)" : "2e tour 2026 (1er nov.)", T2], ["2e tour 2021 (21 nov.)", R21]];
  const blocPart = `<section class="ed-bloc" aria-labelledby="edPartTitre"><h3 id="edPartTitre">Participation : le grand sujet</h3>
    <p>Le 1er tour a connu la participation la plus faible de l'histoire des présidentielles bulgares : ${part1()}. Sans plus de 50 % de votants, personne ne pouvait être élu au 1er tour ; au 2e tour, aucun seuil ne s'applique. La CIK publie la participation à 11 h, à 16 h et à 20 h (heures de Sofia) ; celle de 20 h vient des protocoles des bureaux de vote.</p>
    <div class="ed-sond"><table><thead><tr><th>Tour</th>${heures.map(h => `<th>${hLib(h).replace(/^à /, "").replace(" (fermeture)", "")}</th>`).join("")}<th>Votants</th></tr></thead><tbody>`
    + lignes.map(([l, d]) => `<tr><td><b>${l}</b></td>${heures.map(h => `<td>${val(d, h)}</td>`).join("")}<td>${(() => { const p = d && particip(d.activite, d.proto); return p?.votants ? nf(p.votants) : "—"; })()}</td></tr>`).join("")
    + `</tbody></table></div><p>Pourcentage des électeurs inscrits sur les listes en Bulgarie (le vote à l'étranger se fait sans liste préalable). Le mode « Participation » de la carte montre chaque circonscription.</p></section>`;
  const mini = (a, b, ca, cb) => `<span class="ed-mini" role="img" aria-label="Iotova ${a} %, Gyurov ${b} %"><i style="width:${a}%;background:${ca}"></i><i style="width:${b}%;background:${cb}"></i></span>`;
  const blocSond = `<section class="ed-bloc" aria-labelledby="edSondTitre"><h3 id="edSondTitre">Sondages</h3>
    <p>Un seul sondage publié sur un duel Iotova-Gyurov, avant le 1er tour. Les sondages du 1er tour surestimaient nettement Iliana Iotova : elle les donnait gagnante par 11 à 24 points sur Andrey Gyurov ; l'écart réel a été d'environ ${aRes(T1) && r1("iot") != null && r1("gyu") != null ? nf(r1("iot") - r1("gyu"), 1) : "3"} points.</p>
    <div class="ed-sond"><table><thead><tr><th>Duel au 2e tour</th><th>Iotova</th><th>Gyurov</th><th>Écart</th><th>Échantillon</th><th class="ed-sond-barre">Répartition</th></tr></thead><tbody>${SOND2.map(p => `<tr><td><b>${p.s}</b><small>${p.d}</small></td><td>${nf(p.iot, 1)} %</td><td>${nf(p.gyu, 1)} %</td><td>+${nf(p.iot - p.gyu, 1)}</td><td>${nf(p.n)}</td><td class="ed-sond-barre">${mini(p.iot, p.gyu, CANDS.iot.c, CANDS.gyu.c)}</td></tr>`).join("")}</tbody></table></div>
    <div class="ed-sond"><table><thead><tr><th>1er tour (derniers sondages)</th><th>Iotova</th><th>Gyurov</th><th>Kostadinov</th><th>Échantillon</th></tr></thead><tbody>${SOND1.map(p => `<tr><td><b>${p.s}</b><small>${p.d}</small></td><td>${nf(p.iot, 1)} %</td><td>${nf(p.gyu, 1)} %</td><td>${nf(p.kos, 1)} %</td><td>${nf(p.n)}</td></tr>`).join("")}`
    + (aRes(T1) ? `<tr><td><b>Résultat du 1er tour</b><small>CIK${T1.final ? "" : `, ${nf(T1.pct, 1)} % des protocoles`}</small></td><td><b>${nf(r1("iot"), 1)} %</b></td><td><b>${nf(r1("gyu"), 1)} %</b></td><td><b>${nf(r1("kos"), 1)} %</b></td><td>${nf(T1.nat.total)}</td></tr>` : "")
    + `</tbody></table></div><p>Compilation de Wikipédia (« 2026 Bulgarian presidential election », sondages publiés par les maisons de sondage), indécis et abstentionnistes exclus ; les résultats de la CIK, eux, comptent aussi « Je ne soutiens personne ».</p></section>`;
  const blocComment = `<section class="ed-bloc" aria-labelledby="edCommentTitre"><h3 id="edCommentTitre">Comment est élu le président de la Bulgarie</h3>
    <div class="ed-voter">
      <div><h4>Un duo élu au suffrage direct</h4><p>Le président et le vice-président sont élus ensemble, sur une même « paire de candidats », pour cinq ans, renouvelables une fois. Il faut être Bulgare de naissance, avoir au moins 40 ans et avoir vécu en Bulgarie les cinq dernières années. Les candidatures viennent de partis, de coalitions ou de comités d'initiative (comme celles d'Iotova et de Gyurov).</p></div>
      <div><h4>Deux tours</h4><p>Au 1er tour, il faut plus de la moitié des votes valides <b>et</b> une participation de plus de 50 % des inscrits. Sinon, un 2e tour a lieu une semaine plus tard entre les deux premiers : la paire qui obtient le plus de voix l'emporte, quelle que soit la participation. Depuis 2016, le bulletin offre aussi la case « Je ne soutiens personne » (« Не подкрепям никого »), comptée parmi les votes valides.</p></div>
      <div><h4>Le dépouillement</h4><p>Chaque bureau de vote (SIK) compte ses bulletins (papier ou machine à voter) et remplit un protocole ; les 31 commissions régionales (RIK) les saisissent, et la CIK publie l'avancement en pourcentage de protocoles traités. Le vote à l'étranger, dans des bureaux ouverts dans des dizaines de pays, forme une 32e circonscription.</p></div>
      <div><h4>Le rôle du président</h4><p>Chef de l'État et commandant en chef des forces armées, il représente le pays, promulgue les lois (avec un veto que l'Assemblée peut renverser à la majorité absolue), nomme les ambassadeurs et, quand aucun gouvernement ne peut être formé, nomme un premier ministre par intérim et convoque des élections anticipées. Le pouvoir exécutif appartient au gouvernement, issu de l'Assemblée nationale.</p></div>
      <div><h4>L'enjeu</h4><p>Un duel entre la présidente sortante, proche du gouvernement de Roumen Radev, et un ancien premier ministre par intérim porté par l'opposition proeuropéenne : la présidence, contrepoids au gouvernement, peut renvoyer des lois et pèse dans les crises politiques, nombreuses depuis 2021 (huit élections législatives depuis 2021).</p></div>
      <div><h4>Les circonscriptions</h4><p>Les 31 circonscriptions électorales (МИР) des législatives servent au décompte : 28 provinces, Sofia-ville coupée en trois (23 au sud, 24 au centre et à l'est, 25 à l'ouest et au nord) et Plovdiv en deux (la ville et le reste de la province).</p></div>
    </div></section>`;
  $("edBlocs").innerHTML = blocCands + blocPart + blocSond + blocComment;
  $("edSource").innerHTML = `Sources : résultats de la <a href="${SITE}" target="_blank" rel="noopener">Commission électorale centrale (ЦИК / CIK)</a>, préliminaires jusqu'à la proclamation (données publiques, réutilisables selon la loi bulgare sur l'accès à l'information publique) ;
    1er tour : <a href="https://results.cik.bg/pvr202610/rezultati/index.html" target="_blank" rel="noopener">results.cik.bg/pvr202610</a> ; 2e tour de 2021 : results.cik.bg/pvrns2021/tur2.
    Carte : provinces et communes de geoBoundaries (domaine public), arrondissements de Sofia d'OpenStreetMap (© contributeurs d'OpenStreetMap, ODbL), contours simplifiés.
    Sondages : compilation de Wikipédia (CC BY-SA). Candidats : CIK, BTA, BNT. Cette page est temporaire.`;
}

/* ---------- ensemble ---------- */
function dessiner() {
  dessinerEtat(); dessinerChoix(); dessinerNational(); dessinerCarte(); dessinerPanneau(); dessinerSuivi(); dessinerBlocs(); dessinerCompte();
}
function choisirTour(t) {
  tour = t; if (!DEMO) ecrireLS(sessionStorage, "bgTour", t);
  dessiner();
}
function choisir(k, defiler = true) {
  sel = k; dessinerCarte(); dessinerPanneau();
  if (plein()) info(true);
  else if (defiler && innerWidth <= 900) $("lvPanneau").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

let demarre = false;
async function demarrer() {
  if (demarre) return; demarre = true;
  document.head.insertAdjacentHTML("beforeend", `<style>@media (max-width: 600px) { .vue-direct .lv-zoom [data-z="plo"] { display: none; } }</style>`);
  try {
    const [geo, r21] = await Promise.all([
      fetch(DOSSIER + "circonscriptions.json", { cache: "no-cache" }).then(r => r.json()),
      fetch(DOSSIER + "demo-2021.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    GEO = geo; R21 = preparer(r21);
    // contours dans le sens attendu par d3 (sinon un polygone couvre toute la sphère)
    for (const f of GEO.features) if (d3.geoArea(f) > 2 * Math.PI) { const rev = x => x.map(r => r.slice().reverse()); f.geometry.coordinates = f.geometry.type === "Polygon" ? rev(f.geometry.coordinates) : f.geometry.coordinates.map(rev); }
    for (const f of GEO.features) { NOMS[f.properties.n] = f.properties.nom; NOMS_BG[f.properties.n] = f.properties.bg; }
    NOMS[ETR] = "À l'étranger"; NOMS_BG[ETR] = "Извън страната";
    dessinerHeures(); preparerCarte(); construireCarte();
  } catch (e) { $("lvEtat").textContent = "Chargement impossible : " + e.message; return; }
  document.addEventListener("click", e => {
    if (!e.target.closest?.("#vue-direct")) return;
    const s = e.target.closest("[data-suivre]"); if (s) { e.stopPropagation(); basculerSuivie(s.dataset.suivre); return; }
    const t = e.target.closest("[data-tri]"); if (t) { triClassement = t.dataset.tri; ecrireLS(localStorage, "bgTri", triClassement); dessinerSuivi(); return; }
    const tt = e.target.closest("[data-tour]"); if (tt) { choisirTour(+tt.dataset.tour); return; }
    const l = e.target.closest("[data-rid]"); if (l) choisir(l.dataset.rid);
  });
  document.addEventListener("keydown", e => {
    const l = e.target.closest?.("[data-rid]");
    if (l && (e.key === "Enter" || e.key === " ") && e.target === l) { e.preventDefault(); choisir(l.dataset.rid, false); }
  });
  $("lvPPReplier").addEventListener("click", () => { const ouvert = $("lvPPSection").hasAttribute("data-ferme"); $("lvPPSection").toggleAttribute("data-ferme", !ouvert); $("lvPPReplier").setAttribute("aria-expanded", ouvert); });
  $("lvMaj").addEventListener("click", actualiser);
  dessiner();
  await actualiser();
  setInterval(() => { if (!document.hidden && Date.now() >= prochaine) actualiser(); afficherDecompte(); }, 1000);
  setInterval(dessinerHeures, 60000);
}
window.addEventListener("vue-direct", demarrer);
if (!$("vue-direct").hidden) demarrer();
