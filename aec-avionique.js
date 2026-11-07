/* Documentation AEC Avionique : Étape → cours → modules → leçons (archive des cours de Frank, ÉNA / Cégep Édouard-Montpetit).
   Structure : api/cours.php?f=index.json (le contenu est sur le serveur, hors du dépôt) ; sinon le squelette aec-avionique.json (titres seulement).
   Adresses : # (l'accueil : une carte par étape), #e2 (une étape), #e2/c1 (un cours), #e1/c1/m3 (un module), #e1/c1/m3/<leçon> (une leçon).
   Dans une étape : barre latérale (cours, modules du cours ouvert, leçons du module ouvert), qui devient un tiroir sur téléphone. Leçons en Markdown, rendues ici (marked + DOMPurify + KaTeX). */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = f => 'api/cours.php?f=' + encodeURIComponent(f).replace(/%2F/g, '/');
  const vue = $('#vue');
  let S = null, avecContenu = false;

  const NB_ETAPES = 6;   // l'AEC compte 6 étapes ; elles s'ajoutent au fil de l'archivage
  const CLE_DERNIER = 'aec.dernier';   // dernière vue ouverte dans une étape (lien « Reprendre » de l'accueil), dans ce navigateur
  // documentation de référence, pas un suivi : plus de coches « leçon lue » (demande de Frank) ; on efface l'ancienne liste
  try { Object.keys(localStorage).filter(k => k.startsWith('aec.vu.') || k === 'aec.onglet').forEach(k => localStorage.removeItem(k)); } catch (e) {}
  // documents : type affiché, icône, et ouverture (PDF dans un onglet, les autres téléchargés)
  const TYPES = { pdf: ['PDF', '📄'], doc: ['Word', '📝'], docx: ['Word', '📝'], ppt: ['PowerPoint', '📊'], pptx: ['PowerPoint', '📊'],
    xls: ['Excel', '📈'], xlsx: ['Excel', '📈'], ms13: ['Multisim', '🔌'], ms14: ['Multisim', '🔌'], zip: ['Archive ZIP', '🗜️'] };
  const ext = f => (String(f).split('.').pop() || '').toLowerCase();
  const typeDoc = f => TYPES[ext(f)] || [ext(f).toUpperCase(), '📎'];
  const lienDoc = d => ext(d.f) === 'pdf' ? `href="${API(d.f)}" target="_blank" rel="noopener"` : `href="${API(d.f)}" download`;
  const couleur = i => `--c:var(${i % 2 ? '--c-pol' : '--c-info'})`;

  async function charger() {
    try {
      const r = await fetch(API('index.json'), { credentials: 'same-origin', cache: 'no-cache' });
      if (r.ok) { S = await r.json(); avecContenu = true; }
    } catch (e) { /* pas encore de contenu sur le serveur */ }
    let sq = null;
    try { sq = await (await fetch('aec-avionique.json', { cache: 'no-cache' })).json(); } catch (e) {}
    if (!S) S = sq; else if (sq) fusion(S, sq);
    history.scrollRestoration = 'manual';   // la page remet elle-même chaque vue à sa place (voir positions)
    addEventListener('hashchange', ev => { sauverPosition(ev.oldURL); afficher(); });
    afficher();
  }

  // ce que le squelette sait et que le serveur n'a pas encore : une étape annoncée, un cours non archivé
  function fusion(S, sq) {
    for (const et of sq.etapes) {
      const se = S.etapes.find(x => x.id === et.id);
      if (!se) { S.etapes.push({ ...et, squelette: true }); continue; }   // étape pas encore transférée : « contenu à venir »
      for (const co of et.cours) if (co.non_archive && !se.cours.some(x => x.id === co.id || x.titre === co.titre)) se.cours.push(co);
    }
    const n = id => parseInt(String(id).replace(/\D/g, ''), 10) || 0;
    S.etapes.sort((a, b) => n(a.id) - n(b.id));
  }

  /* ---------- « précédent » du navigateur : chaque vue retrouve sa position (sessionStorage, par adresse) ---------- */
  const CLE_POS = 'aec.positions';
  const positions = (() => { try { return JSON.parse(sessionStorage.getItem(CLE_POS) || '{}'); } catch (e) { return {}; } })();
  function sauverPosition(url) {
    const h = (url && url.includes('#') ? url.slice(url.indexOf('#')) : '') || '#';
    positions[h] = Math.round(scrollY);
    try { sessionStorage.setItem(CLE_POS, JSON.stringify(positions)); } catch (e) {}
  }
  addEventListener('pagehide', () => sauverPosition(location.href));
  const retablir = () => scrollTo(0, positions[location.hash || '#'] || 0);

  const trouver = (e, c, m) => {
    const et = S.etapes.find(x => x.id === e), co = et && et.cours.find(x => x.id === c), mo = co && co.modules.find(x => x.id === m);
    return { et, co, mo };
  };
  const nbLecons = mo => (mo.lecons || []).length;
  const symbole = mo => ({ exam: '📝', labo: '🧪', gen: 'ℹ️' }[mo.id] || '📎');
  const pastille = mo => { const t = String(mo.num || '').replace(/\s*à\s*/, '–'); return `<span class="num${t.length > 3 ? ' long' : ''}" aria-hidden="true">${esc(t || symbole(mo))}</span>`; };
  const duree = mo => mo.duree ? esc(mo.duree) + ' · ' : '';
  const nomModule = mo => mo.num ? 'Module ' + mo.num : mo.titre;
  const archives = et => et.cours.filter(x => !x.non_archive);
  const lecTotal = co => co.modules.reduce((t, mo) => t + nbLecons(mo), 0);

  /* ---------- aiguillage : l'accueil (les étapes), ou une étape avec sa barre latérale ---------- */
  function afficher() {
    const [e, c, m, l] = decodeURIComponent(location.hash.slice(1)).split('/');
    const et = e && S.etapes.find(x => x.id === e);
    fermerTiroir();
    if (!et) { accueil(); return retablir(); }
    try { localStorage.setItem(CLE_DERNIER, location.hash.slice(1)); } catch (x) {}
    cadre(et, c, m, l);
    const { co, mo } = trouver(e, c, m);
    if (co && mo && l) return lecon(et, co, mo, l);
    if (co && mo) { module(et, co, mo); return retablir(); }
    if (co && !co.non_archive) { coursVue(et, co); return retablir(); }
    etapeVue(et); retablir();
  }

  /* ---------- accueil : une carte par étape ---------- */
  function accueil() {
    document.title = 'Outils de Frank — Documentation AEC Avionique';
    document.body.classList.remove('avec-barre');
    const etapes = Array.from({ length: Math.max(NB_ETAPES, S.etapes.length) }, (_, k) => S.etapes[k] || null);
    let dernier = ''; try { dernier = localStorage.getItem(CLE_DERNIER) || ''; } catch (x) {}
    const [de, dc, dm] = dernier.split('/'), d = trouver(de, dc, dm);
    vue.innerHTML = `
      <div class="tete"><span class="em" aria-hidden="true">📚</span><div><h1>Documentation AEC Avionique</h1>
        <p>Mes cours de l'AEC en avionique — École nationale d'aérotechnique, Cégep Édouard-Montpetit</p></div></div>
      ${d.et ? `<a class="reprendre" href="#${esc(dernier)}"><span aria-hidden="true">↻</span> Reprendre : ${esc(d.et.titre)}${d.co ? ' · Cours ' + (d.et.cours.indexOf(d.co) + 1) : ''}${d.mo ? ' · ' + esc(nomModule(d.mo)) : ''}</a>` : ''}
      <div class="etapes-grille">${etapes.map((et, k) => et ? `
        <a class="etape-carte" href="#${et.id}">
          <span class="etape-num" aria-hidden="true">${k + 1}</span>
          <span class="etape-corps"><b>${esc(et.titre)}</b>
            ${et.cours.map((co, i) => `<span class="etape-cours${co.non_archive ? ' avenir' : ''}"><i aria-hidden="true">${esc(co.em || '📘')}</i>${esc(co.titre)}${co.non_archive ? ' <em>(non archivé)</em>' : ''}</span>`).join('')}
            <small>${archives(et).length} cours · ${archives(et).reduce((t, co) => t + co.modules.length, 0)} modules${avecContenu && !et.squelette ? ' · ' + archives(et).reduce((t, co) => t + lecTotal(co), 0) + ' leçons' : ''}</small></span>
          <span class="fl" aria-hidden="true">›</span></a>`
        : `<span class="etape-carte avenir"><span class="etape-num" aria-hidden="true">${k + 1}</span><span class="etape-corps"><b>Étape ${k + 1}</b><small>à venir</small></span></span>`).join('')}</div>`;
  }

  /* ---------- étape : barre latérale (cours, modules, leçons du module ouvert) + zone principale ---------- */
  /* ---------- plis de la barre : tout est déplié par défaut ; ce qu'on replie reste replié (localStorage) ---------- */
  const CLE_PLIS = 'aec.plies';
  const plies = new Set((() => { try { return JSON.parse(localStorage.getItem(CLE_PLIS) || '[]'); } catch (e) { return []; } })());
  const garderPlis = () => { try { localStorage.setItem(CLE_PLIS, JSON.stringify([...plies])); } catch (e) {} };
  const plie = cle => plies.has(cle);
  const pli = (cle, quoi) => `<button class="pli" type="button" data-pli="${esc(cle)}" aria-expanded="${!plie(cle)}" aria-label="Replier ou déplier ${quoi}"><span aria-hidden="true">▾</span></button>`;
  function basculerPli(b) {
    const cle = b.dataset.pli, el = b.closest('.b-bloc, li'), ferme = !el.classList.contains('plie');
    el.classList.toggle('plie', ferme); b.setAttribute('aria-expanded', !ferme);
    ferme ? plies.add(cle) : plies.delete(cle); garderPlis();
  }

  function cadre(et, c, m, l) {
    document.body.classList.add('avec-barre');
    // la page ouverte reste visible : son cours et son module sont dépliés
    let change = false;
    for (const cle of [c && `${et.id}/${c}`, c && m && `${et.id}/${c}/${m}`]) if (cle && plies.delete(cle)) change = true;
    if (change) garderPlis();
    const etapes = Array.from({ length: Math.max(NB_ETAPES, S.etapes.length) }, (_, k) => S.etapes[k] || null);
    const barre = `
      <a class="b-toutes" href="#">← Toutes les étapes</a>
      <nav class="b-etapes" aria-label="Changer d'étape">${etapes.map((x, k) => x
        ? `<a href="#${x.id}" class="${x === et ? 'actif' : ''}" title="${esc(x.titre)}"${x === et ? ' aria-current="page"' : ''}>${k + 1}</a>`
        : `<span class="avenir" title="Pas encore archivée">${k + 1}</span>`).join('')}</nav>
      <div class="b-tete"><a class="b-titre${!c ? ' ici' : ''}" href="#${et.id}">${esc(et.titre)}</a>
        <span class="b-tout"><button type="button" data-tout="replier" title="Tout replier">⊟</button><button type="button" data-tout="deplier" title="Tout déplier">⊞</button></span></div>
      ${et.cours.map((co, i) => co.non_archive
        ? `<div class="b-cours avenir" title="Ce cours n'était plus accessible sur Brio : il n'est pas dans l'archive"><span class="em" aria-hidden="true">${esc(co.em || '📘')}</span><span><small>Cours ${i + 1} · non archivé</small><b>${esc(co.titre)}</b></span></div>`
        : `<div class="b-bloc${co.id === c ? ' ouvert' : ''}${plie(`${et.id}/${co.id}`) ? ' plie' : ''}" style="${couleur(i)}">
            <div class="b-ligne">${pli(`${et.id}/${co.id}`, 'les modules de ce cours')}
              <a class="b-cours${co.id === c && !m ? ' ici' : ''}" href="#${et.id}/${co.id}"><span class="em" aria-hidden="true">${esc(co.em || '📘')}</span><span><small>Cours ${i + 1}</small><b>${esc(co.titre)}</b></span></a></div>
            <ul class="b-modules">${co.modules.map(mo => {
              const dedans = co.id === c && mo.id === m, lec = mo.lecons || [], docs = mo.docs || [], cle = `${et.id}/${co.id}/${mo.id}`, enfants = lec.length + docs.length;
              return `<li class="${enfants && plie(cle) ? 'plie' : ''}"><div class="b-ligne">${enfants ? pli(cle, 'les leçons de ce module') : '<span class="pli pli-vide"></span>'}
                  <a class="b-mod${dedans && !l ? ' ici' : ''}${dedans ? ' dedans' : ''}" href="#${cle}">
                  <span class="n" aria-hidden="true">${esc(String(mo.num || '').replace(/\s*à\s*/, '–') || symbole(mo))}</span><span>${mo.num ? esc(mo.titre) || 'Module ' + esc(mo.num) : esc(mo.titre)}</span></a></div>
                ${enfants ? `<ol class="b-lecons">${lec.map((x, j) =>
                  `<li><a class="${dedans && x.id === l ? 'ici' : ''}" href="#${cle}/${encodeURIComponent(x.id)}"><span class="n">${j + 1}</span><span>${esc(x.titre)}</span></a></li>`).join('')}
                  ${docs.map(dd => `<li><a ${lienDoc(dd)}><span class="n">${typeDoc(dd.f)[1]}</span><span>${esc(dd.titre)}</span></a></li>`).join('')}</ol>` : ''}</li>`; }).join('')}</ul>
          </div>`).join('')}`;
    const ici = trouver(et.id, c, m);
    const resume = [et.titre, ici.co && `Cours ${et.cours.indexOf(ici.co) + 1}`, ici.mo && nomModule(ici.mo)].filter(Boolean).join(' · ');
    vue.innerHTML = `
      <div class="aec-cadre">
        <aside class="barre-aec" id="barre" aria-label="Plan de l'${esc(et.titre.toLowerCase())}">${barre}</aside>
        <div class="voile" id="voile" hidden></div>
        <div class="principal">
          <div class="haut-aec">
            <button class="tiroir-btn" id="tiroir" type="button" aria-controls="barre" aria-expanded="false"><span aria-hidden="true">☰</span><span>${esc(resume)}</span></button>
            <span id="retour-zone"></span>
          </div>
          <div id="contenu"></div>
        </div>
      </div>`;
    $('#tiroir').onclick = () => ouvrirTiroir(!document.body.classList.contains('tiroir-ouvert'));
    $('#barre').addEventListener('click', ev => {
      const b = ev.target.closest('.pli[data-pli]'); if (b) return basculerPli(b);
      const t = ev.target.closest('[data-tout]'); if (!t) return;
      const fermer = t.dataset.tout === 'replier';
      $('#barre').querySelectorAll('.pli[data-pli]').forEach(p => { const el = p.closest('.b-bloc, li'); if (el.classList.contains('plie') !== fermer) basculerPli(p); });
    });
    $('#voile').onclick = () => ouvrirTiroir(false);
    // l'élément ouvert reste en vue dans la barre
    const sel = vue.querySelector('.b-lecons a.ici, .b-mod.ici, .b-cours.ici');
    if (sel) { const b = $('#barre'); requestAnimationFrame(() => { const r = sel.getBoundingClientRect(), rb = b.getBoundingClientRect(); if (r.bottom > rb.bottom || r.top < rb.top) b.scrollTop += r.top - rb.top - rb.height / 3; }); }
  }
  function ouvrirTiroir(o) {
    document.body.classList.toggle('tiroir-ouvert', o);
    const t = $('#tiroir'), v = $('#voile'); if (t) t.setAttribute('aria-expanded', o); if (v) v.hidden = !o;
  }
  function fermerTiroir() { document.body.classList.remove('tiroir-ouvert'); }
  addEventListener('keydown', ev => { if (ev.key === 'Escape') fermerTiroir(); });
  const retour = (t, h, sous) => { $('#retour-zone').innerHTML = `<a class="retour-aec" href="${h}"><span class="fleche" aria-hidden="true">←</span><span><small>${esc(sous)}</small><b>${esc(t)}</b></span></a>`; };

  const cartesModules = (et, co) => `<div class="cartes">${co.modules.map(mo => { const k = nbLecons(mo), d = (mo.docs || []).length;
    return `<a class="carte" href="#${et.id}/${co.id}/${mo.id}">
      ${pastille(mo)}
      <span><b>${mo.num ? 'Module ' + esc(mo.num) : esc(mo.titre)}</b><small>${mo.num ? esc(mo.titre) : (mo.id === 'doc' ? 'Documents du cours' : '')}</small>
        <span class="compte">${duree(mo)}${k ? `${k} leçon${k > 1 ? 's' : ''}` : ''}${k && d ? ' · ' : ''}${d ? `${d} document${d > 1 ? 's' : ''}` : ''}${!k && !d ? (avecContenu && !et.squelette ? 'vide' : 'contenu à venir') : ''}</span></span>
      <span class="fl" aria-hidden="true">›</span></a>`; }).join('')}</div>`;
  const blocCours = (et, co) => { const i = et.cours.indexOf(co), n = lecTotal(co);
    return `<section class="cours-bloc" style="${couleur(i)}">
      <header><a class="em" href="#${et.id}/${co.id}" aria-hidden="true" tabindex="-1">${esc(co.em || '📘')}</a>
        <div><h3><a href="#${et.id}/${co.id}">Cours ${i + 1} — ${esc(co.titre)}</a></h3>
        <small>${co.modules.length} modules${avecContenu && !et.squelette ? ` · ${n} leçon${n > 1 ? 's' : ''}` : ''}</small></div></header>
      ${cartesModules(et, co)}</section>`; };

  /* ---------- vue d'une étape : ses cours ---------- */
  function etapeVue(et) {
    document.title = `Outils de Frank — Documentation AEC Avionique · ${et.titre}`;
    $('#contenu').innerHTML = `<div class="tete"><span class="em" aria-hidden="true">📚</span><div><h1>${esc(et.titre)}</h1><p>${archives(et).length} cours · choisis un cours ou un module dans la barre ou ci-dessous</p></div></div>`
      + archives(et).map(co => blocCours(et, co)).join('');
  }
  /* ---------- vue d'un cours : ses modules ---------- */
  function coursVue(et, co) {
    document.title = `Outils de Frank — ${co.titre}`;
    $('#contenu').innerHTML = blocCours(et, co);
  }

  /* ---------- un module : la liste de ses leçons et documents ---------- */
  function module(et, co, mo) {
    const ic = et.cours.indexOf(co), e = et.id, c = co.id, m = mo.id;
    document.title = `Outils de Frank — ${nomModule(mo)} · ${co.titre}`;
    retour(co.titre, `#${e}/${c}`, `${et.titre} · Cours ${ic + 1} · tous les modules`);
    const lec = mo.lecons || [], docs = mo.docs || [];
    $('#contenu').innerHTML = `
      <div class="tete" style="${couleur(ic)}"><span class="em" aria-hidden="true">${esc(co.em || '📘')}</span>
        <div><h1>${mo.num ? 'Module ' + esc(mo.num) + ' — ' : ''}${esc(mo.titre)}</h1><p>Cours ${ic + 1} — ${esc(co.titre)}${mo.duree ? ' · ' + esc(mo.duree) : ''}</p></div></div>
      ${lec.length ? `<section class="groupe" style="${couleur(ic)}"><header><h2>Leçons</h2><span class="nb">${lec.length}</span></header>
        <div class="cartes">${lec.map((x, k) => `<a class="carte" href="#${e}/${c}/${m}/${encodeURIComponent(x.id)}">
          <span class="num" aria-hidden="true">${k + 1}</span><span><b>${esc(x.titre)}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ''}</span>
          <span class="fl" aria-hidden="true">›</span></a>`).join('')}</div></section>`
        : `<p class="vide-mod">${avecContenu && !et.squelette ? 'Aucune leçon dans ce module.' : 'Les leçons de ce module arrivent bientôt : le contenu des cours est en train d’être transféré sur le serveur.'}</p>`}
      ${docs.length ? `<section class="groupe"><header><h2>Documents</h2><span class="nb">${docs.length}</span></header>
        <div class="cartes">${docs.map(d => { const [t, ic2] = typeDoc(d.f); return `<a class="carte" ${lienDoc(d)}><span class="num" aria-hidden="true">${ic2}</span>
          <span><b>${esc(d.titre)}</b><small>${esc(t)}${ext(d.f) === 'pdf' ? '' : ' · téléchargement'}</small></span><span class="fl" aria-hidden="true">${ext(d.f) === 'pdf' ? '↗' : '↓'}</span></a>`; }).join('')}</div></section>` : ''}`;
  }

  /* ---------- une leçon ---------- */
  async function lecon(et, co, mo, l) {
    const lec = mo.lecons || [], k = lec.findIndex(x => x.id === l), e = et.id, c = co.id, m = mo.id;
    if (k < 0) { location.hash = `${e}/${c}/${m}`; return; }
    const x = lec[k], ic = et.cours.indexOf(co), base = `#${e}/${c}/${m}/`;
    document.title = `Outils de Frank — ${x.titre}`;
    retour((mo.num ? 'Module ' + mo.num + ' — ' : '') + mo.titre, `#${e}/${c}/${m}`, 'Toutes les leçons du module');
    $('#contenu').innerHTML = `
      <div class="lecon-zone" style="${couleur(ic)}">
        <article class="md" id="texte"><p class="chargement">Chargement de la leçon…</p></article>
        <nav class="nav-lecons">${k > 0 ? `<a href="${base}${encodeURIComponent(lec[k - 1].id)}"><small>← Précédente</small>${esc(lec[k - 1].titre)}</a>` : ''}
          ${k + 1 < lec.length ? `<a class="suiv" href="${base}${encodeURIComponent(lec[k + 1].id)}"><small>Suivante →</small>${esc(lec[k + 1].titre)}</a>` : ''}</nav>
      </div>`;
    retablir();
    const art = $('#texte');
    try {
      const r = await fetch(API(x.f), { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      art.innerHTML = rendre(await r.text(), x.f);
      art.addEventListener('click', lecteurYouTube);
      retablir();
    } catch (err) { art.innerHTML = `<p class="vide-mod">Leçon introuvable : ${esc(err.message || err)}</p>`; retablir(); }
  }

  /* ---------- vidéo YouTube : au clic sur la vignette, le lecteur remplace la vignette, dans la page ---------- */
  // referrerpolicy : YouTube refuse le lecteur intégré (« Error 153 ») sans l'origine de la page ; la règle « same-origin »
  // d'api/page.php (contrôle des pages) la retirerait, l'attribut du cadre l'emporte
  function lecteurYouTube(ev) {
    const b = ev.target.closest('a.yt[data-yt]');
    if (!b || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;   // Ctrl/⌘-clic : nouvel onglet, comme un lien
    ev.preventDefault();
    const f = document.createElement('div'); f.className = 'yt yt-joue';
    f.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(b.title.replace(/^Lire la vidéo( : )?/, '') || 'Vidéo YouTube')}"></iframe>`;
    b.replaceWith(f);
  }

  /* ---------- Markdown → HTML ---------- */
  function rendre(md, fichier) {
    const dossier = fichier.split('/').slice(0, -1).join('/');
    // l'adresse d'origine, en tête de chaque leçon, va en petit à la fin
    let source = '';
    // en-tête des leçons : lignes « > Source : … » et « > Module : … » (ou sans « > », ou en commentaire), avant le texte
    const lignes = md.replace(/^﻿/, '').split('\n');
    while (lignes.length) {
      const l = lignes[0].trim(), m = l.match(/^(?:>\s*|<!--\s*)?(source|url|module)\s*:\s*(.*?)\s*(?:-->)?$/i);
      if (l === '' || l === '>') { lignes.shift(); continue; }
      if (!m) break;
      if (m[1].toLowerCase() !== 'module') { const lien = m[2].match(/\]\((\S+?)\)/) || m[2].match(/<?(https?:\/\/[^\s>]+)>?/); if (lien) source = lien[1]; }
      lignes.shift();
    }
    md = lignes.join('\n');
    // formules (KaTeX) mises de côté avant Markdown, qui abîmerait les _ et les *
    const maths = [];
    const garde = (tex, bloc) => { maths.push([tex, bloc]); return `KTXMATH${maths.length - 1}KTX`; };
    md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => garde(t, true)).replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => garde(t, true))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => garde(t, false)).replace(/(^|[^\\$\w])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\w$])/g, (_, a, t) => a + garde(t, false));
    let html = DOMPurify.sanitize(marked.parse(md, { gfm: true }), { ADD_ATTR: ['target', 'controls', 'preload', 'poster'] });
    html = html.replace(/KTXMATH(\d+)KTX/g, (_, n) => {
      const [tex, bloc] = maths[+n];
      try { return katex.renderToString(tex, { displayMode: bloc, throwOnError: false, output: 'html' }); } catch (e) { return esc(tex); }
    });
    const t = document.createElement('div'); t.innerHTML = html;
    const local = u => u && !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(u);
    const chemin = u => { const p = []; for (const s of (dossier + '/' + decodeURI(u.split('#')[0])).split('/')) { if (s === '..') p.pop(); else if (s && s !== '.') p.push(s); } return API(p.join('/')); };
    t.querySelectorAll('img[src]').forEach(i => {
      const s = i.getAttribute('src'); if (local(s)) i.src = chemin(s);
      i.loading = 'lazy';
      if (/\.(mp4|webm)(\?|$)/i.test(s)) { const v = document.createElement('video'); v.controls = true; v.preload = 'metadata'; v.src = i.src; i.replaceWith(v); }
    });
    // balises <video controls src="fichiers/videos/…mp4"> (ou <source>) laissées dans le Markdown
    const videos = new Set();
    t.querySelectorAll('video[src], video source[src]').forEach(v => {
      const s = v.getAttribute('src'); if (local(s)) v.src = chemin(s);
      videos.add(v.src);
      const lec = v.closest('video'); lec.controls = true; lec.preload = 'metadata'; lec.setAttribute('playsinline', '');
    });
    t.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href');
      if (local(h)) a.href = chemin(h);
      const yt = h.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
      const seul = a.parentElement && a.parentElement.tagName === 'P' && a.parentElement.textContent.trim() === a.textContent.trim();
      if (/\.(mp4|webm)(\?|$)/i.test(h) && videos.has(a.href)) {   // « Ouvrir la vidéo » sous un lecteur : simple lien, dans un nouvel onglet
        a.target = '_blank'; a.rel = 'noopener'; a.classList.add('ouvrir');
      } else if (/\.(mp4|webm)(\?|$)/i.test(h) && seul) {
        const v = document.createElement('video'); v.controls = true; v.preload = 'metadata'; v.src = a.href; a.parentElement.replaceWith(v);
      } else if (yt && seul) {
        // vidéo YouTube intégrée à sa place : la vignette, puis le lecteur dans la page au clic (voir lecteurYouTube) ;
        // titre pris dans la ligne « **🎬 Titre** » juste au-dessus, quand il y en a une
        const p = a.parentElement, avant = p.previousElementSibling;
        let titre = /^https?:/.test(a.textContent.trim()) ? '' : a.textContent.trim(), legende = !!titre;   // texte du lien : légende dans la vignette
        if (!titre && avant && avant.tagName === 'P' && /^\s*🎬/.test(avant.textContent)) titre = avant.textContent.replace(/^\s*🎬\s*/, '').trim();   // déjà affiché au-dessus
        const bloc = document.createElement('div'); bloc.className = 'yt-bloc';
        bloc.innerHTML = `<a class="yt" href="${esc(h)}" data-yt="${yt[1]}" target="_blank" rel="noopener" title="Lire la vidéo${titre ? ' : ' + esc(titre) : ''}"
            style="background-image:url('https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg')"><span class="jouer" aria-hidden="true">▶</span>${legende ? `<span class="lib">${esc(titre)}</span>` : ''}</a>
          <a class="ouvrir" href="${esc(h)}" target="_blank" rel="noopener">Ouvrir sur YouTube ↗</a>`;
        p.replaceWith(bloc);
      } else {
        if (/\.pdf(\?|#|$)/i.test(h)) a.classList.add('pdf');
        else if (/\.(docx?|pptx?|xlsx?|ms1[34]|zip)(\?|#|$)/i.test(h)) { a.classList.add('fichier'); a.setAttribute('download', ''); }
        if (!h.startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; }
      }
    });
    // question dans une vidéo (« #### ⏱ 3:19 ») : petite pastille de minutage
    t.querySelectorAll('h4, h5').forEach(h => { if (/^\s*⏱/.test(h.textContent)) h.classList.add('minute'); });
    t.querySelectorAll('table').forEach(tb => { const d = document.createElement('div'); d.className = 'tableau'; tb.replaceWith(d); d.appendChild(tb); });
    return t.innerHTML + (source ? `<p class="source">Source : <a href="${esc(source)}" target="_blank" rel="noopener">${esc(source)}</a></p>` : '');
  }

  charger();
})();
