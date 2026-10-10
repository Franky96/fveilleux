"""Votes États-Unis : intentions de vote pour la présidentielle de 2028 → ../presidentielle.json

Source : Wikipédia anglais (sondages nationaux compilés avec un lien vers chaque sondage) :
  - primaires : « Nationwide opinion polling for the 2028 Democratic Party presidential primaries » et l'équivalent républicain
    (un tableau par année : maison de sondage, dates, échantillon, pourcentage de chaque candidat testé) ; le tableau
    « Polling aggregation » donne aussi les moyennes publiées par 270toWin et RealClearPolling ;
  - élection générale : section « Opinion polling » de « 2028 United States presidential election », un tableau par duel
    (ex. JD Vance contre Gavin Newsom).
Seulement la bibliothèque standard : relancé par le pipeline aux 3 heures. Rien n'est écrit si une page est illisible.
Usage : /usr/bin/python3 presidentielle.py   (dans le dossier outils/)
"""
import json, os, re, urllib.request
from wikitab import tableaux


def verifie(page):
    """Date et heure de la vérification (heure de Montréal) dans /votes-verif.json : affichée sur la page même si rien n'a changé."""
    import datetime, json as _j, os as _o, zoneinfo
    f = _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), "..", "..", "votes-verif.json")
    v = _j.load(open(f, encoding="utf-8")) if _o.path.exists(f) else {}
    h = datetime.datetime.now(zoneinfo.ZoneInfo("America/Montreal")); a = h.date()
    m = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    v[page] = {"date": a.isoformat(), "heure": h.strftime("%H:%M"), "texte": f"{a.day} {m[a.month - 1]} {a.year} à {h.hour} h {h.minute:02d}"}
    _j.dump(dict(sorted(v.items())), open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

ICI = os.path.dirname(os.path.abspath(__file__))
HDR = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com)"}
MOIS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
RE_MOIS = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"


def page(titre):
    url = f"https://en.wikipedia.org/w/index.php?title={titre}&action=render"
    return urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=90).read().decode("utf-8")


def date_fin(t):
    """« September 26–28, 2026 », « Dec 30, 2025 – Jan 3, 2026 », « December 23, 2024 » → date de fin (AAAA-MM-JJ)."""
    ans = re.findall(r"\b(20\d\d)\b", t); mois = re.findall(RE_MOIS, t)
    if not ans or not mois: return None
    reste = re.sub(r"\b20\d\d\b", "", t)
    jours = [int(j) for j in re.findall(r"\b(\d{1,2})\b", reste) if 1 <= int(j) <= 31]
    if not jours: return None
    return f"{ans[-1]}-{MOIS[mois[-1][:3].lower()]:02d}-{jours[-1]:02d}"


def pct(t):
    m = re.match(r"^\s*<?\s*(\d+(?:\.\d+)?)\s*%", t)
    return float(m[1]) if m else None


def nom_propre(t):
    return re.sub(r"\s*\((?:R|D|I)\)\s*$", "", re.sub(r"\s+", " ", t)).strip()


# --- primaires
primaires = {}
for p, parti in (("D", "Democratic"), ("R", "Republican")):
    tabs = [t for t in tableaux(page(f"Nationwide_opinion_polling_for_the_2028_{parti}_Party_presidential_primaries")) if "wikitable" in t["classe"]]
    sondages, agregats = [], []
    for t in tabs:
        tete = t["lignes"][0] if t["lignes"] else []
        if tete[:2] == ["Aggregator", "Updated"]:
            noms = tete[2:]
            for l in t["lignes"][1:]:
                if l[0] not in ("270toWin", "Real Clear Polling", "RealClearPolling"): continue
                v = {nom_propre(n): pct(x) for n, x in zip(noms, l[2:]) if n not in ("Other", "Lead", "Undecided") and pct(x) is not None}
                if date_fin(l[1]) and v: agregats.append({"nom": "RealClearPolling" if "Real" in l[0] else l[0], "d": date_fin(l[1]), "v": v})
            continue
        if not re.fullmatch(r"20\d\d", t["titre"]) or not tete or not tete[0].startswith("Poll source"): continue
        noms = tete[3:]
        for l in t["lignes"][1:]:
            if len(l) < len(tete): continue
            d = date_fin(l[1])
            v = {nom_propre(n): pct(x) for n, x in zip(noms, l[3:]) if n not in ("Other", "Undecided", "Lead") and pct(x) is not None}
            if not d or len(v) < 3: continue
            sondages.append({"d": d, "f": re.sub(r"\s+", " ", l[0]).strip(), "n": l[2], "v": v})
    sondages.sort(key=lambda s: s["d"])
    if len(sondages) < 50: raise SystemExit(f"Primaire {p} : {len(sondages)} sondages lus (au moins 50 attendus) : presidentielle.json inchangé.")
    primaires[p] = {"sondages": sondages, "agregats": agregats}

# --- élection générale : un tableau par duel, sous l'intertitre « X vs. Y »
duels = []
for t in tableaux(page("2028_United_States_presidential_election")):
    # sondages nationaux seulement (les sondages d'un État sont sous l'intertitre « Statewide »)
    if "wikitable" not in t["classe"] or " vs. " not in t["titre"] or t["titres"].get("h4") != "Nationwide" or not t["lignes"]: continue
    tete = t["lignes"][0]
    if not tete or not tete[0].startswith("Poll source"): continue
    cols = {}
    for k, h in enumerate(tete):
        m = re.search(r"\((R|D)\)", h)
        if m: cols[m[1]] = k
    if set(cols) != {"R", "D"}: continue
    a, b = [x.strip() for x in t["titre"].split(" vs. ")]
    noms = {"R": a, "D": b} if nom_propre(tete[cols["R"]]).split()[-1] in a else {"R": b, "D": a}
    liste = []
    for l in t["lignes"][1:]:
        if len(l) < len(tete): continue
        d, r_, d_ = date_fin(l[1]), pct(l[cols["R"]]), pct(l[cols["D"]])
        if d and r_ is not None and d_ is not None:
            liste.append({"d": d, "f": re.sub(r"\s+", " ", l[0]).strip(), "n": l[2], "R": r_, "D": d_})
    if liste and t["titre"] not in [x["titre"] for x in duels]:
        duels.append({"titre": t["titre"], "R": noms["R"], "D": noms["D"], "sondages": sorted(liste, key=lambda s: s["d"])})
if not duels: raise SystemExit("Aucun duel lu pour l'élection générale : presidentielle.json inchangé.")

json.dump({"source": "Wikipédia (sondages nationaux de la présidentielle 2028 et des primaires)", "primaires": primaires, "duels": duels},
          open(os.path.join(ICI, "..", "presidentielle.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for p, x in primaires.items():
    print(f"Primaire {p} : {len(x['sondages'])} sondages du {x['sondages'][0]['d']} au {x['sondages'][-1]['d']} · moyennes publiées : "
          + ", ".join(f"{a['nom']} ({a['d']})" for a in x["agregats"]))
print(f"{len(duels)} duels : " + ", ".join(f"{x['R']} – {x['D']} ({len(x['sondages'])})" for x in duels))
verifie("usa")
