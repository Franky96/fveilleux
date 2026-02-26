const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('aeronefs')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}
function afficherSection(id, el) {
  document.querySelectorAll('.section-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.sidebar-sublink').forEach(l => l.classList.remove('active'));
  if (el) el.classList.add('active');
}

function toggleEtape(id) {
  const list = document.getElementById('list-' + id);
  const arrow = document.getElementById('arrow-' + id);
  list.classList.toggle('collapsed');
  arrow.textContent = list.classList.contains('collapsed') ? '▸' : '▾';
}
