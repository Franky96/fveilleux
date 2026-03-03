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

  Object.keys(usersData).forEach(id => {
    const u = usersData[id];
    const tr = document.createElement('tr');
    
    const permsHtml = u.permissions.map(p => 
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
      <td style="text-align:right;">
        <button class="btn-edit" onclick="editerUser('${id}')">✏️</button>
        ${id === 'frank' ? '' : `<button class="btn-delete" onclick="supprimerUser('${id}')">🗑️</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
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