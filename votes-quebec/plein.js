/* Plein écran de la carte des pages d'intentions de vote (Québec, Canada, États-Unis, France, Allemagne, Suisse).
   API du navigateur, sinon couche fixe (iPhone : pas de plein écran d'élément). En plein écran, un bouton « Info »
   (à côté de « Quitter le plein écran ») affiche le panneau de droite (#viPanneau : tout le territoire ou la
   circonscription cliquée) par-dessus la carte ; il reprend sa place en sortant. Le panneau s'ouvre de lui-même en
   entrant en plein écran sur grand écran, et quand on clique une circonscription.

   Les outils de la carte (modes Parti en tête / Meilleur deuxième / Vote, boutons des partis, « % Pourcentage ») entrent
   aussi dans la carte en plein écran (tout en haut ; zooms et panneau passent dessous) ; les boutons des partis n'y paraissent qu'en mode Vote.
   Sur téléphone (700 px et moins), plein écran ou non, ils sont toujours dans la carte, repliés derrière un bouton
   « ☰ Contrôles · <mode> » en haut à gauche, qui les ouvre ou les ferme avec les zooms (classe vi-ctl-ouvert sur la carte) :
   la carte garde toute la place.

   preparerPleinEcran()   // une fois, quand la carte est montée
   infoPlein()            // après le choix d'une circonscription : ouvre le panneau si la carte est en plein écran */
const $ = id => document.getElementById(id);
let ouvrirInfo = () => {};
export const infoPlein = () => ouvrirInfo();

export function preparerPleinEcran() {
  const carte = $("viCarte")?.parentElement, btn = $("viPlein");
  if (!carte || !btn || $("viInfo")) return;
  const info = document.createElement("button");
  info.type = "button"; info.id = "viInfo"; info.className = "lv-info-btn"; info.setAttribute("aria-pressed", "false");
  info.title = "Afficher ou masquer le panneau d'information"; info.textContent = "ⓘ Info";
  btn.after(info);
  const tel = matchMedia("(max-width: 700px)");
  const ctl = document.createElement("button");
  ctl.type = "button"; ctl.className = "vi-ctl-btn"; ctl.setAttribute("aria-expanded", "false");
  ctl.title = "Afficher ou masquer les contrôles de la carte (modes, partis, zooms)";
  carte.prepend(ctl);
  const ecran = () => document.fullscreenElement || document.webkitFullscreenElement;
  const plein = () => ecran() === carte || carte.classList.contains("lv-plein");
  const repere = document.createComment("place du panneau");
  const outils = carte.parentElement?.querySelector(".vi-outils"), repereOutils = document.createComment("place des outils de la carte");
  const placerOutils = dedans => {
    if (!outils) return;
    if (dedans && outils.parentElement !== carte) { outils.before(repereOutils); carte.appendChild(outils); outils.classList.add("vi-outils-plein"); hauteur(); }
    if (!dedans && outils.parentElement === carte) { repereOutils.replaceWith(outils); outils.classList.remove("vi-outils-plein"); carte.style.removeProperty("--haut-outils"); }
  };
  // hauteur de la barre d'outils en haut de la carte : les zooms et le panneau se placent juste dessous
  const hauteur = () => { if (outils && outils.parentElement === carte && outils.offsetHeight) carte.style.setProperty("--haut-outils", outils.offsetHeight + "px"); };
  addEventListener("resize", hauteur);
  if (outils && window.ResizeObserver) new ResizeObserver(hauteur).observe(outils);
  // bouton « Contrôles » (téléphone) : libellé = mode affiché ; ouvert ou fermé
  const resume = () => { const m = outils?.querySelector("button[data-m][aria-pressed='true']");
    ctl.textContent = "☰ Contrôles" + (m ? " · " + m.textContent.trim() : ""); };
  const ouvrirCtl = on => { carte.classList.toggle("vi-ctl-ouvert", on); ctl.setAttribute("aria-expanded", on); requestAnimationFrame(hauteur); };
  ctl.addEventListener("click", () => ouvrirCtl(ctl.getAttribute("aria-expanded") !== "true"));
  if (outils) new MutationObserver(resume).observe(outils, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed"] });
  resume();
  tel.addEventListener("change", () => placerOutils(plein() || tel.matches));
  placerOutils(tel.matches);
  const panneau = ouvrir => {
    const pan = $("viPanneau"); if (!pan) return;
    if (ouvrir && pan.parentElement !== carte) { pan.before(repere); carte.appendChild(pan); pan.classList.add("lv-panneau-plein"); }
    if (!ouvrir && pan.parentElement === carte) { repere.replaceWith(pan); pan.classList.remove("lv-panneau-plein"); }
    info.setAttribute("aria-pressed", ouvrir);
  };
  let avant = false;
  const etat = () => {
    const on = plein();
    btn.setAttribute("aria-pressed", on); btn.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    if (on && !avant) { panneau(innerWidth > 900); placerOutils(true); }
    if (!on) { panneau(false); placerOutils(tel.matches); }
    avant = on;
  };
  btn.addEventListener("click", () => {
    if (ecran()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (carte.classList.contains("lv-plein")) { carte.classList.remove("lv-plein"); document.body.classList.remove("lv-plein-actif"); etat(); }
    else if (carte.requestFullscreen || carte.webkitRequestFullscreen) (carte.requestFullscreen || carte.webkitRequestFullscreen).call(carte);
    else { carte.classList.add("lv-plein"); document.body.classList.add("lv-plein-actif"); etat(); }
  });
  info.addEventListener("click", () => panneau(info.getAttribute("aria-pressed") !== "true"));
  document.addEventListener("fullscreenchange", etat);
  document.addEventListener("webkitfullscreenchange", etat);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && carte.classList.contains("lv-plein")) btn.click(); });
  ouvrirInfo = () => { if (plein()) panneau(true); };
}
