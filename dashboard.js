import { db, doc, getDoc } from "./firebase-config.js";

// Sécurité de base
if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Affichage du message de bienvenue et du badge Admin
  const nomUser = sessionStorage.getItem('userName') || 'Invité';
  const role = sessionStorage.getItem('userRole');
  const subtitleEl = document.querySelector('.subtitle');

  subtitleEl.textContent = `Bienvenue, ${nomUser} 👋`;
  if (role === 'admin') {
    const adminHref = window.location.pathname.includes('/beta/') ? 'beta/admin.html' : 'admin.html';
    const link = document.createElement('a');
    link.href = adminHref; link.style.textDecoration = 'none'; link.title = "Accéder à l'administration";
    const badge = document.createElement('span');
    badge.style.cssText = 'background:#c0392b;color:white;font-size:0.7rem;padding:0.2rem 0.6rem;border-radius:12px;margin-left:8px;vertical-align:middle;font-weight:bold;letter-spacing:0.05em;cursor:pointer;box-shadow:0 2px 5px rgba(192,57,43,0.4);';
    badge.textContent = 'ADMIN';
    link.appendChild(badge);
    subtitleEl.appendChild(link);
  }

  // 2. Charger les sections archivées depuis Firestore
  let archivedSections = [];
  try {
    const configSnap = await getDoc(doc(db, "systeme", "config"));
    if (configSnap.exists()) archivedSections = configSnap.data().archivedSections || [];
  } catch (e) { /* offline fallback: show all permitted cards */ }

  // 3. Gérer l'affichage des cartes selon les permissions et les archives
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const cards = document.querySelectorAll('.menu-card');

  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    const isArchived = archivedSections.includes(section);
    if (isArchived || (role !== 'admin' && !permissions.includes(section))) {
      card.style.display = 'none';
    }
  });

  // 4. Gérer l'affichage du bouton Webmail
  const btnWebmail = document.getElementById('btn-webmail');
  if (btnWebmail) {
    btnWebmail.style.display = permissions.includes('webmail') ? 'flex' : 'none';
  }

  // Rendre le menu visible maintenant que tout est appliqué
  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';

  // Boutons admin seulement
  if (role === 'admin') {
    const btnVersion = document.getElementById('toggle-version-btn');
    if (btnVersion) {
      btnVersion.style.display = 'inline-block';
      const hidden = localStorage.getItem('versionBadgeHidden') === 'true';
      updateToggleBtn(btnVersion, hidden);
    }
    const btnConstruction = document.getElementById('btn-construction');
    if (btnConstruction) btnConstruction.style.display = 'inline-flex';
  }

  // Déconnexion
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.clear();
      window.location.href = 'index.html';
    });
  }
});
