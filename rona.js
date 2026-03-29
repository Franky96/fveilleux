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
    qte: 25 },
  { id:'02', court:'Bandage élastique 5,1 cm',
    long:'Bandages élastiques, longueur non étirée, emballés individuellement, 5,1 cm × 1,8 m (2 po × 2 verges)',
    qte: 1 },
  { id:'03', court:'Bandage élastique 7,6 cm',
    long:'Bandages élastiques, longueur non étirée, emballés individuellement, 7,6 cm × 1,8 m (3 po × 2 verges)',
    qte: 1 },
  { id:'04', court:'Ciseaux à bandage',
    long:'Ciseaux à bandage en acier inoxydable (avec pointe en angle, arrondie), minimum 14 cm (5,5 po)',
    qte: 1 },
  { id:'05', court:'Compresses de gaze 7,6 cm',
    long:'Compresses de gaze, stériles, emballées individuellement, 7,6 cm × 7,6 cm (3 po × 3 po)',
    qte: 12 },
  { id:'06', court:'Compresses compressives 10,2 cm',
    long:'Compresses ou pansements compressifs avec attaches, stériles, 10,2 cm × 10,2 cm (4 po × 4 po)',
    qte: 2 },
  { id:'07', court:'Écharpe triangulaire',
    long:'Écharpe triangulaire, coton, avec 2 épingles de sécurité, 101,6 cm × 101,6 cm × 142,2 cm',
    qte: 2 },
  { id:'08', court:'Lingettes antiseptiques',
    long:'Lingettes de nettoyage des plaies, antiseptiques, emballées individuellement',
    qte: 25 },
  { id:'09', court:'Pince à écharde',
    long:'Pince à écharde ou pince à épiler (pointe fine, acier inoxydable, minimum 11,4 cm (4,5 po))',
    qte: 1 },
  { id:'10', court:'Ruban adhésif (diachylon)',
    long:'Ruban adhésif (diachylon), 2,5 cm (1 po) – en mètre',
    qte: 2.3 },
  { id:'11', court:'Dispositif RCP',
    long:'Dispositif de barrière pour réanimation cardio-pulmonaire (RCP), avec clapet unidirectionnel',
    qte: 1 },
  { id:'12', court:"Gants d'examen (paires)",
    long:"Gants d'examen, jetables de qualité médicale, taille unique, sans latex, sans poudre (nombre de paires)",
    qte: 4 },
  { id:'13', court:'Compresses abdominales',
    long:'Compresses abdominales, stériles, emballées individuellement, 12,7 cm × 22,9 cm (5 po × 9 po)',
    qte: 1 },
  { id:'14', court:'Couverture de secours',
    long:'Couverture de secours, en aluminium, en polyester non extensible, minimum 132 cm × 213 cm (52 po × 84 po)',
    qte: 1 },
  { id:'15', court:'Lingettes mains / peau',
    long:'Lingettes de nettoyage des mains et de la peau, emballées individuellement (ou équivalent)',
    qte: 6 },
  { id:'16', court:'Onguents antibiotiques',
    long:'Onguents antibiotiques, topiques, à usage unique',
    qte: 6 },
  { id:'17', court:'Sac déchets biomédicaux',
    long:'Sac pour le recueil de déchets biomédicaux, à usage unique',
    qte: 1 },
  { id:'18', court:'Liste du contenu',
    long:'Liste du contenu de la trousse',
    qte: 1 },
];

// ── Firebase ──────────────────────────────────────────
const ronaDocRef = doc(db, "donnees", "rona_global");

const EMPLACEMENTS_DEFAUT = [
  'Comptoir retour', 'Cour à bois', 'Infirmerie', 'Location',
  'Peinture', 'Plomberie', 'Réception', 'Salle de coupe',
];

let ronaData = { locations: [] };
let locationActive = null;
let itemEnCours = null;

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
  const statusBar = document.getElementById('status-bar');

  if (!locationActive) {
    grid.innerHTML = `<div class="rona-empty">
      <span>👷‍♂️</span>Choisis un emplacement ci-dessus, ou crée-en un avec <strong>+</strong>.
    </div>`;
    statusBar.style.display = 'none';
    return;
  }

  const loc = ronaData.locations.find(l => l.id === locationActive);
  if (!loc) return;
  const manquants = loc.manquants || {};

  const nbManquants = ITEMS.filter(it => manquants[it.id] > 0).length;

  statusBar.style.display = 'flex';
  const countEl = document.getElementById('status-count');
  if (nbManquants === 0) {
    countEl.textContent = '✓ Tout complet';
    countEl.className = 'status-count ok';
  } else {
    countEl.textContent = `${nbManquants} article${nbManquants > 1 ? 's' : ''} manquant${nbManquants > 1 ? 's' : ''}`;
    countEl.className = 'status-count alert';
  }

  grid.innerHTML = '';
  ITEMS.forEach(item => {
    const qteManquante = manquants[item.id] || 0;
    const present = item.qte - qteManquante;
    const estManquant = qteManquante > 0;

    const card = document.createElement('div');
    card.className = 'item-card' + (estManquant ? ' manquant' : '');
    card.onclick = () => ouvrirModalItem(item, loc);
    card.innerHTML = `
      <span class="item-fraction">${present}/${item.qte}</span>
      <span class="item-nom">${item.court}</span>
      ${estManquant ? `<span class="item-manquant-label">manque : ${qteManquante}</span>` : ''}
    `;
    grid.appendChild(card);
  });
}

// ── Modal article ─────────────────────────────────────

function ouvrirModalItem(item, loc) {
  itemEnCours = { item, loc };
  const actuel = (loc.manquants || {})[item.id] || 0;

  document.getElementById('modal-item-nom').textContent = item.court;
  document.getElementById('modal-item-total').textContent = item.long;
  document.getElementById('modal-qte').value = actuel > 0 ? actuel : '';
  document.getElementById('modal-qte').max = item.qte;
  document.getElementById('modal-item').classList.remove('hidden');
  setTimeout(() => document.getElementById('modal-qte').focus(), 100);
}

window.fermerModalItem = function() {
  document.getElementById('modal-item').classList.add('hidden');
  itemEnCours = null;
};

window.sauvegarderManquant = function() {
  if (!itemEnCours) return;
  const { item, loc } = itemEnCours;
  const val = parseInt(document.getElementById('modal-qte').value) || 0;
  const qte = Math.min(val, item.qte);
  if (!loc.manquants) loc.manquants = {};
  if (qte <= 0) delete loc.manquants[item.id];
  else loc.manquants[item.id] = qte;
  sauvegarder();
  fermerModalItem();
};

window.marquerComplet = function() {
  if (!itemEnCours) return;
  const { item, loc } = itemEnCours;
  if (loc.manquants) delete loc.manquants[item.id];
  sauvegarder();
  fermerModalItem();
};

window.toutMarquerComplet = function() {
  const loc = ronaData.locations.find(l => l.id === locationActive);
  if (!loc) return;
  loc.manquants = {};
  sauvegarder();
};

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

// ── Erreur Firebase ───────────────────────────────────

function afficherErreurFirebase(code) {
  if (document.getElementById('firebase-err-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'firebase-err-banner';
  banner.style.cssText = 'background:#c0392b;color:#fff;padding:0.8rem 1rem;text-align:center;font-weight:bold;font-size:0.9rem;position:sticky;top:0;z-index:9999;';
  banner.textContent = `⚠️ Erreur Firebase (${code}) — Mets à jour les règles dans la console Firebase.`;
  document.body.prepend(banner);
}
