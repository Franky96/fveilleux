(function () {
  'use strict';

  if (!sessionStorage.getItem('loggedIn')) { window.location.href = 'index.html'; return; }

  const $ = (id) => document.getElementById(id);
  const loadingEl = $('viewport-loading');
  if (typeof THREE === 'undefined' || !THREE.OrbitControls) {
    if (loadingEl) loadingEl.textContent = 'Impossible de charger le moteur 3D (bibliothèque non disponible).';
    return;
  }

  /* ═══════════════ Données officielles (EASA TCDS IM.E.090, issue 07) ═══════════════ */
  const ENG = {
    n1Max: 10600, n2Max: 24470,         // tr/min, décollage et continu
    gear: 3.0625,                       // N_fan = N1 / 3,0625
    n1GroundIdle: 1574, n1FlightIdle: 1991, n2Idle: 13264,
    ittTO: 1054, ittMCT: 1017,          // °C
    fanR: 0.927,                        // m (Ø 73 po)
    variants: {                         // lbf, décollage / max. continu
      PW1519G: { to: 19775, mct: 18685 },
      PW1521G: { to: 21970, mct: 20760 },
      PW1524G: { to: 24400, mct: 23050 },
    },
  };
  const LBF_TO_KN = 0.004448222, OAT = 15;

  // Sens de rotation (+1 = antihoraire vu de l'arrière). Absolu figuré ; relatifs :
  // réducteur en étoile → soufflante contraire au corps BP ; corps BP et HP contrarotatifs (brevets P&W).
  const DIR = { lp: 1, fan: -1, hp: -1 };
  // Réducteur en étoile : soleil (corps BP) → 5 satellites sur porte-satellites fixe → couronne (soufflante)
  const ZS = 32, ZP = 33, ZR = 98; // 98 / 32 = 3,0625 exactement ; ZR = ZS + 2·ZP

  /* ═══════════════ Échelle et utilitaires ═══════════════ */
  const S = 4, XC = 2.15;             // 1 m = 4 unités ; x = distance depuis la lèvre d'entrée (m)
  const X = (x) => (x - XC) * S;
  const R = (r) => r * S;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function piecewise(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
    }
    return pts[pts.length - 1][1];
  }
  const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const fmt = (v) => Math.round(v).toLocaleString('fr-CA');
  const dec = (v, n = 1) => v.toFixed(n).replace('.', ',');

  /* ═══════════════ Veine (reconstituée : longueur 3,045 m bride à bride, soufflante Ø 1,854 m) ═══════════════ */
  const HUB = [
    [0.45, 0.0], [0.50, 0.07], [0.58, 0.15], [0.66, 0.22], [0.74, 0.265], [0.85, 0.283], [1.00, 0.293], [1.12, 0.30],
    [1.35, 0.31], [1.75, 0.33], [1.85, 0.30], [1.95, 0.22], [2.02, 0.19], [2.62, 0.205], [2.68, 0.21], [2.72, 0.25],
    [2.95, 0.25], [3.15, 0.255], [3.28, 0.26], [3.55, 0.28], [3.62, 0.285], [3.90, 0.22], [4.10, 0.12], [4.30, 0.0],
  ];
  const CORE_OUT = [
    [0.0, 0.47], [0.72, 0.465], [1.10, 0.455], [1.35, 0.445], [1.75, 0.415], [1.85, 0.395], [1.95, 0.30], [2.02, 0.268],
    [2.62, 0.228], [2.68, 0.235], [2.72, 0.345], [2.95, 0.345], [2.98, 0.33], [3.15, 0.34], [3.22, 0.365], [3.30, 0.38],
    [3.55, 0.45], [3.62, 0.455], [3.90, 0.42], [5.20, 0.46],
  ];
  const BYP_IN = [[0.0, 0.47], [1.10, 0.46], [1.30, 0.53], [1.90, 0.62], [2.60, 0.60], [3.30, 0.52], [3.90, 0.43], [5.20, 0.47]];
  const BYP_OUT = [
    [0.0, 0.955], [0.08, 0.925], [0.30, 0.925], [0.60, 0.93], [0.72, 0.935], [1.00, 0.935], [1.50, 0.93], [2.10, 0.885],
    [2.55, 0.83], [3.90, 0.80], [5.20, 0.82],
  ];
  const hubAt = (x) => piecewise(HUB, x), coreOutAt = (x) => piecewise(CORE_OUT, x);
  const bypInAt = (x) => piecewise(BYP_IN, x), bypOutAt = (x) => piecewise(BYP_OUT, x);

  /* ═══════════════ Modules (vue éclatée) ═══════════════ */
  const MOD_OFF = { fan: -0.9, gb: -0.55, lpc: -0.25, core: 0, lpt: 0.55, shaft: 0, nac: 0, cowl: 0 }; // m, à éclatement complet
  const modOf = (x) => (x < 1.0 ? 'fan' : x < 1.13 ? 'gb' : x < 1.98 ? 'lpc' : x < 3.2 ? 'core' : 'lpt');
  const modObjs = [];
  function setMod(obj, mod) { obj.userData.mod = mod; obj.userData.baseX = obj.position.x; modObjs.push(obj); return obj; }

  /* ═══════════════ Scène ═══════════════ */
  const viewport = $('engine-viewport'), canvas = $('engine-canvas'), labelLayer = $('label-layer');
  const scene = new THREE.Scene();
  scene.background = col(0x05080a);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 250);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const VIEWS = {
    34: [V3(6, 5.2, 15.5), V3(-0.5, 0, 0)],
    side: [V3(0, 2.5, 25), V3(0, 0, 0)],
    front: [V3(-24, 3, 6), V3(-3, 0, 0)],
    rear: [V3(24, 3, 6), V3(3, 0, 0)],
    gear: [V3(X(1.0) + 1.5, 2.4, 3.2), V3(X(1.07), 0.4, 0.4)],
  };
  camera.position.copy(VIEWS[34][0]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.5; controls.maxDistance = 45; controls.autoRotateSpeed = 0.9;
  controls.target.copy(VIEWS[34][1]);

  (function environment() {
    const pmrem = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    const sky = new THREE.SphereGeometry(50, 32, 16), p = sky.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) { const v = 0.04 + 0.32 * Math.max(0, p.getY(i) / 50); c.push(v * 0.85, v * 0.95, v); }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const panel = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m); };
    panel(40, 10, V3(0, 35, 8), 4); panel(20, 20, V3(30, 10, 25), 1.6); panel(20, 12, V3(-30, 6, -20), 1.0);
    scene.environment = pmrem.fromScene(env, 0.04).texture; pmrem.dispose();
  })();
  scene.add(new THREE.HemisphereLight(col(0x9ab4c4), col(0x0a0f0a), 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(6, 10, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(col(0x8fb8d0), 0.5); rim.position.set(-10, 4, -8); scene.add(rim);
  const grid = new THREE.GridHelper(90, 90, 0x1f3a24, 0x101a14); grid.position.y = R(-1.4);
  grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);

  /* ═══════════════ Coupe : plans fixes dans la scène ═══════════════
     Coupe ¼ : retire y > 0 et z > 0 (intersection des deux plans). Moitié : retire z > 0 (deux plans identiques). */
  const clipA = new THREE.Plane(V3(0, -1, 0), 0), clipB = new THREE.Plane(V3(0, 0, -1), 0);
  const CLIP = [clipA, clipB], NO_CLIP = [];

  /* ═══════════════ Matériaux (couleur réelle / par section) ═══════════════ */
  const MATS = [];
  function mat(real, coded, o, flags) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: col(real), metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide, clipIntersection: true }, o || {}));
    Object.assign(m.userData, { real: col(real), coded: col(coded), keep: false, ghost: false }, flags || {});
    MATS.push(m); return m;
  }
  const KEEP = { keep: true }, GHOST = { ghost: true };
  const MAT = {
    nacelle: mat(0xe6e8ea, 0x8fb8d0, { metalness: 0.1, roughness: 0.42 }, GHOST),
    cowl: mat(0xc2c7cc, 0x7f9aa8, { metalness: 0.45, roughness: 0.4 }, GHOST),
    spinner: mat(0x3b3f45, 0x2f7f86, { metalness: 0.5, roughness: 0.35 }),
    fan: mat(0xb8bfc6, 0x4fc3c7, { metalness: 0.9, roughness: 0.28 }),
    fanDisk: mat(0x80868c, 0x3fa2aa),
    fegv: mat(0x8c939a, 0x3a9da3),
    lpc: mat(0xa4aab0, 0x6f8fae), lpcS: mat(0x8a9096, 0x587896), strut: mat(0x6a7076, 0x56606a, { roughness: 0.5 }),
    hpc: mat(0xa0a3a6, 0xb4b4b4), hpcS: mat(0x85888b, 0x8c8c8c),
    casing: mat(0x5a5f64, 0x46525a, { roughness: 0.48 }, GHOST), hub: mat(0x70757b, 0x5d6870, { roughness: 0.42 }, GHOST),
    diskLP: mat(0x7c8288, 0x5fa4b4), diskHP: mat(0x827d74, 0xb8a060),
    shaftLP: mat(0x9aa0a8, 0xb8c4d0, { metalness: 0.9, roughness: 0.25 }, KEEP),
    shaftHP: mat(0x9c9588, 0xd4af37, { metalness: 0.9, roughness: 0.25 }, KEEP),
    shaftFan: mat(0x8f969e, 0x4fc3c7, { metalness: 0.9, roughness: 0.25 }), // cône d'arbre de soufflante : coupé pour voir le réducteur
    gear: mat(0x8d9096, 0xb98cf0, { metalness: 0.95, roughness: 0.3 }, KEEP),
    // couronne et porte-satellites coupés avec le reste, pour laisser voir le soleil et les satellites
    ring: mat(0xb08a62, 0xa77be0, { metalness: 0.9, roughness: 0.32 }),
    carrier: mat(0x6c7076, 0x8a6cc0, { roughness: 0.4 }),
    liner: mat(0x8c7660, 0xff7a3a, { metalness: 0.55, roughness: 0.55 }), injector: mat(0x6f6a64, 0xd0a060),
    hptV: mat(0xa98f63, 0xc9442a, { roughness: 0.5 }), hpt: mat(0xc0a676, 0xe85d3f, { roughness: 0.45 }),
    mtf: mat(0x7e7466, 0xd06a30, { roughness: 0.5 }),
    lptV: mat(0x8e8069, 0xd08420, { roughness: 0.5 }), lpt: mat(0xa99579, 0xf0a830, { roughness: 0.45 }),
    plug: mat(0x67625c, 0x7a7a7a, { roughness: 0.55 }, GHOST),
  };
  for (const m of MATS) { m.userData.baseOpacity = m.opacity; }
  const flameMat = new THREE.MeshBasicMaterial({ color: col(0xff6a1a), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, clipIntersection: true });

  /* ═══════════════ Groupes tournants ═══════════════ */
  const engine = new THREE.Group(); scene.add(engine);
  const ST = new THREE.Group(), FAN = new THREE.Group(), LP = new THREE.Group(), HP = new THREE.Group();
  engine.add(ST, FAN, LP, HP);
  const pickables = [];
  function add(mesh, group, info) { mesh.userData.info = info; group.add(mesh); pickables.push(mesh); return mesh; }

  /* ═══════════════ Pièces de révolution ═══════════════ */
  const capSources = [];
  function latheGeo(pts, seg) {
    const g = new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(Math.max(R(r), 1e-4), X(x))), seg || 128);
    g.rotateZ(-Math.PI / 2); // axe de révolution → X ; un point (r, φ) devient (x, −r·sinφ, r·cosφ)
    return g;
  }
  const closed = (pts) => pts.concat([pts[0]]);
  const shell = (pts, t) => closed(pts.concat(pts.slice().reverse().map(([x, r]) => [x, r + t])));
  const solid = (pts) => closed([[pts[0][0], 0]].concat(pts, [[pts[pts.length - 1][0], 0]]));
  const midX = (pts) => pts.reduce((s, p) => s + p[0], 0) / pts.length;
  function revolve(pts, material, group, info, seg, mod) {
    const m = mod || modOf(midX(pts));
    const mesh = setMod(add(new THREE.Mesh(latheGeo(pts, seg), material), group, info), m);
    capSources.push({ pts, material, info, mod: m });
    return mesh;
  }
  function diskProfile(x, w, rim, bore) {
    return closed([
      [x - w / 2, rim], [x + w / 2, rim], [x + w / 2, rim - 0.015], [x + w * 0.15, rim - 0.03], [x + w * 0.15, bore + 0.03],
      [x + w * 0.4, bore + 0.018], [x + w * 0.4, bore], [x - w * 0.4, bore], [x - w * 0.4, bore + 0.018],
      [x - w * 0.15, bore + 0.03], [x - w * 0.15, rim - 0.03], [x - w / 2, rim - 0.015],
    ]);
  }

  /* ═══════════════ Aubes : profil NACA vrillé, défini par ses angles d'écoulement ═══════════════
     Repère d'une aube : x axial (aval), y radial, z tangentiel. Vu de l'arrière, +z = antihoraire.
     Angles en degrés, positifs vers l'antihoraire : le bord d'attaque suit « le », le bord de fuite « te ». */
  function bladeGeo(o) {
    const ns = o.spans || 6, nc = o.cpts || 7, us = [];
    for (let k = 0; k < nc; k++) us.push(0.5 * (1 - Math.cos(Math.PI * k / (nc - 1))));
    const ring = [];
    for (let k = 0; k < nc; k++) ring.push([us[k], 1]);
    for (let k = nc - 2; k > 0; k--) ring.push([us[k], -1]);
    const M = ring.length, pos = new Float32Array(ns * M * 3);
    let p = 0;
    for (let s = 0; s < ns; s++) {
      const f = s / (ns - 1), r = lerp(o.hub, o.tip, f), c = lerp(o.chord[0], o.chord[1], f);
      const le = lerp(o.le[0], o.le[1], f) * DEG, te = lerp(o.te[0], o.te[1], f) * DEG;
      const g = (le + te) / 2, m = Math.tan((le - te) / 2) / 4, sw = (o.sweep || 0) * f * f;
      const cg = Math.cos(g), sg = Math.sin(g);
      for (let k = 0; k < M; k++) {
        const u = ring[k][0], side = ring[k][1];
        const t = 5 * o.tr * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
        const cx = (u - 0.5) * c, cy = (m * 4 * u * (1 - u) + side * t) * c;
        pos[p++] = (cx * cg - cy * sg + sw) * S; pos[p++] = r * S; pos[p++] = (cx * sg + cy * cg) * S;
      }
    }
    const idx = [];
    for (let s = 0; s < ns - 1; s++) for (let k = 0; k < M; k++) { const a = s * M + k, b = s * M + (k + 1) % M; idx.push(a, b, b + M, a, b + M, a + M); }
    const top = (ns - 1) * M;
    for (let k = 1; k < M - 1; k++) idx.push(top, top + k + 1, top + k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  function row(o) {
    const hub = o.hub !== undefined ? o.hub : hubAt(o.x), tip = o.tip !== undefined ? o.tip : coreOutAt(o.x) - 0.003;
    const geo = bladeGeo(Object.assign({}, o, { hub, tip, tr: o.tr || 0.07 }));
    const im = new THREE.InstancedMesh(geo, o.mat, o.n), d = new THREE.Object3D(), phase = o.phase || 0;
    for (let i = 0; i < o.n; i++) { d.rotation.set(phase + (i / o.n) * TAU, 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
    im.position.x = X(o.x);
    const mod = o.mod || modOf(o.x);
    setMod(add(im, o.group, o.info), mod);
    if (o.disk) revolve(diskProfile(o.x, o.disk.w, hub, o.disk.bore), o.disk.mat, o.group, o.info, 72, mod);
    return im;
  }

  /* ═══════════════ Engrenages (réducteur de soufflante) ═══════════════ */
  const MOD = 0.0052; // module figuré (m) : rayons primitifs 0,083 / 0,086 / 0,255 m
  function gearGeo(teeth, internal, width, rimR) {
    const rp = MOD * teeth / 2, add_ = MOD, ded = 1.25 * MOD, shape = new THREE.Shape(), pts = [];
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * TAU, st = TAU / teeth;
      const rIn = internal ? rp + ded : rp - ded, rOut = internal ? rp - add_ : rp + add_;
      pts.push([rIn, a0], [rIn, a0 + st * 0.2], [rOut, a0 + st * 0.35], [rOut, a0 + st * 0.65], [rIn, a0 + st * 0.8]);
    }
    const path = pts.map(([r, a]) => new THREE.Vector2(R(r) * Math.cos(a), R(r) * Math.sin(a)));
    if (internal) { shape.absarc(0, 0, R(rimR), 0, TAU, false); shape.holes.push(new THREE.Path(path.slice().reverse())); }
    else { shape.setFromPoints(path); if (rimR) shape.holes.push(new THREE.Path().absarc(0, 0, R(rimR), 0, TAU, true)); }
    const g = new THREE.ExtrudeGeometry(shape, { depth: R(width), steps: 6, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -R(width) / 2);
    // dentures en chevrons (Kawasaki fig. 3) : torsion en V de part et d'autre du plan médian
    const p = g.attributes.position, helix = 0.35 * (internal ? -1 : 1) * MOD * 40;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), a = helix * Math.abs(z) / R(width), x = p.getX(i), y = p.getY(i);
      p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    }
    g.rotateY(Math.PI / 2); g.computeVertexNormals();
    return g;
  }

  /* ═══════════════════════════════ CONSTRUCTION ═══════════════════════════════ */

  // Nacelle (tuyère secondaire séparée ; inverseur hors définition de type : TCDS note 4)
  const nacelle = revolve(closed([
    [0.0, 0.975], [0.02, 1.01], [0.08, 1.05], [0.20, 1.10], [0.45, 1.15], [0.90, 1.175], [1.50, 1.16], [2.10, 1.03], [2.45, 0.87], [2.55, 0.84],
    [2.55, 0.83], [2.10, 0.885], [1.50, 0.93], [1.00, 0.935], [0.72, 0.935], [0.60, 0.93], [0.30, 0.925], [0.10, 0.925], [0.04, 0.935], [0.01, 0.955],
  ]), MAT.nacelle, ST, 'nacelle', 128, 'nac');
  const coreCowl = revolve(closed([
    [1.10, 0.46], [1.30, 0.53], [1.90, 0.62], [2.60, 0.60], [3.30, 0.52], [3.90, 0.43],
    [3.90, 0.42], [3.30, 0.508], [2.60, 0.588], [1.95, 0.607], [1.93, 0.40], [1.85, 0.40], [1.75, 0.418], [1.35, 0.448], [1.10, 0.458],
  ]), MAT.cowl, ST, 'corecowl', 128, 'cowl');
  // Carters (découpés par module pour la vue éclatée) et plates-formes de veine
  revolve(shell([[1.95, 0.302], [2.02, 0.271], [2.62, 0.231], [2.68, 0.262], [2.72, 0.40], [2.95, 0.40], [3.00, 0.335], [3.15, 0.343], [3.20, 0.36]], 0.008), MAT.casing, ST, 'casing', 128, 'core');
  revolve(shell([[3.20, 0.36], [3.22, 0.368], [3.30, 0.385], [3.55, 0.455], [3.62, 0.46], [3.90, 0.425]], 0.008), MAT.casing, ST, 'casing', 128, 'lpt');
  revolve(shell(HUB.filter(([x]) => x >= 1.12 && x <= 1.95), -0.006), MAT.hub, ST, 'casing', 128, 'lpc');
  revolve(shell(HUB.filter(([x]) => x >= 1.95 && x <= 3.15), -0.006), MAT.hub, ST, 'casing', 128, 'core');
  revolve(shell(HUB.filter(([x]) => x >= 3.15 && x <= 3.62), -0.006), MAT.hub, ST, 'casing', 128, 'lpt');
  // Cône d'entrée et cône d'échappement
  revolve(solid([[0.45, 0.0], [0.47, 0.02], [0.55, 0.10], [0.65, 0.19], [0.74, 0.262], [0.80, 0.28]]), MAT.spinner, FAN, 'spinner', 96, 'fan');
  revolve(solid([[3.62, 0.283], [3.90, 0.22], [4.10, 0.12], [4.30, 0.0]]), MAT.plug, ST, 'plug', 96, 'lpt');

  // ── Soufflante (tourne à N1 / 3,0625) ──
  row({ x: 0.86, n: 18, hub: 0.284, tip: 0.925, chord: [0.24, 0.40], le: [35, 62], te: [2, 50], tr: 0.07, sweep: 0.04, spans: 12, cpts: 11, mat: MAT.fan, group: FAN, info: 'fan' });
  revolve(diskProfile(0.86, 0.12, 0.28, 0.10), MAT.fanDisk, FAN, 'fan', 72, 'fan');
  revolve(shell([[0.92, 0.20], [0.98, 0.235], [1.02, 0.262], [1.10, 0.262]], 0.012), MAT.shaftFan, FAN, 'fanshaft', 72, 'fan');
  row({ x: 1.45, n: 40, hub: bypInAt(1.45) - 0.005, tip: bypOutAt(1.45) + 0.003, chord: [0.16, 0.18], le: [-32, -28], te: [0, 0], tr: 0.09, mat: MAT.fegv, group: ST, info: 'fegv', mod: 'fan' });
  row({ x: 1.18, n: 36, chord: [0.05, 0.05], le: [-30, -30], te: [0, 0], tr: 0.08, mat: MAT.lpcS, group: ST, info: 'corevane', mod: 'lpc' });

  // ── Réducteur de soufflante (FDGS) : soleil → 5 satellites (porte-satellites fixe) → couronne ──
  const GX = X(1.06), GW = 0.08;
  const sun = add(new THREE.Mesh(gearGeo(ZS, false, GW, 0.03), MAT.gear), LP, 'fdgs'); sun.position.x = GX; setMod(sun, 'gb');
  const ringGear = add(new THREE.Mesh(gearGeo(ZR, true, GW, MOD * ZR / 2 + 0.028), MAT.ring), FAN, 'fdgs'); ringGear.position.x = GX; setMod(ringGear, 'gb');
  const stars = [], starC = MOD * (ZS + ZP) / 2, starGeo = gearGeo(ZP, false, GW * 0.96, 0.028);
  for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5, piv = new THREE.Group();
    piv.position.set(GX, Math.cos(a) * R(starC), Math.sin(a) * R(starC));
    add(new THREE.Mesh(starGeo, MAT.gear), piv, 'fdgs');
    const pin = add(new THREE.Mesh(new THREE.CylinderGeometry(R(0.026), R(0.026), R(GW + 0.05), 20), MAT.carrier), ST, 'fdgs');
    pin.rotation.z = Math.PI / 2; pin.position.copy(piv.position); setMod(pin, 'gb');
    ST.add(piv); setMod(piv, 'gb'); stars.push(piv);
  }
  revolve(closed([[1.105, 0.05], [1.12, 0.05], [1.12, 0.215], [1.105, 0.215]]), MAT.carrier, ST, 'fdgs', 96, 'gb');
  revolve(shell([[1.12, 0.20], [1.15, 0.25], [1.17, 0.295]], 0.012), MAT.carrier, ST, 'fdgs', 96, 'gb');

  // ── Corps basse pression : compresseur BP (3 étages) + turbine BP (3 étages) ──
  [1.30, 1.46, 1.62].forEach((x, i) => {
    row({ x, n: 36 + 4 * i, chord: [0.07, 0.075], le: [-50, -60], te: [-25, -35], mat: MAT.lpc, group: LP, info: 'lpc', disk: { w: 0.05, bore: 0.08, mat: MAT.diskLP } });
    row({ x: x + 0.08, n: 48, chord: [0.06, 0.06], le: [35, 30], te: [0, 0], tr: 0.08, mat: MAT.lpcS, group: ST, info: 'lpc' });
  });
  revolve(shell([[1.27, 0.27], [1.285, 0.11], [1.29, 0.055]], 0.012), MAT.shaftLP, LP, 'shaftLP', 72, 'lpc');
  row({ x: 1.90, n: 8, chord: [0.10, 0.10], le: [0, 0], te: [0, 0], tr: 0.22, mat: MAT.strut, group: ST, info: 'intcase', mod: 'lpc' });

  [[3.33, 60, [8, 8], [-55, -55]], [3.45, 66, [8, 8], [-52, -52]], [3.57, 72, [6, 6], [-45, -45]]].forEach(([x, n, le, te]) =>
    row({ x, n, chord: [0.045, 0.045], le, te, tr: 0.1, mat: MAT.lpt, group: LP, info: 'lpt', disk: { w: 0.04, bore: 0.08, mat: MAT.diskLP } }));
  [[3.39, 64, [-15, -15], [60, 60]], [3.51, 70, [-12, -12], [58, 58]]].forEach(([x, n, le, te]) =>
    row({ x, n, chord: [0.045, 0.045], le, te, tr: 0.12, mat: MAT.lptV, group: ST, info: 'lpt' }));
  revolve(shell([[3.33, 0.24], [3.57, 0.25], [3.60, 0.12], [3.62, 0.055]], 0.01), MAT.shaftLP, LP, 'shaftLP', 72, 'lpt');
  revolve(solid([[1.02, 0.045], [3.64, 0.045]]), MAT.shaftLP, LP, 'shaftLP', 32, 'shaft');

  // ── Corps haute pression : compresseur HP (8 étages) + turbine HP (2 étages, refroidie) ──
  row({ x: 2.03, n: 44, chord: [0.035, 0.035], le: [0, 0], te: [-12, -12], mat: MAT.hpcS, group: ST, info: 'hpc' }); // aubes d'entrée à calage variable
  for (let i = 0; i < 8; i++) {
    const x = 2.07 + i * 0.068;
    row({ x, n: 30 + 3 * i, chord: [0.042 - 0.0018 * i, 0.044 - 0.0018 * i], le: [55, 62], te: [30, 38], tr: 0.06, mat: MAT.hpc, group: HP, info: 'hpc', disk: { w: 0.032, bore: 0.12, mat: MAT.diskHP } });
    row({ x: x + 0.034, n: 40 + 3 * i, chord: [0.034 - 0.0014 * i, 0.034 - 0.0014 * i], le: [-35, -30], te: [-5, 0], tr: 0.07, mat: MAT.hpcS, group: ST, info: 'hpc' });
  }
  row({ x: 2.645, n: 60, chord: [0.03, 0.03], le: [-25, -25], te: [0, 0], mat: MAT.hpcS, group: ST, info: 'hpc' });
  row({ x: 3.00, n: 24, hub: 0.25, tip: 0.332, chord: [0.05, 0.05], le: [0, 0], te: [-72, -72], tr: 0.2, mat: MAT.hptV, group: ST, info: 'hptv' });
  row({ x: 3.05, n: 50, hub: 0.252, tip: 0.334, chord: [0.038, 0.036], le: [-10, -5], te: [60, 60], tr: 0.17, mat: MAT.hpt, group: HP, info: 'hpt', disk: { w: 0.04, bore: 0.12, mat: MAT.diskHP } });
  row({ x: 3.10, n: 28, hub: 0.253, tip: 0.337, chord: [0.045, 0.045], le: [15, 15], te: [-68, -68], tr: 0.18, mat: MAT.hptV, group: ST, info: 'hptv' });
  row({ x: 3.15, n: 56, hub: 0.255, tip: 0.338, chord: [0.036, 0.034], le: [-8, -5], te: [58, 58], tr: 0.16, mat: MAT.hpt, group: HP, info: 'hpt', disk: { w: 0.04, bore: 0.12, mat: MAT.diskHP } });
  revolve(shell([[2.00, 0.08], [2.03, 0.10], [2.07, 0.16], [2.546, 0.17], [2.60, 0.17], [2.72, 0.13], [3.00, 0.12], [3.15, 0.12]], 0.01), MAT.shaftHP, HP, 'shaftHP', 72, 'shaft');

  // ── Carter inter-turbines (MTF) et carter d'échappement (TEC) ──
  row({ x: 3.24, n: 12, chord: [0.09, 0.09], le: [18, 18], te: [55, 55], tr: 0.2, mat: MAT.mtf, group: ST, info: 'mtf', mod: 'lpt' });
  row({ x: 3.68, n: 12, hub: 0.27, tip: 0.448, chord: [0.08, 0.08], le: [-15, -15], te: [0, 0], tr: 0.2, mat: MAT.strut, group: ST, info: 'tec', mod: 'lpt' });

  // ── Chambre de combustion annulaire TALON X ──
  revolve(shell([[2.73, 0.325], [2.76, 0.34], [2.90, 0.34], [2.97, 0.32]], 0.006), MAT.liner, ST, 'combustor', 96, 'core');
  revolve(shell([[2.73, 0.275], [2.76, 0.258], [2.90, 0.258], [2.97, 0.255]], -0.006), MAT.liner, ST, 'combustor', 96, 'core');
  revolve(shell([[2.73, 0.275], [2.718, 0.288], [2.713, 0.30], [2.718, 0.312], [2.73, 0.325]], -0.005), MAT.liner, ST, 'combustor', 96, 'core');
  const flame = add(new THREE.Mesh(latheGeo(closed([[2.735, 0.285], [2.735, 0.318], [2.80, 0.336], [2.90, 0.337], [2.965, 0.30], [2.965, 0.262], [2.90, 0.263], [2.80, 0.263]]), 96), flameMat), ST, 'combustor');
  flame.renderOrder = 2; setMod(flame, 'core');
  (function injectors() { // ≈ 18 injecteurs (figuré d'après Kawasaki fig. 2)
    const g = new THREE.CylinderGeometry(R(0.008), R(0.008), R(0.1), 10); g.rotateZ(0.35); g.translate(0, R(0.36), 0);
    const im = new THREE.InstancedMesh(g, MAT.injector, 18), d = new THREE.Object3D();
    for (let i = 0; i < 18; i++) { d.rotation.set((i / 18) * TAU, 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
    im.position.x = X(2.715); setMod(add(im, ST, 'injectors'), 'core');
  })();
  const flameLight = new THREE.PointLight(col(0xff7a33), 1, R(0.8), 2); flameLight.position.set(X(2.85), 0, 0); ST.add(flameLight);

  // Matériaux des pièces tournantes (option « Carters seulement »)
  for (const g of [FAN, LP, HP]) g.traverse((o) => { if (o.material && o.material.userData) o.material.userData.rot = true; });
  for (const p of stars) p.traverse((o) => { if (o.material && o.material.userData) o.material.userData.rot = true; });

  /* ═══════════════ Faces de coupe pleines (fixes) ═══════════════
     faceY : plan z = 0 côté y > 0 · faceYn : plan z = 0 côté y < 0 · faceZ : plan y = 0 côté z > 0.
     Coupe ¼ → faceY + faceZ ; Moitié → faceY + faceYn. Un volume de révolution a pour section son profil. */
  const caps = [], capMats = new Map();
  for (const src of capSources) {
    if (!capMats.has(src.material)) capMats.set(src.material, new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.62, side: THREE.DoubleSide }));
    const base = new THREE.ShapeGeometry(new THREE.Shape(src.pts.map(([x, r]) => new THREE.Vector2(X(x), R(r)))));
    const faces = { y: base, yn: base.clone().rotateX(Math.PI), z: base.clone().rotateX(Math.PI / 2) };
    for (const [face, g] of Object.entries(faces)) {
      const cap = new THREE.Mesh(g, capMats.get(src.material));
      cap.visible = false; cap.userData.src = src.material; cap.userData.face = face;
      setMod(add(cap, ST, src.info), src.mod); caps.push(cap);
    }
  }

  /* ═══════════════ État d'affichage ═══════════════ */
  const view = { mode: 'cut', cutAll: true, keep: true, nacelle: true, flow: true, stations: false, labels: true, coded: false, explode: 0 };
  const clipped = (m) => (view.mode === 'cut' || view.mode === 'half') && !(m.userData.keep && view.keep) && !(!view.cutAll && m.userData.rot);
  function applyView() {
    clipA.normal.set(0, view.mode === 'half' ? 0 : -1, view.mode === 'half' ? -1 : 0);
    const xray = view.mode === 'xray';
    for (const m of MATS) {
      const want = clipped(m) ? CLIP : NO_CLIP;
      if (m.clippingPlanes !== want) { m.clippingPlanes = want; m.needsUpdate = true; }
      const ghost = xray && m.userData.ghost;
      if (m.transparent !== ghost) { m.transparent = ghost; m.depthWrite = !ghost; m.needsUpdate = true; }
      m.opacity = ghost ? 0.13 : m.userData.baseOpacity;
      m.color.copy(view.coded ? m.userData.coded : m.userData.real);
    }
    const sec = view.mode === 'cut' || view.mode === 'half';
    flameMat.clippingPlanes = sec ? CLIP : NO_CLIP; flameMat.needsUpdate = true;
    for (const [src, cm] of capMats) cm.color.copy(src.color).lerp(new THREE.Color(0xdfe3e7), 0.3);
    for (const c of caps) {
      const faceOk = view.mode === 'cut' ? c.userData.face !== 'yn' : view.mode === 'half' ? c.userData.face !== 'z' : false;
      c.visible = faceOk && clipped(c.userData.src) && !(view.explode > 0.01 && (c.userData.mod === 'nac' || c.userData.mod === 'cowl')) && !(!view.nacelle && c.userData.mod === 'nac');
    }
    const exploded = view.explode > 0.01;
    nacelle.visible = view.nacelle && !exploded;
    coreCowl.visible = !exploded;
    bypassFlow.pts.visible = coreFlow.pts.visible = view.flow && !exploded;
    for (const F of [bypassFlow, coreFlow]) respread(F);
    for (const [id, m] of [['m-ext', 'ext'], ['m-cut', 'cut'], ['m-half', 'half'], ['m-xray', 'xray']]) $(id).setAttribute('aria-pressed', view.mode === m);
  }
  function applyExplode() {
    const e = view.explode * view.explode * (3 - 2 * view.explode);
    for (const o of modObjs) o.position.x = o.userData.baseX + MOD_OFF[o.userData.mod] * e * S;
  }

  /* ═══════════════ Écoulement ═══════════════ */
  const COLD = col(0x7ec8e3);
  const CORE_STOPS = [
    [0.0, 0x7ec8e3], [1.2, 0x9fd6e8], [2.0, 0xcfe6ee], [2.62, 0xffe9c8], [2.74, 0xffc640], [2.85, 0xff6a10],
    [3.0, 0xff4a10], [3.2, 0xff8a30], [3.6, 0xffb060], [3.9, 0xc8a890], [5.2, 0x2a2624],
  ].map(([x, h]) => [x, col(h)]);
  const edgeFade = (x, x0, x1) => clamp(Math.min((x - x0) / 0.25, (x1 - x) / 0.9), 0, 1);
  function coreColor(x, out, heat) {
    let a = CORE_STOPS[0], b = CORE_STOPS[CORE_STOPS.length - 1];
    for (let i = 0; i < CORE_STOPS.length - 1; i++) if (x <= CORE_STOPS[i + 1][0]) { a = CORE_STOPS[i]; b = CORE_STOPS[i + 1]; break; }
    out.copy(a[1]).lerp(b[1], clamp((x - a[0]) / (b[0] - a[0] || 1), 0, 1));
    if (x > 2.7) out.multiplyScalar(0.25 + 0.75 * heat);
    return out.multiplyScalar(edgeFade(x, 0.3, 5.0));
  }
  function flow(n, inner, outer, x0, x1, xRef, colorFn, hotBoost) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), clr = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.065, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; engine.add(pts);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push({ x: lerp(x0, x1, Math.random()), f: 0.06 + 0.88 * Math.random(), u: Math.random(), j: 0.8 + 0.4 * Math.random(), a: 0 });
    return { pts, geo, pos, clr, parts, inner, outer, x0, x1, aRef: outer(xRef) ** 2 - inner(xRef) ** 2, colorFn, hotBoost };
  }
  // particules dans la zone ouverte : quart retiré (Coupe ¼), demi-cercle (Moitié), tour complet (Extérieur, Rayons X)
  function respread(F) {
    const span = view.mode === 'cut' ? [0.06, Math.PI / 2 - 0.06] : view.mode === 'half' ? [0.06, Math.PI - 0.06] : [0, TAU];
    for (const p of F.parts) p.a = lerp(span[0], span[1], p.u);
  }
  const bypassFlow = flow(900, bypInAt, bypOutAt, -0.15, 4.2, 1.0, (x, o) => o.copy(COLD).multiplyScalar(edgeFade(x, -0.15, 4.2)), 0);
  const coreFlow = flow(650, hubAt, coreOutAt, 0.3, 5.0, 1.0, null, 1.4);
  const tmpC = new THREE.Color();
  function stepFlow(F, dt, speed, heat) {
    for (let i = 0; i < F.parts.length; i++) {
      const p = F.parts[i], ri = F.inner(p.x), ro = F.outer(p.x);
      let v = clamp(F.aRef / Math.max(ro * ro - ri * ri, 0.004), 0.35, 3.2);
      if (F.hotBoost && p.x > 2.8) v *= 1 + F.hotBoost * heat;
      p.x += 0.45 * v * speed * p.j * dt;
      if (p.x > F.x1) p.x = F.x0 + Math.random() * 0.05;
      const r = R(lerp(ri, ro, p.f));
      F.pos[i * 3] = X(p.x); F.pos[i * 3 + 1] = Math.cos(p.a) * r; F.pos[i * 3 + 2] = Math.sin(p.a) * r;
      const c = F.colorFn ? F.colorFn(p.x, tmpC) : coreColor(p.x, tmpC, heat);
      F.clr[i * 3] = c.r * speed; F.clr[i * 3 + 1] = c.g * speed; F.clr[i * 3 + 2] = c.b * speed;
    }
    F.geo.attributes.position.needsUpdate = true; F.geo.attributes.color.needsUpdate = true;
  }

  /* ═══════════════ Modèle de fonctionnement (simplifié, calé sur les valeurs certifiées) ═══════════════ */
  const st = { variant: 'PW1524G', cmd: 0, mode: 'run', n1: ENG.n1GroundIdle, n2: ENG.n2Idle, itt: 480, ff: 290, thrust: 0, lit: true, starter: false, t: 0, tMode: 0 };
  function vdata() {
    const v = ENG.variants[st.variant], ref = ENG.variants.PW1524G.to;
    const n1TO = ENG.n1Max * 0.97 * Math.sqrt(v.to / ref); // poussée ∝ N1², décollage à ~97 % de la limite pour le PW1524G
    return { v, n1TO, n2TO: ENG.n2Max * 0.97 - (ENG.n1Max * 0.97 - n1TO) * 0.6, ittTO: 1000 - (ref - v.to) / 60, ffTO: v.to * 0.30 * 0.4536 };
  }
  const n1ForThrust = (lbf) => { const d = vdata(); return d.n1TO * Math.sqrt(lbf / d.v.to); };
  const cmdForN1 = (n1) => { const d = vdata(); return clamp((n1 - ENG.n1GroundIdle) / (d.n1TO - ENG.n1GroundIdle), 0, 1); };
  const lagTo = (cur, tgt, dt, tau) => cur + (tgt - cur) * Math.min(1, dt / tau);
  function updateEngine(dt) {
    const d = vdata();
    st.t += dt;
    if (st.mode === 'run') {
      const n1T = lerp(ENG.n1GroundIdle, d.n1TO, st.cmd);
      const s = Math.max(0, (st.n1 - ENG.n1GroundIdle) / (d.n1TO - ENG.n1GroundIdle));
      const n2T = ENG.n2Idle + (d.n2TO - ENG.n2Idle) * Math.pow(Math.max(0, (n1T - ENG.n1GroundIdle) / (d.n1TO - ENG.n1GroundIdle)), 0.55);
      st.n2 = lagTo(st.n2, n2T, dt, 1.2);
      st.n1 = lagTo(st.n1, n1T, dt, 2.2); // la soufflante réduite ajoute de l'inertie au corps BP
      st.itt = lagTo(st.itt, 480 + (d.ittTO - 480) * Math.pow(s, 1.3), dt, 1.5);
      st.ff = lagTo(st.ff, 290 + (d.ffTO - 290) * Math.pow(s, 1.6), dt, 0.6);
    } else if (st.mode === 'start') {
      // démarreur pneumatique (N2) → allumage vers 17 % N2 → pic d'ITT → accélération jusqu'au ralenti sol
      const el = st.t - st.tMode;
      if (!st.lit) {
        st.n2 = lagTo(st.n2, 5200, dt, 4.5); st.n1 = lagTo(st.n1, st.n2 * 0.028, dt, 3);
        st.itt = lagTo(st.itt, OAT + 20, dt, 8); st.ff = lagTo(st.ff, el > 5 ? 150 : 0, dt, 0.5);
        if (el > 6 && st.n2 > 4200) { st.lit = true; log('Allumage : combustion établie', 'g'); }
      } else {
        const k = st.n2 / ENG.n2Idle;
        st.n2 = lagTo(st.n2, ENG.n2Idle, dt, 7); st.n1 = lagTo(st.n1, ENG.n1GroundIdle * k * k, dt, 2.5);
        st.itt = lagTo(st.itt, k < 0.85 ? 690 : 480, dt, k < 0.85 ? 2.5 : 4); st.ff = lagTo(st.ff, 260, dt, 1);
        if (st.starter && st.n2 > 0.55 * ENG.n2Idle) { st.starter = false; log('Démarreur coupé', ''); }
        if (st.n2 > 0.985 * ENG.n2Idle && st.itt < 520) { setMode('run'); log('Moteur stabilisé au ralenti sol', 'g'); }
      }
    } else { // 'stop' et 'off' : coupure carburant, décélération libre
      st.n2 = lagTo(st.n2, 0, dt, 9); st.n1 = lagTo(st.n1, 0, dt, 6);
      st.itt = lagTo(st.itt, OAT, dt, 25); st.ff = lagTo(st.ff, 0, dt, 0.4);
      if (st.mode === 'stop' && st.n2 < 60) { setMode('off'); log('Moteur arrêté', ''); }
    }
    st.thrust = st.mode === 'run' || st.lit ? d.v.to * Math.pow(st.n1 / d.n1TO, 2) : 0;
  }

  /* ═══════════════ Stations moteur (numérotation SAE ; températures estimées) ═══════════════ */
  const STATIONS = [
    // dy : décalage vertical (px) pour que les stations rapprochées du noyau ne se chevauchent pas
    { n: '2', x: 0.72, r: 0.62, t: 'Entrée soufflante', k: 'cold', dy: 0, T: () => OAT },
    { n: '13', x: 1.40, r: 0.76, t: 'Sortie soufflante', k: 'cold', dy: 0, T: () => OAT + 8 + 22 * sN() },
    { n: '18', x: 2.55, r: 0.72, t: 'Tuyère secondaire', k: 'cold', dy: 0, T: () => OAT + 8 + 22 * sN() },
    { n: '25', x: 2.03, r: 0.23, t: 'Entrée HPC', k: '', dy: -16, T: () => OAT + 25 + 95 * sN() },
    { n: '3', x: 2.64, r: 0.22, t: 'Sortie HPC', k: 'hot', dy: 20, T: () => OAT + 170 + 430 * Math.pow(sN(), 0.9) },
    { n: '4', x: 2.98, r: 0.29, t: 'Entrée THP', k: 'hot', dy: -18, T: () => Math.max(OAT, st.itt * 1.33 - 60) },
    { n: '4.5', x: 3.22, r: 0.31, t: 'ITT', k: 'hot', dy: 22, T: () => st.itt },
    { n: '5', x: 3.62, r: 0.37, t: 'Sortie TBP', k: 'hot', dy: -18, T: () => Math.max(OAT, st.itt * 0.62) },
  ];
  const sN = () => clamp((st.n1 - ENG.n1GroundIdle) / (vdata().n1TO - ENG.n1GroundIdle), 0, 1);
  for (const s of STATIONS) { s.el = document.createElement('div'); s.el.className = 'st-label ' + s.k; s.el.hidden = true; labelLayer.appendChild(s.el); s.p = V3(); }

  /* ═══════════════ Étiquettes ═══════════════ */
  const LABELS = [
    { t: 'Soufflante', x: 0.86, r: 0.62, dx: -70, dy: -30 },
    { t: 'Réducteur (FDGS)', x: 1.06, r: 0.2, dx: -60, dy: 60 },
    { t: 'Compresseur BP', x: 1.46, r: 0.38, dx: -20, dy: -62 },
    { t: 'Carter intermédiaire', x: 1.9, r: 0.3, dx: 10, dy: 70 },
    { t: 'Compresseur HP', x: 2.3, r: 0.21, dx: -10, dy: -80 },
    { t: 'Chambre TALON X', x: 2.85, r: 0.3, dx: 20, dy: -70 },
    { t: 'Turbine HP', x: 3.08, r: 0.29, dx: 20, dy: 72 },
    { t: 'Turbine BP', x: 3.45, r: 0.37, dx: 55, dy: -50 },
    { t: 'Flux secondaire', x: 2.0, r: 0.75, dx: -10, dy: -45, noExplode: true },
    { t: 'Nacelle', x: 0.5, r: 1.16, dx: -60, dy: 18, outside: true, noExplode: true },
  ].map((l) => {
    const el = document.createElement('div'); el.className = 'eng-label';
    const line = document.createElement('span'); line.className = 'lbl-line';
    line.style.width = Math.hypot(l.dx, l.dy) + 'px'; line.style.transform = `rotate(${Math.atan2(l.dy, l.dx)}rad)`;
    const txt = document.createElement('span'); txt.className = 'lbl-text' + (l.dx < 0 ? ' lbl-left' : ''); txt.textContent = l.t;
    txt.style.left = l.dx + 'px'; txt.style.top = l.dy + 'px';
    const dot = document.createElement('span'); dot.className = 'lbl-dot';
    el.append(line, dot, txt); labelLayer.appendChild(el);
    return Object.assign(l, { el, mod: modOf(l.x), p: V3() });
  });
  const proj = V3();
  function place(el, x, r, w, h, ang) { // point juste derrière la face de coupe visible
    const a = ang === undefined ? -0.03 : ang, e = view.explode * view.explode * (3 - 2 * view.explode);
    proj.set(X(x + MOD_OFF[modOf(x)] * e), R(r) * Math.cos(a), R(r) * Math.sin(a)).project(camera);
    if (proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1) { el.style.display = 'none'; return false; }
    el.style.display = 'block'; el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px)`;
    return true;
  }
  function updateOverlays(w, h) {
    const inside = view.mode !== 'ext';
    for (const l of LABELS) {
      const show = view.labels && (l.outside ? view.nacelle && view.explode < 0.01 : inside) && !(l.noExplode && view.explode > 0.01);
      if (!show) { l.el.style.display = 'none'; continue; }
      place(l.el, l.x, l.r, w, h);
    }
    for (const s of STATIONS) {
      if (!view.stations || !inside) { s.el.style.display = 'none'; continue; }
      s.el.innerHTML = `<b>${s.n}</b>${s.t} · ${fmt(s.T())} °C`;
      if (place(s.el, s.x, s.r, w, h, -0.3)) s.el.style.transform += ` translate(-50%, calc(-50% + ${s.dy}px))`;
    }
  }

  /* ═══════════════ Descriptions ═══════════════ */
  const fanRpm = () => st.n1 / ENG.gear;
  const INFO = {
    nacelle: { name: 'Nacelle', ref: 'TCDS IM.E.090 · note 4', desc: "Entrée d'air, carter de soufflante (Ø nominal 2,006 m) et tuyère secondaire. L'inverseur de poussée fait partie de l'avion, pas de la définition de type du moteur." },
    spinner: { name: "Cône d'entrée", ref: 'Soufflante', desc: 'Tourne avec la soufflante, donc à vitesse réduite (N1 ÷ 3,0625).', live: () => `${fmt(fanRpm())} tr/min` },
    fan: {
      name: 'Soufflante', ref: 'Ø 73 po · 18 aubes (valeur citée)', desc: "Aubes larges en alliage d'aluminium, premier moteur certifié avec ce matériau. Le réducteur la fait tourner environ trois fois moins vite que le corps BP : son bout d'aube reste proche de la vitesse du son malgré ses 1,85 m.",
      live: () => { const v = fanRpm() * TAU / 60 * ENG.fanR; return `${fmt(fanRpm())} tr/min · bout d'aube ${fmt(v)} m/s (Mach ${dec(v / 340, 2)})`; },
    },
    fanshaft: { name: 'Arbre de soufflante', ref: 'Réducteur → soufflante', desc: 'Relie la couronne du réducteur au disque de soufflante.', live: () => `${fmt(fanRpm())} tr/min` },
    fegv: { name: 'Redresseurs de soufflante (OGV)', ref: 'Flux secondaire', desc: "Aubes fixes qui suppriment la giration donnée par la soufflante : l'air du flux secondaire (12 fois le débit du noyau) ressort dans l'axe." },
    corevane: { name: "Aubes d'entrée du noyau", ref: 'Pied de soufflante', desc: "Redressent l'air qui sort du pied de soufflante avant le compresseur basse pression." },
    fdgs: {
      name: 'Réducteur de soufflante (FDGS)', ref: 'TCDS IM.E.090 · Kawasaki TR n° 179',
      desc: 'Train épicycloïdal en étoile à dentures en chevrons : le soleil (corps BP) entraîne 5 satellites sur un porte-satellites fixe, et la couronne entraîne la soufflante en sens inverse. Rapport 3,0625:1 (dents figurées 32 / 33 / 98, rapport exact).',
      live: () => `Soleil ${fmt(st.n1)} tr/min → satellites ${fmt(st.n1 * ZS / ZP)} tr/min → couronne ${fmt(fanRpm())} tr/min`,
    },
    lpc: { name: 'Compresseur basse pression', ref: '3 étages · corps BP', desc: "Tourne à la vitesse de la turbine BP, bien plus vite que la soufflante : c'est tout l'intérêt du réducteur (moins d'étages, plus de travail par étage).", live: () => `N1 ${fmt(st.n1)} tr/min` },
    intcase: { name: 'Carter intermédiaire', ref: 'Col de cygne', desc: 'Structure porteuse entre les compresseurs BP et HP ; ses bras supportent les paliers avant.' },
    hpc: { name: 'Compresseur haute pression', ref: '8 étages · corps HP', desc: "Aubes d'entrée à calage variable. Tourne en sens inverse du corps BP.", live: () => `N2 ${fmt(st.n2)} tr/min` },
    combustor: { name: 'Chambre de combustion TALON X', ref: 'Kawasaki TR n° 179', desc: 'Chambre annulaire à faibles émissions de NOx. Paroi intérieure en panneaux moulés résistants à la chaleur, remplaçables en maintenance ; nombreux trous de refroidissement percés au laser.', live: () => `Débit carburant ≈ ${fmt(st.ff)} kg/h` },
    injectors: { name: 'Injecteurs', ref: 'Kawasaki fig. 2 (nombre figuré)', desc: 'Traversent le carter diffuseur et alimentent le fond de chambre.', live: () => `≈ ${fmt(st.ff)} kg/h au total` },
    hptv: { name: 'Distributeurs de turbine HP', ref: '2 rangées', desc: 'Aubes fixes refroidies qui accélèrent les gaz et les orientent dans le sens de rotation du corps HP.' },
    hpt: { name: 'Turbine haute pression', ref: '2 étages refroidis · TCDS', desc: 'Entraîne le compresseur HP.', live: () => `N2 ${fmt(st.n2)} tr/min · ITT ${fmt(st.itt)} °C` },
    mtf: { name: 'Carter inter-turbines', ref: 'Entre turbines HP et BP', desc: 'Bras profilés qui supportent un palier et redirigent les gaz vers la turbine BP, qui tourne en sens inverse de la turbine HP.' },
    lpt: { name: 'Turbine basse pression', ref: '3 étages · TCDS', desc: "Entraîne le compresseur BP et, par le réducteur, la soufflante. Grâce au réducteur, elle tourne vite et n'a besoin que de 3 étages.", live: () => `N1 ${fmt(st.n1)} tr/min` },
    tec: { name: "Carter d'échappement (TEC)", ref: 'Sortie turbine', desc: 'Bras qui supportent le palier arrière et redressent les gaz.' },
    shaftLP: { name: 'Arbre basse pression', ref: 'Corps BP', desc: "Relie la turbine BP au compresseur BP et au soleil du réducteur. Passe à l'intérieur de l'arbre HP.", live: () => `${fmt(st.n1)} tr/min` },
    shaftHP: { name: 'Arbre haute pression', ref: 'Corps HP', desc: 'Tambour reliant le compresseur HP à la turbine HP, contrarotatif par rapport au corps BP.', live: () => `${fmt(st.n2)} tr/min` },
    corecowl: { name: 'Capot du noyau', ref: 'Flux primaire / secondaire', desc: "Sépare le flux secondaire froid du générateur de gaz ; se prolonge jusqu'à la tuyère primaire." },
    casing: { name: 'Carters moteur', ref: 'Structure', desc: 'Carters des compresseurs, carter diffuseur autour de la chambre et carters des turbines.' },
    plug: { name: "Cône d'échappement", ref: 'Tuyère primaire', desc: 'Ferme le centre de la tuyère primaire.' },
  };
  const PART_ORDER = ['nacelle', 'spinner', 'fan', 'fegv', 'fanshaft', 'fdgs', 'corevane', 'lpc', 'intcase', 'hpc', 'combustor', 'injectors', 'hptv', 'hpt', 'mtf', 'lpt', 'tec', 'shaftLP', 'shaftHP', 'corecowl', 'casing', 'plug'];

  /* ═══════════════ Journal, voyants, tendances ═══════════════ */
  const logEl = $('log');
  const fmtT = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function log(msg, cls) {
    const li = document.createElement('li'); li.className = cls || '';
    const tm = document.createElement('time'); tm.textContent = fmtT(st.t);
    const sp = document.createElement('span'); sp.textContent = msg;
    li.append(tm, sp); logEl.prepend(li);
    while (logEl.children.length > 60) logEl.lastChild.remove();
  }
  const warned = {};
  function monitor() {
    const chk = (k, cond, msg, cls) => { if (cond && !warned[k]) { warned[k] = true; log(msg, cls); } else if (!cond) warned[k] = false; };
    chk('mct', st.itt > ENG.ittMCT && st.itt <= ENG.ittTO, 'ITT au-delà de la limite continue (1 017 °C) : 5 min max au décollage', 'a');
    chk('itt', st.itt > ENG.ittTO, 'Dépassement ITT (> 1 054 °C)', 'r');
    chk('n1', st.n1 > ENG.n1Max, 'Dépassement N1 (> 10 600 tr/min)', 'r');
    $('L-start').classList.toggle('on', st.starter);
    $('L-ign').classList.toggle('on', st.mode === 'start' && st.n2 < 0.6 * ENG.n2Idle && st.t - st.tMode > 4);
    $('L-fuel').classList.toggle('on', st.ff > 1);
    $('L-itt').classList.toggle('on', st.itt > ENG.ittMCT);
    $('L-ittx').classList.toggle('on', st.itt > ENG.ittTO);
    $('L-n1').classList.toggle('on', st.n1 > ENG.n1Max);
  }
  const trendCv = $('trend'), tctx = trendCv.getContext('2d'), trend = [];
  function sizeTrend() { const dpr = Math.min(2, devicePixelRatio || 1); trendCv.width = trendCv.clientWidth * dpr; trendCv.height = trendCv.clientHeight * dpr; }
  function drawTrend() {
    const W = trendCv.width, H = trendCv.height, dpr = W / Math.max(1, trendCv.clientWidth), c = tctx;
    c.clearRect(0, 0, W, H); c.save(); c.scale(dpr, dpr);
    const w = trendCv.clientWidth, h = trendCv.clientHeight, L = 28, B = 14, T = 6, y = (v) => T + (h - T - B) * (1 - v / 110);
    c.strokeStyle = '#14201a'; c.fillStyle = '#556655'; c.font = '10px Courier New'; c.lineWidth = 1;
    for (const v of [0, 50, 100]) { c.beginPath(); c.moveTo(L, y(v)); c.lineTo(w, y(v)); c.stroke(); c.fillText(String(v), 2, y(v) + 3); }
    const series = [['n1', '#4fc3c7'], ['n2', '#d0d0d0'], ['itt', '#f59e0b'], ['thr', '#80cc80']];
    for (const [k, color] of series) {
      c.strokeStyle = color; c.lineWidth = 1.5; c.beginPath();
      trend.forEach((p, i) => { const px = L + (w - L) * (i / 119), py = y(p[k]); i ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.stroke();
    }
    c.restore();
  }

  /* ═══════════════ Son (synthèse simplifiée) ═══════════════ */
  let audio = null;
  function startAudio() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
    const fan = ctx.createOscillator(); fan.type = 'sawtooth';
    const fanLp = ctx.createBiquadFilter(); fanLp.type = 'lowpass'; fanLp.frequency.value = 1800;
    const fanG = ctx.createGain(); fan.connect(fanLp).connect(fanG).connect(master);
    const whine = ctx.createOscillator(); whine.type = 'sine'; const whineG = ctx.createGain(); whine.connect(whineG).connect(master);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.6;
    const noiseG = ctx.createGain(); noise.connect(nf).connect(noiseG).connect(master);
    fan.start(); whine.start(); noise.start();
    master.gain.setTargetAtTime(0.35, ctx.currentTime, 0.3);
    audio = { ctx, master, fan, fanG, whine, whineG, noiseG, nf };
  }
  function updateAudio() {
    if (!audio) return;
    const t = audio.ctx.currentTime, fr = fanRpm() / 60, s = sN(), run = st.n2 / ENG.n2Max;
    audio.fan.frequency.setTargetAtTime(Math.max(20, fr * 18), t, 0.1);          // fréquence de passage des 18 aubes
    audio.fanG.gain.setTargetAtTime(0.02 + 0.08 * s, t, 0.2);
    audio.whine.frequency.setTargetAtTime(Math.max(30, st.n2 / 60 * 6), t, 0.1); // sifflement du corps HP (figuré)
    audio.whineG.gain.setTargetAtTime(0.012 * run, t, 0.2);
    audio.noiseG.gain.setTargetAtTime(0.04 * run + 0.22 * s * s, t, 0.3);
    audio.nf.frequency.setTargetAtTime(400 + 900 * s, t, 0.3);
  }

  /* ═══════════════ Interface ═══════════════ */
  const OUT = { n1: $('i-n1'), n1rpm: $('i-n1rpm'), fan: $('i-fan'), n2: $('i-n2'), n2rpm: $('i-n2rpm'), itt: $('i-itt'), ff: $('i-ff'), thr: $('i-thr'), thrmax: $('i-thrmax') };
  const thrEl = $('throttle'), thrVal = $('thr-val'), partInfo = $('part-info');
  function setCmd(c) {
    st.cmd = clamp(c, 0, 1); thrEl.value = Math.round(st.cmd * 1000);
    const n1 = lerp(ENG.n1GroundIdle, vdata().n1TO, st.cmd);
    thrVal.textContent = st.cmd < 0.005 ? 'Ralenti sol' : `N1 ${fmt(n1)} tr/min`;
  }
  function setMode(m) {
    st.mode = m; st.tMode = st.t;
    const running = m === 'run';
    thrEl.disabled = !running;
    document.querySelectorAll('[data-preset]').forEach((b) => { b.disabled = !running; });
    $('btn-start').disabled = m !== 'off';
    $('btn-stop').disabled = m === 'off' || m === 'stop';
    const txt = { run: 'En marche', start: 'Démarrage en cours', stop: 'Arrêt en cours', off: 'Arrêté' }[m];
    $('status').className = 'status ' + (running ? 'run' : m === 'off' ? '' : 'busy');
    $('status-txt').textContent = txt;
  }
  thrEl.addEventListener('input', () => setCmd(thrEl.value / 1000));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const d = vdata(), k = b.dataset.preset;
    setCmd(k === 'gi' ? 0 : k === 'fi' ? cmdForN1(ENG.n1FlightIdle) : k === 'mct' ? cmdForN1(n1ForThrust(d.v.mct)) : 1);
  }));
  $('variant').addEventListener('change', (e) => { st.variant = e.target.value; setCmd(st.cmd); log(`Variante ${e.target.value} (bouchon de puissance)`, ''); });
  $('btn-start').addEventListener('click', () => {
    setCmd(0); st.lit = false; st.starter = true; setMode('start');
    log('Démarrage auto : démarreur pneumatique engagé', 'a');
  });
  $('btn-stop').addEventListener('click', () => {
    setCmd(0); st.lit = false; st.starter = false; setMode('stop');
    log('Arrêt auto : carburant coupé', 'a');
  });

  function setPressed(id, v) { $(id).setAttribute('aria-pressed', v); }
  for (const [id, m] of [['m-ext', 'ext'], ['m-cut', 'cut'], ['m-half', 'half'], ['m-xray', 'xray']]) $(id).addEventListener('click', () => { view.mode = m; applyView(); });
  $('cut-shell').addEventListener('click', () => { view.cutAll = false; setPressed('cut-shell', true); setPressed('cut-all', false); if (view.mode === 'ext' || view.mode === 'xray') view.mode = 'cut'; applyView(); });
  $('cut-all').addEventListener('click', () => { view.cutAll = true; setPressed('cut-shell', false); setPressed('cut-all', true); if (view.mode === 'ext' || view.mode === 'xray') view.mode = 'cut'; applyView(); });
  $('keep').addEventListener('click', () => { view.keep = !view.keep; setPressed('keep', view.keep); applyView(); });
  $('t-nac').addEventListener('click', () => { view.nacelle = !view.nacelle; setPressed('t-nac', view.nacelle); applyView(); });
  $('t-flow').addEventListener('click', () => { view.flow = !view.flow; setPressed('t-flow', view.flow); applyView(); });
  $('t-st').addEventListener('click', () => { view.stations = !view.stations; setPressed('t-st', view.stations); });
  $('t-lbl').addEventListener('click', () => { view.labels = !view.labels; setPressed('t-lbl', view.labels); });
  $('t-snd').addEventListener('click', () => {
    if (!audio) { try { startAudio(); } catch (e) { log('Son non disponible dans ce navigateur', 'a'); return; } }
    else if (audio.ctx.state === 'running') audio.ctx.suspend(); else audio.ctx.resume();
    setPressed('t-snd', audio && audio.ctx.state !== 'suspended');
    setTimeout(() => setPressed('t-snd', audio && audio.ctx.state === 'running'), 150);
  });
  $('t-auto').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; setPressed('t-auto', controls.autoRotate); });
  $('col-real').addEventListener('click', () => { view.coded = false; setPressed('col-real', true); setPressed('col-code', false); applyView(); });
  $('col-code').addEventListener('click', () => { view.coded = true; setPressed('col-real', false); setPressed('col-code', true); applyView(); });
  $('explode').addEventListener('input', (e) => { view.explode = parseFloat(e.target.value); applyExplode(); applyView(); });
  let slow = parseFloat($('slow').value);
  $('slow').addEventListener('change', (e) => { slow = parseFloat(e.target.value); $('rot-note').textContent = `Rotation affichée ×1/${Math.round(1 / slow)} · soufflante et corps BP contrarotatifs`; });
  let paused = false;
  function setPaused(v) { paused = v; setPressed('t-pause', v); $('t-pause').textContent = v ? '▶ Reprendre' : '⏸ Figer'; $('frozen').hidden = !v; }
  $('t-pause').addEventListener('click', () => setPaused(!paused));
  let camTween = null;
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const [p, t] = VIEWS[b.dataset.view];
    camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), k: 0 };
  }));

  // Menus rétractables (ouverts sur grand écran, fermés sur écran tactile ; choix mémorisé)
  function setMenus(open, remember) {
    $('vmenu').hidden = !open; $('menu-toggle').setAttribute('aria-expanded', open);
    if (remember) { try { localStorage.setItem('pw1500g.menus', open ? '1' : '0'); } catch (e) { /* stockage indisponible */ } }
  }
  (function () {
    let saved = null; try { saved = localStorage.getItem('pw1500g.menus'); } catch (e) { /* stockage indisponible */ }
    setMenus(saved === null ? innerWidth > 700 && !matchMedia('(pointer:coarse)').matches : saved === '1', false);
  })();
  $('menu-toggle').addEventListener('click', () => setMenus($('vmenu').hidden, true));

  // Plein écran natif, sinon (Safari iPhone) agrandissement CSS
  const nativeFS = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  let pseudoFS = false;
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || pseudoFS;
  function onFS() { $('t-fs').textContent = fsOn() ? '✕ Quitter' : '⛶ Plein écran'; }
  function toggleFS() {
    if (!nativeFS) { pseudoFS = !pseudoFS; viewport.classList.toggle('pseudo-fs', pseudoFS); document.documentElement.classList.toggle('pseudo-fs-on', pseudoFS); onFS(); return; }
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (viewport.requestFullscreen || viewport.webkitRequestFullscreen).call(viewport);
  }
  $('t-fs').addEventListener('click', toggleFS);
  document.addEventListener('fullscreenchange', onFS); document.addEventListener('webkitfullscreenchange', onFS);
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey) return;
    if (e.key === 'f' || e.key === 'F') toggleFS();
    else if (e.key === 'm' || e.key === 'M') setMenus($('vmenu').hidden, true);
    else if (e.code === 'Space' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); setPaused(!paused); }
    else if (e.key === 'Escape' && pseudoFS) toggleFS();
  });

  // Sélection d'une pièce (vue 3D ou liste)
  let selected = null;
  function renderInfo() {
    if (!selected) return;
    const info = INFO[selected]; if (!info) return;
    partInfo.innerHTML = '';
    const mk = (cls, text) => { const e = document.createElement('div'); e.className = cls; e.textContent = text; partInfo.appendChild(e); };
    mk('pi-title', info.name); if (info.ref) mk('pi-ref', info.ref); mk('pi-desc', info.desc); if (info.live) mk('pi-live', info.live());
    document.querySelectorAll('#parts button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === selected));
  }
  const partsEl = $('parts');
  for (const k of PART_ORDER) { const b = document.createElement('button'); b.dataset.k = k; b.textContent = INFO[k].name; b.setAttribute('aria-pressed', 'false'); partsEl.appendChild(b); }
  partsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { selected = b.dataset.k; renderInfo(); } });
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const rect = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    for (const h of raycaster.intersectObjects(pickables, false)) {
      let o = h.object, vis = true; while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
      if (!vis) continue;
      const m = h.object.material;
      if (m && m.clippingPlanes && m.clippingPlanes.length && h.point.z > 0 && (view.mode === 'half' || h.point.y > 0)) continue;
      if (view.mode === 'xray' && m && m.userData && m.userData.ghost) continue;
      selected = h.object.userData.info; renderInfo(); return;
    }
  });

  let vw = 0, vh = 0;
  function resize() {
    vw = viewport.clientWidth; vh = viewport.clientHeight; if (!vw || !vh) return;
    camera.aspect = vw / vh; camera.zoom = Math.min(1, camera.aspect / 1.5); camera.updateProjectionMatrix();
    renderer.setSize(vw, vh, false);
  }
  addEventListener('resize', resize);
  if (window.ResizeObserver) { new ResizeObserver(resize).observe(viewport); new ResizeObserver(sizeTrend).observe(trendCv); }
  resize(); sizeTrend();

  applyView(); setCmd(0); setMode('run');
  log('Moteur stabilisé au ralenti sol (N2 13 264 tr/min). Utilisez « Arrêt auto » puis « Démarrage auto », ou la manette.', '');
  if (loadingEl) loadingEl.style.display = 'none';

  /* ═══════════════ Boucle ═══════════════ */
  const clock = new THREE.Clock();
  let angLP = 0, angHP = 0, infoT = 0, trendT = 0;
  const RPM = TAU / 60;
  function phaseText() {
    if (st.mode === 'start') return st.lit ? 'Démarrage — accélération' : 'Démarrage — démarreur';
    if (st.mode === 'stop') return 'Arrêt en cours'; if (st.mode === 'off') return 'Arrêté';
    const n1 = st.n1, d = vdata();
    if (n1 < ENG.n1GroundIdle * 1.05) return 'Ralenti sol';
    if (n1 < ENG.n1FlightIdle * 1.05) return 'Ralenti vol';
    return n1 > n1ForThrust(d.v.mct) * 1.005 ? 'Poussée de décollage' : 'Poussée';
  }
  function animate() {
    requestAnimationFrame(animate);
    const rdt = Math.min(clock.getDelta(), 0.1), dt = paused ? 0 : rdt;
    if (dt > 0) { updateEngine(dt); monitor(); }
    const d = vdata();
    OUT.n1.textContent = dec(st.n1 / ENG.n1Max * 100) + ' %';
    OUT.n1rpm.textContent = fmt(st.n1) + ' tr/min';
    OUT.fan.textContent = fmt(fanRpm()) + ' tr/min';
    OUT.n2.textContent = dec(st.n2 / ENG.n2Max * 100) + ' %';
    OUT.n2rpm.textContent = fmt(st.n2) + ' tr/min';
    OUT.itt.textContent = fmt(st.itt) + ' °C';
    OUT.ff.textContent = fmt(st.ff);
    OUT.thr.textContent = dec(st.thrust * LBF_TO_KN) + ' kN';
    OUT.thrmax.textContent = `max ${dec(d.v.to * LBF_TO_KN)} kN`;
    $('box-itt').className = 'instr-item' + (st.itt > ENG.ittTO ? ' alarm' : st.itt > ENG.ittMCT ? ' warn' : '');
    $('phase').textContent = phaseText(); $('clock').textContent = fmtT(st.t);

    // rotations : soleil = corps BP ; couronne = −soleil·ZS/ZR (soufflante) ; satellites = −soleil·ZS/ZP sur leurs axes fixes
    angLP += DIR.lp * st.n1 * RPM * slow * dt; angHP += DIR.hp * st.n2 * RPM * slow * dt;
    LP.rotation.x = angLP; HP.rotation.x = angHP;
    FAN.rotation.x = -angLP * ZS / ZR;
    for (const s of stars) s.rotation.x = -angLP * ZS / ZP;

    const heat = st.lit ? clamp((st.itt - 380) / 620, 0, 1) : 0;
    flameMat.opacity = st.lit ? 0.16 + 0.5 * heat : 0;
    flameMat.color.copy(col(0xff5a10)).lerp(col(0xffd070), heat * 0.6);
    flameLight.intensity = st.lit ? 0.4 + 2.4 * heat : 0;
    if (bypassFlow.pts.visible && dt > 0) {
      const sp = clamp(st.n1 / ENG.n1Max, 0.02, 1) * 1.1 + 0.05;
      stepFlow(bypassFlow, dt, sp, heat); stepFlow(coreFlow, dt, sp, heat);
    }
    trendT += dt;
    if (trendT > 0.5) {
      trendT = 0;
      trend.push({ n1: st.n1 / ENG.n1Max * 100, n2: st.n2 / ENG.n2Max * 100, itt: st.itt / 11, thr: st.thrust / d.v.to * 100 });
      if (trend.length > 120) trend.shift();
      drawTrend();
    }
    updateAudio();
    if (camTween) {
      camTween.k = Math.min(1, camTween.k + rdt * 1.6); const e = camTween.k * camTween.k * (3 - 2 * camTween.k);
      camera.position.lerpVectors(camTween.p0, camTween.p1, e); controls.target.lerpVectors(camTween.t0, camTween.t1, e);
      if (camTween.k >= 1) camTween = null;
    }
    infoT += rdt; if (infoT > 0.25 && selected && INFO[selected] && INFO[selected].live) { infoT = 0; renderInfo(); }
    controls.update();
    renderer.render(scene, camera);
    updateOverlays(vw, vh);
  }
  animate();
})();
