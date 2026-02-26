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
          "frank": { motDePasse: "Biere42", nom: "Francis", role: "admin", permissions: ["ena", "aviation", "bieres", "scifi", "hockey", "admin", "aeronefs"] },
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

  // 2. On attache l'action au bouton IMMÉDIATEMENT
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
          
          window.location.href = 'dashboard.html';
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