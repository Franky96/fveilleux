import { db, doc, setDoc, onSnapshot } from "./firebase-config.js";

const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('aviation')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

const aviationDocRef = doc(db, "donnees", "aviation_global");
let aviationData = { 'aviation-autres': { notes: [] } };

document.addEventListener('DOMContentLoaded', function() {
  // NOUVEAU : Afficher le bouton UNIQUEMENT si l'utilisateur a la permission
  if (permissions.includes('aeronefs')) {
    const btnAero = document.getElementById('btn-aeronefs');
    if (btnAero) btnAero.style.display = 'flex';
  }
  
  onSnapshot(aviationDocRef, (docSnap) => {
    if (docSnap.exists()) {
      aviationData = { ...aviationData, ...docSnap.data() };
    } else {
      setDoc(aviationDocRef, aviationData);
    }
    chargerNotes('aviation-autres');
  });
  window.afficherSection('traducteur-metar', document.querySelector('.sidebar-link'));
});

// ===== NAVIGATION & AFFICHAGE =====
window.afficherSection = function(id, el) {
  document.querySelectorAll('.section-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.sidebar-sublink, .sidebar-link').forEach(l => l.classList.remove('active'));
  if (el) el.classList.add('active');
};

window.toggleEtape = function(id) {
  const list = document.getElementById('list-' + id);
  const arrow = document.getElementById('arrow-' + id);
  if (!list) return;
  list.classList.toggle('collapsed');
  arrow.textContent = list.classList.contains('collapsed') ? '▸' : '▾';
};

// ===== METAR (Géré en local car c'est un traducteur instantané) =====
window.chargerExemple = function() {
  document.getElementById('metar-input').value = 'CYUL 260342Z 03007KT 320V040 1 3/4SM -SN SCT008 BKN012 OVC018 M05/M06 A2953 RMK SN1ST2ST3SC2 SLP003';
  window.decoderMETAR();
};

window.decoderMETAR = function() {
  const raw = document.getElementById('metar-input').value.trim().toUpperCase();
  if (!raw) { alert('Veuillez entrer un METAR.'); return; }
  const tokens = raw.split(/\s+/);
  const result = {}; let index = 0; let alerteDegivrage = false;

  result.station = { label: '📍 Station', valeur: tokens[index] || '—' }; index++;
  if (tokens[index] && tokens[index].match(/^\d{6}Z$/)) {
    const jour = tokens[index].substring(0, 2); const heure = tokens[index].substring(2, 4); const minute = tokens[index].substring(4, 6);
    result.heure = { label: '🕒 Observation', valeur: `Jour ${jour} à ${heure}h${minute} UTC` }; index++;
  }
  if (tokens[index] && (tokens[index] === 'AUTO' || tokens[index] === 'COR')) {
    result.type = { label: '⚙️ Type', valeur: tokens[index] === 'AUTO' ? 'Observation automatique (AUTO)' : 'Observation corrigée (COR)' }; index++;
  }
  if (tokens[index] && tokens[index].match(/^\d{3}\d{2,3}(G\d{2,3})?KT$/)) {
    const match = tokens[index].match(/(\d{3})(\d{2,3})(G(\d{2,3}))?KT/);
    if (match) {
      const direction = match[1] === '000' && match[2] === '00' ? 'Calme' : `du ${match[1]}°`;
      const vitesse = `${parseInt(match[2])} nœuds`;
      const rafales = match[4] ? `<br><span style="color:#ff6b6b; font-weight:bold;">Rafales à ${parseInt(match[4])} nœuds</span>` : '';
      result.vent = { label: '💨 Vent', valeur: `${direction} à ${vitesse}${rafales}` };
    }
    index++;
  } else if (tokens[index] && tokens[index] === '00000KT') {
    result.vent = { label: '💨 Vent', valeur: 'Calme' }; index++;
  } else if (tokens[index] && tokens[index].match(/^VRB\d{2}KT$/)) {
    const match = tokens[index].match(/VRB(\d{2})KT/);
    result.vent = { label: '💨 Vent', valeur: `Variable à ${parseInt(match[1])} nœuds` }; index++;
  }
  if (tokens[index] && tokens[index].match(/^\d{3}V\d{3}$/)) {
    const match = tokens[index].match(/(\d{3})V(\d{3})/);
    result.ventVar = { label: '🌪️ Variation', valeur: `entre ${match[1]}° et ${match[2]}°` }; index++;
  }
  if (tokens[index] && tokens[index].match(/^\d{4}$/)) {
    const vis = parseInt(tokens[index]); result.visibilite = { label: '👁️ Visibilité', valeur: vis >= 9999 ? '10 km ou plus' : `${vis} mètres` }; index++;
  } else if (tokens[index] && tokens[index].match(/^\d+SM$/)) {
    const match = tokens[index].match(/(\d+)SM/); result.visibilite = { label: '👁️ Visibilité', valeur: `${match[1]} milles statutaires` }; index++;
  } else if (tokens[index] && tokens[index].match(/^\d+\/\d+SM$/)) {
    result.visibilite = { label: '👁️ Visibilité', valeur: `${tokens[index].replace('SM', '')} mille(s) statutaire(s)` }; index++;
  } else if (tokens[index] && tokens[index].match(/^\d+$/) && tokens[index+1] && tokens[index+1].match(/^\d+\/\d+SM$/)) {
    result.visibilite = { label: '👁️ Visibilité', valeur: `${tokens[index]} et ${tokens[index+1].replace('SM', '')} milles statutaires` }; index += 2;
  }
  const conditionsCodes = { 'RA': 'pluie', 'SN': 'neige', 'TS': 'orage', 'FG': 'brouillard', 'DZ': 'bruine', 'GR': 'grêle', 'GS': 'grésil', 'SG': 'neige en grains', 'PL': 'granules de glace', 'BR': 'brume', 'HZ': 'brume sèche', 'FU': 'fumée', 'SA': 'sable', 'DU': 'poussière', 'SQ': 'grain', 'FC': 'trombe/tornade', 'VA': 'cendres volcaniques', 'TSRA': 'orage avec pluie', 'TSSN': 'orage avec neige', 'FZRA': 'pluie verglaçante', 'FZDZ': 'bruine verglaçante', 'BLSN': 'neige soufflée', 'BLSA': 'sable soufflé'};
  const conditions = [];
  while (tokens[index] && tokens[index].match(/^(\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|GR|GS|PL|IC|FG|BR|HZ|DU|SA|VA|SQ|FC|TSRA|TSSN|FZRA|FZDZ|BLSN|BLSA)$/)) {
    const tok = tokens[index]; let desc = '';
    if (tok.startsWith('-')) desc = 'faible '; else if (tok.startsWith('+')) desc = 'forte '; else if (tok.startsWith('VC')) desc = 'dans le voisinage : ';
    const code = tok.replace(/^(\+|-|VC)/, ''); desc += conditionsCodes[code] || code;
    conditions.push(`• ${desc.charAt(0).toUpperCase() + desc.slice(1)} <em>(${tok})</em>`);
    if (tok.includes('FZ') || tok.includes('SN') || tok.includes('PL') || tok.includes('SG') || tok.includes('GR') || tok.includes('GS') || tok.includes('IC')) alerteDegivrage = true;
    index++;
  }
  if (conditions.length > 0) result.conditions = { label: '🌧️ Phénomènes', valeur: conditions.join('<br>') };
  const nuageCodes = { 'FEW': 'Peu nuageux (1-2 octas)', 'SCT': 'Épars (3-4 octas)', 'BKN': 'Fragmenté (5-7 octas)', 'OVC': 'Couvert (8 octas)', 'NSC': 'Aucun nuage significatif', 'NCD': 'Aucun nuage détecté', 'CLR': 'Ciel dégagé', 'SKC': 'Ciel dégagé', 'VV': 'Visibilité verticale' };
  const nuages = [];
  while (tokens[index] && tokens[index].match(/^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$|^(NSC|NCD|CLR|SKC|CAVOK)$/)) {
    const tok = tokens[index];
    if (['NSC', 'NCD', 'CLR', 'SKC', 'CAVOK'].includes(tok)) nuages.push(`• ${tok === 'CAVOK' ? 'CAVOK (Ciel clair, visibilité > 10km)' : nuageCodes[tok]}`);
    else {
      const match = tok.match(/(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?/);
      if (match) {
        const altitude = parseInt(match[2]) * 100;
        const type = match[3] ? ` <span style="color:#ff6b6b; font-weight:bold;">(${match[3] === 'CB' ? 'Cumulonimbus' : 'Towering Cumulus'})</span>` : '';
        nuages.push(`• ${nuageCodes[match[1]]} à ${altitude.toLocaleString()} pieds${type}`);
      }
    }
    index++;
  }
  if (nuages.length > 0) result.nuages = { label: '☁️ Nuages', valeur: nuages.join('<br>') };
  if (tokens[index] && tokens[index].match(/^(M?\d{2})\/(M?\d{2})?$/)) {
    const match = tokens[index].match(/(M?\d{2})\/(M?\d{2})?/);
    const temp = match[1].startsWith('M') ? `-${match[1].substring(1)}` : match[1];
    const rosee = (match[2] && match[2].startsWith('M')) ? `-${match[2].substring(1)}` : (match[2] || 'N/A');
    result.temperature = { label: '🌡️ Température', valeur: `Air : ${parseInt(temp)}°C <br>Point de rosée : ${rosee !== 'N/A' ? parseInt(rosee) + '°C' : 'N/A'}` }; index++;
  }
  if (tokens[index] && tokens[index].match(/^A\d{4}$/)) {
    const val = tokens[index].substring(1);
    result.altimetre = { label: '📉 Altimètre', valeur: `${val.substring(0, 2)}.${val.substring(2)} inHg <span style="color:#a89f94;">(${(parseInt(val) * 0.0338639).toFixed(1)} hPa)</span>` }; index++;
  } else if (tokens[index] && tokens[index].match(/^Q\d{4}$/)) {
    const val = parseInt(tokens[index].substring(1));
    result.altimetre = { label: '📉 QNH', valeur: `${val} hPa <span style="color:#a89f94;">(${(val * 0.02953).toFixed(2)} inHg)</span>` }; index++;
  }
  if (tokens[index] && tokens[index] === 'RMK') {
    const rmkTokens = tokens.slice(index + 1); let rmkDecoded = []; let unparsed = []; let i = 0;
    while(i < rmkTokens.length) {
      let t = rmkTokens[i]; let tNext = rmkTokens[i+1] || ""; let tNext2 = rmkTokens[i+2] || "";
      if (t === 'AO1') rmkDecoded.push(`• Station automatique sans détecteur`);
      else if (t === 'AO2') rmkDecoded.push(`• Station automatique avec détecteur`);
      else if (t.match(/^SLP(\d{3})$/)) { let val = parseInt(t.substring(3)); let hpa = val >= 500 ? (9000 + val) / 10 : (10000 + val) / 10; rmkDecoded.push(`• Pression mer : <strong>${hpa.toFixed(1)} hPa</strong>`); }
      else if (t.match(/^5(\d{1})(\d{3})$/)) { let val = parseInt(t.match(/^5(\d{1})(\d{3})$/)[2]) / 10; rmkDecoded.push(`• Tendance pression (3h) : variation <strong>${val.toFixed(1)} hPa</strong>`); }
      else if (t === 'PRESRR') rmkDecoded.push(`• Pression en hausse rapide`); else if (t === 'PRESFR') rmkDecoded.push(`• Pression en baisse rapide`);
      else if (t.match(/^T(\d{1})(\d{3})(\d{1})(\d{3})$/)) { let m = t.match(/^T(\d{1})(\d{3})(\d{1})(\d{3})$/); let temp = (m[1] === '1' ? -1 : 1) * (parseInt(m[2]) / 10); let td = (m[3] === '1' ? -1 : 1) * (parseInt(m[4]) / 10); rmkDecoded.push(`• Temp exacte : <strong>${temp.toFixed(1)}°C</strong> / Rosée : <strong>${td.toFixed(1)}°C</strong>`); }
      else if (t === 'PK' && tNext === 'WND' && tNext2) { let m = tNext2.split('/'); if (m.length === 2 && m[0].length >= 3) { rmkDecoded.push(`• Vent de pointe : <strong>du ${m[0].substring(0,3)}° à ${m[0].substring(3)} nœuds</strong>`); i += 2; } else unparsed.push(t); }
      else if (t.match(/^([A-Z]{2}\d)+$/)) {
         const nC = {'CI':'Cirrus', 'CC':'Cirrocumulus', 'CS':'Cirrostratus', 'AC':'Altocumulus', 'AS':'Altostratus', 'NS':'Nimbostratus', 'SC':'Stratocumulus', 'ST':'Stratus', 'CU':'Cumulus', 'CB':'Cumulonimbus', 'TC':'Towering Cumulus', 'SF':'Stratus fractus', 'CF':'Cumulus fractus', 'SN':'Neige (obscurcissement)', 'RA':'Pluie (obscurcissement)', 'FG':'Brouillard (obscurcissement)', 'BR':'Brume (obscurcissement)', 'HZ':'Brume sèche (obscurcissement)'};
        let m = [...t.matchAll(/([A-Z]{2})(\d)/g)]; let valid = true; let cldStr = m.map(match => { if (nC[match[1]]) return `${nC[match[1]]} (${match[2]}/8)`; valid = false; return ""; });
        if (valid && cldStr.length > 0) rmkDecoded.push(`• Opacité ciel : <strong>${cldStr.join(', ')}</strong>`); else unparsed.push(t);
      } else unparsed.push(t);
      i++;
    }
    let finalHtml = rmkDecoded.join('<br>');
    if (unparsed.length > 0) finalHtml += (finalHtml !== '' ? '<br>' : '') + `<span style="color:#888078; font-style:italic;">Brut : ${unparsed.join(' ')}</span>`;
    if (finalHtml) result.remarques = { label: '📝 Remarques (RMK)', valeur: finalHtml };
  }
  afficherResultat(raw, result, alerteDegivrage);
};

function afficherResultat(raw, result, alerteDegivrage) {
  document.getElementById('metar-raw').innerHTML = `<div style="background:#1a1a1a; padding:1.2rem; border-radius:8px; border:1px solid #d5d0c8; margin-bottom:1.5rem; font-family:monospace; color:#80cc80;">${raw}</div>`;
  document.getElementById('metar-resultat-block').style.display = 'block';
  let html = '';
  if (alerteDegivrage) html += `<div style="background: #fde8e8; border-left: 5px solid #e74c3c; padding: 1.2rem; margin-bottom: 1.5rem; border-radius: 4px;"><strong style="color: #c0392b;">⚠️ Alerte de givrage</strong><br><span style="color: #78281f; font-size: 0.95rem;">Précipitations hivernales rapportées.</span></div>`;
  html += `<table class="calendar-table" style="width: 100%;"><tbody>`;
  Object.values(result).forEach(item => { html += `<tr><td style="color:#3a7a3a; padding: 1rem 0.75rem;"><strong>${item.label}</strong></td><td style="color:#1a1a1a; font-weight:500; padding: 1rem 0.75rem;">${item.valeur}</td></tr>`; });
  html += `</tbody></table>`;
  document.getElementById('metar-grid').innerHTML = html;
}

// ===== NOTES CONNECTÉES AU CLOUD =====
function chargerNotes(sectionId) {
  const notes = aviationData[sectionId]?.notes || [];
  const container = document.getElementById('notes-container-' + sectionId);
  if (!container) return;
  container.innerHTML = '';
  if (notes.length === 0) {
    container.innerHTML = `<p class="notes-empty">Aucune note pour l'instant.</p>`;
    return;
  }
  notes.forEach((note, index) => container.appendChild(creerCarteNote(sectionId, note, index)));
}

function creerCarteNote(sectionId, note, index) {
  const div = document.createElement('div');
  div.className = 'note-card note-type-' + note.type;
  let icone = note.type === 'texte' ? '📝' : note.type === 'pdf' ? '📎' : note.type === 'lien' ? '🔗' : '🌐';
  let contenu = '';
  if (note.type === 'texte') contenu = `<p class="note-contenu">${note.contenu.replace(/\n/g, '<br>')}</p>`;
  else {
    const url = note.contenu.startsWith('http') ? note.contenu : 'https://' + note.contenu;
    contenu = `<a href="${url}" target="_blank" class="note-lien">${note.type === 'pdf' ? '📄 ' : ''}${note.nom || note.contenu}</a>`;
  }
  div.innerHTML = `
    <div class="note-card-header">
      <span class="note-icone">${icone}</span><span class="note-titre">${note.titre}</span>
      <div class="note-actions">
        <button class="btn-edit" onclick="editerNote('${sectionId}', ${index})">✏️</button>
        <button class="btn-delete" onclick="supprimerNote('${sectionId}', ${index})">🗑️</button>
      </div>
    </div>${contenu}`;
  return div;
}

window.ajouterNote = function(sectionId) { ouvrirModalNote(sectionId, null, null); };
window.editerNote = function(sectionId, index) { ouvrirModalNote(sectionId, aviationData[sectionId].notes[index], index); };
window.supprimerNote = function(sectionId, index) {
  if (!confirm('Supprimer cette note ?')) return;
  aviationData[sectionId].notes.splice(index, 1);
  setDoc(aviationDocRef, aviationData); // Envoi au cloud
};

function ouvrirModalNote(sectionId, note, index) {
  const modal = document.getElementById('modal-note');
  document.getElementById('modal-note-titre-label').textContent = note ? 'Modifier la note' : 'Nouvelle note';
  document.getElementById('modal-note-titre').value = note ? note.titre : '';
  document.getElementById('modal-note-type').value = note ? note.type : 'texte';
  document.getElementById('modal-note-contenu').value = note ? note.contenu : '';
  document.getElementById('modal-note-nom').value = note ? (note.nom || '') : '';
  window.updateModalNoteType();
  modal.classList.remove('hidden');

  document.getElementById('modal-note-save').onclick = function() {
    const titre = document.getElementById('modal-note-titre').value.trim();
    const type = document.getElementById('modal-note-type').value;
    const contenu = document.getElementById('modal-note-contenu').value.trim();
    const nom = document.getElementById('modal-note-nom').value.trim();
    if (!titre || !contenu) return;

    if (!aviationData[sectionId]) aviationData[sectionId] = { notes: [] };
    
    if (index !== null) aviationData[sectionId].notes[index] = { titre, type, contenu, nom };
    else aviationData[sectionId].notes.push({ titre, type, contenu, nom });

    setDoc(aviationDocRef, aviationData); // Envoi au cloud
    window.fermerModalNote();
  };
}

window.updateModalNoteType = function() {
  const type = document.getElementById('modal-note-type').value;
  const contenuLabel = document.getElementById('modal-note-contenu-label');
  const contenu = document.getElementById('modal-note-contenu');
  const nomGroup = document.getElementById('modal-note-nom-group');
  if (type === 'texte') {
    contenuLabel.textContent = 'Contenu'; nomGroup.classList.add('hidden');
  } else {
    contenuLabel.textContent = 'URL'; nomGroup.classList.remove('hidden');
  }
};
window.fermerModalNote = function() { document.getElementById('modal-note').classList.add('hidden'); };