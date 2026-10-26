"""Mi-mandat aux États-Unis du 3 novembre 2026 (page « En direct ») : données fixes de la page.

  - carte.json : les 435 districts de 2026 (districts du Census de 2024, sauf dans les États redécoupés : tracés de 2026)
    et les 50 États + D.C., repris de votes-usa/data.json (mêmes sources que Votes États-Unis) ;
  - gouverneurs.json : les 36 courses de gouverneur de 2026 (consensus des prévisionnistes de 270toWin, gouverneur sortant,
    candidats de l'élection générale), et le parti des 14 gouverneurs qui ne sont pas en élection.
Le Sénat et la Chambre (cotes, sortants, candidats) viennent de votes-usa/projection.json, tenu à jour par le pipeline de Votes États-Unis.
Seulement la bibliothèque standard. Usage : python3 en-direct/etats-unis/outils/prep.py
"""
import json, os, re, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, "..", "..", ".."))
SORTIE = os.path.normpath(os.path.join(ICI, ".."))
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
COTE = {"0": "T", "1": "D3", "2": "R3", "3": "D2", "4": "R2", "5": "D1", "6": "R1", "a": "D1", "b": "R1"}
# les 14 gouverneurs qui ne sont pas en élection en 2026 (270toWin ne les donne pas) : National Governors Association, octobre 2026
SANS_COURSE = {"DE": ("Matt Meyer", "D"), "IN": ("Mike Braun", "R"), "KY": ("Andy Beshear", "D"), "LA": ("Jeff Landry", "R"), "MO": ("Mike Kehoe", "R"),
               "MS": ("Tate Reeves", "R"), "MT": ("Greg Gianforte", "R"), "NC": ("Josh Stein", "D"), "ND": ("Kelly Armstrong", "R"), "NJ": ("Mikie Sherrill", "D"),
               "UT": ("Spencer Cox", "R"), "VA": ("Abigail Spanberger", "D"), "WA": ("Bob Ferguson", "D"), "WV": ("Patrick Morrisey", "R")}
MOIS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def arrondir(g, d=3):
    """Coordonnées arrondies (~100 m), points répétés retirés ; anneau réduit à moins de 4 points (îlot minuscule) retiré."""
    def anneau(a):
        out = []
        for c in a:
            c = [round(c[0], d), round(c[1], d)]
            if not out or c != out[-1]: out.append(c)
        return out if len(out) >= 4 else None
    def poly(p):
        q = [anneau(a) for a in p]
        return None if q[0] is None else [q[0]] + [x for x in q[1:] if x]
    t = g["type"]
    if t == "Polygon": g["coordinates"] = poly(g["coordinates"])
    elif t == "MultiPolygon": g["coordinates"] = [x for x in (poly(p) for p in g["coordinates"]) if x]
    return g


def carte():
    D = json.load(open(os.path.join(RACINE, "votes-usa", "data.json"), encoding="utf-8"))
    redec = {next(e["fips"] for e in D["etats"] if e["ab"] == ab) for ab in D["redecoupes"]}
    noms = {d["id"]: d["n"] for d in D["districts"]}
    feats = [f for f in D["geo24"]["features"] if f["properties"]["id"][:2] not in redec] + D["geo26"]["features"]
    dist = [{"type": "Feature", "properties": {"id": f["properties"]["id"], "n": noms.get(f["properties"]["id"], f["properties"]["id"])}, "geometry": arrondir(f["geometry"])} for f in feats]
    assert len(dist) == 435, len(dist)
    ab = {e["fips"]: e for e in D["etats"]}
    etats = []
    for f in D["geoEtats"]["features"]:
        p = f["properties"]; fips = p.get("fips") or p.get("id")
        e = ab.get(fips, {"ab": "DC", "nom": "District de Columbia"})
        etats.append({"type": "Feature", "properties": {"fips": fips, "ab": e["ab"], "nom": e["nom"]}, "geometry": arrondir(f["geometry"])})
    json.dump({"districts": {"type": "FeatureCollection", "features": dist}, "etats": {"type": "FeatureCollection", "features": etats}},
              open(os.path.join(SORTIE, "carte.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("carte.json :", len(dist), "districts,", len(etats), "États")


def gouverneurs():
    with urllib.request.urlopen(urllib.request.Request("https://www.270towin.com/2026-governor-election/consensus-2026-governor-forecast", headers=UA), timeout=60) as r:
        p = r.read().decode("utf-8", "ignore")
    obj = lambda cle: json.JSONDecoder().raw_decode(p[p.index("=", p.index(cle)) + 1:].lstrip())[0]
    chaine = re.search(r"new GovernorMap\('(\w+)'", p)[1]
    sieges = obj("map_d3.seats =")
    D = json.load(open(os.path.join(RACINE, "votes-usa", "data.json"), encoding="utf-8"))
    ordre = [e["fips"] for e in sorted(D["etats"], key=lambda e: e["ab"])]   # la chaîne suit l'ordre alphabétique des abréviations des 50 États
    assert len(chaine) == len(ordre) == 50, (len(chaine), len(ordre))
    m = re.search(r"map_d3\.date_created_formatted = '([A-Z][a-z]+)\.? (\d+), (\d{4})", p)
    out = {"source": "Consensus de 270toWin (Cook Political Report, Sabato's Crystal Ball, Inside Elections, etc.)",
           "maj": f"{m[3]}-{MOIS[m[1][:3]]:02d}-{int(m[2]):02d}" if m else None, "etats": {}}
    for code, fips in zip(chaine, ordre):
        s = (sieges.get(fips) or [{}])[0]
        ab = next(x["ab"] for x in D["etats"] if x["fips"] == fips)
        if code not in COTE and ab not in SANS_COURSE: raise SystemExit(f"{ab} : pas de course de gouverneur selon 270toWin, absent de SANS_COURSE")
        e = {"gov": (s.get("seat_gov_name") or SANS_COURSE.get(ab, ("", ""))[0]).strip(), "p": s.get("seat_party") or SANS_COURSE.get(ab, ("", ""))[1], "course": code in COTE}
        if code in COTE:
            e["r"] = COTE[code]
            e["limite"] = "term limits" in (s.get("retired_notes") or "").lower()
            e["ret"] = bool(s.get("retired_notes"))
            e["cands"] = [{"nom": c.get("full_name") or "", "p": c.get("party") or "", "inc": int(c.get("is_incumbent") or 0)}
                          for c in s.get("candidates") or [] if str(c.get("general_election_active")) == "2"]
        out["etats"][fips] = e
    n = sum(e["course"] for e in out["etats"].values())
    assert n == 36, f"{n} courses de gouverneur (36 attendues)"
    json.dump(out, open(os.path.join(SORTIE, "gouverneurs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("gouverneurs.json :", n, "courses")


carte(); gouverneurs()
