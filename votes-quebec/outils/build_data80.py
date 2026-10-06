"""Assemble data.json (tout ce que la page charge) à partir des fichiers de outils/.

Entrées : proj.json + ridings.tsv (Qc125), elec_circ.csv (Élections Québec), m80/sections_pts.csv (codes CEP),
          m80/districts.json + m80/d80.json + m80/r80.json (sortie de m80/district2.py + mapshaper),
          m80/c127.json (127 circonscriptions actuelles, simplifiées par mapshaper).
Sortie  : data.json
"""
import json, csv, re, importlib.util, io, contextlib, os

spec = importlib.util.spec_from_file_location("sim", "sim.py"); sim = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(sim)

CODES = ["Bas-Saint-Laurent", "Saguenay–Lac-Saint-Jean", "Capitale-Nationale", "Mauricie", "Estrie", "Montréal",
         "Outaouais", "Abitibi-Témiscamingue", "Côte-Nord", "Nord-du-Québec", "Gaspésie–Îles-de-la-Madeleine",
         "Chaudière-Appalaches", "Laval", "Lanaudière", "Laurentides", "Montérégie", "Centre-du-Québec"]
code = {n: f"{i+1:02d}" for i, n in enumerate(CODES)}
norm = lambda s: re.sub(r'[^a-z]', '', s.lower().replace('’', '').translate(str.maketrans('éèêëàâîïôöûùüç', 'eeeeaaiioouuuc')))
P = sim.PARTIES

# 127 circonscriptions actuelles : projections Qc125 + électeurs
ids = {n: i for i, n in (l.rstrip("\n").split("\t") for l in open("ridings.tsv", encoding="utf-8"))}
proj = json.load(open("proj.json", encoding="utf-8"))
rid = [{"n": n, "id": ids[n], "r": code[sim.REGION_OF[n]], "s": [v.get(p, 0) for p in P],
        "o": [P.index(p) for p in v if p in P]} for n, v in proj.items()]
byn = {norm(x["n"]): x for x in rid}
cep2name = {r["CO_CEP"]: r["NM_CEP"] for r in csv.DictReader(open("m80/sections_pts.csv", encoding="utf-8"))}
for r in csv.DictReader(open("elec_circ.csv", encoding="latin1"), delimiter=";"):
    c = r["CODE_CIRCONSCRIPTION"]
    if c in cep2name:
        byn[norm(cep2name[c])]["e"] = int(r["NOMBRE_ELECTEURS_APRES_REVISION_ORDINAIRE"] or r["NOMBRE_ELECTEURS_AU_DECRET"])
assert all("e" in x for x in rid), [x["n"] for x in rid if "e" not in x]

# résultat officiel de l'élection du 5 octobre 2026 (election.py, Élections Québec) : la simulation Loi 39 le prend comme
# base dès qu'il est définitif ; « s » garde la projection Qc125 (utilisée par Votes Québec quand les sondages reprendront)
SOURCE = {"type": "qc125"}
if os.path.exists("../election-2026.json"):
    EL = json.load(open("../election-2026.json", encoding="utf-8"))
    if EL.get("final"):
        elec = {norm(n): c for n, c in EL["circ"].items()}
        assert all(norm(x["n"]) in elec for x in rid), [x["n"] for x in rid if norm(x["n"]) not in elec]
        for x in rid:
            c, g = elec[norm(x["n"])]["s"], elec[norm(x["n"])]["g"]
            x["se"] = [c.get(p, 0) for p in P]
            # ordre pour départager : le gagnant officiel d'abord (parts arrondies à 0,1 : Vachon, PLQ et PQ à 27,5 %)
            x["oe"] = sorted(range(len(P)), key=lambda i: (-x["se"][i], P[i] != g))
        SOURCE = {"type": "election", "date": EL["date"], "texte": "5 octobre 2026", "titre": EL.get("titre", "")}

# 80 circonscriptions hypothétiques
D = json.load(open("m80/districts.json", encoding="utf-8"))
idx = {x["n"]: i for i, x in enumerate(rid)}
districts = [{"id": int(k), "name": d["name"], "r": code[d["reg"]], "e": d["electors"],
              "comp": [[idx[p], e] for p, e in d["comp"].items()]}
             for k, d in sorted(D["districts"].items(), key=lambda t: int(t[0]))]


# d3 veut des anneaux extérieurs en sens horaire (aire planaire < 0) et des trous antihoraires
def area(r): return sum(r[i][0] * r[i+1][1] - r[i+1][0] * r[i][1] for i in range(len(r) - 1)) / 2
def fix(poly): return [(r[::-1] if ((i == 0 and area(r) > 0) or (i > 0 and area(r) < 0)) else r) for i, r in enumerate(poly)]
def rewind(g):
    g["features"] = [f for f in g["features"] if f.get("geometry")]
    for f in g["features"]:
        geo = f["geometry"]
        geo["coordinates"] = fix(geo["coordinates"]) if geo["type"] == "Polygon" else [fix(p) for p in geo["coordinates"]]
    return g


dg = rewind(json.load(open("m80/d80.json", encoding="utf-8")))
rg = rewind(json.load(open("m80/r80.json", encoding="utf-8")))
for f in rg["features"]: f["properties"] = {"REG": code[f["properties"]["REG"]]}
for f in dg["features"]: f["properties"] = {"DID": f["properties"]["DID"]}

# 127 circonscriptions actuelles (carte « mode actuel ») : RID = rang dans ridings, appariement par nom normalisé
cg = rewind(json.load(open("m80/c127.json", encoding="utf-8")))
ridx = {norm(x["n"]): i for i, x in enumerate(rid)}
for f in cg["features"]: f["properties"] = {"RID": ridx[norm(f["properties"]["NM_CEP"])]}
assert sorted(f["properties"]["RID"] for f in cg["features"]) == list(range(len(rid)))

# régions de la carte actuelle : les 127 circonscriptions fusionnées par région (m80/r127.py + mapshaper)
cr = rewind(json.load(open("m80/r127.json", encoding="utf-8"))) if os.path.exists("m80/r127.json") else None
if cr:
    for f in cr["features"]: f["properties"] = {"REG": code[f["properties"]["REG"]]}

data = {"regions": [{"code": code[n], "name": n, "electors": D["elec_reg"][n]} for n in CODES],
        "ridings": rid, "districts": districts, "districtGeo": dg, "regionGeo": rg, "ridingGeo": cg, "curRegionGeo": cr,
        "maj": json.load(open("maj.json", encoding="utf-8")) if os.path.exists("maj.json") else {}, "source": SOURCE}
open("data.json", "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
print("data.json", os.path.getsize("data.json"), "octets ·", len(rid), "circ. actuelles ·", len(districts), "hypothétiques")
