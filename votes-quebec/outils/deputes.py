"""Députés en poste à l'Assemblée nationale du Québec (liste officielle) → ../deputes.json

Fiche d'une circonscription de l'onglet « Votes Québec » : le député affiché est celui de la liste officielle de l'Assemblée
nationale (assnat.qc.ca, « Liste des députés »), qui suit les dépouillements judiciaires, démissions, élections partielles et
changements d'allégeance ; une circonscription absente de la liste est un siège vacant. Photo officielle de chaque député
(img.photoDepute de sa page sur assnat.qc.ca, affichée depuis ce site) ; une page n'est relue que pour un nouveau député ou une
photo manquante. Relancé chaque jour par le pipeline.
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
# photos officielles : reprises du fichier précédent pour un même député, sinon lues sur sa page
try: avant = json.load(open(SORTIE, encoding="utf-8")).get("deputes", {})
except (OSError, ValueError): avant = {}
for cle, d in deputes.items():
    a = avant.get(cle) or {}
    if a.get("photo") and a.get("url") == d["url"]: d["photo"] = a["photo"]; continue
    try:
        p = urllib.request.urlopen(urllib.request.Request(d["url"], headers={"User-Agent": "Mozilla/5.0 (fveilleux.com)"}), timeout=30).read().decode("utf-8", "replace")
        m = re.search(r'<img[^>]*class="photoDepute"[^>]*>', p) and re.search(r'src="([^"]+)"', re.search(r'<img[^>]*class="photoDepute"[^>]*>', p).group(0))
        if m: d["photo"] = html.unescape(m.group(1)).replace("http://", "https://", 1)
    except Exception as e:
        print("Photo illisible :", d["nom"], e)
if len(deputes) < 100: raise SystemExit(f"Liste des députés illisible ({len(deputes)} lus) : deputes.json inchangé.")
vacants = sorted(r["n"] for r in data["ridings"] if r["n"] not in deputes)
sortie = {"source": URL, "deputes": dict(sorted(deputes.items())), "vacants": vacants}
json.dump(sortie, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(deputes)} députés ({sum(1 for d in deputes.values() if d.get('photo'))} photos) · sièges vacants : {', '.join(vacants) or 'aucun'}" + (f" · circonscriptions inconnues : {inconnues}" if inconnues else ""))
