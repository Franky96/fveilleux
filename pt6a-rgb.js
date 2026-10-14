/* =====================================================================
   Réducteur d'hélice PT6A-21 — modèle 3D détaillé
   Sources : AMM 72-10-00 (description, fig. 1 et 2), IPC 72-11 (fig. 1 à 7),
   OM 72-11 (démontage 5.A à 5.G, tableaux 601 à 605, fig. 601).
   Unités : pouces. z = distance vers l'arrière depuis la face de la bride d'hélice,
   r = rayon, h = position horaire vue de l'arrière (12 h en haut).
   ===================================================================== */
(function () {
'use strict';
window.addEventListener('error', e => {
  const v = document.getElementById('view');
  if (v && !v.querySelector('.err')) { const d = document.createElement('div'); d.className = 'loading err'; d.textContent = 'Erreur de chargement : ' + (e.message || 'script bloqué'); v.appendChild(d); }
});
if (typeof THREE === 'undefined') { document.getElementById('loading').textContent = 'Three.js n\'a pas pu être chargé (connexion internet requise).'; return; }
const { OrbitControls, RoomEnvironment } = THREE;
THREE.ColorManagement.legacyMode = false;

const S = 0.1, TAU = Math.PI * 2, Z0 = 7.4;
const AY = z => (Z0 - z) * S;                          // axe local Y : avant = +Y
const clockPhi = h => (h / 12) * TAU + Math.PI / 2;
const P = (r, z, h = 0) => { const f = clockPhi(h); return new THREE.Vector3(r * S * Math.sin(f), AY(z), r * S * Math.cos(f)); };
const RD = h => { const f = clockPhi(h); return new THREE.Vector3(Math.sin(f), 0, Math.cos(f)); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const fmt = (v, d = 0) => v.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d });

/* =====================================================================
   RAPPORTS DE RÉDUCTION — VALEURS PROVISOIRES, À CONFIRMER
   Les manuels consultés (AMM 72-10, IPC 72-11, OM 72-11) ne donnent ni rapport
   chiffré par étage ni nombre de dents ; seule la vitesse nominale de l'hélice,
   2 200 tr/min au décollage (AMM 72-10), est publiée. Modifier ici seulement :
   les nombres de dents de la géométrie sont recalculés à partir de ces rapports
   (train épicycloïdal à couronne fixe : rapport = 1 + couronne / planétaire).
   ===================================================================== */
const RAPPORT_ETAGE1 = 4.2;          // 1er étage (3 satellites) — à confirmer
const RAPPORT_ETAGE2 = 3.6;          // 2e étage (5 satellites) — à confirmer
const DENTS_PRISES = { roue: 46, pignon: 24 };   // couple conique des prises avant — à confirmer
const HELICE_TR_MIN = 2200;          // AMM 72-10 : vitesse nominale au décollage

/* nombres de dents entiers les plus proches du rapport demandé : couronne = planétaire + 2 × satellite,
   (planétaire + couronne) divisible par le nombre de satellites, couronne dans la plage du diamètre relevé */
function dentsPour(rapport, N, Rmin, Rmax) {
  let best = null;
  for (let s = 16; s <= 60; s++) for (let p = 10; p <= 70; p++) {
    const r = s + 2 * p; if (r < Rmin || r > Rmax || (s + r) % N) continue;
    const e = Math.abs(1 + r / s - rapport) + Math.abs(r - (Rmin + Rmax) / 2) * 1e-5;
    if (!best || e < best.e) best = { S: s, P: p, R: r, e };
  }
  return best;
}
const G1 = Object.assign({ N: 3, rr: 3.45, W: 1.39, zc: 10.2 }, dentsPour(RAPPORT_ETAGE1, 3, 95, 130));
const G2 = Object.assign({ N: 5, rr: 3.30, W: 1.185, zc: 8.05 }, dentsPour(RAPPORT_ETAGE2, 5, 60, 85));
for (const g of [G1, G2]) { g.m = 2 * g.rr / g.R; g.rs = g.S * g.m / 2; g.rp = g.P * g.m / 2; g.rc = g.rs + g.rp; g.i = 1 + g.R / g.S; }
const I_TOT = G1.i * G2.i;
const BEV = { Ng: DENTS_PRISES.roue, Np: DENTS_PRISES.pignon, rg: 2.05, zg: 3.85 };
BEV.gam = Math.atan(BEV.Ng / BEV.Np); BEV.L = BEV.rg / Math.sin(BEV.gam); BEV.za = BEV.zg + BEV.L * Math.cos(BEV.gam);
BEV.F = 0.5; BEV.k = (BEV.L - BEV.F) / BEV.L;
const NP_RPM = HELICE_TR_MIN, NF_RPM = NP_RPM * I_TOT, ACC_RPM = NP_RPM * BEV.Ng / BEV.Np;
const PROV = ' (provisoire)';

/* ---------- rendu ---------- */
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputEncoding = THREE.sRGBEncoding;
view.appendChild(renderer.domElement);
$('loading').remove();

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xcfe6f5, 0x1a1410, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0x88bbdd, 0.8); rim.position.set(4, 1, -4); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(0, -4, 2); scene.add(fill);

const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 200);
camera.position.set(-1.55, 0.95, 1.75);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.4; controls.maxDistance = 14;
controls.target.set(0, 0, 0);

const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let grid = null, gridY = -0.95;
function buildGrid() {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = new THREE.GridHelper(12, 48, new THREE.Color(cssVar('--scene-grid1') || '#24313b'), new THREE.Color(cssVar('--scene-grid2') || '#172026'));
  grid.position.y = gridY; grid.material.transparent = true; grid.material.opacity = parseFloat(cssVar('--scene-grid-op')) || 0.5;
  scene.add(grid);
}
buildGrid();

const root = new THREE.Group(); root.rotation.z = Math.PI / 2; scene.add(root);   // axe local Y -> monde -X (avant à gauche)

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
const darkMat = new THREE.MeshBasicMaterial({ color: 0x050607 });

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

/* ---------- engrenages à denture (profil en développante approché) ---------- */
function toothOutline(N, rp, internal) {
  const m = 2 * rp / N, ra = internal ? rp - m : rp + m, rf = internal ? rp + 1.25 * m : rp - 1.25 * m;
  const tp = Math.PI / (2 * N), out = [];
  const half = u => tp * (1.3 - 0.214 * u - 0.586 * u * u);
  const us = [0, 0.25, 0.5, 0.75, 1];
  for (let i = 0; i < N; i++) {
    const a = i * TAU / N;
    for (const u of us) out.push([lerp(rf, ra, u), a - half(u)]);
    for (let k = us.length - 1; k >= 0; k--) out.push([lerp(rf, ra, us[k]), a + half(us[k])]);
    out.push([rf, a + 2 * tp]);
  }
  return out.map(([r, a]) => new THREE.Vector2(r * S * Math.cos(a), r * S * Math.sin(a)));
}
function gearGeo(N, rp, w, o = {}) {
  let sh;
  if (o.internal) {
    sh = new THREE.Shape(); sh.absarc(0, 0, o.rOut * S, 0, TAU, false);
    sh.holes.push(new THREE.Path(toothOutline(N, rp, true)));
  } else {
    sh = new THREE.Shape(toothOutline(N, rp, false));
    if (o.bore) { const h = new THREE.Path(); h.absarc(0, 0, o.bore * S, 0, TAU, true); sh.holes.push(h); }
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: w * S, bevelEnabled: false, curveSegments: 40 });
  g.rotateX(-Math.PI / 2);                               // (x, y, z) -> (x, z, -y) : angle a -> (cos a, 0, -sin a)
  if (o.taper) {                                         // denture conique : rayon réduit vers +y
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 1 - o.taper * (p.getY(i) / (w * S)); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
    g.computeVertexNormals();
  } else g.translate(0, -w * S / 2, 0);
  return g;
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
  const ms = []; for (let i = 0; i < n; i++) { const phi = (o.phi0 || 0) + i * TAU / n; if (o.skip && o.skip(i, phi)) continue; ms.push(axM(r, z, phi)); }
  return inst(g, ms, o.mat || boltMat(id), parent || PART[id].g, 'bolt');
}
function studRing(id, parent, list, rad, len, o = {}) {       // goujons radiaux [r, z, phi]
  const g = new THREE.CylinderGeometry(rad * S, rad * S, len * S, 10); g.translate(0, len * S / 2, 0);
  return inst(g, list.map(([r, z, phi]) => radM(r, z, phi)), o.mat || boltMat(id), parent || PART[id].g, 'bolt');
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
function extrudeRZ(parent, mat, h, pts, wid) {               // profil (z, r) extrudé tangentiellement à la position h
  const sh = new THREE.Shape(pts.map(([z, r]) => new THREE.Vector2(r * S, AY(z))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: wid * S, bevelEnabled: false }); g.translate(0, 0, -wid * S / 2);
  const m = new THREE.Mesh(g, mat); m.rotation.y = clockPhi(h) - Math.PI / 2; parent.add(m); return m;
}
function tubeRZH(parent, mat, pts, rad, seg = 80) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([r, z, h]) => P(r, z, h)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, rad * S, 10), mat); parent.add(m); return m;
}
function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
const perfTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; for (let y = 8; y < h; y += 16) for (let x = (y % 32 === 8 ? 4 : 12); x < w; x += 16) { g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill(); } }, 6, 3);

/* ---------- roulement générique ---------- */
function bearing(id, parent, rIn, rOut, z0, z1, n, roller, o = {}) {
  const mR = o.mRace || M(id, { color: 0xdadddf, metalness: 1, roughness: 0.18 });
  const mE = o.mEl || M(id, { color: 0xf1f3f4, metalness: 1, roughness: 0.08 });
  const mC = o.mCage || M(id, { color: 0xc89b4a, metalness: 0.9, roughness: 0.3 });
  const w = z1 - z0, t = (rOut - rIn) * 0.2, zm = (z0 + z1) / 2;
  lathe(id, [[rIn, z0], [rIn + t, z0], [rIn + t, zm - w * 0.3], [rIn + t * 0.75, zm], [rIn + t, zm + w * 0.3], [rIn + t, z1], [rIn, z1]], mR, parent, 64);
  const fl = o.flange ? [[rOut, z0], [o.flange, z0], [o.flange, z0 + o.flangeW], [rOut, z0 + o.flangeW]] : [[rOut, z0]];
  lathe(id, [...fl, [rOut, z1], [rOut - t, z1], [rOut - t, zm + w * 0.3], [rOut - t * 0.75, zm], [rOut - t, zm - w * 0.3], [rOut - t, z0]], mR, parent, 64);
  const rm = (rIn + rOut) / 2, re = (rOut - rIn) / 2 - t * 0.8;
  const g = roller ? new THREE.CylinderGeometry(re * S, re * S, w * 0.66 * S, 14) : new THREE.SphereGeometry(re * S, 16, 10);
  const ms = []; for (let i = 0; i < n; i++) ms.push(axM(rm, zm, i * TAU / n)); inst(g, ms, mE, parent);
  for (const dz of [-0.36, 0.36]) lathe(id, ringPts(rm - re * 0.5, rm + re * 0.5, zm + dz * w - 0.02, zm + dz * w + 0.02), mC, parent, 48);
}

/* =====================================================================
   FICHES DES PIÈCES (textes rédigés d'après les manuels)
   ===================================================================== */
const GROUPS = [
  ['case', 'Carters et fixations'], ['s1', '1er étage et couplemètre'], ['s2', '2e étage'],
  ['shaft', 'Arbre d\'hélice et lubrification'], ['acc', 'Prises avant et accessoires'], ['mon', 'Surveillance et tuyauterie']
];
const INFO = {
  fronthsg: { g: 'case', n: 'Carter avant', ref: 'AMM 72-10-00 · IPC 72-11 fig. 5 · OM 72-11 5.D, 5.G',
    d: 'Moulage en alliage de magnésium, boulonné au carter arrière à la bride A. Il loge le 2e étage, l\'arbre d\'hélice et ses roulements et les trois prises d\'entraînement avant. Une cloison interne porte le roulement à rouleaux et les cannelures de la couronne du 2e étage ; la quille inférieure recueille l\'huile (crépine à l\'avant, détecteur de limaille à 6 h).',
    k: [['Matériau', 'alliage de magnésium'], ['Centrage à la bride A', 'Ø 12,279–12,281 po'], ['Plages d\'accessoires', '12 h, ≈ 3 h, ≈ 9 h'], ['Couple boulons de carter', '75–85 lb·po']] },
  rearhsg: { g: 'case', n: 'Carter arrière', ref: 'AMM 72-10-00 · IPC 72-11 fig. 6 · OM 72-11 fig. 101',
    d: 'Cône en alliage de magnésium logé dans le conduit d\'échappement. Il contient le 1er étage et le couplemètre : cannelures hélicoïdales internes pour la couronne, fourreau du tiroir du couplemètre, et deux paliers lisses à collerette (montés serrés) qui portent le manchon arrière du porte-satellites.',
    k: [['Centrage à la bride A', 'Ø 12,279–12,281 po'], ['Paliers du porte-satellites', '2 × à collerette, Ø 2,344 po'], ['Fourreau du tiroir', 'Ø int. 0,4395–0,4398 po'], ['Couple boulons', '45–55 lb·po']] },
  flangeA: { g: 'case', n: 'Boulonnerie de la bride A', ref: 'IPC 72-11 fig. 1 (rep. 10, 20, 40, 50)',
    d: 'La bride A réunit le carter avant, le carter arrière et le conduit d\'échappement. Les boulons à tête hexagonale reçoivent rondelles et écrous côté arrière.',
    k: [['Boulons', '36 (29 + 7 plus longs)'], ['Rondelles / écrous', '36 / 36']] },
  bracket: { g: 'case', n: 'Ferrure de levage et de support', ref: 'IPC 72-11 fig. 1 (rep. 30)',
    d: 'Ferrure boulonnée en haut de la bride A, utilisée pour lever le moteur et supporter des accessoires.', k: [['Quantité', '1']] },

  input: { g: 's1', n: 'Accouplement de la turbine de puissance', ref: 'AMM 72-10-00 (section de puissance 72-50)',
    d: 'Extrémité avant de l\'arbre de la turbine de puissance. Ses cannelures intérieures reçoivent les cannelures arrière du planétaire du 1er étage, retenu par deux joncs. Pièce de la section de puissance, montrée ici pour comprendre l\'entrée du couple.',
    k: [['Vitesse', `Nf ≈ ${fmt(NF_RPM)} tr/min${PROV}`], ['Sens', 'horaire vu de l\'arrière']] },
  sun1: { g: 's1', n: 'Planétaire du 1er étage', ref: 'AMM 72-10-00',
    d: 'Court arbre creux en acier : denture droite intégrée à l\'avant, cannelures à l\'arrière engagées dans l\'accouplement de la turbine. Il entraîne les trois satellites du 1er étage.',
    k: [['Dents', `${G1.S} (à confirmer)`], ['Diamètre primitif', `${fmt(2 * G1.rs, 2)} po (modèle)`], ['Vitesse', `${fmt(NF_RPM)} tr/min${PROV}`]] },
  planets1: { g: 's1', n: 'Satellites du 1er étage (× 3)', ref: 'IPC 72-11 fig. 4 · OM tabl. 601 réf. 14 à 19',
    d: 'Jeu de trois satellites appairés, chacun sur un palier lisse, un arbre et un axe creux. Depuis le SB1397, l\'axe porte une crépine d\'huile retenue par une clavette-disque.',
    k: [['Nombre', '3 (jeu appairé)'], ['Dents', `${G1.P} (à confirmer)`], ['Largeur de denture', '1,3865–1,3895 po'], ['Vis d\'axe', '700–850 lb·po'], ['Rapport du 1er étage', `${fmt(G1.i, 3)} (à confirmer)`]] },
  carrier1: { g: 's1', n: 'Porte-satellites du 1er étage', ref: 'IPC 72-11 fig. 4 · OM 72-11 5.A',
    d: 'Ensemble équilibré : flasques porte-axes, manchon arrière tournant dans les paliers du carter arrière (arrêté par une rondelle de butée et un jonc), adaptateur cannelé à l\'avant serré par un écrou à rondelle-frein.',
    k: [['Ø du manchon', '2,1215–2,1225 po'], ['Écrou de retenue', '2 100–2 300 lb·po'], ['Vitesse', `${fmt(NF_RPM / G1.i)} tr/min${PROV}`]] },
  ring1: { g: 's1', n: 'Couronne du 1er étage', ref: 'AMM 72-10-00 · IPC 72-11 fig. 4 (rep. 230, 240)',
    d: 'Couronne à denture intérieure, tenue dans le carter arrière par des cannelures hélicoïdales extérieures. Elle ne tourne pas mais peut coulisser axialement entre le carter et ses trois plaques de retenue : c\'est ce mouvement qui actionne le couplemètre.',
    k: [['Dents', `${G1.R} (à confirmer)`], ['Plaques de retenue', '3 (6 boulons)'], ['Position', 'fixe en rotation']] },
  tqpiston: { g: 's1', n: 'Piston du couplemètre', ref: 'AMM 72-10-00 fig. 2 · IPC 72-11 fig. 4 (rep. 260 à 280)',
    d: 'Piston annulaire poussé par la couronne du 1er étage ; deux segments non métalliques assurent l\'étanchéité de la chambre.',
    k: [['Segments', '2 (non métalliques)']] },
  torquemeter: { g: 's1', n: 'Cylindre et tiroir du couplemètre', ref: 'AMM 72-10-00 fig. 2 · IPC 72-11 fig. 4 (rep. 290 à 330)',
    d: 'Cylindre boulonné au carter arrière (8 boulons) formant la chambre du couplemètre. En haut, le tiroir et son ressort dosent l\'huile moteur admise ; un orifice de fuite en haut du cylindre évite le blocage hydraulique.',
    k: [['Ressort du tiroir', '1,75–2,25 lb à 0,820 po'], ['Jeu tiroir / fourreau', '0,0015–0,0020 po'], ['Couple', '30,87 lb·pi par psi (AMM 71-00)']] },
  flexcpl: { g: 's1', n: 'Adaptateur cannelé et accouplement flexible', ref: 'AMM 72-10-00 · IPC 72-11 fig. 4 · OM 72-11 5.A(6)',
    d: 'Relie le porte-satellites du 1er étage au planétaire du 2e étage et amortit les vibrations entre les deux masses tournantes. Déposé d\'un bloc avec le planétaire du 2e étage après l\'écrou de retenue.',
    k: [['Vitesse', `${fmt(NF_RPM / G1.i)} tr/min${PROV}`], ['Joncs', '4 (+ butée de planétaire post-SB1367)']] },

  sun2: { g: 's2', n: 'Planétaire du 2e étage', ref: 'IPC 72-11 fig. 4 (rep. 10)',
    d: 'Entraîné par l\'accouplement flexible, il attaque les cinq satellites du 2e étage. Le tube de transfert d\'huile de l\'arbre d\'hélice passe dans son alésage.',
    k: [['Dents', `${G2.S} (à confirmer)`], ['Vitesse', `${fmt(NF_RPM / G1.i)} tr/min${PROV}`]] },
  planets2: { g: 's2', n: 'Satellites du 2e étage (× 5)', ref: 'IPC 72-11 fig. 3 (rep. 290 à 395) · OM tabl. 601',
    d: 'Cinq satellites sur paliers lisses, arbres et axes avec crépine d\'huile. On les monte par jeu de cinq de même classe (épaisseur cordale de dent) et l\'extrémité marquée « UP » du bon côté.',
    k: [['Nombre', '5'], ['Dents', `${G2.P} (à confirmer)`], ['Rapport du 2e étage', `${fmt(G2.i, 3)} (à confirmer)`], ['Largeur de denture', '1,182–1,188 po'], ['Classes', 'épaisseur cordale 0,1690–0,1710 po'], ['Vis d\'axe', '700–850 lb·po']] },
  carrier2: { g: 's2', n: 'Porte-satellites du 2e étage', ref: 'AMM 72-10-00 · IPC 72-11 fig. 3 (rep. 230 à 280)',
    d: 'Cannelé sur l\'arrière de l\'arbre d\'hélice et serré par un écrou et une rondelle-frein. Son prolongement avant porte la bague intérieure du roulement à rouleaux ; cinq buses d\'huile arrosent les engrènements.',
    k: [['Buses d\'huile', '5'], ['Portée de roulement', 'Ø 3,1482–3,1490 po'], ['Vitesse', `${fmt(NP_RPM)} tr/min (hélice, AMM 72-10)`]] },
  ring2: { g: 's2', n: 'Couronne du 2e étage', ref: 'AMM 72-10-00 · IPC 72-11 fig. 3 (rep. 400 à 430)',
    d: 'Couronne à denture intérieure, positionnée par des cannelures dans le carter avant et retenue par trois plaques boulonnées.',
    k: [['Dents', `${G2.R} (à confirmer)`], ['Plaques de retenue', '3']] },
  rollerbrg: { g: 's2', n: 'Roulement à rouleaux à bride', ref: 'AMM 72-10-00 · OM tabl. 601 réf. 34, 35',
    d: 'Soutient le porte-satellites du 2e étage et l\'arrière de l\'arbre d\'hélice. Bague intérieure sur le prolongement usiné du porte-satellites ; bague extérieure à bride boulonnée (4 boulons) sur une cloison du carter avant.',
    k: [['Ø extérieur', '4,3697–4,3701 po'], ['Ø intérieur', '3,1496–3,1500 po']] },

  propshaft: { g: 'shaft', n: 'Arbre d\'hélice et bride', ref: 'AMM 72-10-00 · IPC 72-11 fig. 3 (rep. 90 à 120)',
    d: 'Arbre creux à bride d\'hélice (goujons de centrage). Il porte, de l\'avant vers l\'arrière, la bague de joint, le roulement de butée, la cale, le pignon conique et l\'écrou, puis le manchon de transfert d\'huile et, à l\'arrière, le porte-satellites du 2e étage.',
    k: [['Ø au roulement de butée', '2,9534–2,9539 po'], ['Vitesse', `${fmt(NP_RPM)} tr/min nominal au décollage (AMM 72-10)`], ['Sens', 'horaire vu de l\'arrière'], ['Revêtement', 'époxy aluminium (post-SB1563)']] },
  runner: { g: 'shaft', n: 'Bague de joint d\'arbre', ref: 'AMM 72-10-00 fig. 201 · IPC 72-11 fig. 3 (rep. 150)',
    d: 'Bague tournante sur laquelle frotte la lèvre du joint d\'hélice. Une rainure d\'usure peut justifier un joint décalé (IPC).',
    k: [['Ø sur l\'arbre', '2,9542–2,9547 po (post-SB1426)']] },
  thrustbrg: { g: 'shaft', n: 'Roulement de butée à billes', ref: 'AMM 72-10-00 · IPC 72-11 fig. 2 (rep. 200)',
    d: 'Roulement à billes à bride : il reprend la traction de l\'hélice. Sa bride est serrée entre le carter avant et le couvercle de butée.',
    k: [['Ø extérieur', '5,1176–5,1181 po'], ['Ø intérieur', '2,9524–2,9528 po']] },
  cover: { g: 'shaft', n: 'Couvercle de butée et joint d\'hélice', ref: 'AMM 72-10-00 fig. 201, 202 · IPC 72-11 fig. 2',
    d: 'Couvercle boulonné sur la bride avant du carter. Il loge le joint d\'arbre à ressort jarretière, tenu par une bague ou deux demi-bagues (bandes de feutre post-SB1381) et 8 boulons freinés par paires. Des tubes amènent la pression sur la face avant du roulement ; un mamelon de vidange est en bas.',
    k: [['Écrous du couvercle', '8, 145–165 lb·po'], ['Boulons de bague', '8, 24–36 lb·po'], ['Joint', 'préchauffé à 93 °C max. au montage']] },
  oilxfer: { g: 'shaft', n: 'Transfert d\'huile d\'hélice', ref: 'AMM 72-10-00 · IPC 72-11 fig. 3 (rep. 10 à 80, 120 à 126)',
    d: 'Manchon et boîtier de transfert sur l\'arbre (deux sources d\'huile), adaptateur et tube de transfert dans l\'alésage de l\'arbre, buse du palier n° 4 à l\'arrière. L\'avant du manchon reçoit l\'huile du régulateur pour le pas d\'hélice, l\'arrière l\'huile moteur.',
    k: [['Sources', 'huile moteur + régulateur d\'hélice'], ['Joints', '3 garnitures (post-SB1393)']] },

  bevel: { g: 'acc', n: 'Pignon conique des prises avant', ref: 'AMM 72-10-00 · IPC 72-11 fig. 3 (rep. 160 à 190)',
    d: 'Monté sur l\'arbre d\'hélice derrière le roulement de butée, avec sa cale de réglage, et serré par un écrou à créneaux (filet à gauche après le SB1426). Il entraîne les trois arbres-pignons des prises avant.',
    k: [['Dents', `${BEV.Ng} (à confirmer)`], ['Écrou', '2 300–2 500 lb·po'], ['Jeu avec les pignons', '0,009–0,014 po']] },
  drv_gov: { g: 'acc', n: 'Prise du régulateur d\'hélice (12 h)', ref: 'IPC 72-11 fig. 3 (rep. 500 à 520) · OM fig. 601',
    d: 'Arbre-pignon conique, accouplement d\'entraînement et cale de réglage sous la plage supérieure à 4 goujons.',
    k: [['Vitesse', `${fmt(ACC_RPM)} tr/min${PROV}`], ['Écrous du régulateur', '125–135 lb·po']] },
  drv_nf: { g: 'acc', n: 'Prise de la génératrice tachymétrique Nf (≈ 3 h)', ref: 'IPC 72-11 fig. 3 (rep. 455 à 480) · OM 72-11 5.D(2)',
    d: 'Arbre-pignon conique de la génératrice tachymétrique Nf. La plage porte un porte-joint d\'huile avec joint plat.',
    k: [['Vitesse', `${fmt(ACC_RPM)} tr/min${PROV}`]] },
  drv_ovs: { g: 'acc', n: 'Prise du régulateur de survitesse (≈ 9 h)', ref: 'IPC 72-11 fig. 3 (rep. 500 à 520)',
    d: 'Arbre-pignon conique et accouplement d\'entraînement du régulateur de survitesse d\'hélice.',
    k: [['Vitesse', `${fmt(ACC_RPM)} tr/min${PROV}`], ['Écrous du couvercle', '170–190 lb·po']] },
  acc_gov: { g: 'acc', n: 'Régulateur d\'hélice', ref: 'Accessoire (installation avion) · AMM 76-10',
    d: 'Régulateur à masselottes monté sur la plage de 12 h. Il fournit l\'huile de commande du pas, amenée à l\'avant du manchon de transfert. Forme figurée.', k: [['Plage', '12 h']] },
  acc_nf: { g: 'acc', n: 'Génératrice tachymétrique Nf', ref: 'Accessoire (installation avion)',
    d: 'Génératrice qui fournit l\'indication de vitesse de la turbine libre / de l\'hélice. Forme figurée.', k: [['Plage', '≈ 3 h']] },
  acc_ovs: { g: 'acc', n: 'Régulateur de survitesse', ref: 'Accessoire (installation avion)',
    d: 'Régulateur de secours qui limite la survitesse de l\'hélice. Forme figurée.', k: [['Plage', '≈ 9 h']] },

  chip: { g: 'mon', n: 'Détecteur de limaille magnétique (6 h)', ref: 'AMM 72-10-00 (5.D, 7.E) · IPC 72-11 fig. 7',
    d: 'Aimant à deux pôles vissé dans le bossage de 6 h : des particules ferreuses ferment le circuit et peuvent allumer un voyant. Les bandes témoins vérifient le sertissage du connecteur. Avant le SB1217, un simple bouchon de vidange.',
    k: [['Couple', '45–55 lb·po (se fissure si trop serré)'], ['Couvercle', 'serré à la main, freiné']] },
  strainer: { g: 'mon', n: 'Crépine d\'huile de récupération', ref: 'AMM 72-10-00 fig. 203 · IPC 72-11 fig. 1 (rep. 340 à 380)',
    d: 'Crépine logée dans un passage venu de fonderie à l\'avant du carter avant, fermée par un bouchon tenu par un boulon. À nettoyer au solvant et à examiner pour les particules.',
    k: [['Boulon du bouchon', '36–40 lb·po'], ['Extraction', 'extracteur PWC57233']] },
  tube_oil: { g: 'mon', n: 'Tube de transfert d\'huile', ref: 'IPC 72-11 fig. 1 (rep. 200 à 280) · OM 5.D(3)–(4)',
    d: 'Tube à garnitures et bagues d\'appui qui amène l\'huile moteur sous pression vers la galerie de transfert ; fermé par un couvercle à deux boulons.', k: [['Garnitures', '2 + 2 bagues d\'appui']] },
  tube_prop: { g: 'mon', n: 'Tube de transfert d\'huile d\'hélice', ref: 'IPC 72-11 fig. 1 (rep. 290 à 330) · OM 5.D(5)',
    d: 'Tube à bride (2 boulons) qui alimente le boîtier de transfert d\'huile d\'hélice.', k: [['Garnitures', '3']] },
  tqconn: { g: 'mon', n: 'Raccord du transmetteur de couple', ref: 'AMM 72-10-00 · IPC 72-11 fig. 1 (rep. 70 à 90)',
    d: 'Bossages en haut du carter avant où sortent la pression du couplemètre et la pression interne du réducteur ; leur différence donne le couple.', k: [['Boulons', '2']] }
};

/* =====================================================================
   MATÉRIAUX COMMUNS PAR PIÈCE + CONSTRUCTION
   ===================================================================== */
for (const id of Object.keys(INFO)) part(id, { kind: ['fronthsg', 'rearhsg', 'flangeA', 'bracket', 'cover', 'acc_gov', 'acc_nf', 'acc_ovs', 'chip', 'strainer', 'tube_oil', 'tube_prop', 'tqconn'].includes(id) ? 'case' : 'int' });
const spin = {};                                         // groupes tournants
function spinner(id) { const s = new THREE.Group(); PART[id].g.add(s); return (spin[id] = s); }

/* ---------- carter avant ---------- */
{
  const g = PART.fronthsg.g;
  const mF = M('fronthsg', { color: 0x5f6b71, metalness: 0.35, roughness: 0.58 });
  const mFi = M('fronthsg', { color: 0x535e64, metalness: 0.35, roughness: 0.62 });
  lathe('fronthsg', [[2.56, 2.45], [3.45, 2.45], [3.45, 2.75], [3.15, 2.85], [3.15, 5.4], [3.6, 5.6], [4.6, 6.4], [5.7, 7.35], [6.2, 7.72], [6.6, 7.78], [6.6, 8.1],
    [6.14, 8.1], [6.14, 7.98], [5.92, 7.92], [5.45, 7.5], [4.38, 6.62], [3.95, 6.28], [2.19, 6.28], [2.19, 6.0], [3.8, 6.0], [3.38, 5.72], [2.95, 5.5], [2.95, 3.35], [2.56, 3.3]], mF, g, 120);
  // cloison cannelée de la couronne du 2e étage (IPC fig. 5)
  lathe('fronthsg', [[3.95, 7.22], [5.25, 7.22], [5.36, 7.45], [4.12, 7.45], [4.12, 8.72], [3.95, 8.72]], mFi, g, 96);
  { const sp = new THREE.BoxGeometry(0.11 * S, 0.1 * S, 1.3 * S), ms = []; for (let i = 0; i < 72; i++) ms.push(radM(3.9, 8.05, i * TAU / 72 + TAU / 144)); inst(sp, ms, mFi, g); }
  // plages : régulateur d'hélice (12 h), génératrice Nf (≈ 3 h), régulateur de survitesse (≈ 9 h)
  radialBox(g, mF, 0, 2.95, 3.88, BEV.za - 1.15, BEV.za + 1.2, 3.1);
  radialBox(g, mF, 0, 3.86, 3.92, BEV.za - 1.05, BEV.za + 1.1, 2.9);
  for (const h of [3, 9]) { radialBox(g, mF, h, 2.95, 3.74, BEV.za - 0.95, BEV.za + 0.95, 2.5); }
  const studs = [];
  for (const [dx, dz] of [[-1.12, -0.82], [1.12, -0.82], [-1.12, 0.86], [1.12, 0.86]]) { const phi = clockPhi(0) + dx / 3.9; studs.push([3.92, BEV.za + dz, phi]); }
  for (const h of [3, 9]) for (const [dx, dz] of [[-0.9, -0.68], [0.9, -0.68], [-0.9, 0.68], [0.9, 0.68]]) studs.push([3.74, BEV.za + dz, clockPhi(h) + dx / 3.74]);
  studRing('fronthsg', g, studs, 0.16, 1.0);
  // porte-joint de la plage Nf (OM 5.D(2))
  radialCyl(g, mFi, 3, 3.6, 3.95, BEV.za, 0.62, 28);
  // quille inférieure : passage de récupération, crépine et détecteur de limaille
  extrudeRZ(g, mF, 6, [[2.75, 3.0], [2.75, 3.45], [4.0, 4.4], [5.3, 5.05], [6.6, 5.35], [7.75, 5.45], [7.75, 4.6], [6.6, 4.2], [5.5, 3.6], [4.3, 3.0]], 2.7);
  axialCyl(g, mF, 4.3, 6.25, 0.55, 3.45, 4.4, 28);             // bossage de la crépine
  radialCyl(g, mF, 6, 5.2, 5.5, 6.9, 0.58, 28);                 // bossage du détecteur
  // nervures du cône
  for (let i = 0; i < 10; i++) { const h = 0.6 + i * 1.2; if ([0, 3, 6, 9].some(x => Math.abs(((h - x + 18) % 12) - 6) > 5.4)) continue; extrudeRZ(g, mF, h, [[5.5, 3.5], [7.75, 6.25], [7.75, 6.45], [5.5, 3.75]].map(([z, r]) => [z, r]), 0.22); }
  // bossages des tubes extérieurs et du transmetteur de couple
  radialCyl(g, mF, 11, 3.7, 4.15, 5.95, 0.42, 20);
  radialCyl(g, mF, 1.1, 3.75, 4.3, 6.2, 0.4, 20);
  radialCyl(g, mF, 5.35, 3.0, 3.6, 5.25, 0.45, 20);
}
/* ---------- boulonnerie de la bride A ---------- */
{
  const g = PART.flangeA.g, mb = M('flangeA', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  const head = new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 0.17 * S, 6), shank = new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 1.05 * S, 8), nut = new THREE.CylinderGeometry(0.19 * S, 0.19 * S, 0.2 * S, 6);
  const mH = [], mS = [], mN = [];
  for (let i = 0; i < 36; i++) { const phi = i * TAU / 36 + TAU / 72; mH.push(axM(6.4, 7.7, phi)); mS.push(axM(6.4, 8.2, phi)); mN.push(axM(6.4, 8.5, phi)); }
  inst(head, mH, mb, g, 'bolt'); inst(shank, mS, mb, g, 'bolt'); inst(nut, mN, mb, g, 'bolt');
}
/* ---------- ferrure de levage ---------- */
{
  const g = PART.bracket.g, mB = M('bracket', { color: 0x59646a, metalness: 0.5, roughness: 0.45 });
  const sh = new THREE.Shape(); sh.moveTo(-1.6 * S, 0); sh.lineTo(1.6 * S, 0); sh.lineTo(1.2 * S, 1.6 * S); sh.lineTo(0.5 * S, 2.3 * S); sh.lineTo(-0.9 * S, 2.3 * S); sh.lineTo(-1.6 * S, 1.2 * S); sh.closePath();
  for (const [x, y, r] of [[0, 1.6, 0.28], [-0.9, 0.9, 0.2], [0.9, 0.9, 0.2]]) { const hl = new THREE.Path(); hl.absarc(x * S, y * S, r * S, 0, TAU, true); sh.holes.push(hl); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.22 * S, bevelEnabled: false });
  const m = new THREE.Mesh(geo, mB); const phi = clockPhi(1.15);
  // plan de la plaque perpendiculaire à l'axe, en avant de la bride A
  const ey = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)), ez = new THREE.Vector3(0, 1, 0), ex = new THREE.Vector3().crossVectors(ey, ez);
  m.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(P(5.9, 7.56, 1.15)));
  g.add(m);
  boltRing('bracket', g, 6.4, 7.5, 3, 0.2, { phi0: phi - 0.17, mat: boltMat('bracket'), skip: (i) => false });
}

/* ---------- carter arrière ---------- */
{
  const g = PART.rearhsg.g;
  const mR = M('rearhsg', { color: 0x6b767c, metalness: 0.35, roughness: 0.58 });
  const mRi = M('rearhsg', { color: 0x5c676d, metalness: 0.35, roughness: 0.62 });
  const mBz = M('rearhsg', { color: 0xc89b4a, metalness: 0.85, roughness: 0.32 });
  lathe('rearhsg', [[6.6, 8.1], [6.6, 8.4], [6.3, 8.47], [5.2, 9.6], [4.55, 10.6], [4.3, 11.6], [3.15, 12.2], [2.45, 12.5], [2.75, 12.55], [2.75, 12.85], [1.172, 12.85],
    [1.172, 11.52], [4.02, 11.52], [4.02, 9.35], [4.3, 9.35], [4.3, 10.2], [4.75, 9.75], [5.95, 8.55], [6.14, 8.42], [6.14, 8.1]], mR, g, 120);
  // cannelures hélicoïdales internes (logement de la couronne du 1er étage)
  { const sp = new THREE.BoxGeometry(0.1 * S, 0.09 * S, 1.75 * S), tw = new THREE.Matrix4().makeRotationY(0.32), ms = [];
    for (let i = 0; i < 64; i++) ms.push(radM(3.975, 10.45, i * TAU / 64 + TAU / 128, tw)); inst(sp, ms, mRi, g); }
  // paliers lisses à collerette du manchon de porte-satellites (montés serrés)
  lathe('rearhsg', [[1.062, 11.56], [1.172, 11.56], [1.172, 12.14], [1.062, 12.14]], mBz, g, 48);
  lathe('rearhsg', [[1.062, 12.24], [1.172, 12.24], [1.172, 12.85], [1.4, 12.85], [1.4, 12.93], [1.062, 12.93]], mBz, g, 48);
  // goujons étagés de la bride arrière (12)
  const st = []; for (let i = 0; i < 12; i++) st.push(axM(2.3, 13.1, i * TAU / 12));
  inst(new THREE.CylinderGeometry(0.12 * S, 0.12 * S, 0.5 * S, 8), st, boltMat('rearhsg'), g, 'bolt');
  // bossage du fourreau de tiroir du couplemètre (12 h)
  axialCyl(g, mR, 3.86, 0, 0.36, 11.3, 12.15, 24);
}

/* ---------- 1er étage : planétaire, accouplement de turbine ---------- */
{
  const s = spinner('sun1'), mS = M('sun1', { color: 0xd3d7d9, metalness: 1, roughness: 0.22 });
  const gm = new THREE.Mesh(gearGeo(G1.S, G1.rs, G1.W, { bore: 0.5 }), mS); gm.position.y = AY(G1.zc); s.add(gm);
  lathe('sun1', [[0.5, G1.zc + G1.W / 2], [0.72, G1.zc + G1.W / 2], [0.72, 14.45], [0.5, 14.45]], mS, s, 48);
  const sp = new THREE.BoxGeometry(0.08 * S, 0.07 * S, 0.7 * S), ms = []; for (let i = 0; i < 24; i++) ms.push(radM(0.75, 13.75, i * TAU / 24)); inst(sp, ms, mS, s);
  const si = spinner('input'), mI = M('input', { color: 0x8f8478, metalness: 0.85, roughness: 0.38 });
  lathe('input', [[0.79, 13.2], [1.15, 13.2], [1.15, 14.5], [0.85, 14.65], [0.62, 14.65], [0.62, 16.4], [0.4, 16.4], [0.4, 14.5], [0.79, 14.4]], mI, si, 48);
  const mRg = M('input', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  for (const z of [13.15, 14.42]) lathe('input', ringPts(0.72, 0.82, z - 0.03, z + 0.03), mRg, si, 32);
}
/* ---------- 1er étage : satellites ---------- */
const planets1 = [], planets2 = [];
function buildPlanets(id, G, arr, color) {
  const mP = M(id, { color, metalness: 1, roughness: 0.24 }), mB = M(id, { color: 0xc89b4a, metalness: 0.85, roughness: 0.32 }), mPin = M(id, { color: 0xa9b0b5, metalness: 0.9, roughness: 0.3 });
  const geo = gearGeo(G.P, G.rp, G.W, { bore: 0.69 });
  const strainer = new THREE.MeshStandardMaterial({ color: 0xb8bfc4, metalness: 0.9, roughness: 0.35, alphaMap: perfTex, alphaTest: 0.5, side: THREE.DoubleSide });
  strainer.userData = { kind: 'int', part: id, baseOpacity: 1, baseTransparent: false, baseEmissive: strainer.emissive.clone() }; PART[id].mats.push(strainer);
  for (let i = 0; i < G.N; i++) {
    const hold = new THREE.Group(); PART[id].g.add(hold);
    const gm = new THREE.Mesh(geo, mP); hold.add(gm);
    const brg = new THREE.Mesh(revolve([[0.52, -G.W / 2 + G.zc - 0.0], [0.69, -G.W / 2 + G.zc], [0.69, G.W / 2 + G.zc], [0.52, G.W / 2 + G.zc]].map(([r, z]) => [r, z]), 32), mB);
    brg.position.y = -AY(G.zc); hold.add(brg);
    const pin = new THREE.Mesh(revolve([[0.2, G.zc - G.W / 2 - 0.3], [0.4, G.zc - G.W / 2 - 0.3], [0.4, G.zc + G.W / 2 + 0.3], [0.2, G.zc + G.W / 2 + 0.3]], 24), mPin);
    pin.position.y = -AY(G.zc); hold.add(pin);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * S, 0.19 * S, (G.W + 0.4) * S, 16, 1, true), strainer); hold.add(st);
    hold.userData.theta0 = i * TAU / G.N;
    arr.push(hold);
  }
}
buildPlanets('planets1', G1, planets1, 0xd0d4d6);
buildPlanets('planets2', G2, planets2, 0xc3c8cb);

/* ---------- porte-satellites (flasques, entretoises, axes) ---------- */
function lobedPlate(N, rc, lobeR, hubR, boreR, w) {
  const sh = new THREE.Shape(), steps = 120;
  for (let i = 0; i <= steps; i++) {
    const a = i / steps * TAU;
    let r = hubR;
    for (let k = 0; k < N; k++) { const ak = k * TAU / N, d = Math.atan2(Math.sin(a - ak), Math.cos(a - ak)); const x = rc * Math.cos(d), y = rc * Math.sin(d) * 0 + 0; const half = Math.asin(Math.min(1, lobeR / rc)); if (Math.abs(d) < half) r = Math.max(r, rc * Math.cos(d) + Math.sqrt(Math.max(0, lobeR * lobeR - (rc * Math.sin(d)) ** 2))); }
    const v = new THREE.Vector2(r * S * Math.cos(a), r * S * Math.sin(a)); i ? sh.lineTo(v.x, v.y) : sh.moveTo(v.x, v.y);
  }
  const hl = new THREE.Path(); hl.absarc(0, 0, boreR * S, 0, TAU, true); sh.holes.push(hl);
  for (let k = 0; k < N; k++) { const a = k * TAU / N, h = new THREE.Path(); h.absarc(rc * S * Math.cos(a), rc * S * Math.sin(a), 0.41 * S, 0, TAU, true); sh.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: w * S, bevelEnabled: true, bevelSize: 0.03 * S, bevelThickness: 0.03 * S, bevelSegments: 1, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); g.translate(0, -w * S / 2, 0); return g;
}
{ // porte-satellites du 1er étage (triangulaire, IPC fig. 4)
  const s = spinner('carrier1'), mC = M('carrier1', { color: 0xaab2b7, metalness: 0.85, roughness: 0.32 }), mN = M('carrier1', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.28 });
  const fr = new THREE.Mesh(lobedPlate(3, G1.rc, 0.72, 1.75, 1.15, 0.3), mC); fr.position.y = AY(9.3); s.add(fr);
  const rr = new THREE.Mesh(lobedPlate(3, G1.rc, 0.62, 1.7, 0.78, 0.3), mC); rr.position.y = AY(11.1); s.add(rr);
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + Math.PI / 3; const post = new THREE.Mesh(new THREE.BoxGeometry(0.62 * S, 1.6 * S, 0.62 * S), mC); post.position.set(2.05 * S * Math.cos(a), AY(10.2), -2.05 * S * Math.sin(a)); s.add(post); }
  lathe('carrier1', [[0.78, 11.2], [1.062, 11.2], [1.062, 12.98], [0.78, 12.98]], mC, s, 48);
  lathe('carrier1', [[1.0, 12.95], [1.45, 12.95], [1.45, 13.04], [1.0, 13.04]], mN, s, 48);          // rondelle de butée
  // têtes de vis d'axes + rondelles-freins (côté avant)
  { const hg = new THREE.CylinderGeometry(0.34 * S, 0.34 * S, 0.2 * S, 6), ms = []; for (let k = 0; k < 3; k++) { const a = k * TAU / 3; const m = new THREE.Matrix4().makeTranslation(G1.rc * S * Math.cos(a), AY(9.07), -G1.rc * S * Math.sin(a)); ms.push(m); } inst(hg, ms, mN, s, 'bolt'); }
  // restricteurs d'huile (3)
  { const rg = new THREE.CylinderGeometry(0.09 * S, 0.09 * S, 0.3 * S, 10), ms = []; for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + Math.PI / 3; ms.push(new THREE.Matrix4().makeTranslation(1.45 * S * Math.cos(a), AY(9.05), -1.45 * S * Math.sin(a))); } inst(rg, ms, mN, s); }
}
{ // adaptateur cannelé + écrou + accouplement flexible (tournent avec le porte-satellites 1)
  const s = spinner('flexcpl'), mA = M('flexcpl', { color: 0xb7bec2, metalness: 0.9, roughness: 0.28 }), mN = M('flexcpl', { color: 0xc8ccce, metalness: 0.9, roughness: 0.3 });
  lathe('flexcpl', [[0.86, 8.72], [1.12, 8.72], [1.12, 9.42], [0.86, 9.42]], mA, s, 48);
  { const ng = new THREE.CylinderGeometry(1.42 * S, 1.42 * S, 0.2 * S, 12, 1); ng.translate(0, AY(9.05), 0); s.add(new THREE.Mesh(ng, mN)); }
  lathe('flexcpl', [[0.9, 8.5], [1.1, 8.5], [1.1, 8.95], [0.9, 8.95]], mA, s, 48);
  const sp = new THREE.BoxGeometry(0.07 * S, 0.06 * S, 0.4 * S), ms = []; for (let i = 0; i < 28; i++) ms.push(radM(1.13, 8.72, i * TAU / 28)); inst(sp, ms, mA, s);
}
{ // planétaire du 2e étage
  const s = spinner('sun2'), mS = M('sun2', { color: 0xc9cdd0, metalness: 1, roughness: 0.24 });
  const gm = new THREE.Mesh(gearGeo(G2.S, G2.rs, G2.W, { bore: 0.9 }), mS); gm.position.y = AY(G2.zc); s.add(gm);
  lathe('sun2', [[0.9, G2.zc + G2.W / 2], [1.12, G2.zc + G2.W / 2], [1.12, 8.8], [0.9, 8.8]], mS, s, 48);
}
{ // couronne du 1er étage + cannelures hélicoïdales extérieures + plaques de retenue
  const g = PART.ring1.g, mR = M('ring1', { color: 0x9da4a9, metalness: 0.95, roughness: 0.32 });
  const rg = new THREE.Mesh(gearGeo(G1.R, G1.rr, G1.W, { internal: true, rOut: 3.9 }), mR); rg.position.y = AY(G1.zc); rg.rotation.y = Math.PI * G1.P / G1.R; g.add(rg);
  lathe('ring1', [[3.55, 9.42], [3.9, 9.42], [3.9, 9.5], [3.55, 9.5]], mR, g, 96);
  lathe('ring1', [[3.0, 10.9], [3.9, 10.9], [3.9, 10.97], [3.0, 10.97]], mR, g, 96);
  const sp = new THREE.BoxGeometry(0.1 * S, 0.1 * S, 1.35 * S), tw = new THREE.Matrix4().makeRotationY(0.32), ms = [];
  for (let i = 0; i < 64; i++) ms.push(radM(3.93, 10.2, i * TAU / 64, tw)); inst(sp, ms, mR, g);
  const mPl = M('ring1', { color: 0x9aa3a8, metalness: 0.7, roughness: 0.4 });
  for (let k = 0; k < 3; k++) { const h = 1 + k * 4; radialBox(g, mPl, h, 3.75, 4.3, 9.24, 9.34, 0.9); }
  const bl = []; for (let k = 0; k < 3; k++) for (const d of [-0.28, 0.28]) bl.push(axM(4.12, 9.18, clockPhi(1 + k * 4) + d / 4.1));
  inst(new THREE.CylinderGeometry(0.11 * S, 0.11 * S, 0.12 * S, 6), bl, boltMat('ring1'), g, 'bolt');
}
{ // couplemètre : piston, cylindre, tiroir et ressort
  const mPi = M('tqpiston', { color: 0xaab4ba, metalness: 0.9, roughness: 0.3 }), mSeal = M('tqpiston', { color: 0x2a2d30, metalness: 0.1, roughness: 0.8 });
  const gp = new THREE.Group(); PART.tqpiston.g.add(gp); PART.tqpiston.inner = gp;
  lathe('tqpiston', [[3.0, 10.98], [3.62, 10.98], [3.62, 11.2], [3.0, 11.2]], mPi, gp, 96);
  for (const [r0, r1] of [[2.96, 3.02], [3.6, 3.66]]) lathe('tqpiston', ringPts(r0, r1, 11.05, 11.13), mSeal, gp, 72);
  const g = PART.torquemeter.g, mC = M('torquemeter', { color: 0x9da7ad, metalness: 0.85, roughness: 0.32 }), mV = M('torquemeter', { color: 0xd0d4d6, metalness: 1, roughness: 0.2 }), mSp = M('torquemeter', { color: 0xc8a24a, metalness: 0.9, roughness: 0.3 });
  lathe('torquemeter', [[2.92, 11.0], [2.98, 11.0], [2.98, 11.22], [3.66, 11.22], [3.66, 11.0], [3.72, 11.0], [3.72, 11.33], [3.98, 11.33], [3.98, 11.5], [2.92, 11.5]], mC, g, 96);
  boltRing('torquemeter', g, 3.85, 11.27, 8, 0.12, { h: 0.12, phi0: TAU / 16 });
  // orifice de fuite (repère rouge) en haut du cylindre
  radialCyl(g, new THREE.MeshBasicMaterial({ color: 0xcc3333 }), 0, 3.72, 3.76, 11.15, 0.05, 8);
  const vg = new THREE.Group(); g.add(vg); PART.torquemeter.valve = vg;
  axialCyl(vg, mV, 3.86, 0, 0.11, 11.35, 11.95, 16);              // tiroir
  const spr = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, i) => { const t = i / 48, a = t * TAU * 7; return new THREE.Vector3(3.86 * S + 0.1 * S * Math.cos(a), AY(11.95 + t * 0.2), 0.1 * S * Math.sin(a)); })), 160, 0.018 * S, 6), mSp);
  vg.add(spr);
}
{ // porte-satellites du 2e étage + buses d'huile + écrou
  const s = spinner('carrier2'), mC = M('carrier2', { color: 0xa6aeb3, metalness: 0.85, roughness: 0.32 }), mN = M('carrier2', { color: 0xc8ccce, metalness: 0.9, roughness: 0.28 });
  lathe('carrier2', [[1.2, 6.12], [1.575, 6.12], [1.575, 7.12], [3.1, 7.12], [3.1, 7.4], [1.42, 7.4], [1.42, 7.0], [1.2, 7.0]], mC, s, 96);
  lathe('carrier2', [[1.52, 8.7], [3.1, 8.7], [3.1, 9.0], [1.52, 9.0]], mC, s, 96);
  for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + Math.PI / 5; const post = new THREE.Mesh(new THREE.BoxGeometry(0.62 * S, 1.3 * S, 0.5 * S), mC); post.position.set(2.78 * S * Math.cos(a), AY(8.05), -2.78 * S * Math.sin(a)); post.rotation.y = a; s.add(post); }
  { const hg = new THREE.CylinderGeometry(0.33 * S, 0.33 * S, 0.18 * S, 6), ms = []; for (let k = 0; k < 5; k++) { const a = k * TAU / 5; ms.push(new THREE.Matrix4().makeTranslation(G2.rc * S * Math.cos(a), AY(9.1), -G2.rc * S * Math.sin(a))); } inst(hg, ms, mN, s, 'bolt'); }
  // 5 buses d'huile (IPC fig. 3 rep. 260)
  { const mOz = M('carrier2', { color: 0xc9a85a, metalness: 0.9, roughness: 0.3 });
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + Math.PI / 5, x = 1.78 * Math.cos(a), y = -1.78 * Math.sin(a);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 0.55 * S, 8), mOz); tb.position.set(x * S, AY(8.82), y * S); s.add(tb);
      const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * S, 0.16 * S, 0.12 * S, 6), mN); bs.position.set(x * S, AY(9.06), y * S); bs.userData.bolt = true; s.add(bs); } }
  { const ng = new THREE.CylinderGeometry(1.36 * S, 1.36 * S, 0.22 * S, 12); ng.translate(0, AY(7.12), 0); s.add(new THREE.Mesh(ng, mN)); }
}
{ // couronne du 2e étage + plaques de retenue
  const g = PART.ring2.g, mR = M('ring2', { color: 0xb6bcc0, metalness: 0.95, roughness: 0.28 });
  const rg = new THREE.Mesh(gearGeo(G2.R, G2.rr, G2.W, { internal: true, rOut: 3.85 }), mR); rg.position.y = AY(G2.zc); rg.rotation.y = Math.PI * G2.P / G2.R; g.add(rg);
  const sp = new THREE.BoxGeometry(0.11 * S, 0.08 * S, 1.15 * S), ms = []; for (let i = 0; i < 72; i++) ms.push(radM(3.88, G2.zc, i * TAU / 72)); inst(sp, ms, mR, g);
  const mPl = M('ring2', { color: 0x9aa3a8, metalness: 0.7, roughness: 0.4 });
  for (let k = 0; k < 3; k++) radialBox(g, mPl, 2 + k * 4, 3.62, 4.3, 8.66, 8.76, 0.8);
  const bl = []; for (let k = 0; k < 3; k++) bl.push(axM(4.05, 8.82, clockPhi(2 + k * 4)));
  inst(new THREE.CylinderGeometry(0.12 * S, 0.12 * S, 0.12 * S, 6), bl, boltMat('ring2'), g, 'bolt');
}
{ // roulement à rouleaux à bride
  const g = PART.rollerbrg.g;
  bearing('rollerbrg', g, 1.575, 2.185, 6.28, 6.98, 18, true, { flange: 2.65, flangeW: 0.12 });
  boltRing('rollerbrg', g, 2.45, 6.46, 4, 0.12, { h: 0.12, phi0: TAU / 8 });
}

/* ---------- arbre d'hélice, bague de joint, roulement de butée, couvercle ---------- */
{
  const s = spinner('propshaft'), mP = M('propshaft', { color: 0xb9bfc3, metalness: 0.85, roughness: 0.3 });
  lathe('propshaft', [[0.95, 0], [2.6, 0], [2.6, 0.55], [1.95, 0.62], [1.62, 0.95], [1.62, 1.3], [1.476, 1.35], [1.476, 4.6], [1.33, 4.65], [1.33, 6.1], [1.2, 6.15], [1.2, 7.0], [0.95, 7.0]], mP, s, 96);
  const holes = [], dw = [];
  for (let i = 0; i < 8; i++) holes.push(axM(2.08, 0.275, i * TAU / 8));
  inst(new THREE.CylinderGeometry(0.27 * S, 0.27 * S, 0.57 * S, 14), holes, M('propshaft', { color: 0x0b0d0e, metalness: 0, roughness: 1 }), s);
  for (const a of [TAU / 16, TAU / 16 + Math.PI]) dw.push(axM(2.08, -0.22, a));
  inst(new THREE.CylinderGeometry(0.25 * S, 0.25 * S, 0.45 * S, 16), dw, M('propshaft', { color: 0xd5d8da, metalness: 0.95, roughness: 0.2 }), s);
}
{
  const s = spinner('runner'), mRn = M('runner', { color: 0xd3d6d8, metalness: 1, roughness: 0.15 });
  lathe('runner', [[1.476, 1.35], [1.85, 1.35], [1.85, 2.15], [1.476, 2.15]], mRn, s, 72);
}
{
  const g = PART.thrustbrg.g;
  bearing('thrustbrg', g, 1.476, 2.56, 2.45, 3.3, 13, false, { flange: 3.0, flangeW: 0.1 });
}
{
  const g = PART.cover.g, mC = M('cover', { color: 0x58646a, metalness: 0.4, roughness: 0.5 }), mSeal = M('cover', { color: 0x1d1f21, metalness: 0.1, roughness: 0.8 }), mRet = M('cover', { color: 0x9ea7ac, metalness: 0.7, roughness: 0.35 }), mFelt = M('cover', { color: 0x6b5a45, metalness: 0, roughness: 1 });
  lathe('cover', [[1.9, 1.45], [2.95, 1.45], [3.2, 1.7], [3.2, 2.2], [3.45, 2.2], [3.45, 2.42], [2.62, 2.42], [2.2, 2.2], [2.2, 1.8], [1.9, 1.8]], mC, g, 96);
  lathe('cover', [[1.86, 1.47], [2.18, 1.47], [2.18, 1.78], [1.86, 1.78]], mSeal, g, 72);                 // joint
  const gs = new THREE.Mesh(new THREE.TorusGeometry(1.96 * S, 0.035 * S, 6, 72), mRet); gs.rotation.x = Math.PI / 2; gs.position.y = AY(1.6); g.add(gs);   // ressort jarretière
  lathe('cover', [[1.87, 1.28], [2.9, 1.28], [2.9, 1.45], [1.87, 1.45]], mRet, g, 96);                    // demi-bagues de retenue
  lathe('cover', [[1.85, 1.3], [1.9, 1.3], [1.9, 1.45], [1.85, 1.45]], mFelt, g, 72);                      // bande de feutre
  boltRing('cover', g, 2.62, 1.22, 8, 0.12, { h: 0.12, phi0: TAU / 16 });
  boltRing('cover', g, 3.25, 2.12, 8, 0.17, { h: 0.18 });
  radialCyl(g, mRet, 6, 3.15, 3.7, 1.95, 0.1, 10);                                                         // mamelon de vidange
}
{ // transfert d'huile d'hélice
  const g = PART.oilxfer.g, mX = M('oilxfer', { color: 0xa8b0b5, metalness: 0.85, roughness: 0.3 }), mT = M('oilxfer', { color: 0xc9a85a, metalness: 0.9, roughness: 0.3 }), mPk = M('oilxfer', { color: 0x2a2d30, metalness: 0.1, roughness: 0.8 });
  lathe('oilxfer', [[1.33, 4.72], [1.5, 4.72], [1.5, 6.08], [1.33, 6.08]], mX, g, 72);                    // manchon
  lathe('oilxfer', [[1.5, 4.8], [1.6, 4.8], [1.6, 6.0], [1.5, 6.0]], mX, g, 72);                          // boîtier
  for (const z of [5.1, 5.45, 5.75]) lathe('oilxfer', ringPts(1.6, 1.64, z - 0.04, z + 0.04), mPk, g, 48);
  radialCyl(g, mX, 0, 1.6, 1.9, 5.4, 0.08, 8);                                                              // boulon de positionnement
  lathe('oilxfer', [[0.72, 0.9], [0.82, 0.9], [0.82, 9.05], [0.72, 9.05]], mT, g, 40);                    // tube de transfert
  lathe('oilxfer', [[0.82, 0.32], [0.95, 0.32], [0.95, 1.3], [0.82, 1.3]], mX, g, 40);                    // adaptateur
  lathe('oilxfer', [[0.3, 9.0], [0.82, 9.0], [0.82, 9.2], [0.55, 9.42], [0.3, 9.42]], mT, g, 40);         // buse du palier n° 4
}
/* ---------- prises avant : pignon conique et arbres-pignons ---------- */
const pinions = [];
{
  const s = spinner('bevel'), mG = M('bevel', { color: 0xd0d4d6, metalness: 1, roughness: 0.22 }), mN = M('bevel', { color: 0xc5c9cc, metalness: 0.9, roughness: 0.3 });
  const depth = BEV.F * Math.cos(BEV.gam), bg = gearGeo(BEV.Ng, BEV.rg, depth, { taper: 1 - BEV.k, bore: 1.476 });
  bg.rotateX(Math.PI); bg.translate(0, AY(BEV.zg), 0);           // denture tournée vers l'arrière
  s.add(new THREE.Mesh(bg, mG));
  lathe('bevel', [[1.476, 3.5], [2.2, 3.5], [2.2, 3.62], [2.05, BEV.zg], [1.476, BEV.zg]], mG, s, 96);
  lathe('bevel', [[1.476, 3.85], [1.62, 3.85], [1.62, 4.32], [1.476, 4.32]], mG, s, 72);
  lathe('bevel', [[1.476, 3.3], [1.85, 3.3], [1.85, 3.5], [1.476, 3.5]], mN, s, 72);                      // cale de réglage
  { const ng = new THREE.CylinderGeometry(1.62 * S, 1.62 * S, 0.24 * S, 12, 1, false); ng.translate(0, AY(4.45), 0); s.add(new THREE.Mesh(ng, mN)); }
}
for (const [id, h, rTop] of [['drv_gov', 0, 3.95], ['drv_nf', 3, 3.8], ['drv_ovs', 9, 3.8]]) {
  const g = PART[id].g, mG = M(id, { color: 0xd0d4d6, metalness: 1, roughness: 0.22 }), mC = M(id, { color: 0xb3babe, metalness: 0.9, roughness: 0.3 }), mBz = M(id, { color: 0xc89b4a, metalness: 0.85, roughness: 0.32 });
  const phi = clockPhi(h);
  const hold = new THREE.Group(); g.add(hold);
  hold.position.copy(P(0, BEV.za, h));
  // axe local Y du support = radial vers l'extérieur
  hold.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), RD(h));
  const sp = new THREE.Group(); hold.add(sp);
  const rBack = BEV.L * Math.cos(Math.PI / 2 - BEV.gam) * 0 + BEV.rg * Math.tan(Math.PI / 2 - BEV.gam) * 0 + BEV.L * Math.sin(Math.PI / 2 - BEV.gam) * 0;
  const rp = BEV.L * Math.cos(BEV.gam);                    // rayon primitif du pignon (= rg × Np/Ng)
  const dist = BEV.L * Math.sin(BEV.gam);                  // distance au sommet du plan primitif arrière
  const depth = BEV.F * Math.sin(BEV.gam);
  const pg = gearGeo(BEV.Np, rp, depth, { taper: 1 - BEV.k, bore: 0.25 });
  pg.rotateX(Math.PI); pg.translate(0, dist * S, 0);       // de r = dist (dos) vers l'axe
  sp.add(new THREE.Mesh(pg, mG));
  const lg = (r0, r1, a, b) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(b * S, a * S, (r1 - r0) * S, 24), mG); m.position.y = (r0 + r1) / 2 * S; sp.add(m); return m; };
  lg(dist, dist + 0.25, rp * 1.02, 0.62);                  // dos du pignon
  lg(dist + 0.25, rTop - 0.1, 0.435, 0.435);              // arbre Ø 0,87
  const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * S, 0.45 * S, 0.7 * S, 20), mC); cp.position.y = (rTop - 0.45) * S; sp.add(cp);   // accouplement
  const sv = new THREE.Mesh(new THREE.CylinderGeometry(0.52 * S, 0.52 * S, 0.5 * S, 20, 1, true), mBz); sv.position.y = (dist + 0.75) * S; hold.add(sv);   // palier lisse à collerette
  void rBack; void phi;
  pinions.push({ sp, id });
}
/* ---------- accessoires (formes figurées) ---------- */
{
  const g = PART.acc_gov.g, mA = M('acc_gov', { color: 0x4f5a60, metalness: 0.45, roughness: 0.45 }), mL = M('acc_gov', { color: 0xb9bec2, metalness: 0.85, roughness: 0.3 });
  radialBox(g, mA, 0, 3.92, 4.15, BEV.za - 1.0, BEV.za + 1.05, 2.8);
  radialBox(g, mA, 0, 4.15, 6.1, BEV.za - 0.95, BEV.za + 0.75, 2.2);
  radialCyl(g, mA, 0, 6.1, 6.9, BEV.za - 0.1, 0.85, 28);
  radialBox(g, mA, 0, 4.4, 5.6, BEV.za + 0.75, BEV.za + 1.6, 1.4);
  radialBox(g, mL, 0, 6.9, 7.05, BEV.za - 1.4, BEV.za + 0.4, 0.25);
  radialCyl(g, mL, 0, 6.55, 7.05, BEV.za - 1.4, 0.12, 10);
  const nuts = []; for (const [dx, dz] of [[-1.12, -0.82], [1.12, -0.82], [-1.12, 0.86], [1.12, 0.86]]) nuts.push([4.15, BEV.za + dz, clockPhi(0) + dx / 3.9]);
  studRing('acc_gov', g, nuts, 0.2, 0.2);
}
{
  const g = PART.acc_nf.g, mA = M('acc_nf', { color: 0x3e474d, metalness: 0.45, roughness: 0.45 }), mK = M('acc_nf', { color: 0xa9aeb2, metalness: 0.8, roughness: 0.35 });
  radialCyl(g, mA, 3, 3.95, 4.12, BEV.za, 1.25, 32);
  radialCyl(g, mA, 3, 4.12, 6.7, BEV.za, 1.0, 32);
  radialCyl(g, mA, 3, 6.7, 6.95, BEV.za, 0.75, 28, undefined, 0.9);
  radialCyl(g, mK, 3, 6.95, 7.45, BEV.za, 0.42, 16);
}
{
  const g = PART.acc_ovs.g, mA = M('acc_ovs', { color: 0x5a646a, metalness: 0.45, roughness: 0.45 }), mK = M('acc_ovs', { color: 0xb3b8bb, metalness: 0.8, roughness: 0.35 });
  radialBox(g, mA, 9, 3.74, 3.95, BEV.za - 1.0, BEV.za + 1.0, 2.5);
  radialCyl(g, mA, 9, 3.95, 6.0, BEV.za, 1.12, 32);
  radialBox(g, mA, 9, 6.0, 6.8, BEV.za - 0.4, BEV.za + 1.0, 1.7);
  radialCyl(g, mK, 9, 6.8, 7.1, BEV.za + 0.4, 0.3, 14);
}
/* ---------- détecteur de limaille, crépine, tubes, raccord de couple ---------- */
{
  const g = PART.chip.g, mCh = M('chip', { color: 0xd2a645, metalness: 0.85, roughness: 0.3 }), mCv = M('chip', { color: 0x9aa1a5, metalness: 0.8, roughness: 0.35 });
  radialCyl(g, mCh, 6, 5.45, 5.8, 6.9, 0.36, 6);
  radialCyl(g, mCh, 6, 5.8, 6.15, 6.9, 0.3, 16);
  radialCyl(g, mCv, 6, 6.15, 6.6, 6.9, 0.38, 6);
  radialCyl(g, new THREE.MeshBasicMaterial({ color: 0xcc2222 }), 6, 6.12, 6.18, 6.9, 0.31, 16);   // bande témoin
  radialCyl(g, mCh, 6, 4.9, 5.45, 6.9, 0.16, 12);                                                  // pôles magnétiques
}
{
  const g = PART.strainer.g, mPl = M('strainer', { color: 0x8a959b, metalness: 0.6, roughness: 0.4 });
  const mSc = new THREE.MeshStandardMaterial({ color: 0xc0c7cc, metalness: 0.9, roughness: 0.35, alphaMap: perfTex, alphaTest: 0.5, side: THREE.DoubleSide });
  mSc.userData = { kind: 'case', part: 'strainer', baseOpacity: 1, baseTransparent: false, baseEmissive: mSc.emissive.clone() }; PART.strainer.mats.push(mSc);
  axialCyl(g, mPl, 4.3, 6.25, 0.5, 3.2, 3.45, 28);
  axialCyl(g, mSc, 4.3, 6.25, 0.33, 3.45, 5.65, 28, true);
  { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.5 * S, 0.2 * S, 0.7 * S), mPl); ear.position.copy(P(4.3 + 0.62, 3.32, 6.25)); g.add(ear); }
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * S, 0.13 * S, 0.14 * S, 6), boltMat('strainer')); b.position.copy(P(4.92, 3.13, 6.25)); b.userData.bolt = true; g.add(b);
}
{
  const g = PART.tube_oil.g, mT = M('tube_oil', { color: 0xb2b8bc, metalness: 0.85, roughness: 0.3 });
  tubeRZH(g, mT, [[4.3, 6.2, 1.1], [5.0, 6.75, 1.25], [5.9, 7.45, 1.4], [6.85, 7.7, 1.45]], 0.2);
  radialCyl(g, mT, 1.1, 4.3, 4.45, 6.2, 0.42, 18);
  axialCyl(g, M('tube_oil', { color: 0x8a959b, metalness: 0.6, roughness: 0.4 }), 6.85, 1.45, 0.34, 7.45, 7.75, 18);
}
{
  const g = PART.tube_prop.g, mT = M('tube_prop', { color: 0xb2b8bc, metalness: 0.85, roughness: 0.3 });
  radialCyl(g, mT, 5.35, 3.6, 3.75, 5.25, 0.55, 18);
  radialCyl(g, mT, 5.35, 2.0, 3.6, 5.25, 0.2, 14);
  const bl = []; for (const d of [-0.36, 0.36]) bl.push([3.75, 5.25 + d, clockPhi(5.35)]);
  studRing('tube_prop', g, bl, 0.12, 0.18);
}
{
  const g = PART.tqconn.g, mK = M('tqconn', { color: 0x6c777d, metalness: 0.55, roughness: 0.4 }), mF = M('tqconn', { color: 0xc9a85a, metalness: 0.85, roughness: 0.3 });
  radialBox(g, mK, 11, 4.15, 4.5, 5.55, 6.35, 1.0);
  radialCyl(g, mF, 11, 4.5, 4.95, 5.75, 0.17, 12);
  radialCyl(g, mF, 11, 4.5, 4.95, 6.15, 0.17, 12);
}

/* =====================================================================
   CIRCUIT D'HUILE (schéma animé)
   ===================================================================== */
const oilGroup = new THREE.Group(); root.add(oilGroup); oilGroup.visible = false;
const oilTex = canvasTex(64, 8, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(40, 0, 24, h); }, 1, 1);
const oilMats = {};
function oilPath(kind, pts, rad = 0.09) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([r, z, h]) => P(r, z, h)));
  const tex = oilTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(2, Math.round(curve.getLength() / (0.18))), 1);
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, depthTest: true });
  (oilMats[kind] ||= []).push(m);
  oilGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 140, rad * S, 8), m));
}
oilPath('p', [[7.4, 9.0, 1.5], [6.85, 7.75, 1.45], [5.9, 7.45, 1.4], [4.3, 6.2, 1.1], [3.3, 5.8, 0.8], [2.0, 5.65, 0.35], [1.4, 5.65, 0.05], [0.95, 5.7, 0], [0.86, 6.6, 0], [0.86, 8.0, 0], [0.7, 9.4, 0], [0.45, 10.1, 0]]);
oilPath('p', [[0.86, 7.6, 0], [1.2, 8.3, 1.2], [1.78, 8.8, 1.2], [1.95, 8.5, 1.2]], 0.07);
oilPath('p', [[3.3, 5.8, 0.8], [3.25, 4.4, 10.8], [3.25, 3.0, 10.6], [2.95, 2.5, 10.5], [2.4, 2.25, 10.5]], 0.07);
oilPath('g', [[4.4, BEV.za - 0.6, 11.7], [3.6, BEV.za - 0.55, 11.8], [2.9, 5.0, 11.9], [1.7, 5.15, 0], [1.1, 5.0, 0], [0.9, 3.5, 0], [0.9, 1.5, 0], [0.6, 0.5, 0], [0.45, -1.4, 0]]);
oilPath('t', [[3.86, 12.4, 0], [3.86, 11.6, 0], [3.4, 11.12, 0.2], [3.3, 11.1, 11.0]], 0.07);
oilPath('t', [[3.3, 11.1, 11.0], [4.4, 10.1, 11.1], [5.9, 8.4, 11.1], [5.3, 7.2, 11.0], [4.3, 6.0, 11.0]], 0.07);
oilPath('s', [[4.2, 7.6, 6], [4.75, 6.6, 6], [4.4, 5.65, 6.4], [4.3, 4.4, 6.25], [4.3, 3.6, 6.25], [4.8, 3.9, 6.3], [5.25, 6.0, 6.2], [5.9, 7.6, 6.15], [7.2, 9.4, 6.1]]);
function oilColors() { const c = { p: cssVar('--oil-p'), g: cssVar('--oil-g'), t: cssVar('--oil-t'), s: cssVar('--oil-s') }; for (const k in oilMats) for (const m of oilMats[k]) m.color.set(c[k] || '#ffb81f'); }
oilColors();

/* =====================================================================
   VUE ÉCLATÉE : ordre de démontage OM 72-11
   ===================================================================== */
const FRONT_ALL = ['fronthsg', 'flangeA', 'bracket', 'ring2', 'rollerbrg', 'carrier2', 'planets2', 'propshaft', 'runner', 'thrustbrg', 'cover', 'oilxfer', 'bevel', 'drv_gov', 'drv_nf', 'drv_ovs', 'acc_gov', 'acc_nf', 'acc_ovs', 'chip', 'strainer', 'tube_oil', 'tube_prop', 'tqconn'];
const HOUSING_F = ['fronthsg', 'flangeA', 'bracket', 'ring2', 'rollerbrg', 'drv_gov', 'drv_nf', 'drv_ovs', 'acc_gov', 'acc_nf', 'acc_ovs', 'chip', 'strainer', 'tube_oil', 'tube_prop', 'tqconn'];
const STEPS = [
  { t: 'Déposer le réducteur de la section de puissance', r: 'OM 72-11 1.B → 72-01', m: [[['input', 'sun1'], { dz: 5.5, up: -7 }]],
    d: 'Le planétaire du 1er étage reste dans l\'accouplement de la turbine de puissance (deux joncs).' },
  { t: 'Séparer le carter avant du carter arrière à la bride A', r: 'OM 72-11 5.A(1)', m: [[FRONT_ALL, { dz: -6.5 }], [['flangeA'], { dz: -1.8 }]],
    d: 'Carter arrière posé bride A en bas sur des cales, avec un dégagement pour le planétaire du 2e étage.' },
  { t: 'Retirer la rondelle de butée et le jonc, puis soulever le carter arrière du porte-satellites du 1er étage', r: 'OM 72-11 5.A(2)–(3)', m: [[['rearhsg', 'ring1', 'tqpiston', 'torquemeter'], { dz: 4.6 }]],
    d: 'Extracteur PWC30353 pour la rondelle ; le carter arrière est posé sur la plaque PWC30225.' },
  { t: 'Débloquer l\'écrou, déposer d\'un bloc l\'adaptateur cannelé, l\'accouplement flexible et le planétaire du 2e étage', r: 'OM 72-11 5.A(4)–(7)', m: [[['flexcpl', 'sun2'], { dz: -2.0 }]],
    d: 'Porte-satellites dans le gabarit PWC30057 ; les deux grands joncs sont mis au rebut.' },
  { t: 'Retirer restricteurs, vis d\'axes, axes, puis les trois satellites du 1er étage', r: 'OM 72-11 5.A(8)–(12)', m: [[['planets1'], { dr: 3.2 }]],
    d: 'Les crépines (post-SB1397) sont extraites des axes ; garnitures et joints jetés.' },
  { t: 'Déposer les plaques et la couronne du 1er étage, le piston, le cylindre et le tiroir du couplemètre', r: 'OM 72-11 5.B', m: [[['ring1'], { dz: -1.6, up: 8.5 }], [['tqpiston'], { dz: 0.2, up: 8.5 }], [['torquemeter'], { dz: 1.6, up: 8.5 }]],
    d: 'Les paliers et le fourreau du tiroir, montés serrés, restent dans le carter arrière.' },
  { t: 'Retirer le tube de transfert et la buse du palier n° 4, l\'écrou, puis extraire le porte-satellites du 2e étage', r: 'OM 72-11 5.C(1)–(6)', m: [[['carrier2', 'planets2'], { dz: 2.4 }]],
    d: 'Le tube est repoussé dans l\'alésage de l\'arbre ; extracteur PWC30127, retenue PWC30062 pour les rouleaux.' },
  { t: 'Déposer les cinq satellites du 2e étage et les cinq buses d\'huile', r: 'OM 72-11 5.C(7)–(10)', m: [[['planets2'], { dr: 2.6 }]],
    d: 'Arbres et satellites gardés par paires et repérés 1 à 5 selon leur position.' },
  { t: 'Déposer les équipements extérieurs du carter avant', r: 'OM 72-11 5.D', m: [[['acc_gov', 'acc_nf', 'acc_ovs'], { dr: 3 }], [['tube_oil', 'tube_prop', 'tqconn', 'chip', 'bracket'], { dr: 2.6 }], [['strainer'], { dz: -4 }]],
    d: 'Couvercles et accessoires, porte-joint de la plage Nf, tubes de transfert, crépine, raccord du transmetteur de couple, détecteur de limaille.' },
  { t: 'Déposer le couvercle du roulement de butée', r: 'OM 72-11 5.E(2), 5.F', m: [[['cover'], { dz: -2.6 }]],
    d: 'Ne pas faire tourner le carter sur l\'arbre : les arbres-pignons toucheraient le manchon de transfert.' },
  { t: 'Soulever le carter avant pour le dégager de l\'arbre d\'hélice', r: 'OM 72-11 5.E(3)', m: [[HOUSING_F, { up: -12 }]],
    d: 'Au besoin, frapper autour du logement de butée avec un chasse-fibre.' },
  { t: 'Sur l\'arbre : manchon de transfert, écrou, pignon conique et cale, roulement de butée, bague de joint, tube de transfert', r: 'OM 72-11 5.E(4)–(14)', m: [[['oilxfer'], { up: 5.5 }], [['bevel'], { up: 4.6 }], [['thrustbrg'], { up: 4.6 }], [['runner'], { up: 4.6 }]],
    d: 'Vérifier le sens du filet de l\'écrou (à gauche après le SB1426) ; garder la même cale au remontage.' },
  { t: 'Internes du carter avant : couronne du 2e étage, roulement à rouleaux, galerie, arbres-pignons des prises', r: 'OM 72-11 5.G', m: [[['ring2'], { dz: 3.2 }], [['rollerbrg'], { dz: 1.7 }], [['drv_gov', 'drv_nf', 'drv_ovs'], { dr: 2.2 }]],
    d: 'Cales et accouplements étiquetés avec leur arbre-pignon pour le remontage.' }
];
const PART_STEPS = {};
STEPS.forEach((st, k) => st.m.forEach(([ids, v]) => ids.forEach(id => (PART_STEPS[id] ||= []).push([k, v]))));
const RDIR = { acc_gov: 0, acc_nf: 3, acc_ovs: 9, drv_gov: 0, drv_nf: 3, drv_ovs: 9, tube_oil: 1.2, tube_prop: 5.35, tqconn: 11, chip: 6, bracket: 1.15 };
let exT = 0, exTarget = 0;
function applyExplode() {
  for (const id of ORDER) {
    let dz = 0, up = 0, dr = 0;
    for (const [k, v] of (PART_STEPS[id] || [])) { const f = ease(clamp(exT - k, 0, 1)); dz += (v.dz || 0) * f; up += (v.up || 0) * f; dr += (v.dr || 0) * f; }
    const p = PART[id]; p.ex.dr = dr;
    p.g.position.set(up * S, -dz * S, 0);
    if (RDIR[id] !== undefined && dr) p.g.position.addScaledVector(RD(RDIR[id]), dr * S);
  }
}

/* =====================================================================
   ÉTAT D'AFFICHAGE : coupe, rayons X, isolement, sélection
   ===================================================================== */
let mode = 'ext', cutAll = false, selected = null, isolate = false, ghost = false, showAcc = true, showBolts = true, stepGlow = null, stepGlowT = 0;
const planeH = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
const planeQ = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
let selColor = new THREE.Color(cssVar('--sel') || '#7cc4e4');
function refreshMats() {
  for (const id of ORDER) {
    const p = PART[id];
    const hiddenAcc = !showAcc && id.startsWith('acc_');
    p.g.visible = !hiddenAcc && !(isolate && selected && id !== selected);
    for (const m of p.mats) {
      const cutting = (mode === 'cut' || mode === 'half') && (m.userData.kind === 'case' || cutAll);
      const planes = cutting ? (mode === 'cut' ? planeQ : planeH) : null;
      const prevN = m.clippingPlanes ? m.clippingPlanes.length : 0;
      m.clippingPlanes = planes; m.clipIntersection = mode === 'cut';
      let op = m.userData.baseOpacity;
      if (mode === 'xray' && m.userData.kind === 'case' && id !== selected) op = Math.min(op, 0.14);
      if (ghost && selected && id !== selected) op = Math.min(op, 0.12);
      const tr = op < 0.999 || m.userData.baseTransparent;
      if (m.transparent !== tr || prevN !== (planes ? planes.length : 0)) m.needsUpdate = true;
      m.transparent = tr; m.opacity = op; m.depthWrite = op > 0.5;
      const glow = id === selected ? 0.2 : (stepGlow && stepGlow.has(id) ? 0.5 * stepGlowT : 0);
      if (glow > 0) m.emissive.copy(id === selected ? selColor : new THREE.Color(0xf0a020)).multiplyScalar(glow); else m.emissive.copy(m.userData.baseEmissive);
    }
  }
  root.traverse(o => { if (o.userData.bolt) o.visible = showBolts; });
}

/* =====================================================================
   ANIMATION DES ENGRENAGES
   ===================================================================== */
let paused = reduceMotion, slow = 0.0025, aNf = 0;
const W_NF = NF_RPM * TAU / 60;
function planetPsi(theta, aSun, G) { return theta + Math.PI + ((theta - aSun) * G.S - Math.PI) / G.P; }
function placePlanets(arr, G, aSun, aCar, dr) {
  for (const h of arr) {
    const th = h.userData.theta0 + aCar, r = (G.rc + dr) * S;
    h.position.set(r * Math.cos(th), AY(G.zc), -r * Math.sin(th));
    h.rotation.y = planetPsi(th, aSun, G);
  }
}
function updateGears() {
  const aC1 = aNf / G1.i, aC2 = aC1 / G2.i, aAcc = aC2 * BEV.Ng / BEV.Np;
  spin.sun1.rotation.y = aNf; spin.input.rotation.y = aNf;
  spin.carrier1.rotation.y = aC1; spin.flexcpl.rotation.y = aC1; spin.sun2.rotation.y = aC1;
  spin.carrier2.rotation.y = aC2; spin.propshaft.rotation.y = aC2; spin.runner.rotation.y = aC2; spin.bevel.rotation.y = aC2;
  placePlanets(planets1, G1, aNf, aC1, PART.planets1.ex.dr);
  placePlanets(planets2, G2, aC1, aC2, PART.planets2.ex.dr);
  for (const p of pinions) p.sp.rotation.y = -aAcc;
}
// couplemètre : déplacement axial (exagéré) de la couronne et du piston
let tqLbft = 900;
function updateTorque() {
  const d = (0.04 + 0.14 * tqLbft / 1315) * S;
  PART.ring1.g.children.forEach(c => { if (c.userData.baseY === undefined) c.userData.baseY = c.position.y; c.position.y = c.userData.baseY + d; });
  PART.tqpiston.inner.position.y = d;
  PART.torquemeter.valve.position.y = d * 0.6;
}

/* =====================================================================
   ÉTIQUETTES 3D
   ===================================================================== */
const LBL = [
  ['fronthsg', 'Carter avant', 6.75, 7.3, 1.9], ['rearhsg', 'Carter arrière', 5.0, 9.75, 1.6], ['propshaft', 'Arbre d\'hélice', 2.6, 0.2, 0.9],
  ['cover', 'Couvercle de butée', 3.3, 1.9, 10.6], ['acc_gov', 'Régulateur d\'hélice', 7.0, BEV.za - 0.2, 0], ['acc_nf', 'Génératrice Nf', 7.4, BEV.za, 3],
  ['acc_ovs', 'Régulateur de survitesse', 6.9, BEV.za, 9], ['chip', 'Détecteur de limaille', 6.6, 6.9, 6], ['strainer', 'Crépine', 4.6, 3.2, 6.8],
  ['ring1', 'Couronne 1er étage', 3.95, 10.2, 1.2], ['torquemeter', 'Couplemètre', 3.95, 11.4, 0.4], ['ring2', 'Couronne 2e étage', 3.85, 8.05, 10.8],
  ['carrier2', 'Porte-satellites 2e étage', 3.1, 7.25, 2.8], ['bevel', 'Pignon conique', 2.2, 3.7, 8.2], ['oilxfer', 'Transfert d\'huile', 1.6, 5.4, 4.8],
  ['planets1', 'Satellites 1er étage', 0, 0, 0], ['planets2', 'Satellites 2e étage', 0, 0, 0], ['sun1', 'Planétaire 1er étage', 1.1, 9.6, 7.5], ['tqconn', 'Raccord de couple', 4.95, 5.95, 11]
];
const lblLayer = $('labels'), lblEls = [];
for (const [id, txt, r, z, h] of LBL) {
  const el = document.createElement('div'); el.className = 'lbl'; el.textContent = txt; lblLayer.appendChild(el);
  lblEls.push({ el, id, local: P(r, z, h) });
}
const _v = new THREE.Vector3();
function updateLabels() {
  if (lblLayer.hidden) return;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const L of lblEls) {
    const p = PART[L.id];
    if (!p.g.visible) { L.el.style.display = 'none'; continue; }
    if (L.id === 'planets1' || L.id === 'planets2') { const hh = (L.id === 'planets1' ? planets1 : planets2)[0]; _v.set(0, 0, 0); hh.localToWorld(_v); }
    else { _v.copy(L.local); p.g.localToWorld(_v); }
    _v.project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { L.el.style.display = 'none'; continue; }
    L.el.style.display = '';
    L.x = (_v.x * 0.5 + 0.5) * w; L.y = (-_v.y * 0.5 + 0.5) * h - 10; L.z = _v.z;
    L.el.classList.toggle('sel', L.id === selected);
  }
  // évite les chevauchements : les étiquettes les plus proches sont placées d'abord, les autres montent
  const shown = lblEls.filter(L => L.el.style.display !== 'none').sort((a, b) => a.z - b.z), placed = [];
  for (const L of shown) {
    const bw = L.el.offsetWidth || 90, bh = (L.el.offsetHeight || 18) + 2;
    let y = L.y;
    for (let k = 0; k < 12; k++) {
      const hit = placed.find(q => Math.abs(q.x - L.x) < (q.w + bw) / 2 && Math.abs(q.y - y) < bh);
      if (!hit) break; y = hit.y - bh;
    }
    placed.push({ x: L.x, y, w: bw });
    L.el.style.transform = `translate(${L.x}px, ${y}px) translate(-50%,-100%)`;
    L.el.classList.toggle('moved', Math.abs(y - L.y) > 1);
  }
}

/* =====================================================================
   CAMÉRA, CADRAGE
   ===================================================================== */
const VIEWS = { '34': new THREE.Vector3(-0.68, 0.42, 0.76), side: new THREE.Vector3(0, 0.08, 1), front: new THREE.Vector3(-1, 0.1, 0.02), rear: new THREE.Vector3(1, 0.12, 0.02) };
let camAnim = null;
function boundsVisible() {
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverseVisible(o => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.parent !== oilGroup) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp); } });
  return box;
}
function frame(dir, instant) {
  const box = boundsVisible(); if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), sph = box.getBoundingSphere(new THREE.Sphere());
  gridY = Math.min(-0.95, box.min.y - 0.08);
  const asp = Math.max(0.5, camera.aspect), fov = camera.fov * Math.PI / 180;
  const fit = Math.max(sph.radius / Math.sin(fov / 2), sph.radius / Math.sin(Math.atan(Math.tan(fov / 2) * asp))) * 0.82;
  const d = (dir || camera.position.clone().sub(controls.target)).clone().normalize();
  const toPos = c.clone().addScaledVector(d, fit);
  if (instant || reduceMotion) { camera.position.copy(toPos); controls.target.copy(c); controls.update(); return; }
  camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: toPos, t1: c, k: 0 };
}

/* =====================================================================
   SÉLECTION, PANNEAU, LISTE
   ===================================================================== */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function clippedAt(pt, m) {
  if (!m || !m.clippingPlanes || !m.clippingPlanes.length) return false;
  return m.clipIntersection ? m.clippingPlanes.every(pl => pl.distanceToPoint(pt) < 0) : m.clippingPlanes.some(pl => pl.distanceToPoint(pt) < 0);
}
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(root.children, true);
  for (const h of hits) {
    let o = h.object, vis = true; for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break; } if (!vis) continue;
    if (o.parent === oilGroup || o.parent?.parent === oilGroup) continue;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (clippedAt(h.point, m)) continue;
    if (m && m.transparent && m.opacity < 0.3) continue;
    while (o && !o.userData.part) o = o.parent;
    if (o) return o.userData.part;
  }
  return null;
}
function select(id) {
  selected = id || null;
  if (!selected) { isolate = false; ghost = false; }
  $('b-iso').disabled = $('b-ghost').disabled = !selected;
  $('b-iso').setAttribute('aria-pressed', isolate); $('b-ghost').setAttribute('aria-pressed', ghost);
  document.querySelectorAll('#plist button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === selected));
  const body = $('info-body');
  if (!selected) {
    body.innerHTML = '<h3>Réducteur d\'hélice</h3><span class="ref">AMM 72-10-00 · IPC 72-11 · OM 72-11</span><p>Train épicycloïdal à deux étages dans deux carters en magnésium boulonnés à la bride A : le 1er étage et le couplemètre dans le carter arrière, le 2e étage, les prises avant et l\'arbre d\'hélice dans le carter avant. Cliquez une pièce dans la vue ou dans la liste pour afficher sa fiche.</p>' +
      `<dl class="kv"><dt>Hélice</dt><dd>${fmt(NP_RPM)} tr/min nominal au décollage (AMM 72-10), horaire vue de l'arrière</dd><dt>Rapports par étage</dt><dd>à confirmer (modèle : ${fmt(G1.i, 2)} × ${fmt(G2.i, 2)})</dd><dt>Satellites</dt><dd>3 (1er étage) + 5 (2e étage)</dd><dt>Prises avant</dt><dd>3 : régulateur d'hélice, génératrice Nf, régulateur de survitesse</dd></dl>`;
  } else {
    const I = INFO[selected];
    body.innerHTML = `<h3>${I.n}</h3><span class="ref">${I.ref}</span><p>${I.d}</p><dl class="kv">${I.k.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
  }
  refreshMats();
}
{ // liste des pièces
  const list = $('plist');
  for (const [gk, gname] of GROUPS) {
    const sec = document.createElement('div'); sec.innerHTML = `<h4>${gname}</h4>`; const ul = document.createElement('ul');
    for (const id of ORDER) if (INFO[id].g === gk) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<i style="background:${PART[id].swatch}"></i>${INFO[id].n}`;
      b.addEventListener('click', () => { select(selected === id ? null : id); if (selected && !PART[id].g.visible && id.startsWith('acc_')) { showAcc = true; $('t-acc').setAttribute('aria-pressed', 'true'); refreshMats(); } });
      li.appendChild(b); ul.appendChild(li);
    }
    sec.appendChild(ul); list.appendChild(sec);
  }
  $('pcount').textContent = `${ORDER.length} entrées`;
}
$('b-iso').addEventListener('click', () => { if (!selected) return; isolate = !isolate; if (isolate) ghost = false; select(selected); if (isolate) frame(null); });
$('b-ghost').addEventListener('click', () => { if (!selected) return; ghost = !ghost; if (ghost) isolate = false; select(selected); });
$('b-clear').addEventListener('click', () => { const wasIso = isolate; select(null); if (wasIso) frame(null); });

/* ---------- survol / clic dans la vue ---------- */
const tip = $('tip'); let downAt = null, lastHover = 0;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) { downAt = null; return; }
  downAt = null; const id = pick(e); select(id === selected ? null : id);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || e.buttons) { tip.hidden = true; return; }
  const now = performance.now(); if (now - lastHover < 90) return; lastHover = now;
  const id = pick(e); if (!id) { tip.hidden = true; renderer.domElement.style.cursor = ''; return; }
  const r = $('vp').getBoundingClientRect();
  tip.innerHTML = `${INFO[id].n}<small>${INFO[id].ref.split(' · ')[0]}</small>`; tip.hidden = false;
  tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
  renderer.domElement.style.cursor = 'pointer';
});
renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; });

/* =====================================================================
   COMMANDES
   ===================================================================== */
const setPressed = (ids, on) => ids.forEach(i => $(i).setAttribute('aria-pressed', i === on));
function setMode(m) { mode = m; setPressed(['m-ext', 'm-cut', 'm-half', 'm-xray'], { ext: 'm-ext', cut: 'm-cut', half: 'm-half', xray: 'm-xray' }[m]); refreshMats(); }
$('m-ext').onclick = () => setMode('ext'); $('m-cut').onclick = () => setMode('cut'); $('m-half').onclick = () => setMode('half'); $('m-xray').onclick = () => setMode('xray');
$('cut-case').onclick = () => { cutAll = false; setPressed(['cut-case', 'cut-all'], 'cut-case'); refreshMats(); };
$('cut-all').onclick = () => { cutAll = true; setPressed(['cut-case', 'cut-all'], 'cut-all'); refreshMats(); };
function setPause(p) { paused = p; $('t-pause').setAttribute('aria-pressed', p); $('t-pause').textContent = p ? '▶ Reprendre' : '⏸ Figer'; $('frozen').hidden = !p; }
$('t-pause').onclick = () => setPause(!paused);
$('slow').onchange = e => { slow = parseFloat(e.target.value); $('rot-note').textContent = 'Rotation affichée ' + e.target.selectedOptions[0].textContent; };
$('t-lbl').onclick = () => { const on = lblLayer.hidden; lblLayer.hidden = !on; $('t-lbl').setAttribute('aria-pressed', on); };
$('t-acc').onclick = () => { showAcc = !showAcc; $('t-acc').setAttribute('aria-pressed', showAcc); if (!showAcc && selected && selected.startsWith('acc_')) select(null); else refreshMats(); };
$('t-bolt').onclick = () => { showBolts = !showBolts; $('t-bolt').setAttribute('aria-pressed', showBolts); refreshMats(); };
function setOil(on) { oilGroup.visible = on; $('t-oil').setAttribute('aria-pressed', on); $('oilkey').hidden = !on; if (on && mode === 'ext') setMode('xray'); }
$('t-oil').onclick = () => setOil(!oilGroup.visible);
$('b-oil').onclick = () => { setOil(true); $('vp').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); };
for (const [id, v] of [['v-34', '34'], ['v-side', 'side'], ['v-front', 'front'], ['v-rear', 'rear']]) $(id).onclick = () => frame(VIEWS[v]);
$('v-fit').onclick = () => frame(null);
const menuBtn = $('menu-toggle'), vmenu = $('vmenu');
function setMenu(open) { vmenu.hidden = !open; menuBtn.setAttribute('aria-expanded', open); }
menuBtn.onclick = () => setMenu(vmenu.hidden);
setMenu(false);

/* ---------- vue éclatée : curseur et étapes ---------- */
const exIn = $('explode'), stepsOl = $('steps');
STEPS.forEach((st, k) => {
  const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
  b.innerHTML = `<b>${k + 1}</b><span>${st.t}<small>${st.r}</small></span>`;
  b.title = st.d; b.addEventListener('click', () => goStep(k + 1, true));
  li.appendChild(b); stepsOl.appendChild(li);
});
let lastStepShown = -1;
function stepUI() {
  const s = Math.round(exTarget);
  $('o-explode').textContent = `${fmt(exT, exT % 1 ? 1 : 0)}/13`;
  const cur = Math.ceil(exT - 0.001);
  if (cur !== lastStepShown) {
    lastStepShown = cur;
    $('exname').innerHTML = cur <= 0 ? 'Réducteur assemblé' : `<b>${cur}/13</b>${STEPS[cur - 1].t}`;
  }
  stepsOl.querySelectorAll('button').forEach((b, k) => { b.toggleAttribute('aria-current', false); b.classList.toggle('done', k + 1 < s); if (k + 1 === s) b.setAttribute('aria-current', 'step'); });
}
let fitAfterEx = false;
function goStep(s, glow) {
  exTarget = clamp(s, 0, 13); exIn.value = exTarget; fitAfterEx = true;
  if (glow && s >= 1) { stepGlow = new Set(STEPS[s - 1].m.flatMap(x => x[0])); stepGlowT = 1; }
  stepUI();
}
exIn.addEventListener('input', () => { exTarget = exT = parseFloat(exIn.value); applyExplode(); stepUI(); });
exIn.addEventListener('change', () => frame(null));
$('ex-prev').onclick = () => goStep(Math.ceil(exTarget - 0.001) - 1, true);
$('ex-next').onclick = () => goStep(Math.floor(exTarget + 0.001) + 1, true);
$('ex-all').onclick = () => goStep(13);
$('ex-none').onclick = () => goStep(0);
let playTimer = null;
function stopPlay() { clearInterval(playTimer); playTimer = null; $('st-play').textContent = '▶ Démonter pas à pas'; }
$('st-play').onclick = () => {
  if (playTimer) { stopPlay(); return; }
  if (exTarget >= 13) goStep(0);
  $('st-play').textContent = '⏸ Pause';
  const next = () => { if (exTarget >= 13) { stopPlay(); return; } goStep(Math.floor(exTarget + 0.001) + 1, true); };
  next(); playTimer = setInterval(next, reduceMotion ? 1800 : 2600);
};
$('st-reset').onclick = () => { stopPlay(); goStep(0); };

/* ---------- couplemètre ---------- */
function tqUI() {
  tqLbft = parseFloat($('tq').value);
  $('o-tq').textContent = `${fmt(tqLbft)} lb·pi`;
  $('tq-psi').textContent = `${fmt(tqLbft / 30.87, 1)} psi`;
  $('tq-shp').textContent = `${fmt(tqLbft * NP_RPM / 5252)} SHP`;
  $('tq-mv').textContent = `${fmt(tqLbft / 1315 * 100)} %`;
  updateTorque();
}
$('tq').addEventListener('input', tqUI);

/* ---------- plein écran ---------- */
const vp = $('vp');
function isFs() { return document.fullscreenElement === vp || document.webkitFullscreenElement === vp || vp.classList.contains('pseudo-fs'); }
function toggleFs() {
  if (isFs()) {
    if (vp.classList.contains('pseudo-fs')) { vp.classList.remove('pseudo-fs'); document.documentElement.classList.remove('pseudo-fs-on'); }
    else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else if (vp.requestFullscreen) vp.requestFullscreen().catch(() => { vp.classList.add('pseudo-fs'); document.documentElement.classList.add('pseudo-fs-on'); fsUI(); });
  else if (vp.webkitRequestFullscreen) vp.webkitRequestFullscreen();
  else { vp.classList.add('pseudo-fs'); document.documentElement.classList.add('pseudo-fs-on'); }
  setTimeout(fsUI, 60);
}
function fsUI() { const on = isFs(); $('t-fs').setAttribute('aria-pressed', on); $('t-fs').textContent = on ? '✕ Quitter' : '⛶ Plein écran'; }
$('t-fs').onclick = toggleFs;
document.addEventListener('fullscreenchange', fsUI); document.addEventListener('webkitfullscreenchange', fsUI);
document.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea')) return;
  if (e.key === ' ') { e.preventDefault(); setPause(!paused); }
  else if (e.key === 'f' || e.key === 'F') toggleFs();
  else if (e.key === 'm' || e.key === 'M') setMenu(vmenu.hidden);
  else if (e.key === 'Escape' && vp.classList.contains('pseudo-fs')) toggleFs();
  else if (e.key === 'ArrowRight' && e.altKey) goStep(Math.floor(exTarget + 0.001) + 1, true);
  else if (e.key === 'ArrowLeft' && e.altKey) goStep(Math.ceil(exTarget - 0.001) - 1, true);
});

/* ---------- thème ---------- */
window.addEventListener('themechange', () => { buildGrid(); selColor = new THREE.Color(cssVar('--sel') || '#7cc4e4'); oilColors(); refreshMats(); });

/* ---------- HUD ---------- */
$('h-nf').textContent = fmt(NF_RPM); $('h-c1').textContent = fmt(NF_RPM / G1.i); $('h-pr').textContent = fmt(NP_RPM); $('h-acc').textContent = fmt(ACC_RPM);
{ const e = $('ratio-model'); if (e) e.textContent = `${fmt(G1.i, 2)} × ${fmt(G2.i, 2)}`; }
for (const [id, v] of [['f-nf', `≈ ${fmt(NF_RPM, 0)}*`], ['f-i1', `÷ ${fmt(G1.i, 2)}*`], ['f-c1', `≈ ${fmt(NF_RPM / G1.i, 0)}*`], ['f-i2', `÷ ${fmt(G2.i, 2)}*`]]) { const e = $(id); if (e) e.textContent = v; }
{ const tb = $('teeth'); if (tb) tb.innerHTML = [[ '1<sup>er</sup>', G1], ['2<sup>e</sup>', G2]].map(([n, g]) => `<tr><td>${n}</td><td class="n">${g.S} d.</td><td class="n">${g.N} × ${g.P} d.</td><td class="n">${g.R} d.</td><td class="n">1 + ${g.R}/${g.S} = ${fmt(g.i, 3)}</td></tr>`).join(''); }

/* =====================================================================
   BOUCLE
   ===================================================================== */
function resize() {
  const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view); resize();
applyExplode(); updateGears(); tqUI(); select(null); setPause(paused); stepUI();
frame(VIEWS['34'], true);
let last = performance.now();
function loop(now) {
  const rdt = Math.min(0.25, (now - last) / 1000), dt = Math.min(0.05, rdt); last = now;
  if (!paused) aNf += W_NF * slow * dt;
  updateGears();
  if (Math.abs(exTarget - exT) > 1e-4) {
    const sp = reduceMotion ? 100 : Math.max(1.8, Math.abs(exTarget - exT) * 1.2);
    exT += clamp(exTarget - exT, -sp * rdt, sp * rdt); applyExplode(); stepUI();
    if (Math.abs(exTarget - exT) <= 1e-4) { exT = exTarget; applyExplode(); stepUI(); if (fitAfterEx) { fitAfterEx = false; frame(null); } }
  }
  if (stepGlow) { stepGlowT -= rdt * 0.45; if (stepGlowT <= 0) { stepGlow = null; } refreshMats(); }
  if (camAnim) {
    camAnim.k = Math.min(1, camAnim.k + rdt * 1.6); const e = ease(camAnim.k);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e); controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
    if (camAnim.k >= 1) camAnim = null;
  }
  if (oilGroup.visible) for (const k in oilMats) for (const m of oilMats[k]) m.map.offset.x -= dt * (paused ? 0 : 0.9);
  if (grid && Math.abs(grid.position.y - gridY) > 1e-4) grid.position.y += (gridY - grid.position.y) * Math.min(1, rdt * 4);
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__rgb = { PART, STEPS, goStep, select, setMode, setOil, frame, VIEWS, G1, G2, I_TOT };
})();
