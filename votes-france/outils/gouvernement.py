"""Votes France : gouvernement en fonctions (Wikipédia, page du gouvernement actuel) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes France. Le site officiel du gouvernement (info.gouv.fr) refuse les accès automatiques :
on lit la section « Galerie du gouvernement actuellement en fonctions » de la page Wikipédia du gouvernement (portrait, fonction,
nom, parti). La page est fixée ci-dessous (PAGE) : quand le gouvernement change, le script s'arrête (infobox « fin » remplie) et
la page de la nouvelle équipe est à indiquer. Photos de Wikimedia Commons. Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import wiki, texte, commons, membre, ecrire

PAGE = "Gouvernement Lecornu II"
w = wiki(PAGE)
fin = re.search(r"^\|[ \t]*fin[ \t]*=[ \t]*(.*)$", w, re.M)
if fin and fin.group(1).strip(): raise SystemExit(f"{PAGE} a pris fin ({fin.group(1).strip()}) : indiquer la page du gouvernement actuel dans PAGE.")
i = w.index("== Galerie du gouvernement actuellement en fonctions ==")
galerie = w[i:]
fin_section = re.search(r"\n== [^=]", galerie[10:])
if fin_section: galerie = galerie[: fin_section.start() + 10]
niveaux = []
for titre, tableau in re.findall(r"^=== (.+?) ===\s*\n(\{\|.*?\n\|\})", galerie, re.S | re.M):
    if not re.match(r"(Premier ministre|Ministres|Secrétaires? d.État)", titre): continue
    membres = []
    for ligne in re.split(r"\n\|-[^\n]*\n", tableau)[1:]:
        cel = [c[1:].strip() for c in ligne.split("\n") if c.startswith("|") and not c.startswith(("|}", "|+"))]
        cel = [re.sub(r"^(?:width=\"\d+%?\"|style=\"[^\"]*\")\s*\|\s*", "", c) for c in cel]
        k = next((j for j, c in enumerate(cel) if "Infobox Parti politique" in c), None)
        if k is None or k + 1 >= len(cel): continue
        nom = texte(cel[k + 1])
        photo = re.search(r"\[\[(?:Fichier|File|Image):([^|\]]+)", cel[0])
        fonction = texte(re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", cel[1], flags=re.S))
        roles = [fonction] + ([f"auprès de : {texte(cel[2])}"] if k == 3 else [])
        parti = cel[k + 2] if k + 2 < len(cel) else ""
        parti = re.sub(r"\{\{.*|<ref.*", "", parti, flags=re.S)
        parti = texte(re.sub(r"\[https?://[^\]]*\]", "", parti)).split("puis")[-1].split("/")[0].strip() or None
        membres.append(membre(nom, roles, commons(photo.group(1), 200) if photo else None, None, None, parti))
    niveaux.append({"titre": None if not membres or "Premier ministre" in titre else f"{titre} ({len(membres)})", "grand": "Premier ministre" in titre, "membres": membres})
ecrire(ICI, "https://fr.wikipedia.org/wiki/" + PAGE.replace(" ", "_"), "Wikipédia, " + PAGE + " (le site officiel info.gouv.fr refuse les accès automatiques)", niveaux, 25)
