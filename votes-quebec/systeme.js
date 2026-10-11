/* « Comprendre le système politique et électoral » : bouton sous la source et grande fenêtre (<dialog id="viSystemeDlg">
   du gabarit pages.src.html), commune à toutes les pages d'intentions de vote. La fenêtre a deux onglets bien séparés :
   le système politique (qui gouverne et comment) et le système électoral (comment on choisit les élus).

   preparerSysteme({ sur, titre, parties: [{ id, onglet, chapeau, html }], aLOuverture })
     sur, titre   : surtitre et titre de la fenêtre
     parties      : un onglet par partie ; chapeau = phrase d'introduction de la partie, html = son contenu
     aLOuverture  : appelée à chaque ouverture (ex. lire des données de plus à la première ouverture)
*/
const $ = id => document.getElementById(id);

export function preparerSysteme({ sur, titre, parties, aLOuverture }) {
  const btn = $("viSysteme"), dlg = $("viSystemeDlg"), onglets = $("viSystemeOnglets"), corps = $("viSystemeCorps");
  if (!btn || !dlg || !corps || !parties?.length) return null;
  $("viSystemeSur").textContent = sur;
  $("viSystemeTitre").textContent = titre;
  onglets.innerHTML = parties.map((p, i) => `<button type="button" role="tab" id="viSysOng-${p.id}" aria-controls="viSysPart-${p.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-partie="${p.id}">`
    + `<small>Partie ${i + 1}</small>${p.onglet}</button>`).join("");
  onglets.hidden = parties.length < 2;
  corps.innerHTML = parties.map((p, i) => `<div class="vi-dlg-partie vi-dlg-partie-${p.id}" role="tabpanel" id="viSysPart-${p.id}" aria-labelledby="viSysOng-${p.id}"${i ? " hidden" : ""}>
      <p class="vi-dlg-chapeau"><span>Partie ${i + 1} · ${p.onglet}</span>${p.chapeau}</p>${p.html}</div>`).join("");
  const choisir = id => {
    onglets.querySelectorAll("[role=tab]").forEach(b => { const oui = b.dataset.partie === id; b.setAttribute("aria-selected", oui); b.tabIndex = oui ? 0 : -1; });
    corps.querySelectorAll("[role=tabpanel]").forEach(d => { d.hidden = d.id !== "viSysPart-" + id; });
    corps.scrollTop = 0;
  };
  onglets.onclick = e => { const b = e.target.closest("[data-partie]"); if (b) choisir(b.dataset.partie); };
  onglets.onkeydown = e => {                                // flèches gauche/droite entre les onglets
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const bs = [...onglets.querySelectorAll("[role=tab]")], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const b = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]; b.focus(); choisir(b.dataset.partie);
  };
  // liens internes « voir la partie … » dans le texte
  corps.onclick = e => { const a = e.target.closest("[data-aller]"); if (a) { e.preventDefault(); choisir(a.dataset.aller); } };
  btn.hidden = false;
  btn.onclick = () => { choisir(parties[0].id); dlg.showModal(); aLOuverture?.(); };
  $("viSystemeFermer").onclick = () => dlg.close();
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };   // clic sur le fond assombri
  return { choisir };
}
