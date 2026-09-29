import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

// Neutralise le texte enregistré avant de l'insérer dans la page (empêche l'injection de code)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Note: gestion des utilisateurs via /api/users.php (PHP + MySQL)

// Vérification admin avant toute opération Firebase
if (!sessionStorage.getItem('loggedIn') || sessionStorage.getItem('userRole') !== 'admin') {
  window.location.href = sessionStorage.getItem('loggedIn') ? 'dashboard.html' : 'index.html';
}

// ── Archive management ───────────────────────────────
const SECTIONS_ARCHIVABLES = [
  { key: 'ena',          icon: '🛠️', label: 'ÉNA'            },
  { key: 'aviation',     icon: '✈️', label: 'Aviation'        },
  { key: 'bieres',       icon: '🍺', label: 'Bières'          },
  { key: 'scifi',        icon: '🚀', label: 'Science-Fiction' },
  { key: 'hockey',       icon: '🏒', label: 'Hockey'          },
  { key: 'liens',        icon: '🌍', label: 'Liens utiles'    },
  { key: 'films',        icon: '🎬', label: 'Films & Séries'  },
  { key: 'informatique', icon: '💻', label: 'Informatique', children: [
    { key: 'arinc429',  icon: '📡', label: 'ARINC 429'     },
    { key: 'csdb',      icon: '📶', label: 'CSDB'           },
    { key: 'converter', icon: '🔢', label: 'Convertisseur'  },
    { key: 'crypteur',  icon: '⚙️', label: 'Encodeur BNR'  },
  ]},
  { key: 'moteurs',      icon: '🌀', label: 'Moteurs', children: [
    { key: 'turboreacteur', icon: '🌀', label: 'CFM56-7B' },
    { key: 'pt6a21',        icon: '🛩️', label: 'PT6A-21'  },
    { key: 'pw1500g',       icon: '⚙️', label: 'PW1500G'  },
    { key: 'o320',          icon: '✈️', label: 'O-320'    },
  ]},
  { key: 'rona',         icon: '👷', label: 'RONA S&S'        },
  { key: 'osint',        icon: '🌐', label: 'OSINT Map'       },
  { key: 'distant',      icon: '🖥️', label: 'Connexion à distance' },
  { key: 'loi39',        icon: '🗳️', label: 'Loi 39'          },
  { key: 'pageTest',     icon: '🧪', label: 'Page de tests'   },
  { key: 'jeuxdesociete', icon: '🎲', label: 'Jeux de société', children: [
    { key: '7wonders',    icon: '🏛️', label: '7 Wonders'       },
    { key: 'qwirkle',     icon: '🎯', label: 'Qwirkle'          },
    { key: 'flip7',          icon: '🃏', label: 'Flip 7'           },
    { key: 'ladamepique',    icon: '♠️', label: 'La Dame de Pique' },
    { key: 'compteurgeneral', icon: '🎯', label: 'Compteur Général'  },
  ]},
];

const SECTIONS_INVITABLES = [
  { key: 'ena',           icon: '🛠️', label: 'ÉNA'            },
  { key: 'aviation',      icon: '✈️', label: 'Aviation'        },
  { key: 'bieres',        icon: '🍺', label: 'Bières'          },
  { key: 'scifi',         icon: '🚀', label: 'Science-Fiction' },
  { key: 'hockey',        icon: '🏒', label: 'Hockey'          },
  { key: 'liens',         icon: '🌍', label: 'Liens utiles'    },
  { key: 'films',         icon: '🎬', label: 'Films & Séries'  },
  { key: 'informatique',  icon: '💻', label: 'Informatique'    },
  { key: 'moteurs',       icon: '🌀', label: 'Moteurs'         },
  { key: 'jeuxdesociete', icon: '🎲', label: 'Jeux de société' },
  { key: 'rona',          icon: '👷', label: 'RONA S&S'        },
  { key: 'osint',         icon: '🌐', label: 'OSINT Map'       },
  { key: 'loi39',         icon: '🗳️', label: 'Loi 39'          },
];

const configRef = doc(db, "systeme", "config");
let archivedSections = [];
let guestPermissions = [];

// Live sync: re-render the archive grid whenever config changes
onSnapshot(configRef, (snap) => {
  archivedSections   = snap.exists() ? (snap.data().archivedSections  || []) : [];
  guestPermissions   = snap.exists() ? (snap.data().guestPermissions   || []) : [];
  renderArchiveGrid();
  renderGuestPerms();
  // Re-rendre les permissions si le modal est ouvert
  const modal = document.getElementById('modal-user');
  if (modal && !modal.classList.contains('hidden')) {
    const currentPerms = Array.from(document.querySelectorAll('.chk-perm:checked')).map(c => c.value);
    renderPermsModal(currentPerms);
  }
});

function makeArchiveCard(s, isChild = false) {
  const archived = archivedSections.includes(s.key);
  const card = document.createElement('div');
  card.style.cssText = [
    'background:' + (archived ? '#1c0f0f' : '#0f1a0f'),
    'border:1px solid ' + (archived ? '#6a2a2a' : '#2a4a2a'),
    'border-radius:' + (isChild ? '8px' : '10px'),
    'padding:' + (isChild ? '0.6rem 0.5rem' : '1rem 0.8rem'),
    'cursor:pointer',
    'transition:all 0.15s',
    'text-align:center',
    'user-select:none',
  ].join(';');
  card.innerHTML = `
    <div style="font-size:${isChild ? '1.1rem' : '1.6rem'}; margin-bottom:0.3rem;">${s.icon}</div>
    <div style="font-weight:bold; color:${archived ? '#c07070' : '#80cc80'}; font-size:${isChild ? '0.75rem' : '0.88rem'}; margin-bottom:0.25rem;">${s.label}</div>
    <div style="font-size:0.65rem; color:${archived ? '#7a3a3a' : '#3a6a3a'}; letter-spacing:0.03rem;">
      ${archived ? '📁 Archivé' : (isChild ? '✅ Visible' : '🏠 Dashboard')}
    </div>`;
  card.onmouseenter = () => { card.style.opacity = '0.75'; };
  card.onmouseleave = () => { card.style.opacity = '1'; };
  card.onclick = () => toggleArchive(s.key);
  return card;
}

function renderArchiveGrid() {
  const grid = document.getElementById('archive-grid');
  if (!grid) return;
  grid.innerHTML = '';
  SECTIONS_ARCHIVABLES.forEach(s => {
    if (s.children) {
      // Groupe parent + enfants
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 0.75rem;';

      const parentArchived = archivedSections.includes(s.key);
      const parentCard = document.createElement('div');
      parentCard.style.cssText = [
        'background:' + (parentArchived ? '#1c0f0f' : '#0f1a0f'),
        'border:2px solid ' + (parentArchived ? '#6a2a2a' : '#2a5a2a'),
        'border-radius:10px',
        'padding:1rem 0.8rem',
        'cursor:pointer',
        'transition:all 0.15s',
        'text-align:center',
        'user-select:none',
      ].join(';');
      parentCard.innerHTML = `
        <div style="font-size:1.6rem; margin-bottom:0.4rem;">${s.icon}</div>
        <div style="font-weight:bold; color:${parentArchived ? '#c07070' : '#80cc80'}; font-size:0.88rem; margin-bottom:0.35rem;">${s.label}</div>
        <div style="font-size:0.7rem; color:${parentArchived ? '#7a3a3a' : '#3a6a3a'}; letter-spacing:0.03rem;">
          ${parentArchived ? '📁 Archivé' : '🏠 Dashboard'}
        </div>`;
      parentCard.onmouseenter = () => { parentCard.style.opacity = '0.75'; };
      parentCard.onmouseleave = () => { parentCard.style.opacity = '1'; };
      parentCard.onclick = () => toggleArchive(s.key, s.children);
      wrapper.appendChild(parentCard);

      s.children.forEach(child => {
        wrapper.appendChild(makeArchiveCard(child, true));
      });

      grid.appendChild(wrapper);
    } else {
      grid.appendChild(makeArchiveCard(s));
    }
  });
}

function renderGuestPerms() {
  const grid = document.getElementById('guest-perms-grid');
  if (!grid) return;
  grid.innerHTML = '';
  SECTIONS_INVITABLES.forEach(s => {
    const on = guestPermissions.includes(s.key);
    const card = document.createElement('div');
    card.style.cssText = [
      'background:' + (on ? '#0f2a0f' : '#0f1a0f'),
      'border:1px solid ' + (on ? '#27ae60' : '#2a3a2a'),
      'border-radius:10px',
      'padding:1rem 0.8rem',
      'cursor:pointer',
      'transition:all 0.15s',
      'text-align:center',
      'user-select:none',
    ].join(';');
    card.innerHTML = `
      <div style="font-size:1.6rem; margin-bottom:0.3rem;">${s.icon}</div>
      <div style="font-weight:bold; color:${on ? '#27ae60' : '#556655'}; font-size:0.88rem; margin-bottom:0.25rem;">${s.label}</div>
      <div style="font-size:0.65rem; color:${on ? '#1a6a1a' : '#2a3a2a'}; letter-spacing:0.03rem;">${on ? '✅ Accessible' : '🔒 Bloqué'}</div>`;
    card.onmouseenter = () => { card.style.opacity = '0.75'; };
    card.onmouseleave = () => { card.style.opacity = '1'; };
    card.onclick = () => toggleGuestPerm(s.key);
    grid.appendChild(card);
  });
}

window.toggleGuestPerm = async function(key) {
  const idx = guestPermissions.indexOf(key);
  if (idx === -1) guestPermissions.push(key);
  else guestPermissions.splice(idx, 1);
  renderGuestPerms();
  await setDoc(configRef, { guestPermissions }, { merge: true });
};

window.toggleArchive = async function(key, children = []) {
  const idx = archivedSections.indexOf(key);
  if (idx === -1) {
    archivedSections.push(key);
    children.forEach(child => {
      if (!archivedSections.includes(child.key)) archivedSections.push(child.key);
    });
  } else {
    archivedSections.splice(idx, 1);
    children.forEach(child => {
      const ci = archivedSections.indexOf(child.key);
      if (ci !== -1) archivedSections.splice(ci, 1);
    });
  }
  renderArchiveGrid();
  await setDoc(configRef, { archivedSections }, { merge: true });
};

let usersData = {};
let editModeId = null;
// coffre des mots de passe : lecture déverrouillée quelques minutes par un code 2FA
const coffre = { active: false, jusqua: 0, mdp: {} };
let coffreMinuterie = null;

document.addEventListener('DOMContentLoaded', async () => {
  await chargerUtilisateurs();
});

async function chargerUtilisateurs() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  try {
    const ouvert = coffre.jusqua > Date.now();
    let res  = await fetch('/api/users.php' + (ouvert ? '?mdp=1' : ''), { credentials: 'include' });
    if (ouvert && res.status === 403) { coffre.jusqua = 0; res = await fetch('/api/users.php', { credentials: 'include' }); }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Erreur');
    usersData = json.users ?? {};
    coffre.mdp = json.motsDePasse || {};
    majCoffreBar();
  } catch (e) {
    console.error('[admin] Erreur chargement utilisateurs:', e);
  }

  // 1. Transformer l'objet en tableau
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
      `<span style="background:#e0ddd6; color:#555; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.75rem; margin-right:4px;">${esc(p)}</span>`
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
    const accueilHtml = `<span style="font-size:0.8rem; color:#888;">${esc(PAGE_LABELS[accueil] || accueil)}</span>`;

    tr.className = 'user-row';
    tr.innerHTML = `
      <td class="u-id" data-label="Identifiant" style="font-family:monospace; font-weight:bold;">${esc(id)}</td>
      <td class="u-nom" data-label="Nom affiché">${esc(u.nom)}</td>
      <td data-label="Accueil">${accueilHtml}</td>
      <td data-label="Rôle">${roleHtml}</td>
      <td class="u-mdp" data-label="Mot de passe">${celluleMdp(id)}</td>
      <td class="u-perms" data-label="Permissions">${permsHtml || '<span style="color:#888; font-size:0.8rem;">—</span>'}</td>
      <td class="u-actions" style="text-align:right; white-space:nowrap;">
        <button class="u-btn" onclick="changerMotDePasse('${id}')" title="Définir un nouveau mot de passe" style="width:auto; display:inline-block; background:#162216; color:#80cc80; border:1px solid #80cc80; padding:0.3rem 0.6rem; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:0.3rem;">🔑 Mot de passe</button>
        <button class="u-btn" onclick="editerUser('${id}')" style="width:auto; display:inline-block; background:#162216; color:#d4892a; border:1px solid #d4892a; padding:0.3rem 0.6rem; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:0.3rem; transition:0.2s;" onmouseover="this.style.background='#d4892a'; this.style.color='#111';" onmouseout="this.style.background='#162216'; this.style.color='#d4892a';">Modifier</button>
        ${id === 'frank' ? '' : `<button class="u-btn" onclick="supprimerUser('${id}')" style="width:auto; display:inline-block; background:#162216; color:#c0392b; border:1px solid #c0392b; padding:0.3rem 0.6rem; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.background='#c0392b'; this.style.color='#fff';" onmouseout="this.style.background='#162216'; this.style.color='#c0392b';">Supprimer</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  };

  // 5. Affichage de la section ADMINISTRATEURS
  if (admins.length > 0) {
    const trSeparateurAdmins = document.createElement('tr');
    trSeparateurAdmins.innerHTML = `
      <td colspan="7" style="padding-top: 1rem; padding-bottom: 0.5rem; font-size: 1.1rem; color: #c0392b; border-bottom: 2px solid #c0392b; letter-spacing: 0.05em;">
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
      <td colspan="7" style="padding-top: 2.5rem; padding-bottom: 0.5rem; font-size: 1.1rem; color: #3a7a3a; border-bottom: 2px solid #3a7a3a; letter-spacing: 0.05em;">
        <strong>Utilisateurs</strong>
      </td>
    `;
    tbody.appendChild(trSeparateurNormaux);
    normaux.forEach(ajouterLigne);
  }
}

// ── Structure des permissions ────────────────────────
const PERMS_STRUCTURE = [
  { key: 'ena',       label: 'ÉNA' },
  { key: 'aeronefs',  label: 'Aéronefs' },
  { key: 'aviation',  label: 'Aviation' },
  { key: 'bieres',    label: 'Bières' },
  { key: 'scifi',     label: 'Sci-Fi' },
  { key: 'hockey',    label: 'Hockey' },
  { key: 'liens',     label: 'Liens utiles' },
  { key: 'films',     label: 'Films & Séries' },
  { key: 'webmail',   label: 'Webmail' },
  { key: 'rona',      label: 'RONA S&S' },
  { key: 'pageTest',  label: 'Page de tests' },
  { key: 'osint',     label: 'OSINT Map' },
  { key: 'distant',   label: 'Connexion à distance' },
  { key: 'loi39',     label: 'Loi 39' },
  { key: 'informatique', label: 'Informatique', children: [
    { key: 'arinc429',  label: 'ARINC 429' },
    { key: 'csdb',      label: 'CSDB' },
    { key: 'converter', label: 'Convertisseur' },
    { key: 'crypteur',  label: 'Encodeur BNR' },
    { key: 'tcpip',     label: 'TCP/IP' },
  ]},
  { key: 'moteurs', label: 'Moteurs', children: [
    { key: 'turboreacteur', label: 'CFM56-7B' },
    { key: 'pt6a21',        label: 'PT6A-21' },
    { key: 'pw1500g',       label: 'PW1500G' },
    { key: 'o320',          label: 'O-320' },
  ]},
  { key: 'jeuxdesociete', label: 'Jeux de société', children: [
    { key: '7wonders',    label: '7 Wonders'       },
    { key: 'qwirkle',     label: 'Qwirkle'         },
    { key: 'flip7',           label: 'Flip 7'           },
    { key: 'ladamepique',     label: 'La Dame de Pique'  },
    { key: 'compteurgeneral', label: 'Compteur Général'  },
  ]},
];

function makePermLabel(key, label, isParent = false, parentKey = null) {
  const lbl = document.createElement('label');
  lbl.className = 'perm-item' + (isParent ? ' perm-parent' : '');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'chk-perm' + (isParent ? ' chk-parent' : '') + (parentKey ? ' chk-child' : '');
  input.value = key;
  if (parentKey) input.dataset.parent = parentKey;
  lbl.appendChild(input);
  lbl.appendChild(document.createTextNode(' ' + label));
  return lbl;
}

function renderPermsModal(currentPerms = []) {
  const activeGrid = document.getElementById('perms-grid');
  const archivedGrid = document.getElementById('archived-perms-grid');
  const archivedSection = document.getElementById('archived-perms-section');
  if (!activeGrid || !archivedGrid) return;

  activeGrid.innerHTML = '';
  archivedGrid.innerHTML = '';
  let hasArchived = false;

  PERMS_STRUCTURE.forEach(s => {
    const isArchived = archivedSections.includes(s.key);

    if (s.children) {
      // Groupe parent + enfants
      const group = document.createElement('div');
      group.className = 'perm-group';
      group.appendChild(makePermLabel(s.key, s.label, true, null));

      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'perm-children';

      s.children.forEach(child => {
        const childArchived = archivedSections.includes(child.key);
        if (childArchived && !isArchived) {
          // Enfant archivé mais parent actif → enfant dans section archivée
          archivedGrid.appendChild(makePermLabel(child.key, child.label + ' (Informatique)'));
          hasArchived = true;
        } else {
          childrenDiv.appendChild(makePermLabel(child.key, child.label, false, s.key));
        }
      });

      group.appendChild(childrenDiv);
      if (isArchived) {
        archivedGrid.appendChild(group);
        hasArchived = true;
      } else {
        activeGrid.appendChild(group);
      }
    } else {
      const lbl = makePermLabel(s.key, s.label);
      if (isArchived) {
        archivedGrid.appendChild(lbl);
        hasArchived = true;
      } else {
        activeGrid.appendChild(lbl);
      }
    }
  });

  // Appliquer l'état coché
  document.querySelectorAll('.chk-perm').forEach(chk => {
    chk.checked = currentPerms.includes(chk.value);
  });

  // État indéterminé des parents
  document.querySelectorAll('.chk-parent').forEach(parent => {
    const siblings = Array.from(document.querySelectorAll(`.chk-child[data-parent="${parent.value}"]`));
    if (siblings.length > 0) {
      const n = siblings.filter(s => s.checked).length;
      parent.checked = n === siblings.length;
      parent.indeterminate = n > 0 && n < siblings.length;
    }
  });

  // Attacher les listeners parent ↔ enfant
  document.querySelectorAll('.chk-parent').forEach(parent => {
    parent.addEventListener('change', () => {
      document.querySelectorAll(`.chk-child[data-parent="${parent.value}"]`)
        .forEach(child => child.checked = parent.checked);
    });
  });
  document.querySelectorAll('.chk-child').forEach(child => {
    child.addEventListener('change', () => {
      const parentVal = child.dataset.parent;
      const parent = document.querySelector(`.chk-parent[value="${parentVal}"]`);
      if (!parent) return;
      const siblings = Array.from(document.querySelectorAll(`.chk-child[data-parent="${parentVal}"]`));
      const n = siblings.filter(s => s.checked).length;
      parent.checked = n === siblings.length;
      parent.indeterminate = n > 0 && n < siblings.length;
    });
  });

  if (archivedSection) archivedSection.style.display = hasArchived ? 'block' : 'none';
}

function updatePermsOverlay() {
  const isAdmin = document.getElementById('user-role').value === 'admin';
  document.getElementById('perms-overlay').classList.toggle('hidden', !isAdmin);
  document.getElementById('archived-perms-overlay')?.classList.toggle('hidden', !isAdmin);
  if (isAdmin) {
    document.querySelectorAll('.chk-perm').forEach(chk => chk.checked = true);
  }
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
  document.getElementById('user-pass').placeholder = '8 caractères minimum';
  document.getElementById('pass-aide').textContent = "Communique ce mot de passe à la personne : il ne pourra plus être affiché après l'enregistrement.";
  document.getElementById('user-name').value = '';
  document.getElementById('user-role').value = 'user';
  document.getElementById('user-accueil').value = 'dashboard.html';
  renderPermsModal([]);
  updatePermsOverlay();
  document.getElementById('modal-user').classList.remove('hidden');
};

window.editerUser = function(id) {
  const u = usersData[id];
  editModeId = id;
  document.getElementById('modal-user-titre').textContent = `Modifier ${id}`;
  document.getElementById('user-id').value = id;
  document.getElementById('user-id').disabled = true;
  document.getElementById('user-pass').value = '';
  document.getElementById('user-pass').placeholder = 'Laisser vide pour garder le mot de passe actuel';
  document.getElementById('pass-aide').textContent = "Le mot de passe actuel est chiffré et ne peut pas être affiché. Tape ou génère un nouveau mot de passe pour le remplacer.";
  document.getElementById('user-name').value = u.nom;
  document.getElementById('user-role').value = u.role;
  document.getElementById('user-accueil').value = u.pageAccueil || 'dashboard.html';
  renderPermsModal(u.permissions || []);
  updatePermsOverlay();
  document.getElementById('modal-user').classList.remove('hidden');
};

window.sauvegarderUser = async function() {
  const id = document.getElementById('user-id').value.toLowerCase().trim();
  const pass = document.getElementById('user-pass').value;
  const nom = document.getElementById('user-name').value.trim();
  const role = document.getElementById('user-role').value;
  
  if (!id || !nom) { alert("Veuillez remplir les champs."); return; }
  if (!editModeId && !pass) { alert("Mot de passe requis pour un nouvel utilisateur."); return; }
  if (pass && pass.length < 8) { alert("Le mot de passe doit contenir au moins 8 caractères."); return; }

  const perms = [];
  document.querySelectorAll('.chk-perm:checked').forEach(chk => perms.push(chk.value));
  const pageAccueil = document.getElementById('user-accueil').value;

  if (!editModeId && usersData[id]) { alert("Identifiant déjà pris !"); return; }

  const targetId = editModeId || id;
  try {
    const res  = await fetch('/api/users.php', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', userId: targetId, nom, role, permissions: perms, pageAccueil, motDePasse: pass }),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? 'Erreur');
    if (json.avertissement) alert(json.avertissement);
  } catch (e) {
    alert('Erreur : ' + e.message);
    return;
  }

  // Si on modifie notre propre compte, on met à jour la session immédiatement
  if (targetId === sessionStorage.getItem('userId')) {
    sessionStorage.setItem('userPermissions', JSON.stringify(perms));
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('userName', nom);
    sessionStorage.setItem('pageAccueil', pageAccueil);
  }

  await chargerUtilisateurs();
  window.fermerModalUser();
  if (pass) afficherMotDePasse(targetId, pass);
};

/* ══════════ Coffre des mots de passe (lecture protégée par 2FA) ══════════ */

function celluleMdp(id) {
  if (coffre.jusqua <= Date.now()) return '<span class="mdp-cache">••••••••</span>';
  const m = coffre.mdp[id];
  if (!m) return '<span class="mdp-absent" title="Le mot de passe actuel est chiffré à sens unique. Il deviendra lisible dès la prochaine connexion de la personne, ou si tu lui en définis un nouveau.">En attente de sa prochaine connexion</span>';
  return `<span class="mdp-clair">${esc(m.mdp)}</span> <button class="mdp-copier" onclick="copierTexte(this, '${id}')" title="Copier">📋</button>`;
}
window.copierTexte = async function(btn, id) {
  const t = (coffre.mdp[id] || {}).mdp || '';
  try { await navigator.clipboard.writeText(t); btn.textContent = '✓'; setTimeout(() => btn.textContent = '📋', 1500); }
  catch (e) { prompt('Copie le mot de passe :', t); }
};

async function coffreApi(action, extra = {}) {
  const res = await fetch('/api/users.php', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ?? 'Erreur');
  return json;
}

function majCoffreBar() {
  const bar = document.getElementById('coffre-bar'); if (!bar) return;
  const reste = Math.max(0, Math.round((coffre.jusqua - Date.now()) / 1000));
  if (!coffre.active) {
    bar.className = 'coffre-bar';
    bar.innerHTML = `<span>🔐 Pour afficher les mots de passe, active d'abord la double authentification.</span><button class="coffre-btn" onclick="ouvrir2FA()">Configurer la 2FA</button>`;
  } else if (reste > 0) {
    bar.className = 'coffre-bar ouvert';
    bar.innerHTML = `<span>🔓 Mots de passe visibles — verrouillage dans <b id="coffre-reste">${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}</b></span><button class="coffre-btn" onclick="verrouillerCoffre()">🔒 Verrouiller</button>`;
  } else {
    bar.className = 'coffre-bar';
    bar.innerHTML = `<span>🔒 Mots de passe masqués.</span><button class="coffre-btn" onclick="ouvrirDeverrouillage()">🔓 Afficher les mots de passe</button>`;
  }
}

function demarrerMinuterie() {
  clearInterval(coffreMinuterie);
  coffreMinuterie = setInterval(() => {
    if (coffre.jusqua <= Date.now()) { clearInterval(coffreMinuterie); coffre.mdp = {}; chargerUtilisateurs(); return; }
    const el = document.getElementById('coffre-reste');
    const r = Math.round((coffre.jusqua - Date.now()) / 1000);
    if (el) el.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
  }, 1000);
}

async function chargerCoffre() {
  try {
    const j = await coffreApi('2fa_etat');
    coffre.active = j.active; coffre.jusqua = j.jusqua > 0 ? Date.now() + j.jusqua * 1000 : 0;
    if (coffre.jusqua) demarrerMinuterie();
  } catch (e) { console.warn('[admin] 2FA :', e.message); }
  majCoffreBar();
  if (coffre.jusqua) chargerUtilisateurs();
}
document.addEventListener('DOMContentLoaded', chargerCoffre);

/* Configuration de la 2FA : QR code à scanner, puis un code pour confirmer */
window.ouvrir2FA = async function() {
  try {
    const j = await coffreApi('2fa_init');
    const box = document.getElementById('qr-2fa');
    box.innerHTML = '';
    if (window.qrcode) { const q = qrcode(0, 'M'); q.addData(j.uri); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2 }); }
    document.getElementById('secret-2fa').textContent = j.secret.replace(/(.{4})/g, '$1 ').trim();
    document.getElementById('code-2fa-setup').value = '';
    document.getElementById('err-2fa-setup').textContent = '';
    document.getElementById('modal-2fa').classList.remove('hidden');
    document.getElementById('code-2fa-setup').focus();
  } catch (e) { alert('Erreur : ' + e.message); }
};
window.activer2FA = async function() {
  const code = document.getElementById('code-2fa-setup').value;
  try {
    await coffreApi('2fa_activer', { code });
    coffre.active = true;
    document.getElementById('modal-2fa').classList.add('hidden');
    majCoffreBar();
    alert('Double authentification activée. Utilise un code de l\'application pour afficher les mots de passe.');
  } catch (e) { document.getElementById('err-2fa-setup').textContent = e.message; }
};

/* Déverrouillage temporaire */
window.ouvrirDeverrouillage = function() {
  document.getElementById('code-2fa').value = '';
  document.getElementById('err-2fa').textContent = '';
  document.getElementById('modal-code').classList.remove('hidden');
  document.getElementById('code-2fa').focus();
};
window.validerCode = async function() {
  const code = document.getElementById('code-2fa').value;
  try {
    const j = await coffreApi('deverrouiller', { code });
    coffre.jusqua = Date.now() + j.jusqua * 1000;
    document.getElementById('modal-code').classList.add('hidden');
    demarrerMinuterie();
    await chargerUtilisateurs();
  } catch (e) { document.getElementById('err-2fa').textContent = e.message; }
};
window.verrouillerCoffre = async function() {
  try { await coffreApi('verrouiller'); } catch (e) {}
  coffre.jusqua = 0; coffre.mdp = {}; clearInterval(coffreMinuterie);
  await chargerUtilisateurs();
};
window.fermerModal2FA = id => document.getElementById(id).classList.add('hidden');
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'code-2fa') validerCode();
  if (e.target.id === 'code-2fa-setup') activer2FA();
});

/* ── Mots de passe : générer, afficher une seule fois, copier ── */
function genererMotDePasse() {
  // sans caractères ambigus (0/O, 1/l/I)
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  let m = ''; r.forEach((x, i) => { m += A[x % A.length]; if (i === 3 || i === 7) m += '-'; });
  return m;
}
window.genererDansChamp = function() {
  const i = document.getElementById('user-pass');
  i.value = genererMotDePasse(); i.type = 'text';
  const oeil = document.getElementById('pass-oeil'); if (oeil) oeil.textContent = '🙈';
};
window.changerMotDePasse = function(id) {
  window.editerUser(id);
  window.genererDansChamp();
  document.getElementById('user-pass').focus();
  document.getElementById('user-pass').select();
};
function afficherMotDePasse(id, pass) {
  document.getElementById('mdp-id').textContent = id;
  document.getElementById('mdp-valeur').textContent = pass;
  document.getElementById('mdp-copie').textContent = '📋 Copier';
  document.getElementById('modal-mdp').classList.remove('hidden');
}
window.copierMotDePasse = async function() {
  const t = document.getElementById('mdp-valeur').textContent;
  try { await navigator.clipboard.writeText(t); document.getElementById('mdp-copie').textContent = '✓ Copié'; }
  catch (e) { prompt('Copie le mot de passe :', t); }
};
window.fermerModalMdp = function() {
  document.getElementById('mdp-valeur').textContent = '';
  document.getElementById('modal-mdp').classList.add('hidden');
};

window.supprimerUser = async function(id) {
  if (id === 'frank') return;
  if (confirm(`Supprimer l'utilisateur "${id}" ?`)) {
    try {
      const res  = await fetch('/api/users.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'Erreur');
      await chargerUtilisateurs();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }
};

window.fermerModalUser = function() {
  document.getElementById('modal-user').classList.add('hidden');
};