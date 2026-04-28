// ════════════════════════════════════════════════════
//  Décodeur CSDB (Collins Serial Data Bus)
// ════════════════════════════════════════════════════
// ----------------------------------------------------
// Sécurité : vérifier la connexion et les permissions
const _permsCSDB = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || (!_permsCSDB.includes('csdb') && !_permsCSDB.includes('informatique') && sessionStorage.getItem('userRole') !== 'admin')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

let currentWord = null;

// ── Label reference data ────────────────────────────
// CSDB labels use the same 3-digit octal system as ARINC 429.
// The 8-bit label field (bits 1-8) is transmitted LSB-first,
// so the bits must be reversed to obtain the octal label value.
const CSDB_LABELS = [
  { oct: '000', enc: 'DIS', param: 'Null Word',                    unit: '' },
  { oct: '001', enc: 'BCD', param: 'Fréquence Active',             unit: 'MHz' },
  { oct: '002', enc: 'BCD', param: 'Fréquence Standby',            unit: 'MHz' },
  { oct: '003', enc: 'DIS', param: 'Volume/Squelch Control',       unit: '' },
  { oct: '004', enc: 'DIS', param: 'Audio Select',                 unit: '' },
  { oct: '005', enc: 'DIS', param: 'Squelch Status',               unit: '' },
  { oct: '030', enc: 'BCD', param: 'Fréquence VHF COM',            unit: 'MHz' },
  { oct: '033', enc: 'BCD', param: 'Fréquence ILS Localizer',      unit: 'MHz' },
  { oct: '034', enc: 'BCD', param: 'Fréquence VOR/ILS',            unit: 'MHz' },
  { oct: '035', enc: 'BCD', param: 'Fréquence DME',                unit: 'MHz' },
  { oct: '100', enc: 'BNR', param: 'Heading Select',               unit: 'deg' },
  { oct: '101', enc: 'BNR', param: 'Course Select',                unit: 'deg' },
  { oct: '125', enc: 'BCD', param: 'UTC Time',                     unit: 'hr:min' },
  { oct: '177', enc: 'DIS', param: 'Maintenance Word',             unit: '' },
  { oct: '377', enc: 'DIS', param: 'Null/End Frame',               unit: '' },
];

// Pre-compute hex/dec for each label
CSDB_LABELS.forEach(l => {
  const dec = parseInt(l.oct, 8);
  l.hex = dec.toString(16).toUpperCase().padStart(2, '0');
  l.dec = dec;
});

// ── State ────────────────────────────────────────────
let currentWordCSDB = null;

// ── Bit-reversal helper ──────────────────────────────
// Reverse the 8 label bits (bits 1-8) to get the true octal label value.
// CSDB transmits LSB first, so the raw label byte must be bit-reversed.
function reverseBits8(b) {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    if (b & (1 << i)) result |= (1 << (7 - i));
  }
  return result;
}

// ── Parity helper ────────────────────────────────────
// Counts the number of set bits in a 16-bit word.
// CSDB uses odd parity: total number of 1-bits in the word must be odd.
function countBits16(w) {
  let c = 0;
  let v = w & 0xFFFF;
  while (v) { c += v & 1; v >>>= 1; }
  return c;
}

// ── Main decode ──────────────────────────────────────
function decodeCSDB(word) {
  word = word & 0xFFFF;
  currentWordCSDB = word;

  // Extract fields
  const labelBits = word & 0xFF;           // bits 1-8  (raw, LSB-first)
  const dataBits  = (word >> 8) & 0x7F;   // bits 9-15
  const parityBit = (word >> 15) & 1;     // bit 16

  // Bit-reverse label byte to get actual octal label
  const labelVal   = reverseBits8(labelBits);
  const labelOctal = labelVal.toString(8).padStart(3, '0');

  // Parity check (odd parity: total 1-bits must be odd)
  const bitCount = countBits16(word);
  const parityOk = (bitCount % 2 === 1);

  // Look up label info
  const labelInfo = CSDB_LABELS.find(l => l.oct === labelOctal) || null;

  // Update all display sections
  updateBitDisplay(word);
  updateLabelPanel(labelOctal, labelVal, labelInfo);
  updateDataPanel(dataBits, labelInfo);
  updateParityPanel(parityBit, parityOk);
  updateLabelBanner(labelOctal, labelInfo, dataBits);
}

// ── Input handler ─────────────────────────────────────
function decodeFromInput() {
  const raw = document.getElementById('hex-input').value.trim();
  const errEl = document.getElementById('error-msg');

  if (raw === '') {
    errEl.textContent = 'Entrez 1 à 4 chiffres hexadécimaux.';
    return;
  }
  if (!/^[0-9a-fA-F]{1,4}$/.test(raw)) {
    errEl.textContent = 'Valeur hexadécimale invalide (1-4 caractères: 0-9, A-F).';
    return;
  }
  errEl.textContent = '';
  const word = parseInt(raw.padStart(4, '0'), 16);
  decodeCSDB(word);
}

function resetToZero() {
  document.getElementById('hex-input').value = '';
  document.getElementById('error-msg').textContent = '';
  decodeCSDB(0x0000);
}

// ── Bit display rendering ─────────────────────────────
// 16 cells: bit 16 on the left (index 0), bit 1 on the right (index 15).
function renderBits(word) {
  const container = document.getElementById('bit-display');
  container.innerHTML = '';

  for (let i = 15; i >= 0; i--) {
    const bitNum  = i + 1;          // bit number 1-16
    const bitVal  = (word >> i) & 1;

    let cls;
    if (bitNum === 16)              cls = 'bit-parity';
    else if (bitNum >= 9)           cls = 'bit-data';
    else                            cls = 'bit-label';

    const wrapper = document.createElement('div');
    wrapper.className = 'bit-wrapper';

    const numEl = document.createElement('div');
    numEl.className = 'bit-num';
    numEl.textContent = bitNum;

    const cell = document.createElement('div');
    cell.className = `bit-cell ${cls}`;
    cell.textContent = bitVal;
    cell.title = `Bit ${bitNum}`;

    // Click to toggle bit and re-decode
    cell.addEventListener('click', () => {
      const toggled = currentWordCSDB ^ (1 << i);
      document.getElementById('hex-input').value = toggled.toString(16).toUpperCase().padStart(4, '0');
      document.getElementById('error-msg').textContent = '';
      decodeCSDB(toggled);
    });

    wrapper.appendChild(numEl);
    wrapper.appendChild(cell);
    container.appendChild(wrapper);
  }
}

// ── Field map rendering ───────────────────────────────
// 3 colored segments spanning the 16-column grid.
function renderFieldMap(word) {
  const container = document.getElementById('field-map');
  container.innerHTML = '';

  // Segment: Parité — bit 16 (column 1)
  const segParity = document.createElement('div');
  segParity.className = 'fmap-seg fmap-parity';
  segParity.style.gridColumn = '1 / span 1';
  segParity.textContent = 'Parité 16';
  container.appendChild(segParity);

  // Segment: Données — bits 9-15 (columns 2-8, 7 bits)
  const segData = document.createElement('div');
  segData.className = 'fmap-seg fmap-bcd';
  segData.style.gridColumn = '2 / span 7';
  segData.textContent = 'Données 9-15';
  container.appendChild(segData);

  // Segment: Étiquette — bits 1-8 (columns 9-16, 8 bits)
  const segLabel = document.createElement('div');
  segLabel.className = 'fmap-seg fmap-label';
  segLabel.style.gridColumn = '9 / span 8';
  segLabel.textContent = 'Étiquette 1-8';
  container.appendChild(segLabel);
}

// ── Combined update ───────────────────────────────────
function updateBitDisplay(word) {
  renderBits(word);
  renderFieldMap(word);
}

// ── Label banner ──────────────────────────────────────
function updateLabelBanner(labelOctal, labelInfo, dataBits) {
  document.getElementById('banner-oct').textContent  = labelOctal;
  document.getElementById('banner-name').textContent = labelInfo ? labelInfo.param : 'Étiquette inconnue';
  document.getElementById('banner-sub').textContent  = labelInfo
    ? `Format : ${labelInfo.enc}  •  Unité : ${labelInfo.unit || '—'}`
    : 'Non répertoriée dans la base CSDB';

  // Decoded value for the banner
  let bannerVal = '—';
  if (labelInfo && labelInfo.enc === 'BCD') {
    bannerVal = `0x${dataBits.toString(16).toUpperCase().padStart(2, '0')}`;
  } else if (labelInfo && labelInfo.enc === 'BNR') {
    bannerVal = dataBits.toString(10);
  } else if (labelInfo && labelInfo.enc === 'DIS') {
    bannerVal = `0b${dataBits.toString(2).padStart(7, '0')}`;
  }
  document.getElementById('banner-value').textContent = bannerVal;
}

// ── Parity panel ──────────────────────────────────────
function updateParityPanel(parityBit, parityOk) {
  const parityEl  = document.getElementById('d-parity-bit');
  const checkEl   = document.getElementById('d-parity-check');
  const typeEl    = document.getElementById('d-parity-type');

  parityEl.textContent  = parityBit;
  checkEl.textContent   = parityOk ? 'OK' : 'ERR';
  checkEl.className     = 'detail-val ' + (parityOk ? 'ok' : 'err');
  typeEl.textContent    = 'Parité impaire (odd)';
}

// ── Data panel ────────────────────────────────────────
function updateDataPanel(dataBits, labelInfo) {
  document.getElementById('d-data-bin').textContent     = dataBits.toString(2).padStart(7, '0');
  document.getElementById('d-data-dec').textContent     = dataBits.toString(10);
  document.getElementById('d-data-hex').textContent     = '0x' + dataBits.toString(16).toUpperCase().padStart(2, '0');

  let decoded = '—';
  let fmt     = labelInfo ? labelInfo.enc : '—';

  if (labelInfo) {
    if (labelInfo.enc === 'BCD') {
      // Simple BCD: treat 7 bits as two nibble-like groups (high 3 + low 4)
      const hi = (dataBits >> 4) & 0x7;
      const lo =  dataBits       & 0xF;
      if (lo <= 9) {
        decoded = `${hi}${lo}`;
        if (labelInfo.unit === 'MHz') decoded += ' MHz (mantisse BCD)';
        if (labelInfo.unit === 'hr:min') decoded = `(valeur BCD brute) ${hi}${lo}`;
      } else {
        decoded = '(invalide BCD)';
      }
      fmt = 'BCD';
    } else if (labelInfo.enc === 'BNR') {
      // BNR: treat 7 bits as signed (2's complement with 6 sig bits + sign)
      const sign = (dataBits >> 6) & 1;
      const mag  = dataBits & 0x3F;
      const val  = sign ? (mag - 64) : mag;
      decoded    = `${val} ${labelInfo.unit}`;
      fmt        = 'BNR (binaire signé)';
    } else if (labelInfo.enc === 'DIS') {
      decoded = `0b${dataBits.toString(2).padStart(7, '0')}`;
      fmt     = 'DIS (discrets)';
    }
  }

  document.getElementById('d-data-decoded').textContent = decoded;
  document.getElementById('d-data-format').textContent  = fmt;
}

// ── Label panel ───────────────────────────────────────
function updateLabelPanel(labelOctal, labelVal, labelInfo) {
  // Octal digit boxes
  const digits = labelOctal.split('');          // ['0','3','3'] etc.
  document.getElementById('d-label-msb').textContent = digits[0];
  document.getElementById('d-label-med').textContent = digits[1];
  document.getElementById('d-label-lsb').textContent = digits[2];

  document.getElementById('d-label-oct').textContent  = labelOctal;
  document.getElementById('d-label-dec').textContent  = labelVal.toString(10);
  document.getElementById('d-label-hex').textContent  = '0x' + labelVal.toString(16).toUpperCase().padStart(2, '0');
  document.getElementById('d-label-bin').textContent  = labelVal.toString(2).padStart(8, '0');
  document.getElementById('d-label-name').textContent = labelInfo ? labelInfo.param : '(inconnu)';
}

// ── Enter key shortcut ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('hex-input');
  if (inp) {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') decodeFromInput();
    });
  }
  // Initialise with all-zeros word
  decodeCSDB(0x0000);
});
