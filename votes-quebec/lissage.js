/* Bouton « ⓘ Moyenne lissée » en bas à droite du graphique d'évolution des pages d'intentions de vote (demande de l'utilisateur) :
   ouvre un petit rectangle d'info qui explique comment la courbe est calculée ; se ferme au second clic, par Échap ou par un clic
   ailleurs. majLissage() est appelé par chaque dessinerEvolution() avec le réglage réellement utilisé (écart-type en jours),
   ou avec un texte propre quand la courbe vient d'ailleurs (Votes États-Unis : moyenne de Silver Bulletin). */
const $ = id => document.getElementById(id);
const nf = x => Math.round(x).toLocaleString("fr-CA");
const poids = (j, s) => 100 * Math.exp(-0.5 * (j / s) ** 2);

function texteSigma({ sigma, court, longue }) {
  const j1 = Math.round(sigma), j2 = Math.round(2 * sigma);
  return `Chaque ligne est une moyenne lissée des sondages, pas le dernier sondage. Pour chaque semaine, on fait la moyenne de tous les
    sondages, chacun pondéré selon son éloignement dans le temps : un sondage de la même semaine compte pleinement, un sondage d'il y a
    ${j1} jours environ ${nf(poids(j1, sigma))} %, un d'il y a ${j2} jours à peine ${nf(poids(j2, sigma))} % (courbe en cloche, écart-type de ${j1} jours${court ? ` ; ${court} jours à 6 mois ou moins` : ""}).
    Ça atténue les écarts entre maisons de sondage, mais quand les sondages récents sont rares, la ligne garde la trace des plus anciens${longue === false ? "." : ` :
    juste après une élection, elle peut encore refléter ceux d'avant le vote.`} Points : les sondages ; losanges : les élections.`;
}

// o : { sigma, court?, longue? } (moyenne du site) ou { titre?, texte } (courbe calculée ailleurs) ; null : bouton caché
export function majLissage(o) {
  const note = $("viEvolNote"); if (!note) return;
  if (!$("viLisseBtn")) {
    note.insertAdjacentHTML("afterend", `<div id="viLisse" style="display:flex;justify-content:flex-end;position:relative">
      <button type="button" class="vi-lien" id="viLisseBtn" aria-expanded="false" aria-controls="viLisseTxt" style="font-size:0.78rem;padding:2px 9px">ⓘ Moyenne lissée</button>
      <div id="viLisseTxt" role="dialog" aria-label="Moyenne lissée" hidden style="position:absolute;right:0;bottom:calc(100% + 8px);z-index:30;width:min(380px,86vw);padding:12px 14px;
        border-radius:10px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);box-shadow:0 12px 32px rgba(0,0,0,.35);font-size:0.84rem;line-height:1.45"></div></div>`);
    const btn = $("viLisseBtn"), boite = $("viLisseTxt");
    const ouvrir = v => { boite.hidden = !v; btn.setAttribute("aria-expanded", v); };
    btn.addEventListener("click", e => { e.stopPropagation(); ouvrir(boite.hidden); });
    document.addEventListener("click", e => { if (!boite.hidden && !boite.contains(e.target)) ouvrir(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !boite.hidden) { ouvrir(false); btn.focus(); } });
  }
  $("viLisse").hidden = !o;
  if (!o) return;
  $("viLisseBtn").textContent = o.texte ? `ⓘ ${o.bouton || "Moyenne"}` : "ⓘ Moyenne lissée";
  $("viLisseTxt").innerHTML = `<b>${o.titre || "Comment la courbe est calculée"}</b><br>${o.texte || texteSigma(o)}`;
}
