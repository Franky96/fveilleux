// ════════════════════════════════════════════════════
//  Décodeur CSDB — Commercial Standard Digital Bus
//  GAMA Standard 523-0772774 ; la table des adresses est dans csdb-adresses.js (chargé avant)
// ════════════════════════════════════════════════════

const _permsCSDB = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') ||
    (!_permsCSDB.includes('csdb') && !_permsCSDB.includes('avionique') &&
     sessionStorage.getItem('userRole') !== 'admin')) {
  alert('Accès refusé.');
  window.location.href = 'dashboard.html';
}

// ── Décodage d'après la table des adresses (csdb-adresses.js, vérifiée contre le manuel) ──
const DEFS = window.CSDB_DEFS || {};
const BUS_CSDB = window.CSDB_BUS || [];
const hex2 = v => v.toString(16).toUpperCase().padStart(2, '0');
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function defDe(addr) { return DEFS[addr] || null; }
// Longueur du bloc : 6 octets en général, 8 sur les bus AHC, FCC et ADC INPUT ; F3 et F5 suivent le bus (6 ou 8)
function tailleDe(def, bytes) {
  const n = def && def.n;
  if (Array.isArray(n)) return n.includes(bytes.length) ? bytes.length : n[0];
  return n || 6;
}
function champsDe(def, n) {
  if (!def) return [];
  return typeof def.champs === 'function' ? def.champs(n) : def.champs;
}
function busDe(addr) {
  return BUS_CSDB.filter(b => b.adr[addr] !== undefined).map(b => ({ nom: b.nom, sys: b.sys, cadence: b.adr[addr], n: b.n }));
}

// Pièces [octet, bit haut, bit bas] du poids fort au poids faible → entier non signé et nombre de bits
function lirePieces(bytes, p) {
  let v = 0, n = 0;
  for (const [o, hi, lo] of p) {
    const w = hi - lo + 1;
    v = v * 2 ** w + (((bytes[o] || 0) >> lo) & ((1 << w) - 1));
    n += w;
  }
  return { v, n };
}
const bitDe = (bytes, o, b) => ((bytes[o] || 0) >> b) & 1;
const fmtNum = (v, dec) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(dec);
const decAuto = res => Math.max(0, Math.min(6, Math.ceil(-Math.log10(res) - 1e-9)));
const fmtPoids = p => p >= 1 ? String(p) : String(+p.toFixed(6));

// Altitude transmise par le transpondeur (code Gray de Gillham, pas de 100 ft). Même méthode que les décodeurs Mode S courants.
function gillham(A, B, C, D) {
  const modeA = (A << 12) | (B << 8) | (C << 4) | D;    // chiffres octaux : X4 X2 X1
  if ((modeA & 0x0001) || (modeA & 0x0070) === 0) return null;   // D1 jamais utilisé ; il faut au moins un bit C
  let cent = 0, cinq = 0;
  if (modeA & 0x0010) cent ^= 7;    // C1
  if (modeA & 0x0020) cent ^= 3;    // C2
  if (modeA & 0x0040) cent ^= 1;    // C4
  if ((cent & 5) === 5) cent ^= 2;  // 7 ↔ 5
  if (cent > 5 || cent === 0) return null;
  if (modeA & 0x0002) cinq ^= 0xFF;  // D2
  if (modeA & 0x0004) cinq ^= 0x7F;  // D4
  if (modeA & 0x1000) cinq ^= 0x3F;  // A1
  if (modeA & 0x2000) cinq ^= 0x1F;  // A2
  if (modeA & 0x4000) cinq ^= 0x0F;  // A4
  if (modeA & 0x0100) cinq ^= 0x07;  // B1
  if (modeA & 0x0200) cinq ^= 0x03;  // B2
  if (modeA & 0x0400) cinq ^= 0x01;  // B4
  if (cinq & 1) cent = 6 - cent;
  return (cinq * 5 + cent - 13) * 100;
}

function mkrHtml(inn, mdl, out) {
  const s = (active, name, color) => active
    ? `<span style="color:${color};font-weight:bold">${name}</span>`
    : `<span class="mkr-off">—</span>`;
  return `${s(inn, 'INN', '#f0f0f0')} · ${s(mdl, 'MDL', '#facc15')} · ${s(out, 'OUT', '#60a5fa')}`;
}

// Bit de validité d'un champ (val : numéro de bit de l'octet 1, ou nom court d'un discret)
function validiteDe(f, champs, bytes) {
  if (f.val === undefined) return null;
  if (typeof f.val === 'number') return bitDe(bytes, 1, f.val);
  const c = champs.find(x => x.t === 'bit' && x.court === f.val);
  return c ? bitDe(bytes, c.o, c.b) : null;
}

// Valeur d'un champ → { txt, html?, ok, brut, signe? }
function valeurDe(f, bytes, n) {
  switch (f.t) {
    case 'bit': {
      const v = bitDe(bytes, f.o, f.b);
      return { ok: true, v, txt: v ? (f.v1 || '1') : (f.v0 || '0'), brut: String(v) };
    }
    case 'enum': {
      const { v, n: nb } = lirePieces(bytes, f.p);
      return { ok: true, v, txt: f.noms[v] !== undefined && f.noms[v] !== '' ? f.noms[v] : String(v), brut: v.toString(2).padStart(nb, '0') };
    }
    case 'bcd': {
      const d = f.ch.map(([o, hi, lo]) => lirePieces(bytes, [[o, hi, lo]]).v);
      const brut = d.join(' ');
      if (d.some(x => x > 9)) return { ok: false, txt: 'BCD invalide (chiffre > 9)', brut };
      if (f.zeroNul && d.every(x => x === 0)) return { ok: false, txt: '— (aucune donnée)', brut };
      const v = (f.base || 0) + f.ch.reduce((s, c, i) => s + d[i] * c[3], 0);
      let t = f.pad2 ? String(Math.round(v)).padStart(2, '0') : v.toFixed(f.dec || 0);
      return { ok: true, v, txt: t + (f.unit ? ' ' + f.unit : ''), brut };
    }
    case 'c2': case 'bin': {
      const { v: raw, n: nb } = lirePieces(bytes, f.p);
      let { msb, unit, dec } = f;
      const autre = f.unite ? f.unite(bytes) : null;
      if (autre) ({ msb, unit, dec } = { msb, unit, dec, ...autre });
      const s = f.t === 'c2' && raw >= 2 ** (nb - 1) ? raw - 2 ** nb : raw;
      const res = Math.abs(msb) / 2 ** (nb - 1);
      const v = s * res + (f.bias || 0);
      if (dec === undefined) dec = decAuto(res);
      const u = unit ? (unit === '°' ? '°' : ' ' + unit) : '';
      let txt;
      if (f.cap) txt = fmtNum(((v % 360) + 360) % 360, dec) + u + (v < 0 ? ` (${fmtNum(v, dec)}° en complément à 2)` : '');
      else txt = fmtNum(v, dec) + u + (f.neg && v < 0 ? ` (${f.neg})` : f.pos && v > 0 ? ` (${f.pos})` : '');
      const court = f.cap ? fmtNum(((v % 360) + 360) % 360, dec) + u : fmtNum(v, dec) + u;
      return { ok: true, v, txt, court, brut: `${raw} (${nb} bits${f.t === 'c2' ? ', signé ' + s : ''}) × ${+res.toPrecision(6)}${f.bias ? ' + ' + f.bias : ''}` };
    }
    case 'oct': {
      const d = f.ch.map(([o, hi, lo]) => lirePieces(bytes, [[o, hi, lo]]).v);
      return { ok: true, txt: d.join(''), brut: f.ch.map((c, i) => c[3] + '=' + d[i]).join(' ') };
    }
    case 'gillham': {
      const d = f.ch.map(([o, hi, lo]) => lirePieces(bytes, [[o, hi, lo]]).v);
      const code = d.join('');
      const alt = gillham(d[0], d[1], d[2], d[3]);
      const altTxt = alt === null ? 'altitude invalide' : `${alt < 0 ? '−' : ''}${String(Math.abs(alt)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ft`;
      return { ok: true, v: alt, txt: `${altTxt} (code ${code})`, court: `${code} · ${altTxt}`, brut: f.ch.map((c, i) => c[3] + '=' + d[i]).join(' ') };
    }
    case 'ascii': {
      let txt = '', bandeau = '';
      for (const o of f.octs) {
        const b = bytes[o] || 0;
        const invalide = f.valBit && (b >> 7) & 1;
        const c = f.bits === 7 ? b & 0x7F : b;
        const ch = c >= 0x20 && c <= 0x7E ? String.fromCharCode(c) : '·';
        txt += invalide ? '·' : ch;
        if (!invalide && c >= 0x20 && c <= 0x7E) bandeau += ch;
      }
      return { ok: bandeau.trim() !== '', txt: `« ${txt} »`, court: bandeau.trim(), brut: f.octs.map(o => hex2(bytes[o] || 0)).join(' ') };
    }
    case 'mkr': {
      const [o] = f.p[0];
      const b2 = bitDe(bytes, o, 2), b1 = bitDe(bytes, o, 1), b0 = bitDe(bytes, o, 0);
      const [inn, mdl, out] = f.ordre === 'OMI' ? [b0, b1, b2] : [b2, b1, b0];
      const noms = [inn && 'INNER', mdl && 'MIDDLE', out && 'OUTER'].filter(Boolean);
      return { ok: true, txt: noms.length ? noms.join(' + ') : 'aucune', html: mkrHtml(inn, mdl, out), brut: `${b2}${b1}${b0}` };
    }
    case 'hex': {
      const { v } = lirePieces(bytes, f.p);
      const nom = f.noms ? (f.noms[v] || 'NOT USED') : '';
      return { ok: true, v, txt: hex2(v) + (nom ? ' — ' + nom : ''), brut: '0x' + hex2(v) };
    }
    case 'msgs': {
      const actifs = [];
      for (const o of f.octs) for (let b = 7; b >= 0; b--) {
        if (!bitDe(bytes, o, b)) continue;
        const nom = f.noms && f.noms[o] && f.noms[o][b];
        actifs.push(nom || (f.numeros ? `n° ${(o - f.octs[0]) * 8 + (8 - b)}` : `octet ${o} bit ${b}`));
      }
      return { ok: actifs.length > 0, txt: actifs.length ? actifs.join(' · ') : 'aucun', court: actifs.join(' · '), brut: f.octs.map(o => hex2(bytes[o] || 0)).join(' ') };
    }
    case 'somme': {
      let total = 0;
      for (let i = 0; i < n; i++) total = (total + (bytes[i] || 0)) & 0xFF;
      const attendu = (bytes[f.o] - total) & 0xFF;   // valeur qui ramène la somme à 0
      return { ok: total === 0, txt: total === 0 ? 'OK (somme des octets = 0 modulo 256)' : `erreur — attendu 0x${hex2(attendu)}`, brut: '0x' + hex2(bytes[f.o] || 0) };
    }
    case 'ad3': {   // AD, octet 3 : multiplicateur de VS ou longueur du repère selon la sélection (octet 2, bits 6-4)
      const raw = bytes[3] || 0, sel = ((bytes[2] || 0) >> 4) & 7, mach = ((bytes[1] || 0) >> 5) & 1;
      if (sel <= 2) return { ok: true, txt: `× ${(raw * 1.6 / 128).toFixed(3)} VS (nominal ${sel === 0 ? '1.0' : '1.3'})`, court: '× ' + (raw * 1.6 / 128).toFixed(2), brut: String(raw) };
      return { ok: true, txt: mach ? `${(raw * 0.001).toFixed(3)} Mach de long` : `${raw} kt de long`, court: mach ? (raw * 0.001).toFixed(3) : raw + ' kt', brut: String(raw) };
    }
  }
  return { ok: false, txt: '—', brut: '' };
}

// Couleur d'un segment de la carte des bits
function classeDe(f) {
  if (f.t === 'bit') return { val: 'csdb-fmap-valid', test: 'csdb-fmap-test', mode: 'csdb-fmap-mode' }[f.role] || 'csdb-fmap-ctrl';
  if (f.t === 'enum') return f.role === 'si' ? 'csdb-fmap-src' : 'csdb-fmap-ctrl';
  if (f.t === 'bcd' || f.t === 'oct') return 'csdb-fmap-bcd';
  if (f.t === 'mkr' || f.t === 'msgs') return 'csdb-fmap-ctrl';
  if (f.t === 'somme') return 'csdb-fmap-mode';
  return 'csdb-fmap-data';
}

// Étiquette de chaque bit (octet → 8 cases, bit 7 à gauche)
function cartesDe(def, champs, n) {
  const cartes = Array.from({ length: n }, () => Array(8).fill(null));
  const poser = (o, hi, lo, label, cls, titre) => {
    if (o >= n) return;
    for (let b = hi; b >= lo; b--) cartes[o][7 - b] = { label, cls, titre: titre || label };
  };
  for (const f of champs) {
    const cls = classeDe(f);
    switch (f.t) {
      case 'bit': poser(f.o, f.b, f.b, f.court, cls, `${f.nom} (1 = ${f.v1})`); break;
      case 'enum': case 'hex': f.p.forEach(([o, hi, lo]) => poser(o, hi, lo, f.court, cls, f.nom)); break;
      case 'bcd': f.ch.forEach(([o, hi, lo, poids]) => poser(o, hi, lo, f.unit ? `${fmtPoids(poids)} ${f.unit}` : `×${fmtPoids(poids)}`, cls, `${f.nom} — chiffre de ${fmtPoids(poids)} ${f.unit || ''}`)); break;
      case 'oct': case 'gillham': f.ch.forEach(([o, hi, lo, nom]) => poser(o, hi, lo, `${f.court} ${nom}`, cls, `${f.nom} — chiffre ${nom}`)); break;
      case 'c2': case 'bin':
        f.p.forEach(([o, hi, lo], i) => poser(o, hi, lo, f.p.length > 1 ? `${f.court} ${i === 0 ? 'MSB' : i === f.p.length - 1 ? 'LSB' : ''}`.trim() : f.court, cls, f.nom));
        break;
      case 'ascii':
        f.octs.forEach((o, i) => {
          if (f.valBit) { poser(o, 7, 7, 'VAL', 'csdb-fmap-valid', 'Caractère valide si 0'); poser(o, 6, 0, `${f.court} ${i + 1}`, cls, f.nom); }
          else poser(o, 7, 0, `${f.court} ${i + 1}`, cls, f.nom);
        });
        break;
      case 'mkr': {
        const [o] = f.p[0];
        const noms = f.ordre === 'OMI' ? ['OUT', 'MID', 'INN'] : ['INN', 'MDL', 'OUT'];
        noms.forEach((nm, i) => poser(o, 2 - i, 2 - i, nm, cls, 'Radiobalise ' + nm));
        break;
      }
      case 'msgs':
        for (const o of f.octs) {
          if (f.noms && f.noms[o]) { for (let b = 7; b >= 0; b--) if (f.noms[o][b]) poser(o, b, b, f.noms[o][b], cls, f.noms[o][b]); }
          else if (f.numeros) for (let b = 7; b >= 0; b--) { const k = (o - f.octs[0]) * 8 + (8 - b); poser(o, b, b, String(k), cls, `Message n° ${k}`); }
          else poser(o, 7, 0, f.court, cls, f.nom);
        }
        break;
      case 'somme': poser(f.o, 7, 0, f.court, cls, f.nom); break;
      case 'ad3': poser(3, 7, 0, f.court, cls, f.nom); break;
    }
  }
  // cases contiguës identiques → segments ; cases vides → PAD
  return cartes.map(cases => {
    const segs = [];
    for (const c of cases) {
      const x = c || { label: 'PAD', cls: 'csdb-fmap-pad', titre: 'Bit de remplissage (toujours 0)' };
      const der = segs[segs.length - 1];
      if (der && der.label === x.label && der.cls === x.cls && der.titre === x.titre) der.span++;
      else segs.push({ span: 1, ...x });
    }
    return segs;
  });
}

// Disposition standard de l'octet de statut (manuel p. 11), pour une adresse sans définition
const STATUT_STANDARD = [
  { span: 1, label: 'V1', cls: 'csdb-fmap-valid', titre: 'Validité, donnée 1' }, { span: 1, label: 'V2', cls: 'csdb-fmap-valid', titre: 'Validité, donnée 2' },
  { span: 1, label: 'V3', cls: 'csdb-fmap-valid', titre: 'Validité, donnée 3' }, { span: 2, label: 'MODE', cls: 'csdb-fmap-mode', titre: 'Mode' },
  { span: 1, label: 'TEST', cls: 'csdb-fmap-test', titre: 'Test' }, { span: 2, label: 'SI', cls: 'csdb-fmap-src', titre: 'Source ident' },
];

// État du bloc décodé (adresse, définition, longueur, champs, cartes)
function analyser(bytes) {
  const addr = bytes[0];
  const def = defDe(addr);
  const n = tailleDe(def, bytes);
  const champs = champsDe(def, n);
  let cartes;
  if (def) cartes = cartesDe(def, champs, Math.max(n, bytes.length));
  else cartes = bytes.map((_, i) => i === 1 ? STATUT_STANDARD : [{ span: 8, label: 'DATA', cls: 'csdb-fmap-data', titre: 'Donnée (adresse sans définition)' }]);
  cartes[0] = [{ span: 8, label: 'ADRESSE', cls: 'csdb-fmap-addr', titre: 'Octet d’adresse' }];
  if (def && def.sync) cartes = bytes.map(() => [{ span: 8, label: 'SYNC A5', cls: 'csdb-fmap-addr', titre: 'Caractère de synchronisation' }]);
  return { addr, def, n, champs, cartes };
}

// ── State ─────────────────────────────────────────────
let currentBytes = [];
let lastHighlightedAddr = -1;

// ── Input parsing ─────────────────────────────────────
function parseHexInput(raw) {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const parts = clean.split(' ');
  if (parts.length === 1 && parts[0].length > 2) {
    // Contiguous hex (e.g. "10A08041") → split every 2 chars
    const s = parts[0];
    if (s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) return null;
    const out = [];
    for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
    return out.length <= 12 ? out : null;
  }
  const bytes = [];
  for (const p of parts) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(p)) return null;
    bytes.push(parseInt(p, 16));
  }
  return (bytes.length >= 1 && bytes.length <= 12) ? bytes : null;
}

// ── Main decode ───────────────────────────────────────
let etat = null;
function decodeBlock(bytes) {
  currentBytes = bytes;
  etat = analyser(bytes);
  const { addr, def } = etat;
  const status = bytes.length > 1 ? bytes[1] : null;
  const data = bytes.length > 2 ? bytes.slice(2) : [];

  renderBytesDisplay(bytes);
  updateAddressBanner(addr, def, data);
  updateAddressPanel(addr, def);
  updateStatusPanel(status, addr, def);
  updateDataPanel(data, addr, def);
  updateQuickStatus(status, addr, data);
  highlightCatalogRow(addr);
}

function decodeFromInput() {
  const raw = document.getElementById('hex-input').value;
  const err = document.getElementById('error-msg');
  const bytes = parseHexInput(raw);
  if (!bytes) {
    err.textContent = 'Format invalide — octets hex séparés par des espaces (ex : 10 81 50 92 18 00)';
    return;
  }
  err.textContent = '';
  decodeBlock(bytes);
}

function resetToZero() {
  document.getElementById('hex-input').value = '';
  document.getElementById('error-msg').textContent = '';
  currentBytes = [];
  renderBytesDisplay([]);
  clearPanels();
}

function loadExample(hexStr) {
  document.getElementById('hex-input').value = hexStr;
  document.getElementById('error-msg').textContent = '';
  decodeBlock(parseHexInput(hexStr));
}

// ── Byte display rendering (CSS Grid — enfants directs) ──
function renderBytesDisplay(bytes) {
  const container = document.getElementById('bytes-display');
  container.innerHTML = '';

  if (!bytes.length) {
    const ph = document.createElement('div');
    ph.className = 'placeholder-msg';
    ph.style.gridColumn = '1/-1';
    ph.innerHTML = `Entrez des octets hexadécimaux séparés par des espaces<br>
      <small class="ph-ex">Exemple : <code>10 81 50 92 18 00</code> — VHF COMM FREQ</small>`;
    container.appendChild(ph);
    return;
  }
  const an = etat && etat.addr === bytes[0] ? etat : analyser(bytes);

  // ── Ligne d'en-tête : chip spacer + hex spacer + P + numéros de bits ─
  container.appendChild(document.createElement('span'));
  container.appendChild(document.createElement('span'));
  const pHdr = document.createElement('div');
  pHdr.className = 'bit-num-hdr-p';
  pHdr.textContent = 'P';
  container.appendChild(pHdr);
  for (let bit = 7; bit >= 0; bit--) {
    const d = document.createElement('div');
    d.className = 'bit-num-hdr';
    d.textContent = bit;
    container.appendChild(d);
  }

  // ── Une rangée par octet + ligne d'étiquettes ─────
  bytes.forEach((byteVal, idx) => {
    let role, roleLabel, hexCls, bitCls;
    const sansStatut = an.def && (an.def.sansStatut || an.def.sync);
    if (idx === 0)                    { role = 'addr';   roleLabel = an.def && an.def.sync ? 'SYNC' : 'ADRESSE'; hexCls = 'addr-color';   bitCls = 'bit-addr'; }
    else if (idx === 1 && !sansStatut) { role = 'status'; roleLabel = 'STATUS';                hexCls = 'status-color'; bitCls = 'bit-status'; }
    else                               { role = 'data';   roleLabel = `DONNÉES #${idx - 1}`;   hexCls = 'data-color';   bitCls = 'bit-data'; }
    if (idx >= an.n) roleLabel = 'EN TROP';

    const spacer = document.createElement('div');
    spacer.className = 'csdb-byte-spacer';
    container.appendChild(spacer);

    const chip = document.createElement('span');
    chip.className = `byte-role-chip role-${role}`;
    chip.textContent = roleLabel;
    if (idx >= an.n) chip.title = `Ce bloc compte ${an.n} octets`;
    container.appendChild(chip);

    const hexLbl = document.createElement('span');
    hexLbl.className = `byte-hex-val ${hexCls}`;
    hexLbl.textContent = '0x' + hex2(byteVal);
    container.appendChild(hexLbl);

    const onesCount = byteVal.toString(2).split('').filter(b => b === '1').length;
    const parityBit = (onesCount % 2 === 0) ? 1 : 0;
    const parityCell = document.createElement('div');
    parityCell.className = `byte-bit-parity ${parityBit ? 'p-one' : 'p-zero'}`;
    parityCell.textContent = parityBit;
    parityCell.title = `Bit de parité impaire — ${onesCount} bit(s) à 1`;
    container.appendChild(parityCell);

    const segs = an.cartes[idx] || [{ span: 8, label: '—', cls: 'csdb-fmap-pad', titre: 'Octet en trop' }];
    const padBits = new Set();
    { let bp = 7; for (const seg of segs) { if (seg.cls === 'csdb-fmap-pad') for (let i = 0; i < seg.span; i++) padBits.add(bp - i); bp -= seg.span; } }
    const titres = [];
    { for (const seg of segs) for (let i = 0; i < seg.span; i++) titres.push(seg.titre); }

    for (let bit = 7; bit >= 0; bit--) {
      const val = (byteVal >> bit) & 1;
      const cell = document.createElement('div');
      cell.className = `byte-bit-cell ${padBits.has(bit) ? 'bit-pad' : bitCls}`;
      cell.textContent = val;
      cell.title = `Octet ${idx}, bit ${bit} — ${titres[7 - bit] || roleLabel} (cliquer pour basculer)`;
      const ci = idx, cb = bit;
      cell.addEventListener('click', () => {
        const savedY = window.scrollY;
        const nb = [...currentBytes];
        nb[ci] = nb[ci] ^ (1 << cb);
        document.getElementById('hex-input').value = nb.map(hex2).join(' ');
        document.getElementById('error-msg').textContent = '';
        decodeBlock(nb);
        requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }));
      });
      container.appendChild(cell);
    }

    container.appendChild(document.createElement('span'));
    container.appendChild(document.createElement('span'));
    container.appendChild(document.createElement('span'));
    for (const seg of segs) {
      const el = document.createElement('div');
      el.className = `csdb-fmap-seg ${seg.cls}`;
      el.style.gridColumn = `span ${seg.span}`;
      el.textContent = seg.label;
      el.title = seg.titre;
      container.appendChild(el);
    }
  });
}

// ── Banner values ─────────────────────────────────────
// Toutes les valeurs décodables de l'adresse (règle du projet) ; la plus importante à droite (ban le plus grand).
function getBannerValues(addr, data) {
  if (!etat || etat.addr !== addr || !etat.def) return [];
  const bytes = [addr, ...(currentBytes.length > 1 ? [currentBytes[1]] : []), ...data];
  const vals = [];
  for (const f of etat.champs.filter(c => c.ban).sort((a, b) => a.ban - b.ban)) {
    const r = valeurDe(f, bytes, etat.n);
    if (!r.ok) continue;
    const v = validiteDe(f, etat.champs, bytes);
    vals.push({ label: f.banLabel || f.court, value: r.html || esc(r.court || r.txt), nv: v === 0 });
  }
  return vals;
}

// ── Address banner ────────────────────────────────────
function updateAddressBanner(addr, def, data) {
  document.getElementById('banner-addr-box').textContent = '0x' + hex2(addr);
  const idx = window.CSDB_INDEX ? window.CSDB_INDEX(addr) : null;
  document.getElementById('banner-name').textContent = def ? def.nom : idx || 'Adresse inconnue';
  let sous, notes = [];
  if (def) {
    const n = etat.n;
    const bus = busDe(addr);
    sous = `${def.sys}  •  bloc de ${n} octets (${def.sync ? 'synchronisation' : `${n - 2} de données`})`
      + (bus.length ? `  •  ${bus.map(b => b.nom).join(', ')}` : '');
    if (def.note) notes.push(def.note);
    if (currentBytes.length !== n && !def.sync) notes.push(`bloc de ${n} octets attendu, ${currentBytes.length} reçus`);
    notes.push(`voir la page ${def.p} du manuel`);
  } else {
    sous = idx ? `Index du manuel : ${idx}` : 'Non répertoriée dans le manuel CSDB';
  }
  document.getElementById('banner-sub').innerHTML = esc(sous) + notes.map(t => `<br><span class="banner-note">⚠ ${esc(t)}</span>`).join('');
  const vals = getBannerValues(addr, data);
  document.getElementById('banner-values').innerHTML = vals.map(v =>
    `<div class="banner-val-item${v.nv ? ' banner-val-nv' : ''}"${v.nv ? ' title="Drapeau de validité à 0 : donnée invalide"' : ''}>
       <span class="banner-val-label">${esc(v.label)}${v.nv ? ' (invalide)' : ''}</span>
       <span class="banner-val-num">${v.value}</span>
     </div>`
  ).join('');
}

// ── Quick status (validités, source, état principal) ──
function updateQuickStatus(statusByte, addr, data = []) {
  const validEl = document.getElementById('qs-valid');
  const siEl    = document.getElementById('qs-si');
  const extraSep = document.getElementById('qs-extra-sep');
  const extraLbl = document.getElementById('qs-extra-lbl');
  const extraEl  = document.getElementById('qs-extra');
  const cacherExtra = () => { if (extraSep) { extraSep.style.display = 'none'; extraLbl.style.display = 'none'; extraEl.innerHTML = ''; } };
  if (statusByte === null) {
    validEl.innerHTML = '<span class="qs-off">—</span>';
    siEl.innerHTML    = '<span class="qs-off">—</span>';
    cacherExtra();
    return;
  }
  const item = (lbl, v) => `<div class="qs-item"><span class="qs-item-label">${esc(lbl)}</span><span class="qs-item-val ${v ? 'qs-on' : 'qs-off'}">${v ? 'OUI' : 'NON'}</span></div>`;
  const def = etat && etat.def;
  if (!def) {
    // Disposition standard (manuel p. 11)
    validEl.innerHTML = ['D1', 'D2', 'D3'].map((l, i) => item(l, (statusByte >> (7 - i)) & 1)).join('');
    siEl.innerHTML = `<span class="qs-si">${['INCONNU', 'UNITÉ #1', 'UNITÉ #2', 'UNITÉ #3'][statusByte & 3]}</span>`;
    cacherExtra();
    return;
  }
  const bytes = currentBytes;
  const st = def.sansStatut || def.sync ? [] : etat.champs.filter(f => f.o === 1 || (f.p && f.p.every(p => p[0] === 1)));
  const vals = st.filter(f => f.t === 'bit' && f.role === 'val');
  validEl.innerHTML = vals.length ? vals.map(f => item(f.court, bitDe(bytes, 1, f.b))).join('') : '<span class="qs-off">—</span>';
  const si = st.find(f => f.t === 'enum' && f.role === 'si' && f.noms.some(Boolean));
  siEl.innerHTML = si ? `<span class="qs-si">${esc(valeurDe(si, bytes, etat.n).txt)}</span>` : '<span class="qs-off">—</span>';
  const extra = st.find(f => f.t === 'enum' && f.role !== 'si' && f.role !== 'rsvd');
  if (extra && extraSep) {
    extraSep.style.display = ''; extraLbl.style.display = '';
    extraLbl.textContent = extra.court;
    extraEl.innerHTML = `<span class="qs-freqlim">${esc(valeurDe(extra, bytes, etat.n).txt)}</span>`;
  } else cacherExtra();
}

// ── Address panel ─────────────────────────────────────
function updateAddressPanel(addr, def) {
  setText('addr-hex', '0x' + hex2(addr));
  setText('addr-dec', addr.toString(10));
  setText('addr-bin', addr.toString(2).padStart(8, '0') + 'b');
  const idx = window.CSDB_INDEX ? window.CSDB_INDEX(addr) : null;
  setText('addr-name', def ? def.nom : idx || '(inconnu)', def ? 'accent' : 'dim');
  setText('addr-system', def ? def.sys : '—');
  setText('addr-db', def ? (def.sync ? `bloc de ${etat.n} octets A5` : `${etat.n - 2} octets (bloc de ${etat.n}${Array.isArray(def.n) ? ', 6 ou 8 selon le bus' : ''})`) : '—');
  setText('addr-desc', def ? def.desc : '—', 'dim');
  const bus = def ? busDe(addr) : [];
  setText('addr-bus', bus.length ? bus.map(b => `${b.nom} (${typeof b.cadence === 'number' ? b.cadence + '/s' : b.cadence})`).join(' · ') : '—', bus.length ? '' : 'dim');
  setText('addr-page', def ? `page ${def.p} (Commercial Standard Digital Bus, GAMA, 9e éd.)` : '—', 'dim');
}

// ── Status panel ──────────────────────────────────────
function libelleBits(f) {
  if (f.t === 'bit') return `Bit ${f.b}`;
  const bits = f.p.flatMap(([, hi, lo]) => hi === lo ? [hi] : [hi + '-' + lo]);
  return (bits.length === 1 && !String(bits[0]).includes('-') ? 'Bit ' : 'Bits ') + bits.join(', ');
}
function updateStatusPanel(statusByte, addr, def) {
  const body = document.getElementById('status-panel-body');
  if (statusByte === null) { body.innerHTML = row('—', 'Aucun octet de statut', 'dim'); return; }
  const brut = row('Brut', '0x' + hex2(statusByte) + ' = ' + statusByte.toString(2).padStart(8, '0') + 'b', 'dim');
  if (def && def.sync) { body.innerHTML = row('—', 'Bloc de synchronisation : pas de statut', 'dim'); return; }
  if (!def) {
    const v = b => (statusByte >> b) & 1;
    body.innerHTML =
      row('Bit 7 — Données #1 valides', v(7) ? '1  OUI' : '0  NON', v(7) ? 'ok' : 'dim') +
      row('Bit 6 — Données #2 valides', v(6) ? '1  OUI' : '0  NON', v(6) ? 'ok' : 'dim') +
      row('Bit 5 — Données #3 valides', v(5) ? '1  OUI' : '0  NON', v(5) ? 'ok' : 'dim') +
      row('Bits 4-3 — Mode', `${v(4)}${v(3)}`, '') +
      row('Bit 2 — Test', v(2) ? '1  TEST' : '0  NORMAL', v(2) ? 'err' : '') +
      row('Bits 1-0 — Source', ['INCONNU', 'UNITÉ #1', 'UNITÉ #2', 'UNITÉ #3'][statusByte & 3], 'accent') + brut +
      row('⚠ Disposition', 'Standard (manuel p. 11) : adresse sans définition détaillée.', 'dim');
    return;
  }
  const champs1 = etat.champs.filter(f => (f.t === 'bit' && f.o === 1) || (f.p && f.p.every(p => p[0] === 1)) || (f.octs && f.octs.includes(1)));
  let html = def.sansStatut ? row('Octet 1', 'pas un statut : il porte des données', 'dim') : '';
  for (const f of champs1) {
    const r = valeurDe(f, currentBytes, etat.n);
    if (f.t === 'bit') {
      const on = r.v === 1;
      const cls = on ? (f.role === 'test' ? 'err' : f.role === 'val' ? 'ok' : 'accent') : (f.role === 'val' ? 'err' : 'dim');
      html += row(`${libelleBits(f)} — ${esc(f.court)}`, `${r.v} — ${esc(f.nom)} : ${esc(r.txt)}`, cls);
    } else if (f.t === 'msgs') {
      html += row(`Octet 1 — ${esc(f.court)}`, esc(r.txt), r.ok ? 'accent' : 'dim');
    } else {
      html += row(`${f.p ? libelleBits(f) : 'Octet 1'} — ${esc(f.court)}`, `${r.brut}b = ${esc(r.txt)}`, f.role === 'si' ? 'accent' : '');
    }
  }
  const occupes = new Set();
  champs1.forEach(f => f.t === 'bit' ? occupes.add(f.b) : (f.p || []).forEach(([o, hi, lo]) => { if (o === 1) for (let b = lo; b <= hi; b++) occupes.add(b); }));
  const pads = [7, 6, 5, 4, 3, 2, 1, 0].filter(b => !occupes.has(b));
  if (pads.length && !(champs1.some(f => f.octs && f.octs.includes(1)))) html += row(`Bit${pads.length > 1 ? 's' : ''} ${pads.join(', ')}`, 'PAD', 'dim');
  body.innerHTML = html + brut;
}

// ── Data panel ────────────────────────────────────────
function updateDataPanel(dataBytes, addr, def) {
  const body = document.getElementById('data-panel-body');
  if (!dataBytes.length) { body.innerHTML = row('—', 'Aucun octet de données', 'dim'); return; }
  let html = '';
  dataBytes.forEach((b, i) => {
    html += `<div class="detail-row">
      <span class="detail-key">Octet ${i + 2} — Données #${i + 1}</span>
      <span class="detail-val"><span class="data-color">0x${hex2(b)}</span>
        <span class="bin-gris">${b.toString(2).padStart(8, '0')}b</span></span>
    </div>`;
  });
  if (def && !def.sync) {
    const champs = etat.champs.filter(f => !((f.t === 'bit' && f.o === 1) || (f.p && f.p.every(p => p[0] === 1)) || (f.octs && f.octs.includes(1) && f.octs.length === 1)));
    for (const f of champs) {
      const r = valeurDe(f, currentBytes, etat.n);
      const v = validiteDe(f, etat.champs, currentBytes);
      const suite = v === 0 ? ' — drapeau de validité à 0' : '';
      const val = (r.html && f.t === 'mkr' ? r.html : esc(r.txt)) + (f.note ? '' : '') + `<span class="bin-gris"> ${esc(r.brut || '')}</span>` + suite;
      html += `<div class="detail-row"><span class="detail-key">${esc(f.nom)}</span><span class="detail-val ${f.t === 'somme' ? (r.ok ? 'ok' : 'err') : r.ok && v !== 0 ? 'ok' : 'dim'}">${val}</span></div>`;
    }
  }
  body.innerHTML = html;
}

// ── Catalog highlight ─────────────────────────────────
function highlightCatalogRow(addr) {
  document.querySelectorAll('#addr-catalog-body tr.tr-current').forEach(el => el.classList.remove('tr-current'));
  const r = document.getElementById(`cat-row-${addr}`);
  if (r) {
    r.classList.add('tr-current');
    if (addr !== lastHighlightedAddr) {
      r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      lastHighlightedAddr = addr;
    }
  }
}

// ── Catalog table population : toutes les adresses définies du manuel ──
function populateCatalog() {
  const tbody = document.getElementById('addr-catalog-body');
  if (!tbody) return;
  Object.keys(DEFS).map(Number).sort((a, b) => a - b).forEach(n => {
    const def = DEFS[n];
    const tr = document.createElement('tr');
    tr.id = `cat-row-${n}`;
    const bus = busDe(n).map(b => b.nom).join(', ');
    tr.innerHTML = `<td>0x${hex2(n)}</td>
      <td class="cat-nom">${esc(def.nom)}</td>
      <td class="cat-sys">${esc(def.sys)}</td>
      <td class="cat-desc">${esc(def.desc)}${bus ? `<br><small>${esc(bus)}</small>` : ''} <small>· p. ${def.p}</small></td>`;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => loadExample(def.ex || `${hex2(n)} 80 00 00 00 00`));
    tbody.appendChild(tr);
  });
}

// ── Helpers ───────────────────────────────────────────
function row(key, val, cls = '') {
  return `<div class="detail-row">
    <span class="detail-key">${key}</span>
    <span class="detail-val ${cls}">${val}</span>
  </div>`;
}

function setText(id, text, cls = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'detail-val' + (cls ? ' ' + cls : '');
}

function clearPanels() {
  lastHighlightedAddr = -1;
  document.getElementById('banner-addr-box').textContent = '0x--';
  document.getElementById('banner-name').textContent = '—';
  document.getElementById('banner-sub').textContent  = '—';
  document.getElementById('banner-values').innerHTML = '';
  document.getElementById('qs-valid').innerHTML = '<span class="qs-off">—</span>';
  document.getElementById('qs-si').innerHTML    = '<span class="qs-off">—</span>';
  ['addr-hex','addr-dec','addr-bin','addr-name','addr-system','addr-db','addr-desc','addr-bus','addr-page']
    .forEach(id => setText(id, '—', 'dim'));
  document.getElementById('status-panel-body').innerHTML = row('—', 'En attente', 'dim');
  document.getElementById('data-panel-body').innerHTML   = row('—', 'En attente', 'dim');
}

// ── Tab switching ─────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('tab-active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('tab-active', p.id === `tab-${name}`));
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  populateCatalog();

  const inp = document.getElementById('hex-input');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') decodeFromInput(); });

  // Afficher le bloc par défaut (tous les bits à 0) sans défiler vers le catalogue
  const defaultBytes = [0, 0, 0, 0, 0, 0];
  lastHighlightedAddr = defaultBytes[0]; // empêche scrollIntoView au chargement
  document.getElementById('hex-input').value = '00 00 00 00 00 00';
  decodeBlock(defaultBytes);
});
