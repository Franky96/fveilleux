import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

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

    tr.innerHTML = `
      <td style="font-family:monospace; font-weight:bold;">${id}</td>
      <td>${u.nom}</td>
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
      <td colspan="5" style="padding-top: 1rem; padding-bottom: 0.5rem; font-size: 1.1rem; color: #c0392b; border-bottom: 2px solid #c0392b; letter-spacing: 0.05em;">
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
      <td colspan="5" style="padding-top: 2.5rem; padding-bottom: 0.5rem; font-size: 1.1rem; color: #3a7a3a; border-bottom: 2px solid #3a7a3a; letter-spacing: 0.05em;">
        <strong>Utilisateurs</strong>
      </td>
    `;
    tbody.appendChild(trSeparateurNormaux);
    normaux.forEach(ajouterLigne);
  }
}

window.ouvrirModalUser = function() {
  editModeId = null;
  document.getElementById('modal-user-titre').textContent = 'Nouvel utilisateur';
  document.getElementById('user-id').value = '';
  document.getElementById('user-id').disabled = false;
  document.getElementById('user-pass').value = '';
  document.getElementById('user-name').value = '';
  document.getElementById('user-role').value = 'user';
  document.querySelectorAll('.chk-perm').forEach(chk => chk.checked = false);
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
  document.querySelectorAll('.chk-perm').forEach(chk => { chk.checked = u.permissions.includes(chk.value); });
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

  if (!editModeId && usersData[id]) { alert("Identifiant déjà pris !"); return; }

  const targetId = editModeId || id;
  usersData[targetId] = { motDePasse: pass, nom: nom, role: role, permissions: perms };
  
  await setDoc(usersRef, usersData); // Envoi au Cloud

  // NOUVEAU : Si on modifie notre propre compte, on met à jour la session immédiatement !
  if (targetId === sessionStorage.getItem('userId')) {
    sessionStorage.setItem('userPermissions', JSON.stringify(perms));
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('userName', nom);
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