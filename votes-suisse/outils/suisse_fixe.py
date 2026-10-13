"""Votes Suisse : contours des 26 cantons → ../data.json, et élections fédérales du 22 octobre 2023 → ../resultats-2023.json

Fichiers fixes (refaits seulement si le découpage ou les résultats changent) ; ce qui bouge (sondages, projection,
élus actuels) est fait par suisse.py, lancé par le pipeline.

Sources :
  - contours : limites généralisées de l'Office fédéral de la statistique (OFS, données swisstopo), état 2026
    (Moutier dans le Jura), telles que publiées par le paquet npm swiss-maps (interactivethings), en LV95 ;
    convertis en degrés (formules approchées de swisstopo, précision de l'ordre du mètre) et simplifiés en gardant
    les frontières communes (topologie) ; lacs principaux pour le dessin.
  - Conseil national 2023 : données ouvertes de l'OFS (ogd-static.voteinfo-app.ch) : force des partis et élus par
    canton, listes avec leurs apparentements et sous-apparentements, participation.
  - Conseil des États 2023 : élus selon les Services du Parlement (ws.parlament.ch), parti au moment de l'élection.
La répartition des sièges de 2023 est refaite ici liste par liste (Hagenbach-Bischoff, apparentements) : elle doit
redonner exactement les 200 élus de l'OFS, sinon rien n'est écrit (c'est la méthode de la projection de suisse.py).

Usage : /usr/bin/python3 suisse_fixe.py   (dans le dossier outils/ ; téléchargements dans brut/ ; pip install pyshp shapely topojson)
"""
import collections, datetime, json, os, urllib.parse, urllib.request
import shapefile
from shapely.geometry import shape, mapping
from shapely.geometry.polygon import orient
import topojson

ICI = os.path.dirname(os.path.abspath(__file__))
BRUT = os.path.join(ICI, "brut")
UA = {"User-Agent": "fveilleuxBot/1.0 (https://fveilleux.com)"}
OGD = "https://ogd-static.voteinfo-app.ch/v4/ogd/sd-t-17.02-NRW2023-{}.json"
GEO = "https://cdn.jsdelivr.net/npm/swiss-maps@4.7.0/2026/{}"

# cantons dans l'ordre officiel (numéro OFS) : abréviation, nom français
CANTONS = [("ZH", "Zurich"), ("BE", "Berne"), ("LU", "Lucerne"), ("UR", "Uri"), ("SZ", "Schwytz"), ("OW", "Obwald"),
           ("NW", "Nidwald"), ("GL", "Glaris"), ("ZG", "Zoug"), ("FR", "Fribourg"), ("SO", "Soleure"), ("BS", "Bâle-Ville"),
           ("BL", "Bâle-Campagne"), ("SH", "Schaffhouse"), ("AR", "Appenzell Rhodes-Extérieures"), ("AI", "Appenzell Rhodes-Intérieures"),
           ("SG", "Saint-Gall"), ("GR", "Grisons"), ("AG", "Argovie"), ("TG", "Thurgovie"), ("TI", "Tessin"), ("VD", "Vaud"),
           ("VS", "Valais"), ("NE", "Neuchâtel"), ("GE", "Genève"), ("JU", "Jura")]
DEMI = {"OW", "NW", "BS", "BL", "AR", "AI"}                      # anciens demi-cantons : 1 siège au Conseil des États
# sièges au Conseil national en 2027 (arrêté du Conseil fédéral du 27 août 2025) : seuls ces quatre cantons changent
CHANGE_2027 = {"LU": +1, "FR": +1, "BE": -1, "GR": -1}
# numéros de parti de l'OFS → codes de la page (listes du Parti libéral, ex. PLD bâlois, avec le PLR, comme les groupes de partis de l'OFS)
PARTI = {1: "PLR", 2: "C", 5: "PLR", 32: "C", 3: "PS", 4: "UDC", 7: "PEV", 8: "PCS", 9: "PST", 12: "AL", 13: "VERT", 14: "DS", 16: "UDF", 18: "LEGA",
         31: "PVL", 33: "MCG", 34: "C", 35: "AUT"}
# partis des Services du Parlement → codes de la page (le PLD bâlois et l'Alternative zougoise sont comptés avec le PLR
# et les Vert-e-s, comme le fait l'OFS)
PARL = {"UDC": "UDC", "PSS": "PS", "M-E": "C", "PLR": "PLR", "PLD": "PLR", "VERT-E-S": "VERT", "Al": "VERT", "pvl": "PVL",
        "PEV": "PEV", "UDF": "UDF", "MCG": "MCG", "Lega": "LEGA", "PST": "PST", "-": "IND"}


def lire(url, fichier):
    """Téléchargement gardé dans brut/ (refait seulement si le fichier manque)."""
    chemin = os.path.join(BRUT, fichier)
    if not os.path.exists(chemin):
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            open(chemin, "wb").write(r.read())
    return chemin


# ---------- contours ----------
def lv95(e, n):
    """LV95 (m) → (longitude, latitude) en degrés, formules approchées de swisstopo."""
    y, x = (e - 2600000) / 1e6, (n - 1200000) / 1e6
    lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return [round(lon * 100 / 36, 4), round(lat * 100 / 36, 4)]


def conv(o):
    return [conv(c) for c in o] if isinstance(o[0], (list, tuple)) else lv95(o[0], o[1])


def couche(nom, cle, tol, garde=None):
    for e in ("shp", "dbf", "shx", "prj"): lire(GEO.format(f"{nom}.{e}"), f"geo/{nom}.{e}")
    r = shapefile.Reader(os.path.join(BRUT, "geo", nom))
    feats = []
    for sr in r.shapeRecords():
        if garde and not garde(sr.record): continue
        g = shape(sr.shape.__geo_interface__).buffer(0)
        feats.append({"type": "Feature", "properties": {"id": cle(sr.record)}, "geometry": mapping(g)})
    fc = {"type": "FeatureCollection", "features": feats}
    simple = json.loads(topojson.Topology(fc, prequantize=False, toposimplify=tol, simplify_algorithm="dp").to_geojson())
    out = []
    for f in simple["features"]:
        g = shape(f["geometry"])
        # petits morceaux (îlots de simplification) retirés : on garde toujours le plus grand
        parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
        grand = max(p.area for p in parts)
        parts = [p for p in parts if p.area >= min(2e6, grand * 0.2)]
        parts = [orient(p, sign=-1.0) for p in parts]          # extérieur dans le sens horaire (ce qu'attend d3)
        g = parts[0] if len(parts) == 1 else shape({"type": "MultiPolygon", "coordinates": [mapping(p)["coordinates"] for p in parts]})
        gm = mapping(g)
        out.append({"type": "Feature", "properties": {"K": f["properties"]["id"]}, "geometry": {"type": gm["type"], "coordinates": conv(gm["coordinates"])}})
    return {"type": "FeatureCollection", "features": sorted(out, key=lambda f: str(f["properties"]["K"]))}


cantons_geo = couche("cantons", lambda rec: CANTONS[int(rec[0]) - 1][0], 250)
# lacs : les plus grands seulement (dessinés par-dessus les cantons, sans clic)
GRANDS = {"Lac Léman", "Bodensee", "Lac de Neuchâtel", "Lago Maggiore", "Vierwaldstättersee", "Zürichsee", "Lago di Lugano",
          "Thunersee", "Bielersee / Lac de Bienne", "Zugersee", "Brienzersee", "Walensee", "Murtensee/Lac de Morat", "Sempachersee",
          "Lac de la Gruyère / Greyerzersee", "Hallwilersee", "Sihlsee", "Lac de Joux", "Sarnersee", "Greifensee", "Aegerisee", "Baldeggersee"}
lacs_geo = couche("lakes", lambda rec: rec[1], 200, garde=lambda rec: rec[1] in GRANDS and rec[1] not in {"Baldeggersee", "Aegerisee", "Greifensee", "Sarnersee"})
assert len(cantons_geo["features"]) == 26

# ---------- Conseil national 2023 (OFS) ----------
par = json.load(open(lire(OGD.format("parteien"), "nrw2023-parteien.json"), encoding="utf-8"))
lis = json.load(open(lire(OGD.format("listen"), "nrw2023-listen.json"), encoding="utf-8"))
part = json.load(open(lire(OGD.format("wahlbeteiligung"), "nrw2023-wahlbeteiligung.json"), encoding="utf-8"))
assert par["stand"]["wahl_abgeschlossen"] and par["wahl_jahr"] == 2023


def dhondt(items, n):
    """[(clé, voix)] → {clé: sièges} : Hagenbach-Bischoff (équivaut à D'Hondt) ; à égalité, la liste qui a le plus de voix."""
    s = {k: 0 for k, _ in items}; v = dict(items)
    for _ in range(n):
        k = max(s, key=lambda k: (v[k] / (s[k] + 1), v[k])); s[k] += 1
    return s


def repartir(listes, n):
    """Sièges d'un canton entre ses listes [(parti, apparentement, sous-apparentement, voix)] → [sièges de chaque liste].
    Un siège : la liste (le candidat) qui a le plus de voix. Sinon : entre les groupes d'apparentement, puis dans chaque
    groupe entre les sous-apparentements, puis entre les listes."""
    if n == 1:
        i = max(range(len(listes)), key=lambda i: listes[i][3]); return [int(j == i) for j in range(len(listes))]
    grp = collections.defaultdict(list)
    for i, l in enumerate(listes): grp[l[1] or ("seule", i)].append(i)
    sg = dhondt([(k, sum(listes[i][3] for i in ix)) for k, ix in grp.items()], n)
    out = [0] * len(listes)
    for k, ix in grp.items():
        sous = collections.defaultdict(list)
        for i in ix: sous[listes[i][2] or ("seule", i)].append(i)
        ss = dhondt([(kk, sum(listes[i][3] for i in x)) for kk, x in sous.items()], sg[k])
        for kk, x in sous.items():
            for i, s in dhondt([(i, listes[i][3]) for i in x], ss[kk]).items(): out[i] = s
    return out


cantons = {}
for num, (ab, nom) in enumerate(CANTONS, 1):
    rows = [r for r in par["level_kantone"] if r["kanton_nummer"] == num]
    ls = [r for r in lis["level_kantone"] if r["kanton_nummer"] == num]
    listes = [[PARTI[r["partei_id"]], (r["liste_verbindung"] or "").strip(), (r["liste_unterlistenverbindung"] or "").strip(), r["stimmen_liste"], r["anzahl_gewaehlte"]] for r in ls]
    n = sum(r["anzahl_gewaehlte"] or 0 for r in rows)
    calc = repartir(listes, n)
    if calc != [l[4] for l in listes]: raise SystemExit(f"{ab} : la répartition recalculée ne redonne pas les élus de 2023, rien n'est écrit")
    w = next(r for r in part["level_kantone"] if r["kanton_nummer"] == num)
    def somme(champ, d=2):
        """par code de la page (le Parti libéral bâlois s'ajoute au PLR), du plus grand au plus petit"""
        c = collections.Counter()
        for r in rows: c[PARTI[r["partei_id"]]] += r.get(champ) or 0
        return {k: round(v, d) if d else v for k, v in c.most_common() if v > 0}
    cantons[ab] = {
        "p": somme("partei_staerke"), "p19": somme("letzte_wahl_partei_staerke"),
        "s": somme("anzahl_gewaehlte", 0), "s19": somme("letzte_wahl_anzahl_gewaehlte", 0),
        "part": round(w["wahlbeteiligung"], 1), "inscrits": w["wahlberechtigte"],
        "listes": [l[:4] for l in listes],             # parti, apparentement, sous-apparentement, voix (suffrages de liste)
    }
nat = {PARTI[r["partei_id"]]: {"v": round(r["partei_staerke"], 2), "s": r["anzahl_gewaehlte"], "v19": round(r["letzte_wahl_partei_staerke"], 2),
                               "s19": r["letzte_wahl_anzahl_gewaehlte"], "n": r["fiktive_waehlende"]} for r in par["level_ch"]}
assert sum(x["s"] for x in nat.values()) == 200 and abs(nat["UDC"]["v"] - 27.93) < 0.01, nat
wch = part["level_ch"][0] if isinstance(part["level_ch"], list) else part["level_ch"]

# ---------- Conseil des États 2023 (Services du Parlement) ----------
def odata(table, filtre):
    q = urllib.parse.urlencode({"$filter": filtre, "$format": "json"})
    with urllib.request.urlopen(urllib.request.Request(f"https://ws.parlament.ch/odata.svc/{table}?{q}", headers=UA), timeout=120) as r:
        return json.load(r)["d"]["results"]
date = lambda s: datetime.datetime.fromtimestamp(int(s[6:-2]) / 1000, datetime.timezone.utc).date() if s else None
membres = odata("MemberCouncil", "Language eq 'FR' and Council eq 2 and DateElection ge datetime'2023-10-01T00:00:00' and DateElection lt datetime'2024-01-01T00:00:00'")
ce = collections.defaultdict(list)
for m in membres:
    p = m["PartyAbbreviation"]
    hist = odata("MemberPartyHistory", f"Language eq 'FR' and PersonNumber eq {m['PersonNumber']}")
    # parti au début de la législature (4 décembre 2023) : les changements de parti ultérieurs ne comptent pas ici
    deb = datetime.date(2023, 12, 4)
    for h in hist:
        if date(h["DateJoining"]) and date(h["DateJoining"]) <= deb and (not h["DateLeaving"] or date(h["DateLeaving"]) > deb): p = h["PartyAbbreviation"]
    ce[m["CantonAbbreviation"]].append({"nom": f"{m['FirstName']} {m['LastName']}", "p": PARL.get(p, "AUT"), "elu": date(m["DateElection"]).isoformat()})
ce = {ab: sorted(ce[ab], key=lambda x: x["nom"].split()[-1]) for ab, _ in CANTONS}
for ab, _ in CANTONS:
    if len(ce[ab]) != (1 if ab in DEMI else 2): raise SystemExit(f"Conseil des États 2023 : {len(ce[ab])} élus lus pour {ab}")
tot = collections.Counter(x["p"] for v in ce.values() for x in v)
if tot != {"C": 15, "PLR": 11, "PS": 9, "UDC": 6, "VERT": 3, "PVL": 1, "MCG": 1}: raise SystemExit(f"Conseil des États 2023 inattendu : {tot}")

# ---------- écriture ----------
s23 = {ab: sum(cantons[ab]["s"].values()) for ab, _ in CANTONS}
data = {"source": "OFS, limites généralisées des cantons (état 2026), via swiss-maps 4.7.0 ; simplifiées",
        "cantons": [{"n": i, "ab": ab, "nom": nom, "s23": s23[ab], "s27": s23[ab] + CHANGE_2027.get(ab, 0), "ce": 1 if ab in DEMI else 2}
                    for i, (ab, nom) in enumerate(CANTONS, 1)],
        "geo": cantons_geo, "lacs": lacs_geo}
assert sum(c["s27"] for c in data["cantons"]) == 200
json.dump(data, open(os.path.join(ICI, "..", "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
res = {"source": "Office fédéral de la statistique (élections au Conseil national, données ouvertes) ; Services du Parlement (Conseil des États)",
       "date": "2023-10-22", "participation": round(wch["wahlbeteiligung"], 1), "inscrits": wch["wahlberechtigte"],
       "listes": len(lis["level_kantone"]), "candidats": sum(r["anzahl_kandidierende"] or 0 for r in par["level_ch"]),
       "national": dict(sorted(nat.items(), key=lambda kv: -kv[1]["v"])), "cantons": cantons, "ce": ce}
json.dump(res, open(os.path.join(ICI, "..", "resultats-2023.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"data.json {os.path.getsize(os.path.join(ICI, '..', 'data.json')) // 1024} Ko · resultats-2023.json {os.path.getsize(os.path.join(ICI, '..', 'resultats-2023.json')) // 1024} Ko")
print("Conseil national 2023 :", {k: v["s"] for k, v in nat.items() if v["s"]}, "· Conseil des États 2023 :", dict(tot))
