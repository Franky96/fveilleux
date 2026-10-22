/* =====================================================================
   Générateur de gaz PT6A-21 (chapitre 72-30) — modèle 3D détaillé, monté dans le modèle complet (pt6a21.html)
   Sources : AMM 72-30-00 (description, fig. 1 « coupe du générateur de gaz »), AMM 72-30-01, -02, -04, -05,
   IPC 72-30-01 à -05 (pare-feu, carter du générateur de gaz, rotor du compresseur post-SB1113, fig. 3),
   OM 72-30-00 5.A à 5.L (démontage du générateur de gaz), OM 72-30-05 5.A (démontage du rotor, PT6A-21),
   OM 72-30-00 et 72-30-04 tabl. 601 « Fits and Clearances ».
   Unités : pouces. z = distance vers l'arrière depuis la face de la bride d'hélice (même origine que le modèle complet),
   r = rayon, h = position horaire vue de l'arrière (12 h en haut). 1 unité = 10 po : pt6a21.html met le groupe à
   l'échelle ½ et place son point z = Z0 sur l'axe (même Z0 que pt6a21-turbines.js).

   Cotes : diamètres des tableaux 601 (paliers, joints à labyrinthe, centrages du carter d'entrée, du stator du
   1er étage et du carter du rouet) ; stations z et rayons des aubages, de la chambre et de l'entrée d'air repris
   du modèle complet ; raccords imposés par le module des turbines (couvercle du palier n° 2, plaque-frein, conduits
   de sortie, turbine compresseur cannelée sur l'arbre avant). Les cotes estimées sont signalées « estimé ».

   const G = construireGG(THREE)
   G.root                 groupe à ajouter (axe local Y = axe moteur, avant = +Y), non tourné, non mis à l'échelle
   G.PART[id], G.ORDER    pièces (groupe, matériaux, kind 'case' = pièce fixe coupée en mode coupe)
   G.INFO[id], GROUPS     fiches des pièces et leurs familles
   G.STEPS, ORDRE, ANCRE  démontage (OM 72-30-00 et 72-30-05) et vue éclatée sur l'axe (pt6a21-eclate.js) ;
                          les étapes E et F de l'OM déposent des pièces du module des turbines (TB_IDS)
   G.update(aNg)          angle du rotor du générateur de gaz
   ===================================================================== */
window.construireGG = function (THREE) {
'use strict';

const S = 0.1, TAU = Math.PI * 2, Z0 = 28;
const AY = z => (Z0 - z) * S;                          // axe local Y : avant = +Y
const clockPhi = h => (h / 12) * TAU + Math.PI / 2;
const P = (r, z, h = 0) => { const f = clockPhi(h); return new THREE.Vector3(r * S * Math.sin(f), AY(z), r * S * Math.cos(f)); };
const Pf = (r, z, f) => new THREE.Vector3(r * S * Math.sin(f), AY(z), r * S * Math.cos(f));   // angle en radians
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
// révolution avec coordonnées de texture (grille, perforations)
function latheUV(pts, mat, parent, segs = 120, a0 = 0, da = TAU) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(Math.max(1e-4, r * S), AY(z))), segs, a0, da), mat);
  parent.add(m); return m;
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
function tubeMesh(parent, mat, ptsRZH, rad, seg = 80) {      // tube le long de points (r, z, h)
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ptsRZH.map(([r, z, h]) => P(r, z, h))), seg, rad * S, 8), mat);
  parent.add(m); return m;
}
// textures procédurales sans DOM
function dataTex(w, h, f, rx, ry) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}
const meshTex = dataTex(32, 32, (x, y) => (x % 8 < 2 || y % 8 < 2) ? 255 : 0, 150, 14);     // grillage de la grille d'entrée
const holeTex = dataTex(64, 64, (x, y) => {                                                    // trous de dilution et de refroidissement
  for (const [y0, rad, n, dx] of [[7, 3.2, 4, 0], [21, 1.8, 7, 0.5], [36, 4.2, 3, 0], [50, 2.2, 6, 0.5]])
    for (let i = 0; i < n; i++) { const cx = (i + 0.5 + dx) * 64 / n; if (Math.hypot(((x - cx + 96) % 64) - 32, y - y0) < rad) return 0; }
  return 255;
}, 18, 1);

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
function platforms(r, chord, n, thick, mat, parent, z) {     // plates-formes des aubes
  const g = new THREE.BoxGeometry(thick * S, chord * S, (TAU * r / n) * 0.97 * S); g.translate(r * S, 0, 0);
  return bladeRow(g, n, mat, parent, z);
}

/* ---------- roulement : bague intérieure (et éléments) dans le groupe tournant, bague extérieure fixe ---------- */
function bearing(id, gIn, gOut, rIn, rOut, z0, z1, n, roller, o = {}) {
  const mR = M(id, { color: 0xdadddf, metalness: 1, roughness: 0.18 });
  const w = z1 - z0, t = (rOut - rIn) * 0.2, zm = (z0 + z1) / 2;
  if (gIn) lathe(id, [[rIn, z0], [rIn + t, z0], [rIn + t, zm - w * 0.3], [rIn + t * 0.75, zm], [rIn + t, zm + w * 0.3], [rIn + t, z1], [rIn, z1]], mR, gIn, 64);
  if (gOut) lathe(id, [[rOut, z0], [rOut, z1], [rOut - t, z1], [rOut - t, zm + w * 0.3], [rOut - t * 0.75, zm], [rOut - t, zm - w * 0.3], [rOut - t, z0]], mR, gOut, 64);
  const gEl = o.gEl !== undefined ? o.gEl : gOut;             // billes / rouleaux et cage
  if (gEl) {
    const mE = M(id, { color: 0xf1f3f4, metalness: 1, roughness: 0.08 }), mC = M(id, { color: 0xc89b4a, metalness: 0.9, roughness: 0.3 });
    const rm = (rIn + rOut) / 2, re = (rOut - rIn) / 2 - t * 0.8;
    const g = roller ? new THREE.CylinderGeometry(re * S, re * S, w * 0.66 * S, 14) : new THREE.SphereGeometry(re * S, 16, 10);
    const ms = []; for (let i = 0; i < n; i++) ms.push(axM(rm, zm, i * TAU / n)); inst(g, ms, mE, gEl);
    for (const dz of [-0.36, 0.36]) lathe(id, ringPts(rm - re * 0.5, rm + re * 0.5, zm + dz * w - 0.02, zm + dz * w + 0.02), mC, gEl, 48);
  }
}
// joint à labyrinthe tournant : léchettes entre z0 et z1
function lechettes(r0, rT, z0, z1, n) {
  const pts = [[r0, z0], [rT - 0.05, z0]], dz = (z1 - z0) / n;
  for (let k = 0; k < n; k++) { const a = z0 + k * dz; pts.push([rT - 0.05, a + dz * 0.3], [rT, a + dz * 0.5], [rT - 0.05, a + dz * 0.7]); }
  pts.push([rT - 0.05, z1], [r0, z1]);
  return pts;
}

/* =====================================================================
   FICHES DES PIÈCES (textes rédigés d'après les manuels)
   ===================================================================== */
const GROUPS = [
  ['carb', 'Carburant et allumage'], ['comb', 'Chambre de combustion'], ['carter', 'Carter du générateur de gaz'],
  ['entree', 'Entrée d\'air et pare-feu'], ['p2', 'Palier n° 2 et joints avant'], ['p1', 'Palier n° 1'],
  ['stat', 'Stators et carter du rouet'], ['rotor', 'Rotor du compresseur']
];
const INFO = {
  fdv: { g: 'carb', n: 'Diviseur de débit et clapet de vidange', ref: 'OM 72-30-00 5.A, fig. 102 · AMM 73-10-04',
    d: 'Monté sous l\'adaptateur d\'entrée du collecteur (6 h), sur le PT6A-21 seulement : il partage le carburant entre les collecteurs primaire et secondaire au démarrage et en marche, puis vidange (purge) le carburant resté dans les collecteurs à l\'arrêt.',
    k: [['Fixation', '4 boulons freinés, joints toriques'], ['Position', '6 h, sur l\'adaptateur d\'entrée']] },
  manif1: { g: 'carb', n: 'Adaptateur d\'entrée et adaptateurs voisins', ref: 'OM 72-30-00 5.B(1)–(4), fig. 103 · IPC 72-30-04 · AMM 73-10-05',
    d: 'L\'adaptateur d\'entrée du collecteur (6 h), qui reçoit le carburant du diviseur de débit, et les deux adaptateurs de part et d\'autre, réunis par quatre tubes de transfert : on les dépose ensemble, en les soutenant pendant qu\'on retire les tubes.',
    k: [['Adaptateurs', '3 (entrée + 2 voisins)'], ['Tubes de transfert', '4'], ['Fixation', 'plaque-frein et boulons par adaptateur']] },
  manif2: { g: 'carb', n: 'Collecteur et adaptateurs d\'injecteurs', ref: 'OM 72-30-00 5.B(5), fig. 103 · AMM 72-30-00 · AMM 73-10-05',
    d: 'Quatorze adaptateurs d\'injecteurs, primaires et secondaires en alternance, reliés par des tubes de transfert appariés, forment autour du carter un double collecteur. Chaque adaptateur porte un injecteur dans une gaine qui traverse le carter et l\'enveloppe extérieure de la chambre et soutient l\'avant de celle-ci. Les onze autres adaptateurs se déposent un à un.',
    k: [['Adaptateurs', '14 (primaires et secondaires)'], ['Joints', 'joint ondulé en acier (post-SB1276)'], ['Rôle des gaines', 'soutien avant de la chambre']] },
  drains: { g: 'carb', n: 'Vannes de vidange du carter', ref: 'OM 72-30-00 5.C, fig. 104 · AMM 72-30-00 · AMM 73-10-06',
    d: 'Deux vannes à ressort aux bossages avant et arrière du bas du carter (6 h) : à l\'arrêt, elles évacuent le carburant résiduel ; en marche, P3 les tient fermées. Un support les relie.',
    k: [['Nombre', '2 (bossages avant et arrière)'], ['Position', '6 h'], ['Joints', 'plats, à remplacer']] },
  igniters: { g: 'carb', n: 'Bougies d\'allumage', ref: 'OM 72-30-00 5.D(1)–(2), fig. 105 · AMM 72-30-04 · AMM 74-20-03',
    d: 'Deux bougies à étincelle (ou bougies à incandescence) vissées dans les bossages du carter à 4 h et 9 h ; elles traversent l\'enveloppe extérieure de la chambre par un second bossage. Joints en cuivre.',
    k: [['Nombre', '2'], ['Positions', '4 h et 9 h'], ['Joints', 'cuivre, à remplacer']] },
  exciter: { g: 'carb', n: 'Excitateur et câbles d\'allumage', ref: 'AMM 74-10 · 74-20',
    d: 'Boîtier d\'allumage haute énergie relié aux deux bougies par des câbles blindés ; déposé avant le démontage du générateur de gaz. Position et tracé figurés.',
    k: [['Sorties', '2']] },

  liner: { g: 'comb', n: 'Chemise de la chambre de combustion', ref: 'OM 72-30-00 5.D(5) · AMM 72-30-00 · AMM 72-40-01 · OM tabl. 601 réf. 484',
    d: 'Chambre annulaire à flux inversé en tôle d\'alliage réfractaire, percée de trous de tailles variées et refroidie par des anneaux : le dôme, à l\'avant, reçoit les 14 injecteurs et les 2 bougies ; à l\'arrière, elle s\'emboîte sur les conduits de sortie qui renvoient les gaz de 180° vers la turbine compresseur. Elle se retire du carter à la main, dôme vers le haut (tout choc sur le dôme nuit au rendement).',
    k: [['Sur le grand conduit de sortie', 'Ø 15,945–15,955 po (post-SB1434)'], ['Soutien avant', 'gaines des 14 injecteurs'], ['Dépose', 'à la main, sans outil tranchant']] },

  ggcase: { g: 'carter', n: 'Carter du générateur de gaz', ref: 'AMM 72-30-04 · IPC 72-30-04 fig. 1 · OM 72-30-04 tabl. 601',
    d: 'Deux sections en acier inoxydable assemblées en une seule structure (revêtement d\'aluminiure possible). La section avant, cylindrique, entoure la chambre de combustion : bossages des 14 adaptateurs, des 2 bougies (4 h, 9 h) et des 2 vannes de vidange (6 h), patins de fixation avion à 4, 8 et 12 h. La section arrière, conique, loge le compresseur et la chambre de la vanne de décharge (7 h). Dans l\'alésage central : le palier n° 2 et les joints d\'air ; bride C à l\'avant (section de puissance), bride F à l\'arrière (carter d\'entrée).',
    k: [['Brides', 'C (avant) · F (arrière)'], ['Prise P3', 'tube diffuseur vers 4 h, bossage 5 h (FCU)'], ['Huile du palier n° 2', 'entrée 5 h, gicleur double à 2 h'], ['Centrage carter d\'entrée', 'Ø 11,124–11,129 po'], ['Carter du rouet', 'Ø 9,4202–9,4220 po (serré 0,0020–0,0053)']] },
  diffuser: { g: 'carter', n: 'Tubes diffuseurs et aubes redresseuses', ref: 'AMM 72-30-04 · AMM 72-30-04 inspection',
    d: 'Vingt et un tubes brasés dans la section centrale du carter recueillent l\'air sortant du rouet, le tournent de 90° vers l\'avant et transforment sa vitesse en pression statique ; des aubes redresseuses l\'envoient ensuite autour de la chambre. Un tube vers 4 h fournit la pression P3 au régulateur carburant.',
    k: [['Tubes', '21, brasés'], ['Rebut', '2 sorties voisines manquantes, ou plus de 2 non voisines']] },
  cseal2: { g: 'p2', n: 'Joint d\'air fixe du compresseur (double labyrinthe)', ref: 'AMM 72-30-04 · OM 72-30-00 tabl. 601 réf. 265, 267',
    d: 'Joint fixe à double labyrinthe dans l\'alésage central du carter, derrière le palier n° 2, tenu par un anneau de retenue à double spire. Il tourne autour du joint d\'air tournant avant du compresseur et sépare la cavité du palier de l\'air du compresseur. Il reste dans le carter au démontage.',
    k: [['Ø ext. / carter', '2,7315–2,7325 / 2,7290–2,7310 po (serré)'], ['Alésage', 'Ø 2,4620–2,4625 po'], ['Retenue', 'anneau à double spire']] },
  statorseal2: { g: 'p2', n: 'Joint d\'air fixe de la turbine compresseur', ref: 'OM 72-30-00 5.F(6)–(8), fig. 107 · AMM 72-30-04 · OM tabl. 601 réf. 253, 262',
    d: 'Joint fixe à labyrinthe fixé par huit boulons, rondelles-freins et écrous en D à la bride avant de l\'alésage central, devant le palier n° 2 ; il entoure le joint d\'air tournant de la turbine compresseur. Joint plat sous la bride.',
    k: [['Boulons', '8, écrous en D'], ['Centrage dans le carter', 'Ø 3,9100–3,9110 po'], ['Alésage', 'Ø 2,1300–2,1305 po (jeu 0,0050–0,0055)']] },
  oilnoz2: { g: 'p2', n: 'Gicleur d\'huile du palier n° 2', ref: 'OM 72-30-00 5.F(9), fig. 108 · AMM 72-30-04 · OM 72-30-04 tabl. 601 réf. 285',
    d: 'Gicleur double à 2 h, au bout du passage venu de fonderie dans l\'alésage central : il arrose les faces avant et arrière du palier n° 2. Il est tenu par un des quatre boulons de la bague extérieure.',
    k: [['Position', '2 h'], ['Fixation', '1 boulon et rondelle-frein'], ['Filtre du gicleur', 'Ø 0,233–0,236 po']] },
  brg2o: { g: 'p2', n: 'Palier n° 2 : bague extérieure à bride', ref: 'OM 72-30-00 5.L · AMM 72-30-05 · OM tabl. 601 réf. 256',
    d: 'Bague extérieure du roulement à rouleaux, à bride boulonnée par quatre boulons et rondelles-freins dans l\'alésage central du carter. Elle reste en place quand on retire le rotor : les rouleaux y coulissent, ce qui laisse le rotor se dilater.',
    k: [['Ø ext. / carter', '2,6769–2,6772 / 2,6770–2,6784 po'], ['Boulons', '4 (dont celui du gicleur)']] },
  bleed: { g: 'carter', n: 'Vanne de décharge du compresseur', ref: 'OM 72-30-00 5.H, fig. 110 · AMM 75-30-00',
    d: 'Vanne autonome sur la face de montage à 7 h de la section conique du carter : sous un régime donné, elle décharge à l\'air libre l\'air entre étages (P2.5), qui arrive par les fentes du stator du 3e étage, pour éviter le décrochage. Piston sur diaphragme commandé par P3 (tube de mise à l\'air à 8 h) ; elle se ferme progressivement en montée en régime.',
    k: [['Position', '7 h'], ['Fixation', '4 boulons et rondelles'], ['Joint', 'torique sur la goupille élastique']] },

  fsc: { g: 'entree', n: 'Pare-feu central', ref: 'AMM 72-30-01 · IPC 72-30-01 fig. 1',
    d: 'Anneau-cloison en deux moitiés de tôle inox boulonnées, autour de la section conique du carter : il sépare la zone d\'entrée d\'air de l\'avant du moteur. Une bande isolante collée sur son diamètre intérieur fait l\'étanchéité avec le carter. Contour extérieur selon la nacelle (figuré circulaire).',
    k: [['Construction', '2 moitiés, inox'], ['Fixation', 'ferrures (pré-SB1445) ou boulons (post-SB1445)']] },
  fsr: { g: 'entree', n: 'Pare-feu arrière', ref: 'AMM 72-30-02 · IPC 72-30-02 fig. 1',
    d: 'Anneau-cloison derrière la grille d\'entrée, autour du carter d\'entrée : il sépare l\'entrée d\'air du boîtier d\'accessoires. Deux moitiés boulonnées et bande isolante, comme le pare-feu central.',
    k: [['Construction', '2 moitiés, inox']] },
  washring: { g: 'entree', n: 'Rampe de lavage du compresseur', ref: 'AMM 72-30-02',
    d: 'Anneau de pulvérisation monté sur le pare-feu arrière, autour de la grille d\'entrée, tenu par des agrafes prises sous le bord arrière de la grille. Sert au lavage du compresseur.',
    k: [['Gicleurs', '16 (figurés)']] },
  screen: { g: 'entree', n: 'Grille d\'entrée d\'air', ref: 'OM 72-30-00 5.G, fig. 109 · AMM 72-20-00',
    d: 'Grillage étroit (post-SB1242) autour du plénum annulaire du carter d\'entrée : il arrête les corps étrangers. Fermé par une ferrure, deux boulons et deux écrous autofreinés.',
    k: [['Fixation', 'ferrure, 2 boulons, 2 écrous'], ['Type', 'grillage étroit (post-SB1242)']] },
  fairing: { g: 'entree', n: 'Carénage d\'entrée et ferrures', ref: 'OM 72-30-00 5.I(2), (11), fig. 111',
    d: 'Deux demi-carénages en tôle qui ferment la partie du plénum que la grille étroite ne couvre pas, tenus par six ferrures montées sur les goujons de la bride F. Il sort avec le carter d\'entrée, puis s\'en sépare (six boulons). Position et largeur estimées.',
    k: [['Ferrures', '6, sur les goujons de la bride F'], ['Moitiés', '2']] },
  flangeF: { g: 'entree', n: 'Écrous de la bride F', ref: 'OM 72-30-00 5.I(2), fig. 111',
    d: 'Dix-huit écrous autofreinés sur les goujons de la bride F du carter du générateur de gaz : ils serrent le carter d\'entrée et les ferrures du carénage. Clé PWC30114-15.',
    k: [['Écrous', '18 autofreinés'], ['Outil', 'clé PWC30114-15']] },
  inlet: { g: 'entree', n: 'Carter d\'entrée du compresseur et réservoir d\'huile', ref: 'OM 72-30-00 5.I, fig. 111, 112 · AMM 72-20-00 · OM tabl. 601 réf. 300, 301, 306',
    d: 'Carter en alliage léger qui forme le plénum annulaire d\'entrée : l\'air y entre radialement par la grille puis tourne vers l\'avant, vers le compresseur. Sa face avant reçoit la lèvre du stator du 1er étage ; son moyeu loge le palier n° 1 ; sa partie arrière est le réservoir d\'huile intégré, traversé par l\'arbre d\'accouplement ; à l\'arrière, des goujons portent le boîtier d\'accessoires. Dépose : clé de maintien PWC50455 sur l\'arbre avant, poussoir PWC50148, carter retourné, extracteur PWC50159.',
    k: [['Centrage dans le carter GG', 'Ø 11,131–11,134 po (serré 0,002–0,010)'], ['Logement du stator du 1er étage', 'Ø 7,764–7,768 po'], ['Logement du palier n° 1', 'Ø 3,283–3,284 po']] },

  rstseal: { g: 'p1', n: 'Joint d\'air fixe arrière du compresseur', ref: 'OM 72-30-00 5.K · OM tabl. 601 réf. 298, 303',
    d: 'Joint fixe à labyrinthe autour du joint tournant du moyeu arrière, emboîté dans le logement extérieur du palier n° 1 et fixé avec lui au carter d\'entrée par quatre boulons. Il ferme la cavité du palier n° 1 côté compresseur.',
    k: [['Ø ext. / logement', '3,2990–3,3000 / 3,3000–3,3010 po'], ['Alésage', 'Ø 1,913–1,915 po (jeu 0,0060–0,0075)']] },
  brg1h: { g: 'p1', n: 'Logement extérieur du palier n° 1', ref: 'OM 72-30-00 5.J(2)–(3), fig. 113 · OM tabl. 601 réf. 305, 306',
    d: 'Logement centré dans le moyeu du carter d\'entrée, boulonné au joint d\'air fixe arrière (4 boulons) et au support flexible (5 boulons et rondelles-freins) : avec l\'adaptateur qu\'il entoure avec un faible jeu, il forme le logement souple du palier n° 1.',
    k: [['Ø ext. / carter d\'entrée', '3,2840–3,2850 po'], ['Jeu avec l\'adaptateur', '0,0035–0,0045 po (0,001 radial min.)'], ['Boulons', '4 + 5']] },
  flexsup: { g: 'p1', n: 'Support flexible du palier n° 1', ref: 'OM 72-30-00 5.J(3)–(4), fig. 113 · AMM 72-30-05',
    d: 'Anneau élastique qui relie l\'adaptateur du roulement au logement extérieur (cinq boulons de chaque côté) : il laisse le palier n° 1 suivre de petits déplacements du rotor. Sa forme est estimée.',
    k: [['Boulons', '5 vers le logement, 5 vers l\'adaptateur']] },
  brg1: { g: 'p1', n: 'Palier n° 1 (billes) et adaptateur', ref: 'OM 72-30-00 5.J, fig. 113 · AMM 72-30-05 · OM tabl. 601 réf. 304, 308',
    d: 'Roulement à billes de butée qui porte l\'arrière du rotor et fixe sa position axiale. Sa bague extérieure est tenue dans l\'adaptateur par une rondelle-frein et un écrou à créneaux ; la bague intérieure, en deux moitiés, est serrée sur le moyeu arrière. La moitié arrière a une gorge d\'extraction.',
    k: [['Ø ext. / adaptateur', '2,8343–2,8346 / 2,8346–2,8353 po'], ['Ø int. / moyeu', '1,1809–1,1811 / 1,1812–1,1817 po (serré)'], ['Type', 'billes, butée']] },
  brg1nut: { g: 'p1', n: 'Écrou à créneaux et rondelle à godet du palier n° 1', ref: 'OM 72-30-00 5.J · IPC 72-30-05 fig. 3 (rep. 400)',
    d: 'Écrou du moyeu arrière qui serre la bague intérieure du palier n° 1, l\'entretoise de réglage et le joint d\'air tournant contre l\'épaulement du moyeu ; freiné par une rondelle à godet. Support du rotor PWC30233 pour le desserrage.',
    k: [['Freinage', 'rondelle à godet'], ['Outil', 'support de rotor PWC30233']] },
  brg1sp: { g: 'p1', n: 'Entretoise de réglage et joint d\'air tournant arrière', ref: 'OM 72-30-00 5.J · AMM 72-30-05 · OM tabl. 601 réf. 298',
    d: 'Sur le moyeu arrière, devant le palier n° 1 : l\'entretoise de réglage fixe la position axiale du rotor ; le joint tournant à léchettes forme le labyrinthe avec le joint fixe arrière.',
    k: [['Ø des léchettes', '1,900–1,901 po'], ['Jeu radial', '0,0060–0,0075 po']] },

  imphsg: { g: 'stat', n: 'Carter du rouet', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(h)–(i) · OM 72-30-04 tabl. 601 réf. 379',
    d: 'Virole qui ferme le rouet côté aubes. Sa face extérieure avant se centre dans le carter intérieur du générateur de gaz, où un anneau de retenue en coin la tient ; à l\'arrière, le stator du 3e étage y est boulonné (3 boulons). Des fentes et ergots empêchent les stators de tourner.',
    k: [['Ø de centrage', '9,4240–9,4255 po'], ['Jeu axial du rouet', '0,025–0,027 po']] },
  impring: { g: 'stat', n: 'Anneau de retenue du carter du rouet', ref: 'OM 72-30-00 5.K · AMM 72-30-05',
    d: 'Anneau en coin qui retient le carter du rouet dans le carter intérieur du générateur de gaz ; déposé à la pince avant d\'extraire le rotor.',
    k: [['Type', 'anneau en coin']] },
  stator3: { g: 'stat', n: 'Stator du 3e étage (aubes et virole)', ref: 'AMM 72-30-05 · IPC 72-30-05 · OM 72-30-05 5.A(10)(h)',
    d: 'Quarante aubes en acier inoxydable dont les bouts traversent la virole et y sont brasés. Boulonné au stator du 1er étage et au carter du rouet ; des fentes de sa virole mettent la pression entre étages P2.5 dans la chambre de la vanne de décharge.',
    k: [['Aubes', '40'], ['Fentes', 'P2.5 vers la vanne de décharge']] },
  stator2: { g: 'stat', n: 'Stator du 2e étage', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(f)',
    d: 'Quarante-quatre aubes brasées dans leur virole, retenue entre les brides des stators du 1er et du 3e étage.',
    k: [['Aubes', '44']] },
  stator1: { g: 'stat', n: 'Stator du 1er étage', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(a) · OM tabl. 601 réf. 300',
    d: 'Quarante-quatre aubes brasées dans leur virole. Six boulons et écrous le serrent sur le stator du 3e étage, avec le 2e entre eux ; à l\'arrière, une lèvre s\'engage dans une gorge du carter d\'entrée, avec un joint torique.',
    k: [['Aubes', '44'], ['Lèvre', 'Ø 7,746–7,750 po (jeu 0,014–0,022)'], ['Boulons', '6']] },

  stubshaft: { g: 'rotor', n: 'Arbre avant du compresseur', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 (rep. 40) · OM tabl. 601 réf. 258',
    d: 'Pièce forgée creuse en acier, en tête du rotor : elle porte le joint d\'air tournant de la turbine compresseur, la bague intérieure du palier n° 2 et le joint d\'air tournant avant du compresseur ; la turbine compresseur est cannelée sur son bout avant et serrée par le boulon central. Sa bride est boulonnée au rouet par les six tirants.',
    k: [['Ø au palier n° 2', '1,5750–1,5758 po'], ['Extraction', 'extracteurs PWC30368 / PWC30367']] },
  ctrseal: { g: 'rotor', n: 'Joint d\'air tournant de la turbine compresseur', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(k) · OM tabl. 601 réf. 253, 258',
    d: 'Bague à léchettes sur l\'arbre avant, devant le palier n° 2, tenue avec le palier et le joint avant du compresseur par le disque de la turbine compresseur. Extracteur PWC30862.',
    k: [['Ø des léchettes', '2,1195–2,1200 po'], ['Sur l\'arbre', 'Ø 1,5738–1,5752 po (serré)']] },
  brg2: { g: 'rotor', n: 'Palier n° 2 : bague intérieure et rouleaux', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(l) · IPC 72-30-05 fig. 3',
    d: 'Roulement à rouleaux qui porte l\'avant du rotor du générateur de gaz ; la bague intérieure, avec rouleaux et cage, est prise entre les deux joints tournants et sort avec le rotor. Extracteur PWC30489.',
    k: [['Type', 'rouleaux cylindriques, bague à bride'], ['Ø int. / arbre', '1,575 po']] },
  frontseal: { g: 'rotor', n: 'Joint d\'air tournant avant du compresseur', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 (rep. 30) · OM tabl. 601 réf. 265',
    d: 'Bague à léchettes en appui sur un épaulement de l\'arbre avant, derrière le palier n° 2 : avec le joint fixe à double labyrinthe, elle sépare la cavité du palier de l\'air du compresseur.',
    k: [['Ø des léchettes', '2,4495–2,4500 po'], ['Jeu radial', '0,0060–0,0065 po']] },
  cweights: { g: 'rotor', n: 'Contrepoids et rondelles-freins', ref: 'IPC 72-30-05 fig. 3 (rep. 60, 70) · OM 72-30-05 5.A(10)(m)',
    d: 'Contrepoids d\'équilibrage sous les têtes des tirants, sur la bride de l\'arbre avant (de 0 à 6 selon l\'équilibrage).',
    k: [['Nombre', '0 à 6 (2 figurés)']] },
  tierods: { g: 'rotor', n: 'Tirants du rotor', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 (rep. 50) · OM 72-30-05 5.A(2)–(3)',
    d: 'Six tirants numérotés qui serrent l\'arbre avant, le rouet, les trois disques et leurs entretoises en un seul rotor.',
    k: [['Tirants', '6, numérotés']] },
  tienuts: { g: 'rotor', n: 'Écrous et rondelles-freins des tirants', ref: 'IPC 72-30-05 fig. 3 · OM 72-30-05 5.A(2)',
    d: 'Six écrous et rondelles-freins à l\'arrière du 1er disque, desserrés d\'un quart de tour à la fois, en ordre opposé.',
    k: [['Écrous', '6']] },
  impeller: { g: 'rotor', n: 'Rouet centrifuge', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 · OM 72-30-05 5.A(10)',
    d: 'Étage centrifuge unique, après les trois étages axiaux : il envoie l\'air dans les 21 tubes diffuseurs. Boulonné aux étages axiaux et aux entretoises par les six tirants. Nombre d\'aubes figuré.',
    k: [['Jeu axial', '0,025–0,027 po'], ['Rapport de compression', '7,0:1 (total)']] },
  spacer3: { g: 'rotor', n: 'Entretoise du 3e étage', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(j)',
    d: 'Entretoise entre le rouet et le 3e disque : comme les autres entretoises, elle limite le déplacement axial des aubes et porte des léchettes sous le stator. Extracteur PWC30422.',
    k: [['Outil', 'PWC30422']] },
  disk3: { g: 'rotor', n: 'Disque et aubes du 3e étage', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 · OM 72-30-05 5.A(10)(g)',
    d: 'Trente-deux aubes en acier inoxydable cadmié dans des rainures en queue d\'aronde ; leur léger jeu fait le cliquetis entendu au ralentissement. Extracteur PWC30487.',
    k: [['Aubes', '32'], ['Matériau', 'acier inox cadmié']] },
  spacer2: { g: 'rotor', n: 'Entretoise du 2e étage', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(e)',
    d: 'Entretoise entre les 2e et 3e disques. Extracteur PWC30422.', k: [['Outil', 'PWC30422']] },
  disk2: { g: 'rotor', n: 'Disque du 2e étage', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(d)',
    d: 'Disque à rainures en queue d\'aronde ; ses aubes se déposent avant lui. Extracteur PWC30487.', k: [['Outil', 'PWC30487']] },
  blades2: { g: 'rotor', n: 'Aubes du 2e étage', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 · OM 72-30-05 5.A(10)(c)',
    d: 'Trente-deux aubes en acier inoxydable cadmié, de profil différent de celles du 1er étage.', k: [['Aubes', '32']] },
  spacer1: { g: 'rotor', n: 'Entretoise du 1er étage', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(10)(b)',
    d: 'Entretoise entre les 1er et 2e disques. Extracteur PWC30501.', k: [['Outil', 'PWC30501']] },
  blades1: { g: 'rotor', n: 'Aubes du 1er étage', ref: 'AMM 72-30-05 · IPC 72-30-05 fig. 3 (rep. 390) · OM 72-30-05 5.A(7)',
    d: 'Seize aubes en titane (post-SB1113 ; 32 avant), à profil propre au 1er étage, dans les rainures en queue d\'aronde du moyeu arrière.',
    k: [['Aubes', '16, titane (post-SB1113)']] },
  rearhub: { g: 'rotor', n: 'Moyeu arrière (disque du 1er étage)', ref: 'AMM 72-30-05 · OM 72-30-05 5.A(5)–(6) · OM tabl. 601 réf. 308',
    d: 'Disque du 1er étage et moyeu creux d\'une seule pièce : il porte le joint d\'air tournant arrière, l\'entretoise de réglage et le palier n° 1. Un accouplement court, cannelé à l\'arrière, y est goupillé par une goupille transversale ; l\'arbre d\'accouplement des accessoires s\'y engage. Séparé de l\'entretoise du 1er étage par l\'extracteur PWC30819.',
    k: [['Ø au palier n° 1', '1,1812–1,1817 po'], ['Accouplement', 'court, goupille transversale']] },
  cplshaft: { g: 'rotor', n: 'Arbre d\'accouplement des accessoires', ref: 'AMM 72-30-05 · AMM 72-60',
    d: 'Arbre creux en acier, cannelé intérieurement aux deux bouts : il prolonge l\'entraînement du compresseur à travers le tube du réservoir d\'huile jusqu\'au boîtier d\'accessoires. Avant tenu par un verrou à billes, arrière cannelé sur l\'arbre d\'entraînement du boîtier ; il part avec le boîtier d\'accessoires.',
    k: [['Entraîne', 'boîtier d\'accessoires (100 % Ng = 37 468 tr/min)']] }
};

/* =====================================================================
   CONSTRUCTION
   ===================================================================== */
const CASE = ['ggcase', 'diffuser', 'cseal2', 'statorseal2', 'liner', 'manif2', 'fsc', 'fsr', 'washring', 'screen', 'fairing', 'flangeF', 'inlet',
  'rstseal', 'brg1h', 'flexsup', 'imphsg', 'impring', 'stator1', 'stator2', 'stator3'];
for (const id of Object.keys(INFO)) part(id, { kind: CASE.includes(id) ? 'case' : 'int' });
const spin = {};                                         // groupes tournants
function spinner(id) { const s = new THREE.Group(); PART[id].g.add(s); return (spin[id] = s); }
const nozPhi = Array.from({ length: 14 }, (_, i) => (i + 0.5) * TAU / 14);   // 14 adaptateurs ; 12 h et 6 h (n° 3 et 10)
const INLET_AD = [9, 10, 11];                                                // adaptateur d'entrée (6 h) et ses voisins

/* ---------- carter du générateur de gaz ---------- */
{
  const g = PART.ggcase.g;
  const mG = M('ggcase', { color: 0x9aa3a9, metalness: 0.8, roughness: 0.34 }), mGi = M('ggcase', { color: 0x8c959b, metalness: 0.75, roughness: 0.4 });
  // enveloppe : bride C, section de combustion (renflement des adaptateurs), section centrale, section conique, bride F
  lathe('ggcase', ringPts(9.45, 9.95, 24.25, 24.62), mG, g, 140);
  lathe('ggcase', sheet([[9.5, 24.6], [9.5, 27.0], [9.72, 27.15], [9.72, 28.25], [9.5, 28.4], [9.5, 37.9], [9.42, 38.5], [9.3, 39.3], [9.1, 39.9], [8.4, 40.9],
    [7.6, 42.0], [6.9, 43.2], [6.35, 44.4], [6.05, 45.2], [6.0, 45.32]], -0.08), mG, g, 140);
  lathe('ggcase', ringPts(5.57, 6.6, 45.3, 45.58), mG, g, 120);                              // bride F (centrage Ø 11,124)
  for (const z of [31.0, 35.3]) lathe('ggcase', [[9.5, z - 0.3], [9.66, z - 0.22], [9.66, z + 0.22], [9.5, z + 0.3]], mG, g, 120);   // raidisseurs
  // cloison arrière du diffuseur et carter intérieur (logement du carter du rouet, Ø 9,422)
  lathe('ggcase', sheet([[4.85, 39.9], [6.5, 39.92], [9.15, 39.95]], -0.08), mGi, g, 120);
  lathe('ggcase', ringPts(4.715, 4.85, 39.55, 40.1), mGi, g, 120);
  // cloison avant du diffuseur, de l'alésage central à l'entrée des tubes
  lathe('ggcase', sheet([[2.8, 38.62], [3.6, 38.76], [4.45, 38.84], [4.7, 38.86]], 0.07), mGi, g, 120);
  lathe('ggcase', ringPts(4.55, 4.7, 38.86, 39.18), mGi, g, 120);
  // alésage central : bride avant (16 boulons de la plaque-frein), paroi, voiles et logements du palier n° 2 et du joint fixe
  lathe('ggcase', ringPts(2.66, 3.5, 35.82, 35.98), mGi, g, 96);
  lathe('ggcase', ringPts(2.66, 2.8, 35.98, 38.7), mGi, g, 96);
  lathe('ggcase', ringPts(1.955, 2.66, 36.05, 36.22), mGi, g, 96);                           // bride avant de l'alésage (joint fixe TC, Ø 3,909)
  lathe('ggcase', ringPts(1.6, 1.955, 36.2, 36.32), mGi, g, 96);
  lathe('ggcase', ringPts(1.339, 1.6, 36.3, 37.05), mGi, g, 96);                             // logement du palier n° 2 (Ø 2,677)
  lathe('ggcase', ringPts(1.366, 1.6, 37.05, 37.75), mGi, g, 96);                            // logement du joint fixe (Ø 2,730)
  lathe('ggcase', ringPts(1.6, 2.66, 37.6, 37.75), mGi, g, 96);
  // bossages : 14 adaptateurs (ovales), bougies (4 h, 9 h), vannes de vidange (6 h), prise P3 (5 h), mise à l'air de la vanne (8 h), huile (5 h)
  inst(new THREE.CylinderGeometry(0.95 * S, 0.95 * S, 0.3 * S, 24).scale(1.55, 1, 1), nozPhi.map(p => radM(9.8, 27.7, p)), mG, g);
  for (const h of [4, 9]) radialCyl(g, mG, h, 9.45, 9.75, 29.2, 0.75, 16);
  for (const z of [30.5, 36.5]) radialCyl(g, mG, 6, 9.45, 9.75, z, 0.55, 16);
  radialCyl(g, mG, 5, 9.3, 9.8, 38.1, 0.35, 12); radialCyl(g, mG, 8, 9.2, 9.7, 38.7, 0.3, 12); radialCyl(g, mG, 5, 9.4, 9.9, 36.9, 0.4, 12);
  for (const h of [4, 8, 0]) radialBox(g, mG, h, 9.45, 9.9, 37.0, 38.3, 1.8);               // patins de fixation avion
  radialBox(g, mG, 7, 7.6, 7.9, 41.0, 42.6, 3.6);                                            // face de montage de la vanne de décharge
}
/* ---------- tubes diffuseurs (21) et aubes redresseuses ---------- */
{
  const g = PART.diffuser.g, mD = M('diffuser', { color: 0xb5b9bc, metalness: 0.9, roughness: 0.3 });
  // départ tangentiel au bout du rouet (sens de rotation : antihoraire vu de l'arrière = angle décroissant), col rond,
  // divergent qui s'aplatit en ovale, virage de 90° vers l'avant
  const pts = [[4.62, 39.45, -0.07], [4.95, 39.45, 0.14], [5.5, 39.42, 0.3], [6.3, 39.32, 0.45], [7.2, 39.12, 0.55], [7.95, 38.9, 0.61], [8.45, 38.5, 0.65],
    [8.78, 37.85, 0.68], [8.92, 36.95, 0.7], [8.96, 36.3, 0.71]].map(([r, z, a]) => Pf(r, z, -a));
  const curve = new THREE.CatmullRomCurve3(pts), seg = 60, rad = 18, pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    const Rv = new THREE.Vector3(c.x, 0, c.z).normalize(), N = Rv.sub(T.clone().multiplyScalar(Rv.dot(T))).normalize(), B = T.clone().cross(N).normalize();
    const rn = lerp(0.17, 0.27, t) * S, rb = lerp(0.17, 0.55, Math.pow(t, 1.25)) * S;
    for (let j = 0; j <= rad; j++) { const a = j / rad * TAU, ca = Math.cos(a) * rn, sa = Math.sin(a) * rb; pos.push(c.x + ca * N.x + sa * B.x, c.y + ca * N.y + sa * B.y, c.z + ca * N.z + sa * B.z); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals(); tg.translate(0, -AY(38), 0);
  bladeRow(tg, 21, mD, g, 38);
  const coll = new THREE.TorusGeometry(0.21 * S, 0.05 * S, 8, 20); coll.rotateY(Math.PI / 2); coll.translate(4.66 * S, 0, 0);
  bladeRow(coll, 21, mD, g, 39.45, 0.07 - Math.PI / 2);                                     // collerettes d'entrée des tubes
  // aubes redresseuses en sortie des tubes : redressent le tourbillon antihoraire ; creux vers l'horaire
  bladeRow(bladeGeo({ r0: 8.75, r1: 9.46, chord: 0.7, st0: -0.5, st1: -0.45, camber: -0.22, thick: 0.1 }), 42, mD, g, 35.7);
}

/* ---------- chambre de combustion ---------- */
{
  const g = PART.liner.g;
  const mL = M('liner', { color: 0xb09c86, metalness: 0.8, roughness: 0.45, alphaMap: holeTex, alphaTest: 0.5 });
  const mB = M('liner', { color: 0xa38d76, metalness: 0.8, roughness: 0.42 });
  const pts = [[8.7, 36.4], [8.7, 28.4]];
  for (let i = 1; i < 18; i++) { const a = i / 18 * Math.PI; pts.push([7.85 + 0.85 * Math.cos(a), 28.4 - 0.85 * Math.sin(a)]); }
  pts.push([7.0, 28.4], [7.0, 35.6], [7.15, 36.0]);
  latheUV(pts, mL, g, 120);
  for (const z of [28.9, 30.5, 32.1, 33.7, 35.2]) {                                          // anneaux de refroidissement
    lathe('liner', [[8.7, z], [8.82, z + 0.08], [8.82, z + 0.42], [8.7, z + 0.5]], mB, g, 120);
    if (z < 35) lathe('liner', [[7.0, z], [7.12, z + 0.08], [7.12, z + 0.42], [7.0, z + 0.5]], mB, g, 120);
  }
  inst(new THREE.CylinderGeometry(0.42 * S, 0.5 * S, 0.35 * S, 16), nozPhi.map(p => radM(8.45, 28.1, p)), mB, g);   // passages des injecteurs
  for (const h of [4, 9]) radialCyl(g, mB, h, 8.55, 8.85, 29.2, 0.45, 16);                 // bossages des bougies
}

/* ---------- collecteur carburant : 14 adaptateurs, tubes de transfert appariés, plaques-freins ---------- */
function adaptateurs(id, list) {
  const g = PART[id].g, mF = M(id, { color: 0xbfae7f, metalness: 0.85, roughness: 0.35 }), mK = M(id, { color: 0xa9adb0, metalness: 0.85, roughness: 0.3 });
  const phis = list.map(i => nozPhi[i]);
  inst(new THREE.CylinderGeometry(0.42 * S, 0.42 * S, 1.4 * S, 12), phis.map(p => radM(10.6, 27.7, p)), mF, g);     // corps
  inst(new THREE.CylinderGeometry(0.58 * S, 0.58 * S, 0.4 * S, 6), phis.map(p => radM(11.5, 27.7, p)), mF, g);      // six-pans
  inst(new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 1.4 * S, 8), phis.map(p => radM(8.8, 27.7, p)), mF, g);         // gaine et injecteur
  inst(new THREE.BoxGeometry(1.5 * S, 0.1 * S, 0.8 * S), phis.map(p => radM(9.95, 27.7, p)), mK, g);                // plaque-frein
  const bl = []; for (const p of phis) for (const d of [-0.62, 0.62]) bl.push(radM(10.05, 27.7, p + d / 10));
  inst(new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 0.14 * S, 6), bl, boltMat(id), g, 'bolt');
  // tubes de transfert : une paire entre chaque adaptateur et le suivant
  const d = TAU / 14;
  for (const [dz, dr] of [[-0.35, 0.25], [0.35, 0.05]]) {
    const pts = []; for (let k = 0; k <= 16; k++) { const a = lerp(0.06, d - 0.06, k / 16); pts.push(Pf(10.55 + dr + Math.sin(k / 16 * Math.PI) * 0.35, 27.7 + dz, a)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.14 * S, 6);
    const own = id === 'manif1' ? [9, 10] : [...Array(14).keys()].filter(i => i !== 9 && i !== 10);
    inst(tg, own.map(i => new THREE.Matrix4().makeRotationY(nozPhi[i])), mF, g);
  }
}
adaptateurs('manif1', INLET_AD);
adaptateurs('manif2', [...Array(14).keys()].filter(i => !INLET_AD.includes(i)));
{ // diviseur de débit et clapet de vidange, sous l'adaptateur d'entrée ; conduite d'arrivée du carburant
  const g = PART.fdv.g, mF = M('fdv', { color: 0xa88f55, metalness: 0.65, roughness: 0.4 }), mT = M('fdv', { color: 0xa4906a, metalness: 0.8, roughness: 0.35 });
  const ph = nozPhi[10];
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.8 * S, 1.3 * S, 1.9 * S), mF); b.applyMatrix4(radM(12.38, 27.7, ph)); g.add(b);
  const bl = []; for (const [x, zz] of [[-0.7, -0.75], [0.7, -0.75], [-0.7, 0.75], [0.7, 0.75]]) bl.push(radM(13.06, 27.7 + zz, ph + x / 13));
  inst(new THREE.CylinderGeometry(0.11 * S, 0.11 * S, 0.12 * S, 6), bl, boltMat('fdv'), g, 'bolt');
  tubeMesh(g, mT, [[12.9, 27.0, 6], [13.6, 26.6, 6], [14.3, 25.8, 6]], 0.2, 24);
}
{ // vannes de vidange (bossages avant et arrière, 6 h) et support
  const g = PART.drains.g, mD = M('drains', { color: 0xb8bcbf, metalness: 0.85, roughness: 0.3 });
  for (const z of [30.5, 36.5]) { radialCyl(g, mD, 6, 9.75, 10.7, z, 0.38, 6); radialCyl(g, mD, 6, 10.7, 11.5, z, 0.2, 10); }
  axialCyl(g, mD, 11.2, 6, 0.09, 30.5, 36.5, 8);
}
{ // bougies d'allumage (4 h et 9 h) et joints en cuivre
  const g = PART.igniters.g, mI = M('igniters', { color: 0xc9cdd0, metalness: 0.8, roughness: 0.3 }), mCu = M('igniters', { color: 0xc07a4a, metalness: 0.9, roughness: 0.3 });
  for (const h of [4, 9]) { radialCyl(g, mI, h, 8.55, 11.4, 29.2, 0.3, 12); radialCyl(g, mI, h, 11.4, 12.1, 29.2, 0.45, 6); radialCyl(g, mCu, h, 9.75, 9.83, 29.2, 0.5, 16); }
}
{ // excitateur et câbles blindés vers les deux bougies
  const g = PART.exciter.g, mE = M('exciter', { color: 0x3a4146, metalness: 0.4, roughness: 0.5 }), mC = M('exciter', { color: 0x9aa0a3, metalness: 0.6, roughness: 0.55 });
  const ex = new THREE.Mesh(new THREE.BoxGeometry(3.4 * S, 2.4 * S, 2.6 * S), mE); ex.applyMatrix4(radM(11.9, 42.3, clockPhi(4.75))); g.add(ex);
  tubeMesh(g, mC, [[11.7, 41.0, 4.75], [10.9, 38.0, 4.6], [10.5, 33.0, 4.3], [11.2, 30.2, 4.05], [12.2, 29.2, 4]], 0.22);
  tubeMesh(g, mC, [[11.7, 41.0, 4.75], [10.7, 38.0, 6.3], [10.6, 33.0, 7.9], [11.2, 30.2, 8.7], [12.2, 29.2, 9]], 0.22);
}

/* ---------- vanne de décharge (7 h) ---------- */
{
  const g = PART.bleed.g, mV = M('bleed', { color: 0x7d878d, metalness: 0.6, roughness: 0.4 }), ph = clockPhi(7);
  const put = (geo, r) => { const m = new THREE.Mesh(geo, mV); m.applyMatrix4(radM(r, 41.8, ph)); g.add(m); return m; };
  put(new THREE.BoxGeometry(3.4 * S, 0.3 * S, 3.4 * S), 8.05);                              // semelle
  put(new THREE.CylinderGeometry(1.55 * S, 1.55 * S, 1.2 * S, 28), 8.8);                    // corps
  put(new THREE.CylinderGeometry(1.85 * S, 1.85 * S, 0.25 * S, 28), 9.5);                   // bride du couvercle
  put(new THREE.SphereGeometry(1.6 * S, 28, 12, 0, TAU, 0, Math.PI / 2).scale(1, 0.5, 1), 9.6);
  const bl = []; for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + TAU / 8; bl.push(radM(8.25, 41.8, ph).multiply(new THREE.Matrix4().makeTranslation(1.35 * S * Math.cos(a), 0, 1.35 * S * Math.sin(a)))); }
  inst(new THREE.CylinderGeometry(0.17 * S, 0.17 * S, 0.22 * S, 6), bl, boltMat('bleed'), g, 'bolt');
  radialCyl(g, mV, 7, 10.35, 10.9, 41.8, 0.25, 8);                                          // raccord de commande P3
}

/* ---------- alésage central : joints fixes, gicleur, bague extérieure n° 2 ---------- */
{
  const mS = M('cseal2', { color: 0xb9a98e, metalness: 0.8, roughness: 0.4 }), mR = M('cseal2', { color: 0xb2b8bc, metalness: 0.85, roughness: 0.3 });
  lathe('cseal2', [[1.231, 37.05], [1.366, 37.05], [1.366, 37.6], [1.231, 37.6], [1.231, 37.4], [1.26, 37.36], [1.26, 37.29], [1.231, 37.25]], mS, PART.cseal2.g, 72);
  lathe('cseal2', ringPts(1.25, 1.4, 37.62, 37.68), mR, PART.cseal2.g, 48);                  // anneau de retenue à double spire
  lathe('cseal2', ringPts(1.25, 1.4, 37.69, 37.74), mR, PART.cseal2.g, 48);
}
{
  const g = PART.statorseal2.g, mS = M('statorseal2', { color: 0xb9a98e, metalness: 0.8, roughness: 0.4 });
  lathe('statorseal2', [[1.065, 35.2], [1.16, 35.2], [1.16, 35.6], [1.7, 35.95], [2.38, 35.95], [2.38, 36.05], [1.955, 36.05], [1.955, 36.18], [1.7, 36.18],
    [1.7, 36.05], [1.1, 35.66], [1.065, 35.66]], mS, g, 96);
  boltRing('statorseal2', g, 2.15, 35.9, 8, 0.11, { h: 0.1, phi0: TAU / 16 });             // 8 boulons et rondelles-freins
  boltRing('statorseal2', g, 2.15, 36.27, 8, 0.12, { h: 0.08, phi0: TAU / 16 });            // écrous en D derrière la bride
}
{
  const g = PART.oilnoz2.g, mN = M('oilnoz2', { color: 0xc9a54a, metalness: 0.85, roughness: 0.3 }), ph = clockPhi(2);
  radialBox(g, mN, 2, 1.4, 1.68, 36.05, 36.18, 0.36);
  const j = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * S, 0.04 * S, 0.3 * S, 8), mN); j.position.copy(Pf(1.32, 36.32, ph)); g.add(j);   // jet vers la face avant
  boltRing('oilnoz2', g, 1.48, 36.13, 1, 0.09, { h: 0.08, phi0: ph });
}
{ // bague extérieure du palier n° 2 et sa bride (3 boulons ; le 4e tient le gicleur à 2 h)
  bearing('brg2o', null, PART.brg2o.g, 0.7875, 1.3385, 36.35, 37.0, 16, true, { gEl: null });
  const mR = PART.brg2o.mats[0];
  lathe('brg2o', ringPts(1.2, 1.58, 36.2, 36.3), mR, PART.brg2o.g, 72);
  for (const h of [5, 8, 11]) boltRing('brg2o', PART.brg2o.g, 1.48, 36.15, 1, 0.09, { h: 0.08, phi0: clockPhi(h) });
}

/* ---------- carter d'entrée, réservoir d'huile intégré ---------- */
{
  const g = PART.inlet.g, mI = M('inlet', { color: 0x6b767d, metalness: 0.4, roughness: 0.5 });
  lathe('inlet', ringPts(5.4, 5.565, 45.35, 45.58), mI, g, 120);                             // centrage dans la bride F (Ø 11,131)
  lathe('inlet', ringPts(5.2, 6.6, 45.58, 45.72), mI, g, 120);                               // bride
  lathe('inlet', sheet([[6.6, 45.65], [8.0, 45.72], [9.2, 45.78]], -0.08), mI, g, 140);       // paroi avant du plénum
  lathe('inlet', ringPts(9.0, 9.22, 45.78, 46.0), mI, g, 140);
  lathe('inlet', sheet([[5.2, 45.64], [4.6, 45.84], [4.02, 46.0]], 0.07), mI, g, 120);         // lèvre intérieure, vers le compresseur
  lathe('inlet', ringPts(3.882, 4.02, 45.92, 46.16), mI, g, 96);                             // logement de la lèvre du 1er stator (Ø 7,764)
  // paroi arrière du plénum = paroi avant du réservoir, puis enveloppe du réservoir jusqu'à la bride du boîtier d'accessoires
  lathe('inlet', sheet([[2.35, 46.0], [2.6, 47.0], [3.1, 48.4], [4.3, 49.9], [6.0, 50.9], [8.0, 51.25], [9.2, 51.3]], -0.1), mI, g, 120);
  lathe('inlet', ringPts(9.0, 9.25, 51.25, 51.6), mI, g, 140);
  lathe('inlet', sheet([[9.2, 51.6], [8.65, 51.9], [8.65, 54.7], [8.15, 55.3]], -0.08), mI, g, 120);
  lathe('inlet', ringPts(7.85, 8.25, 55.15, 55.32), mI, g, 120);                             // bride du boîtier d'accessoires
  lathe('inlet', sheet([[1.25, 47.62], [1.05, 51.5], [0.95, 55.3]], 0.06), mI, g, 48);        // tube central (arbre d'accouplement)
  lathe('inlet', ringPts(1.642, 2.3, 46.3, 47.38), mI, g, 72);                              // moyeu : logement du palier n° 1 (Ø 3,283)
  lathe('inlet', ringPts(1.25, 2.3, 47.55, 47.65), mI, g, 72);
  for (let i = 0; i < 16; i++) radialBox(g, mI, 0, 8.65, 8.95, 52.0, 54.6, 0.25, i * TAU / 16 + TAU / 32);   // nervures du réservoir
}
{ // grille d'entrée étroite, cadres, ferrure de fermeture (12 h)
  const g = PART.screen.g;
  const mS = M('screen', { color: 0xb3bcc2, metalness: 0.9, roughness: 0.35, alphaMap: meshTex, transparent: true, alphaTest: 0.3 });
  const mF = M('screen', { color: 0x9aa3a9, metalness: 0.85, roughness: 0.35 });
  latheUV([[9.0, 47.32], [9.0, 51.05]], mS, g, 140);
  lathe('screen', ringPts(8.95, 9.15, 47.2, 47.42), mF, g, 120);
  lathe('screen', ringPts(8.95, 9.15, 50.95, 51.25), mF, g, 120);
  for (let i = 0; i < 24; i++) radialBox(g, mF, 0, 8.95, 9.12, 47.42, 50.95, 0.3, i * TAU / 24);
  radialBox(g, mF, 0, 9.12, 9.4, 47.15, 51.3, 0.7);
  for (const z of [47.6, 50.7]) radialCyl(g, boltMat('screen'), 0, 9.4, 9.58, z, 0.14, 6);
}
{ // carénage d'entrée (2 moitiés) et 6 ferrures sur les goujons de la bride F
  const g = PART.fairing.g, mF = M('fairing', { color: 0x8a949a, metalness: 0.6, roughness: 0.42 });
  for (const a0 of [0.02, Math.PI + 0.02]) latheUV([[9.02, 45.82], [9.1, 45.86], [9.1, 47.22], [9.02, 47.26]], mF, g, 64, a0, Math.PI - 0.04);
  for (const h of [3, 9]) radialBox(g, mF, h, 9.1, 9.35, 45.9, 47.2, 0.2);                  // brides de jonction
  for (const h of [1, 3, 5, 7, 9, 11]) { radialBox(g, mF, h, 6.3, 9.0, 45.86, 45.92, 0.5); radialBox(g, mF, h, 8.95, 9.02, 45.9, 46.4, 0.5); }
}
{ // 18 écrous autofreinés de la bride F
  const g = PART.flangeF.g;
  boltRing('flangeF', g, 6.15, 45.79, 18, 0.16, { h: 0.14, phi0: TAU / 36 });
  boltRing('flangeF', g, 6.15, 45.9, 18, 0.07, { h: 0.1, phi0: TAU / 36 });                  // bouts des goujons
}

/* ---------- pare-feu central et arrière, rampe de lavage ---------- */
function parefeu(id, z, rin, side) {
  const g = PART[id].g, mF = M(id, { color: 0x8a8e84, metalness: 0.5, roughness: 0.6 }), mStrip = M(id, { color: 0x3b3f38, metalness: 0.1, roughness: 0.9 });
  lathe(id, ringPts(rin + 0.12, 12.2, z - 0.08, z + 0.08), mF, g, 140);
  lathe(id, ringPts(rin - 0.1, rin + 0.14, z - 0.28, z + 0.28), mStrip, g, 120);              // bande isolante
  for (const h of [3, 9]) radialBox(g, mF, h, rin + 0.14, 12.2, z + side * 0.08, z + side * 0.5, 0.4);   // brides des deux moitiés
  boltRing(id, g, 11.75, z + side * 0.14, 32, 0.13, { h: 0.12 });
}
parefeu('fsc', 45.0, 6.25, -1);
parefeu('fsr', 51.55, 9.3, 1);
{
  const g = PART.washring.g, mW = M('washring', { color: 0xb8bcbf, metalness: 0.85, roughness: 0.3 });
  const t = new THREE.Mesh(new THREE.TorusGeometry(9.95 * S, 0.16 * S, 8, 120), mW); t.rotation.x = Math.PI / 2; t.position.y = AY(50.5); g.add(t);
  inst(new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 0.5 * S, 6), Array.from({ length: 16 }, (_, i) => radM(9.55, 50.5, i * TAU / 16)), mW, g);
  for (const h of [1.5, 4.5, 7.5, 10.5]) radialBox(g, mW, h, 9.25, 9.85, 50.75, 51.05, 0.3);   // agrafes sous le bord de la grille
}

/* ---------- palier n° 1 : joint fixe arrière, logement, support flexible, roulement, écrou ---------- */
{
  const g = PART.rstseal.g, mS = M('rstseal', { color: 0xb9a98e, metalness: 0.8, roughness: 0.4 });
  lathe('rstseal', [[0.957, 45.95], [2.25, 45.95], [2.25, 46.05], [1.65, 46.05], [1.65, 46.15], [1.4, 46.15], [1.1, 46.4], [0.957, 46.4]], mS, g, 72);
}
{
  const g = PART.brg1h.g, mH = M('brg1h', { color: 0x7f878c, metalness: 0.7, roughness: 0.4 });
  lathe('brg1h', [[1.65, 46.05], [2.2, 46.05], [2.2, 46.15], [1.642, 46.2], [1.642, 47.4], [1.85, 47.4], [1.85, 47.5], [1.552, 47.5], [1.552, 46.15], [1.65, 46.15]], mH, g, 72);
  boltRing('brg1h', g, 1.95, 46.21, 4, 0.1, { h: 0.1, phi0: TAU / 8 });                    // 4 boulons vers le joint fixe arrière
  boltRing('brg1h', g, 1.75, 47.6, 5, 0.09, { h: 0.1 });                                    // 5 boulons vers le support flexible
}
{
  const g = PART.flexsup.g, mF = M('flexsup', { color: 0x9ea6ab, metalness: 0.8, roughness: 0.35 });
  lathe('flexsup', ringPts(1.42, 1.5, 47.22, 47.5), mF, g, 64);
  lathe('flexsup', ringPts(1.42, 1.9, 47.5, 47.56), mF, g, 64);
  for (let k = 0; k < 10; k++) radialBox(g, mF, 0, 1.5, 1.56, 47.25, 47.48, 0.12, k * TAU / 10);   // lames (estimé)
  boltRing('flexsup', g, 1.47, 47.19, 5, 0.08, { h: 0.08, phi0: TAU / 10 });               // 5 boulons vers l'adaptateur
}
{
  const s = spinner('brg1');
  bearing('brg1', s, PART.brg1.g, 0.59, 1.417, 46.55, 47.2, 11, false, { gEl: s });
  const mA = M('brg1', { color: 0x8f989e, metalness: 0.75, roughness: 0.35 });
  lathe('brg1', ringPts(1.417, 1.548, 46.5, 47.22), mA, PART.brg1.g, 72);                    // adaptateur (Ø 3,0995)
  lathe('brg1', ringPts(1.2, 1.41, 47.2, 47.3), mA, PART.brg1.g, 64);                        // écrou à créneaux de la bague extérieure
}
{
  const s = spinner('brg1nut'), mN = M('brg1nut', { color: 0xb4b9bc, metalness: 0.85, roughness: 0.3 });
  lathe('brg1nut', ringPts(0.59, 0.92, 47.24, 47.42), mN, s, 48);
  lathe('brg1nut', ringPts(0.59, 0.8, 47.2, 47.24), mN, s, 48);                              // rondelle à godet
  for (let k = 0; k < 6; k++) radialBox(s, mN, 0, 0.86, 0.93, 47.26, 47.4, 0.14, k * TAU / 6);   // créneaux
}
{
  const s = spinner('brg1sp'), mS = M('brg1sp', { color: 0xc3c7ca, metalness: 0.9, roughness: 0.25 });
  lathe('brg1sp', lechettes(0.59, 0.95, 46.0, 46.4, 3), mS, s, 64);
  lathe('brg1sp', ringPts(0.59, 0.8, 46.4, 46.55), mS, s, 48);                               // entretoise de réglage
}

/* ---------- stators du compresseur et carter du rouet ---------- */
{
  const g = PART.stator1.g, mS = M('stator1', { color: 0x9aa1a6, metalness: 0.85, roughness: 0.35 });
  bladeRow(bladeGeo({ r0: 2.45, r1: 3.97, chord: 0.62, st0: -0.35, st1: -0.25, camber: -0.12 }), 44, mS, g, 44.45);
  lathe('stator1', ringPts(2.3, 2.45, 44.15, 44.75), mS, g, 72);
  lathe('stator1', [[3.97, 43.98], [4.6, 43.98], [4.6, 44.08], [4.12, 44.08], [4.12, 45.78], [3.873, 45.82], [3.873, 46.1], [3.78, 46.1], [3.78, 45.85], [3.97, 45.8]], mS, g, 120);
  boltRing('stator1', g, 4.45, 44.12, 6, 0.13, { h: 0.1, phi0: TAU / 12 });                 // 6 boulons et écrous (avec le 3e stator)
  boltRing('stator1', g, 4.45, 42.06, 6, 0.12, { h: 0.1, phi0: TAU / 12 });
  inst(new THREE.CylinderGeometry(0.05 * S, 0.05 * S, 2.0 * S, 8), Array.from({ length: 6 }, (_, i) => axM(4.45, 43.09, TAU / 12 + i * TAU / 6)), boltMat('stator1'), g, 'bolt');
}
{
  const g = PART.stator2.g, mS = M('stator2', { color: 0x9aa1a6, metalness: 0.85, roughness: 0.35 });
  bladeRow(bladeGeo({ r0: 2.6, r1: 3.87, chord: 0.52, st0: -0.35, st1: -0.25, camber: -0.12 }), 44, mS, g, 42.65);
  lathe('stator2', ringPts(2.45, 2.6, 42.38, 42.92), mS, g, 72);
  lathe('stator2', [[3.87, 42.2], [4.6, 42.2], [4.6, 42.28], [4.0, 42.28], [4.0, 43.9], [4.6, 43.9], [4.6, 43.98], [3.87, 43.98]], mS, g, 120);
}
{
  const g = PART.stator3.g, mS = M('stator3', { color: 0x969da2, metalness: 0.85, roughness: 0.35 }), mK = M('stator3', { color: 0x1a1d1f, metalness: 0.2, roughness: 0.9 });
  bladeRow(bladeGeo({ r0: 2.75, r1: 3.78, chord: 0.4, st0: -0.3, st1: -0.2, camber: -0.12 }), 40, mS, g, 41.3);
  lathe('stator3', ringPts(2.6, 2.75, 41.12, 41.48), mS, g, 72);
  lathe('stator3', [[3.78, 40.95], [4.5, 40.95], [4.5, 41.03], [3.92, 41.03], [3.92, 42.12], [4.6, 42.12], [4.6, 42.2], [3.78, 42.2]], mS, g, 120);
  for (let k = 0; k < 12; k++) radialBox(g, mK, 0, 3.915, 3.93, 41.45, 41.75, 0.35, k * TAU / 12 + 0.1);   // fentes P2.5
  boltRing('stator3', g, 4.3, 40.84, 3, 0.11, { h: 0.1, phi0: 0.4 });                       // 3 boulons et écrous vers le carter du rouet
}
{
  const g = PART.imphsg.g, mH = M('imphsg', { color: 0x8f989f, metalness: 0.75, roughness: 0.38 });
  // virole au plus près du bout des aubes du rouet, jusqu'à la face de centrage (Ø 9,424)
  lathe('imphsg', sheet([[3.86, 40.98], [3.75, 40.66], [3.8, 40.28], [4.05, 39.93], [4.47, 39.69], [4.66, 39.66]], -0.1), mH, g, 120);
  lathe('imphsg', ringPts(4.62, 4.712, 39.6, 40.05), mH, g, 120);
  lathe('imphsg', ringPts(3.9, 4.5, 40.87, 40.95), mH, g, 96);                               // bride vers le 3e stator
}
{
  const g = PART.impring.g, mR = M('impring', { color: 0xb2b8bc, metalness: 0.85, roughness: 0.3 });
  lathe('impring', [[4.6, 40.12], [4.8, 40.12], [4.8, 40.22], [4.6, 40.17]], mR, g, 96);      // anneau en coin
}

/* ---------- rotor du compresseur ---------- */
const diskProfile = (rb, zc, hubR, hubW, webR, webW, rimR, rimW) => [[rb, zc - hubW / 2], [hubR, zc - hubW / 2], [hubR + 0.25, zc - webW / 2], [webR, zc - webW / 2],
  [webR + 0.2, zc - rimW / 2], [rimR, zc - rimW / 2], [rimR, zc + rimW / 2], [webR + 0.2, zc + rimW / 2], [webR, zc + webW / 2], [hubR + 0.25, zc + webW / 2], [hubR, zc + hubW / 2], [rb, zc + hubW / 2]];
const TIE = Array.from({ length: 6 }, (_, i) => TAU / 12 + i * TAU / 6), RT = 1.75;           // 6 tirants au rayon 1,75 (estimé)
{
  const s = spinner('stubshaft'), mA = M('stubshaft', { color: 0x8d949a, metalness: 0.9, roughness: 0.3 });
  lathe('stubshaft', [[0.31, 32.3], [0.56, 32.3], [0.56, 33.0], [0.65, 33.0], [0.65, 33.55], [0.7875, 33.6], [0.7875, 37.62], [1.05, 37.62], [1.05, 38.25],
    [1.95, 38.25], [1.95, 38.95], [0.9, 38.95], [0.9, 39.6], [0.45, 39.6], [0.45, 34.7], [0.31, 34.6]], mA, s, 64);
  const sp = new THREE.BoxGeometry(0.07 * S, 0.06 * S, 0.65 * S), ms = []; for (let i = 0; i < 20; i++) ms.push(radM(0.58, 32.65, i * TAU / 20)); inst(sp, ms, mA, s);   // cannelures de la turbine compresseur
}
{ const s = spinner('ctrseal'), mS = M('ctrseal', { color: 0xc3c7ca, metalness: 0.9, roughness: 0.25 }); lathe('ctrseal', lechettes(0.7875, 1.06, 35.25, 36.3, 4), mS, s, 72); }
{ const s = spinner('brg2'); bearing('brg2', s, null, 0.7875, 1.3385, 36.35, 37.0, 16, true, { gEl: s }); }
{ const s = spinner('frontseal'), mS = M('frontseal', { color: 0xc3c7ca, metalness: 0.9, roughness: 0.25 }); lathe('frontseal', lechettes(0.7875, 1.225, 37.02, 37.6, 2), mS, s, 72); }
{
  const s = spinner('cweights'), mW = M('cweights', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  inst(new THREE.BoxGeometry(0.42 * S, 0.3 * S, 0.07 * S), [TIE[0], TIE[3]].map(p => radM(RT, 38.21, p)), mW, s);
}
{
  const s = spinner('tierods'), mT = M('tierods', { color: 0xb4b9bc, metalness: 0.9, roughness: 0.28 });
  inst(new THREE.CylinderGeometry(0.09 * S, 0.09 * S, 7.6 * S, 10), TIE.map(p => axM(RT, 41.97, p)), mT, s);
  inst(new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 0.16 * S, 6), TIE.map(p => axM(RT, 38.09, p)), mT, s, 'bolt');       // têtes
}
{
  const s = spinner('tienuts'), mN = M('tienuts', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  inst(new THREE.CylinderGeometry(0.19 * S, 0.19 * S, 0.15 * S, 6), TIE.map(p => axM(RT, 45.68, p)), mN, s, 'bolt');
  inst(new THREE.BoxGeometry(0.3 * S, 0.3 * S, 0.03 * S), TIE.map(p => radM(RT, 45.595, p)), mN, s);                      // rondelles-freins
}
{ // rouet : moyeu et 13 aubes principales + 13 intercalaires
  const s = spinner('impeller'), mI = M('impeller', { color: 0xc3c8cc, metalness: 0.95, roughness: 0.22 });
  const hub = [[0.9, 39.0], [4.4, 39.0], [4.45, 39.2]];
  for (let i = 0; i <= 16; i++) { const t = 1 - i / 16; hub.push([2.8 + 1.65 * (1 - Math.cos(t * Math.PI / 2)), 40.9 - 1.62 * Math.sin(t * Math.PI / 2)]); }
  hub.push([2.8, 41.15], [0.9, 41.15]);
  lathe('impeller', hub, mI, s, 96);
  function vaneGeo(t0) {
    const N = 20, pos = [], idx = [], th = 0.09;
    const pt = (t, side, tipF) => {
      const c = Math.cos(t * Math.PI / 2), sn = Math.sin(t * Math.PI / 2);
      const rh = 2.8 + 1.65 * (1 - c), zh = 40.9 - 1.62 * sn;
      let nx = 1.62 * c, nz = 1.65 * sn; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      const h = lerp(1.0, 0.36, t) * tipF, r = rh + nx * h, z = zh + nz * h;
      const ang = -0.55 * (1 - t) * (1 - t) - 0.25 * (1 - t) * (1 - t) * tipF + side * th / r * 0.5;
      const v = Pf(r, z, ang); return [v.x, v.y - AY(40), v.z];
    };
    for (let i = 0; i <= N; i++) { const t = lerp(t0, 1, i / N); for (const side of [-1, 1]) pos.push(...pt(t, side, 0.02), ...pt(t, side, 1)); }
    for (let i = 0; i < N; i++) {
      const a = i * 4, b = a + 4;
      idx.push(a, a + 1, b, a + 1, b + 1, b, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3, a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    }
    idx.push(0, 2, 1, 1, 2, 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  bladeRow(vaneGeo(0), 13, mI, s, 40);
  bladeRow(vaneGeo(0.42), 13, mI, s, 40, TAU / 26);
}
{ const s = spinner('spacer3'), mS = M('spacer3', { color: 0xbfc5ca, metalness: 0.9, roughness: 0.28 }); lathe('spacer3', lechettes(2.3, 2.58, 41.15, 41.575, 2), mS, s, 96); }
{
  const s = spinner('disk3'), mD = M('disk3', { color: 0xbfc5ca, metalness: 0.95, roughness: 0.25 });
  lathe('disk3', diskProfile(0.95, 41.85, 1.4, 0.9, 2.1, 0.35, 2.7, 0.55), mD, s, 96);
  bladeRow(bladeGeo({ r0: 2.7, r1: 3.75, chord: 0.6, st0: 0.65, st1: 0.9, camber: 0.12 }), 32, mD, s, 41.85);
  platforms(2.72, 0.5, 32, 0.06, mD, s, 41.85);
}
{ const s = spinner('spacer2'), mS = M('spacer2', { color: 0xbfc5ca, metalness: 0.9, roughness: 0.28 }); lathe('spacer2', lechettes(2.1, 2.43, 42.125, 43.25, 3), mS, s, 96); }
{ const s = spinner('disk2'), mD = M('disk2', { color: 0xbfc5ca, metalness: 0.95, roughness: 0.25 }); lathe('disk2', diskProfile(0.95, 43.55, 1.4, 0.9, 2.0, 0.35, 2.55, 0.6), mD, s, 96); }
{
  const s = spinner('blades2'), mB = M('blades2', { color: 0xbfc5ca, metalness: 0.95, roughness: 0.25 });
  bladeRow(bladeGeo({ r0: 2.55, r1: 3.85, chord: 0.7, st0: 0.7, st1: 0.95, camber: 0.12 }), 32, mB, s, 43.55);
  platforms(2.57, 0.55, 32, 0.06, mB, s, 43.55);
}
{ const s = spinner('spacer1'), mS = M('spacer1', { color: 0xbfc5ca, metalness: 0.9, roughness: 0.28 }); lathe('spacer1', lechettes(2.05, 2.28, 43.85, 45.0, 3), mS, s, 96); }
{
  const s = spinner('blades1'), mB = M('blades1', { color: 0xa9aeb8, metalness: 0.95, roughness: 0.28 });
  bladeRow(bladeGeo({ r0: 2.4, r1: 3.95, chord: 1.15, tipChord: 1.25, st0: 0.75, st1: 1.05, camber: 0.14, thick: 0.08 }), 16, mB, s, 45.35);
  platforms(2.42, 0.65, 16, 0.06, mB, s, 45.35);
}
{ // moyeu arrière (disque du 1er étage), accouplement court goupillé
  const s = spinner('rearhub'), mH = M('rearhub', { color: 0xa9aeb8, metalness: 0.95, roughness: 0.28 }), mC = M('rearhub', { color: 0x8d949a, metalness: 0.9, roughness: 0.3 });
  lathe('rearhub', [[0.42, 44.8], [1.4, 44.8], [1.65, 45.15], [1.9, 45.15], [2.1, 45.0], [2.4, 45.0], [2.4, 45.7], [2.1, 45.7], [1.9, 45.55], [1.65, 45.55],
    [1.4, 45.9], [0.59, 45.98], [0.59, 47.65], [0.42, 47.65]], mH, s, 96);
  lathe('rearhub', [[0.25, 46.6], [0.42, 46.6], [0.42, 47.65], [0.31, 47.65], [0.31, 48.3], [0.25, 48.3]], mC, s, 32);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 1.24 * S, 8), mC); pin.rotation.z = Math.PI / 2; pin.position.y = AY(47.52); s.add(pin);
}
{ // arbre d'accouplement des accessoires
  const s = spinner('cplshaft'), mA = M('cplshaft', { color: 0x8d949a, metalness: 0.9, roughness: 0.3 });
  lathe('cplshaft', ringPts(0.32, 0.45, 47.7, 56.6), mA, s, 32);
  for (const z of [48.0, 55.9]) lathe('cplshaft', ringPts(0.45, 0.58, z - 0.35, z + 0.35), mA, s, 32);
}

/* =====================================================================
   ROTATION
   ===================================================================== */
const rotNg = Object.values(spin);
function update(aNg) { for (const s of rotNg) s.rotation.y = aNg; }

/* =====================================================================
   DÉMONTAGE : OM 72-30-00 5.A à 5.L (générateur de gaz sur son support, section de puissance et boîtier d'accessoires
   déposés), puis OM 72-30-05 5.A (rotor du compresseur, PT6A-21). Les étapes E et F déposent des pièces du module
   des turbines (TB_IDS) : turbine compresseur, distributeur, carter de virole, couvercle du palier n° 2, conduits de sortie.
   ===================================================================== */
const TB_IDS = ['ctbolt', 'ctdisk', 'lockplate', 'ctvane', 'ctshroud', 'smallduct', 'cover2', 'largeduct'];
const ROTOR = ['stubshaft', 'ctrseal', 'brg2', 'frontseal', 'cweights', 'tierods', 'tienuts', 'impeller', 'imphsg', 'stator3', 'spacer3', 'disk3', 'stator2', 'spacer2',
  'disk2', 'blades2', 'stator1', 'spacer1', 'blades1', 'rearhub'];
const STEPS = [
  { t: 'Déposer les pare-feu central et arrière et la rampe de lavage', r: 'AMM 72-30-01 · AMM 72-30-02', m: [[['fsc'], { dz: -2, dr: 2 }], [['fsr', 'washring'], { dz: 2, dr: 2 }]],
    d: 'Chaque pare-feu est fait de deux moitiés boulonnées ; la rampe de lavage est fixée au pare-feu arrière par des agrafes prises sous le bord de la grille.' },
  { t: 'Déposer l\'excitateur d\'allumage et ses câbles', r: 'AMM 74-10 · 74-20', m: [[['exciter'], { dr: 3 }]],
    d: 'Câbles blindés débranchés des deux bougies.' },
  { t: 'Retirer l\'arbre d\'accouplement des accessoires', r: 'AMM 72-30-05 · AMM 72-60', m: [[['cplshaft'], { dz: 4 }]],
    d: 'Il part avec le boîtier d\'accessoires, déposé à l\'arrière du carter d\'entrée ; avant tenu par un verrou à billes dans l\'accouplement court du moyeu arrière.' },
  { t: 'Déposer le diviseur de débit et clapet de vidange', r: 'OM 72-30-00 5.A, fig. 102', m: [[['fdv'], { dr: 2 }]],
    d: 'Défreiner et retirer les quatre boulons ; séparer l\'ensemble de l\'adaptateur d\'entrée du collecteur ; jeter les joints toriques. Révision : AMM 73-10-04.' },
  { t: 'Déposer l\'adaptateur d\'entrée, ses deux voisins et leurs quatre tubes de transfert', r: 'OM 72-30-00 5.B(1)–(4), fig. 103', m: [[['manif1'], { dr: 2 }]],
    d: 'Défreiner les boulons et plaques-freins des trois adaptateurs, les soutenir, retirer les quatre tubes de transfert puis les trois adaptateurs.' },
  { t: 'Déposer les onze autres adaptateurs et tubes de transfert, un à un', r: 'OM 72-30-00 5.B(5), fig. 103', m: [[['manif2'], { dz: -3 }]],
    d: 'Jeter les joints toriques ; s\'assurer que tous les joints plats (ondulés en acier post-SB1276) sont retirés du carter et des gaines.' },
  { t: 'Déposer les deux vannes de vidange et leur support', r: 'OM 72-30-00 5.C, fig. 104', m: [[['drains'], { dr: 2 }]],
    d: 'Bossages avant et arrière à 6 h ; retirer les joints. Révision : AMM 73-10-06.' },
  { t: 'Déposer les deux bougies d\'allumage', r: 'OM 72-30-00 5.D(1)–(2), fig. 105', m: [[['igniters'], { dr: 2 }]],
    d: 'Clé et douille standard ; retirer les joints en cuivre. Révision : AMM 74-20-03.' },
  { t: 'Retirer la chemise de la chambre de combustion', r: 'OM 72-30-00 5.D(5), fig. 105', m: [[['liner'], { dz: -6 }]],
    d: 'Ne jamais faire levier avec un outil tranchant ; si elle colle, frapper la paroi intérieure du plat de la main. La poser dôme vers le haut : tout dommage au dôme nuit au rendement.' },
  { t: 'Déposer le boulon central et extraire la turbine compresseur', r: 'OM 72-30-00 5.E, fig. 106', m: [[['ctbolt'], { dz: -3 }], [['ctdisk'], { dz: -4.5 }]],
    d: 'Clé PWC30331 dans les trous de la bride C, protecteur PWC30336, écarteur PWC30335 pour ouvrir la rondelle-frein ; huile pénétrante (post-SB1439), desserrage à 600–1200 lb·po, jamais plus de 1800. Extracteur PWC30403 ; ne plus tourner la vis une fois le disque libre (aubes contre la virole).' },
  { t: 'Retirer d\'un bloc distributeur TC, carter de virole, petit conduit de sortie et plaque-frein', r: 'OM 72-30-00 5.F(1), fig. 107', m: [[['lockplate', 'ctvane', 'ctshroud', 'smallduct'], { dz: -4 }]],
    d: '16 boulons et rondelles-freins, à jeter. Révision : OM 72-50-01.' },
  { t: 'Extraire le couvercle du palier n° 2', r: 'OM 72-30-00 5.F(2), fig. 107', m: [[['cover2'], { dz: -3 }]],
    d: 'Extracteur PWC30863.' },
  { t: 'Retirer le grand conduit de sortie', r: 'OM 72-30-00 5.F(4), fig. 107', m: [[['largeduct'], { dz: -4 }]],
    d: 'PT6A-21 : à la main, en poussant également de chaque côté de l\'alésage central du conduit.' },
  { t: 'Déposer le joint d\'air fixe de la turbine compresseur', r: 'OM 72-30-00 5.F(6)–(8), fig. 107', m: [[['statorseal2'], { dz: -3 }]],
    d: 'Défreiner les huit rondelles-freins, retirer écrous en D et boulons, puis le joint et son joint plat de la bride de l\'alésage central.' },
  { t: 'Déposer le gicleur d\'huile du palier n° 2', r: 'OM 72-30-00 5.F(9), fig. 108', m: [[['oilnoz2'], { dr: 2 }]],
    d: 'Un boulon et sa rondelle-frein. Ne pas encore retirer les trois autres boulons, qui tiennent la bague extérieure du palier n° 2.' },
  { t: 'Déposer la grille d\'entrée d\'air', r: 'OM 72-30-00 5.G, fig. 109', m: [[['screen'], { dz: 2, dr: 1 }]],
    d: 'Grille étroite (post-SB1242) : deux écrous autofreinés, rondelles, ferrure et boulons. Révision : AMM 72-20-00.' },
  { t: 'Déposer la vanne de décharge du compresseur', r: 'OM 72-30-00 5.H, fig. 110', m: [[['bleed'], { dr: 2 }]],
    d: 'Quatre boulons et rondelles ; jeter le joint torique de la goupille élastique. Révision : AMM 75-30-00.' },
  { t: 'Séparer le carter d\'entrée (avec le carénage) du carter du générateur de gaz', r: 'OM 72-30-00 5.I(1)–(10), fig. 108, 111, 112', m: [[['flangeF'], { dz: 2 }], [['inlet', 'fairing'], { dz: 5 }]],
    d: 'Clé de maintien PWC50455 sur les cannelures de l\'arbre avant. Clé PWC30114-15 : 18 écrous autofreinés de la bride F. Poussoir PWC50148 sur quatre goujons, carter retourné, extracteur PWC50159 ; vérins de séparation.' },
  { t: 'Séparer le carénage d\'entrée du carter d\'entrée', r: 'OM 72-30-00 5.I(11)–(12), fig. 111', m: [[['fairing'], { dz: 2 }]],
    d: 'Six boulons et les ferrures ; carter d\'entrée posé sur le support PWC30517.' },
  { t: 'Déposer le logement extérieur du palier n° 1', r: 'OM 72-30-00 5.J(1)–(3), fig. 113', m: [[['brg1h'], { dz: 2 }]],
    d: 'Protecteur PWC30421 sur la bride F ; quatre boulons vers le joint fixe arrière (clé PWC30114-02), cinq boulons et rondelles-freins vers le support flexible.' },
  { t: 'Déposer le support flexible', r: 'OM 72-30-00 5.J, fig. 113', m: [[['flexsup'], { dz: 2 }]],
    d: 'Cinq boulons vers l\'adaptateur du roulement.' },
  { t: 'Desserrer l\'écrou à créneaux et retirer la rondelle à godet', r: 'OM 72-30-00 5.J, fig. 113', m: [[['brg1nut'], { dz: 2 }]],
    d: 'Rotor tenu par le support PWC30233.' },
  { t: 'Extraire le palier n° 1 et son adaptateur', r: 'OM 72-30-00 5.J, fig. 113', m: [[['brg1'], { dz: 2 }]],
    d: 'Moitié arrière de la bague intérieure à l\'extracteur (gorge d\'extraction), puis roulement et adaptateur, puis moitié avant.' },
  { t: 'Retirer l\'entretoise de réglage et le joint d\'air tournant arrière', r: 'OM 72-30-00 5.J, fig. 113', m: [[['brg1sp'], { dz: 2 }]],
    d: 'Garder l\'entretoise de réglage : elle fixe la position axiale du rotor.' },
  { t: 'Déposer le joint d\'air fixe arrière du compresseur', r: 'OM 72-30-00 5.K', m: [[['rstseal'], { dz: 2 }]],
    d: 'Ne pas toucher les léchettes ; remplacer le joint s\'il a frotté.' },
  { t: 'Retirer l\'anneau de retenue du carter du rouet', r: 'OM 72-30-00 5.K', m: [[['impring'], { dz: 2 }]],
    d: 'Montage de maintien PWC30420 ; anneau en coin déposé à la pince.' },
  { t: 'Extraire le rotor du compresseur avec ses stators et le carter du rouet', r: 'OM 72-30-00 5.K', m: [[ROTOR, { dz: 6 }]], main: 'stubshaft',
    d: 'Extracteur PWC30505 : le rotor sort par l\'arrière, avec la bague intérieure et les rouleaux du palier n° 2 ; il est posé sur le support PWC50619.' },
  { t: 'Déposer la bague extérieure du palier n° 2', r: 'OM 72-30-00 5.L', m: [[['brg2o'], { dz: -2 }]],
    d: 'Trois boulons restants ; le carter est ensuite retiré du support (ferrure de levage PWC51138, demi-bagues de montage).' },
  { t: 'Retirer les six écrous et rondelles-freins des tirants', r: 'OM 72-30-05 5.A(2)', m: [[['tienuts'], { dz: 2 }]],
    d: 'Rotor sur le support ; desserrer d\'un quart de tour à la fois, dans un ordre opposé.' },
  { t: 'Retirer les six tirants', r: 'OM 72-30-05 5.A(3)–(4)', m: [[['tierods'], { dz: -3 }]],
    d: 'Tirants numérotés : noter leur position pour le remontage (équilibrage).' },
  { t: 'Séparer le moyeu arrière de l\'entretoise du 1er étage', r: 'OM 72-30-05 5.A(5)–(6)', m: [[['rearhub', 'blades1'], { dz: 2 }]],
    d: 'Extracteur PWC30819.' },
  { t: 'Retirer les aubes du 1er étage', r: 'OM 72-30-05 5.A(7)', m: [[['blades1'], { dr: 2 }]],
    d: 'Seize aubes en titane, glissées hors des rainures en queue d\'aronde ; garder leur ordre.' },
  { t: 'Déposer le stator du 1er étage', r: 'OM 72-30-05 5.A(10)(a)', m: [[['stator1'], { dz: 2 }]],
    d: 'Six écrous et boulons qui le serrent au stator du 3e étage.' },
  { t: 'Extraire l\'entretoise du 1er étage', r: 'OM 72-30-05 5.A(10)(b)', m: [[['spacer1'], { dz: 2 }]],
    d: 'Extracteur PWC30501.' },
  { t: 'Retirer les aubes du 2e étage', r: 'OM 72-30-05 5.A(10)(c)', m: [[['blades2'], { dr: 2 }]],
    d: 'Trente-deux aubes en acier inoxydable cadmié.' },
  { t: 'Extraire le disque du 2e étage', r: 'OM 72-30-05 5.A(10)(d)', m: [[['disk2'], { dz: 2 }]],
    d: 'Extracteur PWC30487.' },
  { t: 'Extraire l\'entretoise du 2e étage', r: 'OM 72-30-05 5.A(10)(e)', m: [[['spacer2'], { dz: 2 }]],
    d: 'Extracteur PWC30422.' },
  { t: 'Séparer le stator du 2e étage du stator du 3e étage', r: 'OM 72-30-05 5.A(10)(f)', m: [[['stator2'], { dz: 2 }]],
    d: 'Le stator du 2e étage n\'était retenu qu\'entre les brides des 1er et 3e.' },
  { t: 'Extraire le disque et les aubes du 3e étage', r: 'OM 72-30-05 5.A(10)(g)', m: [[['disk3'], { dz: 2 }]],
    d: 'Extracteur PWC30487.' },
  { t: 'Soulever le stator du 3e étage et le carter du rouet, puis les séparer', r: 'OM 72-30-05 5.A(10)(h)–(i)', m: [[['stator3'], { dz: 3 }], [['imphsg'], { dz: 2 }]],
    d: 'Trois écrous et boulons les réunissent.' },
  { t: 'Extraire l\'entretoise du 3e étage', r: 'OM 72-30-05 5.A(10)(j)', m: [[['spacer3'], { dz: 2 }]],
    d: 'Extracteur PWC30422.' },
  { t: 'Extraire le joint d\'air tournant de la turbine compresseur', r: 'OM 72-30-05 5.A(10)(k)', m: [[['ctrseal'], { dz: -2 }]],
    d: 'Extracteur PWC30862, par l\'avant de l\'arbre.' },
  { t: 'Extraire la bague intérieure et les rouleaux du palier n° 2', r: 'OM 72-30-05 5.A(10)(l)', m: [[['brg2'], { dz: -2 }]],
    d: 'Extracteur PWC30489.' },
  { t: 'Retirer le joint d\'air tournant avant du compresseur, les contrepoids et leurs rondelles-freins', r: 'OM 72-30-05 5.A(10)(m)', m: [[['frontseal'], { dz: -2 }], [['cweights'], { dr: 1 }]],
    d: 'Noter la position des contrepoids (équilibrage du rotor).' },
  { t: 'Séparer l\'arbre avant du rouet', r: 'OM 72-30-05 5.A(10)', m: [[['stubshaft'], { dz: -2 }], [['impeller'], { dz: 1 }]],
    d: 'Extracteurs PWC30368 / PWC30367.' }
];
// vue éclatée sur l'axe (pt6a21-eclate.js) : carter du générateur de gaz fixe ; pièces déposées par l'avant devant lui,
// carter d'entrée et rotor (sorti par l'arrière) derrière lui, dans leur ordre réel
const ANCRE = 'ggcase';
const ORDRE = ['igniters', 'exciter', 'ctbolt', 'ctdisk', 'ctshroud', 'ctvane', 'smallduct', 'lockplate', 'cover2', 'largeduct', 'statorseal2', 'brg2o', 'liner', 'manif2', 'ggcase',
  // rotor : sorti d'un bloc derrière le carter (guidé par l'arbre avant), puis démonté de l'arrière vers l'avant ;
  // chaque pièce retirée se range au-delà du bloc, la première retirée le plus loin
  'stubshaft', 'cweights', 'frontseal', 'brg2', 'ctrseal', 'impeller', 'spacer3', 'imphsg', 'stator3', 'disk3', 'stator2', 'spacer2', 'disk2', 'blades2',
  'spacer1', 'stator1', 'blades1', 'rearhub', 'tierods', 'tienuts',
  'impring', 'brg1sp', 'rstseal', 'brg1', 'flexsup', 'brg1h', 'brg1nut', 'inlet', 'fairing', 'flangeF', 'screen', 'cplshaft', 'fsr', 'washring', 'fsc'];
const ORB = {}, HOST = { fdv: 'ggcase', manif1: 'ggcase', drains: 'ggcase', oilnoz2: 'ggcase', bleed: 'ggcase' };

update(0);
return { root, Z0, S, PART, ORDER, INFO, GROUPS, STEPS, ORDRE, ANCRE, ORB, HOST, TB_IDS, P, update, rotNg };
};
