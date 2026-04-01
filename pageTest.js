const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('pageTest')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
  throw new Error('Accès refusé');

} else {
  document.body.style.display = '';
}

const prenom = "Francis";
let age = 29;

const message = `Je m'appelle ${prenom} et j'ai ${age} ans`;
console.log(message);

age += 1;
console.log(`Après ma fête, j'ai ${age} ans`);