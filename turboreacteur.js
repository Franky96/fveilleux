(function () {
  'use strict';

  if (!sessionStorage.getItem('loggedIn')) {
    window.location.href = 'index.html';
    return;
  }

  const loadingEl = document.getElementById('viewport-loading');
  if (typeof THREE === 'undefined' || !THREE.OrbitControls) {
    if (loadingEl) loadingEl.textContent = 'Impossible de charger le moteur 3D (bibliothèque non disponible).';
    return;
  }

  // ── Moteur de référence : CFM56-7B27 (Boeing 737NG) ──
  const ENG = {
    n1Max: 5380,      // tr/min à 100 % N1
    n2Max: 14460,     // tr/min à 100 % N2
    thrustMax: 121.4, // kN
    bpr: 5.1,
    oprMax: 32.8,
    fanR: 0.775,      // m
    egtRed: 950,      // °C
  };

  // Géométrie décrite en mètres (x = distance depuis la lèvre d'entrée, r = rayon)
  const S = 4;     // 1 m = 4 unités de scène
  const XC = 2.0;  // centre de la vue
  const X = (x) => (x - XC) * S;
  const R = (r) => r * S;
  const TAU = Math.PI * 2;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function piecewise(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
    }
    return pts[pts.length - 1][1];
  }
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  // ── Veine d'air (profils méridiens) ──
  const HUB = [ // paroi interne du flux primaire
    [0.35, 0.0], [0.40, 0.06], [0.48, 0.13], [0.58, 0.20], [0.68, 0.255], [0.80, 0.28], [0.95, 0.295],
    [1.00, 0.30], [1.34, 0.30], [1.42, 0.27], [1.52, 0.215], [1.60, 0.20], [1.90, 0.22], [2.22, 0.235],
    [2.28, 0.24], [2.33, 0.255], [2.55, 0.255], [2.60, 0.25], [2.68, 0.25], [3.06, 0.265], [3.12, 0.265],
    [3.35, 0.22], [3.60, 0.14], [3.85, 0.04], [3.90, 0.0],
  ];
  const CORE_OUT = [ // paroi externe du flux primaire (carters)
    [0.0, 0.42], [0.70, 0.41], [1.00, 0.40], [1.34, 0.365], [1.42, 0.35], [1.52, 0.305], [1.60, 0.29],
    [1.90, 0.27], [2.22, 0.255], [2.28, 0.26], [2.33, 0.345], [2.52, 0.345], [2.58, 0.30], [2.68, 0.305],
    [3.06, 0.405], [3.12, 0.41], [3.35, 0.38], [4.80, 0.43],
  ];
  const BYP_IN = [ // paroi interne du flux secondaire (capot du noyau)
    [0.0, 0.42], [1.00, 0.41], [1.15, 0.445], [1.35, 0.48], [1.70, 0.515], [2.10, 0.525], [2.50, 0.505],
    [2.90, 0.46], [3.35, 0.395], [4.80, 0.44],
  ];
  const BYP_OUT = [ // paroi externe du flux secondaire (nacelle)
    [0.0, 0.755], [0.08, 0.735], [0.20, 0.74], [0.60, 0.772], [0.68, 0.78], [0.95, 0.78], [1.10, 0.785],
    [1.50, 0.775], [2.00, 0.755], [2.40, 0.725], [3.35, 0.70], [4.80, 0.72],
  ];
  const hubAt = (x) => piecewise(HUB, x);
  const coreOutAt = (x) => piecewise(CORE_OUT, x);
  const bypInAt = (x) => piecewise(BYP_IN, x);
  const bypOutAt = (x) => piecewise(BYP_OUT, x);

  // ── État moteur ──
  const st = { throttle: 0, n1: 21, n2: 62, egt: 450, ff: 320, thrust: 4.8, opr: 3.6, t4: 800 };
  const fmt = (v) => Math.round(v).toLocaleString('fr-CA');

  // ── Descriptions ──
  const INFO = {
    spinner: { name: "Cône d'entrée (spinner)", desc: "Guide l'air vers le pied des aubes de soufflante. Tourne avec l'arbre basse pression (N1)." },
    fan: {
      name: 'Soufflante (fan)',
      desc: "24 aubes larges en titane, vrillées du pied (≈20°) au bout (≈60°). Produit environ 80 % de la poussée via le flux secondaire.",
      live: () => {
        const rpm = st.n1 / 100 * ENG.n1Max;
        const tip = rpm * TAU / 60 * ENG.fanR;
        return `N1 ${fmt(rpm)} tr/min · vitesse en bout d'aube ${fmt(tip)} m/s (Mach ${(tip / 340).toFixed(2)})`;
      },
    },
    ogv: { name: 'Redresseurs de soufflante (OGV)', desc: "Aubes fixes qui suppriment la giration de l'air en sortie de soufflante pour récupérer de la poussée dans le flux secondaire." },
    booster: { name: 'Compresseur basse pression (booster)', desc: "3 étages rotor/stator solidaires de la soufflante (N1). Précomprime le flux primaire avant le col de cygne." },
    frame: { name: 'Carter intermédiaire (fan frame)', desc: "Bras radiaux structuraux dans le col de cygne : supportent les paliers avant et transmettent les efforts aux attaches moteur." },
    hpc: {
      name: 'Compresseur haute pression (HPC)',
      desc: "9 étages sur l'arbre N2, avec aubes de stator (fixes) intercalées entre chaque rotor. Hauteur de veine décroissante vers l'arrière.",
      live: () => `N2 ${fmt(st.n2 / 100 * ENG.n2Max)} tr/min · taux de compression global ≈ ${st.opr.toFixed(1)}`,
    },
    combustor: {
      name: 'Chambre de combustion annulaire',
      desc: "Chambre à simple anneau entourée du carter diffuseur. L'air de refroidissement et de dilution passe entre le tube à flamme et le carter.",
      live: () => `Débit carburant ${fmt(st.ff)} kg/h · T4 ≈ ${fmt(st.t4)} °C`,
    },
    fuel: {
      name: 'Injecteurs de carburant',
      desc: "20 injecteurs traversent le carter diffuseur et pulvérisent le kérosène dans le fond de chambre (dôme).",
      live: () => `Débit total ${fmt(st.ff)} kg/h · ${fmt(st.ff / 20)} kg/h par injecteur`,
    },
    ngv: {
      name: 'Distributeur HP (NGV)',
      desc: "Aubes fixes refroidies à l'air qui accélèrent et orientent les gaz les plus chauds du moteur sur la turbine HP.",
      live: () => `T4 ≈ ${fmt(st.t4)} °C`,
    },
    hpt: {
      name: 'Turbine haute pression (HPT)',
      desc: "1 étage monocristallin refroidi, sur l'arbre N2. Fournit toute la puissance du compresseur HP.",
      live: () => `N2 ${fmt(st.n2 / 100 * ENG.n2Max)} tr/min`,
    },
    lpt: {
      name: 'Turbine basse pression (LPT)',
      desc: "4 étages (distributeur + rotor) sur l'arbre N1. Entraîne la soufflante et le booster. Le diamètre de veine augmente avec la détente des gaz.",
      live: () => `N1 ${fmt(st.n1 / 100 * ENG.n1Max)} tr/min · EGT ${fmt(st.egt)} °C`,
    },
    trf: { name: "Carter d'échappement (TRF)", desc: "Bras radiaux arrière qui supportent le palier arrière de l'arbre BP et redressent l'écoulement." },
    shaftN1: { name: 'Arbre basse pression (N1)', desc: "Relie la turbine BP à la soufflante et au booster. Passe à l'intérieur de l'arbre HP sur toute la longueur du noyau." },
    shaftN2: { name: 'Arbre haute pression (N2)', desc: "Tambour reliant les disques du compresseur HP à la turbine HP, sous la chambre de combustion. Tourne ~2,7× plus vite que N1." },
    nacelle: {
      name: 'Nacelle',
      desc: "Entrée d'air à lèvre arrondie, carter de soufflante et tuyère secondaire courte (flux séparés). Revêtements acoustiques internes.",
      live: () => `Taux de dilution ${ENG.bpr.toFixed(1).replace('.', ',')} : 1`,
    },
    corecowl: { name: 'Capot du noyau', desc: "Sépare le flux secondaire froid du générateur de gaz. Se prolonge jusqu'à la tuyère primaire, visible derrière la nacelle." },
    casing: { name: 'Carters moteur', desc: "Enveloppe structurale : carters compresseur, carter diffuseur autour de la chambre et carters turbine." },
    plug: { name: "Cône d'échappement (plug)", desc: "Ferme le centre de la tuyère primaire et guide la détente des gaz chauds." },
    disk: { name: 'Disques rotor', desc: "Chaque étage de rotor est monté sur un disque (jante, voile, alésage) relié à son arbre." },
  };

  // ── Scène / caméra / rendu ──
  const viewport = document.getElementById('engine-viewport');
  const canvas = document.getElementById('engine-canvas');
  const labelLayer = document.getElementById('label-layer');

  const scene = new THREE.Scene();
  scene.background = col(0x05080a);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  const CAM_START = new THREE.Vector3(3.0, 6.0, 15.5);
  camera.position.copy(CAM_START);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 40;
  controls.target.set(0, 0, 0);
  controls.autoRotateSpeed = 0.9;

  // Environnement (reflets des métaux)
  (function buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    const sky = new THREE.SphereGeometry(50, 32, 16);
    const p = sky.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) {
      const h = p.getY(i) / 50;
      const v = 0.04 + 0.32 * Math.max(0, h);
      c.push(v * 0.85, v * 0.95, v);
    }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    function panel(w, h, pos, k) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m);
    }
    panel(40, 10, new THREE.Vector3(0, 35, 8), 4);
    panel(20, 20, new THREE.Vector3(30, 10, 25), 1.6);
    panel(20, 12, new THREE.Vector3(-30, 6, -20), 1.0);
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
  })();

  scene.add(new THREE.HemisphereLight(col(0x9ab4c4), col(0x0a0f0a), 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(6, 10, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(col(0x8fb8d0), 0.5);
  rim.position.set(-10, 4, -8);
  scene.add(rim);

  const grid = new THREE.GridHelper(80, 80, 0x1f3a24, 0x101a14);
  grid.position.y = R(-1.25);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  // ── Vue en coupe : quart retiré (y > 0 et z > 0) ──
  const clipA = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const clipB = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const CLIP = [clipA, clipB];
  let cutaway = true;
  function setCutaway(on) {
    cutaway = on;
    clipA.constant = on ? 0 : 1e4;
    clipB.constant = on ? 0 : 1e4;
  }

  // ── Matériaux (couleur réelle / couleur par section) ──
  const MATS = [];
  function mat(real, coded, o) {
    const m = new THREE.MeshStandardMaterial(Object.assign({
      color: col(real), metalness: 0.75, roughness: 0.38,
      side: THREE.DoubleSide, clippingPlanes: CLIP, clipIntersection: true,
    }, o || {}));
    m.userData.real = col(real);
    m.userData.coded = col(coded);
    MATS.push(m);
    return m;
  }
  function setColorMode(coded) {
    MATS.forEach((m) => m.color.copy(coded ? m.userData.coded : m.userData.real));
  }

  const MAT = {
    nacelle:  mat(0xe6e8ea, 0x8fb8d0, { metalness: 0.1, roughness: 0.42 }),
    cowl:     mat(0xc2c7cc, 0x7f9aa8, { metalness: 0.45, roughness: 0.4 }),
    spinner:  mat(0xb9bec4, 0xe0e0e0, { metalness: 0.9, roughness: 0.22 }),
    fan:      mat(0xadb4bc, 0x4fc3c7, { metalness: 0.95, roughness: 0.26 }),
    ogv:      mat(0x8c939a, 0x3a9da3),
    booster:  mat(0xa4aab0, 0x6f8fae),
    boosterS: mat(0x8a9096, 0x587896),
    strut:    mat(0x6a7076, 0x56606a, { roughness: 0.5 }),
    hpc:      mat(0xa0a3a6, 0xb4b4b4),
    hpcS:     mat(0x85888b, 0x8c8c8c),
    casing:   mat(0x5a5f64, 0x46525a, { roughness: 0.48 }),
    hub:      mat(0x70757b, 0x5d6870, { roughness: 0.42 }),
    diskN1:   mat(0x7c8288, 0x5fa4b4),
    diskN2:   mat(0x827d74, 0xb8a060),
    shaftN1:  mat(0x9aa0a8, 0xb8c4d0, { metalness: 0.9, roughness: 0.25 }),
    shaftN2:  mat(0x9c9588, 0xd4af37, { metalness: 0.9, roughness: 0.25 }),
    liner:    mat(0x8c7660, 0xff7a3a, { metalness: 0.55, roughness: 0.55 }),
    injector: mat(0x6f6a64, 0xd0a060),
    hptV:     mat(0xa98f63, 0xc9442a, { roughness: 0.5 }),
    hpt:      mat(0xc0a676, 0xe85d3f, { roughness: 0.45 }),
    lptV:     mat(0x8e8069, 0xd08420, { roughness: 0.5 }),
    lpt:      mat(0xa99579, 0xf0a830, { roughness: 0.45 }),
    plug:     mat(0x67625c, 0x7a7a7a, { roughness: 0.55 }),
  };

  const flameMat = new THREE.MeshBasicMaterial({
    color: col(0xff6a1a), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, clippingPlanes: CLIP, clipIntersection: true,
  });

  // ── Groupes ──
  const engine = new THREE.Group();
  const ST = new THREE.Group();  // pièces fixes
  const N1 = new THREE.Group();  // soufflante, booster, turbine BP
  const N2 = new THREE.Group();  // compresseur HP, turbine HP
  engine.add(ST, N1, N2);
  scene.add(engine);
  const pickables = [];
  function add(mesh, group, infoKey) {
    mesh.userData.info = infoKey;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }

  // ── Géométries de révolution ──
  function latheGeo(pts, seg) {
    const v = pts.map(([x, r]) => new THREE.Vector2(Math.max(R(r), 1e-4), X(x)));
    const g = new THREE.LatheGeometry(v, seg || 128);
    g.rotateZ(-Math.PI / 2); // axe de révolution Y → X
    return g;
  }
  function closed(pts) { return pts.concat([pts[0]]); }
  function shell(pts, t) { // paroi mince : t > 0 vers l'extérieur
    const back = pts.slice().reverse().map(([x, r]) => [x, r + t]);
    return closed(pts.concat(back));
  }
  function solid(pts) { // volume plein jusqu'à l'axe
    return closed([[pts[0][0], 0]].concat(pts, [[pts[pts.length - 1][0], 0]]));
  }
  function revolve(pts, material, group, info, seg) {
    return add(new THREE.Mesh(latheGeo(pts, seg), material), group, info);
  }

  // ── Aubes : profil NACA 4 chiffres, vrillé, cambré, en flèche ──
  function bladeGeo(o) {
    const ns = o.spans || 6, nc = o.cpts || 7;
    const us = [];
    for (let k = 0; k < nc; k++) us.push(0.5 * (1 - Math.cos(Math.PI * k / (nc - 1))));
    const ring = [];
    for (let k = 0; k < nc; k++) ring.push([us[k], 1]);
    for (let k = nc - 2; k > 0; k--) ring.push([us[k], -1]);
    const M = ring.length;
    const pos = new Float32Array(ns * M * 3);
    let p = 0;
    for (let s = 0; s < ns; s++) {
      const f = s / (ns - 1);
      const r = lerp(o.hub, o.tip, f);
      const c = lerp(o.chord[0], o.chord[1], f);
      const g = lerp(o.stag[0], o.stag[1], f);
      const m = lerp(o.cam[0], o.cam[1], f);
      const sw = (o.sweep || 0) * f * f;
      const cg = Math.cos(g), sg = Math.sin(g);
      for (let k = 0; k < M; k++) {
        const u = ring[k][0], side = ring[k][1];
        const t = 5 * o.tr * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
        const cx = (u - 0.5) * c;
        const cy = (m * 4 * u * (1 - u) + side * t) * c;
        pos[p++] = (cx * cg - cy * sg + sw) * S;
        pos[p++] = r * S;
        pos[p++] = (cx * sg + cy * cg) * S;
      }
    }
    const idx = [];
    for (let s = 0; s < ns - 1; s++) {
      for (let k = 0; k < M; k++) {
        const a = s * M + k, b = s * M + (k + 1) % M;
        idx.push(a, b, b + M, a, b + M, a + M);
      }
    }
    const top = (ns - 1) * M;
    for (let k = 1; k < M - 1; k++) idx.push(top, top + k + 1, top + k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  function diskProfile(x, w, rim, bore) {
    return closed([
      [x - w / 2, rim], [x + w / 2, rim], [x + w / 2, rim - 0.015], [x + w * 0.15, rim - 0.03],
      [x + w * 0.15, bore + 0.03], [x + w * 0.4, bore + 0.018], [x + w * 0.4, bore],
      [x - w * 0.4, bore], [x - w * 0.4, bore + 0.018], [x - w * 0.15, bore + 0.03],
      [x - w * 0.15, rim - 0.03], [x - w / 2, rim - 0.015],
    ]);
  }

  // Une rangée d'aubes (rotor ou stator) en InstancedMesh
  function row(s) {
    const hub = s.hub !== undefined ? s.hub : hubAt(s.x);
    const tip = s.tip !== undefined ? s.tip : coreOutAt(s.x) - 0.003;
    const geo = bladeGeo({ hub, tip, chord: s.chord, stag: s.stag, cam: s.cam, tr: s.tr, sweep: s.sweep, spans: s.spans, cpts: s.cpts });
    const im = new THREE.InstancedMesh(geo, s.mat, s.n);
    const d = new THREE.Object3D();
    const phase = Math.random() * TAU;
    for (let i = 0; i < s.n; i++) {
      d.rotation.set(phase + (i / s.n) * TAU, 0, 0);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.position.x = X(s.x);
    add(im, s.group, s.info);
    if (s.disk) revolve(diskProfile(s.x, s.disk.w, hub, s.disk.bore), s.disk.mat, s.group, s.info, 72);
    return im;
  }

  // ════════════════ Construction du moteur ════════════════

  // Nacelle : lèvre d'entrée, carter de soufflante, tuyère secondaire courte
  revolve(closed([
    [0.0, 0.765], [0.01, 0.79], [0.04, 0.815], [0.10, 0.845], [0.25, 0.88], [0.50, 0.905], [0.90, 0.915],
    [1.40, 0.905], [1.90, 0.86], [2.25, 0.78], [2.40, 0.735],
    [2.40, 0.725], [2.00, 0.755], [1.50, 0.775], [1.10, 0.785], [0.95, 0.78], [0.68, 0.78],
    [0.60, 0.772], [0.20, 0.74], [0.08, 0.735], [0.03, 0.742], [0.01, 0.752],
  ]), MAT.nacelle, ST, 'nacelle');

  // Capot du noyau (bec de séparation plein à l'avant, paroi mince ensuite)
  revolve(closed([
    [1.00, 0.41], [1.15, 0.445], [1.35, 0.48], [1.70, 0.515], [2.10, 0.525], [2.50, 0.505], [2.90, 0.46],
    [3.35, 0.395], [3.35, 0.385], [2.90, 0.448], [2.50, 0.493], [2.10, 0.513], [1.70, 0.503],
    [1.46, 0.482], [1.42, 0.362], [1.34, 0.368], [1.00, 0.402],
  ]), MAT.cowl, ST, 'corecowl');

  // Carters : compresseur HP, carter diffuseur (chambre), turbines, tuyère primaire
  revolve(shell([
    [1.42, 0.362], [1.52, 0.317], [1.60, 0.302], [1.90, 0.282], [2.20, 0.268], [2.28, 0.30], [2.32, 0.40],
    [2.52, 0.40], [2.60, 0.325], [2.68, 0.317], [3.06, 0.417], [3.12, 0.422], [3.35, 0.392],
  ], 0.008), MAT.casing, ST, 'casing');

  // Paroi interne de veine (plates-formes)
  revolve(shell(HUB.filter(([x]) => x >= 0.72 && x <= 3.12), -0.006), MAT.hub, ST, 'casing');

  // Cône d'entrée et cône d'échappement
  revolve(solid([[0.35, 0.0], [0.37, 0.03], [0.40, 0.06], [0.48, 0.13], [0.58, 0.20], [0.68, 0.255], [0.74, 0.272]]), MAT.spinner, N1, 'spinner');
  revolve(solid([[3.12, 0.263], [3.35, 0.22], [3.60, 0.14], [3.85, 0.04], [3.90, 0.0]]), MAT.plug, ST, 'plug');

  // ── Attelage basse pression (N1) ──
  row({ x: 0.78, n: 24, hub: 0.282, tip: 0.772, chord: [0.13, 0.25], stag: [0.36, 1.05], cam: [0.10, 0.025], tr: 0.08, sweep: 0.03, spans: 12, cpts: 11, mat: MAT.fan, group: N1, info: 'fan' });
  revolve(diskProfile(0.80, 0.06, 0.28, 0.06), MAT.diskN1, N1, 'disk', 72);
  row({ x: 1.30, n: 44, hub: bypInAt(1.30) - 0.005, tip: bypOutAt(1.30) + 0.003, chord: [0.09, 0.11], stag: [-0.12, -0.12], cam: [0.09, 0.09], tr: 0.09, mat: MAT.ogv, group: ST, info: 'ogv' });

  row({ x: 1.035, n: 36, chord: [0.03, 0.03], stag: [-0.12, -0.12], cam: [0.03, 0.03], tr: 0.1, mat: MAT.boosterS, group: ST, info: 'booster' });
  [1.08, 1.18, 1.28].forEach((x) => {
    row({ x, n: 48, chord: [0.042, 0.046], stag: [0.65, 0.95], cam: [0.07, 0.04], tr: 0.07, mat: MAT.booster, group: N1, info: 'booster' });
    row({ x: x + 0.05, n: 56, chord: [0.036, 0.036], stag: [-0.42, -0.38], cam: [0.07, 0.06], tr: 0.08, mat: MAT.boosterS, group: ST, info: 'booster' });
  });
  row({ x: 1.47, n: 8, chord: [0.09, 0.09], stag: [0, 0], cam: [0, 0], tr: 0.22, mat: MAT.strut, group: ST, info: 'frame' });

  for (let j = 0; j < 4; j++) {
    const xv = 2.715 + 0.1 * j;
    row({ x: xv, n: 56, chord: [0.04, 0.042], stag: [-0.7, -0.65], cam: [0.15, 0.13], tr: 0.12, mat: MAT.lptV, group: ST, info: 'lpt' });
    row({ x: xv + 0.05, n: 72, chord: [0.034, 0.034], stag: [0.55, 0.7], cam: [-0.16, -0.12], tr: 0.1, mat: MAT.lpt, group: N1, info: 'lpt', disk: { w: 0.035, bore: 0.07, mat: MAT.diskN1 } });
  }
  row({ x: 3.12, n: 12, hub: 0.265, tip: 0.41, chord: [0.07, 0.07], stag: [0, 0], cam: [0, 0], tr: 0.2, mat: MAT.strut, group: ST, info: 'trf' });

  revolve(solid([[0.80, 0.045], [3.14, 0.045]]), MAT.shaftN1, N1, 'shaftN1', 32);
  revolve(shell([[0.83, 0.25], [0.95, 0.12], [1.00, 0.05]], 0.01), MAT.shaftN1, N1, 'shaftN1', 72);
  revolve(shell([[2.765, 0.20], [3.065, 0.215], [3.10, 0.12], [3.13, 0.05]], 0.01), MAT.shaftN1, N1, 'shaftN1', 72);

  // ── Attelage haute pression (N2) ──
  row({ x: 1.615, n: 40, chord: [0.03, 0.03], stag: [-0.25, -0.25], cam: [0.04, 0.04], tr: 0.08, mat: MAT.hpcS, group: ST, info: 'hpc' });
  for (let i = 0; i < 9; i++) {
    const x = 1.655 + i * 0.066;
    row({ x, n: 32 + 3 * i, chord: [0.034 - 0.0014 * i, 0.036 - 0.0014 * i], stag: [0.72, 0.98], cam: [0.06, 0.04], tr: 0.06, mat: MAT.hpc, group: N2, info: 'hpc', disk: { w: 0.03, bore: 0.085, mat: MAT.diskN2 } });
    row({ x: x + 0.033, n: 40 + 3 * i, chord: [0.03 - 0.0012 * i, 0.03 - 0.0012 * i], stag: [-0.45, -0.42], cam: [0.07, 0.06], tr: 0.07, mat: MAT.hpcS, group: ST, info: 'hpc' });
  }
  row({ x: 2.595, n: 42, hub: 0.25, tip: 0.302, chord: [0.042, 0.042], stag: [-0.85, -0.85], cam: [0.16, 0.16], tr: 0.18, mat: MAT.hptV, group: ST, info: 'ngv' });
  row({ x: 2.645, n: 64, hub: 0.252, tip: 0.301, chord: [0.032, 0.03], stag: [0.5, 0.62], cam: [-0.2, -0.16], tr: 0.16, mat: MAT.hpt, group: N2, info: 'hpt', disk: { w: 0.04, bore: 0.09, mat: MAT.diskN2 } });

  revolve(shell([[1.58, 0.07], [1.62, 0.10], [1.655, 0.16], [2.183, 0.17], [2.30, 0.13], [2.60, 0.12], [2.645, 0.12]], 0.01), MAT.shaftN2, N2, 'shaftN2', 72);

  // ── Chambre de combustion ──
  revolve(shell([[2.33, 0.33], [2.36, 0.35], [2.50, 0.35], [2.57, 0.305]], 0.006), MAT.liner, ST, 'combustor', 96);
  revolve(shell([[2.33, 0.275], [2.36, 0.258], [2.50, 0.258], [2.57, 0.25]], -0.006), MAT.liner, ST, 'combustor', 96);
  revolve(shell([[2.33, 0.275], [2.318, 0.288], [2.313, 0.303], [2.318, 0.318], [2.33, 0.33]], -0.005), MAT.liner, ST, 'combustor', 96);
  const flame = add(new THREE.Mesh(latheGeo(closed([
    [2.335, 0.285], [2.335, 0.322], [2.40, 0.342], [2.50, 0.343], [2.565, 0.30], [2.565, 0.256], [2.50, 0.262], [2.40, 0.263],
  ]), 96), flameMat), ST, 'combustor');
  flame.renderOrder = 2;

  (function injectors() {
    const geo = new THREE.CylinderGeometry(R(0.008), R(0.008), R(0.11), 10);
    geo.rotateZ(0.35);
    geo.translate(0, R(0.355), 0);
    const im = new THREE.InstancedMesh(geo, MAT.injector, 20);
    const d = new THREE.Object3D();
    for (let i = 0; i < 20; i++) {
      d.rotation.set((i / 20) * TAU, 0, 0);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.position.x = X(2.31);
    add(im, ST, 'fuel');
  })();

  const flameLight = new THREE.PointLight(col(0xff7a33), 1, R(0.8), 2);
  flameLight.position.set(X(2.45), 0, 0);
  ST.add(flameLight);

  // ════════════════ Écoulement ════════════════
  const COLD = col(0x7ec8e3);
  const CORE_STOPS = [
    [0.0, 0x7ec8e3], [1.0, 0x9fd6e8], [1.6, 0xcfe6ee], [2.2, 0xffe9c8], [2.33, 0xffc640], [2.45, 0xff6a10],
    [2.6, 0xff4a10], [2.8, 0xff8a30], [3.1, 0xffb060], [3.6, 0xc8a890], [4.8, 0x2a2624],
  ].map(([x, h]) => [x, col(h)]);

  function coreColor(x, out, heat) {
    let a = CORE_STOPS[0], b = CORE_STOPS[CORE_STOPS.length - 1];
    for (let i = 0; i < CORE_STOPS.length - 1; i++) {
      if (x <= CORE_STOPS[i + 1][0]) { a = CORE_STOPS[i]; b = CORE_STOPS[i + 1]; break; }
    }
    const t = Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0] || 1)));
    out.copy(a[1]).lerp(b[1], t);
    if (x > 2.3) out.multiplyScalar(0.45 + 0.55 * heat);
    return out.multiplyScalar(edgeFade(x, 0.3, 4.6));
  }
  function edgeFade(x, x0, x1) {
    return Math.max(0, Math.min(1, (x - x0) / 0.25, (x1 - x) / 0.9));
  }
  function bypassColor(x, out) {
    return out.copy(COLD).multiplyScalar(edgeFade(x, -0.15, 3.8));
  }

  function flow(n, inner, outer, x0, x1, xRef, colorFn, hotBoost) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), clr = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.065, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false;
    engine.add(pts);
    const aRef = outer(xRef) ** 2 - inner(xRef) ** 2;
    // Particules limitées au quart retiré par la coupe (y > 0, z > 0) : elles y restent visibles, non découpées
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push({ x: lerp(x0, x1, Math.random()), f: 0.06 + 0.88 * Math.random(), a: 0.06 + Math.random() * (Math.PI / 2 - 0.12), j: 0.8 + 0.4 * Math.random() });
    }
    return { pts, geo, pos, clr, parts, inner, outer, x0, x1, aRef, colorFn, hotBoost };
  }

  const bypassFlow = flow(700, bypInAt, bypOutAt, -0.15, 3.8, 1.0, (x, o) => bypassColor(x, o), 0);
  const coreFlow = flow(600, hubAt, coreOutAt, 0.3, 4.6, 0.9, null, 1.4);

  const tmpC = new THREE.Color();
  function stepFlow(F, dt, speed, heat) {
    for (let i = 0; i < F.parts.length; i++) {
      const p = F.parts[i];
      const ri = F.inner(p.x), ro = F.outer(p.x);
      const area = Math.max(ro * ro - ri * ri, 0.004);
      let v = Math.min(3.2, Math.max(0.35, F.aRef / area));
      if (F.hotBoost && p.x > 2.4) v *= 1 + F.hotBoost * heat;
      p.x += 0.45 * v * speed * p.j * dt;
      if (p.x > F.x1) p.x = F.x0 + Math.random() * 0.05;
      const r = R(lerp(ri, ro, p.f));
      F.pos[i * 3] = X(p.x);
      F.pos[i * 3 + 1] = Math.cos(p.a) * r;
      F.pos[i * 3 + 2] = Math.sin(p.a) * r;
      const c = F.colorFn ? F.colorFn(p.x, tmpC) : coreColor(p.x, tmpC, heat);
      F.clr[i * 3] = c.r; F.clr[i * 3 + 1] = c.g; F.clr[i * 3 + 2] = c.b;
    }
    F.geo.attributes.position.needsUpdate = true;
    F.geo.attributes.color.needsUpdate = true;
  }

  // ════════════════ Étiquettes ════════════════
  // dx/dy : décalage écran (px) du texte par rapport au point d'ancrage, relié par une ligne de rappel
  const LABELS = [
    { t: 'Nacelle', x: 0.5, r: 0.91, a: 0.02, dx: -40, dy: -38, internal: false },
    { t: 'Soufflante', x: 0.80, r: 0.60, dx: -70, dy: 0, internal: true },
    { t: 'Booster', x: 1.18, r: 0.34, dx: -55, dy: 48, internal: true },
    { t: 'Flux secondaire', x: 1.85, r: 0.64, dx: -10, dy: -52, internal: true },
    { t: 'Compresseur HP', x: 1.92, r: 0.25, dx: -30, dy: 70, internal: true },
    { t: 'Chambre de combustion', x: 2.44, r: 0.31, dx: 10, dy: -78, internal: true },
    { t: 'Turbine HP', x: 2.64, r: 0.28, dx: 20, dy: 78, internal: true },
    { t: 'Turbine BP', x: 2.92, r: 0.34, dx: 60, dy: -48, internal: true },
    { t: 'Tuyère primaire', x: 3.35, r: 0.40, a: 0.02, dx: 55, dy: 40, internal: false },
  ].map((l) => {
    const el = document.createElement('div');
    el.className = 'eng-label';
    const line = document.createElement('span');
    line.className = 'lbl-line';
    const len = Math.hypot(l.dx, l.dy);
    line.style.width = len + 'px';
    line.style.transform = `rotate(${Math.atan2(l.dy, l.dx)}rad)`;
    const txt = document.createElement('span');
    txt.className = 'lbl-text' + (l.dx < 0 ? ' lbl-left' : '');
    txt.textContent = l.t;
    txt.style.left = l.dx + 'px';
    txt.style.top = l.dy + 'px';
    const dot = document.createElement('span');
    dot.className = 'lbl-dot';
    el.append(line, dot, txt);
    labelLayer.appendChild(el);
    const a = l.a !== undefined ? l.a : Math.PI / 4;
    return Object.assign(l, { el, p: new THREE.Vector3(X(l.x), R(l.r) * Math.cos(a), R(l.r) * Math.sin(a)) });
  });
  let showLabels = true;
  const proj = new THREE.Vector3();
  function updateLabels(w, h) {
    for (const l of LABELS) {
      const visible = showLabels && (!l.internal || cutaway);
      if (!visible) { l.el.style.display = 'none'; continue; }
      proj.copy(l.p).project(camera);
      if (proj.z > 1 || proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = 'block';
      l.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px)`;
    }
  }

  // ════════════════ Interface ════════════════
  const $ = (id) => document.getElementById(id);
  const throttleEl = $('throttle');
  const throttleVal = $('throttle-val');
  const partInfoEl = $('part-info');
  const OUT = {
    n1: $('instr-n1'), n1rpm: $('instr-n1rpm'), n2: $('instr-n2'), n2rpm: $('instr-n2rpm'),
    egt: $('instr-egt'), ff: $('instr-ff'), thrust: $('instr-thrust'), opr: $('instr-opr'),
  };

  function setThrottle(v) {
    st.throttle = v;
    throttleEl.value = v;
    throttleVal.textContent = v === 0 ? 'Ralenti' : Math.round(v) + ' %';
  }
  throttleEl.addEventListener('input', () => setThrottle(parseFloat(throttleEl.value)));
  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => setThrottle(parseFloat(b.dataset.preset)));
  });
  setThrottle(parseFloat(throttleEl.value));

  $('toggle-cutaway').addEventListener('change', (e) => setCutaway(e.target.checked));
  $('toggle-flow').addEventListener('change', (e) => {
    bypassFlow.pts.visible = e.target.checked;
    coreFlow.pts.visible = e.target.checked;
  });
  $('toggle-labels').addEventListener('change', (e) => { showLabels = e.target.checked; });
  $('toggle-colors').addEventListener('change', (e) => {
    setColorMode(e.target.checked);
    $('legend').classList.toggle('legend-dim', !e.target.checked);
  });
  $('toggle-autorotate').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; });
  $('reset-view').addEventListener('click', () => {
    camera.position.copy(CAM_START);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  // Sélection d'une pièce
  let selected = null;
  function renderInfo() {
    if (!selected) return;
    const info = INFO[selected];
    partInfoEl.innerHTML = '';
    const t = document.createElement('div'); t.className = 'pi-title'; t.textContent = info.name;
    const d = document.createElement('div'); d.className = 'pi-desc'; d.textContent = info.desc;
    partInfoEl.append(t, d);
    if (info.live) {
      const l = document.createElement('div'); l.className = 'pi-live'; l.textContent = info.live();
      partInfoEl.appendChild(l);
    }
  }
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const rect = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const h of hits) {
      if (cutaway && h.point.y > 0 && h.point.z > 0) continue; // zone retirée par la coupe
      selected = h.object.userData.info;
      renderInfo();
      return;
    }
  });

  // ── Redimensionnement ──
  let vw = 0, vh = 0;
  function resize() {
    vw = viewport.clientWidth; vh = viewport.clientHeight;
    if (!vw || !vh) return;
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    renderer.setSize(vw, vh, false);
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(viewport);
  resize();
  if (loadingEl) loadingEl.style.display = 'none';

  // ════════════════ Modèle de fonctionnement ════════════════
  // Réponse d'attelage du 1er ordre : N2 réagit plus vite que N1 (inertie plus faible)
  function updateEngine(dt) {
    const t = st.throttle / 100;
    const n1T = 21 + 77 * Math.pow(t, 1.1);
    const n2T = 62 + 36 * Math.pow(t, 0.65);
    st.n2 += (n2T - st.n2) * Math.min(1, dt / 1.1);
    st.n1 += (n1T - st.n1) * Math.min(1, dt / 1.9);
    const egtT = 450 + 440 * Math.pow(t, 1.3);
    st.egt += (egtT - st.egt) * Math.min(1, dt / 1.5);
    const ffT = 320 + 4300 * Math.pow(t, 1.7);
    st.ff += (ffT - st.ff) * Math.min(1, dt / 0.6);
    st.thrust = ENG.thrustMax * Math.pow(st.n1 / 98, 2.1);
    st.opr = 1 + (ENG.oprMax - 1) * Math.pow(Math.max(0, (st.n2 - 45) / 53), 2.2);
    st.t4 = 800 + 650 * Math.pow(Math.max(0, (st.egt - 450) / 440), 1.1);

    OUT.n1.textContent = st.n1.toFixed(1) + ' %';
    OUT.n1rpm.textContent = fmt(st.n1 / 100 * ENG.n1Max) + ' tr/min';
    OUT.n2.textContent = st.n2.toFixed(1) + ' %';
    OUT.n2rpm.textContent = fmt(st.n2 / 100 * ENG.n2Max) + ' tr/min';
    OUT.egt.textContent = fmt(st.egt) + ' °C';
    OUT.ff.textContent = fmt(st.ff) + ' kg/h';
    OUT.thrust.textContent = st.thrust.toFixed(1).replace('.', ',') + ' kN';
    OUT.opr.textContent = st.opr.toFixed(1).replace('.', ',');
  }

  // Rotation visuelle ralentie ×256 en conservant le rapport réel N2/N1
  const VIS = 2.2 / ENG.n1Max;
  const clock = new THREE.Clock();
  let infoTimer = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    updateEngine(dt);

    N1.rotation.x -= (st.n1 / 100) * ENG.n1Max * VIS * dt;
    N2.rotation.x -= (st.n2 / 100) * ENG.n2Max * VIS * dt;

    const heat = Math.max(0, (st.egt - 450) / 440);
    flameMat.opacity = 0.18 + 0.5 * heat;
    flameMat.color.copy(col(0xff5a10)).lerp(col(0xffd070), heat * 0.6);
    flameLight.intensity = 0.4 + 2.4 * heat;

    if (bypassFlow.pts.visible) {
      const speed = 0.3 + 1.1 * (st.n1 / 100);
      stepFlow(bypassFlow, dt, speed, heat);
      stepFlow(coreFlow, dt, speed, heat);
    }

    infoTimer += dt;
    if (infoTimer > 0.25 && selected && INFO[selected].live) { infoTimer = 0; renderInfo(); }

    controls.update();
    renderer.render(scene, camera);
    updateLabels(vw, vh);
  }
  animate();
})();
