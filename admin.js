import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

// ── Archive management ───────────────────────────────
const SECTIONS_ARCHIVABLES = [
  { key: 'ena',          icon: '🛠️', label: 'ÉNA'            },
  { key: 'aviation',     icon: '✈️', label: 'Aviation'        },
  { key: 'bieres',       icon: '🍺', label: 'Bières'          },
  { key: 'scifi',        icon: '🚀', label: 'Science-Fiction' },
  { key: 'hockey',       icon: '🏒', label: 'Hockey'          },
  { key: 'liens',        icon: '🌍', label: 'Liens utiles'    },
  { key: 'films',        icon: '🎬', label: 'Films & Séries'  },
  { key: 'informatique', icon: '💻', label: 'Informatique'    },
  { key: 'rona',         icon: '👷', label: 'RONA S&S'        },
];

const configRef = doc(db, "systeme", "config");
let archivedSections = [];

// Live sync: re-render the archive grid whenever config changes
onSnapshot(configRef, (snap) => {
  archivedSections = snap.exists() ? (snap.data().archivedSections || []) : [];
  renderArchiveGrid();
});

function renderArchiveGrid() {
  const grid = document.getElementById('archive-grid');
  if (!grid) return;
  grid.innerHTML = '';
  SECTIONS_ARCHIVABLES.forEach(s => {
    const archived = archivedSections.includes(s.key);
    const card = document.createElement('div');
    card.style.cssText = [
      'background:' + (archived ? '#1c0f0f' : '#0f1a0f'),
      'border:1px solid ' + (archived ? '#6a2a2a' : '#2a4a2a'),
      'border-radius:10px',
      'padding:1rem 0.8rem',
      'cursor:pointer',
      'transition:all 0.15s',
      'text-align:center',
      'user-select:none',
    ].join(';');
    card.innerHTML = `
      <div style="font-size:1.6rem; margin-bottom:0.4rem;">${s.icon}</div>
      <div style="font-weight:bold; color:${archived ? '#c07070' : '#80cc80'}; font-size:0.88rem; margin-bottom:0.35rem;">${s.label}</div>
      <div style="font-size:0.7rem; color:${archived ? '#7a3a3a' : '#3a6a3a'}; letter-spacing:0.03rem;">
        ${archived ? '📁 Archivé' : '🏠 Dashboard'}
      </div>`;
    card.onmouseenter = () => { card.style.opacity = '0.75'; };
    card.onmouseleave = () => { card.style.opacity = '1'; };
    card.onclick = () => toggleArchive(s.key);
    grid.appendChild(card);
  });
}

window.toggleArchive = async function(key) {
  const idx = archivedSections.indexOf(key);
  if (idx === -1) archivedSections.push(key);
  else archivedSections.splice(idx, 1);
  await setDoc(configRef, { archivedSections }, { merge: true });
};

// Sécurité : Uniquement l'Admin
if (!sessionStorage.getItem('loggedIn') || sessionStorage.getItem('userRole') !== 'admin') {
  alert("Accès refusé à l'administration.");
  window.location.href = 'dashboard.html';
}

const usersRef = doc(db, "systeme", "utilisateurs");
let usersData = {};
let editModeId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Le Cloud avertit automatiquement la page si un utilisateur est ajouté/supprimé
  onSnapshot(usersRef, (docSnap) => {
    if (docSnap.exists()) {
      usersData = docSnap.data();
      chargerUtilisateurs();
    }
  });
});

function chargerUtilisateurs() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // 1. Transformer l'objet Firebase en tableau
  const listeBrute = Object.keys(usersData).map(id => {
    return { id: id, ...usersData[id] };
  });

  // 2. Séparer en deux listes distinctes
  const admins = listeBrute.filter(u => u.role === 'admin');
  const normaux = listeBrute.filter(u => u.role !== 'admin');

  // 3. Fonction de tri alphabétique (de A à Z)
  const triAlphabetique = (a, b) => {
    const nomA = (a.nom || '').toLowerCase();
    const nomB = (b.nom || '').toLowerCase();
    return nomA.localeCompare(nomB);
  };

  // On trie les deux listes
  admins.sort(triAlphabetique);
  normaux.sort(triAlphabetique);

  // 4. Fonction pour générer la ligne d'un utilisateur (avec ton style original)
  const ajouterLigne = (u) => {
    const id = u.id;
    const tr = document.createElement('tr');
    
    const permsHtml = (u.permissions || []).map(p => 
      `<span style="background:#e0ddd6; color:#555; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.75rem; margin-right:4px;">${p}</span>`
    ).join('');

    const roleHtml = u.role === 'admin'
      ? `<span style="color:#c0392b; font-weight:bold;">Admin</span>`
      : `<span style="color:#3a7a3a;">Utilisateur</span>`;

    const PAGE_LABELS = {
      'dashboard.html': '🏠 Accueil', 'rona.html': 'RONA S&S',
      'aeronefs.html': 'Aéronefs',   'arinc429.html': 'ARINC 429',
      'ena.html': 'ÉNA',             'aviation.html': 'Aviation',
      'hockey.html': 'Hockey',       'liens.html': 'Liens utiles',
      'films.html': 'Films & Séries','scifi.html': 'Sci-Fi',
    };
    const accueil = u.pageAccueil || 'dashboard.html';
    const accueilHtml = `<span style="font-size:0.8rem; color:#888;">${PAGE_LABELS[accueil] || accueil}</span>`;

    tr.innerHTML = `
      <td style="font-family:monospace; font-weight:bold;">${id}</td>
      <td>${u.nom}</td>
      <td>${accueilHtml}</td>
      <td>${roleHtml}</td>
      <td>${permsHtml}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button onclick="editerUser('${id}')" style="width:auto; display:inline-block; background:#162216; color:#d4892a; border:1px solid #d4892a; padding:0.3rem 0.6rem; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:0.3rem; transition:0.2s;" onmouseover="this.style.background='#d4892a'; this.style.color='#111';" onmouseout="this.style.background='#162216'; this.style.color='#d4892a';">Modifier</button>
        ${id === 'frank' ? '' : `<button onclick="supprimerUser('${id}')" style="width:auto; display:inline-block; background:#162216; color:#c0392b; border:1px solid #c0392b; padding:0.3rem 0.6rem; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.background='#c0392b'; this.style.color='#fff';" onmouseout="this.style.background='#162216'; this.style.color='#c0392b';">Supprimer</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  };

  // 5. Affichage de la section ADMINISTRATEURS
  if (admins.length > 0) {
    const trSeparateurAdmins = document.createElement('tr');
    trSeparateurAdmins.innerHTML = `
      <td colspan="6" style="padding-top: 1rem; padding-bottom: 0.5rem; font-size: 1.1rem; color: #c0392b; border-bottom: 2px solid #c0392b; letter-spacing: 0.05em;">
        <strong>Administrateurs</strong>
      </td>
    `;
    tbody.appendChild(trSeparateurAdmins);
    admins.forEach(ajouterLigne);
  }

  // 6. Affichage de la section UTILISATEURS (avec un espace au-dessus pour bien séparer)
  if (normaux.length > 0) {
    const trSeparateurNormaux = document.createElement('tr');
    trSeparateurNormaux.innerHTML = `
      <td colspan="6" style="padding-top: 2.5rem; padding-bottom: 0.5rem; font-size: 1.1rem; color: #3a7a3a; border-bottom: 2px solid #3a7a3a; letter-spacing: 0.05em;">
        <strong>Utilisateurs</strong>
      </td>
    `;
    tbody.appendChild(trSeparateurNormaux);
    normaux.forEach(ajouterLigne);
  }
}

function updatePermsOverlay() {
  const isAdmin = document.getElementById('user-role').value === 'admin';
  document.getElementById('perms-overlay').classList.toggle('hidden', !isAdmin);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('user-role').addEventListener('change', updatePermsOverlay);
});

window.ouvrirModalUser = function() {
  editModeId = null;
  document.getElementById('modal-user-titre').textContent = 'Nouvel utilisateur';
  document.getElementById('user-id').value = '';
  document.getElementById('user-id').disabled = false;
  document.getElementById('user-pass').value = '';
  document.getElementById('user-name').value = '';
  document.getElementById('user-role').value = 'user';
  document.getElementById('user-accueil').value = 'dashboard.html';
  document.querySelectorAll('.chk-perm').forEach(chk => chk.checked = false);
  updatePermsOverlay();
  document.getElementById('modal-user').classList.remove('hidden');
};

window.editerUser = function(id) {
  const u = usersData[id];
  editModeId = id;
  document.getElementById('modal-user-titre').textContent = `Modifier ${id}`;
  document.getElementById('user-id').value = id;
  document.getElementById('user-id').disabled = true;
  document.getElementById('user-pass').value = u.motDePasse;
  document.getElementById('user-name').value = u.nom;
  document.getElementById('user-role').value = u.role;
  document.getElementById('user-accueil').value = u.pageAccueil || 'dashboard.html';
  document.querySelectorAll('.chk-perm').forEach(chk => { chk.checked = u.permissions.includes(chk.value); });
  updatePermsOverlay();
  document.getElementById('modal-user').classList.remove('hidden');
};

window.sauvegarderUser = async function() {
  const id = document.getElementById('user-id').value.toLowerCase().trim();
  const pass = document.getElementById('user-pass').value;
  const nom = document.getElementById('user-name').value.trim();
  const role = document.getElementById('user-role').value;
  
  if (!id || !pass || !nom) { alert("Veuillez remplir les champs."); return; }

  const perms = [];
  document.querySelectorAll('.chk-perm:checked').forEach(chk => perms.push(chk.value));
  const pageAccueil = document.getElementById('user-accueil').value;

  if (!editModeId && usersData[id]) { alert("Identifiant déjà pris !"); return; }

  const targetId = editModeId || id;
  usersData[targetId] = { motDePasse: pass, nom: nom, role: role, permissions: perms, pageAccueil };

  await setDoc(usersRef, usersData);

  // Si on modifie notre propre compte, on met à jour la session immédiatement
  if (targetId === sessionStorage.getItem('userId')) {
    sessionStorage.setItem('userPermissions', JSON.stringify(perms));
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('userName', nom);
    sessionStorage.setItem('pageAccueil', pageAccueil);
  }

  window.fermerModalUser();
};

window.supprimerUser = async function(id) {
  if (id === 'frank') return;
  if (confirm(`Supprimer l'utilisateur "${id}" ?`)) {
    delete usersData[id];
    await setDoc(usersRef, usersData); // Envoi au Cloud
  }
};

window.fermerModalUser = function() {
  document.getElementById('modal-user').classList.add('hidden');
};