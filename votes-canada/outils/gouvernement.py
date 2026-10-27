"""Votes Canada : Conseil des ministres du Canada (site officiel du premier ministre, pm.gc.ca) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes Canada. Page « Cabinet » en français : le premier ministre, puis les ministres et
les secrétaires d'État, avec leur photo officielle. Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : /usr/bin/python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "votes-quebec", "outils"))
from gouv_commun import lire, texte, membre, ecrire

URL = "https://www.pm.gc.ca/fr/cabinet"
URL_SE = "https://www.pm.gc.ca/fr/secretaires-detat"


def lignes(url):
    out = []
    for li in re.findall(r'<li class="minister-row[^"]*">(.*?)</li>', lire(url), re.S):
        nom = re.search(r'<div class="name">(.*?)</div>', li, re.S)
        role = re.search(r'<div class="role">(.*?)</div>', li, re.S)
        img = re.search(r'<img [^>]*?src="([^"]+)"', li)
        if not nom: continue
        n = re.sub(r"^(Le très honorable|La très honorable|L['’]honorable|Le|La|L['’])?\s*(très honorable|honorable)?\s*", "", texte(nom.group(1)), flags=re.I).strip()
        out.append(membre(n, [texte(role.group(1))] if role else [], ("https://www.pm.gc.ca" + img.group(1).split("?")[0]) if img else None, None, "PLC"))
    return out


tous = lignes(URL)
pm = [m for m in tous if re.search(r"premier ministre du Canada", " ".join(m["roles"]), re.I)]
if not pm: raise SystemExit("premier ministre introuvable dans la page du Cabinet")
mins = [m for m in tous if m not in pm]
noms = {m["nom"] for m in tous}
try:
    sec = [m for m in lignes(URL_SE) if m["nom"] not in noms]      # secrétaires d'État (hors Cabinet) ; une ministre qui l'est aussi n'est comptée qu'une fois
except Exception:
    sec = []
ecrire(os.path.dirname(os.path.abspath(__file__)), URL, "Cabinet du Canada (pm.gc.ca)",
       [{"titre": None, "grand": True, "membres": pm[:1]}, {"titre": f"Ministres ({len(mins)})", "grand": False, "membres": mins},
        {"titre": f"Secrétaires d'État ({len(sec)})", "grand": False, "membres": sec}], 20)
