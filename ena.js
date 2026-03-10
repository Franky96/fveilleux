import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('ena')) {
  alert("Accès refusé à cette page.");
  window.location.href = 'dashboard.html';
}

const enaDocRef = doc(db, "donnees", "ena_global");

let enaData = {
  'E04': { sections: [], modalite: 'En présence' },
  'E14': { sections: [], modalite: 'Hybride' },
  'E24': { sections: [], modalite: 'En présence' },
  'E06': { sections: [], modalite: 'En présence' }
};

let menuCoursId = null;

document.addEventListener('DOMContentLoaded', () => {
  onSnapshot(enaDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      ['E04', 'E14', 'E24', 'E06'].forEach(id => {
        const cours = data[id];
        if (!cours) return;
        // Migration: ancien format avait echeances[] + notes[], nouveau = sections[]
        if (!cours.sections) {
          cours.sections = [];
          if (cours.echeances && cours.echeances.length > 0) {
            cours.sections.push({ type: 'division', titre: 'Échéances' });
            cours.echeances.forEach(e => cours.sections.push({
              type: 'echeance', date: e.date, description: e.description, complete: e.complete || false
            }));
          }
          if (cours.notes && cours.notes.length > 0) {
            cours.sections.push({ type: 'division', titre: 'Notes' });
            cours.notes.forEach(n => cours.sections.push({
              type: 'note', titre: n.titre, type_note: n.type || 'texte', contenu: n.contenu, nom: n.nom || ''
            }));
          }
        }
        enaData[id] = { ...enaData[id], ...cours };
      });
    } else {
      setDoc(enaDocRef, enaData);
    }

    ['E04', 'E14', 'E24', 'E06'].forEach(id => {
      if (enaData[id]) {
        appliquerModalite(id, enaData[id].modalite);
        chargerSections(id);
      }
    });
  });

  // Fermer le menu en cliquant ailleurs
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-ajouter-module') && !e.target.closest('#menu-ajout')) {
      document.getElementById('menu-ajout').classList.add('hidden');
    }
  });

  window.afficherCours('E04', document.querySelector('.sidebar-sublink'));
});

// === NAVIGATION ===

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

// === MENU FLOTTANT ===

window.ouvrirMenuAjout = function(coursId, btn) {
  menuCoursId = coursId;
  const menu = document.getElementById('menu-ajout');
  menu.classList.remove('hidden');
  const rect = btn.getBoundingClientRect();
  // Positionner à droite du bouton, aligné à droite
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = (rect.right - menu.offsetWidth) + 'px';
};

window.choisirTypeModule = function(type) {
  document.getElementById('menu-ajout').classList.add('hidden');
  if (type === 'division') ouvrirModalDivision(menuCoursId, null, null);
  if (type === 'echeance') ouvrirModalEcheance(menuCoursId, null, null);
  if (type === 'note') ouvrirModalNote(menuCoursId, null, null);
};

// === RENDU DES SECTIONS ===

function chargerSections(coursId) {
  const sections = enaData[coursId].sections || [];
  const container = document.getElementById('sections-' + coursId);
  if (!container) return;
  container.innerHTML = '';
  if (sections.length === 0) {
    container.innerHTML = `<p class="sections-empty">Aucun contenu pour l'instant — clique sur <strong>+</strong> pour ajouter une division, une échéance ou une note.</p>`;
    return;
  }
  sections.forEach((bloc, index) => {
    if (bloc.type === 'division') container.appendChild(creerBlocDivision(coursId, bloc, index));
    else if (bloc.type === 'echeance') container.appendChild(creerBlocEcheance(coursId, bloc, index));
    else if (bloc.type === 'note') container.appendChild(creerBlocNote(coursId, bloc, index));
  });
}

function creerBlocDivision(coursId, bloc, index) {
  const div = document.createElement('div');
  div.className = 'bloc-division';
  div.innerHTML = `
    <span class="bloc-division-ligne"></span>
    <span class="bloc-division-titre">${bloc.titre}</span>
    <span class="bloc-division-ligne"></span>
    <div class="bloc-actions">
      <button class="btn-edit" onclick="editerBloc('${coursId}', ${index})">✏️</button>
      <button class="btn-delete" onclick="supprimerBloc('${coursId}', ${index})">🗑️</button>
    </div>
  `;
  return div;
}

function creerBlocEcheance(coursId, e, index) {
  const div = document.createElement('div');
  div.className = 'bloc-echeance' + (e.complete ? ' echeance-complete' : '');
  const dateFormatee = e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  div.innerHTML = `
    <input type="checkbox" class="echeance-check" ${e.complete ? 'checked' : ''} onchange="toggleComplete('${coursId}', ${index}, this)">
    <span class="echeance-date">${dateFormatee}</span>
    <span class="echeance-desc">${e.description}</span>
    <div class="bloc-actions">
      <button class="btn-edit" onclick="editerBloc('${coursId}', ${index})">✏️</button>
      <button class="btn-delete" onclick="supprimerBloc('${coursId}', ${index})">🗑️</button>
    </div>
  `;
  return div;
}

function creerBlocNote(coursId, note, index) {
  const div = document.createElement('div');
  div.className = 'note-card note-type-' + (note.type_note || 'texte');
  const icones = { texte: '📝', pdf: '📎', lien: '🔗', reference: '🌐' };
  const icone = icones[note.type_note] || '📝';
  let contenu = '';
  if (note.type_note === 'texte') {
    contenu = `<p class="note-contenu">${note.contenu.replace(/\n/g, '<br>')}</p>`;
  } else {
    const url = note.contenu.startsWith('http') ? note.contenu : 'https://' + note.contenu;
    contenu = `<a href="${url}" target="_blank" class="note-lien">${note.type_note === 'pdf' ? '📄 ' : ''}${note.nom || note.contenu}</a>`;
  }
  div.innerHTML = `
    <div class="note-card-header">
      <span class="note-icone">${icone}</span>
      <span class="note-titre">${note.titre}</span>
      <div class="note-actions">
        <button class="btn-edit" onclick="editerBloc('${coursId}', ${index})">✏️</button>
        <button class="btn-delete" onclick="supprimerBloc('${coursId}', ${index})">🗑️</button>
      </div>
    </div>
    ${contenu}
  `;
  return div;
}

// === ACTIONS ===

window.editerBloc = function(coursId, index) {
  const bloc = enaData[coursId].sections[index];
  if (bloc.type === 'division') ouvrirModalDivision(coursId, bloc, index);
  else if (bloc.type === 'echeance') ouvrirModalEcheance(coursId, bloc, index);
  else if (bloc.type === 'note') ouvrirModalNote(coursId, bloc, index);
};

window.supprimerBloc = function(coursId, index) {
  if (!confirm('Supprimer ce bloc ?')) return;
  enaData[coursId].sections.splice(index, 1);
  setDoc(enaDocRef, enaData);
};

window.toggleComplete = function(coursId, index, checkbox) {
  enaData[coursId].sections[index].complete = checkbox.checked;
  setDoc(enaDocRef, enaData);
};

// === MODAL DIVISION ===

function ouvrirModalDivision(coursId, bloc, index) {
  document.getElementById('modal-division-titre-label').textContent = bloc ? 'Modifier la division' : 'Nouvelle division';
  document.getElementById('modal-division-titre').value = bloc ? bloc.titre : '';
  document.getElementById('modal-division').classList.remove('hidden');
  document.getElementById('modal-division-titre').focus();

  document.getElementById('modal-division-save').onclick = function() {
    const titre = document.getElementById('modal-division-titre').value.trim();
    if (!titre) return;
    const nouvSection = { type: 'division', titre };
    if (index !== null) enaData[coursId].sections[index] = nouvSection;
    else enaData[coursId].sections.push(nouvSection);
    setDoc(enaDocRef, enaData);
    window.fermerModalDivision();
  };
}

window.fermerModalDivision = function() {
  document.getElementById('modal-division').classList.add('hidden');
};

// === MODAL ÉCHÉANCE ===

function ouvrirModalEcheance(coursId, echeance, index) {
  document.getElementById('modal-titre').textContent = echeance ? 'Modifier l\'échéance' : 'Nouvelle échéance';
  document.getElementById('modal-date').value = echeance ? echeance.date : '';
  document.getElementById('modal-desc').value = echeance ? echeance.description : '';
  document.getElementById('modal-echeance').classList.remove('hidden');

  document.getElementById('modal-save').onclick = function() {
    const date = document.getElementById('modal-date').value.trim();
    const description = document.getElementById('modal-desc').value.trim();
    if (!date || !description) return;
    const nouvSection = { type: 'echeance', date, description, complete: echeance ? echeance.complete : false };
    if (index !== null) enaData[coursId].sections[index] = nouvSection;
    else enaData[coursId].sections.push(nouvSection);
    setDoc(enaDocRef, enaData);
    window.fermerModalEcheance();
  };
}

window.fermerModalEcheance = function() {
  document.getElementById('modal-echeance').classList.add('hidden');
};

// === MODAL NOTE ===

function ouvrirModalNote(coursId, note, index) {
  document.getElementById('modal-note-titre-label').textContent = note ? 'Modifier la note' : 'Nouvelle note';
  document.getElementById('modal-note-titre').value = note ? note.titre : '';
  document.getElementById('modal-note-type').value = note ? (note.type_note || 'texte') : 'texte';
  document.getElementById('modal-note-contenu').value = note ? note.contenu : '';
  document.getElementById('modal-note-nom').value = note ? (note.nom || '') : '';
  window.updateModalNoteType();
  document.getElementById('modal-note').classList.remove('hidden');

  document.getElementById('modal-note-save').onclick = function() {
    const titre = document.getElementById('modal-note-titre').value.trim();
    const type_note = document.getElementById('modal-note-type').value;
    const contenu = document.getElementById('modal-note-contenu').value.trim();
    const nom = document.getElementById('modal-note-nom').value.trim();
    if (!titre || !contenu) return;
    const nouvSection = { type: 'note', titre, type_note, contenu, nom };
    if (index !== null) enaData[coursId].sections[index] = nouvSection;
    else enaData[coursId].sections.push(nouvSection);
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
    contenuLabel.textContent = 'Contenu';
    contenu.placeholder = 'Écris tes notes ici...';
    contenu.rows = 6;
    nomGroup.classList.add('hidden');
  } else {
    contenuLabel.textContent = type === 'pdf' ? 'Chemin ou URL du PDF' : 'URL';
    contenu.placeholder = 'Ex: https://...';
    contenu.rows = 2;
    nomGroup.classList.remove('hidden');
  }
};

window.fermerModalNote = function() {
  document.getElementById('modal-note').classList.add('hidden');
};
