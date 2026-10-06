"""Votes États-Unis : contours des 435 districts de la Chambre des représentants → ../data.json

Contours précis du Census (fichiers cartographiques 1:500 000, découpés au trait de côte) pour les districts de 2024 ;
districts de 2026 des États redécoupés : carte interactive de 270toWin, découpée avec la terre de chaque État (Census).
Source des tracés de 2026 : la carte interactive de 270toWin (us_districts_2026_topo.json), qui contient les districts de 2026 (après les
redécoupages de 2025-2026 : Californie, Texas, Floride, Ohio, Caroline du Nord, Tennessee, Alabama, Louisiane, Utah) et,
pour ces États, les districts de 2024 (ceux des représentants actuels et de l'élection de 2024).
Fichier fixe : les données qui bougent (cotes, représentants, sondages) sont dans projection.json et sondages.json (usa.py).
Usage : /usr/bin/python3 usa_geo.py   (dans le dossier outils/ ; pip install pyshp shapely topojson)
"""
import json, os, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
FIPS = {"01": ("AL", "Alabama"), "02": ("AK", "Alaska"), "04": ("AZ", "Arizona"), "05": ("AR", "Arkansas"), "06": ("CA", "Californie"),
        "08": ("CO", "Colorado"), "09": ("CT", "Connecticut"), "10": ("DE", "Delaware"), "12": ("FL", "Floride"), "13": ("GA", "Géorgie"),
        "15": ("HI", "Hawaï"), "16": ("ID", "Idaho"), "17": ("IL", "Illinois"), "18": ("IN", "Indiana"), "19": ("IA", "Iowa"),
        "20": ("KS", "Kansas"), "21": ("KY", "Kentucky"), "22": ("LA", "Louisiane"), "23": ("ME", "Maine"), "24": ("MD", "Maryland"),
        "25": ("MA", "Massachusetts"), "26": ("MI", "Michigan"), "27": ("MN", "Minnesota"), "28": ("MS", "Mississippi"), "29": ("MO", "Missouri"),
        "30": ("MT", "Montana"), "31": ("NE", "Nebraska"), "32": ("NV", "Nevada"), "33": ("NH", "New Hampshire"), "34": ("NJ", "New Jersey"),
        "35": ("NM", "Nouveau-Mexique"), "36": ("NY", "New York"), "37": ("NC", "Caroline du Nord"), "38": ("ND", "Dakota du Nord"),
        "39": ("OH", "Ohio"), "40": ("OK", "Oklahoma"), "41": ("OR", "Oregon"), "42": ("PA", "Pennsylvanie"), "44": ("RI", "Rhode Island"),
        "45": ("SC", "Caroline du Sud"), "46": ("SD", "Dakota du Sud"), "47": ("TN", "Tennessee"), "48": ("TX", "Texas"), "49": ("UT", "Utah"),
        "50": ("VT", "Vermont"), "51": ("VA", "Virginie"), "53": ("WA", "Washington"), "54": ("WV", "Virginie-Occidentale"), "55": ("WI", "Wisconsin"),
        "56": ("WY", "Wyoming")}

brut = os.path.join(ICI, "brut", "us_districts_2026_topo.json")
if not os.path.exists(brut):
    open(brut, "wb").write(urllib.request.urlopen(urllib.request.Request("https://www.270towin.com/js/d3/us_districts_2026_topo.json", headers=UA), timeout=120).read())
t = json.load(open(brut, encoding="utf-8"))
sx, sy = t["transform"]["scale"]; tx, ty = t["transform"]["translate"]
arcs = []
for a in t["arcs"]:                                   # arcs quantifiés, coordonnées en différences
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append([round(x * sx + tx, 4), round(y * sy + ty, 4)])
    arcs.append(pts)
def anneau(idx):
    out = []
    for i in idx:
        p = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(p if not out else p[1:])
    return out
def geom(g):
    if g["type"] == "Polygon": return {"type": "Polygon", "coordinates": [anneau(r) for r in g["arcs"]]}
    if g["type"] == "MultiPolygon": return {"type": "MultiPolygon", "coordinates": [[anneau(r) for r in p] for p in g["arcs"]]}
    return None

dists = t["objects"]["districts"]["geometries"]
for d in dists: d["properties"]["GEOID"] = d["properties"]["STATEFP"] + d["properties"]["DIST"]   # parfois un nombre (Massachusetts)
g26 = {d["properties"]["GEOID"]: d for d in dists if d["properties"]["election"] == "2026"}
g24 = {d["properties"]["GEOID"]: d for d in dists if d["properties"]["election"] == "2024"}
etats24 = {k[:2] for k in g24}                       # États dont les districts ont changé depuis 2024

# --- contours précis : fichiers cartographiques du Census (1:500 000, découpés au trait de côte)
#     districts du 119e Congrès (ceux de 2024) ; terre de chaque État, pour découper les districts de 2026 de 270toWin
import shapefile                                      # pip install pyshp shapely topojson
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
import topojson
def census(nom, dossier):
    zf = os.path.join(ICI, "brut", nom + ".zip")
    if not os.path.exists(zf):
        open(zf, "wb").write(urllib.request.urlopen(f"https://www2.census.gov/geo/tiger/GENZ2024/shp/{nom}.zip", timeout=180).read())
    import zipfile; zipfile.ZipFile(zf).extractall(os.path.join(ICI, "brut", dossier))
    return shapefile.Reader(os.path.join(ICI, "brut", dossier, nom))
cd = census("cb_2024_us_cd119_500k", "cd")
c24 = {}
for sr in cd.iterShapeRecords():
    st, n = sr.record["STATEFP"], sr.record["CD119FP"]
    if st not in FIPS: continue                       # délégués (DC, Porto Rico…)
    c24[st + ("00" if n in ("00", "98") else n)] = shape(sr.shape.__geo_interface__).buffer(0)
etr = census("cb_2024_us_state_500k", "st")
terre = {sr.record["STATEFP"]: shape(sr.shape.__geo_interface__).buffer(0) for sr in etr.iterShapeRecords() if sr.record["STATEFP"] in FIPS}
c26 = {}
for k, d in g26.items():
    if k[:2] in etats24: c26[k] = shape(geom(d)).buffer(0).intersection(terre[k[:2]])
# Alaska : côte très découpée (Aléoutiennes…) ; aucune voisine sur la carte, on la simplifie à part
def alleger(g, tol, min_aire):
    g = g.simplify(tol, preserve_topology=True)
    return unary_union([p for p in getattr(g, "geoms", [g]) if p.area >= min_aire])
c24["0200"] = alleger(c24["0200"], 0.02, 0.05); terre["02"] = c24["0200"]
if len(c24) != 435: raise SystemExit(f"{len(c24)} districts du Census (435 attendus)")

def simplifier(geoms, tol):
    fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": k}, "geometry": mapping(g)} for k, g in sorted(geoms.items())]}
    out = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=tol, simplify_algorithm="dp").to_geojson())
    def arr(o): return [arr(x) for x in o] if isinstance(o[0], (list, tuple)) else [round(o[0], 4), round(o[1], 4)]
    # petites îles retirées (moins de 1 % du district et de 0,002 degré carré)
    feats = []
    for f in out["features"]:
        g = shape(f["geometry"]).buffer(0)
        parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
        grand = max(p.area for p in parts)
        g = unary_union([p for p in parts if p.area >= min(0.002, grand * 0.01)])
        m = mapping(g)
        feats.append({"type": "Feature", "properties": {"id": f["properties"]["id"]}, "geometry": {"type": m["type"], "coordinates": arr(m["coordinates"])}})
    return {"type": "FeatureCollection", "features": sorted(feats, key=lambda f: f["properties"]["id"])}

ids = sorted(g26)
if len(ids) != 435: raise SystemExit(f"{len(ids)} districts de 2026 (435 attendus)")
ids24 = sorted(c24)
def nom(k):
    ab, n = FIPS[k[:2]]
    return f"{n} (district unique)" if k[2:] == "00" else f"{n} {int(k[2:])}"
sortie = {
    "etats": [{"fips": f, "ab": a, "nom": n} for f, (a, n) in sorted(FIPS.items(), key=lambda x: x[1][1])],
    "redecoupes": sorted(FIPS[e][0] for e in etats24),
    "districts": [{"id": k, "st": FIPS[k[:2]][0], "n": nom(k)} for k in ids],
    "districts24": [{"id": k, "st": FIPS[k[:2]][0], "n": nom(k)} for k in ids24],
    # 2024 : les 435 districts (Census) ; 2026 : seulement les États redécoupés (ailleurs, ce sont ceux de 2024)
    "geo24": simplifier(c24, 0.003),
    "geo26": simplifier(c26, 0.003),
    "geoEtats": simplifier(terre, 0.01),
}
for f in sortie["geoEtats"]["features"]: f["properties"] = {"fips": f["properties"]["id"]}
json.dump(sortie, open(os.path.join(ICI, "..", "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(ids)} districts de 2026 ({len(c26)} redessinés), {len(ids24)} de 2024 · États redécoupés : {', '.join(sortie['redecoupes'])} · {os.path.getsize(os.path.join(ICI, '..', 'data.json')) // 1024} Ko")
