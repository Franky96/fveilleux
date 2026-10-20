"""Information Monde : eau détaillée autour des villes du Québec, à la place des lacs et rivières de la carte du monde
(Natural Earth 1:50 M, trop grossiers de près : rivières en angles droits qui ne collent pas aux limites des villes).

Zones : le cadre de chaque ville qui a des limites (monde/limites/<Q>.json), agrandi de 0,3°, les cadres qui se touchent
réunis (Montréal, Laval, Longueuil et Terrebonne : une zone). Dans une zone, le globe dessine cette eau au lieu des lacs du
1:50 M. Eau : plans d'eau d'OpenStreetMap ≥ 2 ha (natural=water ; © contributeurs d'OpenStreetMap, ODbL), mêmes
requêtes et même cache que limites_qc.py, simplifiés à ~20 m.

Usage : python3 monde/outils/eau_qc.py zones        → liste des zones (identifiant : cadre)
        python3 monde/outils/eau_qc.py <zone>       → monde/eau/<zone>.json (une zone par appel, en tâche de fond par zone)
        python3 monde/outils/eau_qc.py index        → monde/eau/index.json (zones faites)
"""
import json, math, os, sys
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from limites_qc import arrondir, eau_osm, km2, MONDE   # noqa: E402

MARGE = 0.3
DOSSIER = os.path.join(MONDE, "eau")


def zones():
    cadres = []
    for f in sorted(os.listdir(os.path.join(MONDE, "limites"))):
        if f.endswith(".json"):
            x0, y0, x1, y1 = shape(json.load(open(os.path.join(MONDE, "limites", f)))["geometry"]).bounds
            cadres.append(box(x0 - MARGE, y0 - MARGE, x1 + MARGE, y1 + MARGE))
    u = unary_union(cadres)
    parts = list(getattr(u, "geoms", [u]))
    # identifiant stable : coin sud-ouest arrondi
    return {f"z{abs(round(p.bounds[0] * 10))}_{round(p.bounds[1] * 10)}": p for p in parts}


def faire(zid):
    z = zones()[zid]
    x0, y0, x1, y1 = z.bounds
    nx, ny = math.ceil((x1 - x0) / 0.25), math.ceil((y1 - y0) / 0.25)
    morceaux, n = [], 0
    for i in range(nx):
        for j in range(ny):
            tx0, ty0 = x0 + i * (x1 - x0) / nx, y0 + j * (y1 - y0) / ny
            t = box(tx0, ty0, tx0 + (x1 - x0) / nx, ty0 + (y1 - y0) / ny)
            if not t.intersects(z): continue
            e, k = eau_osm(*t.bounds)
            if e is not None: morceaux.append(e.intersection(z))
            n += k
    eau = unary_union(morceaux).simplify(0.0002, preserve_topology=True) if morceaux else None
    polys = [p for p in getattr(eau, "geoms", [eau]) if p is not None and p.geom_type == "Polygon" and km2(p) >= 0.02] if eau else []
    eau = unary_union(polys) if polys else None
    os.makedirs(DOSSIER, exist_ok=True)
    sortie = {"type": "Feature", "properties": {"zone": zid},
              "geometry": {"type": "MultiPolygon", "coordinates": []} if eau is None else
              {"type": mapping(eau)["type"], "coordinates": arrondir(mapping(eau)["coordinates"])},
              "zone": {"type": mapping(z)["type"], "coordinates": arrondir(mapping(z)["coordinates"])}}
    chemin = os.path.join(DOSSIER, zid + ".json")
    json.dump(sortie, open(chemin, "w"), separators=(",", ":"))
    print(zid, n, "plans d'eau,", os.path.getsize(chemin), "octets")
    index()


def index():
    # zones faites et leur cadre [ouest, sud, est, nord] : le globe ne charge une zone que si elle est à l'écran
    faites = []
    for f in sorted(os.listdir(DOSSIER)):
        if f.endswith(".json") and f != "index.json":
            try: z = json.load(open(os.path.join(DOSSIER, f)))
            except ValueError: continue
            faites.append({"id": f[:-5], "cadre": [round(c, 4) for c in shape(z["zone"]).bounds]})
    tmp = os.path.join(DOSSIER, f"index.json.{os.getpid()}.tmp")
    json.dump(faites, open(tmp, "w")); os.replace(tmp, os.path.join(DOSSIER, "index.json"))


if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["zones"]:
        for k, v in zones().items(): print(k, [round(c, 2) for c in v.bounds])
    elif a == ["index"]: index()
    else:
        for zid in a: faire(zid)
