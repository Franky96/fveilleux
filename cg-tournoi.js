/* =====================================================================
   Compteur général — mode Tournoi
   Liste de joueurs → équipes (tirage ou composition manuelle) →
   parties (toutes les équipes, matchs 1 contre 1 ou « le gagnant reste »)
   avec compteur de points → victoires / défaites par équipe et par joueur.
   Tout est sauvegardé dans le navigateur.
   ===================================================================== */
(function () {
  'use strict';

  const TN_COULEURS = ['#a088ff', '#ff7070', '#50d0a0', '#f1c40f', '#5fb3ff', '#ff9f43', '#e56fd0', '#8fd14f', '#4fd1d9', '#d9a066'];
  const KEY = 'cg.tournoi', KEY_ROSTER = 'cg.joueurs';
  // couleurs de jeu (pions, cartes, camps) qu'on peut attribuer aux équipes pour chaque match
  const JEU = [
    ['rouge', 'Rouge', '#e74c3c'], ['bleu', 'Bleu', '#3498db'], ['vert', 'Vert', '#2ecc71'], ['jaune', 'Jaune', '#f1c40f'],
    ['orange', 'Orange', '#e67e22'], ['violet', 'Violet', '#9b59b6'], ['rose', 'Rose', '#ff6fb5'], ['cyan', 'Cyan', '#1fc8d8'],
    ['brun', 'Brun', '#8e5a2b'], ['gris', 'Gris', '#95a5a6'], ['noir', 'Noir', '#1b1b1b'], ['blanc', 'Blanc', '#f4f4f4'],
  ];
  const jeuDe = k => JEU.find(j => j[0] === k);
  const pastille = k => { const j = jeuDe(k); return j ? `<i class="tn-dot" style="background:${j[2]}" title="${j[1]}"></i>` : ''; };
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ---------- état de la configuration ---------- */
  let players = [];          // noms des joueurs inscrits
  let taille = 2;            // joueurs par équipe
  let draft = [];            // équipes proposées [{nom, joueurs:[]}]
  let format = 'all';        // 'all' = toutes ensemble, 'rr' = chacun contre chacun, 'ks' = le gagnant reste
  let ptsMode = 'max';       // 'max' = le plus de points gagne, 'min' = le moins de points gagne
  let pick = null;           // joueur sélectionné pour un échange {t, p}
  let recompo = false;       // nouvelles équipes dans le tournoi en cours

  /* ---------- état du tournoi en cours ---------- */
  let T = load(KEY, null);   // {teams, matches, format, cible, schedule, nextId, phase, started}

  /* ================= CONFIGURATION ================= */
  function recents() { return load(KEY_ROSTER, []).filter(n => !players.some(p => p.toLowerCase() === n.toLowerCase())); }

  function addPlayer(nom) {
    nom = nom.trim().replace(/\s+/g, ' ');
    if (!nom || players.some(p => p.toLowerCase() === nom.toLowerCase())) return;
    players.push(nom); draft = []; renderSetup();
  }
  function removePlayer(i) { players.splice(i, 1); draft = []; renderSetup(); }

  function nbEquipes() { return Math.max(2, Math.floor(players.length / taille)); }   // les joueurs en trop complètent des équipes

  function tirage() {
    const pool = players.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const n = nbEquipes(), old = draft;
    draft = Array.from({ length: n }, (_, i) => ({ nom: (old[i] && old[i].nom) || '', joueurs: [] }));
    pool.forEach((p, i) => draft[i % n].joueurs.push(p));   // répartition équilibrée (±1 joueur)
    pick = null; renderSetup();
  }

  function clicJoueur(t, p) {
    if (!pick) { pick = { t, p }; renderSetup(); return; }
    if (pick.t === t && pick.p === p) { pick = null; renderSetup(); return; }
    const a = draft[pick.t].joueurs, b = draft[t].joueurs;
    [a[pick.p], b[p]] = [b[p], a[pick.p]];
    pick = null; renderSetup();
  }
  function versEquipe(t) {           // déplacer le joueur sélectionné dans une autre équipe
    if (!pick || pick.t === t) return;
    const [j] = draft[pick.t].joueurs.splice(pick.p, 1);
    draft[t].joueurs.push(j); pick = null; renderSetup();
  }

  function renderSetup() {
    const box = $('tn-setup'); if (!box) return;
    const rec = recents();
    const n = players.length;
    const nEq = nbEquipes();
    const ecart = n % taille;
    let note = '';
    if (n < 2) note = 'Ajoutez au moins 2 joueurs.';
    else if (n < taille * 2 && taille > 1) note = `Il faut au moins ${taille * 2} joueurs pour faire 2 équipes de ${taille}. Les équipes seront plus petites.`;
    else note = `${nEq} équipes` + (ecart ? ` — certaines auront ${Math.floor(n / nEq)} joueurs, d'autres ${Math.ceil(n / nEq)}.` : ` de ${n / nEq} joueurs.`);

    $('tn-players').innerHTML = players.map((p, i) =>
      `<span class="tn-chip">${esc(p)}<button type="button" aria-label="Retirer ${esc(p)}" data-rm="${i}">×</button></span>`).join('')
      || '<span class="tn-empty">Aucun joueur pour l\'instant.</span>';
    $('tn-count').textContent = n ? `(${n})` : '';
    $('tn-recents').innerHTML = rec.length ? '<span class="tn-mini">Joueurs récents :</span>' + rec.slice(0, 16).map(p =>
      `<button type="button" class="tn-chip tn-chip-add" data-add="${esc(p)}">+ ${esc(p)}</button>`).join('') : '';
    document.querySelectorAll('#tn-taille .nb-btn').forEach(b => b.classList.toggle('active', +b.dataset.n === taille));
    $('tn-note').textContent = note;

    // équipes proposées
    const eqBox = $('tn-equipes');
    if (!draft.length) { eqBox.innerHTML = ''; $('tn-compo-hint').hidden = true; }
    else {
      $('tn-compo-hint').hidden = false;
      eqBox.innerHTML = draft.map((e, t) => {
        const c = TN_COULEURS[t % TN_COULEURS.length];
        return `<div class="tn-eq-card${pick && pick.t !== t ? ' tn-drop' : ''}" data-eq="${t}" style="--c:${c}">
          <input class="tn-eq-nom" data-nom="${t}" type="text" maxlength="24" placeholder="Équipe ${t + 1}" value="${esc(e.nom)}">
          <div class="tn-eq-joueurs">${e.joueurs.map((p, i) =>
            `<button type="button" class="tn-pl${pick && pick.t === t && pick.p === i ? ' sel' : ''}" data-t="${t}" data-p="${i}">${esc(p)}</button>`).join('')
            || '<span class="tn-empty">vide</span>'}</div>
        </div>`;
      }).join('');
    }
    document.querySelectorAll('#tn-format .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.f === format));
    document.querySelectorAll('#tn-ptsmode .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.pm === ptsMode));
    $('tn-start').disabled = !draft.length || draft.filter(e => e.joueurs.length).length < 2;
    $('tn-start').textContent = !draft.length ? 'Formez d\'abord les équipes' : recompo ? 'Continuer le tournoi avec ces équipes ▶' : 'Commencer le tournoi ▶';
  }

  function commencer() {
    const eqs = draft.filter(e => e.joueurs.length);
    if (eqs.length < 2) return;
    save(KEY_ROSTER, [...new Set([...players, ...load(KEY_ROSTER, [])])].slice(0, 40));
    const cible = parseInt($('tn-cible').value) || 0, ptsCible = parseInt($('tn-ptscible').value) || 0;
    if (recompo && T) {
      // nouvelles équipes : on garde les parties déjà jouées pour le classement des joueurs
      T.phase++; T.format = format; T.cible = cible; T.ptsCible = ptsCible; T.ptsMode = ptsMode;
    } else {
      T = { started: Date.now(), format, cible, ptsCible, ptsMode, phase: 1, nextId: 1, nextTeam: 1, matches: [], teams: [] };
    }
    T.live = null;
    recompo = false;
    eqs.forEach((e, i) => T.teams.push({ id: T.nextTeam++, nom: e.nom.trim() || `Équipe ${i + 1}`, couleur: TN_COULEURS[i % TN_COULEURS.length], joueurs: e.joueurs.slice(), phase: T.phase }));
    T.schedule = format === 'rr' ? calendrier(equipesActives().map(t => t.id)) : [];
    T.queue = format === 'ks' ? melange(equipesActives().map(t => t.id)) : [];
    choix = null;
    save(KEY, T);
    ouvrirJeu();
  }

  function melange(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* Calendrier « chacun contre chacun » (méthode du cercle) */
  function calendrier(ids) {
    const a = ids.slice(); if (a.length % 2) a.push(null);
    const n = a.length, out = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x != null && y != null) out.push({ a: x, b: y, ronde: r + 1 }); }
      a.splice(1, 0, a.pop());
    }
    return out;
  }

  /* ================= TOURNOI EN COURS ================= */
  const equipesActives = () => T.teams.filter(t => t.phase === T.phase);
  const equipe = id => T.teams.find(t => t.id === id);

  function prochainMatch() {
    if (T.format !== 'rr') return null;
    const fait = new Set(T.matches.filter(m => m.phase === T.phase && m.rr != null).map(m => m.rr));
    const i = T.schedule.findIndex((_, k) => !fait.has(k));
    return i < 0 ? null : { ...T.schedule[i], k: i };
  }

  let choix = null;  // équipes de la partie en cours (ids), null = automatique
  function equipesPartie() {
    if (choix) return choix;
    if (T.format === 'rr') { const m = prochainMatch(); if (m) return [m.a, m.b]; }
    if (T.format === 'ks' && T.queue && T.queue.length > 1) return T.queue.slice(0, 2);   // tenant contre challenger
    return equipesActives().map(t => t.id);
  }

  /* ---------- points de la partie en cours (comme le compteur) ---------- */
  function live() {
    const ids = equipesPartie(), key = ids.join(',');
    if (!T.live || T.live.key !== key) {
      // nouvelle partie : chaque équipe reprend sa dernière couleur de jeu, sans doublon
      T.live = { key, pts: {}, hist: {}, jeu: {} };
      const pris = new Set();
      ids.forEach(id => { const c = (T.jeuDefaut || {})[id]; if (c && !pris.has(c)) { T.live.jeu[id] = c; pris.add(c); } });
    }
    if (!T.live.jeu) T.live.jeu = {};
    ids.forEach(id => { if (T.live.pts[id] == null) { T.live.pts[id] = 0; T.live.hist[id] = []; } });
    return T.live;
  }
  function ajouterPts(id, signe) {
    const inp = $('tn-pts-' + id), v = parseInt(inp && inp.value) || 0;
    if (v <= 0) { if (inp) inp.focus(); return; }
    const L = live(); L.pts[id] += signe * v; L.hist[id].push(signe * v);
    inp.value = ''; save(KEY, T); majPoints();
  }
  let palette = null;   // équipe dont la palette de couleurs est ouverte
  function choisirJeu(id, c) {
    const L = live();
    // la couleur appartenait déjà à une autre équipe du match : on échange
    const autre = Object.keys(L.jeu).find(k => +k !== id && L.jeu[k] === c);
    if (autre) { if (L.jeu[id]) L.jeu[autre] = L.jeu[id]; else delete L.jeu[autre]; }
    if (c) L.jeu[id] = c; else delete L.jeu[id];
    palette = null; save(KEY, T); renderJeu();
  }
  function annulerPts(id) {
    const L = live(); if (!L.hist[id].length) return;
    L.pts[id] -= L.hist[id].pop(); save(KEY, T); majPoints();
  }
  // fin de partie d'après la cible de points : {gagnant} ou {nul:true}, sinon null
  function finPartie() {
    if (!T.ptsCible) return null;
    const ids = equipesPartie(), L = live(), sc = ids.map(id => L.pts[id]);
    if (!sc.some(x => x >= T.ptsCible)) return null;
    const best = T.ptsMode === 'min' ? Math.min(...sc) : Math.max(...sc);
    const w = ids.filter((id, i) => sc[i] === best);
    return w.length === 1 ? { gagnant: w[0] } : { nul: true };
  }
  function majPoints() {
    const ids = equipesPartie(), L = live(), sc = ids.map(id => L.pts[id]);
    const fin = finPartie(), anyPts = sc.some(x => x !== 0);
    const lead = anyPts ? (T.ptsMode === 'min' ? Math.min(...sc) : Math.max(...sc)) : null;
    ids.forEach((id, i) => {
      const el = $('tn-sc-' + id); if (!el) return;
      el.textContent = L.pts[id];
      el.classList.toggle('lead', !fin && lead != null && sc[i] === lead && sc.filter(x => x === lead).length === 1);
      el.classList.toggle('win', !!(fin && fin.gagnant === id));
      const u = $('tn-undo-' + id); if (u) u.disabled = !L.hist[id].length;
      const bar = $('tn-scbar-' + id);
      if (bar) bar.style.width = T.ptsCible ? Math.min(100, Math.max(0, L.pts[id] / T.ptsCible * 100)) + '%' : '0';
    });
    const box = $('tn-fin'); if (!box) return;
    box.hidden = !fin;
    if (fin) {
      const g = fin.gagnant != null ? equipe(fin.gagnant) : null;
      box.innerHTML = g ? `<span>Partie terminée : <b style="color:${g.couleur}">${esc(g.nom)}</b> gagne</span> <button type="button" class="tn-btn" data-win="${g.id}">Valider la victoire ✔</button>`
        : `<span>Partie terminée à égalité</span> <button type="button" class="tn-btn" data-act="nul">Valider l'égalité ✔</button>`;
    }
  }

  function enregistrer(gagnant) {           // gagnant = id d'équipe, ou null pour une égalité
    const ids = equipesPartie(), L = live();
    const joue = ids.some(id => L.hist[id].length);
    const m = { id: T.nextId++, phase: T.phase, t: Date.now(), equipes: ids.slice(), gagnant,
      scores: joue ? ids.map(id => L.pts[id]) : null,
      jeu: ids.some(id => L.jeu[id]) ? ids.map(id => L.jeu[id] || null) : null,
      compo: ids.map(id => equipe(id).joueurs.slice()) };
    if (T.format === 'rr' && !choix) { const pm = prochainMatch(); if (pm) m.rr = pm.k; }
    const avant = { queue: (T.queue || []).slice(), live: JSON.parse(JSON.stringify(L)), choix };
    if (T.format === 'ks') {
      // le gagnant reste (en tête de file), les autres équipes de la partie vont au bout de la file
      const q = T.queue.filter(id => !ids.includes(id));
      const reste = gagnant != null ? gagnant : (T.queue[0] != null && ids.includes(T.queue[0]) ? T.queue[0] : null);
      T.queue = [...(reste != null ? [reste] : []), ...q, ...ids.filter(id => id !== reste)];
    }
    T.matches.push(m);
    T.jeuDefaut = T.jeuDefaut || {}; ids.forEach(id => { if (L.jeu[id]) T.jeuDefaut[id] = L.jeu[id]; });
    choix = null; T.live = null; palette = null; save(KEY, T);
    const g = gagnant != null ? equipe(gagnant) : null;
    toast(g ? `Victoire de ${g.nom} enregistrée` : 'Égalité enregistrée', () => {
      T.matches = T.matches.filter(x => x.id !== m.id); T.queue = avant.queue; T.live = avant.live; choix = avant.choix;
      save(KEY, T); renderJeu();
    });
    renderJeu();
  }

  /* statistiques */
  function statsEquipes() {
    const S = new Map(equipesActives().map(t => [t.id, { t, j: 0, v: 0, d: 0, n: 0, pp: 0, pc: 0, hasPts: false, forme: [] }]));
    for (const m of T.matches) {
      if (m.phase !== T.phase) continue;
      m.equipes.forEach((id, i) => {
        const s = S.get(id); if (!s) return;
        s.j++;
        const r = m.gagnant == null ? 'N' : m.gagnant === id ? 'V' : 'D';
        if (r === 'V') s.v++; else if (r === 'D') s.d++; else s.n++;
        s.forme.push(r);
        if (m.scores && m.scores[i] != null) {
          s.hasPts = true; s.pp += m.scores[i];
          m.scores.forEach((x, k) => { if (k !== i && x != null) s.pc += x / Math.max(1, m.scores.filter(y => y != null).length - 1); });
        }
      });
    }
    for (const s of S.values()) { let k = 0; s.best = 0; for (const r of s.forme) { k = r === 'V' ? k + 1 : 0; s.best = Math.max(s.best, k); } }
    return [...S.values()].sort((a, b) => b.v - a.v || pct(b) - pct(a) || (b.pp - b.pc) - (a.pp - a.pc) || a.d - b.d || a.t.nom.localeCompare(b.t.nom));
  }
  function statsJoueurs() {
    const S = new Map();
    for (const m of T.matches) m.compo.forEach((js, i) => js.forEach(p => {
      if (!S.has(p)) S.set(p, { p, j: 0, v: 0, d: 0, n: 0 });
      const s = S.get(p); s.j++;
      if (m.gagnant == null) s.n++; else if (m.gagnant === m.equipes[i]) s.v++; else s.d++;
    }));
    return [...S.values()].sort((a, b) => b.v - a.v || pct(b) - pct(a) || a.d - b.d || a.p.localeCompare(b.p));
  }
  const pct = s => s.j ? (s.v + s.n / 2) / s.j : 0;
  const pctTxt = s => s.j ? Math.round(pct(s) * 100) + ' %' : '—';
  function serie(f) { if (!f.length) return ''; const r = f[f.length - 1]; let k = 0; for (let i = f.length - 1; i >= 0 && f[i] === r; i--) k++; return r + k; }

  function renderJeu() {
    const eqs = equipesActives();
    const st = statsEquipes();
    const champion = T.cible > 0 ? st.find(s => s.v >= T.cible) : null;
    const nb = T.matches.filter(m => m.phase === T.phase).length;
    $('cg-title').textContent = `🏅 Tournoi — ${nb} partie${nb > 1 ? 's' : ''}` + (T.cible ? ` · ${T.cible} V pour gagner` : '');

    // bandeau champion
    $('tn-champion').hidden = !champion;
    if (champion) $('tn-champion').innerHTML = `🏆 <b style="color:${champion.t.couleur}">${esc(champion.t.nom)}</b> remporte le tournoi !<small>${esc(champion.t.joueurs.join(', '))} — ${champion.v} V · ${champion.d} D</small>`;

    // partie en cours
    const ids = equipesPartie();
    const pm = T.format === 'rr' && !choix ? prochainMatch() : null;
    let titre = 'Nouvelle partie';
    if (T.format === 'rr') titre = pm ? `Match ${pm.k + 1} / ${T.schedule.length} · ronde ${pm.ronde}` : (choix ? 'Match libre' : 'Calendrier terminé');
    const tenant = T.format === 'ks' && !choix ? st.find(s => s.t.id === T.queue[0]) : null;
    if (T.format === 'ks') titre = choix ? 'Match libre' : 'Le gagnant reste';
    $('tn-partie-titre').textContent = titre;
    $('tn-partie-cible').textContent = T.ptsCible ? `${T.ptsMode === 'min' ? 'fin à' : 'premier à'} ${T.ptsCible} pts${T.ptsMode === 'min' ? ', le moins gagne' : ''}` : 'points facultatifs';
    const finCal = T.format === 'rr' && !pm && !choix;
    $('tn-partie').innerHTML = finCal
      ? `<p class="tn-mini">Toutes les équipes se sont affrontées. Lancez une nouvelle ronde ou choisissez un match libre.</p>
         <button type="button" class="tn-btn" data-act="ronde">↻ Nouvelle ronde</button>`
      : ids.map((id, i) => { const e = equipe(id);
          const role = T.format === 'ks' && !choix ? (i === 0 ? `<span class="tn-role">👑 tenant${tenant && serie(tenant.forme)[0] === 'V' ? ' · ' + serie(tenant.forme).slice(1) + ' V de suite' : ''}</span>` : '<span class="tn-role">⚔️ challenger</span>') : '';
          return `<div class="tn-match-row${palette === id ? ' pal' : ''}" style="--c:${e.couleur}">
          <div class="tn-match-eq"><b>${esc(e.nom)}</b>${role}<small>${esc(e.joueurs.join(', '))}</small>
            ${(() => { const j = jeuDe(live().jeu[id]); return `<button type="button" class="tn-jc${j ? '' : ' vide'}" data-jc="${id}" aria-expanded="${palette === id}">${j ? `<i class="tn-dot" style="background:${j[2]}"></i>joue en ${j[1].toLowerCase()}` : '🎨 couleur de jeu'}</button>`; })()}</div>
          ${palette === id ? `<div class="tn-palette">${JEU.map(j => {
              const chez = Object.keys(live().jeu).find(k => +k !== id && live().jeu[k] === j[0]);
              return `<button type="button" class="tn-sw${live().jeu[id] === j[0] ? ' on' : ''}" data-sw="${j[0]}" data-for="${id}" title="${j[1]}${chez ? ' (échange avec ' + esc(equipe(+chez).nom) + ')' : ''}" style="--s:${j[2]}"><i></i>${j[1]}${chez ? ' ⇄' : ''}</button>`; }).join('')}
              <button type="button" class="tn-sw" data-sw="" data-for="${id}"><i class="none"></i>Aucune</button></div>` : ''}
          <div class="tn-sc" id="tn-sc-${id}">0</div>
          <div class="tn-scbar"><i id="tn-scbar-${id}"></i></div>
          <div class="tn-ctrl">
            <input class="tn-pts" id="tn-pts-${id}" data-pts="${id}" type="text" inputmode="numeric" placeholder="pts" aria-label="Points à ajouter pour ${esc(e.nom)}">
            <button type="button" class="tn-pb undo" id="tn-undo-${id}" data-undo="${id}" aria-label="Annuler le dernier ajout" disabled>↩</button>
            <button type="button" class="tn-pb minus" data-minus="${id}" aria-label="Retirer les points">−</button>
            <button type="button" class="tn-pb plus" data-plus="${id}" aria-label="Ajouter les points">+</button>
            <button type="button" class="tn-win" data-win="${id}">🏆 Gagne</button>
          </div>
        </div>`; }).join('') + `<div class="tn-fin" id="tn-fin" hidden></div>
        <div class="tn-match-actions"><button type="button" class="tn-btn ghost" data-act="nul">🤝 Égalité</button>
          <button type="button" class="tn-btn ghost" data-act="choisir">⇄ Choisir les équipes</button>${choix && T.format !== 'all' ? '<button type="button" class="tn-btn ghost" data-act="choixcal">↩ Reprendre le format</button>' : ''}</div>` +
        (T.format === 'ks' && !choix && T.queue.length > 2 ? `<p class="tn-queue">En attente : ${T.queue.slice(2).map(id => { const e = equipe(id); return `<b style="color:${e.couleur}">${esc(e.nom)}</b>`; }).join(' → ')}</p>` : '');

    // sélection libre des équipes
    $('tn-choix').hidden = true;
    if (!finCal) majPoints();

    // classement équipes
    const hasPts = st.some(s => s.hasPts);
    $('tn-classement').innerHTML = `<thead><tr><th>#</th><th class="l">Équipe</th><th>J</th><th>V</th><th>D</th><th>N</th><th>%</th>${hasPts ? '<th>Pts</th>' : ''}<th>Série</th>${T.format === 'ks' ? '<th title="Plus longue série de victoires">Record</th>' : ''}</tr></thead><tbody>` +
      st.map((s, i) => `<tr class="${i === 0 && s.v > 0 ? 'lead' : ''}">
        <td>${i + 1}</td>
        <td class="l"><button type="button" class="tn-rename" data-ren="${s.t.id}" title="Renommer" style="color:${s.t.couleur}">${esc(s.t.nom)}</button><small>${esc(s.t.joueurs.join(', '))}</small></td>
        <td>${s.j}</td><td class="v">${s.v}</td><td class="d">${s.d}</td><td>${s.n}</td><td>${pctTxt(s)}</td>${hasPts ? `<td>${s.hasPts ? s.pp : '—'}</td>` : ''}
        <td><span class="tn-serie ${(serie(s.forme)[0] || '')}">${serie(s.forme) || '—'}</span></td>${T.format === 'ks' ? `<td>${s.best || '—'}</td>` : ''}</tr>`).join('') + '</tbody>';

    // barres victoires / défaites
    const maxJ = Math.max(1, ...st.map(s => s.j));
    $('tn-barres').innerHTML = st.map(s => `<div class="tn-bar-row"><span style="color:${s.t.couleur}">${esc(s.t.nom)}</span>
      <div class="tn-bar"><i class="v" style="width:${s.v / maxJ * 100}%"></i><i class="n" style="width:${s.n / maxJ * 100}%"></i><i class="d" style="width:${s.d / maxJ * 100}%"></i></div>
      <em>${s.v}–${s.d}${s.n ? '–' + s.n : ''}</em></div>`).join('');

    // classement joueurs
    const sj = statsJoueurs();
    $('tn-joueurs-wrap').hidden = !sj.length;
    $('tn-joueurs').innerHTML = '<thead><tr><th>#</th><th class="l">Joueur</th><th>J</th><th>V</th><th>D</th><th>N</th><th>%</th></tr></thead><tbody>' +
      sj.map((s, i) => `<tr><td>${i + 1}</td><td class="l">${esc(s.p)}</td><td>${s.j}</td><td class="v">${s.v}</td><td class="d">${s.d}</td><td>${s.n}</td><td>${pctTxt(s)}</td></tr>`).join('') + '</tbody>';

    // calendrier
    $('tn-cal-wrap').hidden = T.format !== 'rr';
    if (T.format === 'rr') {
      const fait = new Map(T.matches.filter(m => m.phase === T.phase && m.rr != null).map(m => [m.rr, m]));
      $('tn-cal').innerHTML = T.schedule.map((s, k) => {
        const m = fait.get(k), a = equipe(s.a), b = equipe(s.b);
        const res = m ? (m.gagnant == null ? '🤝' : m.gagnant === s.a ? '◀ V' : 'V ▶') : (pm && pm.k === k ? '● en cours' : '');
        return `<li class="${m ? 'done' : pm && pm.k === k ? 'now' : ''}"><span class="r">R${s.ronde}</span><b style="color:${a.couleur}">${esc(a.nom)}</b><em>${res || 'vs'}</em><b style="color:${b.couleur}">${esc(b.nom)}</b></li>`;
      }).join('');
    }

    // victoires par couleur de jeu
    const SC = new Map();
    for (const m of T.matches) if (m.jeu) m.jeu.forEach((c, i) => {
      if (!c) return; if (!SC.has(c)) SC.set(c, { c, j: 0, v: 0, d: 0, n: 0 });
      const x = SC.get(c); x.j++;
      if (m.gagnant == null) x.n++; else if (m.gagnant === m.equipes[i]) x.v++; else x.d++;
    });
    const sc = [...SC.values()].sort((a, b) => pct(b) - pct(a) || b.v - a.v);
    $('tn-couleurs-wrap').hidden = !sc.length;
    $('tn-couleurs').innerHTML = '<thead><tr><th class="l">Couleur</th><th>J</th><th>V</th><th>D</th><th>N</th><th>%</th></tr></thead><tbody>' +
      sc.map(x => `<tr><td class="l">${pastille(x.c)} ${jeuDe(x.c)[1]}</td><td>${x.j}</td><td class="v">${x.v}</td><td class="d">${x.d}</td><td>${x.n}</td><td>${pctTxt(x)}</td></tr>`).join('') + '</tbody>';

    // historique
    const hist = T.matches.slice().reverse();
    $('tn-hist').innerHTML = hist.length ? hist.map(m => {
      const nom = (id, i) => { const e = equipe(id); return `${m.jeu ? pastille(m.jeu[i]) : ''}<b style="color:${e.couleur}">${esc(e.nom)}</b>${m.scores && m.scores[i] != null ? ' <small>(' + m.scores[i] + ')</small>' : ''}`; };
      const g = m.gagnant != null ? equipe(m.gagnant) : null;
      const autres = m.equipes.map((id, i) => id === m.gagnant ? null : nom(id, i)).filter(Boolean);
      const quand = new Date(m.t).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      return `<li${m.phase !== T.phase ? ' class="old"' : ''}><span class="tn-mini">#${m.id} · ${quand}${m.phase !== T.phase ? ' · compo. ' + m.phase : ''}</span>
        <span>${g ? `🏆 ${nom(m.gagnant, m.equipes.indexOf(m.gagnant))} bat ${autres.join(', ')}` : '🤝 Égalité : ' + autres.join(' · ')}</span>
        <button type="button" class="tn-del" data-del="${m.id}" aria-label="Supprimer la partie ${m.id}">✕</button></li>`;
    }).join('') : '<li class="tn-empty">Aucune partie jouée.</li>';
  }

  function afficherChoix() {
    const c = $('tn-choix');
    const sel = new Set(equipesPartie());
    c.hidden = false;
    c.innerHTML = '<span class="tn-mini">Équipes qui jouent cette partie :</span><div class="tn-choix-list">' +
      equipesActives().map(e => `<label style="--c:${e.couleur}"><input type="checkbox" value="${e.id}"${sel.has(e.id) ? ' checked' : ''}> ${esc(e.nom)}</label>`).join('') +
      '</div><div class="tn-match-actions"><button type="button" class="tn-btn" data-act="choixok">Valider</button>' +
      (T.format !== 'all' ? `<button type="button" class="tn-btn ghost" data-act="choixcal">${T.format === 'rr' ? 'Revenir au calendrier' : 'Revenir à la file'}</button>` : '<button type="button" class="tn-btn ghost" data-act="choixtous">Toutes les équipes</button>') + '</div>';
  }

  function nouvelleCompo() {
    if (!confirm('Former de nouvelles équipes ? Le classement des équipes repart à zéro, le classement des joueurs est conservé.')) return;
    players = [...new Set(equipesActives().flatMap(t => t.joueurs))];
    draft = []; format = T.format; taille = Math.max(1, Math.round(players.length / equipesActives().length));
    $('tn-cible').value = T.cible; $('tn-ptscible').value = T.ptsCible || 0; ptsMode = T.ptsMode || 'max';
    recompo = true;
    fermerJeu(true);
    tirage();
    toast('Nouvelles équipes tirées — ajustez-les puis lancez la suite du tournoi');
  }

  function resume() {
    const st = statsEquipes(), sj = statsJoueurs();
    const lignes = ['🏅 Tournoi — ' + new Date(T.started).toLocaleDateString('fr-CA'), '',
      'Équipes :', ...st.map((s, i) => `${i + 1}. ${s.t.nom} (${s.t.joueurs.join(', ')}) — ${s.v} V · ${s.d} D${s.n ? ' · ' + s.n + ' N' : ''}`),
      '', 'Joueurs :', ...sj.map((s, i) => `${i + 1}. ${s.p} — ${s.v} V · ${s.d} D${s.n ? ' · ' + s.n + ' N' : ''} (${pctTxt(s)})`)];
    const txt = lignes.join('\n');
    const ok = () => toast('Résumé copié');
    if (navigator.share && matchMedia('(pointer:coarse)').matches) navigator.share({ title: 'Tournoi', text: txt }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => prompt('Copiez le résumé :', txt));
    else prompt('Copiez le résumé :', txt);
  }

  /* ---------- petite notification avec « Annuler » ---------- */
  let toastTimer = null;
  function toast(msg, undo) {
    const el = $('tn-toast');
    el.innerHTML = esc(msg) + (undo ? ' <button type="button">Annuler</button>' : '');
    el.hidden = false;
    if (undo) el.querySelector('button').onclick = () => { undo(); el.hidden = true; };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  /* ================= NAVIGATION ================= */
  function ouvrirJeu() {
    $('cg-setup').style.display = 'none';
    $('tn-game').hidden = false;
    renderJeu();
  }
  function fermerJeu(garder) {
    $('tn-game').hidden = true;
    $('cg-setup').style.display = '';
    $('cg-title').textContent = '🎯 Compteur Général';
    if (!garder) { T = null; save(KEY, null); }
    window.setModeJeu('tournoi');
  }

  // appelé par setModeJeu() de la page
  window.tnShow = function (on) {
    $('tn-setup').hidden = !on;
    document.querySelectorAll('.cg-classic').forEach(el => { el.style.display = on ? 'none' : ''; });
    $('tn-reprendre').hidden = !(on && T && T.teams);
    if (!on) recompo = false;
    if (T && T.teams) {
      const nb = T.matches.length;
      $('tn-reprendre').innerHTML = `▶ Reprendre le tournoi en cours <small>${T.teams.filter(t => t.phase === T.phase).map(t => esc(t.nom)).join(' · ')} — ${nb} partie${nb > 1 ? 's' : ''}</small>`;
    }
    if (on) renderSetup();
  };

  /* ================= ÉVÉNEMENTS ================= */
  document.addEventListener('DOMContentLoaded', () => {
    const inp = $('tn-nom');
    const ajouter = () => { inp.value.split(/[,;\n]/).forEach(addPlayer); inp.value = ''; inp.focus(); };
    $('tn-add').onclick = ajouter;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } });

    $('tn-setup').addEventListener('click', e => {
      const b = e.target.closest('button, .tn-eq-card'); if (!b) return;
      if (b.dataset.rm != null) removePlayer(+b.dataset.rm);
      else if (b.dataset.add != null) addPlayer(b.dataset.add);
      else if (b.dataset.n) { taille = +b.dataset.n; if (draft.length) tirage(); else renderSetup(); }
      else if (b.dataset.f) { format = b.dataset.f; renderSetup(); }
      else if (b.dataset.pm) { ptsMode = b.dataset.pm; renderSetup(); }
      else if (b.dataset.p != null) { e.stopPropagation(); clicJoueur(+b.dataset.t, +b.dataset.p); }
      else if (b.classList.contains('tn-eq-card')) versEquipe(+b.dataset.eq);
    });
    $('tn-setup').addEventListener('input', e => { const t = e.target.dataset.nom; if (t != null) draft[+t].nom = e.target.value; });
    $('tn-tirage').onclick = () => { if (players.length < 2) { toast('Ajoutez au moins 2 joueurs'); return; } tirage(); };
    $('tn-start').onclick = commencer;
    $('tn-reprendre').onclick = ouvrirJeu;
    // un tournoi est en cours : on arrive directement sur le mode Tournoi
    if (T && T.teams && window.setModeJeu) window.setModeJeu('tournoi');

    $('tn-game').addEventListener('keydown', e => { const id = e.target.dataset && e.target.dataset.pts; if (id && e.key === 'Enter') { e.preventDefault(); ajouterPts(+id, 1); } });
    $('tn-game').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.win) enregistrer(+b.dataset.win);
      else if (b.dataset.plus) ajouterPts(+b.dataset.plus, 1);
      else if (b.dataset.minus) ajouterPts(+b.dataset.minus, -1);
      else if (b.dataset.undo) annulerPts(+b.dataset.undo);
      else if (b.dataset.jc) { palette = palette === +b.dataset.jc ? null : +b.dataset.jc; renderJeu(); }
      else if (b.dataset.sw != null && b.dataset.for) choisirJeu(+b.dataset.for, b.dataset.sw);
      else if (b.dataset.del) { if (confirm('Supprimer cette partie ?')) { T.matches = T.matches.filter(m => m.id !== +b.dataset.del); save(KEY, T); renderJeu(); } }
      else if (b.dataset.ren) { const t = equipe(+b.dataset.ren), n = prompt('Nom de l\'équipe :', t.nom); if (n && n.trim()) { t.nom = n.trim().slice(0, 24); save(KEY, T); renderJeu(); } }
      else switch (b.dataset.act) {
        case 'nul': enregistrer(null); break;
        case 'choisir': afficherChoix(); break;
        case 'choixok': {
          const ids = [...document.querySelectorAll('#tn-choix input:checked')].map(i => +i.value);
          if (ids.length < 2) { toast('Choisissez au moins 2 équipes'); return; }
          choix = ids; renderJeu(); break;
        }
        case 'choixcal': case 'choixtous': choix = null; renderJeu(); break;
        case 'ronde': T.schedule = T.schedule.concat(calendrier(equipesActives().map(t => t.id)).map(s => ({ ...s, ronde: s.ronde + Math.max(...T.schedule.map(x => x.ronde)) }))); save(KEY, T); renderJeu(); break;
        case 'compo': nouvelleCompo(); break;
        case 'resume': resume(); break;
        case 'setup': fermerJeu(true); break;
        case 'fin': if (confirm('Terminer ce tournoi et effacer ses résultats ?')) fermerJeu(false); break;
      }
    });
  });
})();
