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

// Axes multiples (essai sur Votes Québec) : axes supplémentaires d'un pays, avec une valeur (v) et sa justification
// factuelle par parti ; axe horizontal = colonne gauche-droite de la bande (BORDS), centre au milieu ; y = axe vertical
// (2 et 3 axes), z = axe de profondeur (3 axes, vue 3D, facultatif) ; max = valeur extrême possible ; decal (facultatif) :
// les crans affichent la note d'origine (v + decal) au lieu d'une valeur signée
export const AXES = {
  quebec: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Affirmation identitaire", bas: "moins", haut: "plus", max: 3, bouts3: ["Identitaire −", "Identitaire +"],
      note: "Axe identitaire : somme de trois positions, de −1 à +1 chacune : immigration (seuil annuel promis en 2026), laïcité (loi 21 et "
        + "interdiction des signes religieux), langue (loi 96). Sources : programmes de la campagne 2026 (La Presse, CTV, Le Délit), votes à "
        + "l'Assemblée nationale (loi 21 en 2019, loi 96 en 2022).",
      valeurs: {
        PQ: { v: 3, pourquoi: "immigration : baisse à 35 000 par an (+1) · laïcité : défend la loi 21, votée en 2019 (+1) · langue : contre la loi 96 en 2022 parce qu'elle n'allait pas assez loin (+1)" },
        CAQ: { v: 2, pourquoi: "immigration : maintien à 45 000 par an et baisse des temporaires (+½) · laïcité : a fait adopter la loi 21 et renouvelé sa dérogation jusqu'en 2031 (+1) · langue : a fait adopter la loi 96 (+½)" },
        PCQ: { v: 1, pourquoi: "immigration : seuils fixés par chaque région, sans chiffre (0) · laïcité : renouvellerait la dérogation de la loi 21 et appuie l'interdiction des signes religieux pour tout le personnel des écoles (+1) · langue : garderait la dérogation de la loi 96 mais en changerait des articles (0)" },
        QS: { v: -1.5, pourquoi: "immigration : hausse à 70 000 par an (−1) · laïcité : contre la loi 21 en 2019, abrogerait l'interdiction des signes religieux (−1) · langue : pour la loi 96 en 2022 (+½)" },
        PLQ: { v: -2.5, pourquoi: "immigration : 45 000 à 70 000 par an (−½) · laïcité : contre la loi 21 en 2019, ne renouvellerait pas sa dérogation (−1) · langue : contre la loi 96 en 2022 (−1)" },
      },
    },
    z: {
      titre: "Question nationale", bas: "fédéralisme", haut: "souveraineté", max: 2, bouts3: ["Fédéralisme", "Souveraineté"],
      note: "Axe de la question nationale : souverainiste = +2, autonomiste dans le Canada = 0, fédéraliste = −2 (programmes de la campagne 2026 : "
        + "CBC, Le Devoir, La Presse).",
      valeurs: {
        PQ: { v: 2, pourquoi: "souverainiste : promet un référendum sur l'indépendance après janvier 2029 (130 M$ prévus)" },
        QS: { v: 2, pourquoi: "souverainiste : assemblée constituante comme première étape vers un Québec souverain" },
        CAQ: { v: 0, pourquoi: "autonomiste : nationaliste dans le Canada, contre un référendum" },
        PCQ: { v: 0, pourquoi: "autonomiste depuis 2026 : constitution québécoise et rapatriement de pouvoirs dans le Canada, contre un référendum" },
        PLQ: { v: -2, pourquoi: "fédéraliste, contre un référendum" },
      },
    },
  },
  // autres pays : enquêtes d'experts (CHES 2024 pour l'Europe, Global Party Survey 2019 pour le Canada et les États-Unis),
  // valeurs centrées (v = note − decal ; decal remet la note d'origine sur les crans) ; Alberta : camp au référendum
  canada: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Valeurs sociales", bas: "libérales", haut: "conservatrices", max: 5, decal: 5, bouts3: ["Libéral", "Conservateur"],
      note: "Axe des valeurs : note de l'enquête d'experts Global Party Survey (Norris, 2019), de 0 (libéral) à 10 (conservateur) sur les valeurs sociales.",
      valeurs: {
        "PLC": { v: -2.4, pourquoi: "2,6 sur 10 (Global Party Survey 2019)" },
        "PCC": { v: 2.5, pourquoi: "7,5 sur 10 (Global Party Survey 2019)" },
        "BQ": { v: -2.42, pourquoi: "2,6 sur 10 (Global Party Survey 2019)" },
        "NPD": { v: -3.5, pourquoi: "1,5 sur 10 (Global Party Survey 2019)" },
        "PVC": { v: -2.86, pourquoi: "2,1 sur 10 (Global Party Survey 2019)" },
      },
    },
    z: {
      titre: "Populisme", bas: "pluraliste", haut: "populiste", max: 5, decal: 5, bouts3: ["Pluraliste", "Populiste"],
      note: "Axe du populisme : discours du parti dans la même enquête (Global Party Survey 2019), de 0 (pluraliste) à 10 (populiste).",
      valeurs: {
        "PLC": { v: -3.0, pourquoi: "2,0 sur 10 (Global Party Survey 2019)" },
        "PCC": { v: 0.09, pourquoi: "5,1 sur 10 (Global Party Survey 2019)" },
        "BQ": { v: -1.07, pourquoi: "3,9 sur 10 (Global Party Survey 2019)" },
        "NPD": { v: -2.69, pourquoi: "2,3 sur 10 (Global Party Survey 2019)" },
        "PVC": { v: -3.08, pourquoi: "1,9 sur 10 (Global Party Survey 2019)" },
      },
    },
  },
  usa: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Valeurs sociales", bas: "libérales", haut: "conservatrices", max: 5, decal: 5, bouts3: ["Libéral", "Conservateur"],
      note: "Axe des valeurs : note de l'enquête d'experts Global Party Survey (Norris, 2019), de 0 (libéral) à 10 (conservateur) sur les valeurs sociales.",
      valeurs: {
        "D": { v: -2.59, pourquoi: "2,4 sur 10 (Global Party Survey 2019)" },
        "R": { v: 3.3, pourquoi: "8,3 sur 10 (Global Party Survey 2019)" },
      },
    },
    z: {
      titre: "Populisme", bas: "pluraliste", haut: "populiste", max: 5, decal: 5, bouts3: ["Pluraliste", "Populiste"],
      note: "Axe du populisme : discours du parti dans la même enquête (Global Party Survey 2019), de 0 (pluraliste) à 10 (populiste).",
      valeurs: {
        "D": { v: -1.29, pourquoi: "3,7 sur 10 (Global Party Survey 2019)" },
        "R": { v: 2.83, pourquoi: "7,8 sur 10 (Global Party Survey 2019)" },
      },
    },
  },
  france: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Valeurs (GAL-TAN)", bas: "progressistes", haut: "traditionalistes", max: 5, decal: 5, bouts3: ["Progressiste", "Traditionaliste"],
      note: "Axe des valeurs : note GAL-TAN de l'enquête d'experts Chapel Hill (CHES 2024), de 0 (progressiste-libertaire) à 10 (traditionaliste-autoritaire-nationaliste).",
      valeurs: {
        "LFI-NFP": { v: -3.18, pourquoi: "1,8 sur 10 (CHES 2024)" },
        "GDR": { v: -1.45, pourquoi: "3,5 sur 10 (CHES 2024)" },
        "ECOS": { v: -3.3, pourquoi: "1,7 sur 10 (CHES 2024)" },
        "SOC": { v: -2.27, pourquoi: "2,7 sur 10 (CHES 2024)" },
        "EPR": { v: -0.91, pourquoi: "4,1 sur 10 (CHES 2024)" },
        "DEM": { v: -0.5, pourquoi: "4,5 sur 10 (CHES 2024)" },
        "HOR": { v: 0.3, pourquoi: "5,3 sur 10 (CHES 2024)" },
        "DR": { v: 2.18, pourquoi: "7,2 sur 10 (CHES 2024)" },
        "RN": { v: 3.36, pourquoi: "8,4 sur 10 (CHES 2024)" },
      },
    },
    z: {
      titre: "Intégration européenne", bas: "contre", haut: "pour", max: 3, decal: 4, bouts3: ["Eurosceptique", "Pro-européen"],
      note: "Axe européen : position sur l'intégration européenne dans la même enquête (CHES 2024), de 1 (très opposé) à 7 (très favorable).",
      valeurs: {
        "LFI-NFP": { v: -1.0, pourquoi: "3,0 sur 7 (CHES 2024)" },
        "GDR": { v: -0.89, pourquoi: "3,1 sur 7 (CHES 2024)" },
        "ECOS": { v: 2.2, pourquoi: "6,2 sur 7 (CHES 2024)" },
        "SOC": { v: 2.27, pourquoi: "6,3 sur 7 (CHES 2024)" },
        "EPR": { v: 2.27, pourquoi: "6,3 sur 7 (CHES 2024)" },
        "DEM": { v: 2.82, pourquoi: "6,8 sur 7 (CHES 2024)" },
        "HOR": { v: 2.44, pourquoi: "6,4 sur 7 (CHES 2024)" },
        "DR": { v: 1.27, pourquoi: "5,3 sur 7 (CHES 2024)" },
        "RN": { v: -1.82, pourquoi: "2,2 sur 7 (CHES 2024)" },
      },
    },
  },
  allemagne: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Valeurs (GAL-TAN)", bas: "progressistes", haut: "traditionalistes", max: 5, decal: 5, bouts3: ["Progressiste", "Traditionaliste"],
      note: "Axe des valeurs : note GAL-TAN de l'enquête d'experts Chapel Hill (CHES 2024), de 0 (progressiste-libertaire) à 10 (traditionaliste-autoritaire-nationaliste).",
      valeurs: {
        "CDU": { v: 1.56, pourquoi: "6,6 sur 10 (CHES 2024)" },
        "CSU": { v: 2.54, pourquoi: "7,5 sur 10 (CHES 2024)" },
        "SPD": { v: -1.39, pourquoi: "3,6 sur 10 (CHES 2024)" },
        "Grüne": { v: -3.39, pourquoi: "1,6 sur 10 (CHES 2024)" },
        "Linke": { v: -2.71, pourquoi: "2,3 sur 10 (CHES 2024)" },
        "AfD": { v: 4.39, pourquoi: "9,4 sur 10 (CHES 2024)" },
        "BSW": { v: 2.06, pourquoi: "7,1 sur 10 (CHES 2024)" },
        "FDP": { v: -1.78, pourquoi: "3,2 sur 10 (CHES 2024)" },
        "FW": { v: 1.7, pourquoi: "6,7 sur 10 (CHES 2024)" },
      },
    },
    z: {
      titre: "Intégration européenne", bas: "contre", haut: "pour", max: 3, decal: 4, bouts3: ["Eurosceptique", "Pro-européen"],
      note: "Axe européen : position sur l'intégration européenne dans la même enquête (CHES 2024), de 1 (très opposé) à 7 (très favorable).",
      valeurs: {
        "CDU": { v: 2.42, pourquoi: "6,4 sur 7 (CHES 2024)" },
        "CSU": { v: 1.5, pourquoi: "5,5 sur 7 (CHES 2024)" },
        "SPD": { v: 2.37, pourquoi: "6,4 sur 7 (CHES 2024)" },
        "Grüne": { v: 2.79, pourquoi: "6,8 sur 7 (CHES 2024)" },
        "Linke": { v: -0.28, pourquoi: "3,7 sur 7 (CHES 2024)" },
        "AfD": { v: -2.11, pourquoi: "1,9 sur 7 (CHES 2024)" },
        "BSW": { v: -1.58, pourquoi: "2,4 sur 7 (CHES 2024)" },
        "FDP": { v: 1.84, pourquoi: "5,8 sur 7 (CHES 2024)" },
        "FW": { v: 0.0, pourquoi: "4,0 sur 7 (CHES 2024)" },
      },
    },
  },
  suisse: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Valeurs (GAL-TAN)", bas: "progressistes", haut: "traditionalistes", max: 5, decal: 5, bouts3: ["Progressiste", "Traditionaliste"],
      note: "Axe des valeurs : note GAL-TAN de l'enquête d'experts Chapel Hill (CHES 2024), de 0 (progressiste-libertaire) à 10 (traditionaliste-autoritaire-nationaliste).",
      valeurs: {
        "UDC": { v: 4.07, pourquoi: "9,1 sur 10 (CHES 2024)" },
        "PS": { v: -3.8, pourquoi: "1,2 sur 10 (CHES 2024)" },
        "C": { v: 0.87, pourquoi: "5,9 sur 10 (CHES 2024)" },
        "PLR": { v: 0.13, pourquoi: "5,1 sur 10 (CHES 2024)" },
        "VERT": { v: -4.0, pourquoi: "1,0 sur 10 (CHES 2024)" },
        "PVL": { v: -2.8, pourquoi: "2,2 sur 10 (CHES 2024)" },
        "PEV": { v: 2.25, pourquoi: "7,2 sur 10 (CHES 2024)" },
        "UDF": { v: 4.25, pourquoi: "9,2 sur 10 (CHES 2024)" },
        "MCG": { v: 2.75, pourquoi: "7,8 sur 10 (CHES 2024)" },
        "LEGA": { v: 3.6, pourquoi: "8,6 sur 10 (CHES 2024)" },
      },
    },
    z: {
      titre: "Intégration européenne", bas: "contre", haut: "pour", max: 3, decal: 4, bouts3: ["Eurosceptique", "Pro-européen"],
      note: "Axe européen : position sur l'intégration européenne dans la même enquête (CHES 2024), de 1 (très opposé) à 7 (très favorable).",
      valeurs: {
        "UDC": { v: -2.93, pourquoi: "1,1 sur 7 (CHES 2024)" },
        "PS": { v: 1.6, pourquoi: "5,6 sur 7 (CHES 2024)" },
        "C": { v: 0.07, pourquoi: "4,1 sur 7 (CHES 2024)" },
        "PLR": { v: 0.13, pourquoi: "4,1 sur 7 (CHES 2024)" },
        "VERT": { v: 0.87, pourquoi: "4,9 sur 7 (CHES 2024)" },
        "PVL": { v: 2.0, pourquoi: "6,0 sur 7 (CHES 2024)" },
        "PEV": { v: -0.1, pourquoi: "3,9 sur 7 (CHES 2024)" },
        "UDF": { v: -2.17, pourquoi: "1,8 sur 7 (CHES 2024)" },
        "MCG": { v: -2.73, pourquoi: "1,3 sur 7 (CHES 2024)" },
        "LEGA": { v: -2.77, pourquoi: "1,2 sur 7 (CHES 2024)" },
      },
    },
  },
  alberta: {
    noteX: "Axe gauche-droite : groupe de la bande des partis.",
    y: {
      titre: "Séparation de l'Alberta", bas: "rester au Canada", haut: "séparation", max: 2,
      note: "Axe de la séparation : camp du parti au référendum du 19 octobre 2026 (rester au Canada ou lancer le processus de séparation), "
        + "d'après le relevé de Daveberta (17 octobre 2026), CP24 et CTV : séparation = +2, parti divisé dont le chef appuie Rester = −1, Rester = −2.",
      valeurs: {
        RPA: { v: 2, pourquoi: "pour un référendum exécutoire sur l'indépendance ; son chef, Cameron Davies, appuie l'option séparation" },
        UCP: { v: -1, pourquoi: "parti divisé : la première ministre Danielle Smith et une quinzaine de députés votent Rester ; un député et des responsables du parti appuient la séparation ; son gouvernement a tenu le référendum" },
        NPD: { v: -2, pourquoi: "campagne « For Alberta, For Canada » pour rester ; Naheed Nenshi a demandé d'annuler ou de reporter le vote" },
        LIB: { v: -2, pourquoi: "campagne « Alberta in Canada » pour rester" },
        VERT: { v: -2, pourquoi: "son chef, James Anderson, appuie l'option Rester" },
        PT: { v: -2, pourquoi: "son chef, Peter Guthrie, appuie l'option Rester" },
      },
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
      const axes = sec._multiOn ? [sec._multi.y, sec._vue === 3 && sec._multi.z].filter(a => a?.valeurs[it.cle]) : [];
      bulle.innerHTML = `<span class="vi-partis-sigle">${ESC(it.etiquette || it.cle)}</span><b>${ESC(d.nom)}</b><p>${ESC(d.info)}</p>${it.detail ? `<p class="vi-partis-chiffres">${it.detail}</p>` : ""}`
        + axes.map(a => `<p class="vi-partis-chiffres"><b>${ESC(a.titre)}</b> : ${ESC(a.valeurs[it.cle].pourquoi)}</p>`).join("");
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
    sec.addEventListener("click", e => { const v = e.target.closest("[data-vue]"); if (v) { cacher(); choisirVue(sec, +v.dataset.vue); } });
    // vue 3D : glisser pour tourner (au toucher, glisser de côté ; la page défile toujours de haut en bas) ; de gauche à
    // droite, la rotation reste entre la face de gauche (lacet −90°) et la face de droite (lacet +90°), en passant par la face avant ; de haut en bas, entre la vue
    // de face (tangage 0, jamais par-dessous) et une vue presque d'en haut
    let glisse = null;
    sec.addEventListener("pointerdown", e => { const svg = e.target.closest(".vi-m-3d"); if (!svg || e.button) return;
      cancelAnimationFrame(sec._raf); glisse = { x: e.clientX, y: e.clientY, a: sec._angle }; svg.setPointerCapture(e.pointerId); svg.classList.add("vi-m-tient"); });
    sec.addEventListener("pointermove", e => { if (!glisse) return; const [a, b] = glisse.a;
      sec._angle = [Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a - (e.clientX - glisse.x) * 0.008)), Math.max(0, Math.min(1.35, b + (e.clientY - glisse.y) * 0.008))]; dessiner3D(sec); });
    const lacher = () => { glisse = null; sec.querySelector(".vi-m-tient")?.classList.remove("vi-m-tient"); };
    sec.addEventListener("pointerup", lacher); sec.addEventListener("pointercancel", lacher);
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
    + (multi.z ? `<div class="vi-partis-vues" role="group" aria-label="Nombre d'axes" hidden><button type="button" data-vue="2" aria-pressed="true">2 axes</button>`
      + `<button type="button" data-vue="3" aria-pressed="false">3 axes · 3D</button></div>` : "")
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
  const vues = sec.querySelector(".vi-partis-vues");
  if (vues) { vues.hidden = !on; vues.querySelectorAll("[data-vue]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.vue === (sec._vue || 2)))); }
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
// points et dimensions communs aux vues 2 et 3 axes (le carré de la vue 2 axes = la face avant du cube de la vue 3D)
function cadreMulti(sec, box) {
  const m = sec._multi, deux = sec._vue === 3 && m.z;
  const pts = sec._items.filter(it => m.y.valeurs[it.cle] && (!deux || m.z.valeurs[it.cle]) && sec._dico[it.cle].bord !== "aut")
    .map(it => ({ it, x: RANG[sec._dico[it.cle].bord] - RANG.c, y: m.y.valeurs[it.cle].v, z: deux ? m.z.valeurs[it.cle].v : 0 }));
  const mx = Math.max(1, ...pts.map(p => Math.abs(p.x))) + 0.5, my = m.y.max + 0.4, mz = (m.z?.max ?? 1) + 0.4;
  // carré de 440 px en 2 axes ; en 3D, cube plus grand (jusqu'à 640 px, selon la largeur et la hauteur de la fenêtre) :
  // le rectangle s'allonge vers le bas, en douceur pendant le passage d'une vue à l'autre (sec._grand de 0 à 1)
  const g = { l: 56, r: 56, t: 30, b: 46 }, place = box.clientWidth - g.l - g.r;
  const S2 = Math.max(200, Math.min(440, place)), S3 = Math.max(S2, Math.min(640, place, innerHeight - 230));
  const S = Math.round(deux ? S2 + (S3 - S2) * (sec._grand ?? 1) : S2);
  const sans = sec._items.filter(it => !m.y.valeurs[it.cle] || (deux && !m.z.valeurs[it.cle])).map(it => it.etiquette || it.cle);
  const note = [m.y.note, deux && m.z.note, m.noteX, sans.length && `Sans donnée : ${sans.join(", ")}.`].filter(Boolean).join(" ");
  return { m, pts, mx, my, mz, g, S, W: S + g.l + g.r, H: S + g.t + g.b, note };
}
function dessinerMulti(sec) {
  const box = sec.querySelector(".vi-partis-plan2"); if (!sec._multi || !box) return;
  if (sec._vue === 3 && sec._multi.z) return dessiner3D(sec, true);
  const { m: M, pts, mx, my, g, S, W, note } = cadreMulti(sec, box), m = M.y;
  // beaucoup de groupes (France, Allemagne : un cran étroit) : noms des groupes inclinés, et plus de place dessous
  const incline = S / (2 * mx) < 78, H = S + g.t + (incline ? 92 : g.b);
  const X = x => g.l + (x + mx) / (2 * mx) * S, Y = y => g.t + (my - y) / (2 * my) * S;
  let fond = "";
  for (let r = -Math.floor(mx); r <= Math.floor(mx); r++) {   // un repère par groupe gauche-droite (nom sur deux lignes au trait d'union)
    const b = BORDS[r + RANG.c]; if (!b || b[0] === "aut") continue;
    const [l1, l2] = b[1].includes("-") ? [b[1].slice(0, b[1].indexOf("-") + 1), b[1].slice(b[1].indexOf("-") + 1)] : [b[1], ""];
    fond += `<line class="vi-m-grille" x1="${X(r)}" x2="${X(r)}" y1="${g.t}" y2="${g.t + S}"/>`
      + (incline ? `<text class="vi-m-tick" x="${X(r) + 4}" y="${g.t + S + 14}" text-anchor="end" transform="rotate(-38 ${X(r) + 4} ${g.t + S + 14})">${ESC(b[1])}</text>`
        : `<text class="vi-m-tick" x="${X(r)}" y="${g.t + S + 17}" text-anchor="middle">${ESC(l1)}${l2 ? `<tspan x="${X(r)}" dy="12">${ESC(l2)}</tspan>` : ""}</text>`);
  }
  for (let v = -m.max; v <= m.max; v++) {   // quadrillage : une ligne par cran de l'axe vertical (0 = axe), valeur à gauche
    if (v) fond += `<line class="vi-m-grille" x1="${g.l}" x2="${g.l + S}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    fond += `<text class="vi-m-val" x="${g.l - 7}" y="${Y(v) + 3.5}" text-anchor="end">${m.decal != null ? v + m.decal : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`}</text>`;
  }
  fond += `<rect class="vi-m-cadre" x="${g.l}" y="${g.t}" width="${S}" height="${S}"/>`
    + `<line class="vi-m-axe" x1="${g.l}" x2="${g.l + S}" y1="${Y(0)}" y2="${Y(0)}"/><line class="vi-m-axe" x1="${X(0)}" x2="${X(0)}" y1="${g.t}" y2="${g.t + S}"/>`
    + `<text class="vi-m-titre" x="${X(0)}" y="${g.t - 11}" text-anchor="middle">▲ ${ESC(m.titre)} : ${ESC(m.haut)}</text>`
    + `<text class="vi-m-titre" x="${X(0) + 8}" y="${g.t + S - 7}">▼ ${ESC(m.bas)}</text>`;
  // deux points presque confondus dans une même colonne : écartés côte à côte
  const pl = pts.map(p => ({ p, cx: X(p.x), cy: Y(p.y) })), parCol = {};
  pl.forEach(q => (parCol[q.p.x] ||= []).push(q));
  Object.values(parCol).forEach(col => { col.sort((a, b) => a.cy - b.cy);
    col.forEach((q, i) => { if (i && q.cy - col[i - 1].cy < 10) { col[i - 1].cx -= 8; q.cx += 8; } }); });
  // étiquettes : pour chaque parti (dans l'ordre de la bande), la première place libre parmi à droite, à gauche, puis
  // un peu au-dessus ou au-dessous, sans toucher les points ni les étiquettes déjà placées
  const occupe = pl.map(q => ({ x1: q.cx - 10, x2: q.cx + 10, y1: q.cy - 10, y2: q.cy + 10, q }));
  const boite = (q, [dx, dy, gauche], w) => ({ x1: gauche ? q.cx + dx - w : q.cx + dx, x2: gauche ? q.cx + dx : q.cx + dx + w, y1: q.cy + dy - 8, y2: q.cy + dy + 8, q });
  const libre = r => !occupe.some(b => b.q !== r.q && r.x1 < b.x2 && r.x2 > b.x1 && r.y1 < b.y2 && r.y2 > b.y1);
  pl.forEach(q => {
    const w = (q.p.it.etiquette || q.p.it.cle).length * 8.5 + 2;
    const essais = [[14, 0, false], [-14, 0, true], [14, -13, false], [14, 13, false], [-14, -13, true], [-14, 13, true]];
    const e = essais.find(e => libre(boite(q, e, w))) || essais[0];
    q.lx = q.cx + e[0]; q.ly = q.cy + e[1] + 4.5; q.gauche = e[2]; occupe.push(boite(q, e, w));
  });
  const points = pl.map(({ p, cx, cy, lx, ly, gauche }) => `<g class="vi-m-pt" data-partie-parti="${ESC(p.it.cle)}" tabindex="0" style="--c:${p.it.couleur || "var(--muted)"}">`
    + `<circle cx="${cx}" cy="${cy}" r="9"/><text x="${lx}" y="${ly}"${gauche ? ' text-anchor="end"' : ""}>${ESC(p.it.etiquette || p.it.cle)}</text></g>`).join("");
  box.innerHTML = `<svg class="vi-m-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ESC(`Partis selon l'axe gauche-droite et l'axe ${m.titre.toLowerCase()}`)}">`
    + `<g class="vi-m-fond">${fond}</g>${points}</svg><small class="vi-partis-note">${ESC(note)}</small>`;
}

// vue 3D (3 axes) : projection orthogonale du cube x · y · z tourné (lacet a, tangage b), réduite pour tenir dans le
// carré ; à l'angle 0 elle se confond avec la vue 2 axes, d'où le passage animé de l'une à l'autre ; quadrillage sur les
// faces du fond et, au survol d'un parti, ses repères jusqu'à ces faces ; partis peints du plus loin au plus proche
const VUE3 = [-0.62, 0.38];
function dessiner3D(sec, complet) {
  const box = sec.querySelector(".vi-partis-plan2"); if (!sec._multi?.z || !box) return;
  const { m, pts, mx, my, mz, g, S, W, H, note } = cadreMulti(sec, box);
  const [a, b] = sec._angle || [0, 0], ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const rot = (x, y, z) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * cb + z1 * sb, z1 * cb - y * sb]; };
  const coins = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) coins.push([x, y, z]);
  const k = 1 / Math.max(1, ...coins.map(c => { const r = rot(...c); return Math.max(Math.abs(r[0]), Math.abs(r[1])); }));
  const cx = g.l + S / 2, cy = g.t + S / 2;
  const P = (x, y, z) => { const r = rot(x, y, z); return { x: cx + r[0] * k * S / 2, y: cy - r[1] * k * S / 2, d: r[2] }; };
  const f = n => n.toFixed(1);
  let fond = "";
  // quadrillage des trois faces du fond (pour chaque axe, la face la plus éloignée : elle change quand le cube tourne) ;
  // crans : groupes gauche-droite en x, valeurs entières en y et z, en coordonnées du cube (−1 à 1)
  const crans = [[], [], []], fondCote = [];
  for (let r = -Math.floor(mx); r <= Math.floor(mx); r++) crans[0].push(r / mx);
  for (let v = -m.y.max; v <= m.y.max; v++) crans[1].push(v / my);
  for (let v = -m.z.max; v <= m.z.max; v++) crans[2].push(v / mz);
  for (let i = 0; i < 3; i++) {
    const face = s => { const c = [0, 0, 0]; c[i] = s; return P(...c).d; };
    const s = fondCote[i] = face(1) > face(-1) ? 1 : -1, [j, l] = [0, 1, 2].filter(n => n !== i);
    for (const [a1, a2] of [[j, l], [l, j]]) for (const v of crans[a1]) {
      const c = [0, 0, 0]; c[i] = s; c[a1] = v;
      c[a2] = -1; const p = P(...c); c[a2] = 1; const q = P(...c);
      fond += `<line class="vi-m-grille3" x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"/>`;
    }
  }
  // pour les repères du parti survolé (majGuides) : projection, faces du fond et position de chaque parti dans le cube
  sec._g3 = { P, fondCote, pos: Object.fromEntries(pts.map(p => [p.it.cle, { c: [p.x / mx, p.y / my, p.z / mz], couleur: p.it.couleur }])) };
  coins.forEach((c, i) => coins.forEach((e, j) => {   // arêtes du cube (coins qui diffèrent d'une seule coordonnée), celles de derrière plus pâles
    if (j <= i || c.filter((v, n) => v !== e[n]).length !== 1) return;
    const p = P(...c), q = P(...e);
    fond += `<line class="vi-m-arete${p.d + q.d > 0.05 ? " vi-m-derriere" : ""}" x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"/>`;
  }));
  // libellés courts au bout de chaque axe (bouts3 : [bout −, bout +])
  const axes = [[[1, 0, 0], "Droite", "Gauche"], [[0, 1, 0], m.y.bouts3[1], m.y.bouts3[0]], [[0, 0, 1], m.z.bouts3[1], m.z.bouts3[0]]];
  let bouts = "";   // libellés peints après les points, avec un halo, pour rester lisibles
  for (const [[x, y, z], plus, moins] of axes) {
    const p = P(x, y, z), q = P(-x, -y, -z), o = P(0, 0, 0);
    const vis = Math.min(1, Math.hypot(p.x - o.x, p.y - o.y) / (S * 0.18));   // un axe vu de bout s'efface
    fond += `<line class="vi-m-axe" x1="${f(q.x)}" y1="${f(q.y)}" x2="${f(p.x)}" y2="${f(p.y)}"/>`;
    for (const [s, txt] of [[1.16, plus], [-1.16, moins]]) {
      const t = P(x * s, y * s, z * s);
      bouts += `<text class="vi-m-titre vi-m-bout" x="${f(t.x)}" y="${f(t.y + 4)}" text-anchor="middle" opacity="${vis.toFixed(2)}">${ESC(txt)}</text>`;
    }
  }
  const points = pts.map(p => ({ p, q: P(p.x / mx, p.y / my, p.z / mz) })).sort((u, v) => v.q.d - u.q.d)
    .map(({ p, q }) => `<g class="vi-m-pt" data-partie-parti="${ESC(p.it.cle)}" tabindex="0" style="--c:${p.it.couleur || "var(--muted)"}">`
      + `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(9 - 2 * q.d)}"/><text x="${f(q.x + 14)}" y="${f(q.y + 4.5)}">${ESC(p.it.etiquette || p.it.cle)}</text></g>`).join("");
  const dedans = `<g class="vi-m-fond">${fond}</g><g class="vi-m-guides">${guidesHTML(sec)}</g>${points}<g class="vi-m-fond">${bouts}</g>`;
  const svg = box.querySelector(".vi-m-3d");
  if (!complet && svg) {   // pendant une rotation : même svg (le glisser continue)
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.innerHTML = dedans; return;
  }
  box.innerHTML = `<svg class="vi-m-svg vi-m-3d" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ESC(`Partis selon trois axes : gauche-droite, ${m.y.titre.toLowerCase()}, ${m.z.titre.toLowerCase()} ; glisser pour tourner`)}">${dedans}</svg>`
    + `<small class="vi-partis-note">${ESC(note)} Glisser le cube pour le tourner.</small>`;
}

// repères du parti survolé en 3D : pointillés à sa couleur jusqu'aux trois faces du fond, avec un point à chaque arrivée
function guidesHTML(sec) {
  const g3 = sec._g3, e = g3?.pos[sec._choisi]; if (!e) return "";
  const f = n => n.toFixed(1), a = g3.P(...e.c);
  return [0, 1, 2].map(i => { const c = e.c.slice(); c[i] = g3.fondCote[i]; const b = g3.P(...c);
    return `<line class="vi-m-guide" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" style="--c:${e.couleur}"/><circle class="vi-m-pied" cx="${f(b.x)}" cy="${f(b.y)}" r="3.5" style="--c:${e.couleur}"/>`; }).join("");
}
function majGuides(sec) { const el = sec.querySelector(".vi-m-3d .vi-m-guides"); if (el) el.innerHTML = guidesHTML(sec); }

// angle de la vue 3D (et taille du cube, grand : 0 = carré 2 axes, 1 = cube) amenés en douceur, puis fin()
function tourner(sec, vers, grand, fin) {
  cancelAnimationFrame(sec._raf);
  const de = sec._angle || [0, 0], g0 = sec._grand ?? 1, t0 = performance.now(), D = 900;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { sec._angle = vers; sec._grand = grand; dessiner3D(sec); fin?.(); return; }
  const pas = t => { const u = Math.min(1, (t - t0) / D), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    sec._angle = [de[0] + (vers[0] - de[0]) * e, de[1] + (vers[1] - de[1]) * e]; sec._grand = g0 + (grand - g0) * e; dessiner3D(sec);
    if (u < 1) sec._raf = requestAnimationFrame(pas); else fin?.(); };
  sec._raf = requestAnimationFrame(pas);
}
// 2 axes ⇄ 3 axes : le carré pivote pour devenir un cube (et revient de face avant de redevenir le graphique 2 axes)
function choisirVue(sec, v) {
  if (v === (sec._vue || 2) || !sec._multi?.z) return;
  sec.querySelectorAll(".vi-partis-vues [data-vue]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.vue === v)));
  if (v === 3) { sec._vue = 3; sec._angle = [0, 0]; sec._grand = 0; dessiner3D(sec, true); tourner(sec, VUE3, 1); return; }
  const [a, b] = sec._angle || [0, 0]; sec._angle = [Math.atan2(Math.sin(a), Math.cos(a)), b];   // plus court chemin vers la face avant
  tourner(sec, [0, 0], 0, () => { sec._vue = 2; sec._grand = 1; dessinerMulti(sec);
    sec.querySelectorAll(".vi-m-tick, .vi-m-grille").forEach(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" })); });
}

// mise en évidence du parti survolé dans le plan ou l'hémicycle : ses sièges en couleur, les autres en gris
function appliquerSelection() {
  const sec = document.getElementById("viPartis"), plan = document.getElementById("viPlan"); if (!sec) return;
  if (sec._multiOn && sec._vue === 3) majGuides(sec);
  const k = sec._choisi;
  if (!plan) return;
  const sieges = [...plan.querySelectorAll("[data-p]")], siens = k ? sieges.filter(e => e.dataset.p.split(" ").includes(k)) : [];
  sieges.forEach(e => e.toggleAttribute("data-sel", siens.includes(e)));
  plan.classList.toggle("vi-plan-filtre", siens.length > 0);
}
