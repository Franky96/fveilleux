// ════════════════════════════════════════════════════
//  Décodeur ARINC 429
// ════════════════════════════════════════════════════

// Sécurité : vérifier la connexion et les permissions
const _permsArinc = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || (!_permsArinc.includes('arinc429') && sessionStorage.getItem('userRole') !== 'admin')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

let currentWord = null;

// ── Label reference data ────────────────────────────
const LABELS = [
  { oct: '002', enc: 'BNR', param: 'Temps UTC (décimale)',              unit: 'sec' },
  { oct: '010', enc: 'BNR', param: 'Latitude',                          unit: 'deg' },
  { oct: '011', enc: 'BNR', param: 'Longitude',                         unit: 'deg' },
  { oct: '012', enc: 'BNR', param: 'Vitesse sol (Ground Speed)',         unit: 'kt' },
  { oct: '013', enc: 'BNR', param: 'Route vraie (Track Angle True)',     unit: 'deg' },
  { oct: '014', enc: 'BNR', param: 'Vitesse verticale vraie',            unit: 'ft/min' },
  { oct: '020', enc: 'BNR', param: 'Cap magnétique (Magnetic Heading)',  unit: 'deg' },
  { oct: '021', enc: 'BNR', param: 'Cap vrai (True Heading)',            unit: 'deg' },
  { oct: '030', enc: 'BNR', param: 'Tangage (Pitch Attitude)',           unit: 'deg' },
  { oct: '031', enc: 'BNR', param: 'Roulis (Roll Attitude)',             unit: 'deg' },
  { oct: '032', enc: 'BNR', param: 'Taux de tangage (Pitch Rate)',       unit: 'deg/s' },
  { oct: '033', enc: 'BNR', param: 'Taux de roulis (Roll Rate)',         unit: 'deg/s' },
  { oct: '034', enc: 'BNR', param: 'Taux de lacet (Yaw Rate)',           unit: 'deg/s' },
  { oct: '100', enc: 'BNR', param: 'Altitude baro corrigée',             unit: 'ft' },
  { oct: '101', enc: 'BNR', param: 'Altitude pression',                  unit: 'ft' },
  { oct: '102', enc: 'BNR', param: 'Taux de variation d\'altitude',      unit: 'ft/min' },
  { oct: '103', enc: 'BNR', param: 'Vitesse indiquée (CAS)',             unit: 'kt' },
  { oct: '104', enc: 'BNR', param: 'Vitesse vraie (TAS)',                unit: 'kt' },
  { oct: '105', enc: 'BNR', param: 'Nombre de Mach',                     unit: 'Mach' },
  { oct: '106', enc: 'BNR', param: 'Température totale (TAT)',           unit: '°C' },
  { oct: '107', enc: 'BNR', param: 'Température statique (SAT)',         unit: '°C' },
  { oct: '113', enc: 'BNR', param: 'Angle d\'attaque (AOA)',             unit: 'deg' },
  { oct: '114', enc: 'BNR', param: 'Débit carburant',                    unit: 'lb/h' },
  { oct: '120', enc: 'BNR', param: 'Pression statique',                  unit: 'PSI' },
  { oct: '130', enc: 'BNR', param: 'Altitude radio (Radio Height)',      unit: 'ft' },
  { oct: '150', enc: 'BNR', param: 'Distance VOR/DME',                   unit: 'nm' },
  { oct: '151', enc: 'BNR', param: 'Relèvement VOR',                     unit: 'deg' },
  { oct: '152', enc: 'BNR', param: 'Vitesse de rapprochement DME',       unit: 'kt' },
  { oct: '157', enc: 'BNR', param: 'Déviation ILS Localizer',            unit: 'DDM' },
  { oct: '160', enc: 'BNR', param: 'Déviation ILS Glide Slope',          unit: 'DDM' },
  { oct: '161', enc: 'BNR', param: 'Distance ILS/DME',                   unit: 'nm' },
  { oct: '174', enc: 'BNR', param: 'Altitude cible (sélectée)',          unit: 'ft' },
  { oct: '203', enc: 'BNR', param: 'Distance station (DME)',             unit: 'nm' },
  { oct: '210', enc: 'BNR', param: 'Hauteur radio (Radio Altitude)',     unit: 'ft' },
  { oct: '212', enc: 'BNR', param: 'Déclinaison magnétique',             unit: 'deg' },
  { oct: '213', enc: 'BNR', param: 'Déviation latérale LNAV',           unit: 'nm' },
  { oct: '214', enc: 'BNR', param: 'Déviation verticale VNAV',          unit: 'ft' },
  { oct: '270', enc: 'BNR', param: 'Distance au waypoint',               unit: 'nm' },
  { oct: '271', enc: 'BNR', param: 'Temps au waypoint',                  unit: 'min' },
  { oct: '300', enc: 'DIS', param: 'État équipement (Equipment Status)', unit: '—' },
  { oct: '312', enc: 'DIS', param: 'Mode engagement pilote automatique', unit: '—' },
  { oct: '350', enc: 'BNR', param: 'Heure UTC',                          unit: 'h/min/s' },
  { oct: '351', enc: 'BCD', param: 'Date (jour/mois)',                   unit: '—' },
  { oct: '352', enc: 'BCD', param: 'Année UTC',                          unit: '—' },
  { oct: '356', enc: 'BNR', param: 'Poids au décollage (TOW)',           unit: 'kg' },
  { oct: '361', enc: 'DIS', param: 'État train d\'atterrissage',         unit: '—' },
  { oct: '364', enc: 'BNR', param: 'Angle de braquage volets',           unit: 'deg' },
  { oct: '370', enc: 'DIS', param: 'Mot d\'état discret',                unit: '—' },
  { oct: '371', enc: 'DIS', param: 'Mot de maintenance',                 unit: '—' },
  { oct: '377', enc: 'DIS', param: 'Adresse équipement',                 unit: '—' },
];

// Pre-compute hex for each label
LABELS.forEach(l => {
  const dec = parseInt(l.oct, 8);
  l.hex = dec.toString(16).toUpperCase().padStart(2, '0');
  l.dec = dec;
});

// ── Bit helpers ─────────────────────────────────────

// ARINC 429: bit 1 = LSB (rightmost), bit 32 = MSB (leftmost)
function getBit(word, bitNum) {
  return (word >>> (bitNum - 1)) & 1;
}

function setBitVal(word, bitNum, val) {
  const mask = 1 << (bitNum - 1);
  return val ? ((word | mask) >>> 0) : ((word & ~mask) >>> 0);
}

// The label (bits 1-8) is transmitted LSB-first, so the actual label octal
// value is the bit-reverse of those 8 bits.
function reverseBits8(byte) {
  let r = 0;
  for (let i = 0; i < 8; i++) r |= ((byte >> i) & 1) << (7 - i);
  return r;
}

function popCount(n) {
  let c = 0, v = n >>> 0;
  while (v) { c += v & 1; v >>>= 1; }
  return c;
}

function getBitClass(bitNum) {
  if (bitNum === 32)                    return 'bit-parity';
  if (bitNum >= 30 && bitNum <= 31)     return 'bit-ssm';
  if (bitNum >= 11 && bitNum <= 29)     return 'bit-data';
  if (bitNum >= 9  && bitNum <= 10)     return 'bit-sdi';
  return 'bit-label';                   // bits 1-8
}

// ── Rendering ───────────────────────────────────────

function renderBits(word) {
  const container = document.getElementById('bit-display');
  container.innerHTML = '';

  // Display bit 32 (left) → bit 1 (right)
  for (let bitNum = 32; bitNum >= 1; bitNum--) {
    const val = getBit(word, bitNum);
    const cls = getBitClass(bitNum);

    const wrapper = document.createElement('div');
    wrapper.className = 'bit-wrapper';

    const numEl = document.createElement('div');
    numEl.className = 'bit-num';
    numEl.textContent = bitNum;

    const cell = document.createElement('div');
    cell.className = `bit-cell ${cls}`;
    cell.textContent = val;
    cell.dataset.bit = bitNum;
    cell.title = `Bit ${bitNum} — clic pour basculer`;
    cell.addEventListener('click', () => toggleBit(bitNum));

    wrapper.appendChild(numEl);
    wrapper.appendChild(cell);
    container.appendChild(wrapper);
  }
}

function renderFields(word) {
  // ── Label (bits 1-8, reversed) ──
  const labelRaw = word & 0xFF;
  const labelVal = reverseBits8(labelRaw);
  const labelOct = labelVal.toString(8).padStart(3, '0');
  const labelHex = labelVal.toString(16).toUpperCase().padStart(2, '0');
  document.getElementById('field-label-val').textContent = labelOct;
  document.getElementById('field-label-sub').textContent = `octal · 0x${labelHex} · ${labelRaw.toString(2).padStart(8,'0')} (brut)`;

  // ── SDI (bits 9-10) ──
  const sdi = (word >> 8) & 0x3;
  const sdiDesc = [
    'Toutes stations / non utilisé',
    'Station 1',
    'Station 2',
    'Station 3',
  ];
  document.getElementById('field-sdi-val').textContent = sdi.toString(2).padStart(2, '0');
  document.getElementById('field-sdi-sub').textContent = sdiDesc[sdi];

  // ── Data (bits 11-29, 19 bits) ──
  const data19 = (word >> 10) & 0x7FFFF;
  document.getElementById('field-data-val').textContent = '0x' + data19.toString(16).toUpperCase().padStart(5, '0');
  document.getElementById('field-data-sub').textContent = data19.toString(2).padStart(19, '0');

  // ── SSM (bits 30-31) ──
  const ssm = (word >> 29) & 0x3;
  const ssmDesc = {
    '00': 'Failure Warning / Plus',
    '01': 'No Computed Data / North / East / Right / To',
    '10': 'Functional Test / South / West / Left / From',
    '11': 'Normal Operation / Minus',
  };
  const ssmBin = ssm.toString(2).padStart(2, '0');
  document.getElementById('field-ssm-val').textContent = ssmBin;
  document.getElementById('field-ssm-sub').textContent = ssmDesc[ssmBin];

  // ── Parity (bit 32) — odd parity ──
  const parity = (word >>> 31) & 1;
  const ones = popCount(word);
  const parityOk = (ones % 2 === 1);
  const parityEl = document.getElementById('field-parity-val');
  parityEl.textContent = parity;
  parityEl.className = 'field-value ' + (parityOk ? 'parity-ok' : 'parity-err');
  document.getElementById('field-parity-sub').textContent = parityOk ? '✓ Parité impaire OK' : '✗ Erreur de parité';

  document.getElementById('decoded-fields').style.display = 'grid';
  document.getElementById('interp-section').style.display = 'block';
}

function renderInterp(word) {
  const data19 = (word >> 10) & 0x7FFFF;
  const dataBin = data19.toString(2).padStart(19, '0');

  // BNR
  document.getElementById('bnr-bits').textContent = dataBin;
  document.getElementById('bnr-unsigned').textContent = data19;
  const signed = (data19 & (1 << 18)) ? data19 - (1 << 19) : data19;
  document.getElementById('bnr-signed').textContent = signed;
  document.getElementById('bnr-resolved').textContent = (signed / (1 << 10)).toFixed(6);

  // BCD — 4 groups of 4 bits + 3 remaining = 4+4+4+4+3
  document.getElementById('bcd-bits').textContent = dataBin;
  const groups = [];
  for (let i = 0; i < 19; i += 4) groups.push(dataBin.substring(i, Math.min(i + 4, 19)));
  document.getElementById('bcd-groups').textContent = groups.join(' | ');
  let bcdStr = '';
  let bcdValid = true;
  groups.forEach(g => {
    const d = parseInt(g, 2);
    if (g.length === 4 && d > 9) bcdValid = false;
    bcdStr += g.length < 4 ? `(${d})` : d.toString();
  });
  document.getElementById('bcd-value').textContent = bcdValid ? bcdStr : bcdStr + '  ⚠ chiffre > 9 invalide';

  // Discrete
  document.getElementById('dis-bits').textContent = dataBin;
  document.getElementById('dis-hex').textContent = '0x' + data19.toString(16).toUpperCase().padStart(5, '0');
  document.getElementById('dis-dec').textContent = data19;
}

function highlightRefTable(word) {
  const labelOct = reverseBits8(word & 0xFF).toString(8).padStart(3, '0');
  document.querySelectorAll('#ref-tbody tr').forEach(row => {
    row.classList.toggle('highlighted', row.dataset.oct === labelOct);
    if (row.dataset.oct === labelOct) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

// ── Actions ─────────────────────────────────────────

function decodeFromInput() {
  const raw = document.getElementById('hex-input').value.trim().replace(/^0x/i, '');
  const errEl = document.getElementById('error-msg');

  if (!/^[0-9A-Fa-f]{1,8}$/.test(raw)) {
    errEl.textContent = 'Valeur invalide — entrez 1 à 8 chiffres hexadécimaux (ex : A0001234)';
    return;
  }
  errEl.textContent = '';

  currentWord = parseInt(raw.padStart(8, '0'), 16) >>> 0;
  renderBits(currentWord);
  renderFields(currentWord);
  renderInterp(currentWord);
  highlightRefTable(currentWord);
}

function toggleBit(bitNum) {
  if (currentWord === null) return;
  const cur = getBit(currentWord, bitNum);
  currentWord = setBitVal(currentWord, bitNum, cur ? 0 : 1);
  document.getElementById('hex-input').value =
    currentWord.toString(16).toUpperCase().padStart(8, '0');
  renderBits(currentWord);
  renderFields(currentWord);
  renderInterp(currentWord);
  highlightRefTable(currentWord);
}

function switchTab(tab) {
  document.querySelectorAll('.interp-tab').forEach((btn, i) => {
    btn.classList.toggle('active', ['bnr', 'bcd', 'dis'][i] === tab);
  });
  document.querySelectorAll('.interp-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tab}`);
  });
}

function filtrerLabels() {
  const q = document.getElementById('ref-search').value.toLowerCase();
  document.querySelectorAll('#ref-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── Build reference table ────────────────────────────

function buildRefTable() {
  const tbody = document.getElementById('ref-tbody');
  const encClass = { BNR: 'enc-bnr', BCD: 'enc-bcd', DIS: 'enc-dis' };
  LABELS.forEach(l => {
    const tr = document.createElement('tr');
    tr.dataset.oct = l.oct;
    tr.innerHTML =
      `<td><span class="label-octal">${l.oct}</span></td>` +
      `<td><span class="label-hex">0x${l.hex}</span></td>` +
      `<td><span class="label-enc ${encClass[l.enc] || ''}">${l.enc}</span></td>` +
      `<td>${l.param}</td>` +
      `<td>${l.unit}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Init ─────────────────────────────────────────────

document.getElementById('hex-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') decodeFromInput();
});

buildRefTable();
