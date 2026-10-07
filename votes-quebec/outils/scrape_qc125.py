"""Télécharge les projections Qc125 par circonscription → ridings.tsv (id, nom) et proj.json (nom → {parti: %}).

Qc125 (Apache mod_security) répond 406 sans en-têtes de navigateur : on envoie un User-Agent et un Accept complets.
Usage : /usr/bin/python3 scrape_qc125.py   (dans le dossier outils/)
"""
import re, html, json, time, datetime, zoneinfo, urllib.request

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


MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
districts = get("https://qc125.com/districts.htm")
links = re.findall(r"href='https://qc125.com/(\d+)f\.htm'[^>]*>([^<]+)</a>", districts)
assert len(links) >= 125, f"seulement {len(links)} circonscriptions trouvées"
proj, dates, erreurs = {}, [], []
for rid, name in links:
    t = text(get(f"https://qc125.com/{rid}f.htm"))
    seg = t[t.find("Historique récent"): t.find("Mise à jour", t.find("Historique récent"))]
    # Ordre conservé tel que publié (sert à départager les égalités, comme Qc125)
    shares = {p: int(v) for p, v in re.findall(r"\b(PQ|PLQ|CAQ|PCQ|QS)\b (\d+)% ±", seg)}
    # depuis l'élection de 2026, une fiche n'affiche que les partis présents dans la circonscription (absent = 0 %)
    if sum(shares.values()) < 90 or len(shares) < 3:
        erreurs.append(f"{rid} {name} {shares}")
    m = re.search(r"Mise à jour : (\d{1,2}) (" + "|".join(MOIS) + r") (\d{4})", t)
    if m: dates.append((int(m[3]), MOIS.index(m[2]) + 1, int(m[1])))
    proj[name] = shares
    time.sleep(0.3)
# Rien n'est écrit si une fiche est illisible : on garde les données précédentes (le pipeline échoue et avertit)
if erreurs:
    raise SystemExit("Fiches Qc125 illisibles, données non mises à jour :\n" + "\n".join(erreurs))
open("ridings.tsv", "w", encoding="utf-8").write("\n".join(f"{i}\t{n}" for i, n in links))
json.dump(proj, open("proj.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
a, m, j = max(dates) if dates else (0, 0, 0)
maj = {"date": f"{a:04d}-{m:02d}-{j:02d}", "texte": f"{j} {MOIS[m - 1]} {a}"} if dates else {}
json.dump(maj, open("maj.json", "w", encoding="utf-8"), ensure_ascii=False)
# date de la vérification (heure de Montréal) : affichée sur la page même si Qc125 n'a rien changé
auj = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")).date()
json.dump({"date": auj.isoformat(), "texte": f"{auj.day} {MOIS[auj.month - 1]} {auj.year}"},
          open("../verif.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"{len(proj)} circonscriptions enregistrées dans proj.json · mise à jour Qc125 : {maj.get('texte', '?')}")
