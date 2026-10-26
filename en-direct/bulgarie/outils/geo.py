"""Présidentielle en Bulgarie (page « En direct ») : carte des 31 circonscriptions électorales (многомандатни изборни райони, МИР).

Les МИР suivent les 28 provinces (области), sauf deux : Sofia-ville (София-град) est coupée en trois (23, 24 et 25 МИР, chacun huit
arrondissements, райони) et la province de Plovdiv en deux (16 = commune de Plovdiv, 17 = le reste de la province). La 32e,
« Извън страната » (vote à l'étranger), n'est pas sur la carte.
Composition des МИР de Sofia vérifiée le 26 octobre 2026 sur les pages de résultats de la CIK (codes d'arrondissement des sections) :
  23 : Красно село, Изгрев, Лозенец, Триадица, Младост, Студентски, Витоша, Панчарево
  24 : Средец, Възраждане, Оборище, Сердика, Подуяне, Слатина, Искър, Кремиковци
  25 : Красна поляна, Илинден, Надежда, Овча купел, Люлин, Връбница, Нови Искър, Банкя

Sources :
  provinces (ADM1) et communes (ADM2) : geoBoundaries gbOpen BGR, version 9469f09 (licence : domaine public, d'après geoBoundaries) ;
  arrondissements de Sofia : relations d'OpenStreetMap (© contributeurs d'OpenStreetMap, ODbL), lues par Nominatim.
Traitement : shapely (découpes exactes : les frontières communes coïncident), puis mapshaper (simplification à 10 %, topologie gardée),
anneaux extérieurs remis dans le sens horaire (sens attendu par d3). Résultat : en-direct/bulgarie/circonscriptions.json (≈ 40 Ko).
Usage : python3 en-direct/bulgarie/outils/geo.py   (téléchargements gardés dans le dossier temporaire du système ; il faut shapely et npx)
"""
import json, os, subprocess, tempfile, time, urllib.parse, urllib.request
from shapely.geometry import shape, mapping
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "circonscriptions.json"))
BRUT = os.path.join(tempfile.gettempdir(), "bg-geo")
GB = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/BGR/{0}/geoBoundaries-BGR-{0}.geojson"
UA = {"User-Agent": "fveilleux.com (carte des circonscriptions bulgares)"}
# relations OSM des 24 arrondissements (code CIK de l'arrondissement → relation)
RAYONS = {"01": 3759443, "02": 3759430, "03": 3759446, "04": 3759437, "05": 3759441, "06": 3759440, "07": 3759442, "08": 3759428,
          "09": 3759433, "10": 3759445, "11": 3759429, "12": 3759426, "13": 3759435, "14": 3759427, "15": 3759434, "16": 3759444,
          "17": 3759447, "18": 3759438, "19": 3759432, "20": 3759448, "21": 3759436, "22": 3759431, "23": 3759439, "24": 3759425}
S23 = ["02", "08", "09", "10", "15", "16", "17", "23"]
S24 = ["01", "03", "04", "05", "06", "07", "14", "22"]
PROV = {1: "Blagoevgrad", 2: "Burgas", 3: "Varna", 4: "Veliko Tarnovo", 5: "Vidin", 6: "Vratsa", 7: "Gabrovo", 8: "Dobrich", 9: "Kardzhali",
        10: "Kyustendil", 11: "Lovech", 12: "Montana", 13: "Pazardzhik", 14: "Pernik", 15: "Pleven", 18: "Razgrad", 19: "Ruse", 20: "Silistra",
        21: "Sliven", 22: "Smolyan", 26: "Sofia", 27: "Stara Zagora", 28: "Targovishte", 29: "Haskovo", 30: "Shumen", 31: "Yambol"}
FR = {1: "Blagoevgrad", 2: "Bourgas", 3: "Varna", 4: "Veliko Tarnovo", 5: "Vidin", 6: "Vratsa", 7: "Gabrovo", 8: "Dobritch", 9: "Kardjali",
      10: "Kioustendil", 11: "Lovetch", 12: "Montana", 13: "Pazardjik", 14: "Pernik", 15: "Pleven", 16: "Plovdiv (ville)", 17: "Plovdiv (province)",
      18: "Razgrad", 19: "Roussé", 20: "Silistra", 21: "Sliven", 22: "Smolyan", 23: "Sofia 23 (sud)", 24: "Sofia 24 (centre et est)",
      25: "Sofia 25 (ouest et nord)", 26: "Province de Sofia", 27: "Stara Zagora", 28: "Targovichte", 29: "Haskovo", 30: "Choumen", 31: "Yambol"}
BG = {1: "Благоевград", 2: "Бургас", 3: "Варна", 4: "Велико Търново", 5: "Видин", 6: "Враца", 7: "Габрово", 8: "Добрич", 9: "Кърджали",
      10: "Кюстендил", 11: "Ловеч", 12: "Монтана", 13: "Пазарджик", 14: "Перник", 15: "Плевен", 16: "Пловдив град", 17: "Пловдив област",
      18: "Разград", 19: "Русе", 20: "Силистра", 21: "Сливен", 22: "Смолян", 23: "София 23 МИР", 24: "София 24 МИР", 25: "София 25 МИР",
      26: "София област", 27: "Стара Загора", 28: "Търговище", 29: "Хасково", 30: "Шумен", 31: "Ямбол"}


def charger(nom, url):
    os.makedirs(BRUT, exist_ok=True)
    f = os.path.join(BRUT, nom)
    if not os.path.exists(f):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r: open(f, "wb").write(r.read())
        time.sleep(1.2)                                   # Nominatim : une requête par seconde au plus
    return json.load(open(f, encoding="utf-8"))


def main():
    A1 = {f["properties"]["shapeName"]: make_valid(shape(f["geometry"])) for f in charger("adm1.geojson", GB.format("ADM1"))["features"]}
    A2 = {f["properties"]["shapeName"]: make_valid(shape(f["geometry"])) for f in charger("adm2.geojson", GB.format("ADM2"))["features"]}
    ids = ",".join(f"R{r}" for r in RAYONS.values())
    rel = charger("rayons.json", "https://nominatim.openstreetmap.org/lookup?" + urllib.parse.urlencode({"osm_ids": ids, "format": "jsonv2", "polygon_geojson": 1}))
    par_rel = {e["osm_id"]: make_valid(shape(e["geojson"])) for e in rel}
    RY = {c: par_rel[r] for c, r in RAYONS.items()}
    G = {n: A1[p] for n, p in PROV.items()}
    G[16] = A1["Plovdiv"].intersection(A2["Plovdiv"]); G[17] = A1["Plovdiv"].difference(G[16])
    sof = A1["Sofia City"]
    G[23] = sof.intersection(unary_union([RY[c] for c in S23]))
    G[24] = sof.intersection(unary_union([RY[c] for c in S24])).difference(G[23])
    G[25] = sof.difference(G[23]).difference(G[24])
    feats = []
    for n in sorted(G):
        g = G[n].buffer(0)
        parts = [p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and p.area > 1e-6]
        feats.append({"type": "Feature", "properties": {"n": n, "nom": FR[n], "bg": BG[n]}, "geometry": mapping(unary_union(parts))})
    brut = os.path.join(BRUT, "mir_brut.geojson"); simple = os.path.join(BRUT, "mir_simple.geojson")
    json.dump({"type": "FeatureCollection", "features": feats}, open(brut, "w"), ensure_ascii=False)
    subprocess.run(["npx", "--yes", "mapshaper@0.6.102", "-i", brut, "-simplify", "10%", "weighted", "keep-shapes", "-clean",
                    "-o", "format=geojson", "precision=0.0005", simple], check=True)
    d = json.load(open(simple, encoding="utf-8"))
    for f in d["features"]:                           # anneaux extérieurs dans le sens horaire (d3), trous dans l'autre sens
        g = shape(f["geometry"])
        g = orient(g, -1.0) if g.geom_type == "Polygon" else type(g)([orient(p, -1.0) for p in g.geoms])
        f["geometry"] = json.loads(json.dumps(mapping(g)))
        f["geometry"]["coordinates"] = arrondir(f["geometry"]["coordinates"])
    with open(SORTIE, "w", encoding="utf-8") as fo: json.dump(d, fo, ensure_ascii=False, separators=(",", ":"))
    print(SORTIE, os.path.getsize(SORTIE), "octets,", len(d["features"]), "circonscriptions")


def arrondir(c):
    return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [arrondir(x) for x in c]


if __name__ == "__main__":
    main()
