"""Votes États-Unis : contours des 435 districts de la Chambre des représentants → ../data.json

Source : la carte interactive de 270toWin (us_districts_2026_topo.json), qui contient les districts de 2026 (après les
redécoupages de 2025-2026 : Californie, Texas, Floride, Ohio, Caroline du Nord, Tennessee, Alabama, Louisiane, Utah) et,
pour ces États, les districts de 2024 (ceux des représentants actuels et de l'élection de 2024).
Fichier fixe : les données qui bougent (cotes, représentants, sondages) sont dans projection.json et sondages.json (usa.py).
Usage : /usr/bin/python3 usa_geo.py   (dans le dossier outils/ ; seulement la bibliothèque standard)
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
ids = sorted(g26)
if len(ids) != 435: raise SystemExit(f"{len(ids)} districts de 2026 (435 attendus)")
etats24 = {k[:2] for k in g24}                       # États dont les districts ont changé depuis 2024
ids24 = sorted({k for k in g24} | {k for k in ids if k[:2] not in etats24})
def nom(k):
    ab, n = FIPS[k[:2]]
    return f"{n} (district unique)" if k[2:] == "00" else f"{n} {int(k[2:])}"
feat = lambda k, g: {"type": "Feature", "properties": {"id": k}, "geometry": geom(g)}
sortie = {
    "etats": [{"fips": f, "ab": a, "nom": n} for f, (a, n) in sorted(FIPS.items(), key=lambda x: x[1][1])],
    "redecoupes": sorted(FIPS[e][0] for e in etats24),
    "districts": [{"id": k, "st": FIPS[k[:2]][0], "n": nom(k)} for k in ids],
    "districts24": [{"id": k, "st": FIPS[k[:2]][0], "n": nom(k)} for k in ids24],
    "geo26": {"type": "FeatureCollection", "features": [feat(k, g26[k]) for k in ids]},
    # 2024 : seulement les districts des États redécoupés (ailleurs, ceux de 2026 sont les mêmes)
    "geo24": {"type": "FeatureCollection", "features": [feat(k, g24[k]) for k in sorted(g24)]},
    "geoEtats": {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"fips": s["properties"]["STATEFP"]}, "geometry": geom(s)}
                                                           for s in t["objects"]["states"]["geometries"] if s["properties"]["STATEFP"] in FIPS]},
}
json.dump(sortie, open(os.path.join(ICI, "..", "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(ids)} districts de 2026, {len(ids24)} de 2024 · États redécoupés : {', '.join(sortie['redecoupes'])} · {os.path.getsize(os.path.join(ICI, '..', 'data.json')) // 1024} Ko")
