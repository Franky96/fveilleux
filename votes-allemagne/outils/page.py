"""Votes Allemagne : page votes-allemagne.html, faite à partir de la page Votes Québec (même cadre).

Appelée par votes-quebec/outils/pages.py (fonction construire) : on ne modifie jamais votes-allemagne.html à la main.
Hémicycle du Bundestag (630 sièges), carte des 299 circonscriptions, sondages de wahlrecht.de, projection du site.
"""
import re

# styles propres à la page (classe « va » sur la section) : couleurs des partis (avec une variante pour le thème sombre,
# où le noir de la CDU/CSU deviendrait invisible) et quelques réglages de mise en page
STYLE = """  <style>
    /* Votes Allemagne : couleurs des partis (CDU/CSU en gris très foncé en thème clair, gris clair en thème sombre) */
    .va { --cdu:#2B2B2E; --csu:#35506E; --spd:#E3000F; --afd:#009EE0; --gru:#1AA037; --lin:#BE3075; --bsw:#6D3A8E; --fdp:#D9B600;
      --fw:#F28C00; --ssw:#00337F; --vaut:#9AA0AA; --fl:#848B97; }
    :root[data-theme="dark"] .va { --cdu:#D5D8DE; --csu:#8FB0D6; --spd:#FF4B55; --afd:#3BB8F2; --gru:#3CC25A; --lin:#F0569C; --bsw:#B184D6;
      --fdp:#FFE14D; --fw:#FFA63D; --ssw:#6E9BEF; --vaut:#7C8494; --fl:#8F97A5; }
    @media (min-width: 1000px) { .va .vi-haut { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); } }
    .va .vi-plan.vf-hemi { max-width: none; }
    .va .lv-rid { stroke-width: 0.25px; }
    .vi-vrow.va-proj { grid-template-columns: 4.2em minmax(0, 1fr) 4.2em 5.4em; }
    .vi-vrow.va-proj .vi-num { white-space: nowrap; }
    .va .vi-table td, .va .vi-table th { padding-left: 3px; padding-right: 3px; }
    .va .vi-table td .vi-lien { text-align: left; }
    /* choix « Sièges des Länder » : grisé en vue Wahlkreis (actif seulement en vue Länder, mode Sièges) */
    .va-inactif { opacity: 0.45; }
    .va-inactif button { cursor: not-allowed; }
    /* légende de l'hémicycle : élus de Wahlkreis (pastille pleine) et élus de liste (cercle vide, comme les sièges de région de Loi 39) */
    .va-mandats { display: inline-flex; flex-wrap: wrap; gap: 6px 14px; flex-basis: 100%; }
    .va-liste i { background: transparent !important; box-shadow: inset 0 0 0 2px var(--c); }
    .va-note { font-size: 0.8rem; color: var(--muted); line-height: 1.5; margin: 0; }
    .va-sans-siege { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted);
      border: 1px dashed var(--muted); border-radius: 4px; padding: 0 5px; margin-left: 4px; }
  </style>
"""


def construire(html, FICHIER):
    va = re.sub(r'\n    <!-- sous-menu du Québec.*?</div>\n', "\n", html, count=1, flags=re.S)

    def r(a, b):
        nonlocal va
        assert a in va, "Votes Allemagne : introuvable dans la page Votes Québec : " + a[:60]
        va = va.replace(a, b)

    r('<h2 id="viTitre">Votes Québec</h2>', '<h2 id="viTitre">Votes Allemagne</h2>')
    r("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes Allemagne</title>")
    r('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes Allemagne · Bundestag</span>')
    r(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
    r(f'href="{FICHIER["allemagne"]}">', f'href="{FICHIER["allemagne"]}" aria-current="page">')
    r('  <script type="module" src="votes-quebec/intentions.js"></script>', '  <script type="module" src="votes-allemagne/allemagne.js"></script>')
    r('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes va" id="vue-votes"')
    r('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">Allemagne · Bundestag</span>')
    r("Assemblée nationale · 127 sièges · majorité 64", "Bundestag · 630 sièges · majorité 316")
    r('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
      '<svg id="viPlan" class="vi-plan vf-hemi" role="img" aria-label="Hémicycle du Bundestag (630 sièges)"></svg>')
    va, n = re.subn(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
                    '<button type="button" data-z="tout">Allemagne</button><button type="button" data-z="ber">Berlin</button>'
                    '<button type="button" data-z="ruhr">Rhin-Ruhr</button><button type="button" data-z="ham">Hambourg</button>'
                    '<button type="button" data-z="mun">Munich</button><button type="button" data-z="fra">Francfort</button>'
                    '<button type="button" data-z="est">Est</button>', va, count=1, flags=re.S)
    assert n == 1, "Votes Allemagne : boutons de zoom introuvables"
    va, n = re.subn(r'<button type="button" data-per="3".*?Depuis 2022</button>',
                    '<button type="button" data-per="3" aria-pressed="true">3 mois</button><button type="button" data-per="6" aria-pressed="false">6 mois</button>'
                    '<button type="button" data-per="12" aria-pressed="false">1 an</button><button type="button" data-per="0" aria-pressed="false">Depuis 2025</button>',
                    va, count=1, flags=re.S)
    assert n == 1, "Votes Allemagne : boutons de période introuvables"
    r('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2025</span>')
    r('<h3 id="viEvolTitre">Évolution des intentions de vote</h3>', '<h3 id="viEvolTitre">Évolution des intentions de vote (secondes voix)</h3>')
    r('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des 299 Wahlkreise (circonscriptions) du Bundestag"')
    r("</head>", STYLE + "</head>")
    assert 'src="votes-quebec/intentions.js"' not in va and '>Grand Montréal<' not in va and 'data-z="ber"' in va
    return va
