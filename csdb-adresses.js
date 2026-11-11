// ════════════════════════════════════════════════════
//  CSDB — table des adresses (GAMA, standard 523-0772774, 9e édition, 14 janvier 1998)
//  Vérifiée page par page contre la section 5 du manuel (pages 24 à 93) et les bus de la section 4.3.
//  Chaque adresse décrit tous ses champs ; csdb.js en tire le décodage, la carte des bits, la bande du haut et les panneaux.
//
//  Champ : { t, court, nom, … }   pièces p = [[octet, bit haut, bit bas], …] du poids fort au poids faible
//    bit   : { o, b, role ('val' | 'test' | 'ctl' | 'mode'), v1, v0 }      un discret
//    enum  : { p, noms }                                                     valeur → nom (role 'si' = source)
//    bcd   : { ch: [[octet, haut, bas, poids], …], base, dec, unit }        chiffres BCD
//    c2    : { p, msb, unit, dec, bias, neg, pos }                           complément à 2 ; msb = poids négatif du bit de signe
//    bin   : { p, msb, unit, dec }                                           binaire non signé ; msb = poids du bit de poids fort
//    oct   : { ch: [[octet, haut, bas, nom], …] }                            chiffres 0-7 (code ATC)
//    gillham, ascii, mkr, hex, msgs, somme : voir csdb.js
//  Données sur plusieurs octets : octet de poids faible en premier (manuel p. 12).
// ════════════════════════════════════════════════════
(function () {
  const V = (b, court, nom, o = 1) => ({ t: 'bit', o, b, court, nom, role: 'val', v1: 'valide', v0: 'invalide' });
  const T = (b = 2, court = 'TEST', nom = 'Test') => ({ t: 'bit', o: 1, b, court, nom, role: 'test', v1: 'test en cours', v0: 'normal' });
  const K = (b, court, nom, v1 = 'oui', v0 = 'non', o = 1) => ({ t: 'bit', o, b, court, nom, role: 'ctl', v1, v0 });
  const E = (p, court, nom, noms, role = 'ctl') => ({ t: 'enum', p, court, nom, noms, role });
  const SI2 = (noms = SI_123, court = 'SI', nom = 'Source ident (bits 1-0)') => E([[1, 1, 0]], court, nom, noms, 'si');
  const SI3 = noms => E([[1, 3, 3], [1, 1, 0]], 'SI', 'Source ident (bits 3, 1, 0)', noms, 'si');
  // 16 bits en complément à 2, octet o = poids faible, o + 1 = poids fort
  const C2 = (o, court, nom, msb, unit, x = {}) => ({ t: 'c2', p: [[o + 1, 7, 0], [o, 7, 0]], court, nom, msb, unit, ...x });
  const ALT_BIAIS = { bias: 24576, dec: 0, note: 'biaisé de +24 576 ft (valeur brute −24 576 = 0 ft)' };
  // LRU ident et origine des données (bus EFIS et VNI)
  const LRU = (n0 = 'Data origin (bit 0)') => [
    K(1, 'LRU', 'LRU ident (sangle de côté)', 'côté 2', 'côté 1'),
    K(0, 'ORG', n0, '1', '0'),
  ];
  const FREQ_VHF = { t: 'bcd', court: 'FREQ', nom: 'Fréquence', unit: 'MHz', base: 100, dec: 3, zeroNul: true,
    ch: [[4, 6, 4, 10], [4, 3, 0, 1], [3, 7, 4, 0.1], [3, 3, 0, 0.01], [2, 7, 4, 0.001]] };
  const FREQ_NAV = (o, x = {}) => ({ t: 'bcd', court: 'FREQ', nom: 'Fréquence', unit: 'MHz', base: 100, dec: 2, zeroNul: true,
    ch: [[o + 1, 6, 4, 10], [o + 1, 3, 0, 1], [o, 7, 4, 0.1], [o, 3, 0, 0.01]], ...x });
  const MLS_CH = (o) => K(7, 'MLS', 'MLS chan ident (canal TACAN)', 'W/Z (MLS impair)', 'X/Y (MLS pair)', o);
  const INHIB = (o) => [K(7, 'RMT', 'Remote tune', 'inhibé', 'permis', o), K(6, 'AUTO', 'Auto tune', 'inhibé', 'permis', o)];
  const SOMME = (o) => ({ t: 'somme', o, court: 'CHECKSUM', nom: 'Checksum (complément à 2, modulo 256)' });
  const MARQUEURS = { t: 'mkr', p: [[2, 2, 0]], court: 'MKR', nom: 'Radiobalises (INN · MDL · OUT)', ban: 1 };

  const SI_123 = ['non utilisé', '#1', '#2', '#3'];
  const SI_12 = ['non utilisé', '#1', '#2', 'non utilisé'];
  const SI_VHF = ['toutes les unités', '#1', '#2', '#3', '—', '#1 PRESET', '#2 PRESET', '#3 PRESET'];
  const SI_RCOMM = ['non utilisé', '#1 ACTIVE', '#2 ACTIVE', '#3 ACTIVE', 'non utilisé', '#1 PRESET', '#2 PRESET', '#3 PRESET'];
  const CH_DME = ['preset du côté (ou remote)', '#1 ACTIVE', '#2 ACTIVE', 'REMOTE ONLY'];
  const SI_RSET = ['SET #1 PRESET', 'SET #1 ACTIVE', 'SET #2 ACTIVE', 'SET #2 PRESET'];
  const SI_MLS = ['non utilisé', '#1 ACTIVE', '#2 ACTIVE', 'réservé'];
  const SI_AHRS = ['non utilisé', '#1 AHC', '#2 AHC', '#3 AHC', 'non utilisé', '#1 IRU', '#2 IRU', '#3 IRU'];
  const SRCH = E([[1, 5, 4]], 'S/T', 'Search/track', ['NO SQUITTER', 'SEARCH', 'PRE-TRACK', 'TRACK']);
  const AUTO_MAN = K(6, 'AUTO', 'Auto/manual tune', 'accord auto (base de données) possible', 'accord auto interdit (manuel)');
  const COULEURS = ['BLACK', 'BLUE', 'GREEN', 'CYAN', 'RED', 'MAGENTA', 'YELLOW', 'WHITE'];

  const D = {};
  // ── VHF COMM ─────────────────────────────────────────
  D[0x10] = { nom: 'VHF COMM FREQ', sys: 'VHF COMM', p: 24, desc: 'Fréquence VHF COM commandée par la boîte de commande (canaux 25 kHz)', ex: '10 81 50 92 18 00',
    champs: [V(7, 'VAL', 'Freq valid'), K(5, 'XFR', 'Transfer control', 'transfert actif ↔ preset', '—'),
      K(4, 'SQL', 'Squelch control', 'audio actif (squelch hors service)', 'squelch automatique'), SI3(SI_VHF), T(2, 'TST', 'Test control'),
      { ...FREQ_VHF, ban: 2, val: 7 }] };
  D[0x11] = { nom: 'VHF COMM DATA', sys: 'VHF COMM', p: 25, desc: 'Fréquence et état sortis par le poste VHF COM (canaux 25 kHz)', ex: '11 B1 50 92 18 00',
    champs: [V(7, 'VAL', 'Freq valid'), E([[1, 6, 5]], 'LIM', 'Freq limit', ['non utilisé', '135.975 MHz', '136.975 MHz', '151.975 MHz']),
      K(4, 'XMT', 'Émission (XMIT IND)', 'en émission', 'réception'), SI3(SI_VHF), T(2, 'TST', 'Self test'),
      { ...FREQ_VHF, ban: 2, val: 7 }] };
  D[0x12] = { ...D[0x10], nom: 'VHF COMM FREQ (8.33 KHZ CHANNELS)', p: 26, desc: 'Fréquence VHF COM commandée, canaux de 8.33 kHz', ex: '12 81 50 92 18 00' };
  D[0x13] = { ...D[0x11], nom: 'VHF COMM DATA (8.33 KHZ CHANNELS)', p: 27, desc: 'Fréquence et état du poste VHF COM, canaux de 8.33 kHz', ex: '13 B1 50 92 18 00' };
  // ── Transpondeur ATC ─────────────────────────────────
  const CODE_ATC = { t: 'oct', court: 'ATC', banLabel: 'CODE ATC', nom: 'Code ATC', ch: [[3, 6, 4, 'A'], [3, 2, 0, 'B'], [2, 6, 4, 'C'], [2, 2, 0, 'D']], ban: 2, val: 7 };
  const ALT_ATC = { t: 'gillham', court: 'ALT', banLabel: 'CODE ALT', nom: 'Altitude transmise (code Gray / Gillham)', ch: [[5, 6, 4, 'A'], [5, 2, 0, 'B'], [4, 6, 4, 'C'], [4, 2, 0, 'D']], ban: 1,
    note: 'code ATC valide (bit 7) ne vaut que pour le code ; l’altitude n’est pas surveillée (tout à 0 ou tout à 1 = invalide sur certains systèmes)' };
  D[0x1E] = { nom: 'TRANSPONDER ATC CODE/ALTITUDE', sys: 'ATC', p: 28, desc: 'Code ATC choisi (4 chiffres 0-7) et altitude Gillham, vers le transpondeur', ex: '1E 91 00 12 10 23',
    champs: [V(7, 'VAL', 'Code valid'), K(5, 'MOD', 'Mode', 'STBY', 'actif'), K(4, 'ALT', 'Alt reporting', 'ON', 'OFF'), K(3, 'IDT', 'ATC ident', 'ON', 'OFF'), T(),
      SI2(SI_12), CODE_ATC, ALT_ATC], note: ALT_ATC.note };
  D[0x1F] = { nom: 'TRANSPONDER OUTPUT DATA', sys: 'ATC', p: 29, desc: 'Sortie du transpondeur : code ATC, altitude Gillham et émission', ex: '1F D1 00 12 10 23',
    champs: [V(7, 'VAL', 'Code valid'), K(6, 'XMT', 'Xmit', 'ON', 'OFF'), K(5, 'MOD', 'Mode', 'STBY', 'actif'), K(4, 'ALT', 'Alt reporting', 'ON', 'OFF'),
      K(3, 'IDT', 'ATC ident', 'ON', 'OFF'), T(), SI2(SI_12), CODE_ATC, ALT_ATC], note: ALT_ATC.note };
  // ── VHF NAV ──────────────────────────────────────────
  D[0x20] = { nom: 'VHF NAV FREQ', sys: 'VHF NAV', p: 30, desc: 'Fréquence VOR/ILS commandée', ex: '20 81 30 11 00 00',
    champs: [V(7, 'VAL', 'Freq valid'), K(4, 'MKR', 'Marker sensitivity', 'LOW', 'HIGH'), K(3, 'DME', 'DME hold', 'ON', 'OFF'), T(), SI2(), FREQ_NAV(2, { ban: 2, val: 7 })] };
  D[0x21] = { nom: 'VOR DATA', sys: 'VHF NAV', p: 31, desc: 'Relèvement VOR (de l’avion vers la station), radiobalises et fréquence', ex: '21 C1 02 20 30 11',
    champs: [V(7, 'VOR', 'VOR valid'), V(6, 'FRQ', 'Freq valid'), K(5, '2/5', '2/5 tune', 'ENAB', 'non'), K(4, 'MKR', 'Marker sensitivity', 'LOW', 'HIGH'),
      K(3, 'ROT', 'Rot mod filter', 'ACTV', 'non'), T(), SI2(),
      { t: 'c2', p: [[3, 7, 0], [2, 7, 4]], court: 'BRG', banLabel: 'VOR BRG', nom: 'Relèvement VOR (de l’avion vers la station)', msb: -180, unit: '°', dec: 1, ban: 3, val: 7 },
      MARQUEURS, FREQ_NAV(4, { ban: 2, val: 6 })],
    note: 'radiobalises transmises à la réception, quels que soient les drapeaux (bits 7-6)' };
  D[0x22] = { nom: 'ILS DATA', sys: 'VHF NAV', p: 32, desc: 'Écarts glide et localizer (sens commande : + = monter, droite)', ex: '22 C1 00 20 00 F0',
    champs: [V(7, 'GS', 'GS valid'), V(6, 'LOC', 'LOC valid'), K(5, 'DLY', 'Delayed ILS', 'ILS', 'non'), K(4, 'MKR', 'Marker sensitivity', 'LOW', 'HIGH'),
      K(3, 'GLS', 'GLS', 'NO', 'oui'), T(), SI2(),
      { t: 'c2', p: [[3, 7, 0], [2, 7, 4]], court: 'GS', banLabel: 'GS DEV', nom: 'Écart glide (DDM)', msb: -0.8, unit: 'DDM', dec: 3, neg: 'FLY DOWN', pos: 'FLY UP', ban: 2, val: 7 },
      MARQUEURS,
      { t: 'c2', p: [[5, 7, 0], [4, 7, 4]], court: 'LOC', banLabel: 'LOC DEV', nom: 'Écart localizer (DDM)', msb: -0.4, unit: 'DDM', dec: 3, neg: 'FLY LEFT', pos: 'FLY RIGHT', ban: 3, val: 6 }],
    note: 'DDM en %/100 ; sur le bus NAV l’écart est codé en commande (+ = monter, droite), à l’inverse de C7' };
  // ── DME ──────────────────────────────────────────────
  const DME_FREQ = (x = {}) => FREQ_NAV(2, x);
  D[0x24] = { nom: 'DME FREQUENCY', sys: 'DME', p: 33, desc: 'Fréquence DME commandée (canaux 1, 2, 3)', ex: '24 C1 30 11 00 00',
    champs: [V(7, 'VAL', 'Freq valid'), AUTO_MAN, K(4, 'MLS', 'MLS/VORLOC ident', 'MLS', 'VORLOC'), K(3, 'HLD', 'DME hold', 'ON', 'OFF'), T(),
      E([[1, 1, 0]], 'CH', 'Channel ident', CH_DME, 'si'), DME_FREQ({ ban: 2, val: 7, banLabel: 'FREQ DME' }), MLS_CH(3), ...INHIB(5)],
    note: 'le preset du côté est préempté par l’adresse 34 (#1 ou #2)' };
  D[0x25] = { nom: 'DME FREQUENCY & DISTANCE', sys: 'DME', p: 34, desc: 'Fréquence et distance DME (canaux 1, 2, 3)', ex: '25 F1 30 11 00 0C',
    champs: [V(7, 'FRQ', 'Freq valid'), V(6, 'DST', 'Dist valid'), SRCH, K(3, 'HLD', 'DME hold', 'ON', 'OFF'), T(),
      E([[1, 1, 0]], 'CH', 'Channel ident', CH_DME, 'si'), DME_FREQ({ ban: 1, val: 7, banLabel: 'FREQ DME' }), MLS_CH(3),
      { t: 'bin', p: [[5, 7, 0], [4, 7, 0]], court: 'DIST', banLabel: 'DIST DME', nom: 'Distance DME', msb: 256, unit: 'NM', dec: 2, ban: 2, val: 6 }],
    note: 'distance : binaire 16 bits, bit de poids fort = 256 NM (pas de 1/128 NM)' };
  D[0x26] = { nom: 'DME TIME-TO-STATION & VELOCITY', sys: 'DME', p: 35, desc: 'Temps jusqu’à la station et vitesse sol DME', ex: '26 F1 52 01 50 01',
    champs: [V(7, 'VAL', 'TTS & vel valid'), AUTO_MAN, SRCH, K(3, 'MLS', 'MLS/VORLOC ident', 'MLS', 'VORLOC'), T(), E([[1, 1, 0]], 'CH', 'Channel ident', CH_DME, 'si'),
      { t: 'bcd', court: 'TTS', nom: 'Temps jusqu’à la station', unit: 'min', dec: 1, ch: [[3, 4, 4, 100], [3, 3, 0, 10], [2, 7, 4, 1], [2, 3, 0, 0.1]], ban: 1, val: 7 },
      { t: 'bcd', court: 'VEL', banLabel: 'VEL DME', nom: 'Vitesse DME', unit: 'kt', dec: 0, ch: [[5, 3, 0, 100], [4, 7, 4, 10], [4, 3, 0, 1]], ban: 2, val: 7 },
      ...INHIB(5)],
    note: 'temps et vitesse calculés sans signe' };
  D[0x27] = { nom: 'DME IDENT', sys: 'DME', p: 36, desc: 'Indicatif de la station DME (4 caractères ASCII)', ex: '27 B1 C9 4C 41 58',
    champs: [V(7, 'VAL', 'Ident valid'), K(6, '568', 'Analog & 568 data', 'ce canal alimente les sorties analogiques et 568', 'non'), SRCH, T(),
      E([[1, 1, 0]], 'CH', 'Channel ident', CH_DME, 'si'),
      { t: 'ascii', octs: [2, 3, 4, 5], bits: 7, valBit: true, court: 'CAR', banLabel: 'IDENT DME', nom: 'Indicatif', ban: 2, val: 7 }],
    note: 'chaque octet : bit 7 = 0 si le caractère est valide ; un indicatif de 3 lettres occupe les caractères 2 à 4 (le 1er marqué invalide)' };
  // ── Commandes de vol (FCC) ───────────────────────────
  D[0x2A] = { nom: 'STEER COMMANDS/ALT REFERENCE', sys: 'FCS', p: 37, n: 8, desc: 'Altitude de référence et commandes de tangage et de roulis du FCC', ex: '2A E0 10 C7 E4 F8 1C 07',
    champs: [V(7, 'ALT', 'Alt ref valid'), V(6, 'PIT', 'Pitch steer valid'), V(5, 'ROL', 'Roll steer valid'), K(2, 'RSVD', 'Reserved test'), E([[1, 1, 0]], 'RSVD', 'Reserved source ident', ['', '', '', ''], 'rsvd'),
      C2(2, 'ALT REF', 'Altitude de référence', -32768, 'ft', { ...ALT_BIAIS, ban: 3, val: 7 }),
      C2(4, 'PITCH', 'Commande de tangage', -180, '°', { dec: 2, neg: 'FLY DOWN', pos: 'FLY UP', ban: 2, val: 6 }),
      C2(6, 'ROLL', 'Commande de roulis', -180, '°', { dec: 2, neg: 'FLY LEFT', pos: 'FLY RIGHT', ban: 1, val: 5 })],
    note: 'altitude de référence biaisée de +24 576 ft' };
  // ── ADF ──────────────────────────────────────────────
  const FREQ_ADF = (o, x = {}) => ({ t: 'bcd', court: 'FREQ', nom: 'Fréquence ADF', unit: 'kHz', dec: 1, zeroNul: true,
    ch: [[o + 2, 5, 4, 1000], [o + 2, 3, 0, 100], [o + 1, 7, 4, 10], [o + 1, 3, 0, 1], [o, 7, 4, 0.1]], ...x });
  D[0x2B] = { nom: 'ADF DATA', sys: 'ADF', p: 38, desc: 'Relèvement ADF et fréquence', ex: '2B D1 00 54 21 03',
    champs: [V(7, 'BRG', 'ADF bearing valid'), V(6, 'FRQ', 'Freq valid'), K(5, 'BFO', 'BFO', 'ON', 'OFF'), K(4, 'ADF', 'ADF/ANT', 'ADF', 'ANT'),
      K(3, 'LIM', 'Freq limit', '1750 kHz max', 'non'), T(), SI2(),
      { t: 'c2', p: [[3, 3, 0], [2, 7, 0]], court: 'BRG', banLabel: 'ADF BRG', nom: 'Relèvement ADF', msb: -180, unit: '°', dec: 1, ban: 2, val: 7 },
      { ...FREQ_ADF(3), ch: [[5, 5, 4, 1000], [5, 3, 0, 100], [4, 7, 4, 10], [4, 3, 0, 1], [3, 7, 4, 0.1]], ban: 1, val: 6 }] };
  D[0x2C] = { nom: 'ADF FREQUENCY', sys: 'ADF', p: 39, desc: 'Fréquence ADF commandée', ex: '2C 91 00 50 21 03',
    champs: [V(7, 'VAL', 'Freq valid'), K(5, 'BFO', 'BFO', 'ON', 'OFF'), K(4, 'ADF', 'ADF/ANT', 'ADF', 'ANT'), T(), SI2(), { ...FREQ_ADF(3), ban: 2, val: 7 }] };
  // ── Accord à distance (bus CDU : rafales) ────────────
  const RAFALE = 'rafale de 16 répétitions ; bits 5, 4 et 2 momentanés (envoyer l’état appuyé puis relâché) ; le récepteur garde le premier bloc dont le checksum se vérifie';
  D[0x30] = { nom: 'REMOTE NAV TUNE', sys: 'FMS', p: 40, desc: 'Accord NAV à distance (FMS ou CDU)', rafale: true, ex: '30 81 30 11 00 0E',
    champs: [V(7, 'REM', 'Remote tune valid'), AUTO_MAN, K(5, 'XFR', 'Active/preset', 'XFR', '—'), K(4, 'MEM', 'Remote memory', 'RCL', '—'),
      K(3, 'MLS', 'MLS/VORLOC ident', 'MLS', 'VORLOC'), T(), SI2(SI_RSET), FREQ_NAV(2, { ban: 2, val: 7 }), MLS_CH(3), ...INHIB(4), SOMME(5)], note: RAFALE };
  D[0x31] = { nom: 'REMOTE COMM TUNE', sys: 'FMS', p: 41, desc: 'Accord VHF COM à distance (FMS ou CDU)', rafale: true, ex: '31 81 50 92 18 54',
    champs: [V(7, 'REM', 'Remote tune valid'), K(5, 'XFR', 'Active/preset', 'XFR', '—'), K(4, 'MEM', 'Remote memory', 'RCL', '—'), SI3(SI_RCOMM), T(),
      { ...FREQ_VHF, ban: 2, val: 7 }, SOMME(5)], note: RAFALE };
  D[0x32] = { nom: 'REMOTE ADF TUNE', sys: 'FMS', p: 42, desc: 'Accord ADF à distance (FMS ou CDU)', rafale: true, ex: '32 81 50 21 03 D9',
    champs: [V(7, 'REM', 'Remote tune valid'), K(5, 'XFR', 'Active/preset', 'XFR', '—'), K(4, 'MEM', 'Remote memory', 'RCL', '—'), T(), SI2(SI_RSET),
      { ...FREQ_ADF(2), ch: [[4, 5, 4, 1000], [4, 3, 0, 100], [3, 7, 4, 10], [3, 3, 0, 1], [2, 7, 4, 0.1]], ban: 2, val: 7 }, SOMME(5)], note: RAFALE };
  D[0x33] = { nom: 'REMOTE ATC CODE', sys: 'FMS', p: 43, desc: 'Code ATC envoyé à distance (FMS ou CDU)', rafale: true, ex: '33 81 00 12 00 3A',
    champs: [V(7, 'VAL', 'Code valid'), T(), SI2(SI_12), { ...CODE_ATC }, SOMME(5)], note: RAFALE };
  D[0x34] = { nom: 'REMOTE DME TUNE', sys: 'FMS', p: 44, desc: 'Accord d’un canal DME indépendant du NAV actif', rafale: true, ex: '34 81 30 11 00 0A',
    champs: [V(7, 'REM', 'Remote tune valid'), AUTO_MAN, K(4, 'MLS', 'MLS/VORLOC ident', 'MLS', 'VORLOC'), K(2, 'RSVD', 'Reserved'),
      E([[1, 1, 0]], 'CH', 'Channel ident', ['#1 SIDE PRE-EMPT', '#1 REMOTE', '#2 REMOTE', '#2 SIDE PRE-EMPT'], 'si'),
      FREQ_NAV(2, { ban: 2, val: 7 }), MLS_CH(3), ...INHIB(4), SOMME(5)],
    note: 'deux DME : canaux à distance (0,1) pour le #1 et (1,0) pour le #2 ; (0,0) et (1,1) préemptent le canal du NAV preset jusqu’à une nouvelle rafale avec bit 7 = 0 ; ' + RAFALE };
  D[0x35] = { ...D[0x31], nom: 'REMOTE COMM TUNE (8.33 KHZ CHANNELS)', p: 46, desc: 'Accord VHF COM à distance, canaux de 8.33 kHz', ex: '35 81 50 92 18 50' };
  const CANAL_MLS = (lo, x) => ({ t: 'bcd', dec: 0, ...x, ch: lo });
  D[0x37] = { nom: 'REMOTE MLS CHANNEL AND GLIDE PATH TUNE', sys: 'MLS', p: 47, desc: 'Canal MLS et angle de descente commandés à distance', rafale: true, ex: '37 89 50 0D 83 60',
    champs: [V(7, 'REM', 'Remote tune valid'), V(6, 'M/A', 'Man/auto valid'), K(4, 'MOD', 'Man/auto mode', 'AUTO', 'manuel'), K(3, 'KBD', 'Auto/kbd tune', 'AUTO', 'clavier'), T(),
      SI2(SI_MLS), V(3, 'CHV', 'Channel valid', 3),
      CANAL_MLS([[3, 2, 0, 100], [2, 7, 4, 10], [2, 3, 0, 1]], { court: 'CANAL', nom: 'Canal MLS', ban: 2, val: 'CHV' }),
      V(7, 'GPV', 'Glide path valid', 4),
      CANAL_MLS([[4, 4, 4, 100], [4, 3, 0, 10], [3, 7, 4, 1]], { court: 'GP', nom: 'Glide path (unité non précisée)', ban: 1, val: 'GPV' }), SOMME(5)],
    note: 'unité du glide path non précisée dans le manuel ; ' + RAFALE };
  D[0x38] = { nom: 'REMOTE MLS AZIMUTH AND BACK AZIMUTH TUNE', sys: 'MLS', p: 48, desc: 'Azimut et azimut arrière MLS commandés à distance', rafale: true, ex: '38 C1 15 08 98 52',
    champs: [V(7, 'REM', 'Remote tune valid'), V(6, 'AZV', 'AZ/BAZ mode valid'), K(4, 'MODE', 'AZ/BAZ mode', 'BAZ', 'AZ'), T(), SI2(SI_MLS),
      V(3, 'AZ', 'Azimuth valid', 3), CANAL_MLS([[3, 1, 0, 100], [2, 7, 4, 10], [2, 3, 0, 1]], { court: 'AZ', nom: 'Azimut (unité non précisée)', ban: 2, val: 'AZ' }),
      V(7, 'BAZ', 'Back azimuth valid', 4), CANAL_MLS([[4, 5, 4, 100], [4, 3, 0, 10], [3, 7, 4, 1]], { court: 'BAZ', nom: 'Azimut arrière (unité non précisée)', ban: 1, val: 'BAZ' }), SOMME(5)],
    note: 'unité de l’azimut non précisée dans le manuel ; ' + RAFALE };
  // ── AHRS (bus AHC, 8 octets) ─────────────────────────
  const ST_AHRS = [V(7, 'VAL', 'Data valid'), K(5, 'DG', 'DG mode', 'ON', 'OFF'), K(4, 'STR', 'Strut switch', 'au sol', 'en vol'), SI3(SI_AHRS), T()];
  D[0x40] = { nom: 'RATES (BODY AXIS)', sys: 'AHRS', p: 49, n: 8, desc: 'Vitesses angulaires en axes avion', ex: '40 81 00 01 80 FF 40 00',
    champs: [...ST_AHRS,
      C2(2, 'PITCH', 'Vitesse de tangage', -256, '°/s', { dec: 2, neg: 'nez en bas', pos: 'nez en haut', ban: 3, val: 7 }),
      C2(4, 'ROLL', 'Vitesse de roulis', -256, '°/s', { dec: 2, neg: 'gauche', pos: 'droite', ban: 2, val: 7 }),
      C2(6, 'YAW', 'Vitesse de lacet', -256, '°/s', { dec: 2, neg: 'nez à gauche', pos: 'nez à droite', ban: 1, val: 7 })] };
  D[0x41] = { nom: 'ACCELERATIONS (BODY AXIS)', sys: 'AHRS', p: 50, n: 8, desc: 'Accélérations en axes avion', ex: '41 81 A4 00 00 00 CD 0C',
    champs: [...ST_AHRS,
      C2(2, 'LONG', 'Accélération longitudinale', -10, 'g', { dec: 3, neg: 'arrière', pos: 'avant', ban: 1, val: 7 }),
      C2(4, 'LAT', 'Accélération latérale', -10, 'g', { dec: 3, neg: 'gauche', pos: 'droite', ban: 2, val: 7 }),
      C2(6, 'NORM', 'Accélération normale', -10, 'g', { dec: 3, neg: 'nez en bas', pos: 'nez en haut', ban: 3, val: 7 })],
    note: 'accélération normale = 1 g sans autre force extérieure que la pesanteur' };
  D[0x42] = { nom: 'ACCELERATIONS', sys: 'AHRS', p: 51, n: 8, desc: 'Accélérations le long du cap, en travers et verticale', ex: '42 81 A4 00 00 00 CD 0C',
    champs: [...ST_AHRS,
      C2(2, 'ALONG', 'Accélération le long du cap', -10, 'g', { dec: 3, neg: 'arrière', pos: 'avant', ban: 1, val: 7 }),
      C2(4, 'CROSS', 'Accélération en travers du cap', -10, 'g', { dec: 3, neg: 'gauche', pos: 'droite', ban: 2, val: 7 }),
      C2(6, 'VERT', 'Accélération verticale', -10, 'g', { dec: 3, neg: 'vers le bas', pos: 'vers le haut', ban: 3, val: 7 })] };
  const ST_EULER = [V(7, 'ATT', 'Attitude valid'), V(6, 'HDG', 'Heading valid'), K(5, 'RV2', 'Reserved rev mode 2'), K(4, 'RV1', 'Rev mode 1', 'ON', 'OFF'), SI3(SI_AHRS), T()];
  D[0x43] = { nom: 'ATTITUDE/HEADING (EULER)', sys: 'AHRS', p: 52, n: 8, desc: 'Assiette, inclinaison et cap magnétique', ex: '43 C1 8E 03 E4 F8 00 C0',
    champs: [...ST_EULER,
      C2(2, 'PITCH', 'Assiette (tangage)', -180, '°', { dec: 2, neg: 'nez en bas', pos: 'nez en haut', ban: 2, val: 7 }),
      C2(4, 'ROLL', 'Inclinaison (roulis)', -180, '°', { dec: 2, neg: 'gauche', pos: 'droite', ban: 1, val: 7 }),
      C2(6, 'HDG', 'Cap magnétique', -180, '°', { dec: 2, cap: true, ban: 3, val: 6 })] };
  D[0x46] = { nom: 'HEADING, MAGNETIC', sys: 'MCS', p: 53, desc: 'Cap magnétique du compas (bus MCS)', ex: '46 88 00 20 00 00',
    champs: [V(7, 'HDG', 'Heading valid'), K(3, 'SLV', 'Slave mode', 'ON', 'OFF'), K(2, 'RSVD', 'Reserved test'), E([[1, 1, 0]], 'RSVD', 'Reserved source ident', ['', '', '', ''], 'rsvd'),
      { t: 'c2', p: [[3, 7, 0], [2, 7, 2]], court: 'HDG', banLabel: 'CAP MAG', nom: 'Cap magnétique', msb: -180, unit: '°', dec: 2, cap: true, ban: 2, val: 7 },
      { t: 'c2', p: [[4, 7, 0]], court: 'SLAVE', nom: 'Slave rate (−max, 0 ou +max)', msb: -128, unit: '', dec: 0, neg: 'diminue le cap', pos: 'augmente le cap', ban: 1 },
      { t: 'hex', p: [[5, 7, 0]], court: 'SPARE', nom: 'Spare (TBD)' }],
    note: 'cap : 14 bits en complément à 2 (bits 7-2 de l’octet 2 et octet 3), pas de 0.022°' };
  D[0x47] = { nom: 'AHRS CONTROL', sys: 'AHRS', p: 54, n: 8, desc: 'Cap, latitude, asservissement du compas et mode de stimulation', ex: '47 C1 00 20 5B 20 00 00',
    champs: [...ST_EULER,
      C2(2, 'HDG', 'Cap magnétique', -180, '°', { dec: 2, cap: true, ban: 3, val: 6 }),
      C2(4, 'LAT', 'Latitude', -180, '°', { dec: 3, neg: 'S', pos: 'N', ban: 2 }),
      { t: 'c2', p: [[6, 7, 0]], court: 'SLAVING', nom: 'Écart d’asservissement de la rose', msb: -10, unit: '°', dec: 2, neg: 'gauche', pos: 'droite', ban: 1 },
      { t: 'hex', p: [[7, 7, 0]], court: 'STIM', nom: 'Mode de stimulation', noms: { 0: 'STIM OFF', 1: 'ROLL ONLY', 2: 'PITCH ONLY', 3: 'HDG ONLY', 10: 'ALL DATA CYCLING' } }] };
  // ── Commandes de vol (suite) ─────────────────────────
  D[0x70] = { nom: 'CRT ASCII MESSAGES', sys: 'FCS', p: 55, n: 8, sansStatut: true, desc: 'Messages texte du FCC pour l’écran CRT (8 messages par trame)', ex: '70 42 41 50 50 20 41 52',
    champs: [{ t: 'bin', p: [[1, 7, 5]], court: 'LIGNE', nom: 'Ligne', msb: 4, unit: '', dec: 0, ban: 1 }, { t: 'bin', p: [[1, 4, 0]], court: 'COLONNE', nom: 'Colonne', msb: 16, unit: '', dec: 0, ban: 2 },
      { t: 'ascii', octs: [2, 3, 4, 5, 6, 7], bits: 8, court: 'CAR', nom: 'Texte (6 caractères)', ban: 3 }],
    note: 'l’octet 1 n’est pas un statut : ligne (bits 7-5) et colonne (bits 4-0) du message à l’écran' };
  D[0x72] = { nom: 'VS/IAS/MACH REFERENCES', sys: 'FCS', p: 56, n: 8, desc: 'Références de vitesse verticale, de vitesse indiquée et de Mach du FCS', ex: '72 E1 40 06 00 32 80 61',
    champs: [K(7, 'VS', 'VS ref', 'SET (affichée)', 'non'), K(6, 'IAS', 'IAS ref', 'SET (affichée)', 'non'), K(5, 'MCH', 'Mach ref', 'SET (affichée)', 'non'),
      K(4, 'VSB', 'VS bug', 'SLAVE', 'non'), K(3, 'IASB', 'IAS bug', 'SLAVE', 'non'), K(2, 'BUG', 'Ref bug control', 'DSBL (FCS seul)', 'contrôle local'), SI2(),
      C2(2, 'VS', 'Référence de vitesse verticale', -20480, 'ft/min', { dec: 0, neg: 'descente', pos: 'montée', ban: 3, val: 7 }),
      C2(4, 'IAS', 'Référence IAS', -512, 'kt', { dec: 1, ban: 2, val: 6 }),
      C2(6, 'MACH', 'Référence de Mach', -1.024, '', { dec: 3, ban: 1, val: 5 })],
    note: 'bit 2 : n’a de sens que si le bit 3 de l’octet 1 de l’adresse A4 vaut 1' };
  D[0x73] = { nom: '+/- DELTA TORQUE REQUEST & PWT STATUS', sys: 'FCS', p: 57, n: 8, desc: 'Demande d’écart de couple et état du power trim', ex: '73 E1 00 04 00 00 00 00',
    champs: [V(7, 'VAL', 'PWT valid'), K(6, 'ACT', 'PWT active', 'actif', 'non'), K(5, 'PLA', 'PLA set', 'manettes bien placées (FADEC)', 'non'), K(4, 'GA', 'GA mode', 'GA', 'non'), SI2(),
      C2(2, 'ΔTQ', 'Demande d’écart de couple', -64, '% couple max', { dec: 2, neg: 'diminuer', pos: 'augmenter', ban: 2, val: 7 })],
    note: 'PWT = power trim ; PLA = angle des manettes' };
  // ── Air data (bus ADC) ───────────────────────────────
  const XSIDE = (court, nom) => K(3, court, nom, 'données baro du côté opposé', 'même côté');
  D[0xA0] = { nom: 'PRESSURE ALTITUDE/BARO ALTITUDE', sys: 'ADS', p: 58, desc: 'Altitude pression et altitude barométrique', ex: 'A0 C1 10 C7 42 C7',
    champs: [V(7, 'PRS', 'Alt pres valid'), V(6, 'BAR', 'Alt baro valid'), K(5, 'PRE', 'Reserved presel (bit 1 de la matrice, bit 2 en A1)'), K(4, 'STR', 'Strut switch', 'au sol', 'en vol'),
      XSIDE('XSD', 'Baro alt (côté)'), T(), SI2(),
      C2(2, 'ALT PRES', 'Altitude pression', -32768, 'ft', { ...ALT_BIAIS, ban: 2, val: 7 }),
      C2(4, 'ALT BARO', 'Altitude barométrique', -32768, 'ft', { ...ALT_BIAIS, ban: 1, val: 6 })],
    note: 'altitudes biaisées de +24 576 ft ; le bit 3 doit être le même dans A0, A7 et A8' };
  D[0xA1] = { nom: 'VERT SPEED/IAS', sys: 'ADS', p: 59, desc: 'Vitesse verticale et vitesse indiquée', ex: 'A1 D1 40 06 00 32',
    champs: [V(7, 'VS', 'Vert speed valid'), V(6, 'IAS', 'IAS valid'), K(5, 'PRE', 'Reserved presel (bit 2 de la matrice)'), V(4, 'ADC', 'ADC valid'), T(), SI2(),
      C2(2, 'VS', 'Vitesse verticale', -20480, 'ft/min', { dec: 0, neg: 'descente', pos: 'montée', ban: 1, val: 7 }),
      C2(4, 'IAS', 'Vitesse indiquée', -512, 'kt', { dec: 1, ban: 2, val: 6 })],
    note: 'ADC valid peut être forcé à 0 quand le bouton de présélection d’altitude tourne' };
  D[0xA2] = { nom: 'TAS/ISA DELTA TEMP', sys: 'ADS', p: 60, desc: 'Vitesse vraie et écart de température ISA', ex: 'A2 C1 80 25 40 01',
    champs: [V(7, 'TAS', 'TAS valid'), V(6, 'ISA', 'ISA valid'), K(4, 'STR', 'Strut switch', 'au sol', 'en vol'), T(), SI2(),
      C2(2, 'TAS', 'Vitesse vraie (TAS)', -1024, 'kt', { dec: 1, ban: 2, val: 7 }),
      C2(4, 'ΔISA', 'Écart ISA', -512, '°C', { dec: 2, ban: 1, val: 6 })] };
  D[0xA3] = { nom: 'MACH', sys: 'ADS', p: 61, desc: 'Mach affiché et Mach vrai', ex: 'A3 C1 80 61 80 61',
    champs: [V(7, 'DSP', 'Mach display valid'), V(6, 'TRU', 'Mach true valid'), K(4, 'DSP', 'Mach display', 'TRUE', 'affiché'), T(), SI2(),
      C2(2, 'M AFF', 'Mach affiché', -1.024, '', { dec: 3, ban: 2, val: 7 }), C2(4, 'M VRAI', 'Mach vrai', -1.024, '', { dec: 3, ban: 1, val: 6 })] };
  D[0xA4] = { nom: 'VS/IAS BUGS', sys: 'ADS', p: 62, desc: 'Index de vitesse verticale et de vitesse indiquée', ex: 'A4 C9 40 06 00 32',
    champs: [K(7, 'VSD', 'VS ref bug', 'affiché', 'non'), K(6, 'IASD', 'IAS ref bug', 'affiché', 'non'), K(5, 'VSA', 'VS ref bug', 'réglage actif', 'non'), K(4, 'IASA', 'IAS ref bug', 'réglage actif', 'non'),
      K(3, 'STAT', 'VS/IAS status', 'bugs disponibles en permanence', 'bugs du FCS, pas en permanence'), T(), SI2(['non utilisé (pas d’adresse 72 valide)', '#1', '#2', '#3']),
      C2(2, 'VS BUG', 'Index de vitesse verticale', -20480, 'ft/min', { dec: 0, neg: 'descente', pos: 'montée', ban: 1 }),
      C2(4, 'IAS BUG', 'Index de vitesse indiquée', -512, 'kt', { dec: 1, ban: 2 })],
    note: 'source ident retransmis depuis l’adresse 72' };
  D[0xA6] = { nom: 'SAT, VMO/MMO', sys: 'ADS', p: 63, desc: 'Température statique et vitesse maximale permise', ex: 'A6 C1 00 F6 80 3E',
    champs: [V(7, 'SAT', 'SAT valid'), V(6, 'VMO', 'VMO/MMO valid'), K(5, 'OVS', 'Overspeed warn', 'ON', 'OFF'), K(4, 'OVT', 'Overspeed test', 'ON', 'OFF'), T(), SI2(),
      C2(2, 'SAT', 'Température statique (SAT)', -512, '°C', { dec: 2, ban: 1, val: 7 }), C2(4, 'VMO', 'Vitesse max permise (VMO/MMO)', -512, 'kt', { dec: 1, ban: 2, val: 6 })] };
  D[0xA7] = { nom: 'TAT/PRESEL ALTITUDE', sys: 'ADS', p: 64, desc: 'Température totale et altitude présélectée', ex: 'A7 C1 00 FB E0 CE',
    champs: [V(7, 'TAT', 'TAT valid'), V(6, 'PRE', 'Pre alt valid'), K(5, 'ALR', 'Alt alert', 'ALERT', 'non'), K(4, 'KNB', 'Reserved alts knob'), XSIDE('XSD', 'Pre sel (côté)'), T(), SI2(),
      C2(2, 'TAT', 'Température totale (TAT)', -512, '°C', { dec: 2, ban: 1, val: 7 }), C2(4, 'ALT SEL', 'Altitude présélectée', -32768, 'ft', { ...ALT_BIAIS, ban: 2, val: 6 })] };
  D[0xA8] = { nom: 'MMO/BARO SET', sys: 'ADS', p: 65, desc: 'Mach max permis et calage altimétrique', ex: 'A8 C1 80 66 AE 77',
    champs: [V(7, 'MMO', 'MMO valid'), V(6, 'BAR', 'Baro valid'), K(5, 'UNI', 'In Hg / mb sel', 'mb', 'in Hg'), XSIDE('XSD', 'Baro set (côté)'), T(), SI2(),
      C2(2, 'MMO', 'Mach max permis (MMO)', -1.024, '', { dec: 3, ban: 1, val: 7 }),
      C2(4, 'BARO', 'Calage altimétrique', -32, 'inHg', { dec: 2, ban: 2, val: 6, unite: o => (o[1] >> 5) & 1 ? { msb: -1084, unit: 'mb', dec: 0 } : null })],
    note: 'calage : bit de poids fort = 32.0 inHg ou 1084 mb selon le bit 5 de l’octet 1' };
  const CHOIX_MKR = ['VR', 'VF', 'V1', 'V2', 'VREF', 'MARKER A', 'MARKER B', 'FCS MACH REF'];
  D[0xAC] = { nom: 'SECONDARY IAS/MACH REFERENCE MARKERS', sys: 'ADS', p: 68, desc: 'Repères de vitesse secondaires (VR, V1, V2, VREF…)', ex: 'AC C1 23 00 00 1E',
    champs: [K(7, 'DSP', 'Markers display', 'ON', 'OFF'), K(6, 'ADJ', 'Markers adjust', 'ON', 'OFF'), K(5, 'I/M', 'IAS/Mach', 'Mach', 'IAS'), T(), SI2(),
      K(7, 'TYP', 'Marker type', 'ligne ou autre symbole', 'bug', 2), E([[2, 6, 4]], 'SEL', 'Repère choisi', CHOIX_MKR), E([[2, 2, 0]], 'COUL', 'Couleur', COULEURS),
      C2(4, 'MKR', 'Valeur du repère', -512, 'kt', { dec: 1, ban: 2, unite: o => (o[1] >> 5) & 1 ? { msb: -1.024, unit: '', dec: 3 } : null })] };
  D[0xAD] = { nom: 'LOW SPEED CUE AND SECONDARY IAS/MACH RANGE MARKERS', sys: 'ADS', p: 69, desc: 'Repère de basse vitesse et plages de vitesse secondaires', ex: 'AD 81 04 50 C0 17',
    champs: [K(7, 'DSP', 'Marker display', 'ON', 'OFF'), K(6, 'RSVD', 'Reserved'), K(5, 'I/M', 'IAS/Mach', 'Mach', 'IAS'), T(), SI2(),
      K(7, 'TYP', 'Marker type (sens selon la sélection, note 4)', '1 : valeur seule « tick » (losange APPR si 010)', '0 : bande ou plage', 2),
      E([[2, 6, 4]], 'SEL', 'Plage choisie', ['VS MIN', 'VS MAX', 'VS APPR MKR', 'VMKR1', 'VMKR2', 'VMKR3', 'VMKR4', 'VMKR5']), E([[2, 2, 0]], 'COUL', 'Couleur', COULEURS),
      { t: 'ad3', p: [[3, 7, 0]], court: 'MULT/LONG', nom: 'Multiplicateur ou longueur du repère', ban: 1 },
      C2(4, 'VS/TOP', 'VS min-max ou haut du repère', -512, 'kt', { dec: 1, ban: 2, unite: o => (o[1] >> 5) & 1 ? { msb: -1.024, unit: '', dec: 3 } : null })],
    note: 'octet 3 : multiplicateur de VS (1.0 nominal pour 000, 1.3 pour 001 et 010, poids fort 1.6) ou longueur du repère (poids fort 128 kt ou 0.128 Mach)' };
  D[0xAF] = { nom: 'AIR DATA CONTROL & STATUS', sys: 'ADS', p: 70, n: 8, desc: 'Commandes vers la centrale anémobarométrique (incréments de calage, présélection, références)', ex: 'AF C0 00 01 00 00 00 00',
    champs: [V(7, 'ALI', 'ALI flag'), V(6, 'ASI', 'ASI flag'), K(5, 'ABS', 'A/S ref control', 'ABS', 'non'), K(4, 'OVS', 'Overspeed warn', 'TEST', 'non'), K(3, 'SI2', 'Reserved SI2'), T(),
      K(1, 'SI1', 'Reserved SI1'), K(0, 'SI0', 'Reserved SI0'),
      K(7, 'VSR', 'VS ref on/off', 'CHNG', 'non', 2), K(6, 'ASR', 'A/S ref on/off', 'CHNG', 'non', 2), K(5, 'PRS', 'Alt presel', 'CNCL', 'non', 2), K(4, 'BUN', 'Baro units', 'mb', 'in Hg', 2),
      K(3, 'INC', 'A/S ref incr', 'CHNG', 'non', 2), K(2, 'STD', 'Baro std', 'SET', 'non', 2), K(1, 'ASM', 'Reserved A/S mode', 'oui', 'non', 2), K(0, 'FL180', 'FL180 annunciation', 'DSBL', 'non', 2),
      { t: 'c2', p: [[3, 7, 0]], court: 'BARO±', nom: 'Incrément du calage', msb: -128, unit: 'pas', dec: 0, ban: 4 },
      { t: 'c2', p: [[4, 7, 0]], court: 'ALT±', nom: 'Incrément de l’altitude présélectée', msb: -128, unit: 'pas', dec: 0, ban: 3 },
      { t: 'c2', p: [[5, 7, 0]], court: 'A/S±', nom: 'Incrément de la référence IAS/Mach', msb: -128, unit: 'pas', dec: 0, ban: 2 },
      { t: 'c2', p: [[6, 7, 0]], court: 'VS±', nom: 'Incrément de la référence VS', msb: -128, unit: 'pas', dec: 0, ban: 1 },
      K(3, '429', '429 bus', 'ABNORM (altimètre du côté opposé affiché)', 'normal', 7), { t: 'bin', p: [[7, 2, 0]], court: 'ABS SEL', nom: 'Abs A/S ref sel (position)', msb: 4, unit: '', dec: 0 }] };
  // ── Navigation verticale (bus VNI) ───────────────────
  D[0xB0] = { nom: 'PITCH CMD/VERTICAL DEV', sys: 'VNAV', p: 71, desc: 'Commande de tangage et écart vertical VNAV', ex: 'B0 C6 00 FB 00 FE',
    champs: [V(7, 'PIT', 'Pitch cmd valid'), V(6, 'VRT', 'Vert dev valid'), K(5, 'CLR', 'Reserved vert clr'), K(4, 'STB', 'VNAV state', 'STBY', 'non'),
      K(3, 'CAP', 'FCS VNAV', 'CAP (5 répétitions)', 'non'), K(2, 'ENB', 'VNAV enable', 'ON (mode VNAV permis)', 'non'),
      K(1, 'LRU', 'LRU ident (sangle)', 'côté 2', 'côté 1'), K(0, 'ORG', 'Data origin (bit 0 de C5 ou C8)', '1', '0'),
      C2(2, 'PITCH', 'Commande de tangage (VNI/LRN)', -90, '°', { dec: 2, neg: 'FLY DOWN', pos: 'FLY UP', ban: 1, val: 7 }),
      C2(4, 'V DEV', 'Écart vertical (VNI/LRN)', -8192, 'ft', { dec: 0, neg: 'FLY UP', pos: 'FLY DOWN', ban: 2, val: 6 })] };
  D[0xB1] = { nom: 'DISTANCE TO TRK/ALT', sys: 'VNAV', p: 72, desc: 'Distance jusqu’à l’altitude ou la route, et décalage choisi', ex: 'B1 E1 00 0A 00 00',
    champs: [V(7, 'ALT', 'Dist alt valid'), V(6, 'TRK', 'Dist trk valid'), V(5, 'OFS', 'Offset set valid'), K(4, 'SEL', 'FCS VNAV', 'SEL', 'non'), K(3, 'CAP', 'VNAV state', 'CAP', 'non'), T(),
      ...LRU('Data origin (bit 0 de C8, sinon bit 1)'),
      C2(2, 'DIST', 'Distance jusqu’à l’altitude ou la route', -2048, 'NM', { dec: 2, ban: 2, val: 7 }),
      C2(4, 'OFFSET', 'Décalage choisi', -2048, 'NM', { dec: 2, neg: 'avant (BEFORE)', pos: 'après', ban: 1, val: 5 })] };
  D[0xB2] = { nom: 'SEL ANGLE/COMP ANGLE', sys: 'VNAV', p: 73, desc: 'Angle vertical choisi et angle vertical calculé', ex: 'B2 C1 00 FA 00 FB',
    champs: [V(7, 'SEL', 'Sel angle valid'), V(6, 'CMP', 'Comp angle valid'), K(3, 'ARM', 'Angle mode', 'ARM', 'non'), T(), ...LRU('Data origin (bit 0 de C8, sinon bit 1)'),
      C2(2, 'SEL', 'Angle vertical choisi', -90, '°', { dec: 2, ban: 2, val: 7 }), C2(4, 'COMP', 'Angle vertical calculé', -90, '°', { dec: 2, ban: 1, val: 6 })] };
  D[0xB3] = { nom: 'AIMPOINT ALT/VS SELECT', sys: 'VNAV', p: 74, desc: 'Altitude du point visé et vitesse verticale choisie', ex: 'B3 C1 10 C7 C0 F9',
    champs: [V(7, 'AMP', 'Alt aimpoint valid'), V(6, 'VS', 'VS sel valid'), K(5, 'SCL', 'VNAV scale', 'ENABL', 'non'), K(4, 'ELV', 'Elev corr', 'correction oblique calculée par le VNI', 'non'),
      K(3, 'ARM', 'VS sel mode', 'ARM', 'non'), T(), ...LRU('Data origin (bit 0 de C8, sinon bit 1)'),
      C2(2, 'ALT', 'Altitude du point visé', -32768, 'ft', { ...ALT_BIAIS, ban: 2, val: 7 }),
      C2(4, 'VS', 'Vitesse verticale choisie', -20480, 'ft/min', { dec: 0, neg: 'descente', pos: 'montée', ban: 1, val: 6 })] };
  // ── EFIS (bus DPU et MPU) ────────────────────────────
  const DEV_SRC = o => [E([[o, 7, 6]], 'SRC', 'Source (#)', ['non utilisé', '#1', '#2', '#3']), E([[o, 5, 4]], 'ÉCH', 'Échelle', ['non définie', '1 MI/DOT', '5 MI/DOT', '10 MI/DOT']),
    E([[o, 3, 0]], 'TYPE', 'Type de source', ['non utilisé', 'VOR/LOC & GLS', 'réservé', 'LNAV & VNAV', 'MAZ & MGP', 'ADF', 'GPS', 'RNAV', 'TACAN', 'spare', 'spare', 'spare', 'spare', 'spare', 'spare', 'spare'])];
  D[0xC0] = { nom: 'EFIS CONTROL & STATUS', sys: 'EFIS', p: 75, desc: 'État de l’EFIS, sources d’écart active et preset, affichages', ex: 'C0 82 11 22 48 03',
    champs: [K(7, 'STS', 'EFIS status', 'NORM', 'anormal'), K(6, 'MOD', 'Reserved EFIS mode'), K(5, 'DRL', 'Drive left', 'XFR', 'non'), K(4, 'DRR', 'Drive right', 'XFR', 'non'),
      T(2, 'TST', 'Test (EFIS en test)'), E([[1, 1, 0]], 'LRU', 'LRU ident', ['DPU côté 1', 'MPU gauche', 'DPU côté 2', 'MPU droit'], 'si'),
      ...DEV_SRC(2).map(f => ({ ...f, nom: 'Source active : ' + f.nom.toLowerCase(), ban: f.court === 'TYPE' ? 3 : undefined })),
      ...DEV_SRC(3).map(f => ({ ...f, nom: 'Source preset : ' + f.nom.toLowerCase() })),
      K(7, 'NAVP', 'NAV pulse (nouvelle source en C2/C4)', 'impulsion', 'non', 4), K(6, 'GS', 'GS display', 'ON', 'OFF', 4), K(5, 'VNAV', 'VNAV display', 'ON', 'OFF', 4),
      K(4, 'V-B', 'V-bar / cross-pointer', 'V-BAR', 'cross-pointer', 4), K(3, 'FD', 'FD display', 'ON', 'OFF', 4), { ...MARQUEURS, p: [[4, 2, 0]], ordre: 'OMI', ban: 1 },
      K(7, 'VNVP', 'V-NAV clear pulse', 'impulsion', 'non', 5), K(2, 'RSVD', 'Reserved', 'oui', 'non', 5),
      E([[5, 1, 0]], 'CAT II', 'Annonce catégorie II', ['non choisie', 'jaune/rouge clignotant', 'jaune/rouge fixe', 'vert fixe']),
    ],
    note: 'NAV pulse : 1 pendant 2 à 5 émissions quand C2/C4 changent de source ; GS display = état du GS du même côté que C4' };
  const ST_EFIS = (v7, v6, x = []) => [V(7, v7[0], v7[1]), V(6, v6[0], v6[1]), ...x, ...LRU()];
  D[0xC1] = { nom: 'HDG/HDG ERROR', sys: 'EFIS', p: 77, desc: 'Cap (magnétique ou vrai) et erreur de cap', ex: 'C1 C2 00 20 00 F8',
    champs: [...ST_EFIS(['HDG', 'Heading valid'], ['ERR', 'Heading error valid'], [K(5, 'M/T', 'Mag/true', 'vrai', 'magnétique')]),
      C2(2, 'HDG', 'Cap', -180, '°', { dec: 2, cap: true, ban: 2, val: 7 }),
      C2(4, 'HDG ERR', 'Erreur de cap (cap avion − cap choisi)', -180, '°', { dec: 2, ban: 1, val: 6 })],
    note: 'les bits d’identification ne changent pas si le cap du côté opposé est affiché' };
  D[0xC2] = { nom: 'CRS ERROR (ACTIVE/NEXT)', sys: 'EFIS', p: 78, desc: 'Erreur de route active et suivante', ex: 'C2 C2 00 F8 00 00',
    champs: [...ST_EFIS(['ACT', 'Active course valid'], ['PRE', 'Preset course valid']),
      C2(2, 'ACT ERR', 'Erreur de route active (cap − route choisie)', -180, '°', { dec: 2, ban: 2, val: 7 }),
      C2(4, 'NXT ERR', 'Erreur de route suivante (réservé)', -180, '°', { dec: 2, ban: 1, val: 6 })],
    note: 'équipements anciens : données pour ACTIVE seulement, PAD pour NEXT' };
  D[0xC3] = { nom: 'RADIO ALT/DH', sys: 'EFIS', p: 79, desc: 'Radio-altitude et hauteur de décision choisie', ex: 'C3 C2 D0 07 40 06',
    champs: [V(7, 'RA', 'Rad alt valid (discret d’entrée)'), K(6, 'ONS', 'On scale', 'ON', 'OFF'), K(5, 'DH', 'DH', 'TRIP (atteinte)', 'non'), T(2, 'RAT', 'RA test (radioaltimètre en test)'), ...LRU(),
      C2(2, 'RA', 'Radio-altitude', -4096, 'ft', { dec: 1, ban: 2, val: 7, banLabel: 'RADIO ALT' }), C2(4, 'DH', 'Hauteur de décision', -4096, 'ft', { dec: 0, ban: 1 })],
    note: 'bit 7 : état du discret radioaltimètre, presque toujours 1 s’il est alimenté ; bit 6 : amplitude de la donnée analogique' };
  const DEV_FCS = (nom, p) => ({ nom, sys: 'EFIS', p, desc: 'Écarts latéral et vertical du FCS (' + (p === 80 ? 'source active' : 'source suivante') + ')', ex: (p === 80 ? 'C4' : 'C5') + ' C2 00 F0 00 08',
    champs: [V(7, 'LAT', 'Lat dev valid'), V(6, 'VRT', 'Vert dev valid'), K(5, 'TYP', 'Dev type', 'linéaire', 'LOC ou VOR angulaire'), K(4, 'BC', 'Back loc', 'ON', 'OFF'),
      K(3, 'DLY', 'Delayed ILS (LOC choisi au menu et NAV sur LOC)', 'oui', 'non'), ...LRU(),
      C2(2, 'LAT', 'Écart latéral', -8, 'dots', { dec: 3, neg: 'FLY RIGHT', pos: 'FLY LEFT', ban: 2, val: 7 }),
      C2(4, 'VERT', 'Écart vertical', -8, 'dots', { dec: 3, neg: 'FLY UP', pos: 'FLY DOWN', ban: 1, val: 6 })],
    note: '75 mV par point ; résolution limitée à 12 bits pour les entrées analogiques de l’EFIS' + (p === 81 ? ' ; équipements anciens : tout PAD sauf l’octet 0' : '') });
  D[0xC4] = DEV_FCS('FCS LATERAL/VERTICAL DEVIATIONS (ACTIVE)', 80);
  D[0xC5] = DEV_FCS('FCS LATERAL/VERTICAL DEVIATIONS (NEXT)', 81);
  D[0xC6] = { nom: 'NAV ROLL/PITCH CMDS (ACTIVE)', sys: 'EFIS', p: 82, desc: 'Commandes de roulis et de tangage du navigateur', ex: 'C6 F2 00 08 00 FC',
    champs: [V(7, 'ROL', 'Roll cmd valid'), V(6, 'PIT', 'Pitch cmd valid'), K(5, 'AVR', 'Command avail roll', 'oui (reçu sur le bus LRN)', 'non'), K(4, 'AVP', 'Command avail pitch', 'oui', 'non'),
      K(3, 'CAP', 'Rem cap', 'CAP', 'non'), K(2, 'ARM', 'Rem arm', 'ARM', 'non'), ...LRU(),
      C2(2, 'ROLL', 'Commande de roulis', -90, '°', { dec: 2, neg: 'FLY LEFT', pos: 'FLY RIGHT', ban: 2, val: 7 }),
      C2(4, 'PITCH', 'Commande de tangage', -90, '°', { dec: 2, neg: 'FLY DOWN', pos: 'FLY UP', ban: 1, val: 6 })] };
  D[0xC7] = { nom: 'LOCALIZER/GLIDESLOPE DEVIATIONS', sys: 'EFIS', p: 83, desc: 'Écarts localizer et glide vers l’EFIS (sens capteur)', ex: 'C7 C2 00 F0 00 08',
    champs: [V(7, 'LOC', 'LOC flag'), V(6, 'GS', 'GS flag'), ...LRU(),
      C2(2, 'LOC', 'Écart localizer', -8, 'dots', { dec: 3, neg: 'avion à gauche (FLY RIGHT)', pos: 'avion à droite (FLY LEFT)', ban: 2, val: 7 }),
      C2(4, 'GS', 'Écart glide', -8, 'dots', { dec: 3, neg: 'avion sous le glide (FLY UP)', pos: 'avion au-dessus (FLY DOWN)', ban: 1, val: 6 })],
    note: 'sens capteur : négatif = avion à gauche ou sous l’ILS (barre à droite ou en haut), à l’inverse de l’adresse 22 ; écarts toujours transmis, actifs ou non' };
  D[0xC8] = { nom: 'FCS DISTANCE (ACTIVE/NEXT)', sys: 'EFIS', p: 84, desc: 'Distances active et suivante', ex: 'C8 C2 00 0C 00 19',
    champs: [V(7, 'ACT', 'Active dist valid'), V(6, 'NXT', 'Next dist valid'), K(5, 'ELV', 'Elev corr', 'ON', 'OFF'), K(4, 'HLA', 'DME hold active', 'ON', 'OFF'), K(3, 'HLN', 'DME hold next', 'ON', 'OFF'), ...LRU(),
      C2(2, 'DIST', 'Distance active', -2048, 'NM', { dec: 2, ban: 2, val: 7 }), C2(4, 'NEXT', 'Distance suivante (réservé)', -2048, 'NM', { dec: 2, ban: 1, val: 6 })],
    note: 'complément à 2 sans changer le poids : ±2048 NM, saturer sans changer de signe' };
  D[0xC9] = { nom: 'WIND VELOCITY/DIRECTION', sys: 'EFIS', p: 85, desc: 'Vent (vitesse et direction par rapport au nez)', ex: 'C9 C2 00 03 00 F0',
    champs: [V(7, 'VAL', 'Wind valid'), K(6, 'AVL', 'Wind avail', 'oui (reçu du LRN)', 'non'), ...LRU(),
      C2(2, 'VENT', 'Vitesse du vent', -2048, 'kt', { dec: 1, ban: 2, val: 7 }), C2(4, 'DIR', 'Direction du vent (par rapport au nez)', -180, '°', { dec: 1, ban: 1, val: 7 })] };
  D[0xCA] = { nom: 'SELECTED COURSE (ACTIVE/NEXT)', sys: 'EFIS', p: 86, desc: 'Routes choisies, active et suivante, et TO/FROM', ex: 'CA E2 00 20 00 00',
    champs: [V(7, 'ACT', 'Sel course active valid'), V(6, 'NXT', 'Sel course next valid'), E([[1, 5, 4]], 'T/F', 'Active course TO/FROM', ['ni l’un ni l’autre', 'FROM', 'TO', 'TO et FROM']), ...LRU(),
      C2(2, 'CRS', 'Route choisie active', -180, '°', { dec: 2, cap: true, ban: 2, val: 7 }), C2(4, 'NEXT', 'Route choisie suivante', -180, '°', { dec: 2, cap: true, ban: 1, val: 6 })] };
  D[0xCB] = { nom: 'EFIS JOYSTICK CURSOR POSITION', sys: 'EFIS', p: 87, desc: 'Position du curseur (distance et relèvement par rapport au nez)', ex: 'CB 80 00 0A 00 10',
    champs: [V(7, 'CUR', 'Cursor valid'), T(), E([[1, 1, 0]], 'RSVD', 'Reserved SI', ['', '', '', ''], 'rsvd'),
      C2(2, 'DIST', 'Distance du curseur', -2048, 'NM', { dec: 2, ban: 2, val: 7 }), C2(4, 'BRG', 'Relèvement du curseur (par rapport au nez)', -180, '°', { dec: 1, ban: 1, val: 7 })],
    note: 'émis à 10/s à chaque appui sur ENTER (2 répétitions sur les anciens, 20 sur les nouveaux)' };
  D[0xCC] = { nom: 'EFIS KEYSWITCH STATUS', sys: 'EFIS', p: 88, desc: 'Touches enfoncées (joystick, touches de côté)', ex: 'CC 80 04 01 00 00',
    champs: [V(7, 'KEY', 'Key data valid'), T(), SI2(),
      { t: 'msgs', octs: [2], noms: { 2: { 3: 'LEFT', 2: 'DOWN', 1: 'RIGHT', 0: 'UP' } }, court: 'JOY', nom: 'Joystick', ban: 2, actif: 'enfoncée' },
      { t: 'msgs', octs: [3], noms: { 3: { 3: 'TOP', 2: '2ND', 1: '3RD', 0: 'BTM' } }, court: 'DROITE', nom: 'Touches de droite', ban: 1, actif: 'enfoncée' },
      { t: 'msgs', octs: [4], court: 'GAUCHE', nom: 'Touches de gauche (réservé)', actif: 'enfoncée' }, { t: 'msgs', octs: [5], court: 'BAS', nom: 'Touches du bas (réservé)', actif: 'enfoncée' }],
    note: 'émis à 10/s tant qu’une touche est enfoncée' };
  D[0xCD] = { nom: 'HDG/HDG ERROR', sys: 'EFIS', p: 89, desc: 'Cap choisi (index) et cap compas, bus MPU', ex: 'CD C4 00 20 00 1C',
    champs: [V(7, 'BUG', 'Heading bug valid'), V(6, 'SRC', 'Heading source valid'), K(5, 'GA', 'GA mode', 'ON', 'OFF'), K(4, 'XSD', 'FMS port', 'côté opposé', 'même côté'),
      K(3, 'P/S', 'FMS port', 'primaire', 'secondaire'), T(), K(1, 'EFIS', 'EFIS SI', 'côté 2', 'côté 1'), K(0, 'HDG', 'HDG SI', 'côté opposé', 'même côté'),
      C2(2, 'SEL', 'Cap choisi (index)', -180, '°', { dec: 2, cap: true, ban: 1, val: 7 }), C2(4, 'HDG', 'Cap compas', -180, '°', { dec: 2, cap: true, ban: 2, val: 6 })],
    note: 'cap compas et cap choisi toujours tels qu’affichés' };
  D[0xCE] = { nom: 'MINIMUM & MAXIMUM STALL SPEEDS', sys: 'EFIS', p: 90, desc: 'Vitesses de décrochage : haut du rouge et haut du jaune', ex: 'CE C1 00 0E 80 0F',
    champs: [V(7, 'AOA', 'Alpha n valid'), V(6, 'IAS', 'IAS valid'), K(5, 'XADC', 'Xside ADC', 'côté opposé', 'même côté'), K(4, 'XAOA', 'Xside alpha n', 'côté opposé', 'même côté'), SI2(),
      C2(2, 'VS MIN', 'VS minimum (haut du rouge)', -512, 'kt', { dec: 1, ban: 1, val: 7 }), C2(4, 'VS MAX', 'VS maximum (haut du jaune)', -512, 'kt', { dec: 1, ban: 2, val: 7 })] };
  // ── Commandes de vol : annonces et modes (8 octets, sans statut) ──
  D[0xAA] = { nom: 'FCS ANNUNCIATIONS', sys: 'FCS', p: 66, n: 8, sansStatut: true, desc: 'Annonces du système de commandes de vol (1 = mode allumé)', ex: 'AA 50 08 00 20 00 00 00',
    champs: [{ t: 'msgs', octs: [1, 2, 3, 4, 5, 6, 7], court: 'FCS', nom: 'Annonces allumées', ban: 1, actif: 'ON', noms: {
      1: { 7: 'GS EXT', 6: 'GS CAP', 5: 'GS ARM', 4: 'NAV-1 CAP', 3: 'NAV-1 ARM', 2: 'SPD HOLD', 1: 'ALT PRESEL CAP/TRK', 0: 'ALT PRESEL ARM' },
      2: { 7: 'APP CAP', 6: 'APP ARM', 5: 'SYNC SWITCH', 4: 'REPORT CODE BAD', 3: 'ALT HOLD', 2: 'IAS HOLD', 1: 'MACH HOLD', 0: 'TST' },
      3: { 7: 'VS', 6: 'CLI', 5: 'GO ARND PTCH', 4: 'GO ARND ROLL', 3: 'PTCH', 2: 'ROLL', 1: 'VNAV CAP', 0: 'VNAV ARM' },
      4: { 7: 'BC', 6: 'DR', 5: 'HEADING SEL', 4: 'HEADING HLD', 3: 'TRB', 2: 'XFR', 1: 'DESCENT', 0: 'HLF' },
      5: { 7: 'NAV-2 CAP', 6: 'NAV-2 ARM', 5: 'UNUSED', 4: 'ARM WARN', 3: 'ALT PRESEL CAP', 2: 'ALT PRESEL TRK', 1: 'XCHAN SYNC', 0: 'CERT' },
      6: { 7: 'RADIO CPLE', 6: 'OUT OF TRIM RUD', 5: 'OUT OF TRIM AIL', 4: 'OUT OF TRIM ELE', 3: 'DISCONNECT YD', 2: 'DISCONNECT AP', 1: 'TRIM FAIL PITCH', 0: 'TRIM FAIL YAW' },
      7: { 2: 'NAC TST', 1: 'V-BAR INVUE', 0: 'STR VLD' } } }],
    note: 'l’octet 1 porte des annonces, pas un statut ; octet 7 bits 7-3 : spares' };
  D[0xAB] = { nom: 'FCS MODES', sys: 'FCS', p: 67, n: 8, sansStatut: true, desc: 'Modes du système de commandes de vol et masse de l’avion', ex: 'AB 22 00 00 00 00 40 10',
    champs: [K(7, 'SYNC', 'HDG bug sync (1 s)', 'SYNC', 'non'), K(6, 'FD', 'FD annunciation', 'DSBL', 'non'), K(5, 'STBY', 'Standby mode', 'ON', 'OFF'),
      K(4, 'ROLL', 'Roll steer', 'INVIEW', 'non'), K(3, 'PTCH', 'Pitch steer', 'INVIEW', 'non'),
      E([[1, 2, 0]], 'MASSE', 'Masse de l’avion (HVY · MED · LIT)', ['aucune', 'LIT', 'MED', 'MED + LIT', 'HVY', 'HVY + LIT', 'HVY + MED', 'HVY + MED + LIT']),
      { t: 'msgs', octs: [2, 3, 4, 5], court: 'TBD', nom: 'Spares du FCS (à définir)', actif: '1' },
      K(7, 'LVL', 'Level', 'ON', 'OFF', 6), K(6, 'ALTA', 'Alt arm', 'ON', 'OFF', 6),
      { t: 'msgs', octs: [7], court: 'MODES', nom: 'Modes allumés', ban: 1, actif: 'ON', noms: { 7: { 7: 'REVERSE', 6: 'GA', 5: 'ENGAGE Y/D', 4: 'ENGAGE A/P', 3: 'SOFT RIDE', 2: 'DESCENT', 1: 'TRIM RUN', 0: 'A/P FAIL' } } }],
    note: 'l’octet 1 porte des modes, pas un statut' };
  // ── Universels (tous les bus) ────────────────────────
  D[0xF3] = { nom: 'UNIVERSAL DIAGNOSTICS', sys: 'Tous', p: 91, n: [6, 8], desc: 'Diagnostics du boîtier émetteur (messages de 1 bit et code de panne)', ex: 'F3 11 00 04 00 27',
    champs: n => [E([[1, 7, 6]], 'COND', 'Condition (définie par le concepteur)', ['0', '1', '2', '3']), K(4, 'FLT', 'Fault detect', 'FLT', 'non'),
      SI3(['non utilisé', '#1', '#2', '#3', 'propre au boîtier', 'propre au boîtier', 'propre au boîtier', 'propre au boîtier']), T(2, 'SLF', 'Self test'),
      { t: 'msgs', octs: Array.from({ length: n - 3 }, (_, i) => i + 2), court: 'MSG', nom: 'Messages de diagnostic (0 = normal)', actif: 'actif', ban: 1, numeros: true },
      { t: 'bcd', ch: [[n - 1, 7, 4, 10], [n - 1, 3, 0, 1]], court: 'CODE', nom: 'Code de panne', dec: 0, unit: '', ban: 2, pad2: true }],
    note: 'sens des messages défini par chaque boîtier ; bus à 8 octets : 40 bits de messages et code de panne en octet 7' };
  D[0xF5] = { nom: 'UNIVERSAL ASCII PAGE DATA', sys: 'Tous', p: 93, n: [6, 8], sansStatut: true, desc: 'Page de texte (ligne, colonne et caractères ASCII)', ex: 'F5 21 4E 41 56 31',
    champs: n => [{ t: 'bin', p: [[1, 7, 5]], court: 'LIGNE', nom: 'Ligne', msb: 4, unit: '', dec: 0, ban: 1 }, { t: 'bin', p: [[1, 4, 0]], court: 'COLONNE', nom: 'Colonne', msb: 16, unit: '', dec: 0, ban: 2 },
      { t: 'ascii', octs: Array.from({ length: n - 2 }, (_, i) => i + 2), bits: 8, court: 'CAR', nom: `Texte (${n - 2} caractères)`, ban: 3 }],
    note: 'bus à 8 octets : 6 caractères (octets 2 à 7)' };
  D[0xA5] = { nom: 'SYNC', sys: 'Bus', p: 8, sync: true, desc: 'Bloc de synchronisation : « A5 » répété sur toute la longueur du bloc, au début de chaque trame', ex: 'A5 A5 A5 A5 A5 A5',
    champs: [], note: 'A5 n’est jamais une adresse de données ; il peut apparaître dans les données, au plus N−1 fois de suite' };
  D[0xFF] = { nom: 'NO USEFUL DATA', sys: 'FCS', p: 21, desc: 'Bloc de remplissage du bus FCC (adresse illégale pour des données)', ex: 'FF 00 00 00 00 00 00 00', n: 8, champs: [],
    note: 'sur le bus FCC, tous les créneaux sont remplis de données ou de blocs FF' };

  // ── Bus (section 4.3) : quel boîtier émet quelle adresse, et à quelle cadence ──
  const BUS = [
    { nom: 'AHC BUS 1A/1B/1C', sys: 'AHRS', kbps: 50, n: 8, trames: 52, adr: { 0x40: 52, 0x41: 52, 0x42: 5.2, 0x43: 52, 0x47: 5.2, 0xF3: 5.2, 0xF5: 5.2 } },
    { nom: 'MCS BUS 1', sys: 'Compas magnétique', kbps: 12.5, n: 6, trames: 20, adr: { 0x46: 20 } },
    { nom: 'ADC BUS 1A/1B/1C', sys: 'Air data', kbps: 12.5, n: 6, trames: 20, adr: { 0xA0: 20, 0xA1: 20, 0xA2: 20, 0xA3: 10, 0xA4: 10, 0xA6: 10, 0xA7: 10, 0xA8: 10, 0xAC: 10, 0xAD: 10, 0xF3: 10, 0xF5: 10 } },
    { nom: 'ADC INPUT CONTROL', sys: 'Air data', kbps: 12.5, n: 8, trames: 10, adr: { 0xAF: 10 } },
    { nom: 'ATC CTL BUS 1A/1B', sys: 'ATC', kbps: 12.5, n: 6, trames: 10, adr: { 0x1E: 10 } },
    { nom: 'ATC TRANSPONDER BUS 1', sys: 'ATC', kbps: 12.5, n: 6, trames: 10, adr: { 0x1F: 10, 0xF3: 10 } },
    { nom: 'VHF COMM CTL BUS 1A/1B', sys: 'VHF COMM', kbps: 12.5, n: 6, trames: 10, adr: { 0x10: 10, 0x12: 10 } },
    { nom: 'VHF COMM BUS 1', sys: 'VHF COMM', kbps: 12.5, n: 6, trames: 10, adr: { 0x11: 10, 0x13: 10, 0xF3: 10 } },
    { nom: 'DPU BUS 1A', sys: 'EFIS', kbps: 12.5, n: 6, trames: 10, adr: { 0xC0: 10, 0xC1: 10, 0xC2: 10, 0xC3: 10, 0xC4: 10, 0xC5: 10, 0xC6: 10, 0xC7: 10, 0xC8: 10, 0xC9: 10, 0xCA: 10, 0xCE: 10, 0xB0: 10, 0xF3: 10 } },
    { nom: 'MPU BUS 1', sys: 'EFIS', kbps: 12.5, n: 6, trames: 10, adr: { 0xCB: 10, 0xCC: 10, 0xCD: 10, 0xA7: 10, 0xF3: 10 } },
    { nom: 'FCC BUS 1 OU 2', sys: 'FCS', kbps: 12.5, n: 8, trames: 10, adr: { 0xAA: 10, 0xAB: 10, 0x2A: 10, 0x70: 10, 0x72: 10, 0x73: 10, 0xF3: '0 ou 10', 0xFF: '0 ou 10' } },
    { nom: 'FGC BUS 1', sys: 'FCS (modes et annonces seulement)', kbps: 12.5, n: 8, trames: 10, adr: { 0xAA: 10, 0xAB: 10 } },
    { nom: 'ADF BUS 1A/1B', sys: 'ADF', kbps: 12.5, n: 6, trames: 10, adr: { 0x2B: 10, 0xF3: 10 } },
    { nom: 'ADF CTL BUS 1', sys: 'ADF', kbps: 12.5, n: 6, trames: 10, adr: { 0x2C: 10 } },
    { nom: 'CDU BUS 1A/1B', sys: 'FMS ou navigateur long-courrier', kbps: 12.5, n: 6, trames: 20, adr: { 0x30: 'rafale', 0x31: 'rafale', 0x32: 'rafale', 0x33: 'rafale', 0x34: 'rafale', 0x39: 'rafale', 0x3A: 'rafale', 0xF3: '0 ou 20' } },
    { nom: 'DME BUS 1A/1B', sys: 'DME', kbps: 12.5, n: 6, trames: 10, adr: { 0x25: 10, 0x26: 5, 0x27: 5, 0xF3: 5, 0xF5: 5 } },
    { nom: 'NAV CTL BUS 1A/1B', sys: 'VHF NAV', kbps: 12.5, n: 6, trames: 10, adr: { 0x20: 10, 0x24: 10 } },
    { nom: 'NAV BUS 1A/1B', sys: 'VHF NAV', kbps: 12.5, n: 6, trames: 10, adr: { 0x21: 10, 0x22: 10, 0xF3: 10, 0xF5: 10 } },
    { nom: 'VNI BUS 1', sys: 'VNAV', kbps: 12.5, n: 6, trames: 10, adr: { 0xB0: 10, 0xB1: 10, 0xB2: 10, 0xB3: 10 } },
  ];

  // ── Adresses sans définition détaillée (index de la section 4.2) ──
  const INDEX = { 0x00: 'NOT USED — adresse illégale pour des données', 0x01: 'RESERVED FOR EXTENDED ADDRESSING', 0x23: 'RESERVED', 0x36: 'RESERVED',
    0x39: 'REMOTE HF TUNE, XMIT (RSVD)', 0x3A: 'REMOTE HF TUNE, RECV (RSVD)', 0x44: 'RESERVED (AHRS)', 0x45: 'RESERVED (AHRS)', 0x48: 'RESERVED (INERTIAL)', 0x71: 'RESERVED',
    0xA9: 'RESERVED (ALT REPORTING)', 0xCF: 'RESERVED (EFIS)', 0xF0: 'RSVD FLT RECORDER TEST', 0xF1: 'RSVD UNIVERSAL TEST INPUT', 0xF2: 'RSVD UNIVERSAL TEST OUTPUT', 0xF4: 'RESERVED' };
  const PLAGES = [[0x02, 0x0F, 'UNASSIGNED'], [0x14, 0x15, 'UNASSIGNED'], [0x16, 0x19, 'RESERVED'], [0x1A, 0x1D, 'UNASSIGNED'], [0x28, 0x29, 'RESERVED'], [0x2D, 0x2F, 'RESERVED'],
    [0x3B, 0x3F, 'RESERVED'], [0x49, 0x4F, 'RESERVED'], [0x50, 0x6F, 'UNASSIGNED'], [0x74, 0x9F, 'UNASSIGNED'], [0xB4, 0xBF, 'RESERVED'], [0xD0, 0xEF, 'UNASSIGNED'], [0xF6, 0xFE, 'UNASSIGNED']];
  const indexDe = a => INDEX[a] || (PLAGES.find(([d, f]) => a >= d && a <= f) || [])[2] || null;

  window.CSDB_DEFS = D;
  window.CSDB_BUS = BUS;
  window.CSDB_INDEX = indexDe;
})();
