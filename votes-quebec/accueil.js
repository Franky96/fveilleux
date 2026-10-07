/* Accueil de la section « Intentions de vote et simulations » (intentions-simulations.html).
   Une carte par page : chiffres clés tirés des mêmes données que la page (fichiers légers seulement), barre des sièges,
   date des données et dernière vérification (votes-verif.json). Les résultats en direct (live.js) reviendront le soir
   d'une élection. */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
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
function carte({ url, eyebrow, titre, chiffre, legende, barreHtml, phrase, donnees, verif }) {
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
  const [V, QE, QS, CP, CS, UP, US, FA, FP, L39] = await Promise.all([
    lireJ("votes-verif.json"), lireJ("votes-quebec/election-2026.json"), lireJ("votes-quebec/sondages.json"),
    lireJ("votes-canada/projection.json"), lireJ("votes-canada/sondages.json"),
    lireJ("votes-usa/projection.json"), lireJ("votes-usa/sondages.json"),
    lireJ("votes-france/assemblee.json"), lireJ("votes-france/sondages-pres.json"), lireJ("votes-quebec/loi39-resume.json")]);
  const v = V || {}, cartes = [];

  // Votes Québec : dernier résultat (aucun sondage depuis l'élection) ou sondages
  if (QE) {
    const s = QE.sieges, ordre = Object.keys(s).sort((a, b) => s[b] - s[a]), lead = ordre[0];
    const dernier = (QS?.sondages || []).filter(x => !x.e).pop();
    cartes.push(carte({ url: "votes-quebec.html", eyebrow: "Intentions de vote · Québec", titre: "Votes Québec",
      chiffre: `${lead} ${s[lead]}`, legende: `sièges sur 127 · gouvernement ${s[lead] >= 64 ? "majoritaire" : "minoritaire"}`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: s[p], c: CQ[p] || "var(--aut)" })), 127, 64),
      phrase: `Résultat de l'élection du 5 octobre 2026 : ${ordre.map(p => `${p} ${nf(QE.national[p], 1)} %`).join(" · ")}. Les intentions de vote remplaceront ce résultat au premier sondage.`,
      donnees: `élection du 5 octobre 2026${dernier ? ` · dernier sondage le ${dateFr(dernier.d)}` : ""}`, verif: v.quebec }));
  }
  // Votes Canada : projection Qc125
  if (CP) {
    const N = CP.national, ordre = Object.keys(N).filter(p => N[p].s > 0).sort((a, b) => N[b].s - N[a].s), lead = ordre[0];
    const dernier = (CS?.sondages || []).filter(x => !x.e).pop();
    cartes.push(carte({ url: "votes-canada.html", eyebrow: "Projection · Canada", titre: "Votes Canada",
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
    cartes.push(carte({ url: "votes-usa.html", eyebrow: "Projection · États-Unis", titre: "Votes États-Unis",
      chiffre: `D ${d} · R ${r}`, legende: `sièges favoris à la Chambre (sur 435, majorité 218) · ${t} à égalité`,
      barreHtml: barre(["D3", "D2", "D1", "T", "R1", "R2", "R3"].map(k => ({ lab: k[0] === "T" ? "Égalité" : k[0], n: n[k] || 0, c: CU[k] })), 435, 218),
      phrase: `Chambre des représentants, consensus de sept prévisionnistes.${sen}${m ? ` Vote générique : D ${nf(m.D, 1)} %, R ${nf(m.R, 1)} %.` : ""}`,
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
    cartes.push(carte({ url: "votes-france.html", eyebrow: "Intentions de vote · France", titre: "Votes France",
      chiffre: `${esc(lead.id)} ${lead.n}`, legende: `députés sur 577 · premier groupe, aucune majorité absolue (289)`,
      barreHtml: barre([...g.map(x => ({ lab: x.id, n: x.n, c: x.c })), { lab: "vacants", n: FA.vacants || 0, c: "var(--soft)" }], 577, 289),
      phrase: `Assemblée nationale actuelle (aucun sondage législatif depuis octobre 2025).${pres}`,
      donnees: `Assemblée au ${dateFr(FA.date)}${dPres}`, verif: v.france }));
  }
  // Loi 39 : simulation sur les votes du Québec
  if (L39) {
    const ordre = Object.keys(L39.loi39).sort((a, b) => L39.loi39[b] - L39.loi39[a]), lead = ordre[0], maj = Math.floor(L39.sieges_loi39 / 2) + 1;
    cartes.push(carte({ url: "loi39.html", eyebrow: "Simulation · Québec", titre: "Loi 39 • Québec",
      chiffre: `${lead} ${L39.loi39[lead]}`, legende: `sièges sur ${L39.sieges_loi39} avec la loi 39 · ${L39.loi39[lead] >= maj ? "majoritaire" : "minoritaire"} (mode actuel : ${L39.actuel[lead]} sur ${L39.sieges_actuel})`,
      barreHtml: barre(ordre.map(p => ({ lab: p, n: L39.loi39[p], c: CQ[p] })), L39.sieges_loi39, maj),
      phrase: `Mode mixte compensatoire régional : 80 circonscriptions et 45 sièges de région. Avec le ${esc(L39.texte)} : ${ordre.map(p => `${p} ${L39.actuel[p]} → ${L39.loi39[p]}`).join(" · ")}.`,
      donnees: L39.texte, verif: null }));
  }
  $("acCartes").innerHTML = cartes.join("") || `<p class="lv-muted">Chargement impossible.</p>`;
}
demarrer();
