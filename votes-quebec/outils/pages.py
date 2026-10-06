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
FICHIER = {"live": "intentions-simulations.html", "votes": "votes-quebec.html" if BASCULE else "votes-quebec-v2.html", "loi39": "loi39.html"}
TITRE = {"live": "Intentions de vote et simulations", "votes": "Votes Québec", "loi39": "Loi 39"}
SCRIPTS = {"live": "votes-quebec/live.js", "votes": "votes-quebec/intentions.js", "loi39": "votes-quebec/loi39.js"}

src = open(os.path.join(ICI, "pages.src.html"), encoding="utf-8").read()
src = re.sub(r"<!-- GABARIT :.*?-->\n", "", src, count=1)


def page(vue):
    s = src
    # une seule vue : on retire les deux autres, et la nôtre n'est plus cachée
    for v in FICHIER:
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
    for v in FICHIER:
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


for v in FICHIER: page(v)
