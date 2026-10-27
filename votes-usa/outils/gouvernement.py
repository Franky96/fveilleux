"""Votes États-Unis : Cabinet du président (whitehouse.gov/administration/cabinet) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes États-Unis : le président, le vice-président et les chefs des départements exécutifs,
avec leur photo officielle. Les fonctions restent en anglais (titres officiels). Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import lire, texte, membre, ecrire

URL = "https://www.whitehouse.gov/administration/cabinet/"
page = lire(URL)
og = re.search(r'<meta property="og:description" content="([^"]+)"', page)
tous = []
# chaque membre : un titre h2 (nom), un h3 (fonction), puis sa photo
for m in re.finditer(r'<h2 class="wp-block-heading[^>]*>(.*?)</h2>(.*?)(?=<h2 class="wp-block-heading|\Z)', page, re.S):
    nom = texte(m.group(1))
    role = re.search(r'<h3 class="wp-block-heading[^>]*>(.*?)</h3>', m.group(2), re.S)
    img = re.search(r'<img [^>]*src="(https://www\.whitehouse\.gov/wp-content/[^"]+)"', m.group(2))
    if not nom or not role or len(nom) > 40: continue
    tous.append(membre(nom, [texte(role.group(1))], img.group(1) if img else None, None, None))

def chef(slug, titre, motif):
    """président ou vice-président : nom et photo de sa page officielle (le Cabinet les nomme sans fiche)"""
    try:
        p = lire(f"https://www.whitehouse.gov/administration/{slug}/")
    except Exception:
        return None
    t = re.search(r'<meta property="og:title" content="([^"]+)"', p)
    if not t: return None
    nom = re.sub(r"^(President|Vice President)\s+", "", texte(t.group(1))).replace("JD ", "J.D. ").strip()
    img = [u for u in re.findall(r'<img [^>]*src="(https://www\.whitehouse\.gov/wp-content/uploads/[^"]+)"', p) if re.search(motif, u)]
    return membre(nom, [titre], img[0] if img else None, f"https://www.whitehouse.gov/administration/{slug}/", "R")


tete = [x for x in (chef("donald-j-trump", "President of the United States", r"President-Donald-Trump"), chef("jd-vance", "Vice President", r"Vice-President")) if x]
niv = [{"titre": None, "grand": True, "membres": tete}, {"titre": f"Cabinet ({len(tous)})", "grand": False, "membres": tous}]
ecrire(ICI, URL, "Maison-Blanche, The Cabinet (fonctions en anglais)", niv, 12)
