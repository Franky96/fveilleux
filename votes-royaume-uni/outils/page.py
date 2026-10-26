"""Votes Royaume-Uni : page votes-royaume-uni.html, faite à partir de la page Votes Québec (même cadre).

Appelée par votes-quebec/outils/pages.py (crochet de fin) : construire(html_de_votes_quebec, FICHIER) → html de votes-royaume-uni.html.
Ne pas modifier votes-royaume-uni.html à la main : modifier ce fichier puis relancer pages.py --bascule.
Plan de la Chambre des communes (650 sièges, de type Westminster, comme Votes Canada), carte des 650 circonscriptions de 2024,
sondages nationaux, projection du site (outils/sondages_uk.py).
"""
import re

# styles propres à la page (classe « vuk » sur la section) : couleurs des partis, avec une variante pour le thème sombre
STYLE = """  <style>
    /* Votes Royaume-Uni (votes-royaume-uni/outils/page.py) : couleurs des partis */
    .vuk { --lab:#E4003B; --con:#0A6CC6; --ref:#12A9C4; --ld:#EE8A0C; --vert:#5BA620; --snp:#C8B400; --pc:#0B7A5B; --rb:#2C3E85; --yp:#8B1E5C;
           --sf:#2E7D6B; --dup:#C8553D; --sdlp:#2E9E3F; --all:#E8B800; --uup:#4C9BE8; --tuv:#1B3F73; --spk:#8A8F99; }
    :root[data-theme="dark"] .vuk { --lab:#FF4D6F; --con:#4F9BE8; --ref:#3FC8DE; --ld:#FF9F2E; --vert:#7CC33F; --snp:#F4E04D; --pc:#2FB58F; --rb:#7F92E0; --yp:#D26AA3;
           --sf:#4FB59F; --dup:#E88A72; --sdlp:#56C268; --all:#F5CC33; --uup:#7DB8F2; --tuv:#6E93CC; --spk:#9AA0AB; }
    @media (min-width: 1000px) { .vuk .vi-haut { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); } }
    .vuk .vi-plan.vc-plan { max-width: none; }
    .vuk .lv-rid { stroke-width: 0.3px; }
    .vuk .vi-vrow.vuk-cand { grid-template-columns: 3.8em minmax(0, 1fr) 4.4em 6.4em; }
    .vuk .vuk-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vuk .vuk-nom small { color: var(--muted); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-left: 4px; }
    .vuk .vi-serres li > span small { color: var(--muted); font-size: 0.74rem; }
    .vuk .vi-serres b small { font-weight: 500; color: var(--muted); }
    .vuk .vi-table td small { color: var(--muted); font-size: 0.7rem; }
    .vuk .vi-table td .vi-lien { text-align: left; }
    .vuk .vuk-table th, .vuk .vuk-table td { padding: 4px 3px; }
    .vuk .vuk-table table { font-size: 0.76rem; }
    .vs-methode p { margin: 10px 0 0; font-size: 0.85rem; line-height: 1.5; }
    .vs-methode .vi-dlg-note { margin-top: 12px; }
    #viNote:empty { display: none; }
    @media (max-width: 520px) { .vuk .vi-vrow.vuk-cand { grid-template-columns: 3.2em minmax(0, 1fr) 3.9em 5.4em; gap: 6px; } }
  </style>
"""


def construire(html, FICHIER):
    s = re.sub(r'\n    <!-- sous-menu du Québec.*?</div>\n', "\n", html, count=1, flags=re.S)

    def r(a, b):
        nonlocal s
        assert a in s, "Votes Royaume-Uni : introuvable dans la page Votes Québec : " + a[:60]
        s = s.replace(a, b)

    r('<h2 id="viTitre">Votes Québec</h2>', '<h2 id="viTitre">Votes Royaume-Uni</h2>')
    r("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes Royaume-Uni</title>")
    r('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes Royaume-Uni · intentions de vote pour la Chambre des communes</span>')
    r(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
    r(f'href="{FICHIER["royaumeuni"]}">', f'href="{FICHIER["royaumeuni"]}" aria-current="page">')
    r('  <script type="module" src="votes-quebec/intentions.js"></script>', '  <script type="module" src="votes-royaume-uni/royaume-uni.js"></script>')
    r('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes vc vuk" id="vue-votes"')
    r('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">Royaume-Uni · Chambre des communes</span>')
    r("Assemblée nationale · 127 sièges · majorité 64", "Chambre des communes · 650 sièges · majorité 326")
    r('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
      '<svg id="viPlan" class="vi-plan vc-plan" role="img" aria-label="Plan de la Chambre des communes (650 sièges)"></svg>')
    s, n = re.subn(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
                   '<button type="button" data-z="tout">Royaume-Uni</button><button type="button" data-z="lon">Londres</button>'
                   '<button type="button" data-z="bir">Birmingham</button><button type="button" data-z="man">Manchester</button>'
                   '<button type="button" data-z="gla">Glasgow</button><button type="button" data-z="bel">Belfast</button>', s, count=1, flags=re.S)
    assert n == 1, "Votes Royaume-Uni : boutons de zoom introuvables"
    s, n = re.subn(r'<button type="button" data-per="3".*?Depuis 2022</button>',
                   '<button type="button" data-per="3" aria-pressed="false">3 mois</button><button type="button" data-per="6" aria-pressed="false">6 mois</button>'
                   '<button type="button" data-per="12" aria-pressed="true">1 an</button><button type="button" data-per="24" aria-pressed="false">2 ans</button>'
                   '<button type="button" data-per="0" aria-pressed="false">Depuis 2024</button>', s, count=1, flags=re.S)
    assert n == 1, "Votes Royaume-Uni : boutons de période introuvables"
    r('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Dernière année</span>')
    r('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des 650 circonscriptions du Royaume-Uni"')
    r("</head>", STYLE + "</head>")
    assert 'src="votes-quebec/intentions.js"' not in s and '>Grand Montréal<' not in s and 'data-z="lon"' in s
    return s
