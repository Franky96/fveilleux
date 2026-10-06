"""Votes Canada : contours des 343 circonscriptions fédérales (découpage de 2023) → ../data.json

Source : la carte de Qc125 Canada (qc125.com/canada/carte.htm), qui contient les contours d'Élections Canada.
Fichier fixe (ne change qu'avec un nouveau découpage) : les données qui bougent (projection, député actuel, résultat
de 2025) sont dans projection.json (canada.py). Contours simplifiés en gardant les frontières communes (topologie).
Usage : /usr/bin/python3 canada_geo.py   (dans le dossier outils/ ; la page brute est mise dans brut/ ; pip install shapely topojson)
"""
import json, os, re, urllib.request, collections
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
import topojson

ICI = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
HDR = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "fr-CA,fr;q=0.9"}
# code de province (2 premiers chiffres du numéro de circonscription) → abréviation, nom
PROV = {"10": ("NL", "Terre-Neuve-et-Labrador"), "11": ("PE", "Île-du-Prince-Édouard"), "12": ("NS", "Nouvelle-Écosse"),
        "13": ("NB", "Nouveau-Brunswick"), "24": ("QC", "Québec"), "35": ("ON", "Ontario"), "46": ("MB", "Manitoba"),
        "47": ("SK", "Saskatchewan"), "48": ("AB", "Alberta"), "59": ("BC", "Colombie-Britannique"), "60": ("YT", "Yukon"),
        "61": ("NT", "Territoires du Nord-Ouest"), "62": ("NU", "Nunavut")}

brut = os.path.join(ICI, "brut", "carte.htm")
if not os.path.exists(brut):
    os.makedirs(os.path.dirname(brut), exist_ok=True)
    open(brut, "wb").write(urllib.request.urlopen(urllib.request.Request("https://qc125.com/canada/carte.htm", headers=HDR), timeout=120).read())
s = open(brut, encoding="utf-8", errors="ignore").read()
dec = json.JSONDecoder()
geoms, noms = collections.defaultdict(list), {}
for m in re.finditer(r'\{"type":"Feature","geometry":', s):
    g, fin = dec.raw_decode(s, m.end())
    props = s[fin: s.index("}}", fin)]
    num = re.search(r'"FED_NUM":(\d+)', props)[1]
    noms[num] = json.loads('"' + re.search(r'"ED_NAMEF":"([^"]*)"', props)[1] + '"')   # échappements \u2014 (tirets)
    if g: geoms[num].append(shape(g).buffer(0))
if len(geoms) != 343: raise SystemExit(f"{len(geoms)} circonscriptions lues (343 attendues)")

# Territoires du Nord-Ouest et Nunavut : les contours d'Élections Canada vont jusqu'au pôle (eaux arctiques, baie d'Hudson) ;
# on les découpe avec les terres de Natural Earth (1:10 M) pour ne garder que la terre ferme et les îles
TERRE = os.path.join(ICI, "brut", "ne_10m_land.geojson")
if not os.path.exists(TERRE):
    open(TERRE, "wb").write(urllib.request.urlopen("https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_land.geojson", timeout=120).read())
from shapely.geometry import box
nord = box(-142, 51, -55, 84)
terre = unary_union([shape(f["geometry"]).intersection(nord) for f in json.load(open(TERRE, encoding="utf-8"))["features"]]).buffer(0)
for num in ("61001", "62001"):   # côtes arctiques plus simples (carte à l'échelle du pays) ; petites îles retirées plus bas
    g = unary_union(geoms[num]).intersection(terre).simplify(0.02 if num == "62001" else 0.01, preserve_topology=True)
    geoms[num] = [unary_union([p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and p.area >= (0.4 if num == "62001" else 0.12)])]
# Québec : les contours fédéraux couvrent le fleuve et les rivières (Montréal n'y est pas une île) ; on les découpe avec la
# terre de la carte de Votes Québec (circonscriptions provinciales, sans l'eau) pour avoir la même allure
qc = json.load(open(os.path.join(ICI, "..", "..", "votes-quebec", "data.json"), encoding="utf-8"))
def ferme(g): return shape(g).buffer(0)
terre_qc = unary_union([ferme(f["geometry"]) for f in qc["ridingGeo"]["features"]]).buffer(0)
for num in [n for n in geoms if n.startswith("24")]:
    g = unary_union(geoms[num]).intersection(terre_qc)
    if not g.is_empty: geoms[num] = [g]
# petites îles (Arctique surtout) : on garde les morceaux de plus de 0,02 degré carré, et toujours le plus grand
def nettoyer(geo):
    parts = list(geo.geoms) if geo.geom_type == "MultiPolygon" else [geo]
    grand = max(parts, key=lambda p: p.area)
    garde = [p for p in parts if p.area >= min(0.02, grand.area * 0.05)]
    return unary_union(garde)
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": n}, "geometry": mapping(nettoyer(unary_union(gs)))}
                                                for n, gs in sorted(geoms.items())]}
simple = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=0.003, simplify_algorithm="dp").to_geojson())
def arrondi(o):
    return [arrondi(x) for x in o] if isinstance(o[0], (list, tuple)) else [round(o[0], 4), round(o[1], 4)]
ids = sorted(geoms)
ordre = {n: i for i, n in enumerate(ids)}
feats = sorted(({"type": "Feature", "properties": {"RID": ordre[f["properties"]["id"]]},
                 "geometry": {"type": f["geometry"]["type"], "coordinates": arrondi(f["geometry"]["coordinates"])}} for f in simple["features"]),
               key=lambda f: f["properties"]["RID"])
# provinces : union des circonscriptions (traits plus épais, zoom depuis le panneau)
par_prov = collections.defaultdict(list)
for f in feats: par_prov[PROV[ids[f["properties"]["RID"]][:2]][0]].append(shape(f["geometry"]).buffer(0))
provs = [{"type": "Feature", "properties": {"REG": p}, "geometry": (lambda g: {"type": g["type"], "coordinates": arrondi(g["coordinates"])})(mapping(unary_union(gs)))}
         for p, gs in sorted(par_prov.items())]
sortie = {"ridings": [{"id": n, "n": noms[n], "r": PROV[n[:2]][0]} for n in ids],
          "regions": [{"code": a, "name": nom} for a, nom in PROV.values()],
          "ridingGeo": {"type": "FeatureCollection", "features": feats}, "curRegionGeo": {"type": "FeatureCollection", "features": provs}}
json.dump(sortie, open(os.path.join(ICI, "..", "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(ids)} circonscriptions · {os.path.getsize(os.path.join(ICI, '..', 'data.json')) // 1024} Ko")
