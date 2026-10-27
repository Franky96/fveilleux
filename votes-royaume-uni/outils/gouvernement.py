"""Votes Royaume-Uni : ministres du gouvernement (gov.uk/government/ministers) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes Royaume-Uni : le premier ministre, les ministres du Cabinet et ceux qui assistent au
Cabinet, avec leur photo officielle. Le parti vient de actuel.json (députés) ; les pairs n'ont pas de couleur. Les titres restent
les titres officiels en anglais. Relancé par le pipeline (votes-quebec-qc125.yml), après sondages_uk.py.
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import json, os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import lire, texte, membre, ecrire

URL = "https://www.gov.uk/government/ministers"
page = lire(URL)
cle = lambda s: re.sub(r"[^a-z]", "", s.lower())
partis = {}
try:
    act = json.load(open(os.path.join(ICI, "..", "actuel.json"), encoding="utf-8"))
    partis = {cle(a["nom"]): a["p"] for a in act["circ"] if a}
except Exception:
    pass


def section(ident):
    m = re.search(r'<ul id="' + ident + r'[^"]*"[^>]*>(.*?)</ul>\s*(?:</section>|<section)', page, re.S)
    out = []
    for li in re.findall(r"<li[^>]*>(.*?)</li>", m.group(1) if m else "", re.S):
        t = re.search(r'<a class="gem-c-image-card__title-link[^>]*href="([^"]+)"[^>]*>(.*?)</a>', li, re.S)
        if not t: continue
        nom = re.sub(r"(\s+(MP|KC|CBE|OBE|MBE|DL))+$", "", texte(t.group(2)))
        desc = re.search(r'gem-c-image-card__description">(.*?)</div>', li, re.S)
        roles = [texte(a) for a in re.findall(r"<a [^>]*>(.*?)</a>", desc.group(1), re.S)] if desc else []
        img = re.search(r'<img [^>]*src="([^"]+)"', li)
        out.append(membre(nom, roles, img.group(1) if img else None, t.group(1), partis.get(cle(re.sub(r"^(Dame|Sir)\s+|\s+(DBE|KBE|CBE)$", "", nom)))))
    return out


cab, aussi = section("cabinet"), section("also-attends-cabinet")
pm = [m for m in cab if any(r == "Prime Minister" for r in m["roles"])]
if not pm: raise SystemExit("premier ministre introuvable sur gov.uk")
reste = [m for m in cab if m not in pm]
ecrire(ICI, URL, "gov.uk, ministres du gouvernement (titres officiels en anglais)",
       [{"titre": None, "grand": True, "membres": pm[:1]}, {"titre": f"Cabinet ({len(reste)})", "grand": False, "membres": reste},
        {"titre": f"Assistent au Cabinet ({len(aussi)})", "grand": False, "membres": aussi}], 15)
