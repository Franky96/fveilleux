"""Votes Allemagne : Bundeskabinett (bundesregierung.de) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes Allemagne : le chancelier, le vice-chancelier et les ministres fédéraux, avec leur
photo officielle. Les fonctions restent en allemand (titres officiels). Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import lire, texte, membre, ecrire

URL = "https://www.bundesregierung.de/breg-de/bundesregierung/bundeskabinett"
HOTE = "https://www.bundesregierung.de"
page = lire(URL)
tous = []
for bloc in re.findall(r'<div class="bpa-teaser bpa-teaser-cabinet[^"]*">(.*?)</ul>\s*</li>', page, re.S):
    h = re.search(r'<a href="([^"]+)"[^>]*>\s*<h3 class="bpa-teaser-title"[^>]*>(.*?)</h3>', bloc, re.S)
    if not h: continue
    img = re.search(r'<img [^>]*src="([^"]+)"', bloc)
    roles = [texte(x) for x in re.findall(r'<li class="bpa-teaser-cabinet-item">(.*?)</li>', bloc, re.S)]
    roles = [r for r in roles if r and r != "Lebenslauf"]
    url = h.group(1) if h.group(1).startswith("http") else HOTE + h.group(1)
    tous.append(membre(texte(h.group(2)), roles, (HOTE + img.group(1)) if img else None, url))
chef = [m for m in tous if "Bundeskanzler" in m["roles"]]
if not chef: raise SystemExit("chancelier introuvable dans la page du Bundeskabinett")
reste = [m for m in tous if m not in chef]
ecrire(ICI, URL, "Bundesregierung, Bundeskabinett (fonctions en allemand)",
       [{"titre": None, "grand": True, "membres": chef[:1]}, {"titre": f"Ministres fédéraux ({len(reste)})", "grand": False, "membres": reste}], 12)
