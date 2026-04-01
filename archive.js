import { db, doc, getDoc } from "./firebase-config.js";

if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const role = sessionStorage.getItem('userRole');

  // Load archived sections from Firestore
  let archivedSections = [];
  try {
    const configSnap = await getDoc(doc(db, "systeme", "config"));
    if (configSnap.exists()) archivedSections = configSnap.data().archivedSections || [];
  } catch (e) { /* offline fallback: show nothing archived */ }

  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    const isArchived = archivedSections.includes(section);
    const hasPermission = role === 'admin' || permissions.includes(section);
    // Show only cards that are archived AND the user has access to
    if (!isArchived || !hasPermission) {
      card.style.display = 'none';
    }
  });

  // Empty-state message
  const visibleCards = [...cards].filter(c => c.style.display !== 'none');
  const emptyMsg = document.getElementById('archive-empty');
  if (emptyMsg) emptyMsg.style.display = visibleCards.length === 0 ? 'block' : 'none';

  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';
});
