/* Animations d'arrivée des pages Intentions de vote et En direct (4 novembre 2026, demande de l'utilisateur, animations 7 et 8) :
   - 7 : les chiffres clés comptent de 0 jusqu'à leur valeur (accueil, titres des sièges, rangées de vote, candidats, partis) ;
   - 8 : les barres (sièges, jauges, candidats, duels) se remplissent de gauche à droite, et les sièges de l'hémicycle se colorent
     un à un, de gauche à droite.
   Chargé par le gabarit (pages.src.html), avant les modules : il repère les éléments à mesure qu'ils sont affichés (MutationObserver),
   seulement pendant les premières secondes après l'ouverture de la page (pas à chaque mise à jour des résultats en direct).
   Rien en mouvement réduit. */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return;
  const DUREE_FENETRE = 5000, t0 = performance.now();
  const CHIFFRES = '.ac-chiffre, .ac-sous-chiffre, .vi-num b, .vf-cand-v, .lv-parti > b, #viSiegesTitre, #lvSiegesTitre';
  const BARRES = '.ac-barre, .lv-barre, .vi-jauge, .vf-cand-barre, .vu-duel-barre';
  const PLANS = 'svg.vi-plan';
  const faits = new WeakSet();
  const actif = () => performance.now() - t0 < DUREE_FENETRE;
  let rang = 0;   // ordre d'apparition : petit décalage d'une barre à l'autre

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
    const D = 900, debut = performance.now();
    const fmt = (x, o) => { const t = x.toFixed(o.dec).replace('.', ','); return o.sep ? t.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : t; };
    const pas = now => {
      const k = Math.min(1, (now - debut) / D), e = 1 - Math.pow(1 - k, 3);
      for (const md of modeles) {
        if (!md.n.isConnected || md.n.data !== md.ecrit && md.ecrit !== undefined) continue;   // le module a réécrit le texte : on le laisse
        md.ecrit = k < 1 ? md.morceaux.map(x => typeof x === 'string' ? x : fmt(x.val * e, x)).join('') : md.fin;
        md.n.data = md.ecrit;
      }
      if (k < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }

  /* ---------- 8 : barres qui se remplissent ---------- */
  function remplir(el) {
    if (faits.has(el)) return; faits.add(el);
    const d = Math.min(rang++, 12) * 45;
    el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 900, delay: 150 + d, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
  }

  /* ---------- 8 : hémicycle qui se colore siège par siège ---------- */
  const enAttente = new WeakSet();
  function colorer(svg) {
    if (faits.has(svg) || enAttente.has(svg)) return; enAttente.add(svg);   // le plan se remplit après coup : on réessaie tant qu'il est vide
    requestAnimationFrame(() => {
      enAttente.delete(svg);
      const sieges = [...svg.querySelectorAll('rect, circle')].map(e => { let b; try { b = e.getBBox(); } catch (x) { return null; } return b && b.width <= 24 && b.height <= 24 && b.width > 0 ? { e, x: b.x, y: b.y } : null; }).filter(Boolean);
      if (sieges.length < 20) return;
      faits.add(svg);
      sieges.sort((a, b) => a.x - b.x || a.y - b.y);
      const N = sieges.length, D = 1100;
      sieges.forEach((s, i) => s.e.animate([{ opacity: 0.08 }, { opacity: 1 }], { duration: 260, delay: 150 + D * i / N, easing: 'ease-out', fill: 'backwards' }));
    });
  }

  function examiner(racine) {
    if (!actif() || !racine) return;
    const el = racine.nodeType === 3 ? racine.parentElement : racine;
    if (!el || el.nodeType !== 1) return;
    const avec = (sel, f) => { if (el.matches(sel)) f(el); el.querySelectorAll(sel).forEach(f); const p = el.closest(sel); if (p && p !== el) f(p); };
    avec(CHIFFRES, compter);
    avec(BARRES, remplir);
    avec(PLANS, colorer);
  }

  const obs = new MutationObserver(liste => {
    if (!actif()) { obs.disconnect(); return; }
    for (const m of liste) {
      if (m.type === 'characterData') { examiner(m.target); continue; }
      m.addedNodes.forEach(examiner);
      if (m.type === 'childList' && m.target.nodeType === 1 && m.target.matches(CHIFFRES)) { faits.delete(m.target); examiner(m.target); }
    }
  });
  const go = () => { examiner(document.body); obs.observe(document.body, { childList: true, subtree: true }); setTimeout(() => obs.disconnect(), DUREE_FENETRE + 200); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
