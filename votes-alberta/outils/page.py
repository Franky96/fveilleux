"""Votes Alberta : page votes-alberta.html, faite à partir de la page Votes Québec (même cadre).

Appelée par votes-quebec/outils/pages.py (crochet de fin) : construire(html_de_votes_quebec, FICHIER) → html de votes-alberta.html.
Ne pas modifier votes-alberta.html à la main : modifier ce fichier puis relancer pages.py --bascule.
Plan de l'Assemblée législative (87 sièges, de type Westminster, comme Votes Canada), carte des 87 circonscriptions,
sondages provinciaux, projection du site (outils/sondages_ab.py).
"""
import re

# styles propres à la page (classe « vab » sur la section) : couleurs des partis, avec une variante pour le thème sombre
STYLE = """  <style>
    /* Votes Alberta (votes-alberta/outils/page.py) : couleurs des partis */
    .vab { --ucp:#1F5FB4; --npd:#F28A1D; --pt:#1E9E95; --lib:#D7262E; --vert:#3D9B35; --rpa:#6F45A8; }
    :root[data-theme="dark"] .vab { --ucp:#5B8FE0; --npd:#FF9F45; --pt:#33C2B8; --lib:#FF5A5F; --vert:#5CC453; --rpa:#A47CDB; }
    @media (min-width: 1000px) { .vab .vi-haut { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); } }
    .vab .vi-plan.vc-plan { max-width: none; }
    .vab .lv-rid { stroke-width: 0.35px; }
    .vab .vi-vrow.vab-cand { grid-template-columns: 3.4em minmax(0, 1fr) 4.4em 6.4em; }
    .vab .vab-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vab .vab-nom small { color: var(--muted); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-left: 4px; }
    .vab .vi-serres li > span small { color: var(--muted); font-size: 0.74rem; }
    .vab .vi-serres b small { font-weight: 500; color: var(--muted); }
    .vab .vi-table td small { color: var(--muted); font-size: 0.7rem; }
    .vab .vi-table td .vi-lien { text-align: left; }
    .vs-methode p { margin: 10px 0 0; font-size: 0.85rem; line-height: 1.5; }
    .vs-methode .vi-dlg-note { margin-top: 12px; }
    #viNote:empty { display: none; }
    @media (max-width: 520px) { .vab .vi-vrow.vab-cand { grid-template-columns: 3em minmax(0, 1fr) 3.9em 5.4em; gap: 6px; } }
  </style>
"""


def construire(html, FICHIER):
    s = re.sub(r'\n    <!-- sous-menu du Québec.*?</div>\n', "\n", html, count=1, flags=re.S)

    def r(a, b):
        nonlocal s
        assert a in s, "Votes Alberta : introuvable dans la page Votes Québec : " + a[:60]
        s = s.replace(a, b)

    r('<h2 id="viTitre">Votes Québec</h2>', '<h2 id="viTitre">Votes Alberta</h2>')
    r("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes Alberta</title>")
    r('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes Alberta · intentions de vote provinciales</span>')
    r(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
    r(f'href="{FICHIER["alberta"]}">', f'href="{FICHIER["alberta"]}" aria-current="page">')
    r('  <script type="module" src="votes-quebec/intentions.js"></script>', '  <script type="module" src="votes-alberta/alberta.js"></script>')
    r('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes vc vab" id="vue-votes"')
    r('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">Alberta · provincial</span>')
    r("Assemblée nationale · 127 sièges · majorité 64", "Assemblée législative · 87 sièges · majorité 44")
    r('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
      '<svg id="viPlan" class="vi-plan vc-plan" role="img" aria-label="Plan de l\'Assemblée législative de l\'Alberta (87 sièges)"></svg>')
    s, n = re.subn(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
                   '<button type="button" data-z="tout">Alberta</button><button type="button" data-z="cal">Calgary</button>'
                   '<button type="button" data-z="edm">Edmonton</button><button type="button" data-z="rd">Red Deer</button>'
                   '<button type="button" data-z="leth">Lethbridge</button>', s, count=1, flags=re.S)
    assert n == 1, "Votes Alberta : boutons de zoom introuvables"
    s, n = re.subn(r'<button type="button" data-per="3".*?Depuis 2022</button>',
                   '<button type="button" data-per="3" aria-pressed="false">3 mois</button><button type="button" data-per="6" aria-pressed="false">6 mois</button>'
                   '<button type="button" data-per="12" aria-pressed="false">1 an</button><button type="button" data-per="24" aria-pressed="false">2 ans</button>'
                   '<button type="button" data-per="0" aria-pressed="true">Depuis 2023</button>', s, count=1, flags=re.S)
    assert n == 1, "Votes Alberta : boutons de période introuvables"
    r('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2023</span>')
    r('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des 87 circonscriptions provinciales de l\'Alberta"')
    r("</head>", STYLE + "</head>")
    assert 'src="votes-quebec/intentions.js"' not in s and '>Grand Montréal<' not in s and 'data-z="cal"' in s
    return s
