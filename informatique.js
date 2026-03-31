if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const role = sessionStorage.getItem('userRole');

  // Hide cards the user doesn't have access to
  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    if (role !== 'admin' && !permissions.includes(section)) {
      card.style.display = 'none';
    }
  });

  // Reveal grid now that permissions are applied
  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';
});
