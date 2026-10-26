"""Carte des 52 circonscriptions du Congrès (provinces, Ceuta, Melilla) pour en-direct/espagne/direct.js.

Source : es-atlas 0.6.0 (Martín González, licence MIT pour le code), tiré de l'Equipamiento Geográfico de Referencia Nacional de
l'Instituto Geográfico Nacional (IGN, CNIG), données sous CC BY 4.0 (scne.es). TopoJSON déjà simplifié : décodé ici sans
bibliothèque. Gibraltar (code 54) est retiré. Les Canaries sont déplacées dans un encart au sud-ouest de l'Andalousie, comme sur
les cartes habituelles de l'Espagne (décalage en degrés, rien d'autre ne change) ; le cadre de l'encart est écrit dans « encart ».
Anneaux orientés pour d3 (extérieur dans le sens des aiguilles d'une montre en lon/lat, trous à l'inverse).

Usage : python3 en-direct/espagne/outils/carte.py      (écrit en-direct/espagne/circonscriptions.json)
"""
import json, os, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from provinces import PROVINCES  # noqa: E402

SOURCE = "https://unpkg.com/es-atlas@0.6.0/es/provinces.json"
SORTIE = os.path.normpath(os.path.join(ICI, "..", "circonscriptions.json"))
CANARIES = {"35", "38"}
DX, DY = 6.2, 6.6                       # décalage des Canaries (degrés)


def decoder(topo):
    tr = topo.get("transform")
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0; pts = []
        for p in arc:
            if tr:
                x += p[0]; y += p[1]
                pts.append([x * tr["scale"][0] + tr["translate"][0], y * tr["scale"][1] + tr["translate"][1]])
            else:
                pts.append(p[:2])
        arcs.append(pts)

    def anneau(ids):
        pts = []
        for i in ids:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts
    return anneau


def aire(r):                              # aire signée (lon, lat) : négative = sens des aiguilles d'une montre
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2


def orienter(poly):
    out = []
    for k, r in enumerate(poly):
        sens = aire(r)
        if (k == 0 and sens > 0) or (k > 0 and sens < 0): r = r[::-1]
        out.append([[round(x, 4), round(y, 4)] for x, y in r])
    return out


def main():
    topo = json.load(urllib.request.urlopen(urllib.request.Request(SOURCE, headers={"User-Agent": "fveilleux.com"}), timeout=60))
    anneau = decoder(topo)
    feats = []
    for g in topo["objects"]["provinces"]["geometries"]:
        code = str(g["id"]).zfill(2)
        if code not in PROVINCES: continue
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        coords = []
        for p in polys:
            rings = [anneau(r) for r in p]
            if code in CANARIES: rings = [[[x + DX, y + DY] for x, y in r] for r in rings]
            coords.append(orienter(rings))
        nom, noms, ca, s = PROVINCES[code]
        feats.append({"type": "Feature", "properties": {"n": code, "nom": nom, "es": noms[0], "alias": noms, "ca": ca, "s": s},
                      "geometry": {"type": "MultiPolygon", "coordinates": coords}})
    feats.sort(key=lambda f: f["properties"]["n"])
    assert len(feats) == 52, len(feats)
    # cadre de l'encart des Canaries (après décalage)
    xs = [x for f in feats if f["properties"]["n"] in CANARIES for p in f["geometry"]["coordinates"] for r in p for x, _ in r]
    ys = [y for f in feats if f["properties"]["n"] in CANARIES for p in f["geometry"]["coordinates"] for r in p for _, y in r]
    m = 0.35
    encart = [[round(min(xs) - m, 3), round(min(ys) - m, 3)], [round(max(xs) + m, 3), round(max(ys) + m, 3)]]
    d = {"type": "FeatureCollection", "source": "IGN/CNIG (CC BY 4.0) via es-atlas 0.6.0", "encart": encart, "decalageCanaries": [DX, DY], "features": feats}
    with open(SORTIE, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(SORTIE, os.path.getsize(SORTIE), "octets")


if __name__ == "__main__":
    main()
