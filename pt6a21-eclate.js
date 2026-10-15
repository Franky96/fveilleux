/* =====================================================================
   PT6A-21 — vue éclatée sur l'axe de rotation, commune au réducteur (pt6a21-rgb.js), à la section
   turbines et échappement (pt6a21-turbines.js) et aux autres sections de pt6a21.html.
   const E = Eclate(THREE) -> { mesurer, rayons, eclater, preparer, demonter }
   ===================================================================== */
window.Eclate = function (THREE) {
'use strict';
/* ---------- vue éclatée sur l'axe ----------
   Repère : y = axe du moteur (avant = +y). Une pièce « de l'axe » (sa boîte entoure l'axe) ne bouge que le long de
   l'axe : ces pièces se rangent en ligne dans leur ordre réel, de part et d'autre d'une pièce fixe, chacune juste
   au-delà de la précédente. Une pièce « autour » (accessoire, prise, tube…) suit sa pièce d'attache sur l'axe et
   s'écarte vers l'extérieur juste assez pour tout dégager. Des satellites (orbit) restent en étoile autour de l'axe,
   à la hauteur de leur porte-satellites, leur orbite élargie juste assez.

   mesurer(objets, inv)   boîte et rayon maximal depuis l'axe de ces objets (inv : passage au repère de l'axe)
   eclater(pièces, o)     pièces = [{ id, box, R, orbit: { rc, rpo }, host }],
                          o = { gap, anchor, ordre: [ids de l'avant vers l'arrière], extra: { id: écart axial en plus },
                                extraR: { id: écart radial en plus } }
                          -> { id: { v (déplacement), dr (élargissement d'orbite) } } */
const V3 = THREE.Vector3;
function mesurer(objs, inv) {
  const box = new THREE.Box3(), b2 = new THREE.Box3(), c = new V3(), m = new THREE.Matrix4(), mi = new THREE.Matrix4();
  let R = 0;
  for (const o of objs) {
    if (!o.isMesh || !o.geometry) continue;
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
    for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) {
      m.multiplyMatrices(inv, o.matrixWorld); if (o.isInstancedMesh) { o.getMatrixAt(i, mi); m.multiply(mi); }
      b2.makeEmpty();
      for (let q = 0; q < 8; q++) { c.set(q & 1 ? bb.max.x : bb.min.x, q & 2 ? bb.max.y : bb.min.y, q & 4 ? bb.max.z : bb.min.z).applyMatrix4(m); b2.expandByPoint(c); }
      box.union(b2);
      // pièce de révolution centrée : rayon = demi-largeur de sa boîte ; sinon, coin le plus éloigné de l'axe
      R = Math.max(R, b2.min.x < 0 && b2.max.x > 0 && b2.min.z < 0 && b2.max.z > 0 ? Math.max(-b2.min.x, b2.max.x, -b2.min.z, b2.max.z) : rayons(b2)[1]);
    }
  }
  return { box, R };
}
function rayons(b) {        // distances minimale et maximale d'une boîte à l'axe
  const dx = Math.max(0, b.min.x, -b.max.x), dz = Math.max(0, b.min.z, -b.max.z);
  let r1 = 0; for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) r1 = Math.max(r1, Math.hypot(x, z));
  return [Math.hypot(dx, dz), r1];
}
const surAxe = p => !p.orbit && p.box.min.x < 0 && p.box.max.x > 0 && p.box.min.z < 0 && p.box.max.z > 0;
const volume = b => { const z = b.getSize(new V3()); return z.x * z.y * z.z; };
function eclater(parts, o) {
  const gap = o.gap, ex = o.extra || {}, exR = o.extraR || {}, res = {};
  const coax = parts.filter(surAxe), orb = parts.filter(p => p.orbit), per = parts.filter(p => !p.orbit && !surAxe(p));
  const cy = p => (p.box.min.y + p.box.max.y) / 2;
  // de l'avant vers l'arrière : ordre donné (o.ordre, un carter avant ce qu'il contient du côté du centre), sinon par centre
  const rang = id => { const i = (o.ordre || []).indexOf(id); return i < 0 ? Infinity : i; };
  coax.sort((a, b) => (rang(a.id) - rang(b.id)) || (cy(b) - cy(a)));
  let ai = coax.findIndex(p => p.id === o.anchor);
  if (ai < 0) ai = coax.indexOf(coax.reduce((a, b) => volume(b.box) > volume(a.box) ? b : a));
  const s = { [coax[ai].id]: 0 };
  let top = coax[ai].box.max.y, bot = coax[ai].box.min.y;
  for (let i = ai - 1; i >= 0; i--) { const p = coax[i]; s[p.id] = Math.max(0, top + gap + (ex[p.id] || 0) - p.box.min.y); top = Math.max(top, p.box.max.y + s[p.id]); }
  for (let i = ai + 1; i < coax.length; i++) { const p = coax[i]; s[p.id] = Math.min(0, bot - gap - (ex[p.id] || 0) - p.box.max.y); bot = Math.min(bot, p.box.min.y + s[p.id]); }
  for (const p of coax) res[p.id] = { v: new V3(0, s[p.id], 0), dr: 0 };
  const yr = p => [p.box.min.y + s[p.id], p.box.max.y + s[p.id]];
  // pièce d'attache : pièce de l'axe qui la contient, la plus large puis la plus courte
  const hote = p => {
    if (p.host && s[p.host] !== undefined) return p.host;
    const y = cy(p); let h = null;
    for (const q of coax) if (q.box.min.y <= y && y <= q.box.max.y && (!h || q.R > h.R + 1e-9 || (Math.abs(q.R - h.R) <= 1e-9 && q.box.max.y - q.box.min.y < h.box.max.y - h.box.min.y))) h = q;
    return (h || coax[ai]).id;
  };
  for (const p of orb) {
    const dy = s[hote(p)], y0 = p.box.min.y + dy, y1 = p.box.max.y + dy;
    let Rm = 0; for (const q of coax) { const [a, b] = yr(q); if (a < y1 + gap && b > y0 - gap) Rm = Math.max(Rm, q.R); }
    res[p.id] = { v: new V3(0, dy, 0), dr: Math.max(0, Rm + gap - (p.orbit.rc - p.orbit.rpo)) + (exR[p.id] || 0), host: hote(p) };
  }
  const poses = [];
  per.sort((a, b) => rayons(a.box)[0] - rayons(b.box)[0]);           // de la plus proche de l'axe à la plus éloignée
  for (const p of per) {
    const dy = s[hote(p)], c = p.box.getCenter(new V3()), u = new V3(c.x, 0, c.z);
    if (u.lengthSq() < 1e-12) u.set(1, 0, 0); u.normalize();
    let t = exR[p.id] || 0, bx;
    for (let it = 0; it < 600; it++, t += gap) {
      bx = p.box.clone().translate(new V3(u.x * t, dy, u.z * t));
      const [r0, r1] = rayons(bx);
      const gene = coax.some(q => { const [a, b] = yr(q); return a < bx.max.y + gap && b > bx.min.y - gap && r0 < q.R + gap; })
        || orb.some(q => { const r = res[q.id], y0 = q.box.min.y + r.v.y, y1 = q.box.max.y + r.v.y; return y0 < bx.max.y + gap && y1 > bx.min.y - gap && r1 > q.orbit.rc + r.dr - q.orbit.rpo - gap && r0 < q.orbit.rc + r.dr + q.orbit.rpo + gap; })
        || poses.some(b => b.intersectsBox(bx));
      if (!gene) break;
    }
    poses.push(bx.clone().expandByScalar(gap / 2));
    res[p.id] = { v: new V3(u.x * t, dy, u.z * t), dr: 0, host: hote(p) };
  }
  return res;
}

/* preparer({ PART, ORDER, STEPS, ORB, HOST, ORDRE, ANCRE, S }) -> { MOUV, essais }
   Les étapes du manuel amènent chaque pièce à sa place dans la vue éclatée sur l'axe (ANCRE fixe). À une étape où
   une pièce part avec d'autres sans être à sa dernière étape (ex. tout un carter avec son contenu), le bloc glisse
   sur l'axe comme sa plus grosse pièce. Si une pièce posée croise une pièce encore en place, la ligne s'allonge à cet
   endroit (ou la pièce s'écarte un peu plus de l'axe) et on recommence. Pendant le mouvement, les pièces peuvent se
   traverser. À appeler l'ensemble assemblé, groupe racine sans transformation (repère de l'axe = repère du groupe).
   MOUV[id] = [[k, déplacement, dr (en pouces)]] : mouvement de la pièce pendant l'étape k. */
function preparer({ PART, ORDER, STEPS, ORB = {}, HOST = {}, ORDRE = [], ANCRE, S }) {
  const MOUV = {}; let ESSAIS = 0;
  const PART_STEPS = {};
  STEPS.forEach((st, k) => st.m.forEach(([ids]) => ids.forEach(id => (PART_STEPS[id] ||= []).push(k))));
  const I = new THREE.Matrix4(), SH = {};
  for (const id of ORDER) { const objs = []; PART[id].g.traverse(o => { if (o.isMesh) objs.push(o); }); const f = mesurer(objs, I); if (!f.box.isEmpty()) SH[id] = f; }
  const pieces = ORDER.filter(id => SH[id]).map(id => ({ id, box: SH[id].box, R: SH[id].R, orbit: ORB[id], host: HOST[id] }));
  const kind = {}; for (const p of pieces) kind[p.id] = p.orbit ? 'orb' : surAxe(p) ? 'axe' : 'per';
  const LAST = {}; for (const id of ORDER) if (PART_STEPS[id]) LAST[id] = Math.max(...PART_STEPS[id]);
  const GAP = 0.3 * S, EPS = 0.04 * S, extra = {}, extraR = {};
  // blocs OM de chaque étape : pièces qui ont le même déplacement dans le manuel
  const BLOCS = STEPS.map(st => {
    const tot = new Map();
    for (const [ids, v] of st.m) for (const id of ids) { const e = tot.get(id) || [0, 0, 0]; e[0] += v.dz || 0; e[1] += v.up || 0; e[2] += v.dr || 0; tot.set(id, e); }
    const g = new Map(); for (const [id, e] of tot) { const k = e.join('|'); if (!g.has(k)) g.set(k, []); g.get(k).push(id); }
    return [...g.values()].map(ids => ({ ids, main: ids.filter(id => SH[id]).sort((a, b) => (kind[b] === 'axe') - (kind[a] === 'axe') || volume(SH[b].box) - volume(SH[a].box))[0] }));
  });
  const forme = (id, c) => {
    const f = SH[id], y0 = f.box.min.y + c.v.y, y1 = f.box.max.y + c.v.y;
    if (kind[id] === 'axe') return { y0, y1, r0: 0, r1: f.R };
    if (kind[id] === 'orb') { const o = ORB[id]; return { y0, y1, r0: o.rc + c.dr - o.rpo, r1: o.rc + c.dr + o.rpo }; }
    const bx = f.box.clone().translate(c.v), [r0, r1] = rayons(bx); return { y0, y1, r0, r1, bx };
  };
  const croise = (a, b) => {
    if (!(a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS)) return 0;
    if (a.bx && b.bx) return a.bx.clone().expandByScalar(-EPS).intersectsBox(b.bx) ? 1 : 0;
    return a.r0 < b.r1 - EPS && b.r0 < a.r1 - EPS ? 1 : 0;
  };
  let F, T;
  for (let essai = 0; essai < 400; essai++) {
    ESSAIS = essai;
    F = eclater(pieces, { gap: GAP, anchor: ANCRE, ordre: ORDRE, extra, extraR });
    // cible de chaque pièce à chaque étape : sa place finale si c'est sa dernière étape, ou si (pièce montée autour)
    // elle quitte sa pièce d'attache ; sinon elle glisse avec son bloc. Une pièce à sa place n'en bouge plus.
    const pose = {};
    T = BLOCS.map((blocs, k) => {
      const t = {};
      for (const b of blocs) for (const id of b.ids) {
        if (!SH[id] || pose[id]) continue;
        if (LAST[id] === k || (kind[id] !== 'axe' && !b.ids.includes(F[id].host))) { t[id] = F[id]; pose[id] = true; b.fin = true; }
        else t[id] = { v: new V3(0, F[b.main].v.y, 0), dr: 0 };
      }
      return t;
    });
    const cur = {}; for (const id in SH) cur[id] = { v: new V3(), dr: 0 };
    let conflit = null;
    for (let k = 0; k < T.length && !conflit; k++) {
      Object.assign(cur, T[k]);
      for (const x in T[k]) { for (const u in SH) {
        if (u === x) continue;
        const cx = cur[x], cu = cur[u];
        if (cx.v.distanceTo(cu.v) < 1e-9 && Math.abs(cx.dr - cu.dr) < 1e-9) continue;          // encore assemblées entre elles
        const fx = forme(x, cx), fu = forme(u, cu);
        if (croise(fx, fu)) { conflit = { k, x, u, fx, fu }; break; }
      } if (conflit) break; }
    }
    if (!conflit) break;
    // on pousse la pièce qui vient de bouger (si les deux ont bougé : la plus petite)
    const { k, fx, fu } = conflit; let { x, u } = conflit;
    if (T[k][u] && volume(SH[u].box) < volume(SH[x].box)) [x, u] = [u, x];
    const bloc = BLOCS[k].find(b => b.ids.includes(x)), fin = T[k][x] === F[x];
    const cible = fin ? x : bloc.main;
    if (kind[cible] === 'axe') {
      const fa = forme(x, cur[x]), fb = forme(u, cur[u]);
      extra[cible] = (extra[cible] || 0) + Math.max(GAP, Math.min(fa.y1 - fb.y0, fb.y1 - fa.y0) + GAP / 2);
    } else extraR[cible] = (extraR[cible] || 0) + 2 * GAP;
    void fx; void fu;
  }
  // mouvements étape par étape
  const prev = {};
  T.forEach((t, k) => { for (const id in t) { const p = prev[id] || { v: new V3(), dr: 0 }; (MOUV[id] ||= []).push([k, t[id].v.clone().sub(p.v), (t[id].dr - p.dr) / S]); prev[id] = t[id]; } });
  return { MOUV, essais: ESSAIS };
}
// t = étape (0 = assemblé, n = tout démonté, valeurs fractionnaires = entre deux étapes) ; p.ex.dr = élargissement d'orbite (po)
function demonter(PART, ORDER, MOUV, exT) {
  const ease = t => t * t * (3 - 2 * t);
  for (const id of ORDER) {
    const p = PART[id]; p.g.position.set(0, 0, 0); if (p.ex) p.ex.dr = 0;
    for (const [k, v, dr] of (MOUV[id] || [])) { const f = ease(Math.min(1, Math.max(0, exT - k))); p.g.position.addScaledVector(v, f); if (p.ex) p.ex.dr += dr * f; }
  }
}

return { mesurer, rayons, eclater, preparer, demonter };
};
