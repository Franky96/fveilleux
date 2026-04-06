'use strict';

function stepCidr(delta) {
  const input = document.getElementById('cidr-input');
  input.value = Math.max(0, Math.min(32, (parseInt(input.value) || 24) + delta));
  calculate();
}

document.getElementById('cidr-input').addEventListener('input', calculate);

document.getElementById('ip-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') calculate();
});

// ── Helpers ──────────────────────────────────────────
function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = parseInt(p);
    if (isNaN(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function intToIp(n) {
  return [24, 16, 8, 0].map(s => (n >>> s) & 0xFF).join('.');
}

function cidrToMask(cidr) {
  return cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0;
}

function toBin(n) {
  return (n >>> 0).toString(2).padStart(32, '0');
}

function numHosts(cidr) {
  if (cidr === 32) return 1;
  if (cidr === 31) return 2;
  return Math.pow(2, 32 - cidr) - 2;
}

function ipClass(firstOctet) {
  if (firstOctet < 128) return 'A';
  if (firstOctet < 192) return 'B';
  if (firstOctet < 224) return 'C';
  if (firstOctet < 240) return 'D (Multicast)';
  return 'E (Réservé)';
}

function isPrivate(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return '10.0.0.0/8 (RFC 1918)';
  if (a === 172 && b >= 16 && b <= 31) return '172.16.0.0/12 (RFC 1918)';
  if (a === 192 && b === 168) return '192.168.0.0/16 (RFC 1918)';
  if (a === 127) return 'Loopback';
  if (a === 169 && b === 254) return '169.254.0.0/16 (APIPA)';
  return null;
}

// ── Main calculate ────────────────────────────────────
function calculate() {
  try { _calculate(); } catch(e) {
    document.getElementById('error-msg').textContent = 'Erreur JS: ' + e.message;
    console.error(e);
  }
}

function _calculate() {
  const ipStr  = document.getElementById('ip-input').value.trim();
  const cidr   = Math.max(0, Math.min(32, parseInt(document.getElementById('cidr-input').value) || 0));
  const errEl  = document.getElementById('error-msg');

  if (!ipStr) { errEl.textContent = ''; return; }

  const ipInt = ipToInt(ipStr);
  if (ipInt === null) {
    errEl.textContent = 'Adresse IP invalide — format attendu : 192.168.1.0';
    document.getElementById('results-content').innerHTML = '<div class="placeholder-msg">Adresse invalide</div>';
    document.getElementById('binary-content').innerHTML  = '<div class="placeholder-msg">Adresse invalide</div>';
    return;
  }
  errEl.textContent = '';

  const mask      = cidrToMask(cidr);
  const wildcard  = (~mask) >>> 0;
  const network   = (ipInt & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const firstHost = cidr < 31 ? network + 1 : network;
  const lastHost  = cidr < 31 ? broadcast - 1 : broadcast;
  const hosts     = numHosts(cidr);
  const firstOct  = parseInt(ipStr.split('.')[0]);
  const priv      = isPrivate(ipStr);

  // ── Results ──
  document.getElementById('results-content').innerHTML = `
    <div class="results-grid">
      <div class="result-panel">
        <div class="result-panel-title">Adresses</div>
        <div class="result-row">
          <span class="result-key">Réseau</span>
          <span class="result-val accent">${intToIp(network)}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Broadcast</span>
          <span class="result-val orange">${intToIp(broadcast)}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Premier hôte</span>
          <span class="result-val blue">${cidr < 31 ? intToIp(firstHost) : '—'}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Dernier hôte</span>
          <span class="result-val blue">${cidr < 31 ? intToIp(lastHost) : '—'}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Hôtes disponibles</span>
          <span class="result-val yellow">${hosts.toLocaleString('fr-CA')}</span>
        </div>
      </div>
      <div class="result-panel">
        <div class="result-panel-title">Masque &amp; Info</div>
        <div class="result-row">
          <span class="result-key">Masque</span>
          <span class="result-val accent">${intToIp(mask)}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Wildcard</span>
          <span class="result-val">${intToIp(wildcard)}</span>
        </div>
        <div class="result-row">
          <span class="result-key">CIDR</span>
          <span class="result-val">/${cidr}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Classe</span>
          <span class="result-val">${ipClass(firstOct)}</span>
        </div>
        <div class="result-row">
          <span class="result-key">Type</span>
          <span class="result-val ${priv ? '' : 'blue'}">${priv || 'Publique'}</span>
        </div>
      </div>
    </div>`;

  // ── Binary mask ──
  const ipBin   = toBin(ipInt);
  const maskBin = toBin(mask);

  function renderOctets(binStr, maskBin, cidr) {
    let html = '<div class="bitmask-row">';
    for (let oct = 0; oct < 4; oct++) {
      html += '<div class="bitmask-octet">';
      for (let b = 0; b < 8; b++) {
        const idx = oct * 8 + b;
        const cls = idx < cidr ? 'bit-net' : 'bit-host';
        html += `<div class="bit-box ${cls}">${binStr[idx]}</div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  document.getElementById('binary-content').innerHTML = `
    <div style="font-size:0.75rem; color:#a89f94; margin-bottom:0.4rem; font-family:monospace;">IP &nbsp;&nbsp;&nbsp;: ${ipStr}</div>
    ${renderOctets(ipBin, maskBin, cidr)}
    <div style="font-size:0.75rem; color:#a89f94; margin:0.8rem 0 0.4rem; font-family:monospace;">Masque : ${intToIp(mask)}</div>
    ${renderOctets(maskBin, maskBin, cidr)}
    <div class="bitmask-legend">
      <div class="bitmask-legend-item"><div class="legend-sq" style="background:#80cc80;"></div> Réseau (${cidr} bits)</div>
      <div class="bitmask-legend-item"><div class="legend-sq" style="background:#60b8c8;"></div> Hôte (${32 - cidr} bits)</div>
    </div>`;
}

