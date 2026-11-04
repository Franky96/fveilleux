/* Animations d'arrivée des pages Intentions de vote et En direct (4 novembre 2026, demande de l'utilisateur, animations 7 et 8) :
   - 7 : les chiffres clés comptent de 0 jusqu'à leur valeur (accueil, titres des sièges, rangées de vote, candidats, partis) ;
   - 8 : les barres (sièges, jauges, candidats, duels) se remplissent de gauche à droite, et les sièges de l'hémicycle se colorent
     un à un, de gauche à droite.
   Chargé par le gabarit (pages.src.html), avant les modules : il repère les éléments à mesure qu'ils sont affichés (MutationObserver),
   seulement pendant les premières secondes après l'ouverture de la page (pas à chaque mise à jour des résultats en direct).
   Rien en mouvement réduit. */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return;
  const DUREE_FENETRE = 5000; let t0 = performance.now();   // repart quand la page devient visible (fin du chargement)
  const CHIFFRES = '.ac-chiffre, .ac-sous-chiffre, .vi-num b, .vf-cand-v, .lv-parti > b, #viSiegesTitre, #lvSiegesTitre';
  const BARRES = '.ac-barre, .lv-barre, .vi-jauge, .vf-cand-barre, .vu-duel-barre';
  const PLANS = 'svg.vi-plan';
  const faits = new WeakSet();
  const actif = () => performance.now() - t0 < DUREE_FENETRE;
  let rang = 0;   // ordre d'apparition : petit décalage d'une barre à l'autre

  /* départ quand l'affichage est fluide : à l'apparition de la page, le navigateur dessine encore la carte et les graphiques ;
     une animation lancée tout de suite avance sans que l'écran suive, et on en rate le début (demande de l'utilisateur).
     On attend 4 images de suite rapprochées (moins de 34 ms), au plus 4 s. */
  const fileFluide = []; let surveille = false;
  function quandFluide(f) {
    fileFluide.push(f); if (surveille) return; surveille = true;
    let avant = performance.now(), bonnes = 0; const limite = avant + 4000;
    const image = now => {
      bonnes = now - avant < 34 ? bonnes + 1 : 0; avant = now;
      if (bonnes >= 4 || now > limite) { surveille = false; fileFluide.splice(0).forEach(g => g()); return; }
      requestAnimationFrame(image);
    };
    requestAnimationFrame(image);
  }

  /* ---------- 7 : chiffres qui comptent ---------- */
  const NB = /\d{1,3}(?:[   ]\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  function compter(el) {
    if (faits.has(el)) return; faits.add(el);
    const noeuds = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (/\d/.test(w.currentNode.data)) noeuds.push(w.currentNode);
    if (!noeuds.length) return;
    const modeles = noeuds.map(n => {
      const morceaux = []; let i = 0, m; const s = n.data; NB.lastIndex = 0;
      while ((m = NB.exec(s))) {
        const brut = m[0], dec = (brut.split(',')[1] || '').length, val = parseFloat(brut.replace(/[   ]/g, '').replace(',', '.'));
        morceaux.push(s.slice(i, m.index), { val, dec, sep: /[   ]/.test(brut) });
        i = m.index + brut.length;
      }
      morceaux.push(s.slice(i));
      return { n, morceaux, fin: s };
    });
    const D = 900; let debut = 0;
    const fmt = (x, o) => { const t = x.toFixed(o.dec).replace('.', ','); return o.sep ? t.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : t; };
    const pas = now => {
      const k = Math.max(0, Math.min(1, (now - debut) / D)), e = 1 - Math.pow(1 - k, 3);   // (l'heure de l'image peut précéder le départ)
      for (const md of modeles) {
        if (!md.n.isConnected || md.n.data !== md.ecrit && md.ecrit !== undefined) continue;   // le module a réécrit le texte : on le laisse
        md.ecrit = k < 1 ? md.morceaux.map(x => typeof x === 'string' ? x : fmt(x.val * e, x)).join('') : md.fin;
        md.n.data = md.ecrit;
      }
      if (k < 1) requestAnimationFrame(pas);
    };
    for (const md of modeles) { md.ecrit = md.morceaux.map(x => typeof x === 'string' ? x : fmt(0, x)).join(''); md.n.data = md.ecrit; }   // à 0 en attendant
    quandFluide(() => { debut = performance.now(); requestAnimationFrame(pas); });
  }

  /* ---------- 8 : barres qui se remplissent ---------- */
  function remplir(el) {
    if (faits.has(el)) return; faits.add(el);
    const d = Math.min(rang++, 12) * 45;
    const an = el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 900, delay: 150 + d, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
    an.pause(); quandFluide(() => an.play());   // vide en attendant
  }

  /* ---------- 8 : hémicycle qui se remplit parti par parti, en même temps que son nombre de sièges (légende) monte ----------
     (demande de l'utilisateur) : un parti après l'autre, dans l'ordre de la légende ; à vitesse constante (un parti de 247 sièges
     prend plus de temps qu'un de 2) ; le chiffre de la légende correspond aux sièges déjà colorés. Sièges et légende sont
     rapprochés par leur couleur calculée. */
  const enAttente = new WeakSet();
  const couleur = (el, prop) => getComputedStyle(el)[prop];
  function colorer(svg) {
    if (faits.has(svg) || enAttente.has(svg)) return;
    // tout de suite si le plan est déjà rempli (sinon il s'afficherait plein une image) ; sinon on réessaie à l'image suivante
    const essai = () => {
      const sieges = [...svg.querySelectorAll('rect, circle')].map(e => { let b; try { b = e.getBBox(); } catch (x) { return null; } return b && b.width <= 24 && b.height <= 24 && b.width > 0 ? { e, x: b.x, y: b.y, cs: [couleur(e, 'fill'), couleur(e, 'stroke')] } : null; }).filter(Boolean);
      if (sieges.length < 20) return false;
      faits.add(svg);
      const bloc = svg.closest('section, .lv-sieges, div') || svg.parentElement, leg = bloc && bloc.querySelector('.vf-legende');
      const entrees = leg ? [...leg.querySelectorAll(':scope > span')].map(sp => { const i = sp.querySelector('i'), b = sp.querySelector('b'); return i && b ? { c: couleur(i, 'backgroundColor'), b, n: parseInt(b.textContent.replace(/\D/g, ''), 10) || 0 } : null; }).filter(Boolean) : [];
      // groupes : un par entrée de la légende (dans son ordre), puis les sièges d'une autre couleur
      const groupes = entrees.map(en => ({ en, s: [] })), autres = { en: null, s: [] };
      // siège plein (couleur de remplissage) ou seulement contourné, comme les élus de liste en Allemagne (couleur du contour)
      for (const st of sieges) (groupes.find(g => g.en.c === st.cs[0]) || groupes.find(g => g.en.c === st.cs[1]) || autres).s.push(st);
      if (autres.s.length) groupes.push(autres);
      const N = sieges.length, D = Math.min(2200, 900 + N * 2.4), T0 = 150;
      let k = 0; const anims = [];   // créées en pause (sièges pâles), lancées quand l'affichage est fluide
      for (const g of groupes) {
        g.s.sort((a, b) => a.x - b.x || a.y - b.y);
        g.debut = T0 + D * k / N;
        for (const st of g.s) { const an = st.e.animate([{ opacity: 0.08 }, { opacity: 1 }], { duration: 160, delay: T0 + D * (k++) / N, easing: 'ease-out', fill: 'backwards' }); an.pause(); anims.push(an); }
        g.fin = T0 + D * k / N;
      }
      // chiffres de la légende : de 0 au total, au rythme des sièges de leur parti
      const avecChiffre = groupes.filter(g => g.en && g.en.n);
      for (const g of avecChiffre) g.en.b.textContent = '0';
      let depart = 0;
      const pas = now => {
        const t = now - depart; let encore = false;
        for (const g of avecChiffre) {
          const f = Math.max(0, Math.min(1, (t - g.debut) / Math.max(1, g.fin - g.debut)));
          if (g.en.b.isConnected) g.en.b.textContent = String(Math.round(g.en.n * f));
          if (f < 1) encore = true;
        }
        if (encore) requestAnimationFrame(pas);
      };
      quandFluide(() => { anims.forEach(an => an.play()); depart = performance.now(); if (avecChiffre.length) requestAnimationFrame(pas); });
      return true;
    };
    if (!essai()) { enAttente.add(svg); requestAnimationFrame(() => { enAttente.delete(svg); essai(); }); }
  }

  /* ---------- 9 : courbes qui se dessinent (graphique d'évolution, #viEvol) ----------
     Les lignes de tendance se tracent de gauche à droite ; les points des sondages et les repères d'élection apparaissent quand la
     ligne passe sur eux ; les étiquettes de fin arrivent à la fin. À l'ouverture et au changement de période seulement (pas au zoom
     vertical à la molette, ni à « Moyenne lissée », qui redessinent aussi le graphique). */
  let tracerJusqua = 0;   // un nouveau dessin du graphique est animé s'il arrive avant cet instant
  const D_COURBE = 1300;
  function tracer(svg) {
    if (faits.has(svg) || performance.now() > tracerJusqua) return; faits.add(svg); tracerJusqua = Math.min(tracerJusqua, performance.now() + 600);   // un nouveau dessin juste après (page qui se redimensionne) est animé aussi ; ensuite (zoom, lissage), non
    const lignes = [...svg.querySelectorAll('path.vi-ligne')];
    if (!lignes.length) return;
    let x0 = Infinity, x1 = -Infinity;
    for (const l of lignes) { try { const b = l.getBBox(); x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.width); } catch (e) {} }
    if (!isFinite(x0) || x1 <= x0) return;
    const anims = [];
    for (const l of lignes) {
      let L = 0; try { L = l.getTotalLength(); } catch (e) {}
      if (!L) continue;
      const b = l.getBBox(), d0 = D_COURBE * (b.x - x0) / (x1 - x0), d = D_COURBE * b.width / (x1 - x0);   // même vitesse horizontale pour toutes
      anims.push(l.animate([{ strokeDasharray: `${L} ${L}`, strokeDashoffset: L }, { strokeDasharray: `${L} ${L}`, strokeDashoffset: 0 }], { duration: Math.max(60, d), delay: d0, easing: 'linear', fill: 'both' }));
    }
    for (const pt of svg.querySelectorAll('.vi-pt, .vi-elec-pt')) {
      let x; try { const b = pt.getBBox(); x = b.x + b.width / 2; } catch (e) { continue; }
      anims.push(pt.animate([{ opacity: 0 }, { opacity: getComputedStyle(pt).opacity }], { duration: 220, delay: Math.max(0, D_COURBE * (x - x0) / (x1 - x0)), easing: 'ease-out', fill: 'backwards' }));
    }
    for (const t of svg.querySelectorAll('.vi-fin')) anims.push(t.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 350, delay: D_COURBE, easing: 'ease-out', fill: 'backwards' }));
    anims.forEach(an => an.pause());
    quandFluide(() => anims.forEach(an => an.play()));
    // une fois tracées, les lignes reprennent leur style normal (pas de pointillé résiduel)
    Promise.all(anims.map(an => an.finished)).then(() => anims.forEach(an => an.cancel())).catch(() => {});
  }
  // changement de période : le prochain dessin est animé
  document.addEventListener('click', e => { if (e.target.closest('#viPeriodes button')) tracerJusqua = performance.now() + 1500; }, true);

  function examiner(racine) {
    if (!racine) return;
    { const el = racine.nodeType === 3 ? racine.parentElement : racine;   // 9 : graphique d'évolution (ouverture ou changement de période)
      if (el && el.nodeType === 1) { const sv = el.matches('#viEvol svg') ? el : el.querySelector('#viEvol svg') || el.closest('#viEvol svg'); if (sv && !sv.closest('[aria-busy="true"]')) tracer(sv); } }
    if (!actif()) return;
    const el = racine.nodeType === 3 ? racine.parentElement : racine;
    if (!el || el.nodeType !== 1) return;
    // encore cachée par « Chargement… » (aria-busy, France et autres pages qui attendent leurs données) : on attend qu'elle s'affiche,
    // sinon les compteurs ont fini avant qu'on les voie (demande de l'utilisateur)
    const cache = x => !!x.closest('[aria-busy="true"]');
    const avec = (sel, f) => { const g = x => { if (!cache(x)) f(x); }; if (el.matches(sel)) g(el); el.querySelectorAll(sel).forEach(g); const p = el.closest(sel); if (p && p !== el) g(p); };
    avec(CHIFFRES, compter);
    avec(BARRES, remplir);
    avec(PLANS, colorer);
  }

  const obs = new MutationObserver(liste => {
    for (const m of liste) if (m.type === 'attributes' && m.target.getAttribute('aria-busy') !== 'true') { t0 = performance.now(); tracerJusqua = t0 + 1500; examiner(m.target); }   // la page s'affiche : la fenêtre repart
    if (!actif()) { for (const m of liste) m.addedNodes.forEach(n => { if (performance.now() < tracerJusqua) examiner(n); }); return; }   // après la fenêtre : seulement le graphique, au changement de période
    for (const m of liste) {
      if (m.type === 'attributes') continue;
      if (m.type === 'characterData') { examiner(m.target); continue; }
      m.addedNodes.forEach(examiner);
      if (m.type === 'childList' && m.target.nodeType === 1 && m.target.matches(CHIFFRES)) { faits.delete(m.target); examiner(m.target); }
    }
  });
  const go = () => {
    tracerJusqua = performance.now() + DUREE_FENETRE;
    examiner(document.body);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
