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

  // Accès complet si admin ou permission parente 'jeuxdesociete'
  const hasFullAccess = role === 'admin' || permissions.includes('jeuxdesociete');

  // Masquer les cartes archivées ou sans permission
  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    const isArchived = archivedSections.includes(section);
    if (isArchived || (!hasFullAccess && !permissions.includes(section))) {
      card.style.display = 'none';
    }
  });

  // Révéler le menu maintenant que les permissions sont appliquées
  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';

  // Items admin seulement
  const isAdmin = role === 'admin';
  const btnWebmail = document.getElementById('btn-webmail');
  if (btnWebmail) btnWebmail.style.display = isAdmin ? 'flex' : 'none';
  const badgeBtn = document.getElementById('toggle-version-btn');
  if (badgeBtn) {
    badgeBtn.style.display = isAdmin ? 'flex' : 'none';
    if (isAdmin && window.updateToggleBtn) window.updateToggleBtn(badgeBtn, localStorage.getItem('versionBadgeHidden') === 'true');
  }
  const constructionBtn = document.getElementById('btn-construction');
  if (constructionBtn) constructionBtn.style.display = isAdmin ? 'flex' : 'none';
  const adminSep = document.getElementById('admin-sep');
  if (adminSep) adminSep.style.display = isAdmin ? 'block' : 'none';

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
