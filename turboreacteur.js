(function () {
  if (!sessionStorage.getItem('loggedIn')) {
    window.location.href = 'index.html';
  }

  if (typeof THREE === 'undefined') {
    const loading = document.getElementById('viewport-loading');
    if (loading) loading.textContent = "Impossible de charger le moteur 3D (bibliothèque non disponible).";
    return;
  }

  const viewport = document.getElementById('engine-viewport');
  const canvas = document.getElementById('engine-canvas');
  const loadingEl = document.getElementById('viewport-loading');

  // ── Descriptions des composants ──
  const INFO = {
    spinner:   { name: 'Cône d\'entrée (spinner)', desc: 'Dévie l\'air entrant vers les aubes de la soufflante et empêche l\'accumulation de glace. Tourne avec l\'arbre N1.' },
    fan:       { name: 'Soufflante (Fan)', desc: 'Stade unique de grand diamètre, solidaire de l\'arbre basse pression (N1). Génère la majorité de la poussée via le flux secondaire (bypass).' },
    booster:   { name: 'Compresseur basse pression (Booster)', desc: '2 étages solidaires de la soufflante sur l\'arbre N1. Précomprime l\'air primaire avant le compresseur haute pression.' },
    hpc:       { name: 'Compresseur haute pression (HPC)', desc: '4 étages sur l\'arbre haute pression (N2), qui tourne plus vite que N1. Élève fortement la pression avant la combustion.' },
    combustor: { name: 'Chambre de combustion', desc: 'Le carburant est injecté en continu et brûlé dans le flux d\'air comprimé. Chambre annulaire fixe — ne tourne pas.' },
    hpt:       { name: 'Turbine haute pression (HPT)', desc: 'Extrait l\'énergie des gaz chauds pour entraîner le compresseur HP via l\'arbre N2.' },
    lpt:       { name: 'Turbine basse pression (LPT)', desc: 'Plusieurs étages qui entraînent la soufflante et le booster via l\'arbre N1, concentrique et interne à l\'arbre N2.' },
    shaftN1:   { name: 'Arbre basse pression (N1)', desc: 'Relie soufflante + booster à la turbine BP. Tourne à l\'intérieur de l\'arbre haute pression sur toute sa longueur.' },
    shaftN2:   { name: 'Arbre haute pression (N2)', desc: 'Arbre court reliant le compresseur HP à la turbine HP. Tourne toujours plus vite que l\'arbre N1.' },
    nacelle:   { name: 'Nacelle (carénage externe)', desc: 'Carénage aérodynamique externe qui guide le flux secondaire (froid) autour du noyau du moteur.' },
    corecowl:  { name: 'Carénage du noyau', desc: 'Sépare le flux secondaire (bypass, froid) du flux primaire qui traverse le cœur chaud du moteur.' },
    tailcone:  { name: 'Cône d\'échappement', desc: 'Referme l\'arrière du moteur et guide les gaz d\'échappement pour minimiser la traînée aérodynamique.' },
  };

  // ── Scene / camera / renderer ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(8.5, 3.6, 9.5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 26;
  controls.target.set(-1, 0, 0);
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.1;

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x404850, 1.1));
  const hemi = new THREE.HemisphereLight(0x6a8a9a, 0x0a0f0a, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(6, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb8d0, 0.4);
  rim.position.set(-8, 3, -6);
  scene.add(rim);

  // ── Clipping plane (vue en coupe) ──
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  renderer.clippingPlanes = [clipPlane]; // cutaway ON by default

  // ── Groups ──
  const engineRoot = new THREE.Group();
  scene.add(engineRoot);
  const staticGroup = new THREE.Group();
  const spoolN1 = new THREE.Group(); // fan + booster + LPT
  const spoolN2 = new THREE.Group(); // HPC + HPT
  engineRoot.add(staticGroup, spoolN1, spoolN2);

  function lerp(a, b, t) { return a + (b - a) * t; }
  function piecewise(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x >= a[0] && x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
    }
    return pts[pts.length - 1][1];
  }

  const coreOuterPts = [[-6.6, 1.9], [-4.4, 1.35], [-2.6, 1.15], [-1.15, 1.15], [0.2, 1.3], [1.2, 1.62], [1.5, 1.62], [3.0, 0.55]];
  const bypassOuterPts = [[-7.0, 3.35], [-6.3, 3.35], [5.7, 3.05]];
  function coreOuterAt(x) { return piecewise(coreOuterPts, x); }
  function bypassOuterAt(x) { return piecewise(bypassOuterPts, x); }

  // ── Stage builder (InstancedMesh blades + hub) ──
  function buildStage(cfg, spoolGroup, infoKey) {
    const bladeLen = cfg.tipR - cfg.hubR;
    const bladeGeom = new THREE.BoxGeometry(cfg.thickness, bladeLen, cfg.chord);
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, metalness: 0.55, roughness: 0.45 });
    const inst = new THREE.InstancedMesh(bladeGeom, mat, cfg.count);
    const dummy = new THREE.Object3D();
    const r = cfg.hubR + bladeLen / 2;
    for (let i = 0; i < cfg.count; i++) {
      const angle = (i / cfg.count) * Math.PI * 2;
      dummy.position.set(0, Math.cos(angle) * r, Math.sin(angle) * r);
      dummy.rotation.set(angle, 0, cfg.pitch);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.position.x = cfg.x;
    inst.userData.info = INFO[infoKey];

    const hubGeom = new THREE.CylinderGeometry(cfg.hubR, cfg.hubR, cfg.thickness * 1.6, 24);
    hubGeom.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeom, new THREE.MeshStandardMaterial({ color: 0x54545c, metalness: 0.7, roughness: 0.35 }));
    hub.position.x = cfg.x;
    hub.userData.info = INFO[infoKey];

    spoolGroup.add(inst, hub);
    return inst;
  }

  // ── Spinner ──
  const spinnerGeom = new THREE.ConeGeometry(0.85, 1.3, 24);
  spinnerGeom.rotateZ(Math.PI / 2);
  const spinner = new THREE.Mesh(spinnerGeom, new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.75, roughness: 0.3 }));
  spinner.position.x = -6.55;
  spinner.userData.info = INFO.spinner;
  spoolN1.add(spinner);

  // ── N1 spool: fan + booster (2 stages) + LPT (3 stages) ──
  buildStage({ x: -6.3, hubR: 0.85, tipR: 3.3, count: 18, thickness: 0.5, chord: 1.0, pitch: 0.25, color: 0x4fc3c7 }, spoolN1, 'fan');
  buildStage({ x: -5.5, hubR: 0.80, tipR: 1.55, count: 22, thickness: 0.22, chord: 0.5, pitch: 0.30, color: 0x6f8fae }, spoolN1, 'booster');
  buildStage({ x: -5.0, hubR: 0.78, tipR: 1.45, count: 22, thickness: 0.22, chord: 0.5, pitch: 0.30, color: 0x6f8fae }, spoolN1, 'booster');

  buildStage({ x: 0.20, hubR: 0.62, tipR: 1.22, count: 22, thickness: 0.26, chord: 0.6, pitch: 0.40, color: 0xf0a830 }, spoolN1, 'lpt');
  buildStage({ x: 0.70, hubR: 0.60, tipR: 1.38, count: 22, thickness: 0.26, chord: 0.6, pitch: 0.40, color: 0xf0a830 }, spoolN1, 'lpt');
  buildStage({ x: 1.20, hubR: 0.58, tipR: 1.52, count: 24, thickness: 0.26, chord: 0.6, pitch: 0.40, color: 0xf0a830 }, spoolN1, 'lpt');

  // ── N2 spool: HPC (4 stages) + HPT (2 stages) ──
  buildStage({ x: -4.4, hubR: 0.75, tipR: 1.30, count: 26, thickness: 0.20, chord: 0.42, pitch: 0.28, color: 0x9a9a9a }, spoolN2, 'hpc');
  buildStage({ x: -3.9, hubR: 0.72, tipR: 1.15, count: 26, thickness: 0.20, chord: 0.42, pitch: 0.28, color: 0x9a9a9a }, spoolN2, 'hpc');
  buildStage({ x: -3.4, hubR: 0.68, tipR: 1.02, count: 28, thickness: 0.18, chord: 0.38, pitch: 0.28, color: 0x9a9a9a }, spoolN2, 'hpc');
  buildStage({ x: -2.95, hubR: 0.64, tipR: 0.92, count: 28, thickness: 0.18, chord: 0.38, pitch: 0.28, color: 0x9a9a9a }, spoolN2, 'hpc');

  buildStage({ x: -0.75, hubR: 0.62, tipR: 0.98, count: 20, thickness: 0.22, chord: 0.5, pitch: 0.38, color: 0xe85d3f }, spoolN2, 'hpt');
  buildStage({ x: -0.30, hubR: 0.64, tipR: 1.08, count: 20, thickness: 0.22, chord: 0.5, pitch: 0.38, color: 0xe85d3f }, spoolN2, 'hpt');

  // ── Shafts ──
  function buildShaft(x0, x1, r, color) {
    const geom = new THREE.CylinderGeometry(r, r, x1 - x0, 20);
    geom.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3 }));
    mesh.position.x = (x0 + x1) / 2;
    return mesh;
  }
  const shaftN1 = buildShaft(-6.1, 1.55, 0.14, 0xb8c4d0);
  shaftN1.userData.info = INFO.shaftN1;
  spoolN1.add(shaftN1);
  const shaftN2 = buildShaft(-4.55, -0.05, 0.24, 0xd4af37);
  shaftN2.userData.info = INFO.shaftN2;
  spoolN2.add(shaftN2);

  // ── Combustor ──
  const combCaseGeom = new THREE.CylinderGeometry(1.16, 1.16, 1.45, 32, 1, true);
  combCaseGeom.rotateZ(Math.PI / 2);
  const combCase = new THREE.Mesh(combCaseGeom, new THREE.MeshStandardMaterial({ color: 0x2e2e2e, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }));
  combCase.position.x = -1.875;
  combCase.userData.info = INFO.combustor;
  staticGroup.add(combCase);

  const flameGeom = new THREE.CylinderGeometry(0.78, 0.78, 1.0, 28, 1, true);
  flameGeom.rotateZ(Math.PI / 2);
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0x552200, emissive: 0xff5522, emissiveIntensity: 0.8,
    side: THREE.DoubleSide, transparent: true, opacity: 0.9,
  });
  const flame = new THREE.Mesh(flameGeom, flameMat);
  flame.position.x = -1.85;
  flame.userData.info = INFO.combustor;
  staticGroup.add(flame);

  const flameLight = new THREE.PointLight(0xff6a33, 1.2, 6, 2);
  flameLight.position.set(-1.85, 0, 0);
  staticGroup.add(flameLight);

  // ── Core cowls (front + rear, tapered, translucent) ──
  function buildTaperedDuct(x0, x1, r0, r1, color, opacity) {
    const geom = new THREE.CylinderGeometry(r1, r0, x1 - x0, 40, 1, true);
    geom.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide,
      metalness: 0.2, roughness: 0.6, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.x = (x0 + x1) / 2;
    return mesh;
  }
  const coreCowlFront = buildTaperedDuct(-6.6, -2.6, 1.9, 1.16, 0x707070, 0.28);
  coreCowlFront.userData.info = INFO.corecowl;
  staticGroup.add(coreCowlFront);
  const coreCowlRear = buildTaperedDuct(-1.15, 1.5, 1.16, 1.62, 0x707070, 0.24);
  coreCowlRear.userData.info = INFO.corecowl;
  staticGroup.add(coreCowlRear);

  // ── Nacelle ──
  const nacelle = buildTaperedDuct(-7.0, 5.7, 3.35, 3.05, 0x8fb8d0, 0.13);
  nacelle.userData.info = INFO.nacelle;
  staticGroup.add(nacelle);

  // ── Rear exhaust case + tailcone ──
  const exhaustCase = buildTaperedDuct(1.5, 3.0, 1.62, 0.55, 0x555555, 1.0);
  exhaustCase.material.transparent = false;
  exhaustCase.material.opacity = 1;
  exhaustCase.userData.info = INFO.tailcone;
  staticGroup.add(exhaustCase);

  const tailconeGeom = new THREE.ConeGeometry(0.55, 1.0, 24);
  tailconeGeom.rotateZ(-Math.PI / 2);
  const tailcone = new THREE.Mesh(tailconeGeom, new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6, roughness: 0.4 }));
  tailcone.position.x = 3.5;
  tailcone.userData.info = INFO.tailcone;
  staticGroup.add(tailcone);

  // ── Airflow particles ──
  function makeParticles(count) {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.065, vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geom, mat);
  }

  const BYPASS_X0 = -6.9, BYPASS_X1 = 5.6;
  const CORE_X0 = -6.3, CORE_X1 = 3.3;
  const bypassCount = 480, coreCount = 380;
  const bypassPts = makeParticles(bypassCount);
  const corePts = makeParticles(coreCount);
  engineRoot.add(bypassPts, corePts);

  const bypassData = [];
  const corePos = bypassPts.geometry.attributes.position;
  for (let i = 0; i < bypassCount; i++) {
    const x = lerp(BYPASS_X0, BYPASS_X1, Math.random());
    const outer = bypassOuterAt(x) - 0.15;
    const inner = coreOuterAt(x) + 0.2;
    const rad = lerp(Math.max(inner, 0.3), Math.max(outer, inner + 0.3), Math.random());
    const ang = Math.random() * Math.PI * 2;
    bypassData.push({ x, rad, ang, speed: 1.6 + Math.random() * 0.8 });
    corePos.setXYZ(i, x, Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  const bypassColor = bypassPts.geometry.attributes.color;
  for (let i = 0; i < bypassCount; i++) bypassColor.setXYZ(i, 0.49, 0.78, 0.89);
  bypassColor.needsUpdate = true;

  const coreData = [];
  const corePosAttr = corePts.geometry.attributes.position;
  for (let i = 0; i < coreCount; i++) {
    const x = lerp(CORE_X0, CORE_X1, Math.random());
    const outer = Math.max(coreOuterAt(x) * 0.8, 0.25);
    const rad = Math.random() * outer;
    const ang = Math.random() * Math.PI * 2;
    coreData.push({ x, rad, ang, speed: 1.9 + Math.random() * 0.9 });
    corePosAttr.setXYZ(i, x, Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  const coreColorAttr = corePts.geometry.attributes.color;

  const tmpColor = new THREE.Color();
  const coreGradient = [
    { x: -6.3, c: 0x7ec8e3 },
    { x: -2.6, c: 0xdfe8ee },
    { x: -1.5, c: 0xffcf4d },
    { x: -0.7, c: 0xff8a3d },
    { x: 0.8, c: 0xffb060 },
    { x: 2.0, c: 0xd8d0c8 },
    { x: 3.3, c: 0x9a9690 },
  ];
  function colorAt(x) {
    for (let i = 0; i < coreGradient.length - 1; i++) {
      const a = coreGradient[i], b = coreGradient[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x);
        const ca = new THREE.Color(a.c), cb = new THREE.Color(b.c);
        return ca.lerp(cb, t);
      }
    }
    return new THREE.Color(x < coreGradient[0].x ? coreGradient[0].c : coreGradient[coreGradient.length - 1].c);
  }

  // ── UI elements ──
  const throttleEl = document.getElementById('throttle');
  const throttleVal = document.getElementById('throttle-val');
  const n1El = document.getElementById('instr-n1');
  const n2El = document.getElementById('instr-n2');
  const egtEl = document.getElementById('instr-egt');
  const thrustEl = document.getElementById('instr-thrust');
  const cutawayToggle = document.getElementById('toggle-cutaway');
  const flowToggle = document.getElementById('toggle-flow');
  const autorotateToggle = document.getElementById('toggle-autorotate');
  const resetBtn = document.getElementById('reset-view');
  const partInfoEl = document.getElementById('part-info');

  let throttle = parseFloat(throttleEl.value);
  let n1 = 55, n2 = 65, egt = 350, thrust = 0;
  let n1Speed = 0, n2Speed = 0;

  throttleEl.addEventListener('input', () => {
    throttle = parseFloat(throttleEl.value);
    throttleVal.textContent = throttle.toFixed(0) + ' %';
  });
  cutawayToggle.addEventListener('change', () => {
    renderer.clippingPlanes = cutawayToggle.checked ? [clipPlane] : [];
  });
  flowToggle.addEventListener('change', () => {
    bypassPts.visible = flowToggle.checked;
    corePts.visible = flowToggle.checked;
  });
  autorotateToggle.addEventListener('change', () => {
    controls.autoRotate = autorotateToggle.checked;
  });
  const initialCamPos = camera.position.clone();
  resetBtn.addEventListener('click', () => {
    camera.position.copy(initialCamPos);
    controls.target.set(-1, 0, 0);
    controls.update();
  });

  // ── Raycasting: click to identify a part ──
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  function onCanvasClick(evt) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(engineRoot.children, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData.info) obj = obj.parent;
      if (obj && obj.userData.info) {
        showInfo(obj.userData.info);
        return;
      }
    }
  }
  function showInfo(info) {
    partInfoEl.innerHTML =
      '<div class="pi-title">' + info.name + '</div>' +
      '<div class="pi-desc">' + info.desc + '</div>';
  }
  canvas.addEventListener('click', onCanvasClick);

  // ── Resize ──
  function resize() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();
  if (loadingEl) loadingEl.style.display = 'none';

  // ── Animation loop ──
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    const n1Target = 55 + 0.45 * throttle;
    const n2Target = 65 + 0.35 * throttle;
    n1 += (n1Target - n1) * Math.min(1, delta * 1.4);
    n2 += (n2Target - n2) * Math.min(1, delta * 1.4);
    const egtTarget = 350 + 3.0 * throttle;
    egt += (egtTarget - egt) * Math.min(1, delta * 1.1);
    thrust += (throttle - thrust) * Math.min(1, delta * 1.7);

    n1El.textContent = n1.toFixed(1) + ' %';
    n2El.textContent = n2.toFixed(1) + ' %';
    egtEl.textContent = Math.round(egt) + ' °C';
    thrustEl.textContent = thrust.toFixed(0) + ' %';

    n1Speed = (n1 / 100) * 3.0;
    n2Speed = (n2 / 100) * 4.6;
    spoolN1.rotation.x += n1Speed * delta;
    spoolN2.rotation.x += n2Speed * delta;

    const heat = throttle / 100;
    flameMat.emissiveIntensity = 0.5 + heat * 1.8;
    flameLight.intensity = 0.6 + heat * 2.5;

    if (flowToggle.checked) {
      const flowMul = 0.5 + heat * 1.3;
      for (let i = 0; i < bypassCount; i++) {
        const p = bypassData[i];
        p.x += p.speed * flowMul * delta;
        if (p.x > BYPASS_X1) p.x = BYPASS_X0;
        corePos.setXYZ(i, p.x, Math.cos(p.ang) * p.rad, Math.sin(p.ang) * p.rad);
      }
      corePos.needsUpdate = true;

      for (let i = 0; i < coreCount; i++) {
        const p = coreData[i];
        p.x += p.speed * flowMul * delta;
        if (p.x > CORE_X1) p.x = CORE_X0;
        corePosAttr.setXYZ(i, p.x, Math.cos(p.ang) * p.rad, Math.sin(p.ang) * p.rad);
        const c = colorAt(p.x);
        coreColorAttr.setXYZ(i, c.r, c.g, c.b);
      }
      corePosAttr.needsUpdate = true;
      coreColorAttr.needsUpdate = true;
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();
})();
