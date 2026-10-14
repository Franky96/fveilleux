/* Sigles des partis : au survol (ou au toucher) d'un sigle, d'un nom de parti ou d'un siège, une bulle donne le nom
   complet du parti et une brève description. Commun à toutes les pages d'intentions de vote, dans le rectangle de
   l'assemblée (plan ou hémicycle, titre, légende, liste des candidats).

   activerSigles(dico, racine)
     dico   : { sigle: { nom, info } } d'un pays (PARTIS.quebec, PARTIS.canada…) ; dico._alias : { « nom affiché » : sigle }
              pour les noms complets ou courts affichés à la place du sigle (légendes, titres : « Parti québécois »…)
     racine : élément surveillé ; tout texte qui y apparaît (même redessiné plus tard) est traité : chaque sigle connu
              devient <abbr class="parti-sigle" data-parti="…">. Les étiquettes SVG (<text>) qui commencent par un sigle
              reçoivent data-parti, de même que les sièges dessinés dont l'infobulle (<title>) nomme un parti (l'infobulle
              du navigateur est alors retirée, la bulle la remplace). Les bulles qui suivent la souris sont ignorées.
   Les descriptions restent générales (orientation, origine) : pas de chefs ni de sondages, qui changent souvent. */

const P = (nom, info) => ({ nom, info });
export const PARTIS = {
  quebec: {
    PQ: P("Parti québécois", "Parti souverainiste et social-démocrate fondé en 1968 par René Lévesque."),
    PLQ: P("Parti libéral du Québec", "Parti fédéraliste de centre, le plus ancien parti du Québec (1867)."),
    CAQ: P("Coalition avenir Québec", "Parti nationaliste de centre droit fondé en 2011 ; il a gouverné de 2018 à 2026."),
    PCQ: P("Parti conservateur du Québec", "Parti de droite, relancé en 2009."),
    QS: P("Québec solidaire", "Parti de gauche, souverainiste et écologiste, fondé en 2006."),
    _alias: { "Parti québécois": "PQ",
    "Parti libéral": "PLQ",
    "Coalition avenir Québec": "CAQ",
    "Parti conservateur": "PCQ",
    "Québec solidaire": "QS" },
  },
  canada: {
    PLC: P("Parti libéral du Canada", "Parti de centre, présent depuis la Confédération ; il gouverne depuis 2015."),
    PCC: P("Parti conservateur du Canada", "Parti de droite né en 2003 de la fusion de l'Alliance canadienne et du Parti progressiste-conservateur."),
    BQ: P("Bloc québécois", "Parti souverainiste qui ne présente des candidats qu'au Québec, fondé en 1991."),
    NPD: P("Nouveau Parti démocratique", "Parti de gauche social-démocrate fondé en 1961."),
    PVC: P("Parti vert du Canada", "Parti écologiste fondé en 1983."),
    PPC: P("Parti populaire du Canada", "Parti de droite populiste fondé en 2018."),
    _alias: { "Parti libéral": "PLC",
    "Parti conservateur": "PCC",
    "Bloc québécois": "BQ",
    "Nouveau Parti démocratique": "NPD",
    "Parti vert": "PVC",
    "Parti populaire": "PPC" },
  },
  usa: {
    D: P("Parti démocrate", "Parti de centre gauche, le plus ancien des deux grands partis (fondé en 1828)."),
    R: P("Parti républicain", "Parti de droite conservatrice fondé en 1854, surnommé le « Grand Old Party » (GOP)."),
    I: P("Indépendant", "Élu sans étiquette ; au Sénat, les deux indépendants votent avec les démocrates."),
    _alias: { "Parti démocrate": "D",
    "Parti républicain": "R",
    "Démocrates": "D",
    "Républicains": "R",
    "démocrates": "D",
    "républicains": "R" },
  },
  france: {
    RN: P("Rassemblement national", "Parti de droite nationaliste, issu du Front national (1972), renommé en 2018."),
    "RN-UDR": P("Rassemblement national et alliés (UDR)", "Le RN et les candidats de l'Union des droites pour la République, ses alliés depuis 2024."),
    UDR: P("Union des droites pour la République", "Parti de droite allié au RN depuis les législatives de 2024."),
    UDDPLR: P("Union des droites pour la République", "Groupe de députés de droite alliés au RN depuis 2024."),
    NFP: P("Nouveau Front populaire", "Alliance de gauche formée en juin 2024 (LFI, PS, Écologistes, PCF…)."),
    ENS: P("Ensemble", "Coalition de centre qui soutient Emmanuel Macron (Renaissance, MoDem, Horizons…)."),
    LR: P("Les Républicains", "Parti de droite fondé en 2015, successeur de l'UMP."),
    EXG: P("Extrême gauche", "Candidats d'extrême gauche (Lutte ouvrière, NPA…)."),
    DVG: P("Divers gauche", "Candidats de gauche hors des grandes alliances."),
    DVC: P("Divers centre", "Candidats du centre hors de la coalition Ensemble."),
    DVD: P("Divers droite", "Candidats de droite hors des grands partis."),
    EXD: P("Extrême droite", "Candidats d'extrême droite hors du RN (Reconquête…)."),
    REG: P("Régionalistes", "Partis régionalistes ou autonomistes (Corse, Bretagne, Alsace, outre-mer…)."),
    DIV: P("Divers", "Candidats sans étiquette politique claire."),
    "LFI-NFP": P("La France insoumise – Nouveau Front populaire", "Groupe de gauche radicale à l'Assemblée nationale."),
    GDR: P("Gauche démocrate et républicaine", "Groupe des communistes et de députés d'outre-mer."),
    ECOS: P("Écologiste et social", "Groupe des députés écologistes."),
    SOC: P("Socialistes et apparentés", "Groupe du Parti socialiste à l'Assemblée nationale."),
    LIOT: P("Libertés, indépendants, outre-mer et territoires", "Groupe centriste qui rassemble des députés de sensibilités variées."),
    DEM: P("Les Démocrates", "Groupe du MoDem, parti centriste allié d'Emmanuel Macron."),
    EPR: P("Ensemble pour la République", "Groupe de Renaissance, le parti d'Emmanuel Macron."),
    HOR: P("Horizons et indépendants", "Groupe d'Horizons, parti de centre droit allié d'Emmanuel Macron."),
    DR: P("Droite républicaine", "Groupe des députés Les Républicains."),
    NI: P("Non-inscrits", "Députés qui ne font partie d'aucun groupe."),
    _alias: { "Rassemblement national": "RN",
    "Rassemblement National": "RN",
    "RN et alliés (UDR)": "RN-UDR",
    "Gauche (NFP)": "NFP",
    "Nouveau Front populaire": "NFP",
    "Ensemble (centre)": "ENS",
    "Les Républicains": "LR",
    "Extrême gauche": "EXG",
    "Extrême droite": "EXD",
    "Divers gauche": "DVG",
    "Divers centre": "DVC",
    "Divers droite": "DVD",
    "Régionalistes": "REG",
    "La France insoumise - Nouveau Front Populaire": "LFI-NFP",
    "Gauche Démocrate et Républicaine": "GDR",
    "Écologiste et Social": "ECOS",
    "Socialistes et apparentés": "SOC",
    "Libertés, Indépendants, Outre-mer et Territoires": "LIOT",
    "Les Démocrates": "DEM",
    "Ensemble pour la République": "EPR",
    "Horizons & Indépendants": "HOR",
    "Droite Républicaine": "DR",
    "Union des droites pour la République": "UDR",
    "Non inscrit": "NI" },
  },
  allemagne: {
    Union: P("Union CDU/CSU", "Alliance de la CDU et de la CSU, qui forment un groupe commun au Bundestag."),
    CDU: P("Union chrétienne-démocrate", "Parti de centre droit fondé en 1945 ; il se présente partout sauf en Bavière."),
    CSU: P("Union chrétienne-sociale", "Parti frère de la CDU, qui ne se présente qu'en Bavière."),
    SPD: P("Parti social-démocrate", "Parti de centre gauche, le plus ancien parti allemand (XIXe siècle)."),
    AfD: P("Alternative pour l'Allemagne", "Parti de droite nationaliste fondé en 2013 ; les autres grands partis refusent de gouverner avec lui."),
    "Grüne": P("Alliance 90 / Les Verts", "Parti écologiste, issu en 1993 de l'union des Verts de l'Ouest et d'Alliance 90, venue de l'Est."),
    Linke: P("Die Linke (La Gauche)", "Parti de gauche fondé en 2007."),
    BSW: P("Alliance Sahra Wagenknecht", "Parti fondé en 2024 par d'anciens membres de Die Linke ; resté sous 5 % en 2025."),
    FDP: P("Parti libéral-démocrate", "Parti libéral de centre droit ; resté sous 5 % en 2025, il n'a plus de députés."),
    FW: P("Électeurs libres (Freie Wähler)", "Parti de centre droit surtout implanté en Bavière."),
    SSW: P("Association des électeurs du Schleswig du Sud", "Parti de la minorité danoise et frisonne, exempté du seuil de 5 %."),
    _alias: { "Union chrétienne-démocrate": "CDU",
    "Union chrétienne-sociale": "CSU",
    "Parti social-démocrate": "SPD",
    "Alternative pour l'Allemagne": "AfD",
    "Alliance 90 / Les Verts": "Gr\u00fcne",
    "Die Linke": "Linke",
    "La Gauche": "Linke",
    "Alliance Sahra Wagenknecht": "BSW",
    "Parti libéral-démocrate": "FDP",
    "Électeurs libres": "FW" },
  },
  suisse: {
    UDC: P("Union démocratique du centre", "Parti de droite conservatrice, premier parti du pays depuis 1999."),
    PS: P("Parti socialiste suisse", "Parti de gauche, deuxième force du Conseil national."),
    Centre: P("Le Centre", "Parti de centre né en 2021 de la fusion du PDC et du PBD."),
    PLR: P("PLR. Les Libéraux-Radicaux", "Parti de droite libérale né en 2009 de la fusion des radicaux et des libéraux."),
    Verts: P("Les Vert-e-s suisses", "Parti écologiste de gauche."),
    PVL: P("Vert'libéraux", "Parti de centre qui allie écologie et libéralisme économique."),
    PEV: P("Parti évangélique suisse", "Petit parti de centre d'inspiration chrétienne."),
    UDF: P("Union démocratique fédérale", "Petit parti de droite chrétienne conservatrice."),
    MCG: P("Mouvement citoyens genevois", "Parti populiste présent seulement dans le canton de Genève."),
    Lega: P("Lega dei Ticinesi", "Parti populiste présent seulement au Tessin."),
    "PST-Sol": P("Parti suisse du Travail – solidaritéS", "Petits partis de gauche radicale."),
    _alias: { "Union démocratique du centre": "UDC",
    "Parti socialiste": "PS",
    "PLR.Les Libéraux-Radicaux": "PLR",
    "Les Vert-e-s": "Verts",
    "Vert'libéraux": "PVL",
    "Parti évangélique": "PEV",
    "Union démocratique fédérale": "UDF",
    "Mouvement citoyens genevois": "MCG",
    "Lega dei Ticinesi": "Lega" },
  },
};

const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ESC = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const IGNORER = "script, style, textarea, input, select, abbr.parti-sigle, .lv-tip, .vi-evol-tip, .parti-bulle, [data-sans-sigle]";
let bulle = null;

export function activerSigles(dico, racine) {
  if (!racine || !dico || racine.dataset.sigles) return;
  racine.dataset.sigles = "1";
  // textes reconnus : les sigles, et les noms affichés à leur place (_alias) ; le plus long d'abord
  const vers = { ...Object.fromEntries(Object.keys(dico).filter(k => k !== "_alias").map(k => [k, k])), ...(dico._alias || {}) };
  const cles = Object.keys(vers).sort((a, b) => b.length - a.length).map(echapper);
  // sigle entier seulement : pas au milieu d'un mot ni collé à un trait d'union suivi d'une lettre
  const re = new RegExp(`(?<![\\p{L}\\p{N}]|\\p{L}-)(${cles.join("|")})(?![\\p{L}\\p{N}]|-\\p{L})`, "gu");
  const debut = new RegExp(`^\\s*(${cles.join("|")})(?![\\p{L}\\p{N}]|-\\p{L})`, "u");
  const traiter = noeud => {
    if (noeud.nodeType === 1 && noeud.closest?.(IGNORER)) return;
    // étiquettes SVG (ex. « PLC 48 » au bout d'une courbe) : l'élément <text> entier
    const svgText = n => { const m = debut.exec(n.textContent); if (m && !n.dataset.parti) n.dataset.parti = vers[m[1]]; };
    // sièges (cercles, carrés) : l'infobulle <title> du dessin nomme le parti
    // (le parti peut venir après une cote : « Sûr D », « Penché R »)
    // le fauteuil de la présidence garde son infobulle propre (rôle du président)
    const siege = t => { if (/^Présidence/.test(t.textContent)) return; re.lastIndex = 0; const m = re.exec(t.textContent), forme = t.parentNode; if (m && forme && !forme.dataset.parti) { forme.dataset.parti = vers[m[1]]; t.remove(); } };
    if (noeud.nodeType === 1 && noeud.namespaceURI === "http://www.w3.org/2000/svg") {
      (noeud.tagName === "text" ? [noeud] : noeud.querySelectorAll("text")).forEach(svgText);
      (noeud.tagName === "title" ? [noeud] : [...noeud.querySelectorAll("title")]).forEach(siege); return;
    }
    const textes = [];
    if (noeud.nodeType === 3) textes.push(noeud);
    else {
      const w = document.createTreeWalker(noeud, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => n.nodeType === 1 ? (n.matches(IGNORER) ? NodeFilter.FILTER_REJECT : n.namespaceURI === "http://www.w3.org/2000/svg" ? (n.querySelectorAll("text").forEach(svgText), [...n.querySelectorAll("title")].forEach(siege), NodeFilter.FILTER_REJECT) : NodeFilter.FILTER_SKIP)
          : NodeFilter.FILTER_ACCEPT });
      for (let n = w.nextNode(); n; n = w.nextNode()) textes.push(n);
    }
    for (const t of textes) {
      const p = t.parentNode; if (!p || p.closest?.(IGNORER) || p.namespaceURI === "http://www.w3.org/2000/svg") continue;
      const s = t.nodeValue; re.lastIndex = 0; if (!re.test(s)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment(); let i = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > i) frag.append(s.slice(i, m.index));
        const a = document.createElement("abbr"); a.className = "parti-sigle"; a.dataset.parti = vers[m[1]]; a.textContent = m[1];
        frag.append(a); i = m.index + m[1].length;
      }
      if (i < s.length) frag.append(s.slice(i));
      p.replaceChild(frag, t);
    }
  };
  traiter(racine);
  let attente = new Set(), prevu = false;
  new MutationObserver(ms => {
    for (const m of ms) m.addedNodes.forEach(n => attente.add(n));
    if (prevu) return; prevu = true;
    requestAnimationFrame(() => { prevu = false; const lot = attente; attente = new Set(); lot.forEach(n => n.isConnected && traiter(n)); });
  }).observe(racine, { childList: true, subtree: true });
  // bulle : survol à la souris, toucher sur écran tactile
  const montrer = (cible, x, y) => {
    const d = dico[cible.dataset.parti]; if (!d) return;
    if (!bulle) { bulle = document.createElement("div"); bulle.className = "parti-bulle"; bulle.setAttribute("role", "tooltip"); }
    // dans la fenêtre ouverte (elle passe au-dessus de tout), sinon dans la section de la page (couleurs du thème)
    (cible.closest("dialog[open]") || cible.closest(".vue-live") || document.body).append(bulle);
    bulle.innerHTML = `<b>${ESC(cible.dataset.parti)}</b><span>${ESC(d.nom)}</span>${d.info ? `<small>${ESC(d.info)}</small>` : ""}`;
    bulle.hidden = false;
    const r = cible.getBoundingClientRect(), w = bulle.offsetWidth, h = bulle.offsetHeight;
    const px = x ?? r.left + r.width / 2, haut = (y ?? r.top) - h - 10;
    bulle.style.left = Math.max(8, Math.min(innerWidth - w - 8, px - w / 2)) + "px";
    bulle.style.top = (haut > 8 ? haut : (y ?? r.bottom) + 14) + "px";
  };
  const cacher = () => { if (bulle) bulle.hidden = true; };
  racine.addEventListener("mouseover", e => { const c = e.target.closest?.("[data-parti]"); if (c && racine.contains(c)) montrer(c); });
  racine.addEventListener("mouseout", e => { const c = e.target.closest?.("[data-parti]"); if (c && !c.contains(e.relatedTarget)) cacher(); });
  racine.addEventListener("touchstart", e => { const c = e.target.closest?.("[data-parti]"); if (c) { const t = e.touches[0]; montrer(c, t.clientX, t.clientY); } else cacher(); }, { passive: true });
  addEventListener("scroll", cacher, { passive: true });
}
