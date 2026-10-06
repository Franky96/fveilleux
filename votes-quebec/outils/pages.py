"""Section « Intentions de vote et simulations » : une page par onglet, tirées d'un même gabarit (pages.src.html).

    intentions-simulations.html  accueil de la section (pour l'instant : résultats en direct)
    votes-quebec.html            intentions de vote (résultat de l'élection jusqu'au premier sondage)
    loi39.html                   simulation de la loi 39

Les pages sont visuellement identiques à l'ancienne page unique : même barre du haut, mêmes onglets
(devenus de vrais liens), une seule vue par page. Modifier le gabarit puis relancer ce script.

Usage : /usr/bin/python3 pages.py            (avant la bascule : la page des intentions est votes-quebec-v2.html)
        /usr/bin/python3 pages.py --bascule  (après : votes-quebec.html ; l'ancienne page « en direct » est remplacée)
"""
import os, re, sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, "..", ".."))
BASCULE = "--bascule" in sys.argv
FICHIER = {"live": "intentions-simulations.html", "votes": "votes-quebec.html" if BASCULE else "votes-quebec-v2.html", "loi39": "loi39.html",
           "france": "votes-france.html", "canada": "votes-canada.html", "usa": "votes-usa.html"}
PAGES = ["live", "votes", "loi39"]          # tirées du gabarit ; « france » et « canada » sont faites à partir de la page Votes Québec (même cadre)
TITRE = {"live": "Intentions de vote et simulations", "votes": "Votes Québec", "loi39": "Loi 39"}
SCRIPTS = {"live": "votes-quebec/live.js", "votes": "votes-quebec/intentions.js", "loi39": "votes-quebec/loi39.js"}

src = open(os.path.join(ICI, "pages.src.html"), encoding="utf-8").read()
src = re.sub(r"<!-- GABARIT :.*?-->\n", "", src, count=1)


def page(vue):
    s = src
    # une seule vue : on retire les deux autres, et la nôtre n'est plus cachée
    for v in PAGES:
        bloc = re.compile(rf"<!-- DEBUT:{v} -->\n(.*?)<!-- FIN:{v} -->\n", re.S)
        s = bloc.sub((lambda m: m.group(1)) if v == vue else "", s)
    s = s.replace(' role="tabpanel" aria-labelledby="tab-live" hidden>', ">").replace(' role="tabpanel" aria-labelledby="tab-votes" hidden>', ">")
    s = s.replace(' role="tabpanel" aria-labelledby="tab-loi39"', "")
    s = re.sub(r"<title>.*?</title>", f"<title>Outils de Frank — {TITRE[vue]}</title>", s, count=1)
    # onglets → liens vers les pages
    def onglet(m):
        attrs, contenu = m.group(1), m.group(2)
        v = re.search(r'data-vue="(\w+)"', attrs).group(1)
        classe = re.search(r'class="([^"]+)"', attrs).group(1)
        courant = ' aria-current="page"' if v == vue else ""
        return f'<a class="{classe}" href="{FICHIER[v]}"{courant}>{contenu}</a>'
    s = re.sub(r'<button type="button" role="tab"([^>]*)>(.*?)</button>', onglet, s, flags=re.S)
    s = s.replace('<div class="sc-tabs" role="tablist">', '<div class="sc-tabs">')
    s = s.replace('<nav class="scrutins" aria-label="Mode de scrutin">', '<nav class="scrutins" aria-label="Pages de la section">')
    # barre du haut : seulement le titre de cette page
    for v in PAGES:
        s = re.sub(rf'<span class="t-{v}"( hidden)?>', f'<span class="t-{v}"{"" if v == vue else " hidden"}>', s)
    # scripts : seulement le module de cette vue
    for v, js in SCRIPTS.items():
        if v != vue: s = s.replace(f'  <script type="module" src="{js}"></script>\n', "")
    # plus de bascule d'onglets : thème et filet de sécurité seulement
    s = re.sub(r"      // choix du mode de scrutin.*?window\.addEventListener\('hashchange'.*?\n", "", s, flags=re.S)
    # anciennes adresses à onglet (votes-quebec.html#live, #loi39) → la page correspondante
    if vue == "votes":
        s = s.replace("  <script>\n    const _pL", "  <script>\n    if (location.hash === '#live') location.replace('" + FICHIER["live"] + "');\n"
                      "    if (location.hash === '#loi39') location.replace('" + FICHIER["loi39"] + "');\n    const _pL", 1)
    assert "montrer(" not in s, "bascule d'onglets restée dans " + vue
    open(os.path.join(RACINE, FICHIER[vue]), "w", encoding="utf-8").write(s)
    print(f"{FICHIER[vue]:30} {len(s):7} octets")


for v in PAGES: page(v)

# démo de la page des intentions de vote (sondages fictifs) : pas dans les onglets, adresse directe seulement
demo = open(os.path.join(RACINE, FICHIER["votes"]), encoding="utf-8").read()
demo = demo.replace("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes Québec (démo)</title>")
demo = demo.replace('  <script type="module" src="votes-quebec/intentions.js"></script>',
                    '  <script>window.VI_DEMO = true;   // sondages fictifs, voir intentions.js</script>\n  <script type="module" src="votes-quebec/intentions.js"></script>')
demo = demo.replace('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes Québec · démo (intentions fictives)</span>')
demo = demo.replace('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge vi-badge-demo">Démo · données fictives</span>')
assert "VI_DEMO" in demo
open(os.path.join(RACINE, "votes-quebec-demo.html"), "w", encoding="utf-8").write(demo)
print(f"{'votes-quebec-demo.html':30} {len(demo):7} octets")

# Votes France : même cadre que Votes Québec (hémicycle de 577 sièges, carte des circonscriptions, sondages)
DCP = ('  <script src="https://cdn.jsdelivr.net/npm/d3-composite-projections@1.4.0/d3-composite-projections.min.js" '
       'integrity="sha384-dK0GmBUFxZ31MeEofuH+L50Mmk9vmuYWJasEPIp8s+UNQqdM0mppT/VtywRGXicv" crossorigin="anonymous"></script>\n')
fr = open(os.path.join(RACINE, FICHIER["votes"]), encoding="utf-8").read()
def r(a, b):
    global fr
    assert a in fr, "Votes France : introuvable dans la page Votes Québec : " + a[:60]
    fr = fr.replace(a, b)
r("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes France</title>")
r('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes France · intentions de vote</span>')
r(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
r(f'href="{FICHIER["france"]}">', f'href="{FICHIER["france"]}" aria-current="page">')
r('  <script type="module" src="votes-quebec/intentions.js"></script>', DCP + '  <script type="module" src="votes-france/france.js"></script>')
r('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes vf" id="vue-votes"')
r('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">France · législatives</span>')
r("Assemblée nationale · 127 sièges · majorité 64", "Assemblée nationale · 577 sièges · majorité absolue 289")
r('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
  '<svg id="viPlan" class="vi-plan vf-hemi" role="img" aria-label="Hémicycle de l\'Assemblée nationale (577 sièges)"></svg>')
fr = re.sub(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
            '<button type="button" data-z="tout">France</button><button type="button" data-z="idf">Île-de-France</button><button type="button" data-z="paris">Paris</button>'
            '<button type="button" data-z="lyon">Lyon</button><button type="button" data-z="marseille">Marseille</button>', fr, flags=re.S)
fr = re.sub(r'<button type="button" data-per="3".*?Depuis 2022</button>',
            '<button type="button" data-per="6" aria-pressed="false">6 mois</button><button type="button" data-per="12" aria-pressed="false">1 an</button>'
            '<button type="button" data-per="24" aria-pressed="false">2 ans</button><button type="button" data-per="0" aria-pressed="true">Depuis 2024</button>', fr, flags=re.S)
r('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Depuis les législatives de 2024</span>')
r('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des circonscriptions législatives"')
assert 'src="votes-quebec/intentions.js"' not in fr and '>Grand Montréal<' not in fr
open(os.path.join(RACINE, FICHIER["france"]), "w", encoding="utf-8").write(fr)
print(f"{FICHIER['france']:30} {len(fr):7} octets")

# Votes Canada : même cadre que Votes Québec (Chambre des communes de 343 sièges, carte des circonscriptions, projection Qc125)
ca = open(os.path.join(RACINE, FICHIER["votes"]), encoding="utf-8").read()
def rc(a, b):
    global ca
    assert a in ca, "Votes Canada : introuvable dans la page Votes Québec : " + a[:60]
    ca = ca.replace(a, b)
rc("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes Canada</title>")
rc('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes Canada · intentions de vote fédérales</span>')
rc(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
rc(f'href="{FICHIER["canada"]}">', f'href="{FICHIER["canada"]}" aria-current="page">')
rc('  <script type="module" src="votes-quebec/intentions.js"></script>', '  <script type="module" src="votes-canada/canada.js"></script>')
rc('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes vc" id="vue-votes"')
rc('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">Canada · fédéral</span>')
rc("Assemblée nationale · 127 sièges · majorité 64", "Chambre des communes · 343 sièges · majorité 172")
rc('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
   '<svg id="viPlan" class="vi-plan vc-plan" role="img" aria-label="Plan de la Chambre des communes (343 sièges)"></svg>')
ca = re.sub(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
            '<button type="button" data-z="tout">Canada</button><button type="button" data-z="sudqc">Sud du Québec</button><button type="button" data-z="mtl">Montréal</button>'
            '<button type="button" data-z="tor">Toronto</button><button type="button" data-z="ott">Ottawa</button><button type="button" data-z="van">Vancouver</button>', ca, flags=re.S)
ca = re.sub(r'<button type="button" data-per="3".*?Depuis 2022</button>',
            '<button type="button" data-per="3" aria-pressed="true">3 mois</button><button type="button" data-per="6" aria-pressed="false">6 mois</button>'
            '<button type="button" data-per="12" aria-pressed="false">1 an</button><button type="button" data-per="0" aria-pressed="false">Depuis 2025</button>', ca, flags=re.S)
rc('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2025</span>')
rc('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des 343 circonscriptions fédérales"')
assert 'src="votes-quebec/intentions.js"' not in ca and '>Grand Montréal<' not in ca and 'data-z="sudqc"' in ca
open(os.path.join(RACINE, FICHIER["canada"]), "w", encoding="utf-8").write(ca)
print(f"{FICHIER['canada']:30} {len(ca):7} octets")

# Votes États-Unis : même cadre (hémicycle de 435 sièges, carte des districts, consensus des prévisionnistes, vote générique)
us = open(os.path.join(RACINE, FICHIER["votes"]), encoding="utf-8").read()
def ru(a, b):
    global us
    assert a in us, "Votes États-Unis : introuvable dans la page Votes Québec : " + a[:60]
    us = us.replace(a, b)
ru("<title>Outils de Frank — Votes Québec</title>", "<title>Outils de Frank — Votes États-Unis</title>")
ru('<span class="t-votes">Votes Québec · intentions de vote</span>', '<span class="t-votes">Votes États-Unis · Chambre des représentants</span>')
ru(f'href="{FICHIER["votes"]}" aria-current="page"', f'href="{FICHIER["votes"]}"')
ru(f'href="{FICHIER["usa"]}">', f'href="{FICHIER["usa"]}" aria-current="page">')
ru('  <script type="module" src="votes-quebec/intentions.js"></script>', '  <script type="module" src="votes-usa/usa.js"></script>')
ru('<section class="vue-live vue-votes" id="vue-votes"', '<section class="vue-live vue-votes vu" id="vue-votes"')
ru('<span class="vi-badge">Intentions de vote</span>', '<span class="vi-badge">États-Unis · Chambre des représentants</span>')
ru("Assemblée nationale · 127 sièges · majorité 64", "Chambre des représentants · 435 sièges · majorité 218")
ru('<svg id="viPlan" class="vi-plan" role="img" aria-label="Plan de l\'Assemblée nationale"></svg>',
   '<svg id="viPlan" class="vi-plan vf-hemi" role="img" aria-label="Hémicycle de la Chambre des représentants (435 sièges)"></svg>')
us = re.sub(r'<button type="button" data-z="tout">Tout le Québec</button>.*?<button type="button" data-z="sud">Sud</button>',
            '<button type="button" data-z="tout">États-Unis</button><button type="button" data-z="ne">Nord-Est</button><button type="button" data-z="gl">Grands Lacs</button>'
            '<button type="button" data-z="ca">Californie</button><button type="button" data-z="tx">Texas</button><button type="button" data-z="fl">Floride</button>', us, flags=re.S)
us = re.sub(r'<button type="button" data-per="3".*?Depuis 2022</button>',
            '<button type="button" data-per="3" aria-pressed="true">3 mois</button><button type="button" data-per="6" aria-pressed="false">6 mois</button>'
            '<button type="button" data-per="12" aria-pressed="false">1 an</button><button type="button" data-per="0" aria-pressed="false">Depuis 2024</button>', us, flags=re.S)
ru('<span class="lv-eyebrow" id="viEvolSur">Depuis l\'élection de 2022</span>', '<span class="lv-eyebrow" id="viEvolSur">Vote générique</span>')
ru('<h3 id="viEvolTitre">Évolution des intentions de vote</h3>', '<h3 id="viEvolTitre">Évolution du vote générique</h3>')
ru('aria-label="Carte des 127 circonscriptions"', 'aria-label="Carte des 435 districts de la Chambre des représentants"')
assert 'src="votes-quebec/intentions.js"' not in us and 'data-z="ne"' in us
open(os.path.join(RACINE, FICHIER["usa"]), "w", encoding="utf-8").write(us)
print(f"{FICHIER['usa']:30} {len(us):7} octets")
