// === SÉCURITÉ ===
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('hockey')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

// === RECHERCHE RAPIDE EN DIRECT ===
let timeoutRecherche = null;
const cacheRecherche = {};

const inputJoueur = document.getElementById('joueur-input');
if (inputJoueur) {
  inputJoueur.addEventListener('input', function() {
    const nom = this.value.trim().toLowerCase();
    const liste = document.getElementById('hockey-resultats-liste');
    const erreur = document.getElementById('hockey-error');
    const spinner = document.getElementById('loading-spinner');
    const spinnerMsg = document.getElementById('spinner-message');
    
    if (nom.length < 3) {
      liste.classList.add('hidden');
      liste.innerHTML = '';
      if(erreur) erreur.textContent = '';
      if(spinner) spinner.classList.add('hidden');
      return;
    }

    clearTimeout(timeoutRecherche);
    
    timeoutRecherche = setTimeout(async () => {
      document.getElementById('hockey-fiche').classList.add('hidden');
      liste.classList.add('hidden');
      
      if (cacheRecherche[nom]) {
        afficherResultatsListe(cacheRecherche[nom]);
        return;
      }

      if(erreur) erreur.textContent = '';
      // On affiche le spinner d'animation !
      if(spinner) {
          spinnerMsg.textContent = "Recherche des joueurs dans la base de données...";
          spinner.classList.remove('hidden');
      }

      try {
        const url = `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=${encodeURIComponent(nom)}`;
        
        let data = null;
        const proxies = [
          () => fetch(url),
          () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`),
          () => fetch(`https://api.cors.lol/?url=${encodeURIComponent(url)}`),
          () => fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`)
        ];

        for (const req of proxies) {
            try {
                let res = await req();
                if (res.ok) {
                    let json = await res.json();
                    if (json && json.contents) json = JSON.parse(json.contents);
                    if (json && (json.players || Array.isArray(json))) {
                        data = json;
                        break;
                    }
                }
            } catch(e) {}
        }

        // On cache le spinner une fois la recherche terminée
        if(spinner) spinner.classList.add('hidden');

        if (!data) throw new Error('API introuvable');

        let joueurs = Array.isArray(data) ? data : (data.players || data.results || []);
        
        if (nom.includes('texier') && !joueurs.find(j => j.playerId === 8480074)) {
          joueurs.unshift({ playerId: 8480074, name: "Alexandre Texier", teamAbbrev: "MTL", positionCode: "F" });
        }

        if (!joueurs.length) {
          if(erreur) erreur.textContent = 'Aucun joueur trouvé.';
          return;
        }

        cacheRecherche[nom] = joueurs;
        afficherResultatsListe(joueurs);

      } catch (e) {
        if(spinner) spinner.classList.add('hidden');
        if(erreur) erreur.textContent = 'Erreur réseau ou proxy bloqué.';
      }
    }, 400); // J'ai augmenté légèrement le délai à 400ms pour éviter les flashs d'animation
  });
}

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
      const input = document.getElementById('joueur-input');
      if(input) input.value = joueur.name; 
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
  const spinner = document.getElementById('loading-spinner');
  const spinnerMsg = document.getElementById('spinner-message');
  
  fiche.classList.add('hidden');
  if(erreur) erreur.textContent = '';
  
  // On affiche le spinner pour le chargement de la fiche !
  if(spinner) {
      spinnerMsg.textContent = "Chargement des statistiques de " + nomComplet + "...";
      spinner.classList.remove('hidden');
  }

  try {
    const url = `https://api-web.nhle.com/v1/player/${playerId}/landing`;
    let data = null;
    const proxies = [
      () => fetch(url),
      () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`),
      () => fetch(`https://api.cors.lol/?url=${encodeURIComponent(url)}`),
      () => fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`)
    ];

    for (const req of proxies) {
      try {
        let res = await req();
        if (res.ok) {
          let text = await res.text();
          let json = JSON.parse(text);
          if (json && json.contents) json = JSON.parse(json.contents);
          if (json && (json.firstName || json.lastName)) {
            data = json;
            break; 
          }
        }
      } catch(e) { } 
    }

    // Le chargement est fini, on cache le spinner
    if(spinner) spinner.classList.add('hidden');

    if (!data) throw new Error("Statistiques inaccessibles.");
    
    fiche.classList.remove('hidden');

    const prenom = data.firstName?.default || '';
    const nomJoueur = data.lastName?.default || '';
    const abbrev = data.currentTeamAbbrev || '';

    const elNom = document.getElementById('joueur-nom');
    if(elNom) elNom.textContent = `${prenom} ${nomJoueur}`.trim() || nomComplet;
    
    const photo = document.getElementById('joueur-photo');
    if (photo) {
        photo.src = data.headshot || `https://assets.nhle.com/mugs/nhl/latest/${playerId}.png`;
        photo.style.display = 'block';
    }
    
    const logoEl = document.getElementById('equipe-logo');
    if (logoEl) {
      if (abbrev) {
        logoEl.src = `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
        logoEl.style.display = 'block';
      } else {
        logoEl.style.display = 'none';
      }
    }

    const infosT = [
      data.position,
      data.heightInCentimeters ? `${data.heightInCentimeters} cm` : null,
      data.weightInKilograms ? `${data.weightInKilograms} kg` : null,
      data.birthDate ? `Né le ${data.birthDate}` : null,
      data.birthCity?.default ? `à ${data.birthCity.default}` : null,
    ].filter(Boolean).join(' · ');

    const infosMeta = document.getElementById('joueur-infos') || document.getElementById('joueur-meta');
    if (infosMeta) infosMeta.textContent = infosT;

    const badge = document.getElementById('joueur-equipe-badge');
    if(badge) badge.textContent = abbrev || 'Sans équipe';

    const nomUrl = `${prenom}-${nomJoueur}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const ppUrl = `https://puckpedia.com/player/${nomUrl}`;
    const cwUrl = `https://capwages.com/players/${nomUrl}`;
    
    const pLink = document.getElementById('puckpedia-link');
    if (pLink) {
        pLink.href = ppUrl;
        pLink.classList.remove('hidden');
    }

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
      
      return statsFormat.map(stat => `
        <div style="display:flex; flex-direction:column; align-items:center; background:#0a0f0a; border:1px solid #2a3a2a; border-radius:8px; padding:0.8rem;">
          <span style="color:#a89f94; font-size:0.75rem; text-transform:uppercase; font-weight:bold; margin-bottom:0.2rem;">${stat.l}</span>
          <span style="color:#f0ede6; font-size:1.2rem; font-weight:bold;">${stat.v ?? '0'}</span>
        </div>`).join('');
    };

    if (statsContainer) {
        statsContainer.style.display = 'grid';
        statsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(70px, 1fr))';
        statsContainer.style.gap = '10px';
        statsContainer.innerHTML = genererCases(data.featuredStats?.regularSeason?.subSeason);
    }
    
    if (carriereContainer) {
        carriereContainer.style.display = 'grid';
        carriereContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(70px, 1fr))';
        carriereContainer.style.gap = '10px';
        carriereContainer.innerHTML = genererCases(data.featuredStats?.regularSeason?.career);
    }

    chercherContrats(ppUrl, cwUrl);

  } catch (e) {
    if(spinner) spinner.classList.add('hidden');
    if(erreur) erreur.textContent = "Erreur lors du chargement de la fiche.";
    fiche.classList.add('hidden');
  }
}

// === EXTRACTEUR DE CONTRATS MULTI-SOURCES (CAPWAGES + PUCKPEDIA) ===
const PROXIES_CONTRATS = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.org/?${encodeURIComponent(u)}`
];

async function chercherContrats(ppUrl, cwUrl) {
  const container = document.getElementById('contrats-historique') || document.getElementById('joueur-contrat');
  const status = document.getElementById('contrat-status');
  if (!container) return;
  
  container.innerHTML = '';
  if (status) status.textContent = "Recherche sur CapWages et PuckPedia en cours...";
  
  let contrats = [];
  
  for (let i = 0; i < PROXIES_CONTRATS.length; i++) {
    try {
      const res = await fetch(PROXIES_CONTRATS[i](cwUrl), { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        let text = await res.text();
        if (text.includes('"contents"')) { try { const j = JSON.parse(text); text = j.contents || text; } catch(e){} }
        if (!text.includes('Just a moment...') && !text.includes('Cloudflare') && !text.includes('DDoS protection')) {
          contrats = extraireContrats(text);
          if (contrats.length > 0) break;
        }
      }
    } catch (e) {}
  }

  if (contrats.length === 0) {
    for (let i = 0; i < PROXIES_CONTRATS.length; i++) {
      try {
        const res = await fetch(PROXIES_CONTRATS[i](ppUrl), { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          let text = await res.text();
          if (text.includes('"contents"')) { try { const j = JSON.parse(text); text = j.contents || text; } catch(e){} }
          if (!text.includes('Just a moment...') && !text.includes('Cloudflare') && !text.includes('DDoS protection')) {
            contrats = extraireContrats(text);
            if (contrats.length > 0) break;
          }
        }
      } catch (e) {}
    }
  }
  
  if (contrats.length > 0) {
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
    container.style.gap = '1.5rem';
    afficherCartesContrats(contrats, container);
    if (status) status.textContent = "Données contractuelles récupérées avec succès.";
  } else {
    if (status) status.textContent = "Les sites bloquent la lecture automatisée (Anti-Robot). Voici les liens directs :";
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '1.5rem';
    container.innerHTML = `
      <a href="${cwUrl}" target="_blank" style="flex:1; min-width:200px; text-align:center; background:#162216; border:1px solid #3a4a3a; padding:1.5rem; border-radius:8px; text-decoration:none; color:#60b8c8; font-weight:bold; transition:transform 0.2s, border-color 0.2s;" onmouseover="this.style.borderColor='#d4892a'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#3a4a3a'; this.style.transform='translateY(0)'">
        <span style="font-size:2rem; display:block; margin-bottom:0.5rem;">💰</span>
        Ouvrir CapWages
      </a>
      <a href="${ppUrl}" target="_blank" style="flex:1; min-width:200px; text-align:center; background:#162216; border:1px solid #3a4a3a; padding:1.5rem; border-radius:8px; text-decoration:none; color:#80cc80; font-weight:bold; transition:transform 0.2s, border-color 0.2s;" onmouseover="this.style.borderColor='#d4892a'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#3a4a3a'; this.style.transform='translateY(0)'">
        <span style="font-size:2rem; display:block; margin-bottom:0.5rem;">🏒</span>
        Ouvrir PuckPedia
      </a>
    `;
  }
}

function extraireContrats(htmlText) {
  const contratsData = [];
  const textWithoutTags = htmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const regexCapHit = /Cap Hit\s*[:]?\s*(\$[0-9,.]+[MK]?)/gi;
  const regexLength = /(?:Length|Term)\s*[:]?\s*([0-9]+\s*Years?)/gi;
  const regexExpiry = /Expiry\s*[:]?\s*([0-9]{4}(?:\s*(?:UFA|RFA))?)/gi;
  const regexAAV = /AAV\s*[:]?\s*(\$[0-9,.]+[MK]?)/gi;

  let capHits = [...textWithoutTags.matchAll(regexCapHit)].map(m => m[1]);
  let lengths = [...textWithoutTags.matchAll(regexLength)].map(m => m[1]);
  let expirys = [...textWithoutTags.matchAll(regexExpiry)].map(m => m[1]);
  let aavs = [...textWithoutTags.matchAll(regexAAV)].map(m => m[1]);

  for (let i = 0; i < capHits.length; i++) {
    if (!contratsData.find(c => c.capHit === capHits[i] && c.length === (lengths[i] || '—'))) {
        contratsData.push({ capHit: capHits[i], aav: aavs[i] || capHits[i], length: lengths[i] || '—', expiry: expirys[i] || '—' });
    }
  }

  if (contratsData.length === 0) {
      const matchPhrase = textWithoutTags.match(/signed a (\d+)\s*year,\s*(\$[0-9,.]+)\s*contract.*cap hit of\s*(\$[0-9,.]+)/i);
      if (matchPhrase) {
          let capVal = matchPhrase[3];
          if (capVal.match(/^\$\d+$/)) {
              capVal = "$" + parseInt(capVal.substring(1)).toLocaleString('en-US');
          }
          contratsData.push({ capHit: capVal, aav: capVal, length: matchPhrase[1] + ' Years', expiry: '—' });
      }
  }

  return contratsData;
}

function afficherCartesContrats(contrats, container) {
  container.innerHTML = '';
  contrats.forEach((contrat, index) => {
    const titre = index === 0 ? "Contrat Actuel / Plus récent" : `Contrat Précédent #${index}`;
    const div = document.createElement('div');
    div.style.cssText = 'background: #162216; border: 1px solid #3a4a3a; padding: 1.2rem; border-radius: 6px;';
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

window.toggleLegende = function() {
  const el = document.getElementById('legende-stats');
  if(el) el.classList.toggle('hidden');
}