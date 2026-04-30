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

// ── Helper : lecture rétrocompatible d'un item manquant ──
// Format ancien : number | null   /   Format nouveau : { qte, type }
function getManquantInfo(val) {
  if (val === null || val === undefined) return { qte: null, type: 'ajout' };
  if (typeof val === 'object') return { qte: val.qte ?? null, type: val.type || 'ajout' };
  return { qte: val, type: 'ajout' };
}

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
      afficherCompletes();
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

function sauvegarder() { 
  setDoc(ronaDocRef, ronaData); 
  afficherCompletes();
}

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
  // Mettre à jour le bouton OK/Annuler
  const btn = document.getElementById('btn-ok');
  if (btn && locationActive && ronaData.completes && ronaData.completes.includes(locationActive)) {
    btn.textContent = 'Annuler';
    btn.classList.add('btn-annuler');
  } else if (btn) {
    btn.textContent = 'OK';
    btn.classList.remove('btn-annuler');
  }
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
    masquerMessageValidation();
    return;
  }
  btnPdf.style.display = 'flex';
  btnPdf.style.gap = '0.5rem';

  const loc = ronaData.locations.find(l => l.id === locationActive);
  if (!loc) return;
  const manquants = loc.manquants || {};
  if (!loc.complets) loc.complets = [];

  grid.innerHTML = '';
  ITEMS.forEach(item => {
    const estManquant = item.id in manquants;
    const estComplet  = loc.complets.includes(item.id);
    const { qte: qteManquante, type: manquantType } = getManquantInfo(manquants[item.id]);
    const present = estManquant ? (item.qte - (qteManquante || 0)) : item.qte;

    const row = document.createElement('div');
    row.className = 'item-row' + (estManquant ? ' manquant' : '');

    // Boutons ✕ et ✓
    const btns = document.createElement('div');
    btns.className = 'item-btns';

    const btnX = document.createElement('button');
    btnX.className = 'btn-x' + (estManquant ? ' active' : '');
    btnX.textContent = '✕';
    btnX.title = 'Manquant';

    const btnChk = document.createElement('button');
    btnChk.className = 'btn-chk' + (estComplet ? ' active' : '');
    btnChk.textContent = '✓';
    btnChk.title = 'Complet (quantité maximale)';

    btns.appendChild(btnX);
    btns.appendChild(btnChk);

    // Info
    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<div class="item-nom">${item.court}</div>
                      <div class="item-fraction">${present}/${item.qte}</div>`;

    // Menu déroulant Ajout / cmd
    const typeSelect = document.createElement('select');
    typeSelect.className = 'item-type-select';
    typeSelect.style.display = estManquant ? 'inline-block' : 'none';
    ['ajout', 'cmd'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === manquantType) o.selected = true;
      typeSelect.appendChild(o);
    });
    typeSelect.onchange = () => mettreAJourType(item, loc, typeSelect);

    // Champ quantité
    const qteInput = document.createElement('input');
    qteInput.type = 'number';
    qteInput.inputMode = 'numeric';
    qteInput.className = 'item-qte-input';
    qteInput.min = 1;
    qteInput.max = item.qte;
    qteInput.placeholder = '?';
    if (estManquant && (qteManquante || 0) > 0) qteInput.value = qteManquante;
    qteInput.onchange = () => mettreAJourQte(item, loc, qteInput, info);
    qteInput.onblur  = () => mettreAJourQte(item, loc, qteInput, info);

    btnX.onclick   = () => clickerX(item, loc, row, btnX, btnChk, typeSelect, qteInput, info);
    btnChk.onclick = () => clickerChk(item, loc, row, btnX, btnChk, typeSelect, qteInput, info);

    row.appendChild(btns);
    row.appendChild(info);
    row.appendChild(typeSelect);
    row.appendChild(qteInput);
    grid.appendChild(row);
  });
}

// ── Interactions inline ───────────────────────────────

function clickerX(item, loc, row, btnX, btnChk, typeSelect, qteInput, info) {
  if (!loc.manquants) loc.manquants = {};
  if (!loc.complets) loc.complets = [];
  const estManquant = item.id in loc.manquants;

  if (estManquant) {
    delete loc.manquants[item.id];
    row.classList.remove('manquant');
    btnX.classList.remove('active');
    typeSelect.style.display = 'none';
    qteInput.value = '';
    qteInput.style.display = 'none';
    info.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
  } else {
    loc.complets = loc.complets.filter(id => id !== item.id);
    btnChk.classList.remove('active');
    loc.manquants[item.id] = { qte: null, type: 'ajout' };
    row.classList.add('manquant');
    btnX.classList.add('active');
    typeSelect.value = 'ajout';
    typeSelect.style.display = 'inline-block';
    qteInput.value = '';
    qteInput.style.display = 'block';
    info.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
    setTimeout(() => qteInput.focus(), 50);
  }
  row.classList.remove('non-rempli');
  masquerMessageValidation();
  sauvegarder();
}

function clickerChk(item, loc, row, btnX, btnChk, typeSelect, qteInput, info) {
  if (!loc.manquants) loc.manquants = {};
  if (!loc.complets) loc.complets = [];
  const estComplet = loc.complets.includes(item.id);

  if (estComplet) {
    loc.complets = loc.complets.filter(id => id !== item.id);
    btnChk.classList.remove('active');
  } else {
    if (item.id in loc.manquants) {
      delete loc.manquants[item.id];
      row.classList.remove('manquant');
      btnX.classList.remove('active');
      typeSelect.style.display = 'none';
      qteInput.value = '';
      qteInput.style.display = 'none';
    }
    loc.complets.push(item.id);
    btnChk.classList.add('active');
    info.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
  }
  row.classList.remove('non-rempli');
  masquerMessageValidation();
  sauvegarder();
}

// ── Validation ────────────────────────────────────────

function toutRempli(loc) {
  const complets  = loc.complets  || [];
  const manquants = loc.manquants || {};
  return ITEMS.every(item => (item.id in manquants) || complets.includes(item.id));
}

function montrerItemsNonRemplis(loc) {
  const complets  = loc.complets  || [];
  const manquants = loc.manquants || {};
  document.querySelectorAll('#items-grid .item-row').forEach((row, idx) => {
    const item = ITEMS[idx];
    if (item && !(item.id in manquants) && !complets.includes(item.id)) {
      row.classList.add('non-rempli');
    }
  });
  const msg = document.getElementById('msg-validation');
  if (msg) msg.style.display = 'flex';
}

function masquerMessageValidation() {
  const msg = document.getElementById('msg-validation');
  if (msg) msg.style.display = 'none';
}

function mettreAJourQte(item, loc, qteInput, info) {
  if (!loc.manquants) loc.manquants = {};
  const { type } = getManquantInfo(loc.manquants[item.id]);
  const val = parseInt(qteInput.value);
  if (!isNaN(val) && val > 0) {
    const qte = Math.min(val, item.qte);
    loc.manquants[item.id] = { qte, type };
    info.querySelector('.item-fraction').textContent = `${item.qte - qte}/${item.qte}`;
  } else {
    loc.manquants[item.id] = { qte: null, type };
    info.querySelector('.item-fraction').textContent = `${item.qte}/${item.qte}`;
  }
  sauvegarder();
}

function mettreAJourType(item, loc, typeSelect) {
  if (!loc.manquants) loc.manquants = {};
  const { qte } = getManquantInfo(loc.manquants[item.id]);
  loc.manquants[item.id] = { qte, type: typeSelect.value };
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
  if (!toutRempli(loc)) { montrerItemsNonRemplis(loc); return; }
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

  // Nom (sur la ligne pointillée après "Nom :")
  page.drawText('André Veilleux', { x: 200, y: 668, size: 11, font: fontBold, color: black });

  // Emplacement (sur la ligne pointillée après "Emplacement :")
  page.drawText(loc.nom, { x: 430, y: 668, size: 11, font: fontBold, color: black });

  // Date (sur la ligne après "Date :")
  page.drawText(date, { x: 125, y: 641, size: 11, font: fontBold, color: black });

  // ── Rangées du tableau ────────────────────────────────
  // Positions y (depuis le bas de la page, en pts) du bord supérieur de chaque rangée
  // Ligne du haut du tableau de données = 593.0 pt
  const rowTops = [
    593.0, 567.8, 543.1, 518.2, 493.2, 468.2, 443.0, 418.6,
    393.6, 368.4, 343.2, 318.5, 293.3, 268.8, 243.8, 218.9,
    193.9, 169.0,
  ];

  // Colonnes (x depuis la gauche de la page, en pts)
  // Petite : 306.7 → 402.2 pt   |   Commande : 537.1 → ~594 pt
  const petiteWriteX = 312;  // coin supérieur-gauche de la cellule Petite (au-dessus de /)

  ITEMS.forEach((item, idx) => {
    if (idx >= rowTops.length) return;

    const rowTop    = rowTops[idx];
    const nextTop   = rowTops[idx + 1] ?? (rowTop - 19);
    const rowHeight = rowTop - nextTop;

    const estManquant  = item.id in manquants;
    const { qte: qteManquante, type: manquantType } = getManquantInfo(manquants[item.id]);
    const qteM    = estManquant ? (qteManquante || 0) : 0;
    const present = item.qte - qteM;
    const isMissing = estManquant && qteM > 0;

    // Quantité actuelle (en haut à gauche de la diagonale / dans la col Petite)
    const writeY = rowTop - 12;
    page.drawText(String(present), {
      x: petiteWriteX,
      y: writeY,
      size: 10,
      font: isMissing ? fontBold : fontNorm,
      color: isMissing ? red : black,
    });

    // Quantité à commander (col Commande, seulement si manquant)
    if (isMissing) {
      const qStr   = String(qteM);
      const label  = manquantType + ': ' + qStr;
      const tw     = fontBold.widthOfTextAtSize(qStr, 9);
      page.drawText(label, {
        x: 490 - tw / 2,
        y: rowTop - rowHeight / 2 - 4,
        size: 11,
        font: fontBold,
        color: red,
      });
    }
  });

  // ── COMPLET si aucun ajout ────────────────────────────
  const aucunAjout = !Object.values(manquants).some(v => (getManquantInfo(v).qte || 0) > 0);
  if (aucunAjout) {
    const green = rgb(0, 0.5, 0);
    const texte = 'COMPLET';
    const tw = fontBold.widthOfTextAtSize(texte, 20);
    const { width } = page.getSize();
    page.drawText(texte, {
      x: 100,
      y: 110,
      size: 15,
      font: fontBold,
      color: green,
    });
  }

  // ── Téléchargement ────────────────────────────────────

  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `RONA - S&S - Complet_${date}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

window.marquerComplete = function() {
  if (!locationActive) return;
  if (!ronaData.completes) ronaData.completes = [];

  const dejaComplete = ronaData.completes.includes(locationActive);

  if (!dejaComplete) {
    const loc = ronaData.locations.find(l => l.id === locationActive);
    if (loc && !toutRempli(loc)) { montrerItemsNonRemplis(loc); return; }
  }

  const btn = document.getElementById('btn-ok');

  if (dejaComplete) {
    // Annuler
    ronaData.completes = ronaData.completes.filter(id => id !== locationActive);
    btn.textContent = 'OK';
    btn.classList.remove('btn-annuler');
  } else {
    // Marquer complète
    ronaData.completes.push(locationActive);
    btn.textContent = 'Annuler';
    btn.classList.add('btn-annuler');
  }
  sauvegarder();
  afficherCompletes();
};

function afficherCompletes() {
  const bar = document.getElementById('completes-bar');
  if (!bar) return;
  if (!ronaData.completes) ronaData.completes = [];
  const count = ronaData.completes.length;
  const total = ronaData.locations.length;
  const compteur = `<span style="font-size:0.7rem;color:#555;margin-right:5px;">${count}/${total}</span>`;

  const triees = ronaData.completes
    .map(id => ronaData.locations.find(l => l.id === id))
    .filter(loc => loc)
    .sort((a, b) => a.nom.localeCompare(b.nom));

  bar.innerHTML = compteur + triees.map(loc => {
    return `<span style="background:#808080; color:#000; padding:0.25rem 0.6rem; border-radius:8px; font-size:0.8rem; font-weight:bold;">${loc.nom} ✅</span>`;
  }).join('');
}

window.genererToutPDF = async function() {
  if (!ronaData.locations || ronaData.locations.length === 0) {
    alert('Aucun emplacement à exporter.');
    return;
  }

  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const date = new Date().toLocaleDateString('fr-CA');

  // Charger le gabarit
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

  // Document final qui recevra toutes les pages
  const mergedPdf = await PDFDocument.create();

  // Filtrer et trier les emplacements qui ont une étiquette "complète"
  const locationsCompletes = ronaData.locations
    .filter(loc => ronaData.completes && ronaData.completes.includes(loc.id))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  let pagesAjoutees = 0;

  for (const loc of locationsCompletes) {
    const manquants = loc.manquants || {};

    // Créer un PDF temporaire à partir du gabarit
    const pdfDoc   = await PDFDocument.load(templateBytes);
    const page     = pdfDoc.getPages()[0];
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNorm = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const black    = rgb(0, 0, 0);
    const red      = rgb(0.7, 0, 0);

    // Nom + Emplacement + Date
    page.drawText('André Veilleux', { x: 200, y: 668, size: 11, font: fontBold, color: black });
    page.drawText(loc.nom, { x: 430, y: 668, size: 11, font: fontBold, color: black });
    page.drawText(date, { x: 125, y: 641, size: 11, font: fontBold, color: black });

    // Rangées
    const rowTops = [
      593.0, 567.8, 543.1, 518.2, 493.2, 468.2, 443.0, 418.6,
      393.6, 368.4, 343.2, 318.5, 293.3, 268.8, 243.8, 218.9,
      193.9, 169.0,
    ];
    const petiteWriteX = 312;

    ITEMS.forEach((item, idx) => {
      if (idx >= rowTops.length) return;

      const rowTop    = rowTops[idx];
      const nextTop   = rowTops[idx + 1] ?? (rowTop - 19);
      const rowHeight = rowTop - nextTop;

      const estManquant  = item.id in manquants;
      const { qte: qteManquante, type: manquantType } = getManquantInfo(manquants[item.id]);
      const qteM    = estManquant ? (qteManquante || 0) : 0;
      const present = item.qte - qteM;
      const isMissing = estManquant && qteM > 0;

      const writeY = rowTop - 12;
      page.drawText(String(present), {
        x: petiteWriteX,
        y: writeY,
        size: 10,
        font: isMissing ? fontBold : fontNorm,
        color: isMissing ? red : black,
      });

      if (isMissing) {
        const qStr  = String(qteM);
        const label = manquantType + ': ' + qStr;
        const tw    = fontBold.widthOfTextAtSize(qStr, 9);
        page.drawText(label, {
          x: 490 - tw / 2,
          y: rowTop - rowHeight / 2 - 4,
          size: 11,
          font: fontBold,
          color: red,
        });
      }
    });

    // ── COMPLET si aucun ajout ──────────────────────────
    const aucunAjout = !Object.values(manquants).some(v => (getManquantInfo(v).qte || 0) > 0);
    if (aucunAjout) {
      const green = rgb(0, 0.5, 0);
      const texte = 'COMPLET';
      const tw = fontBold.widthOfTextAtSize(texte, 20);
      const { width } = page.getSize();
      page.drawText(texte, {
        x: 100,
        y: 110,
        size: 15,
        font: fontBold,
        color: green,
      });
    }

    // Copier la page remplie dans le PDF fusionné
    const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
    mergedPdf.addPage(copiedPage);
    pagesAjoutees++;
  }

  if (pagesAjoutees === 0) {
    alert('Aucune étiquette complète à exporter.');
    return;
  }

  // Télécharger le PDF fusionné
  const pdfBytes = await mergedPdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `RONA - S&S - Complet_${date}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};


window.resetGlobal = function() {
  if (!confirm('Faire un RESET GLOBAL ?')) return;
  ronaData.locations.forEach(loc => { loc.manquants = {}; loc.complets = []; });
  ronaData.completes = [];
  masquerMessageValidation();
  
  sauvegarder();
  afficherCompletes();
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
