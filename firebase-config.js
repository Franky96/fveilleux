// Importation des outils Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Ta clé d'accès (générée par Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyDSaYgjA5Uv_9RsoCt7sRTqo4ALT2dLDPc",
  authDomain: "outils-de-frank.firebaseapp.com",
  projectId: "outils-de-frank",
  storageBucket: "outils-de-frank.firebasestorage.app",
  messagingSenderId: "675563680392",
  appId: "1:675563680392:web:673ffb948b184b8f45e53d"
};

// Allumage du moteur
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// On rend ces outils disponibles pour tes autres fichiers
export { db, doc, setDoc, getDoc, onSnapshot };