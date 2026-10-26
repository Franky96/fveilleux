#!/bin/sh
# Élections locales à Taïwan du 28 novembre 2026 : carte des 22 municipalités et comtés (en-direct/taiwan/municipalites.json).
#
# Source : limites des municipalités spéciales, comtés et villes (直轄市、縣市界線, TWD97 經緯度) du Centre national de
# cartographie (內政部國土測繪中心, data.gov.tw jeu 7442, Licence de données ouvertes du gouvernement de Taïwan, 政府資料開放授權條款 1.0),
# redistribuées en TopoJSON par le paquet npm taiwan-atlas (Daniel Kao, licence MIT pour le code) : le site de TGOS refuse les
# connexions venant de l'étranger. Les limites suivent déjà le littoral (îles comprises) ; Dongsha, Taiping et Diaoyutai n'y sont pas.
# Propriétés gardées : n = code du comté (63000, 10002…, les mêmes que les 5 premiers chiffres des codes de la Commission électorale
# centrale), nom = nom chinois. Simplifié par mapshaper ; les anneaux sont remis dans le sens de d3 par direct.js au chargement.
#
# Usage : sh en-direct/taiwan/outils/carte.sh   (demande node et npm ; travaille dans un dossier temporaire)
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
cd "$T"
npm pack taiwan-atlas@2021.9.20 --silent >/dev/null
tar xzf taiwan-atlas-2021.9.20.tgz
npx -y mapshaper@0.6.102 -i package/counties-10t.json \
  -target counties \
  -each 'n=COUNTYCODE, nom=COUNTYNAME.replace("台","臺")' \
  -filter-fields n,nom \
  -simplify 12% keep-shapes \
  -filter-slivers min-area=0.3km2 \
  -o "$ICI/../municipalites.json" format=geojson precision=0.0001
# mapshaper écrit les anneaux extérieurs dans le sens antihoraire ; d3 (coordonnées sphériques) les veut dans le sens horaire
node -e '
const fs = require("fs"), f = process.argv[1], g = JSON.parse(fs.readFileSync(f, "utf8"));
const aire = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[i][0] - r[j][0]) * (r[i][1] + r[j][1]); return s; };   // > 0 : sens horaire
const sens = (p) => p.map((r, i) => (i === 0) === (aire(r) > 0) ? r : r.slice().reverse());
for (const x of g.features) x.geometry.coordinates = x.geometry.type === "Polygon" ? sens(x.geometry.coordinates) : x.geometry.coordinates.map(sens);
fs.writeFileSync(f, JSON.stringify(g));' "$ICI/../municipalites.json"
echo "Écrit : $ICI/../municipalites.json"
