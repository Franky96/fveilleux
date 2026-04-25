// === SÉCURITÉ ===
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
const userRole = sessionStorage.getItem('userRole');
if (!sessionStorage.getItem('loggedIn') || (userRole !== 'admin' && !permissions.includes('osint'))) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

// ─────────────────────────────────────────────
// CARTE
// ─────────────────────────────────────────────
const map = L.map('map', {
  center: [30, 0],
  zoom: 2,
  zoomControl: true,
  preferCanvas: true,
  renderer: L.canvas(),
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright" style="color:#80cc80">OpenStreetMap</a> © <a href="https://carto.com/attributions" style="color:#80cc80">CARTO</a>',
  maxZoom: 19,
  subdomains: 'abcd',
}).addTo(map);

// ─────────────────────────────────────────────
// CANVAS OVERLAY (avions + satellites)
// Rendu direct sur <canvas> — zéro éléments DOM par marqueur
// ─────────────────────────────────────────────
const mapEl = map.getContainer();

function creerCanvas(zIndex) {
  const c = document.createElement('canvas');
  Object.assign(c.style, {
    position: 'absolute', top: '0', left: '0',
    pointerEvents: 'none', zIndex: String(zIndex),
  });
  mapEl.appendChild(c);
  return c;
}

const cvSats   = creerCanvas(410);
const cvAvions = creerCanvas(420);

function redimensionnerCanvas() {
  const sz = map.getSize();
  cvAvions.width  = cvSats.width  = sz.x;
  cvAvions.height = cvSats.height = sz.y;
}
redimensionnerCanvas();
map.on('resize', redimensionnerCanvas);

// RAF-throttle pour éviter les redraws excessifs lors du pan/zoom
let rafPending = false;
function scheduleRedraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    redimensionnerCanvas();
    dessinerAvions();
    dessinerSatellites();
  });
}
map.on('move moveend zoom zoomend', scheduleRedraw);

// ─────────────────────────────────────────────
// COUCHES LEAFLET (ISS + séismes seulement)
// ─────────────────────────────────────────────
const layerISS     = L.layerGroup().addTo(map);
const layerSeismes = L.layerGroup().addTo(map);

// ─────────────────────────────────────────────
// ÉTAT GLOBAL
// ─────────────────────────────────────────────
let avionStates  = [];   // tableau brut OpenSky
let satPositions = [];   // [{name, lat, lng, alt}] calculé par satellite.js
let tleSatellites = [];  // [{name, satrec}]
let avionsCount  = 0;
let showAvions   = true;
let showSats     = true;

// ─────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────
function spinStop(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function setBadge(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  const spin = el.querySelector('.dot-spin');
  el.textContent = text;
  if (spin) el.appendChild(spin);
  el.className = 'osint-badge' + (cls ? ' ' + cls : '');
}

// ─────────────────────────────────────────────
// DESSIN AVIONS — canvas HTML2D
// Triangle orienté par cap, viewport culling
// ─────────────────────────────────────────────
function dessinerAvions() {
  const ctx = cvAvions.getContext('2d');
  ctx.clearRect(0, 0, cvAvions.width, cvAvions.height);
  if (!showAvions || !avionStates.length) return;

  const W = cvAvions.width, H = cvAvions.height;
  const PAD = 20;

  for (const s of avionStates) {
    const lon = s[5], lat = s[6];
    if (lat == null || lon == null) continue;

    const pt = map.latLngToContainerPoint([lat, lon]);
    if (pt.x < -PAD || pt.x > W + PAD || pt.y < -PAD || pt.y > H + PAD) continue;

    const hdg      = ((s[10] || 0) * Math.PI) / 180;
    const onGround = s[8];

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(hdg);
    ctx.fillStyle   = onGround ? '#557766' : '#60b8c8';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo( 0, -6);   // nez
    ctx.lineTo(-3.5, 5);  // aile gauche
    ctx.lineTo( 0,   3);  // queue centre
    ctx.lineTo( 3.5, 5);  // aile droite
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
// DESSIN SATELLITES — canvas HTML2D
// Petits points, viewport culling
// ─────────────────────────────────────────────
function dessinerSatellites() {
  const ctx = cvSats.getContext('2d');
  ctx.clearRect(0, 0, cvSats.width, cvSats.height);
  if (!showSats || !satPositions.length) return;

  const W = cvSats.width, H = cvSats.height;
  const PAD = 6;

  ctx.fillStyle   = '#d4892a';
  ctx.globalAlpha = 0.82;

  for (const sat of satPositions) {
    const pt = map.latLngToContainerPoint([sat.lat, sat.lng]);
    if (pt.x < -PAD || pt.x > W + PAD || pt.y < -PAD || pt.y > H + PAD) continue;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─────────────────────────────────────────────
// CLIC SUR LA CARTE — détection de proximité
// ─────────────────────────────────────────────
map.on('click', function(e) {
  const clickPt = map.latLngToContainerPoint(e.latlng);

  // Avions (rayon 14px)
  if (showAvions && avionStates.length) {
    let best = null, bestD = 14 * 14;
    for (const s of avionStates) {
      if (s[5] == null || s[6] == null) continue;
      const pt = map.latLngToContainerPoint([s[6], s[5]]);
      const d  = (pt.x - clickPt.x) ** 2 + (pt.y - clickPt.y) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) {
      const callsign = (best[1] || '').trim() || 'N/A';
      const alt = best[7] != null ? Math.round(best[7]) + ' m' : '—';
      const spd = best[9] != null ? Math.round(best[9] * 3.6) + ' km/h' : '—';
      L.popup()
        .setLatLng([best[6], best[5]])
        .setContent(`
          <div class="popup-title">✈ ${callsign}</div>
          <div class="popup-row"><b>Pays :</b> ${best[2] || '—'}</div>
          <div class="popup-row"><b>Altitude :</b> ${alt}</div>
          <div class="popup-row"><b>Vitesse :</b> ${spd}</div>
          <div class="popup-row"><b>Cap :</b> ${Math.round(best[10] || 0)}°</div>
          <div class="popup-row"><b>Au sol :</b> ${best[8] ? 'Oui' : 'Non'}</div>
        `)
        .openOn(map);
      return;
    }
  }

  // Satellites (rayon 10px)
  if (showSats && satPositions.length) {
    let best = null, bestD = 10 * 10;
    for (const sat of satPositions) {
      const pt = map.latLngToContainerPoint([sat.lat, sat.lng]);
      const d  = (pt.x - clickPt.x) ** 2 + (pt.y - clickPt.y) ** 2;
      if (d < bestD) { bestD = d; best = sat; }
    }
    if (best) {
      L.popup()
        .setLatLng([best.lat, best.lng])
        .setContent(`
          <div class="popup-title">🛰 ${best.name}</div>
          <div class="popup-row"><b>Altitude :</b> ${best.alt} km</div>
          <div class="popup-row"><b>Lat :</b> ${best.lat.toFixed(2)}°</div>
          <div class="popup-row"><b>Lon :</b> ${best.lng.toFixed(2)}°</div>
        `)
        .openOn(map);
      return;
    }
  }
});

// ─────────────────────────────────────────────
// AVIONS — OpenSky Network (+ proxies + retry)
// ─────────────────────────────────────────────
const AVIONS_URLS = [
  'https://opensky-network.org/api/states/all',
  `https://api.allorigins.win/raw?url=${encodeURIComponent('https://opensky-network.org/api/states/all')}`,
  `https://api.cors.lol/?url=${encodeURIComponent('https://opensky-network.org/api/states/all')}`,
  `https://corsproxy.io/?url=${encodeURIComponent('https://opensky-network.org/api/states/all')}`,
  `https://proxy.cors.sh/https://opensky-network.org/api/states/all`,
];

async function chargerAvions() {
  for (const url of AVIONS_URLS) {
    for (let tentative = 0; tentative < 2; tentative++) {
      try {
        if (tentative > 0) await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          if (res.status === 503 && tentative === 0) continue;
          break;
        }
        let data = await res.json();
        if (data?.contents) data = JSON.parse(data.contents);
        const states = data?.states;
        if (Array.isArray(states) && states.length > 0) {
          avionStates = states;
          avionsCount = states.filter(s => s[5] != null && s[6] != null).length;
          document.getElementById('stat-avions').textContent = avionsCount.toLocaleString('fr-CA');
          document.getElementById('stat-update').textContent = new Date().toLocaleTimeString('fr-CA');
          setBadge('badge-avions', `✈ ${avionsCount.toLocaleString('fr-CA')} avions`, 'live');
          spinStop('spin-avions');
          dessinerAvions();
          return;
        }
        break;
      } catch (_) { break; }
    }
  }
  spinStop('spin-avions');
  if (avionsCount > 0) {
    setBadge('badge-avions', `✈ ${avionsCount.toLocaleString('fr-CA')} (hors-ligne)`, '');
  } else {
    setBadge('badge-avions', '✈ API indisponible', 'err');
  }
}

// ─────────────────────────────────────────────
// SATELLITES — SatNOGS (primaire) + CelesTrak (fallback) + satellite.js
// ─────────────────────────────────────────────
function parseTLE(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const sats = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      try {
        const satrec = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
        sats.push({ name: lines[i].replace(/^0\s+/, '').replace(/^\d+\s*/, '').trim(), satrec });
      } catch (_) {}
      i += 2;
    }
  }
  return sats;
}

function parseTLEJSON(data) {
  const sats = [];
  for (const item of data) {
    try {
      const name   = (item.tle0 || '').replace(/^0\s+/, '').trim() || `NORAD-${item.norad_cat_id}`;
      const satrec = satellite.twoline2satrec(item.tle1, item.tle2);
      sats.push({ name, satrec });
    } catch (_) {}
  }
  return sats;
}

function onTLELoaded(sats, source) {
  tleSatellites = sats;
  document.getElementById('stat-sats').textContent = sats.length.toLocaleString('fr-CA');
  setBadge('badge-sats', `🛰 ${sats.length.toLocaleString('fr-CA')} satellites`, 'live');
  spinStop('spin-sats');
  console.info(`[OSINT] TLE — ${source}: ${sats.length} satellites`);
}

const SATNOGS_URLS = [
  'https://db.satnogs.org/api/tle/?format=json',
  `https://api.allorigins.win/raw?url=${encodeURIComponent('https://db.satnogs.org/api/tle/?format=json')}`,
  `https://api.cors.lol/?url=${encodeURIComponent('https://db.satnogs.org/api/tle/?format=json')}`,
  `https://corsproxy.io/?url=${encodeURIComponent('https://db.satnogs.org/api/tle/?format=json')}`,
];

const CK_BASE_URLS = [
  'https://celestrak.org/satcat/satcat.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/SOCRATES/satcat.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/satcat/satcat.php?FORMAT=tle&STATUS=active',
];
const CK_TLE_URLS = [
  ...CK_BASE_URLS,
  ...CK_BASE_URLS.flatMap(u => [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    `https://proxy.cors.sh/${u}`,
  ]),
];

async function chargerTLE() {
  if (typeof satellite === 'undefined') {
    setBadge('badge-sats', '🛰 satellite.js non chargé', 'err');
    spinStop('spin-sats');
    return false;
  }

  for (const url of SATNOGS_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : (raw.results || raw.data || []);
      if (!arr.length) continue;
      const sats = parseTLEJSON(arr);
      if (sats.length > 0) { onTLELoaded(sats, 'SatNOGS'); return true; }
    } catch (_) {}
  }

  for (const url of CK_TLE_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes('1 ') || !text.includes('2 ')) continue;
      const sats = parseTLE(text);
      if (sats.length > 0) { onTLELoaded(sats, 'CelesTrak'); return true; }
    } catch (_) {}
  }

  setBadge('badge-sats', '🛰 Aucune source TLE', 'err');
  spinStop('spin-sats');
  return false;
}

// Propagation : calcule les positions dans un tableau, puis dessine sur canvas
function propagerSatellites() {
  if (!tleSatellites.length) return;
  if (typeof satellite === 'undefined') return;

  const now  = new Date();
  const gmst = satellite.gstime(now);
  satPositions = [];

  for (const sat of tleSatellites) {
    try {
      const pv = satellite.propagate(sat.satrec, now);
      if (!pv?.position) continue;
      const gd  = satellite.eciToGeodetic(pv.position, gmst);
      const lat = satellite.degreesLat(gd.latitude);
      const lng = satellite.degreesLong(gd.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;
      satPositions.push({ name: sat.name, lat, lng, alt: gd.height.toFixed(0) });
    } catch (_) {}
  }

  dessinerSatellites();
}

// ─────────────────────────────────────────────
// ISS — wheretheiss.at (marqueur Leaflet unique)
// ─────────────────────────────────────────────
const ISS_ICON = L.divIcon({
  html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 0 5px #80cc80);">🚀</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  className: '',
});

async function chargerISS() {
  try {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const { latitude: lat, longitude: lng, altitude, velocity } = d;

    layerISS.clearLayers();
    const marker = L.marker([lat, lng], { icon: ISS_ICON, zIndexOffset: 2000 });
    marker.bindPopup(`
      <div class="popup-title">🚀 Station Spatiale Internationale</div>
      <div class="popup-row"><b>Latitude :</b> ${lat.toFixed(4)}°</div>
      <div class="popup-row"><b>Longitude :</b> ${lng.toFixed(4)}°</div>
      <div class="popup-row"><b>Altitude :</b> ${altitude.toFixed(1)} km</div>
      <div class="popup-row"><b>Vitesse :</b> ${(velocity * 3.6).toFixed(0)} km/h</div>
    `);
    layerISS.addLayer(marker);

    document.getElementById('stat-iss-alt').textContent = altitude.toFixed(0) + ' km';
    setBadge('badge-iss', `🚀 ISS ${lat.toFixed(1)}°, ${lng.toFixed(1)}°`, 'live');

  } catch (e) {
    console.warn('ISS:', e);
    setBadge('badge-iss', '🚀 ISS — erreur', 'err');
  }
}

// ─────────────────────────────────────────────
// SÉISMES — USGS GeoJSON (circleMarker Leaflet)
// ─────────────────────────────────────────────
async function chargerSeismes() {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data  = await res.json();
    const quakes = data.features || [];

    layerSeismes.clearLayers();

    for (const q of quakes) {
      const [lon, lat, depth] = q.geometry.coordinates;
      const mag   = q.properties.mag  ?? 0;
      const place = q.properties.place ?? '—';
      const time  = new Date(q.properties.time).toLocaleString('fr-CA');
      const color  = mag >= 6 ? '#ff3030' : mag >= 5 ? '#ff8800' : mag >= 4 ? '#ddcc00' : '#88cc88';
      const radius = Math.max(4, mag * 2.8);

      const circle = L.circleMarker([lat, lon], { radius, color, fillColor: color, fillOpacity: 0.42, weight: 1.5 });
      circle.bindPopup(`
        <div class="popup-title">🌍 M${mag.toFixed(1)} — ${place}</div>
        <div class="popup-row"><b>Date :</b> ${time}</div>
        <div class="popup-row"><b>Profondeur :</b> ${depth.toFixed(1)} km</div>
        <div class="popup-row"><b>Lat / Lon :</b> ${lat.toFixed(2)}° / ${lon.toFixed(2)}°</div>
      `);
      layerSeismes.addLayer(circle);
    }

    document.getElementById('stat-seismes').textContent = quakes.length;
    setBadge('badge-seismes', `🌍 ${quakes.length} séismes`, 'live');
    spinStop('spin-seismes');

  } catch (e) {
    console.warn('USGS:', e);
    setBadge('badge-seismes', '🌍 Séismes — erreur', 'err');
    spinStop('spin-seismes');
  }
}

// ─────────────────────────────────────────────
// TOGGLES DE COUCHES
// ─────────────────────────────────────────────
function setupToggle(toggleId, onShow, onHide) {
  const el = document.getElementById(toggleId);
  if (!el) return;
  el.addEventListener('click', () => {
    const cb = el.querySelector('input');
    cb.checked = !cb.checked;
    if (cb.checked) { onShow(); el.classList.remove('off'); }
    else            { onHide(); el.classList.add('off'); }
  });
}

setupToggle('toggle-avions',
  () => { showAvions = true;  dessinerAvions(); },
  () => { showAvions = false; dessinerAvions(); }
);
setupToggle('toggle-sats',
  () => { showSats = true;  dessinerSatellites(); },
  () => { showSats = false; dessinerSatellites(); }
);
setupToggle('toggle-iss',
  () => map.addLayer(layerISS),
  () => map.removeLayer(layerISS)
);
setupToggle('toggle-seismes',
  () => map.addLayer(layerSeismes),
  () => map.removeLayer(layerSeismes)
);

// ─────────────────────────────────────────────
// REFRESH + INIT
// ─────────────────────────────────────────────
async function refreshAll() {
  chargerAvions();
  chargerISS();
}
window.refreshAll = refreshAll;

// ─────────────────────────────────────────────
// BADGES CLIQUABLES — relancer le chargement
// ─────────────────────────────────────────────
function setupBadgeRetry(badgeId, retryFn) {
  const el = document.getElementById(badgeId);
  if (!el) return;
  el.title = 'Cliquer pour actualiser';
  el.addEventListener('click', retryFn);
}

setupBadgeRetry('badge-avions',  chargerAvions);
setupBadgeRetry('badge-sats',    () => chargerTLE().then(ok => { if (ok) propagerSatellites(); }));
setupBadgeRetry('badge-iss',     chargerISS);
setupBadgeRetry('badge-seismes', chargerSeismes);

async function init() {
  await Promise.all([
    chargerAvions(),
    chargerTLE().then(ok => { if (ok) propagerSatellites(); }),
    chargerISS(),
    chargerSeismes(),
  ]);

  setInterval(chargerAvions, 30_000);
  setInterval(chargerISS, 15_000);
  setInterval(propagerSatellites, 10_000);
  setInterval(() => chargerTLE().then(ok => { if (ok) propagerSatellites(); }), 3_600_000);
}

init();
