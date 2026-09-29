"""Télécharge les projections Qc125 par circonscription → ridings.tsv (id, nom) et proj.json (nom → {parti: %}).

Qc125 (Apache mod_security) répond 406 sans en-têtes de navigateur : on envoie un User-Agent et un Accept complets.
Usage : /usr/bin/python3 scrape_qc125.py   (dans le dossier outils/)
"""
import re, html, json, time, urllib.request

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
HDR = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
       "Accept-Language": "fr-CA,fr;q=0.9"}
PARTIES = ["PQ", "PLQ", "CAQ", "PCQ", "QS"]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def text(s):
    s = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", "", s)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s)))


districts = get("https://qc125.com/districts.htm")
links = re.findall(r"href='https://qc125.com/(\d+)f\.htm'[^>]*>([^<]+)</a>", districts)
assert len(links) >= 125, f"seulement {len(links)} circonscriptions trouvées"
open("ridings.tsv", "w", encoding="utf-8").write("\n".join(f"{i}\t{n}" for i, n in links))

proj = {}
for rid, name in links:
    t = text(get(f"https://qc125.com/{rid}f.htm"))
    seg = t[t.find("Historique récent"): t.find("Mise à jour", t.find("Historique récent"))]
    # Ordre conservé tel que publié (sert à départager les égalités, comme Qc125)
    shares = {p: int(v) for p, v in re.findall(r"\b(PQ|PLQ|CAQ|PCQ|QS)\b (\d+)% ±", seg)}
    if sum(shares.values()) < 90:
        print("À VÉRIFIER :", rid, name, shares)
    proj[name] = shares
    time.sleep(0.3)
json.dump(proj, open("proj.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{len(proj)} circonscriptions enregistrées dans proj.json")
