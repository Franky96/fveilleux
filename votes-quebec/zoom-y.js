/* Zoom vertical des graphiques d'évolution (pages d'intentions de vote : Québec, Canada, France, États-Unis).
   Molette vers le haut sur le graphique : resserre l'axe des Y autour du pointeur (les courbes proches se séparent) ;
   molette vers le bas : élargit jusqu'à la vue complète, puis la page défile normalement. Double-clic : vue complète.
   Le zoom reste dans le domaine de départ (on ne peut pas sortir de 0–100 %) et se remet à zéro quand la série change
   (autre période, autre primaire…).

   Usage dans une fonction de dessin :
     const y = d3.scaleLinear().domain(domaineY(el, [0, 50], cle, redessiner)).range([H - m.b, m.t]);
     … tracés …
     decouper(svgE, el, y, m, W, H);   // avant le rectangle transparent qui suit la souris
*/
const ETAT = new WeakMap();                 // conteneur → { def, dom, cle, y, redessiner }
const ECART_MIN = 2;                        // écart minimal de l'axe, en points de pourcentage

export function domaineY(el, def, cle, redessiner) {
  let e = ETAT.get(el);
  if (!e) { e = { dom: null }; ETAT.set(el, e); brancher(el, e); }
  if (e.cle !== cle) e.dom = null;
  e.def = def; e.cle = cle; e.redessiner = redessiner;
  return e.dom || def;
}

function brancher(el, e) {
  let attente = false;
  const planifier = () => { if (attente) return; attente = true; requestAnimationFrame(() => { attente = false; e.redessiner?.(); }); };
  el.addEventListener("wheel", ev => {
    const svg = el.querySelector("svg");
    if (!svg || !e.y) return;
    const [da, db] = e.def, [a, b] = e.dom || e.def;
    const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
    if (!dy || (dy > 0 && !e.dom)) return;                // déjà en vue complète : la page défile
    ev.preventDefault();
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const v = Math.min(b, Math.max(a, e.y.invert((ev.clientY - r.top) * vb.height / r.height)));
    const f = Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.0025)));
    let na = v + (a - v) * f, nb = v + (b - v) * f;
    if (nb - na >= db - da) e.dom = null;
    else {
      if (nb - na < ECART_MIN) { const c = (na + nb) / 2; na = c - ECART_MIN / 2; nb = c + ECART_MIN / 2; }
      if (na < da) { nb += da - na; na = da; }
      if (nb > db) { na -= nb - db; nb = db; }
      e.dom = [Math.max(da, na), Math.min(db, nb)];
    }
    planifier();
  }, { passive: false });
  el.addEventListener("dblclick", () => { if (e.dom) { e.dom = null; planifier(); } });
}

// découpe les tracés à la zone du graphique (points et courbes hors de l'axe zoomé), virgule décimale sur l'axe,
// étiquettes de fin hors de la zone masquées, et rappel du zoom dans la marge du haut (au-dessus des courbes)
export function decouper(svgE, el, y, m, W, H) {
  const e = ETAT.get(el); if (e) e.y = y;
  const id = "zoomY-" + (el.id || "g");
  svgE.append("clipPath").attr("id", id).append("rect").attr("x", m.l).attr("y", m.t - 4).attr("width", Math.max(0, W - m.l - m.r + 8)).attr("height", Math.max(0, H - m.t - m.b + 8));
  const zone = svgE.append("g").attr("clip-path", `url(#${id})`).node();
  svgE.selectAll(".vi-pt, .vi-ligne, .vi-elec-pt").each(function () { zone.appendChild(this); });
  svgE.selectAll(".vi-grille .tick text").each(function () { this.textContent = this.textContent.replace(".", ","); });
  svgE.selectAll(".vi-fin").style("display", function () { const v = +this.getAttribute("y") - 4; return v < m.t - 6 || v > H - m.b + 6 ? "none" : null; });
  if (e?.dom) {
    const fmt = v => (Math.round(v * 10) / 10).toLocaleString("fr-CA");
    svgE.append("text").attr("class", "vi-elec-txt vi-zoom-txt").attr("x", W - m.r).attr("y", Math.max(9, m.t - 5)).attr("text-anchor", "end")
      .text(`Zoom : ${fmt(e.dom[0])} à ${fmt(e.dom[1])} % · double-clic pour la vue complète`);
  }
}
