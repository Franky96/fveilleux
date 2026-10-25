"""Députés en poste à l'Assemblée nationale du Québec (liste officielle) → ../deputes.json

Fiche d'une circonscription de l'onglet « Votes Québec » : le député affiché est celui de la liste officielle de l'Assemblée
nationale (assnat.qc.ca, « Liste des députés »), qui suit les dépouillements judiciaires, démissions, élections partielles et
changements d'allégeance ; une circonscription absente de la liste est un siège vacant. Relancé chaque jour par le pipeline.
Usage : /usr/bin/python3 deputes.py   (dans le dossier outils/)
"""
import html, json, os, re, unicodedata, urllib.request

URL = "https://www.assnat.qc.ca/fr/deputes/index.html"
SORTIE = os.path.join(os.path.dirname(__file__), "..", "deputes.json")
ALLEG = {"parti quebecois": "PQ", "parti liberal du quebec": "PLQ", "coalition avenir quebec": "CAQ", "quebec solidaire": "QS",
         "parti conservateur du quebec": "PCQ"}


def norm(s):
    return re.sub("[^a-z]", "", unicodedata.normalize("NFD", str(s).lower()).encode("ascii", "ignore").decode())


def sans_accents(s):
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode().strip()


page = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (fveilleux.com)"}), timeout=60).read().decode("utf-8", "replace")
data = json.load(open(os.path.join(os.path.dirname(__file__), "..", "data.json"), encoding="utf-8"))
par_nom = {norm(r["n"]): r["n"] for r in data["ridings"]}
deputes, inconnues = {}, []
for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
    tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
    if len(tds) < 3: continue
    lien = re.search(r'href="([^"]+)"', tds[0])
    nom_brut = html.unescape(re.sub(r"<[^>]+>", "", tds[0])).replace("\xa0", " ").strip()
    nom, _, prenom = nom_brut.partition(",")                                    # « Fogaing, Stephan »
    circ = html.unescape(re.sub(r"<[^>]+>", "", tds[1])).strip()
    alleg = html.unescape(re.sub(r"<[^>]+>", "", tds[2])).strip()
    cle = par_nom.get(norm(circ))
    if not cle: inconnues.append(circ); continue
    deputes[cle] = {"nom": f"{prenom.strip()} {nom.strip()}".strip(), "p": ALLEG.get(sans_accents(alleg), "AUT"), "allegeance": alleg,
                    "url": "https://www.assnat.qc.ca" + lien.group(1) if lien else URL}
if len(deputes) < 100: raise SystemExit(f"Liste des députés illisible ({len(deputes)} lus) : deputes.json inchangé.")
vacants = sorted(r["n"] for r in data["ridings"] if r["n"] not in deputes)
sortie = {"source": URL, "deputes": dict(sorted(deputes.items())), "vacants": vacants}
json.dump(sortie, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(deputes)} députés · sièges vacants : {', '.join(vacants) or 'aucun'}" + (f" · circonscriptions inconnues : {inconnues}" if inconnues else ""))
