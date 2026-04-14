// === SÉCURITÉ ===
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('hockey')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}

// === ÉTAPES DE CHARGEMENT ===
function clearLoadingSteps() {
  const steps = document.getElementById('loading-steps');
  if (steps) steps.innerHTML = '';
}

function addLoadingStep(text) {
  const steps = document.getElementById('loading-steps');
  if (!steps) return null;
  const div = document.createElement('div');
  div.className = 'loading-step';
  div.innerHTML = `<span class="step-icon">⟳</span><span>${text}</span>`;
  steps.appendChild(div);
  requestAnimationFrame(() => div.classList.add('visible'));
  return div;
}

function completeStep(stepEl, success = true) {
  if (!stepEl) return;
  stepEl.querySelector('.step-icon').textContent = success ? '✓' : '✗';
  stepEl.classList.add(success ? 'step-done' : 'step-fail');
}

async function fetchWithCountdown(stepEl, fetchFn, timeoutMs = 5000) {
  const textSpan = stepEl.querySelector('span:last-child');
  const baseText = textSpan.textContent;
  let remaining = Math.ceil(timeoutMs / 1000);
  textSpan.textContent = `${baseText} ${remaining}s`;
  const timer = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    textSpan.textContent = `${baseText} ${remaining}s`;
  }, 1000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetchFn(controller.signal);
    clearTimeout(timeoutId);
    clearInterval(timer);
    textSpan.textContent = baseText;
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    clearInterval(timer);
    textSpan.textContent = baseText;
    throw e;
  }
}

// === HELPERS API ===
function saisonActuelle() {
  const d = new Date();
  const y = d.getFullYear();
  return (d.getMonth() >= 9) ? `${y}${y + 1}` : `${y - 1}${y}`;
}

async function fetchViaProxies(url) {
  const urls = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    `https://corsproxy.org/?${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        let json = await res.json();
        if (json?.contents) json = JSON.parse(json.contents);
        return json;
      }
    } catch (e) {}
  }
  return null;
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
      if(spinner) {
          clearLoadingSteps();
          spinnerMsg.textContent = "Recherche en cours...";
          spinner.classList.remove('hidden');
      }

      try {
        const url = `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=${encodeURIComponent(nom)}`;

        let data = null;
        const proxies = [
          { label: 'NHL API (direct)',    req: s => fetch(url, { signal: s }) },
          { label: 'allorigins',          req: s => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: s }) },
          { label: 'cors.lol',            req: s => fetch(`https://api.cors.lol/?url=${encodeURIComponent(url)}`, { signal: s }) },
          { label: 'corsproxy.io',        req: s => fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, { signal: s }) },
          { label: 'corsproxy.org',       req: s => fetch(`https://corsproxy.org/?${encodeURIComponent(url)}`, { signal: s }) },
          { label: 'codetabs',            req: s => fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: s }) },
          { label: 'cors.eu.org',         req: s => fetch(`https://cors.eu.org/${url}`, { signal: s }) },
          { label: 'cors.sh',             req: s => fetch(`https://proxy.cors.sh/${url}`, { signal: s }) },
          { label: 'allorigins /get',     req: s => fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: s }) },
          { label: 'thingproxy',          req: s => fetch(`https://thingproxy.freeboard.io/fetch/${url}`, { signal: s }) },
        ];

        for (const { label, req } of proxies) {
            const stepEl = addLoadingStep(label + '...');
            try {
                let res = await fetchWithCountdown(stepEl, req);
                if (res.ok) {
                    let json = await res.json();
                    if (json && json.contents) json = JSON.parse(json.contents);
                    if (json && (json.players || Array.isArray(json))) {
                        data = json;
                        completeStep(stepEl, true);
                        break;
                    }
                }
                completeStep(stepEl, false);
            } catch(e) { completeStep(stepEl, false); }
        }

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

  if(spinner) {
      clearLoadingSteps();
      spinnerMsg.textContent = "Chargement de " + nomComplet + "...";
      spinner.classList.remove('hidden');
  }

  try {
    const url = `https://api-web.nhle.com/v1/player/${playerId}/landing`;
    let data = null;
    const proxies = [
      { label: 'NHL API (direct)',    req: s => fetch(url, { signal: s }) },
      { label: 'allorigins',          req: s => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: s }) },
      { label: 'cors.lol',            req: s => fetch(`https://api.cors.lol/?url=${encodeURIComponent(url)}`, { signal: s }) },
      { label: 'corsproxy.io',        req: s => fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, { signal: s }) },
      { label: 'corsproxy.org',       req: s => fetch(`https://corsproxy.org/?${encodeURIComponent(url)}`, { signal: s }) },
      { label: 'codetabs',            req: s => fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: s }) },
      { label: 'cors.eu.org',         req: s => fetch(`https://cors.eu.org/${url}`, { signal: s }) },
      { label: 'cors.sh',             req: s => fetch(`https://proxy.cors.sh/${url}`, { signal: s }) },
      { label: 'allorigins /get',     req: s => fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: s }) },
      { label: 'thingproxy',          req: s => fetch(`https://thingproxy.freeboard.io/fetch/${url}`, { signal: s }) },
    ];

    for (const { label, req } of proxies) {
      const stepEl = addLoadingStep(label + '...');
      try {
        let res = await fetchWithCountdown(stepEl, req);
        if (res.ok) {
          let text = await res.text();
          let json = JSON.parse(text);
          if (json && json.contents) json = JSON.parse(json.contents);
          if (json && (json.firstName || json.lastName)) {
            data = json;
            completeStep(stepEl, true);
            break;
          }
        }
        completeStep(stepEl, false);
      } catch(e) { completeStep(stepEl, false); }
    }

    const stepStats = addLoadingStep("Traitement des statistiques...");
    if(spinner) spinner.classList.add('hidden');

    if (!data) { completeStep(stepStats, false); throw new Error("Statistiques inaccessibles."); }
    
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

    completeStep(stepStats, true);
    const saison = saisonActuelle();
    chargerGameLog(playerId, estGardien);
    chargerEdge(playerId, estGardien, saison);
    chercherContrats(ppUrl, cwUrl);

  } catch (e) {
    if(spinner) spinner.classList.add('hidden');
    if(erreur) erreur.textContent = "Erreur lors du chargement de la fiche.";
    fiche.classList.add('hidden');
  }
}

// === JOURNAL DES MATCHS ===
async function chargerGameLog(playerId, estGardien) {
  const container = document.getElementById('gamelog-container');
  const status    = document.getElementById('gamelog-status');
  const loading   = document.getElementById('gamelog-loading');
  if (!container) return;
  container.innerHTML = '';
  if (status) status.textContent = '';
  if (loading) loading.style.display = 'flex';

  const data = await fetchViaProxies(`https://api-web.nhle.com/v1/player/${playerId}/game-log/now`);
  if (loading) loading.style.display = 'none';

  const games = data?.gameLog || [];
  if (!games.length) {
    if (status) status.textContent = 'Aucune donnée disponible.';
    return;
  }

  const mois = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
  const fmtDate = s => { const d = new Date(s); return `${d.getDate()} ${mois[d.getMonth()]}`; };
  const derniers = [...games].sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate)).slice(0, 5);

  if (estGardien) {
    container.innerHTML = `<div class="gamelog-table">
      <div class="gamelog-row gamelog-header gamelog-row-goalie">
        <span>Date</span><span>Adv.</span><span>Rés.</span><span>SAR</span><span>ARR</span><span>%ARR</span><span>BL</span>
      </div>
      ${derniers.map(g => {
        const loc = g.homeRoadFlag === 'H' ? 'vs' : '@';
        const res = g.wins > 0 ? '<span class="gamelog-win">V</span>' : '<span class="gamelog-loss">D</span>';
        const pct = g.savePctg != null ? (g.savePctg < 1 ? g.savePctg * 100 : g.savePctg).toFixed(1) + '%' : '—';
        return `<div class="gamelog-row gamelog-row-goalie">
          <span>${fmtDate(g.gameDate)}</span>
          <span style="color:#a89f94">${loc} ${g.opponentAbbrev || '—'}</span>
          <span>${res}</span>
          <span>${g.shotsAgainst ?? '—'}</span>
          <span>${g.saves ?? '—'}</span>
          <span>${pct}</span>
          <span>${g.shutouts ?? '—'}</span>
        </div>`;
      }).join('')}
    </div>`;
  } else {
    container.innerHTML = `<div class="gamelog-table">
      <div class="gamelog-row gamelog-header gamelog-row-skater">
        <span>Date</span><span>Adv.</span><span>B</span><span>A</span><span>PTS</span><span>+/-</span><span>TOI</span>
      </div>
      ${derniers.map(g => {
        const loc = g.homeRoadFlag === 'H' ? 'vs' : '@';
        const pts = (g.goals || 0) + (g.assists || 0);
        const pm  = g.plusMinus != null ? (g.plusMinus > 0 ? '+' + g.plusMinus : g.plusMinus) : '—';
        const pmCls = g.plusMinus > 0 ? 'gamelog-win' : g.plusMinus < 0 ? 'gamelog-loss' : '';
        return `<div class="gamelog-row gamelog-row-skater">
          <span>${fmtDate(g.gameDate)}</span>
          <span style="color:#a89f94">${loc} ${g.opponentAbbrev || '—'}</span>
          <span>${g.goals ?? '—'}</span>
          <span>${g.assists ?? '—'}</span>
          <span class="gamelog-pts">${pts}</span>
          <span class="${pmCls}">${pm}</span>
          <span>${g.toi || '—'}</span>
        </div>`;
      }).join('')}
    </div>`;
  }
}

// === NHL EDGE STATS ===
async function chargerEdge(playerId, estGardien, saison) {
  const container = document.getElementById('edge-container');
  const status    = document.getElementById('edge-status');
  const loading   = document.getElementById('edge-loading');
  if (!container) return;
  container.innerHTML = '';
  if (status) status.textContent = '';
  if (loading) loading.style.display = 'flex';

  const type = estGardien ? 'goalie' : 'skater';
  const data = await fetchViaProxies(`https://api-web.nhle.com/v1/edge/${type}-detail/${playerId}/${saison}/2`);
  if (loading) loading.style.display = 'none';

  const d = data?.data?.[0] || data?.[0] || null;
  if (!d) {
    if (status) status.textContent = 'Données NHL Edge non disponibles pour cette saison.';
    return;
  }

  const kmh = v => v != null ? (v * 3.6).toFixed(1) + ' km/h' : null;
  const km  = v => v != null ? (v / 1000).toFixed(1) + ' km' : null;
  const fmtKmh = v => v != null ? v.toFixed(1) + ' km/h' : null;

  const fields = estGardien ? [
    { l: 'MOY GAA',    v: d.goalsAgainstAvg?.toFixed(2) },
    { l: '%ARR',       v: d.savePctg != null ? (d.savePctg < 1 ? d.savePctg * 100 : d.savePctg).toFixed(1) + '%' : null },
    { l: 'ARR/MATCH',  v: d.savesPerGame?.toFixed(1) },
    { l: 'SAR/MATCH',  v: d.shotsAgainstPerGame?.toFixed(1) },
  ] : [
    { l: 'VIT. MAX',   v: kmh(d.topSkatingSpeed)  ?? fmtKmh(d.topSkatingSpeedKph)  },
    { l: 'VIT. MOY',   v: kmh(d.avgSkatingSpeed)  ?? fmtKmh(d.avgSkatingSpeedKph)  },
    { l: 'DISTANCE',   v: km(d.totalDistanceOnIce) ?? (d.totalDistance != null ? d.totalDistance.toFixed(1) + ' km' : null) },
    { l: 'TIR MAX',    v: fmtKmh(d.maxShotSpeed)  ?? kmh(d.maxShotSpeedMs)         },
    { l: 'TIR MOY',    v: fmtKmh(d.avgShotSpeed)  ?? kmh(d.avgShotSpeedMs)         },
  ];

  const valides = fields.filter(f => f.v != null);
  if (!valides.length) {
    if (status) status.textContent = 'Données NHL Edge non disponibles pour cette saison.';
    return;
  }

  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(70px, 1fr))';
  container.style.gap = '10px';
  container.innerHTML = valides.map(f => `
    <div style="display:flex;flex-direction:column;align-items:center;background:#0a0f0a;border:1px solid #2a3a2a;border-radius:8px;padding:0.8rem;">
      <span style="color:#a89f94;font-size:0.75rem;text-transform:uppercase;font-weight:bold;margin-bottom:0.2rem;">${f.l}</span>
      <span style="color:#f0ede6;font-size:1.05rem;font-weight:bold;">${f.v}</span>
    </div>`).join('');
}

// === EXTRACTEUR DE CONTRATS MULTI-SOURCES (CAPWAGES + PUCKPEDIA) ===
const PROXIES_CONTRATS = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.org/?${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://cors.eu.org/${u}`,
  u => `https://proxy.cors.sh/${u}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
  u => `https://yacdn.org/proxy/${u}`,
];

async function chercherContrats(ppUrl, cwUrl) {
  const container = document.getElementById('contrats-historique');
  const status    = document.getElementById('contrat-status');
  const loading   = document.getElementById('contrat-loading');
  if (!container) return;

  container.innerHTML = '';
  if (status)  status.textContent = '';
  if (loading) loading.style.display = 'flex';

  let contrats = [];

  for (const proxyFn of PROXIES_CONTRATS) {
    try {
      const res = await fetch(proxyFn(cwUrl), { signal: AbortSignal.timeout(5000) });
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
    for (const proxyFn of PROXIES_CONTRATS) {
      try {
        const res = await fetch(proxyFn(ppUrl), { signal: AbortSignal.timeout(5000) });
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

  if (loading) loading.style.display = 'none';

  if (contrats.length > 0) {
    const c = contrats[0];
    const fields = [
      { l: 'CAP HIT', v: c.capHit },
      { l: 'AAV',     v: c.aav    },
      { l: 'DURÉE',   v: c.length },
      { l: 'EXPIR.',  v: c.expiry },
    ];
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(70px, 1fr))';
    container.style.gap = '10px';
    container.innerHTML = fields.map(f => `
      <div style="display:flex; flex-direction:column; align-items:center; background:#0a0f0a; border:1px solid #2a3a2a; border-radius:8px; padding:0.8rem;">
        <span style="color:#a89f94; font-size:0.75rem; text-transform:uppercase; font-weight:bold; margin-bottom:0.2rem;">${f.l}</span>
        <span style="color:#f0ede6; font-size:1.2rem; font-weight:bold;">${f.v || '—'}</span>
      </div>`).join('');
  } else {
    if (status) status.textContent = "Données indisponibles — liens directs :";
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '1rem';
    container.innerHTML = `
      <a href="${cwUrl}" target="_blank" style="flex:1; min-width:160px; text-align:center; background:#162216; border:1px solid #3a4a3a; padding:1.2rem; border-radius:8px; text-decoration:none; color:#60b8c8; font-weight:bold; transition:transform 0.2s, border-color 0.2s;" onmouseover="this.style.borderColor='#d4892a'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#3a4a3a'; this.style.transform='translateY(0)'">
        <span style="font-size:1.5rem; display:block; margin-bottom:0.4rem;">💰</span>CapWages
      </a>
      <a href="${ppUrl}" target="_blank" style="flex:1; min-width:160px; text-align:center; background:#162216; border:1px solid #3a4a3a; padding:1.2rem; border-radius:8px; text-decoration:none; color:#80cc80; font-weight:bold; transition:transform 0.2s, border-color 0.2s;" onmouseover="this.style.borderColor='#d4892a'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#3a4a3a'; this.style.transform='translateY(0)'">
        <span style="font-size:1.5rem; display:block; margin-bottom:0.4rem;">🏒</span>PuckPedia
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