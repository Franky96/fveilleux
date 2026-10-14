/* Ligne du haut des pages d'intentions de vote (assemblée · graphique d'évolution) : largeur des deux colonnes calculée
   pour que les deux rectangles aient la même hauteur, sans vide dans celui de l'assemblée. Le plan ou l'hémicycle
   grandit avec sa largeur (rapport hauteur/largeur de son dessin, limité par sa largeur maximale CSS) ; le graphique
   aussi (hauteur = 60 % de sa largeur, entre 260 et 560 px, comme dans chaque module). On mesure la partie fixe de
   chaque rectangle (titres, boutons, légende, note), puis on cherche la largeur de l'assemblée qui égalise les hauteurs.
   Recalcul au redimensionnement de la fenêtre et quand le contenu du rectangle de l'assemblée change (autre chambre,
   autre vue). Sous 1000 px de large, les rectangles sont l'un sous l'autre : rien à faire. Sans dessin à agrandir (liste
   des candidats d'une présidentielle), ou si l'égalité est impossible (plan du Québec plus haut que le graphique au
   maximum), on garde les largeurs par défaut ou la meilleure approche.

   await equilibrerHaut(redessinerGraphique)   // une fois, après le premier dessin et AVANT d'afficher la page :
   la promesse attend les polices (les titres changent de hauteur quand la police arrive) puis fait le calcul final,
   pour que rien ne bouge une fois la page visible
*/
const SEUIL = 1000, MIN_A = 300, MIN_C = 380, PAS = 4;

export function equilibrerHaut(redessiner) {
  const haut = document.querySelector("#vue-votes .vi-haut"), plan = document.getElementById("viPlan"), evol = document.getElementById("viEvol");
  const carteA = plan?.closest("section"), carteC = evol?.closest("section");
  if (!haut || !carteA || !carteC || carteA.parentElement !== haut || carteC.parentElement !== haut) return;
  let occupe = false;
  const calculer = () => {
    if (occupe) return false;
    if (innerWidth < SEUIL) { if (haut.style.gridTemplateColumns) { haut.style.gridTemplateColumns = ""; redessiner?.(); return true; } return false; }
    occupe = true;
    // hauteurs naturelles (sans l'étirement de la grille)
    carteA.style.alignSelf = carteC.style.alignSelf = "start";
    const rA = carteA.getBoundingClientRect(), rC = carteC.getBoundingClientRect();
    const svgC = evol.querySelector("svg")?.getBoundingClientRect();
    const visible = plan.checkVisibility?.() ?? plan.getClientRects().length > 0;
    const rP = visible ? plan.getBoundingClientRect() : null;
    carteA.style.alignSelf = carteC.style.alignSelf = "";
    const csA = getComputedStyle(carteA), padA = parseFloat(csA.paddingLeft) + parseFloat(csA.paddingRight) + parseFloat(csA.borderLeftWidth) + parseFloat(csA.borderRightWidth);
    const vb = plan.viewBox?.baseVal, ratio = rP && vb?.width ? vb.height / vb.width : 0;
    const maxP = parseFloat(getComputedStyle(plan).maxWidth) || Infinity;
    // pas de dessin à agrandir (ex. liste des candidats à la présidentielle) : largeurs par défaut, la liste ne se tasse pas
    if (!ratio) { occupe = false; if (haut.style.gridTemplateColumns) { haut.style.gridTemplateColumns = ""; redessiner?.(); return true; } return false; }
    const fixeA = rA.height - (rP ? rP.height : 0), fixeC = rC.height - (svgC ? svgC.height : 0), margeC = rC.width - evol.clientWidth;
    const A = a => fixeA + (ratio ? Math.min(a - padA, maxP) * ratio : 0);
    const C = c => fixeC + Math.max(260, Math.min(560, (c - margeC) * 0.6));
    const gap = parseFloat(getComputedStyle(haut).columnGap) || 0, T = haut.clientWidth - gap;
    let meilleur = rA.width, ecart = Infinity;
    for (let a = MIN_A; a <= T - MIN_C; a += PAS) {
      const e = Math.abs(A(a) - C(T - a));
      if (e < ecart - 0.5) { ecart = e; meilleur = a; }
    }
    occupe = false;
    if (Math.abs(meilleur - rA.width) > 6) {
      haut.style.gridTemplateColumns = `${Math.round(meilleur)}px minmax(0, 1fr)`;
      redessiner?.();                                // le graphique se redessine à sa nouvelle largeur
      return true;
    }
    return false;
  };
  // jusqu'à ce que ça ne bouge plus (la légende peut changer de nombre de lignes avec la largeur)
  const converger = () => { for (let i = 0; i < 4 && calculer(); i++); };
  let attente;
  const plusTard = (ms = 260) => { clearTimeout(attente); attente = setTimeout(converger, ms); };
  addEventListener("resize", () => plusTard());      // après le redessin du graphique par le module (200 ms)
  // contenu du rectangle de l'assemblée changé (autre chambre, plan caché ou montré) ; pas nos propres réglages de alignSelf.
  // Recalcul tout de suite (l'observateur passe avant l'affichage de l'image suivante) : aucun saut visible au changement
  new MutationObserver(ms => { if (!occupe && ms.some(m => m.target !== carteA)) { clearTimeout(attente); converger(); } }).observe(carteA, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style"] });
  converger();
  // polices prêtes (au plus 1,5 s d'attente), puis calcul final : la page s'affiche ensuite, déjà équilibrée
  return Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(ok => setTimeout(ok, 1500))]).then(converger);
}
