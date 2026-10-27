/* Fenêtre « Gouvernement actuel » des pages d'intentions de vote autres que Votes Québec (celui-ci a la sienne, dans intentions.js) :
   en haut, la chambre actuelle (hémicycle ou plan de la salle de la page, composition d'aujourd'hui) ; dessous, l'organigramme du
   gouvernement (chef du gouvernement, puis les ministres) lu dans votes-<pays>/gouvernement.json (outils/gouvernement.py de chaque pays,
   pipeline aux 3 heures ; format décrit dans votes-quebec/outils/gouv_commun.py). Demande de l'utilisateur, 27 octobre 2026 : la chambre
   en haut et le gouvernement dessous (on gagne de la place).

   preparerGouvernement({ donnees, pays, dessiner, couleur })
     donnees  : contenu de gouvernement.json (ou null : rien n'est ajouté à la page)
     pays     : nom court pour l'en-tête (« Canada », « Royaume-Uni »…)
     dessiner : (svg, section) => { titre, eyebrow, legende, note } ; dessine la chambre actuelle dans l'élément <svg> reçu ; peut ajouter
                un autre bloc <div class="vi-gouv-ch"> à `section` (États-Unis : le Sénat à côté de la Chambre)
     couleur  : (clé de parti) => couleur CSS (la couleur du parti de la page) */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function carte(m, grand, couleur) {
  const ini = esc(m.nom.replace(/^(Dr\.?|Sir|Dame)\s+/i, "").split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join(""));
  const c = (m.p && couleur(m.p)) || "var(--aut)";
  const photo = m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;vi-org-ini&quot;>${ini}</span>'">` : `<span class="vi-org-ini">${ini}</span>`;
  const nom = m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.nom)}</a>` : esc(m.nom);
  return `<article class="vi-org-carte${grand ? " grand" : ""}" style="--c:${c}">${photo}
    <div><b>${nom}</b>${m.parti ? `<small>${esc(m.parti)}</small>` : ""}
      <ul>${m.roles.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div></article>`;
}

function contenu({ donnees, pays, dessiner, couleur }) {
  const niveaux = donnees.niveaux, n = niveaux.reduce((t, x) => t + x.membres.length, 0);
  const haut = niveaux[0], reste = niveaux.slice(1);
  return `<header class="vi-gouv-tete"><div><span class="lv-eyebrow">${esc(pays)} · aujourd'hui</span><h3 id="viGouvTitre">Gouvernement actuel</h3></div>
      <button type="button" class="lv-btn" data-fermer>Fermer ✕</button></header>
    <div class="vi-gouv-corps vi-gouv-pile">
      <section class="vi-gouv-ass" aria-label="Chambre actuelle"><div class="vi-gouv-ch"><span class="lv-eyebrow" id="viGouvEyebrow"></span><h4 class="vi-gouv-sieges" id="viGouvSieges"></h4>
        <svg id="viGouvPlan" class="vi-plan" role="img" aria-label="Chambre actuelle"></svg><div class="vf-legende" id="viGouvLegende"></div>
        <p class="lv-muted" id="viGouvNote" style="font-size:0.8rem"></p></div></section>
      <section class="vi-org" aria-label="Gouvernement">
        <span class="lv-eyebrow">Gouvernement · ${n} membres</span>
        <div class="vi-org-niveau">${haut.membres.map(m => carte(m, true, couleur)).join("")}</div>
        ${reste.map(x => `${x.titre ? `<h4>${esc(x.titre)}</h4>` : ""}<div class="vi-org-grille">${x.membres.map(m => carte(m, false, couleur)).join("")}</div>`).join("")}
        <p class="lv-muted lv-source">Source : <a href="${esc(donnees.source)}" target="_blank" rel="noopener">${esc(donnees.source_nom)}</a>${donnees.date ? ` · lue le ${new Date(donnees.date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ")}` : ""}.</p>
      </section>
    </div>`;
}

export function preparerGouvernement(o) {
  const { donnees, dessiner } = o;
  if (!donnees?.niveaux?.length || document.getElementById("viGouvBtn")) return;
  const ancre = document.getElementById("viLegende"); if (!ancre) return;
  ancre.insertAdjacentHTML("afterend", `<div class="vi-gouv-ouvrir"><button type="button" class="vi-lien" id="viGouvBtn" aria-haspopup="dialog">Gouvernement actuel →</button></div>`);
  const dlg = document.createElement("dialog");
  dlg.id = "viGouvDlg"; dlg.className = "vi-gouv"; dlg.setAttribute("aria-labelledby", "viGouvTitre");
  document.getElementById("vue-votes").appendChild(dlg);
  document.getElementById("viGouvBtn").addEventListener("click", () => {
    dlg.innerHTML = contenu(o); dlg.showModal();
    const r = dessiner(document.getElementById("viGouvPlan"), document.querySelector("#viGouvDlg .vi-gouv-ass")) || {};
    document.getElementById("viGouvEyebrow").textContent = r.eyebrow || "";
    document.getElementById("viGouvSieges").textContent = r.titre || "";
    document.getElementById("viGouvLegende").innerHTML = r.legende || "";
    document.getElementById("viGouvNote").textContent = r.note || "";
  });
  dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-fermer]")) dlg.close(); });
}
