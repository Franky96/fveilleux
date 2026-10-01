"""Retire les lanières de terre très minces détachées d'une circonscription ou d'une région (digue de la Voie maritime
au sud de Montréal, etc.) : à l'échelle de la carte, elles ressemblent à des traits parasites dans le fleuve.
Critère : morceau secondaire (pas le plus grand de l'entité), aire < 4 km² et compacité 4πA/P² < 0,12.
Usage : /usr/bin/python3 m80/sans_digues.py m80/c127.json m80/d80.json m80/r127.json m80/r80.json"""
import json, math, sys
def mesure(ring):
    lat0 = math.radians(sum(c[1] for c in ring) / len(ring)); kx, ky = 111.32 * math.cos(lat0), 110.57
    pts = [(c[0] * kx, c[1] * ky) for c in ring]
    a = abs(sum(pts[i][0] * pts[i+1][1] - pts[i+1][0] * pts[i][1] for i in range(len(pts) - 1)) / 2)
    per = sum(math.dist(pts[i], pts[i+1]) for i in range(len(pts) - 1))
    return a, (4 * math.pi * a / per ** 2 if per else 1)
for nom in sys.argv[1:]:
    g = json.load(open(nom, encoding="utf-8")); n = 0
    for f in g["features"]:
        geo = f["geometry"]
        if geo["type"] != "MultiPolygon": continue
        aires = [mesure(p[0])[0] for p in geo["coordinates"]]; gros = aires.index(max(aires))
        garde = []
        for i, p in enumerate(geo["coordinates"]):
            a, comp = mesure(p[0])
            if i != gros and a < 4 and comp < 0.12:
                n += 1; lat = sum(c[1] for c in p[0]) / len(p[0]); lon = sum(c[0] for c in p[0]) / len(p[0])
                print(f"  {nom} {list(f['properties'].values())[:1]} : lanière {a:.2f} km², compacité {comp:.3f} @ {lat:.3f},{lon:.3f}")
            else: garde.append(p)
        geo["coordinates"] = garde
        if len(garde) == 1: geo["type"], geo["coordinates"] = "Polygon", garde[0]
    json.dump(g, open(nom, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(nom, ":", n, "lanière(s) retirée(s)")
