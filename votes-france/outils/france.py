"""Votes France : résultat des législatives de 2024 par circonscription + contours simplifiés → ../data.json

Sources (data.gouv.fr, ministère de l'Intérieur) :
  - liste des 577 élus (nuance du gagnant, tour) ;
  - résultats définitifs du 1er tour par circonscription (voix de chaque candidat, nuance) ;
  - contours des circonscriptions législatives (559 tracés : sans les Français de l'étranger ni certaines collectivités d'outre-mer).
Les nuances du ministère sont regroupées en blocs (gauche NFP, Ensemble, LR, RN-UDR…), du plus à gauche au plus à droite.
Usage : /usr/bin/python3 france.py   (dans le dossier outils/ ; les fichiers bruts sont mis dans brut/)
"""
import csv, json, os, urllib.request, collections
import openpyxl                                   # pip install openpyxl shapely
from shapely.geometry import shape, mapping

ICI = os.path.dirname(os.path.abspath(__file__))
BRUT = os.path.join(ICI, "brut")
SOURCES = {
    "elus.csv": "https://static.data.gouv.fr/resources/elections-legislatives-des-30-juin-et-7-juillet-2024-liste-provisoire-des-elus/20240708-003829/legislatives-2024-candidats-elus-france-entiere-tour-1-2-2024-07-08-01h58.csv",
    "t1circ.xlsx": "https://static.data.gouv.fr/resources/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour/20240710-171239/resultats-definitifs-par-circonscriptions-legislatives.xlsx",
    "circ-p10.geojson": "https://static.data.gouv.fr/resources/contours-geographiques-des-circonscriptions-legislatives/20240613-191520/circonscriptions-legislatives-p10.geojson",
}
# nuances 2024 → blocs (de gauche à droite, ordre de l'hémicycle)
BLOCS = ["EXG", "NFP", "DVG", "REG", "ENS", "DVC", "LR", "DVD", "RN", "EXD", "DIV"]
NUANCE = {"EXG": "EXG", "UG": "NFP", "FI": "NFP", "SOC": "NFP", "COM": "NFP", "VEC": "NFP", "RDG": "DVG", "DVG": "DVG", "ECO": "DVG",
          "REG": "REG", "ENS": "ENS", "REN": "ENS", "MDM": "ENS", "HOR": "ENS", "DVC": "DVC", "UDI": "DVC", "LR": "LR", "DVD": "DVD",
          "DSV": "DVD", "RN": "RN", "UXD": "RN", "REC": "EXD", "EXD": "EXD", "DIV": "DIV"}
OUTREMER = {"971": "ZA", "972": "ZB", "973": "ZC", "974": "ZD", "975": "ZS", "976": "ZM", "986": "ZW", "987": "ZP", "988": "ZN"}
REGIONS = {
    "Auvergne-Rhône-Alpes": "01 03 07 15 26 38 42 43 63 69 73 74", "Bourgogne-Franche-Comté": "21 25 39 58 70 71 89 90",
    "Bretagne": "22 29 35 56", "Centre-Val de Loire": "18 28 36 37 41 45", "Corse": "2A 2B", "Grand Est": "08 10 51 52 54 55 57 67 68 88",
    "Hauts-de-France": "02 59 60 62 80", "Île-de-France": "75 77 78 91 92 93 94 95", "Normandie": "14 27 50 61 76",
    "Nouvelle-Aquitaine": "16 17 19 23 24 33 40 47 64 79 86 87", "Occitanie": "09 11 12 30 31 32 34 46 48 65 66 81 82",
    "Pays de la Loire": "44 49 53 72 85", "Provence-Alpes-Côte d'Azur": "04 05 06 13 83 84",
    "Outre-mer": "ZA ZB ZC ZD ZM ZS ZW ZP ZN ZX", "Français de l'étranger": "ZZ",
}
REGION_DE = {d: r for r, ds in REGIONS.items() for d in ds.split()}


def brut(nom):
    os.makedirs(BRUT, exist_ok=True)
    f = os.path.join(BRUT, nom)
    if not os.path.exists(f):
        with urllib.request.urlopen(urllib.request.Request(SOURCES[nom], headers={"User-Agent": "Mozilla/5.0"}), timeout=120) as r:
            open(f, "wb").write(r.read())
    return f


def dep_code(d):
    d = str(d).strip()
    if d in OUTREMER: return OUTREMER[d]
    return d.zfill(2) if d.isdigit() else d


def ordinal(n): return "1re" if n == 1 else f"{n}e"


# --- 1er tour par circonscription
ws = openpyxl.load_workbook(brut("t1circ.xlsx"), read_only=True).active
lignes = ws.iter_rows(values_only=True)
tete = next(lignes)
pct = lambda s: float(str(s).replace("%", "").replace(",", ".")) if s not in (None, "") else 0.0
circ, nat, exprimes_tot = {}, collections.Counter(), 0
for r in lignes:
    if r[0] is None: continue
    code = str(r[2])
    if code.isdigit():                                     # 101 → 01 01 ; 97101 → ZA 01
        d, c = (code[:-2], int(code[-2:]))
        cid = dep_code(d) + f"{c:02d}"
    else:
        cid, c = code, int(code[-2:])
    dep = cid[:2]
    exprimes = int(r[9] or 0); exprimes_tot += exprimes
    cands = []
    for k in range(18, len(tete), 9):
        if k + 8 >= len(r) or r[k + 1] is None: break
        nu, voix = r[k + 1], int(r[k + 5] or 0)
        b = NUANCE.get(nu, "DIV"); nat[b] += voix
        cands.append({"b": b, "nu": nu, "nom": f"{r[k + 3] or ''} {(r[k + 2] or '').title()}".strip(), "v": voix, "p": round(pct(r[k + 7]), 2)})
    cands.sort(key=lambda x: -x["v"])
    parts = collections.Counter()
    for k in cands: parts[k["b"]] += k["v"]
    circ[cid] = {"id": cid, "d": dep, "dn": r[1], "r": REGION_DE.get(dep, "Outre-mer"), "n": f"{r[1]} ({ordinal(c)})", "e": int(r[4] or 0),
                 "part": round(pct(r[6]), 1), "s": {b: round(100 * v / max(1, exprimes), 1) for b, v in parts.most_common()},
                 "c": [{k2: x[k2] for k2 in ("b", "nu", "nom", "p")} for x in cands[:3]]}

# --- élus (gagnant de chaque circonscription, 1er ou 2e tour)
sieges = collections.Counter()
with open(brut("elus.csv"), encoding="utf-8", errors="replace") as f:
    for r in csv.DictReader(f, delimiter=";"):
        cid = dep_code(r["CODDPT"]) + f"{int(r['CODCIRLG']):02d}"
        b = NUANCE.get(r["CODE_NUA"], "DIV"); sieges[b] += 1
        if cid not in circ: raise SystemExit(f"circonscription {cid} absente du 1er tour")
        circ[cid].update({"g": b, "gnu": r["CODE_NUA"], "elu": f"{r['PREPSN']} {r['NOMPSN'].title()}", "t": 1 if "T1" in r["TOUR_ELECTION"] else 2})
assert sum(sieges.values()) == 577 and all("g" in c for c in circ.values()), "577 élus attendus"

# --- contours : simplifiés en gardant les frontières communes (topologie : pas de fentes entre voisines), ≈ 120 m
import topojson                                   # pip install topojson
g = json.load(open(brut("circ-p10.geojson"), encoding="utf-8"))
def arrondi(o):
    return [arrondi(x) for x in o] if isinstance(o[0], (list, tuple)) else [round(o[0], 4), round(o[1], 4)]
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": f["properties"]["codeCirconscription"]}, "geometry": f["geometry"]}
                                                 for f in g["features"] if f["properties"]["codeCirconscription"] in circ]}
simple = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=0.0012, simplify_algorithm="dp").to_geojson())
feats = [{"type": "Feature", "properties": {"id": f["properties"]["id"]}, "geometry": {"type": f["geometry"]["type"], "coordinates": arrondi(f["geometry"]["coordinates"])}}
         for f in simple["features"]]

# départements : union des circonscriptions (traits plus épais sur la carte)
from shapely.ops import unary_union
par_dep = collections.defaultdict(list)
for f in feats: par_dep[circ[f["properties"]["id"]]["d"]].append(shape(f["geometry"]).buffer(0))
deps = []
for d, geoms in sorted(par_dep.items()):
    geom = mapping(unary_union(geoms))   # pas de nouvelle simplification : les traits suivent les circonscriptions
    deps.append({"type": "Feature", "properties": {"d": d}, "geometry": {"type": geom["type"], "coordinates": arrondi(geom["coordinates"])}})

sortie = {
    "titre": "Élections législatives des 30 juin et 7 juillet 2024", "date": "2024-07-07", "blocs": BLOCS,
    "national": {b: round(100 * nat[b] / exprimes_tot, 1) for b in BLOCS if nat[b]},
    "sieges": {b: sieges[b] for b in BLOCS if sieges[b]},
    "regions": list(REGIONS), "circ": sorted(circ.values(), key=lambda c: c["id"]),
    "geo": {"type": "FeatureCollection", "features": feats}, "deps": {"type": "FeatureCollection", "features": deps},
}
json.dump(sortie, open(os.path.join(ICI, "..", "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(circ)} circonscriptions ({len(feats)} tracées) · sièges {dict(sieges)} · 1er tour {sortie['national']}")
