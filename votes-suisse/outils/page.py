"""Votes Suisse : page votes-suisse.html, faite à partir de la page Votes Québec (même cadre).

Appelé par votes-quebec/outils/pages.py (crochet de fin) : construire(html_de_votes_quebec, FICHIER) → html de votes-suisse.html.
Ne pas modifier votes-suisse.html à la main : modifier ce fichier puis relancer pages.py --bascule.
"""
import re

# styles propres à la page (le gabarit commun n'est pas modifié)
STYLE = """  <style>
    /* Votes Suisse (votes-suisse/outils/page.py) */
    .vs .vi-plan.vf-hemi { max-width: none; }
    .vs .lv-rid { stroke-width: 0.7px; }
    .vs .vi-bandes .lv-rid { stroke-width: 2.2px; }   /* mode Sièges en bandes : frontières des cantons épaissies */
    .vs-lac { fill: color-mix(in srgb, #4f8fcf 38%, var(--surface)); stroke: color-mix(in srgb, #4f8fcf 55%, var(--surface)); stroke-width: 0.5px; vector-effect: non-scaling-stroke; pointer-events: none; }
    .vs .vi-vrow { grid-template-columns: 5em minmax(0, 1fr) 4.4em 6.2em; }
    .vs .vi-vrow > b:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .vs .vi-vrow.vs-proj { grid-template-columns: 5em minmax(0, 1fr) 4.2em 6.4em; }
    .vs .vi-vrow.vs-proj .vi-num { white-space: nowrap; }
    .vs .vi-serres b small, .vs .vi-serres li > span small { font-weight: 500; color: var(--muted); }
    .vs .vi-serres b { text-align: right; }
    .vs-methode p { margin: 10px 0 0; font-size: 0.85rem; line-height: 1.5; }
    @media (max-width: 520px) { .vs .vi-vrow, .vs .vi-vrow.vs-proj { grid-template-columns: 4.4em minmax(0, 1fr) 3.9em 5.6em; gap: 6px; } }
  </style>
"""


def construire(html, FICHIER):
    s = re.sub(r'\n    <!-- sous-menu du Québec.*?</div>\n', "\n", html, count=1, flags=re.S)
    s = s.replace('<h2 id="viTitre">Votes Québec</h2>', '<h2 id="viTitre">Votes Suisse</h2>')

    def r(a, b):
        nonlocal s
        assert a in s, "Votes Suisse : introuvable dans la page Votes Québec : " + a[:60]
        s = s.replace(a, b)

    r("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes Suisse</title>")
    r('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes Suisse · Conseil national</span>')
    r(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
    # onglet « Votes Suisse » : page courante (l'onglet peut être absent ou en commentaire dans le gabarit)
    s = s.replace(f'href="{FICHIER["suisse"]}">', f'href="{FICHIER["suisse"]}" aria-current="page">')
    r('  <script type="module" src="votes-quebec/intentions.js"></script>', '  <script type="module" src="votes-suisse/suisse.js"></script>')
    r('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes vs" id="vue-votes"')
    r('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">Suisse · Conseil national</span>')
    r("Assemblée nationale · 127 sièges · majorité 64", "Conseil national · 200 sièges · majorité 101")
    r('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
      '<svg id="viPlan" class="vi-plan vf-hemi" role="img" aria-label="Hémicycle du Conseil national (200 sièges)"></svg>')
    s, n = re.subn(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
                   '<button type="button" data-z="tout">Suisse</button><button type="button" data-z="leman">Arc lémanique</button><button type="button" data-z="be">Berne</button>'
                   '<button type="button" data-z="zh">Zurich</button><button type="button" data-z="bale">Bâle</button><button type="button" data-z="centre">Suisse centrale</button>'
                   '<button type="button" data-z="ti">Tessin</button>', s, flags=re.S)
    assert n == 1, "Votes Suisse : boutons de zoom introuvables"
    s, n = re.subn(r'<button type="button" data-per="3".*?Depuis 2022</button>',
                   '<button type="button" data-per="12" aria-pressed="false">1 an</button><button type="button" data-per="24" aria-pressed="false">2 ans</button>'
                   '<button type="button" data-per="0" aria-pressed="true">Depuis 2023</button>', s, flags=re.S)
    assert n == 1, "Votes Suisse : boutons de période introuvables"
    r('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2023</span>')
    r('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des 26 cantons"')
    r('title="Afficher ou masquer le pourcentage dans chaque circonscription (mode Vote)"', 'title="Afficher ou masquer le pourcentage dans chaque canton (mode Vote)"')
    r("</head>", STYLE + "</head>")
    assert 'src="votes-quebec/intentions.js"' not in s and '>Grand Montréal<' not in s and 'data-z="leman"' in s
    return s
