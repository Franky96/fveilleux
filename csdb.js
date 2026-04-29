// ════════════════════════════════════════════════════
//  Décodeur CSDB — Commercial Standard Digital Bus
//  GAMA Standard 523-0772774
// ════════════════════════════════════════════════════

const _permsCSDB = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') ||
    (!_permsCSDB.includes('csdb') && !_permsCSDB.includes('informatique') &&
     sessionStorage.getItem('userRole') !== 'admin')) {
  alert('Accès refusé.');
  window.location.href = 'dashboard.html';
}

// ── Catalogue des adresses (Section 4 & 5 du manuel) ─
const CSDB_ADDR = {
  0xA5: { name: 'SYNC',                        system: 'Bus',      db: 0, desc: 'Octet de synchronisation de trame — toujours 0xA5' },
  0x10: { name: 'VHF COMM FREQ',               system: 'VHF COMM', db: 4, desc: 'Fréquence active VHF COM (BCD, 0.001 MHz)' },
  0x11: { name: 'VHF COMM DATA',               system: 'VHF COMM', db: 4, desc: 'Données VHF COM — standby, XMT, squelch' },
  0x12: { name: 'VHF COMM FREQ (8.33 kHz)',    system: 'VHF COMM', db: 4, desc: 'Fréquence VHF COM — canaux 8.33 kHz' },
  0x13: { name: 'VHF COMM DATA (8.33 kHz)',    system: 'VHF COMM', db: 4, desc: 'Données VHF COM — canaux 8.33 kHz' },
  0x20: { name: 'NAV FREQ',                    system: 'NAV',      db: 4, desc: 'Fréquence NAV active (VOR/ILS)' },
  0x21: { name: 'VOR DATA',                    system: 'NAV',      db: 4, desc: 'Données VOR (cap, déviation)' },
  0x22: { name: 'ILS DATA',                    system: 'NAV',      db: 4, desc: 'Données ILS (localizer / glideslope)' },
  0x24: { name: 'DME FREQ',                    system: 'DME',      db: 4, desc: 'Fréquence DME active' },
  0x25: { name: 'DME FREQ & DIST',             system: 'DME',      db: 4, desc: 'Fréquence et distance DME' },
  0x26: { name: 'DME TTS & VEL',               system: 'DME',      db: 4, desc: 'Temps de transit et vitesse DME' },
  0x27: { name: 'DME IDENT',                   system: 'DME',      db: 4, desc: 'Identifiant de station DME' },
  0x2A: { name: 'STEER CMDS / ALT REF',        system: 'FCC',      db: 4, desc: 'Commandes de direction / référence altitude (FCC)' },
  0x2B: { name: 'ADF DATA',                    system: 'ADF',      db: 4, desc: 'Données ADF (relèvement, statut)' },
  0x2C: { name: 'ADF FREQ',                    system: 'ADF',      db: 4, desc: 'Fréquence ADF active' },
  0x30: { name: 'REMOTE NAV TUNE',             system: 'CDU',      db: 4, desc: 'Accord NAV à distance (CDU/FMS)' },
  0x31: { name: 'REMOTE COMM TUNE',            system: 'CDU',      db: 4, desc: 'Accord COMM à distance (CDU/FMS)' },
  0x32: { name: 'REMOTE ADF TUNE',             system: 'CDU',      db: 4, desc: 'Accord ADF à distance (CDU/FMS)' },
  0x33: { name: 'REMOTE ATC CODE',             system: 'CDU',      db: 4, desc: 'Code transpondeur ATC (CDU/FMS)' },
  0x34: { name: 'REMOTE DME TUNE',             system: 'CDU',      db: 4, desc: 'Accord DME à distance (CDU/FMS)' },
  0x39: { name: 'REMOTE HF TUNE (TX)',         system: 'CDU',      db: 4, desc: 'Accord HF émission (CDU/FMS)' },
  0x3A: { name: 'REMOTE HF TUNE (RX)',         system: 'CDU',      db: 4, desc: 'Accord HF réception (CDU/FMS)' },
  0x46: { name: 'HEADING, MAGNETIC',           system: 'AHRS',     db: 4, desc: 'Cap magnétique (complément à 2, degrés)' },
  0x70: { name: 'CRT ASCII MESSAGES',          system: 'FCC',      db: 4, desc: 'Messages ASCII pour affichage CRT (8 msg/trame)' },
  0x72: { name: 'VS / IAS / MACH REF',         system: 'FCC',      db: 4, desc: 'Références vitesse verticale, IAS, Mach' },
  0x73: { name: 'DELTA TORQUE / PWT STATUS',   system: 'FCC',      db: 4, desc: 'Couple différentiel et statut puissance' },
  0xA6: { name: 'SAT / VMO / MMO',             system: 'ADC',      db: 4, desc: 'Température air statique, vitesses maxi opérationnelles' },
  0xA7: { name: 'TAT / PRE-ALT',               system: 'ADC',      db: 4, desc: 'Température totale (TAT) et pré-sélection altitude' },
  0xAA: { name: 'FCS ANNUNCIATIONS',           system: 'FCC',      db: 4, desc: 'Annunciateurs du système de contrôle de vol' },
  0xAB: { name: 'FCS MODES',                   system: 'FCC',      db: 4, desc: 'Modes actifs du système de contrôle de vol' },
  0xB0: { name: 'PITCH CMD / VERT DEV',        system: 'FCC/VNI',  db: 4, desc: 'Commande tangage / déviation verticale' },
  0xB1: { name: 'DISTANCE TO TRK/ALT',         system: 'VNI',      db: 4, desc: 'Distance à la route / altitude cible' },
  0xB2: { name: 'SELECT ANGLE / COMP ANGLE',   system: 'VNI',      db: 4, desc: 'Angle sélecté / angle de comparaison' },
  0xB3: { name: 'AIMPOINT ALT / VS SELECT',    system: 'VNI',      db: 4, desc: 'Altitude cible / vitesse verticale sélectée' },
  0xC0: { name: 'EFIS CONTROL & STATUS',       system: 'DPU',      db: 4, desc: 'Contrôle et statut de l\'affichage EFIS' },
  0xC1: { name: 'HEADING / HDG ERROR',         system: 'DPU',      db: 4, desc: 'Cap / erreur de cap' },
  0xC2: { name: 'CRS ERROR (ACTV/NEXT)',       system: 'DPU',      db: 4, desc: 'Erreur de route — active et suivante' },
  0xC3: { name: 'RADIO ALTITUDE / DH',         system: 'DPU',      db: 4, desc: 'Radio-altitude et hauteur de décision (DH)' },
  0xC4: { name: 'FCS LAT/VERT DEV (ACTV)',     system: 'DPU',      db: 4, desc: 'Déviation latérale/verticale FCS — mode actif' },
  0xC5: { name: 'FCS LAT/VERT DEV (NEXT)',     system: 'DPU',      db: 4, desc: 'Déviation latérale/verticale FCS — mode suivant' },
  0xC6: { name: 'FCS ROLL/PITCH CMD (ACTV)',   system: 'DPU',      db: 4, desc: 'Commandes roulis/tangage FCC — mode actif' },
  0xC7: { name: 'LOCALIZER/GLIDESLOPE DEV',    system: 'DPU',      db: 4, desc: 'Déviation localizer et radiophare de descente' },
  0xC8: { name: 'FCS DISTANCE (ACTV/NEXT)',    system: 'DPU',      db: 4, desc: 'Distance FCC — active et suivante' },
  0xC9: { name: 'WIND VELOCITY/DIRECTION',     system: 'DPU',      db: 4, desc: 'Vitesse et direction du vent' },
  0xCA: { name: 'SELECT CRS (ACTV/NEXT)',      system: 'DPU',      db: 4, desc: 'Route sélectée — active et suivante' },
  0xCB: { name: 'JOYSTICK CURSOR POSITION',    system: 'MPU',      db: 4, desc: 'Position curseur joystick EFIS' },
  0xCC: { name: 'EFIS KEYSWITCH STATUS',       system: 'MPU',      db: 4, desc: 'État des claviers et commutateurs EFIS' },
  0xCD: { name: 'SELECT HDG (BUG)',            system: 'MPU',      db: 4, desc: 'Cap sélecté (bug de cap EFIS)' },
  0xCE: { name: 'MIN / MAX STALL SPEEDS',      system: 'DPU',      db: 4, desc: 'Vitesses de décrochage minimale et maximale' },
  0xF3: { name: 'DIAGNOSTICS',                 system: 'Tous',     db: 4, desc: 'Données de diagnostic du bus' },
  0xF5: { name: 'ASCII PAGE DATA',             system: 'NAV/DME',  db: 4, desc: 'Données de page ASCII (navigation / ident)' },
  0xFF: { name: 'NO USEFUL DATA',              system: 'Bus',      db: 4, desc: 'Trame de rembourrage sans donnée utile' },
};

// ── Status bit fields par adresse (standard sinon) ────
// Standard layout (Figure 4 du manuel) :
//   Bit 7 = DATA #1 VALID, Bit 6 = DATA #2 VALID, Bit 5 = DATA #3 VALID
//   Bits 4-3 = MODE (1=ON), Bit 2 = TEST (1=TEST), Bits 1-0 = SOURCE IDENT
const STATUS_FIELDS = {
  // Adresses VHF COMM FREQ (0x10, 0x12)
  0x10: [
    { bit:7, name:'FREQ VALID',   desc:'Fréquence valide' },
    { bit:6, name:'PAD',          desc:'—' },
    { bit:5, name:'XFR CTL',      desc:'Transfert freq (1=XFR)' },
    { bit:4, name:'SQLCH CTL',    desc:'Squelch (1=audio activé)' },
    { bit:3, name:'SI',           desc:'Side-tone ident' },
    { bit:2, name:'TEST CTL',     desc:'Test (1=TEST)' },
    { bit:1, name:'SOURCE',       desc:'Source ident (bit 1)' },
    { bit:0, name:'SI IDENT',     desc:'Source ident (bit 0)' },
  ],
  0x12: 'same:0x10',
  // Adresses VHF COMM DATA (0x11, 0x13)
  0x11: [
    { bit:7, name:'FREQ VALID',   desc:'Fréquence valide' },
    { bit:6, name:'FREQ LIM B',   desc:'Limite fréquence B' },
    { bit:5, name:'FREQ LIM A',   desc:'Limite fréquence A' },
    { bit:4, name:'XMIT IND',     desc:'Indicateur émission (1=ON)' },
    { bit:3, name:'SI',           desc:'Side-tone ident' },
    { bit:2, name:'SELF TEST',    desc:'Auto-test (1=ON)' },
    { bit:1, name:'SOURCE',       desc:'Source ident (bit 1)' },
    { bit:0, name:'SI IDENT',     desc:'Source ident (bit 0)' },
  ],
  0x13: 'same:0x11',
};

function getStatusFields(addr) {
  let f = STATUS_FIELDS[addr];
  if (typeof f === 'string' && f.startsWith('same:')) {
    f = STATUS_FIELDS[parseInt(f.slice(5))];
  }
  return f || null; // null = use standard layout
}

// ── Field map segments par octet ─────────────────────
// Chaque entrée = [{span, label, cls}, ...]  (total spans = 8)
const STATUS_FIELD_MAP = {
  standard: [
    { span:1, label:'V1',   cls:'csdb-fmap-valid' },
    { span:1, label:'V2',   cls:'csdb-fmap-valid' },
    { span:1, label:'V3',   cls:'csdb-fmap-valid' },
    { span:2, label:'MODE', cls:'csdb-fmap-mode'  },
    { span:1, label:'TEST', cls:'csdb-fmap-test'  },
    { span:2, label:'SRC',  cls:'csdb-fmap-src'   },
  ],
  0x10: [
    { span:1, label:'FV',  cls:'csdb-fmap-valid' },
    { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
    { span:1, label:'XFR', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'SQL', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'SI',  cls:'csdb-fmap-ctrl'  },
    { span:1, label:'TST', cls:'csdb-fmap-test'  },
    { span:2, label:'SRC', cls:'csdb-fmap-src'   },
  ],
  0x11: [
    { span:1, label:'FV',  cls:'csdb-fmap-valid' },
    { span:1, label:'FLB', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'FLA', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'XMT', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'SI',  cls:'csdb-fmap-ctrl'  },
    { span:1, label:'TST', cls:'csdb-fmap-test'  },
    { span:2, label:'SRC', cls:'csdb-fmap-src'   },
  ],
};
STATUS_FIELD_MAP[0x12] = STATUS_FIELD_MAP[0x10];
STATUS_FIELD_MAP[0x13] = STATUS_FIELD_MAP[0x11];

const DATA_FIELD_MAP = {
  // VHF COMM FREQ actif — BCD 0.001 MHz
  0x10: [
    [{ span:4, label:'0.01 MHz',  cls:'csdb-fmap-bcd' }, { span:4, label:'0.001 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'1 MHz',     cls:'csdb-fmap-bcd' }, { span:4, label:'0.1 MHz',   cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'100 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'10 MHz',    cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',       cls:'csdb-fmap-pad' }],
  ],
  // VHF COMM DATA — fréquence standby BCD
  0x11: [
    [{ span:4, label:'STBY 0.01',  cls:'csdb-fmap-bcd' }, { span:4, label:'STBY 0.001', cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'STBY 1 MHz', cls:'csdb-fmap-bcd' }, { span:4, label:'STBY 0.1',   cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'STBY 100',   cls:'csdb-fmap-bcd' }, { span:4, label:'STBY 10',     cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',        cls:'csdb-fmap-pad' }],
  ],
  // NAV / DME FREQ — BCD MHz
  0x20: [
    [{ span:4, label:'0.01 MHz',  cls:'csdb-fmap-bcd' }, { span:4, label:'0.001 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'1 MHz',     cls:'csdb-fmap-bcd' }, { span:4, label:'0.1 MHz',   cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'100 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'10 MHz',    cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',       cls:'csdb-fmap-pad' }],
  ],
  0x24: [
    [{ span:4, label:'0.01 MHz',  cls:'csdb-fmap-bcd' }, { span:4, label:'0.001 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'1 MHz',     cls:'csdb-fmap-bcd' }, { span:4, label:'0.1 MHz',   cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'100 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'10 MHz',    cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',       cls:'csdb-fmap-pad' }],
  ],
  // ATC — BCD 4 chiffres (D C B A)
  0x33: [
    [{ span:4, label:'Chiffre D', cls:'csdb-fmap-bcd' }, { span:4, label:'Chiffre C', cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'Chiffre B', cls:'csdb-fmap-bcd' }, { span:4, label:'Chiffre A', cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',       cls:'csdb-fmap-pad' }],
    [{ span:8, label:'PAD',       cls:'csdb-fmap-pad' }],
  ],
  // Heading magnétique — complément à 2, degrés
  0x46: [
    [{ span:8, label:'CAP (MSB)',  cls:'csdb-fmap-data' }],
    [{ span:8, label:'CAP (LSB)',  cls:'csdb-fmap-data' }],
    [{ span:8, label:'PAD',        cls:'csdb-fmap-pad'  }],
    [{ span:8, label:'PAD',        cls:'csdb-fmap-pad'  }],
  ],
  // Radio altitude + décision height
  0xC3: [
    [{ span:8, label:'ALT MSB (ft)', cls:'csdb-fmap-data' }],
    [{ span:8, label:'ALT LSB (ft)', cls:'csdb-fmap-data' }],
    [{ span:8, label:'DH MSB (ft)',  cls:'csdb-fmap-data' }],
    [{ span:8, label:'DH LSB (ft)',  cls:'csdb-fmap-data' }],
  ],
};
DATA_FIELD_MAP[0x12] = DATA_FIELD_MAP[0x10];
DATA_FIELD_MAP[0x13] = DATA_FIELD_MAP[0x11];
DATA_FIELD_MAP[0x25] = DATA_FIELD_MAP[0x24];

function getFieldMapForByte(byteIdx, addr) {
  if (byteIdx === 0) {
    return [{ span:8, label:'ADRESSE', cls:'csdb-fmap-addr' }];
  }
  if (byteIdx === 1) {
    return STATUS_FIELD_MAP[addr] || STATUS_FIELD_MAP.standard;
  }
  const dataIdx = byteIdx - 2;
  const addrMap = DATA_FIELD_MAP[addr];
  if (addrMap && addrMap[dataIdx]) return addrMap[dataIdx];
  return [{ span:8, label:'DATA', cls:'csdb-fmap-data' }];
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
function decodeBlock(bytes) {
  currentBytes = bytes;
  const addr   = bytes[0];
  const status = bytes.length > 1 ? bytes[1] : null;
  const data   = bytes.length > 2 ? bytes.slice(2) : [];
  const info   = CSDB_ADDR[addr] || null;

  renderBytesDisplay(bytes);
  updateAddressBanner(addr, info);
  updateAddressPanel(addr, info);
  updateStatusPanel(status, addr, info);
  updateDataPanel(data, addr, info);
  highlightCatalogRow(addr);
}

function decodeFromInput() {
  const raw = document.getElementById('hex-input').value;
  const err = document.getElementById('error-msg');
  const bytes = parseHexInput(raw);
  if (!bytes) {
    err.textContent = 'Format invalide — octets hex séparés par des espaces (ex: 10 80 08 41 00 00)';
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
      <small style="color:#3a5a3a;">Exemple : <code style="color:#80cc80">10 E0 08 41 85 00</code> — VHF COMM FREQ</small>`;
    container.appendChild(ph);
    return;
  }

  // ── Ligne d'en-tête : 2 espaceurs + numéros de bits ─
  container.appendChild(document.createElement('span')); // chip spacer
  container.appendChild(document.createElement('span')); // hex spacer
  for (let bit = 7; bit >= 0; bit--) {
    const d = document.createElement('div');
    d.className = 'bit-num-hdr';
    d.textContent = bit;
    container.appendChild(d);
  }

  // ── Une rangée par octet + ligne d'étiquettes ─────
  bytes.forEach((byteVal, idx) => {
    let role, roleLabel, hexCls, bitCls;
    if (idx === 0)      { role='addr';   roleLabel='ADRESSE';           hexCls='addr-color';   bitCls='bit-addr'; }
    else if (idx === 1) { role='status'; roleLabel='STATUS';            hexCls='status-color'; bitCls='bit-status'; }
    else                { role='data';   roleLabel=`DONNÉES #${idx-1}`; hexCls='data-color';   bitCls='bit-data'; }

    // Espaceur visuel entre octets (avant chaque octet y compris le premier)
    const spacer = document.createElement('div');
    spacer.className = 'csdb-byte-spacer';
    container.appendChild(spacer);

    const chip = document.createElement('span');
    chip.className = `byte-role-chip role-${role}`;
    chip.textContent = roleLabel;
    container.appendChild(chip);

    const hexLbl = document.createElement('span');
    hexLbl.className = `byte-hex-val ${hexCls}`;
    hexLbl.textContent = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
    container.appendChild(hexLbl);

    for (let bit = 7; bit >= 0; bit--) {
      const val = (byteVal >> bit) & 1;
      const cell = document.createElement('div');
      cell.className = `byte-bit-cell ${bitCls}`;
      cell.textContent = val;
      cell.title = `Octet #${idx} (${roleLabel}), Bit ${bit} — cliquer pour basculer`;

      const ci = idx, cb = bit;
      cell.addEventListener('click', () => {
        const savedY = window.scrollY;
        const nb = [...currentBytes];
        nb[ci] = nb[ci] ^ (1 << cb);
        const hexStr = nb.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        document.getElementById('hex-input').value = hexStr;
        document.getElementById('error-msg').textContent = '';
        decodeBlock(nb);
        requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }));
      });

      container.appendChild(cell);
    }

    // ── Ligne d'étiquettes de champs sous les bits ──
    container.appendChild(document.createElement('span')); // col chip vide
    container.appendChild(document.createElement('span')); // col hex vide
    const segs = getFieldMapForByte(idx, bytes[0]);
    for (const seg of segs) {
      const el = document.createElement('div');
      el.className = `csdb-fmap-seg ${seg.cls}`;
      el.style.gridColumn = `span ${seg.span}`;
      el.textContent = seg.label;
      container.appendChild(el);
    }
  });
}

// ── Address banner ────────────────────────────────────
function updateAddressBanner(addr, info) {
  const hex = '0x' + addr.toString(16).toUpperCase().padStart(2, '0');
  document.getElementById('banner-addr-box').textContent = hex;
  document.getElementById('banner-name').textContent = info ? info.name : 'Adresse inconnue';
  document.getElementById('banner-sub').textContent = info
    ? `${info.system}  •  ${info.db} octet(s) de données`
    : 'Non répertoriée dans le catalogue CSDB';
}

// ── Address panel ─────────────────────────────────────
function updateAddressPanel(addr, info) {
  const hex = '0x' + addr.toString(16).toUpperCase().padStart(2, '0');
  setText('addr-hex',    hex);
  setText('addr-dec',    addr.toString(10));
  setText('addr-bin',    addr.toString(2).padStart(8, '0') + 'b');
  setText('addr-name',   info ? info.name    : '(inconnu)',   info ? 'accent' : 'dim');
  setText('addr-system', info ? info.system  : '—');
  setText('addr-db',     info ? `${info.db} octet(s)` : '—');
  setText('addr-desc',   info ? info.desc    : '—',           'dim');
}

// ── Status panel ──────────────────────────────────────
function updateStatusPanel(statusByte, addr, info) {
  const body = document.getElementById('status-panel-body');

  if (statusByte === null) {
    body.innerHTML = row('—', 'Aucun octet status', 'dim');
    return;
  }
  if (info && info.db === 0) {
    // SYNC — no status byte
    body.innerHTML = row('—', 'Pas de status (SYNC)', 'dim');
    return;
  }

  const fields = getStatusFields(addr);

  if (fields) {
    // Message-specific status decode
    let html = '';
    for (const f of fields) {
      const v = (statusByte >> f.bit) & 1;
      html += row(`Bit ${f.bit} — ${f.name}`, v === 1 ? `1 — ${f.desc}` : `0`, v === 1 ? 'ok' : 'dim');
    }
    html += row('Brut', '0x' + statusByte.toString(16).toUpperCase().padStart(2,'0') + ' = ' + statusByte.toString(2).padStart(8,'0') + 'b', 'dim');
    html += row('⚠ Layout', 'Spécifique à cette adresse (§5 manuel)', 'dim');
    body.innerHTML = html;
  } else {
    // Standard layout (Figure 4)
    const v1  = (statusByte >> 7) & 1;
    const v2  = (statusByte >> 6) & 1;
    const v3  = (statusByte >> 5) & 1;
    const m4  = (statusByte >> 4) & 1;
    const m3  = (statusByte >> 3) & 1;
    const tst = (statusByte >> 2) & 1;
    const src = statusByte & 3;
    const srcNames = ['INCONNU', 'UNITÉ #1', 'UNITÉ #2', 'UNITÉ #3'];
    const modeOn = m4 || m3;

    body.innerHTML =
      row('Bit 7 — Données #1 valides', v1 ? '1  OUI' : '0  NON', v1 ? 'ok' : 'dim') +
      row('Bit 6 — Données #2 valides', v2 ? '1  OUI' : '0  NON', v2 ? 'ok' : 'dim') +
      row('Bit 5 — Données #3 valides', v3 ? '1  OUI' : '0  NON', v3 ? 'ok' : 'dim') +
      row('Bits 4-3 — Mode',  modeOn ? 'ACTIVÉ'    : 'DÉSACTIVÉ', modeOn ? 'ok' : 'dim') +
      row('Bit 2 — Test',     tst    ? '1  TEST'   : '0  NORMAL', tst ? 'err' : '') +
      row('Bits 1-0 — Source', srcNames[src], 'accent') +
      row('Brut', '0x' + statusByte.toString(16).toUpperCase().padStart(2,'0') + ' = ' + statusByte.toString(2).padStart(8,'0') + 'b', 'dim') +
      row('⚠ Layout', 'Standard (Figure 4). Peut varier selon l\'adresse.', 'dim');
  }
}

// ── Data panel ────────────────────────────────────────
function updateDataPanel(dataBytes, addr, info) {
  const body = document.getElementById('data-panel-body');

  if (!dataBytes.length) {
    body.innerHTML = row('—', 'Aucun octet de données', 'dim');
    return;
  }

  let html = '';
  dataBytes.forEach((b, i) => {
    const hex = '0x' + b.toString(16).toUpperCase().padStart(2, '0');
    const bin = b.toString(2).padStart(8, '0');
    html += `<div class="detail-row">
      <span class="detail-key">Octet #${i + 2} — Données #${i + 1}</span>
      <span class="detail-val">
        <span class="data-color">${hex}</span>
        <span style="color:#445566;font-size:0.75rem;margin-left:0.5rem">${bin}b</span>
      </span>
    </div>`;
  });

  // Try to decode BCD frequency for known comm/nav addresses
  const freqAddrs = [0x10, 0x11, 0x12, 0x13, 0x20, 0x24];
  if (freqAddrs.includes(addr) && dataBytes.length >= 2) {
    const decoded = tryDecodeBCDFreq(dataBytes);
    if (decoded) {
      html += `<div class="detail-row">
        <span class="detail-key">Fréquence BCD</span>
        <span class="detail-val ok">${decoded}</span>
      </div>`;
    }
  }

  body.innerHTML = html;
}

// ── BCD frequency decoder (VHF: 108.000–137.975 MHz) ─
function tryDecodeBCDFreq(data) {
  try {
    // Byte 2: bits [7:4]=BCD_8, [3:0]=BCD_4  → 0.001 MHz digits
    // Byte 3: bits [7:4]=BCD_2, [3:0]=BCD_1  → 0.001 & 0.01 MHz
    // Byte 4: bits [7:4]=BCD_8, [3:0]=BCD_4  → 10 MHz & 1 MHz
    // Format: BBB.BBB MHz (100s, 10s, 1s . 0.1s, 0.01s, 0.001s)
    const b2 = data[0], b3 = data[1], b4 = data.length > 2 ? data[2] : 0;
    const d100 = (b4 >> 4) & 0xF; // 100 MHz digit
    const d10  = (b4 >> 0) & 0xF; // 10 MHz digit
    const d1   = (b3 >> 4) & 0xF; // 1 MHz digit  — actually let's check manual format
    const d01  = (b3 >> 0) & 0xF; // 0.1 MHz
    const d001 = (b2 >> 4) & 0xF; // 0.01 MHz
    const d0001= (b2 >> 0) & 0xF; // 0.001 MHz
    // Validate BCD digits
    if ([d100,d10,d1,d01,d001,d0001].some(d => d > 9)) return null;
    return `${d100}${d10}${d1}.${d01}${d001}${d0001} MHz`;
  } catch { return null; }
}

// ── Catalog highlight ─────────────────────────────────
function highlightCatalogRow(addr) {
  document.querySelectorAll('#addr-catalog-body tr.tr-current')
    .forEach(el => el.classList.remove('tr-current'));
  const row = document.getElementById(`cat-row-${addr}`);
  if (row) {
    row.classList.add('tr-current');
    if (addr !== lastHighlightedAddr) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      lastHighlightedAddr = addr;
    }
  }
}

// ── Catalog table population ──────────────────────────
function populateCatalog() {
  const tbody = document.getElementById('addr-catalog-body');
  if (!tbody) return;
  const sorted = Object.entries(CSDB_ADDR).sort(([a], [b]) => +a - +b);
  sorted.forEach(([addrNum, info]) => {
    const n = +addrNum;
    const hex = '0x' + n.toString(16).toUpperCase().padStart(2, '0');
    const tr = document.createElement('tr');
    tr.id = `cat-row-${n}`;
    tr.innerHTML = `<td>${hex}</td>
      <td style="color:#c8c4bc">${info.name}</td>
      <td style="color:#60b8c8">${info.system}</td>
      <td style="color:#a89f94;font-size:0.78rem">${info.desc}</td>`;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      const exHex = hex.replace('0x', '').padStart(2, '0');
      const exStr = `${exHex} E0 00 00 00 00`;
      loadExample(exStr);
    });
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
  ['addr-hex','addr-dec','addr-bin','addr-name','addr-system','addr-db','addr-desc']
    .forEach(id => setText(id, '—', 'dim'));
  document.getElementById('status-panel-body').innerHTML = row('—', 'En attente', 'dim');
  document.getElementById('data-panel-body').innerHTML   = row('—', 'En attente', 'dim');
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
