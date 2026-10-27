"""Votes Allemagne : Bundeskabinett (bundesregierung.de) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de Votes Allemagne : le chancelier, le vice-chancelier et les ministres fédéraux, avec leur
photo officielle. Les fonctions sont traduites en français (TRADUCTION) ; une fonction inconnue reste en allemand. Relancé par le pipeline (votes-quebec-qc125.yml).
Usage : python3 gouvernement.py   (dans le dossier outils/)
"""
import os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "votes-quebec", "outils"))
from gouv_commun import lire, texte, membre, ecrire

# portefeuilles : texte allemand de la page (après « Bundesminister(in) ») → français ; un portefeuille inconnu garde son texte allemand
TRADUCTION = {
    "der Finanzen": "des Finances", "des Innern": "de l'Intérieur", "des Auswärtigen": "des Affaires étrangères", "der Verteidigung": "de la Défense",
    "für Wirtschaft und Energie": "de l'Économie et de l'Énergie", "für Forschung, Technologie und Raumfahrt": "de la Recherche, de la Technologie et de l'Espace",
    "der Justiz und für Verbraucherschutz": "de la Justice et de la Protection des consommateurs",
    "für Bildung, Familie, Senioren, Frauen und Jugend": "de l'Éducation, de la Famille, des Aînés, des Femmes et de la Jeunesse",
    "für Arbeit und Soziales": "du Travail et des Affaires sociales", "für Digitales und Staatsmodernisierung": "du Numérique et de la Modernisation de l'État",
    "für Verkehr": "des Transports", "für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit": "de l'Environnement, de l'Action climatique, de la Protection de la nature et de la Sûreté nucléaire",
    "für Gesundheit": "de la Santé", "für Landwirtschaft, Ernährung und Heimat": "de l'Agriculture, de l'Alimentation et de la Heimat (pays natal)",
    "für wirtschaftliche Zusammenarbeit und Entwicklung": "de la Coopération économique et du Développement",
    "für Wohnen, Stadtentwicklung und Bauwesen": "du Logement, du Développement urbain et de la Construction",
    "für besondere Aufgaben/Chefin des Bundeskanzleramtes": "chargée de missions spéciales et cheffe de la Chancellerie fédérale",
    "für besondere Aufgaben/Chef des Bundeskanzleramtes": "chargé de missions spéciales et chef de la Chancellerie fédérale",
}


def traduire(role):
    if role == "Bundeskanzler": return "Chancelier fédéral"
    if role == "Bundeskanzlerin": return "Chancelière fédérale"
    if role == "Vizekanzler": return "Vice-chancelier fédéral"
    if role == "Vizekanzlerin": return "Vice-chancelière fédérale"
    m = re.fullmatch(r"Bundesminister(in)?\s+(.+)", role)
    if m and m.group(2) in TRADUCTION:
        fr = TRADUCTION[m.group(2)]
        if fr.startswith("chargé"):
            return f"Ministre fédéral{'e' if m.group(1) else ''} " + (fr.replace("chargée", "chargé").replace("cheffe", "chef") if not m.group(1) else fr)
        return f"Ministre fédéral{'e' if m.group(1) else ''} {fr}"
    return role


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
    tous.append(membre(texte(h.group(2)), [traduire(r) for r in roles], (HOTE + img.group(1)) if img else None, url))
chef = [m for m in tous if "Chancelier fédéral" in m["roles"] or "Chancelière fédérale" in m["roles"]]
if not chef: raise SystemExit("chancelier introuvable dans la page du Bundeskabinett")
reste = [m for m in tous if m not in chef]
ecrire(ICI, URL, "Bundesregierung, Bundeskabinett (fonctions traduites en français)",
       [{"titre": None, "grand": True, "membres": chef[:1]}, {"titre": f"Ministres fédéraux ({len(reste)})", "grand": False, "membres": reste}], 12)
