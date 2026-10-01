#!/usr/bin/env bash
# Reconstruit la simulation loi 39. À lancer depuis loi39-site/outils/.
#
#   ./reconstruire.sh            → page + kit seulement (à partir des fichiers déjà présents)
#   ./reconstruire.sh qc125      → nouvelles projections Qc125, puis page + kit
#   ./reconstruire.sh decoupage  → retélécharge Élections Québec et refait le découpage à 80, puis page + kit
#   ./reconstruire.sh tout       → les deux
#
# Prérequis : /usr/bin/python3 (PAS le python3 de mise, voir LISEZMOI), node + npx (mapshaper), curl, unzip.
set -euo pipefail
cd "$(dirname "$0")"
PY=/usr/bin/python3
MS="npx -y mapshaper@0.6"
EQ=https://donnees.electionsquebec.qc.ca/autres/provincial
MODE=${1:-page}

if [[ $MODE == qc125 || $MODE == tout ]]; then
  echo "== Projections Qc125"
  $PY scrape_qc125.py
fi

if [[ $MODE == decoupage || $MODE == tout ]]; then
  echo "== Données Élections Québec"
  mkdir -p brut/sv m80
  curl -sL -A "Mozilla/5.0" $EQ/sections_vote_2026_shapefile.zip -o brut/sv.zip
  (cd brut/sv && unzip -o -q ../sv.zip)
  curl -sL -A "Mozilla/5.0" $EQ/circonscriptions_electorales_sans_eau_2026.json -o brut/circ2026.json
  curl -sL -A "Mozilla/5.0" $EQ/electeur_inscrit.csv -o elec_circ.csv
  SHP=$(ls brut/sv/*.shp | head -1)

  echo "== Masque terre ferme, points et voisinage des sections"
  $MS -i brut/circ2026.json -dissolve -o m80/land.json format=geojson
  # IDX = rang de l'entité dans le shapefile (CO_UNIQUE n'est pas unique : territoires non habités « xxx999 »)
  $MS -i "$SHP" -each 'IDX=this.id' -filter-fields IDX -o m80/sections_topo.json format=topojson
  $MS -i "$SHP" -each 'IDX=this.id' -points inner \
      -each 'X=this.isNull?null:Math.round(this.x), Y=this.isNull?null:Math.round(this.y)' \
      -filter-fields IDX,CO_UNIQUE,CO_CEP,NM_CEP,CODE_MUNCP,NM_MUNCP,ELEC_2026,X,Y -o m80/sections_pts.csv
  $PY - <<'EOF'
import json
from collections import defaultdict
t = json.load(open('m80/sections_topo.json')); obj = list(t['objects'].values())[0]
users = defaultdict(set)
def walk(a, g):
    if isinstance(a, int): users[a if a >= 0 else ~a].add(g)
    else:
        for x in a: walk(x, g)
for g in obj['geometries']:
    if 'arcs' in g: walk(g['arcs'], g['properties']['IDX'])
adj = defaultdict(set)
for us in users.values():
    us = list(us)
    for i in range(len(us)):
        for j in range(i + 1, len(us)): adj[us[i]].add(us[j]); adj[us[j]].add(us[i])
json.dump({str(k): sorted(v) for k, v in adj.items()}, open('m80/adj.json', 'w'))
print('voisinage :', len(adj), 'sections')
EOF

  echo "== Découpage à 80 (≈ 1 min)"
  $PY m80/district2.py

  echo "== Contours des 80 circonscriptions et des 17 régions"
  $MS -i "$SHP" -each 'IDX=this.id' -proj wgs84 -join m80/assign.csv keys=IDX,IDX -filter 'DID != null' \
      -dissolve DID -clip m80/land.json -simplify 4% weighted keep-shapes -filter-islands min-area=4km2 -clean \
      -o m80/d80.json format=geojson precision=0.0008
  $PY - <<'EOF'
import json
D = json.load(open('m80/districts.json')); g = json.load(open('m80/d80.json'))
g['features'] = [f for f in g['features'] if f['geometry']]
for f in g['features']: f['properties']['REG'] = D['districts'][str(f['properties']['DID'])]['reg']
json.dump(g, open('m80/d80.json', 'w'), ensure_ascii=False)
EOF
  $MS -i m80/d80.json -dissolve REG -o m80/r80.json format=geojson precision=0.0008
  # carte du mode actuel : les 127 circonscriptions (15 % des points : assez fin pour Montréal zoomé)
  $MS -i brut/circ2026.json -proj wgs84 -filter-fields NM_CEP,CO_CEP -clip m80/land.json \
      -simplify 15% weighted keep-shapes -filter-islands min-area=4km2 -clean -o m80/c127.json format=geojson precision=0.0008
  # limites de région de la carte actuelle : les 127 circonscriptions fusionnées par région
  $PY m80/r127.py
  $MS -i m80/c127_reg.json -dissolve REG -o m80/r127.json format=geojson precision=0.0008
  rm -f m80/c127_reg.json
  # digue de la Voie maritime et autres lanières très minces : traits parasites dans le fleuve à cette échelle
  $PY m80/sans_digues.py m80/c127.json m80/d80.json m80/r127.json m80/r80.json
fi

echo "== data.json, simulation de référence, page et kit"
$PY build_data80.py
$PY sim80.py
$PY build_site.py
node --check check.mjs && echo "Script de la page : syntaxe OK"
