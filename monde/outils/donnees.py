"""Information Monde : données de la page information-monde.html (à relancer seulement pour changer de source).

- monde/pays.json : contours des pays (world-atlas 2.0.2, Natural Earth 1:50 M, domaine public), code ISO 3166-1 alpha-2 ajouté (« a2 »).
- monde/lacs.json : lacs (Natural Earth 1:50 M, domaine public), dessinés couleur de l'eau par-dessus les pays.
- monde/canada.json, monde/etats-unis.json : provinces et territoires, États (Natural Earth 1:50 M admin-1, domaine public),
  coordonnées arrondies.
- monde/drapeaux/<a2>.svg : drapeaux des pays (flagcdn.com, Flagpedia, proportions officielles).
- monde/drapeaux/ca/<code>.svg : drapeaux des provinces et territoires (Wikimedia Commons, domaine public).
- monde/drapeaux/us/<code>.svg : drapeaux des États (flagcdn.com, Flagpedia, domaine public ; Washington D.C. de Wikimedia Commons,
  absent de flagcdn).
Usage : python3 monde/outils/donnees.py            (tout)
        python3 monde/outils/donnees.py lacs       (seulement les lacs)
        python3 monde/outils/donnees.py etats-unis (seulement les États-Unis : contours et drapeaux)
"""
import json, os, time, urllib.error, urllib.request, urllib.parse

ICI = os.path.dirname(os.path.abspath(__file__))
MONDE = os.path.dirname(ICI)
UA = {"User-Agent": "fveilleux.com information-monde (données ouvertes)"}

def lire(url, essais=6):
    for i in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:   # Wikimedia limite le débit (429) : on attend
            if e.code != 429 or i == essais - 1: raise
            time.sleep(10 * (i + 1))

# entités sans code numérique dans world-atlas : code alpha-2 usuel quand il existe
SANS_CODE = {"Kosovo": "XK"}

def pays():
    codes = {n: a for a, _, n, _ in json.loads(lire("https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.14.0/codes.json"))}
    w = json.loads(lire("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json"))
    for g in w["objects"]["countries"]["geometries"]:
        nom = g["properties"]["name"]
        a2 = codes.get(g.get("id")) or SANS_CODE.get(nom)
        g["properties"] = {"a2": a2, "en": nom}
    json.dump(w, open(os.path.join(MONDE, "pays.json"), "w"), separators=(",", ":"))
    return sorted({g["properties"]["a2"] for g in w["objects"]["countries"]["geometries"] if g["properties"]["a2"]})

def arrondir(c):
    return [arrondir(x) for x in c] if isinstance(c[0], list) else [round(c[0], 3), round(c[1], 3)]

ADMIN1 = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lakes.geojson"

def subdivisions(adm0, fichier):
    d = json.loads(lire(ADMIN1))
    f = [{"type": "Feature", "properties": {"code": x["properties"]["iso_3166_2"]},
          "geometry": {"type": x["geometry"]["type"], "coordinates": arrondir(x["geometry"]["coordinates"])}}
         for x in d["features"] if x["properties"]["adm0_a3"] == adm0]
    json.dump({"type": "FeatureCollection", "features": f}, open(os.path.join(MONDE, fichier), "w"), separators=(",", ":"))
    return [x["properties"]["code"] for x in f]

def canada():
    subdivisions("CAN", "canada.json")

def etats_unis():
    codes = subdivisions("USA", "etats-unis.json")
    os.makedirs(os.path.join(MONDE, "drapeaux", "us"), exist_ok=True)
    for code in codes:
        c = code[3:].lower()
        url = (f"https://flagcdn.com/us-{c}.svg" if code != "US-DC"
               else "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_Washington,_D.C..svg")
        open(os.path.join(MONDE, "drapeaux", "us", c + ".svg"), "wb").write(lire(url))
    print(len(codes), "États")

def lacs():
    d = json.loads(lire("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson"))
    f = [{"type": "Feature", "properties": {}, "geometry": {"type": x["geometry"]["type"], "coordinates": arrondir(x["geometry"]["coordinates"])}}
         for x in d["features"]]
    json.dump({"type": "FeatureCollection", "features": f}, open(os.path.join(MONDE, "lacs.json"), "w"), separators=(",", ":"))

# fichiers de Wikimedia Commons (domaine public)
PROVINCES = {
    "CA-AB": "Flag of Alberta.svg", "CA-BC": "Flag of British Columbia.svg", "CA-MB": "Flag of Manitoba.svg",
    "CA-NB": "Flag of New Brunswick.svg", "CA-NL": "Flag of Newfoundland and Labrador.svg", "CA-NS": "Flag of Nova Scotia.svg",
    "CA-NT": "Flag of the Northwest Territories.svg", "CA-NU": "Flag of Nunavut.svg", "CA-ON": "Flag of Ontario.svg",
    "CA-PE": "Flag of Prince Edward Island.svg", "CA-QC": "Flag of Quebec.svg", "CA-SK": "Flag of Saskatchewan.svg",
    "CA-YT": "Flag of Yukon.svg",
}

def drapeaux(liste):
    os.makedirs(os.path.join(MONDE, "drapeaux", "ca"), exist_ok=True)
    for a2 in liste:
        open(os.path.join(MONDE, "drapeaux", a2.lower() + ".svg"), "wb").write(lire(f"https://flagcdn.com/{a2.lower()}.svg"))
    for code, nom in PROVINCES.items():
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(nom.replace(" ", "_"))
        open(os.path.join(MONDE, "drapeaux", "ca", code[3:].lower() + ".svg"), "wb").write(lire(url))
        time.sleep(3)

if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["lacs"]: lacs(); sys.exit()   # seulement les lacs
    if sys.argv[1:] == ["etats-unis"]: etats_unis(); sys.exit()
    liste = pays(); canada(); etats_unis(); lacs(); drapeaux(liste)
    print(len(liste), "pays")
