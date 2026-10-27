"""Votes Alberta : Conseil exécutif de l'Alberta (Wikipédia, « Executive Council of Alberta ») → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes Alberta : la première ministre, la vice-première ministre et les ministres avec leur
portefeuille. Le site officiel (alberta.ca) ne publie pas la liste des ministres sous une forme lisible par script : on lit le
tableau « Current executive council » de Wikipédia (portefeuille, ministre, date d'entrée). Pas de photo (initiales). Les
portefeuilles restent en anglais (titres officiels). Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import wiki, texte, membre, ecrire

PAGE = "Executive Council of Alberta"
w = wiki(PAGE, "en")
i = w.index("===Current executive council===")
tableau = w[w.index("{|", i): w.index("\n|}", i)]
par_nom = {}
for ligne in re.split(r"\n\|-[^\n]*\n", tableau)[1:]:
    cel = [c[1:].strip() for c in ligne.split("\n") if c.startswith("|") and not c.startswith("|}")]
    if len(cel) < 2: continue
    role = texte(re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", cel[0], flags=re.S))
    nom = texte(cel[1])
    if not nom or not role: continue
    par_nom.setdefault(nom, []).append(role)          # un ministre peut avoir plusieurs portefeuilles
tous = [membre(n, r, None, None, "UCP") for n, r in par_nom.items()]
chef = [m for m in tous if any(r.startswith("Premier of Alberta") for r in m["roles"])]
if not chef: raise SystemExit("première ministre introuvable dans le tableau")
vice = [m for m in tous if m not in chef and any(r.startswith("Deputy Premier") for r in m["roles"])]
reste = sorted([m for m in tous if m not in chef + vice], key=lambda m: m["nom"].split()[-1])
niv = [{"titre": None, "grand": True, "membres": chef[:1] + vice}, {"titre": f"Ministres ({len(reste)})", "grand": False, "membres": reste}]
ecrire(ICI, "https://en.wikipedia.org/wiki/Executive_Council_of_Alberta", "Wikipédia, Executive Council of Alberta (portefeuilles en anglais)", niv, 15)
