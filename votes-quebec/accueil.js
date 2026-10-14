/* Accueil de la section « Intentions de vote et simulations » (intentions-simulations.html).
   Une carte par endroit (ses simulations en petit dans sa carte) : chiffres clés tirés des mêmes données que la page (fichiers légers seulement), barre des sièges,
   date des données et dernière vérification (votes-verif.json). Les résultats en direct (live.js) reviendront le soir
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
function carte({ url, eyebrow, titre, chiffre, legende, barreHtml, phrase, donnees, verif, sous }) {
  // carte avec sous-carte : contenu de la page, puis ses simulations en plus petit dessous (deux liens, pas de lien imbriqué)
  if (sous) return `<div class="ac-carte ac-large"><a class="ac-principal" href="${url}">
    <span class="lv-eyebrow">${eyebrow}</span>
    <h3>${titre}</h3>
    <div class="ac-chiffre">${chiffre}</div>
    <p class="ac-legende">${legende}</p>
    ${barreHtml}
    <p class="ac-phrase">${phrase}</p>
    <p class="ac-dates">${donnees}${verif ? ` · vérifiées le ${esc(verif.texte)}` : ""}</p>
    <span class="ac-lien">Ouvrir la page →</span></a>
    <div class="ac-sims"><span class="lv-eyebrow">Simulations</span>${sous}</div></div>`;
  return `<a class="ac-carte" href="${url}">
    <span class="lv-eyebrow">${eyebrow}</span>
    <h3>${titre}</h3>
    <div class="ac-chiffre">${chiffre}</div>
    <p class="ac-legende">${legende}</p>
    ${barreHtml}
    <p class="ac-phrase">${phrase}</p>
    <p class="ac-dates">${donnees}${verif ? ` · vérifiées le ${esc(verif.texte)}` : ""}</p>
    <span class="ac-lien">Ouvrir la page →</span></a>`;
}

async function demarrer() {
  const [V, QE, QS, CP, CS, UP, US, FA, FP, L39, UPR, DEP, CHP] = await Promise.all([
    lireJ("votes-verif.json"), lireJ("votes-quebec/election-2026.json"), lireJ("votes-quebec/sondages.json"),
    lireJ("votes-canada/projection.json"), lireJ("votes-canada/sondages.json"),
    lireJ("votes-usa/projection.json"), lireJ("votes-usa/sondages.json"),
    lireJ("votes-france/assemblee.json"), lireJ("votes-france/sondages-pres.json"), lireJ("votes-quebec/loi39-resume.json"),
    lireJ("votes-usa/presidentielle.json"), lireJ("votes-allemagne/projection.json"), lireJ("votes-suisse/projection.json")]);
  // cartes groupées par continent (une ligne de cartes par continent, dans cet ordre)
  const v = V || {}, cartes = { amn: [], eur: [] };
  const CONTINENTS = [["amn", "Amérique du Nord"], ["eur", "Europe"]];

  // Loi 39 : simulation sur les votes du Québec, en petit dans la carte de Votes Québec
  let sousQc = "";
  if (L39) {
    const ordre = Object.keys(L39.loi39).sort((a, b) => L39.loi39[b] - L39.loi39[a]), lead = ordre[0], maj = Math.floor(L39.sieges_loi39 / 2) + 1;
    sousQc = `<a class="ac-sous" href="loi39.html">
      <b>Loi 39</b><small>Mixte compensatoire régional · 80 circonscriptions + 45 sièges de région</small>
      <div class="ac-sous-chiffre">${lead} ${L39.loi39[lead]} <small>sur ${L39.sieges_loi39} · ${L39.loi39[lead] >= maj ? "majoritaire" : "minoritaire"}</small></div>
      ${barre(ordre.map(p => ({ lab: p, n: L39.loi39[p], c: CQ[p] })), L39.sieges_loi39, maj)}
      <p>Avec le ${esc(L39.texte)} : ${ordre.map(p => `${p} ${L39.actuel[p]} → ${L39.loi39[p]}`).join(" · ")}</p>
      <span class="ac-lien">Ouvrir la simulation →</span></a>`;
  }
  // Votes Québec : dernier résultat (aucun sondage depuis l'élection) ou sondages
  if (QE) {
    const s = QE.sieges, ordre = Object.keys(s).sort((a, b) => s[b] - s[a]), lead = ordre[0];
    const dernier = (QS?.sondages || []).filter(x => !x.e).pop();
    cartes.amn.push(carte({ url: "votes-quebec.html", eyebrow: "Intentions de vote · Québec", titre: "Votes Québec",
      chiffre: `${lead} ${s[lead]}`, legende: `sièges sur 127 · gouvernement ${s[lead] >= 64 ? "majoritaire" : "minoritaire"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: s[p], c: CQ[p] || "var(--aut)" })), 127, 64),
      phrase: `Résultat de l'élection du 5 octobre 2026 : ${ordre.map(p => `${p} ${nf(QE.national[p], 1)} %`).join(" · ")}. Les intentions de vote remplaceront ce résultat au premier sondage.`,
      donnees: `élection du 5 octobre 2026${dernier ? ` · dernier sondage le ${dateFr(dernier.d)}` : ""}`, verif: v.quebec, sous: sousQc }));
  }
  // Votes Canada : projection Qc125
  if (CP) {
    const N = CP.national, ordre = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => N[b].s - N[a].s), lead = ordre[0];
    const dernier = (CS?.sondages || []).filter(x => !x.e).pop();
    cartes.amn.push(carte({ url: "votes-canada.html", eyebrow: "Projection · Canada", titre: "Votes Canada",
      chiffre: `${lead} ${N[lead].s}`, legende: `sièges sur 343 (${N[lead].smin}–${N[lead].smax}) · ${N[lead].s >= 172 ? "majoritaire" : "minoritaire"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: N[p].s, c: CC[p] || "#8D949A" })), 343, 172),
      phrase: `Vote projeté : ${ordre.map(p => `${p} ${nf(N[p].v, 1)} %`).join(" · ")}.`,
      donnees: `projection Qc125 du ${dateFr(CP.maj.date)}${dernier ? ` · dernier sondage le ${dateFr(dernier.d)}` : ""}`, verif: v.canada }));
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
      sen = ` Sénat : D ${k.D}, R ${k.R}, ${k.T} à égalité (majorité 51).`;
    }
    const m = US?.moyenne?.[US.moyenne.length - 1];
    // présidentielle 2028 : meneur de chaque primaire (moyenne des sondages des 30 jours précédant le dernier, comme la page)
    const meneur = p => { const S = UPR?.primaires?.[p]?.sondages; if (!S?.length) return null;
      const fin = new Date(S[S.length - 1].d), rec = S.filter(x => (fin - new Date(x.d)) / 864e5 <= 30), r = rec.length >= 5 ? rec : S.slice(-5), c = {};
      r.forEach(x => Object.entries(x.v).forEach(([k, v]) => (c[k] ||= []).push(v)));
      const [k, v] = Object.entries(c).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1])[0];
      return `${esc(k.split(" ").slice(-1)[0])} (${nf(v, 0)} %)`; };
    const pres = meneur("D") && meneur("R") ? ` Présidentielle 2028, en tête des primaires : ${meneur("D")} chez les démocrates, ${meneur("R")} chez les républicains.` : "";
    const mp = UPR?.marches?.parti, chD = mp ? (mp.polymarket.D + mp.kalshi.D) / 2 : null;
    const marche = chD != null ? ` Marchés de prédiction : ${chD >= 50 ? `démocrates favoris (${nf(chD, 0)} %)` : `républicains favoris (${nf((mp.polymarket.R + mp.kalshi.R) / 2, 0)} %)`}.` : "";
    cartes.amn.push(carte({ url: "votes-usa.html", eyebrow: "Projection · États-Unis", titre: "Votes États-Unis",
      chiffre: `D ${d} · R ${r}`, legende: `sièges favoris à la Chambre (sur 435, majorité 218) · ${t} à égalité`,
      barreHtml: barre(["D3", "D2", "D1", "T", "R1", "R2", "R3"].map(k => ({ lab: k[0] === "T" ? "Égalité" : k[0], n: n[k] || 0, c: CU[k] })), 435, 218),
      phrase: `Chambre des représentants, consensus de sept prévisionnistes.${sen}${m ? ` Vote générique : D ${nf(m.D, 1)} %, R ${nf(m.R, 1)} %.` : ""}${pres}${marche}`,
      donnees: `consensus 270toWin du ${dateFr(UP.maj)}${m ? ` · vote générique au ${dateFr(m.d)}` : ""}`, verif: v.usa }));
  }
  // Votes France : Assemblée actuelle et présidentielle 2027
  if (FA) {
    const g = FA.groupes.slice().sort((a, b) => b.n - a.n), lead = g[0];
    let pres = "", dPres = "";
    if (FP?.sondages?.length) {
      const sp = FP.sondages[FP.sondages.length - 1], top = Object.entries(sp.v).sort((a, b) => b[1] - a[1]).slice(0, 3);
      pres = ` Présidentielle 2027, dernier sondage (${esc(sp.f)}) : ${top.map(([k, x]) => `${esc(k.split(" ").slice(1).join(" ") || k)} ${nf(x, 0)} %`).join(" · ")}.`;
      dPres = ` · dernier sondage le ${dateFr(sp.d)}`;
    }
    cartes.eur.push(carte({ url: "votes-france.html", eyebrow: "Intentions de vote · France", titre: "Votes France",
      chiffre: `${esc(lead.id)} ${lead.n}`, legende: `députés sur 577 · premier groupe, aucune majorité absolue (289)`,
      barreHtml: barre([...g.map(x => ({ lab: x.id, n: x.n, c: x.c })), { lab: "vacants", n: FA.vacants || 0, c: "var(--soft)" }], 577, 289),
      phrase: `Assemblée nationale actuelle (aucun sondage législatif depuis octobre 2025).${pres}`,
      donnees: `Assemblée au ${dateFr(FA.date)}${dPres}`, verif: v.france }));
  }
  // Votes Allemagne : projection des sièges calculée par le site à partir de la moyenne des sondages
  if (DEP?.national) {
    const N = DEP.national, U = DEP.union, M = DEP.moyenne?.v || {};
    const CD = { AfD: "#1BA7E5", Union: "#454B57", SPD: "#E3000F", "Grüne": "#1AA037", Linke: "#BE3075", BSW: "#6D3A8E", FDP: "#D9B600", SSW: "#00337F" };
    const sieges = { Union: U?.s || 0 }; Object.entries(N).forEach(([p, x]) => { if (p !== "CDU" && p !== "CSU" && x.s > 0) sieges[p] = x.s; });
    const ordre = Object.keys(sieges).sort((a, b) => sieges[b] - sieges[a]), lead = ordre[0];
    cartes.eur.push(carte({ url: "votes-allemagne.html", eyebrow: "Projection · Allemagne", titre: "Votes Allemagne",
      chiffre: `${esc(lead)} ${sieges[lead]}`, legende: `sièges projetés sur 630 · ${sieges[lead] >= 316 ? "majorité" : "aucune majorité (316)"}${N.CDU && N.CSU ? ` · Union : CDU ${N.CDU.s} + CSU ${N.CSU.s}` : ""}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: sieges[p], c: CD[p] || "#8D949A" })), 630, 316),
      phrase: `Moyenne des sondages (secondes voix) : ${Object.entries(M).filter(([k]) => k !== "AUT").sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, x]) => `${esc(k)} ${nf(x, 0)} %`).join(" · ")}. Seuil de 5 % pour entrer au Bundestag.`,
      donnees: `projection du ${dateFr(DEP.maj.date)} · dernier sondage le ${dateFr(DEP.maj.dernier)}`, verif: v.allemagne }));
  }
  // Votes Suisse : projection du Conseil national calculée par le site, canton par canton
  if (CHP?.national) {
    const N = CHP.national, NOMS_CH = { C: "Centre", VERT: "Verts" };
    const CH = { UDC: "#3A8F3A", PS: "#E2001A", C: "#F28C1E", PLR: "#1E5CB3", VERT: "#7CB342", PVL: "#B5C800", PEV: "#E3BB00", UDF: "#8E6BB5", MCG: "#F2C200", Lega: "#4A6FA5" };
    const ordre = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => N[b].s - N[a].s), lead = ordre[0], lab = p => NOMS_CH[p] || p;
    const nbJ = Math.round((Date.now() - new Date(CHP.maj + "T12:00:00")) / 864e5);
    cartes.eur.push(carte({ url: "votes-suisse.html", eyebrow: "Projection · Suisse", titre: "Votes Suisse",
      chiffre: `${esc(lab(lead))} ${N[lead].s}`, legende: `sièges projetés sur 200 au Conseil national (${N[lead].smin}–${N[lead].smax}) · majorité 101`,
      barreHtml: barre(ordre.map(p => ({ lab: lab(p), n: N[p].s, c: CH[p] || "#8D949A" })), 200, 101),
      phrase: `Moyenne des sondages : ${ordre.slice(0, 6).map(p => `${esc(lab(p))} ${nf(N[p].v, 0)} %`).join(" · ")}. Prochaines élections fédérales en octobre 2027.${nbJ > 120 ? ` Les sondages sont rares : le dernier date de ${Math.round(nbJ / 30)} mois.` : ""}`,
      donnees: `dernier sondage le ${dateFr(CHP.maj)}`, verif: v.suisse }));
  }
  const html = CONTINENTS.filter(([k]) => cartes[k].length).map(([k, nom]) => `<section class="ac-continent" aria-labelledby="ac-${k}">
      <h3 class="ac-continent-titre" id="ac-${k}">${nom}<small>${cartes[k].length} page${cartes[k].length > 1 ? "s" : ""}</small></h3>
      <div class="ac-cartes">${cartes[k].join("")}</div></section>`).join("");
  $("acCartes").innerHTML = html || `<p class="lv-muted">Chargement impossible.</p>`;
}
demarrer();
