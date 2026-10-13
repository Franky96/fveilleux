"""Votes Allemagne : contours des 299 circonscriptions (Wahlkreise) de 2025 et résultats de l'élection du 23 février 2025.

Sorties (fichiers fixes : ils ne changent qu'avec une nouvelle élection ou un nouveau découpage) :
    ../data.json             contours simplifiés (circonscriptions, Länder), noms, Land de chaque circonscription
    ../resultats-2025.json   résultat officiel : voix nationales, par Land et par circonscription (1re et 2e voix),
                             sièges par parti et par Land, élu de chaque circonscription (ou circonscription sans siège)

Sources (Die Bundeswahlleiterin, licence dl-de/by-2-0) :
    contours   btw25_geometrie_wahlkreise_shp_geo.zip (version généralisée de l'office, sans la mer, WGS 84)
    résultats  kerg2.csv (résultat définitif, format long), btw25_gewaehlte_utf8.csv (les 630 élus, définitif)
Les téléchargements bruts vont dans brut/ (non publiés).

Usage : /usr/bin/python3 allemagne_geo.py   (dans le dossier outils/ ; pip install shapely topojson pyshp)
"""
import collections, csv, io, json, os, urllib.request, zipfile
import shapefile                       # pyshp
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
import topojson

ICI = os.path.dirname(os.path.abspath(__file__))
BRUT = os.path.join(ICI, "brut")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
BWL = "https://www.bundeswahlleiterin.de"
FICHIERS = {
    "wk_geo.zip": BWL + "/dam/jcr/556bec9c-be80-4818-a368-fe6596f15f08/btw25_geometrie_wahlkreise_shp_geo.zip",
    "kerg2.csv": BWL + "/bundestagswahlen/2025/ergebnisse/opendata/btw25/csv/kerg2.csv",
    "gew.zip": BWL + "/dam/jcr/eeb02132-caeb-430a-ae1f-6cd5907f1809/btw25_gewaehlte_utf8.zip",
}
# numéro du Land → abréviation, nom en français
LAND = {"01": ("SH", "Schleswig-Holstein"), "02": ("HH", "Hambourg"), "03": ("NI", "Basse-Saxe"), "04": ("HB", "Brême"),
        "05": ("NW", "Rhénanie-du-Nord–Westphalie"), "06": ("HE", "Hesse"), "07": ("RP", "Rhénanie-Palatinat"),
        "08": ("BW", "Bade-Wurtemberg"), "09": ("BY", "Bavière"), "10": ("SL", "Sarre"), "11": ("BE", "Berlin"),
        "12": ("BB", "Brandebourg"), "13": ("MV", "Mecklembourg-Poméranie-Occidentale"), "14": ("SN", "Saxe"),
        "15": ("ST", "Saxe-Anhalt"), "16": ("TH", "Thuringe")}
# nom du parti dans les fichiers officiels → clé de la page ; les autres partis vont dans « AUT »
CLE = {"CDU": "CDU", "CSU": "CSU", "SPD": "SPD", "AfD": "AfD", "GRÜNE": "Grüne", "Die Linke": "Linke", "BSW": "BSW",
       "FDP": "FDP", "FREIE WÄHLER": "FW", "SSW": "SSW"}


def telecharger(nom):
    chemin = os.path.join(BRUT, nom)
    if not os.path.exists(chemin):
        os.makedirs(BRUT, exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(FICHIERS[nom], headers=UA), timeout=180) as r:
            open(chemin, "wb").write(r.read())
    return chemin


def nombre(s):
    s = (s or "").strip()
    return float(s.replace(",", ".")) if s else None


# ---------- résultats (kerg2.csv : une ligne par territoire, groupe et voix) ----------
lignes = open(telecharger("kerg2.csv"), encoding="utf-8-sig").read().splitlines()
debut = next(i for i, l in enumerate(lignes) if l.startswith("Wahlart;"))
rangs = list(csv.DictReader(io.StringIO("\n".join(lignes[debut:])), delimiter=";"))
terr = collections.defaultdict(lambda: {"e": collections.Counter(), "z": collections.Counter(), "info": {}})
gagnant = {}                                  # circonscription → parti dont l'élu siège (« – » : sans siège)
for r in rangs:
    ga, num = r["Gebietsart"], r["Gebietsnummer"].zfill(3 if r["Gebietsart"] == "Wahlkreis" else 2)
    t = terr[(ga, num)]
    if ga == "Wahlkreis": t["info"]["nom"] = r["Gebietsname"]; t["info"]["land"] = r["UegGebietsnummer"].zfill(2); gagnant[num] = r["Gewählt"]
    n = nombre(r["Anzahl"])
    if n is None: continue
    if r["Gruppenart"] == "System-Gruppe":
        cle = {"Wahlberechtigte": "inscrits", "Wählende": "votants", "Gültige": "valides"}.get(r["Gruppenname"])
        if cle == "valides": t["info"]["valides_" + r["Stimme"]] = int(n)
        elif cle: t["info"][cle] = int(n)
        continue
    v = "e" if r["Stimme"] == "1" else "z"
    k = CLE.get(r["Gruppenname"], "IND" if r["Gruppenart"].startswith("Einzel") else "AUT")
    t[v][k] += int(n)


def parts(t, v, d=2):
    tot = t["info"]["valides_" + ("1" if v == "e" else "2")]
    return {k: round(100 * n / tot, d) for k, n in sorted(t[v].items(), key=lambda x: -x[1]) if n}


bund = terr[("Bund", "99")]
# ---------- élus (btw25_gewaehlte_utf8.csv) : sièges par parti et par Land, nom de l'élu de chaque circonscription ----------
with zipfile.ZipFile(telecharger("gew.zip")) as z:
    txt = z.read("btw25_gewaehlte_utf8.csv").decode("utf-8-sig").splitlines()
debut = next(i for i, l in enumerate(txt) if l.startswith("Wahlart;"))
elus = list(csv.DictReader(io.StringIO("\n".join(txt[debut:])), delimiter=";"))
assert len(elus) == 630, f"{len(elus)} élus lus (630 attendus)"
sieges, sieges_land, nom_elu = collections.Counter(), collections.defaultdict(collections.Counter), {}
ABK = {a: n for n, (a, _) in LAND.items()}
for e in elus:
    p = CLE.get(e["Gruppenname"], "AUT")
    sieges[p] += 1; sieges_land[e["GebietLandAbk"]][p] += 1
    if e["Kennzeichen"] == "Kreiswahlvorschlag":
        prenom = (e["Künstlername"] or e["Vornamen"].split(" ")[0]).strip()
        nom_elu[e["Gebietsnummer"].zfill(3)] = " ".join(x for x in (e["Titel"], prenom, e["Namenszusatz"], e["Nachname"]) if x)
assert sum(sieges.values()) == 630

# ---------- contours ----------
zp = telecharger("wk_geo.zip")
dossier = os.path.join(BRUT, "shp"); os.makedirs(dossier, exist_ok=True)
zipfile.ZipFile(zp).extractall(dossier)
rd = shapefile.Reader(os.path.join(dossier, "btw25_geometrie_wahlkreise_shp_geo"), encoding="utf-8")
geoms, noms_shp = {}, {}
for sr in rd.iterShapeRecords():
    num = str(sr.record["WKR_NR"]).zfill(3)
    g = shape(sr.shape.__geo_interface__).buffer(0)
    geoms[num] = g; noms_shp[num] = sr.record["WKR_NAME"]
assert len(geoms) == 299, f"{len(geoms)} circonscriptions lues (299 attendues)"


def nettoyer(geo):
    """petites îles (Frise, Hallig…) : on garde les morceaux de plus de 2 km² environ, et toujours le plus grand"""
    morceaux = list(geo.geoms) if geo.geom_type == "MultiPolygon" else [geo]
    grand = max(morceaux, key=lambda p: p.area)
    return unary_union([p for p in morceaux if p.area >= min(0.0003, grand.area * 0.05)])


ids = sorted(geoms)
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": n}, "geometry": mapping(nettoyer(geoms[n]))} for n in ids]}
# frontières communes gardées (topologie), simplification Douglas-Peucker ~ 150 m
simple = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=0.0018, simplify_algorithm="dp").to_geojson())


def arrondi(o):
    return [arrondi(x) for x in o] if isinstance(o[0], (list, tuple)) else [round(o[0], 3), round(o[1], 3)]


ordre = {n: i for i, n in enumerate(ids)}
feats = sorted(({"type": "Feature", "properties": {"RID": ordre[f["properties"]["id"]]},
                 "geometry": {"type": f["geometry"]["type"], "coordinates": arrondi(f["geometry"]["coordinates"])}} for f in simple["features"]),
               key=lambda f: f["properties"]["RID"])
par_land = collections.defaultdict(list)
for f in feats: par_land[LAND[terr[("Wahlkreis", ids[f["properties"]["RID"]])]["info"]["land"]][0]].append(shape(f["geometry"]).buffer(0))
lands_geo = [{"type": "Feature", "properties": {"REG": a},
              "geometry": (lambda g: {"type": g["type"], "coordinates": arrondi(g["coordinates"])})(mapping(unary_union(gs).buffer(0)))}
             for a, gs in sorted(par_land.items())]
data = {"ridings": [{"id": n, "n": terr[("Wahlkreis", n)]["info"]["nom"], "r": LAND[terr[("Wahlkreis", n)]["info"]["land"]][0]} for n in ids],
        "regions": [{"code": a, "name": nom} for a, nom in LAND.values()],
        "ridingGeo": {"type": "FeatureCollection", "features": feats}, "curRegionGeo": {"type": "FeatureCollection", "features": lands_geo}}
json.dump(data, open(os.path.join(ICI, "..", "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# ---------- résultats par circonscription ----------
circ = []
for n in ids:
    t = terr[("Wahlkreis", n)]
    e = parts(t, "e", 1); z = parts(t, "z", 1)
    g = max(t["e"], key=t["e"].get)                    # vainqueur de la première voix
    siege = gagnant[n] not in ("–", "-", "")
    assert not siege or CLE.get(gagnant[n], gagnant[n]) == g, f"circonscription {n} : {gagnant[n]} ≠ {g}"
    o = sorted(e.values(), reverse=True)
    circ.append({"id": n, "g": g, "siege": siege, "elu": nom_elu.get(n) if siege else None, "marge": round(o[0] - o[1], 1),
                 "particip": round(100 * t["info"]["votants"] / t["info"]["inscrits"], 1), "e": e, "z": z})
assert sum(c["siege"] for c in circ) == 276 and sum(not c["siege"] for c in circ) == 23

lands = {}
for num, (a, nom) in LAND.items():
    t = terr[("Land", num)]
    lands[a] = {"nom": nom, "e": parts(t, "e", 2), "z": parts(t, "z", 2), "inscrits": t["info"]["inscrits"], "votants": t["info"]["votants"],
                "voix_z": dict(t["z"]), "sieges": dict(sieges_land[a])}
res = {
    "date": "2025-02-23", "maj": "2025-03-14",
    "source": "Die Bundeswahlleiterin, résultat définitif (kerg2.csv, btw25_gewaehlte_utf8.csv)",
    "inscrits": bund["info"]["inscrits"], "votants": bund["info"]["votants"],
    "valides_e": bund["info"]["valides_1"], "valides_z": bund["info"]["valides_2"],
    "e": parts(bund, "e", 2), "z": parts(bund, "z", 2), "voix_z": dict(bund["z"]),
    "sieges": dict(sieges), "lands": lands, "circ": circ,
}
json.dump(res, open(os.path.join(ICI, "..", "resultats-2025.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
taille = lambda f: os.path.getsize(os.path.join(ICI, "..", f)) // 1024
print(f"{len(ids)} circonscriptions · data.json {taille('data.json')} Ko · resultats-2025.json {taille('resultats-2025.json')} Ko")
print("sièges :", dict(sieges.most_common()), "· circonscriptions sans siège :", sum(not c["siege"] for c in circ))
