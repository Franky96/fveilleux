"""Votes Royaume-Uni : contours des 650 circonscriptions de 2024 et résultats de l'élection du 4 juillet 2024 → ../data.json, ../resultats-2024.json

Fichiers fixes (ne changent qu'avec un nouveau découpage ou une nouvelle élection générale) ; les données qui bougent (sondages,
projection, députés actuels) sont écrites par sondages_uk.py.
  Contours : Office for National Statistics, « Westminster Parliamentary Constituencies (July 2024) Boundaries UK BGC »
             (généralisés à 20 m, Open Government Licence v3.0), lus sur le service ArcGIS de l'ONS ; simplifiés en gardant
             les frontières communes (topologie) ; les anneaux sont remis dans le sens de d3.
  Résultats : base de données de la House of Commons Library (« Election results », electionresults.parliament.uk, dépôt
             ukparliament/psephology-datasette), élection générale du 4 juillet 2024, candidats et voix de chaque circonscription.
Usage : /usr/bin/python3 royaume_uni_fixe.py   (dans le dossier outils/ ; téléchargements dans brut/ ; pip install shapely topojson)
"""
import collections, json, os, sqlite3, time, urllib.parse, urllib.request
import shapely
from shapely.geometry import shape, mapping, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
import topojson

ICI = os.path.dirname(os.path.abspath(__file__))
RAC = os.path.join(ICI, "..")
BRUT = os.path.join(ICI, "brut")
UA = {"User-Agent": "Mozilla/5.0 (compatible; fveilleuxBot/1.0; +https://fveilleux.com)"}
ONS = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
       "Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BGC/FeatureServer/0/query")
BASE = "https://raw.githubusercontent.com/ukparliament/psephology-datasette/main/psephology.db"
os.makedirs(BRUT, exist_ok=True)


def telecharger(url, essais=4):
    for k in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                return r.read()
        except Exception:
            if k == essais - 1: raise
            time.sleep(3 * (k + 1))


# ---------- régions (les 12 régions de niveau ITL1 : 9 d'Angleterre, Écosse, Pays de Galles, Irlande du Nord) ----------
REGIONS = [("NE", "North East", "Nord-Est"), ("NW", "North West", "Nord-Ouest"), ("YH", "Yorkshire and The Humber", "Yorkshire et Humber"),
           ("EM", "East Midlands", "Midlands de l'Est"), ("WM", "West Midlands", "Midlands de l'Ouest"), ("EE", "East of England", "Est de l'Angleterre"),
           ("LON", "London", "Grand Londres"), ("SE", "South East", "Sud-Est"), ("SW", "South West", "Sud-Ouest"),
           ("SCO", None, "Écosse"), ("WAL", None, "Pays de Galles"), ("NI", None, "Irlande du Nord")]
CODE_REG = {n: c for c, n, _ in REGIONS if n}

# ---------- 1. résultats de 2024 (base de la Commons Library) ----------
chemin_db = os.path.join(BRUT, "psephology.db")
if not os.path.exists(chemin_db):
    open(chemin_db, "wb").write(telecharger(BASE))
db = sqlite3.connect(chemin_db)
db.row_factory = sqlite3.Row
CODES = {"Lab": "LAB", "Con": "CON", "RUK": "REF", "LD": "LD", "Green": "VERT", "SNP": "SNP", "PC": "PC",
         "SF": "SF", "DUP": "DUP", "APNI": "ALL", "UUP": "UUP", "SDLP": "SDLP", "TUV": "TUV"}
circ = []
for e in db.execute("""select e.id eid, a.geographic_code code, a.name nom, r.name reg, a.country_id co, e.valid_vote_count valides,
                              e.invalid_vote_count nuls, el.population_count inscrits
                       from elections e join constituency_groups g on g.id = e.constituency_group_id
                       join constituency_areas a on a.id = g.constituency_area_id
                       left join english_regions r on r.id = a.english_region_id
                       left join electorates el on el.id = e.electorate_id
                       where e.general_election_id = 6 and e.is_notional = 0 order by a.geographic_code"""):
    reg = CODE_REG.get(e["reg"]) or {"S": "SCO", "W": "WAL", "N": "NI"}.get(e["code"][0])
    if not reg: raise SystemExit(f"région inconnue : {e['nom']} ({e['code']}, {e['reg']})")
    cands = []
    for c in db.execute("""select cd.candidate_given_name g, cd.candidate_family_name f, cd.vote_count v, cd.is_standing_as_commons_speaker spk,
                                  cd.is_standing_as_independent ind, p.abbreviation pa
                           from candidacies cd
                           left join certifications ce on ce.candidacy_id = cd.id and ce.adjunct_to_certification_id is null
                           left join political_parties p on p.id = ce.political_party_id
                           where cd.election_id = ? order by cd.vote_count desc, cd.result_position""", (e["eid"],)):
        if c["spk"]: code, lib = "SPK", None
        elif c["ind"] or not c["pa"]: code, lib = "IND", None
        elif c["pa"] in CODES: code, lib = CODES[c["pa"]], None
        else: code, lib = "AUT", c["pa"]
        cands.append([f"{c['g']} {c['f']}".strip(), code, c["v"]] + ([lib] if lib else []))
    total = sum(c[2] for c in cands)
    if abs(total - e["valides"]) > 5: raise SystemExit(f"{e['nom']} : {total} voix des candidats, {e['valides']} votes valides")
    circ.append({"id": e["code"], "n": e["nom"], "r": reg, "valides": e["valides"], "inscrits": e["inscrits"], "bulletins": e["valides"] + (e["nuls"] or 0), "c": cands})
if len(circ) != 650: raise SystemExit(f"{len(circ)} circonscriptions lues (650 attendues)")

# totaux : Royaume-Uni, Grande-Bretagne (sans l'Irlande du Nord), régions
def totaux(lst):
    voix, sieges = collections.Counter(), collections.Counter()
    for x in lst:
        for nom, p, v, *_ in x["c"]: voix[p] += v
        sieges[x["c"][0][1]] += 1
    val = sum(x["valides"] for x in lst)
    return {"voix": dict(voix.most_common()), "pct": {p: round(100 * v / val, 2) for p, v in voix.most_common()}, "s": dict(sieges.most_common()),
            "valides": val, "inscrits": sum(x["inscrits"] or 0 for x in lst), "bulletins": sum(x["bulletins"] for x in lst)}
sortie = {"date": "2024-07-04", "source": "House of Commons Library, résultats de l'élection générale du 4 juillet 2024 (electionresults.parliament.uk)",
          "royaume": totaux(circ), "gb": totaux([x for x in circ if x["r"] != "NI"]),
          "regions": {c: totaux([x for x in circ if x["r"] == c]) for c, _, _ in REGIONS},
          "circ": [{k: v for k, v in x.items() if k not in ("n", "r")} for x in circ]}
json.dump(sortie, open(os.path.join(RAC, "resultats-2024.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("Résultats 2024 :", {p: s for p, s in sortie["royaume"]["s"].items()}, "·", sum(sortie["royaume"]["s"].values()), "sièges")

# ---------- 2. contours ----------
brut = os.path.join(BRUT, "pcon24_bgc.geojson")
if not os.path.exists(brut):
    feats, depart = [], 0
    while True:
        q = {"where": "1=1", "outFields": "PCON24CD,PCON24NM", "outSR": "4326", "f": "geojson", "resultOffset": depart, "resultRecordCount": 50}
        page = json.loads(telecharger(ONS + "?" + urllib.parse.urlencode(q)))
        feats += page["features"]; depart += 50
        if not page["features"] or (len(page["features"]) < 50 and not page.get("exceededTransferLimit")): break
    if len(feats) != 650: raise SystemExit(f"{len(feats)} contours lus (650 attendus)")
    json.dump({"type": "FeatureCollection", "features": feats}, open(brut, "w"))
geoms = {f["properties"]["PCON24CD"]: shape(f["geometry"]).buffer(0) for f in json.load(open(brut))["features"]}
manque = {x["id"] for x in circ} ^ set(geoms)
if manque: raise SystemExit(f"codes sans correspondance entre les contours et les résultats : {sorted(manque)[:10]}")

def nettoyer(geo, seuil=float(os.environ.get("ILES", "0.0004"))):
    """petites îles retirées (moins de 0,0004 degré carré, environ 3 km²) ; le plus grand morceau est toujours gardé"""
    parts = list(geo.geoms) if geo.geom_type == "MultiPolygon" else [geo]
    grand = max(parts, key=lambda p: p.area)
    return unary_union([p for p in parts if p is grand or p.area >= seuil])


fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": k}, "geometry": mapping(nettoyer(g))} for k, g in sorted(geoms.items())]}
simple = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=float(os.environ.get("SIMPLIF", "0.004")), simplify_algorithm="dp").to_geojson())


def arrondi(o):
    return [arrondi(x) for x in o] if isinstance(o[0], (list, tuple)) else [round(o[0], 4), round(o[1], 4)]


def sens_d3(geo):
    """coordonnées arrondies à 4 décimales (grille commune : les frontières partagées restent identiques), puis anneaux dans le sens de d3
    (extérieur horaire), polygone par polygone ; un morceau devenu minuscule ou dégénéré par l'arrondi est retiré (il aurait le mauvais sens)"""
    geo = shapely.set_precision(geo, 0.0001)
    polys = [p for p in (list(geo.geoms) if geo.geom_type in ("MultiPolygon", "GeometryCollection") else [geo]) if p.geom_type == "Polygon" and p.area > 2e-8 and p.is_valid]
    polys = [orient(p, sign=-1.0) for p in polys]
    if not polys: raise SystemExit("géométrie vide après arrondi")
    m = mapping(polys[0] if len(polys) == 1 else MultiPolygon(polys))
    m["coordinates"] = arrondi(m["coordinates"])
    return m


ids = [x["id"] for x in circ]                       # trié par code ONS : l'indice est le RID
ordre = {c: i for i, c in enumerate(ids)}
par_id = {f["properties"]["id"]: shape(f["geometry"]).buffer(0) for f in simple["features"]}
feats = []
for c in ids:
    g = par_id[c]
    if g.is_empty: raise SystemExit(f"contour vide après simplification : {c}")
    m = sens_d3(g)
    feats.append({"type": "Feature", "properties": {"RID": ordre[c]}, "geometry": m})
par_reg = collections.defaultdict(list)
for x in circ: par_reg[x["r"]].append(par_id[x["id"]])
regs = []
for c, _, _ in REGIONS:
    m = sens_d3(unary_union(par_reg[c]).buffer(0))
    regs.append({"type": "Feature", "properties": {"REG": c}, "geometry": m})
data = {"source": "Office for National Statistics, circonscriptions de Westminster de juillet 2024 (BGC), Open Government Licence v3.0",
        "ridings": [{"id": x["id"], "n": x["n"], "r": x["r"]} for x in circ],
        "regions": [{"code": c, "name": fr} for c, _, fr in REGIONS],
        "ridingGeo": {"type": "FeatureCollection", "features": feats}, "curRegionGeo": {"type": "FeatureCollection", "features": regs}}
json.dump(data, open(os.path.join(RAC, "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(ids)} circonscriptions · data.json {os.path.getsize(os.path.join(RAC, 'data.json')) // 1024} Ko")
