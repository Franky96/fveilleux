/* Hémicycles des pages d'intentions de vote (France, États-Unis, Allemagne, Suisse) : répartition des sièges par parti.
   Les partis se suivent de gauche à droite, dans le même ordre sur toutes les rangées, chacun en un segment continu par
   rangée. La fin d'un parti dans une rangée vise la même fraction de la rangée partout (sièges cumulés jusqu'à lui ÷
   total), d'où des frontières en rayons et un quartier par grand parti. Un parti qui a moins de sièges que de rangées
   prend un siège dans des rangées voisines, là où sa frontière est le plus en avance : ses sièges se touchent au lieu
   d'être éparpillés en rayon du centre au bord, comme avec un simple tri par angle.

   places = regrouper(places, parts.map(p => p.n))   // places : { a (angle, π = gauche), r (rayon de la rangée), x, y }
   renvoie les places réordonnées : les n0 premières au parti 0, les n1 suivantes au parti 1… ; les places en trop
   (sièges non attribués) viennent à la fin, à droite.

   tracerBlocs(g, places, parts, { cx, cy, Rmax, noms })   // après le dessin des sièges
   parts : [{ n, bord }] dans l'ordre des sièges (partis déjà triés de gauche à droite, trierAxe de partis.js) ;
   le nom de chaque bloc assez grand (gauche radicale, gauche, centre, droite, droite radicale) s'écrit au bord de l'arc ;
   la boîte du dessin s'agrandit pour les noms. */
export function regrouper(places, tailles) {
  const rangees = [...new Set(places.map(p => p.r))].sort((a, b) => a - b)
    .map(r => places.filter(p => p.r === r).sort((p, q) => q.a - p.a));
  const R = rangees.length, cap = rangees.map(l => l.length), pos = cap.map(() => 0), sortie = [];
  const total = places.length, voulu = tailles.reduce((s, n) => s + n, 0);
  const groupes = voulu < total ? [...tailles, total - voulu] : tailles;
  let cumul = 0;
  groupes.forEach((n, j) => {
    const reste = cap.map((c, i) => c - pos[i]), libre = reste.reduce((s, c) => s + c, 0);
    n = Math.min(n, libre); cumul += n;
    const d = cap.map((c, i) => cumul * c / total - pos[i]);   // sièges voulus dans chaque rangée
    let pris;
    if (j === groupes.length - 1 || n === libre) pris = reste;
    else if (n < R) {
      // petit parti : n rangées voisines, un siège chacune, là où la frontière est le plus en avance (à égalité, vers le bord)
      let deb = -1, mieux = -Infinity;
      for (let s = 0; s + n <= R; s++) {
        if (reste.slice(s, s + n).some(c => c < 1)) continue;
        const v = d.slice(s, s + n).reduce((a, b) => a + b, 0);
        if (v >= mieux - 1e-9) { mieux = v; deb = s; }
      }
      pris = cap.map((c, i) => deb >= 0 && i >= deb && i < deb + n ? 1 : 0);
      if (deb < 0) pris = repartir(d, reste, n);
    } else pris = repartir(d, reste, n);
    pris.forEach((m, i) => { sortie.push(...rangees[i].slice(pos[i], pos[i] + m)); pos[i] += m; });
  });
  return sortie;
}

// n sièges entre les rangées selon les sièges voulus d (plus forts restes), sans dépasser la place libre de chaque rangée
function repartir(d, reste, n) {
  const pris = d.map((v, i) => Math.max(0, Math.min(reste[i], Math.floor(v + 1e-9))));
  let k = n - pris.reduce((s, v) => s + v, 0);
  while (k !== 0) {
    const sens = Math.sign(k);
    const i = d.map((v, i) => i).filter(i => sens > 0 ? pris[i] < reste[i] : pris[i] > 0)
      .sort((a, b) => sens * ((d[b] - pris[b]) - (d[a] - pris[a])) || b - a)[0];
    if (i === undefined) break;
    pris[i] += sens; k -= sens;
  }
  return pris;
}

export function tracerBlocs(g, places, parts, { cx, cy, Rmax, noms = {} }) {
  // blocs : parties consécutives de même place sur l'axe
  const blocs = [];
  let i0 = 0;
  for (const p of parts) {
    const b = p.bord || "aut", der = blocs[blocs.length - 1];
    if (der && der.bord === b) der.fin += p.n; else blocs.push({ bord: b, debut: i0, fin: i0 + p.n });
    i0 += p.n;
  }
  const attribues = i0;
  const rs = [...new Set(places.map(p => p.r))].sort((a, b) => a - b);
  const rangees = rs.map(r => places.map((p, i) => ({ p, i })).filter(x => x.p.r === r).sort((x, y) => y.p.a - x.p.a));
  const pasR = rs.length > 1 ? rs[1] - rs[0] : 0.1;
  const pt = (a, r) => [cx + Math.cos(a) * r * Rmax, cy - Math.sin(a) * r * Rmax];
  // noms des blocs au bord de l'arc (blocs d'au moins 4 % des sièges, hors « autres »)
  const ext = rangees[rangees.length - 1], rOut = rs[rs.length - 1] + pasR * 0.6;
  const lab = g.append("g").attr("class", "vf-hemi-blocs");
  blocs.forEach(b => {
    if (b.bord === "aut" || !noms[b.bord] || (b.fin - b.debut) / places.length < 0.04) return;
    const dans = ext.filter(x => x.i >= b.debut && x.i < b.fin), src = dans.length ? dans : places.slice(b.debut, b.fin).map(p => ({ p }));
    const a = src.reduce((s, x) => s + x.p.a, 0) / src.length, [x, y] = pt(a, rOut), c = Math.cos(a);
    lab.append("text").attr("x", x).attr("y", y).attr("text-anchor", c > 0.3 ? "start" : c < -0.3 ? "end" : "middle")
      .attr("dominant-baseline", Math.sin(a) > 0.5 ? "auto" : "middle").text(noms[b.bord]);
  });
  // boîte agrandie pour que les noms ne soient pas coupés
  const svg = g.node().ownerSVGElement || g.node();
  try {
    const vb = svg.viewBox.baseVal, bb = svg.getBBox(), m = 6;
    const x0 = Math.min(vb.x, bb.x - m), y0 = Math.min(vb.y, bb.y - m), x1 = Math.max(vb.x + vb.width, bb.x + bb.width + m), y1 = Math.max(vb.y + vb.height, bb.y + bb.height + m);
    svg.setAttribute("viewBox", `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
  } catch (e) { /* SVG pas encore affiché : boîte d'origine */ }
}
