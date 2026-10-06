"""Sondages des prochaines législatives françaises (Wikipédia anglais, « Next French legislative election ») → ../sondages.json

Les sondeurs (Ifop, OpinionWay, Elabe, Harris, Odoxa, Toluna…) publient leurs intentions de vote au 1er tour ;
Wikipédia les rassemble dans un tableau avec la source de chacun. On garde, pour chaque sondage, le premier
scénario (la première ligne), regroupé par bloc comme la page (gauche NFP, Ensemble, LR, RN-UDR…).
Le résultat du 1er tour de 2024 sert de repère (depuis data.json, écrit par france.py).
Usage : /usr/bin/python3 sondages_fr.py   (dans le dossier outils/)
"""
import json, os, re, urllib.request


def verifie(page):
    """Date de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    a = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")).date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "texte": f"{a.day} {m[a.month - 1]} {a.year}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

ICI = os.path.dirname(os.path.abspath(__file__))
URL = "https://en.wikipedia.org/w/index.php?title=Next_French_legislative_election&action=raw"
HDR = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com; franky.veilleux@gmail.com)"}
# colonnes du tableau Wikipédia, dans l'ordre → bloc de la page
COLONNES = ["EXG", "LFI", "LE", "PCF", "PS", "DVG", "ECO", "ENS", "DVC", "LR", "DVD", "DLF", "UDR", "RN", "REC", "AUT"]
BLOC = {"EXG": "EXG", "LFI": "NFP", "LE": "NFP", "PCF": "NFP", "PS": "NFP", "DVG": "DVG", "ECO": "DVG", "ENS": "ENS", "DVC": "DVC",
        "LR": "LR", "DVD": "DVD", "DLF": "DVD", "UDR": "RN", "RN": "RN", "REC": "EXD", "AUT": "DIV"}
MOIS = {m: i + 1 for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def sans_modeles(s):
    """retire {{…}} (imbriqués) et <ref>…</ref>"""
    s = re.sub(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    while True:
        t = re.sub(r"\{\{[^{}]*\}\}", "", s)
        if t == s: return t
        s = t


def cellule(ligne):
    """« | attributs | contenu » → (attributs, contenu), en ignorant les | des modèles {{…}} et liens [[…]]"""
    s, prof = ligne[1:], 0
    for i, c in enumerate(s):
        if c in "{[": prof += 1
        elif c in "}]": prof -= 1
        elif c == "|" and prof == 0 and i + 1 < len(s) and s[i + 1] != "|":
            return s[:i], s[i + 1:]
    return "", s


texte = urllib.request.urlopen(urllib.request.Request(URL, headers=HDR), timeout=60).read().decode("utf-8")
debut = texte.find("== Opinion polls ==")
table = texte[debut: texte.find("|}", debut)]
sondages = []
for bloc in table.split("\n|-")[1:]:
    lignes = [l for l in bloc.split("\n") if l.startswith("|") and not l.startswith("|-") and not l.startswith("|+")]
    if len(lignes) < 10 or "N/A" in lignes[0]: continue  # lignes d'événement (« gouvernement formé ») ou scénarios suivants
    cell = [cellule(l) for l in lignes]
    firme = sans_modeles(cell[0][1]).strip()
    firme = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", firme).strip()
    date_txt = sans_modeles(cell[1][1]) if "Opdrts" not in cell[1][1] else ""
    m = re.search(r"(\d{1,2})\s+([A-Z][a-z]{2})[a-z]*\s+(\d{4})\s*$", date_txt.strip())
    if not firme or not m: continue
    date = f"{int(m[3]):04d}-{MOIS[m[2]]:02d}-{int(m[1]):02d}"
    echantillon = sans_modeles(cell[2][1]).replace(",", "").strip()
    # valeurs : 16 colonnes, des cellules qui en couvrent plusieurs (colspan) sont rattachées à leur premier bloc
    vals, col = {}, 0
    for attrs, contenu in cell[3:]:
        if col >= len(COLONNES): break
        n = int(re.search(r'colspan="?(\d+)', attrs)[1]) if "colspan" in attrs else 1
        v = re.search(r"(\d+(?:\.\d+)?)\s*%", sans_modeles(contenu).replace("'", ""))
        if v:
            b = BLOC[COLONNES[col]]
            vals[b] = round(vals.get(b, 0) + float(v[1]), 1)
        col += n
    if col < len(COLONNES) or not 90 <= sum(vals.values()) <= 102: continue
    sondages.append({"d": date, "f": firme, "e": False, "n": echantillon, **vals})

sondages.sort(key=lambda s: s["d"])
if len(sondages) < 10: raise SystemExit(f"Seulement {len(sondages)} sondages lus : sondages.json inchangé.")
# repère : 1er tour des législatives de 2024 (voix par bloc, data.json)
data = json.load(open(os.path.join(ICI, "..", "data.json"), encoding="utf-8"))
sondages.insert(0, {"d": "2024-06-30", "f": "Élection (1er tour)", "e": True, "n": "", **data["national"]})
json.dump({"source": "Wikipédia, « Next French legislative election » (sondages publiés, sources citées)", "sondages": sondages},
          open(os.path.join(ICI, "..", "sondages.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(sondages) - 1} sondages · du {sondages[1]['d']} au {sondages[-1]['d']} · dernier : {sondages[-1]['f']}")
verifie("france")
