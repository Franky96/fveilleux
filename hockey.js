// Sécurité : Vérifie si l'utilisateur est connecté
const permissions = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
if (!sessionStorage.getItem('loggedIn') || !permissions.includes('hockey')) {
  alert("Accès refusé : vous n'avez pas l'autorisation de voir cette page.");
  window.location.href = 'dashboard.html';
}



// Fonction déclenchée par le bouton "Rechercher" ou la touche Enter
async function rechercherJoueur() {
  const nom = document.getElementById('joueur-input').value.trim();
  if (!nom) return;

  const erreur = document.getElementById('hockey-error');
  const fiche = document.getElementById('hockey-fiche');
  const liste = document.getElementById('hockey-resultats-liste');

  erreur.textContent = '';
  fiche.classList.add('hidden');
  liste.classList.add('hidden');
  liste.innerHTML = '';
  erreur.textContent = 'Recherche en cours...';

  try {
    const url = `https://search.d3.nhle.com/api/v1/search/player?culture=fr-ca&limit=10&q=${encodeURIComponent(nom)}&active=true`;
    // Essai direct d'abord, sinon proxy rapide
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error('direct failed');
    } catch(e) {
      res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
    }
    const data = await res.json();
    const joueurs = Array.isArray(data) ? data : (data.players || data.results || []);
    if (!joueurs.length) {
      erreur.textContent = 'Aucun joueur trouvé.';
      return;
    }

    erreur.textContent = '';

    if (joueurs.length === 1) {
      afficherFiche(joueurs[0].playerId, joueurs[0].name);
    } else {
      liste.classList.remove('hidden');
      joueurs.slice(0, 8).forEach(joueur => {
        const btn = document.createElement('button');
        // Structure simple pour que le CSS gère le style sobre et sombre
        btn.innerHTML = `<strong>${joueur.name}</strong> <span style="color:#a89f94; font-size:0.85em; margin-left:10px;">(${joueur.teamAbbrev || '—'} · ${joueur.positionCode || '—'})</span>`;
        btn.onclick = () => {
          liste.classList.add('hidden');
          afficherFiche(joueur.playerId, joueur.name);
        };
        liste.appendChild(btn);
      });
    }
  } catch (e) {
    erreur.textContent = 'Erreur de recherche : ' + e.message;
  }
}

// Affichage de la fiche du joueur
async function afficherFiche(playerId, nomComplet) {
  const erreur = document.getElementById('hockey-error');
  document.getElementById('hockey-fiche').classList.add('hidden');

  try {
    const url = `https://api-web.nhle.com/v1/player/${playerId}/landing`;
    setLoading('Chargement de la fiche...', 0);
    const res = await fetchNHL(url);
    const data = await res.json();
    erreur.textContent = '';
    document.getElementById('hockey-fiche').classList.remove('hidden');

    const prenom = data.firstName?.default || '';
    const nomJoueur = data.lastName?.default || '';
    const abbrev = data.currentTeamAbbrev || '';

    // Photo
    const photo = document.getElementById('joueur-photo');
    photo.src = data.headshot || '';
    photo.style.display = data.headshot ? 'block' : 'none';

    // Logo équipe
    const logoEl = document.getElementById('equipe-logo');
    if (abbrev) {
      logoEl.src = `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
      logoEl.style.display = 'block';
    } else {
      logoEl.style.display = 'none';
    }

    // Identité
    document.getElementById('joueur-nom').textContent = `${prenom} ${nomJoueur}`;
    document.getElementById('joueur-meta').textContent = [
      data.position,
      data.heightInCentimeters ? `${data.heightInCentimeters} cm` : null,
      data.weightInKilograms ? `${data.weightInKilograms} kg` : null,
      data.birthDate ? `Né le ${data.birthDate}` : null,
      data.birthCity?.default ? `à ${data.birthCity.default}` : null,
    ].filter(Boolean).join(' · ');

    document.getElementById('joueur-equipe-badge').textContent = abbrev || 'Sans équipe';

    // Génération et affichage du lien PuckPedia dans l'en-tête
    const nomUrl = `${prenom}-${nomJoueur}`
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const ppUrl = `https://puckpedia.com/player/${nomUrl}`;
    
    const linkPuck = document.getElementById('puckpedia-link');
    linkPuck.href = ppUrl;
    linkPuck.classList.remove('hidden');

    // Stats saison courante (Création des petites boîtes via JavaScript)
    const statsEl = document.getElementById('joueur-stats');
    statsEl.innerHTML = '';
    const saison = data.featuredStats?.regularSeason?.subSeason;

    if (saison) {
      const estGardien = data.position === 'G';
      const statsAfficher = estGardien ? [
        { label: 'PJ',   val: saison.gamesPlayed },
        { label: 'V',    val: saison.wins },
        { label: 'D',    val: saison.losses },
        { label: 'MOY',  val: saison.goalsAgainstAvg?.toFixed(2) },
        { label: '%ARR', val: saison.savePctg ? (saison.savePctg < 1 ? (saison.savePctg * 100).toFixed(1) : saison.savePctg.toFixed(1)) + '%' : '—' },
        { label: 'BL',   val: saison.shutouts },
      ] : [
        { label: 'PJ',   val: saison.gamesPlayed },
        { label: 'B',    val: saison.goals },
        { label: 'A',    val: saison.assists },
        { label: 'PTS',  val: saison.points },
        { label: '+/-',  val: saison.plusMinus },
        { label: 'PM',   val: saison.pim },
        { label: 'TIR',  val: saison.shots },
        { label: '%TIR', val: saison.shootingPctg
            ? (saison.shootingPctg < 1
                ? (saison.shootingPctg * 100).toFixed(1)
                : saison.shootingPctg.toFixed(1)) + '%'
            : '—' },
      ];
      
      statsAfficher.forEach(s => {
        const div = document.createElement('div');
        div.innerHTML = `<span>${s.label}</span><span>${s.val ?? '—'}</span>`;
        statsEl.appendChild(div);
      });
    } else {
      statsEl.innerHTML = '<p style="color:#aaa; font-size:0.9rem; grid-column:1/-1;">Aucune statistique disponible pour la saison en cours.</p>';
    }

    // Contrat via PuckPedia
    const contratEl = document.getElementById('joueur-contrat');
    // Contrat : proxies en parallèle, remplissage progressif
    afficherContrat(contratEl, ppUrl);

  } catch (e) {
    erreur.textContent = 'Impossible de charger les données : ' + e.message;
    document.getElementById('hockey-fiche').classList.add('hidden');
  }
}

// Fonc// ══ INFRASTRUCTURE PROXIES ═══════════════════════════════════════

// Injecter CSS spinner
(function() {
  const s = document.createElement('style');
  s.textContent = '@keyframes hk-spin { to { transform: rotate(360deg); } } .hk-spinner { width:18px;height:18px;border:2px solid #d4892a;border-top-color:transparent;border-radius:50%;animation:hk-spin 0.7s linear infinite;flex-shrink:0; }';
  document.head.appendChild(s);
})();

let _annuler = false;
function annulerRecherche() {
  _annuler = true;
  document.getElementById('hockey-error').textContent = 'Annulé.';
  document.getElementById('hockey-fiche').classList.add('hidden');
}

function setLoading(msg, progress) {
  const p = (typeof progress === 'number' ? progress : 0) % 101;
  document.getElementById('hockey-error').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.4rem 0;">
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <div class="hk-spinner"></div>
        <span style="color:#c8a870;font-size:0.88rem;flex:1;">${msg}</span>
        <button onclick="annulerRecherche()" style="background:rgba(255,100,100,0.12);border:1px solid rgba(255,100,100,0.35);color:#ff8080;border-radius:6px;padding:0.2rem 0.7rem;font-size:0.75rem;cursor:pointer;flex-shrink:0;width:70px;text-align:center;">✕ Annuler</button>
      </div>
      <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:4px;overflow:hidden;">
        <div style="height:100%;background:#d4892a;width:${p}%;transition:width 0.3s ease;border-radius:4px;"></div>
      </div>
    </div>`;
}

// Proxies pour l'API NHL (séquentiel — on s'arrête dès que ça marche)
const PROXIES_NHL = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.org/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
];

async function fetchNHL(url) {
  _annuler = false;
  let tour = 0;
  while (!_annuler) {
    for (let i = 0; i < PROXIES_NHL.length; i++) {
      if (_annuler) throw new Error('Annulé');
      setLoading(`Chargement... proxy ${i + 1}/${PROXIES_NHL.length}${tour > 0 ? ' (tour ' + (tour + 1) + ')' : ''}`, (i / PROXIES_NHL.length) * 100);
      await new Promise(r => setTimeout(r, 0));
      try {
        const res = await fetch(PROXIES_NHL[i](url), { signal: AbortSignal.timeout(8000) });
        if (res.ok) return res;
      } catch(e) { if (_annuler) throw new Error('Annulé'); }
    }
    tour++;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Annulé');
}

// Proxies pour PuckPedia (tous en parallèle — on remplit au fur et à mesure)
const PROXIES_PP = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.org/?${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${u}`,
  u => `https://gobetween.oklabs.org/${u}`,
  u => `https://cors.bridged.cc/${u}`,
  u => `https://proxy.yonle.me/?u=${encodeURIComponent(u)}`,
  u => `https://nocors.deno.dev/${u}`,
  u => `https://bypasscors.onrender.com/api/?url=${encodeURIComponent(u)}`,
  u => `https://test.cors.workers.dev/?${u}`,
  u => `https://cors-anywhere.herokuapp.com/${u}`,
  u => `https://cors.eu.org/${u}`,
  u => `https://www.whateverorigin.com/get?url=${encodeURIComponent(u)}`,
  u => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`,
  u => `https://yacdn.org/proxy/${u}`,
  u => `https://crossorigin.me/${u}`,
];

function extraireContrat(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const t = doc.body?.textContent || '';
  const r = {};
  const capHitM = t.match(/Cap\s*Hit[\s\S]{0,20}\$([\d]{1,2},[\d]{3},[\d]{3})/i);
  if (capHitM) r.capHit = capHitM[1].replace(/,/g, '');
  const dureeM = t.match(/Year\s+\d+\s+of\s+(\d+)/i) || t.match(/(\d+)\s*year[s]?\s*contract/i);
  if (dureeM) r.duree = dureeM[1];
  const valeurM = t.match(/\d+\s*year[s]?,\s*\$([\d]{2,3},[\d]{3},[\d]{3})/i);
  if (valeurM) r.valeur = valeurM[1].replace(/,/g, '');
  const expiryBloc = (t.match(/Expiry\s*Status([\s\S]{0,60})/i) || [])[1] || '';
  const expiry = (expiryBloc.match(/(20\d\d)/) || [])[1];
  if (expiry) r.expiry = expiry;
  const type = (expiryBloc.match(/\b(UFA|RFA|Entry Level)\b/i) || [])[1];
  if (type) r.type = type;
  return r;
}

async function afficherContrat(contratEl, ppUrl) {
  const infos = {};
  const champs = [
    { key: 'capHit', label: 'Cap Hit / an',  fmt: v => formatArgent(v) },
    { key: 'duree',  label: 'Durée',         fmt: v => `${v} an${parseInt(v) > 1 ? 's' : ''}` },
    { key: 'valeur', label: 'Valeur totale', fmt: v => formatArgent(v) },
    { key: 'expiry', label: 'Expiration',    fmt: v => v },
    { key: 'type',   label: 'Statut',        fmt: v => v },
  ];

  function setContratStatus(final) {
    const erreur = document.getElementById('hockey-error');
    if (final) {
      erreur.textContent = '';
    } else {
      const nb = champs.filter(c => infos[c.key]).length;
      erreur.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.3rem 0;">
          <div class="hk-spinner"></div>
          <span style="color:#c8a870;font-size:0.88rem;flex:1;">Contrat — ${nb}/${champs.length} champs trouvés...</span>
          <button onclick="annulerRecherche()" style="background:rgba(255,100,100,0.12);border:1px solid rgba(255,100,100,0.35);color:#ff8080;border-radius:6px;padding:0.2rem 0.7rem;font-size:0.75rem;cursor:pointer;flex-shrink:0;width:70px;text-align:center;">✕ Annuler</button>
        </div>`;
    }
  }

  function render(final) {
    contratEl.innerHTML = '';
    champs.forEach(c => {
      if (!infos[c.key]) return;
      const div = document.createElement('div');
      div.innerHTML = `<span>${c.label}</span><span>${c.fmt(infos[c.key])}</span>`;
      contratEl.appendChild(div);
    });


    const lien = document.createElement('div');
    lien.style.cssText = 'grid-column:1/-1;margin-top:0.5rem;';
    lien.innerHTML = `<a href="${ppUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:0.4rem;background:#1a2e1a;border:1px solid #4a8a4a;color:#80cc80;padding:0.4rem 1rem;border-radius:8px;text-decoration:none;font-size:0.82rem;font-weight:600;">Voir sur PuckPedia ↗</a>`;
    contratEl.appendChild(lien);
    setContratStatus(final);
  }

  // Affichage initial — lien PuckPedia tout de suite
  render(false);

  // Lancer tous les proxies en parallèle, échelonnés de 80ms
  let resolved = false;
  const resolvers = [];
  const done = new Promise(r => resolvers.push(r));
  let nbDone = 0;

  PROXIES_PP.forEach((fn, i) => {
    setTimeout(async () => {
      if (!resolved) {
        try {
          const res = await fetch(fn(ppUrl), { signal: AbortSignal.timeout(12000) });
          if (res.ok) {
            let text = await res.text();
            try { const j = JSON.parse(text); if (j.contents) text = j.contents; } catch(e) {}
            if (text.length > 500) {
              const found = extraireContrat(text);
              let newData = false;
              Object.keys(found).forEach(k => { if (!infos[k]) { infos[k] = found[k]; newData = true; } });
              if (newData) render(false);
              // Tout trouvé ? On arrête
              if (champs.every(c => infos[c.key])) { render(true); resolved = true; resolvers.forEach(r => r()); }
            }
          }
        } catch(e) {}
      }
      nbDone++;
      if (nbDone === PROXIES_PP.length) resolvers.forEach(r => r());
    }, i * 80);
  });

  await done;
  render(true);
}

// Formatage de l'argent (ex: 7850000 -> $7.85M)
function formatArgent(val) {
  if (!val) return '—';
  const n = Number(String(val).replace(/[^0-9.]/g, ''));
  if (!n) return val;
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n.toLocaleString('fr-CA');
}

// Afficher/Cacher la légende
function toggleLegende() {
  const legende = document.getElementById('legende-stats');
  legende.classList.toggle('hidden');
}