"""Information Monde : limites du territoire d'une ville du Québec, sans l'eau (une ville par appel, lancé en tâche de fond par ville).

Sources :
- limites : Découpages administratifs du Québec (SDA, couche Municipalité), ministère des Ressources naturelles et des Forêts
  (Données Québec, Licence CC BY 4.0) ; la limite municipale officielle comprend l'eau (fleuve, rivières, lacs) ;
- eau : plans d'eau d'OpenStreetMap (natural=water ; © contributeurs d'OpenStreetMap, ODbL), par le
  miroir Overpass de mail.ru (les serveurs principaux ne répondent pas d'ici) ; 2 ha et plus. La Géobase du réseau
  hydrographique du Québec (GRHQ) a été essayée : son service ne donne pas la géométrie (ou pas le fleuve).
Résultat : monde/limites/<Q>.json = Feature du territoire terrestre (limite qui suit les rives) avec, dans « eau », la partie
du territoire municipal qui est de l'eau (dessinée couleur de l'eau sur le globe) ; superficie terrestre calculée.
Usage : python3 monde/outils/limites_qc.py Q340
"""
import json, math, os, sys, time, urllib.error, urllib.parse, urllib.request
from shapely.geometry import box, shape, mapping
from shapely.ops import unary_union

ICI = os.path.dirname(os.path.abspath(__file__))
MONDE = os.path.dirname(ICI)
# code géographique du MAMH (5 derniers chiffres du code de subdivision de recensement de Statistique Canada)
CODES = {"Q340": "66023", "Q2145": "23027", "Q141810": "65005", "Q141844": "81017", "Q139398": "58227",
         "Q139473": "43027", "Q139208": "25213", "Q139229": "94068", "Q44012": "37067", "Q139190": "64008"}
SDA = "https://servicescarto.mern.gouv.qc.ca/pes/rest/services/Territoire/SDA_WMS/MapServer/2/query?"
OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
UA = {"User-Agent": "fveilleux-monde/1.0 (https://fveilleux.com)"}


def requete(url, p):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url + urllib.parse.urlencode(p), headers=UA), timeout=300).read())


def eau_osm(x0, y0, x1, y1):
    """Plans d'eau d'OpenStreetMap qui touchent le cadre : chemins fermés et multipolygones (anneaux assemblés)."""
    from shapely.geometry import LineString, Polygon
    from shapely.ops import linemerge, polygonize
    b = f"{y0},{x0},{y1},{x1}"
    q = f'[out:json][timeout:180];(way["natural"="water"]({b});relation["natural"="water"]({b}););out geom;'
    for essai in range(5):   # le miroir répond parfois 504 : on réessaie
        try:
            req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
            d = json.loads(urllib.request.urlopen(req, timeout=400).read()); break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or essai == 4: raise
            time.sleep(20 * (essai + 1))
    ligne = lambda g: LineString([(p["lon"], p["lat"]) for p in g])
    polys = []
    for el in d["elements"]:
        if el["type"] == "way" and len(el.get("geometry", [])) >= 4 and el["geometry"][0] == el["geometry"][-1]:
            polys.append(Polygon([(p["lon"], p["lat"]) for p in el["geometry"]]).buffer(0))
        elif el["type"] == "relation":
            anneaux = {}
            for m in el.get("members", []):
                if m["type"] == "way" and len(m.get("geometry", [])) >= 2:
                    anneaux.setdefault("inner" if m.get("role") == "inner" else "outer", []).append(ligne(m["geometry"]))
            ext = unary_union(list(polygonize(linemerge(anneaux.get("outer", []))))) if anneaux.get("outer") else None
            if ext is None or ext.is_empty: continue
            if anneaux.get("inner"): ext = ext.difference(unary_union(list(polygonize(linemerge(anneaux["inner"])))))
            polys.append(ext.buffer(0))
    cadre = box(x0, y0, x1, y1)
    polys = [p.intersection(cadre) for p in polys if not p.is_empty and km2(p) >= 0.02]
    return unary_union(polys) if polys else None, len(polys)


def arrondir(c):
    return [arrondir(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]


def km2(g):
    # superficie approchée : coordonnées en degrés ramenées en km autour de la latitude moyenne
    lat = (g.bounds[1] + g.bounds[3]) / 2
    return g.area * 111.32 * 111.32 * math.cos(math.radians(lat))


def limites(q):
    d = requete(SDA, {"where": f"MUS_CO_GEO='{CODES[q]}'", "outFields": "MUS_NM_MUN,MUS_CO_GEO", "outSR": "4326",
                      "maxAllowableOffset": "0.0001", "geometryPrecision": "6", "f": "geojson"})
    assert d.get("features"), f"{q} : aucune municipalité {CODES[q]}"
    f = d["features"][0]
    ville = shape(f["geometry"]).buffer(0)
    x0, y0, x1, y1 = ville.bounds
    # plans d'eau qui touchent le territoire (en tuiles de 0,25° au plus : le miroir expire sur un grand cadre)
    nx, ny = math.ceil((x1 - x0) / 0.25), math.ceil((y1 - y0) / 0.25)
    morceaux, n_eaux = [], 0
    for i in range(nx):
        for j in range(ny):
            tx0, ty0 = x0 + i * (x1 - x0) / nx, y0 + j * (y1 - y0) / ny
            e, n = eau_osm(tx0, ty0, tx0 + (x1 - x0) / nx, ty0 + (y1 - y0) / ny)
            if e is not None: morceaux.append(e)
            n_eaux += n
    eau = unary_union(morceaux) if morceaux else None
    terre = ville.difference(eau) if eau else ville
    dans_eau = ville.intersection(eau) if eau else None
    # simplification (~15 m) et miettes de moins de 0,01 km² retirées
    nettoyer = lambda g: unary_union([p for p in getattr(g.simplify(0.00015, preserve_topology=True), "geoms", [g.simplify(0.00015, preserve_topology=True)])
                                      if p.geom_type == "Polygon" and km2(p) >= 0.01])
    terre = nettoyer(terre)
    sortie = {"type": "Feature", "properties": {"q": q, "nom": f["properties"]["MUS_NM_MUN"], "code": f["properties"]["MUS_CO_GEO"],
                                                 "km2": round(km2(terre), 1)},
              "geometry": {"type": mapping(terre)["type"], "coordinates": arrondir(mapping(terre)["coordinates"])}}
    if dans_eau is not None and not dans_eau.is_empty:
        dans_eau = nettoyer(dans_eau)
        if not dans_eau.is_empty:
            sortie["eau"] = {"type": mapping(dans_eau)["type"], "coordinates": arrondir(mapping(dans_eau)["coordinates"])}
    os.makedirs(os.path.join(MONDE, "limites"), exist_ok=True)
    chemin = os.path.join(MONDE, "limites", q + ".json")
    json.dump(sortie, open(chemin, "w"), ensure_ascii=False, separators=(",", ":"))
    print(q, sortie["properties"]["nom"], f"{sortie['properties']['km2']} km² de terre,", n_eaux, "plans d'eau,", os.path.getsize(chemin), "octets")


if __name__ == "__main__":
    for q in sys.argv[1:]: limites(q)
