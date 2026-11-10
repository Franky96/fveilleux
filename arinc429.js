// ════════════════════════════════════════════════════
//  Décodeur ARINC 429
// ════════════════════════════════════════════════════
// ----------------------------------------------------
// Sécurité : vérifier la connexion et les permissions
const _permsArinc = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || (!_permsArinc.includes('arinc429') && !_permsArinc.includes('avionique') && sessionStorage.getItem('userRole') !== 'admin')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

let currentWord = null;

// ── Label reference data ────────────────────────────
// Source: ARINC Specification 429 Part 1-17 (May 17, 2004)
// Attachment 1-1 (label table), Attachment 2 (BCD/BNR data standards),
// Attachment 6 (reference tables 6-25 through 6-46).
// Rules: most common parameter per label; skip Spare/Not Used/proprietary;
// BNR=X→BNR, BCD=X→BCD, DISC=X→DIS.
const LABELS = [
  // eq = équipements (Eqpt. ID, hexa, Attachment 1-2) qui émettent ce paramètre sur cette étiquette.
  // Par défaut : le paramètre émis par le plus d'équipements ; les autres sont dans ALT_CONFIGS (menu du bandeau).
  { oct: '001', enc: 'BCD', param: 'Distance to Go',                    unit: 'nm',      eq: ['002','056','060'] },
  { oct: '002', enc: 'BCD', param: 'Time to Go',                        unit: 'min',     eq: ['002','056','060'] },
  { oct: '003', enc: 'BCD', param: 'Cross Track Distance',              unit: 'nm',      eq: ['002'] },
  { oct: '004', enc: 'BCD', param: 'Runway Distance to Go',             unit: 'ft',      eq: ['001'] },
  { oct: '005', enc: 'DIS', param: 'Engine Discrete',                   unit: '',        eq: ['0D0'] },
  { oct: '006', enc: 'DIS', param: 'Engine Discrete',                   unit: '',        eq: ['0D0'] },
  { oct: '007', enc: 'DIS', param: 'Spare',                             unit: '' },
  { oct: '010', enc: 'BCD', param: 'Present Position - Latitude',       unit: '',        eq: ['002','004','038'] },
  { oct: '011', enc: 'BCD', param: 'Present Position - Longitude',      unit: '',        eq: ['002','004','038'] },
  { oct: '012', enc: 'BCD', param: 'Ground Speed',                      unit: 'kt',      eq: ['002','004','005','025','038','056','060'] },
  { oct: '013', enc: 'BCD', param: 'Track Angle - True',                unit: 'deg',     eq: ['002','004','038'] },
  { oct: '014', enc: 'BCD', param: 'Magnetic Heading',                  unit: 'deg',     eq: ['004','005','038'] },
  { oct: '015', enc: 'BCD', param: 'Wind Speed',                        unit: 'kt',      eq: ['002','004','005','038'] },
  { oct: '016', enc: 'BCD', param: 'Wind Direction - True',             unit: 'deg',     eq: ['004','038'] },
  { oct: '017', enc: 'BCD', param: 'Selected Runway Heading',           unit: 'deg',     eq: ['010','055','0A0','0B0'] },
  { oct: '020', enc: 'BCD', param: 'Selected Vertical Speed',           unit: 'ft/min',  eq: ['020','0A1'] },
  { oct: '021', enc: 'BCD', param: 'Selected EPR',                      unit: 'EPR',     eq: ['002','020'] },
  { oct: '022', enc: 'BCD', param: 'Selected Mach',                     unit: 'Mach',    eq: ['020','0A1'] },
  { oct: '023', enc: 'BCD', param: 'Selected Heading',                  unit: 'deg',     eq: ['020','0A1'] },
  { oct: '024', enc: 'BCD', param: 'Selected Course #1',                unit: 'deg',     eq: ['011','020','0A1','0B1'] },
  { oct: '025', enc: 'BCD', param: 'Selected Altitude',                 unit: 'ft',      eq: ['020','0A1'] },
  { oct: '026', enc: 'BCD', param: 'Selected Airspeed',                 unit: 'kt',      eq: ['003','020','0A1'] },
  { oct: '027', enc: 'BCD', param: 'Selected Course #2',                unit: 'deg',     eq: ['011','020','0A1','0B1'] },
  { oct: '030', enc: 'BCD', param: 'VHF COM Frequency',                 unit: 'MHz',     eq: ['020','024','0B6'] },
  { oct: '031', enc: 'DIS', param: 'Beacon Transponder Code',           unit: '',        eq: ['020','0B8'] },
  { oct: '032', enc: 'BCD', param: 'ADF Frequency',                     unit: 'kHz',     eq: ['012','020','0B2'] },
  { oct: '033', enc: 'BCD', param: 'ILS Frequency',                     unit: 'MHz',     eq: ['002','010','020','056','060','0B0'] },
  { oct: '034', enc: 'BCD', param: 'VOR/ILS Frequency',                 unit: 'MHz',     eq: ['002','011','020','025','056','060','0B0'] },
  { oct: '035', enc: 'BCD', param: 'DME Frequency',                     unit: 'MHz',     eq: ['002','009','020','056','060','0A9'] },
  { oct: '036', enc: 'BCD', param: 'MLS Frequency',                     unit: 'MHz',     eq: ['002','020','0C7'], hors: 'ARINC 727 (MLS)' },
  { oct: '037', enc: 'BCD', param: 'HF COM Frequency',                  unit: 'MHz',     eq: ['020','0B9'] },
  { oct: '040', enc: 'DIS', param: 'Spare',                             unit: '' },
  { oct: '041', enc: 'BCD', param: 'Set Latitude',                      unit: '',        eq: ['002','004','020','056','060','0A4'] },
  { oct: '042', enc: 'BCD', param: 'Set Longitude',                     unit: '',        eq: ['002','004','020','056','060','0A4'] },
  { oct: '043', enc: 'BCD', param: 'Set Magnetic Heading',              unit: 'deg',     eq: ['002','004','020','056','060','0A4'] },
  { oct: '044', enc: 'BCD', param: 'True Heading',                      unit: 'deg',     eq: ['004','038'] },
  { oct: '045', enc: 'BCD', param: 'Minimum Airspeed',                  unit: 'kt',      eq: ['003'] },
  { oct: '046', enc: 'BCD', param: 'Engine Serial No. (LSDs)',          unit: '',        eq: ['033','10A','10B'] },
  { oct: '047', enc: 'BCD', param: 'Engine Serial No. (MSDs)',          unit: '',        eq: ['033','10A','10B'] },
  { oct: '050', enc: 'DIS', param: 'Spare',                             unit: '' },
  { oct: '051', enc: 'DIS', param: 'Spare',                             unit: '' },
  { oct: '052', enc: 'BNR', param: 'Body Pitch Acceleration',           unit: 'deg/s²',  eq: ['004','038'] },
  { oct: '053', enc: 'BNR', param: 'Body Roll Acceleration',            unit: 'deg/s²',  eq: ['004','038'] },
  { oct: '054', enc: 'BNR', param: 'Body Yaw Acceleration',             unit: 'deg/s²',  eq: ['004','038'] },
  { oct: '055', enc: 'DIS', param: 'Spare',                             unit: '' },
  { oct: '056', enc: 'BCD', param: 'ETA (Active Waypoint)',             unit: '',        eq: ['056','060'] },
  { oct: '057', enc: 'DIS', param: 'Spare',                             unit: '' },
  { oct: '060', enc: 'BCD', param: 'S/G Hardware Part Number',          unit: '',        eq: ['025'] },
  { oct: '061', enc: 'BNR', param: 'ACMS Information',                  unit: '',        eq: ['002','056','060'] },
  { oct: '062', enc: 'BNR', param: 'ACMS Information',                  unit: '',        eq: ['002','056','060'] },
  { oct: '063', enc: 'BNR', param: 'ACMS Information',                  unit: '',        eq: ['002','056','060'] },
  { oct: '064', enc: 'BNR', param: 'Tire Pressure (Nose)',              unit: 'PSIA',    eq: ['03C'] },
  // 065 à 377 : générés depuis le manuel (arinc429-etiquettes.js), ajoutés par fusionnerGen() plus bas
];

// Pre-compute hex for each label
LABELS.forEach(l => {
  const dec = parseInt(l.oct, 8);
  l.hex = dec.toString(16).toUpperCase().padStart(2, '0');
  l.dec = dec;
});

// ── Decode metadata ─────────────────────────────────
// Source: ARINC 429 Part 1-17 Attachment 2 (BNR/BCD data standards)
//
// BNR: { msb: <value represented when ONLY bit 28 is set, in engineering units> }
//      Sign-magnitude format: bit 29 = sign, bits 28-11 = 18-bit magnitude
//      Exception: ssmSign:true → sign derived from SSM (01=+/N/E, 10=-/S/W)
//
// BCD: { decimals: <decimal places to apply to the 5-digit BCD integer> }
//      5-digit BCD packed MSB-first in bits 29-11:
//        bits 29-27 = d4 (3 bits, 0-7)
//        bits 26-23 = d3 (4 bits, 0-9)
//        bits 22-19 = d2 (4 bits, 0-9)
//        bits 18-15 = d1 (4 bits, 0-9)
//        bits 14-11 = d0 (4 bits, 0-9)   [LSB digit]
//      value = (d4×10000 + d3×1000 + d2×100 + d1×10 + d0) / 10^decimals
//
// Special flags:
//   maskD0    – force d0=0 (bits 14-11 contain discrete data, not BCD)
//   bcdDigits – use only top N digits (3 = d4+d3+d2 only, force d1=d0=0)
//   halfBit   – ARINC bit number whose value × halfStep is added to result
//   halfStep  – value added per halfBit (e.g. 0.5 kHz for ADF, 0.05 MHz for DME)
//   squawk    – decode as 4-digit octal transponder squawk code (031)


// SSM descriptions by label type (BIT31, BIT30 → index 0-3)
const SSM_TABLES = {
  radio: ['Normal (NML)',          'No Computed Data (NCD)', 'Functional Test (FT)', 'Undefined'],
  bcd:   ['+, N, E, R, TO, ↑',  'No Computed Data (NCD)', 'Functional Test (FT)', '−, S, W, L, FROM, ↓'],
  bnr:   ['Failure Warning (FW)',  'No Computed Data (NCD)', 'Functional Test (FT)', 'Normal (NML)'],
  dis:   ['Normal (NML)',          'No Computed Data (NCD)', 'Functional Test (FT)', 'Failure Warning (FW)'],
  maint: ['Failure Warning (FW)', 'No Computed Data (NCD)', 'Functional Test (FT)', 'Normal (NML)'],
  iso:   ['Mot intermédiaire', 'Mot initial (STX)', 'Mot final', 'Undefined'],                 // messages ISO n° 5 (tableaux 6-3, 6-33)
  avm:   ['Bits de commande (31-25)', 'Bits de commande (31-25)', 'Bits de commande (31-25)', 'Bits de commande (31-25)'],   // 227 03D (6-28)
};

// SDI descriptions by label type (bits 10-9 → index 0-3)
const SDI_TABLES = {
  tous:  ['Tous / Système #4', 'Système #1', 'Système #2', 'Système #3'],
  other: ['Non utilisé',       'Système #1', 'Système #2', 'Système #3'],
};

function getLabelSsmType(labelInfo) {
  if (!labelInfo) return 'bcd';
  if (labelInfo.ssm) return labelInfo.ssm;   // choix actif dont le SSM diffère de la règle par numéro
  const oct = parseInt(labelInfo.oct, 8);
  if (oct >= 0o030 && oct <= 0o037) return 'radio';
  if ((oct >= 0o155 && oct <= 0o161) || (oct >= 0o350 && oct <= 0o354)) return 'maint';
  if (oct >= 0o270 && oct <= 0o276) return 'dis';
  if (labelInfo.enc === 'BNR') return 'bnr';
  if (labelInfo.enc === 'DIS') return 'dis';
  return 'bcd';
}

const DECODE_META = {
  // ── BCD labels ────────────────────────────────────
  // decimals = PAD_nibbles + physical_decimal_places
  // e.g. 4 sig digits + 1 PAD nibble + 0.1 resolution → 1+1 = decimals:2
  // fmt : format particulier (décodeur et carte des bits) ; il suit le choix actif, pas le numéro d'étiquette
  '001': { decimals: 1, signe: true },  // Distance to Go (NM)      – 5 digits, 0.1 NM res, ±3999.9 (signe dans le SSM)
  '002': { decimals: 2, padLow: 1 },  // Time to Go (min)          – 4 digits + PAD, 0.1 min res
  '003': { decimals: 2, padLow: 1 },  // Cross Track Distance (NM) – 4 digits + PAD, 0.1 NM res
  '004': { decimals: 0, padLow: 2 },  // Runway Distance to Go (ft)– 3 digits + 2 PAD, 100 ft res
  '005': { discBits: [11, 12], bitDescs: { 11: 'Canal A', 12: 'Canal B' } },   // Engine Discrete (Att. 2, table 2 : bit 11 canal A, bit 12 canal B)
  '010': { decimals: 4, fmt: 'latlon', lat: true },   // Present Position - Latitude  (deg DDMM.m, table 6-25-1)
  '011': { decimals: 4, fmt: 'latlon' },              // Present Position - Longitude (deg DDDMM.m)
  '012': { decimals: 1, padLow: 1 },  // Ground Speed (kt)          – 4 digits + PAD, 1 kt res (d4=1000s)
  '013': { decimals: 2, padLow: 1 },  // Track Angle - True (deg)   – 4 digits + PAD, 0.1° res
  '014': { decimals: 2, padLow: 1 },  // Magnetic Heading (deg)     – 4 digits + PAD, 0.1° res
  '015': { decimals: 2, padLow: 2 },  // Wind Speed (kt)            – 3 digits + 2 PAD, 1 kt res
  '016': { decimals: 2, padLow: 2 },  // Wind Direction - True (deg)– 3 digits + 2 PAD, 1° res
  '017': { decimals: 2, padLow: 1 },  // Selected Runway Heading    – 4 digits + PAD, 0.1° res
  '020': { decimals: 1, padLow: 1, signe: true },  // Selected Vertical Speed (ft/min) ±6000 – d4=1000s,d3=100s,d2=10s,d1=1s,d0=PAD
  '021': { decimals: 4, padLow: 1 },  // Selected EPR – 4 chiffres, 0.001 (Att. 2) : d4=unités, d3, d2, d1=millièmes, d0=PAD
  '022': { decimals: 4, padLow: 1 },  // Selected Mach     – d4=unités, d3=10ths, d2=100ths, d1=1000ths, PAD
  '023': { decimals: 2, padLow: 2 },  // Selected Heading (deg)   – 3 digits + 2 PAD, 1° res
  '024': { decimals: 2, padLow: 2 },  // Selected Course #1 (deg) – 3 digits + 2 PAD, 1° res
  '025': { decimals: 0 },             // Selected Altitude (ft)   – 5 digits, tous utilisés, 1 ft res
  '026': { decimals: 2, padLow: 2 },  // Selected Airspeed (kt)   – 3 digits + 2 PAD, 1 kt res
  '027': { decimals: 2, padLow: 2 },  // Selected Course #2 (deg) – 3 digits + 2 PAD, 1° res
  // ── Radio frequency labels (SSM: 00=NML, 01=NCD, 10=FT, 11=Undef) ──
  '030': { decimals: 3, implicit: 100, fmt: 'vhf' },  // VHF COM (MHz) – 118-137, centaine implicite (table 6-45)
  '031': { transponder: true, fmt: 'squawk', catBits: [11,12,13,14,15,16,17],
    discBits: [11,12,13,14,15,16,17],
    bitDescs: {
      11: 'Altitude Report — 0=ON  1=OFF',
      12: 'Control Panel (CP)',
      13: 'Ident — 0=OFF  1=ON',
      14: 'Alt Data Source — 0=#1  1=#2',
      15: 'Control Panel (CP)',
      16: 'Control Panel (CP)',
      17: 'Hijack Mode — 0=OFF  1=ON',
    },
  },
  '032': { decimals: 1, maskD0: true, halfBit: 14, halfStep: 0.5, fmt: 'adf', catBits: [11, 12],
    discBits: [11, 12],
    spareBits: [13],
    bitDescs: {
      11: 'BFO — 0=OFF  1=ON',
      12: 'Mode — 0=ADF  1=ANT',
      13: 'Spare (non utilisé)',
      14: '+0.5 kHz — 0=non  1=oui',
    },
  },  // ADF (kHz) – bits 29-27=1000kHz, 26-23=100kHz, 22-19=10kHz, 18-15=1kHz, 14=0.5kHz
  '033': { decimals: 3, implicit: 100, maskD0: true, fmt: 'ils', catBits: [11, 12],
    discBits: [11, 12], spareBits: [13, 14],
    bitDescs: {
      11: 'ILS CAT bit 0',
      12: 'ILS CAT bit 1 — 00=Non  01=CAT I  10=CAT II  11=CAT III',
      13: 'Spare', 14: 'Spare',
    },
  },
  '034': { decimals: 3, implicit: 100, maskD0: true, fmt: 'vorils', catBits: [14],
    discBits: [14], spareBits: [11, 12, 13],
    bitDescs: {
      11: 'Spare', 12: 'Spare', 13: 'Spare',
      14: 'Mode — 0=VOR  1=ILS',
    },
  },
  '035': { decimals: 3, implicit: 100, bcdDigits: 3, halfBit: 18, halfStep: 0.05, fmt: 'dme', catBits: [11,12,13,14,15,16,17],
    discBits: [11, 12, 13, 14, 15, 16, 17, 18],
    bitDescs: {
      11: 'DME Mode bit 0',
      12: 'DME Mode bit 1',
      13: 'DME Mode bit 2 — 000=STBY  001=NORM  010=TEST  011=SCAN  100=HELD',
      14: 'Fréq Mode bit 0 — (15,14): 00=VOR  01=ILS  10=MLS  11=spare',
      15: 'Fréq Mode bit 1 — (15,14): 00=VOR  01=ILS  10=MLS  11=spare',
      16: 'Display — 1=fournir une sortie BCD affichable',
      17: 'Ident — 1=générer la sortie ident',
      18: '+0.05 MHz (VOR & ILS seulement)',
    },
  },
  // 036 MLS Frequency : format hors de ce manuel (voir LABELS, « hors ») ; pas de décodage
  // HF COM (tables 6-42 et 6-42-1) : mot 1 (bit 9 = 0) : 10 MHz (bits 29-28), 1, 0.1, 0.01, 0.001 MHz (bits 27-12),
  // bit 11 = 1 USB / 0 LSB, bit 10 = 1 SSB / 0 AM ; mot 2 (bit 9 = 1) : 0.1 kHz (bits 29-26), bit 10 = CW
  '037': { hfCom: true, fmt: 'hfcom', catBits: [9, 10, 11],
    discBits: [9, 10, 11],
    bitDescs: {
      9:  'Word Ident — 0=mot 1 (MHz)  1=mot 2 (0.1 kHz)',
      10: 'Mot 1 : 1=SSB  0=AM — Mot 2 : 1=CW',
      11: 'Mot 1 : 1=USB  0=LSB',
    },
  },
  '041': { decimals: 4, fmt: 'latlon', lat: true },  // Set Latitude  (deg/min, same decode as 010)
  '042': { decimals: 4, fmt: 'latlon' },             // Set Longitude (deg/min, same decode as 011)
  '043': { decimals: 2, padLow: 2 },  // Set Magnetic Heading (deg) – 3 digits, 1° res
  '044': { decimals: 2, padLow: 1 },  // True Heading (deg) – 4 digits, 0.1° res
  '045': { decimals: 2, padLow: 1 },  // Minimum Airspeed (kt) – 4 digits, 0.1 kt res
  '046': { decimals: 1, padLow: 1, padHigh: 1, fmt: 'serieLSD' },  // Engine Serial No. (LSDs), table 6-15 – d3=3rd, d2=2nd, d1=LSD
  '047': { decimals: 1, padLow: 1, padHigh: 1, fmt: 'serieMSD' },  // Engine Serial No. (MSDs), table 6-16 – d3=MSD, d2=5th, d1=4th
  // 052-054 : accélérations angulaires IRS/ADIRS (BNR ±64 deg/s², 15 bits, 0.002) ; les anciens défauts sont dans ALT_CONFIGS
  '052': { msb: 32, spareBits: [11, 12, 13], bnrDecimals: 3 },
  '053': { msb: 32, spareBits: [11, 12, 13], bnrDecimals: 3 },
  '056': { decimals: 1, fmt: 'eta' },  // ETA – HH:MM.m, custom decoder
  
  
  
  
  
  
  
  

  // S/G Hardware Part Number — BCD, 4 digits (bits 29-14), RESERVED bits 11-13
  // SDI = Sequence ID: 01=First 3 digits, 10=Next 4 digits, 11=Last 3 digits
  // Bits 13-12 = Position ID (Table 2): 00=Left, 10=CtrL, 11=CtrR, 01=Right
  '060': {
    partNum: true, fmt: 'pn',
    discBits: [11, 12, 13],
    bitDescs: {
      9:  'SDI bit 0 — Sequence ID (Table 1): 01=First 3 digits  10=Next 4  11=Last 3',
      10: 'SDI bit 1 — Sequence ID (Table 1)',
      11: 'RESERVED — 1=Own P/N  0=Other P/N',
      12: 'RESERVED — Position ID bit 0 (Table 2): 00=Left  10=CtrL  11=CtrR  01=Right',
      13: 'RESERVED — Position ID bit 1 (Table 2)',
    },
  },









  // ── BNR labels ────────────────────────────────────
  // ACMS Information — ISO #5 characters, no SDI, 3 chars × 7 bits per word
  '061': { iso5: ['Char 1 (src)', 'Char 2 (src)', 'Char 3 (src)'] },
  '062': { iso5: ['Char 4 (src)', '(space)',       'Dest 1'      ] },
  '063': { iso5: ['Dest 2',       'Dest 3',        'Dest 4'      ] },
  '054': { msb: 32, spareBits: [11, 12, 13], bnrDecimals: 3 },  // Body Yaw Acceleration ±64 deg/s², 15 sig bits (28-14), PAD 11-13
  '064': { msb: 512,    spareBits: [11, 12, 13, 14, 15, 16, 17, 18], bnrDecimals: 0 },  // Tire Press — 10 sig bits (28-19), bits 11-18 = PAD, res 1 PSIA
  
  
  
  

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
};

// ── Alternate label configurations ──────────────────────────────────────────
// Each entry: array of extra configs. Index 0 in array = config slot 1 (slot 0
// is always the default from LABELS / DECODE_META).
// Les paramètres que d'autres équipements émettent sur la même étiquette (Attachment 1-1 et Attachment 2), ou une
// variante de format du même paramètre. Chaque entrée : { param, unit, enc, eq, meta, ssm?, hors?, note? }
//   ssm  : type de SSM s'il diffère de la règle par numéro (ex. un mot BCD numérique sur une étiquette radio)
//   hors : le format est défini dans un autre document que ce manuel → pas de décodage, une note l'indique
const PAD = (de, a) => Array.from({ length: a - de + 1 }, (_, i) => de + i);
const TIRE_PRESS = { msb: 512, spareBits: PAD(11, 18), bnrDecimals: 0 };          // 1024 PSIA, 10 bits, 1 PSIA
const TIRE_LOAD  = { decimals: 2, padLow: 1 };                                    // 0-299.9 %, 4 chiffres, 0.1
const LBS_5      = { decimals: 0 };                                                // 0-79999, 5 chiffres, 1.0
const GEAR = { param: 'Landing Gear Position Infor & System Status', unit: '', enc: 'DIS', eq: ['06D'], hors: 'LGCIU (A320), hors ARINC 429' };
const ALT_CONFIGS = {
  '002': [ { param: 'Time to Station', unit: 'min', enc: 'BCD', eq: ['115'], meta: { decimals: 2, padLow: 1 } } ],
  '012': [ { param: 'QTY-LD SEL (LB)', unit: 'lb', enc: 'BCD', eq: ['04D'], meta: LBS_5 } ],
  '013': [ { param: 'QTY-FLT Deck (LB)', unit: 'lb', enc: 'BCD', eq: ['04D'], meta: LBS_5 },
           { param: 'Control Word for TCAS/Mode S', unit: '', enc: 'DIS', eq: ['0B8'], hors: 'ARINC 718A / 735A' } ],
  '016': [ { param: 'Control Word for TCAS/Mode S', unit: '', enc: 'DIS', eq: ['0B8'], hors: 'ARINC 718A / 735A' } ],
  '017': [ { param: 'Total-FLT Deck (LB)', unit: 'lb', enc: 'BCD', eq: ['04D'], meta: LBS_5 } ],
  '020': [ { param: 'TNK-LD SEL (LB)', unit: 'lb', enc: 'BCD', eq: ['04D'], meta: LBS_5 }, GEAR ],
  '021': [ { param: 'Selected N1', unit: 'RPM', enc: 'BCD', eq: ['002','020','0A1'], meta: { decimals: 1, padLow: 1 } },
           { param: 'Selected EPR (3 chiffres)', unit: 'EPR', enc: 'BCD', eq: ['0A1'], meta: { decimals: 4, padLow: 2 },
             note: 'Att. 2 : 3 chiffres pour le 0A1, mais une résolution de 0.001 ; 3 chiffres sur 0-3 donnent 0.01' },
           GEAR ],
  '022': [ { param: 'QTY-LD SEL (KG)', unit: 'kg', enc: 'BCD', eq: ['04D'], meta: LBS_5 }, GEAR ],
  '023': [ { param: 'QTY-FLT Deck (KG)', unit: 'kg', enc: 'BCD', eq: ['04D'], meta: LBS_5 }, GEAR ],
  '024': [ GEAR ],
  '025': [ { param: 'Load SEL Control', unit: '', enc: 'BNR', eq: ['04D'], meta: { msb: 102400, spareBits: PAD(11, 17), bnrDecimals: 0 } } ],
  '027': [ { param: 'TACAN Selected Course', unit: 'deg', enc: 'BCD', eq: ['002','056','060'], meta: { decimals: 2, padLow: 2 } },
           { param: 'Total-FLT Deck (KG)', unit: 'kg', enc: 'BCD', eq: ['04D'], meta: LBS_5 } ],
  '030': [ { param: 'TNK-LD SEL (KG)', unit: 'kg', enc: 'BCD', eq: ['04D'], meta: LBS_5, ssm: 'bcd' } ],
  '033': [ { param: 'Landing System Mode/Frequency', unit: '', enc: 'BCD', eq: ['055'], hors: 'ARINC 755 (MMR)' } ],
  '034': [ { param: 'Baro Correction (mb) #3', unit: 'mb', enc: 'BCD', eq: ['006'], meta: { decimals: 1 }, ssm: 'bcd' },
           { param: 'VOR/ILS Frequency (BNR)', unit: '', enc: 'BNR', eq: ['025'], hors: 'ARINC 725 (EFIS)', ssm: 'bnr' } ],
  '035': [ { param: 'Baro Correction (in Hg) #3', unit: 'inHg', enc: 'BCD', eq: ['006'], meta: { decimals: 3 }, ssm: 'bcd' },
           { param: 'Paired DME Frequency', unit: 'MHz', enc: 'BCD', eq: ['055'], hors: 'ARINC 755 (MMR)' },
           { param: 'DME Frequency (BNR)', unit: '', enc: 'BNR', eq: ['025'], hors: 'ARINC 725 (EFIS)', ssm: 'bnr' } ],
  '036': [ { param: 'MLS Channel Selection', unit: '', enc: 'BCD', eq: ['055'], meta: { decimals: 2, padLow: 2 }, ssm: 'bcd' },
           { param: 'MLS Frequency Channel', unit: '', enc: 'BCD', eq: ['056','060'], hors: 'ARINC 756 / 760' } ],
  '047': [ { param: 'VHF COM Frequency', unit: '', enc: 'BCD', eq: ['020','024','0B6'], hors: 'ARINC 716 / 750 (VHF)', ssm: 'radio' } ],
  '052': [ { param: 'Long. Zero Fuel CG', unit: '% MAC', enc: 'BCD', eq: ['037'], meta: { decimals: 2 } } ],
  '053': [ { param: 'Track Angle - Magnetic', unit: 'deg', enc: 'BCD', eq: ['005'], meta: { decimals: 2, padLow: 2 } } ],
  '054': [ { param: 'Zero Fuel Weight (KG)', unit: 'kg', enc: 'BNR', eq: ['037'], meta: { msb: 327680, spareBits: [11, 12, 13], bnrDecimals: 0 } } ],
  '056': [ { param: 'Estimated Time of Arrival', unit: '', enc: 'BCD', eq: ['002'], meta: { decimals: 1, fmt: 'eta' } },
           { param: 'Wind Direction - Magnetic', unit: 'deg', enc: 'BCD', eq: ['005'], meta: { decimals: 2, padLow: 2 } },
           { param: 'Gross Weight (KG)', unit: 'kg', enc: 'BCD', eq: ['037'], meta: { decimals: 0, bcdScale: 100 } } ],
  '060': [ { param: 'Tire Loading (Left Body Main)', unit: '%', enc: 'BCD', eq: ['037'], meta: TIRE_LOAD },
           { param: 'Tire Pressure (Left Inner)', unit: 'PSIA', enc: 'BNR', eq: ['03C'], meta: TIRE_PRESS,
             note: 'Att. 1-1 : Left Inner ; Att. 2 : Left Outer' } ],
  '061': [ { param: 'S/G Software Config. Part No.', unit: '', enc: 'BCD', eq: ['025'], meta: null /* même format que 060, voir plus bas */ },
           { param: 'Pseudo Range', unit: 'm', enc: 'BNR', eq: ['00B'], meta: { msb: 134217728, extendSdi: true, bnrDecimals: 0 } },
           { param: 'Tire Loading (Right Body Main)', unit: '%', enc: 'BCD', eq: ['037'], meta: TIRE_LOAD },
           { param: 'Tire Pressure (Left Outer)', unit: 'PSIA', enc: 'BNR', eq: ['03C'], meta: TIRE_PRESS,
             note: 'Att. 1-1 : Left Outer ; Att. 2 : Left Inner' } ],
  '062': [ { param: 'Pseudo Range Fine', unit: 'm', enc: 'BNR', eq: ['00B'], meta: { msb: 128, spareBits: PAD(11, 17), bnrDecimals: 3 } },
           { param: 'Tire Loading (Left Wing Main)', unit: '%', enc: 'BCD', eq: ['037'], meta: TIRE_LOAD },
           { param: 'Tire Pressure (Right Inner)', unit: 'PSIA', enc: 'BNR', eq: ['03C'], meta: TIRE_PRESS } ],
  '063': [ { param: 'Range Rate', unit: 'm/s', enc: 'BNR', eq: ['00B'], meta: { msb: 2048, extendSdi: true, bnrDecimals: 4 } },
           { param: 'Tire Loading (Right Wing Main)', unit: '%', enc: 'BCD', eq: ['037'], meta: TIRE_LOAD },
           { param: 'Tire Pressure (Right Outer)', unit: 'PSIA', enc: 'BNR', eq: ['03C'], meta: TIRE_PRESS } ],
  '064': [ { param: 'Delta Range', unit: 'm', enc: 'BNR', eq: ['00B'], meta: { msb: 2048, extendSdi: true, bnrDecimals: 4 } },
           { param: 'Tire Loading (Nose)', unit: '%', enc: 'BCD', eq: ['037'], meta: TIRE_LOAD } ],
};

// Équipements (Eqpt. ID, Attachment 1-2) : nom court pour le menu et le bandeau
const EQPT = {
  '001': 'FCC', '002': 'FMC', '003': 'Thrust Control Computer', '004': 'IRS', '005': 'AHRS', '006': 'Air Data',
  '007': 'Radio Altimeter', '009': 'DME', '00B': 'GPS', '010': 'ILS', '011': 'VOR', '012': 'ADF', '020': 'DFS',
  '024': 'ACARS', '025': 'EFIS', '033': 'PMUX', '037': 'Weight & Balance', '038': 'ADIRS', '03C': 'TPMS',
  '04D': 'Fuel Qty (757/767)', '055': 'MMR', '056': 'GNLU', '060': 'GNU', '06D': 'Landing Gear (A320)',
  '0A1': 'FCC Controller', '0A4': 'IRS Controller', '0A9': 'DME Controller', '0B0': 'ILS Controller',
  '0B1': 'VOR Controller', '0B2': 'ADF Controller', '0B6': 'VHF COM Controller', '0B8': 'ATC Transponder Controller',
  '0B9': 'HF/SSB Controller', '0C7': 'MLS Controller', '0D0': 'Engine Instrument System (B737)',
  '10A': 'FADEC A (GE)', '10B': 'FADEC B (GE)', '115': 'TACAN',
};
const nomEq = c => EQPT[c] || (window.ARINC_EQPT || {})[c];
const eqTexte = eq => (eq || []).map(c => nomEq(c) ? `${nomEq(c)} (${c})` : c).join(', ');

// ── Étiquettes 065 à 377 : générées depuis le manuel (arinc429-etiquettes.js, outils/arinc429_generer.py) ──
// Les formats particuliers de l'attachement 6 (dates, n° de vol, UTC, TCAS, TACAN, discrets dans les bits de remplissage…)
// sont ajoutés ici, par-dessus les formats génériques BNR/BCD de l'attachement 2.
const sauf = (liste, ...bits) => (liste || []).filter(b => !bits.includes(b));
const SDI_DONNEES = Array(4).fill('— (bits 9-10 = données)');
const SDI_FQIS = ['—', 'Réservoir principal gauche', 'Réservoir principal droit', 'Réservoir central'];   // 241 04D (6-35)
const FORMATS_SPECIAUX = [
  { oct: '106', si: /Selected Mach \(12 bits\)/i, unit: 'mMach', note: 'en millièmes de Mach (exemple du tableau 6-27 : 800 = Mach 0.800)' },
  { oct: '124', si: /Horizontal Alarm Limit/i, att6: '6-49', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11, 12, 13), discBits: [11, 12, 13], catBits: [11, 12, 13],
      bitDescs: { 11: 'Phase de vol (bits 13-11, tableau 6-49)', 12: 'Phase de vol', 13: 'Phase de vol — 000 non spécifiée, 001 océanique, 010 en route…' } }) },
  { oct: '127', si: /Slat Angle/i, att6: '6-11', patch: m => leviers(m) },
  { oct: '137', si: /Flap Angle/i, att6: '6-11', patch: m => leviers(m) },
  { oct: '130', si: /Intruder Range/i, att6: '6-21', meta: { fmt: 'tcasRange' }, unit: 'nm' },
  { oct: '131', si: /Intruder Altitude/i, att6: '6-22', meta: { fmt: 'tcasAlt' }, unit: 'ft' },
  { oct: '132', si: /Intruder Bearing/i, att6: '6-23', meta: { fmt: 'tcasBrg' }, unit: 'deg' },
  { oct: '145', si: /TACAN Control/i, att6: '6-30', meta: { fmt: 'tacan', catBits: [14, 15, 26, 27, 28],
      bitDescs: { 14: 'VOR/TAC — 1=TAC  0=VOR', 15: 'TACAN — 1=TAC 1  0=TAC 2', 26: 'Mode X/Y — 1=X  0=Y', 27: 'Mode (bits 27-28) : 00 REC, 01 A/A REC, 10 T/R, 11 A/A T/R', 28: 'Mode' } } },
  { oct: '146', si: /TACAN Control/i, att6: '6-47', meta: { fmt: 'tacan', catBits: [11, 12, 14, 15, 26, 27, 28],
      bitDescs: { 11: 'Distance Memory — 1=DIST MEM', 12: 'Bearing Memory — 1=BRG MEM', 14: 'VOR/TAC — 1=TAC  0=VOR', 15: 'TACAN — 1=TAC 1  0=TAC 2', 26: 'Mode X/Y — 1=X  0=Y', 27: 'Mode (bits 27-28) : 00 REC, 01 A/A REC, 10 T/R, 11 A/A T/R', 28: 'Mode' } } },
  { oct: '147', si: /TACAN Control/i, att6: '6-48', meta: { fmt: 'tacan147', catBits: [9, 10, 11, 12, 13, 15, 16, 25, 26, 27, 28, 29],
      bitDescs: { 9: 'SEL — 1=TACAN 1  0=TACAN 2', 10: 'SEL — 1=antenne 2  0=antenne 1', 11: 'Lobe d’antenne', 12: '1=autotune  0=manuel', 13: 'A/A AGC — 1=activé  0=désactivé',
        15: 'TACAN/MLS (bits 15-16)', 16: 'TACAN/MLS', 25: 'TST — 1=test', 26: 'X/Y — 1=X  0=Y', 27: 'Mode (bits 27-28)', 28: 'Mode', 29: 'INT — 1=normal  0=inverse' } } },
  { oct: '150', si: /Universal Time|UTC/i, att6: '6-12', meta: { fmt: 'utcbnr', catBits: [11], bitDescs: { 11: 'Source — 1=horloge GNSS' } } },
  { oct: '164', si: /^Radio Height \(16 bits\)/i, att6: '6-13', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11), discBits: [11], catBits: [11], bitDescs: { 11: 'FTI — 1=ne pas faire de test fonctionnel' } }) },
  { oct: '173', si: /Localizer Deviation/i, att6: '6-6', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11), discBits: [11], catBits: [11], bitDescs: { 11: 'Tune Inhibit — 1=récepteur ILS en « tune inhibit »' } }) },
  { oct: '174', si: /Glide ?slope Deviation/i, att6: '6-6', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11), discBits: [11], catBits: [11], bitDescs: { 11: 'Tune Inhibit — 1=récepteur ILS en « tune inhibit »' } }) },
  { oct: '202', si: /^DME Distance/i, att6: '6-7', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11, 12), discBits: [11, 12], catBits: [11, 12],
      bitDescs: { 11: 'Mémoire — 1=memory on (ARINC 709)', 12: '1=station de premier plan (balayage de fréquences)' } }) },
  { oct: '203', eq: '018', att6: '6-24', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11), discBits: [11], catBits: [11], bitDescs: { 11: 'Résolution — 0=1 ft  1=100 ft' } }) },
  { oct: '205', si: /HF COM/i, att6: '6-43', meta: { fmt: 'hfcom205', catBits: [11], bitDescs: { 11: 'Word Ident — 0=mot 1 (MHz)  1=mot 2 (0.1 kHz)' } }, unit: 'MHz', enlever: 'hors' },
  { oct: '207', eq: '025', att6: '6-37', meta: null, partNum: true },
  { oct: '222', si: /VOR Omnibearing/i, att6: '6-10', patch: m => ({ ...m, spareBits: sauf(m.spareBits, 11, 12, 13), discBits: [11, 12, 13], catBits: [11, 12, 13],
      bitDescs: { 11: 'Marker 400 Hz — 1=discret à la masse', 12: 'Marker 1300 Hz — 1=discret à la masse', 13: 'Marker 3000 Hz — 1=discret à la masse' } }) },
  { oct: '260', eq: '031', att6: '6-18', meta: { fmt: 'date' }, enc: 'BCD', unit: '', enlever: 'hors' },
  { oct: '260', si: /Date/i, att6: '6-8', meta: { fmt: 'dateleg' }, enc: 'BCD', unit: '', enlever: 'hors' },
  { oct: '261', si: /^Flight Number/i, att6: '6-9', meta: { fmt: 'vol' }, enc: 'BCD', unit: '', enlever: 'hors' },
  { oct: '356', si: /ISO/i, att6: '6-3', meta: { fmt: 'iso5msg', sdiDesc: SDI_DONNEES }, ssm: 'iso', enlever: 'hors', note: 'le SSM indique le mot : 01 initial (STX, nombre de mots), 00 intermédiaire, 10 final' },
  { oct: '357', si: /ISO/i, att6: '6-3', meta: { fmt: 'iso5msg', adresse: true, sdiDesc: SDI_DONNEES }, ssm: 'iso', enlever: 'hors', note: 'le SSM indique le mot : 01 initial (STX, adresse, nombre de mots), 00 intermédiaire, 10 final' },
  { oct: '360', si: /^Flight Information/i, att6: '6-33', meta: { fmt: 'iso5msg', sdiDesc: SDI_DONNEES }, ssm: 'iso', enlever: 'hors',
    note: 'message de 7 mots : n° de vol (8 car.), origine (4 car.), destination (4 car.) ; le SSM indique le mot (01 initial, 00 suivants)' },
  { oct: '377', si: /Equipment Ident/i, att6: '6-17', meta: { fmt: 'eqid' }, enlever: 'hors' },
  { oct: '206', eq: '018', att6: '6-20', meta: { fmt: 'altvar', catBits: [11, 12, 13],
      bitDescs: { 11: 'Format (bits 13-11) : 000 15 bits/4 ft, 001 14/8 ft, 010 13/16 ft', 12: 'Format : 011 12 bits/25 ft, 100 14 bits/10 ft', 13: 'Format : 101 10 bits/100 ft' } },
    unit: '', enlever: 'hors' },
  { oct: '227', eq: '03D', att6: '6-28', meta: { fmt: 'avm', ssmSeg: 'CMD',
      sdiDesc: ['Moteur 4 (ou tous)', 'Moteur 1 (ou 1 et 2)', 'Moteur 2', 'Moteur 3 (ou 3 et 4)'] }, ssm: 'avm', enlever: 'hors' },
  { oct: '233', si: /^ACMS Information/i, att6: '6-31', meta: { fmt: 'acmsVol', car: 1 }, ssm: 'bnr', enlever: 'hors' },
  { oct: '234', si: /^ACMS Information/i, att6: '6-31', meta: { fmt: 'acmsVol', car: 3 }, ssm: 'bnr', enlever: 'hors' },
  { oct: '235', si: /^ACMS Information/i, att6: '6-31', meta: { fmt: 'acmsVol', car: 5 }, ssm: 'bnr', enlever: 'hors' },
  { oct: '236', si: /^ACMS Information/i, att6: '6-31', meta: { fmt: 'acmsVol', car: 7 }, ssm: 'bnr', enlever: 'hors' },
  // 241 04D : 63 mots qui se suivent ; un mot seul ne dit pas sa place dans la séquence, d'où un choix par type de mot
  { oct: '241', eq: '04D', att6: '6-35', enlever: 'hors', variantes: [
    { param: 'FQIS — capacité d’une sonde', unit: 'pF', enc: 'BNR', meta: { msb: 160, spareBits: [11, 12, 13, 14, 15, 16], sdiDesc: SDI_FQIS },
      note: 'mots 1-16, 22-37 et 43-53 de la séquence (sondes, compensateur, condensateur de test)' },
    { param: 'FQIS — densité du carburant', unit: 'lb/gal', enc: 'BNR', meta: { fmt: 'fqisDens', sdiDesc: SDI_FQIS },
      note: 'mots 21, 42 et 63 ; 4 lb/gal sont ajoutés à la valeur (000 = 4.0, FFF = 8.0)' },
    { param: 'FQIS — sélection de charge (1 chiffre)', unit: '', enc: 'BCD', meta: { fmt: 'fqisCharge', sdiDesc: SDI_FQIS },
      note: 'mots 17-19, 38-40 et 59-61 : chiffre des 10 000, 1 000 puis 100 lb ; caractère de tête artificiel à zéro (chiffre dans les bits 26-23)' },
  ] },
  { oct: '241', eq: '160', att6: '6-38', note: 'mots bruts de 12 bits « centrés » (tableau 6-38-1) ; position et échelle non précisées : non décodé' },
  { oct: '251', si: /Flight Leg/i, att6: '6-19', meta: { fmt: 'jambes', catBits: [29], bitDescs: { 29: 'Bit « D » (sens non précisé dans le tableau 6-19)' } }, unit: 'vols', enlever: 'hors' },
  { oct: '262', si: /^Documentary Data/i, att6: '6-14', meta: { fmt: 'docu' }, enlever: 'hors' },
  { oct: '355', si: /Acknowledg/i, att6: '6-5', note: 'format de l’accusé de réception non défini' },
];
function leviers(m) {
  return { ...m, spareBits: sauf(m.spareBits, 11, 12, 13, 14, 15), discBits: [11, 12, 13, 14, 15], catBits: [11, 12, 13, 14, 15],
    bitDescs: { 11: 'Levier position 1 (croisière)', 12: 'Levier position 2', 13: 'Levier position 3', 14: 'Levier position 4', 15: 'Levier position 5 (atterrissage)' } };
}
// Un format qui se décline en plusieurs types de mots (variantes) donne un choix par type, avec les équipements de l'original
function developper(oct, c) {
  const f = FORMATS_SPECIAUX.find(f => f.oct === oct && f.variantes && (!f.si || f.si.test(c.param)) && (!f.eq || c.eq.includes(f.eq)));
  if (!f) return [appliquerSpeciaux(oct, c)];
  return f.variantes.map(v => ({ ...c, ...v, eq: [...c.eq], att6: c.att6 || f.att6, hors: undefined }));
}
function appliquerSpeciaux(oct, c) {
  const r = { ...c, eq: [...c.eq] };
  for (const f of FORMATS_SPECIAUX) {
    if (f.oct !== oct || f.variantes) continue;
    if (f.si && !f.si.test(c.param)) continue;
    if (f.eq && !c.eq.includes(f.eq)) continue;
    if (f.patch && r.meta) r.meta = f.patch(r.meta);
    if (f.meta !== undefined) r.meta = f.meta && { ...(r.meta || {}), ...f.meta };
    if (f.partNum) r.meta = DECODE_META['060'];
    if (f.enc) r.enc = f.enc;
    if (f.ssm) r.ssm = f.ssm;
    if (f.unit !== undefined) r.unit = f.unit;
    if (f.enlever) delete r[f.enlever];
    if (f.note) r.note = r.note ? r.note + ' ; ' + f.note : f.note;
    if (f.att6 && !(r.att6 || '').includes(f.att6)) r.att6 = r.att6 ? r.att6 + ', ' + f.att6 : f.att6;
    if (r.meta && r.hors && (f.meta || f.partNum)) delete r.hors;
    break;
  }
  return r;
}
(function fusionnerGen() {
  const G = window.ARINC_GEN || {};
  for (let n = 0o065; n <= 0o377; n++) {
    const oct = n.toString(8).padStart(3, '0');
    const liste = (G[oct] || []).flatMap(c => developper(oct, c));
    if (!liste.length) { LABELS.push({ oct, enc: 'DIS', param: 'Spare', unit: '' }); continue; }
    const [d, ...autres] = liste;
    LABELS.push({ oct, enc: d.enc, param: d.param, unit: d.unit, eq: d.eq, ssm: d.ssm, hors: d.hors, note: d.note, att6: d.att6 });
    if (d.meta) DECODE_META[oct] = d.meta;
    if (autres.length) ALT_CONFIGS[oct] = autres;
  }
  LABELS.forEach(l => { const dec = parseInt(l.oct, 8); l.dec = dec; l.hex = dec.toString(16).toUpperCase().padStart(2, '0'); });
})();

// Currently selected config slot per label (0 = default)
const labelConfigIdx = {};

// « hors » : soit un autre document ARINC (on le nomme), soit une absence dans ce manuel (le texte le dit déjà)
const texteHors = h => /manuel|chapitre|précis/i.test(h) ? h : `format défini dans ${h}, pas dans ARINC 429 Part 1`;

function getActiveLabelConfig(oct) {
  const base = LABELS.find(l => l.oct === oct);
  const alts = ALT_CONFIGS[oct] || [];
  const idx  = labelConfigIdx[oct] || 0;
  if (idx === 0 || !alts[idx - 1]) {
    return { labelInfo: base, meta: base && base.hors ? undefined : DECODE_META[oct] };
  }
  const alt = alts[idx - 1];
  const meta = alt.meta === null && oct === '061' ? DECODE_META['060'] : alt.meta;
  return {
    labelInfo: { ...base, enc: alt.enc || (base && base.enc), param: alt.param, unit: alt.unit,
                 eq: alt.eq, ssm: alt.ssm, hors: alt.hors, note: alt.note, att6: alt.att6 },
    meta: alt.hors ? undefined : meta,
  };
}

function switchLabelConfig(oct, idx) {
  labelConfigIdx[oct] = parseInt(idx);
  if (currentWord !== null) {
    renderBits(currentWord);
    renderFields(currentWord);
  }
}


// ── BNR exact arithmetic helper ───────────────────────────────────────────────
// Returns { value: <float>, step: <float> }
//   value = exact decoded engineering value (full float precision, no rounding)
//   step  = weight of the lowest significant data bit (= resolution)
//
// Bit masking: both spareBits AND discBits are excluded from magnitude so that
// discrete bits (e.g. bit 11 = Tune Inhibit on labels 173/174) never pollute the BNR sum.
//
function computeBNR(word, meta, data19) {
  // Sign bit
  let sign;
  if (meta.ssmSign) {
    sign = ((word >> 29) & 0x3) === 0b10 ? 1 : 0;
  } else {
    sign = (data19 >> 18) & 1;
  }

  // 18-bit magnitude from bits 28-11; mask out spare AND discrete bits
  let magnitude = data19 & 0x3FFFF;
  const excluded = new Set([...(meta.spareBits || []), ...(meta.discBits || [])]);
  for (const b of excluded) {
    if (b >= 11 && b <= 28) magnitude &= ~(1 << (b - 11));
  }

  // Extended SDI: bits 9-10 extend the magnitude to 20 bits
  if (meta.extendSdi) {
    const sdiBits = (word >> 8) & 0x3;
    magnitude = (magnitude << 2) | sdiBits;
  }

  // Resolution = weight of bit 11 (if it were a data bit) = msb / 2^17
  const baseRes = meta.extendSdi ? meta.msb / 524288 : meta.msb / 131072;

  // Exact decoded value (two's complement or sign-magnitude)
  const value = meta.ssmSign
    ? (sign ? -1 : 1) * magnitude * baseRes
    : (sign ? -2 * meta.msb : 0) + magnitude * baseRes;

  // Resolution step = weight of the lowest significant (non-excluded) bit
  let step = baseRes;
  if (!meta.extendSdi) {
    for (let b = 11; b <= 28; b++) {
      if (!excluded.has(b)) {
        step = Math.pow(2, b - 11) * baseRes;
        break;
      }
    }
  }

  return { value, step };
}

// Returns a formatted string, or null if no metadata / invalid data.
// For BNR labels with msb defined, returns { bnr:true, exact, banner } instead:
//   exact  = full-precision string for the DATA "Décodage" row
//   banner = value rounded to nearest resolution step, for the banner display
function decodeData(word, labelInfo, metaOverride) {
  if (!labelInfo) return null;
  const meta = metaOverride || DECODE_META[labelInfo.oct];
  if (!meta) return null;

  // data19: bits 29-11 of the word mapped to bit positions 18-0
  const data19 = (word >> 10) & 0x7FFFF;

  // ── Labels 010/011 : lat/lon BCD (bit29=100°, 5 groupes×4 bits, SDI inclus) ──
  // ── Label 031 : Transponder — squawk ABCD (3 bits/digit) + discrets ──
  const fmt = meta.fmt;
  if (fmt === 'squawk') {
    const dA = (word >> 26) & 0x7;  // bits 29-27
    const dB = (word >> 23) & 0x7;  // bits 26-24
    const dC = (word >> 20) & 0x7;  // bits 23-21
    const dD = (word >> 17) & 0x7;  // bits 20-18
    return `${dA}${dB}${dC}${dD}`;
  }

  // ── Formats de l'attachement 6 pour les étiquettes 065 à 377 ──
  const b = n => getBit(word, n), champ = (de, nb) => (word >>> (de - 1)) & ((1 << nb) - 1);   // champ de nb bits dont le bit de poids faible est « de »
  const deux = v => String(v).padStart(2, '0');
  if (fmt === 'utcbnr') {          // 150, tableau 6-12 : heures 28-24, minutes 23-18, secondes 17-12, bit 11 = horloge GNSS
    const h = champ(24, 5), mi = champ(18, 6), se = champ(12, 6);
    if (h > 24 || mi > 59 || se > 59) return null;
    return `${deux(h)}:${deux(mi)}:${deux(se)}${b(11) ? ' (GNSS)' : ''}`;
  }
  if (fmt === 'dateleg' || fmt === 'date') {   // 260, tableaux 6-8 et 6-18
    const j = champ(28, 2) * 10 + champ(24, 4), m = champ(23, 1) * 10 + champ(19, 4);
    if (champ(24, 4) > 9 || champ(19, 4) > 9 || j > 31 || m > 12) return null;
    if (fmt === 'date') { const a10 = champ(15, 4), a1 = champ(11, 4); if (a10 > 9 || a1 > 9) return null; return `${deux(j)}/${deux(m)}/${a10}${a1}`; }
    const vol = champ(15, 4); if (vol > 9) return null;
    return `${deux(j)}/${deux(m)} · vol (leg) ${vol}`;
  }
  if (fmt === 'vol') {             // 261, tableau 6-9 : 4 chiffres BCD, bits 29-14
    const d = [champ(26, 4), champ(22, 4), champ(18, 4), champ(14, 4)];
    if (d.some(x => x > 9)) return null;
    return d.join('');
  }
  if (fmt === 'eqid') {            // 377, tableau 6-17 : code d'équipement en 3 chiffres hexadécimaux, bits 22-11
    const code = [champ(19, 4), champ(15, 4), champ(11, 4)].map(x => x.toString(16).toUpperCase()).join('');
    const nom = (window.ARINC_EQPT || {})[code];
    return nom ? `${code} — ${nom}` : code;
  }
  if (fmt === 'tcasRange') {       // 130, tableau 6-21 : distance 29-19 (1/16 NM), niveau de sensibilité 18-16, n° d'intrus 15-11
    const sl = champ(16, 3);
    return `${(champ(19, 11) / 16).toFixed(2)} · ${sl ? 'SL ' + sl : 'SL non rapporté'} · intrus n° ${champ(11, 5)}`;
  }
  if (fmt === 'tcasAlt') {         // 131, tableau 6-22 : altitude relative 29-22 (complément à 2, 100 ft), sens vertical 21-20
    let v = champ(22, 8); if (v & 0x80) v -= 0x100;
    return `${v > 0 ? '+' : ''}${v * 100} · ${['en palier', 'monte', 'descend', 'pas de donnée'][champ(20, 2)]} · intrus n° ${champ(11, 5)}`;
  }
  if (fmt === 'tcasBrg') {         // 132, tableau 6-23 : relèvement 29-19 (complément à 2, ±180°), affichage 18-16
    let v = champ(19, 11); if (v & 0x400) v -= 0x800;
    const aff = ['pas de menace', 'TA', 'RA', 'trafic proche'][champ(16, 3)] || 'non utilisé';
    return `${(v * 180 / 1024).toFixed(1)} · ${aff} · intrus n° ${champ(11, 5)}`;
  }
  if (fmt === 'hfcom205') {        // 205, tableaux 6-43 et 6-43-1 : bit 11 = mot ; mot 1 comme 037, mot 2 = 0.1 kHz (bits 29-26)
    if (b(11)) { const d = champ(26, 4); return d > 9 ? null : `+ 0.${d} kHz (mot 2)`; }
    const d = [champ(28, 2), champ(24, 4), champ(20, 4), champ(16, 4), champ(12, 4)];
    if (d.slice(1).some(x => x > 9)) return null;
    return (d[0] * 10 + d[1] + d[2] * 0.1 + d[3] * 0.01 + d[4] * 0.001).toFixed(3);
  }
  if (fmt === 'tacan' || fmt === 'tacan147') {   // 145/146 (6-30, 6-47) : dizaines en hexa (bit 24 = poids faible) ; 147 (6-48) : bit 21 = poids faible
    const dizaines = fmt === 'tacan' ? b(24) + 2 * b(23) + 4 * b(22) + 8 * b(21) : champ(21, 4);
    const unites = champ(17, 4);
    if (unites > 9) return null;
    const mode = ['REC', 'A/A REC', 'T/R', 'A/A T/R'][b(27) * 2 + b(28)];
    return `canal ${dizaines * 10 + unites}${b(26) ? 'X' : 'Y'} · ${mode}`;
  }
  const iso = v => v >= 0x20 && v <= 0x7E ? String.fromCharCode(v) : `[${v.toString(16).toUpperCase().padStart(2, '0')}]`;
  if (fmt === 'iso5msg') {         // 356/357 (6-3), 360 (6-33) : SSM 01 = mot initial, 00 = intermédiaire, 10 = final
    const ssm = champ(30, 2);
    if (ssm === 1) {
      const stx = champ(23, 7), n = champ(9, 8);
      return `mot initial · ${stx === 2 ? 'STX' : 'STX attendu (02), lu ' + stx.toString(16).toUpperCase().padStart(2, '0')}`
        + (meta.adresse ? ` · adresse ${champ(17, 6)}` : '') + ` · ${n} mot${n > 1 ? 's' : ''} à suivre`;
    }
    if (ssm === 3) return null;
    let car = [champ(9, 7), champ(16, 7), champ(23, 7)];
    if (ssm === 2) while (car.length && car[car.length - 1] === 0) car.pop();   // mot final : les caractères inutilisés sont à zéro
    return `"${car.map(iso).join('')}" (mot ${ssm === 2 ? 'final' : 'intermédiaire'})`;
  }
  if (fmt === 'acmsVol') {         // 233-236 (6-31, 6-32) : n° de vol, car. impair bits 17-11, car. pair bits 26-20
    const n = meta.car;
    return `car. ${n}-${n + 1} : "${iso(champ(11, 7))}${iso(champ(20, 7))}"`;
  }
  if (fmt === 'altvar') {          // 206 018 (6-20) : altitude en complément à 2 depuis le bit 29 ; bits 13-11 = nombre de bits et résolution
    const F = [[15, 4], [14, 8], [13, 16], [12, 25], [14, 10], [10, 100]][champ(11, 3)];
    if (!F) return null;
    const [n, res] = F;
    let v = champ(30 - n, n); if (v >= 1 << (n - 1)) v -= 1 << n;
    return `${v < 0 ? '−' : ''}${Math.abs(v * res).toLocaleString('fr-CA')} ft (${n} bits, résolution ${res} ft)`;
  }
  if (fmt === 'avm') {             // 227 03D (6-28) : commande bits 31-25, code d'équipement AVM bits 24-13
    const cmd = champ(25, 7), id = champ(13, 12).toString(16).toUpperCase().padStart(3, '0');
    const C = { 0: 'non utilisé', 1: 'auto-test', 2: 'utiliser l’accéléromètre A (757)', 3: 'utiliser l’accéléromètre B (757)', 4: 'PAD',
      5: 'effacer l’historique des pannes', 6: 'effacer l’historique des vols (737)', 7: 'lire l’historique des pannes', 8: 'lire l’historique des vols (737)', 18: 'réservé (737)' };
    return `${C[cmd] || 'commande ' + cmd.toString(2).padStart(7, '0') + ' non définie'} · AVM ${id}${id === '03D' ? '' : ' (attendu 03D)'}`;
  }
  if (fmt === 'jambes') {          // 251 01A (6-19) : compteur principal bits 28-17 (0-4095), puis tranches de 4096 bits 16-13
    return String(champ(13, 4) * 4096 + champ(17, 12));
  }
  if (fmt === 'docu') {            // 262 (6-14) : six codes octaux de 3 bits, bits 29-12
    return [27, 24, 21, 18, 15, 12].map(d => champ(d, 3)).join(' ');
  }
  if (fmt === 'fqisDens') {        // 241 04D (6-35) : 12 bits 28-17, 4/4096 lb/gal par pas, + 4 lb/gal
    return (4 + champ(17, 12) * 4 / 4096).toFixed(3);
  }
  if (fmt === 'fqisCharge') {      // 241 04D (6-35) : un chiffre BCD ; caractère de tête (29-27) à zéro, chiffre en 26-23
    const d = champ(23, 4);
    return d > 9 ? null : `${d} — × 10 000, × 1 000 ou × 100 lb selon la place dans la séquence`;
  }

  // ── HF COM (tables 6-42 et 6-42-1) ──
  //   Mot 1 (bit 9 = 0) : 10 MHz (bits 29-28), 1 MHz (27-24), 0.1 MHz (23-20), 0.01 MHz (19-16), 0.001 MHz (15-12)
  //   Mot 2 (bit 9 = 1) : 0.1 kHz (bits 29-26), à ajouter à la fréquence du mot 1 qu'il suit immédiatement
  if (fmt === 'hfcom') {
    if (getBit(word, 9)) {
      const d = (word >> 25) & 0xF;   // bits 29-26
      if (d > 9) return null;
      return `+ 0.${d} kHz (mot 2)`;
    }
    const d10  = (word >> 27) & 0x3;   // bits 29-28
    const d1   = (word >> 23) & 0xF;   // bits 27-24
    const d01  = (word >> 19) & 0xF;   // bits 23-20
    const d001 = (word >> 15) & 0xF;   // bits 19-16
    const d0001= (word >> 11) & 0xF;   // bits 15-12
    if (d1 > 9 || d01 > 9 || d001 > 9 || d0001 > 9) return null;
    const value = d10 * 10 + d1 + d01 * 0.1 + d001 * 0.01 + d0001 * 0.001;
    return value.toFixed(3);
  }

  // ── Engine Serial No. (tables 6-15, 6-16) : 3 chiffres à afficher tels quels (zéros de tête compris) ──
  if (fmt === 'serieLSD' || fmt === 'serieMSD') {
    const d3 = (data19 >> 12) & 0xF, d2 = (data19 >> 8) & 0xF, d1 = (data19 >> 4) & 0xF;
    if (d3 > 9 || d2 > 9 || d1 > 9) return null;
    return `${d3}${d2}${d1}` + (fmt === 'serieLSD' ? ' (3 derniers chiffres)' : ' (3 premiers chiffres)');
  }

  // ── DME en mode MLS (bits 15-14 = 10) : coder 10/1/0.1 MHz, puis + 5031 MHz (table 6-41, note 5) ──
  if (fmt === 'dme' && ((word >> 13) & 0x3) === 0b10) {
    const d4 = (data19 >> 16) & 0x7, d3 = (data19 >> 12) & 0xF, d2 = (data19 >> 8) & 0xF;
    if (d3 > 9 || d2 > 9) return null;
    return (5031 + d4 * 10 + d3 + d2 * 0.1).toFixed(1);
  }

  // ── Label 056 : ETA — HH:MM.m (d4=10h, d3=1h, d2=10mn, d1=1mn, d0=0.1mn) ──
  if (fmt === 'eta') {
    const d4 = (data19 >> 16) & 0x7;
    const d3 = (data19 >> 12) & 0xF;
    const d2 = (data19 >> 8)  & 0xF;
    const d1 = (data19 >> 4)  & 0xF;
    const d0 =  data19        & 0xF;
    if (d4 > 2 || d3 > 9 || d2 > 5 || d1 > 9 || d0 > 9) return null;
    const hh = d4 * 10 + d3;
    const mm = d2 * 10 + d1;
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}.${d0}`;
  }

  // ── Labels 010/011/041/042 : lat/lon BCD (bit29=100°, 5 groupes×4 bits, SDI inclus) ──
  if (fmt === 'latlon') {
    const bit29  = (word >> 28) & 1;
    const data20 = (word >> 8)  & 0xFFFFF;   // bits 28-9 du mot (20 bits)
    const tDeg = (data20 >> 16) & 0xF;
    const uDeg = (data20 >> 12) & 0xF;
    const tMin = (data20 >> 8)  & 0xF;
    const uMin = (data20 >> 4)  & 0xF;
    const dMin =  data20        & 0xF;
    if (tDeg > 9 || uDeg > 9 || tMin > 5 || uMin > 9 || dMin > 9) return null;
    const deg = bit29 * 100 + tDeg * 10 + uDeg;
    const min = tMin * 10 + uMin + dMin * 0.1;
    return `${deg}°${min.toFixed(1)}'`;
  }

  // ── S/G Hardware Part Number (label 060) ─────────
  if (meta.partNum) {
    // BCD digits: bits 29-26=d4, 25-22=d3, 21-18=d2, 17-14=d1
    const d4 = (word >> 25) & 0xF;
    const d3 = (word >> 21) & 0xF;
    const d2 = (word >> 17) & 0xF;
    const d1 = (word >> 13) & 0xF;
    const sdi = (word >> 8) & 0x3;  // bits 10-9
    const seqLabel = ['—', 'Digits 1-3', 'Digits 4-7', 'Digits 8-10'][sdi];
    const posId  = ((word >> 12) & 1) << 1 | ((word >> 11) & 1);
    const posLabel = ['Left', 'Right', 'Center As Left', 'Center As Right'][posId];
    return `${d4}${d3}${d2}${d1}  [${seqLabel} / ${posLabel}]`;
  }

  // ── ACMS — ISO #5 characters (labels 061-063) ────
  if (meta.iso5) {
    const c1 = (word >> 8)  & 0x7F;  // bits 9-15
    const c2 = (word >> 15) & 0x7F;  // bits 16-22
    const c3 = (word >> 22) & 0x7F;  // bits 23-29
    const toChar = v => (v >= 0x20 && v <= 0x7E)
      ? String.fromCharCode(v)
      : `[${v.toString(16).toUpperCase().padStart(2, '0')}]`;
    return `"${toChar(c1)}${toChar(c2)}${toChar(c3)}"`;
  }

  // ── BNR ──────────────────────────────────────────
  if (labelInfo.enc === 'BNR' && meta.msb !== undefined) {
    const { value, step } = computeBNR(word, meta, data19);

    // dpBanner / nominalStep:
    //   If meta.bnrDecimals is set, use it directly as dpBanner and compute
    //   nominalStep with ceil — rounds the true step UP to the nearest clean
    //   value at that precision (e.g. step=0.04395 + bnrDecimals=2 → 0.05).
    //   Otherwise auto-compute via step*1.5 heuristic + refinement loop.
    let dpBanner, nominalStep;
    if (meta.bnrDecimals !== undefined) {
      dpBanner    = meta.bnrDecimals;
      const f     = Math.pow(10, dpBanner);
      nominalStep = Math.max(Math.ceil(step * f) / f, 1 / f);
    } else {
      dpBanner = Math.max(0, Math.ceil(-Math.log10(step * 1.5)));
      for (let i = 0; i < 6; i++) {
        const f  = Math.pow(10, dpBanner);
        const ns = Math.max(Math.round(step * f) / f, 1 / f);
        if (Math.abs(ns - step) / step <= 0.1) break;
        dpBanner++;
      }
      const factor = Math.pow(10, dpBanner);
      nominalStep  = Math.max(Math.round(step * factor) / factor, 1 / factor);
    }
    const dpExact = dpBanner === 0 ? 0 : dpBanner + 6;
    const rounded     = Math.round(value / nominalStep) * nominalStep;
    const bannerStr   = (rounded < 0 ? '−' : '') + Math.abs(rounded).toFixed(dpBanner);

    // Exact: full-precision value for DATA panel
    const exactStr  = (value  < 0 ? '−' : '') + Math.abs(value).toFixed(dpExact);

    return { bnr: true, exact: exactStr, banner: bannerStr };
  }

  // ── BCD ──────────────────────────────────────────
  if (labelInfo.enc === 'BCD' && meta.decimals !== undefined) {
    // 5-digit BCD, MSB-first in bits 29-11:
    //   d4 (3 bits) = bits 29-27 → data19 bits 18-16
    //   d3 (4 bits) = bits 26-23 → data19 bits 15-12
    //   d2 (4 bits) = bits 22-19 → data19 bits 11-8
    //   d1 (4 bits) = bits 18-15 → data19 bits 7-4
    //   d0 (4 bits) = bits 14-11 → data19 bits 3-0
    const d4 = (meta.padHigh >= 1) ? 0 : ((data19 >> 16) & 0x7);
    const d3 = (data19 >> 12) & 0xF;
    const d2 = (data19 >> 8)  & 0xF;
    // bcdDigits:3 → only d4/d3/d2 are BCD; maskD0/bcdDigits → force lower digits to 0
    const padLow = meta.padLow || 0;
    const d1 = (meta.bcdDigits === 3 || padLow >= 2) ? 0 : ((data19 >> 4) & 0xF);
    const d0 = (meta.bcdDigits === 3 || meta.maskD0  || padLow >= 1) ? 0 : (data19 & 0xF);

    // Reject invalid BCD digits (>9 means binary garbage)
    if (d3 > 9 || d2 > 9 || d1 > 9 || d0 > 9) return null;

    // UTC HH:MM.m format (label 125)
    if (meta.utcFmt) {
      const hh = d4 * 10 + d3;
      const mm = d2 * 10 + d1;
      if (hh > 23 || mm > 59 || d0 > 9) return null;
      return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}.${d0}`;
    }

    const raw = d4 * 10000 + d3 * 1000 + d2 * 100 + d1 * 10 + d0;
    const base = meta.implicit || 0;
    let value = base + raw / Math.pow(10, meta.decimals);

    // bcdScale: multiply result by a constant (e.g. ×100 when unit is "100 lb")
    if (meta.bcdScale) value = value * meta.bcdScale;

    // halfBit: one discrete bit that adds halfStep to the frequency
    if (meta.halfBit !== undefined) {
      value += getBit(word, meta.halfBit) * meta.halfStep;
    }

    // Auto-choose display decimals: enough for halfStep precision
    const padLowDp = (meta.padLow || 0) + (meta.maskD0 ? 1 : 0);
    let dp = Math.max(0, meta.decimals - padLowDp);
    if (meta.halfStep !== undefined) {
      const halfDp = Math.max(0, -Math.floor(Math.log10(meta.halfStep)));
      dp = Math.max(dp, halfDp);
    }
    return value.toFixed(dp);
  }

  return null;
}

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

// ── Field map ────────────────────────────────────────

function getDataFieldSegments(oct, enc, meta, unit, word) {
  // Formats particuliers : ils suivent le choix actif (meta.fmt), pas le numéro d'étiquette
  const f = meta && meta.fmt;
  if (meta === undefined && enc) return [{ span:19, label:'format hors de ce manuel', cls:'fmap-pad' }];
  if (f === 'vhf') return [
    { span:3, label:'10MHz',    cls:'fmap-freq' },
    { span:4, label:'1MHz',     cls:'fmap-freq' },
    { span:4, label:'0.1MHz',  cls:'fmap-freq' },
    { span:4, label:'0.01MHz', cls:'fmap-freq' },
    { span:4, label:'0.001MHz',cls:'fmap-freq' },
  ];
  if (f === 'squawk') return [
    { span:3, label:'A',   cls:'fmap-bcd' },  // bits 29-27 squawk digit A
    { span:3, label:'B',   cls:'fmap-bcd' },  // bits 26-24 squawk digit B
    { span:3, label:'C',   cls:'fmap-bcd' },  // bits 23-21 squawk digit C
    { span:3, label:'D',   cls:'fmap-bcd' },  // bits 20-18 squawk digit D
    { span:1, label:'HJK', cls:'fmap-cat' },  // bit 17 hijack
    { span:1, label:'CP',  cls:'fmap-cat' },  // bit 16 control panel
    { span:1, label:'CP',  cls:'fmap-cat' },  // bit 15 control panel
    { span:1, label:'SRC', cls:'fmap-cat' },  // bit 14 alt data source
    { span:1, label:'IDT', cls:'fmap-cat' },  // bit 13 ident
    { span:1, label:'CP',  cls:'fmap-cat' },  // bit 12 control panel
    { span:1, label:'ALT', cls:'fmap-cat' },  // bit 11 altitude report
  ];
  if (f === 'adf') {
    const antMode = word ? getBit(word, 12) : 0;  // bit 12: 0=ADF, 1=ANT
    return [
      { span:3, label:'1000kHz', cls:'fmap-freq' },
      { span:4, label:'100kHz',  cls:'fmap-freq' },
      { span:4, label:'10kHz',   cls:'fmap-freq' },
      { span:4, label:'1kHz',    cls:'fmap-freq' },
      { span:1, label:'0.5',     cls:'fmap-freq' },
      { span:1, label:'SP',      cls:'fmap-pad'  },
      { span:1, label: antMode ? 'ANT' : 'ADF', cls:'fmap-cat' },
      { span:1, label:'BFO',     cls:'fmap-cat'  },
    ];
  }
  if (f === 'ils') {
    const cat = word ? ((word >> 10) & 0x3) : 0;  // bits 12-11
    const catStr = ['Non', 'CAT I', 'CAT II', 'CAT III'][cat];
    return [
      { span:3, label:'10MHz',   cls:'fmap-freq' },
      { span:4, label:'1MHz',    cls:'fmap-freq' },
      { span:4, label:'0.1MHz',  cls:'fmap-freq' },
      { span:4, label:'0.01MHz', cls:'fmap-freq' },
      { span:2, label:'SP',      cls:'fmap-pad'  },
      { span:2, label: catStr,   cls:'fmap-cat'  },
    ];
  }
  if (f === 'vorils') {
    const ilsMode = word ? getBit(word, 14) : 0;  // bit 14: 0=VOR, 1=ILS
    return [
      { span:3, label:'10MHz',                   cls:'fmap-freq' },
      { span:4, label:'1MHz',                    cls:'fmap-freq' },
      { span:4, label:'0.1MHz',                  cls:'fmap-freq' },
      { span:4, label:'0.01MHz',                 cls:'fmap-freq' },
      { span:1, label: ilsMode ? 'ILS' : 'VOR',  cls:'fmap-cat'  },
      { span:3, label:'SP',                      cls:'fmap-pad'  },
    ];
  }
  if (f === 'dme') {
    const freqMode = word ? ((word >> 13) & 0x3) : 0;  // bits 15-14
    const dmeMode  = word ? ((word >> 10) & 0x7) : 0;  // bits 13-11
    const freqStr  = ['VOR', 'ILS', 'MLS', 'SP'][freqMode];
    const dmeStr   = ['STBY', 'NORM', 'TEST', 'SCAN', 'HELD', 'N/A', 'N/A', 'N/A'][dmeMode];
    return [
      { span:3, label:'10MHz',   cls:'fmap-freq' },
      { span:4, label:'1MHz',    cls:'fmap-freq' },
      { span:4, label:'0.1MHz',  cls:'fmap-freq' },
      { span:1, label:'0.05',    cls:'fmap-freq' },
      { span:1, label:'IDO',     cls:'fmap-cat'  },
      { span:1, label:'IDD',     cls:'fmap-cat'  },
      { span:2, label: freqStr,  cls:'fmap-cat'  },
      { span:3, label: dmeStr,   cls:'fmap-cat'  },
    ];
  }
  const seg = (span, label, cls = 'fmap-bcd') => ({ span, label, cls });
  if (f === 'utcbnr') return [seg(1, '—', 'fmap-pad'), seg(5, 'heures'), seg(6, 'minutes'), seg(6, 'secondes'), seg(1, 'GNSS', 'fmap-cat')];
  if (f === 'dateleg') return [seg(2, 'j×10'), seg(4, 'jour'), seg(1, 'm×10'), seg(4, 'mois'), seg(4, 'vol'), seg(4, 'PAD', 'fmap-pad')];
  if (f === 'date') return [seg(2, 'j×10'), seg(4, 'jour'), seg(1, 'm×10'), seg(4, 'mois'), seg(4, 'an×10'), seg(4, 'an')];
  if (f === 'vol') return [seg(4, '×1000'), seg(4, '×100'), seg(4, '×10'), seg(4, '×1'), seg(3, 'PAD', 'fmap-pad')];
  if (f === 'eqid') return [seg(7, 'spare', 'fmap-pad'), seg(4, 'MSD'), seg(4, 'hexa'), seg(4, 'LSD')];
  if (f === 'tcasRange') return [seg(11, 'distance (1/16 NM)', 'fmap-bnr'), seg(3, 'SL', 'fmap-cat'), seg(5, 'n° intrus', 'fmap-cat')];
  if (f === 'tcasAlt') return [seg(8, 'altitude relative', 'fmap-bnr'), seg(2, 'V/S', 'fmap-cat'), seg(4, 'futur', 'fmap-pad'), seg(5, 'n° intrus', 'fmap-cat')];
  if (f === 'tcasBrg') return [seg(11, 'relèvement', 'fmap-bnr'), seg(3, 'affichage', 'fmap-cat'), seg(5, 'n° intrus', 'fmap-cat')];
  if (f === 'hfcom205') return word && getBit(word, 11)
    ? [seg(4, '0.1kHz', 'fmap-freq'), seg(14, 'non utilisés', 'fmap-pad'), seg(1, 'mot 2', 'fmap-cat')]
    : [seg(2, '10MHz', 'fmap-freq'), seg(4, '1MHz', 'fmap-freq'), seg(4, '0.1MHz', 'fmap-freq'), seg(4, '0.01MHz', 'fmap-freq'), seg(4, '0.001MHz', 'fmap-freq'), seg(1, 'mot 1', 'fmap-cat')];
  if (f === 'tacan') return [seg(1, 'PAD', 'fmap-pad'), seg(2, 'mode', 'fmap-cat'), seg(1, 'X/Y', 'fmap-cat'), seg(1, 'PAD', 'fmap-pad'), seg(4, 'dizaines'), seg(4, 'unités'),
    seg(1, 'PAD', 'fmap-pad'), seg(1, 'TAC', 'fmap-cat'), seg(1, 'V/T', 'fmap-cat'), seg(3, oct === '146' ? 'mém./PAD' : 'PAD', 'fmap-pad')];
  if (f === 'tacan147') return [seg(1, 'INT', 'fmap-cat'), seg(2, 'mode', 'fmap-cat'), seg(1, 'X/Y', 'fmap-cat'), seg(1, 'TST', 'fmap-cat'), seg(4, 'dizaines'), seg(4, 'unités'),
    seg(2, 'TAC/MLS', 'fmap-cat'), seg(1, 'PAD', 'fmap-pad'), seg(3, 'options', 'fmap-cat')];
  if (f === 'iso5msg') {
    const ssm = word ? (word >>> 29) & 3 : 0;
    if (ssm === 1) return [seg(7, 'STX (02)', 'fmap-cat'), seg(6, meta.adresse ? 'adresse' : 'zéros', meta.adresse ? 'fmap-cat' : 'fmap-pad'), seg(8, 'nombre de mots', 'fmap-bnr')];
    return [seg(7, 'car. 3', 'fmap-bnr'), seg(7, 'car. 2', 'fmap-bnr'), seg(7, 'car. 1', 'fmap-bnr')];
  }
  if (f === 'acmsVol') return [seg(3, 'PAD', 'fmap-pad'), seg(7, `car. ${meta.car + 1}`, 'fmap-bnr'), seg(2, 'PAD', 'fmap-pad'), seg(7, `car. ${meta.car}`, 'fmap-bnr')];
  if (f === 'altvar') {
    const F = word ? [[15, 4], [14, 8], [13, 16], [12, 25], [14, 10], [10, 100]][(word >>> 10) & 7] : null;
    const n = F ? F[0] : 15;
    return [seg(1, 'sgn', 'fmap-sign'), seg(n - 1, F ? `altitude (${F[1]} ft)` : 'altitude', 'fmap-bnr'), ...(n < 16 ? [seg(16 - n, 'PAD', 'fmap-pad')] : []), seg(3, 'format', 'fmap-cat')];
  }
  if (f === 'avm') return [seg(5, 'commande', 'fmap-cat'), seg(12, 'ID AVM (hexa)'), seg(2, 'PAD', 'fmap-pad')];
  if (f === 'jambes') return [seg(1, 'D', 'fmap-cat'), seg(12, 'compteur 0-4095', 'fmap-bnr'), seg(4, '× 4096', 'fmap-bnr'), seg(2, 'PAD', 'fmap-pad')];
  if (f === 'docu') return [1, 2, 3, 4, 5, 6].map(n => seg(3, `code ${n}`)).concat(seg(1, 'PAD', 'fmap-pad'));
  if (f === 'fqisDens') return [seg(1, 'sgn', 'fmap-sign'), seg(12, 'densité − 4 (28→17)', 'fmap-bnr'), seg(6, 'PAD', 'fmap-pad')];
  if (f === 'fqisCharge') return [seg(3, '0 (artificiel)', 'fmap-pad'), seg(4, 'chiffre'), seg(12, 'PAD', 'fmap-pad')];
  if (f === 'hfcom') {
    if (word && getBit(word, 9)) return [                 // mot 2 : 0.1 kHz, bit 10 = CW, bit 9 = 1
      { span:4,  label:'0.1kHz',      cls:'fmap-freq' },
      { span:15, label:'non utilisés', cls:'fmap-pad'  },
      { span:1,  label: getBit(word, 10) ? 'CW' : '—', cls:'fmap-cat' },
      { span:1,  label:'mot 2',        cls:'fmap-cat'  },
    ];
    const usb = word ? getBit(word, 11) : 0, ssb = word ? getBit(word, 10) : 0;
    return [
      { span:2, label:'10MHz',    cls:'fmap-freq' },
      { span:4, label:'1MHz',     cls:'fmap-freq' },
      { span:4, label:'0.1MHz',   cls:'fmap-freq' },
      { span:4, label:'0.01MHz',  cls:'fmap-freq' },
      { span:4, label:'0.001MHz', cls:'fmap-freq' },
      { span:1, label: usb ? 'USB' : 'LSB', cls:'fmap-cat' },
      { span:1, label: ssb ? 'SSB' : 'AM',  cls:'fmap-cat' },
      { span:1, label:'mot 1',    cls:'fmap-cat' },
    ];
  }
  if (f === 'eta' || f === 'utc') return [
    { span:3, label:"10h",    cls:'fmap-bcd' },
    { span:4, label:"1h",     cls:'fmap-bcd' },
    { span:4, label:"10mn",   cls:'fmap-bcd' },
    { span:4, label:"1mn",    cls:'fmap-bcd' },
    { span:4, label:"0.1mn",  cls:'fmap-bcd' },
  ];
  if (f === 'serieLSD') return [
    { span:3, label:'padding',   cls:'fmap-pad' },  // bits 29-27
    { span:4, label:'3rd digit', cls:'fmap-bcd' },  // bits 26-23
    { span:4, label:'2nd digit', cls:'fmap-bcd' },  // bits 22-19
    { span:4, label:'LSD',       cls:'fmap-bcd' },  // bits 18-15
    { span:4, label:'padding',   cls:'fmap-pad' },  // bits 14-11
  ];
  if (f === 'serieMSD') return [
    { span:3, label:'padding',   cls:'fmap-pad' },  // bits 29-27
    { span:4, label:'MSD',       cls:'fmap-bcd' },  // bits 26-23
    { span:4, label:'5th digit', cls:'fmap-bcd' },  // bits 22-19
    { span:4, label:'4th digit', cls:'fmap-bcd' },  // bits 18-15
    { span:4, label:'padding',   cls:'fmap-pad' },  // bits 14-11
  ];
  if (f === 'latlon') return [
    { span:1, label:'100°', cls:'fmap-bcd' },
    { span:4, label:"10°",  cls:'fmap-bcd'  },
    { span:4, label:"1°",   cls:'fmap-bcd'  },
    { span:4, label:"10'",  cls:'fmap-bcd'  },
    { span:4, label:"1'",   cls:'fmap-bcd'  },
    { span:4, label:"0.1'", cls:'fmap-bcd'  },
  ];
  // S/G Hardware Part Number: 4 BCD digits (bits 29-14) + RESERVED (13-11)
  if (meta && meta.partNum) return [
    { span:4, label:'d4',    cls:'fmap-bcd' },  // bits 29-26
    { span:4, label:'d3',    cls:'fmap-bcd' },  // bits 25-22
    { span:4, label:'d2',    cls:'fmap-bcd' },  // bits 21-18
    { span:4, label:'d1',    cls:'fmap-bcd' },  // bits 17-14
    { span:2, label:'PosID', cls:'fmap-dis' },  // bits 13-12
    { span:1, label:'Own',   cls:'fmap-dis' },  // bit 11
  ];

  // Generic by encoding
  if (enc === 'BCD' && meta && meta.decimals !== undefined) {
    const dec = meta.decimals;
    const spans = [3, 4, 4, 4, 4];   // d4..d0
    const padLowSeg  = meta ? (meta.padLow  || 0) : 0;
    const padHighSeg = meta ? (meta.padHigh || 0) : 0;
    return [4, 3, 2, 1, 0].map((d, i) => {
      const exp    = d - dec;
      const isDis  = meta && meta.maskD0 && d === 0;
      const isPadL = d < padLowSeg;            // padLow:1 → d0; padLow:2 → d0+d1
      const isPadH = d === 4 && padHighSeg >= 1;  // padHigh:1 → d4
      const isPad  = (meta && meta.bcdDigits === 3 && d <= 1) || isDis || isPadL || isPadH;
      let label;
      if (unit && !isPad) {
        const n = exp >= 0 ? Math.pow(10, exp) : (1 / Math.pow(10, -exp)).toFixed(-exp);
        label = `${n}${unit}`;
      } else {
        label = (isPadL || isPadH) ? 'padding' : isPad ? (isDis ? 'DIS' : 'PAD') : `d${d}`;
      }
      return { span: spans[i], label, cls: isDis ? 'fmap-dis' : isPad ? 'fmap-pad' : 'fmap-bcd' };
    });
  }
  if (enc === 'BCD') {
    const isPad1 = meta && (meta.bcdDigits === 3 || meta.maskD0);
    const isPad2 = meta && meta.bcdDigits === 3;
    return [
      { span:3, label:'d4', cls:'fmap-bcd' },
      { span:4, label:'d3', cls:'fmap-bcd' },
      { span:4, label:'d2', cls:'fmap-bcd' },
      { span:4, label: isPad2 ? 'PAD' : 'd1', cls: isPad2 ? 'fmap-pad' : 'fmap-bcd' },
      { span:4, label: isPad1 ? 'DIS' : 'd0', cls: isPad1 ? 'fmap-dis' : 'fmap-bcd' },
    ];
  }

  // Longitudinal/Lateral CG (066, 067) — BCD ÷ 100, res 0.01% MAC
  if (oct === '066' || oct === '067') return [
    { span:3, label:'100%',   cls:'fmap-bcd' },
    { span:4, label:'10%',    cls:'fmap-bcd' },
    { span:4, label:'1%',     cls:'fmap-bcd' },
    { span:4, label:'0.1%',   cls:'fmap-bcd' },
    { span:4, label:'0.01%',  cls:'fmap-bcd' },
  ];

  // Gross Weight (065) — BCD × 100 lb, étiquettes en valeur réelle
  if (oct === '065') return [
    { span:3, label:'1 000 000 lb', cls:'fmap-bcd' },
    { span:4, label:'100 000 lb',   cls:'fmap-bcd' },
    { span:4, label:'10 000 lb',    cls:'fmap-bcd' },
    { span:4, label:'1 000 lb',     cls:'fmap-bcd' },
    { span:4, label:'100 lb',       cls:'fmap-bcd' },
  ];


  // ILS Localizer/Glideslope Deviation : bit 11 discret (Tune Inhibit)
  if (['173','174'].includes(oct) && !f) return [
    { span:1,  label:'sgn',          cls:'fmap-sign' },
    { span:12, label:'data (28→17)', cls:'fmap-bnr'  },
    { span:5,  label:'PAD',          cls:'fmap-pad'  },
    { span:1,  label:'T.in',         cls:'fmap-cat'  },
  ];
  // BNR : signe, bits significatifs, puis PAD (spareBits contigus depuis le bit 11) ; extendSdi = 20 bits (28→9)
  if (enc === 'BNR' && meta && meta.msb !== undefined && !meta.iso5) {
    if (meta.extendSdi) return [
      { span:1,  label:'sgn',         cls:'fmap-sign' },
      { span:20, label:'data (28→9)', cls:'fmap-bnr'  },
    ];
    const pad = (meta.spareBits || []).filter(b => b >= 11 && b <= 28).length;
    const sig = 18 - pad;
    return [
      { span:1,   label:'sgn', cls:'fmap-sign' },
      { span:sig, label:`data (28→${29 - sig})`, cls:'fmap-bnr' },
      ...(pad ? [{ span:pad, label:'PAD', cls:'fmap-pad' }] : []),
    ];
  }

  // ACMS: 3 × 7-bit ISO #5 chars, no SDI (bits 9-10 are part of char 1)
  // dataSpan = 21 → SDI segment suppressed automatically
  if (oct === '061' && meta && meta.iso5) return [
    { span:7, label:'Char 3 (src)', cls:'fmap-bnr' },
    { span:7, label:'Char 2 (src)', cls:'fmap-bnr' },
    { span:7, label:'Char 1 (src)', cls:'fmap-bnr' },
  ];
  if (oct === '062' && meta && meta.iso5) return [
    { span:7, label:'Dest 1',       cls:'fmap-bnr' },
    { span:7, label:'(space)',       cls:'fmap-pad' },
    { span:7, label:'Char 4 (src)', cls:'fmap-bnr' },
  ];
  if (oct === '063' && meta && meta.iso5) return [
    { span:7, label:'Dest 4', cls:'fmap-bnr' },
    { span:7, label:'Dest 3', cls:'fmap-bnr' },
    { span:7, label:'Dest 2', cls:'fmap-bnr' },
  ];

  if (enc === 'BNR') return [
    { span:1,  label:'sgn',  cls:'fmap-sign' },
    { span:18, label:'data', cls:'fmap-bnr'  },
  ];
  if (enc === 'DIS') return [
    { span:19, label:'discrets 11-29', cls:'fmap-dis' },
  ];
  return [{ span:19, label:'DATA', cls:'fmap-bnr' }];
}

function renderFieldMap(labelInfo, meta, word) {
  const container = document.getElementById('field-map');
  container.innerHTML = '';
  const oct  = labelInfo ? labelInfo.oct  : null;
  const enc  = labelInfo ? labelInfo.enc  : null;
  const unit = labelInfo ? labelInfo.unit : null;

  const datasegs = getDataFieldSegments(oct, enc, meta, unit, word);
  const dataSpan = datasegs.reduce((s, x) => s + x.span, 0);
  const segs = [
    { span:1, label:'P',     cls:'fmap-parity' },
    { span:2, label: (meta && meta.ssmSeg) || 'SSM', cls:'fmap-ssm' },
    ...datasegs,
    ...(dataSpan <= 19 ? [{ span:2, label:'SDI', cls:'fmap-sdi' }] : []),
    { span:8, label:'LABEL', cls:'fmap-label'  },
  ];

  for (const s of segs) {
    const el = document.createElement('div');
    el.className = `fmap-seg ${s.cls}`;
    el.style.gridColumn = `span ${s.span}`;
    el.textContent = s.label;
    container.appendChild(el);
  }
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

  // Determine padding bits and data-override bits from the decoded label
  const labelOct = reverseBits8(word & 0xFF).toString(8).padStart(3, '0');
  const { meta: metaBits } = getActiveLabelConfig(labelOct);
  const padBits  = new Set();
  const padLowBits  = metaBits ? (metaBits.padLow  || 0) : 0;
  const padHighBits = metaBits ? (metaBits.padHigh || 0) : 0;
  if (padLowBits  >= 1) { [11, 12, 13, 14].forEach(b => padBits.add(b)); }
  if (padLowBits  >= 2) { [15, 16, 17, 18].forEach(b => padBits.add(b)); }
  if (padHighBits >= 1) { [27, 28, 29].forEach(b => padBits.add(b)); }

  // Bits 9-10 (et 11) qui portent des données plutôt que le SDI, et bits discrets en orange : selon le choix actif
  const dataBits = new Set();
  const fb = metaBits && metaBits.fmt;
  if (fb === 'latlon') { dataBits.add(9); dataBits.add(10); }            // 0.1' de minute dans les bits 9-10
  if (fb === 'dme') dataBits.add(18);                                    // 0.05 MHz (halfBit), donnée
  if (metaBits && metaBits.partNum) [11, 12, 13].forEach(b => dataBits.add(b));
  if (metaBits && (metaBits.iso5 || metaBits.extendSdi || fb === 'iso5msg')) { dataBits.add(9); dataBits.add(10); }

  // Discrete bits (teal) and bit descriptions from DECODE_META
  const disBits  = new Set(metaBits && metaBits.discBits  ? metaBits.discBits  : []);
  const bitDescs = (metaBits && metaBits.bitDescs) || {};
  const catBits = new Set(metaBits && metaBits.catBits ? metaBits.catBits : []);
  if (metaBits && metaBits.spareBits) metaBits.spareBits.forEach(b => padBits.add(b));

  // Bit 29 = sign bit for standard BNR labels (not ssmSign, not iso5)
  const { labelInfo: labelInfoBits } = getActiveLabelConfig(labelOct);
  const isSignBit29 = labelInfoBits && labelInfoBits.enc === 'BNR'
                   && metaBits && metaBits.msb !== undefined
                   && !metaBits.ssmSign && !metaBits.iso5;

  // Display bit 32 (left) → bit 1 (right)
  for (let bitNum = 32; bitNum >= 1; bitNum--) {
    const isPad  = padBits.has(bitNum);
    const isDis  = disBits.has(bitNum);
    const isSign = isSignBit29 && bitNum === 29;
    const val    = getBit(word, bitNum);
    const cls    = isPad  ? 'bit-pad'
                 : isSign ? 'bit-sign'
                 : catBits.has(bitNum) ? 'bit-sign'
                 : dataBits.has(bitNum) ? 'bit-data'
                 : isDis  ? 'bit-sdi'
                 : getBitClass(bitNum);

    const wrapper = document.createElement('div');
    wrapper.className = 'bit-wrapper';

    const numEl = document.createElement('div');
    numEl.className = 'bit-num';
    numEl.textContent = bitNum;

    const cell = document.createElement('div');
    cell.className = `bit-cell ${cls}`;
    cell.textContent = isPad ? 'P' : val;
    cell.dataset.bit = bitNum;
    cell.title = isPad  ? `Bit ${bitNum} — ${bitDescs[bitNum] || 'padding (non utilisé)'}`
               : isSign ? `Bit 29 — Bit de signe (0 = +, 1 = −)`
               : bitDescs[bitNum] ? `Bit ${bitNum} — ${bitDescs[bitNum]}`
               : `Bit ${bitNum} — clic pour basculer`;
    if (!isPad) cell.addEventListener('click', () => toggleBit(bitNum));

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
  const labelHex = '0x' + labelVal.toString(16).toUpperCase().padStart(2, '0');
  const labelDec = labelVal;
  const labelBin = labelVal.toString(2).padStart(8, '0');
  const { labelInfo, meta } = getActiveLabelConfig(labelOct);
  renderFieldMap(labelInfo, meta, word);

  document.getElementById('d-label-oct').textContent = labelOct;
  document.getElementById('d-label-dec').textContent = labelDec;
  document.getElementById('d-label-hex').textContent = labelHex;
  document.getElementById('d-label-bin').textContent = labelBin;
  document.getElementById('d-label-name').textContent = labelInfo ? labelInfo.param : '—';
  document.getElementById('d-label-msb').textContent = labelOct[0];
  document.getElementById('d-label-med').textContent = labelOct[1];
  document.getElementById('d-label-lsb').textContent = labelOct[2];

  // ── SDI (bits 9-10) ──
  const sdi = (word >> 8) & 0x3;
  const ssmType = getLabelSsmType(labelInfo);
  const sdiTable = (meta && meta.sdiDesc) || (['radio', 'dis', 'bnr'].includes(ssmType) ? SDI_TABLES.tous : SDI_TABLES.other);
  document.getElementById('d-sdi').textContent = sdi.toString(2).padStart(2, '0');
  document.getElementById('d-sdi-desc').textContent = sdiTable[sdi];

  // ── Data (bits 11-29, 19 bits) ──
  const data19 = (word >> 10) & 0x7FFFF;
  const dataBin = data19.toString(2).padStart(19, '0');
  // Groupes ARINC : d4 (3 bits) + d3/d2/d1/d0 (4 bits) → 000 0000 0000 0000 0000
  const dataBinGrouped = dataBin.replace(/^(.{3})(.{4})(.{4})(.{4})(.{4})$/, '$1 $2 $3 $4 $5');
  document.getElementById('d-data-bin').textContent = dataBinGrouped;
  document.getElementById('d-data-dec').textContent = data19;
  document.getElementById('d-data-hex').textContent = '0x' + data19.toString(16).toUpperCase().padStart(5, '0');
  const decoded = decodeData(word, labelInfo, meta);
  // BNR labels return {bnr:true, exact, banner}; all other labels return a string (or null)
  const isBnrObj  = decoded !== null && typeof decoded === 'object' && decoded.bnr;
  const decodedExact  = isBnrObj ? decoded.exact  : decoded;
  const decodedBanner = isBnrObj ? decoded.banner : decoded;
  let decodedExtra = '';
  if (decoded !== null && labelInfo) {
    const fx = meta && meta.fmt;
    if (fx === 'ils') {
      const cat = (word >> 10) & 0x3;
      decodedExtra = ' — <span style="color:#fb923c;font-weight:bold;">' + ['Non', 'CAT I', 'CAT II', 'CAT III'][cat] + '</span>';
    } else if (fx === 'vorils') {
      decodedExtra = ' (' + (getBit(word, 14) ? 'ILS' : 'VOR') + ')';
    } else if (fx === 'dme') {
      const dme  = (word >> 10) & 0x7;
      const freq = (word >> 13) & 0x3;
      decodedExtra = ' — ' + ['STBY','NORM','TEST','SCAN','HELD','N/A','N/A','N/A'][dme]
                   + ' / ' + ['VOR','ILS','MLS','spare'][freq];
    }
  }
  document.getElementById('d-data-decoded').innerHTML = labelInfo && labelInfo.hors
    ? `<span style="color:#fbbf24">${texteHors(labelInfo.hors)}</span>`
    : decodedExact !== null
      ? decodedExact + (labelInfo && labelInfo.unit ? ' ' + labelInfo.unit : '') + decodedExtra
      : '—';
  document.getElementById('d-data-format').textContent = labelInfo ? labelInfo.enc : '—';

  // ── SSM (bits 30-31) ──
  const ssm = (word >> 29) & 0x3;
  const ssmBin = ssm.toString(2).padStart(2, '0');
  const ssmTable = SSM_TABLES[ssmType] || SSM_TABLES.bcd;
  const ssmDesc = ssmTable[ssm];

  function ssmCatClass(desc) {
    if (!desc || desc === '—') return 'ssm-undef';
    if (desc.includes('FW') || desc.includes('Failure Warning')) return 'ssm-fw';
    if (desc.includes('NCD') || desc.includes('No Computed'))    return 'ssm-ncd';
    if (desc.includes('FT') || desc.includes('Functional Test')) return 'ssm-ft';
    if (desc.includes('Undefined'))                               return 'ssm-undef';
    return 'ssm-normal'; // Normal NML, Normal+, Normal−
  }

  if (word === 0 || (labelInfo && labelInfo.param === 'Spare')) {
    document.getElementById('d-ssm').textContent = '—';
    document.getElementById('d-ssm-type').textContent = '—';
    document.getElementById('ssm-ref-title').textContent = '— saisir un mot hex —';
    for (let i = 0; i < 4; i++) {
      document.getElementById(`ssm-ref-desc-${i}`).textContent = '';
      document.getElementById(`ssm-ref-${i}`).className = 'ssm-ref-row ssm-undef';
    }
  } else {
    document.getElementById('d-ssm').textContent = ssmBin;
    document.getElementById('d-ssm-type').textContent = ssmType.toUpperCase();
    document.getElementById('ssm-ref-title').textContent = `Référentiel SSM (${ssmType.toUpperCase()}) :`;
    for (let i = 0; i < 4; i++) {
      const desc = ssmTable[i];
      document.getElementById(`ssm-ref-desc-${i}`).textContent = desc;
      const row = document.getElementById(`ssm-ref-${i}`);
      const cat = ssmCatClass(desc);
      row.className = `ssm-ref-row ${cat}${i === ssm ? ' ssm-active' : ''}`;
    }
  }

  // ── Parity (bit 32) — odd parity ──
  const ones = popCount(word);
  const parityOk = (ones % 2 === 1);
  const parityEl = document.getElementById('d-parity');
  parityEl.textContent = parityOk ? 'Odd Parity OK' : 'Odd Parity Error';
  parityEl.className = 'detail-val ' + (parityOk ? 'ok' : 'err');

  // ── Banner ──
  document.getElementById('banner-oct').textContent = labelOct;
  document.getElementById('banner-name').textContent = labelInfo ? labelInfo.param : 'Label inconnu';
  // Sous-titre : format, équipements qui émettent ce paramètre, et les notes (format hors manuel, écart du manuel)
  const sousTitre = labelInfo
    ? `Label ${labelOct} (octal) | ${labelHex} | ${labelInfo.enc}${labelInfo.eq ? ' | ' + eqTexte(labelInfo.eq) : ''}`
    : `Label ${labelOct} (octal) | ${labelHex}`;
  const notes = [labelInfo && labelInfo.hors ? texteHors(labelInfo.hors) : '', labelInfo && labelInfo.note ? labelInfo.note : '',
                 labelInfo && labelInfo.att6 ? `voir le tableau ${labelInfo.att6} du manuel` : ''].filter(Boolean);
  document.getElementById('banner-sub').innerHTML = sousTitre.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    + notes.map(n => `<br><span style="color:#fbbf24">⚠ ${n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('');
  // Config selector — show dropdown only when label has alternate configs
  const bannerConfig = document.getElementById('banner-config');
  const alts = ALT_CONFIGS[labelOct] || [];
  if (alts.length > 0 && labelInfo) {
    const baseLabel = LABELS.find(l => l.oct === labelOct);
    const curIdx = labelConfigIdx[labelOct] || 0;
    // chaque choix : le paramètre et les équipements qui l'émettent (Eqpt. ID)
    const texte = c => `${c.param}${c.eq ? ' — ' + c.eq.map(e => nomEq(e) ? `${nomEq(e)} ${e}` : e).join(', ') : ''}`.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const opts = [
      `<option value="0"${curIdx === 0 ? ' selected' : ''}>${baseLabel ? texte(baseLabel) : 'Config 1'}</option>`,
      ...alts.map((a, i) => `<option value="${i + 1}"${curIdx === i + 1 ? ' selected' : ''}>${texte(a)}</option>`),
    ].join('');
    bannerConfig.innerHTML =
      `<select class="config-select" onchange="switchLabelConfig('${labelOct}', this.value)">${opts}</select>`;
  } else {
    bannerConfig.innerHTML = '';
  }
  const bannerEl = document.getElementById('banner-value');
  if (labelInfo && meta && meta.fmt === 'latlon' && decodedBanner !== null) {
    const isLat = !!meta.lat;
    const dir = isLat
      ? (ssm === 0b00 ? 'N' : ssm === 0b11 ? 'S' : null)
      : (ssm === 0b00 ? 'E' : ssm === 0b11 ? 'W' : null);
    bannerEl.innerHTML = dir
      ? `<span style="color:#4fc3f7;font-weight:bold">${dir}</span> ${decodedBanner}`
      : decodedBanner;
  } else if (labelInfo && meta && meta.signe && decodedBanner !== null) {
    const sign = ssm === 0b00 ? '+' : ssm === 0b11 ? '−' : null;
    const signColor = ssm === 0b00 ? '#80cc80' : '#ff6b6b';
    const unit = labelInfo.unit ? ' ' + labelInfo.unit : '';
    bannerEl.innerHTML = sign
      ? `<span style="color:${signColor};font-weight:bold">${sign}</span> ${decodedBanner}${unit}`
      : decodedBanner + unit;
  } else {
    bannerEl.textContent = decodedBanner !== null
      ? decodedBanner + (labelInfo && labelInfo.unit ? ' ' + labelInfo.unit : '')
      : '—';
  }

}

// ── Actions ─────────────────────────────────────────

function resetToZero() {
  document.getElementById('hex-input').value = '00000000';
  document.getElementById('error-msg').textContent = '';
  currentWord = 0;
  renderBits(currentWord);
  renderFields(currentWord);
}

function decodeFromInput() {
  const raw = document.getElementById('hex-input').value.trim().replace(/^0x/i, '');
  const errEl = document.getElementById('error-msg');

  if (!/^[0-9A-Fa-f]{1,8}$/.test(raw)) {
    errEl.textContent = 'Valeur invalide — entrez 1 à 8 chiffres hexadécimaux';
    return;
  }
  errEl.textContent = '';

  currentWord = parseInt(raw.padStart(8, '0'), 16) >>> 0;
  renderBits(currentWord);
  renderFields(currentWord);
}

function toggleBit(bitNum) {
  if (currentWord === null) return;
  const cur = getBit(currentWord, bitNum);
  currentWord = setBitVal(currentWord, bitNum, cur ? 0 : 1);
  document.getElementById('hex-input').value =
    currentWord.toString(16).toUpperCase().padStart(8, '0');
  renderBits(currentWord);
  renderFields(currentWord);
}

// ── Strapping ─────────────────────────────────────────
const STRAP_LABELS = {
  'J1-28': { GND: 'GND',       OPEN: 'OPEN'      },
  'J1-27': { GND: 'GND',       OPEN: 'OPEN'      },
  'J1-32': { GND: 'CSDB',      OPEN: 'ARINC 429' },
  'J1-14': { GND: 'Port A',    OPEN: 'Port B'    },
};

function setStrapping(pin, value, btn) {
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const statusEl = btn.parentElement.nextElementSibling;
  if (statusEl && statusEl.classList.contains('strap-status')) {
    const labels = STRAP_LABELS[pin] || { GND: 'GND', OPEN: 'OPEN' };
    statusEl.textContent = labels[value] || value;
  }
}


// ── Init ─────────────────────────────────────────────

document.getElementById('hex-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') decodeFromInput();
});

// Afficher les panneaux avec tous les bits à zéro au chargement
currentWord = 0;
renderBits(currentWord);
renderFields(currentWord);
