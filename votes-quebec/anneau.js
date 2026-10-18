/* Anneau des sièges d'une région (et remplissage en bandes, plus bas), sur les cartes des scrutins proportionnels par région (Loi 39 : régions,
   Allemagne : Länder, Suisse : cantons). La région garde la couleur du parti en tête des votes ; l'anneau montre que
   les sièges de la région sont partagés : une part par parti (du plus grand au plus petit), son nombre de sièges sur
   la part quand elle est assez grande, le total au centre.
   anneaux(g, liste, { px, coul, R })
     g     : groupe d3 dans le groupe zoomé de la carte (coordonnées de la carte)
     liste : [{ id, x, y, rad, sieges: { parti: n } }] : centre et rayon libre de la région (pôle d'inaccessibilité),
             en unités de la carte
     px    : pixels d'écran par unité de la carte, zoom compris
     coul  : parti → couleur ; R : rayon de l'anneau en pixels d'écran
   Taille constante à l'écran ; caché si la région n'a qu'un siège ou si l'anneau n'y tient pas (il apparaît en
   zoomant). Renvoie l'ensemble des id dessinés (pour décaler les étiquettes de ces régions). */
export const RAYON = 25;   // rayon de l'anneau en pixels d'écran ; une étiquette posée dessous se décale de DESSOUS
export const DESSOUS = 46;
export function anneaux(g, liste, { px = 1, coul = () => "var(--muted)", R = RAYON } = {}) {
  const u = 1 / px, montres = liste.filter(r => total(r.sieges) >= 2 && r.rad * px >= R + 3);
  const arc = d3.arc().innerRadius(R * 0.56 * u).outerRadius(R * u).padAngle(0.025).cornerRadius(0.6 * u);
  const parts = d3.pie().sort(null).value(d => d[1]);
  g.selectAll("g.vi-anneau").data(montres, r => r.id).join(enter => enter.append("g").attr("class", "vi-anneau"))
    .attr("transform", r => `translate(${r.x},${r.y})`)
    .each(function (r) {
      const tranches = parts(Object.entries(r.sieges).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]));
      const a = d3.select(this);
      a.selectAll("circle.vi-anneau-fond").data([0]).join("circle").attr("class", "vi-anneau-fond").attr("r", R * 1.06 * u);
      a.selectAll("path").data(tranches).join("path").attr("d", arc).style("fill", t => coul(t.data[0]));
      a.selectAll("text.vi-anneau-n").data(tranches.filter(t => t.endAngle - t.startAngle >= 0.5)).join("text").attr("class", "vi-anneau-n")
        .attr("transform", t => `translate(${arc.centroid(t)})`).attr("dy", "0.35em").style("font-size", 9.5 * u + "px").style("stroke-width", 2.4 * u + "px")
        .text(t => t.data[1]);
      a.selectAll("text.vi-anneau-total").data([total(r.sieges)]).join("text").attr("class", "vi-anneau-total")
        .attr("dy", "0.36em").style("font-size", 11.5 * u + "px").text(n => n);
    });
  return new Set(montres.map(r => r.id));
}
// remplissage « bandes » d'une région : une bande diagonale par parti, de largeur proportionnelle à ses sièges dans
// la région (dans l'ordre gauche-droite donné), au lieu de la couleur d'un seul parti : un scrutin proportionnel n'a
// pas de vainqueur de la région. Dégradé à arrêts francs (même principe que les délégations partagées du Conseil des
// États suisse) ; une seule couleur si un seul parti a des sièges ; null si la région n'a aucun siège.
export function bandes(defs, id, sieges, coul, ordre = []) {
  const ps = Object.entries(sieges || {}).filter(([, n]) => n > 0)
    .sort((a, b) => (ordre.indexOf(a[0]) + 1 || 99) - (ordre.indexOf(b[0]) + 1 || 99));
  const tot = total(sieges); if (!tot) return null;
  if (ps.length === 1) return coul(ps[0][0]);
  const cle = "vb-" + String(id).replace(/[^\w-]/g, "_");
  let lg = defs.select("#" + cle);
  if (lg.empty()) lg = defs.append("linearGradient").attr("id", cle).attr("x1", 0).attr("y1", 0).attr("x2", 1).attr("y2", 1);
  const arrets = []; let c = 0;
  for (const [p, n] of ps) arrets.push([c / tot, p], [(c += n) / tot, p]);
  lg.selectAll("stop").data(arrets).join("stop").attr("offset", d => d[0]).style("stop-color", d => coul(d[1]));
  return `url(#${cle})`;
}
const total = s => Object.values(s || {}).reduce((a, b) => a + b, 0);
