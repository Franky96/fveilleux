/* Section « Les partis » des pages d'intentions de vote : la liste des partis en lice (bouton par parti, couleur, sigle,
   nom complet et un chiffre de la page) ; un clic ouvre sa fiche (nom complet, brève description, chiffres de la page).

   sectionPartis(dico, items, { titre, note })
     dico  : dictionnaire d'un pays (PARTIS.quebec, PARTIS.canada…) : { clé: { nom, info } }
     items : [{ cle, etiquette, couleur, detail }] dans l'ordre d'affichage (clé du dictionnaire, sigle affiché,
             couleur du parti sur la page, phrase de chiffres tirés des données de la page)
     La section est placée (une fois, puis mise à jour) en haut de la page, à côté du graphique d'évolution ; le rectangle
     de l'assemblée (plan ou hémicycle) passe juste en dessous, sur toute la largeur.
   Les descriptions restent générales (orientation, origine) : pas de chefs ni de chiffres qui changent. */

const P = (nom, info) => ({ nom, info });
export const PARTIS = {
  quebec: {
    PQ: P("Parti québécois", "Parti souverainiste et social-démocrate fondé en 1968 par René Lévesque."),
    PLQ: P("Parti libéral du Québec", "Parti fédéraliste de centre, le plus ancien parti du Québec (1867)."),
    CAQ: P("Coalition avenir Québec", "Parti nationaliste de centre droit fondé en 2011 ; il a gouverné de 2018 à 2026."),
    PCQ: P("Parti conservateur du Québec", "Parti de droite, relancé en 2009."),
    QS: P("Québec solidaire", "Parti de gauche, souverainiste et écologiste, fondé en 2006."),
  },
  canada: {
    PLC: P("Parti libéral du Canada", "Parti de centre, présent depuis la Confédération ; il gouverne depuis 2015."),
    PCC: P("Parti conservateur du Canada", "Parti de droite né en 2003 de la fusion de l'Alliance canadienne et du Parti progressiste-conservateur."),
    BQ: P("Bloc québécois", "Parti souverainiste qui ne présente des candidats qu'au Québec, fondé en 1991."),
    NPD: P("Nouveau Parti démocratique", "Parti de gauche social-démocrate fondé en 1961."),
    PVC: P("Parti vert du Canada", "Parti écologiste fondé en 1983."),
    PPC: P("Parti populaire du Canada", "Parti de droite populiste fondé en 2018."),
  },
  usa: {
    D: P("Parti démocrate", "Parti de centre gauche, le plus ancien des deux grands partis (fondé en 1828)."),
    R: P("Parti républicain", "Parti de droite conservatrice fondé en 1854, surnommé le « Grand Old Party » (GOP)."),
    I: P("Indépendant", "Élu sans étiquette ; au Sénat, les deux indépendants votent avec les démocrates."),
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
  },
  suisse: {
    UDC: P("Union démocratique du centre", "Parti de droite conservatrice, premier parti du pays depuis 1999."),
    PS: P("Parti socialiste suisse", "Parti de gauche, deuxième force du Conseil national."),
    C: P("Le Centre", "Parti de centre né en 2021 de la fusion du PDC et du PBD."),
    PLR: P("PLR. Les Libéraux-Radicaux", "Parti de droite libérale né en 2009 de la fusion des radicaux et des libéraux."),
    VERT: P("Les Vert-e-s suisses", "Parti écologiste de gauche."),
    PVL: P("Vert'libéraux", "Parti de centre qui allie écologie et libéralisme économique."),
    PEV: P("Parti évangélique suisse", "Petit parti de centre d'inspiration chrétienne."),
    UDF: P("Union démocratique fédérale", "Petit parti de droite chrétienne conservatrice."),
    MCG: P("Mouvement citoyens genevois", "Parti populiste présent seulement dans le canton de Genève."),
    LEGA: P("Lega dei Ticinesi", "Parti populiste présent seulement au Tessin."),
    PST: P("Parti suisse du Travail – solidaritéS", "Petits partis de gauche radicale."),
  },
};

const ESC = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function sectionPartis(dico, items, { titre = "Les partis", note = "" } = {}) {
  const wrap = document.querySelector("#vue-votes .lv-wrap"); if (!wrap || !dico) return;
  const liste = items.filter(x => dico[x.cle]);
  let sec = document.getElementById("viPartis");
  if (!sec) {
    sec = document.createElement("section"); sec.id = "viPartis"; sec.className = "lv-sieges vi-partis"; sec.setAttribute("aria-labelledby", "viPartisTitre");
    // en haut de la page, à côté du graphique, à la place du rectangle de l'assemblée ; celui-ci passe juste en dessous
    const haut = wrap.querySelector(".vi-haut"), sieges = document.getElementById("viPlan")?.closest("section");
    if (haut) {
      haut.prepend(sec);
      if (sieges && sieges.parentElement === haut) { haut.after(sieges); sieges.classList.add("vi-sieges-bas"); }
    } else wrap.append(sec);
    sec.addEventListener("click", e => {
      const b = e.target.closest("[data-partie-parti]"); if (!b) return;
      const ouvert = b.getAttribute("aria-expanded") === "true";
      sec.querySelectorAll("[data-partie-parti]").forEach(x => x.setAttribute("aria-expanded", "false"));
      const fiche = sec.querySelector(".vi-partis-fiche");
      if (ouvert) { fiche.hidden = true; return; }
      b.setAttribute("aria-expanded", "true");
      const it = sec._items.find(x => x.cle === b.dataset.partieParti), d = dico[it.cle];
      fiche.style.setProperty("--c", it.couleur || "var(--muted)");
      fiche.innerHTML = `<span class="vi-partis-sigle">${ESC(it.etiquette || it.cle)}</span><h4>${ESC(d.nom)}</h4><p>${ESC(d.info)}</p>${it.detail ? `<p class="vi-partis-chiffres">${it.detail}</p>` : ""}`;
      fiche.hidden = false;
      fiche.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });   // sur téléphone, la fiche est sous la liste
    });
  }
  sec._items = liste;
  sec.innerHTML = `<span class="lv-eyebrow">Partis en lice</span><h3 id="viPartisTitre">${ESC(titre)}</h3>
    <p class="lv-muted">${note ? ESC(note) + " " : ""}Clique sur un parti pour sa fiche.</p>
    <div class="vi-partis-liste">${liste.map(x => `<button type="button" class="vi-partis-btn" style="--c:${x.couleur || "var(--muted)"}" data-partie-parti="${ESC(x.cle)}" aria-expanded="false" aria-controls="viPartisFiche">`
      + `<i></i><b>${ESC(x.etiquette || x.cle)}</b><span>${ESC(dico[x.cle].nom)}</span></button>`).join("")}</div>
    <div class="vi-partis-fiche" id="viPartisFiche" aria-live="polite" hidden></div>`;
}
