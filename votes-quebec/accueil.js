/* Accueil de la section « Intentions de vote et simulations » (intentions-simulations.html).
   Une carte par endroit (ses simulations sur une ligne compacte au bas de sa carte), courte : on clique pour le détail. Chiffre clé, barre des
   sièges, au plus une ou deux lignes de contexte et la date des données (fichiers légers seulement). Les résultats en direct (live.js) reviendront le soir
   d'une élection. */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");
const lireJ = u => fetch(u, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);

// couleurs des partis (mêmes teintes que les pages)
const CQ = { PQ: "var(--pq)", PLQ: "var(--plq)", CAQ: "var(--caq)", PCQ: "var(--pcq)", QS: "var(--qs)" };
const CC = { PLC: "#D7262E", PCC: "#2D5BC4", BQ: "#21A9C9", NPD: "#F28A1D", PVC: "#3D9B35" };
const CU = { D3: "#1E4CA6", D2: "#4F82DE", D1: "#93B5EE", T: "#C9A93A", R1: "#F2A0A0", R2: "#E05A5A", R3: "#A81E1E" };

// barre des sièges : segments proportionnels, ligne de majorité
function barre(parts, total, maj) {
  return `<div class="ac-barre" role="img" aria-label="${parts.map(p => `${p.lab} ${p.n}`).join(", ")}">${parts.filter(p => p.n > 0).map(p =>
    `<span style="flex:${p.n};background:${p.c}" title="${esc(p.lab)} : ${p.n}">${p.n / total > 0.13 ? `${esc(p.lab)} ${p.n}` : p.n / total > 0.05 ? p.n : ""}</span>`).join("")}
    ${maj ? `<i style="left:${100 * maj / total}%" title="majorité : ${maj}"></i>` : ""}</div>`;
}
function carte({ url, eyebrow, titre, chiffre, legende, barreHtml, phrase, donnees, sous }) {
  // carte avec sous-carte : contenu de la page, puis ses simulations en plus petit dessous (deux liens, pas de lien imbriqué)
  if (sous) return `<div class="ac-carte ac-large"><a class="ac-principal" href="${url}">
    <span class="lv-eyebrow">${eyebrow}</span>
    <h3>${titre}</h3>
    <div class="ac-chiffre">${chiffre}</div>
    <p class="ac-legende">${legende}</p>
    ${barreHtml}
    ${phrase ? `<p class="ac-phrase">${phrase}</p>` : ""}
    <p class="ac-dates">${donnees}</p>
    <span class="ac-lien">Ouvrir la page →</span></a>
    <div class="ac-sims">${sous}</div></div>`;
  return `<a class="ac-carte" href="${url}">
    <span class="lv-eyebrow">${eyebrow}</span>
    <h3>${titre}</h3>
    <div class="ac-chiffre">${chiffre}</div>
    <p class="ac-legende">${legende}</p>
    ${barreHtml}
    ${phrase ? `<p class="ac-phrase">${phrase}</p>` : ""}
    <p class="ac-dates">${donnees}</p>
    <span class="ac-lien">Ouvrir la page →</span></a>`;
}

async function demarrer() {
  const [QE, CP, UP, FA, FP, L39, UPR, DEP, CHP, ABP] = await Promise.all([
    lireJ("votes-quebec/election-2026.json"), lireJ("votes-canada/projection.json"), lireJ("votes-usa/projection.json"),
    lireJ("votes-france/assemblee.json"), lireJ("votes-france/sondages-pres.json"), lireJ("votes-quebec/loi39-resume.json"),
    lireJ("votes-usa/presidentielle.json"), lireJ("votes-allemagne/projection.json"), lireJ("votes-suisse/projection.json"),
    lireJ("votes-alberta/projection.json")]);
  // cartes groupées comme la bande d'onglets : par continent, et en Amérique du Nord les provinces puis les pays
  const cartes = { "amn-prov": [], "amn-pays": [], "eur-pays": [] };
  const CONTINENTS = [["amn", "Amérique du Nord", [["prov", "Provinces"], ["pays", "Pays"]]], ["eur", "Europe", [["pays", "Pays"]]]];

  // Loi 39 : simulation sur les votes du Québec, en petit dans la carte de Votes Québec
  let sousQc = "";
  if (L39) {
    const ordre = Object.keys(L39.loi39).sort((a, b) => L39.loi39[b] - L39.loi39[a]), lead = ordre[0], maj = Math.floor(L39.sieges_loi39 / 2) + 1;
    sousQc = `<a class="ac-sous ac-sous-ligne" href="loi39.html" title="Simulation : mode de scrutin mixte compensatoire régional">
      <span class="lv-eyebrow">Simulation</span><b>Loi 39</b>
      <span><span class="ac-sous-chiffre">${lead} ${L39.loi39[lead]}</span> <small>sur ${L39.sieges_loi39} · ${L39.loi39[lead] >= maj ? "majoritaire" : "minoritaire"}</small></span>
      <span class="ac-lien">→</span>
      ${barre(ordre.map(p => ({ lab: p, n: L39.loi39[p], c: CQ[p] })), L39.sieges_loi39, maj).replace('class="ac-barre"', 'class="ac-barre ac-barre-mini"')}</a>`;
  }
  // Votes Québec : dernier résultat (aucun sondage depuis l'élection)
  if (QE) {
    const s = QE.sieges, ordre = Object.keys(s).sort((a, b) => s[b] - s[a]), lead = ordre[0];
    cartes["amn-prov"].push(carte({ url: "votes-quebec.html", eyebrow: "Intentions de vote · Québec", titre: "Votes Québec",
      chiffre: `${lead} ${s[lead]}`, legende: `sièges sur 127 · ${s[lead] >= 64 ? "majoritaire" : "minoritaire"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: s[p], c: CQ[p] || "var(--aut)" })), 127, 64),
      donnees: `élection du 5 octobre 2026`, sous: sousQc }));
  }
  // Votes Canada : projection Qc125
  if (CP) {
    const N = CP.national, ordre = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => N[b].s - N[a].s), lead = ordre[0];
    cartes["amn-pays"].push(carte({ url: "votes-canada.html", eyebrow: "Projection · Canada", titre: "Votes Canada",
      chiffre: `${lead} ${N[lead].s}`, legende: `sièges sur 343 · ${N[lead].s >= 172 ? "majoritaire" : "minoritaire"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: N[p].s, c: CC[p] || "#8D949A" })), 343, 172),
      donnees: `projection Qc125 du ${dateFr(CP.maj.date)}` }));
  }
  // Votes Alberta : projection des 87 sièges calculée par le site (report proportionnel régional des résultats de 2023)
  if (ABP?.national) {
    const N = ABP.national, CA = { UCP: "#1F5FB4", NPD: "#F28A1D", PT: "#1E9E95", LIB: "#D7262E", VERT: "#3D9B35" };
    const ordre = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => N[b].s - N[a].s), lead = ordre[0];
    cartes["amn-prov"].push(carte({ url: "votes-alberta.html", eyebrow: "Projection · Alberta", titre: "Votes Alberta",
      chiffre: `${lead} ${N[lead].s}`, legende: `sièges projetés sur 87 · ${N[lead].s >= 44 ? "majoritaire" : "minoritaire"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: N[p].s, c: CA[p] || "#8D949A" })), 87, 44),
      phrase: `UCP ${nf(N.UCP.v, 0)} %, NPD ${nf(N.NPD.v, 0)} % dans les sondages ; élection à date fixe le 18 octobre 2027.`,
      donnees: `projection du site du ${dateFr(ABP.maj)}` }));
  }
  // Votes États-Unis : consensus des prévisionnistes (Chambre et Sénat)
  if (UP) {
    const n = {}; Object.values(UP.circ).forEach(c => n[c.r] = (n[c.r] || 0) + 1);
    const d = (n.D3 || 0) + (n.D2 || 0) + (n.D1 || 0), r = (n.R3 || 0) + (n.R2 || 0) + (n.R1 || 0), t = n.T || 0;
    let sen = "";
    if (UP.senat) {
      const k = { D: 0, R: 0, T: 0 };
      for (const e of Object.values(UP.senat.etats)) e.senateurs.forEach((x, i) => {
        const c = e.courses.find(c => c.siege === i + 1), cle = c ? (c.r === "T" ? "T" : c.r[0]) : (x.p === "R" ? "R" : "D"); k[cle]++; });
      sen = `Sénat : D ${k.D} · R ${k.R} · ${k.T} à égalité`;
    }
    const mp = UPR?.marches?.parti, chD = mp ? (mp.polymarket.D + mp.kalshi.D) / 2 : null;
    const marche = chD != null ? `Présidentielle 2028 : ${chD >= 50 ? `démocrates favoris (${nf(chD, 0)} %)` : `républicains favoris (${nf((mp.polymarket.R + mp.kalshi.R) / 2, 0)} %)`}` : "";
    cartes["amn-pays"].push(carte({ url: "votes-usa.html", eyebrow: "Projection · États-Unis", titre: "Votes États-Unis",
      chiffre: `D ${d} · R ${r}`, legende: `sièges à la Chambre · ${t} à égalité`,
      barreHtml: barre(["D3", "D2", "D1", "T", "R1", "R2", "R3"].map(k => ({ lab: k[0] === "T" ? "Égalité" : k[0], n: n[k] || 0, c: CU[k] })), 435, 218),
      phrase: [sen, marche].filter(Boolean).join("<br>"),
      donnees: `consensus 270toWin du ${dateFr(UP.maj)}` }));
  }
  // Votes France : Assemblée actuelle et présidentielle 2027
  if (FA) {
    const g = FA.groupes.slice().sort((a, b) => b.n - a.n), lead = g[0];
    let pres = "";
    if (FP?.sondages?.length) {
      const sp = FP.sondages[FP.sondages.length - 1], top = Object.entries(sp.v).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const [k, x] = top[0];
      pres = `Présidentielle 2027 : ${esc(k.split(" ").slice(1).join(" ") || k)} en tête (${nf(x, 0)} %)`;
    }
    cartes["eur-pays"].push(carte({ url: "votes-france.html", eyebrow: "Intentions de vote · France", titre: "Votes France",
      chiffre: `${esc(lead.id)} ${lead.n}`, legende: `députés sur 577 · aucune majorité`,
      barreHtml: barre([...g.map(x => ({ lab: x.id, n: x.n, c: x.c })), { lab: "vacants", n: FA.vacants || 0, c: "var(--soft)" }], 577, 289),
      phrase: pres,
      donnees: `Assemblée au ${dateFr(FA.date)}` }));
  }
  // Votes Allemagne : projection des sièges calculée par le site à partir de la moyenne des sondages
  if (DEP?.national) {
    const N = DEP.national, U = DEP.union;
    const CD = { AfD: "#1BA7E5", Union: "#454B57", SPD: "#E3000F", "Grüne": "#1AA037", Linke: "#BE3075", BSW: "#6D3A8E", FDP: "#D9B600", SSW: "#00337F" };
    const sieges = { Union: U?.s || 0 }; Object.entries(N).forEach(([p, x]) => { if (p !== "CDU" && p !== "CSU" && x.s > 0) sieges[p] = x.s; });
    const ordre = Object.keys(sieges).sort((a, b) => sieges[b] - sieges[a]), lead = ordre[0];
    cartes["eur-pays"].push(carte({ url: "votes-allemagne.html", eyebrow: "Projection · Allemagne", titre: "Votes Allemagne",
      chiffre: `${esc(lead)} ${sieges[lead]}`, legende: `sièges projetés sur 630 · ${sieges[lead] >= 316 ? "majoritaire" : "aucune majorité"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: sieges[p], c: CD[p] || "#8D949A" })), 630, 316),
      donnees: `dernier sondage le ${dateFr(DEP.maj.dernier)}` }));
  }
  // Votes Suisse : projection du Conseil national calculée par le site, canton par canton
  if (CHP?.national) {
    const N = CHP.national, NOMS_CH = { C: "Centre", VERT: "Verts" };
    const CH = { UDC: "#3A8F3A", PS: "#E2001A", C: "#F28C1E", PLR: "#1E5CB3", VERT: "#7CB342", PVL: "#B5C800", PEV: "#E3BB00", UDF: "#8E6BB5", MCG: "#F2C200", Lega: "#4A6FA5" };
    const ordre = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => N[b].s - N[a].s), lead = ordre[0], lab = p => NOMS_CH[p] || p;
    cartes["eur-pays"].push(carte({ url: "votes-suisse.html", eyebrow: "Projection · Suisse", titre: "Votes Suisse",
      chiffre: `${esc(lab(lead))} ${N[lead].s}`, legende: `sièges projetés sur 200 · Conseil national`,
      barreHtml: barre(ordre.map(p => ({ lab: lab(p), n: N[p].s, c: CH[p] || "#8D949A" })), 200, 101),
      donnees: `dernier sondage le ${dateFr(CHP.maj)}` }));
  }
  const html = CONTINENTS.map(([k, nom, sous]) => {
    const grp = sous.filter(([g]) => cartes[k + "-" + g].length); if (!grp.length) return "";
    const n = grp.reduce((t, [g]) => t + cartes[k + "-" + g].length, 0);
    return `<section class="ac-continent" aria-labelledby="ac-${k}">
      <h3 class="ac-continent-titre" id="ac-${k}">${nom}<small>${n} page${n > 1 ? "s" : ""}</small></h3>
      <div class="ac-cartes">${grp.map(([g, titre]) => cartes[k + "-" + g].map((c, i) => grp.length > 1 && i === 0
        ? c.replace(/^(\s*<(?:a|div)) class="ac-carte([^"]*)"/, `$1 class="ac-carte$2 ac-debut" data-groupe="${titre}"`) : c).join("")).join("")}</div></section>`;
  }).join("");
  $("acCartes").innerHTML = html || `<p class="lv-muted">Chargement impossible.</p>`;
}
demarrer();
