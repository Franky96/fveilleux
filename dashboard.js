// 1. Sécurité de base : on vérifie UNIQUEMENT si l'utilisateur est connecté
if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  // 2. Affichage du message de bienvenue et du badge Admin
  const nomUser = sessionStorage.getItem('userName') || 'Invité';
  const role = sessionStorage.getItem('userRole');
  const subtitleEl = document.querySelector('.subtitle');
  
 if (role === 'admin') {
    subtitleEl.innerHTML = `Bienvenue, ${nomUser} 👋 <a href="admin.html" style="text-decoration:none;" title="Accéder à l'administration"><span style="background:#c0392b; color:white; font-size:0.7rem; padding:0.2rem 0.6rem; border-radius:12px; margin-left:8px; vertical-align:middle; font-weight:bold; letter-spacing:0.05em; cursor:pointer; box-shadow:0 2px 5px rgba(192,57,43,0.4);">ADMIN</span></a>`;
  } else {
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

  // 4. NOUVEAU : Gérer l'affichage du bouton Webmail
  const btnWebmail = document.getElementById('btn-webmail');
  if (btnWebmail) {
    if (permissions.includes('webmail')) {
      btnWebmail.style.display = 'flex'; // On l'affiche si autorisé
    } else {
      btnWebmail.style.display = 'none'; // On le garde caché sinon
    }
  }

  // Rendre le menu visible maintenant que les permissions sont appliquées
  const grid = document.getElementById('menu-grid');
  if(grid) grid.style.visibility = 'visible';
  
  // Fonction de déconnexion
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) {
      logoutBtn.addEventListener('click', () => {
          sessionStorage.clear();
          window.location.href = 'index.html';
      });
  }
});