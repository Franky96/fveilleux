/* Zoom vertical des graphiques d'évolution (pages d'intentions de vote : Québec, Canada, France, États-Unis).
   La molette seule fait toujours défiler la page (on peut descendre la page même avec le pointeur sur un graphique) :
     - Ctrl + molette (ou pincer sur le pavé tactile) : vers le haut, resserre l'axe des Y autour du pointeur
       (les courbes proches se séparent) ; vers le bas, élargit jusqu'à la vue complète ;
     - une fois zoomé, pour monter ou descendre dans le graphique : glisser le graphique vers le haut ou le bas
       (souris enfoncée), glisser la barre de défilement à droite, ou Maj + molette ;
     - double-clic : vue complète.
   Le zoom reste dans le domaine de départ (on ne peut pas sortir de 0–100 %) et se remet à zéro quand la série change
   (autre période, autre primaire…).

   Usage dans une fonction de dessin :
     const y = d3.scaleLinear().domain(domaineY(el, [0, 50], cle, redessiner)).range([H - m.b, m.t]);
     … tracés …
     decouper(svgE, el, y, m, W, H);   // avant le rectangle transparent qui suit la souris
*/
const ETAT = new WeakMap();                 // conteneur → { def, dom, cle, y, m, H, redessiner }
const ECART_MIN = 2;                        // écart minimal de l'axe, en points de pourcentage

export function domaineY(el, def, cle, redessiner) {
  let e = ETAT.get(el);
  if (!e) { e = { dom: null }; ETAT.set(el, e); brancher(el, e); }
  if (e.cle !== cle) e.dom = null;
  e.def = def; e.cle = cle; e.redessiner = redessiner;
  return e.dom || def;
}

// garde la fenêtre [a, b] dans le domaine de départ, sans changer sa hauteur
function borner(e, a, b) {
  const [da, db] = e.def;
  if (a < da) { b += da - a; a = da; }
  if (b > db) { a -= b - db; b = db; }
  return [Math.max(da, a), Math.min(db, b)];
}

function brancher(el, e) {
  let attente = false;
  const planifier = () => { if (attente) return; attente = true; requestAnimationFrame(() => { attente = false; e.redessiner?.(); }); };
  // conversion pixels écran → unités du viewBox (le graphique est mis à l'échelle de son conteneur)
  const echelle = () => { const svg = el.querySelector("svg"); if (!svg) return 1; const r = svg.getBoundingClientRect(); return svg.viewBox.baseVal.height / (r.height || 1); };
  const hauteurZone = () => e.H - e.m.t - e.m.b;
  // déplacer la fenêtre de « d » points de pourcentage (positif : vers les valeurs plus hautes)
  const deplacer = d => { if (!e.dom) return; const [a, b] = e.dom; e.dom = borner(e, a + d, b + d); planifier(); };

  el.addEventListener("wheel", ev => {
    const zoom = ev.ctrlKey || ev.metaKey, monter = ev.shiftKey && !zoom && e.dom;
    if (!zoom && !monter) return;                          // molette seule : la page défile normalement
    ev.preventDefault();                                   // Ctrl + molette : pas de zoom du navigateur ; Maj + molette : pas de défilement
    const svg = el.querySelector("svg");
    if (!svg || !e.y) return;
    const brut = ev.shiftKey && !ev.deltaY ? ev.deltaX : ev.deltaY;   // Maj + molette : certains navigateurs envoient deltaX
    const dy = brut * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
    if (!dy) return;
    const [da, db] = e.def, [a, b] = e.dom || e.def;
    if (monter) { deplacer(-dy * (b - a) / hauteurZone() * echelle()); return; }
    if (dy > 0 && !e.dom) return;                          // déjà en vue complète
    const r = svg.getBoundingClientRect();
    const v = Math.min(b, Math.max(a, e.y.invert((ev.clientY - r.top) * echelle())));
    const f = Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.0025)));
    let na = v + (a - v) * f, nb = v + (b - v) * f;
    if (nb - na >= db - da) e.dom = null;
    else {
      if (nb - na < ECART_MIN) { const c = (na + nb) / 2; na = c - ECART_MIN / 2; nb = c + ECART_MIN / 2; }
      e.dom = borner(e, na, nb);
    }
    planifier();
  }, { passive: false });

  // glisser : le graphique (on l'attrape et on le déplace) ou la barre de défilement (sens inverse, échelle du domaine complet)
  let prise = null;
  el.addEventListener("pointerdown", ev => {
    if (!e.dom || ev.button !== 0 || ev.pointerType === "touch") return;
    const barre = ev.target.closest?.(".vi-zoom-barre");
    if (!barre && !ev.target.closest?.("svg")) return;
    ev.preventDefault();
    prise = { y: ev.clientY, dom: e.dom.slice(), barre: !!barre, id: ev.pointerId };
    el.setPointerCapture(ev.pointerId); el.classList.add("vi-zoom-prise");
  });
  el.addEventListener("pointermove", ev => {
    if (!prise || ev.pointerId !== prise.id) return;
    const dyVb = (ev.clientY - prise.y) * echelle(), [a, b] = prise.dom;
    const d = prise.barre ? -dyVb * (e.def[1] - e.def[0]) / hauteurZone() : dyVb * (b - a) / hauteurZone();
    e.dom = borner(e, a + d, b + d); planifier();
  });
  const lacher = ev => { if (!prise || ev.pointerId !== prise.id) return; prise = null; el.classList.remove("vi-zoom-prise"); };
  el.addEventListener("pointerup", lacher); el.addEventListener("pointercancel", lacher);
  el.addEventListener("dblclick", () => { if (e.dom) { e.dom = null; planifier(); } });
}

// découpe les tracés à la zone du graphique (points et courbes hors de l'axe zoomé), virgule décimale sur l'axe,
// étiquettes de fin hors de la zone masquées ; zoomé : barre de défilement à droite et rappel du zoom dans la marge du haut
export function decouper(svgE, el, y, m, W, H) {
  const e = ETAT.get(el); if (e) { e.y = y; e.m = m; e.H = H; }
  el.classList.toggle("vi-zoome", !!e?.dom);
  const id = "zoomY-" + (el.id || "g");
  svgE.append("clipPath").attr("id", id).append("rect").attr("x", m.l).attr("y", m.t - 4).attr("width", Math.max(0, W - m.l - m.r + 8)).attr("height", Math.max(0, H - m.t - m.b + 8));
  const zone = svgE.append("g").attr("clip-path", `url(#${id})`).node();
  svgE.selectAll(".vi-pt, .vi-ligne, .vi-elec-pt").each(function () { zone.appendChild(this); });
  svgE.selectAll(".vi-grille .tick text").each(function () { this.textContent = this.textContent.replace(".", ","); });
  svgE.selectAll(".vi-fin").style("display", function () { const v = +this.getAttribute("y") - 4; return v < m.t - 6 || v > H - m.b + 6 ? "none" : null; });
  if (!e?.dom) {
    svgE.append("text").attr("class", "vi-elec-txt vi-zoom-txt").attr("x", W - m.r).attr("y", Math.max(9, m.t - 5)).attr("text-anchor", "end")
      .text("Ctrl + molette : zoom vertical");
    return;
  }
  const fmt = v => (Math.round(v * 10) / 10).toLocaleString("fr-CA");
  svgE.append("text").attr("class", "vi-elec-txt vi-zoom-txt").attr("x", W - m.r).attr("y", Math.max(9, m.t - 5)).attr("text-anchor", "end")
    .text(`Zoom : ${fmt(e.dom[0])} à ${fmt(e.dom[1])} % · glisser ou Maj + molette pour monter ou descendre · double-clic : vue complète`);
  // barre de défilement : la piste représente tout l'axe de départ, le curseur la partie affichée
  const [da, db] = e.def, h = H - m.t - m.b, x = W - m.r + 1;
  const haut = m.t + h * (db - e.dom[1]) / (db - da), long = Math.max(14, h * (e.dom[1] - e.dom[0]) / (db - da));
  const g = svgE.append("g").attr("class", "vi-zoom-barre");
  g.append("rect").attr("class", "vi-zoom-piste").attr("x", x).attr("y", m.t).attr("width", 5).attr("height", h).attr("rx", 2.5);
  g.append("rect").attr("class", "vi-zoom-curseur").attr("x", x).attr("y", Math.min(haut, m.t + h - long)).attr("width", 5).attr("height", long).attr("rx", 2.5)
    .append("title").text("Glisser pour monter ou descendre dans le graphique");
}

// bulle d'info d'un graphique : à droite du repère vertical, ou à gauche s'il n'y a pas la place
// (elle ne cache ainsi jamais le repère ni le bout des courbes et leurs étiquettes)
export function placerBulle(tipE, px, largeur) {
  const w = tipE.offsetWidth;
  tipE.style.left = (px + 12 + w <= largeur - 4 ? px + 12 : Math.max(4, px - 12 - w)) + "px";
  tipE.style.top = "8px";
}
