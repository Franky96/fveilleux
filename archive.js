import { db, doc, getDoc } from "./firebase-config.js";

if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

// Modules run after the DOM is parsed (deferred), so we can query elements directly.
(async () => {
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const role = sessionStorage.getItem('userRole');

  const cards = document.querySelectorAll('.menu-card');

  // Hide all cards immediately so nothing flashes before Firestore responds
  cards.forEach(card => { card.style.display = 'none'; });

  // Load archived sections from Firestore
  let archivedSections = [];
  try {
    const configSnap = await getDoc(doc(db, "systeme", "config"));
    if (configSnap.exists()) archivedSections = configSnap.data().archivedSections || [];
  } catch (e) { /* offline: leave archivedSections empty */ }

  // Show only cards that are archived AND the user has permission to access
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    const isArchived = archivedSections.includes(section);
    const hasPermission = role === 'admin' || permissions.includes(section);
    if (isArchived && hasPermission) {
      card.style.display = '';
    }
  });

  // Empty-state message
  const visibleCards = [...cards].filter(c => c.style.display !== 'none');
  const emptyMsg = document.getElementById('archive-empty');
  if (emptyMsg) emptyMsg.style.display = visibleCards.length === 0 ? 'block' : 'none';

  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';
})();
