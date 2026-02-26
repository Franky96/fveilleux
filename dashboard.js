// 1. Sécurité de base : on vérifie UNIQUEMENT si l'utilisateur est connecté (pas besoin de permission spécifique pour le portail)
if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  // 2. Affichage du message de bienvenue et du badge Admin
  const nomUser = sessionStorage.getItem('userName') || 'Invité';
  const role = sessionStorage.getItem('userRole');
  const subtitleEl = document.querySelector('.subtitle');
  
 if (role === 'admin') {
    // Ajoute le badge rouge CLIQUABLE si c'est toi
    subtitleEl.innerHTML = `Bienvenue, ${nomUser} 👋 <a href="admin.html" style="text-decoration:none;" title="Accéder à l'administration"><span style="background:#c0392b; color:white; font-size:0.7rem; padding:0.2rem 0.6rem; border-radius:12px; margin-left:8px; vertical-align:middle; font-weight:bold; letter-spacing:0.05em; cursor:pointer; box-shadow:0 2px 5px rgba(192,57,43,0.4);">ADMIN</span></a>`;
  } else {
    // Affichage normal pour les autres
    subtitleEl.textContent = `Bienvenue, ${nomUser} 👋`;
  }

  // 3. Gérer l'affichage des cartes selon les permissions
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const cards = document.querySelectorAll('.menu-card');
  
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    if (!permissions.includes(section)) {
      card.style.display = 'none';
    }
  });

  // Rendre le menu visible maintenant que les permissions sont appliquées
  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';

  // 4. Bouton de déconnexion
  document.getElementById('logoutBtn').addEventListener('click', function() {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });
});