if (!sessionStorage.getItem('loggedIn')) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
  const role = sessionStorage.getItem('userRole');

  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    const section = card.getAttribute('data-section');
    if (role !== 'admin' && !permissions.includes(section)) {
      card.style.display = 'none';
    }
  });

  // Show empty-state message if no cards are visible
  const visibleCards = [...cards].filter(c => c.style.display !== 'none');
  if (visibleCards.length === 0) {
    const emptyMsg = document.getElementById('archive-empty');
    if (emptyMsg) emptyMsg.style.display = 'block';
  }

  const grid = document.getElementById('menu-grid');
  if (grid) grid.style.visibility = 'visible';
});
