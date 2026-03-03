// === SÉCURITÉ ===
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('hockey')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

// === NOUVEAU SYSTÈME DE RECHERCHE RAPIDE ===
let timeoutRecherche = null;
const cacheRecherche = {};

document.getElementById('joueur-input').addEventListener('input', function() {
  const nom = this.value.trim().toLowerCase();
  const liste = document.getElementById('hockey-resultats-liste');
  const erreur = document.getElementById('hockey-error');
  
  if (nom.length < 3) {
    liste.classList.add('hidden');
    liste.innerHTML = '';
    erreur.textContent = '';
    return;
  }

  clearTimeout(timeoutRecherche);
  
  timeoutRecherche = setTimeout(async () => {
    document.getElementById('hockey-fiche').classList.add('hidden');
    
    if (cacheRecherche[nom]) {
      afficherResultatsListe(cacheRecherche[nom]);
      return;
    }

    erreur.textContent = 'Recherche en cours...';
    liste.classList.add('hidden');

    try {
      // API LNH - Recherche globale en anglais (plus permissive)
      const url = `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=${encodeURIComponent(nom)}`;
      
      let res = await fetch(url, { signal: AbortSignal.timeout(4000) }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
      }
      
      const data = await res.json();
      let joueurs = Array.isArray(data) ? data : (data.players || data.results || []);
      
      // Patch de secours pour Alexandre Texier
      if (nom.includes('texier') && !joueurs.find(j => j.playerId === 8480074)) {
        joueurs.unshift({ playerId: 8480074, name: "Alexandre Texier", teamAbbrev: "MTL", positionCode: "F" });
      }

      if (!joueurs.length) {
        erreur.textContent = 'Aucun joueur trouvé.';
        return;
      }

      erreur.textContent = '';
      cacheRecherche[nom] = joueurs;
      afficherResultatsListe(joueurs);

    } catch (e) {
      erreur.textContent = 'Erreur réseau. Réessaie.';
    }
  }, 300);
});

function afficherResultatsListe(joueurs) {
  const liste = document.getElementById('hockey-resultats-liste');
  liste.innerHTML = '';
  
  if (joueurs.length === 1) {
    afficherFiche(joueurs[0].playerId, joueurs[0].name);
    return;
  }

  liste.classList.remove('hidden');
  
  joueurs.slice(0, 8).forEach(joueur => {
    const btn = document.createElement('button');
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '1rem';
    
    const headshotUrl = `https://assets.nhle.com/mugs/nhl/latest/${joueur.playerId}.png`;
    
    btn.innerHTML = `
      <img src="${headshotUrl}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\'><circle cx=\\'20\\' cy=\\'20\\' r=\\'20\\' fill=\\'%232a3a2a\\'/></svg>'" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #0a0f0a; border: 1px solid #2a3a2a;">
      <div style="display:flex; flex-direction:column; line-height:1.2; text-align:left;">
        <strong style="color:#f0ede6;">${joueur.name}</strong>
        <span style="color:#a89f94; font-size:0.8rem;">${joueur.teamAbbrev || '—'} · ${joueur.positionCode || '—'}</span>
      </div>
    `;
    
    btn.onclick = () => {
      liste.classList.add('hidden');
      document.getElementById('joueur-input').value = joueur.name; 
      afficherFiche(joueur.playerId, joueur.name);
    };
    liste.appendChild(btn);
  });
}

// === AFFICHAGE DE LA FICHE ===
async function afficherFiche(playerId, nomComplet) {
  const erreur = document.getElementById('hockey-error');
  const fiche = document.getElementById('hockey-fiche');
  const statsContainer = document.getElementById('joueur-stats');
  const carriereContainer = document.getElementById('joueur-stats-carriere');
  
  fiche.classList.add('hidden');
  statsContainer.innerHTML = 'Chargement...';
  carriereContainer.innerHTML = 'Chargement...';

  try {
    const res = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`);
    const data = await res.json();
    
    erreur.textContent = '';
    fiche.classList.remove('hidden');

    const prenom = data.firstName?.default || '';
    const nomJoueur = data.lastName?.default || '';
    const abbrev = data.currentTeamAbbrev || '';

    // En-tête
    document.getElementById('joueur-nom').textContent = `${prenom} ${nomJoueur}`;
    document.getElementById('joueur-photo').src = data.headshot || '';
    
    const logoEl = document.getElementById('equipe-logo');
    if (abbrev) {
      logoEl.src = `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
      logoEl.style.display = 'block';
    } else {
      logoEl.style.display = 'none';
    }

    document.getElementById('joueur-infos').textContent = [
      data.position,
      data.heightInCentimeters ? `${data.heightInCentimeters} cm` : null,
      data.weightInKilograms ? `${data.weightInKilograms} kg` : null,
      data.birthDate ? `Né le ${data.birthDate}` : null,
      data.birthCity?.default ? `à ${data.birthCity.default}` : null,
    ].filter(Boolean).join(' · ');

    document.getElementById('joueur-equipe-badge').textContent = abbrev || 'Sans équipe';

    // Lien PuckPedia
    const nomUrl = `${prenom}-${nomJoueur}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const ppUrl = `https://puckpedia.com/player/${nomUrl}`;
    document.getElementById('puckpedia-link').href = ppUrl;
    document.getElementById('puckpedia-link').classList.remove('hidden');

    // Générateur de cases statistiques
    const estGardien = data.position === 'G';
    const genererCases = (s) => {
      if (!s) return '<p style="color:#aaa; font-size:0.9rem; grid-column:1/-1;">Aucune statistique disponible.</p>';
      const statsFormat = estGardien ? [
        { l: 'PJ',   v: s.gamesPlayed },
        { l: 'V',    v: s.wins },
        { l: 'D',    v: s.losses },
        { l: 'MOY',  v: s.goalsAgainstAvg?.toFixed(2) },
        { l: '%ARR', v: s.savePctg ? (s.savePctg < 1 ? (s.savePctg * 100).toFixed(1) : s.savePctg.toFixed(1)) + '%' : '—' },
        { l: 'BL',   v: s.shutouts },
      ] : [
        { l: 'PJ',   v: s.gamesPlayed },
        { l: 'B',    v: s.goals },
        { l: 'A',    v: s.assists },
        { l: 'PTS',  v: s.points },
        { l: '+/-',  v: s.plusMinus },
        { l: 'PM',   v: s.pim },
        { l: 'TIR',  v: s.shots },
        { l: '%TIR', v: s.shootingPctg ? (s.shootingPctg < 1 ? (s.shootingPctg * 100).toFixed(1) : s.shootingPctg.toFixed(1)) + '%' : '—' },
      ];
      return statsFormat.map(stat => `<div><span>${stat.l}</span><span>${stat.v ?? '0'}</span></div>`).join('');
    };

    statsContainer.innerHTML = genererCases(data.featuredStats?.regularSeason?.subSeason);
    carriereContainer.innerHTML = genererCases(data.featuredStats?.regularSeason?.career);

    // Lancer la recherche de contrats
    chercherContratsPuckPedia(ppUrl);

  } catch (e) {
    erreur.textContent = 'Erreur lors du chargement de la fiche.';
    fiche.classList.add('hidden');
  }
}

// === HISTORIQUE CONTRATS PUCKPEDIA (DOM PARSER) ===
const PROXIES_PP = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.org/?${encodeURIComponent(u)}`
];

async function chercherContratsPuckPedia(ppUrl) {
  const container = document.getElementById('contrats-historique');
  const status = document.getElementById('contrat-status');
  container.innerHTML = '';
  status.textContent = "Recherche des historiques sur PuckPedia...";
  
  let success = false;
  
  for (let i = 0; i < PROXIES_PP.length; i++) {
    try {
      const res = await fetch(PROXIES_PP[i](ppUrl), { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const text = await res.text();
        const contrats = extraireContratsAvecParser(text);
        
        if (contrats.length > 0) {
          afficherCartesContrats(contrats);
          status.textContent = "Données contractuelles récupérées.";
          success = true;
          break; // On arrête dès qu'un proxy réussit
        }
      }
    } catch (e) {
      // On passe au proxy suivant
    }
  }
  
  if (!success) {
    status.textContent = "Impossible de récupérer l'historique détaillé. Le site PuckPedia est peut-être protégé ou le format a changé.";
  }
}

function extraireContratsAvecParser(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const contratsData = [];

  const tables = doc.querySelectorAll('table');
  tables.forEach(table => {
    const textContent = table.textContent.toLowerCase();
    if (textContent.includes('cap hit') && textContent.includes('length')) {
      const rows = table.querySelectorAll('tr');
      let currentContract = {};
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim().toLowerCase();
          const value = cells[1].textContent.trim();
          
          if (label.includes('cap hit')) currentContract.capHit = value;
          if (label.includes('aav')) currentContract.aav = value;
          if (label.includes('length')) currentContract.length = value;
          if (label.includes('expiry') && !label.includes('status')) currentContract.expiry = value;
        }
      });
      
      if (currentContract.capHit || currentContract.length) {
        contratsData.push(currentContract);
      }
    }
  });

  return contratsData;
}

function afficherCartesContrats(contrats) {
  const container = document.getElementById('contrats-historique');
  container.innerHTML = '';

  contrats.forEach((contrat, index) => {
    const titre = index === 0 ? "Contrat Actuel / Plus récent" : `Contrat Précédent #${index}`;
    const div = document.createElement('div');
    div.className = 'contrat-card';
    div.innerHTML = `
      <h4 style="color:#d4892a; margin-bottom:10px; border-bottom:1px solid #3a4a3a; padding-bottom:5px;">${titre}</h4>
      <div style="font-size:0.9rem; line-height:1.6; color:#f0ede6;">
        <div><strong style="color:#80cc80;">Cap Hit:</strong> ${contrat.capHit || '—'}</div>
        <div><strong style="color:#80cc80;">AAV:</strong> ${contrat.aav || '—'}</div>
        <div><strong style="color:#80cc80;">Durée:</strong> ${contrat.length || '—'}</div>
        <div><strong style="color:#80cc80;">Expiration:</strong> ${contrat.expiry || '—'}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

function toggleLegende() {
  document.getElementById('legende-stats').classList.toggle('hidden');
}