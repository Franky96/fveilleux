import { db, doc, getDoc } from "./firebase-config.js";

if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const role = sessionStorage.getItem('userRole');

  // Charger les sections archivées depuis Firestore
  let archivedSections = [];
  try {
    const configSnap = await getDoc(doc(db, "systeme", "config"));
    if (configSnap.exists()) archivedSections = configSnap.data().archivedSections || [];
  } catch (e) { /* offline fallback: show all permitted cards */ }

  // Accès complet si admin ou permission parente 'informatique'
  const hasFullInfo = role === 'admin' || permissions.includes('informatique');

  // Masquer les cartes archivées ou sans permission
  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    const isArchived = archivedSections.includes(section);
    if (isArchived || (!hasFullInfo && !permissions.includes(section))) {
      card.style.display = 'none';
    }
  });

  // Révéler le menu maintenant que les permissions sont appliquées
  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';

  // Webmail
  const btnWebmail = document.getElementById('btn-webmail');
  if (btnWebmail) btnWebmail.style.display = permissions.includes('webmail') ? 'flex' : 'none';

  // Items admin
  if (role === 'admin') {
    const adminSep = document.getElementById('admin-sep');
    if (adminSep) adminSep.style.display = 'block';
  }

  // Déconnexion
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/login.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      }).catch(() => {});
      sessionStorage.clear();
      window.location.href = 'index.html';
    });
  }
});
