/* Documentation AEC Avionique : Étape → cours → modules → leçons (archive des cours de Frank, ÉNA / Cégep Édouard-Montpetit).
   Structure : api/cours.php?f=index.json (le contenu est sur le serveur, hors du dépôt) ; sinon le squelette aec-avionique.json (titres seulement).
   Adresses : #e1/c1/m3 (un module), #e1/c1/m3/<leçon> (une leçon). Leçons en Markdown, rendues ici (marked + DOMPurify + KaTeX). */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = f => 'api/cours.php?f=' + encodeURIComponent(f).replace(/%2F/g, '/');
  const vue = $('#vue');
  let S = null, avecContenu = false;

  // leçons ouvertes (✓), par personne, dans ce navigateur
  const CLE_VU = 'aec.vu.' + (sessionStorage.getItem('userId') || '');
  const vus = new Set((() => { try { return JSON.parse(localStorage.getItem(CLE_VU) || '[]'); } catch (e) { return []; } })());
  const marquerVu = id => { vus.add(id); try { localStorage.setItem(CLE_VU, JSON.stringify([...vus])); } catch (e) {} };

  async function charger() {
    try {
      const r = await fetch(API('index.json'), { credentials: 'same-origin', cache: 'no-cache' });
      if (r.ok) { S = await r.json(); avecContenu = true; }
    } catch (e) { /* pas encore de contenu sur le serveur */ }
    if (!S) S = await (await fetch('aec-avionique.json', { cache: 'no-cache' })).json();
    addEventListener('hashchange', afficher);
    afficher();
  }

  const trouver = (e, c, m) => {
    const et = S.etapes.find(x => x.id === e), co = et && et.cours.find(x => x.id === c), mo = co && co.modules.find(x => x.id === m);
    return { et, co, mo };
  };
  const nbLecons = mo => (mo.lecons || []).length;
  const pastille = mo => { const t = String(mo.num || '').replace(/\s*à\s*/, '–'); return `<span class="num${t.length > 3 ? ' long' : ''}" aria-hidden="true">${esc(t || '📎')}</span>`; };
  const duree = mo => mo.duree ? esc(mo.duree) + ' · ' : '';
  const fil = parts => `<nav class="fil" aria-label="Fil d'Ariane">${parts.map((p, k) =>
    (k ? '<span class="sep">›</span>' : '') + (p[1] ? `<a href="${p[1]}">${esc(p[0])}</a>` : `<b>${esc(p[0])}</b>`)).join('')}</nav>`;

  function afficher() {
    const [e, c, m, l] = decodeURIComponent(location.hash.slice(1)).split('/');
    scrollTo(0, 0);
    if (e && c && m && l) return lecon(e, c, m, l);
    if (e && c && m) return module(e, c, m);
    accueil();
  }

  /* ---------- accueil : étapes, cours, modules ---------- */
  function accueil() {
    document.title = 'Outils de Frank — Documentation AEC Avionique';
    vue.innerHTML = `
      <div class="tete"><span class="em" aria-hidden="true">📚</span><div><h1>Documentation AEC Avionique</h1>
        <p>Mes cours de l'AEC en avionique — École nationale d'aérotechnique, Cégep Édouard-Montpetit</p></div></div>
      ${S.etapes.map(et => `
        <section class="etape">
          <h2>${esc(et.titre)} <small>${et.cours.length} cours</small></h2>
          ${et.cours.map((co, i) => `
            <section class="cours-bloc" style="--c:var(${i % 2 ? '--c-pol' : '--c-info'})">
              <header><span class="em" aria-hidden="true">${esc(co.em || '📘')}</span>
                <div><h3>Cours ${i + 1} — ${esc(co.titre)}</h3>
                <small>${co.modules.length} modules${avecContenu ? ' · ' + co.modules.reduce((n, mo) => n + nbLecons(mo), 0) + ' leçons' : ''}</small></div></header>
              <div class="cartes">${co.modules.map(mo => {
                const n = nbLecons(mo), lus = (mo.lecons || []).filter(x => vus.has(`${et.id}/${co.id}/${mo.id}/${x.id}`)).length;
                return `<a class="carte${n && lus === n ? ' vu' : ''}" href="#${et.id}/${co.id}/${mo.id}">
                  ${pastille(mo)}
                  <span><b>${mo.num ? 'Module ' + esc(mo.num) : esc(mo.titre)}</b><small>${mo.num ? esc(mo.titre) : 'Documents du cours'}</small>
                    <span class="compte">${duree(mo)}${n ? `${n} leçon${n > 1 ? 's' : ''}${lus ? ` · ${lus} lue${lus > 1 ? 's' : ''}` : ''}` : (avecContenu ? 'aucune leçon' : 'contenu à venir')}</span></span>
                  <span class="fl" aria-hidden="true">›</span></a>`; }).join('')}</div>
            </section>`).join('')}
        </section>`).join('')}
      <section class="etape avenir"><h2>Étapes suivantes</h2><p>Elles s'ajouteront ici au fil de l'archivage.</p></section>`;
  }

  /* ---------- un module : la liste de ses leçons et documents ---------- */
  function module(e, c, m) {
    const { et, co, mo } = trouver(e, c, m);
    if (!mo) { location.hash = ''; return; }
    const ic = et.cours.indexOf(co);
    document.title = `Outils de Frank — ${mo.num ? 'Module ' + mo.num : mo.titre} · ${co.titre}`;
    const lec = mo.lecons || [], docs = mo.docs || [];
    vue.innerHTML = fil([['Documentation AEC', '#'], [et.titre, '#'], [`Cours ${ic + 1}`, '#'], [mo.num ? 'Module ' + mo.num : mo.titre]]) + `
      <div class="tete" style="--c:var(${ic % 2 ? '--c-pol' : '--c-info'})"><span class="em" aria-hidden="true">${esc(co.em || '📘')}</span>
        <div><h1>${mo.num ? 'Module ' + esc(mo.num) + ' — ' : ''}${esc(mo.titre)}</h1><p>Cours ${ic + 1} — ${esc(co.titre)}${mo.duree ? ' · ' + esc(mo.duree) : ''}</p></div></div>
      ${lec.length ? `<section class="groupe" style="--c:var(${ic % 2 ? '--c-pol' : '--c-info'})"><header><h2>Leçons</h2><span class="nb">${lec.length}</span></header>
        <div class="cartes">${lec.map((x, k) => `<a class="carte${vus.has(`${e}/${c}/${m}/${x.id}`) ? ' vu' : ''}" href="#${e}/${c}/${m}/${encodeURIComponent(x.id)}">
          <span class="num" aria-hidden="true">${k + 1}</span><span><b>${esc(x.titre)}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ''}</span>
          <span class="fl" aria-hidden="true">›</span></a>`).join('')}</div></section>`
        : `<p class="vide-mod">${avecContenu ? 'Aucune leçon dans ce module.' : 'Les leçons de ce module arrivent bientôt : le contenu des cours est en train d’être transféré sur le serveur.'}</p>`}
      ${docs.length ? `<section class="groupe"><header><h2>Documents</h2><span class="nb">${docs.length}</span></header>
        <div class="cartes">${docs.map(d => `<a class="carte" href="${API(d.f)}" target="_blank" rel="noopener"><span class="num" aria-hidden="true">📄</span>
          <span><b>${esc(d.titre)}</b><small>PDF</small></span><span class="fl" aria-hidden="true">↗</span></a>`).join('')}</div></section>` : ''}`;
  }

  /* ---------- une leçon ---------- */
  async function lecon(e, c, m, l) {
    const { et, co, mo } = trouver(e, c, m);
    const lec = mo && (mo.lecons || []), k = lec ? lec.findIndex(x => x.id === l) : -1;
    if (k < 0) { location.hash = `${e}/${c}/${m}`; return; }
    const x = lec[k], ic = et.cours.indexOf(co), base = `#${e}/${c}/${m}/`;
    document.title = `Outils de Frank — ${x.titre}`;
    const sommaire = `<h4>${mo.num ? 'Module ' + esc(mo.num) : esc(mo.titre)}</h4>` + lec.map((y, j) =>
      `<a href="${base}${encodeURIComponent(y.id)}" class="${j === k ? 'ici' : ''}${vus.has(`${e}/${c}/${m}/${y.id}`) ? ' vu' : ''}"><span class="n">${j + 1}</span><span>${esc(y.titre)}</span></a>`).join('')
      + ((mo.docs || []).length ? `<div class="docs">${mo.docs.map(d => `<a href="${API(d.f)}" target="_blank" rel="noopener"><span class="n">📄</span><span>${esc(d.titre)}</span></a>`).join('')}</div>` : '');
    vue.innerHTML = fil([['Documentation AEC', '#'], [`Cours ${ic + 1}`, '#'], [mo.num ? 'Module ' + mo.num : mo.titre, `#${e}/${c}/${m}`], [x.titre]]) + `
      <div class="lecon-zone" style="--c:var(${ic % 2 ? '--c-pol' : '--c-info'})">
        <aside class="sommaire">${sommaire}</aside>
        <div><details class="sommaire-tel"><summary>Leçons du module (${k + 1} / ${lec.length})</summary><div class="sommaire">${sommaire}</div></details>
          <article class="md" id="texte"><p class="chargement">Chargement de la leçon…</p></article>
          <nav class="nav-lecons">${k > 0 ? `<a href="${base}${encodeURIComponent(lec[k - 1].id)}"><small>← Précédente</small>${esc(lec[k - 1].titre)}</a>` : ''}
            ${k + 1 < lec.length ? `<a class="suiv" href="${base}${encodeURIComponent(lec[k + 1].id)}"><small>Suivante →</small>${esc(lec[k + 1].titre)}</a>` : ''}</nav></div>
      </div>`;
    const art = $('#texte');
    try {
      const r = await fetch(API(x.f), { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      art.innerHTML = rendre(await r.text(), x.f);
      marquerVu(`${e}/${c}/${m}/${x.id}`);
    } catch (err) { art.innerHTML = `<p class="vide-mod">Leçon introuvable : ${esc(err.message || err)}</p>`; }
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
      } else if (yt && seul) {   // vidéo YouTube : vignette, le lecteur ne se charge qu'au clic
        const b = document.createElement('a'); b.className = 'yt'; b.href = h; b.target = '_blank'; b.rel = 'noopener';
        b.style.backgroundImage = `url("https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg")`;
        b.innerHTML = `<span class="jouer" aria-hidden="true">▶</span><span class="lib">${esc(/^https?:/.test(a.textContent.trim()) ? 'Vidéo' : a.textContent.trim())}</span>`;
        b.addEventListener('click', ev => { ev.preventDefault(); b.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Vidéo"></iframe>`; });
        a.parentElement.replaceWith(b);
      } else {
        if (/\.pdf(\?|#|$)/i.test(h)) a.classList.add('pdf');
        if (!h.startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; }
      }
    });
    t.querySelectorAll('table').forEach(tb => { const d = document.createElement('div'); d.className = 'tableau'; tb.replaceWith(d); d.appendChild(tb); });
    return t.innerHTML + (source ? `<p class="source">Source : <a href="${esc(source)}" target="_blank" rel="noopener">${esc(source)}</a></p>` : '');
  }

  charger();
})();
