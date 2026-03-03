import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('liens')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

const liensDocRef = doc(db, "donnees", "liens_global");

// Structure par défaut
let liensData = {
  categories: ["Aviation", "Électronique", "Programmation web", "Général"],
  items: []
};

let categorieActive = null; // null = "Toutes les catégories"

document.addEventListener('DOMContentLoaded', () => {
  onSnapshot(liensDocRef, (docSnap) => {
    if (docSnap.exists()) {
      liensData = { ...liensData, ...docSnap.data() };
    } else {
      setDoc(liensDocRef, liensData);
    }
    afficherCategories();
    afficherLiens();
  });
});

// ===== GESTION DES CATÉGORIES =====
function afficherCategories() {
  const nav = document.getElementById('categories-nav');
  const catSelect = document.getElementById('modal-lien-cat');
  nav.innerHTML = '';
  catSelect.innerHTML = '';

  // Lien "Toutes les catégories"
  const aToutes = document.createElement('a');
  aToutes.href = '#';
  aToutes.className = 'sidebar-sublink' + (categorieActive === null ? ' active' : '');
  aToutes.textContent = '🌍 Toutes';
  aToutes.onclick = (e) => { e.preventDefault(); filtrerParCat(null); };
  nav.appendChild(aToutes);

  // Liste des catégories dynamiques
  liensData.categories.forEach((cat, index) => {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'sidebar-sublink' + (categorieActive === cat ? ' active' : '');
    a.innerHTML = `<span style="display:flex; justify-content:space-between; align-items:center;">
                     ${cat} 
                     <span style="color:#ff6b6b; cursor:pointer; font-size:0.8rem;" onclick="event.stopPropagation(); supprimerCat(${index})" title="Supprimer la catégorie">✕</span>
                   </span>`;
    a.onclick = (e) => { e.preventDefault(); filtrerParCat(cat); };
    nav.appendChild(a);

    // Ajouter aux options du select
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });
}

function filtrerParCat(cat) {
  categorieActive = cat;
  document.getElementById('titre-categorie').textContent = cat === null ? 'Toutes les catégories' : cat;
  afficherCategories(); // Pour mettre à jour la classe "active"
  afficherLiens();
}

window.ouvrirModalCat = () => document.getElementById('modal-cat').classList.remove('hidden');
window.fermerModalCat = () => document.getElementById('modal-cat').classList.add('hidden');

window.sauvegarderCat = () => {
  const nom = document.getElementById('modal-cat-nom').value.trim();
  if (nom && !liensData.categories.includes(nom)) {
    liensData.categories.push(nom);
    setDoc(liensDocRef, liensData);
    document.getElementById('modal-cat-nom').value = '';
    fermerModalCat();
  }
};

window.supprimerCat = (index) => {
  const catASupprimer = liensData.categories[index];
  if (!confirm(`Supprimer la catégorie "${catASupprimer}" ? Les liens associés ne seront pas supprimés, mais n'auront plus de catégorie visible.`)) return;
  liensData.categories.splice(index, 1);
  if (categorieActive === catASupprimer) filtrerParCat(null);
  setDoc(liensDocRef, liensData);
};

// ===== GESTION DES LIENS =====
function afficherLiens() {
  const container = document.getElementById('liens-container');
  container.innerHTML = '';

  const liensAffiches = categorieActive === null 
    ? liensData.items 
    : liensData.items.filter(l => l.cat === categorieActive);

  if (liensAffiches.length === 0) {
    container.innerHTML = `<p class="notes-empty">Aucun lien dans cette catégorie.</p>`;
    return;
  }

  liensAffiches.forEach((lien) => {
    // Trouver l'index réel dans le tableau global pour l'édition/suppression
    const vraiIndex = liensData.items.indexOf(lien);
    
    const div = document.createElement('div');
    div.className = 'note-card note-type-lien';
    
    // Ajout d'https:// automatique si l'utilisateur l'a oublié
    const urlClean = lien.url.startsWith('http') ? lien.url : 'https://' + lien.url;

    div.innerHTML = `
      <div class="note-card-header">
        <span class="note-icone">🔗</span>
        <div style="flex:1;">
          <a href="${urlClean}" target="_blank" class="note-titre note-lien" style="font-size:1.05rem;">${lien.nom}</a>
          <span style="display:block; font-size:0.75rem; color:#888078; margin-top:0.2rem;">Catégorie: ${lien.cat}</span>
        </div>
        <div class="note-actions">
          <button class="btn-edit" onclick="editerLien(${vraiIndex})">✏️</button>
          <button class="btn-delete" onclick="supprimerLien(${vraiIndex})">🗑️</button>
        </div>
      </div>
      ${lien.desc ? `<p class="note-contenu" style="margin-top:0.5rem; border-top:1px solid #d5d0c8; padding-top:0.5rem;">${lien.desc}</p>` : ''}
    `;
    container.appendChild(div);
  });
}

window.ouvrirModalLien = () => {
  if (liensData.categories.length === 0) {
    alert("Crée au moins une catégorie avant d'ajouter un lien.");
    return;
  }
  document.getElementById('modal-lien-titre-label').textContent = 'Nouveau lien';
  document.getElementById('modal-lien-nom').value = '';
  document.getElementById('modal-lien-url').value = '';
  document.getElementById('modal-lien-desc').value = '';
  if (categorieActive) document.getElementById('modal-lien-cat').value = categorieActive;
  
  document.getElementById('modal-lien-save').onclick = () => sauvegarderLien(null);
  document.getElementById('modal-lien').classList.remove('hidden');
};

window.editerLien = (index) => {
  const lien = liensData.items[index];
  document.getElementById('modal-lien-titre-label').textContent = 'Modifier le lien';
  document.getElementById('modal-lien-nom').value = lien.nom;
  document.getElementById('modal-lien-url').value = lien.url;
  document.getElementById('modal-lien-desc').value = lien.desc || '';
  
  // Si la catégorie du lien a été supprimée entre-temps, on la gère gracieusement
  const catSelect = document.getElementById('modal-lien-cat');
  if (liensData.categories.includes(lien.cat)) {
    catSelect.value = lien.cat;
  }
  
  document.getElementById('modal-lien-save').onclick = () => sauvegarderLien(index);
  document.getElementById('modal-lien').classList.remove('hidden');
};

window.fermerModalLien = () => document.getElementById('modal-lien').classList.add('hidden');

function sauvegarderLien(index) {
  const nom = document.getElementById('modal-lien-nom').value.trim();
  const url = document.getElementById('modal-lien-url').value.trim();
  const cat = document.getElementById('modal-lien-cat').value;
  const desc = document.getElementById('modal-lien-desc').value.trim();

  if (!nom || !url) return;

  const nouveauLien = { nom, url, cat, desc };

  if (index !== null) {
    liensData.items[index] = nouveauLien;
  } else {
    liensData.items.push(nouveauLien);
  }

  setDoc(liensDocRef, liensData);
  fermerModalLien();
}

window.supprimerLien = (index) => {
  if (!confirm('Supprimer ce lien ?')) return;
  liensData.items.splice(index, 1);
  setDoc(liensDocRef, liensData);
};