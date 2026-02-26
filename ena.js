import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('ena')) {
  alert("Accès refusé à cette page.");
  window.location.href = 'dashboard.html';
}

const enaDocRef = doc(db, "donnees", "ena_global");

// Structure par défaut
let enaData = {
  'E04': { notes: [], echeances: [], modalite: 'En présence' },
  'E14': { notes: [], echeances: [], modalite: 'Hybride' },
  'E24': { notes: [], echeances: [], modalite: 'En présence' },
  'E06': { notes: [], echeances: [], modalite: 'En présence' }
};

document.addEventListener('DOMContentLoaded', () => {
  // Synchronisation en temps réel avec Firebase
  onSnapshot(enaDocRef, (docSnap) => {
    if (docSnap.exists()) {
      enaData = { ...enaData, ...docSnap.data() };
    } else {
      setDoc(enaDocRef, enaData);
    }
    
    // Rafraîchir l'écran pour tous les cours
    ['E04', 'E14', 'E24', 'E06'].forEach(id => {
      if (enaData[id]) {
        appliquerModalite(id, enaData[id].modalite);
        chargerEcheances(id);
        chargerNotes(id);
      }
    });
  });

  window.afficherCours('E04', document.querySelector('.sidebar-sublink'));
});

// === EXPOSITION DES FONCTIONS AU HTML ===
window.afficherCours = function(id, el) {
  document.querySelectorAll('.cours-view').forEach(v => v.classList.add('hidden'));
  document.getElementById('cours-' + id).classList.remove('hidden');
  document.querySelectorAll('.sidebar-sublink').forEach(l => l.classList.remove('active'));
  if (el) el.classList.add('active');
};

window.toggleEtape = function(id) {
  const list = document.getElementById('list-' + id);
  const arrow = document.getElementById('arrow-' + id);
  list.classList.toggle('collapsed');
  arrow.textContent = list.classList.contains('collapsed') ? '▸' : '▾';
};

window.toggleModalite = function(id) {
  const current = document.getElementById('mod-' + id).textContent;
  enaData[id].modalite = current === 'Hybride' ? 'En présence' : 'Hybride';
  setDoc(enaDocRef, enaData);
};

function appliquerModalite(id, valeur) {
  const el = document.getElementById('mod-' + id);
  if (!el) return;
  el.textContent = valeur;
  el.className = 'modalite ' + (valeur === 'Hybride' ? 'hybride' : 'presence');
}

function chargerEcheances(coursId) {
  const echeances = enaData[coursId].echeances || [];
  const tbody = document.getElementById('tbody-' + coursId);
  if (!tbody) return;
  tbody.innerHTML = '';
  if (echeances.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Aucune échéance pour l'instant. Clique sur + pour en ajouter une.</td></tr>`;
    return;
  }
  echeances.forEach((e, index) => tbody.appendChild(creerLigneEcheance(coursId, e, index)));
}

function creerLigneEcheance(coursId, e, index) {
  const tr = document.createElement('tr');
  if (e.complete) tr.classList.add('echeance-complete');
  tr.innerHTML = `
    <td><input type="checkbox" class="echeance-check" ${e.complete ? 'checked' : ''} onchange="toggleComplete('${coursId}', ${index}, this)"></td>
    <td class="echeance-date">${e.date}</td>
    <td class="echeance-desc">${e.description}</td>
    <td class="echeance-actions">
      <button class="btn-edit" onclick="editerEcheance('${coursId}', ${index})">✏️</button>
      <button class="btn-delete" onclick="supprimerEcheance('${coursId}', ${index})">🗑️</button>
    </td>
  `;
  return tr;
}

window.toggleComplete = function(coursId, index, checkbox) {
  enaData[coursId].echeances[index].complete = checkbox.checked;
  setDoc(enaDocRef, enaData);
};

window.supprimerEcheance = function(coursId, index) {
  if (!confirm('Supprimer cette échéance ?')) return;
  enaData[coursId].echeances.splice(index, 1);
  setDoc(enaDocRef, enaData);
};

window.editerEcheance = function(coursId, index) {
  ouvrirModalEcheance(coursId, enaData[coursId].echeances[index], index);
};

window.ajouterEcheance = function(coursId) {
  ouvrirModalEcheance(coursId, null, null);
};

function ouvrirModalEcheance(coursId, echeance, index) {
  const modal = document.getElementById('modal-echeance');
  document.getElementById('modal-titre').textContent = echeance ? 'Modifier' : 'Nouvelle échéance';
  document.getElementById('modal-date').value = echeance ? echeance.date : '';
  document.getElementById('modal-desc').value = echeance ? echeance.description : '';
  modal.classList.remove('hidden');

  document.getElementById('modal-save').onclick = function() {
    const date = document.getElementById('modal-date').value.trim();
    const description = document.getElementById('modal-desc').value.trim();
    if (!date || !description) return;
    
    if (index !== null) {
      enaData[coursId].echeances[index] = { date, description, complete: enaData[coursId].echeances[index].complete };
    } else {
      enaData[coursId].echeances.push({ date, description, complete: false });
    }
    setDoc(enaDocRef, enaData);
    window.fermerModalEcheance();
  };
}

window.fermerModalEcheance = function() { document.getElementById('modal-echeance').classList.add('hidden'); };

function chargerNotes(coursId) {
  const notes = enaData[coursId].notes || [];
  const container = document.getElementById('notes-container-' + coursId);
  if (!container) return;
  container.innerHTML = '';
  if (notes.length === 0) {
    container.innerHTML = `<p class="notes-empty">Aucune note pour l'instant.</p>`;
    return;
  }
  notes.forEach((note, index) => container.appendChild(creerCarteNote(coursId, note, index)));
}

function creerCarteNote(coursId, note, index) {
  const div = document.createElement('div');
  div.className = 'note-card note-type-' + note.type;
  let icone = note.type === 'texte' ? '📝' : note.type === 'pdf' ? '📎' : note.type === 'lien' ? '🔗' : '🌐';
  let contenu = '';
  if (note.type === 'texte') {
    contenu = `<p class="note-contenu">${note.contenu.replace(/\n/g, '<br>')}</p>`;
  } else {
    const url = note.contenu.startsWith('http') ? note.contenu : 'https://' + note.contenu;
    contenu = `<a href="${url}" target="_blank" class="note-lien">${note.type === 'pdf' ? '📄 ' : ''}${note.nom || note.contenu}</a>`;
  }
  div.innerHTML = `
    <div class="note-card-header">
      <span class="note-icone">${icone}</span>
      <span class="note-titre">${note.titre}</span>
      <div class="note-actions">
        <button class="btn-edit" onclick="editerNote('${coursId}', ${index})">✏️</button>
        <button class="btn-delete" onclick="supprimerNote('${coursId}', ${index})">🗑️</button>
      </div>
    </div>
    ${contenu}
  `;
  return div;
}

window.ajouterNote = function(coursId) { ouvrirModalNote(coursId, null, null); };
window.editerNote = function(coursId, index) { ouvrirModalNote(coursId, enaData[coursId].notes[index], index); };
window.supprimerNote = function(coursId, index) {
  if (!confirm('Supprimer cette note ?')) return;
  enaData[coursId].notes.splice(index, 1);
  setDoc(enaDocRef, enaData);
};

function ouvrirModalNote(coursId, note, index) {
  const modal = document.getElementById('modal-note');
  document.getElementById('modal-note-titre-label').textContent = note ? 'Modifier la note' : 'Nouvelle note';
  document.getElementById('modal-note-titre').value = note ? note.titre : '';
  document.getElementById('modal-note-type').value = note ? note.type : 'texte';
  document.getElementById('modal-note-contenu').value = note ? note.contenu : '';
  document.getElementById('modal-note-nom').value = note ? (note.nom || '') : '';
  window.updateModalNoteType();
  modal.classList.remove('hidden');

  document.getElementById('modal-note-save').onclick = function() {
    const titre = document.getElementById('modal-note-titre').value.trim();
    const type = document.getElementById('modal-note-type').value;
    const contenu = document.getElementById('modal-note-contenu').value.trim();
    const nom = document.getElementById('modal-note-nom').value.trim();
    if (!titre || !contenu) return;

    const nouvelleNote = { titre, type, contenu, nom };
    if (index !== null) enaData[coursId].notes[index] = nouvelleNote;
    else enaData[coursId].notes.push(nouvelleNote);
    
    setDoc(enaDocRef, enaData);
    window.fermerModalNote();
  };
}

window.updateModalNoteType = function() {
  const type = document.getElementById('modal-note-type').value;
  const contenuLabel = document.getElementById('modal-note-contenu-label');
  const contenu = document.getElementById('modal-note-contenu');
  const nomGroup = document.getElementById('modal-note-nom-group');
  if (type === 'texte') {
    contenuLabel.textContent = 'Contenu'; contenu.placeholder = 'Écris tes notes ici...'; contenu.rows = 6;
    nomGroup.classList.add('hidden');
  } else {
    contenuLabel.textContent = type === 'pdf' ? 'Chemin ou URL du PDF' : 'URL'; contenu.placeholder = 'Ex: https://...'; contenu.rows = 2;
    nomGroup.classList.remove('hidden');
  }
};
window.fermerModalNote = function() { document.getElementById('modal-note').classList.add('hidden'); };