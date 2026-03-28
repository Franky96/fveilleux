import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('ena')) {
  alert("Accès refusé à cette page.");
  window.location.href = 'dashboard.html';
}

const enaDocRef = doc(db, "donnees", "ena_global");

let enaData = {
  'E04': { groupes: [], modalite: 'En présence' },
  'E14': { groupes: [], modalite: 'Hybride' },
  'E24': { groupes: [], modalite: 'En présence' },
  'E06': { groupes: [], modalite: 'En présence' }
};

let menuCoursId = null;
let menuGroupeIndex = null;

document.addEventListener('DOMContentLoaded', () => {
  onSnapshot(enaDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      ['E04', 'E14', 'E24', 'E06'].forEach(id => {
        const cours = data[id];
        if (!cours) return;
        // Migration : ancien format echeances[] + notes[]
        if (!cours.sections && !cours.groupes) {
          cours.groupes = [];
          if (cours.echeances?.length > 0) {
            cours.groupes.push({
              titre: 'Échéances',
              items: cours.echeances.map(e => ({ type: 'echeance', date: e.date, description: e.description, complete: e.complete || false }))
            });
          }
          if (cours.notes?.length > 0) {
            cours.groupes.push({
              titre: 'Notes',
              items: cours.notes.map(n => ({ type: 'note', titre: n.titre, type_note: n.type || 'texte', contenu: n.contenu, nom: n.nom || '' }))
            });
          }
        }
        // Migration : format plat sections[]
        if (cours.sections && !cours.groupes) {
          cours.groupes = migrerSections(cours.sections);
        }
        enaData[id] = { ...enaData[id], ...cours };
      });
    } else {
      setDoc(enaDocRef, enaData);
    }

    ['E04', 'E14', 'E24', 'E06'].forEach(id => {
      if (enaData[id]) {
        appliquerModalite(id, enaData[id].modalite);
        chargerGroupes(id);
      }
    });
  }, (err) => {
    console.error('Firebase ENA error:', err);
    afficherErreurFirebase(err.code);
  });

  // Fermer le menu item en cliquant ailleurs
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-ajouter-dans-groupe') && !e.target.closest('#menu-ajout-item')) {
      document.getElementById('menu-ajout-item').classList.add('hidden');
    }
  });

  window.afficherCours('E04', document.querySelector('.sidebar-sublink'));
});

function afficherErreurFirebase(code) {
  if (document.getElementById('firebase-err-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'firebase-err-banner';
  banner.style.cssText = 'background:#c0392b;color:#fff;padding:0.8rem 1rem;text-align:center;font-weight:bold;font-size:0.9rem;position:sticky;top:0;z-index:9999;';
  banner.textContent = `⚠️ Erreur Firebase (${code}) — Les règles de sécurité sont expirées. Mets-les à jour dans la console Firebase.`;
  document.body.prepend(banner);
}

function migrerSections(sections) {
  const groupes = [];
  let groupActuel = null;
  for (const bloc of sections) {
    if (bloc.type === 'division') {
      if (groupActuel) groupes.push(groupActuel);
      groupActuel = { titre: bloc.titre, items: [] };
    } else {
      if (!groupActuel) groupActuel = { titre: 'Général', items: [] };
      if (bloc.type === 'echeance') {
        groupActuel.items.push({ type: 'echeance', date: bloc.date, description: bloc.description, complete: bloc.complete || false });
      } else if (bloc.type === 'note') {
        groupActuel.items.push({ type: 'note', titre: bloc.titre, type_note: bloc.type_note || 'texte', contenu: bloc.contenu, nom: bloc.nom || '' });
      }
    }
  }
  if (groupActuel) groupes.push(groupActuel);
  return groupes;
}

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

// === RENDU ===

function chargerGroupes(coursId) {
  const groupes = enaData[coursId].groupes || [];
  const container = document.getElementById('sections-' + coursId);
  if (!container) return;
  container.innerHTML = '';
  if (groupes.length === 0) {
    container.innerHTML = `<p class="sections-empty">Aucun groupe — clique sur <strong>+</strong> pour en créer un.</p>`;
    return;
  }
  groupes.forEach((groupe, gIndex) => container.appendChild(creerCarteGroupe(coursId, groupe, gIndex)));
}

function creerCarteGroupe(coursId, groupe, gIndex) {
  const card = document.createElement('div');
  card.className = 'groupe-card';

  const items = groupe.items || [];
  const nbDone = items.filter(i => i.type === 'echeance' && i.complete).length;
  const nbEch = items.filter(i => i.type === 'echeance').length;

  const header = document.createElement('div');
  header.className = 'groupe-header';
  header.innerHTML = `
    <span class="groupe-titre">${groupe.titre}</span>
    ${nbEch > 0 ? `<span class="groupe-progress">${nbDone}/${nbEch}</span>` : ''}
    <span class="groupe-count">${items.length} élément${items.length !== 1 ? 's' : ''}</span>
    <div class="groupe-header-actions">
      <button class="btn-ajouter-dans-groupe" onclick="ouvrirMenuItem('${coursId}', ${gIndex}, this)" title="Ajouter dans ce groupe">+</button>
      <button class="btn-edit" onclick="modifierGroupe('${coursId}', ${gIndex})">✏️</button>
      <button class="btn-delete" onclick="supprimerGroupe('${coursId}', ${gIndex})">🗑️</button>
    </div>
  `;

  const itemsDiv = document.createElement('div');
  itemsDiv.className = 'groupe-items';

  if (items.length === 0) {
    itemsDiv.innerHTML = `<p class="groupe-empty">Aucun élément — clique sur <strong>+</strong> pour en ajouter.</p>`;
  } else {
    items.forEach((item, iIndex) => {
      if (item.type === 'echeance') itemsDiv.appendChild(creerBlocEcheance(coursId, gIndex, item, iIndex));
      else if (item.type === 'note') itemsDiv.appendChild(creerBlocNote(coursId, gIndex, item, iIndex));
    });
  }

  card.appendChild(header);
  card.appendChild(itemsDiv);
  return card;
}

function creerBlocEcheance(coursId, gIndex, e, iIndex) {
  const div = document.createElement('div');
  div.className = 'bloc-echeance' + (e.complete ? ' echeance-complete' : '');
  const dateFormatee = e.date
    ? new Date(e.date + 'T00:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
  div.innerHTML = `
    <input type="checkbox" class="echeance-check" ${e.complete ? 'checked' : ''} onchange="toggleComplete('${coursId}', ${gIndex}, ${iIndex}, this)">
    <span class="echeance-date">${dateFormatee}</span>
    <span class="echeance-desc">${e.description}</span>
    <div class="bloc-actions">
      <button class="btn-edit" onclick="editerItem('${coursId}', ${gIndex}, ${iIndex})">✏️</button>
      <button class="btn-delete" onclick="supprimerItem('${coursId}', ${gIndex}, ${iIndex})">🗑️</button>
    </div>
  `;
  return div;
}

function creerBlocNote(coursId, gIndex, note, iIndex) {
  const div = document.createElement('div');
  div.className = 'note-card note-type-' + (note.type_note || 'texte');
  const icones = { texte: '📝', pdf: '📎', lien: '🔗', reference: '🌐' };
  let contenu = '';
  if (note.type_note === 'texte') {
    contenu = `<p class="note-contenu">${note.contenu.replace(/\n/g, '<br>')}</p>`;
  } else {
    const url = note.contenu.startsWith('http') ? note.contenu : 'https://' + note.contenu;
    contenu = `<a href="${url}" target="_blank" class="note-lien">${note.type_note === 'pdf' ? '📄 ' : ''}${note.nom || note.contenu}</a>`;
  }
  div.innerHTML = `
    <div class="note-card-header">
      <span class="note-icone">${icones[note.type_note] || '📝'}</span>
      <span class="note-titre">${note.titre}</span>
      <div class="note-actions">
        <button class="btn-edit" onclick="editerItem('${coursId}', ${gIndex}, ${iIndex})">✏️</button>
        <button class="btn-delete" onclick="supprimerItem('${coursId}', ${gIndex}, ${iIndex})">🗑️</button>
      </div>
    </div>
    ${contenu}
  `;
  return div;
}

// === MENU ITEM DANS UN GROUPE ===

window.ouvrirMenuItem = function(coursId, gIndex, btn) {
  menuCoursId = coursId;
  menuGroupeIndex = gIndex;
  const menu = document.getElementById('menu-ajout-item');
  menu.classList.remove('hidden');
  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = (rect.right - menu.offsetWidth) + 'px';
};

window.choisirTypeItem = function(type) {
  document.getElementById('menu-ajout-item').classList.add('hidden');
  if (type === 'echeance') ouvrirModalEcheance(menuCoursId, menuGroupeIndex, null, null);
  if (type === 'note') ouvrirModalNote(menuCoursId, menuGroupeIndex, null, null);
};

// === MODAL GROUPE ===

window.ouvrirModalGroupe = function(coursId, groupe, gIndex) {
  document.getElementById('modal-groupe-titre-label').textContent = groupe ? 'Renommer le groupe' : 'Nouveau groupe';
  document.getElementById('modal-groupe-titre').value = groupe ? groupe.titre : '';
  document.getElementById('modal-groupe').classList.remove('hidden');
  setTimeout(() => document.getElementById('modal-groupe-titre').focus(), 50);

  document.getElementById('modal-groupe-save').onclick = function() {
    const titre = document.getElementById('modal-groupe-titre').value.trim();
    if (!titre) return;
    if (!enaData[coursId].groupes) enaData[coursId].groupes = [];
    if (gIndex !== null) {
      enaData[coursId].groupes[gIndex].titre = titre;
    } else {
      enaData[coursId].groupes.push({ titre, items: [] });
    }
    setDoc(enaDocRef, enaData);
    window.fermerModalGroupe();
  };
};

window.fermerModalGroupe = function() {
  document.getElementById('modal-groupe').classList.add('hidden');
};

window.modifierGroupe = function(coursId, gIndex) {
  ouvrirModalGroupe(coursId, enaData[coursId].groupes[gIndex], gIndex);
};

window.supprimerGroupe = function(coursId, gIndex) {
  const g = enaData[coursId].groupes[gIndex];
  if (!confirm(`Supprimer le groupe "${g.titre}" et tout son contenu ?`)) return;
  enaData[coursId].groupes.splice(gIndex, 1);
  setDoc(enaDocRef, enaData);
};

// === ACTIONS ITEMS ===

window.editerItem = function(coursId, gIndex, iIndex) {
  const item = enaData[coursId].groupes[gIndex].items[iIndex];
  if (item.type === 'echeance') ouvrirModalEcheance(coursId, gIndex, item, iIndex);
  else if (item.type === 'note') ouvrirModalNote(coursId, gIndex, item, iIndex);
};

window.supprimerItem = function(coursId, gIndex, iIndex) {
  if (!confirm('Supprimer cet élément ?')) return;
  enaData[coursId].groupes[gIndex].items.splice(iIndex, 1);
  setDoc(enaDocRef, enaData);
};

window.toggleComplete = function(coursId, gIndex, iIndex, checkbox) {
  enaData[coursId].groupes[gIndex].items[iIndex].complete = checkbox.checked;
  setDoc(enaDocRef, enaData);
};

// === MODAL ÉCHÉANCE ===

function ouvrirModalEcheance(coursId, gIndex, echeance, iIndex) {
  document.getElementById('modal-titre').textContent = echeance ? "Modifier l'échéance" : 'Nouvelle échéance';
  document.getElementById('modal-date').value = echeance ? echeance.date : '';
  document.getElementById('modal-desc').value = echeance ? echeance.description : '';
  document.getElementById('modal-echeance').classList.remove('hidden');

  document.getElementById('modal-save').onclick = function() {
    const date = document.getElementById('modal-date').value.trim();
    const description = document.getElementById('modal-desc').value.trim();
    if (!date || !description) return;
    const item = { type: 'echeance', date, description, complete: echeance ? echeance.complete : false };
    if (iIndex !== null) enaData[coursId].groupes[gIndex].items[iIndex] = item;
    else enaData[coursId].groupes[gIndex].items.push(item);
    setDoc(enaDocRef, enaData);
    window.fermerModalEcheance();
  };
}

window.fermerModalEcheance = function() {
  document.getElementById('modal-echeance').classList.add('hidden');
};

// === MODAL NOTE ===

function ouvrirModalNote(coursId, gIndex, note, iIndex) {
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
    const item = { type: 'note', titre, type_note, contenu, nom };
    if (iIndex !== null) enaData[coursId].groupes[gIndex].items[iIndex] = item;
    else enaData[coursId].groupes[gIndex].items.push(item);
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
