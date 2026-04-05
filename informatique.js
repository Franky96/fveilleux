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
});
