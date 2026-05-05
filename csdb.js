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
  0x1E: { name: 'TRANSPONDER ATC CODE/ALTITUDE', system: 'ATC',      db: 4, desc: 'Code ATC (BCD 0–7) et altitude (Gray code)' },
  0x1F: { name: 'TRANSPONDER OUTPUT DATA',       system: 'ATC',      db: 4, desc: 'Sortie transpondeur — code ATC + altitude + état XMIT' },
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
  // Adresses VHF COMM FREQ (0x10, 0x12) — manuel §5, page 24
  0x10: [
    { bit:7, name:'FREQ VALID', desc:'Fréquence valide (1=valide)' },
    { bit:6, name:'PAD',        desc:'Non utilisé' },
    { bit:5, name:'XFR CTL',    desc:'Transfert fréquence (1=XFR en cours)' },
    { bit:4, name:'SQLCH CTL',  desc:'0=Squelch auto · 1=Audio activé (squelch off)' },
    { bit:3, name:'SRC b3',     desc:'Source ident bit 3 (MSB) — voir NOTE 1' },
    { bit:2, name:'TEST CTL',   desc:'Mode test (1=test actif)' },
    { bit:1, name:'SRC b1',     desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SRC b0',     desc:'Source ident bit 0 (LSB) — voir NOTE 1' },
  ],
  0x12: 'same:0x10',
  // Adresses VHF COMM DATA (0x11, 0x13) — manuel §5, page 25
  0x11: [
    { bit:7, name:'FREQ VALID', desc:'Fréquence valide (1=valide)' },
    { bit:6, name:'FREQ LIM B', desc:'Freq limit MSB (NOTE 2) — 00=N/U · 01=135.975 · 10=136.975 · 11=151.975 MHz' },
    { bit:5, name:'FREQ LIM A', desc:'Freq limit LSB (NOTE 2) — 00=N/U · 01=135.975 · 10=136.975 · 11=151.975 MHz' },
    { bit:4, name:'XMIT IND',   desc:'Indicateur émission (1=émission active)' },
    { bit:3, name:'SRC b3',     desc:'Source ident bit 3 (MSB) — voir NOTE 1' },
    { bit:2, name:'SELF TEST',  desc:'Auto-test (1=test actif)' },
    { bit:1, name:'SRC b1',     desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SRC b0',     desc:'Source ident bit 0 (LSB) — voir NOTE 1' },
  ],
  0x13: 'same:0x11',
  // Transpondeur ATC — manuel §5, page 28
  0x1E: [
    { bit:7, name:'CODE VALID', desc:'Code ATC valide (1=valide) — NOTE 2' },
    { bit:6, name:'PAD',        desc:'Non utilisé' },
    { bit:5, name:'MODE',       desc:'Mode (1=STBY)' },
    { bit:4, name:'ALT REPR',   desc:'Rapport altitude activé (1=ON)' },
    { bit:3, name:'ATC IDENT',  desc:'Identification ATC (1=ON)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=test actif)' },
    { bit:1, name:'SI b1',      desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SI b0',      desc:'Source ident bit 0 — voir NOTE 1' },
  ],
  // Transpondeur sortie — manuel §5, page 29
  0x1F: [
    { bit:7, name:'CODE VALID', desc:'Code ATC valide (1=valide) — NOTE 2' },
    { bit:6, name:'XMIT',       desc:'Émission active (1=ON)' },
    { bit:5, name:'MODE',       desc:'Mode (1=STBY)' },
    { bit:4, name:'ALT REPR',   desc:'Rapport altitude activé (1=ON)' },
    { bit:3, name:'ATC IDENT',  desc:'Identification ATC (1=ON)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=test actif)' },
    { bit:1, name:'SI b1',      desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SI b0',      desc:'Source ident bit 0 — voir NOTE 1' },
  ],
  // VHF NAV FREQ — manuel §5, page 30
  0x20: [
    { bit:7, name:'FREQ VALID', desc:'Fréquence valide (1=valide)' },
    { bit:6, name:'PAD',        desc:'Non utilisé' },
    { bit:5, name:'PAD',        desc:'Non utilisé' },
    { bit:4, name:'MKR SENS',   desc:'Sensibilité baliseur (1=LOW)' },
    { bit:3, name:'DME HOLD',   desc:'Maintien DME (1=ON)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=test actif)' },
    { bit:1, name:'SI b1',      desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SI b0',      desc:'Source ident bit 0 — voir NOTE 1' },
  ],
  // ILS DATA — manuel §5, page 32
  0x22: [
    { bit:7, name:'GS VALID',   desc:'Glideslope valide (1=valide)' },
    { bit:6, name:'LOC VALID',  desc:'Localizer valide (1=valide)' },
    { bit:5, name:'D\'LYD ILS', desc:'ILS différé disponible (1=ILS) — NOTE 3' },
    { bit:4, name:'MKR SENS',   desc:'Sensibilité baliseur (1=LOW)' },
    { bit:3, name:'GLS',        desc:'GLS mode (1=NO)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=test actif)' },
    { bit:1, name:'SI b1',      desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SI b0',      desc:'Source ident bit 0 — voir NOTE 1' },
  ],
  // VOR DATA — manuel §5, page 31
  0x21: [
    { bit:7, name:'VOR VALID',  desc:'VOR valide (1=valide)' },
    { bit:6, name:'FREQ VALID', desc:'Fréquence valide (1=valide)' },
    { bit:5, name:'2/5 TUNE',   desc:'Accord 2/5 activé (1=ENAB)' },
    { bit:4, name:'MKR SENS',   desc:'Sensibilité baliseur (1=LOW)' },
    { bit:3, name:'ROT FILT',   desc:'Filtre rotation activé (1=ACTV)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=test actif)' },
    { bit:1, name:'SI b1',      desc:'Source ident bit 1 — voir NOTE 1' },
    { bit:0, name:'SI b0',      desc:'Source ident bit 0 — voir NOTE 1' },
  ],
  // DME FREQ (0x24) — manuel §5, page 33
  0x24: [
    { bit:7, name:'FREQ VALID', desc:'Fréquence valide (1=valide)' },
    { bit:6, name:'AUTO TUNE',  desc:'Accord auto (0=manuel · 1=auto base données) — NOTE 2' },
    { bit:5, name:'PAD',        desc:'Non utilisé' },
    { bit:4, name:'MLS/VOR',    desc:'Type ident (1=MLS · 0=VORLOC)' },
    { bit:3, name:'DME HOLD',   desc:'Maintien DME (1=ON)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=ON)' },
    { bit:1, name:'CH ID b1',   desc:'Channel ident bit 1 — voir NOTE 1' },
    { bit:0, name:'CH ID b0',   desc:'Channel ident bit 0 — voir NOTE 1' },
  ],
  // DME FREQ & DIST (0x25) — manuel §5, page 34
  0x25: [
    { bit:7, name:'FREQ VALID', desc:'Fréquence valide (1=valide)' },
    { bit:6, name:'DIST VALID', desc:'Distance valide (1=valide)' },
    { bit:5, name:'SRCH/TRCK',  desc:'Recherche/poursuite MSB — voir NOTE 2' },
    { bit:4, name:'SRCH/TRCK',  desc:'Recherche/poursuite LSB — voir NOTE 2' },
    { bit:3, name:'DME HOLD',   desc:'Maintien DME (1=ON)' },
    { bit:2, name:'TEST',       desc:'Auto-test (1=ON)' },
    { bit:1, name:'CH ID b1',   desc:'Channel ident bit 1 — voir NOTE 1' },
    { bit:0, name:'CH ID b0',   desc:'Channel ident bit 0 — voir NOTE 1' },
  ],
  // DME TTS & VEL (0x26) — manuel §5, page 35
  0x26: [
    { bit:7, name:'TTS&VEL VAL', desc:'TTS & vitesse valides (1=valide)' },
    { bit:6, name:'AUTO TUNE',   desc:'Accord auto (0=manuel · 1=auto) — NOTE 4' },
    { bit:5, name:'SRCH/TRCK',   desc:'Recherche/poursuite MSB — voir NOTE 2' },
    { bit:4, name:'SRCH/TRCK',   desc:'Recherche/poursuite LSB — voir NOTE 2' },
    { bit:3, name:'MLS/VOR',     desc:'Type ident (1=MLS · 0=VORLOC)' },
    { bit:2, name:'TEST',        desc:'Auto-test (1=ON)' },
    { bit:1, name:'CH ID b1',    desc:'Channel ident bit 1 — voir NOTE 1' },
    { bit:0, name:'CH ID b0',    desc:'Channel ident bit 0 — voir NOTE 1' },
  ],
  // DME IDENT (0x27) — manuel §5, page 36
  0x27: [
    { bit:7, name:'IDENT VALID', desc:'Ident valide (1=valide)' },
    { bit:6, name:'ANALG/568',   desc:'Source données analogiques/568 — NOTE 3' },
    { bit:5, name:'SRCH/TRCK',   desc:'Recherche/poursuite MSB — voir NOTE 2' },
    { bit:4, name:'SRCH/TRCK',   desc:'Recherche/poursuite LSB — voir NOTE 2' },
    { bit:3, name:'PAD',         desc:'Non utilisé' },
    { bit:2, name:'TEST',        desc:'Auto-test (1=ON)' },
    { bit:1, name:'CH ID b1',    desc:'Channel ident bit 1 — voir NOTE 1' },
    { bit:0, name:'CH ID b0',    desc:'Channel ident bit 0 — voir NOTE 1' },
  ],
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
    { span:2, label:'SI',   cls:'csdb-fmap-src'   },
  ],
  // bits 3,1,0 = source ident (3 bits non-contigus)
  0x10: [
    { span:1, label:'VAL', cls:'csdb-fmap-valid' },
    { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
    { span:1, label:'XFR', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'SQL', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'SI',  cls:'csdb-fmap-src'   },
    { span:1, label:'TST', cls:'csdb-fmap-test'  },
    { span:2, label:'SI',  cls:'csdb-fmap-src'   },
  ],
  0x11: [
    { span:1, label:'VAL', cls:'csdb-fmap-valid' },
    { span:1, label:'FLB', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'FLA', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'XMT', cls:'csdb-fmap-ctrl'  },
    { span:1, label:'SI',  cls:'csdb-fmap-src'   },
    { span:1, label:'TST', cls:'csdb-fmap-test'  },
    { span:2, label:'SI',  cls:'csdb-fmap-src'   },
  ],
};
STATUS_FIELD_MAP[0x12] = STATUS_FIELD_MAP[0x10];
STATUS_FIELD_MAP[0x13] = STATUS_FIELD_MAP[0x11];
STATUS_FIELD_MAP[0x1E] = [
  { span:1, label:'VAL', cls:'csdb-fmap-valid' },
  { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
  { span:1, label:'MOD', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'ALT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'IDT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'SI',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x1F] = [
  { span:1, label:'VAL', cls:'csdb-fmap-valid' },
  { span:1, label:'XMT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'MOD', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'ALT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'IDT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'SI',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x20] = [
  { span:1, label:'VAL', cls:'csdb-fmap-valid' },
  { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
  { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
  { span:1, label:'MKR', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'DME', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'SI',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x22] = [
  { span:1, label:'GS',  cls:'csdb-fmap-valid' },
  { span:1, label:'LOC', cls:'csdb-fmap-valid' },
  { span:1, label:'DLY', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'MKR', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'GLS', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'SI',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x21] = [
  { span:1, label:'VOR', cls:'csdb-fmap-valid' },
  { span:1, label:'FRQ', cls:'csdb-fmap-valid' },
  { span:1, label:'2/5', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'MKR', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'ROT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'SI',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x24] = [
  { span:1, label:'VAL', cls:'csdb-fmap-valid' },
  { span:1, label:'AUT', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
  { span:1, label:'MLS', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'HLD', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'CH',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x25] = [
  { span:1, label:'FRQ', cls:'csdb-fmap-valid' },
  { span:1, label:'DST', cls:'csdb-fmap-valid' },
  { span:2, label:'S/T', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'HLD', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'CH',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x26] = [
  { span:1, label:'VAL', cls:'csdb-fmap-valid' },
  { span:1, label:'AUT', cls:'csdb-fmap-ctrl'  },
  { span:2, label:'S/T', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'MLS', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'CH',  cls:'csdb-fmap-src'   },
];
STATUS_FIELD_MAP[0x27] = [
  { span:1, label:'VAL', cls:'csdb-fmap-valid' },
  { span:1, label:'568', cls:'csdb-fmap-ctrl'  },
  { span:2, label:'S/T', cls:'csdb-fmap-ctrl'  },
  { span:1, label:'PAD', cls:'csdb-fmap-pad'   },
  { span:1, label:'TST', cls:'csdb-fmap-test'  },
  { span:2, label:'CH',  cls:'csdb-fmap-src'   },
];

const DATA_FIELD_MAP = {
  // VHF COMM FREQ actif — BCD, manuel page 24
  // Byte2[7:4]=0.001MHz, Byte2[3:0]=PAD
  // Byte3[7:4]=0.1MHz,   Byte3[3:0]=0.01MHz
  // Byte4[7]=PAD, Byte4[6:4]=10MHz (3 bits), Byte4[3:0]=1MHz
  0x10: [
    [{ span:4, label:'0.001 MHz', cls:'csdb-fmap-bcd' }, { span:4, label:'PAD',       cls:'csdb-fmap-pad' }],
    [{ span:4, label:'0.1 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'0.01 MHz',  cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'PAD',       cls:'csdb-fmap-pad' }, { span:3, label:'10 MHz',    cls:'csdb-fmap-bcd' }, { span:4, label:'1 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',       cls:'csdb-fmap-pad' }],
  ],
  // VHF COMM DATA — fréquence standby BCD (même structure que 0x10)
  0x11: [
    [{ span:4, label:'0.001 MHz', cls:'csdb-fmap-bcd' }, { span:4, label:'PAD',      cls:'csdb-fmap-pad' }],
    [{ span:4, label:'0.1 MHz',  cls:'csdb-fmap-bcd' }, { span:4, label:'0.01 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'PAD',      cls:'csdb-fmap-pad' }, { span:3, label:'10 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'1 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',        cls:'csdb-fmap-pad' }],
  ],
  // VHF NAV FREQ — BCD MHz (page 30)
  // byte2[7:4]=0.1MHz  byte2[3:0]=0.01MHz
  // byte3[7]=PAD  byte3[6:4]=10MHz  byte3[3:0]=1MHz
  0x20: [
    [{ span:4, label:'0.1 MHz',  cls:'csdb-fmap-bcd' }, { span:4, label:'0.01 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'PAD',      cls:'csdb-fmap-pad' }, { span:3, label:'10 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'1 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',      cls:'csdb-fmap-pad' }],
    [{ span:8, label:'PAD',      cls:'csdb-fmap-pad' }],
  ],
  // VOR DATA — bearing 12-bit 2's complement ±180° + freq NAV (bytes 4-5)
  // byte2[7:4]=BRG LSB  byte3[7:0]=BRG MSB  byte4=freq 0.1/0.01 MHz  byte5=freq PAD+10+1 MHz
  0x21: [
    [{ span:4, label:'BRG LSB', cls:'csdb-fmap-data' },
     { span:1, label:'PAD',     cls:'csdb-fmap-pad'  },
     { span:1, label:'INN',     cls:'csdb-fmap-ctrl' },
     { span:1, label:'MDL',     cls:'csdb-fmap-ctrl' },
     { span:1, label:'OUT',     cls:'csdb-fmap-ctrl' }],
    [{ span:8, label:'BRG MSB', cls:'csdb-fmap-data' }],
    [{ span:4, label:'0.1 MHz', cls:'csdb-fmap-bcd'  }, { span:4, label:'0.01 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'PAD',     cls:'csdb-fmap-pad'  }, { span:3, label:'10 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'1 MHz', cls:'csdb-fmap-bcd' }],
  ],
  // ILS DATA — déviation GS (12-bit 2's complement ±0.80 DDM) et LOC (±0.40 DDM)
  // byte2[7:4]=GS LSB  byte3[7:0]=GS MSB  byte4[7:4]=LOC LSB  byte5[7:0]=LOC MSB
  0x22: [
    [{ span:4, label:'GS LSB',  cls:'csdb-fmap-data' },
     { span:1, label:'PAD',     cls:'csdb-fmap-pad'  },
     { span:1, label:'INN',     cls:'csdb-fmap-ctrl' },
     { span:1, label:'MDL',     cls:'csdb-fmap-ctrl' },
     { span:1, label:'OUT',     cls:'csdb-fmap-ctrl' }],
    [{ span:8, label:'GS MSB',  cls:'csdb-fmap-data' }],
    [{ span:4, label:'LOC LSB', cls:'csdb-fmap-data' },
     { span:4, label:'PAD',     cls:'csdb-fmap-pad'  }],
    [{ span:8, label:'LOC MSB', cls:'csdb-fmap-data' }],
  ],
  // DME FREQ (0x24) — byte2=0.1/0.01 MHz · byte3=MLS+10/1 MHz · byte4=PAD · byte5=RMT+AUTO+PAD
  0x24: [
    [{ span:4, label:'0.1 MHz',  cls:'csdb-fmap-bcd'  }, { span:4, label:'0.01 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'MLS',      cls:'csdb-fmap-ctrl'  }, { span:3, label:'10 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'1 MHz',  cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'PAD',      cls:'csdb-fmap-pad'   }],
    [{ span:1, label:'RMT',      cls:'csdb-fmap-ctrl'  }, { span:1, label:'AUTO',     cls:'csdb-fmap-ctrl' }, { span:6, label:'PAD',    cls:'csdb-fmap-pad' }],
  ],
  // DME FREQ & DIST (0x25) — bytes 2-3 freq identiques à 0x24 · bytes 4-5 distance 16-bit
  0x25: [
    [{ span:4, label:'0.1 MHz',  cls:'csdb-fmap-bcd'  }, { span:4, label:'0.01 MHz', cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'MLS',      cls:'csdb-fmap-ctrl'  }, { span:3, label:'10 MHz',   cls:'csdb-fmap-bcd' }, { span:4, label:'1 MHz',  cls:'csdb-fmap-bcd' }],
    [{ span:8, label:'DIST LSB', cls:'csdb-fmap-data'  }],
    [{ span:8, label:'DIST MSB', cls:'csdb-fmap-data'  }],
  ],
  // DME TTS & VEL (0x26)
  0x26: [
    [{ span:4, label:'1.0 MIN',  cls:'csdb-fmap-bcd'  }, { span:4, label:'0.1 MIN',  cls:'csdb-fmap-bcd' }],
    [{ span:3, label:'PAD',      cls:'csdb-fmap-pad'   }, { span:1, label:'100 MIN',  cls:'csdb-fmap-bcd' }, { span:4, label:'10 MIN',  cls:'csdb-fmap-bcd' }],
    [{ span:4, label:'10 KTS',   cls:'csdb-fmap-bcd'  }, { span:4, label:'1 KTS',    cls:'csdb-fmap-bcd' }],
    [{ span:1, label:'RMT',      cls:'csdb-fmap-ctrl'  }, { span:1, label:'AUTO',     cls:'csdb-fmap-ctrl' }, { span:2, label:'PAD',    cls:'csdb-fmap-pad' }, { span:4, label:'100 KTS', cls:'csdb-fmap-bcd' }],
  ],
  // DME IDENT (0x27) — 4 bytes ASCII 7-bit, bit 7 = validité (0=valide)
  0x27: [
    [{ span:1, label:'VAL', cls:'csdb-fmap-valid' }, { span:7, label:'ASCII 1', cls:'csdb-fmap-data' }],
    [{ span:1, label:'VAL', cls:'csdb-fmap-valid' }, { span:7, label:'ASCII 2', cls:'csdb-fmap-data' }],
    [{ span:1, label:'VAL', cls:'csdb-fmap-valid' }, { span:7, label:'ASCII 3', cls:'csdb-fmap-data' }],
    [{ span:1, label:'VAL', cls:'csdb-fmap-valid' }, { span:7, label:'ASCII 4', cls:'csdb-fmap-data' }],
  ],
  // Transpondeur ATC — Code BCD 0-7 (bytes 2-3) + Altitude Gray code (bytes 4-5)
  // Chaque nibble : PAD(bit7/3) + 3 bits BCD/Gray (bits 6-4 / 2-0)
  0x1E: [
    [{ span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ATC C', cls:'csdb-fmap-bcd'  },
     { span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ATC D', cls:'csdb-fmap-bcd'  }],
    [{ span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ATC A', cls:'csdb-fmap-bcd'  },
     { span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ATC B', cls:'csdb-fmap-bcd'  }],
    [{ span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ALT C', cls:'csdb-fmap-data' },
     { span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ALT D', cls:'csdb-fmap-data' }],
    [{ span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ALT A', cls:'csdb-fmap-data' },
     { span:1, label:'PAD', cls:'csdb-fmap-pad' }, { span:3, label:'ALT B', cls:'csdb-fmap-data' }],
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
DATA_FIELD_MAP[0x1F] = DATA_FIELD_MAP[0x1E];
// 0x25 a sa propre entrée (bytes 4-5 = distance, pas PAD)

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
  updateAddressBanner(addr, info, data);
  updateAddressPanel(addr, info);
  updateStatusPanel(status, addr, info);
  updateDataPanel(data, addr, info);
  updateQuickStatus(status, addr, data);
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

  // ── Ligne d'en-tête : chip spacer + hex spacer + P + numéros de bits ─
  container.appendChild(document.createElement('span')); // chip spacer
  container.appendChild(document.createElement('span')); // hex spacer
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

    const onesCount = byteVal.toString(2).split('').filter(b => b === '1').length;
    const parityBit = (onesCount % 2 === 0) ? 1 : 0;
    const parityCell = document.createElement('div');
    parityCell.className = `byte-bit-parity ${parityBit ? 'p-one' : 'p-zero'}`;
    parityCell.textContent = parityBit;
    parityCell.title = `Bit de parité — ${onesCount} bit(s) à 1 (parité ${onesCount % 2 === 0 ? 'paire' : 'impaire'})`;
    container.appendChild(parityCell);

    const padBits = new Set();
    { let bp = 7; for (const seg of getFieldMapForByte(idx, bytes[0])) { if (seg.cls === 'csdb-fmap-pad') for (let i = 0; i < seg.span; i++) padBits.add(bp - i); bp -= seg.span; } }

    for (let bit = 7; bit >= 0; bit--) {
      const val = (byteVal >> bit) & 1;
      const cell = document.createElement('div');
      cell.className = `byte-bit-cell ${padBits.has(bit) ? 'bit-pad' : bitCls}`;
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
    container.appendChild(document.createElement('span')); // col parity vide
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

function mkrHtml(inn, mdl, out) {
  const s = (active, name, color) => active
    ? `<span style="color:${color};font-weight:bold">${name}</span>`
    : `<span style="color:#1e2e1e">—</span>`;
  return `${s(inn,'INN','#f0f0f0')} · ${s(mdl,'MDL','#facc15')} · ${s(out,'OUT','#60a5fa')}`;
}

// ── Banner values ─────────────────────────────────────
function getBannerValues(addr, data) {
  if (!data || data.length < 3) return [];
  if (addr === 0x24 && data.length >= 2) {
    const f = tryDecodeNavFreq([data[0], data[1] & 0x7F]);
    return f ? [{ label:'FREQ DME', value:f }] : [];
  }
  if (addr === 0x25 && data.length >= 2) {
    const vals = [];
    if (data.length >= 4) {
      const dist = (data[3] << 8) | data[2];
      vals.push({ label:'DIST DME', value:`${dist} NM` });
    }
    const f = tryDecodeNavFreq([data[0], data[1] & 0x7F]);
    if (f) vals.unshift({ label:'FREQ DME', value:f });
    return vals;
  }
  if (addr === 0x26 && data.length >= 3) {
    const min1   = (data[0] >> 4) & 0xF;
    const min01  = data[0] & 0xF;
    const min100 = (data[1] >> 4) & 0x1;
    const min10  = data[1] & 0xF;
    const tts    = min100*100 + min10*10 + min1 + min01*0.1;
    const vals   = [{ label:'TTS', value:`${tts.toFixed(1)} min` }];
    if (data.length >= 4) {
      const kts10  = (data[2] >> 4) & 0xF;
      const kts1   = data[2] & 0xF;
      const kts100 = data[3] & 0xF;
      vals.push({ label:'VEL DME', value:`${kts100*100 + kts10*10 + kts1} kts` });
    }
    return vals;
  }
  if (addr === 0x27 && data.length >= 1) {
    let ident = '';
    for (let i = 0; i < Math.min(4, data.length); i++) {
      if ((data[i] >> 7) === 0) { const c = data[i] & 0x7F; if (c >= 0x20 && c < 0x7F) ident += String.fromCharCode(c); }
    }
    return ident.trim() ? [{ label:'IDENT DME', value:ident.trim() }] : [];
  }
  const freqActive = [0x10, 0x12];
  const freqStby   = [0x11, 0x13];
  if (addr === 0x20) {
    const f = tryDecodeNavFreq(data);
    return f ? [{ label:'FREQ ACTIVE', value:f }] : [];
  }
  if (freqActive.includes(addr)) {
    const f = tryDecodeBCDFreq(data);
    return f ? [{ label:'FREQ ACTIVE', value:f }] : [];
  }
  if (freqStby.includes(addr)) {
    const f = tryDecodeBCDFreq(data);
    return f ? [{ label:'FREQ STANDBY', value:f }] : [];
  }
  if (addr === 0x46 && data.length >= 2) {
    const raw = (data[0] << 8) | data[1];
    const deg = raw > 32767 ? raw - 65536 : raw;
    return [{ label:'CAP MAG', value:`${deg}°` }];
  }
  if (addr === 0x21 && data.length >= 2) {
    const brgRaw = ((data[1] << 4) | (data[0] >> 4)) & 0xFFF;
    const brgSgn = brgRaw >= 2048 ? brgRaw - 4096 : brgRaw;
    const brgDeg = (brgSgn * 180 / 2048).toFixed(1);
    const vals = [{ label:'VOR BRG', value:`${brgSgn > 0 ? '+' : ''}${brgDeg}°` }];
    if (data.length >= 4) {
      const f = tryDecodeNavFreq([data[2], data[3]]);
      if (f) vals.unshift({ label:'FREQ', value:f });
    }
    const inn=(data[0]>>2)&1, mdl=(data[0]>>1)&1, out=data[0]&1;
    vals.unshift({ label:'MARKERS', value:mkrHtml(inn,mdl,out) });
    return vals;
  }
  if (addr === 0x22 && data.length >= 4) {
    const gsRaw  = ((data[1] << 4) | (data[0] >> 4)) & 0xFFF;
    const locRaw = ((data[3] << 4) | (data[2] >> 4)) & 0xFFF;
    const gsSgn  = gsRaw  >= 2048 ? gsRaw  - 4096 : gsRaw;
    const locSgn = locRaw >= 2048 ? locRaw - 4096 : locRaw;
    const gsVal  = (gsSgn  * 0.80 / 2048).toFixed(3);
    const locVal = (locSgn * 0.40 / 2048).toFixed(3);
    const inn=(data[0]>>2)&1, mdl=(data[0]>>1)&1, out=data[0]&1;
    return [
      { label:'MARKERS', value:mkrHtml(inn,mdl,out) },
      { label:'GS DEV',  value:`${gsVal  > 0 ? '+' : ''}${gsVal} DDM`  },
      { label:'LOC DEV', value:`${locVal > 0 ? '+' : ''}${locVal} DDM` },
    ];
  }
  if ([0x1E, 0x1F].includes(addr) && data.length >= 2) {
    const dC=(data[0]>>4)&0x7, dD=data[0]&0x7, dA=(data[1]>>4)&0x7, dB=data[1]&0x7;
    const vals = [{ label:'CODE ATC', value:`${dA}${dB}${dC}${dD}` }];
    if (data.length >= 4) {
      const eC=(data[2]>>4)&0x7, eD=data[2]&0x7, eA=(data[3]>>4)&0x7, eB=data[3]&0x7;
      vals.unshift({ label:'CODE ALT', value:`${eA}${eB}${eC}${eD}` });
    }
    return vals;
  }
  if (addr === 0x33 && data.length >= 2) {
    const dD=(data[0]>>4)&0xF, dC=data[0]&0xF, dB=(data[1]>>4)&0xF, dA=data[1]&0xF;
    if ([dA,dB,dC,dD].every(x => x <= 7)) return [{ label:'CODE ATC', value:`${dD}${dC}${dB}${dA}` }];
  }
  if (addr === 0xC3 && data.length >= 2) {
    const vals = [{ label:'RADIO ALT', value:`${(data[0]<<8)|data[1]} ft` }];
    if (data.length >= 4) vals.push({ label:'DH', value:`${(data[2]<<8)|data[3]} ft` });
    return vals;
  }
  return [];
}

// ── Address banner ────────────────────────────────────
function updateAddressBanner(addr, info, data) {
  const hex = '0x' + addr.toString(16).toUpperCase().padStart(2, '0');
  document.getElementById('banner-addr-box').textContent = hex;
  document.getElementById('banner-name').textContent = info ? info.name : 'Adresse inconnue';
  document.getElementById('banner-sub').textContent = info
    ? `${info.system}  •  ${info.db} octet(s) de données`
    : 'Non répertoriée dans le catalogue CSDB';
  const vals = getBannerValues(addr, data);
  document.getElementById('banner-values').innerHTML = vals.map(v =>
    `<div class="banner-val-item">
       <span class="banner-val-label">${v.label}</span>
       <span class="banner-val-num">${v.value}</span>
     </div>`
  ).join('');
}

// ── Quick status (Valid + SI) ─────────────────────────
function updateQuickStatus(statusByte, addr, data = []) {
  const validEl = document.getElementById('qs-valid');
  const siEl    = document.getElementById('qs-si');
  if (statusByte === null) {
    validEl.innerHTML = '<span class="qs-off">—</span>';
    siEl.innerHTML    = '<span class="qs-off">—</span>';
    return;
  }
  const fields = getStatusFields(addr);
  if (fields) {
    if (addr === 0x21) {
      const vor  = (statusByte >> 7) & 1;
      const freq = (statusByte >> 6) & 1;
      validEl.innerHTML =
        `<div class="qs-item"><span class="qs-item-label">VOR</span><span class="qs-item-val ${vor  ? 'qs-on' : 'qs-off'}">${vor  ? 'OUI' : 'NON'}</span></div>` +
        `<div class="qs-item"><span class="qs-item-label">FREQ</span><span class="qs-item-val ${freq ? 'qs-on' : 'qs-off'}">${freq ? 'OUI' : 'NON'}</span></div>`;
    } else if (addr === 0x25) {
      const freq = (statusByte >> 7) & 1;
      const dist = (statusByte >> 6) & 1;
      validEl.innerHTML =
        `<div class="qs-item"><span class="qs-item-label">FREQ</span><span class="qs-item-val ${freq ? 'qs-on' : 'qs-off'}">${freq ? 'OUI' : 'NON'}</span></div>` +
        `<div class="qs-item"><span class="qs-item-label">DIST</span><span class="qs-item-val ${dist ? 'qs-on' : 'qs-off'}">${dist ? 'OUI' : 'NON'}</span></div>`;
    } else if (addr === 0x22) {
      const gs  = (statusByte >> 7) & 1;
      const loc = (statusByte >> 6) & 1;
      validEl.innerHTML =
        `<div class="qs-item"><span class="qs-item-label">GS</span><span class="qs-item-val ${gs  ? 'qs-on' : 'qs-off'}">${gs  ? 'OUI' : 'NON'}</span></div>` +
        `<div class="qs-item"><span class="qs-item-label">LOC</span><span class="qs-item-val ${loc ? 'qs-on' : 'qs-off'}">${loc ? 'OUI' : 'NON'}</span></div>`;
    } else {
      const fv = (statusByte >> 7) & 1;
      const bit7Label = fields.find(f => f.bit === 7)?.name || 'VALID';
      validEl.innerHTML = `<div class="qs-item">
        <span class="qs-item-label">${bit7Label}</span>
        <span class="qs-item-val ${fv ? 'qs-on' : 'qs-off'}">${fv ? 'OUI' : 'NON'}</span>
      </div>`;
    }
    if ([0x10, 0x11, 0x12, 0x13].includes(addr)) {
      const srcVal = (((statusByte>>3)&1)<<2) | (((statusByte>>1)&1)<<1) | (statusByte&1);
      const names  = ['ALL','#1','#2','#3','---','P#1','P#2','P#3'];
      siEl.innerHTML = `<span class="qs-si">${names[srcVal]}</span>`;
    } else if ([0x1E, 0x1F].includes(addr)) {
      const srcVal = statusByte & 3;
      const names  = ['N/U', '#1', '#2', 'N/U'];
      siEl.innerHTML = `<span class="qs-si">${names[srcVal]}</span>`;
    } else if ([0x20, 0x21, 0x22].includes(addr)) {
      const srcVal = statusByte & 3;
      const names  = ['N/U', '#1', '#2', '#3'];
      siEl.innerHTML = `<span class="qs-si">${names[srcVal]}</span>`;
    } else if ([0x24, 0x25, 0x26, 0x27].includes(addr)) {
      const chVal  = statusByte & 3;
      const chNames = ['PRESET', '#1', '#2', 'REMOTE'];
      siEl.innerHTML = `<span class="qs-si">${chNames[chVal]}</span>`;
    } else {
      siEl.innerHTML = '<span class="qs-off">—</span>';
    }
    // FREQ LIMIT — spécifique aux adresses 0x11 / 0x13 (NOTE 2)
    const extraSep = document.getElementById('qs-extra-sep');
    const extraLbl = document.getElementById('qs-extra-lbl');
    const extraEl  = document.getElementById('qs-extra');
    if (extraSep && extraLbl && extraEl) {
      if ([0x11, 0x13].includes(addr)) {
        const flVal   = (statusByte >> 5) & 3;
        const flNames = ['N/U', '135.975 MHz', '136.975 MHz', '151.975 MHz'];
        extraSep.style.display = '';
        extraLbl.style.display = '';
        extraLbl.textContent   = 'FREQ LIM';
        extraEl.innerHTML      = `<span class="qs-freqlim">${flNames[flVal]}</span>`;
      } else if ([0x25, 0x26, 0x27].includes(addr)) {
        const stVal   = (statusByte >> 4) & 3;
        const stNames = ['NO SQUIT', 'SEARCH', 'PRE-TRK', 'TRACK'];
        extraSep.style.display = '';
        extraLbl.style.display = '';
        extraLbl.textContent   = 'SRCH/TRK';
        extraEl.innerHTML      = `<span class="qs-freqlim">${stNames[stVal]}</span>`;
      } else {
        extraSep.style.display = 'none';
        extraLbl.style.display = 'none';
        extraEl.innerHTML      = '';
      }
    }
  } else {
    // Layout standard : V1, V2, V3 + SI bits 1-0
    const v1=( statusByte>>7)&1, v2=(statusByte>>6)&1, v3=(statusByte>>5)&1;
    const src = statusByte & 3;
    const srcNames = ['INCONNU','UNITÉ #1','UNITÉ #2','UNITÉ #3'];
    validEl.innerHTML =
      ['D1','D2','D3'].map((lbl,i)=> {
        const v=[v1,v2,v3][i];
        return `<div class="qs-item"><span class="qs-item-label">${lbl}</span><span class="qs-item-val ${v?'qs-on':'qs-off'}">${v?'OUI':'NON'}</span></div>`;
      }).join('');
    siEl.innerHTML = `<span class="qs-si">${srcNames[src]}</span>`;
  }
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
    let html = '';
    for (const f of fields) {
      const v = (statusByte >> f.bit) & 1;
      html += row(`Bit ${f.bit} — ${f.name}`, v === 1 ? `1 — ${f.desc}` : `0`, v === 1 ? 'ok' : 'dim');
    }
    // Source ident 2-bit (bits 1,0) pour 0x1E/0x1F — NOTE 1 du manuel
    if ([0x1E, 0x1F].includes(addr)) {
      const srcVal = statusByte & 3;
      const srcNames = ['N/U', 'UNITÉ #1', 'UNITÉ #2', 'N/U'];
      html += row('Source ident (b1,b0)', `${srcVal.toString(2).padStart(2,'0')}b = ${srcNames[srcVal]}`, 'accent');
    }
    // Source ident 2-bit (bits 1,0) pour 0x20 / 0x21 / 0x22 — NOTE 1 du manuel
    if ([0x20, 0x21, 0x22].includes(addr)) {
      const srcVal = statusByte & 3;
      const srcNames = ['N/U', 'UNITÉ #1', 'UNITÉ #2', 'UNITÉ #3'];
      html += row('Source ident (b1,b0)', `${srcVal.toString(2).padStart(2,'0')}b = ${srcNames[srcVal]}`, 'accent');
    }
    // Channel ident 2-bit (bits 1,0) pour DME 0x24-0x27 — NOTE 1 du manuel
    if ([0x24, 0x25, 0x26, 0x27].includes(addr)) {
      const chVal = statusByte & 3;
      const chNames = ['PRESET (ou REMOTE)', '#1 ACTIVE', '#2 ACTIVE', 'REMOTE ONLY'];
      html += row('Channel ident (b1,b0)', `${chVal.toString(2).padStart(2,'0')}b = ${chNames[chVal]}`, 'accent');
    }
    // Source ident 3-bit (bits 3,1,0) pour 0x10–0x13 — NOTE 1 du manuel
    if ([0x10, 0x11, 0x12, 0x13].includes(addr)) {
      const b3 = (statusByte >> 3) & 1;
      const b1 = (statusByte >> 1) & 1;
      const b0 = (statusByte >> 0) & 1;
      const srcVal = (b3 << 2) | (b1 << 1) | b0;
      const srcNames = ['TOUTES UNITÉS','UNITÉ #1','UNITÉ #2','UNITÉ #3','---','PRESET #1','PRESET #2','PRESET #3'];
      html += row('Source ident (b3,b1,b0)', `${srcVal.toString(2).padStart(3,'0')}b = ${srcNames[srcVal]}`, 'accent');
    }
    html += row('Brut', '0x' + statusByte.toString(16).toUpperCase().padStart(2,'0') + ' = ' + statusByte.toString(2).padStart(8,'0') + 'b', 'dim');
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
    const decoded = [0x20, 0x24].includes(addr)
      ? tryDecodeNavFreq(addr === 0x24 ? [dataBytes[0], dataBytes[1] & 0x7F] : dataBytes)
      : tryDecodeBCDFreq(dataBytes);
    if (decoded) {
      const freqLabel = [0x11, 0x13].includes(addr) ? 'Fréquence STANDBY (BCD)' : 'Fréquence ACTIVE (BCD)';
      html += `<div class="detail-row"><span class="detail-key">${freqLabel}</span><span class="detail-val ok">${decoded}</span></div>`;
    }
  }
  if (addr === 0x27 && dataBytes.length >= 1) {
    let ident = '';
    for (let i = 0; i < Math.min(4, dataBytes.length); i++) {
      const valid = (dataBytes[i] >> 7) === 0;
      const c = dataBytes[i] & 0x7F;
      ident += valid && c >= 0x20 && c < 0x7F ? String.fromCharCode(c) : '?';
    }
    html += `<div class="detail-row"><span class="detail-key">Ident ASCII</span><span class="detail-val ok">${ident.trim()}</span></div>`;
  }

  body.innerHTML = html;
}

// ── BCD frequency decoder — manuel §5 page 24 ────────
// Byte2[7:4]=0.001MHz  Byte2[3:0]=PAD (ignoré)
// Byte3[7:4]=0.1MHz    Byte3[3:0]=0.01MHz
// Byte4[7]=PAD(ignoré) Byte4[6:4]=10MHz(3bits) Byte4[3:0]=1MHz
// Le digit 100 MHz (toujours 1) est implicite — non encodé
function tryDecodeBCDFreq(data) {
  try {
    if (data.length < 3) return null;
    const b2 = data[0], b3 = data[1], b4 = data[2];
    const d0001 = (b2 >> 4) & 0xF;   // 0.001 MHz — bits 7-4 de l'octet 2
    const d01   = (b3 >> 4) & 0xF;   // 0.1 MHz   — bits 7-4 de l'octet 3
    const d001  = (b3 >> 0) & 0xF;   // 0.01 MHz  — bits 3-0 de l'octet 3
    const d10   = (b4 >> 4) & 0x7;   // 10 MHz    — bits 6-4 de l'octet 4 (bit 7=PAD)
    const d1    = (b4 >> 0) & 0xF;   // 1 MHz     — bits 3-0 de l'octet 4
    if ([d0001, d01, d001, d10, d1].some(d => d > 9)) return null;
    if (d10 === 0 && d1 === 0) return null;
    return `1${d10}${d1}.${d01}${d001}${d0001} MHz`;
  } catch { return null; }
}

// NAV FREQ (0x20) : byte2[7:4]=0.1MHz  byte2[3:0]=0.01MHz
//                   byte3[6:4]=10MHz   byte3[3:0]=1MHz   (bit 7=PAD)
function tryDecodeNavFreq(data) {
  try {
    if (data.length < 2) return null;
    const b2 = data[0], b3 = data[1];
    const d01  = (b2 >> 4) & 0xF;
    const d001 = (b2 >> 0) & 0xF;
    const d10  = (b3 >> 4) & 0x7;
    const d1   = (b3 >> 0) & 0xF;
    if ([d01, d001, d10, d1].some(d => d > 9)) return null;
    if (d10 === 0 && d1 === 0) return null;
    return `1${d10}${d1}.${d01}${d001} MHz`;
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
  document.getElementById('banner-values').innerHTML = '';
  document.getElementById('qs-valid').innerHTML = '<span class="qs-off">—</span>';
  document.getElementById('qs-si').innerHTML    = '<span class="qs-off">—</span>';
  ['addr-hex','addr-dec','addr-bin','addr-name','addr-system','addr-db','addr-desc']
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
