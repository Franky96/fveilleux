import { db, doc, getDoc } from "./firebase-config.js";

// Section publique : les simulateurs sont visibles sans connexion.
// Seuls les manuels (api/manuel.php) restent réservés aux comptes autorisés.
const loggedIn = !!sessionStorage.getItem('loggedIn');

document.addEventListener('DOMContentLoaded', async () => {
  const role = sessionStorage.getItem('userRole');

  // Charger les sections archivées depuis Firestore
  let archivedSections = [];
  try {
    const configSnap = await getDoc(doc(db, "systeme", "config"));
    if (configSnap.exists()) archivedSections = configSnap.data().archivedSections || [];
  } catch (e) { /* offline fallback: show all permitted cards */ }

  // Masquer seulement les cartes archivées (section publique)
  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    if (archivedSections.includes(card.getAttribute('data-section'))) card.style.display = 'none';
  });

  // Visiteur non connecté : retour vers la page de connexion, pas de menu du compte
  if (!loggedIn) {
    const back = document.querySelector('.back-btn-dash');
    if (back) { back.href = 'index.html'; back.innerHTML = '&#8592; Connexion'; }
    const hbg = document.getElementById('hamburger-btn');
    if (hbg) hbg.style.display = 'none';
  }

  // Révéler le menu maintenant que les permissions sont appliquées
  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';

  // Archives — visible pour tous
  const archivesBtn = document.getElementById('btn-archives');
  if (archivesBtn) archivesBtn.style.display = 'flex';

  // Items admin seulement
  const isAdmin = role === 'admin';
  const btnWebmail = document.getElementById('btn-webmail');
  if (btnWebmail) btnWebmail.style.display = isAdmin ? 'flex' : 'none';
  const badgeBtn = document.getElementById('toggle-version-btn');
  if (badgeBtn) {
    badgeBtn.style.display = isAdmin ? 'flex' : 'none';
    if (isAdmin && window.updateToggleBtn) window.updateToggleBtn(badgeBtn, localStorage.getItem('versionBadgeHidden') === 'true');
  }
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
