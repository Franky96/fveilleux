// === SÉCURITÉ ===
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
const userRole = sessionStorage.getItem('userRole');
if (!sessionStorage.getItem('loggedIn') || (userRole !== 'admin' && !permissions.includes('osint'))) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

// === CARTE ===
const map = L.map('map', {
  center: [30, 0],
  zoom: 2,
  zoomControl: true,
  preferCanvas: true,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright" style="color:#80cc80">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" style="color:#80cc80">CARTO</a>',
  maxZoom: 19,
  subdomains: 'abcd',
}).addTo(map);

// === GROUPES DE COUCHES ===
const layerAvions  = L.layerGroup().addTo(map);
const layerSats    = L.layerGroup().addTo(map);
const layerISS     = L.layerGroup().addTo(map);
const layerSeismes = L.layerGroup().addTo(map);

// === ÉTAT ===
let tleSatellites  = [];
let satInterval    = null;

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
// AVIONS — OpenSky Network (+ proxies + retry)
// ─────────────────────────────────────────────
let avionsCount = 0; // garde le dernier compte valide

const AVIONS_URLS = [
  'https://opensky-network.org/api/states/all',
  `https://api.allorigins.win/raw?url=${encodeURIComponent('https://opensky-network.org/api/states/all')}`,
  `https://api.cors.lol/?url=${encodeURIComponent('https://opensky-network.org/api/states/all')}`,
  `https://corsproxy.io/?url=${encodeURIComponent('https://opensky-network.org/api/states/all')}`,
  `https://proxy.cors.sh/https://opensky-network.org/api/states/all`,
];

function afficherAvions(states) {
  layerAvions.clearLayers();
  let count = 0;
  for (const s of states) {
    const lon = s[5], lat = s[6];
    if (lat == null || lon == null) continue;
    const callsign = (s[1] || '').trim() || 'N/A';
    const country  = s[2] || '—';
    const altBaro  = s[7]  != null ? Math.round(s[7])  + ' m'   : '—';
    const speed    = s[9]  != null ? Math.round(s[9] * 3.6) + ' km/h' : '—';
    const hdg      = s[10] != null ? s[10] : 0;
    const onGround = s[8];
    const color    = onGround ? '#557755' : '#60b8c8';
    const icon = L.divIcon({
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"
                  style="transform:rotate(${hdg}deg);display:block;overflow:visible;">
               <path d="M7 0L3.5 11 7 9 10.5 11Z" fill="${color}" opacity="0.9"/>
             </svg>`,
      iconSize: [14, 14], iconAnchor: [7, 7], className: '',
    });
    const marker = L.marker([lat, lon], { icon });
    marker.bindPopup(`
      <div class="popup-title">✈ ${callsign}</div>
      <div class="popup-row"><b>Pays:</b> ${country}</div>
      <div class="popup-row"><b>Altitude:</b> ${altBaro}</div>
      <div class="popup-row"><b>Vitesse:</b> ${speed}</div>
      <div class="popup-row"><b>Cap:</b> ${Math.round(hdg)}°</div>
      <div class="popup-row"><b>Au sol:</b> ${onGround ? 'Oui' : 'Non'}</div>
    `);
    layerAvions.addLayer(marker);
    count++;
  }
  avionsCount = count;
  document.getElementById('stat-avions').textContent = count.toLocaleString('fr-CA');
  document.getElementById('stat-update').textContent = new Date().toLocaleTimeString('fr-CA');
  setBadge('badge-avions', `✈ ${count.toLocaleString('fr-CA')} avions`, 'live');
  spinStop('spin-avions');
}

async function chargerAvions() {
  for (const url of AVIONS_URLS) {
    for (let tentative = 0; tentative < 2; tentative++) {
      try {
        if (tentative > 0) await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          if (res.status === 503 && tentative === 0) continue; // retry sur 503
          break;
        }
        let data = await res.json();
        // Déballer le wrapper allorigins si nécessaire
        if (data?.contents) data = JSON.parse(data.contents);
        const states = data?.states;
        if (Array.isArray(states) && states.length > 0) {
          afficherAvions(states);
          return;
        }
        break;
      } catch (_) { break; }
    }
  }
  // Échec : ne pas écraser les données existantes avec "erreur"
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

// Parse format texte 3-lignes (nom / tle1 / tle2)
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

// Parse format JSON SatNOGS [{tle0, tle1, tle2, norad_cat_id}, ...]
function parseTLEJSON(data) {
  const sats = [];
  for (const item of data) {
    try {
      const name = (item.tle0 || '').replace(/^0\s+/, '').trim() || `NORAD-${item.norad_cat_id}`;
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
  console.info(`[OSINT] TLE chargés — ${source}: ${sats.length} satellites`);
}

// URLs SatNOGS (primaire — CORS natif, données fraîches, ~1500+ sats)
const SATNOGS_URLS = [
  'https://db.satnogs.org/api/tle/?format=json',
  `https://api.allorigins.win/raw?url=${encodeURIComponent('https://db.satnogs.org/api/tle/?format=json')}`,
  `https://api.cors.lol/?url=${encodeURIComponent('https://db.satnogs.org/api/tle/?format=json')}`,
  `https://corsproxy.io/?url=${encodeURIComponent('https://db.satnogs.org/api/tle/?format=json')}`,
];

// URLs CelesTrak format texte (fallback — plusieurs chemins + proxies)
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

  // ── Étape 1 : SatNOGS JSON ──
  for (const url of SATNOGS_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const raw  = await res.json();
      const arr  = Array.isArray(raw) ? raw : (raw.results || raw.data || []);
      if (!arr.length) continue;
      const sats = parseTLEJSON(arr);
      if (sats.length > 0) {
        onTLELoaded(sats, 'SatNOGS');
        return true;
      }
    } catch (_) {}
  }

  // ── Étape 2 : CelesTrak texte ──
  for (const url of CK_TLE_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes('1 ') || !text.includes('2 ')) continue;
      const sats = parseTLE(text);
      if (sats.length > 0) {
        onTLELoaded(sats, 'CelesTrak');
        return true;
      }
    } catch (_) {}
  }

  setBadge('badge-sats', '🛰 Aucune source TLE disponible', 'err');
  spinStop('spin-sats');
  return false;
}

function propagerSatellites() {
  if (!tleSatellites.length) return;
  const now  = new Date();
  const gmst = satellite.gstime(now);

  layerSats.clearLayers();

  for (const sat of tleSatellites) {
    try {
      const pv = satellite.propagate(sat.satrec, now);
      if (!pv || !pv.position) continue;
      const gd  = satellite.eciToGeodetic(pv.position, gmst);
      const lat  = satellite.degreesLat(gd.latitude);
      const lng  = satellite.degreesLong(gd.longitude);
      const altKm = gd.height.toFixed(0);
      if (isNaN(lat) || isNaN(lng)) continue;

      const dot = L.circleMarker([lat, lng], {
        radius: 3.5,
        color: '#d4892a',
        fillColor: '#d4892a',
        fillOpacity: 0.85,
        weight: 0,
      });
      dot.bindPopup(`
        <div class="popup-title">🛰 ${sat.name}</div>
        <div class="popup-row"><b>Altitude:</b> ${altKm} km</div>
        <div class="popup-row"><b>Lat:</b> ${lat.toFixed(2)}°</div>
        <div class="popup-row"><b>Lon:</b> ${lng.toFixed(2)}°</div>
      `);
      layerSats.addLayer(dot);
    } catch (_) {}
  }
}

// ─────────────────────────────────────────────
// ISS — wheretheiss.at
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
      <div class="popup-row"><b>Latitude:</b> ${lat.toFixed(4)}°</div>
      <div class="popup-row"><b>Longitude:</b> ${lng.toFixed(4)}°</div>
      <div class="popup-row"><b>Altitude:</b> ${altitude.toFixed(1)} km</div>
      <div class="popup-row"><b>Vitesse:</b> ${(velocity * 3.6).toFixed(0)} km/h</div>
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
// SÉISMES — USGS GeoJSON
// ─────────────────────────────────────────────
async function chargerSeismes() {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const quakes = data.features || [];

    layerSeismes.clearLayers();

    for (const q of quakes) {
      const [lon, lat, depth] = q.geometry.coordinates;
      const mag   = q.properties.mag  ?? 0;
      const place = q.properties.place ?? '—';
      const time  = new Date(q.properties.time).toLocaleString('fr-CA');

      const color  = mag >= 6 ? '#ff3030' : mag >= 5 ? '#ff8800' : mag >= 4 ? '#ddcc00' : '#88cc88';
      const radius = Math.max(4, mag * 2.8);

      const circle = L.circleMarker([lat, lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.42,
        weight: 1.5,
      });
      circle.bindPopup(`
        <div class="popup-title">🌍 M${mag.toFixed(1)} — ${place}</div>
        <div class="popup-row"><b>Date:</b> ${time}</div>
        <div class="popup-row"><b>Profondeur:</b> ${depth.toFixed(1)} km</div>
        <div class="popup-row"><b>Lat / Lon:</b> ${lat.toFixed(2)}° / ${lon.toFixed(2)}°</div>
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
function setupToggle(toggleId, layer) {
  const el = document.getElementById(toggleId);
  if (!el) return;
  el.addEventListener('click', () => {
    const cb = el.querySelector('input');
    cb.checked = !cb.checked;
    if (cb.checked) {
      map.addLayer(layer);
      el.classList.remove('off');
    } else {
      map.removeLayer(layer);
      el.classList.add('off');
    }
  });
}

setupToggle('toggle-avions',  layerAvions);
setupToggle('toggle-sats',    layerSats);
setupToggle('toggle-iss',     layerISS);
setupToggle('toggle-seismes', layerSeismes);

// ─────────────────────────────────────────────
// REFRESH ALL
// ─────────────────────────────────────────────
async function refreshAll() {
  chargerAvions();
  chargerISS();
}
window.refreshAll = refreshAll;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
  // Lancer tout en parallèle
  await Promise.all([
    chargerAvions(),
    chargerTLE().then(ok => { if (ok) propagerSatellites(); }),
    chargerISS(),
    chargerSeismes(),
  ]);

  // Auto-refresh avions toutes les 30s
  setInterval(chargerAvions, 30_000);
  // ISS toutes les 15s
  setInterval(chargerISS, 15_000);
  // Propagation satellite toutes les 10s (pas de re-fetch, juste recalcul)
  satInterval = setInterval(propagerSatellites, 10_000);
  // Re-fetch TLE toutes les heures
  setInterval(() => chargerTLE().then(ok => { if (ok) propagerSatellites(); }), 3_600_000);
}

init();
