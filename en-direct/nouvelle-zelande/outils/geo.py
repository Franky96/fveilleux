"""Élections générales en Nouvelle-Zélande du 7 novembre 2026 : carte des circonscriptions (en-direct/nouvelle-zelande/circonscriptions.json).

Limites de 2025 de la Representation Commission (64 circonscriptions générales et 7 circonscriptions maories, utilisées pour la
première fois en 2026), publiées par Stats NZ (services ArcGIS publics de Stats NZ, mêmes couches que Datafinder 122741 / 122742,
CC BY 4.0). Les limites suivent les îlots (meshblocks) et vont jusqu'à la mer territoriale : on les découpe au littoral avec les
SA3 2023 « Clipped » de Stats NZ (CC BY 4.0 ; lacs compris), puis mapshaper simplifie les deux couches en gardant les frontières
communes. Les îles Chatham (à l'est de l'antiméridien) sont rapprochées de 5,5° vers l'ouest, dans un encart (propriété « chatham »).

Sortie : { general: FeatureCollection, maori: FeatureCollection }, propriétés { nom, t: "g" | "m" }, anneaux extérieurs dans le
sens des aiguilles d'une montre (sens de d3, vérifié par d3-geo : aire sphérique < 2π).

Usage : python3 en-direct/nouvelle-zelande/outils/geo.py DOSSIER_TEMP   (besoin de shapely, et de npx mapshaper d3-geo dans DOSSIER_TEMP/node)
"""
import json, os, subprocess, sys, urllib.request
from shapely.geometry import shape, mapping, MultiPolygon, Polygon
from shapely.ops import unary_union
from shapely import affinity

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.normpath(os.path.join(ICI, "..", "circonscriptions.json"))
ARC = "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services"
Q = "/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&maxAllowableOffset=0.0002&geometryPrecision=5"
COUCHES = {"g": ("General_Electorates_2025", "GED2025_V1_00_NAME"), "m": ("M%C4%81ori_Electorates_2025", "MED2025_V1_00_NAME")}
DECALAGE_CHATHAM = -5.5          # degrés de longitude (encart)
MIN_KM2 = 1.0                    # îlots plus petits : retirés


def lire(url, fichier):
    if not os.path.exists(fichier):
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fveilleux.com"}), timeout=120) as r, open(fichier, "wb") as f: f.write(r.read())
    return json.load(open(fichier, encoding="utf-8"))


def km2(g):  # aire approximative (degrés² → km² à la latitude du morceau)
    import math
    return g.area * 111.32 ** 2 * math.cos(math.radians(abs(g.centroid.y)))


def main():
    tmp = sys.argv[1] if len(sys.argv) > 1 else "."
    terres = lire(ARC + "/SA32023_V1_00_Clipped" + Q, os.path.join(tmp, "sa3.json"))
    terre = unary_union([shape(f["geometry"]).buffer(0) for f in terres["features"]]).buffer(0.00005)
    sorties = {}
    for t, (svc, champ) in COUCHES.items():
        d = lire(ARC + "/" + svc + Q, os.path.join(tmp, t + ".json"))
        feats = []
        for f in d["features"]:
            g = shape(f["geometry"]).buffer(0).intersection(terre)
            morceaux = [p for p in (g.geoms if hasattr(g, "geoms") else [g]) if isinstance(p, Polygon) and km2(p) >= MIN_KM2]
            ch = False
            for i, p in enumerate(morceaux):            # Chatham : longitudes négatives (à l'est de 180°)
                if p.bounds[2] < 0: morceaux[i] = affinity.translate(p, xoff=360 + DECALAGE_CHATHAM); ch = True
            feats.append({"type": "Feature", "properties": {"nom": f["properties"][champ], "t": t, **({"chatham": 1} if ch else {})},
                          "geometry": mapping(MultiPolygon(morceaux))})
        brut = os.path.join(tmp, t + "-terre.json")
        json.dump({"type": "FeatureCollection", "features": feats}, open(brut, "w", encoding="utf-8"))
        simp = os.path.join(tmp, t + "-simp.json")
        pct = "3%" if t == "g" else "2.5%"
        subprocess.run(["npx", "mapshaper", brut, "-simplify", "weighted", pct, "keep-shapes", "-clean", "-o", "precision=0.0001", simp],
                       check=True, cwd=os.path.join(tmp, "node"))
        sorties[t] = json.load(open(simp, encoding="utf-8"))
    # sens des anneaux pour d3 (aire sphérique d'un polygone < 2π, sinon on retourne ses anneaux)
    verif = os.path.join(tmp, "node", "sens.mjs")
    open(verif, "w").write("""import { geoArea } from "d3-geo"; import fs from "fs";
const d = JSON.parse(fs.readFileSync(process.argv[2])); let n = 0;
for (const c of Object.values(d)) for (const f of c.features) {
  const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const p of polys) if (geoArea({ type: "Polygon", coordinates: p }) > 2 * Math.PI) { for (const r of p) r.reverse(); n++; }
}
fs.writeFileSync(process.argv[2], JSON.stringify(d)); console.log("anneaux retournés :", n);""")
    json.dump({"general": sorties["g"], "maori": sorties["m"]}, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    subprocess.run(["node", verif, SORTIE], check=True, cwd=os.path.join(tmp, "node"))
    print(SORTIE, os.path.getsize(SORTIE) // 1024, "Ko")


if __name__ == "__main__":
    main()
