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
  const imageParTitre = {
    "Inception":                  "https://image.tmdb.org/t/p/w300/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg",
    "Interstellar":               "https://image.tmdb.org/t/p/w300/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    "The Dark Knight":            "https://image.tmdb.org/t/p/w300/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    "Dune":                       "https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
    "Oppenheimer":                "https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
    "Avatar: La Voie de l'eau":   "https://image.tmdb.org/t/p/w300/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg",
    "Top Gun: Maverick":          "https://image.tmdb.org/t/p/w300/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",
    "Le Comte de Monte-Cristo":   "https://image.tmdb.org/t/p/w300/sAT1P3FGhtJ68anUyJScnMu8t1l.jpg",
    "Killers of the Flower Moon": "https://image.tmdb.org/t/p/w300/dB6Krk806zeqd0YNp2ngQ9zXteH.jpg",
    "Poor Things":                "https://image.tmdb.org/t/p/w300/kCGlIMHnOm8JPXq3rXM6c5wMxcT.jpg",
    "Breaking Bad":               "https://image.tmdb.org/t/p/w300/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg",
    "Game of Thrones":            "https://image.tmdb.org/t/p/w300/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    "Stranger Things":            "https://image.tmdb.org/t/p/w300/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg",
    "The Last of Us":             "https://image.tmdb.org/t/p/w300/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg",
    "The Bear":                   "https://image.tmdb.org/t/p/w300/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg",
    "Shogun":                     "https://image.tmdb.org/t/p/w300/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg",
    "Severance":                  "https://image.tmdb.org/t/p/w300/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
    "Succession":                 "https://image.tmdb.org/t/p/w300/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg",
    "The White Lotus":            "https://image.tmdb.org/t/p/w300/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg",
    "Andor":                      "https://image.tmdb.org/t/p/w300/khZqmwHQicTYoS7Flreb9EddFZC.jpg",
  };

  const donneesDemo = {
    items: [
      { titre: "Inception", type: "film", genre: "Sci-Fi", annee: 2010, statut: "vu", note: 5, commentaire: "Chef-d'œuvre de Nolan", image: imageParTitre["Inception"] },
      { titre: "Interstellar", type: "film", genre: "Sci-Fi", annee: 2014, statut: "vu", note: 5, commentaire: "", image: imageParTitre["Interstellar"] },
      { titre: "The Dark Knight", type: "film", genre: "Action", annee: 2008, statut: "vu", note: 5, commentaire: "Le meilleur Batman", image: imageParTitre["The Dark Knight"] },
      { titre: "Dune", type: "film", genre: "Sci-Fi", annee: 2021, statut: "vu", note: 4, commentaire: "", image: imageParTitre["Dune"] },
      { titre: "Oppenheimer", type: "film", genre: "Drame", annee: 2023, statut: "vu", note: 4, commentaire: "", image: imageParTitre["Oppenheimer"] },
      { titre: "Avatar: La Voie de l'eau", type: "film", genre: "Sci-Fi", annee: 2022, statut: "vu", note: 3, commentaire: "Visuellement impressionnant", image: imageParTitre["Avatar: La Voie de l'eau"] },
      { titre: "Top Gun: Maverick", type: "film", genre: "Action", annee: 2022, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Top Gun: Maverick"] },
      { titre: "Le Comte de Monte-Cristo", type: "film", genre: "Aventure", annee: 2024, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Le Comte de Monte-Cristo"] },
      { titre: "Killers of the Flower Moon", type: "film", genre: "Drame", annee: 2023, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Killers of the Flower Moon"] },
      { titre: "Poor Things", type: "film", genre: "Drame", annee: 2023, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Poor Things"] },
      { titre: "Breaking Bad", type: "serie", genre: "Drame", annee: 2008, statut: "vu", note: 5, commentaire: "La meilleure série de tous les temps", image: imageParTitre["Breaking Bad"] },
      { titre: "Game of Thrones", type: "serie", genre: "Fantasy", annee: 2011, statut: "vu", note: 4, commentaire: "Saisons 1-6 excellentes", image: imageParTitre["Game of Thrones"] },
      { titre: "Stranger Things", type: "serie", genre: "Sci-Fi", annee: 2016, statut: "en_cours", note: 0, commentaire: "Saison 4 en cours", image: imageParTitre["Stranger Things"] },
      { titre: "The Last of Us", type: "serie", genre: "Drame", annee: 2023, statut: "vu", note: 5, commentaire: "", image: imageParTitre["The Last of Us"] },
      { titre: "The Bear", type: "serie", genre: "Drame", annee: 2022, statut: "en_cours", note: 0, commentaire: "Saison 3 à terminer", image: imageParTitre["The Bear"] },
      { titre: "Shogun", type: "serie", genre: "Historique", annee: 2024, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Shogun"] },
      { titre: "Severance", type: "serie", genre: "Sci-Fi", annee: 2022, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Severance"] },
      { titre: "Succession", type: "serie", genre: "Drame", annee: 2018, statut: "vu", note: 5, commentaire: "", image: imageParTitre["Succession"] },
      { titre: "The White Lotus", type: "serie", genre: "Drame", annee: 2021, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["The White Lotus"] },
      { titre: "Andor", type: "serie", genre: "Sci-Fi", annee: 2022, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Andor"] },
    ]
  };

  onSnapshot(filmsDocRef, (docSnap) => {
    if (docSnap.exists()) {
      filmsData = { items: [], ...docSnap.data() };
      if (filmsData.items.length === 0) {
        filmsData = donneesDemo;
        setDoc(filmsDocRef, filmsData);
      } else if (!filmsData.dataVersion || filmsData.dataVersion < 2) {
        // Migration v2 : correction des URLs d'images
        filmsData.items = filmsData.items.map(i => ({
          ...i,
          image: imageParTitre[i.titre] !== undefined ? imageParTitre[i.titre] : (i.image || ""),
        }));
        filmsData.dataVersion = 2;
        setDoc(filmsDocRef, filmsData);
      }
    } else {
      filmsData = donneesDemo;
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

  document.getElementById('btn-reset-note').addEventListener('click', () => {
    noteSelectionnee = 0;
    document.getElementById('modal-note').value = 0;
    mettreAJourEtoiles(0);
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
function creerCarteFilm(item, vraiIndex) {
  const card = document.createElement('div');
  card.className = 'film-card';

  const etoiles = item.note ? '★'.repeat(item.note) + '☆'.repeat(5 - item.note) : '☆☆☆☆☆';
  const badgeStatut = {
    a_voir: '<span class="film-badge badge-a-voir">⏳ À voir</span>',
    en_cours: '<span class="film-badge badge-en-cours">▶️ En cours</span>',
    vu: '<span class="film-badge badge-vu">✅ Vu</span>',
  }[item.statut] || '';

  const posterHtml = item.image
    ? `<img class="film-poster" src="${item.image}" alt="${item.titre}" loading="lazy"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholderVisible = item.image ? 'none' : 'flex';

  card.innerHTML = `
    ${posterHtml}
    <div class="film-poster-placeholder" style="display:${placeholderVisible}">
      ${item.type === 'film' ? '🎬' : '📺'}
    </div>
    <div class="film-card-body">
      <div class="film-card-header">
        <div class="film-card-meta">${badgeStatut}</div>
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
    </div>
  `;
  return card;
}

function remplirGrille(grid, items) {
  grid.innerHTML = '';
  if (items.length === 0) {
    grid.innerHTML = `<p class="notes-empty">Aucun titre trouvé pour ces filtres.</p>`;
    return;
  }
  const ordre = { en_cours: 0, a_voir: 1, vu: 2 };
  [...items]
    .sort((a, b) => (ordre[a.statut] ?? 3) - (ordre[b.statut] ?? 3))
    .forEach(item => grid.appendChild(creerCarteFilm(item, filmsData.items.indexOf(item))));
}

function afficherFilms() {
  const sectionFilms = document.getElementById('section-films');
  const sectionSeries = document.getElementById('section-series');
  const gridFilms = document.getElementById('grid-films');
  const gridSeries = document.getElementById('grid-series');
  const statsEl = document.getElementById('films-stats');

  // Mise à jour du titre
  const labelType = filtreType === 'film' ? 'Films' : filtreType === 'serie' ? 'Séries' : 'Tous';
  const labelStatut = filtreStatut === 'a_voir' ? ' — À voir' : filtreStatut === 'en_cours' ? ' — En cours' : filtreStatut === 'vu' ? ' — Vus' : '';
  document.getElementById('titre-section').textContent = labelType + labelStatut;

  // Stats rapides
  const total = filmsData.items.length;
  const nbFilms = filmsData.items.filter(i => i.type === 'film').length;
  const nbSeries = filmsData.items.filter(i => i.type === 'serie').length;
  const vus = filmsData.items.filter(i => i.statut === 'vu').length;
  statsEl.innerHTML = `
    <span class="film-stat-badge">📦 ${total} titre${total > 1 ? 's' : ''}</span>
    <span class="film-stat-badge">🎬 ${nbFilms} film${nbFilms > 1 ? 's' : ''}</span>
    <span class="film-stat-badge">📺 ${nbSeries} série${nbSeries > 1 ? 's' : ''}</span>
    <span class="film-stat-badge">✅ ${vus} vu${vus > 1 ? 's' : ''}</span>
  `;

  let items = filmsData.items;
  if (filtreStatut !== null) items = items.filter(i => i.statut === filtreStatut);

  // Afficher/masquer les sections selon le filtre de type
  sectionFilms.style.display = filtreType === 'serie' ? 'none' : 'block';
  sectionSeries.style.display = filtreType === 'film' ? 'none' : 'block';

  if (filtreType !== 'serie') remplirGrille(gridFilms, items.filter(i => i.type === 'film'));
  if (filtreType !== 'film') remplirGrille(gridSeries, items.filter(i => i.type === 'serie'));
}

// ===== MODAL =====
window.ouvrirModal = () => {
  document.getElementById('modal-titre-label').textContent = 'Nouveau titre';
  document.getElementById('modal-titre').value = '';
  document.getElementById('modal-image').value = '';
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
  document.getElementById('modal-image').value = item.image || '';
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
    image: document.getElementById('modal-image').value.trim(),
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
