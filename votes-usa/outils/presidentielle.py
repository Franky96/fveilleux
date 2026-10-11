"""Votes États-Unis : intentions de vote pour la présidentielle de 2028 → ../presidentielle.json

Source : Wikipédia anglais (sondages nationaux compilés avec un lien vers chaque sondage) :
  - primaires : « Nationwide opinion polling for the 2028 Democratic Party presidential primaries » et l'équivalent républicain
    (un tableau par année : maison de sondage, dates, échantillon, pourcentage de chaque candidat testé) ; le tableau
    « Polling aggregation » donne aussi les moyennes publiées par 270toWin et RealClearPolling ;
  - élection générale : section « Opinion polling » de « 2028 United States presidential election », un tableau par duel
    (ex. JD Vance contre Gavin Newsom) ;
  - marchés de prédiction (API publiques) : Polymarket (prix et historique quotidien) et Kalshi (prix du moment) pour le parti
    gagnant, le gagnant de la présidence et les investitures démocrate et républicaine. Si un marché est illisible,
    on garde les valeurs précédentes (les sondages restent mis à jour).
Seulement la bibliothèque standard : relancé par le pipeline aux 3 heures. Rien n'est écrit si une page est illisible.
Usage : /usr/bin/python3 presidentielle.py   (dans le dossier outils/)
"""
import datetime, json, os, re, time, urllib.error, urllib.request
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

# --- marchés de prédiction : probabilité = prix du contrat « oui » (milieu de l'écart achat-vente), en %
def get_json(url, essais=5):
    for k in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={**HDR, "Accept": "application/json"}), timeout=60) as rep:
                return json.loads(rep.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code != 429 or k == essais - 1: raise
            time.sleep(4 * (k + 1))                           # Kalshi limite le nombre de requêtes
def nom_marche(n):
    n = n.replace("J.D.", "JD").replace("Donald J. Trump", "Donald Trump").replace("’", "'").strip()
    return {"Dwayne 'The Rock' Johnson": "Dwayne Johnson", "AOC": "Alexandria Ocasio-Cortez"}.get(n, n)
def polymarket(slug):
    e = get_json(f"https://gamma-api.polymarket.com/events?slug={slug}")[0]
    out = {}
    for m in e["markets"]:
        if m.get("closed") or not m.get("active") or not m.get("outcomePrices") or not float(m.get("volume") or 0): continue   # doublons inactifs
        # comme l'affiche Polymarket : milieu de l'écart achat-vente, ou dernier échange si l'écart dépasse 10 cents (marché peu actif)
        b, a = float(m.get("bestBid") or 0), float(m.get("bestAsk") or 0)
        p = (b + a) / 2 if a and a - b <= 0.10 else float(m.get("lastTradePrice") or json.loads(m["outcomePrices"])[0])
        out[nom_marche(m.get("groupItemTitle") or m["question"])] = {"v": round(100 * p, 1), "jeton": json.loads(m["clobTokenIds"])[0]}
    return out
def kalshi(evenement):
    out = {}
    for m in get_json(f"https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker={evenement}&limit=200")["markets"]:
        if m.get("status") != "active": continue
        b, a, l = (float(m.get(k) or 0) for k in ("yes_bid_dollars", "yes_ask_dollars", "last_price_dollars"))
        out[nom_marche(m.get("yes_sub_title") or "")] = round(100 * ((b + a) / 2 if b and a else l), 1)
    time.sleep(3)
    return out
def historique(jeton):
    h = get_json(f"https://clob.polymarket.com/prices-history?market={jeton}&interval=max&fidelity=1440")["history"]
    jours = {}
    for x in h: jours[datetime.datetime.fromtimestamp(x["t"], datetime.timezone.utc).date().isoformat()] = round(100 * x["p"], 1)
    return [{"d": d, "v": v} for d, v in sorted(jours.items())]
def classer(pm, ks, n, parti=None):
    noms = set(pm) | set(ks)
    moy = lambda k: sum(x for x in (pm.get(k, {}).get("v"), ks.get(k)) if x is not None) / sum(1 for x in (pm.get(k), ks.get(k)) if x is not None)
    return [{"nom": k, **({"p": parti(k)} if parti else {}), "polymarket": pm.get(k, {}).get("v"), "kalshi": ks.get(k)}
            for k in sorted(noms, key=lambda k: -moy(k))[:n]]
ancien = os.path.join(ICI, "..", "presidentielle.json")
try:
    pp, kp = polymarket("which-party-wins-2028-us-presidential-election"), kalshi("KXPRESPARTY-2028")
    parti = {"polymarket": {"D": pp["Democratic"]["v"], "R": pp["Republican"]["v"]},
             "kalshi": {"D": kp["Democratic party"], "R": kp["Republican party"]}}
    pnd, knd = polymarket("democratic-presidential-nominee-2028"), kalshi("KXPRESNOMD-28")
    pnr, knr = polymarket("republican-presidential-nominee-2028"), kalshi("KXPRESNOMR-28")
    pg, kg = polymarket("presidential-election-winner-2028"), kalshi("KXPRESPERSON-28")
    nomD, nomR = classer(pnd, knd, 15), classer(pnr, knr, 15)
    camp = lambda k: "D" if k in {x["nom"] for x in nomD} else "R" if k in {x["nom"] for x in nomR} else ""
    hd, hr = historique(pp["Democratic"]["jeton"]), dict((x["d"], x["v"]) for x in historique(pp["Republican"]["jeton"]))
    marches = {"maj": datetime.date.today().isoformat(), "parti": parti, "gagnant": classer(pg, kg, 12, camp), "nomD": nomD, "nomR": nomR,
               "historique": [{"d": x["d"], "D": x["v"], "R": hr.get(x["d"])} for x in hd]}
    if not 90 <= parti["polymarket"]["D"] + parti["polymarket"]["R"] <= 110 or len(marches["historique"]) < 30:
        raise ValueError("prix du parti gagnant incohérents")
except Exception as e:                                         # marché illisible : valeurs précédentes
    print(f"Marchés de prédiction non mis à jour ({e})")
    marches = (json.load(open(ancien, encoding="utf-8")) if os.path.exists(ancien) else {}).get("marches")

json.dump({"source": "Wikipédia (sondages nationaux de la présidentielle 2028 et des primaires) ; marchés : Polymarket et Kalshi",
           "primaires": primaires, "duels": duels, **({"marches": marches} if marches else {})},
          open(os.path.join(ICI, "..", "presidentielle.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for p, x in primaires.items():
    print(f"Primaire {p} : {len(x['sondages'])} sondages du {x['sondages'][0]['d']} au {x['sondages'][-1]['d']} · moyennes publiées : "
          + ", ".join(f"{a['nom']} ({a['d']})" for a in x["agregats"]))
print(f"{len(duels)} duels : " + ", ".join(f"{x['R']} – {x['D']} ({len(x['sondages'])})" for x in duels))
if marches: print(f"Marchés du {marches['maj']} : parti gagnant {marches['parti']} · en tête : "
                 + ", ".join(f"{x['nom']} ({x['polymarket']} / {x['kalshi']})" for x in marches["gagnant"][:4]))
verifie("usa")
