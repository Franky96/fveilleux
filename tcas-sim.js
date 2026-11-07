/* Rencontre TCAS : moteur de la simulation (aucun affichage ici ; tcas.html s'en sert).
   D'après le sous-module 4.2 « Fonctionnement détaillé » du cours Systèmes avioniques à impulsions (AEC avionique, ÉNA)
   et les seuils du TCAS II version 7.1. Toute la rencontre est calculée d'avance, image par image (pas de 0,1 s), avec la liste
   des messages échangés : la page n'a plus qu'à la rejouer, et l'on peut avancer ou reculer librement.

   Unités : distances en NM, altitudes en pieds, vitesses verticales en ft/min, temps en secondes.
   Cap en degrés (0 = nord, sens horaire). x vers l'est, y vers le nord. */
(function (racine) {
  'use strict';

  /* ---------- niveaux de sensibilité (SL) : seuils du TCAS II v7.1 ---------- */
  // tau en s, DMOD en NM, ZTHR et ALIM en ft ; null = pas de RA à ce niveau
  const SL = [
    { sl: 2, plage: '0 – 1 000 ft sol', tauTA: 20, tauRA: null, dmodTA: 0.30, dmodRA: null, zthrTA: 850, zthrRA: null, alim: null },
    { sl: 3, plage: '1 000 – 2 350 ft sol', tauTA: 25, tauRA: 15, dmodTA: 0.33, dmodRA: 0.20, zthrTA: 850, zthrRA: 600, alim: 300 },
    { sl: 4, plage: '2 350 – 5 000 ft', tauTA: 30, tauRA: 20, dmodTA: 0.48, dmodRA: 0.35, zthrTA: 850, zthrRA: 600, alim: 300 },
    { sl: 5, plage: '5 000 – 10 000 ft', tauTA: 40, tauRA: 25, dmodTA: 0.75, dmodRA: 0.55, zthrTA: 850, zthrRA: 600, alim: 350 },
    { sl: 6, plage: '10 000 – 20 000 ft', tauTA: 45, tauRA: 30, dmodTA: 1.00, dmodRA: 0.80, zthrTA: 850, zthrRA: 600, alim: 400 },
    { sl: 7, plage: '20 000 – 42 000 ft', tauTA: 48, tauRA: 35, dmodTA: 1.30, dmodRA: 1.10, zthrTA: 850, zthrRA: 700, alim: 600 },
    { sl: 7, plage: 'au-dessus de 42 000 ft', tauTA: 48, tauRA: 35, dmodTA: 1.30, dmodRA: 1.10, zthrTA: 1200, zthrRA: 800, alim: 700 },
  ];
  function niveau(altSol, alt) {
    if (altSol < 1000) return SL[0];
    if (altSol < 2350) return SL[1];
    if (alt < 5000) return SL[2];
    if (alt < 10000) return SL[3];
    if (alt < 20000) return SL[4];
    if (alt < 42000) return SL[5];
    return SL[6];
  }

  /* ---------- scénarios ---------- */
  // A : notre avion (toujours équipé TCAS II, pilote qui suit ses RA). B : l'intrus.
  const SCENARIOS = {
    face: { nom: 'Face à face', desc: 'Deux avions en palier au FL150, sur la même route, en sens inverse.', duree: 160, sol: 0,
      A: { x: -10, y: 0, cap: 90, vit: 300, alt: 15100, vs: 0 }, B: { x: 10, y: 0.12, cap: 270, vit: 300, alt: 15000, vs: 0 } },
    montee: { nom: 'Croisement en montée', desc: 'B, en montée vers 13 000 ft, coupe la route de A en palier à 11 000 ft.', duree: 150, sol: 0,
      A: { x: -8, y: 0.1, cap: 90, vit: 280, alt: 11000, vs: 0 }, B: { x: 0, y: -8, cap: 0, vit: 280, alt: 8000, vs: 1800, autorisee: 13000 } },
    rattrapage: { nom: 'Rattrapage', desc: 'B, plus rapide, rattrape A par l’arrière, à la même altitude.', duree: 170, sol: 0,
      A: { x: -2, y: 0, cap: 90, vit: 250, alt: 13000, vs: 0 }, B: { x: -7, y: -0.1, cap: 90, vit: 400, alt: 13050, vs: 0 } },
    ta: { nom: 'TA seulement', desc: 'Face à face, mais 700 ft d’écart vertical : avertissement de trafic, pas de manœuvre.', duree: 160, sol: 0,
      A: { x: -10, y: 0, cap: 90, vit: 300, alt: 15000, vs: 0 }, B: { x: 10, y: 0.3, cap: 270, vit: 300, alt: 15700, vs: 0 } },
    approche: { nom: 'Basse altitude', desc: 'A en approche, descend vers 600 ft sol ; B traverse à 1 300 ft. Sous 1 000 ft sol (SL 2), le TCAS ne donne pas de RA : seulement un TA.', duree: 150, sol: 0,
      A: { x: -4.5, y: 0, cap: 90, vit: 140, alt: 900, vs: -300, autorisee: 600 }, B: { x: 0.05, y: -4.5, cap: 0, vit: 140, alt: 1300, vs: 0 } },
  };

  const ID = {
    A: { nom: 'A', imm: 'C-GFAB', adr: 0xC01A2B, code: '4521' },
    B: { nom: 'B', imm: 'C-FXKR', adr: 0xC0F3D4, code: '6137' },
  };
  const hex = n => n.toString(16).toUpperCase().padStart(6, '0').replace(/(..)(..)(..)/, '$1 $2 $3');

  /* ---------- simulation ---------- */
  // cfg : { scenario, A: { mode, couv }, B: { mode, couv }, equipB: 'tcas'|'modeS'|'atcrbs', piloteB: 'suit'|'inverse' }
  // mode : 'stby' | 'atc' | 'ta' | 'tara'
  function simuler(cfg) {
    const sc = SCENARIOS[cfg.scenario];
    const DT = 0.1, N = Math.round(sc.duree / DT);
    const av = {};
    for (const k of ['A', 'B']) {
      const p = sc[k];
      av[k] = { k, ...ID[k], x: p.x, y: p.y, cap: p.cap, vit: p.vit, alt: p.alt, vs: p.vs, vsNominale: p.vs, autorisee: p.autorisee ?? p.alt,
        ctrl: cfg[k], equip: k === 'A' ? 'tcas' : cfg.equipB,
        pilote: { mode: 'normal', cible: p.vs, debut: 0, accel: 0.1 },
        tcas: { suivi: false, etat: 'clair', ra: null, interdit: null, dernierBc: -99, dernierRaBc: -99, raT0: null, dernierAural: null, coordAvec: false } };
    }
    const modeS = a => a.equip !== 'atcrbs';
    const xpdrOn = a => a.ctrl.mode !== 'stby';
    const tcasOn = a => a.equip === 'tcas' && (a.ctrl.mode === 'ta' || a.ctrl.mode === 'tara') && xpdrOn(a);
    const altSol = a => a.alt - sc.sol;
    const msgs = [], images = [], evts = [];
    const msg = (t, m) => msgs.push({ t, ...m });
    const evt = (t, qui, type, texte) => evts.push({ t, qui, type, texte });

    const vitesses = a => [a.vit / 3600 * Math.sin(a.cap * Math.PI / 180), a.vit / 3600 * Math.cos(a.cap * Math.PI / 180)];
    function geometrie(o, i) {
      const dx = i.x - o.x, dy = i.y - o.y, r = Math.hypot(dx, dy);
      const [vxo, vyo] = vitesses(o), [vxi, vyi] = vitesses(i);
      const rdot = r > 1e-6 ? (dx * (vxi - vxo) + dy * (vyi - vyo)) / r : 0;   // NM/s (< 0 : rapprochement)
      const h = i.alt - o.alt, hdot = (i.vs - o.vs) / 60;                         // ft, ft/s
      const releve = ((Math.atan2(dx, dy) * 180 / Math.PI - o.cap) % 360 + 540) % 360 - 180;   // relèvement relatif, ° (0 = devant)
      return { r, rdot, h, hdot, releve };
    }
    // altitude prévue d'un avion à t + dt, s'il prend une vitesse verticale « cible » après « retard » secondes
    const prevue = (a, dt, cible, retard) => {
      if (cible == null) return a.alt + a.vs / 60 * dt;
      const d = Math.min(dt, retard), reste = Math.max(0, dt - retard - 2);
      return a.alt + a.vs / 60 * d + (a.vs + cible) / 2 / 60 * Math.min(2, Math.max(0, dt - retard)) + cible / 60 * reste;
    };

    // un cycle du TCAS de « o » envers l'intrus « i » (1 fois par seconde)
    function cycle(t, o, i) {
      const T = o.tcas, g = geometrie(o, i), S = niveau(altSol(o), o.alt);
      const visible = xpdrOn(i);
      // ---- détection : écoute des DF11 / DF17 (Mode S) ou appel général Intermode ATCRBS seulement (whisper-shout)
      if (!T.suivi && visible) {
        if (modeS(i) && g.r <= 30) { T.suivi = true; evt(t, o.k, 'detection', `Le TCAS de ${o.k} capte le squitter DF11 de ${i.k} (adresse ${hex(i.adr)}) et l'ajoute à sa table d'intrus.`); }
        else if (!modeS(i)) {
          msg(t, { phase: 'surveillance', de: o.k, a: '*', freq: 1030, code: 'Intermode « ATCRBS seulement »', titre: 'Appel général ATCRBS (whisper-shout)',
            detail: 'Puissance augmentée par paliers : seuls les transpondeurs ATCRBS répondent, par ordre de distance. Les Mode S l’ignorent.' });
          if (g.r <= 14) { T.suivi = true; msg(t + 0.05, { phase: 'surveillance', de: i.k, a: o.k, freq: 1090, code: 'Réponse Mode C', titre: 'Réponse ATCRBS (Mode C)', detail: `Altitude ${Math.round(i.alt / 100) * 100} ft (pas de 100 ft). Pas d’adresse : l’intrus est suivi par sa distance.` });
            evt(t, o.k, 'detection', `Le TCAS de ${o.k} obtient une réponse Mode C de ${i.k} (ATCRBS, à moins de 14 NM).`); }
        }
      }
      if (!T.suivi) return { g, S, etat: 'clair' };
      if (!visible) { T.suivi = false; T.etat = 'clair'; return { g, S, etat: 'clair' }; }
      // ---- surveillance : UF0 → DF0 (Mode S) ou interrogation Intermode → Mode C (ATCRBS)
      if (modeS(i)) {
        msg(t, { phase: 'surveillance', de: o.k, a: i.k, freq: 1030, code: 'UF0', titre: 'Interrogation air-air courte', cle: `uf0${o.k}`,
          detail: `Interrogation sélective à l’adresse ${hex(i.adr)}. Le temps aller-retour donne la distance, l’antenne directionnelle le relèvement.` });
        msg(t + 0.05, { phase: 'surveillance', de: i.k, a: o.k, freq: 1090, code: 'DF0', titre: 'Réponse air-air courte', cle: `df0${i.k}`,
          detail: `Altitude ${Math.round(i.alt / 25) * 25} ft, niveau de sensibilité SL ${niveau(altSol(i), i.alt).sl}${i.equip === 'tcas' && tcasOn(i) ? ', RI : TCAS en fonction' : ', RI : pas de TCAS'}. Distance mesurée ${g.r.toFixed(1)} NM.` });
      } else {
        msg(t, { phase: 'surveillance', de: o.k, a: '*', freq: 1030, code: 'Intermode « ATCRBS seulement »', titre: 'Interrogation ATCRBS', cle: `ic${o.k}`,
          detail: 'Pas d’interrogation sélective possible avec un ATCRBS : appel général, en whisper-shout.' });
        msg(t + 0.05, { phase: 'surveillance', de: i.k, a: o.k, freq: 1090, code: 'Mode C', titre: 'Réponse ATCRBS', cle: `mc${i.k}`, detail: `Altitude ${Math.round(i.alt / 100) * 100} ft. Distance ${g.r.toFixed(1)} NM.` });
      }
      // ---- calculs : TAU, DMOD, ZTHR, ALIM
      const tauDe = d => g.r <= d ? 0 : (g.rdot < -1e-6 ? Math.max(0, (g.r - d * d / g.r) / -g.rdot) : Infinity);
      const tauTA = tauDe(S.dmodTA), tauRA = S.tauRA ? tauDe(S.dmodRA) : Infinity;
      const tcpa = g.rdot < -1e-6 ? g.r / -g.rdot : 0;
      const vtau = (g.h * g.hdot < 0) ? -g.h / g.hdot : Infinity;
      const hcpa = g.h + g.hdot * tcpa;
      const condTA = (tauTA < S.tauTA || g.r < S.dmodTA) && (Math.abs(g.h) < S.zthrTA || vtau < S.tauTA);
      const raPermis = S.tauRA && o.ctrl.mode === 'tara' && altSol(o) >= 1000;
      const condRA = raPermis && (tauRA < S.tauRA || g.r < S.dmodRA) && (Math.abs(g.h) < S.zthrRA || vtau < S.tauRA);
      const aural = altSol(o) >= 500;
      const calc = { g, S, tauTA, tauRA, tcpa, vtau, hcpa, condTA, condRA, raPermis, aural };
      const coordonne = i.equip === 'tcas' && tcasOn(i) && modeS(i);

      const annoncer = (texte) => { if (aural) { T.dernierAural = { t, texte }; evt(t, o.k, 'aural', texte); } };
      if (T.etat !== 'ra') {
        if (condRA && Math.abs(hcpa) < S.alim) {
          // ---- choix du sens : on regarde la séparation prévue au croisement (CPA) pour une montée et pour une descente
          let sens;
          if (T.interdit) { sens = T.interdit === 'monter' ? -1 : +1; }
          else {
            const sep = s => s * (prevue(o, tcpa, s * 1500, 5) - prevue(i, tcpa, null, 0));
            const nonCroisant = g.h < 0 ? +1 : -1;      // on reste du même côté de l'intrus
            sens = sep(nonCroisant) >= S.alim ? nonCroisant : (sep(+1) >= sep(-1) ? +1 : -1);
          }
          const croise = sens === 1 ? g.h > 0 : g.h < 0;
          const sepActuelle = sens * (prevue(o, tcpa, null, 0) - prevue(i, tcpa, null, 0));
          const preventif = sens * o.vs >= 0 && sepActuelle >= S.alim;
          const texte = preventif ? 'MONITOR VERTICAL SPEED' : (sens > 0 ? (croise ? 'CLIMB, CROSSING CLIMB' : 'CLIMB, CLIMB') : (croise ? 'DESCEND, CROSSING DESCEND' : 'DESCEND, DESCEND'));
          T.etat = 'ra'; T.ra = { sens, preventif, texte, t0: t, inverse: false, cible: preventif ? null : sens * 1500, coord: coordonne };
          T.raT0 = t; T.dernierRaBc = -99;
          evt(t, o.k, 'ra', `RA de ${o.k} : ${texte}${T.interdit ? ` (sens imposé par la coordination : ne pas ${T.interdit})` : ''}`);
          annoncer(texte);
          if (!preventif) commandePilote(o, t, sens, 1500, 5, 0.25);
          if (coordonne) envoyerCoord(t, o, i, sens);
        } else if (condTA) {
          if (T.etat === 'clair') { T.etat = 'ta'; evt(t, o.k, 'ta', `TA de ${o.k} : avertissement de trafic (${i.k} à ${g.r.toFixed(1)} NM, ${fmtRel(g.h)})`); annoncer('TRAFFIC, TRAFFIC'); }
        } else if (T.etat === 'ta' && ((g.rdot > 0 && g.r > S.dmodTA) || (tauTA > S.tauTA + 8 && Math.abs(g.h) > S.zthrTA))) { T.etat = 'clair'; evt(t, o.k, 'finta', `${o.k} : fin de l'avis de trafic (l'intrus s'éloigne)`); }
      } else {
        const ra = T.ra;
        // ---- coordination reçue qui contredit notre sens (intrus prioritaire) : on prend le sens complémentaire
        if (T.interdit && ((T.interdit === 'monter' && ra.sens > 0) || (T.interdit === 'descendre' && ra.sens < 0))) inverser(t, o, i, calc, 'coordination');
        // ---- inversion : l'intrus manœuvre dans notre sens et la séparation prévue fond
        else if (!ra.inverse && !ra.preventif && t - ra.t0 >= 4) {
          const sep = ra.sens * (prevue(o, tcpa, ra.cible, 0) - prevue(i, tcpa, null, 0));
          if (ra.sens * i.vs > 400 && sep < S.alim) inverser(t, o, i, calc, 'manœuvre');
        }
        if (t - T.dernierRaBc >= 8) { T.dernierRaBc = t;
          msg(t + 0.1, { phase: 'coordination', de: o.k, a: '*', freq: 1030, code: 'UF16 · UDS 3.1', titre: 'TCAS RA Broadcast', cle: `rabc${o.k}`,
            detail: `À tous (FFF FFF), aux 8 s environ, sans réponse. ARA : ${T.ra.texte} ; RAC : ${coordonne ? (T.ra.sens > 0 ? 'j’ai avisé l’intrus de ne pas monter' : 'j’ai avisé l’intrus de ne pas descendre') : 'aucun (intrus sans TCAS)'} ; AID ${o.code} ; CAC ${Math.round(o.alt / 100) * 100} ft ; RAT 0.` }); }
        // ---- fin du conflit : les avions s'éloignent
        if (g.rdot > 0 && g.r > S.dmodRA + 0.2 && t - ra.t0 > 6) {
          T.etat = 'clair'; T.ra = null; T.interdit = null;
          evt(t, o.k, 'coc', `${o.k} : CLEAR OF CONFLICT, retour à l'altitude autorisée`); annoncer('CLEAR OF CONFLICT');
          msg(t + 0.1, { phase: 'coordination', de: o.k, a: '*', freq: 1030, code: 'UF16 · UDS 3.1', titre: 'TCAS RA Broadcast (fin)', detail: 'RAT = 1 : le RA est terminé.' });
          if (coordonne) msg(t + 0.15, { phase: 'coordination', de: o.k, a: i.k, freq: 1030, code: 'UF16 · UDS 3.0', titre: 'Coordination : annulation', detail: 'Le TCAS lève la restriction imposée à l’intrus.' });
          o.pilote = { mode: 'retour', cible: Math.sign(o.autorisee - o.alt) * 1000, debut: t + 3, accel: 0.1 };
          if (o.k === 'A' || cfg.piloteB === 'suit') evt(t + 4, o.k, 'vhf', `${o.k} au contrôle : « Clear of conflict, returning to ${o.autorisee >= 18000 ? 'FL' + Math.round(o.autorisee / 100) : o.autorisee + ' ft'} »`);
        } else {
          if (coordonne) envoyerCoord(t, o, i, T.ra.sens);
          if (!T.ra.preventif && !T.ra.annonceVhf && t - T.ra.t0 >= 5 && (o.k === 'A' || cfg.piloteB === 'suit')) {
            T.ra.annonceVhf = true; evt(t, o.k, 'vhf', `${o.k} au contrôle (VHF) : « ${o.imm}, TCAS RA »`);
          }
        }
      }
      T.dernier = { ...calc, etat: T.etat };
      return T.dernier;
    }
    function fmtRel(h) { const c = Math.round(Math.abs(h) / 100); return `${h >= 0 ? '+' : '−'}${String(c).padStart(2, '0')} (${h >= 0 ? 'au-dessus' : 'en dessous'})`; }
    function envoyerCoord(t, o, i, sens) {
      const interdit = sens > 0 ? 'monter' : 'descendre';
      msg(t + 0.1, { phase: 'coordination', de: o.k, a: i.k, freq: 1030, code: 'UF16 · UDS 3.0', titre: 'TCAS RA Coordination Message', cle: `co${o.k}${sens}`,
        detail: `Interrogation sélective à ${hex(i.adr)}, chaque seconde pendant le RA. VRC : « ne ${interdit === 'monter' ? 'monte' : 'descends'} pas ». MID ${hex(o.adr)}.` });
      msg(t + 0.15, { phase: 'coordination', de: i.k, a: o.k, freq: 1090, code: 'DF16', titre: 'Réponse air-air longue', cle: `df16${i.k}`,
        detail: 'Le transpondeur de l’intrus accuse réception ; son message MV reprend l’état de son propre RA.' });
      if (i.tcas.etat !== 'ra' && i.tcas.interdit === interdit) return;
      if (i.tcas.interdit !== interdit) evt(t + 0.15, i.k, 'coord', `${i.k} reçoit de ${o.k} : « ne ${interdit === 'monter' ? 'monte' : 'descends'} pas »`);
      i.tcas.interdit = interdit;
    }
    function inverser(t, o, i, calc, pourquoi) {
      const ra = o.tcas.ra, sens = -ra.sens;
      const texte = sens > 0 ? 'CLIMB, CLIMB NOW' : 'DESCEND, DESCEND NOW';
      o.tcas.ra = { ...ra, sens, texte, inverse: true, preventif: false, cible: sens * 2500, t0: ra.t0 };
      evt(t, o.k, 'ra', `Inversion du RA de ${o.k} : ${texte} (${pourquoi === 'coordination' ? 'la coordination de l’intrus impose l’autre sens' : `${i.k} manœuvre dans le même sens`})`);
      if (calc.aural) { o.tcas.dernierAural = { t, texte }; evt(t, o.k, 'aural', texte); }
      commandePilote(o, t, sens, 2500, 2.5, 0.35);
      if (calc.g && i.equip === 'tcas' && tcasOn(i) && modeS(i)) envoyerCoord(t, o, i, sens);
    }
    // réponse du pilote : suit le RA (A toujours), ou fait l'inverse (B, option « manœuvre dans le mauvais sens »)
    function commandePilote(a, t, sens, taux, retard, g) {
      if (a.k === 'B' && cfg.piloteB === 'inverse') {
        if (a.pilote.mode !== 'contraire') { a.pilote = { mode: 'contraire', cible: -sens * 1500, debut: t + 5, accel: 0.15 };
          evt(t + 5, 'B', 'nonsuivi', `Le pilote de B ne suit pas son RA : il ${sens > 0 ? 'descend' : 'monte'} (il suit une autre instruction)`); }
        return;
      }
      a.pilote = { mode: 'ra', cible: sens * taux, debut: t + retard, accel: g };
    }
    // B sans TCAS qui manœuvre quand même dans le mauvais sens (option) : il suit le sens du RA de A
    function comportementB(t) {
      const B = av.B, A = av.A;
      if (cfg.piloteB !== 'inverse' || B.equip === 'tcas' && tcasOn(B)) return;
      if (A.tcas.ra && B.pilote.mode === 'normal' && t - A.tcas.ra.t0 >= 3) {
        B.pilote = { mode: 'contraire', cible: A.tcas.ra.sens * 1500, debut: t + 2, accel: 0.15 };
        evt(t + 2, 'B', 'nonsuivi', `Le pilote de B ${A.tcas.ra.sens > 0 ? 'monte' : 'descend'} (instruction du contrôle) : même sens que A`);
      }
    }

    function piloter(a, t) {
      const p = a.pilote; let cible;
      if (p.mode === 'normal' || (p.mode === 'retour' && t >= p.debut)) {
        const reste = a.autorisee - a.alt;
        if (p.mode === 'retour') { cible = Math.abs(reste) < 30 ? 0 : Math.sign(reste) * Math.min(1000, Math.abs(reste) * 2); if (Math.abs(reste) < 30) a.pilote = { mode: 'normal', cible: 0, debut: 0, accel: 0.1 }; }
        else cible = Math.abs(reste) < 30 ? 0 : (a.vsNominale ? Math.sign(reste) * Math.min(Math.abs(a.vsNominale), Math.abs(reste) * 2) : 0);
      } else if (t >= p.debut) cible = p.cible;
      else cible = a.vs;
      const acc = (p.mode === 'normal' ? 0.08 : p.accel) * 32.2 * 60;    // g → ft/min par seconde
      const d = cible - a.vs; a.vs += Math.sign(d) * Math.min(Math.abs(d), acc * DT);
    }

    for (let n = 0; n <= N; n++) {
      const t = +(n * DT).toFixed(2);
      // squitters (Mode S, transpondeur actif) : DF11 et DF17, environ une fois par seconde ici
      for (const a of [av.A, av.B]) {
        const off = a.k === 'A' ? 0.3 : 0.8;
        if (modeS(a) && xpdrOn(a) && Math.abs((t % 1) - off) < DT / 2) {
          msg(t, { phase: 'detection', de: a.k, a: '*', freq: 1090, code: 'DF11', titre: 'Squitter d’acquisition', cle: `df11${a.k}`, detail: `Diffusé sans interrogation : annonce l’adresse 24 bits ${hex(a.adr)}.` });
          msg(t + 0.03, { phase: 'detection', de: a.k, a: '*', freq: 1090, code: 'DF17', titre: 'Squitter long (ADS-B)', cle: `df17${a.k}`, detail: `Position GPS, altitude, vitesse et identification (${a.imm}).` });
        }
      }
      // cycles TCAS : A à chaque seconde pile, B à la demi-seconde
      for (const [o, i, off] of [[av.A, av.B, 0], [av.B, av.A, 0.5]]) {
        if (!tcasOn(o) || Math.abs((t % 1) - off) >= DT / 2) continue;
        if (t - o.tcas.dernierBc >= 10) { o.tcas.dernierBc = t;
          msg(t + 0.02, { phase: 'surveillance', de: o.k, a: '*', freq: 1030, code: 'UF16 · UDS 3.2', titre: 'TCAS Broadcast', cle: `bc${o.k}`, detail: `À tous (FFF FFF), aux 10 s, sans réponse : « mon TCAS existe », MID ${hex(o.adr)}. Sert à estimer la densité du trafic.` }); }
        cycle(t, o, i);
      }
      comportementB(t);
      for (const a of [av.A, av.B]) {
        piloter(a, t);
        a.alt += a.vs / 60 * DT;
        const [vx, vy] = vitesses(a); a.x += vx * DT; a.y += vy * DT;
      }
      const g = geometrie(av.A, av.B);
      images.push({ t,
        A: { x: av.A.x, y: av.A.y, cap: av.A.cap, alt: av.A.alt, vs: av.A.vs, etat: av.A.tcas.etat, ra: av.A.tcas.ra && { ...av.A.tcas.ra }, aural: av.A.tcas.dernierAural, suivi: av.A.tcas.suivi, calc: av.A.tcas.dernier, pilote: av.A.pilote.mode },
        B: { x: av.B.x, y: av.B.y, cap: av.B.cap, alt: av.B.alt, vs: av.B.vs, etat: av.B.tcas.etat, ra: av.B.tcas.ra && { ...av.B.tcas.ra }, aural: av.B.tcas.dernierAural, suivi: av.B.tcas.suivi, calc: av.B.tcas.dernier, pilote: av.B.pilote.mode },
        r: g.r, h: g.h });
    }
    // point de rapprochement maximal
    let cpa = images[0];
    for (const im of images) if (im.r < cpa.r) cpa = im;
    msgs.sort((a, b) => a.t - b.t); evts.sort((a, b) => a.t - b.t);
    return { cfg, sc, images, msgs, evts, cpa, DT, ID, hex };
  }

  racine.TCAS = { simuler, SCENARIOS, SL, niveau, ID, hex };
})(typeof window !== 'undefined' ? window : globalThis);
