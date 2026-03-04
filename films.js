import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('films')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

const filmsDocRef = doc(db, "donnees", "films_global");

let filmsData = { items: [] };
let filtreType = null;   // null = Tous, "film", "serie"
let filtreStatut = null; // null = Tous, "a_voir", "en_cours", "vu"
let noteSelectionnee = 0;

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', () => {
  onSnapshot(filmsDocRef, (docSnap) => {
    if (docSnap.exists()) {
      filmsData = { items: [], ...docSnap.data() };
    } else {
      setDoc(filmsDocRef, filmsData);
    }
    afficherFiltresType();
    afficherFiltresStatut();
    afficherFilms();
  });

  // Gestion des étoiles dans le modal
  document.querySelectorAll('.etoile').forEach(etoile => {
    etoile.addEventListener('click', () => {
      noteSelectionnee = parseInt(etoile.dataset.val);
      document.getElementById('modal-note').value = noteSelectionnee;
      mettreAJourEtoiles(noteSelectionnee);
    });
    etoile.addEventListener('mouseover', () => {
      mettreAJourEtoiles(parseInt(etoile.dataset.val), true);
    });
    etoile.addEventListener('mouseout', () => {
      mettreAJourEtoiles(noteSelectionnee, false);
    });
  });
});

function mettreAJourEtoiles(valeur, survol = false) {
  document.querySelectorAll('.etoile').forEach(e => {
    const v = parseInt(e.dataset.val);
    if (v <= valeur) {
      e.classList.add(survol ? 'etoile-survol' : 'etoile-active');
      e.classList.remove(survol ? 'etoile-active' : 'etoile-survol');
    } else {
      e.classList.remove('etoile-active', 'etoile-survol');
    }
  });
}

// ===== FILTRES =====
function afficherFiltresType() {
  const nav = document.getElementById('type-nav');
  const types = [
    { val: null, label: '🎞️ Tous' },
    { val: 'film', label: '🎬 Films' },
    { val: 'serie', label: '📺 Séries' },
  ];
  nav.innerHTML = '';
  types.forEach(({ val, label }) => {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'sidebar-sublink' + (filtreType === val ? ' active' : '');
    a.textContent = label;
    a.onclick = (e) => { e.preventDefault(); filtreType = val; afficherFiltresType(); afficherFiltresStatut(); afficherFilms(); };
    nav.appendChild(a);
  });
}

function afficherFiltresStatut() {
  const nav = document.getElementById('statut-nav');
  const statuts = [
    { val: null, label: '📋 Tous' },
    { val: 'a_voir', label: '⏳ À voir' },
    { val: 'en_cours', label: '▶️ En cours' },
    { val: 'vu', label: '✅ Vus' },
  ];
  nav.innerHTML = '';
  statuts.forEach(({ val, label }) => {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'sidebar-sublink' + (filtreStatut === val ? ' active' : '');
    a.textContent = label;
    a.onclick = (e) => { e.preventDefault(); filtreStatut = val; afficherFiltresStatut(); afficherFilms(); };
    nav.appendChild(a);
  });
}

// ===== AFFICHAGE =====
function afficherFilms() {
  const container = document.getElementById('films-container');
  const statsEl = document.getElementById('films-stats');
  container.innerHTML = '';

  let items = filmsData.items;
  if (filtreType !== null) items = items.filter(i => i.type === filtreType);
  if (filtreStatut !== null) items = items.filter(i => i.statut === filtreStatut);

  // Mise à jour du titre
  const labelType = filtreType === 'film' ? 'Films' : filtreType === 'serie' ? 'Séries' : 'Tous';
  const labelStatut = filtreStatut === 'a_voir' ? ' — À voir' : filtreStatut === 'en_cours' ? ' — En cours' : filtreStatut === 'vu' ? ' — Vus' : '';
  document.getElementById('titre-section').textContent = labelType + labelStatut;

  // Stats rapides
  const total = filmsData.items.length;
  const films = filmsData.items.filter(i => i.type === 'film').length;
  const series = filmsData.items.filter(i => i.type === 'serie').length;
  const vus = filmsData.items.filter(i => i.statut === 'vu').length;
  statsEl.innerHTML = `
    <span class="film-stat-badge">📦 ${total} titre${total > 1 ? 's' : ''}</span>
    <span class="film-stat-badge">🎬 ${films} film${films > 1 ? 's' : ''}</span>
    <span class="film-stat-badge">📺 ${series} série${series > 1 ? 's' : ''}</span>
    <span class="film-stat-badge">✅ ${vus} vu${vus > 1 ? 's' : ''}</span>
  `;

  if (items.length === 0) {
    container.innerHTML = `<p class="notes-empty">Aucun titre trouvé pour ces filtres.</p>`;
    return;
  }

  // Tri : en cours en premier, puis à voir, puis vus
  const ordre = { en_cours: 0, a_voir: 1, vu: 2 };
  items = [...items].sort((a, b) => (ordre[a.statut] ?? 3) - (ordre[b.statut] ?? 3));

  items.forEach((item) => {
    const vraiIndex = filmsData.items.indexOf(item);
    const card = document.createElement('div');
    card.className = 'film-card';

    const etoiles = item.note ? '★'.repeat(item.note) + '☆'.repeat(5 - item.note) : '☆☆☆☆☆';
    const badgeStatut = {
      a_voir: '<span class="film-badge badge-a-voir">⏳ À voir</span>',
      en_cours: '<span class="film-badge badge-en-cours">▶️ En cours</span>',
      vu: '<span class="film-badge badge-vu">✅ Vu</span>',
    }[item.statut] || '';

    const badgeType = item.type === 'film'
      ? '<span class="film-type-badge">🎬 Film</span>'
      : '<span class="film-type-badge serie">📺 Série</span>';

    card.innerHTML = `
      <div class="film-card-header">
        <div class="film-card-meta">
          ${badgeType}
          ${badgeStatut}
        </div>
        <div class="note-actions">
          <button class="btn-edit" onclick="ouvrirModalEdit(${vraiIndex})" title="Modifier">✏️</button>
          <button class="btn-delete" onclick="supprimerFilm(${vraiIndex})" title="Supprimer">🗑️</button>
        </div>
      </div>
      <h3 class="film-titre">${item.titre}</h3>
      <div class="film-infos">
        ${item.genre ? `<span class="film-genre">${item.genre}</span>` : ''}
        ${item.annee ? `<span class="film-annee">${item.annee}</span>` : ''}
      </div>
      ${item.statut === 'vu' ? `<div class="film-etoiles" title="${item.note || 0}/5">${etoiles}</div>` : ''}
      ${item.commentaire ? `<p class="film-commentaire">${item.commentaire}</p>` : ''}
    `;
    container.appendChild(card);
  });
}

// ===== MODAL =====
window.ouvrirModal = () => {
  document.getElementById('modal-titre-label').textContent = 'Nouveau titre';
  document.getElementById('modal-titre').value = '';
  document.getElementById('modal-type').value = 'film';
  document.getElementById('modal-genre').value = '';
  document.getElementById('modal-annee').value = '';
  document.getElementById('modal-statut').value = 'a_voir';
  document.getElementById('modal-commentaire').value = '';
  noteSelectionnee = 0;
  document.getElementById('modal-note').value = '0';
  mettreAJourEtoiles(0);
  document.getElementById('modal-save-btn').onclick = () => sauvegarder(null);
  document.getElementById('modal-film').classList.remove('hidden');
};

window.ouvrirModalEdit = (index) => {
  const item = filmsData.items[index];
  document.getElementById('modal-titre-label').textContent = 'Modifier le titre';
  document.getElementById('modal-titre').value = item.titre;
  document.getElementById('modal-type').value = item.type;
  document.getElementById('modal-genre').value = item.genre || '';
  document.getElementById('modal-annee').value = item.annee || '';
  document.getElementById('modal-statut').value = item.statut;
  document.getElementById('modal-commentaire').value = item.commentaire || '';
  noteSelectionnee = item.note || 0;
  document.getElementById('modal-note').value = noteSelectionnee;
  mettreAJourEtoiles(noteSelectionnee);
  document.getElementById('modal-save-btn').onclick = () => sauvegarder(index);
  document.getElementById('modal-film').classList.remove('hidden');
};

window.fermerModal = () => document.getElementById('modal-film').classList.add('hidden');

function sauvegarder(index) {
  const titre = document.getElementById('modal-titre').value.trim();
  if (!titre) return;

  const nouvelItem = {
    titre,
    type: document.getElementById('modal-type').value,
    genre: document.getElementById('modal-genre').value.trim(),
    annee: parseInt(document.getElementById('modal-annee').value) || null,
    statut: document.getElementById('modal-statut').value,
    note: parseInt(document.getElementById('modal-note').value) || 0,
    commentaire: document.getElementById('modal-commentaire').value.trim(),
  };

  if (index !== null) {
    filmsData.items[index] = nouvelItem;
  } else {
    filmsData.items.push(nouvelItem);
  }

  setDoc(filmsDocRef, filmsData);
  fermerModal();
}

window.supprimerFilm = (index) => {
  const item = filmsData.items[index];
  if (!confirm(`Supprimer "${item.titre}" de ta liste ?`)) return;
  filmsData.items.splice(index, 1);
  setDoc(filmsDocRef, filmsData);
};
