"""Votes États-Unis : résultats des présidentielles de 2024 et 2020, État par État → ../presidentielles.json

Source : Wikipédia anglais, tableau « Results by state » de « 2024 United States presidential election » et de
« 2020 United States presidential election » (résultats certifiés : voix, pourcentages et grands électeurs de chaque candidat ;
le Maine et le Nebraska ont aussi une ligne par district, car ils attribuent une partie de leurs grands électeurs par district).
Fichier fixe. Usage : /usr/bin/python3 resultats_pres.py   (dans le dossier outils/ ; les pages brutes vont dans brut/)
"""
import json, os, re, urllib.request
from wikitab import tableaux

ICI = os.path.dirname(os.path.abspath(__file__))
HDR = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com)"}
NOMS_EN = {"Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO", "Connecticut": "CT",
           "Delaware": "DE", "District of Columbia": "DC", "D.C.": "DC", "Washington, D.C.": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
           "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
           "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
           "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
           "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
           "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA",
           "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY"}
ELECTIONS = {"2024": {"date": "2024-11-05", "noms": {"R": "Donald Trump", "D": "Kamala Harris"}},
             "2020": {"date": "2020-11-03", "noms": {"D": "Joe Biden", "R": "Donald Trump"}}}


def nombre(t):
    t = t.replace(",", "").replace("%", "").replace("−", "-").replace("–", "").strip()
    try: return float(t)
    except ValueError: return 0.0


sortie = {}
for an, info in ELECTIONS.items():
    brut = os.path.join(ICI, "brut", f"president{an}.html")
    if not os.path.exists(brut):
        os.makedirs(os.path.dirname(brut), exist_ok=True)
        url = f"https://en.wikipedia.org/w/index.php?title={an}_United_States_presidential_election&action=render"
        open(brut, "wb").write(urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60).read())
    tab = next(t for t in tableaux(open(brut, encoding="utf-8").read())
               if t["titre"] == "Results by state" and len(t["lignes"]) > 50)
    tete, sous = tab["lignes"][0], tab["lignes"][1]
    # colonnes de chaque parti : groupe de trois colonnes (voix, %, grands électeurs) sous l'en-tête du ticket
    col = {}
    for p, mot in (("R", "Republican"), ("D", "Democratic")):
        i = next(k for k, h in enumerate(tete) if mot in h and sous[k] == "Votes")
        col[p] = (i, i + 1, i + 2)
    itot = len(tete) - 1                                      # dernière colonne : total des voix
    etats, districts = {}, {}
    for l in tab["lignes"][2:]:
        nom = re.sub(r"\s*[†‡*].*$", "", l[0]).strip()
        m = re.match(r"(ME|NE)-(\d)", nom)
        if not m and nom not in NOMS_EN: continue              # total, lignes de titre répétées
        v = {p: round(nombre(l[c[1]]), 2) for p, c in col.items()}
        ve = {p: int(nombre(l[c[2]])) for p, c in col.items()}
        x = {"D": v["D"], "R": v["R"], "AUT": round(max(0.0, 100 - v["D"] - v["R"]), 2), "voix": int(nombre(l[itot])),
             "g": "D" if v["D"] > v["R"] else "R", "veg": ve}
        if m: districts[f"{m[1]}-{m[2]}"] = x
        else: etats[NOMS_EN[nom]] = x
    # grands électeurs de l'État : ceux de la ligne de l'État + ceux de ses districts (Maine, Nebraska)
    for ab, x in etats.items():
        x["ve"] = sum(x["veg"].values()) + sum(sum(d["veg"].values()) for k, d in districts.items() if k[:2] == ab)
    tot = next(l for l in tab["lignes"] if l[0].startswith("Total"))
    national = {p: round(nombre(tot[c[1]]), 2) for p, c in col.items()}
    national["AUT"] = round(100 - national["D"] - national["R"], 2)
    ve = {p: int(nombre(tot[c[2]])) for p, c in col.items()}
    if len(etats) != 51 or sum(x["ve"] for x in etats.values()) != 538 or sum(ve.values()) != 538:
        raise SystemExit(f"{an} : {len(etats)} États, {sum(x['ve'] for x in etats.values())} grands électeurs (51 et 538 attendus)")
    sortie[an] = {"date": info["date"], "noms": info["noms"], "national": national, "voix": {p: int(nombre(tot[c[0]])) for p, c in col.items()},
                  "ve": ve, "etats": dict(sorted(etats.items())), "districts": dict(sorted(districts.items()))}
    print(f"{an} : {len(etats)} États + {len(districts)} districts · grands électeurs {ve} · vote populaire {national}")
json.dump({"source": "Wikipédia (tableaux « Results by state », résultats certifiés)", **sortie},
          open(os.path.join(ICI, "..", "presidentielles.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
