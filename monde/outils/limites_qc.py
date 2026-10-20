"""Information Monde : limites du territoire d'une ville du Québec (une ville par appel, lancé en tâche de fond par ville).

Source : Découpages administratifs du Québec (SDA, couche Municipalité), ministère des Ressources naturelles et des Forêts,
Licence CC BY 4.0 (Données Québec), service ArcGIS servicescarto.mern.gouv.qc.ca ; géométrie simplifiée (~50 m), WGS 84.
Usage : python3 monde/outils/limites_qc.py Q340      → monde/limites/Q340.json
"""
import json, os, sys, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
MONDE = os.path.dirname(ICI)
# code géographique du MAMH (5 derniers chiffres du code de subdivision de recensement de Statistique Canada)
CODES = {"Q340": "66023", "Q2145": "23027", "Q141810": "65005", "Q141844": "81017", "Q139398": "58227",
         "Q139473": "43027", "Q139208": "25213", "Q139229": "94068", "Q44012": "37067", "Q139190": "64008"}
URL = "https://servicescarto.mern.gouv.qc.ca/pes/rest/services/Territoire/SDA_WMS/MapServer/2/query?"

def limites(q):
    p = {"where": f"MUS_CO_GEO='{CODES[q]}'", "outFields": "MUS_NM_MUN,MUS_CO_GEO,MUS_VA_SUP", "outSR": "4326",
         "maxAllowableOffset": "0.0005", "geometryPrecision": "4", "f": "geojson"}
    req = urllib.request.Request(URL + urllib.parse.urlencode(p), headers={"User-Agent": "fveilleux-monde/1.0 (https://fveilleux.com)"})
    d = json.loads(urllib.request.urlopen(req, timeout=180).read())
    assert d.get("features"), f"{q} : aucune municipalité {CODES[q]}"
    f = d["features"][0]
    f["properties"] = {"q": q, "nom": f["properties"]["MUS_NM_MUN"], "code": f["properties"]["MUS_CO_GEO"], "km2": f["properties"]["MUS_VA_SUP"]}
    os.makedirs(os.path.join(MONDE, "limites"), exist_ok=True)
    json.dump(f, open(os.path.join(MONDE, "limites", q + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print(q, f["properties"]["nom"], f["geometry"]["type"], os.path.getsize(os.path.join(MONDE, "limites", q + ".json")), "octets")

if __name__ == "__main__":
    for q in sys.argv[1:]: limites(q)
