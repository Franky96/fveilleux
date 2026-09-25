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
  const LBF_TO_KN = 0.004448222;

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
  function piecewise(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
    }
    return pts[pts.length - 1][1];
  }
  const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();

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

  /* ═══════════════ Scène ═══════════════ */
  const viewport = $('engine-viewport'), canvas = $('engine-canvas'), labelLayer = $('label-layer');
  const scene = new THREE.Scene();
  scene.background = col(0x05080a);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 250);
  const VIEWS = {
    34: [new THREE.Vector3(6, 5.2, 15.5), new THREE.Vector3(-0.5, 0, 0)],
    side: [new THREE.Vector3(0, 2.5, 25), new THREE.Vector3(0, 0, 0)],
    front: [new THREE.Vector3(-24, 3, 6), new THREE.Vector3(-3, 0, 0)],
    rear: [new THREE.Vector3(24, 3, 6), new THREE.Vector3(3, 0, 0)],
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
  controls.minDistance = 2; controls.maxDistance = 45; controls.autoRotateSpeed = 0.9;

  (function environment() {
    const pmrem = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    const sky = new THREE.SphereGeometry(50, 32, 16), p = sky.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) { const v = 0.04 + 0.32 * Math.max(0, p.getY(i) / 50); c.push(v * 0.85, v * 0.95, v); }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const panel = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m); };
    panel(40, 10, new THREE.Vector3(0, 35, 8), 4); panel(20, 20, new THREE.Vector3(30, 10, 25), 1.6); panel(20, 12, new THREE.Vector3(-30, 6, -20), 1.0);
    scene.environment = pmrem.fromScene(env, 0.04).texture; pmrem.dispose();
  })();
  scene.add(new THREE.HemisphereLight(col(0x9ab4c4), col(0x0a0f0a), 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(6, 10, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(col(0x8fb8d0), 0.5); rim.position.set(-10, 4, -8); scene.add(rim);
  const grid = new THREE.GridHelper(90, 90, 0x1f3a24, 0x101a14); grid.position.y = R(-1.4);
  grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);

  /* ═══════════════ Coupe ¼ : plans fixes dans la scène (y > 0 et z > 0 retirés) ═══════════════ */
  const clipA = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), clipB = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const CLIP = [clipA, clipB];
  let cutaway = true, keepWhole = true;

  /* ═══════════════ Matériaux (couleur réelle / par section) ═══════════════ */
  const MATS = [];
  function mat(real, coded, o, keep) {
    const m = new THREE.MeshStandardMaterial(Object.assign({
      color: col(real), metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide, clippingPlanes: CLIP, clipIntersection: true,
    }, o || {}));
    m.userData.real = col(real); m.userData.coded = col(coded); m.userData.keep = !!keep;
    MATS.push(m); return m;
  }
  const MAT = {
    nacelle: mat(0xe6e8ea, 0x8fb8d0, { metalness: 0.1, roughness: 0.42 }),
    cowl: mat(0xc2c7cc, 0x7f9aa8, { metalness: 0.45, roughness: 0.4 }),
    spinner: mat(0x3b3f45, 0x2f7f86, { metalness: 0.5, roughness: 0.35 }),
    fan: mat(0xb8bfc6, 0x4fc3c7, { metalness: 0.9, roughness: 0.28 }),
    fanDisk: mat(0x80868c, 0x3fa2aa),
    fegv: mat(0x8c939a, 0x3a9da3),
    lpc: mat(0xa4aab0, 0x6f8fae), lpcS: mat(0x8a9096, 0x587896), strut: mat(0x6a7076, 0x56606a, { roughness: 0.5 }),
    hpc: mat(0xa0a3a6, 0xb4b4b4), hpcS: mat(0x85888b, 0x8c8c8c),
    casing: mat(0x5a5f64, 0x46525a, { roughness: 0.48 }), hub: mat(0x70757b, 0x5d6870, { roughness: 0.42 }),
    diskLP: mat(0x7c8288, 0x5fa4b4), diskHP: mat(0x827d74, 0xb8a060),
    shaftLP: mat(0x9aa0a8, 0xb8c4d0, { metalness: 0.9, roughness: 0.25 }, true),
    shaftHP: mat(0x9c9588, 0xd4af37, { metalness: 0.9, roughness: 0.25 }, true),
    shaftFan: mat(0x8f969e, 0x4fc3c7, { metalness: 0.9, roughness: 0.25 }), // cône d'arbre de soufflante : coupé pour voir le réducteur
    gear: mat(0x8d9096, 0xb98cf0, { metalness: 0.95, roughness: 0.3 }, true),
    // couronne et porte-satellites coupés avec le reste, pour laisser voir le soleil et les satellites
    ring: mat(0xb08a62, 0xa77be0, { metalness: 0.9, roughness: 0.32 }),
    carrier: mat(0x6c7076, 0x8a6cc0, { roughness: 0.4 }),
    liner: mat(0x8c7660, 0xff7a3a, { metalness: 0.55, roughness: 0.55 }), injector: mat(0x6f6a64, 0xd0a060),
    hptV: mat(0xa98f63, 0xc9442a, { roughness: 0.5 }), hpt: mat(0xc0a676, 0xe85d3f, { roughness: 0.45 }),
    mtf: mat(0x7e7466, 0xd06a30, { roughness: 0.5 }),
    lptV: mat(0x8e8069, 0xd08420, { roughness: 0.5 }), lpt: mat(0xa99579, 0xf0a830, { roughness: 0.45 }),
    plug: mat(0x67625c, 0x7a7a7a, { roughness: 0.55 }),
  };
  const flameMat = new THREE.MeshBasicMaterial({ color: col(0xff6a1a), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: CLIP, clipIntersection: true });
  function applyKeep() {
    for (const m of MATS) if (m.userData.keep) { m.clippingPlanes = keepWhole ? [] : CLIP; m.needsUpdate = true; }
  }
  function setCutaway(on) { cutaway = on; clipA.constant = clipB.constant = on ? 0 : 1e4; updateCaps(); }
  function setColorMode(coded) { MATS.forEach((m) => m.color.copy(coded ? m.userData.coded : m.userData.real)); }

  /* ═══════════════ Groupes tournants ═══════════════ */
  const engine = new THREE.Group(); scene.add(engine);
  const ST = new THREE.Group(), FAN = new THREE.Group(), LP = new THREE.Group(), HP = new THREE.Group();
  engine.add(ST, FAN, LP, HP);
  const pickables = [];
  function add(mesh, group, info) { mesh.userData.info = info; group.add(mesh); pickables.push(mesh); return mesh; }

  /* ═══════════════ Pièces de révolution (+ faces de coupe pleines) ═══════════════ */
  const capSources = [];
  function latheGeo(pts, seg) {
    const g = new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(Math.max(R(r), 1e-4), X(x))), seg || 128);
    g.rotateZ(-Math.PI / 2); // axe de révolution → X ; un point (r, φ) devient (x, −r·sinφ, r·cosφ)
    return g;
  }
  const closed = (pts) => pts.concat([pts[0]]);
  const shell = (pts, t) => closed(pts.concat(pts.slice().reverse().map(([x, r]) => [x, r + t])));
  const solid = (pts) => closed([[pts[0][0], 0]].concat(pts, [[pts[pts.length - 1][0], 0]]));
  function revolve(pts, material, group, info, seg, noCap) {
    const mesh = add(new THREE.Mesh(latheGeo(pts, seg), material), group, info);
    if (!noCap) capSources.push({ pts, material, info });
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
     Angles en degrés, positifs vers l'antihoraire. Bord d'attaque ≈ calage + atan(4·cambrure), bord de fuite ≈ calage − atan(4·cambrure). */
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
    add(im, o.group, o.info);
    if (o.disk) revolve(diskProfile(o.x, o.disk.w, hub, o.disk.bore), o.disk.mat, o.group, o.info, 72);
    return im;
  }

  /* ═══════════════ Engrenages (réducteur de soufflante) ═══════════════ */
  const MOD = 0.0052; // module figuré (m) : rayons primitifs 0,083 / 0,086 / 0,255 m
  function gearGeo(teeth, internal, width, rimOuter) {
    const rp = MOD * teeth / 2, add_ = MOD, ded = 1.25 * MOD, shape = new THREE.Shape(), pts = [];
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * TAU, st = TAU / teeth;
      const rIn = internal ? rp + ded : rp - ded, rOut = internal ? rp - add_ : rp + add_;
      pts.push([rIn, a0], [rIn, a0 + st * 0.2], [rOut, a0 + st * 0.35], [rOut, a0 + st * 0.65], [rIn, a0 + st * 0.8]);
    }
    const path = pts.map(([r, a]) => new THREE.Vector2(R(r) * Math.cos(a), R(r) * Math.sin(a)));
    if (internal) {
      shape.absarc(0, 0, R(rimOuter), 0, TAU, false);
      const hole = new THREE.Path(path.slice().reverse()); shape.holes.push(hole);
    } else {
      shape.setFromPoints(path);
      if (rimOuter) shape.holes.push(new THREE.Path().absarc(0, 0, R(rimOuter), 0, TAU, true)); // alésage
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: R(width), steps: 6, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -R(width) / 2);
    // dentures en chevrons (Kawasaki fig. 3) : torsion en V de part et d'autre du plan médian
    const p = g.attributes.position, helix = 0.35 * (internal ? -1 : 1) * MOD * 40;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), a = helix * Math.abs(z) / R(width), x = p.getX(i), y = p.getY(i);
      p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    }
    g.rotateY(Math.PI / 2); // épaisseur le long de l'axe moteur
    g.computeVertexNormals();
    return g;
  }

  /* ═══════════════════════════════ CONSTRUCTION ═══════════════════════════════ */

  // Nacelle (tuyère secondaire séparée, inverseur hors définition de type : TCDS note 4)
  revolve(closed([
    [0.0, 0.975], [0.02, 1.01], [0.08, 1.05], [0.20, 1.10], [0.45, 1.15], [0.90, 1.175], [1.50, 1.16], [2.10, 1.03], [2.45, 0.87], [2.55, 0.84],
    [2.55, 0.83], [2.10, 0.885], [1.50, 0.93], [1.00, 0.935], [0.72, 0.935], [0.60, 0.93], [0.30, 0.925], [0.10, 0.925], [0.04, 0.935], [0.01, 0.955],
  ]), MAT.nacelle, ST, 'nacelle');
  // Capot du noyau (bec de séparation plein jusqu'au carter intermédiaire)
  revolve(closed([
    [1.10, 0.46], [1.30, 0.53], [1.90, 0.62], [2.60, 0.60], [3.30, 0.52], [3.90, 0.43],
    [3.90, 0.42], [3.30, 0.508], [2.60, 0.588], [1.95, 0.607], [1.93, 0.40], [1.85, 0.40], [1.75, 0.418], [1.35, 0.448], [1.10, 0.458],
  ]), MAT.cowl, ST, 'corecowl');
  // Carters : compresseur HP, carter diffuseur, turbines, carter inter-turbines, tuyère primaire
  revolve(shell([
    [1.95, 0.302], [2.02, 0.271], [2.62, 0.231], [2.68, 0.262], [2.72, 0.40], [2.95, 0.40], [3.00, 0.335], [3.15, 0.343],
    [3.22, 0.368], [3.30, 0.385], [3.55, 0.455], [3.62, 0.46], [3.90, 0.425],
  ], 0.008), MAT.casing, ST, 'casing');
  revolve(shell(HUB.filter(([x]) => x >= 1.12 && x <= 3.62), -0.006), MAT.hub, ST, 'casing');
  // Cône d'entrée et cône d'échappement
  revolve(solid([[0.45, 0.0], [0.47, 0.02], [0.55, 0.10], [0.65, 0.19], [0.74, 0.262], [0.80, 0.28]]), MAT.spinner, FAN, 'spinner');
  revolve(solid([[3.62, 0.283], [3.90, 0.22], [4.10, 0.12], [4.30, 0.0]]), MAT.plug, ST, 'plug');

  // ── Soufflante (tourne à N1 / 3,0625) ──
  row({ x: 0.86, n: 18, hub: 0.284, tip: 0.925, chord: [0.24, 0.40], le: [35, 62], te: [2, 50], tr: 0.07, sweep: 0.04, spans: 12, cpts: 11, mat: MAT.fan, group: FAN, info: 'fan' });
  revolve(diskProfile(0.86, 0.12, 0.28, 0.10), MAT.fanDisk, FAN, 'fan', 72);
  revolve(shell([[0.92, 0.20], [0.98, 0.235], [1.02, 0.262], [1.10, 0.262]], 0.012), MAT.shaftFan, FAN, 'fanshaft', 72);
  // Redresseurs de soufflante (OGV) et aube de veine primaire en pied de soufflante
  row({ x: 1.45, n: 40, hub: bypInAt(1.45) - 0.005, tip: bypOutAt(1.45) + 0.003, chord: [0.16, 0.18], le: [-32, -28], te: [0, 0], tr: 0.09, mat: MAT.fegv, group: ST, info: 'fegv' });
  row({ x: 1.18, n: 36, chord: [0.05, 0.05], le: [-30, -30], te: [0, 0], tr: 0.08, mat: MAT.lpcS, group: ST, info: 'corevane' });

  // ── Réducteur de soufflante (FDGS) : soleil → 5 satellites (porte-satellites fixe) → couronne ──
  const GX = X(1.06), GW = 0.08;
  const sun = add(new THREE.Mesh(gearGeo(ZS, false, GW, 0.03), MAT.gear), LP, 'fdgs'); sun.position.x = GX;
  const ringGear = add(new THREE.Mesh(gearGeo(ZR, true, GW, MOD * ZR / 2 + 0.028), MAT.ring), FAN, 'fdgs'); ringGear.position.x = GX;
  const stars = [], starC = MOD * (ZS + ZP) / 2;
  const starGeo = gearGeo(ZP, false, GW * 0.96, 0.028);
  for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5, piv = new THREE.Group();
    piv.position.set(GX, Math.cos(a) * R(starC), Math.sin(a) * R(starC));
    add(new THREE.Mesh(starGeo, MAT.gear), piv, 'fdgs');
    const pin = add(new THREE.Mesh(new THREE.CylinderGeometry(R(0.026), R(0.026), R(GW + 0.05), 20), MAT.carrier), ST, 'fdgs');
    pin.rotation.z = Math.PI / 2; pin.position.copy(piv.position);
    ST.add(piv); stars.push(piv);
  }
  revolve(closed([[1.105, 0.05], [1.12, 0.05], [1.12, 0.215], [1.105, 0.215]]), MAT.carrier, ST, 'fdgs', 96);          // porte-satellites
  revolve(shell([[1.12, 0.20], [1.15, 0.25], [1.17, 0.295]], 0.012), MAT.carrier, ST, 'fdgs', 96);                        // support souple vers la structure fixe

  // ── Corps basse pression : compresseur BP (3 étages) + turbine BP (3 étages) ──
  [1.30, 1.46, 1.62].forEach((x, i) => {
    row({ x, n: 36 + 4 * i, chord: [0.07, 0.075], le: [-50, -60], te: [-25, -35], mat: MAT.lpc, group: LP, info: 'lpc', disk: { w: 0.05, bore: 0.08, mat: MAT.diskLP } });
    row({ x: x + 0.08, n: 48, chord: [0.06, 0.06], le: [35, 30], te: [0, 0], tr: 0.08, mat: MAT.lpcS, group: ST, info: 'lpc' });
  });
  revolve(shell([[1.27, 0.27], [1.285, 0.11], [1.29, 0.055]], 0.012), MAT.shaftLP, LP, 'shaftLP', 72);
  row({ x: 1.90, n: 8, chord: [0.10, 0.10], le: [0, 0], te: [0, 0], tr: 0.22, mat: MAT.strut, group: ST, info: 'intcase' });

  const LPT = [[3.33, 60, [8, 8], [-55, -55]], [3.45, 66, [8, 8], [-52, -52]], [3.57, 72, [6, 6], [-45, -45]]];
  LPT.forEach(([x, n, le, te]) => row({ x, n, chord: [0.045, 0.045], le, te, tr: 0.1, mat: MAT.lpt, group: LP, info: 'lpt', disk: { w: 0.04, bore: 0.08, mat: MAT.diskLP } }));
  [[3.39, 64, [-15, -15], [60, 60]], [3.51, 70, [-12, -12], [58, 58]]].forEach(([x, n, le, te]) =>
    row({ x, n, chord: [0.045, 0.045], le, te, tr: 0.12, mat: MAT.lptV, group: ST, info: 'lpt' }));
  revolve(shell([[3.33, 0.24], [3.57, 0.25], [3.60, 0.12], [3.62, 0.055]], 0.01), MAT.shaftLP, LP, 'shaftLP', 72);
  revolve(solid([[1.02, 0.045], [3.64, 0.045]]), MAT.shaftLP, LP, 'shaftLP', 32);

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
  revolve(shell([[2.00, 0.08], [2.03, 0.10], [2.07, 0.16], [2.546, 0.17], [2.60, 0.17], [2.72, 0.13], [3.00, 0.12], [3.15, 0.12]], 0.01), MAT.shaftHP, HP, 'shaftHP', 72);

  // ── Carter inter-turbines (MTF) et carter d'échappement (TEC) ──
  row({ x: 3.24, n: 12, chord: [0.09, 0.09], le: [18, 18], te: [55, 55], tr: 0.2, mat: MAT.mtf, group: ST, info: 'mtf' });
  row({ x: 3.68, n: 12, hub: 0.27, tip: 0.448, chord: [0.08, 0.08], le: [-15, -15], te: [0, 0], tr: 0.2, mat: MAT.strut, group: ST, info: 'tec' });

  // ── Chambre de combustion annulaire TALON X ──
  revolve(shell([[2.73, 0.325], [2.76, 0.34], [2.90, 0.34], [2.97, 0.32]], 0.006), MAT.liner, ST, 'combustor', 96);
  revolve(shell([[2.73, 0.275], [2.76, 0.258], [2.90, 0.258], [2.97, 0.255]], -0.006), MAT.liner, ST, 'combustor', 96);
  revolve(shell([[2.73, 0.275], [2.718, 0.288], [2.713, 0.30], [2.718, 0.312], [2.73, 0.325]], -0.005), MAT.liner, ST, 'combustor', 96);
  add(new THREE.Mesh(latheGeo(closed([[2.735, 0.285], [2.735, 0.318], [2.80, 0.336], [2.90, 0.337], [2.965, 0.30], [2.965, 0.262], [2.90, 0.263], [2.80, 0.263]]), 96), flameMat), ST, 'combustor').renderOrder = 2;
  (function injectors() { // ≈ 18 injecteurs (figuré d'après Kawasaki fig. 2)
    const g = new THREE.CylinderGeometry(R(0.008), R(0.008), R(0.1), 10); g.rotateZ(0.35); g.translate(0, R(0.36), 0);
    const im = new THREE.InstancedMesh(g, MAT.injector, 18), d = new THREE.Object3D();
    for (let i = 0; i < 18; i++) { d.rotation.set((i / 18) * TAU, 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
    im.position.x = X(2.715); add(im, ST, 'injectors');
  })();
  const flameLight = new THREE.PointLight(col(0xff7a33), 1, R(0.8), 2); flameLight.position.set(X(2.85), 0, 0); ST.add(flameLight);

  /* ═══════════════ Faces de coupe pleines (fixes, sur les deux plans de la coupe) ═══════════════ */
  const caps = [], capMats = new Map();
  for (const src of capSources) {
    if (!capMats.has(src.material)) {
      const m = new THREE.MeshStandardMaterial({ color: src.material.color.clone().lerp(new THREE.Color(0xdfe3e7), 0.3), metalness: 0.35, roughness: 0.62, side: THREE.DoubleSide });
      m.userData.src = src.material; capMats.set(src.material, m);
    }
    const base = new THREE.ShapeGeometry(new THREE.Shape(src.pts.map(([x, r]) => new THREE.Vector2(X(x), R(r)))));
    const faceY = base.clone();                  // plan z = 0 côté y > 0
    const faceZ = base.clone(); faceZ.rotateX(Math.PI / 2); // plan y = 0 côté z > 0
    for (const g of [faceY, faceZ]) {
      const cap = new THREE.Mesh(g, capMats.get(src.material)); cap.visible = false; cap.userData.src = src.material;
      add(cap, ST, src.info); caps.push(cap);
    }
  }
  function updateCaps() {
    for (const c of caps) c.visible = cutaway && !(keepWhole && c.userData.src.userData.keep);
    for (const [src, m] of capMats) m.color.copy(src.color).lerp(new THREE.Color(0xdfe3e7), 0.3);
  }

  /* ═══════════════ Écoulement (dans le quart ouvert par la coupe) ═══════════════ */
  const COLD = col(0x7ec8e3);
  const CORE_STOPS = [
    [0.0, 0x7ec8e3], [1.2, 0x9fd6e8], [2.0, 0xcfe6ee], [2.62, 0xffe9c8], [2.74, 0xffc640], [2.85, 0xff6a10],
    [3.0, 0xff4a10], [3.2, 0xff8a30], [3.6, 0xffb060], [3.9, 0xc8a890], [5.2, 0x2a2624],
  ].map(([x, h]) => [x, col(h)]);
  const edgeFade = (x, x0, x1) => Math.max(0, Math.min(1, (x - x0) / 0.25, (x1 - x) / 0.9));
  function coreColor(x, out, heat) {
    let a = CORE_STOPS[0], b = CORE_STOPS[CORE_STOPS.length - 1];
    for (let i = 0; i < CORE_STOPS.length - 1; i++) if (x <= CORE_STOPS[i + 1][0]) { a = CORE_STOPS[i]; b = CORE_STOPS[i + 1]; break; }
    out.copy(a[1]).lerp(b[1], Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0] || 1))));
    if (x > 2.7) out.multiplyScalar(0.45 + 0.55 * heat);
    return out.multiplyScalar(edgeFade(x, 0.3, 5.0));
  }
  function flow(n, inner, outer, x0, x1, xRef, colorFn, hotBoost) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), clr = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.065, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; engine.add(pts);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push({ x: lerp(x0, x1, Math.random()), f: 0.06 + 0.88 * Math.random(), a: 0.06 + Math.random() * (Math.PI / 2 - 0.12), j: 0.8 + 0.4 * Math.random() });
    return { pts, geo, pos, clr, parts, inner, outer, x0, x1, aRef: outer(xRef) ** 2 - inner(xRef) ** 2, colorFn, hotBoost };
  }
  const bypassFlow = flow(900, bypInAt, bypOutAt, -0.15, 4.2, 1.0, (x, o) => o.copy(COLD).multiplyScalar(edgeFade(x, -0.15, 4.2)), 0);
  const coreFlow = flow(650, hubAt, coreOutAt, 0.3, 5.0, 1.0, null, 1.4);
  const tmpC = new THREE.Color();
  function stepFlow(F, dt, speed, heat) {
    for (let i = 0; i < F.parts.length; i++) {
      const p = F.parts[i], ri = F.inner(p.x), ro = F.outer(p.x);
      let v = Math.min(3.2, Math.max(0.35, F.aRef / Math.max(ro * ro - ri * ri, 0.004)));
      if (F.hotBoost && p.x > 2.8) v *= 1 + F.hotBoost * heat;
      p.x += 0.45 * v * speed * p.j * dt;
      if (p.x > F.x1) p.x = F.x0 + Math.random() * 0.05;
      const r = R(lerp(ri, ro, p.f));
      F.pos[i * 3] = X(p.x); F.pos[i * 3 + 1] = Math.cos(p.a) * r; F.pos[i * 3 + 2] = Math.sin(p.a) * r;
      const c = F.colorFn ? F.colorFn(p.x, tmpC) : coreColor(p.x, tmpC, heat);
      F.clr[i * 3] = c.r; F.clr[i * 3 + 1] = c.g; F.clr[i * 3 + 2] = c.b;
    }
    F.geo.attributes.position.needsUpdate = true; F.geo.attributes.color.needsUpdate = true;
  }

  /* ═══════════════ Modèle de fonctionnement (simplifié, calé sur les valeurs certifiées) ═══════════════ */
  const st = { variant: 'PW1524G', cmd: 0, n1: ENG.n1GroundIdle, n2: ENG.n2Idle, itt: 480, ff: 290, thrust: 0 };
  function vdata() {
    const v = ENG.variants[st.variant], ref = ENG.variants.PW1524G.to;
    const n1TO = ENG.n1Max * 0.97 * Math.sqrt(v.to / ref);       // poussée ∝ N1², décollage à ~97 % de la limite pour le PW1524G
    return { v, n1TO, n2TO: ENG.n2Max * 0.97 - (ENG.n1Max * 0.97 - n1TO) * 0.6, ittTO: 1000 - (ref - v.to) / 60, ffTO: v.to * 0.30 * 0.4536 };
  }
  const n1ForThrust = (lbf) => { const d = vdata(); return d.n1TO * Math.sqrt(lbf / d.v.to); };
  const cmdForN1 = (n1) => { const d = vdata(); return Math.max(0, Math.min(1, (n1 - ENG.n1GroundIdle) / (d.n1TO - ENG.n1GroundIdle))); };
  function updateEngine(dt) {
    const d = vdata(), n1T = lerp(ENG.n1GroundIdle, d.n1TO, st.cmd);
    const s = Math.max(0, (st.n1 - ENG.n1GroundIdle) / (d.n1TO - ENG.n1GroundIdle));
    const n2T = ENG.n2Idle + (d.n2TO - ENG.n2Idle) * Math.pow(Math.max(0, (n1T - ENG.n1GroundIdle) / (d.n1TO - ENG.n1GroundIdle)), 0.55);
    st.n2 += (n2T - st.n2) * Math.min(1, dt / 1.2);
    st.n1 += (n1T - st.n1) * Math.min(1, dt / 2.2); // la soufflante réduite ajoute de l'inertie au corps BP
    st.itt += (480 + (d.ittTO - 480) * Math.pow(s, 1.3) - st.itt) * Math.min(1, dt / 1.5);
    st.ff += (290 + (d.ffTO - 290) * Math.pow(s, 1.6) - st.ff) * Math.min(1, dt / 0.6);
    st.thrust = d.v.to * Math.pow(st.n1 / d.n1TO, 2);
  }

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
    { t: 'Flux secondaire', x: 2.0, r: 0.75, dx: -10, dy: -45 },
    { t: 'Nacelle', x: 0.5, r: 1.16, dx: -40, dy: -35, outside: true },
  ].map((l) => {
    const el = document.createElement('div'); el.className = 'eng-label';
    const line = document.createElement('span'); line.className = 'lbl-line';
    line.style.width = Math.hypot(l.dx, l.dy) + 'px'; line.style.transform = `rotate(${Math.atan2(l.dy, l.dx)}rad)`;
    const txt = document.createElement('span'); txt.className = 'lbl-text' + (l.dx < 0 ? ' lbl-left' : ''); txt.textContent = l.t;
    txt.style.left = l.dx + 'px'; txt.style.top = l.dy + 'px';
    const dot = document.createElement('span'); dot.className = 'lbl-dot';
    el.append(line, dot, txt); labelLayer.appendChild(el);
    const a = -0.03; // juste derrière la face de coupe (y > 0, z ≈ 0)
    return Object.assign(l, { el, p: new THREE.Vector3(X(l.x), R(l.r) * Math.cos(a), R(l.r) * Math.sin(a)) });
  });
  let showLabels = true;
  const proj = new THREE.Vector3();
  function updateLabels(w, h) {
    for (const l of LABELS) {
      if (!showLabels || (!l.outside && !cutaway)) { l.el.style.display = 'none'; continue; }
      proj.copy(l.p).project(camera);
      if (proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = 'block';
      l.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px)`;
    }
  }

  /* ═══════════════ Descriptions ═══════════════ */
  const fmt = (v) => Math.round(v).toLocaleString('fr-CA');
  const fanRpm = () => st.n1 / ENG.gear;
  const INFO = {
    nacelle: { name: 'Nacelle', ref: 'TCDS IM.E.090 · note 4', desc: "Entrée d'air, carter de soufflante (Ø nominal 2,006 m) et tuyère secondaire. L'inverseur de poussée fait partie de l'avion, pas de la définition de type du moteur." },
    spinner: { name: "Cône d'entrée", ref: 'Soufflante', desc: "Tourne avec la soufflante, donc à vitesse réduite (N1 ÷ 3,0625).", live: () => `${fmt(fanRpm())} tr/min` },
    fan: {
      name: 'Soufflante', ref: 'Ø 73 po · 18 aubes (valeur citée)', desc: "Aubes larges en alliage d'aluminium, premier moteur certifié avec ce matériau. Le réducteur la fait tourner environ trois fois moins vite que le corps BP : son bout d'aube reste proche de la vitesse du son malgré ses 1,85 m.",
      live: () => { const v = fanRpm() * TAU / 60 * ENG.fanR; return `${fmt(fanRpm())} tr/min · bout d'aube ${fmt(v)} m/s (Mach ${(v / 340).toFixed(2).replace('.', ',')})`; },
    },
    fanshaft: { name: 'Arbre de soufflante', ref: 'Réducteur → soufflante', desc: "Relie la couronne du réducteur au disque de soufflante.", live: () => `${fmt(fanRpm())} tr/min` },
    fegv: { name: 'Redresseurs de soufflante (OGV)', ref: 'Flux secondaire', desc: "Aubes fixes qui suppriment la giration donnée par la soufflante : l'air du flux secondaire (12 fois le débit du noyau) ressort dans l'axe." },
    corevane: { name: "Aubes d'entrée du noyau", ref: 'Pied de soufflante', desc: "Redressent l'air qui sort du pied de soufflante avant le compresseur basse pression." },
    fdgs: {
      name: 'Réducteur de soufflante (FDGS)', ref: 'TCDS IM.E.090 · Kawasaki TR n° 179',
      desc: "Train épicycloïdal en étoile à dentures en chevrons : le soleil (corps BP) entraîne 5 satellites sur un porte-satellites fixe, et la couronne entraîne la soufflante en sens inverse. Rapport 3,0625:1 (dents figurées 32 / 33 / 98, rapport exact).",
      live: () => `Soleil ${fmt(st.n1)} tr/min → satellites ${fmt(st.n1 * ZS / ZP)} tr/min → couronne ${fmt(fanRpm())} tr/min`,
    },
    lpc: { name: 'Compresseur basse pression', ref: '3 étages · corps BP', desc: "Tourne à la vitesse de la turbine BP, bien plus vite que la soufflante : c'est tout l'intérêt du réducteur (moins d'étages, plus de travail par étage).", live: () => `N1 ${fmt(st.n1)} tr/min` },
    intcase: { name: 'Carter intermédiaire', ref: 'Col de cygne', desc: "Structure porteuse entre les compresseurs BP et HP ; ses bras supportent les paliers avant." },
    hpc: { name: 'Compresseur haute pression', ref: '8 étages · corps HP', desc: "Aubes d'entrée à calage variable. Tourne en sens inverse du corps BP.", live: () => `N2 ${fmt(st.n2)} tr/min` },
    combustor: { name: 'Chambre de combustion TALON X', ref: 'Kawasaki TR n° 179', desc: "Chambre annulaire à faibles émissions de NOx. Paroi intérieure en panneaux moulés résistants à la chaleur, remplaçables en maintenance ; nombreux trous de refroidissement percés au laser.", live: () => `Débit carburant ≈ ${fmt(st.ff)} kg/h` },
    injectors: { name: 'Injecteurs', ref: 'Kawasaki fig. 2 (nombre figuré)', desc: "Traversent le carter diffuseur et alimentent le fond de chambre.", live: () => `≈ ${fmt(st.ff)} kg/h au total` },
    hptv: { name: 'Distributeurs de turbine HP', ref: '2 rangées', desc: "Aubes fixes refroidies qui accélèrent les gaz et les orientent dans le sens de rotation du corps HP." },
    hpt: { name: 'Turbine haute pression', ref: '2 étages refroidis · TCDS', desc: "Entraîne le compresseur HP.", live: () => `N2 ${fmt(st.n2)} tr/min · ITT ${fmt(st.itt)} °C` },
    mtf: { name: 'Carter inter-turbines', ref: 'Entre turbines HP et BP', desc: "Bras profilés qui supportent un palier et redirigent les gaz vers la turbine BP, qui tourne en sens inverse de la turbine HP." },
    lpt: { name: 'Turbine basse pression', ref: '3 étages · TCDS', desc: "Entraîne le compresseur BP et, par le réducteur, la soufflante. Grâce au réducteur, elle tourne vite et n'a besoin que de 3 étages.", live: () => `N1 ${fmt(st.n1)} tr/min` },
    tec: { name: "Carter d'échappement (TEC)", ref: 'Sortie turbine', desc: "Bras qui supportent le palier arrière et redressent les gaz." },
    shaftLP: { name: 'Arbre basse pression', ref: 'Corps BP', desc: "Relie la turbine BP au compresseur BP et au soleil du réducteur. Passe à l'intérieur de l'arbre HP.", live: () => `${fmt(st.n1)} tr/min` },
    shaftHP: { name: 'Arbre haute pression', ref: 'Corps HP', desc: "Tambour reliant le compresseur HP à la turbine HP, contrarotatif par rapport au corps BP.", live: () => `${fmt(st.n2)} tr/min` },
    corecowl: { name: 'Capot du noyau', ref: 'Flux primaire / secondaire', desc: "Sépare le flux secondaire froid du générateur de gaz ; se prolonge jusqu'à la tuyère primaire." },
    casing: { name: 'Carters moteur', ref: 'Structure', desc: "Carters des compresseurs, carter diffuseur autour de la chambre et carters des turbines." },
    plug: { name: "Cône d'échappement", ref: 'Tuyère primaire', desc: "Ferme le centre de la tuyère primaire." },
  };

  /* ═══════════════ Interface ═══════════════ */
  const OUT = { n1: $('i-n1'), n1rpm: $('i-n1rpm'), fan: $('i-fan'), n2: $('i-n2'), n2rpm: $('i-n2rpm'), itt: $('i-itt'), ff: $('i-ff'), thr: $('i-thr'), thrmax: $('i-thrmax') };
  const thrEl = $('throttle'), thrVal = $('thr-val'), partInfo = $('part-info');
  function setCmd(c) {
    st.cmd = Math.max(0, Math.min(1, c)); thrEl.value = Math.round(st.cmd * 1000);
    const d = vdata(), n1 = lerp(ENG.n1GroundIdle, d.n1TO, st.cmd);
    thrVal.textContent = st.cmd < 0.005 ? 'Ralenti sol' : `N1 ${fmt(n1)} tr/min`;
  }
  thrEl.addEventListener('input', () => setCmd(thrEl.value / 1000));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const d = vdata(), k = b.dataset.preset;
    setCmd(k === 'gi' ? 0 : k === 'fi' ? cmdForN1(ENG.n1FlightIdle) : k === 'mct' ? cmdForN1(n1ForThrust(d.v.mct)) : 1);
  }));
  $('variant').addEventListener('change', (e) => { st.variant = e.target.value; setCmd(st.cmd); });
  $('t-cut').addEventListener('change', (e) => setCutaway(e.target.checked));
  $('t-keep').addEventListener('change', (e) => { keepWhole = e.target.checked; applyKeep(); updateCaps(); });
  $('t-flow').addEventListener('change', (e) => { bypassFlow.pts.visible = coreFlow.pts.visible = e.target.checked; });
  $('t-labels').addEventListener('change', (e) => { showLabels = e.target.checked; });
  $('t-colors').addEventListener('change', (e) => { setColorMode(e.target.checked); updateCaps(); $('legend').classList.toggle('legend-dim', !e.target.checked); });
  $('t-auto').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; });
  let slow = parseFloat($('slow').value);
  $('slow').addEventListener('change', (e) => { slow = parseFloat(e.target.value); });
  let camTween = null;
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const [p, t] = VIEWS[b.dataset.view];
    camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), k: 0 };
  }));

  // Plein écran natif, sinon (Safari iPhone) agrandissement CSS
  const nativeFS = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  let pseudoFS = false;
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || pseudoFS;
  function onFS() { $('btn-fs').textContent = fsOn() ? '✕ Quitter' : '⛶ Plein écran'; }
  function toggleFS() {
    if (!nativeFS) { pseudoFS = !pseudoFS; viewport.classList.toggle('pseudo-fs', pseudoFS); document.documentElement.classList.toggle('pseudo-fs-on', pseudoFS); onFS(); return; }
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (viewport.requestFullscreen || viewport.webkitRequestFullscreen).call(viewport);
  }
  $('btn-fs').addEventListener('click', toggleFS);
  document.addEventListener('fullscreenchange', onFS); document.addEventListener('webkitfullscreenchange', onFS);
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'f' || e.key === 'F') toggleFS();
    if (e.key === 'Escape' && pseudoFS) toggleFS();
  });

  // Sélection d'une pièce
  let selected = null;
  function renderInfo() {
    if (!selected) return;
    const info = INFO[selected]; if (!info) return;
    partInfo.innerHTML = '';
    const mk = (cls, text) => { const e = document.createElement('div'); e.className = cls; e.textContent = text; partInfo.appendChild(e); };
    mk('pi-title', info.name); if (info.ref) mk('pi-ref', info.ref); mk('pi-desc', info.desc); if (info.live) mk('pi-live', info.live());
  }
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
      if (cutaway && m && m.clippingPlanes && m.clippingPlanes.length && h.point.y > 0 && h.point.z > 0) continue;
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
  if (window.ResizeObserver) new ResizeObserver(resize).observe(viewport);
  resize();

  applyKeep(); setCutaway(true); setCmd(0);
  if (loadingEl) loadingEl.style.display = 'none';

  /* ═══════════════ Boucle ═══════════════ */
  const clock = new THREE.Clock();
  let angLP = 0, angHP = 0, infoT = 0;
  const RPM = TAU / 60;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    updateEngine(dt);
    const d = vdata();
    OUT.n1.textContent = (st.n1 / ENG.n1Max * 100).toFixed(1).replace('.', ',') + ' %';
    OUT.n1rpm.textContent = fmt(st.n1) + ' tr/min';
    OUT.fan.textContent = fmt(fanRpm()) + ' tr/min';
    OUT.n2.textContent = (st.n2 / ENG.n2Max * 100).toFixed(1).replace('.', ',') + ' %';
    OUT.n2rpm.textContent = fmt(st.n2) + ' tr/min';
    OUT.itt.textContent = fmt(st.itt) + ' °C';
    OUT.ff.textContent = fmt(st.ff);
    OUT.thr.textContent = (st.thrust * LBF_TO_KN).toFixed(1).replace('.', ',') + ' kN';
    OUT.thrmax.textContent = `max ${(d.v.to * LBF_TO_KN).toFixed(1).replace('.', ',')} kN`;
    $('box-itt').classList.toggle('warn', st.itt > ENG.ittMCT);

    // rotations : soleil = corps BP ; couronne = −soleil·ZS/ZR (soufflante) ; satellites = −soleil·ZS/ZP sur leurs axes fixes
    const dLP = DIR.lp * st.n1 * RPM * slow * dt;
    angLP += dLP; angHP += DIR.hp * st.n2 * RPM * slow * dt;
    LP.rotation.x = angLP; HP.rotation.x = angHP;
    FAN.rotation.x = -angLP * ZS / ZR;
    for (const s of stars) s.rotation.x = -angLP * ZS / ZP;

    const heat = Math.max(0, (st.itt - 480) / 520);
    flameMat.opacity = 0.16 + 0.5 * heat;
    flameMat.color.copy(col(0xff5a10)).lerp(col(0xffd070), heat * 0.6);
    flameLight.intensity = 0.4 + 2.4 * heat;
    if (bypassFlow.pts.visible) {
      const sp = 0.3 + 1.1 * (st.n1 / ENG.n1Max);
      stepFlow(bypassFlow, dt, sp, heat); stepFlow(coreFlow, dt, sp, heat);
    }
    if (camTween) {
      camTween.k = Math.min(1, camTween.k + dt * 1.6); const e = camTween.k * camTween.k * (3 - 2 * camTween.k);
      camera.position.lerpVectors(camTween.p0, camTween.p1, e); controls.target.lerpVectors(camTween.t0, camTween.t1, e);
      if (camTween.k >= 1) camTween = null;
    }
    infoT += dt; if (infoT > 0.25 && selected && INFO[selected] && INFO[selected].live) { infoT = 0; renderInfo(); }
    controls.update();
    renderer.render(scene, camera);
    updateLabels(vw, vh);
  }
  animate();
})();
