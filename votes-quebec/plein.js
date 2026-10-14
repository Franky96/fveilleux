/* Plein écran de la carte des pages d'intentions de vote (Québec, Canada, États-Unis, France, Allemagne, Suisse).
   API du navigateur, sinon couche fixe (iPhone : pas de plein écran d'élément). En plein écran, un bouton « Info »
   (à côté de « Quitter le plein écran ») affiche le panneau de droite (#viPanneau : tout le territoire ou la
   circonscription cliquée) par-dessus la carte ; il reprend sa place en sortant. Le panneau s'ouvre de lui-même en
   entrant en plein écran sur grand écran, et quand on clique une circonscription.

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
  const ecran = () => document.fullscreenElement || document.webkitFullscreenElement;
  const plein = () => ecran() === carte || carte.classList.contains("lv-plein");
  const repere = document.createComment("place du panneau");
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
    if (on && !avant) panneau(innerWidth > 900);
    if (!on) panneau(false);
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
