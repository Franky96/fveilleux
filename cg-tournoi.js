/* =====================================================================
   Compteur général — mode Tournoi
   Liste de joueurs → équipes (tirage ou composition manuelle) →
   parties (toutes les équipes ou matchs 1 contre 1) → victoires / défaites
   par équipe et par joueur. Tout est sauvegardé dans le navigateur.
   ===================================================================== */
(function () {
  'use strict';

  const TN_COULEURS = ['#a088ff', '#ff7070', '#50d0a0', '#f1c40f', '#5fb3ff', '#ff9f43', '#e56fd0', '#8fd14f', '#4fd1d9', '#d9a066'];
  const KEY = 'cg.tournoi', KEY_ROSTER = 'cg.joueurs';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ---------- état de la configuration ---------- */
  let players = [];          // noms des joueurs inscrits
  let taille = 2;            // joueurs par équipe
  let draft = [];            // équipes proposées [{nom, joueurs:[]}]
  let format = 'all';        // 'all' = toutes les équipes à chaque partie, 'rr' = matchs 1 contre 1
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
    $('tn-start').disabled = !draft.length || draft.filter(e => e.joueurs.length).length < 2;
    $('tn-start').textContent = !draft.length ? 'Formez d\'abord les équipes' : recompo ? 'Continuer le tournoi avec ces équipes ▶' : 'Commencer le tournoi ▶';
  }

  function commencer() {
    const eqs = draft.filter(e => e.joueurs.length);
    if (eqs.length < 2) return;
    save(KEY_ROSTER, [...new Set([...players, ...load(KEY_ROSTER, [])])].slice(0, 40));
    const cible = parseInt($('tn-cible').value) || 0;
    if (recompo && T) {
      // nouvelles équipes : on garde les parties déjà jouées pour le classement des joueurs
      T.phase++; T.format = format; T.cible = cible;
    } else {
      T = { started: Date.now(), format, cible, phase: 1, nextId: 1, nextTeam: 1, matches: [], teams: [] };
    }
    recompo = false;
    eqs.forEach((e, i) => T.teams.push({ id: T.nextTeam++, nom: e.nom.trim() || `Équipe ${i + 1}`, couleur: TN_COULEURS[i % TN_COULEURS.length], joueurs: e.joueurs.slice(), phase: T.phase }));
    T.schedule = format === 'rr' ? calendrier(equipesActives().map(t => t.id)) : [];
    choix = null;
    save(KEY, T);
    ouvrirJeu();
  }

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
    return equipesActives().map(t => t.id);
  }

  function enregistrer(gagnant) {           // gagnant = id d'équipe, ou null pour une égalité
    const ids = equipesPartie();
    const pts = ids.map(id => { const v = $('tn-pts-' + id); const n = v && v.value.trim() !== '' ? parseInt(v.value) : null; return Number.isFinite(n) ? n : null; });
    const m = { id: T.nextId++, phase: T.phase, t: Date.now(), equipes: ids.slice(), gagnant,
      scores: pts.some(p => p != null) ? pts : null,
      compo: ids.map(id => equipe(id).joueurs.slice()) };
    if (T.format === 'rr' && !choix) { const pm = prochainMatch(); if (pm) m.rr = pm.k; }
    T.matches.push(m);
    choix = null; save(KEY, T);
    const g = gagnant != null ? equipe(gagnant) : null;
    toast(g ? `Victoire de ${g.nom} enregistrée` : 'Égalité enregistrée', () => { T.matches = T.matches.filter(x => x.id !== m.id); save(KEY, T); renderJeu(); });
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
    $('tn-partie-titre').textContent = titre;
    const finCal = T.format === 'rr' && !pm && !choix;
    $('tn-partie').innerHTML = finCal
      ? `<p class="tn-mini">Toutes les équipes se sont affrontées. Lancez une nouvelle ronde ou choisissez un match libre.</p>
         <button type="button" class="tn-btn" data-act="ronde">↻ Nouvelle ronde</button>`
      : ids.map(id => { const e = equipe(id); return `<div class="tn-match-row" style="--c:${e.couleur}">
          <div class="tn-match-eq"><b>${esc(e.nom)}</b><small>${esc(e.joueurs.join(', '))}</small></div>
          <input class="tn-pts" id="tn-pts-${id}" type="text" inputmode="numeric" placeholder="pts" aria-label="Points de ${esc(e.nom)} (facultatif)">
          <button type="button" class="tn-win" data-win="${id}">🏆 Gagne</button>
        </div>`; }).join('') + `<div class="tn-match-actions"><button type="button" class="tn-btn ghost" data-act="nul">🤝 Égalité</button>
          <button type="button" class="tn-btn ghost" data-act="choisir">⇄ Choisir les équipes</button></div>`;

    // sélection libre des équipes
    $('tn-choix').hidden = true;

    // classement équipes
    const hasPts = st.some(s => s.hasPts);
    $('tn-classement').innerHTML = `<thead><tr><th>#</th><th class="l">Équipe</th><th>J</th><th>V</th><th>D</th><th>N</th><th>%</th>${hasPts ? '<th>Pts</th>' : ''}<th>Série</th></tr></thead><tbody>` +
      st.map((s, i) => `<tr class="${i === 0 && s.v > 0 ? 'lead' : ''}">
        <td>${i + 1}</td>
        <td class="l"><button type="button" class="tn-rename" data-ren="${s.t.id}" title="Renommer" style="color:${s.t.couleur}">${esc(s.t.nom)}</button><small>${esc(s.t.joueurs.join(', '))}</small></td>
        <td>${s.j}</td><td class="v">${s.v}</td><td class="d">${s.d}</td><td>${s.n}</td><td>${pctTxt(s)}</td>${hasPts ? `<td>${s.hasPts ? s.pp : '—'}</td>` : ''}
        <td><span class="tn-serie ${(serie(s.forme)[0] || '')}">${serie(s.forme) || '—'}</span></td></tr>`).join('') + '</tbody>';

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

    // historique
    const hist = T.matches.slice().reverse();
    $('tn-hist').innerHTML = hist.length ? hist.map(m => {
      const nom = (id, i) => { const e = equipe(id); return `<b style="color:${e.couleur}">${esc(e.nom)}</b>${m.scores && m.scores[i] != null ? ' <small>(' + m.scores[i] + ')</small>' : ''}`; };
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
      (T.format === 'rr' ? '<button type="button" class="tn-btn ghost" data-act="choixcal">Revenir au calendrier</button>' : '<button type="button" class="tn-btn ghost" data-act="choixtous">Toutes les équipes</button>') + '</div>';
  }

  function nouvelleCompo() {
    if (!confirm('Former de nouvelles équipes ? Le classement des équipes repart à zéro, le classement des joueurs est conservé.')) return;
    players = [...new Set(equipesActives().flatMap(t => t.joueurs))];
    draft = []; format = T.format; taille = Math.max(1, Math.round(players.length / equipesActives().length));
    $('tn-cible').value = T.cible;
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
      else if (b.dataset.p != null) { e.stopPropagation(); clicJoueur(+b.dataset.t, +b.dataset.p); }
      else if (b.classList.contains('tn-eq-card')) versEquipe(+b.dataset.eq);
    });
    $('tn-setup').addEventListener('input', e => { const t = e.target.dataset.nom; if (t != null) draft[+t].nom = e.target.value; });
    $('tn-tirage').onclick = () => { if (players.length < 2) { toast('Ajoutez au moins 2 joueurs'); return; } tirage(); };
    $('tn-start').onclick = commencer;
    $('tn-reprendre').onclick = ouvrirJeu;
    // un tournoi est en cours : on arrive directement sur le mode Tournoi
    if (T && T.teams && window.setModeJeu) window.setModeJeu('tournoi');

    $('tn-game').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.win) enregistrer(+b.dataset.win);
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
