import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('rona')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

// ── Liste de référence RONA (trousse petite) ──────────
// qte=Petite, qteMoy=Moyenne, qteGrd=Grande, qtePerso=Perso (null = "-")
const ITEMS = [
  { id:'01', court:'Bandages adhésifs',
    long:'Bandages adhésifs, stériles, de tailles assorties (bande standard, grand, bout du doigt, jointure, grande plaque)',
    qte: 25, qteMoy: 50, qteGrd: 100, qtePerso: 16 },
  { id:'02', court:'Bandage élastique 5,1 cm',
    long:'Bandages élastiques, longueur non étirée, emballés individuellement, 5,1 cm x 1,8 m (2 po × 2 verges)',
    qte: 1, qteMoy: 2, qteGrd: 4, qtePerso: 1 },
  { id:'03', court:'Bandage élastique 7,6 cm',
    long:'Bandages élastiques, longueur non étirée, emballés individuellement, 7,6 cm x 1,8 m (3 po × 2 verges)',
    qte: 1, qteMoy: 2, qteGrd: 4, qtePerso: null },
  { id:'04', court:'Ciseaux à bandage',
    long:'Ciseaux à bandage en acier inoxydable (avec pointe en angle, arrondie), minimum 14 cm (5,5 po)',
    qte: 1, qteMoy: 1, qteGrd: 1, qtePerso: null },
  { id:'05', court:'Compresses de gaze 7,6 cm',
    long:'Compresses de gaze, stériles, emballées individuellement, 7,6 cm × 7,6 cm (3 po × 3 po)',
    qte: 12, qteMoy: 24, qteGrd: 48, qtePerso: 6 },
  { id:'06', court:'Compresses compressives 10,2 cm',
    long:'Compresses ou pansements compressifs avec attaches, stériles, 10,2 cm × 10,2 cm (4 po × 4 po)',
    qte: 2, qteMoy: 4, qteGrd: 8, qtePerso: 2 },
  { id:'07', court:'Écharpe triangulaire',
    long:'Écharpe triangulaire, coton, avec 2 épingles de sécurité, 101,6 cm X 101,6 cm X 142,2 cm (40 po x 40 po x 56 po)',
    qte: 2, qteMoy: 4, qteGrd: 8, qtePerso: 1 },
  { id:'08', court:'Lingettes antiseptiques',
    long:'Lingettes de nettoyage des plaies, antiseptiques, emballées individuellement',
    qte: 25, qteMoy: 50, qteGrd: 100, qtePerso: 6 },
  { id:'09', court:'Pince à écharde',
    long:'Pince à écharde ou pince à épiler (pointe fine, acier inoxydable, minimum 11,4 cm (4,5 po))',
    qte: 1, qteMoy: 1, qteGrd: 1, qtePerso: 1 },
  { id:'10', court:'Ruban adhésif (diachylon)',
    long:'Ruban adhésif (diachylon), 2,5 cm (1 po) – en mètre',
    qte: 2.3, qteMoy: 4.6, qteGrd: 9.1, qtePerso: 2.3 },
  { id:'11', court:'Dispositif RCP',
    long:'Dispositif de barrière pour réanimation cardio-pulmonaire (RCP), avec clapet unidirectionnel',
    qte: 1, qteMoy: 1, qteGrd: 1, qtePerso: null },
  { id:'12', court:"Gants d'examen (paires)",
    long:"Gants d'examen, jetables  de qualité médicale, taille unique, sans latex, sans poudre (nbre de paire)",
    qte: 4, qteMoy: 8, qteGrd: 16, qtePerso: 2 },
  { id:'13', court:'Compresses abdominales',
    long:'Compresses abdominales, stériles, emballées individuellement, 12,7 cm × 22,9 cm (5 po × 9 po)',
    qte: 1, qteMoy: 2, qteGrd: 2, qtePerso: null },
  { id:'14', court:'Couverture de secours',
    long:'Couverture de secours, en aluminium, en polyester non extensible, minimum 132 cm × 213 cm (52 po × 84 po)',
    qte: 1, qteMoy: 1, qteGrd: 1, qtePerso: null },
  { id:'15', court:'Lingettes mains / peau',
    long:'Lingettes de nettoyage des mains et de la peau, emballées individuellement (ou équivalent)',
    qte: 6, qteMoy: 12, qteGrd: 24, qtePerso: 4 },
  { id:'16', court:'Onguents antibiotiques',
    long:'Onguents antibiotiques, topiques, à usage unique',
    qte: 6, qteMoy: 12, qteGrd: 24, qtePerso: 2 },
  { id:'17', court:'Sac déchets biomédicaux',
    long:'Sac pour le recueil de déchets biomédicaux, à usage unique',
    qte: 1, qteMoy: 2, qteGrd: 2, qtePerso: 1 },
  { id:'18', court:'Liste du contenu',
    long:'Liste du contenu',
    qte: 1, qteMoy: 1, qteGrd: 1, qtePerso: 1 },
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

  const PW = 215.9, PH = 279.4;
  const ml = 12, mr = 12;
  const usable = PW - ml - mr; // 191.9 mm

  // Column widths: description | Petite | Moyenne | Grande | Perso | Commande
  const cDesc = 95;
  const cQte  = 16;  // × 4 = 64 mm
  const cCmd  = usable - cDesc - cQte * 4; // ~32.9 mm

  const colX = [ml, ml+cDesc, ml+cDesc+cQte, ml+cDesc+cQte*2, ml+cDesc+cQte*3, ml+cDesc+cQte*4];
  const colW = [cDesc, cQte, cQte, cQte, cQte, cCmd];

  const navy = [20, 45, 100];
  const teal = [0, 130, 145];

  // ── RONA Logo ─────────────────────────────────────────
  // "RONA" text in navy blue, large bold
  pdf.setTextColor(...navy);
  pdf.setFontSize(32);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RONA', ml, 21);

  // Logo mark: filled parallelogram to the right of text (approximation)
  const lx = ml + 41, lt = 7, lb = 23, lw = 11, slant = 5;
  pdf.setFillColor(...navy);
  pdf.setLineWidth(0);
  // Two triangles forming a right-leaning parallelogram
  pdf.triangle(lx + slant, lt,  lx + slant + lw, lt,  lx + lw, lb,  'F');
  pdf.triangle(lx + slant, lt,  lx,               lb,  lx + lw, lb,  'F');

  // ── Title (two lines, centred in right portion) ───────
  const titleCx = ml + 58 + (usable - 58) / 2;
  pdf.setTextColor(...teal);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Contenu minimal des trousses', titleCx, 13, { align: 'center' });
  pdf.text('de premiers soins',            titleCx, 23, { align: 'center' });

  // ── Form fields ───────────────────────────────────────
  let fy = 42;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);

  // Row 1 : Inspection faite par  +  Emplacement
  const ifpLabel = 'Inspection faite par : ';
  pdf.text(ifpLabel, ml + 5, fy);
  const ifpW = pdf.getTextWidth(ifpLabel);
  pdf.line(ml + 5 + ifpW, fy + 0.5, ml + 5 + ifpW + 55, fy + 0.5);

  const empLabel = 'Emplacement : ';
  const empX = ml + 5 + ifpW + 60;
  pdf.text(empLabel, empX, fy);
  const empW = pdf.getTextWidth(empLabel);
  pdf.line(empX + empW, fy + 0.5, ml + usable, fy + 0.5);

  // Row 2 : Date
  fy += 9;
  const dateLabel = 'Date : ';
  pdf.text(dateLabel, ml + 5, fy);
  const dateW = pdf.getTextWidth(dateLabel);
  pdf.line(ml + 5 + dateW, fy + 0.5, ml + 5 + dateW + 70, fy + 0.5);

  // ── Table ─────────────────────────────────────────────
  const descFS = 6.5;
  const lineH  = 3.8;
  const padV   = 1.8;
  const minRH  = 7.5;
  const hrh    = 16;  // header row height

  // Pre-calculate each row's height from wrapped description text
  pdf.setFontSize(descFS);
  pdf.setFont('helvetica', 'normal');
  const rowH = ITEMS.map(item => {
    const lines = pdf.splitTextToSize(item.long, cDesc - 3);
    return Math.max(minRH, lines.length * lineH + padV * 2);
  });

  let ty = fy + 9;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.4);

  // ── Header row ────────────────────────────────────────
  for (let i = 0; i < 6; i++) pdf.rect(colX[i], ty, colW[i], hrh);

  // Diagonal in col 0 (/ = bottom-left → top-right)
  pdf.setLineWidth(0.3);
  pdf.line(colX[0], ty + hrh, colX[0] + cDesc, ty);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  // Upper-right text (above the /)
  pdf.text("Taille de trousse (nombre",  colX[0] + cDesc - 2, ty + 4,   { align: 'right' });
  pdf.text("d'associés par quart)",       colX[0] + cDesc - 2, ty + 8.5, { align: 'right' });
  // Lower-left text (below the /)
  pdf.setFont('helvetica', 'bold');
  pdf.text('Articles obligatoires', colX[0] + 2, ty + hrh - 2.5);

  // Qty/Commande column headers
  const hdrLabels = [
    ['Petite',   '(25 et-)'],
    ['Moyenne',  '(26 à 50)'],
    ['Grande',   '(51 et +)'],
    ['Perso',    ''],
    ['Commande', ''],
  ];
  pdf.setFontSize(6.5);
  for (let i = 1; i <= 5; i++) {
    const midX = colX[i] + colW[i] / 2;
    const [h1, h2] = hdrLabels[i - 1];
    pdf.setFont('helvetica', 'bold');
    pdf.text(h1, midX, ty + (h2 ? hrh / 2 - 0.5 : hrh / 2 + 2), { align: 'center' });
    if (h2) {
      pdf.setFont('helvetica', 'normal');
      pdf.text(h2, midX, ty + hrh / 2 + 4, { align: 'center' });
    }
  }

  ty += hrh;

  // ── Data rows ─────────────────────────────────────────
  ITEMS.forEach((item, idx) => {
    const rh           = rowH[idx];
    const estManquant  = item.id in manquants;
    const qteManquante = estManquant ? (manquants[item.id] || 0) : 0;
    const present      = item.qte - qteManquante;

    // Row shading
    pdf.setLineWidth(0);
    if (estManquant && qteManquante > 0) {
      pdf.setFillColor(255, 236, 236);
      pdf.rect(ml, ty, usable, rh, 'F');
    } else if (idx % 2 === 1) {
      pdf.setFillColor(248, 248, 248);
      pdf.rect(ml, ty, usable, rh, 'F');
    }

    // Cell borders
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.3);
    for (let i = 0; i < 6; i++) pdf.rect(colX[i], ty, colW[i], rh);

    // Description (multi-line)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(descFS);
    pdf.setTextColor(0, 0, 0);
    const descLines = pdf.splitTextToSize(item.long, cDesc - 3);
    descLines.forEach((line, li) => {
      pdf.text(line, colX[0] + 1.5, ty + padV + 2.5 + li * lineH);
    });

    // Qty cells 1–4 with diagonal
    const sizes = [item.qte, item.qteMoy, item.qteGrd, item.qtePerso];
    for (let i = 1; i <= 4; i++) {
      const cx  = colX[i];
      const cw  = colW[i];
      const req = sizes[i - 1];  // null → "-"

      // Diagonal / bottom-left → top-right
      pdf.setDrawColor(160, 160, 160);
      pdf.setLineWidth(0.2);
      pdf.line(cx, ty + rh, cx + cw, ty);
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.3);

      if (i === 1) {
        // Petite: actual (top-left above /) and required (bottom-right below /)
        pdf.setFont('helvetica', estManquant && qteManquante > 0 ? 'bold' : 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(estManquant && qteManquante > 0 ? 170 : 0, 0, 0);
        pdf.text(String(present), cx + cw * 0.25, ty + rh * 0.38);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        pdf.setTextColor(80, 80, 80);
        pdf.text(String(item.qte), cx + cw * 0.76, ty + rh * 0.86);
      } else {
        // Other cols: required qty (or "-") in lower-right area below /
        const qStr = req === null ? '-' : String(req);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(req === null ? 8 : 7);
        pdf.setTextColor(req === null ? 140 : 0, 0, 0);
        pdf.text(qStr, cx + cw * 0.76, ty + rh * 0.86);
      }
    }

    // Commande column
    if (estManquant && qteManquante > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(180, 0, 0);
      pdf.text(String(qteManquante), colX[5] + colW[5] / 2, ty + rh / 2 + 2.5, { align: 'center' });
    }

    ty += rh;
  });

  // Heavy bottom border
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.7);
  pdf.line(ml, ty, ml + usable, ty);

  // ── Footer (two-column) ───────────────────────────────
  const footY = Math.min(ty + 12, PH - 28);
  pdf.setLineWidth(0.3);
  pdf.line(ml, footY - 3, ml + usable, footY - 3);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);

  // Left column
  [
    'Petite trousse : 25 associés ou moins par quart',
    'Moyenne Trousse : 26 à 50 associés par quart',
    'Grande trousse : 51 associés ou plus par quart',
  ].forEach((line, i) => pdf.text(line, ml, footY + i * 4.5));

  // Right column (justified text block)
  const rfx = ml + usable / 2 + 5;
  const rfw = usable / 2 - 5;
  const rfText = "Trousse personnelle : Cette trousse est destinée aux travailleurs qui " +
    "effectuent un travail isolé et qui n'ont pas accès à une trousse de premiers " +
    "secours. Cette trousse peut aussi être utilisée dans les véhicules qui font le " +
    "transport de moins de 5 travailleurs.";
  pdf.splitTextToSize(rfText, rfw).forEach((line, i) => {
    pdf.text(line, rfx, footY + i * 4);
  });

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
