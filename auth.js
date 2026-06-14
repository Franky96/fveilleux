import { db, doc, getDoc, setDoc } from "./firebase-config.js";

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMsg = document.getElementById('error-msg');
  const usersRef = doc(db, "systeme", "utilisateurs");

  // 1. Initialisation en arrière-plan (ne bloque pas le bouton)
  async function initDB() {
    try {
      let docSnap = await getDoc(usersRef);
      if (!docSnap.exists()) {
        const defaultUsers = {
          "frank": { motDePasse: "Biere42", nom: "Francis", role: "admin", permissions: ["ena", "aviation", "bieres", "scifi", "hockey", "admin", "aeronefs", "films", "liens", "rona"] },
          "visiteur": { motDePasse: "invite", nom: "Ami(e)", role: "user", permissions: ["bieres", "hockey"] },
          "ecole": { motDePasse: "prof123", nom: "Professeur", role: "user", permissions: ["ena", "aviation"] }
        };
        await setDoc(usersRef, defaultUsers);
      }
    } catch (error) {
      console.error("Erreur d'initialisation Firebase:", error);
    }
  }
  
  initDB(); // Lancement silencieux au démarrage

  // 2. Bouton invité
  const guestBtn = document.getElementById('guest-btn');
  if (guestBtn) {
    guestBtn.addEventListener('mouseenter', () => {
      guestBtn.style.borderColor = '#80cc80'; guestBtn.style.color = '#80cc80';
    });
    guestBtn.addEventListener('mouseleave', () => {
      guestBtn.style.borderColor = '#2a3a2a'; guestBtn.style.color = '#556655';
    });
    guestBtn.addEventListener('click', async () => {
      guestBtn.textContent = '⏳ Chargement...';
      guestBtn.disabled = true;
      try {
        const configSnap = await getDoc(doc(db, "systeme", "config"));
        const guestPerms = configSnap.exists() ? (configSnap.data().guestPermissions || []) : [];
        sessionStorage.setItem('loggedIn', 'true');
        sessionStorage.setItem('userId', 'guest');
        sessionStorage.setItem('userName', 'Invité');
        sessionStorage.setItem('userRole', 'guest');
        sessionStorage.setItem('userPermissions', JSON.stringify(guestPerms));
        window.location.href = 'dashboard.html';
      } catch (err) {
        console.error(err);
        sessionStorage.setItem('loggedIn', 'true');
        sessionStorage.setItem('userId', 'guest');
        sessionStorage.setItem('userName', 'Invité');
        sessionStorage.setItem('userRole', 'guest');
        sessionStorage.setItem('userPermissions', '[]');
        window.location.href = 'dashboard.html';
      }
    });
  }

  // 3. On attache l'action au bouton IMMÉDIATEMENT
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault(); // 🛑 BLOQUE LE RECHARGEMENT DE LA PAGE IMMÉDIATEMENT !
      
      errorMsg.textContent = "Connexion au serveur...";
      errorMsg.style.color = "#a89f94";

      try {
        // On télécharge la liste des utilisateurs à jour lors du clic
        const snap = await getDoc(usersRef);
        
        if (!snap.exists()) {
          errorMsg.textContent = "La base de données s'initialise, réessaie dans 2 secondes.";
          errorMsg.style.color = "#ff6b6b";
          return;
        }

        const utilisateurs = snap.data();
        const user = document.getElementById('username').value.toLowerCase().trim();
        const pass = document.getElementById('password').value;

        // Vérification
        if (utilisateurs[user] && utilisateurs[user].motDePasse === pass) {
          sessionStorage.setItem('loggedIn', 'true');
          sessionStorage.setItem('userId', user);
          sessionStorage.setItem('userName', utilisateurs[user].nom);
          sessionStorage.setItem('userRole', utilisateurs[user].role);
          sessionStorage.setItem('userPermissions', JSON.stringify(utilisateurs[user].permissions));
          const pageAccueil = utilisateurs[user].pageAccueil || 'dashboard.html';
          sessionStorage.setItem('pageAccueil', pageAccueil);

          window.location.href = pageAccueil;
        } else {
          errorMsg.textContent = "Nom d'utilisateur ou mot de passe incorrect.";
          errorMsg.style.color = "#ff6b6b";
        }
      } catch (err) {
        console.error("Erreur de connexion:", err);
        errorMsg.textContent = "Erreur de connexion à Firebase. (Vérifie la console F12)";
        errorMsg.style.color = "#ff6b6b";
      }
    });
  }
});