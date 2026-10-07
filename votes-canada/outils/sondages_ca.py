"""Votes Canada : sondages fédéraux (Qc125, page « Sondages fédéraux ») → ../sondages.json

Chaque sondage national depuis l'élection du 28 avril 2025 : date, firme, intentions de vote par parti.
L'élection générale est gardée comme repère. Relancé par le pipeline aux 3 heures.
Usage : /usr/bin/python3 sondages_ca.py   (dans le dossier outils/)
"""
import json, os, urllib.request


def verifie(page):
    """Date et heure de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    h = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")); a = h.date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "heure": h.strftime("%H:%M"), "texte": f"{a.day} {m[a.month - 1]} {a.year} à {h.hour} h {h.minute:02d}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
HDR = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "fr-CA,fr;q=0.9"}
SORTIE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sondages.json")
COLONNES = ["PLC", "PCC", "NPD", "PVC", "BQ"]   # ordre des colonnes du tableau Qc125 (vérifié sur la ligne de l'élection de 2025)
DEPUIS = "2025-04-28"

with urllib.request.urlopen(urllib.request.Request("https://qc125.com/canada/sondages.htm", headers=HDR), timeout=60) as r:
    page = r.read().decode("utf-8", "ignore")
cle = "window.demopoll_TABLE_DATA = "
i = page.find(cle)
if i < 0: raise SystemExit("Tableau des sondages introuvable sur Qc125 : sondages.json inchangé.")
donnees, _ = json.JSONDecoder().raw_decode(page[i + len(cle):])
sondages = []
for r in donnees["demos"]["National"]["rows"]:
    if r.get("date", "") < DEPUIS: continue
    try:
        v = {p: float(c.get("label", "")) for p, c in zip(COLONNES, r.get("cells", []))}
    except ValueError:
        continue
    if len(v) != len(COLONNES) or not 80 <= sum(v.values()) <= 101: continue
    election = bool(r.get("generalelx"))
    sondages.append({"d": r["date"], "f": "Élection générale" if election else r.get("firm", ""), "e": election, "n": r.get("sample", ""), **v})
sondages.sort(key=lambda s: s["d"])
e25 = next((s for s in sondages if s["e"] and s["d"] == DEPUIS), None)
if not e25 or abs(e25["PLC"] - 43.8) > 0.2 or abs(e25["PCC"] - 41.3) > 0.2 or abs(e25["BQ"] - 6.3) > 0.2:
    raise SystemExit(f"Colonnes du tableau Qc125 changées ({e25}) : sondages.json inchangé.")
if len(sondages) < 20: raise SystemExit(f"Seulement {len(sondages)} sondages lus : sondages.json inchangé.")
json.dump({"source": "Qc125 (qc125.com/canada/sondages.htm)", "sondages": sondages},
          open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(sondages)} sondages depuis {DEPUIS} · dernier : {sondages[-1]['d']} {sondages[-1]['f']} {({k: sondages[-1][k] for k in ('PLC', 'PCC', 'NPD', 'BQ')})}")
verifie("canada")
