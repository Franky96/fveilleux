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

// Axes multiples (essai sur Votes Québec) : deuxième axe d'un pays, avec une valeur et sa justification factuelle par
// parti ; axe horizontal = colonne gauche-droite de la bande (BORDS), centre au milieu
export const AXES = {
  quebec: {
    titre: "Affirmation identitaire", bas: "moins", haut: "plus", max: 3,   // max : valeur extrême possible (3 sujets × 1)
    note: "Axe vertical : somme de trois positions, de −1 à +1 chacune : immigration (seuil annuel promis en 2026), laïcité (loi 21 et interdiction "
      + "des signes religieux), langue (loi 96). Sources : programmes de la campagne 2026 (La Presse, CTV, Le Délit), votes à l'Assemblée nationale "
      + "(loi 21 en 2019, loi 96 en 2022). Axe horizontal : groupe gauche-droite de la bande des partis.",
    valeurs: {
      PQ: { y: 3, pourquoi: "immigration : baisse à 35 000 par an (+1) · laïcité : défend la loi 21, votée en 2019 (+1) · langue : contre la loi 96 en 2022 parce qu'elle n'allait pas assez loin (+1)" },
      CAQ: { y: 2, pourquoi: "immigration : maintien à 45 000 par an et baisse des temporaires (+½) · laïcité : a fait adopter la loi 21 et renouvelé sa dérogation jusqu'en 2031 (+1) · langue : a fait adopter la loi 96 (+½)" },
      PCQ: { y: 1, pourquoi: "immigration : seuils fixés par chaque région, sans chiffre (0) · laïcité : renouvellerait la dérogation de la loi 21 et appuie l'interdiction des signes religieux pour tout le personnel des écoles (+1) · langue : garderait la dérogation de la loi 96 mais en changerait des articles (0)" },
      QS: { y: -1.5, pourquoi: "immigration : hausse à 70 000 par an (−1) · laïcité : contre la loi 21 en 2019, abrogerait l'interdiction des signes religieux (−1) · langue : pour la loi 96 en 2022 (+½)" },
      PLQ: { y: -2.5, pourquoi: "immigration : 45 000 à 70 000 par an (−½) · laïcité : contre la loi 21 en 2019, ne renouvellerait pas sa dérogation (−1) · langue : contre la loi 96 en 2022 (−1)" },
    },
  },
};

const ESC = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function sectionPartis(dico, items, { titre = "Partis en lice", note = "", axe = true, multi = null } = {}) {
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
      const ax = sec._multiOn && sec._multi?.valeurs[it.cle];
      bulle.innerHTML = `<span class="vi-partis-sigle">${ESC(it.etiquette || it.cle)}</span><b>${ESC(d.nom)}</b><p>${ESC(d.info)}</p>${it.detail ? `<p class="vi-partis-chiffres">${it.detail}</p>` : ""}`
        + (ax ? `<p class="vi-partis-chiffres"><b>${ESC(sec._multi.titre)}</b> : ${ESC(ax.pourquoi)}</p>` : "");
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
    // bouton « Axes multiples » : la bande passe des colonnes au graphique à deux axes, et inversement
    sec.addEventListener("click", e => { if (!e.target.closest(".vi-partis-multi")) return; cacher(); transformer(sec); });
    let attente; addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(() => { if (sec._multiOn) dessinerMulti(sec); }, 120); });
    addEventListener("scroll", cacher, { passive: true });
  }
  sec._items = liste; sec._dico = dico; sec._multi = multi;
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
  const tete = multi ? `<div class="vi-partis-tete"><span class="vi-partis-titre">${ESC(titre)}</span>`
    + `<button type="button" class="vi-partis-multi" aria-pressed="false">Axes multiples</button></div>` : `<span class="vi-partis-titre">${ESC(titre)}</span>`;
  sec.innerHTML = tete + regle
    + `<div class="vi-partis-axe" style="--n:${groupes.length}">${groupes.map(([nom, xs]) => `<div class="vi-partis-col" role="group" aria-label="${ESC(nom)}">`
      + `<span class="vi-partis-glab">${ESC(nom)}</span>${xs.map(bouton).join("")}</div>`).join("")}</div>`
    + (multi ? `<div class="vi-partis-plan2" hidden></div>` : "")
    + (note ? `<small class="vi-partis-note">${ESC(note)}</small>` : "");
  if (multi) basculerMulti(sec);
}

function basculerMulti(sec) {
  const on = !!sec._multiOn, box = sec.querySelector(".vi-partis-plan2"); if (!box) return;
  sec.classList.toggle("vi-multi", on); box.hidden = !on;
  sec.querySelector(".vi-partis-multi")?.setAttribute("aria-pressed", String(on));
  if (on) dessinerMulti(sec);
}

// passage colonnes ⇄ graphique animé : le rectangle change de hauteur en douceur et chaque parti glisse de son bouton
// à son point (ou de son point à son bouton) ; rien d'animé si l'utilisateur a demandé moins de mouvement
const DOUX = "cubic-bezier(.2,.8,.2,1)";
function reperes(sec) {   // centre de la marque de couleur de chaque parti dans la vue affichée
  const m = {};
  sec.querySelectorAll(sec._multiOn ? ".vi-m-pt circle" : ".vi-partis-col .vi-partis-btn i").forEach(el => {
    const r = el.getBoundingClientRect(); m[el.closest("[data-partie-parti]").dataset.partieParti] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  return m;
}
function transformer(sec) {
  const avant = reperes(sec), h0 = sec.offsetHeight;
  sec._multiOn = !sec._multiOn; basculerMulti(sec);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const apres = reperes(sec), h1 = sec.offsetHeight;
  sec.getAnimations().forEach(a => a.cancel());
  sec.style.overflow = "hidden";
  sec.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: 600, easing: DOUX }).finished.then(() => { sec.style.overflow = ""; }, () => {});
  const fondu = (els, delai, duree = 450) => els.forEach(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duree, delay: delai, easing: "ease-out", fill: "backwards" }));
  if (sec._multiOn) {
    sec.querySelectorAll(".vi-m-pt").forEach((g, i) => {
      const a = avant[g.dataset.partieParti], b = apres[g.dataset.partieParti]; if (!a || !b) return;
      g.animate([{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px)` }, { transform: "none" }], { duration: 750, delay: 50 * i, easing: DOUX, fill: "backwards" });
      fondu([g.querySelector("text")], 500 + 50 * i, 300);
    });
    fondu(sec.querySelectorAll(".vi-m-fond"), 150, 600);
    fondu(sec.querySelectorAll(".vi-partis-plan2 .vi-partis-note"), 450);
  } else {
    sec.querySelectorAll(".vi-partis-col .vi-partis-btn").forEach((btn, i) => {
      const a = avant[btn.dataset.partieParti], b = apres[btn.dataset.partieParti]; if (!a || !b) return;
      const r = btn.getBoundingClientRect(); btn.style.transformOrigin = `${b.x - r.left}px ${b.y - r.top}px`;
      btn.animate([{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(.25)`, opacity: 0.4 }, { transform: "none", opacity: 1 }],
        { duration: 650, delay: 40 * i, easing: DOUX, fill: "backwards" });
    });
    fondu(sec.querySelectorAll(".vi-partis-glab, .vi-partis-regle, .vi-partis-bande > .vi-partis-note"), 250);
  }
}

// graphique à deux axes, carré : x = groupe de la bande (centre = 0), y = valeur du deuxième axe ; les deux axes couvrent la
// même longueur (de bout en bout), donc un carré de taille fixe au milieu du rectangle, plus petit si la page est étroite ;
// points survolables comme les boutons
function dessinerMulti(sec) {
  const m = sec._multi, box = sec.querySelector(".vi-partis-plan2"); if (!m || !box) return;
  const pts = sec._items.filter(it => m.valeurs[it.cle] && sec._dico[it.cle].bord !== "aut")
    .map(it => ({ it, x: RANG[sec._dico[it.cle].bord] - RANG.c, y: m.valeurs[it.cle].y }));
  const mx = Math.max(1, ...pts.map(p => Math.abs(p.x))) + 0.5, my = (m.max ?? Math.max(1, ...pts.map(p => Math.abs(p.y)))) + 0.4;
  const g = { l: 56, r: 56, t: 30, b: 46 }, S = Math.round(Math.max(200, Math.min(440, box.clientWidth - g.l - g.r)));
  const W = S + g.l + g.r, H = S + g.t + g.b;
  const X = x => g.l + (x + mx) / (2 * mx) * S, Y = y => g.t + (my - y) / (2 * my) * S;
  let fond = "";
  for (let r = -Math.floor(mx); r <= Math.floor(mx); r++) {   // un repère par groupe gauche-droite (nom sur deux lignes au trait d'union)
    const b = BORDS[r + RANG.c]; if (!b || b[0] === "aut") continue;
    const [l1, l2] = b[1].includes("-") ? [b[1].slice(0, b[1].indexOf("-") + 1), b[1].slice(b[1].indexOf("-") + 1)] : [b[1], ""];
    fond += `<line class="vi-m-grille" x1="${X(r)}" x2="${X(r)}" y1="${g.t}" y2="${g.t + S}"/>`
      + `<text class="vi-m-tick" x="${X(r)}" y="${g.t + S + 17}" text-anchor="middle">${ESC(l1)}${l2 ? `<tspan x="${X(r)}" dy="12">${ESC(l2)}</tspan>` : ""}</text>`;
  }
  fond += `<rect class="vi-m-cadre" x="${g.l}" y="${g.t}" width="${S}" height="${S}"/>`
    + `<line class="vi-m-axe" x1="${g.l}" x2="${g.l + S}" y1="${Y(0)}" y2="${Y(0)}"/><line class="vi-m-axe" x1="${X(0)}" x2="${X(0)}" y1="${g.t}" y2="${g.t + S}"/>`
    + `<text class="vi-m-titre" x="${X(0)}" y="${g.t - 11}" text-anchor="middle">▲ ${ESC(m.titre)} : ${ESC(m.haut)}</text>`
    + `<text class="vi-m-titre" x="${X(0) + 8}" y="${g.t + S - 7}">▼ ${ESC(m.bas)}</text>`;
  const points = pts.map(p => `<g class="vi-m-pt" data-partie-parti="${ESC(p.it.cle)}" tabindex="0" style="--c:${p.it.couleur || "var(--muted)"}">`
    + `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="9"/><text x="${X(p.x) + 14}" y="${Y(p.y) + 4.5}">${ESC(p.it.etiquette || p.it.cle)}</text></g>`).join("");
  box.innerHTML = `<svg class="vi-m-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ESC(`Partis selon l'axe gauche-droite et l'axe ${m.titre.toLowerCase()}`)}">`
    + `<g class="vi-m-fond">${fond}</g>${points}</svg><small class="vi-partis-note">${ESC(m.note)}</small>`;
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
