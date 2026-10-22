/* =====================================================================
   Turbines et échappement PT6A-21 (chapitre 72-50) — modèle 3D détaillé, monté dans le modèle complet (pt6a21.html)
   Sources : AMM 72-50-00 à -05 (descriptions, fig. 1 « coupe des turbines », déposes 72-50-01 à -05),
   IPC 72-50-01 à -05 (vues éclatées et nomenclatures), OM 72-50 (démontage, tableaux 601 « Fits and Clearances »).
   Unités : pouces. z = distance vers l'arrière depuis la face de la bride d'hélice (même origine que le modèle complet),
   r = rayon, h = position horaire vue de l'arrière (12 h en haut). 1 unité = 10 po : pt6a21.html met le groupe à
   l'échelle ½ et place son point z = Z0 sur l'axe.

   Cotes : rayons tirés des tableaux de jeux (OM 72-50-0x tabl. 601, AMM 72-50-01 tabl. 203) et de la coupe AMM 72-50-00
   fig. 1, relevée à l'échelle (114 px/po à 400 ppp, vérifiée sur Ø rotor TC 8,55 po, Ø virole TP 10,29 po, Ø chemise
   15,95 po) ; stations z de la même figure, calées sur la bride C du modèle complet (z = 24,25). Raccords imposés par le
   modèle complet : bride A (réducteur), bride C (r 9,95), entrées des conduits de sortie sur la chambre (r 8,7 et 7,05).
   Les cotes estimées sont signalées « estimé ».

   const T = construireTurbines(THREE)
   T.root                 groupe à ajouter (axe local Y = axe moteur, avant = +Y), non tourné, non mis à l'échelle
   T.PART[id], T.ORDER    pièces (groupe, matériaux, kind 'case' = carter fixe coupé en mode coupe)
   T.INFO[id], GROUPS     fiches des pièces et leurs familles
   T.STEPS, ORDRE, ANCRE  démontage (OM / AMM 72-50) et vue éclatée sur l'axe (pt6a21-eclate.js)
   T.update(aNg, aNf)     angles des rotors : générateur de gaz (rotNg) et turbine de puissance (rotNf)
   ===================================================================== */
window.construireTurbines = function (THREE) {
'use strict';

const S = 0.1, TAU = Math.PI * 2, Z0 = 28;
const AY = z => (Z0 - z) * S;                          // axe local Y : avant = +Y
const clockPhi = h => (h / 12) * TAU + Math.PI / 2;
const P = (r, z, h = 0) => { const f = clockPhi(h); return new THREE.Vector3(r * S * Math.sin(f), AY(z), r * S * Math.cos(f)); };
const RD = h => { const f = clockPhi(h); return new THREE.Vector3(Math.sin(f), 0, Math.cos(f)); };
const lerp = (a, b, t) => a + (b - a) * t;

const root = new THREE.Group();

/* =====================================================================
   REGISTRE DES PIÈCES
   ===================================================================== */
const PART = {};
const ORDER = [];
function part(id, o) {
  const g = new THREE.Group(); g.userData.part = id; root.add(g);
  PART[id] = Object.assign({ id, g, mats: [], kind: 'int', ex: { dz: 0, up: 0, dr: 0 }, rdir: null, swatch: '#888' }, o);
  ORDER.push(id);
  return g;
}
function M(id, o, kind) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide, envMapIntensity: 0.75 }, o));
  m.userData.kind = kind || PART[id].kind; m.userData.part = id;
  m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent;
  m.userData.baseEmissive = m.emissive.clone();
  PART[id].mats.push(m);
  if (PART[id].mats.length === 1) PART[id].swatch = '#' + m.color.getHexString();
  return m;
}
const boltMats = {};
const boltMat = id => boltMats[id] ||= M(id, { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });

/* ---------- géométrie de révolution à arêtes vives ---------- */
function revolve(pts, segs = 96, closed = true) {
  const Q = pts.map(([r, z]) => [Math.max(1e-4, r * S), AY(z)]);
  const n = closed ? Q.length : Q.length - 1;
  const pos = [], idx = [], bands = [];
  let base = 0;
  for (let k = 0; k < n; k++) {
    const a = Q[k], b = Q[(k + 1) % Q.length];
    if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) continue;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs * TAU, s = Math.sin(t), c = Math.cos(t);
      pos.push(a[0] * s, a[1], a[0] * c, b[0] * s, b[1], b[0] * c);
    }
    for (let i = 0; i < segs; i++) { const v = base + i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    bands.push(base); base += (segs + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (const b of bands) for (const j of [0, 1]) {         // soudure du joint à 0/360°
    const i0 = b + j, i1 = b + segs * 2 + j;
    v.fromBufferAttribute(nr, i0); w.fromBufferAttribute(nr, i1); v.add(w).normalize();
    nr.setXYZ(i0, v.x, v.y, v.z); nr.setXYZ(i1, v.x, v.y, v.z);
  }
  return g;
}
function lathe(id, pts, mat, parent, segs = 96, closed = true) {
  const m = new THREE.Mesh(revolve(pts, segs, closed), mat); (parent || PART[id].g).add(m); return m;
}
const ringPts = (r0, r1, z0, z1) => [[r0, z0], [r1, z0], [r1, z1], [r0, z1]];
// tôle : polyligne (r, z) épaissie de t le long de sa normale -> profil fermé
function sheet(pts, t) {
  const inn = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dr = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dr, dz) || 1;
    return [p[0] + t * dz / l, p[1] - t * dr / l];
  });
  return pts.concat(inn.reverse());
}
// polyligne (r, z) redécoupée en pas d'au plus `pas` po (découpe fidèle des trous percés dans une révolution)
function densifier(pts, pas) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [r0, z0] = pts[i - 1], [r1, z1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(r1 - r0, z1 - z0) / pas));
    for (let k = 1; k <= n; k++) out.push([lerp(r0, r1, k / n), lerp(z0, z1, k / n)]);
  }
  return out;
}
// perce une géométrie : garde ce qui est du côté f(p) >= 0, les triangles traversés étant recoupés le long de f = 0
function percer(geo, f) {
  const src = geo.index ? geo.toNonIndexed() : geo, P0 = src.attributes.position, N0 = src.attributes.normal;
  const pos = [], nor = [];
  const V = i => { const p = new THREE.Vector3().fromBufferAttribute(P0, i); return { p, n: new THREE.Vector3().fromBufferAttribute(N0, i), f: f(p) }; };
  const push = v => { pos.push(v.p.x, v.p.y, v.p.z); nor.push(v.n.x, v.n.y, v.n.z); };
  for (let i = 0; i < P0.count; i += 3) {
    const tri = [V(i), V(i + 1), V(i + 2)], dedans = tri.filter(v => v.f >= 0).length;
    if (dedans === 3) { tri.forEach(push); continue; }
    if (dedans === 0) continue;
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      if (a.f >= 0) poly.push(a);
      if ((a.f >= 0) !== (b.f >= 0)) { const t = a.f / (a.f - b.f); poly.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize() }); }
    }
    for (let k = 1; k + 1 < poly.length; k++) { push(poly[0]); push(poly[k]); push(poly[k + 1]); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
// segment de révolution (talon, segment de virole) centré sur l'angle 0, à instancier
function arcGeo(pts, frac, n, zc) {
  const d = TAU / n * frac;
  return new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r * S, AY(z) - AY(zc))), 4, -d / 2, d);
}

/* ---------- aides de placement ---------- */
// repère radial : X = tangentiel, Y = radial vers l'extérieur, Z = axial vers l'arrière
function radBasis(phi) {
  const ey = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)), ez = new THREE.Vector3(0, -1, 0);
  const ex = new THREE.Vector3().crossVectors(ey, ez);
  return new THREE.Matrix4().makeBasis(ex, ey, ez);
}
function radM(r, z, phi, extra) { const m = radBasis(phi); if (extra) m.multiply(extra); m.setPosition(new THREE.Vector3(r * S * Math.sin(phi), AY(z), r * S * Math.cos(phi))); return m; }
const axM = (r, z, phi) => new THREE.Matrix4().makeRotationY(phi).setPosition(r * S * Math.sin(phi), AY(z), r * S * Math.cos(phi));
function inst(geo, mats4, mat, parent, flag) {
  const im = new THREE.InstancedMesh(geo, mat, mats4.length); mats4.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true; if (flag) im.userData[flag] = true; parent.add(im); return im;
}
function boltRing(id, parent, r, z, n, size, o = {}) {      // têtes hexagonales axiales
  const g = new THREE.CylinderGeometry(size * S, size * S, (o.h || size * 0.9) * S, 6);
  const ms = []; for (let i = 0; i < n; i++) { const phi = (o.phi0 || 0) + i * (o.pas ?? TAU / n); if (o.skip && o.skip(i, phi)) continue; ms.push(axM(r, z, phi)); }
  return inst(g, ms, o.mat || boltMat(id), parent || PART[id].g, 'bolt');
}
function radialBox(parent, mat, h, r0, r1, z0, z1, wid, phiOverride) {
  const phi = phiOverride ?? clockPhi(h);
  const m = new THREE.Mesh(new THREE.BoxGeometry(wid * S, (r1 - r0) * S, (z1 - z0) * S), mat);
  m.applyMatrix4(radM((r0 + r1) / 2, (z0 + z1) / 2, phi)); parent.add(m); return m;
}
function radialCyl(parent, mat, h, r0, r1, z, rad, seg = 24, phiOverride, rad2) {
  const phi = phiOverride ?? clockPhi(h);
  const m = new THREE.Mesh(new THREE.CylinderGeometry((rad2 ?? rad) * S, rad * S, (r1 - r0) * S, seg), mat);
  m.applyMatrix4(radM((r0 + r1) / 2, z, phi)); parent.add(m); return m;
}
function axialCyl(parent, mat, rr, h, rad, z0, z1, seg = 24, open = false) {   // cylindre parallèle à l'axe, décalé à (rr, h)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * S, rad * S, (z1 - z0) * S, seg, 1, open), mat);
  m.position.copy(P(rr, (z0 + z1) / 2, h)); parent.add(m); return m;
}
// textures procédurales sans DOM
function dataTex(w, h, f, rx, ry) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}
// alvéoles de la couverture isolante (quinconce)
const dimpleTex = dataTex(32, 32, (x, y) => {
  let v = 225;
  for (const [cx, cy] of [[8, 8], [24, 24], [24, -8], [-8, 24], [8, 40], [40, 8]]) { const d = Math.hypot(x - cx, y - cy); if (d < 6) v = Math.min(v, 150 + d * 12); }
  return v;
}, 40, 10);

/* ---------- aube vrillée (même convention que pt6a21.html) ---------- */
function bladeGeo({ r0, r1, chord, tipChord = chord, thick = 0.1, st0, st1, camber = 0.12 }) {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 10, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i), w = p.getZ(i);
    const r = lerp(r0, r1, u), c = lerp(chord, tipChord, u);
    const env = Math.sqrt(Math.max(0, 1 - 4 * v * v));
    const t = (w > 0 ? 1 : -1) * thick * c * 0.5 * (0.15 + 0.85 * env) + camber * c * (1 - 4 * v * v) * 0.5;
    const a = v * c, s = lerp(st0, st1, u);
    // vu de l'arrière, st > 0 décale le bord de fuite vers l'horaire et camber > 0 tourne le creux vers l'antihoraire
    p.setXYZ(i, r * S, (a * Math.cos(s) - t * Math.sin(s)) * S, -(a * Math.sin(s) + t * Math.cos(s)) * S);
  }
  const ix = g.index.array; // le miroir inverse l'ordre des sommets : on rétablit l'orientation des faces
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}
function bladeRow(geo, n, mat, parent, z, phase = 0, flag) {
  const ms = []; for (let i = 0; i < n; i++) ms.push(new THREE.Matrix4().makeRotationY(phase + i * TAU / n));
  const im = inst(geo, ms, mat, parent, flag); im.position.y = AY(z); return im;
}

/* ---------- roulement : bague intérieure (et éléments) dans le groupe tournant, bague extérieure fixe ---------- */
function bearing(id, gIn, gOut, rIn, rOut, z0, z1, n, roller, o = {}) {
  const mR = M(id, { color: 0xdadddf, metalness: 1, roughness: 0.18 });
  const w = z1 - z0, t = (rOut - rIn) * 0.2, zm = (z0 + z1) / 2;
  if (gIn) lathe(id, [[rIn, z0], [rIn + t, z0], [rIn + t, zm - w * 0.3], [rIn + t * 0.75, zm], [rIn + t, zm + w * 0.3], [rIn + t, z1], [rIn, z1]], mR, gIn, 64);
  if (gOut) {
    lathe(id, [[rOut, z0], [rOut, z1], [rOut - t, z1], [rOut - t, zm + w * 0.3], [rOut - t * 0.75, zm], [rOut - t, zm - w * 0.3], [rOut - t, z0]], mR, gOut, 64);
    if (o.flange) {                                           // bride carrée à pans arrondis (IPC 72-50-04 fig. 2)
      const a = o.flange * S, rc = 0.25 * a, sh = new THREE.Shape();
      sh.moveTo(-a + rc, -a); sh.lineTo(a - rc, -a); sh.quadraticCurveTo(a, -a, a, -a + rc); sh.lineTo(a, a - rc); sh.quadraticCurveTo(a, a, a - rc, a);
      sh.lineTo(-a + rc, a); sh.quadraticCurveTo(-a, a, -a, a - rc); sh.lineTo(-a, -a + rc); sh.quadraticCurveTo(-a, -a, -a + rc, -a);
      const hl = new THREE.Path(); hl.absarc(0, 0, (rOut - t) * S, 0, TAU, true); sh.holes.push(hl);
      const fg = new THREE.ExtrudeGeometry(sh, { depth: (o.fz1 - o.fz0) * S, bevelEnabled: false, curveSegments: 6 });
      fg.rotateX(-Math.PI / 2); fg.rotateY(Math.PI / 4); fg.translate(0, AY(o.fz1), 0);
      gOut.add(new THREE.Mesh(fg, mR));
      const bl = []; for (let k = 0; k < 4; k++) bl.push(axM(o.flange * 1.06, o.fz0 - 0.05, k * TAU / 4));
      inst(new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 0.1 * S, 6), bl, boltMat(id), gOut, 'bolt');
    }
  }
  const gEl = o.gEl !== undefined ? o.gEl : gOut;             // billes / rouleaux et cage
  if (gEl) {
    const mE = M(id, { color: 0xf1f3f4, metalness: 1, roughness: 0.08 }), mC = M(id, { color: 0xc89b4a, metalness: 0.9, roughness: 0.3 });
    const rm = (rIn + rOut) / 2, re = (rOut - rIn) / 2 - t * 0.8;
    const g = roller ? new THREE.CylinderGeometry(re * S, re * S, w * 0.66 * S, 14) : new THREE.SphereGeometry(re * S, 16, 10);
    const ms = []; for (let i = 0; i < n; i++) ms.push(axM(rm, zm, i * TAU / n)); inst(g, ms, mE, gEl);
    for (const dz of [-0.36, 0.36]) lathe(id, ringPts(rm - re * 0.5, rm + re * 0.5, zm + dz * w - 0.02, zm + dz * w + 0.02), mC, gEl, 48);
  }
}

/* =====================================================================
   FICHES DES PIÈCES (textes rédigés d'après les manuels)
   ===================================================================== */
const GROUPS = [
  ['exh', 'Conduit d\'échappement'], ['pts', 'Distributeur de turbine de puissance'], ['pt', 'Turbine de puissance et arbre'],
  ['cts', 'Distributeur et viroles de turbine compresseur'], ['ct', 'Turbine compresseur'], ['ducts', 'Conduits de sortie']
];
const INFO = {
  exh: { g: 'exh', n: 'Conduit d\'échappement', ref: 'AMM 72-50-05 · IPC 72-50-05 fig. 1 (rep. 10 à 90) · OM 72-50-05 tabl. 601',
    d: 'Tronc de cône en tôle d\'alliage de nickel réfractaire, à deux sorties opposées (3 h et 9 h) dont les brides reçoivent les tuyères de l\'avion, et à entrée annulaire autour d\'un cône intérieur qui donne aux gaz un mouvement tourbillonnaire et balaie le conduit. La bride A porte le réducteur ; à l\'arrière, la bride extérieure C sépare générateur de gaz et section de puissance, la bride intérieure D porte le carter du distributeur TP. La virole de la turbine de puissance est frettée devant la bride D.',
    k: [['Matériau', 'tôle d\'alliage de nickel'], ['Centrage bride A (réducteur)', 'Ø 12,622–12,625 po'], ['Centrage bride C (carter GG)', 'Ø 16,892–16,898 po'], ['Alésage à la bride D', 'Ø 10,284–10,287 po'], ['Écrous de la bride A', '36–40 lb·po, en croix']] },
  blanket: { g: 'exh', n: 'Couverture isolante', ref: 'AMM 72-50-04, 72-50-05 · IPC 72-50-05 fig. 1 (rep. 100)',
    d: 'Stratifié acier inoxydable / fibre céramique à alvéoles, placé entre le cône intérieur du conduit et le logement d\'arbre de la turbine de puissance : il limite le passage de la chaleur des gaz vers les paliers n° 3 et n° 4 et l\'arrière du réducteur. Pavillon à l\'avant autour du carter arrière du réducteur, tube autour du logement d\'arbre.',
    k: [['Matériau', 'acier inoxydable / fibre céramique'], ['Dépose', 'après le conduit (AMM 72-50-05, 5.A(8))']] },
  boltsC: { g: 'exh', n: 'Boulonnerie de la bride C', ref: 'AMM 72-00-00 · AMM 72-50-05 fig. 1',
    d: 'Couronne de boulons et d\'écrous qui réunit le conduit d\'échappement au carter du générateur de gaz : c\'est la bride de séparation entre section de puissance et générateur de gaz.',
    k: [['Boulons', '36 (nombre du modèle complet, à confirmer)'], ['Rôle', 'séparation section de puissance / générateur de gaz']] },

  cring: { g: 'pts', n: 'Anneau de rétention de la turbine de puissance', ref: 'AMM 72-50-00, 72-50-03 fig. 201 · IPC 72-50-03 fig. 1 (rep. 136, 136A)',
    d: 'Anneau de blindage autour du conduit, au droit de la turbine de puissance, fixé à la bride D avec le carter du distributeur : il retient les fragments en cas de rupture d\'aube. Après le SB1427, anneau avec chemise de renfort.',
    k: [['Fixation', 'bride D, avec le carter du distributeur'], ['Post-SB1427', 'anneau + chemise de renfort (rep. 137, 138)']] },
  flangeD: { g: 'pts', n: 'Bride D : demi-bagues et boulons', ref: 'AMM 72-50-03 fig. 201 · IPC 72-50-03 fig. 1 (rep. 131 à 135)',
    d: 'Deux demi-bagues de montage (post-SB1220) serrent la bride du carter du distributeur TP sur la bride D du conduit, avec deux boulons à 1 h et 7 h freinés au fil. Avant le SB1220 : demi-bagues de renfort et goupilles à tête.',
    k: [['Boulons', '2 (1 h et 7 h)'], ['Couple', '32–36 lb·po, freinés au fil'], ['Demi-bagues', '2']] },
  ptsh: { g: 'pts', n: 'Carter du distributeur de turbine de puissance', ref: 'AMM 72-50-03 · IPC 72-50-03 fig. 1 (rep. 10, 40, 50) · OM 72-50-03 tabl. 601',
    d: 'Carter conique en alliage réfractaire : sa bride avant est fixée à la bride D avec l\'anneau de rétention ; il loge le distributeur TP, dont il tient les encoches par des pattes. Huit bossages reçoivent les sondes T5 ; à l\'arrière, une cavité loge les segments d\'étanchéité entre-étages qui portent sur le carter de virole TC.',
    k: [['Centrage dans le conduit', 'Ø 10,287–10,289 po (0–0,005 po serré)'], ['Bossages T5', '8 : 1, 2, 3, 4, 8, 9, 10, 11 h'], ['Largeur min. des pattes', '0,190 po (usure)']] },
  sealrings: { g: 'pts', n: 'Segments d\'étanchéité entre-étages', ref: 'AMM 72-50-01, 72-50-03 · IPC 72-50-03 fig. 1 (rep. 140)',
    d: 'Segments fendus logés dans la gorge du prolongement avant du carter de virole TC et dans la cavité du carter du distributeur TP : ils ferment la séparation mécanique entre la section de combustion et la zone entre turbines.',
    k: [['Nombre', '1 ou 2 selon le SB'], ['Montage', 'face « PRESS » vers l\'arrière, cire d\'abeille à 6 h']] },
  ptvane: { g: 'pts', n: 'Distributeur de turbine de puissance', ref: 'AMM 72-50-03 · IPC 72-50-03 fig. 1 (rep. 60, 110) · OM 72-50-03 tabl. 601',
    d: 'Dix-neuf aubes coulées entre deux anneaux : elles orientent les gaz sortant de la turbine compresseur sur les aubes de la turbine de puissance. Avec le déflecteur, il forme le stator TP, à conserver si l\'on remplace la section de puissance (appariement des sections de passage avec le distributeur TC).',
    k: [['Aubes', '19'], ['Classe (PT6A-21)', '13,0–13,6'], ['Fissures bords d\'attaque et de fuite', '≤ 0,400 po']] },
  baffle: { g: 'pts', n: 'Déflecteur entre-étages', ref: 'AMM 72-50-03 · IPC 72-50-03 fig. 1 (rep. 70 à 130) · OM 72-50-03 tabl. 601',
    d: 'Cloison en tôle en double cône, rivetée (16 rivets) à l\'anneau intérieur du distributeur TP : elle sépare les deux disques. Ses lèvres avant et arrière forment des joints à labyrinthe avec les moyeux des deux turbines ; plaque d\'étanchéité centrale (6 rivets) et trois plaques de retenue du distributeur.',
    k: [['Jeu avec disque TC (réf. 273)', '0,037–0,043 po radial'], ['Jeu avec disque TP (réf. 382)', '0,0255–0,0315 po radial'], ['Rivets', '16 + 6'], ['Plaques de retenue', '3']] },
  t5: { g: 'pts', n: 'Sondes T5 et barre omnibus', ref: 'AMM 72-50-03 · AMM 77-20-01 · IPC 72-50-03 fig. 1',
    d: 'Huit thermocouples plongent entre la turbine compresseur et le distributeur TP pour mesurer la température entre turbines (T5) ; la barre omnibus les relie au faisceau. Au montage du distributeur, aucune sonde ne doit être alignée avec ses deux encoches rapprochées.',
    k: [['Sondes', '8 (post-SB1212)'], ['Positions', '1, 2, 3, 4, 8, 9, 10, 11 h'], ['Contrôle', 'essai fonctionnel après pose (AMM 77-20-01)']] },
  ptshroud: { g: 'pts', n: 'Virole de turbine de puissance', ref: 'AMM 72-50-05 fig. 201 · IPC 72-50-03 fig. 1 (rep. 150) · OM 72-50-03 tabl. 601',
    d: 'Anneau fretté dans le conduit d\'échappement devant la bride D, autour des talons à léchettes des aubes TP. Rectifié au besoin pour obtenir le jeu en bout avec l\'aube la plus longue ; on le dépose en le contractant à la glace carbonique.',
    k: [['Ø extérieur / conduit', '10,287–10,289 / 10,284–10,287 po'], ['Jeu radial en bout (réf. 342)', '0,016–0,028 po'], ['Écart max. entre aubes', '0,016 po']] },

  ptdisk: { g: 'pt', n: 'Turbine de puissance', ref: 'AMM 72-50-04 · IPC 72-50-04 fig. 2 (rep. 90 à 140) · OM 72-50-04',
    d: 'Disque et 41 aubes à talon cranté (bouts enveloppés à léchettes), chacune dans une rainure en sapin et retenue par un rivet tubulaire ; les talons s\'emboîtent et ne se déposent pas un à un. Cannelé sur l\'arrière de l\'arbre (cannelure maîtresse) ; jante d\'équilibrage arrière à masses classées rivetées, avec trois pattes pour la clé de maintien.',
    k: [['Aubes', '41 à talon cranté'], ['Rivets d\'aubes', '41 tubulaires'], ['Sens', 'horaire vu de l\'arrière'], ['Croissance diamétrale', 'rebut à + 0,003 po de la cote marquée']] },
  ptbolt: { g: 'pt', n: 'Boulon de retenue de la turbine de puissance', ref: 'AMM 72-50-04 fig. 201, 202 · IPC 72-50-04 fig. 2 (rep. 150, 160)',
    d: 'Boulon unique et rondelle-frein qui serrent le disque sur l\'arbre. Dépose : clé PWC30332 sur la bride D, manchon protecteur PWC30336, écarteur PWC30335 pour ouvrir les sertissages de la rondelle.',
    k: [['Serrage', '600–650 lb·po, desserrer, puis 500–550 lb·po (post-SB1459)'], ['Jeu boulon / disque', '0,003–0,007 po']] },
  ptshaft: { g: 'pt', n: 'Arbre de turbine de puissance', ref: 'AMM 72-50-04 · IPC 72-50-04 fig. 2 (rep. 10 à 60) · OM 72-50-04 tabl. 601',
    d: 'Arbre creux en acier : à l\'avant, bague de positionnement, accouplement du planétaire du 1er étage, rondelle à godet et écrou ; il tourne dans les paliers n° 4 (avant) et n° 3 (arrière) ; à l\'arrière, cannelures et deux portées de centrage du disque.',
    k: [['Ø au palier n° 4', '1,1812–1,1817 po'], ['Ø au palier n° 3', '1,5750–1,5758 po'], ['Portées du disque', 'Ø 1,1192–1,1200 et 1,2992–1,3000 po']] },
  housing: { g: 'pt', n: 'Logement d\'arbre de turbine de puissance', ref: 'AMM 72-50-04 · IPC 72-50-04 fig. 1 (rep. 10 à 150) · OM 72-50-04 tabl. 601',
    d: 'Cylindre en acier mécano-soudé boulonné (12 écrous) au carter arrière du réducteur, à la bride B. Il porte les bagues extérieures à bride des paliers n° 4 et n° 3, le tube d\'huile sous pression à quatre gicleurs, le tube de récupération (assiette cabrée) et, à l\'arrière, le joint d\'air fixe à labyrinthe retenu par un jonc.',
    k: [['Centrage dans le réducteur', 'Ø 5,2500–5,2510 po'], ['Alésages paliers n° 4 / n° 3', 'Ø 2,8349–2,8359 / 2,6774–2,6783 po'], ['Écrous à la bride B', '12'], ['Joint fixe', 'Ø int. 1,956–1,960 po']] },
  brg4: { g: 'pt', n: 'Palier n° 4 (billes)', ref: 'AMM 72-50-04 · IPC 72-50-04 fig. 2 (rep. 50) · OM 72-50-04 tabl. 601 réf. 230, 231',
    d: 'Roulement à billes à bague extérieure bridée (4 boulons et rondelles-freins) : il porte l\'avant de l\'arbre et en fixe la position axiale. Bague intérieure en deux moitiés serrée entre un épaulement de l\'arbre et la bague de positionnement ; la moitié avant a une gorge d\'extraction.',
    k: [['Ø ext. / logement', '2,8343–2,8346 po (jeu 0,0003–0,0016)'], ['Ø int. / arbre', '1,1809–1,1811 po (serré)'], ['Boulons de bride', '4']] },
  brg3: { g: 'pt', n: 'Palier n° 3 : bague intérieure et rouleaux', ref: 'AMM 72-50-04 · IPC 72-50-04 fig. 2 (rep. 70) · OM 72-50-04 tabl. 601 réf. 232',
    d: 'Roulement à rouleaux : la bague intérieure, avec rouleaux et cage, est positionnée par un épaulement de l\'arbre à l\'avant et par le joint d\'air tournant et le disque à l\'arrière. Elle sort avec l\'arbre.',
    k: [['Ø int. / arbre', '1,5746–1,5748 po (serré)'], ['Type', 'rouleaux cylindriques']] },
  brg3o: { g: 'pt', n: 'Palier n° 3 : bague extérieure à bride', ref: 'AMM 72-50-04 · OM 72-50-04 5.C(10), tabl. 601 réf. 233',
    d: 'Bague extérieure à bride boulonnée dans l\'alésage arrière du logement ; les rouleaux y coulissent, ce qui laisse l\'arbre se dilater.',
    k: [['Ø ext. / logement', '2,6769–2,6772 / 2,6774–2,6783 po'], ['Boulons de bride', '4']] },
  airseal: { g: 'pt', n: 'Joint d\'air tournant', ref: 'IPC 72-50-04 fig. 2 (rep. 80) · OM 72-50-04 tabl. 601 réf. 381, 383, 384',
    d: 'Bague à léchettes sur l\'arbre, entre la bague intérieure n° 3 et le disque : avec le joint fixe du logement, elle forme le labyrinthe qui empêche l\'huile de passer vers la zone des turbines.',
    k: [['Jeu radial (post-SB1474)', '0,0045–0,0075 po'], ['Ø sur l\'arbre', '1,5758–1,5767 po']] },
  cover3: { g: 'pt', n: 'Couvercle du palier n° 3', ref: 'AMM 72-50-04 fig. 204, 72-50-05 · IPC 72-50-04 fig. 1 (rep. 100 à 130) · OM tabl. 601 réf. 486, 496',
    d: 'Coupelle qui ferme l\'arrière du logement d\'arbre, retenue par un jonc (pré-SB1430) ; le cône intérieur du conduit s\'y appuie par un anneau de support. Après le SB1430, elle fait partie du conduit d\'échappement.',
    k: [['Retenue', 'jonc'], ['Jeu axial (réf. 496)', '0,0020–0,0260 po']] },

  ctshroud: { g: 'cts', n: 'Carter de virole de la turbine compresseur', ref: 'AMM 72-50-01 · IPC 72-50-01 fig. 1 (rep. 10 à 40) · OM 72-50-01 tabl. 601, 501',
    d: 'Carter prolongé vers l\'avant : gorge extérieure pour les segments d\'étanchéité entre-étages, alésage qui reçoit 16 segments de virole classés (rectifiés pour le jeu en bout d\'aube), tenus par un anneau de retenue riveté. Fixé au petit conduit de sortie par 12 boulons à double six-pans.',
    k: [['Segments', '16, classes 1 à 9 (0,042–0,083 po)'], ['Sur le petit conduit', 'Ø 9,338–9,341 po (0,001–0,004 po serré)'], ['Boulons', '12, 20–25 lb·po, freinés par paires']] },
  ctvane: { g: 'cts', n: 'Distributeur de turbine compresseur', ref: 'AMM 72-50-01 · IPC 72-50-01 fig. 1 (rep. 80) · OM 72-50-01 tabl. 601',
    d: 'Vingt-neuf aubes classées coulées entre deux anneaux, à passages internes d\'air de refroidissement. L\'anneau intérieur se prolonge vers l\'arrière par une plate-forme et une bride dont les pattes s\'engagent dans les encoches du couvercle du palier n° 2 ; l\'anneau extérieur centre le carter de virole et le petit conduit de sortie.',
    k: [['Aubes', '29, refroidies'], ['Jeu pattes / encoches du petit conduit', '0,002–0,005 po'], ['Jeu axial (réf. 489)', '0,002–0,010 po']] },
  lockplate: { g: 'cts', n: 'Plaque-frein et 16 boulons', ref: 'AMM 72-50-01 fig. 201 · IPC 72-50-01 fig. 1 (rep. 50 à 70) · OM tabl. 601 réf. 260',
    d: 'Plaque annulaire et 16 boulons à rondelles-freins qui serrent le distributeur TC, le couvercle du palier n° 2 et le grand conduit de sortie sur la bride interne du carter du générateur de gaz.',
    k: [['Boulons', '16, 36–40 lb·po'], ['Sur le couvercle n° 2', 'jeu 0,005–0,015 po'], ['Jeu latéral de l\'ensemble', '≤ 0,003 po']] },
  cover2: { g: 'cts', n: 'Couvercle du palier n° 2', ref: 'AMM 72-50-01 fig. 201, 203 · IPC 72-50-01 fig. 1 (rep. 100) · OM tabl. 601 réf. 261, 263',
    d: 'Coupelle qui ferme le logement du palier n° 2 derrière la turbine compresseur ; son alésage avant forme un joint à labyrinthe avec le disque. Sa bride porte les encoches où s\'engagent les pattes du distributeur TC. Dépose à l\'extracteur PWC30863.',
    k: [['Jeu avec disque TC (réf. 261)', '0,0225–0,0285 po radial'], ['Sur le carter GG (réf. 263)', '0,004 serré à 0,001 po'], ['Encoches', '8']] },

  ctdisk: { g: 'ct', n: 'Turbine compresseur', ref: 'AMM 72-50-02 · IPC 72-50-02 fig. 1 (rep. 10 à 70) · OM 72-50-02 tabl. 601',
    d: 'Cinquante-huit aubes à bout aminci (« squealer ») dans des rainures en sapin, retenues par des rivets à tête fraisée ; disque équilibré en deux plans (masses rivetées sur les flasques avant et arrière). Cannelé, avec cannelure maîtresse, sur l\'arbre avant du compresseur (module du générateur de gaz).',
    k: [['Aubes', '58'], ['Ø du rotor', '8,546–8,556 po (rebut 8,512)'], ['Jeu radial en bout (réf. 318)', '0,011–0,018 po'], ['Masses d\'équilibrage', '14 (40 rivets)'], ['Sens', 'antihoraire vu de l\'arrière']] },
  ctbolt: { g: 'ct', n: 'Boulon central de la turbine compresseur', ref: 'AMM 72-50-02 fig. 201 à 204 · IPC 72-50-02 fig. 1 (rep. 80, 90)',
    d: 'Boulon de bout d\'arbre et rondelle-frein qui serrent le disque sur l\'arbre avant du compresseur. Clé PWC30331 sur le carter GG, protecteur PWC30336, écarteur PWC30335 ; au desserrage, ne pas dépasser 150 lb·pi.',
    k: [['Serrage', '600–650 lb·po, desserrer, puis 500–550 lb·po (post-SB1439)'], ['Jeu boulon / disque', '0,003–0,007 po']] },

  smallduct: { g: 'ducts', n: 'Petit conduit de sortie', ref: 'AMM 72-50-00, 72-50-01 · IPC 72-50-01 fig. 1 (rep. 90) · OM 72-50-01 tabl. 601 réf. 250',
    d: 'Paroi intérieure du virage de 180° entre la chambre de combustion et le distributeur TC. Ses pattes centrent le distributeur ; le carter de virole y est boulonné.',
    k: [['Sous le carter de virole', 'Ø 9,340–9,342 po'], ['Virage des gaz', '180°']] },
  largeduct: { g: 'ducts', n: 'Grand conduit de sortie et bouclier thermique', ref: 'AMM 72-50-00, 72-50-01 · IPC 72-50-01 fig. 1 (rep. 110, 120) · AMM tabl. 203 réf. 484',
    d: 'Paroi extérieure du virage de 180° qui renvoie les gaz vers l\'avant, sur le distributeur TC. Alliage de nickel ; bouclier thermique à l\'arrière refroidi par de l\'air P3 ; bride extérieure (bande ondulée avant le SB1434, joint coulissant après) qui reçoit la paroi extérieure de la chambre.',
    k: [['Matériau', 'alliage de nickel'], ['Sur la chemise de chambre', 'Ø 15,945–15,955 po (jeu 0,020–0,040)'], ['Refroidissement', 'air P3 sous le bouclier']] }
};

/* =====================================================================
   CONSTRUCTION
   ===================================================================== */
const CASE = ['exh', 'blanket', 'boltsC', 'cring', 'flangeD', 'ptsh', 'sealrings', 't5', 'ptshroud', 'housing', 'cover3', 'ctshroud', 'lockplate', 'cover2', 'smallduct', 'largeduct'];
for (const id of Object.keys(INFO)) part(id, { kind: CASE.includes(id) ? 'case' : 'int' });
const spin = {};                                         // groupes tournants
function spinner(id) { const s = new THREE.Group(); PART[id].g.add(s); return (spin[id] = s); }

/* ---------- conduit d'échappement (brides A, C, D, sorties, entrée annulaire, cône intérieur) ---------- */
{
  const g = PART.exh.g;
  const mE = M('exh', { color: 0xa5957f, metalness: 0.85, roughness: 0.38 });
  const mEi = M('exh', { color: 0x9a8a74, metalness: 0.8, roughness: 0.45 });
  // sorties jumelles opposées (3 h et 9 h) : axe un peu incliné vers l'avant, alésage Ø 6,4 po (estimé)
  const RS = 3.2, SORTIES = [3, 9].map(h => ({ h, c: P(8.45, 18.3, h), n: RD(h).add(new THREE.Vector3(0, 0.17, 0)).normalize() }));
  // > 0 hors des alésages des sorties (seulement du côté de chaque sortie)
  const horsSorties = p => Math.min(...SORTIES.map(({ c, n }) => { const d = p.clone().sub(c), a = d.dot(n); return a < -3 * S ? 1 : d.addScaledVector(n, -a).length() / S - RS; }));
  // enveloppe : bride A -> tronc de cône -> bride C ; puis paroi arrière conique jusqu'à la bride D (fig. 1, OM réf. 238, 244)
  lathe('exh', ringPts(6.32, 6.92, 8.40, 8.48), mE, g, 120);                                    // bride A (Ø 12,62 sous le réducteur)
  const COQUE = [[6.86, 8.48], [6.95, 8.9], [7.15, 10.2], [7.35, 11.8], [7.5, 13.0], [8.0, 15.3], [8.45, 17.5], [8.85, 20.0], [9.1, 22.0], [9.25, 23.2], [9.3, 23.95]];
  const rCoque = z => { for (let i = 1; i < COQUE.length; i++) if (z <= COQUE[i][1]) { const [r0, z0] = COQUE[i - 1], [r1, z1] = COQUE[i]; return lerp(r0, r1, (z - z0) / (z1 - z0)); } return COQUE[COQUE.length - 1][0]; };
  g.add(new THREE.Mesh(percer(revolve(sheet(densifier(COQUE, 0.3), -0.07), 200), horsSorties), mE));   // tôle percée aux deux sorties
  lathe('exh', [[9.24, 23.95], [9.95, 23.95], [9.95, 24.25], [9.2, 24.25]], mE, g, 140);     // bride C (raccord du modèle complet r 9,95)
  // paroi arrière (entrée annulaire) : de la bride C à la bride D, relevée sur la coupe AMM 72-50-00 fig. 1
  lathe('exh', sheet([[9.22, 24.25], [8.6, 25.0], [7.85, 25.8], [7.05, 26.65], [6.35, 27.45], [5.8, 28.25], [5.42, 29.0], [5.2, 29.38], [5.17, 29.5], [5.17, 30.42]], 0.06), mE, g, 140);
  lathe('exh', ringPts(5.17, 5.62, 30.42, 30.5), mE, g, 120);                                 // bride D
  for (let i = 0; i < 16; i++) radialBox(g, mE, 0, 5.6, 5.86, 30.42, 30.5, 0.45, i * TAU / 16 + TAU / 32);   // pattes festonnées
  lathe('exh', ringPts(5.08, 5.22, 26.9, 27.05), mEi, g, 96);                                 // anneau de renfort (estimé)
  // cône intérieur et section intérieure : tunnel sec autour du logement d'arbre, bourrelet qui déverse les gaz vers les sorties
  lathe('exh', sheet([[6.4, 8.5], [5.65, 9.7], [5.05, 10.7], [4.8, 11.6], [4.15, 12.5], [3.35, 13.5], [3.12, 14.6], [3.12, 17.0], [3.4, 18.4], [4.2, 19.5],
    [5.2, 20.2], [5.7, 20.55], [5.2, 20.85], [4.45, 21.5], [4.0, 22.6], [3.75, 24.3], [3.45, 26.0], [3.0, 27.4], [2.62, 28.2], [2.42, 28.52]], 0.05), mEi, g, 120);
  lathe('exh', ringPts(2.3, 2.48, 28.48, 28.6), mEi, g, 72);                                  // anneau de support du couvercle n° 3
  // manchons des sorties, raccordés en selle sur la tôle (la partie sous la tôle est retirée), brides des tuyères
  // avion (Ø ≈ 6,5 po, 20 boulons — estimé) ; par les alésages, on voit le cône intérieur
  const horsCoque = p => Math.hypot(p.x, p.z) / S - (rCoque(Z0 - p.y / S) - 0.1);
  for (const { c, n } of SORTIES) {
    const hold = new THREE.Group(); hold.position.copy(c); hold.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); g.add(hold);
    const sg = new THREE.CylinderGeometry(RS * S, RS * S, 3.75 * S, 96, 40, true); sg.rotateX(Math.PI / 2); sg.translate(0, 0, (0.7 - 3.75 / 2) * S);
    sg.applyMatrix4(new THREE.Matrix4().compose(c, hold.quaternion, new THREE.Vector3(1, 1, 1)));
    g.add(new THREE.Mesh(percer(sg, horsCoque), mE));
    const pl = new THREE.Mesh(new THREE.RingGeometry(3.2 * S, 4.15 * S, 56), mE); pl.position.z = 0.7 * S; hold.add(pl);
    const pl2 = new THREE.Mesh(new THREE.RingGeometry(3.2 * S, 4.15 * S, 56), mE); pl2.position.z = 0.58 * S; hold.add(pl2);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(4.15 * S, 4.15 * S, 0.12 * S, 56, 1, true), mE); rim.rotation.x = Math.PI / 2; rim.position.z = 0.64 * S; hold.add(rim);
    const bg = new THREE.CylinderGeometry(0.17 * S, 0.17 * S, 0.2 * S, 6); bg.rotateX(Math.PI / 2);
    const ms = []; for (let i = 0; i < 20; i++) { const a = i * TAU / 20; ms.push(new THREE.Matrix4().makeTranslation(3.7 * S * Math.cos(a), 3.7 * S * Math.sin(a), 0.8 * S)); }
    inst(bg, ms, boltMat('exh'), hold, 'bolt');
  }
  // pattes de fixation du faisceau T5 (IPC rep. 20, 30, 80)
  for (const h of [1.5, 10.5]) radialBox(g, mEi, h, 9.28, 9.5, 23.3, 23.7, 0.4);
}
/* ---------- couverture isolante ---------- */
{
  const g = PART.blanket.g;
  const mB = M('blanket', { color: 0xc4c6c4, metalness: 0.75, roughness: 0.45, map: dimpleTex });
  lathe('blanket', sheet([[5.25, 9.95], [4.75, 10.8], [4.55, 11.7], [3.6, 12.6], [2.75, 13.3], [2.42, 14.2], [2.32, 15.5], [2.32, 22.6]], 0.08), mB, g, 96);
}
/* ---------- boulonnerie de la bride C ---------- */
{
  const g = PART.boltsC.g, mb = M('boltsC', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  const head = new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 0.17 * S, 6), shank = new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 0.85 * S, 8), nut = new THREE.CylinderGeometry(0.19 * S, 0.19 * S, 0.2 * S, 6);
  const mH = [], mS = [], mN = [];
  for (let i = 0; i < 36; i++) { const phi = i * TAU / 36 + TAU / 72; mH.push(axM(9.62, 23.86, phi)); mS.push(axM(9.62, 24.35, phi)); mN.push(axM(9.62, 24.8, phi)); }
  inst(head, mH, mb, g, 'bolt'); inst(shank, mS, mb, g, 'bolt'); inst(nut, mN, mb, g, 'bolt');
}

/* ---------- virole TP et anneau de rétention ---------- */
{
  const mS = M('ptshroud', { color: 0x9b9086, metalness: 0.8, roughness: 0.4 });
  lathe('ptshroud', [[5.01, 29.5], [5.14, 29.5], [5.14, 30.4], [5.01, 30.4], [5.01, 30.12], [5.04, 30.08], [5.04, 29.86], [5.01, 29.82]], mS, PART.ptshroud.g, 120);
  const mC = M('cring', { color: 0x7d746a, metalness: 0.75, roughness: 0.45 });
  lathe('cring', [[5.24, 29.6], [5.62, 29.45], [5.66, 29.5], [5.66, 30.38], [5.24, 30.38]], mC, PART.cring.g, 120);
  lathe('cring', ringPts(5.62, 5.7, 29.7, 30.2), M('cring', { color: 0x8a8074, metalness: 0.7, roughness: 0.45 }), PART.cring.g, 120);   // chemise de renfort (post-SB1427)
}
/* ---------- bride D : demi-bagues de montage et boulons à 1 h et 7 h ---------- */
{
  const g = PART.flangeD.g, mH = M('flangeD', { color: 0x938a7f, metalness: 0.75, roughness: 0.4 });
  for (const a0 of [0, Math.PI]) {
    const geo = new THREE.LatheGeometry(ringPts(5.3, 5.82, 30.58, 30.7).concat([[5.3, 30.58]]).map(([r, z]) => new THREE.Vector2(r * S, AY(z))), 64, a0 + 0.03, Math.PI - 0.06);
    g.add(new THREE.Mesh(geo, mH));
  }
  boltRing('flangeD', g, 5.56, 30.77, 2, 0.16, { phi0: clockPhi(1), h: 0.14 });
}
/* ---------- carter du distributeur TP ---------- */
{
  const g = PART.ptsh.g, mH = M('ptsh', { color: 0x8f8579, metalness: 0.8, roughness: 0.42 });
  lathe('ptsh', [[5.0, 30.38], [5.14, 30.38], [5.14, 30.5], [5.76, 30.5], [5.76, 30.58], [5.06, 30.58]], mH, g, 120);        // centrage et bride
  lathe('ptsh', sheet([[5.06, 30.58], [4.98, 30.9], [4.8, 31.25], [4.58, 31.7], [4.52, 31.95], [4.7, 31.95], [4.72, 32.44]], 0.06), mH, g, 120);
  lathe('ptsh', ringPts(4.46, 4.7, 31.93, 31.98), mH, g, 96);                                  // face d'appui des segments
  for (const h of [1, 2, 3, 4, 8, 9, 10, 11]) radialCyl(g, mH, h, 4.5, 4.86, 31.84, 0.2, 16);   // bossages T5
  for (let i = 0; i < 6; i++) radialBox(g, mH, 0, 4.88, 5.0, 30.62, 30.85, 0.35, i * TAU / 6 + 0.2);   // pattes d'indexage du distributeur
}
{ // segments d'étanchéité entre-étages (2)
  const g = PART.sealrings.g, mR = M('sealrings', { color: 0xb9b2a6, metalness: 0.85, roughness: 0.32 });
  for (const [z0, z1, a0] of [[32.16, 32.24, 0.3], [32.28, 32.36, 3.4]]) {
    const geo = new THREE.LatheGeometry(ringPts(4.45, 4.62, z0, z1).concat([[4.45, z0]]).map(([r, z]) => new THREE.Vector2(r * S, AY(z))), 72, a0, TAU - 0.04);
    g.add(new THREE.Mesh(geo, mR));
  }
}
/* ---------- distributeur TP (19 aubes) ---------- */
{
  const g = PART.ptvane.g, mV = M('ptvane', { color: 0x857a70, metalness: 0.8, roughness: 0.42 });
  // gaz reçu presque axial, rejeté vers l'horaire (sens de la turbine de puissance) ; creux vers l'horaire
  bladeRow(bladeGeo({ r0: 2.8, r1: 4.8, chord: 0.86, st0: 0.72, st1: 0.66, camber: -0.22, thick: 0.18 }), 19, mV, g, 30.68);
  lathe('ptvane', [[4.78, 30.3], [4.9, 30.3], [4.9, 30.6], [4.84, 30.62], [4.84, 31.06], [4.6, 31.5], [4.4, 31.95], [4.34, 31.95], [4.54, 31.5], [4.78, 31.04]], mV, g, 120);   // anneau extérieur et jupe
  lathe('ptvane', ringPts(2.7, 2.81, 30.3, 31.06), mV, g, 96);                                 // anneau intérieur
}
/* ---------- déflecteur entre-étages ---------- */
{
  const g = PART.baffle.g, mB = M('baffle', { color: 0x9a9088, metalness: 0.75, roughness: 0.45 }), mR = M('baffle', { color: 0xb5aca2, metalness: 0.85, roughness: 0.35 });
  lathe('baffle', sheet([[2.81, 31.06], [3.08, 32.42]], 0.05), mB, g, 96);                     // tôle extérieure (paroi du canal entre turbines)
  lathe('baffle', sheet([[2.8, 31.08], [1.6, 31.22], [0.8, 31.3]], 0.04), mB, g, 96);           // cône avant
  lathe('baffle', sheet([[3.06, 32.4], [1.8, 31.8], [0.8, 31.5]], 0.04), mB, g, 96);            // cône arrière
  lathe('baffle', [[0.745, 30.96], [0.82, 30.96], [0.82, 31.75], [0.745, 31.75], [0.745, 31.5], [0.79, 31.45], [0.79, 31.35], [0.745, 31.3]], mR, g, 64);   // lèvres avant / arrière (labyrinthes)
  lathe('baffle', [[0.0, 31.37], [0.8, 31.37], [0.8, 31.43], [0.0, 31.43]], mB, g, 48);         // plaque d'étanchéité centrale
  for (const h of [2, 6, 10]) radialBox(g, mR, h, 2.5, 2.88, 30.23, 30.3, 0.55);                // 3 plaques de retenue du distributeur
  const rv = []; for (let i = 0; i < 16; i++) rv.push(axM(2.76, 31.1, i * TAU / 16)); for (const h of [2, 6, 10]) for (const d of [-0.18, 0.18]) rv.push(axM(2.62, 30.2, clockPhi(h) + d / 2.62));
  inst(new THREE.CylinderGeometry(0.05 * S, 0.05 * S, 0.06 * S, 8), rv, mR, g);
}
/* ---------- sondes T5 et barre omnibus ---------- */
{
  const g = PART.t5.g, mT = M('t5', { color: 0xc8a35c, metalness: 0.85, roughness: 0.35 }), mK = M('t5', { color: 0xb9bdc0, metalness: 0.85, roughness: 0.3 });
  for (const h of [1, 2, 3, 4, 8, 9, 10, 11]) {
    radialCyl(g, mK, h, 3.75, 4.88, 31.84, 0.075, 10);                                        // gaine plongeante
    radialCyl(g, mT, h, 4.86, 5.08, 31.84, 0.17, 6);                                          // écrou de sonde
    radialCyl(g, mT, h, 5.08, 5.3, 31.84, 0.09, 8);                                           // borne
  }
  const bb = new THREE.Mesh(new THREE.TorusGeometry(5.36 * S, 0.07 * S, 8, 120, TAU * 0.9), mT); bb.rotation.x = Math.PI / 2; bb.rotation.z = clockPhi(5.6) - Math.PI / 2; bb.position.y = AY(31.84); g.add(bb);
  radialCyl(g, mT, 5.6, 5.36, 6.1, 31.84, 0.12, 10);                                          // sortie vers le faisceau
}

/* ---------- turbine de puissance : disque, 41 aubes à talon, jante d'équilibrage ---------- */
{
  const s = spinner('ptdisk'), mD = M('ptdisk', { color: 0xa39a90, metalness: 0.9, roughness: 0.3 }), mBl = M('ptdisk', { color: 0xa79e94, metalness: 0.9, roughness: 0.3 });
  const mW = M('ptdisk', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  lathe('ptdisk', [[0.65, 28.66], [0.91, 28.66], [0.91, 29.1], [1.1, 29.12], [1.6, 29.5], [2.0, 29.6], [2.62, 29.6], [2.62, 30.32], [2.0, 30.32], [1.75, 30.1], [1.75, 30.44],
    [1.62, 30.44], [1.62, 30.06], [1.1, 30.18], [0.9, 30.3], [0.716, 30.3], [0.716, 31.2], [0.6, 31.2], [0.6, 30.3], [0.56, 30.3], [0.56, 29.75], [0.65, 29.7]], mD, s, 96);
  // rotor TP (horaire) : renvoie le gaz vers l'antihoraire ; creux et bord de fuite vers l'antihoraire
  bladeRow(bladeGeo({ r0: 2.62, r1: 4.88, chord: 0.74, st0: -0.3, st1: -0.45, camber: 0.32, thick: 0.17 }), 41, mBl, s, 29.96);
  { const pg = new THREE.BoxGeometry(0.1 * S, 0.7 * S, (TAU * 2.66 / 41) * 0.97 * S); pg.translate(2.67 * S, 0, 0); bladeRow(pg, 41, mD, s, 29.96); }   // plates-formes
  // talons crantés à double léchette : 41 segments séparés par l'encoche
  bladeRow(arcGeo([[4.86, 29.7], [4.93, 29.7], [4.93, 29.76], [4.99, 29.8], [4.93, 29.84], [4.93, 30.06], [4.99, 30.1], [4.93, 30.14], [4.93, 30.22], [4.86, 30.22], [4.86, 29.7]], 0.93, 41, 29.96), 41, mBl, s, 29.96, TAU / 82);
  // rivets tubulaires des aubes (41) et masses d'équilibrage rivetées sur la jante
  { const rv = []; for (let i = 0; i < 41; i++) rv.push(axM(2.4, 29.58, i * TAU / 41)); inst(new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 0.05 * S, 8), rv, mW, s); }
  { const wt = []; for (const a of [0.4, 0.55, 2.3, 3.9, 4.05, 5.6]) wt.push(radM(1.56, 30.3, a)); inst(new THREE.BoxGeometry(0.28 * S, 0.1 * S, 0.22 * S), wt, mW, s); }
  { const lg = []; for (let k = 0; k < 3; k++) lg.push(radM(1.56, 30.38, k * TAU / 3 + 1.0)); inst(new THREE.BoxGeometry(0.22 * S, 0.12 * S, 0.12 * S), lg, mD, s); }  // 3 pattes de la clé PWC30332
}
{ // boulon de retenue et rondelle-frein
  const s = spinner('ptbolt'), mB = M('ptbolt', { color: 0xc8ccce, metalness: 0.9, roughness: 0.28 }), mK = M('ptbolt', { color: 0xb4b9bc, metalness: 0.85, roughness: 0.32 });
  const hd = new THREE.CylinderGeometry(0.42 * S, 0.42 * S, 0.28 * S, 6); hd.translate(0, AY(30.62), 0); s.add(new THREE.Mesh(hd, mB));
  lathe('ptbolt', [[0.0, 29.0], [0.3, 29.0], [0.3, 30.48], [0.0, 30.48]], mB, s, 24);
  lathe('ptbolt', ringPts(0.3, 0.55, 30.42, 30.48), mK, s, 32);
  for (let k = 0; k < 4; k++) radialBox(s, mK, 0, 0.42, 0.56, 30.48, 30.6, 0.12, k * TAU / 4);   // sertissages
}
/* ---------- arbre de turbine de puissance ---------- */
{
  const s = spinner('ptshaft'), mA = M('ptshaft', { color: 0x8d949a, metalness: 0.9, roughness: 0.3 }), mR = M('ptshaft', { color: 0xb3b9bd, metalness: 0.9, roughness: 0.28 });
  // avant : alésage r 0,63 qui reçoit l'embout de l'accouplement du réducteur (pièce 'input', z 14,65–16,4)
  lathe('ptshaft', [[0.63, 14.7], [0.8, 14.7], [0.8, 15.85], [0.86, 15.85], [0.86, 27.15], [0.79, 27.15], [0.79, 28.66], [0.65, 28.66], [0.65, 29.7], [0.56, 29.75],
    [0.56, 30.3], [0.3, 30.3], [0.3, 28.7], [0.45, 28.5], [0.45, 16.6], [0.63, 16.5]], mA, s, 48);
  lathe('ptshaft', ringPts(0.8, 1.04, 14.72, 14.98), mR, s, 48);                               // bague de positionnement
  const sp = new THREE.BoxGeometry(0.07 * S, 0.06 * S, 0.9 * S), ms = []; for (let i = 0; i < 24; i++) ms.push(radM(0.67, 29.2, i * TAU / 24)); inst(sp, ms, mA, s);   // cannelures du disque
}
/* ---------- logement d'arbre, paliers, joints ---------- */
{
  const g = PART.housing.g, mH = M('housing', { color: 0x7f878c, metalness: 0.7, roughness: 0.4 }), mT = M('housing', { color: 0xb2b8bc, metalness: 0.85, roughness: 0.3 });
  const mSeal = M('housing', { color: 0xb9a98e, metalness: 0.8, roughness: 0.4 });
  lathe('housing', [[1.3, 12.85], [2.75, 12.85], [2.75, 13.08], [1.75, 13.08], [1.75, 26.85], [1.98, 27.0], [1.98, 28.6], [1.12, 28.6], [1.12, 28.0], [1.339, 27.92],
    [1.339, 27.2], [1.5, 27.05], [1.5, 15.85], [1.417, 15.85], [1.417, 14.95], [1.62, 14.95], [1.62, 13.3], [1.3, 13.2]], mH, g, 96);
  boltRing('housing', g, 2.3, 13.16, 12, 0.15, { h: 0.16, phi0: TAU / 24 });                  // 12 écrous sur les goujons de la bride B
  lathe('housing', [[0.979, 28.02], [1.12, 28.02], [1.12, 28.56], [0.979, 28.56], [0.979, 28.48], [1.02, 28.45], [1.02, 28.13], [0.979, 28.1]], mSeal, g, 64);   // joint d'air fixe
  lathe('housing', ringPts(1.1, 1.14, 28.56, 28.6), mT, g, 48);                                // jonc de retenue
  axialCyl(g, mT, 1.25, 0, 0.07, 15.95, 27.0, 10);                                           // tube d'huile sous pression (gicleurs n° 3 et 4)
  axialCyl(g, mT, 1.92, 6, 0.09, 13.1, 26.9, 10);                                            // tube de récupération (6 h)
}
{
  bearing('brg4', spinner('brg4'), PART.brg4.g, 0.8, 1.417, 15.05, 15.8, 12, false, { flange: 1.6, fz0: 14.95, fz1: 15.05 });
  const s3 = spinner('brg3');
  bearing('brg3', s3, null, 0.79, 1.339, 27.2, 27.9, 16, true, { gEl: s3 });
  bearing('brg3o', null, PART.brg3o.g, 0.79, 1.339, 27.2, 27.9, 16, true, { flange: 1.45, fz0: 27.05, fz1: 27.2, gEl: null });
}
{ // joint d'air tournant (3 léchettes)
  const s = spinner('airseal'), mR = M('airseal', { color: 0xc3c7ca, metalness: 0.9, roughness: 0.25 });
  lathe('airseal', [[0.79, 27.92], [0.93, 27.92], [0.93, 28.12], [0.973, 28.16], [0.93, 28.2], [0.93, 28.28], [0.973, 28.32], [0.93, 28.36], [0.93, 28.44], [0.973, 28.48], [0.93, 28.52], [0.93, 28.64], [0.79, 28.64]], mR, s, 64);
}
{ // couvercle du palier n° 3 (pré-SB1430)
  const mC = M('cover3', { color: 0x8a9196, metalness: 0.7, roughness: 0.4 });
  lathe('cover3', sheet([[1.14, 28.68], [1.95, 28.68], [2.3, 28.6]], 0.06), mC, PART.cover3.g, 96);
}

/* ---------- turbine compresseur : disque, 58 aubes, masses, bout d'arbre ---------- */
{
  const s = spinner('ctdisk'), mD = M('ctdisk', { color: 0x9e958c, metalness: 0.9, roughness: 0.3 }), mBl = M('ctdisk', { color: 0x8f857a, metalness: 0.88, roughness: 0.34 });
  const mW = M('ctdisk', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  lathe('ctdisk', [[0.56, 32.45], [0.62, 32.45], [0.62, 31.55], [0.705, 31.55], [0.705, 32.35], [1.15, 32.45], [1.6, 32.62], [2.0, 32.62], [2.0, 32.38], [2.15, 32.38], [2.15, 32.62],
    [2.35, 32.62], [2.45, 32.5], [3.14, 32.5], [3.14, 33.2], [2.45, 33.2], [2.35, 32.98], [2.15, 32.98], [2.15, 33.22], [2.0, 33.22], [2.0, 32.98], [1.62, 32.98],
    [1.62, 33.55], [1.5, 33.55], [1.5, 33.02], [1.15, 33.5], [0.65, 33.5], [0.65, 33.0], [0.56, 33.0]], mD, s, 96);
  // rotor TC (antihoraire) : renvoie le gaz vers l'horaire ; creux et bord de fuite vers l'horaire
  bladeRow(bladeGeo({ r0: 3.14, r1: 4.2, chord: 0.66, st0: 0.38, st1: 0.48, camber: -0.33, thick: 0.18 }), 58, mBl, s, 32.85);
  // bouts « squealer » : liseré aminci au bout de l'aube
  bladeRow(bladeGeo({ r0: 4.2, r1: 4.255, chord: 0.66, st0: 0.48, st1: 0.48, camber: -0.33, thick: 0.07 }), 58, mBl, s, 32.85);
  { const pg = new THREE.BoxGeometry(0.08 * S, 0.68 * S, (TAU * 3.15 / 58) * 0.97 * S); pg.translate(3.18 * S, 0, 0); bladeRow(pg, 58, mD, s, 32.85); }
  { const rv = []; for (let i = 0; i < 58; i++) rv.push(axM(2.85, 32.48, i * TAU / 58)); inst(new THREE.CylinderGeometry(0.05 * S, 0.05 * S, 0.05 * S, 8), rv, mW, s); }
  { const wt = []; for (let i = 0; i < 7; i++) { wt.push(radM(2.2, 32.5, i * 0.9 + 0.2)); wt.push(radM(2.2, 33.1, i * 0.9 + 0.65)); } inst(new THREE.BoxGeometry(0.3 * S, 0.1 * S, 0.2 * S), wt, mW, s); }   // 14 masses
  // l'arbre avant du compresseur, sur lequel le disque est cannelé, est dans le module du générateur de gaz (pt6a21-gg.js)
}
{ // boulon central et rondelle-frein
  const s = spinner('ctbolt'), mB = M('ctbolt', { color: 0xc8ccce, metalness: 0.9, roughness: 0.28 }), mK = M('ctbolt', { color: 0xb4b9bc, metalness: 0.85, roughness: 0.32 });
  const hd = new THREE.CylinderGeometry(0.42 * S, 0.42 * S, 0.3 * S, 6); hd.translate(0, AY(32.07), 0); s.add(new THREE.Mesh(hd, mB));
  lathe('ctbolt', [[0.0, 32.2], [0.31, 32.2], [0.31, 34.6], [0.0, 34.6]], mB, s, 24);
  lathe('ctbolt', ringPts(0.31, 0.55, 32.22, 32.28), mK, s, 32);
  for (let k = 0; k < 4; k++) radialBox(s, mK, 0, 0.42, 0.56, 31.98, 32.22, 0.12, k * TAU / 4 + 0.4);
}
/* ---------- carter de virole TC, 16 segments, anneau de retenue, 12 boulons ---------- */
{
  const g = PART.ctshroud.g, mH = M('ctshroud', { color: 0x8f8579, metalness: 0.8, roughness: 0.42 }), mSg = M('ctshroud', { color: 0xa69c90, metalness: 0.8, roughness: 0.38 });
  lathe('ctshroud', [[4.4, 32.05], [4.52, 32.05], [4.52, 32.13], [4.43, 32.13], [4.43, 32.4], [4.6, 32.42], [4.76, 32.75], [4.76, 33.75], [5.05, 33.75], [5.05, 33.92],
    [4.72, 33.92], [4.72, 33.4], [4.395, 33.35], [4.395, 32.45], [4.4, 32.3]], mH, g, 120);
  // 16 segments classés (alésage rectifié Ø ≈ 8,56 po)
  bladeRow(arcGeo([[4.275, 32.45], [4.395, 32.45], [4.395, 33.3], [4.275, 33.3], [4.275, 32.45]], 0.985, 16, 32.875), 16, mSg, g, 32.875, TAU / 32);
  lathe('ctshroud', ringPts(4.3, 4.395, 32.36, 32.45), mH, g, 96);                             // anneau de retenue riveté
  boltRing('ctshroud', g, 4.9, 33.68, 12, 0.13, { h: 0.14, phi0: TAU / 24 });                   // 12 boulons à double six-pans
  boltRing('ctshroud', g, 4.9, 33.55, 12, 0.13, { h: 0.12, phi0: TAU / 24 });
}
/* ---------- distributeur TC (29 aubes refroidies) ---------- */
{
  const g = PART.ctvane.g, mV = M('ctvane', { color: 0x8a7e72, metalness: 0.8, roughness: 0.4 });
  // bord d'attaque parallèle à l'axe, gaz rejeté vers l'antihoraire ; creux vers l'antihoraire
  bladeRow(bladeGeo({ r0: 3.32, r1: 4.22, chord: 0.88, st0: -0.62, st1: -0.66, camber: 0.3, thick: 0.22 }), 29, mV, g, 33.6);
  lathe('ctvane', ringPts(4.22, 4.32, 33.2, 34.1), mV, g, 120);                                // anneau extérieur
  lathe('ctvane', [[3.22, 33.2], [3.32, 33.2], [3.32, 35.5], [3.42, 35.5], [3.42, 35.66], [2.68, 35.66], [2.68, 35.56], [3.22, 35.56]], mV, g, 120);   // anneau intérieur, plate-forme, bride
  for (let k = 0; k < 8; k++) radialBox(g, mV, 0, 2.56, 2.7, 35.56, 35.66, 0.3, k * TAU / 8 + TAU / 16);   // 8 pattes (encoches du couvercle n° 2)
}
/* ---------- plaque-frein et 16 boulons ---------- */
{
  const g = PART.lockplate.g, mL = M('lockplate', { color: 0xa2a8ac, metalness: 0.8, roughness: 0.35 });
  lathe('lockplate', ringPts(2.66, 3.3, 35.48, 35.56), mL, g, 96);
  boltRing('lockplate', g, 2.98, 35.42, 16, 0.12, { h: 0.12 });
  const tb = []; for (let i = 0; i < 16; i++) tb.push(radM(3.2, 35.46, i * TAU / 16)); inst(new THREE.BoxGeometry(0.16 * S, 0.22 * S, 0.04 * S), tb, mL, g);   // rondelles à languette
}
/* ---------- couvercle du palier n° 2 ---------- */
{
  const mC = M('cover2', { color: 0x8a9196, metalness: 0.7, roughness: 0.4 });
  lathe('cover2', [[1.625, 33.3], [1.72, 33.3], [1.72, 33.55], [2.5, 33.55], [2.5, 35.66], [3.35, 35.66], [3.35, 35.74], [2.65, 35.74], [2.65, 36.0], [2.4, 36.05],
    [2.4, 33.65], [1.625, 33.65]], mC, PART.cover2.g, 96);
}
/* ---------- conduits de sortie (virage de 180°) ---------- */
{
  // petit conduit : de la paroi intérieure de la chambre (raccord du modèle complet, r 7,05) au carter de virole TC
  const g = PART.smallduct.g, mS = M('smallduct', { color: 0xa39076, metalness: 0.8, roughness: 0.42 });
  lathe('smallduct', sheet([[7.05, 35.5], [7.0, 35.85], [6.75, 36.15], [6.2, 36.38], [5.5, 36.42], [5.0, 36.22], [4.73, 35.8], [4.66, 35.2], [4.66, 33.4]], 0.06), mS, g, 120);
  lathe('smallduct', [[4.32, 33.35], [4.66, 33.35], [4.66, 33.48], [4.32, 33.48]], mS, g, 96);   // lèvre de centrage du distributeur
  lathe('smallduct', ringPts(4.66, 5.05, 33.92, 34.02), mS, g, 120);                            // bride (12 boulons)
  for (let k = 0; k < 16; k++) radialBox(g, mS, 0, 4.32, 4.4, 33.48, 33.7, 0.18, k * TAU / 16);  // 16 pattes de centrage
}
{
  // grand conduit : de la paroi extérieure de la chambre (raccord r 8,7) à la plate-forme du distributeur ; bouclier thermique à l'arrière
  const g = PART.largeduct.g, mL = M('largeduct', { color: 0xa39076, metalness: 0.8, roughness: 0.42 }), mHs = M('largeduct', { color: 0x9a8670, metalness: 0.8, roughness: 0.45 });
  lathe('largeduct', sheet([[8.7, 36.4], [8.85, 37.0], [8.6, 37.6], [7.9, 38.05], [6.9, 38.3], [5.8, 38.3], [4.8, 38.0], [4.0, 37.4], [3.55, 36.6], [3.45, 35.9], [3.45, 35.74]], -0.06), mL, g, 120);
  lathe('largeduct', ringPts(2.7, 3.45, 35.74, 35.82), mL, g, 96);                              // bride intérieure
  lathe('largeduct', sheet([[8.25, 38.15], [7.0, 38.52], [5.8, 38.52], [4.75, 38.2], [4.2, 37.75]], 0.05), mHs, g, 120);   // bouclier thermique (air P3)
}

/* =====================================================================
   ROTATION
   ===================================================================== */
const rotNg = [spin.ctdisk, spin.ctbolt];
const rotNf = [spin.ptdisk, spin.ptbolt, spin.ptshaft, spin.brg4, spin.brg3, spin.airseal];
function update(aNg, aNf) {
  for (const s of rotNg) s.rotation.y = aNg;
  for (const s of rotNf) s.rotation.y = aNf;
}

/* =====================================================================
   DÉMONTAGE : AMM 72-50-01 à -05, OM 72-50 (section de puissance séparée à la bride C)
   ===================================================================== */
const POWER = ['exh', 'blanket', 'cring', 'flangeD', 'ptsh', 'sealrings', 'ptvane', 'baffle', 't5', 'ptshroud', 'ptdisk', 'ptbolt', 'ptshaft', 'housing', 'brg4', 'brg3', 'brg3o', 'airseal', 'cover3'];
const STEPS = [
  { t: 'Séparer la section de puissance du générateur de gaz à la bride C', r: 'AMM 72-00-00 · AMM 72-50-03 5.A(1)', m: [[['boltsC'], { dz: 3, dr: 1.5 }], [POWER, { dz: 9 }]],
    d: 'Boulons de la bride C déposés ; la section de puissance (avec le réducteur) est posée sur son support, turbine de puissance vers le haut (embase PWC32179).' },
  { t: 'Déposer le faisceau T5, la barre omnibus et les huit sondes T5', r: 'AMM 72-50-03 5.A(2) · AMM 77-20-01', m: [[['t5'], { dr: 3 }]],
    d: 'Couper le fil à freiner. Pour le PT6A-21, la barre omnibus peut rester en place si elle n\'est pas à remplacer.' },
  { t: 'Retirer l\'anneau de rétention et les segments d\'étanchéité entre-étages', r: 'AMM 72-50-03 5.A(2)', m: [[['cring'], { dz: -3 }], [['sealrings'], { dz: -4 }]],
    d: 'Repérer au marqueur la position des coupes des segments sur le carter avant dépose (pré-SB1218).' },
  { t: 'Déposer les deux boulons (1 h et 7 h) et les deux demi-bagues de la bride D', r: 'AMM 72-50-03 5.A(3)', m: [[['flangeD'], { dz: -2, dr: 1.5 }]],
    d: 'Au remontage : goupilles d\'alignement PWC32212, boulons 32–36 lb·po freinés au fil.' },
  { t: 'Extraire le carter du distributeur TP avec le distributeur et le déflecteur', r: 'AMM 72-50-03 5.A(4)', m: [[['ptsh', 'ptvane', 'baffle'], { dz: -5 }]],
    d: 'Tirer sur les aubes du distributeur, sans toucher les sondes T5. Garder le distributeur avec la section de puissance (appariement avec le distributeur TC).' },
  { t: 'Soulever le carter du distributeur TP de l\'ensemble distributeur et déflecteur', r: 'AMM 72-50-03 5.A(5)', m: [[['ptsh'], { dz: -3 }]],
    d: 'Ensemble posé sur l\'établi, bords d\'attaque des aubes vers le haut.' },
  { t: 'Débloquer la rondelle-frein et déposer le boulon de retenue de la turbine de puissance', r: 'AMM 72-50-04 5.A(3)–(7)', m: [[['ptbolt'], { dz: -3 }]],
    d: 'Clé PWC30332 sur la bride D (fentes sur les pattes de la jante d\'équilibrage), manchon PWC30336, écarteur PWC30335.' },
  { t: 'Extraire le disque de la turbine de puissance', r: 'AMM 72-50-04 5.A(8)', m: [[['ptdisk'], { dz: -4 }]],
    d: 'Extracteur PWC30403. La cannelure maîtresse garantit le remontage dans la même position (équilibrage).' },
  { t: 'Retirer le jonc et le couvercle du palier n° 3', r: 'AMM 72-50-04 5.A(9) · AMM 72-50-05 5.A(5)', m: [[['cover3'], { dz: -3 }]],
    d: 'Pré-SB1430 seulement ; après le SB1430 le couvercle fait partie du conduit d\'échappement.' },
  { t: 'Déposer le conduit d\'échappement (avec la virole TP), puis en retirer la couverture isolante', r: 'AMM 72-50-05 5.A(6)–(9)', m: [[['exh', 'ptshroud'], { dz: -6 }], [['blanket'], { dz: -3 }]],
    d: 'Écrous, boulons et ferrure de levage de la bride A déposés, sans séparer les carters du réducteur. Virole déposée seulement si le conduit est rebuté (glace carbonique).' },
  { t: 'Séparer le logement d\'arbre de la turbine de puissance du réducteur (bride B)', r: 'OM 72-01 · OM 72-50-04 5.C(1)', m: [[['housing', 'ptshaft', 'brg4', 'brg3', 'brg3o', 'airseal'], { dz: -4 }]],
    d: '12 écrous. Ensemble monté sur le support PWC30560 ; planétaire, écrou, rondelle à godet et accouplement déposés de l\'avant de l\'arbre.' },
  { t: 'Retirer l\'arbre avec le palier n° 4, la bague intérieure du n° 3 et le joint tournant, puis la bague extérieure du n° 3', r: 'OM 72-50-04 5.C(5)–(10)', m: [[['ptshaft', 'brg4', 'brg3', 'airseal'], { dz: 4 }], [['brg3o'], { dz: -2 }]],
    d: 'Quatre boulons et rondelles-freins de la bride du palier n° 4 ; extracteurs PWC30473 (n° 4) et PWC30489 (n° 3). Le joint d\'air fixe reste dans le logement.' },
  { t: 'Déposer le boulon central et extraire la turbine compresseur', r: 'AMM 72-50-02 5.A(5)–(13)', m: [[['ctbolt'], { dz: 3 }], [['ctdisk'], { dz: 4.5 }]],
    d: 'Clé PWC30331 sur le carter GG, protecteur PWC30336, écarteur PWC30335 ; desserrage 50–100 lb·pi, jamais plus de 150 lb·pi. Extracteur PWC30403.' },
  { t: 'Déposer d\'un bloc plaque-frein, distributeur TC, carter de virole et petit conduit de sortie', r: 'AMM 72-50-01 5.A(4)–(6)', m: [[['lockplate', 'ctvane', 'ctshroud', 'smallduct'], { dz: 4 }]],
    d: 'Après dépose de la chambre de combustion (AMM 72-40-01). Repérer le distributeur par rapport au couvercle du palier n° 2 ; 16 boulons et rondelles à languette.' },
  { t: 'Extraire le couvercle du palier n° 2', r: 'AMM 72-50-01 5.A(7)', m: [[['cover2'], { dz: 3 }]],
    d: 'Extracteur PWC30863 (ou vérins PWC42034 post-SB1231) ; ne pas déranger le joint d\'air fixe ni le joint plat du palier n° 2. Le grand conduit de sortie se dépose ensuite du carter GG.' },
  { t: 'Séparer le carter de virole du petit conduit, retirer les segments et le distributeur', r: 'AMM 72-50-01 5.A(9)–(12) · OM 72-50-01 5.B', m: [[['ctshroud'], { dz: 2.5 }], [['smallduct'], { dz: -2 }]],
    d: 'Repérer distributeur, petit conduit et carter ; 12 boulons à double six-pans. Ne démonter les segments que s\'ils sont à remplacer.' }
];
// vue éclatée sur l'axe (pt6a21-eclate.js) : grand conduit de sortie fixe ; section de puissance vers l'avant
const ANCRE = 'largeduct';
const ORDRE = ['brg4', 'ptshaft', 'brg3', 'airseal', 'housing', 'brg3o', 'blanket', 'exh', 'ptshroud', 'cover3', 'ptdisk', 'ptbolt', 'ptvane', 'baffle', 'ptsh',
  'flangeD', 'sealrings', 'cring', 't5', 'boltsC', 'ctbolt', 'ctdisk', 'ctshroud', 'ctvane', 'smallduct', 'lockplate', 'cover2', 'largeduct'];
const ORB = {}, HOST = {};

update(0, 0);
return { root, Z0, S, PART, ORDER, INFO, GROUPS, STEPS, ORDRE, ANCRE, ORB, HOST, P, update, rotNg, rotNf };
};
