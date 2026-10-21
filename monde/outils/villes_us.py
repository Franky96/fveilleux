"""Information Monde : les 5 villes les plus peuplées de chaque État des États-Unis, plus la capitale de l'État (demande
de l'utilisateur), dans monde/villes-us.json (même forme que monde/villes-ca.json).

Sources :
- population : estimations du Census Bureau au 1er juillet 2025 (sub-est2025, municipalités constituées, niveau 162 ;
  domaine public) ; Hawaï n'a pas de municipalités constituées (seule Urban Honolulu y figure) : recensement de 2020 des
  localités désignées « CDP » du Gazetteer, d'après Wikidata (P1082 au 1er avril 2020 ; l'API du Census exige une clé) ;
- coordonnées : répertoire géographique du Census (Gazetteer 2025, point intérieur de chaque localité) ;
- nom en français et drapeau : Wikidata (CC0), par le code FIPS 55-3 de la localité (P774) ; une ville fusionnée avec son
  comté (Nashville, Louisville, Augusta…) a deux éléments, la ville et sa partie « (balance) » : on prend la ville
  (`VRAIE_VILLE`, par son article de Wikipédia en anglais) ;
- drapeau : fichier de Wikimedia Commons (P41, sinon image de l'élément « drapeau » P163 : Boston, Miami…), vignette de 500 px affichée depuis Wikimedia, avec auteur et licence.
Usage : python3 monde/outils/villes_us.py
"""
import csv, io, json, os, re, time, urllib.error, urllib.parse, urllib.request, zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
MONDE = os.path.dirname(ICI)
UA = {"User-Agent": "fveilleux-monde/1.0 (https://fveilleux.com)"}
POP = "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/cities/totals/sub-est2025.csv"
GAZ = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip"
PAR_ETAT = 5
CAPITALES = {
    "AL": "Montgomery", "AK": "Juneau", "AZ": "Phoenix", "AR": "Little Rock", "CA": "Sacramento", "CO": "Denver", "CT": "Hartford",
    "DE": "Dover", "FL": "Tallahassee", "GA": "Atlanta", "HI": "Honolulu", "ID": "Boise", "IL": "Springfield", "IN": "Indianapolis",
    "IA": "Des Moines", "KS": "Topeka", "KY": "Frankfort", "LA": "Baton Rouge", "ME": "Augusta", "MD": "Annapolis", "MA": "Boston",
    "MI": "Lansing", "MN": "St. Paul", "MS": "Jackson", "MO": "Jefferson City", "MT": "Helena", "NE": "Lincoln", "NV": "Carson City",
    "NH": "Concord", "NJ": "Trenton", "NM": "Santa Fe", "NY": "Albany", "NC": "Raleigh", "ND": "Bismarck", "OH": "Columbus",
    "OK": "Oklahoma City", "OR": "Salem", "PA": "Harrisburg", "RI": "Providence", "SC": "Columbia", "SD": "Pierre", "TN": "Nashville",
    "TX": "Austin", "UT": "Salt Lake City", "VT": "Montpelier", "VA": "Richmond", "WA": "Olympia", "WV": "Charleston", "WI": "Madison",
    "WY": "Cheyenne", "DC": "Washington",
}
# partie « (balance) » d'une ville fusionnée avec son comté, ou localité de recensement : la ville elle-même
VRAIE_VILLE = {"47-52006": "Nashville, Tennessee", "21-48006": "Louisville, Kentucky", "15-71550": "Honolulu",
               "13-04204": "Augusta, Georgia", "13-03440": "Athens, Georgia", "13-49008": "Macon, Georgia",
               "13-19007": "Columbus, Georgia", "30-11397": "Butte, Montana", "21-46027": "Lexington, Kentucky"}


def lire(url, essais=6):
    for i in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:   # limites de débit de Wikimedia : on attend
            if e.code not in (429, 503) or i == essais - 1: raise
            time.sleep(15 * (i + 1))


def sparql(q):
    d = json.loads(lire("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q)))
    return [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]]


def nettoyer(nom):
    """« Nashville-Davidson metropolitan government (balance) » → « Nashville-Davidson » (nom de secours, et capitales)."""
    nom = nom.replace(" (balance)", "")
    nom = re.sub(r" (city and borough|metropolitan government|consolidated government|unified government|urban county|"
                 r"metro government|municipality|city|town|village|borough|CDP)$", "", nom)
    return {"Urban Honolulu": "Honolulu", "Boise City": "Boise"}.get(nom, nom)


def est_capitale(nom, cap):
    return nom == cap or any(nom.startswith(cap + s) for s in (" ", "-", "/"))


def main():
    # localités : code FIPS de l'État → abréviation, coordonnées
    z = zipfile.ZipFile(io.BytesIO(lire(GAZ)))
    gaz = list(csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), "utf-8"), delimiter="|"))
    coord = {g["GEOID"]: (float(g["INTPTLONG"].strip()), float(g["INTPTLAT"])) for g in gaz}
    usps = {g["GEOID"][:2]: g["USPS"] for g in gaz}
    # population 2025 (municipalités constituées), Hawaï : recensement de 2020
    lignes = csv.DictReader(io.StringIO(lire(POP).decode("latin-1")))
    places = {}
    for x in lignes:
        if x["SUMLEV"] != "162": continue   # (Hawaï : seule Urban Honolulu, estimation 2025 ; le reste du recensement de 2020)
        places[x["STATE"] + x["PLACE"]] = {"nom": x["NAME"], "pop": int(x["POPESTIMATE2025"]), "an": 2025}
    hi = {f'{g["GEOID"][:2]}-{g["GEOID"][2:]}': g for g in gaz if g["USPS"] == "HI"}
    vals = " ".join(f'"{k}"' for k in hi)
    for b in sparql(f'''SELECT ?f (MAX(?p) AS ?pop) WHERE {{ VALUES ?f {{ {vals} }} ?v wdt:P774 ?f ; p:P1082 ?s .
        ?s ps:P1082 ?p ; pq:P585 ?t . FILTER(YEAR(?t) = 2020) }} GROUP BY ?f'''):
        g = hi[b["f"]]; places.setdefault(g["GEOID"], {"nom": g["NAME"], "pop": int(float(b["pop"])), "an": 2020})
    # 5 plus peuplées par État, plus la capitale
    par = {}
    for geoid, p in places.items(): par.setdefault(geoid[:2], []).append((geoid, p))
    choix = []
    for st, L in par.items():
        if st not in usps: continue
        e = usps[st]; L.sort(key=lambda t: -t[1]["pop"])
        garde = L[:PAR_ETAT]
        cap = [t for t in L if est_capitale(nettoyer(t[1]["nom"]), CAPITALES.get(e, "?"))]
        if cap and cap[0] not in garde: garde.append(cap[0])
        if not cap: print("capitale introuvable :", e, CAPITALES.get(e))
        for geoid, p in garde:
            choix.append({"geoid": geoid, "prov": "US-" + e, **p, "cap": ("US" if e == "DC" else "US-" + e) if cap and (geoid, p) == cap[0] else None})
    print(len(choix), "villes")
    # Wikidata : élément, nom en français, drapeau
    fips = {f'{c["geoid"][:2]}-{c["geoid"][2:]}': c for c in choix}
    wd = {}
    cles = list(fips)
    for i in range(0, len(cles), 120):
        vals = " ".join(f'"{k}"' for k in cles[i:i + 120])
        for b in sparql(f'''SELECT ?f ?v ?fr ?en ?flag ?art WHERE {{ VALUES ?f {{ {vals} }} ?v wdt:P774 ?f .
            OPTIONAL {{ ?v rdfs:label ?fr . FILTER(LANG(?fr) = "fr") }} OPTIONAL {{ ?v rdfs:label ?en . FILTER(LANG(?en) = "en") }}
            OPTIONAL {{ ?v wdt:P41 ?flag1 }} OPTIONAL {{ ?v wdt:P163 ?fi . ?fi wdt:P18 ?flag2 }} BIND(COALESCE(?flag1, ?flag2) AS ?flag)
            OPTIONAL {{ ?art schema:about ?v ; schema:isPartOf <https://en.wikipedia.org/> }} }}'''):
            wd.setdefault(b["f"], []).append(b)
        time.sleep(2)
    titres = {t: f for f, t in VRAIE_VILLE.items() if f in fips}
    if titres:
        vals = " ".join(f'"{t}"@en' for t in titres)
        for b in sparql(f'''SELECT ?t ?v ?fr ?en ?flag ?art WHERE {{ VALUES ?t {{ {vals} }} ?a schema:about ?v ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t .
            OPTIONAL {{ ?v rdfs:label ?fr . FILTER(LANG(?fr) = "fr") }} OPTIONAL {{ ?v rdfs:label ?en . FILTER(LANG(?en) = "en") }}
            OPTIONAL {{ ?v wdt:P41 ?flag1 }} OPTIONAL {{ ?v wdt:P163 ?fi . ?fi wdt:P18 ?flag2 }} BIND(COALESCE(?flag1, ?flag2) AS ?flag)
            OPTIONAL {{ ?art schema:about ?v ; schema:isPartOf <https://en.wikipedia.org/> }} }}'''):
            wd[titres[b["t"]]] = [b]
    villes = []
    for f, c in fips.items():
        B = wd.get(f) or []
        # (plusieurs éléments pour un code : celui qui a un drapeau, sinon le premier)
        b = next((x for x in B if x.get("flag")), B[0] if B else {})
        lon, lat = coord.get(c["geoid"], (None, None))
        if lon is None: print("sans coordonnées :", c["nom"]); continue
        v = {"q": b["v"].rsplit("/", 1)[1] if b else "US" + c["geoid"], "pop": c["pop"], "an": c["an"], "prov": c["prov"],
             "fips": f, "lon": round(lon, 3), "lat": round(lat, 3), "nom": b.get("fr") or nettoyer(c["nom"])}
        if c["cap"]: v["cap"] = c["cap"]
        if b.get("flag"): v["_fichier"] = urllib.parse.unquote(b["flag"].rsplit("/", 1)[1])
        if b.get("art"): v["_en"] = urllib.parse.unquote(b["art"].rsplit("/", 1)[1]).replace("_", " ")
        villes.append(v)
    # drapeaux déjà trouvés (liste précédente) : repris tels quels, sans rien redemander à Wikimedia
    try: avant = {v["q"]: v for v in json.load(open(os.path.join(MONDE, "villes-us.json"), encoding="utf-8"))}
    except (OSError, ValueError): avant = {}
    for v in villes:
        dr = avant.get(v["q"], {}).get("drapeau")
        if dr and dr.get("licence"): v["drapeau"] = dr; v.pop("_fichier", None)
    # sans drapeau dans Wikidata : celui de l'infobox de l'article anglais (souvent un fichier non libre de Wikipédia,
    # comme pour le Canada) ; Wikipédia limite le débit : un lot refusé est sauté (relancer le script le complète)
    wp = lambda **p: json.loads(lire("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {"format": "json", "formatversion": "2", **p}), essais=2))
    sans = [v for v in villes if "_fichier" not in v and "drapeau" not in v and "_en" in v]
    for k in range(0, len(sans), 20):
        lot = sans[k:k + 20]
        try: d = wp(action="query", prop="revisions", rvprop="content", rvslots="main", redirects=1, titles="|".join(v["_en"] for v in lot))
        except urllib.error.HTTPError: print("Wikipédia : lot d'articles sauté (débit limité)"); continue
        norm = {x["from"]: x["to"] for x in d["query"].get("redirects", []) + d["query"].get("normalized", [])}
        pages = {p["title"]: p for p in d["query"]["pages"]}
        for v in lot:
            p = pages.get(norm.get(v["_en"], v["_en"]))
            txt = p and p.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
            m = txt and re.search(r"\|\s*image_flag\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n<{}]+)", txt)
            if m and m.group(1).strip(): v["_fichier"] = m.group(1).strip()
        time.sleep(1)
    # licence et adresse de chaque fichier (Wikipédia anglaise : voit aussi les fichiers de Commons) ; lot refusé (débit) :
    # drapeau de la liste précédente s'il y en avait un, sinon au prochain passage
    avec = [v for v in villes if "_fichier" in v]
    for k in range(0, len(avec), 20):
        lot = avec[k:k + 20]
        try: d = wp(action="query", prop="imageinfo", iiprop="url|extmetadata", iiurlwidth="500", titles="|".join("File:" + v["_fichier"] for v in lot))
        except urllib.error.HTTPError:
            print("Wikipédia : lot de fichiers sauté (débit limité)"); continue
        norm = {x["from"]: x["to"] for x in d["query"].get("normalized", [])}
        pages = {p["title"]: p for p in d["query"]["pages"]}
        for v in lot:
            t = "File:" + v["_fichier"]; p = pages.get(norm.get(t, t))
            if not p or "imageinfo" not in p: continue
            ii = p["imageinfo"][0]; md = ii.get("extmetadata", {})
            val = lambda n: re.sub(r"<[^>]+>", "", md.get(n, {}).get("value", "")).strip()
            v["drapeau"] = {"page": ii["descriptionurl"], "licence": val("LicenseShortName"), "auteur": val("Artist")[:120],
                            "libre": p.get("imagerepository") == "shared", "src": ii.get("thumburl") or ii["url"]}
        time.sleep(1)
    for v in villes:
        f = v.pop("_fichier", None); v.pop("_en", None)
        if f and "drapeau" not in v and avant.get(v["q"], {}).get("drapeau"): v["drapeau"] = avant[v["q"]]["drapeau"]
    villes.sort(key=lambda v: (v["prov"], -v["pop"]))
    json.dump(villes, open(os.path.join(MONDE, "villes-us.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(villes), "villes,", sum("drapeau" in v for v in villes), "avec drapeau (dont", sum(not v.get("drapeau", {}).get("libre", True) for v in villes), "non libres) ;",
          sum(1 for v in villes if v.get("cap")), "capitales")


if __name__ == "__main__":
    main()
