"""Votes Alberta : contours des 87 circonscriptions (carte de 2017, utilisée en 2019 et en 2023) et résultat officiel de
l'élection générale du 29 mai 2023.

Sorties (fichiers fixes : ils ne changent qu'avec une nouvelle élection ou une nouvelle carte) :
    ../data.json             contours simplifiés (circonscriptions, trois régions des sondeurs), noms, région de chaque circonscription
    ../resultats-2023.json   résultat officiel : voix et sièges par parti (province, régions), candidats et voix de chaque circonscription

Sources (Elections Alberta) :
    contours   2019Boundaries_ED-Shapefiles.zip (EDS_ENACTED_BILL33_15DEC2017, NAD83 / Alberta 10-TM Resource ≈ EPSG:3402),
               Open Government Licence – Alberta
    résultats  2023-Provincial-General-Election-Statement-of-Vote.xlsx (une feuille par circonscription, 01 à 87 ;
               ligne « Total (All Voting Options) »)
Le champ EDNumber20 du fichier des contours est le numéro de la feuille du classeur. Régions des sondeurs : Calgary = 01 à 26,
Edmonton = 27 à 46, reste de l'Alberta = 47 à 87 (banlieues comprises). Le Parti albertain (AP en 2023) est devenu le
Progressive Tory Party le 18 décembre 2025 : une seule clé, PT.
Les téléchargements bruts vont dans brut/ (non publiés).

Usage : /usr/bin/python3 alberta_fixe.py   (dans le dossier outils/ ; pip install pyshp pyproj shapely topojson openpyxl)
"""
import collections, io, json, os, urllib.request, zipfile
import openpyxl
import shapefile                       # pyshp
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely import transform as transformer
import topojson

ICI = os.path.dirname(os.path.abspath(__file__))
RAC = os.path.join(ICI, "..")
BRUT = os.path.join(ICI, "brut")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
EA = "https://www.elections.ab.ca/uploads/"
FICHIERS = {"2019Boundaries_ED-Shapefiles.zip": EA + "2019Boundaries_ED-Shapefiles.zip",
            "2023-Provincial-General-Election-Statement-of-Vote.xlsx": EA + "2023-Provincial-General-Election-Statement-of-Vote.xlsx"}
# sigle d'Elections Alberta → clé de la page (les autres partis gardent leur sigle et sont comptés dans « AUT »)
CLE = {"UCP": "UCP", "NDP": "NPD", "GPA": "VERT", "AP": "PT", "LIB": "LIB"}
REGIONS = [("cal", "Calgary"), ("edm", "Edmonton"), ("rest", "Reste de l'Alberta")]


def region(n):
    return "cal" if n <= 26 else "edm" if n <= 46 else "rest"


def brut(nom):
    f = os.path.join(BRUT, nom)
    if not os.path.exists(f):
        os.makedirs(BRUT, exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(FICHIERS[nom], headers=UA), timeout=120) as r:
            open(f, "wb").write(r.read())
    return f


# ---------- contours ----------
z = zipfile.ZipFile(brut("2019Boundaries_ED-Shapefiles.zip"))
nom_shp = next(n for n in z.namelist() if n.lower().endswith(".shp"))
base = nom_shp[:-4]
lire = lambda ext: io.BytesIO(z.read(base + ext))
sf = shapefile.Reader(shp=lire(".shp"), shx=lire(".shx"), dbf=lire(".dbf"), encoding="utf-8")
crs = CRS.from_wkt(z.read(base + ".prj").decode())
vers_wgs = Transformer.from_crs(crs, CRS.from_epsg(4326), always_xy=True).transform
geoms, noms = {}, {}
for sr in sf.shapeRecords():
    n = int(sr.record["EDNumber20"])
    noms[n] = sr.record["EDName2017"].strip().replace("--", "-")
    geoms[n] = transformer(shape(sr.shape.__geo_interface__), lambda xy: __import__("numpy").column_stack(vers_wgs(xy[:, 0], xy[:, 1]))).buffer(0)
if sorted(geoms) != list(range(1, 88)):
    raise SystemExit(f"{len(geoms)} circonscriptions lues (87 attendues, numéros 1 à 87)")

fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": n}, "geometry": mapping(g)} for n, g in sorted(geoms.items())]}
# simplification en gardant les frontières communes (pas de fente entre voisines) ; Calgary et Edmonton restent lisibles
simple = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=0.002, simplify_algorithm="dp").to_geojson())


def arrondi(o):
    return [arrondi(x) for x in o] if isinstance(o[0], (list, tuple)) else [round(o[0], 4), round(o[1], 4)]


feats = sorted(({"type": "Feature", "properties": {"RID": f["properties"]["id"] - 1},
                 "geometry": {"type": f["geometry"]["type"], "coordinates": arrondi(f["geometry"]["coordinates"])}} for f in simple["features"]),
               key=lambda f: f["properties"]["RID"])
par_reg = collections.defaultdict(list)
for f in feats:
    par_reg[region(f["properties"]["RID"] + 1)].append(shape(f["geometry"]).buffer(0))
regs = [{"type": "Feature", "properties": {"REG": k},
         "geometry": (lambda g: {"type": g["type"], "coordinates": arrondi(g["coordinates"])})(mapping(unary_union(par_reg[k]).buffer(0)))} for k, _ in REGIONS]
data = {"source": "Elections Alberta, circonscriptions de 2017 (EDS_ENACTED_BILL33_15DEC2017), Open Government Licence – Alberta",
        "ridings": [{"id": f"{n:02d}", "n": noms[n], "r": region(n)} for n in range(1, 88)],
        "regions": [{"code": k, "name": nom} for k, nom in REGIONS],
        "ridingGeo": {"type": "FeatureCollection", "features": feats}, "curRegionGeo": {"type": "FeatureCollection", "features": regs}}
json.dump(data, open(os.path.join(RAC, "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"data.json : 87 circonscriptions · {os.path.getsize(os.path.join(RAC, 'data.json')) // 1024} Ko")

# ---------- résultat de 2023 ----------
wb = openpyxl.load_workbook(brut("2023-Provincial-General-Election-Statement-of-Vote.xlsx"), read_only=True, data_only=True)
if len(wb.sheetnames) != 87:
    raise SystemExit(f"{len(wb.sheetnames)} feuilles dans le classeur (87 attendues)")
circ, prov, reg = [], collections.Counter(), {k: collections.Counter() for k, _ in REGIONS}
sieges, sieges_reg = collections.Counter(), {k: collections.Counter() for k, _ in REGIONS}
tot = collections.Counter()
for n in range(1, 88):
    rows = list(wb[f"{n:02d}"].iter_rows(values_only=True))
    tete = rows[0]
    total = next(r for r in rows if r[1] and str(r[1]).startswith("Total (All Voting Options)"))
    i_listes = tete.index("Names on List")
    cands = []
    for j in range(4, i_listes):
        if not tete[j]: continue
        nom, sigle = [x.strip() for x in str(tete[j]).split("\n")[:2]]
        cands.append([nom, CLE.get(sigle, sigle), int(total[j] or 0)])
    cands.sort(key=lambda c: -c[2])
    valides = int(total[tete.index("Valid Ballots Cast")])
    if sum(c[2] for c in cands) != valides:
        raise SystemExit(f"circonscription {n:02d} : la somme des voix ({sum(c[2] for c in cands)}) ≠ bulletins valides ({valides})")
    inscrits, bulletins = int(total[i_listes]), int(total[tete.index("Total Ballots Cast")])
    k = region(n)
    for c in cands:
        p = c[1] if c[1] in CLE.values() else "AUT"
        prov[p] += c[2]; reg[k][p] += c[2]
    sieges[cands[0][1]] += 1; sieges_reg[k][cands[0][1]] += 1
    tot.update({"valides": valides, "inscrits": inscrits, "bulletins": bulletins})
    circ.append({"id": f"{n:02d}", "valides": valides, "inscrits": inscrits, "bulletins": bulletins, "c": cands})
pct = lambda c: {p: round(100 * v / sum(c.values()), 2) for p, v in sorted(c.items(), key=lambda kv: -kv[1])}
res = {"date": "2023-05-29", "source": "Elections Alberta, 2023 Provincial General Election, Statement of Vote (résultats officiels)",
       "province": {"voix": dict(prov.most_common()), "pct": pct(prov), "s": dict(sieges.most_common()), **dict(tot)},
       "regions": {k: {"pct": pct(reg[k]), "s": dict(sieges_reg[k].most_common()), "valides": sum(reg[k].values())} for k, _ in REGIONS},
       "circ": circ}
if res["province"]["s"] != {"UCP": 49, "NPD": 38} or abs(res["province"]["pct"]["UCP"] - 52.63) > 0.01:
    raise SystemExit(f"résultat inattendu : {res['province']['s']} {res['province']['pct']}")
json.dump(res, open(os.path.join(RAC, "resultats-2023.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("resultats-2023.json :", res["province"]["s"], res["province"]["pct"])
for k, nom in REGIONS: print(f"  {nom} : {res['regions'][k]['s']} {res['regions'][k]['pct']}")
