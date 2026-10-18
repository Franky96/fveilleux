/* Bande « Partis en lice » des pages d'intentions de vote : une ligne de boutons (couleur, sigle, nom complet) en pleine
   largeur au-dessus des rectangles du haut ; au survol (ou au toucher, ou au clavier) d'un parti, une bulle sombre
   montre sa fiche : nom complet, brève description et chiffres de la page. La bande ne prend que la hauteur de ses
   boutons et la bulle flotte par-dessus la page : rien ne s'agrandit.
   Pendant le survol, dans le plan ou l'hémicycle (#viPlan), les sièges du parti gardent leur couleur et tous les autres
   passent au gris (sièges marqués data-p="clé" par chaque module ; « Union CDU CSU » pour un siège commun à
   plusieurs clés) ; tout redevient en couleur quand la souris quitte la bande. Si la vue affichée n'a aucun siège de
   ce parti (ex. blocs de 2024 quand un groupe est survolé), le plan reste en couleur.

   sectionPartis(dico, items, { titre, note })
     dico  : dictionnaire d'un pays (PARTIS.quebec, PARTIS.canada…) : { clé: { nom, info } }
     items : [{ cle, etiquette, couleur, detail }] dans l'ordre d'affichage (clé du dictionnaire, sigle affiché,
             couleur du parti sur la page, phrase de chiffres tirés des données de la page)
     titre : libellé de la bande (« Partis en lice » par défaut) ; note : courte précision affichée au bout de la bande
   Les descriptions restent générales (orientation, origine) : pas de chefs ni de chiffres qui changent.
   Classement : les partis sont groupés de gauche à droite (BORDS : gauche radicale, gauche, centre-gauche, centre, centre-droit,
   droite, droite populiste, droite nationaliste ; « autres » à la fin pour les indépendants, régionalistes, inclassables), selon le classement usuel
   (encyclopédies, politologues), forcément approximatif ; la bande montre une colonne par groupe, dans cet ordre,
   l'ordre de la page étant gardé à l'intérieur d'un groupe ; les hémicycles suivent le même ordre. */

// bord : colonne de la bande ; hemi : rang dans les hémicycles (France, Allemagne, Suisse), figé à l'ordre du 18 octobre 2026
// (ne plus modifier les hémicycles) : seulement donné quand il diffère de bord
const P = (nom, info, bord = "aut", hemi) => ({ nom, info, bord, hemi: hemi ?? bord });
export const BORDS = [["gr", "Gauche radicale"], ["g", "Gauche"], ["cg", "Centre-gauche"], ["c", "Centre"], ["cd", "Centre-droit"], ["d", "Droite"], ["dp", "Droite populiste"], ["dr", "Droite nationaliste"], ["aut", "Autres"]];
const RANG = Object.fromEntries(BORDS.map(([k], i) => [k, i]));
// place sur l'axe d'une clé de parti : dictionnaire du pays, sinon « extra » (clés absentes du dictionnaire), sinon « autres »
export const bordDe = (dico, k, extra = {}) => dico?.[k]?.bord || extra[k] || "aut";
// clés triées de gauche à droite (ordre d'origine gardé dans un même groupe) ; sièges vacants (VAC) à la toute fin
// (ordre des hémicycles : rang hemi, figé)
const hemiDe = (dico, k, extra = {}) => dico?.[k]?.hemi || extra[k] || "aut";
export function trierAxe(dico, cles, extra = {}) {
  return cles.map((k, i) => ({ k, i }))
    .sort((a, b) => (a.k === "VAC") - (b.k === "VAC") || RANG[hemiDe(dico, a.k, extra)] - RANG[hemiDe(dico, b.k, extra)] || a.i - b.i)
    .map(x => x.k);
}
export const PARTIS = {
  quebec: {
    PQ: P("Parti québécois", "Parti souverainiste de centre gauche, social-démocrate, fondé en 1968 par René Lévesque.", "cg"),
    PLQ: P("Parti libéral du Québec", "Parti fédéraliste de centre, le plus ancien parti du Québec (1867).", "c"),
    CAQ: P("Coalition avenir Québec", "Parti nationaliste de centre droit fondé en 2011 ; il a gouverné de 2018 à 2026.", "cd"),
    PCQ: P("Parti conservateur du Québec", "Parti de droite conservatrice, relancé en 2009.", "d"),
    QS: P("Québec solidaire", "Parti de gauche, souverainiste et écologiste, fondé en 2006.", "g"),
  },
  canada: {
    PLC: P("Parti libéral du Canada", "Parti de centre, présent depuis la Confédération ; il gouverne depuis 2015.", "c"),
    PCC: P("Parti conservateur du Canada", "Parti de droite né en 2003 de la fusion de l'Alliance canadienne et du Parti progressiste-conservateur.", "d"),
    BQ: P("Bloc québécois", "Parti souverainiste et social-démocrate de centre gauche, qui ne présente des candidats qu'au Québec, fondé en 1991.", "cg"),
    NPD: P("Nouveau Parti démocratique", "Parti social-démocrate de centre gauche, le plus à gauche des grands partis fédéraux, fondé en 1961.", "cg"),
    PVC: P("Parti vert du Canada", "Parti écologiste de gauche fondé en 1983.", "g"),
    PPC: P("Parti populaire du Canada", "Parti de droite populiste fondé en 2018.", "dp"),
  },
  alberta: {
    UCP: P("Parti conservateur uni (United Conservative Party)", "Parti de droite né en 2017 de la fusion des progressistes-conservateurs et du Wildrose ; il gouverne depuis 2019.", "d"),
    NPD: P("Nouveau Parti démocratique de l'Alberta", "Parti de centre gauche, au pouvoir de 2015 à 2019 ; il domine à Edmonton.", "cg"),
    PT: P("Progressive Tory Party of Alberta", "Parti de centre droit, nouveau nom du Parti albertain depuis décembre 2025 ; un député, exclu de l'UCP.", "cd"),
    LIB: P("Parti libéral de l'Alberta", "Parti de centre, au pouvoir de 1905 à 1921 ; sans député depuis 2019.", "c"),
    VERT: P("Parti vert de l'Alberta", "Parti écologiste de centre gauche.", "cg"),
    RPA: P("Parti républicain de l'Alberta", "Parti indépendantiste de droite, l'ancien Buffalo Party, renommé en 2025.", "d"),
  },
  usa: {
    D: P("Parti démocrate", "Parti de centre gauche, le plus ancien des deux grands partis (fondé en 1828).", "cg"),
    R: P("Parti républicain", "Parti de droite conservatrice fondé en 1854, surnommé le « Grand Old Party » (GOP).", "d"),
    I: P("Indépendant", "Élu sans étiquette ; au Sénat, les deux indépendants votent avec les démocrates."),
  },
  france: {
    RN: P("Rassemblement national", "Parti de droite nationaliste, issu du Front national (1972), renommé en 2018.", "dr"),
    "RN-UDR": P("Rassemblement national et alliés (UDR)", "Le RN et les candidats de l'Union des droites pour la République, ses alliés depuis 2024.", "dr"),
    UDR: P("Union des droites pour la République", "Parti d'Éric Ciotti, issu d'une scission des Républicains en 2024 ; allié au RN, il forme avec lui le bloc de la droite nationaliste.", "dr"),
    UDDPLR: P("Union des droites pour la République", "Groupe des députés d'Éric Ciotti, issus d'une scission des Républicains en 2024 ; alliés au RN, ils forment avec lui le bloc de la droite nationaliste.", "dr"),
    NFP: P("Nouveau Front populaire", "Alliance de gauche formée en juin 2024 (LFI, PS, Écologistes, PCF…).", "g"),
    ENS: P("Ensemble", "Coalition de centre qui soutient Emmanuel Macron (Renaissance, MoDem, Horizons…).", "c"),
    LR: P("Les Républicains", "Parti de droite fondé en 2015, successeur de l'UMP.", "d"),
    EXG: P("Extrême gauche", "Candidats d'extrême gauche (Lutte ouvrière, NPA…).", "gr"),
    DVG: P("Divers gauche", "Candidats de gauche hors des grandes alliances.", "g"),
    DVC: P("Divers centre", "Candidats du centre hors de la coalition Ensemble.", "c"),
    DVD: P("Divers droite", "Candidats de droite hors des grands partis.", "d"),
    EXD: P("Extrême droite", "Candidats d'extrême droite hors du RN (Reconquête…).", "dr"),
    REG: P("Régionalistes", "Partis régionalistes ou autonomistes (Corse, Bretagne, Alsace, outre-mer…)."),
    DIV: P("Divers", "Candidats sans étiquette politique claire."),
    "LFI-NFP": P("La France insoumise – Nouveau Front populaire", "Groupe de gauche radicale à l'Assemblée nationale.", "gr"),
    GDR: P("Gauche démocrate et républicaine", "Groupe de gauche radicale : communistes et députés d'outre-mer.", "gr"),
    ECOS: P("Écologiste et social", "Groupe des députés écologistes, de gauche.", "g"),
    SOC: P("Socialistes et apparentés", "Groupe du Parti socialiste, social-démocrate de centre gauche.", "cg", "g"),
    LIOT: P("Libertés, indépendants, outre-mer et territoires", "Groupe centriste qui rassemble des députés de sensibilités variées.", "c"),
    DEM: P("Les Démocrates", "Groupe du MoDem, parti centriste allié d'Emmanuel Macron.", "c"),
    EPR: P("Ensemble pour la République", "Groupe de Renaissance, le parti centriste d'Emmanuel Macron.", "c"),
    HOR: P("Horizons et indépendants", "Groupe d'Horizons, parti de centre droit allié d'Emmanuel Macron.", "cd", "d"),
    DR: P("Droite républicaine", "Groupe des députés Les Républicains, parti de droite.", "d"),
    NI: P("Non-inscrits", "Députés qui ne font partie d'aucun groupe."),
  },
  allemagne: {
    Union: P("Union CDU/CSU", "Alliance de centre droit de la CDU et de la CSU, qui forment un groupe commun au Bundestag.", "cd", "d"),
    CDU: P("Union chrétienne-démocrate", "Parti de centre droit fondé en 1945 ; il se présente partout sauf en Bavière.", "cd", "d"),
    CSU: P("Union chrétienne-sociale", "Parti frère de la CDU, de centre droit et plus conservateur, qui ne se présente qu'en Bavière.", "cd", "d"),
    SPD: P("Parti social-démocrate", "Parti de centre gauche, le plus ancien parti allemand (XIXe siècle).", "cg", "g"),
    AfD: P("Alternative pour l'Allemagne", "Parti de droite nationaliste fondé en 2013 ; les autres grands partis refusent de gouverner avec lui.", "dr"),
    "Grüne": P("Alliance 90 / Les Verts", "Parti écologiste de centre gauche, issu en 1993 de l'union des Verts de l'Ouest et d'Alliance 90, venue de l'Est.", "cg", "g"),
    Linke: P("Die Linke (La Gauche)", "Parti de gauche radicale fondé en 2007.", "gr"),
    BSW: P("Alliance Sahra Wagenknecht", "Parti de gauche radicale fondé en 2024 par d'anciens membres de Die Linke, conservateur sur l'immigration et les questions de société ; resté sous 5 % en 2025.", "gr", "aut"),
    FDP: P("Parti libéral-démocrate", "Parti libéral de centre droit ; resté sous 5 % en 2025, il n'a plus de députés.", "cd", "c"),
    FW: P("Électeurs libres (Freie Wähler)", "Parti de centre droit surtout implanté en Bavière.", "cd", "d"),
    SSW: P("Association des électeurs du Schleswig du Sud", "Parti régionaliste et social-libéral (centre gauche) de la minorité danoise et frisonne, exempté du seuil de 5 %.", "cg", "g"),
  },
  suisse: {
    UDC: P("Union démocratique du centre", "Parti national-conservateur et populiste de droite, premier parti du pays depuis 1999.", "dr"),
    PS: P("Parti socialiste suisse", "Parti de gauche, deuxième force du Conseil national.", "g"),
    C: P("Le Centre", "Parti de centre né en 2021 de la fusion du PDC et du PBD.", "c"),
    PLR: P("PLR. Les Libéraux-Radicaux", "Parti libéral de centre droit né en 2009 de la fusion des radicaux et des libéraux.", "cd", "d"),
    VERT: P("Les Vert-e-s suisses", "Parti écologiste de gauche.", "g"),
    PVL: P("Vert'libéraux", "Parti de centre qui allie écologie et libéralisme économique.", "c"),
    PEV: P("Parti évangélique suisse", "Petit parti de centre d'inspiration chrétienne.", "c"),
    UDF: P("Union démocratique fédérale", "Petit parti de droite chrétienne conservatrice.", "d"),
    MCG: P("Mouvement citoyens genevois", "Parti populiste et régionaliste, classé à droite, présent seulement dans le canton de Genève.", "dp", "dr"),
    LEGA: P("Lega dei Ticinesi", "Parti populiste et régionaliste, classé à droite, présent seulement au Tessin.", "dp", "dr"),
    PST: P("Parti suisse du Travail – solidaritéS", "Petits partis de gauche radicale.", "gr"),
  },
};

const ESC = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function sectionPartis(dico, items, { titre = "Partis en lice", note = "", axe = true } = {}) {
  const wrap = document.querySelector("#vue-votes .lv-wrap"); if (!wrap || !dico) return;
  const liste = items.filter(x => dico[x.cle]);
  let sec = document.getElementById("viPartis"), bulle = document.getElementById("viPartisBulle");
  if (!sec) {
    sec = document.createElement("section"); sec.id = "viPartis"; sec.className = "vi-partis-bande"; sec.setAttribute("aria-label", titre);
    const haut = wrap.querySelector(".vi-haut");
    haut ? haut.before(sec) : wrap.append(sec);
    bulle = document.createElement("div"); bulle.id = "viPartisBulle"; bulle.className = "vi-partis-bulle"; bulle.setAttribute("role", "tooltip"); bulle.hidden = true;
    (sec.closest(".vue-live") || document.body).append(bulle);
    let actif = null, ouvertA = 0;
    const montrer = b => {
      const it = sec._items.find(x => x.cle === b.dataset.partieParti), d = dico[it?.cle]; if (!d) return;
      if (actif && actif !== b) actif.removeAttribute("aria-describedby");   // un seul parti en surbrillance à la fois
      actif = b; ouvertA = performance.now();
      sec._choisi = b.dataset.partieParti; appliquerSelection();   // sièges du parti en évidence
      bulle.style.setProperty("--c", it.couleur || "#8D949A");
      bulle.innerHTML = `<span class="vi-partis-sigle">${ESC(it.etiquette || it.cle)}</span><b>${ESC(d.nom)}</b><p>${ESC(d.info)}</p>${it.detail ? `<p class="vi-partis-chiffres">${it.detail}</p>` : ""}`;
      bulle.hidden = false;
      b.setAttribute("aria-describedby", "viPartisBulle");
      // sous le bouton (au-dessus s'il n'y a pas la place), sans sortir de l'écran
      const r = b.getBoundingClientRect(), w = bulle.offsetWidth, h = bulle.offsetHeight;
      bulle.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
      bulle.style.top = (r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + "px";
    };
    const cacher = () => { if (actif) actif.removeAttribute("aria-describedby"); actif = null; bulle.hidden = true; sec._choisi = null; appliquerSelection(); };
    // effet seulement sur un parti : hors des boutons (même dans la bande), tout redevient normal ; court délai pour
    // ne pas clignoter en passant d'un bouton à l'autre par l'espace entre eux
    let delai;
    sec.addEventListener("mouseover", e => { const b = e.target.closest("[data-partie-parti]"); clearTimeout(delai);
      if (b) { if (b !== actif) montrer(b); } else if (actif) delai = setTimeout(cacher, 90); });
    sec.addEventListener("mouseleave", () => { clearTimeout(delai); cacher(); });
    sec.addEventListener("focusin", e => { const b = e.target.closest("[data-partie-parti]"); if (b) montrer(b); });
    sec.addEventListener("focusout", cacher);
    // toucher (pas de survol) : un toucher montre le parti, un deuxième le cache
    let tactile = false;
    sec.addEventListener("pointerdown", e => { tactile = e.pointerType === "touch"; });
    sec.addEventListener("click", e => { const b = e.target.closest("[data-partie-parti]"); if (!b || !tactile) return;   // souris : le survol suffit
      if (b === actif && !bulle.hidden) { if (performance.now() - ouvertA > 400) cacher(); } else montrer(b); });
    // le plan est redessiné (autre chambre, autre vue) : on remet la mise en évidence
    const plan = document.getElementById("viPlan");
    if (plan) { let prevu = false; new MutationObserver(() => { if (prevu) return; prevu = true; requestAnimationFrame(() => { prevu = false; appliquerSelection(); }); }).observe(plan, { childList: true }); }
    document.addEventListener("keydown", e => { if (e.key === "Escape") cacher(); });
    addEventListener("scroll", cacher, { passive: true });
  }
  sec._items = liste;
  const bouton = x => `<button type="button" class="vi-partis-btn" style="--c:${x.couleur || "var(--muted)"}" data-partie-parti="${ESC(x.cle)}">`
    + `<i></i><b>${ESC(x.etiquette || x.cle)}</b><span title="${ESC(dico[x.cle].nom)}">${ESC(dico[x.cle].nom)}</span></button>`;
  // une seule ligne de boutons, rangés de gauche à droite (BORDS), sans titres de groupe
  // titre au-dessus, puis une colonne par groupe de l'axe gauche-droite (BORDS), de gauche à droite : nom du groupe en
  // tête de colonne, ses partis empilés dessous ; toutes les colonnes ont la même largeur
  const groupes = BORDS.map(([k, nom]) => [nom, liste.filter(x => (dico[x.cle].bord || "aut") === k), k]).filter(([, xs]) => xs.length);
  // axe : trait gauche → droite au-dessus des colonnes de l'axe (sans « Autres »), repère au milieu de la colonne Centre
  // (sans colonne Centre : dans l'espace entre le dernier groupe de gauche et le premier de droite)
  const nAxe = groupes.filter(g => g[2] !== "aut").length, iCentre = groupes.findIndex(g => g[2] === "c");
  const iDroite = groupes.findIndex(g => g[2] !== "aut" && RANG[g[2]] > RANG.c);
  const centre = iCentre >= 0 ? `<i class="vi-partis-centre" style="grid-column:${iCentre + 1}"></i>`
    : iDroite > 0 ? `<i class="vi-partis-centre vi-partis-entre" style="grid-column:${iDroite + 1}"></i>` : "";
  const regle = axe && nAxe > 1 ? `<div class="vi-partis-regle" style="--n:${groupes.length}" aria-hidden="true"><div class="vi-partis-trait" style="grid-column:1 / span ${nAxe}">`
    + `<span class="vi-partis-bout">Gauche</span>${centre}<span class="vi-partis-bout" style="grid-column:${nAxe}">Droite</span></div></div>` : "";
  sec.innerHTML = `<span class="vi-partis-titre">${ESC(titre)}</span>` + regle
    + `<div class="vi-partis-axe" style="--n:${groupes.length}">${groupes.map(([nom, xs]) => `<div class="vi-partis-col" role="group" aria-label="${ESC(nom)}">`
      + `<span class="vi-partis-glab">${ESC(nom)}</span>${xs.map(bouton).join("")}</div>`).join("")}</div>`
    + (note ? `<small class="vi-partis-note">${ESC(note)}</small>` : "");
}

// mise en évidence du parti survolé dans le plan ou l'hémicycle : ses sièges en couleur, les autres en gris
function appliquerSelection() {
  const sec = document.getElementById("viPartis"), plan = document.getElementById("viPlan"); if (!sec) return;
  const k = sec._choisi;
  if (!plan) return;
  const sieges = [...plan.querySelectorAll("[data-p]")], siens = k ? sieges.filter(e => e.dataset.p.split(" ").includes(k)) : [];
  sieges.forEach(e => e.toggleAttribute("data-sel", siens.includes(e)));
  plan.classList.toggle("vi-plan-filtre", siens.length > 0);
}
