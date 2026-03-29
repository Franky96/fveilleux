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

// ── Génération PDF (overlay sur liste_trousse.pdf) ───

window.genererPDF = async function() {
  const loc = ronaData.locations.find(l => l.id === locationActive);
  if (!loc) return;
  const manquants = loc.manquants || {};
  const date = new Date().toLocaleDateString('fr-CA');

  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

  // Charger le gabarit PDF
  let templateBytes;
  try {
    templateBytes = await fetch('liste_trousse.pdf').then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.arrayBuffer();
    });
  } catch (e) {
    alert('Impossible de charger liste_trousse.pdf : ' + e.message);
    return;
  }

  const pdfDoc   = await PDFDocument.load(templateBytes);
  const page     = pdfDoc.getPages()[0];
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontNorm = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const black    = rgb(0,   0,   0);
  const red      = rgb(0.7, 0,   0);

  // ── Champs du formulaire ──────────────────────────────
  // Emplacement (sur la ligne pointillée après "Emplacement :")
  page.drawText(loc.nom, { x: 485, y: 619, size: 9, font: fontBold, color: black });

  // Date (sur la ligne après "Date :")
  page.drawText(date, { x: 130, y: 584, size: 9, font: fontBold, color: black });

  // ── Rangées du tableau ────────────────────────────────
  // Positions y (depuis le bas de la page, en pts) du bord supérieur de chaque rangée
  // Mesurées pixel-à-pixel depuis le PDF rendu à 150 DPI
  const rowTops = [
    518.4, 493.4, 468.5, 443.0, 418.6, 393.6, 368.6, 343.2,
    318.7, 293.3, 268.8, 243.8, 218.9, 193.9, 169.0, 144.0,
    126.7, 107.5,
  ];

  // Colonnes (x depuis la gauche de la page, en pts)
  // Petite : 306.7 → 402.2 pt   |   Commande : 537.1 → ~594 pt
  const petiteWriteX    = 312;  // coin supérieur-gauche de la cellule Petite (au-dessus de /)
  const commandeCenterX = 565;  // centre de la colonne Commande

  ITEMS.forEach((item, idx) => {
    if (idx >= rowTops.length) return;

    const rowTop    = rowTops[idx];
    const nextTop   = rowTops[idx + 1] ?? (rowTop - 19);
    const rowHeight = rowTop - nextTop;

    const estManquant  = item.id in manquants;
    const qteManquante = estManquant ? (manquants[item.id] || 0) : 0;
    const present      = item.qte - qteManquante;
    const isMissing    = estManquant && qteManquante > 0;

    // Quantité actuelle (en haut à gauche de la diagonale / dans la col Petite)
    const writeY = rowTop - 8;
    page.drawText(String(present), {
      x: petiteWriteX,
      y: writeY,
      size: 7,
      font: isMissing ? fontBold : fontNorm,
      color: isMissing ? red : black,
    });

    // Quantité à commander (col Commande, seulement si manquant)
    if (isMissing) {
      const qStr = String(qteManquante);
      const tw   = fontBold.widthOfTextAtSize(qStr, 9);
      page.drawText(qStr, {
        x: commandeCenterX - tw / 2,
        y: rowTop - rowHeight / 2 - 4,
        size: 9,
        font: fontBold,
        color: red,
      });
    }
  });

  // ── Téléchargement ────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `RONA_SS_${loc.nom.replace(/\s+/g, '_')}_${date}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
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
