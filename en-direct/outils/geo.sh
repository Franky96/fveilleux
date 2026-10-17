#!/bin/sh
# Contours des 87 circonscriptions de l'Alberta (carte de 2017, en vigueur depuis 2019) pour la page En direct.
# Source : Elections Alberta, 2019Boundaries_ED-Shapefiles.zip, sous Licence du gouvernement ouvert – Alberta
#   (Open Government Licence – Alberta, https://open.alberta.ca/licence).
# Projection d'origine : NAD83 10TM AEP Resource (≈ EPSG:3402) ; reprojetée en WGS84 et simplifiée (≈ 240 Ko).
# Usage : sh en-direct/outils/geo.sh   (télécharge dans brut/, qui n'est pas publié)
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$ICI/brut" && cd "$ICI/brut"
[ -f ed.zip ] || curl -sSL -o ed.zip https://www.elections.ab.ca/uploads/2019Boundaries_ED-Shapefiles.zip
unzip -oq ed.zip
npx --yes mapshaper@0.6.102 -i EDS_ENACTED_BILL33_15DEC2017.shp -proj wgs84 \
  -simplify 1% weighted keep-shapes -filter-slivers min-area=0.5km2 \
  -filter-fields EDNumber20,EDName2017 -rename-fields n=EDNumber20,nom=EDName2017 \
  -o format=geojson precision=0.001 "$ICI/../circonscriptions.json"
