import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('rona')) {
  alert("Accès refusé.");
  window.location.href = 'dashboard.html';
}

const ronaDocRef = doc(db, "donnees", "rona_global");
let ronaData = { trousses: [] };

// ── Helpers ──────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sauvegarder() {
  setDoc(ronaDocRef, ronaData);
}

// ── Init ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  onSnapshot(ronaDocRef, (snap) => {
    if (snap.exists()) {
      ronaData = snap.data();
      if (!ronaData.trousses) ronaData.trousses = [];
    } else {
      setDoc(ronaDocRef, ronaData);
    }
    render();
  }, (err) => {
    console.error('Firebase RONA error:', err);
    afficherErreurFirebase(err.code);
  });
});

// ── Rendu ─────────────────────────────────────────────

function render() {
  const container = document.getElementById('trousses-container');
  const trousses = ronaData.trousses;

  // Stat globale dans la topbar
  const totalManquants = trousses.reduce((n, t) =>
    n + (t.items || []).filter(i => !i.complet).length, 0);
  document.getElementById('topbar-stat').textContent =
    totalManquants > 0 ? `${totalManquants} manquant${totalManquants > 1 ? 's' : ''}` : '';

  if (trousses.length === 0) {
    container.innerHTML = `
      <div class="rona-empty">
        <span>👷‍♂️</span>
        Aucune trousse — appuie sur <strong>+</strong> pour en ajouter une.
      </div>`;
    return;
  }

  // Mémoriser quelles trousses sont ouvertes
  const ouvertes = new Set(
    [...container.querySelectorAll('.trousse-card.open')].map(el => el.dataset.id)
  );

  container.innerHTML = '';

  trousses.forEach((trousse, tIdx) => {
    const items = trousse.items || [];
    const nbManquants = items.filter(i => !i.complet).length;
    const isOpen = ouvertes.has(trousse.id);

    const card = document.createElement('div');
    card.className = 'trousse-card' + (isOpen ? ' open' : '');
    card.dataset.id = trousse.id;

    card.innerHTML = `
      <div class="trousse-header" onclick="toggleTrousse(this)">
        <span class="trousse-icon">👷‍♂️</span>
        <div class="trousse-info">
          <div class="trousse-nom">${trousse.nom}</div>
          ${trousse.lieu ? `<div class="trousse-lieu">📍 ${trousse.lieu}</div>` : ''}
        </div>
        <span class="trousse-badge ${nbManquants === 0 ? 'ok' : ''}">${nbManquants === 0 ? '✓' : nbManquants}</span>
        <span class="trousse-arrow">▶</span>
      </div>
      <div class="trousse-items">
        ${items.length === 0
          ? `<div style="padding:0.75rem 1rem; color:#555; font-size:0.9rem;">Aucun item manquant — ajoute-en un ci-dessous.</div>`
          : items.map((item, iIdx) => `
            <div class="item-row">
              <div class="item-check ${item.complet ? 'checked' : ''}"
                   onclick="toggleItem(${tIdx}, ${iIdx})">
                ${item.complet ? '✓' : ''}
              </div>
              <span class="item-nom ${item.complet ? 'checked' : ''}">${item.nom}</span>
              ${item.qte ? `<span class="item-qte ${item.complet ? 'ok' : ''}">×${item.qte}</span>` : ''}
              <span class="item-del" onclick="supprimerItem(${tIdx}, ${iIdx})">✕</span>
            </div>`).join('')
        }
        <div class="add-item-row">
          <input type="text" id="new-item-nom-${tIdx}" placeholder="Article manquant…"
                 onkeydown="if(event.key==='Enter') ajouterItem(${tIdx})">
          <input type="text" class="qte-input" id="new-item-qte-${tIdx}" placeholder="Qté"
                 onkeydown="if(event.key==='Enter') ajouterItem(${tIdx})">
          <button onclick="ajouterItem(${tIdx})">+</button>
        </div>
        <div class="trousse-actions">
          <button class="btn-del-trousse" onclick="supprimerTrousse(${tIdx})">🗑 Supprimer la trousse</button>
        </div>
      </div>`;

    container.appendChild(card);
  });
}

// ── Actions ───────────────────────────────────────────

window.toggleTrousse = function(header) {
  header.closest('.trousse-card').classList.toggle('open');
};

window.toggleItem = function(tIdx, iIdx) {
  const item = ronaData.trousses[tIdx].items[iIdx];
  item.complet = !item.complet;
  sauvegarder();
  render();
};

window.ajouterItem = function(tIdx) {
  const nomEl = document.getElementById(`new-item-nom-${tIdx}`);
  const qteEl = document.getElementById(`new-item-qte-${tIdx}`);
  const nom = nomEl.value.trim();
  if (!nom) return;
  if (!ronaData.trousses[tIdx].items) ronaData.trousses[tIdx].items = [];
  ronaData.trousses[tIdx].items.push({ id: uid(), nom, qte: qteEl.value.trim(), complet: false });
  sauvegarder();
  render();
  // Rouvrir la carte après render
  const cards = document.querySelectorAll('.trousse-card');
  if (cards[tIdx]) cards[tIdx].classList.add('open');
};

window.supprimerItem = function(tIdx, iIdx) {
  ronaData.trousses[tIdx].items.splice(iIdx, 1);
  sauvegarder();
  render();
  const cards = document.querySelectorAll('.trousse-card');
  if (cards[tIdx]) cards[tIdx].classList.add('open');
};

window.supprimerTrousse = function(tIdx) {
  const nom = ronaData.trousses[tIdx].nom;
  if (!confirm(`Supprimer la trousse "${nom}" ?`)) return;
  ronaData.trousses.splice(tIdx, 1);
  sauvegarder();
};

// ── Modal trousse ─────────────────────────────────────

window.ouvrirModalTrousse = function() {
  document.getElementById('trousse-nom').value = '';
  document.getElementById('trousse-lieu').value = '';
  document.getElementById('modal-trousse').classList.remove('hidden');
  setTimeout(() => document.getElementById('trousse-nom').focus(), 50);
  document.getElementById('trousse-save-btn').onclick = sauvegarderTrousse;
};

window.fermerModalTrousse = function() {
  document.getElementById('modal-trousse').classList.add('hidden');
};

function sauvegarderTrousse() {
  const nom = document.getElementById('trousse-nom').value.trim();
  const lieu = document.getElementById('trousse-lieu').value.trim();
  if (!nom) return;
  ronaData.trousses.push({ id: uid(), nom, lieu, items: [] });
  sauvegarder();
  fermerModalTrousse();
}

// ── Erreur Firebase ───────────────────────────────────

function afficherErreurFirebase(code) {
  if (document.getElementById('firebase-err-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'firebase-err-banner';
  banner.style.cssText = 'background:#c0392b;color:#fff;padding:0.8rem 1rem;text-align:center;font-weight:bold;font-size:0.9rem;position:sticky;top:0;z-index:9999;';
  banner.textContent = `⚠️ Erreur Firebase (${code}) — Mets à jour les règles dans la console Firebase.`;
  document.body.prepend(banner);
}
