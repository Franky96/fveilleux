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
let detailIndex = null;

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
      { titre: "Inception", type: "film", genre: "Sci-Fi", annee: 2010, statut: "vu", note: 5, commentaire: "Chef-d'œuvre de Nolan", image: imageParTitre["Inception"], realisateur: "Christopher Nolan", acteurs: "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page", synopsis: "Un voleur spécialisé dans l'art d'extraire des secrets depuis les rêves de ses cibles reçoit une mission impossible : implanter une idée dans l'esprit d'un homme.", duree: 148, trailer_youtube: "YoHD9XEInc0" },
      { titre: "Interstellar", type: "film", genre: "Sci-Fi", annee: 2014, statut: "vu", note: 5, commentaire: "", image: imageParTitre["Interstellar"], realisateur: "Christopher Nolan", acteurs: "Matthew McConaughey, Anne Hathaway, Jessica Chastain", synopsis: "Face à une Terre mourante, un groupe d'astronautes traverse un trou de ver pour trouver une nouvelle planète habitable pour l'humanité.", duree: 169, trailer_youtube: "" },
      { titre: "The Dark Knight", type: "film", genre: "Action", annee: 2008, statut: "vu", note: 5, commentaire: "Le meilleur Batman", image: imageParTitre["The Dark Knight"], realisateur: "Christopher Nolan", acteurs: "Christian Bale, Heath Ledger, Aaron Eckhart", synopsis: "Batman affronte le Joker, un anarchiste criminel qui sème le chaos à Gotham City et met à l'épreuve les limites morales du héros.", duree: 152, trailer_youtube: "EXeTwQWrcwY" },
      { titre: "Dune", type: "film", genre: "Sci-Fi", annee: 2021, statut: "vu", note: 4, commentaire: "", image: imageParTitre["Dune"], realisateur: "Denis Villeneuve", acteurs: "Timothée Chalamet, Rebecca Ferguson, Oscar Isaac", synopsis: "Paul Atréides doit voyager vers la planète la plus dangereuse de l'univers pour assurer l'avenir de sa famille et de son peuple.", duree: 155, trailer_youtube: "n9xhJrPXop4" },
      { titre: "Oppenheimer", type: "film", genre: "Drame", annee: 2023, statut: "vu", note: 4, commentaire: "", image: imageParTitre["Oppenheimer"], realisateur: "Christopher Nolan", acteurs: "Cillian Murphy, Emily Blunt, Matt Damon", synopsis: "L'histoire du physicien J. Robert Oppenheimer et de son rôle crucial dans le développement de la première bombe atomique.", duree: 181, trailer_youtube: "uYPbbksJxIg" },
      { titre: "Avatar: La Voie de l'eau", type: "film", genre: "Sci-Fi", annee: 2022, statut: "vu", note: 3, commentaire: "Visuellement impressionnant", image: imageParTitre["Avatar: La Voie de l'eau"], realisateur: "James Cameron", acteurs: "Sam Worthington, Zoe Saldana, Sigourney Weaver", synopsis: "Jake Sully et Neytiri ont fondé une famille sur Pandora. Menacés par le retour des humains, ils fuient vers les tribus marines des îles.", duree: 192, trailer_youtube: "a8Gx8wiNbs8" },
      { titre: "Top Gun: Maverick", type: "film", genre: "Action", annee: 2022, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Top Gun: Maverick"], realisateur: "Joseph Kosinski", acteurs: "Tom Cruise, Miles Teller, Jennifer Connelly", synopsis: "Après plus de 30 ans de carrière, Pete Mitchell est toujours pilote de chasse et doit entraîner les meilleurs diplômés de Top Gun pour une mission périlleuse.", duree: 130, trailer_youtube: "giXco2jaZ_4" },
      { titre: "Le Comte de Monte-Cristo", type: "film", genre: "Aventure", annee: 2024, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Le Comte de Monte-Cristo"], realisateur: "Matthieu Delaporte, Alexandre de la Patellière", acteurs: "Pierre Niney, Anaïs Demoustier, Bastien Bouillon", synopsis: "Edmond Dantès, trahi et emprisonné injustement, s'évade et revient sous une nouvelle identité pour se venger de ceux qui l'ont condamné.", duree: 178, trailer_youtube: "" },
      { titre: "Killers of the Flower Moon", type: "film", genre: "Drame", annee: 2023, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Killers of the Flower Moon"], realisateur: "Martin Scorsese", acteurs: "Leonardo DiCaprio, Robert De Niro, Lily Gladstone", synopsis: "L'histoire vraie d'une série de meurtres orchestrés contre des membres de la nation Osage dans l'Oklahoma des années 1920, après la découverte de pétrole sur leurs terres.", duree: 206, trailer_youtube: "EP34Yoxs3FQ" },
      { titre: "Poor Things", type: "film", genre: "Drame", annee: 2023, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Poor Things"], realisateur: "Yorgos Lanthimos", acteurs: "Emma Stone, Mark Ruffalo, Willem Dafoe", synopsis: "L'incroyable odyssée de Bella Baxter, une jeune femme ramenée à la vie par le brillant mais excentrique Dr Godwin Baxter, qui part à la découverte du monde.", duree: 141, trailer_youtube: "RlbR5N6veqw" },
      { titre: "Breaking Bad", type: "serie", genre: "Drame", annee: 2008, statut: "vu", note: 5, commentaire: "La meilleure série de tous les temps", image: imageParTitre["Breaking Bad"], realisateur: "Vince Gilligan", acteurs: "Bryan Cranston, Aaron Paul, Anna Gunn", synopsis: "Walter White, professeur de chimie atteint d'un cancer, se lance dans la fabrication de méthamphétamine avec un ancien élève pour assurer l'avenir de sa famille.", nb_saisons: 5, trailer_youtube: "" },
      { titre: "Game of Thrones", type: "serie", genre: "Fantasy", annee: 2011, statut: "vu", note: 4, commentaire: "Saisons 1-6 excellentes", image: imageParTitre["Game of Thrones"], realisateur: "David Benioff, D.B. Weiss", acteurs: "Peter Dinklage, Emilia Clarke, Kit Harington", synopsis: "Des familles nobles se battent pour le contrôle du trône de fer des Sept Couronnes, tandis qu'une menace surnaturelle monte du Grand Nord.", nb_saisons: 8, trailer_youtube: "KPLWWIDQ8l4" },
      { titre: "Stranger Things", type: "serie", genre: "Sci-Fi", annee: 2016, statut: "en_cours", note: 0, commentaire: "Saison 4 en cours", image: imageParTitre["Stranger Things"], realisateur: "Matt Duffer, Ross Duffer", acteurs: "Millie Bobby Brown, Finn Wolfhard, Winona Ryder", synopsis: "Dans les années 80, la disparition d'un enfant révèle des expériences gouvernementales secrètes et une dimension parallèle terrifiante.", nb_saisons: 4, trailer_youtube: "b9EkMc79ZSU" },
      { titre: "The Last of Us", type: "serie", genre: "Drame", annee: 2023, statut: "vu", note: 5, commentaire: "", image: imageParTitre["The Last of Us"], realisateur: "Craig Mazin, Neil Druckmann", acteurs: "Pedro Pascal, Bella Ramsey", synopsis: "Dans un monde post-apocalyptique ravagé par un champignon infectieux, un contrebandier doit escorter une adolescente immunisée à travers les États-Unis.", nb_saisons: 2, trailer_youtube: "uLtkt8BonwM" },
      { titre: "The Bear", type: "serie", genre: "Drame", annee: 2022, statut: "en_cours", note: 0, commentaire: "Saison 3 à terminer", image: imageParTitre["The Bear"], realisateur: "Christopher Storer", acteurs: "Jeremy Allen White, Ebon Moss-Bachrach, Ayo Edebiri", synopsis: "Un jeune chef étoilé revient dans sa ville natale pour diriger le modeste sandwich shop de sa famille après la mort tragique de son frère.", nb_saisons: 3, trailer_youtube: "" },
      { titre: "Shogun", type: "serie", genre: "Historique", annee: 2024, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Shogun"], realisateur: "Rachel Kondo, Caillin Puttick", acteurs: "Hiroyuki Sanada, Cosmo Jarvis, Anna Sawai", synopsis: "Au Japon féodal du XVIIe siècle, un navigateur anglais s'allie à un seigneur de guerre ambitieux dans un conflit de pouvoir complexe qui changera leur destin.", nb_saisons: 1, trailer_youtube: "FLB3J9zCiDE" },
      { titre: "Severance", type: "serie", genre: "Sci-Fi", annee: 2022, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Severance"], realisateur: "Dan Erickson", acteurs: "Adam Scott, Patricia Arquette, John Turturro", synopsis: "Des employés subissent une procédure chirurgicale qui sépare leurs souvenirs professionnels et personnels, ne gardant aucune mémoire de leur vie hors du bureau.", nb_saisons: 2, trailer_youtube: "" },
      { titre: "Succession", type: "serie", genre: "Drame", annee: 2018, statut: "vu", note: 5, commentaire: "", image: imageParTitre["Succession"], realisateur: "Jesse Armstrong", acteurs: "Brian Cox, Jeremy Strong, Sarah Snook", synopsis: "Les enfants d'un magnat vieillissant des médias se livrent une guerre impitoyable pour prendre le contrôle de l'empire familial.", nb_saisons: 4, trailer_youtube: "" },
      { titre: "The White Lotus", type: "serie", genre: "Drame", annee: 2021, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["The White Lotus"], realisateur: "Mike White", acteurs: "Jennifer Coolidge, Murray Bartlett, Connie Britton", synopsis: "Le séjour de touristes privilégiés dans un hôtel de luxe hawaïen révèle les tensions cachées et les hypocrisies de la société moderne.", nb_saisons: 3, trailer_youtube: "WHFgLNVKGBc" },
      { titre: "Andor", type: "serie", genre: "Sci-Fi", annee: 2022, statut: "a_voir", note: 0, commentaire: "", image: imageParTitre["Andor"], realisateur: "Tony Gilroy", acteurs: "Diego Luna, Stellan Skarsgård, Genevieve O'Reilly", synopsis: "Les débuts de la rébellion contre l'Empire galactique, vus à travers les aventures de Cassian Andor dans cet univers Star Wars sombre et politique.", nb_saisons: 2, trailer_youtube: "cKOegEuCcfw" },
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

  // Toggle champs durée / saisons selon le type
  document.getElementById('modal-type').addEventListener('change', toggleTypeFields);
  toggleTypeFields();

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

function toggleTypeFields() {
  const type = document.getElementById('modal-type').value;
  document.getElementById('modal-duree-row').style.display = type === 'film' ? 'block' : 'none';
  document.getElementById('modal-saisons-row').style.display = type === 'serie' ? 'block' : 'none';
}

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
  card.addEventListener('click', () => ouvrirDetail(vraiIndex));

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
          <button class="btn-edit" onclick="event.stopPropagation(); ouvrirModalEdit(${vraiIndex})" title="Modifier">✏️</button>
          <button class="btn-delete" onclick="event.stopPropagation(); supprimerFilm(${vraiIndex})" title="Supprimer">🗑️</button>
        </div>
      </div>
      <h3 class="film-titre">${item.titre}</h3>
      <div class="film-infos">
        ${item.genre ? `<span class="film-genre">${item.genre}</span>` : ''}
        ${item.annee ? `<span class="film-annee">${item.annee}</span>` : ''}
      </div>
      ${item.statut === 'vu' && item.note > 0 ? `<div class="film-etoiles" title="${item.note}/5">${etoiles}</div>` : ''}
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
  document.getElementById('modal-duree').value = '';
  document.getElementById('modal-nb-saisons').value = '';
  document.getElementById('modal-realisateur').value = '';
  document.getElementById('modal-acteurs').value = '';
  document.getElementById('modal-synopsis').value = '';
  document.getElementById('modal-trailer').value = '';
  document.getElementById('modal-statut').value = 'a_voir';
  document.getElementById('modal-commentaire').value = '';
  noteSelectionnee = 0;
  document.getElementById('modal-note').value = '0';
  mettreAJourEtoiles(0);
  toggleTypeFields();
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
  document.getElementById('modal-duree').value = item.duree || '';
  document.getElementById('modal-nb-saisons').value = item.nb_saisons || '';
  document.getElementById('modal-realisateur').value = item.realisateur || '';
  document.getElementById('modal-acteurs').value = item.acteurs || '';
  document.getElementById('modal-synopsis').value = item.synopsis || '';
  document.getElementById('modal-trailer').value = item.trailer_youtube || '';
  document.getElementById('modal-statut').value = item.statut;
  document.getElementById('modal-commentaire').value = item.commentaire || '';
  noteSelectionnee = item.note || 0;
  document.getElementById('modal-note').value = noteSelectionnee;
  mettreAJourEtoiles(noteSelectionnee);
  toggleTypeFields();
  document.getElementById('modal-save-btn').onclick = () => sauvegarder(index);
  document.getElementById('modal-film').classList.remove('hidden');
};

window.fermerModal = () => document.getElementById('modal-film').classList.add('hidden');

function sauvegarder(index) {
  const titre = document.getElementById('modal-titre').value.trim();
  if (!titre) return;

  const type = document.getElementById('modal-type').value;
  const nouvelItem = {
    titre,
    image: document.getElementById('modal-image').value.trim(),
    type,
    genre: document.getElementById('modal-genre').value.trim(),
    annee: parseInt(document.getElementById('modal-annee').value) || null,
    duree: type === 'film' ? (parseInt(document.getElementById('modal-duree').value) || null) : null,
    nb_saisons: type === 'serie' ? (parseInt(document.getElementById('modal-nb-saisons').value) || null) : null,
    realisateur: document.getElementById('modal-realisateur').value.trim(),
    acteurs: document.getElementById('modal-acteurs').value.trim(),
    synopsis: document.getElementById('modal-synopsis').value.trim(),
    trailer_youtube: document.getElementById('modal-trailer').value.trim(),
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

// ===== MODAL DÉTAIL =====
function extraireVideoId(input) {
  if (!input) return '';
  const match = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  return '';
}

window.ouvrirDetail = (index) => {
  detailIndex = index;
  const item = filmsData.items[index];

  // Poster
  const poster = document.getElementById('detail-poster');
  const posterPh = document.getElementById('detail-poster-ph');
  if (item.image) {
    poster.src = item.image;
    poster.alt = item.titre;
    poster.style.display = 'block';
    posterPh.style.display = 'none';
  } else {
    poster.style.display = 'none';
    posterPh.style.display = 'flex';
    posterPh.textContent = item.type === 'film' ? '🎬' : '📺';
  }

  // Badges
  const badgeStatut = {
    a_voir: '<span class="film-badge badge-a-voir">⏳ À voir</span>',
    en_cours: '<span class="film-badge badge-en-cours">▶️ En cours</span>',
    vu: '<span class="film-badge badge-vu">✅ Vu</span>',
  }[item.statut] || '';
  const badgeType = item.type === 'film'
    ? '<span class="film-type-badge">🎬 Film</span>'
    : '<span class="film-type-badge serie">📺 Série</span>';
  document.getElementById('detail-badges').innerHTML = badgeType + badgeStatut;

  // Titre
  document.getElementById('detail-titre').textContent = item.titre;

  // Meta
  const metaParts = [];
  if (item.annee) metaParts.push(`<span>${item.annee}</span>`);
  if (item.genre) metaParts.push(`<span class="film-genre">${item.genre}</span>`);
  if (item.type === 'film' && item.duree) {
    const h = Math.floor(item.duree / 60);
    const m = String(item.duree % 60).padStart(2, '0');
    metaParts.push(`<span>${h}h${m}</span>`);
  }
  if (item.type === 'serie' && item.nb_saisons) {
    metaParts.push(`<span>${item.nb_saisons} saison${item.nb_saisons > 1 ? 's' : ''}</span>`);
  }
  document.getElementById('detail-meta').innerHTML = metaParts.join('<span class="sep"> · </span>');

  // Étoiles
  const etoilesEl = document.getElementById('detail-etoiles');
  if (item.note > 0) {
    const etoiles = '★'.repeat(item.note) + '☆'.repeat(5 - item.note);
    etoilesEl.innerHTML = `<span class="film-etoiles" title="${item.note}/5">${etoiles}</span>`;
    etoilesEl.style.display = 'block';
  } else {
    etoilesEl.style.display = 'none';
  }

  // Réalisateur / Acteurs
  const peopleEl = document.getElementById('detail-people');
  let peopleHtml = '';
  if (item.realisateur) peopleHtml += `<div class="detail-people-row"><span class="detail-role">🎥 Réal.</span>${item.realisateur}</div>`;
  if (item.acteurs) peopleHtml += `<div class="detail-people-row"><span class="detail-role">🎭 Acteurs</span>${item.acteurs}</div>`;
  peopleEl.innerHTML = peopleHtml;
  peopleEl.style.display = peopleHtml ? 'flex' : 'none';

  // Synopsis
  const synopsisEl = document.getElementById('detail-synopsis');
  synopsisEl.textContent = item.synopsis || '';
  synopsisEl.style.display = item.synopsis ? 'block' : 'none';

  // Commentaire
  const commentaireEl = document.getElementById('detail-commentaire');
  commentaireEl.textContent = item.commentaire ? `"${item.commentaire}"` : '';
  commentaireEl.style.display = item.commentaire ? 'block' : 'none';

  // Bande-annonce YouTube
  const trailerWrap = document.getElementById('detail-trailer-wrap');
  const trailerIframe = document.getElementById('detail-trailer-iframe');
  const videoId = extraireVideoId(item.trailer_youtube || '');
  if (videoId) {
    trailerIframe.src = `https://www.youtube.com/embed/${videoId}`;
    trailerWrap.style.display = 'block';
  } else {
    trailerIframe.src = '';
    trailerWrap.style.display = 'none';
  }

  document.getElementById('modal-detail').classList.remove('hidden');
};

window.fermerDetail = (e) => {
  if (e && e.target !== document.getElementById('modal-detail')) return;
  document.getElementById('detail-trailer-iframe').src = '';
  document.getElementById('modal-detail').classList.add('hidden');
};

window.ouvrirEditDepuisDetail = () => {
  document.getElementById('detail-trailer-iframe').src = '';
  document.getElementById('modal-detail').classList.add('hidden');
  ouvrirModalEdit(detailIndex);
};
