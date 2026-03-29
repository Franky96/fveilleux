import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('rona')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

// ── Liste de référence RONA (trousse petite) ──────────
const ITEMS = [
  { id:'01', court:'Bandages adhésifs',
    long:'Bandages adhésifs, stériles, de tailles assorties (bande standard, grand, bout du doigt, jointure, grande plaque)',
    qte: 25, qteMoy: 50, qteGrd: 75 },
  { id:'02', court:'Bandage élastique 5,1 cm',
    long:'Bandages élastiques, longueur non étirée, emballés individuellement, 5,1 cm × 1,8 m (2 po × 2 verges)',
    qte: 1, qteMoy: 2, qteGrd: 3 },
  { id:'03', court:'Bandage élastique 7,6 cm',
    long:'Bandages élastiques, longueur non étirée, emballés individuellement, 7,6 cm × 1,8 m (3 po × 2 verges)',
    qte: 1, qteMoy: 2, qteGrd: 3 },
  { id:'04', court:'Ciseaux à bandage',
    long:'Ciseaux à bandage en acier inoxydable (avec pointe en angle, arrondie), minimum 14 cm (5,5 po)',
    qte: 1, qteMoy: 1, qteGrd: 1 },
  { id:'05', court:'Compresses de gaze 7,6 cm',
    long:'Compresses de gaze, stériles, emballées individuellement, 7,6 cm × 7,6 cm (3 po × 3 po)',
    qte: 12, qteMoy: 25, qteGrd: 36 },
  { id:'06', court:'Compresses compressives 10,2 cm',
    long:'Compresses ou pansements compressifs avec attaches, stériles, 10,2 cm × 10,2 cm (4 po × 4 po)',
    qte: 2, qteMoy: 4, qteGrd: 6 },
  { id:'07', court:'Écharpe triangulaire',
    long:'Écharpe triangulaire, coton, avec 2 épingles de sécurité, 101,6 cm × 101,6 cm × 142,2 cm',
    qte: 2, qteMoy: 4, qteGrd: 6 },
  { id:'08', court:'Lingettes antiseptiques',
    long:'Lingettes de nettoyage des plaies, antiseptiques, emballées individuellement',
    qte: 25, qteMoy: 50, qteGrd: 75 },
  { id:'09', court:'Pince à écharde',
    long:'Pince à écharde ou pince à épiler (pointe fine, acier inoxydable, minimum 11,4 cm (4,5 po))',
    qte: 1, qteMoy: 1, qteGrd: 1 },
  { id:'10', court:'Ruban adhésif (diachylon)',
    long:'Ruban adhésif (diachylon), 2,5 cm (1 po) – en mètre',
    qte: 2.3, qteMoy: 4.6, qteGrd: 6.9 },
  { id:'11', court:'Dispositif RCP',
    long:'Dispositif de barrière pour réanimation cardio-pulmonaire (RCP), avec clapet unidirectionnel',
    qte: 1, qteMoy: 1, qteGrd: 1 },
  { id:'12', court:"Gants d'examen (paires)",
    long:"Gants d'examen, jetables de qualité médicale, taille unique, sans latex, sans poudre (nombre de paires)",
    qte: 4, qteMoy: 8, qteGrd: 12 },
  { id:'13', court:'Compresses abdominales',
    long:'Compresses abdominales, stériles, emballées individuellement, 12,7 cm × 22,9 cm (5 po × 9 po)',
    qte: 1, qteMoy: 2, qteGrd: 3 },
  { id:'14', court:'Couverture de secours',
    long:'Couverture de secours, en aluminium, en polyester non extensible, minimum 132 cm × 213 cm (52 po × 84 po)',
    qte: 1, qteMoy: 1, qteGrd: 2 },
  { id:'15', court:'Lingettes mains / peau',
    long:'Lingettes de nettoyage des mains et de la peau, emballées individuellement (ou équivalent)',
    qte: 6, qteMoy: 12, qteGrd: 18 },
  { id:'16', court:'Onguents antibiotiques',
    long:'Onguents antibiotiques, topiques, à usage unique',
    qte: 6, qteMoy: 12, qteGrd: 18 },
  { id:'17', court:'Sac déchets biomédicaux',
    long:'Sac pour le recueil de déchets biomédicaux, à usage unique',
    qte: 1, qteMoy: 1, qteGrd: 2 },
  { id:'18', court:'Liste du contenu',
    long:'Liste du contenu de la trousse',
    qte: 1, qteMoy: 1, qteGrd: 1 },
];

// ── Firebase ──────────────────────────────────────────
const ronaDocRef = doc(db, "donnees", "rona_global");

const EMPLACEMENTS_DEFAUT = [
  'Comptoir retour', 'Cour à bois', 'Infirmerie', 'Location',
  'Peinture', 'Plomberie', 'Réception', 'Salle de coupe',
];

let ronaData = { locations: [] };
let locationActive = null;

document.addEventListener('DOMContentLoaded', () => {
  onSnapshot(ronaDocRef, (snap) => {
    if (snap.exists()) {
      ronaData = snap.data();
      if (!ronaData.locations) ronaData.locations = [];
    } else {
      ronaData.locations = EMPLACEMENTS_DEFAUT.map(nom => ({
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        nom, manquants: {}
      }));
      setDoc(ronaDocRef, ronaData);
    }
    if (ronaData.locations.length === 0) {
      ronaData.locations = EMPLACEMENTS_DEFAUT.map(nom => ({
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        nom, manquants: {}
      }));
      setDoc(ronaDocRef, ronaData);
    }
    renderLocationSelect();
    renderGrille();
  }, (err) => {
    console.error('Firebase RONA:', err);
    afficherErreurFirebase(err.code);
  });
});

function sauvegarder() { setDoc(ronaDocRef, ronaData); }

// ── Sélection emplacement ─────────────────────────────

function renderLocationSelect() {
  const sel = document.getElementById('location-select');
  const val = sel.value || locationActive;
  sel.innerHTML = '<option value="">— choisir un emplacement —</option>';
  const sorted = [...(ronaData.locations || [])].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  sorted.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.nom;
    sel.appendChild(opt);
  });
  if (val) sel.value = val;
  locationActive = sel.value || null;
}

window.changerLocation = function() {
  locationActive = document.getElementById('location-select').value || null;
  renderGrille();
};

// ── Grille des articles ───────────────────────────────

function renderGrille() {
  const grid = document.getElementById('items-grid');

  const btnPdf = document.getElementById('btn-pdf-container');
  if (!locationActive) {
    grid.innerHTML = `<div class="rona-empty">
      <span>👷‍♂️</span>Choisis un emplacement ci-dessus, ou crée-en un avec <strong>+</strong>.
    </div>`;
    btnPdf.style.display = 'none';
    return;
  }
  btnPdf.style.display = 'block';

  const loc = ronaData.locations.find(l => l.id === locationActive);
  if (!loc) return;
  const manquants = loc.manquants || {};

  grid.innerHTML = '';
  ITEMS.forEach(item => {
    const estManquant = item.id in manquants;
    const qteManquante = manquants[item.id] || 0;
    const present = item.qte - qteManquante;

    const row = document.createElement('div');
    row.className = 'item-row' + (estManquant ? ' manquant' : '');

    // Checkbox
    const chk = document.createElement('div');
    chk.className = 'item-chk' + (estManquant ? ' checked' : '');
    chk.textContent = estManquant ? '✕' : '';
    chk.onclick = () => toggleManquant(item, loc, row, chk, qteInput);

    // Info
    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<div class="item-nom">${item.court}</div>
                      <div class="item-fraction">${present}/${item.qte}</div>`;

    // Champ quantité
    const qteInput = document.createElement('input');
    qteInput.type = 'number';
    qteInput.inputMode = 'numeric';
    qteInput.className = 'item-qte-input';
    qteInput.min = 1;
    qteInput.max = item.qte;
    qteInput.placeholder = '?';
    if (estManquant) qteInput.value = qteManquante;
    qteInput.onchange = () => mettreAJourQte(item, loc, qteInput, info);
    qteInput.onblur  = () => mettreAJourQte(item, loc, qteInput, info);

    row.appendChild(chk);
    row.appendChild(info);
    row.appendChild(qteInput);
    grid.appendChild(row);
  });
}

// ── Interactions inline ───────────────────────────────

function toggleManquant(item, loc, row, chk, qteInput) {
  if (!loc.manquants) loc.manquants = {};
  const estManquant = item.id in loc.manquants;
  if (estManquant) {
    // Remettre complet
    delete loc.manquants[item.id];
    row.classList.remove('manquant');
    chk.classList.remove('checked');
    chk.textContent = '';
    qteInput.value = '';
    qteInput.style.display = 'none';
    row.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
  } else {
    // Marquer manquant (null = coché sans quantité encore saisie)
    loc.manquants[item.id] = null;
    row.classList.add('manquant');
    chk.classList.add('checked');
    chk.textContent = '✕';
    qteInput.value = '';
    qteInput.style.display = 'block';
    row.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
    setTimeout(() => qteInput.focus(), 50);
  }
  sauvegarder();
}

function mettreAJourQte(item, loc, qteInput, info) {
  if (!loc.manquants) loc.manquants = {};
  const val = parseInt(qteInput.value);
  if (!isNaN(val) && val > 0) {
    loc.manquants[item.id] = Math.min(val, item.qte);
    const present = item.qte - loc.manquants[item.id];
    info.querySelector('.item-fraction').textContent = `${present}/${item.qte}`;
  } else {
    loc.manquants[item.id] = null; // coché mais sans quantité
    info.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
  }
  sauvegarder();
}

// ── Modal emplacement ─────────────────────────────────

window.ouvrirModalLocation = function() {
  document.getElementById('location-nom').value = '';
  document.getElementById('modal-location').classList.remove('hidden');
  setTimeout(() => document.getElementById('location-nom').focus(), 50);
  document.getElementById('location-save-btn').onclick = sauvegarderLocation;
};

window.fermerModalLocation = function() {
  document.getElementById('modal-location').classList.add('hidden');
};

function sauvegarderLocation() {
  const nom = document.getElementById('location-nom').value.trim();
  if (!nom) return;
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  ronaData.locations.push({ id, nom, manquants: {} });
  locationActive = id;
  sauvegarder();
  fermerModalLocation();
}

// ── Génération PDF ────────────────────────────────────

window.genererPDF = function() {
  const loc = ronaData.locations.find(l => l.id === locationActive);
  if (!loc) return;
  const manquants = loc.manquants || {};
  const date = new Date().toLocaleDateString('fr-CA');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PW   = 215.9;
  const ml   = 10;
  const usable = PW - ml * 2; // 195.9 mm

  // Column widths: description | Petite | Moyenne | Grande | Perso | Commande
  const cDesc = 104;
  const cQte  = 16;        // × 4 = 64 mm
  const cCmd  = usable - cDesc - cQte * 4; // ~27.9 mm

  // Left-edge x per column
  const cx = [
    ml,
    ml + cDesc,
    ml + cDesc + cQte,
    ml + cDesc + cQte * 2,
    ml + cDesc + cQte * 3,
    ml + cDesc + cQte * 4,
  ];
  const cw = [cDesc, cQte, cQte, cQte, cQte, cCmd];

  // ── RONA logo (red rectangle + white text) ──
  pdf.setFillColor(196, 18, 27);
  pdf.rect(ml, 8, 26, 11, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RONA', ml + 13, 16, { align: 'center' });

  // ── Title block ──
  pdf.setTextColor(0, 130, 120);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Contenu minimal des trousses de premiers soins', ml + 29, 13);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(70, 70, 70);
  pdf.text('Règlement sur les premiers secours et premiers soins — LSST, article 256', ml + 29, 18);

  // ── Form fields ──
  let fy = 27;
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);

  pdf.text('Inspection faite par :', ml, fy);
  pdf.line(ml + 42, fy + 0.5, ml + 105, fy + 0.5);

  pdf.text('Emplacement :', ml + 108, fy);
  pdf.setFont('helvetica', 'bold');
  pdf.text(loc.nom, ml + 131, fy);

  fy += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.text('Date :', ml, fy);
  pdf.setFont('helvetica', 'bold');
  pdf.text(date, ml + 13, fy);

  // ── Table ──
  const rh  = 7.8;   // data row height
  const hrh = 13;    // header row height
  let ty = fy + 7;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.35);

  // ── Header row ──
  for (let i = 0; i < 6; i++) {
    pdf.rect(cx[i], ty, cw[i], hrh);
  }

  // Diagonal in col 0 header (bottom-left → top-right)
  pdf.setLineWidth(0.25);
  pdf.setDrawColor(0);
  pdf.line(cx[0], ty + hrh, cx[0] + cDesc, ty);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Articles obligatoires', cx[0] + 2, ty + hrh - 2.5);
  pdf.text('Taille de trousse', cx[0] + cDesc - 2, ty + 4.5, { align: 'right' });

  // Qty column headers
  const hdrTop    = ['Petite',   'Moyenne',  'Grande',   'Perso'];
  const hdrBottom = ['25 et -',  '26 à 50',  '51 et +',  ''];
  pdf.setFontSize(6.5);
  pdf.setLineWidth(0.35);
  pdf.setDrawColor(0);
  for (let i = 1; i <= 4; i++) {
    const midX = cx[i] + cw[i] / 2;
    pdf.text(hdrTop[i - 1], midX, ty + hrh / 2 - 0.5, { align: 'center' });
    if (hdrBottom[i - 1]) {
      pdf.text(hdrBottom[i - 1], midX, ty + hrh / 2 + 4, { align: 'center' });
    }
  }

  // Commande header
  const cmdMidX = cx[5] + cw[5] / 2;
  pdf.text('Commande', cmdMidX, ty + hrh / 2 + 1, { align: 'center' });

  ty += hrh;

  // ── Data rows ──
  ITEMS.forEach((item, idx) => {
    const estManquant  = item.id in manquants;
    const qteManquante = estManquant ? (manquants[item.id] || 0) : 0;
    const present      = item.qte - qteManquante;

    // Row shading
    pdf.setLineWidth(0);
    if (estManquant && qteManquante > 0) {
      pdf.setFillColor(255, 238, 238);
      pdf.rect(ml, ty, usable, rh, 'F');
    } else if (idx % 2 === 1) {
      pdf.setFillColor(246, 246, 246);
      pdf.rect(ml, ty, usable, rh, 'F');
    }

    // Cell borders
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.3);
    for (let i = 0; i < 6; i++) {
      pdf.rect(cx[i], ty, cw[i], rh);
    }

    // Description text (single line, truncated)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(0, 0, 0);
    const descLines = pdf.splitTextToSize(item.long, cDesc - 3);
    pdf.text(descLines[0], cx[0] + 1.5, ty + rh / 2 + 2.2);

    // Qty cells with diagonal
    const sizes = [item.qte, item.qteMoy, item.qteGrd, null];
    for (let i = 1; i <= 4; i++) {
      const cellX  = cx[i];
      const cellW  = cw[i];
      const reqQte = sizes[i - 1];

      // Diagonal line bottom-left → top-right
      pdf.setDrawColor(160, 160, 160);
      pdf.setLineWidth(0.2);
      pdf.line(cellX, ty + rh, cellX + cellW, ty);
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.3);

      if (reqQte !== null) {
        // Top-left of diagonal: actual present qty (Petite col only)
        if (i === 1) {
          pdf.setFont('helvetica', estManquant && qteManquante > 0 ? 'bold' : 'normal');
          pdf.setFontSize(6.5);
          pdf.setTextColor(estManquant && qteManquante > 0 ? 180 : 0, 0, 0);
          pdf.text(String(present), cellX + cellW * 0.26, ty + rh * 0.40);
        }
        // Bottom-right of diagonal: required qty
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.5);
        pdf.setTextColor(90, 90, 90);
        pdf.text(String(reqQte), cellX + cellW * 0.76, ty + rh * 0.86);
      }
    }

    // Commande column: only fill if items are missing
    if (estManquant && qteManquante > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(180, 0, 0);
      pdf.text(String(qteManquante), cx[5] + cw[5] / 2, ty + rh / 2 + 2.2, { align: 'center' });
    }

    ty += rh;
  });

  // Heavy bottom border
  pdf.setLineWidth(0.6);
  pdf.line(ml, ty, ml + usable, ty);

  // ── Footer ──
  ty += 5;
  pdf.setLineWidth(0.3);
  pdf.line(ml, ty - 2, ml + usable, ty - 2);
  pdf.setFontSize(6.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    'Petite : Pour 25 travailleurs et moins  |  Moyenne : Pour 26 à 50 travailleurs  |  Grande : Pour 51 travailleurs et plus',
    ml, ty + 1
  );

  pdf.save(`RONA_SS_${loc.nom.replace(/\s+/g, '_')}_${date}.pdf`);
};

// ── Erreur Firebase ───────────────────────────────────

function afficherErreurFirebase(code) {
  if (document.getElementById('firebase-err-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'firebase-err-banner';
  banner.style.cssText = 'background:#c0392b;color:#fff;padding:0.8rem 1rem;text-align:center;font-weight:bold;font-size:0.9rem;position:sticky;top:0;z-index:9999;';
  banner.textContent = `⚠️ Erreur Firebase (${code}) — Mets à jour les règles dans la console Firebase.`;
  document.body.prepend(banner);
}
