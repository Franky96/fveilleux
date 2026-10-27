"""Votes Suisse : Conseil fédéral (Wikipédia, tableau « Composition ») → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes Suisse : les sept conseillers fédéraux, leur département, leur parti, avec la
présidence et la vice-présidence de la Confédération. Le site de l'administration fédérale (admin.ch) refuse les accès
automatiques : on lit le tableau de la page Wikipédia « Conseil fédéral (Suisse) ». Photos de Wikimedia Commons.
Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import wiki, texte, commons, membre, ecrire

PAGE = "Conseil fédéral (Suisse)"
CLES = {"UDC": "UDC", "PLR": "PLR", "PS": "PS", "Le Centre": "C", "VERT": "VERT", "PVL": "PVL"}   # parti du tableau → clé de la page
w = wiki(PAGE)
i = w.index("== Composition ==")
tableau = w[i: w.index("\n|}", i)]
membres = []
for ligne in re.split(r"\n\|-[^\n]*\n", tableau)[1:]:
    cel = [c.strip() for c in re.split(r"\n\|(?!\})", "\n" + ligne)[1:]]
    if len(cel) < 6: continue
    photo = re.search(r"\[\[(?:Fichier|File):([^|\]]+)", cel[0])
    nom = texte(re.sub(r"\{\{tri\|[^}]*\}\}", "", cel[1]))
    fonction = [texte(x) for x in re.split(r"<br\s*/?>|\n", cel[2]) if texte(x)]
    fonction = [re.sub(r"\s*depuis le.*$", "", f) for f in fonction]
    parti = texte(cel[4])
    membres.append(membre(nom, [re.sub(r"^Chef d[uea] ", "Département : ", f) if f.startswith("Chef") else f for f in fonction], commons(photo.group(1)) if photo else None, None, CLES.get(parti), parti))
pres = [m for m in membres if any(r.startswith("Président du Conseil fédéral") for r in m["roles"])]
if not pres: raise SystemExit("présidence du Conseil fédéral introuvable")
reste = [m for m in membres if m not in pres]
ecrire(ICI, "https://fr.wikipedia.org/wiki/Conseil_f%C3%A9d%C3%A9ral_(Suisse)", "Wikipédia, Conseil fédéral (le site admin.ch refuse les accès automatiques)",
       [{"titre": None, "grand": True, "membres": pres[:1]}, {"titre": f"Conseillers fédéraux ({len(reste)})", "grand": False, "membres": reste}], 7)
