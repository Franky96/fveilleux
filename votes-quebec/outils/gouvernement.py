"""Conseil des ministres du Québec (liste officielle de l'Assemblée nationale) → ../gouvernement.json

Fenêtre « Gouvernement actuel » de l'onglet « Votes Québec » : premier ministre, vice-premier ministre et ministres avec
leurs fonctions, d'après assnat.qc.ca (Fonctions parlementaires et ministérielles · Conseil des ministres). Chaque membre est
relié à sa circonscription par deputes.json (même page de député) : la photo passe par api/photo-depute.php. Relancé chaque
jour par le pipeline, après deputes.py.
Usage : /usr/bin/python3 gouvernement.py   (dans le dossier outils/)
"""
import html, json, os, re, urllib.request

URL = "https://www.assnat.qc.ca/fr/deputes/fonctions-parlementaires-ministerielles/conseil-ministres.html"
ICI = os.path.dirname(__file__)
SORTIE = os.path.join(ICI, "..", "gouvernement.json")

page = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (fveilleux.com)"}), timeout=60).read().decode("utf-8", "replace")
deputes = json.load(open(os.path.join(ICI, "..", "deputes.json"), encoding="utf-8"))["deputes"]
par_url = {d["url"]: circ for circ, d in deputes.items()}

membres = []
for bloc in re.findall(r'<div class="blocImageTitreEtTexte">(.*?)</div>', page, re.S):
    lien = re.search(r'<p class=.blocImgTxtLien.>\s*<a href="([^"]+)">(.*?)</a>', bloc, re.S)
    if not lien: continue
    url = "https://www.assnat.qc.ca" + lien.group(1)
    nom, _, prenom = html.unescape(re.sub(r"<[^>]+>", "", lien.group(2))).replace("\xa0", " ").strip().partition(",")
    desc = re.search(r"<p class=.blocImgTxtDescription.>(.*?)</p>", bloc, re.S)
    roles = [r for r in (html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.split(r"<br\s*/?>", desc.group(1) if desc else "")) if r]
    membres.append({"nom": f"{prenom.strip()} {nom.strip()}", "url": url, "circ": par_url.get(url), "roles": roles,
                    "pm": any(re.fullmatch(r"Premi[eè]re? ministre", r) for r in roles),
                    "vpm": any(re.fullmatch(r"Vice-premi[eè]re? ministre", r) for r in roles)})
if len(membres) < 10: raise SystemExit(f"Conseil des ministres illisible ({len(membres)} membres) : gouvernement.json inchangé.")
sortie = {"source": URL, "membres": membres}
json.dump(sortie, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
pm = [m["nom"] for m in membres if m["pm"]]; vpm = [m["nom"] for m in membres if m["vpm"]]
print(f"{len(membres)} membres · premier ministre : {', '.join(pm) or '?'} · vice-premier ministre : {', '.join(vpm) or '?'}"
      + (f" · sans circonscription reconnue : {[m['nom'] for m in membres if not m['circ']]}" if any(not m["circ"] for m in membres) else ""))
