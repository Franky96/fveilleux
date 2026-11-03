document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMsg  = document.getElementById('error-msg');
  const guestBtn  = document.getElementById('guest-btn');

  /* ── Bouton invité ── */
  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      guestBtn.textContent = '⏳ Chargement…';
      guestBtn.disabled = true;
      try {
        const data = await phpPost({ action: 'guest' });
        setSession('guest', 'Invité', data.role, data.permissions, 'dashboard.html');
        window.location.href = 'dashboard.html';
      } catch (e) {
        guestBtn.textContent = '👤 Continuer en tant qu\'invité';
        guestBtn.disabled = false;
        if (errorMsg) { errorMsg.textContent = e.message || 'Erreur serveur'; errorMsg.style.color = '#ff6b6b'; }
      }
    });
  }

  /* ── Formulaire de connexion ── */
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.textContent = 'Connexion…';
      errorMsg.style.color = 'var(--gris, #a89f94)';

      const userId   = document.getElementById('username').value.toLowerCase().trim();
      const password = document.getElementById('password').value;

      try {
        const data = await phpPost({ action: 'login', userId, password });
        setSession(userId, data.nom, data.role, data.permissions, data.pageAccueil);
        window.location.href = data.pageAccueil;
      } catch (e) {
        errorMsg.textContent = e.message || 'Identifiant ou mot de passe incorrect.';
        errorMsg.style.color = '#ff6b6b';
      }
    });
  }
});

function setSession(userId, nom, role, permissions, pageAccueil) {
  sessionStorage.setItem('loggedIn',         'true');
  sessionStorage.setItem('userId',           userId);
  sessionStorage.setItem('userName',         nom);
  sessionStorage.setItem('userRole',         role);
  sessionStorage.setItem('userPermissions',  JSON.stringify(permissions));
  sessionStorage.setItem('pageAccueil',      pageAccueil);
}

// Serveur occupé (503 de l'hébergeur, page HTML au lieu de JSON) : on réessaie quelques fois avant d'abandonner,
// avec un message clair plutôt que « JSON.parse: unexpected character ».
async function phpPost(body) {
  const OCCUPE = 'Le serveur est occupé pour le moment. Réessaie dans quelques secondes.';
  let cause = '';
  for (let essai = 0; ; essai++) {
    let res = null, texte = '';
    try {
      res = await fetch('/api/login.php?t=' + Date.now(), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      texte = await res.text();
    } catch (e) { cause = 'réseau : ' + (e && e.message || e); }
    let json = null;
    try { json = texte ? JSON.parse(texte) : null; } catch (e) { /* page HTML (503 de l'hébergeur…) */ }
    if (json) {
      if (!res.ok || json.error) throw new Error(json.error ?? 'Erreur serveur');
      return json;
    }
    // ce qui a empêché la connexion, affiché tel quel pour comprendre un appareil qui bloque (iPhone, 3 novembre 2026)
    if (res) cause = `code ${res.status}${res.redirected ? ', redirigé vers ' + res.url : ''} : ${texte.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`;
    if (essai >= 14) throw new Error(`${OCCUPE} (${cause})`);
    const m = document.getElementById('error-msg');
    if (m) { m.textContent = `Serveur occupé, nouvel essai (${essai + 2}/15)… (${cause})`; m.style.color = 'var(--gris, #a89f94)'; }
    await new Promise(r => setTimeout(r, 250 + Math.random() * 250 + Math.min(100 * essai, 700)));   // courtes pauses : le 503 tombe au hasard
  }
}
