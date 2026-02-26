// Sécurité : Vérifie si l'utilisateur est connecté
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('scifi')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

// Fonction pour gérer l'affichage des onglets Sci-Fi
function afficherSection(id, el) {
  // 1. Cacher toutes les sections
  const sections = document.querySelectorAll('.section-view');
  sections.forEach(sec => sec.classList.add('hidden'));

  // 2. Afficher la section demandée
  const cible = document.getElementById(id);
  if (cible) {
    cible.classList.remove('hidden');
  }

  // 3. Mettre à jour l'apparence des liens dans la sidebar
  const liens = document.querySelectorAll('.sidebar-sublink');
  liens.forEach(lien => lien.classList.remove('active'));
  
  if (el) {
    el.classList.add('active');
  }
}