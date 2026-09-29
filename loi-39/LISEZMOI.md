# Simulation « Québec sous la loi 39 »

Page interactive qui applique le mode de scrutin du **projet de loi n° 39 (2019)** aux **projections Qc125** par
circonscription : combien de sièges chaque parti aurait si l'élection se faisait avec 80 sièges de circonscription et
45 sièges de région, dans 17 régions.

Ce document s'adresse à un humain qui intègre la page à un site, **et à un agent (Claude Code) qui reprend le
projet** : architecture, données, méthode, reconstruction, pièges connus.

- Version publiée (artifact claude.ai, privée) : https://claude.ai/artifact/Lk2rDb5hQE1AEMNAuwJsjz
- Version autonome (tout intégré, s'ouvre en double-cliquant) : `~/Downloads/loi39-simulation.html`
- Propriétaire : Frank. Il écrit en français québécois ; répondre en français.

---

## 0. Sur fveilleux.com

- Page du site : **https://fveilleux.com/loi39.html**, une section comme les autres : connexion requise,
  permission « loi39 » (Admin), ouvrable au compte invité via « Permissions Invité ».
- `loi39.html` (racine du dépôt) = barre du haut du site + contenu de `fragment.html` ; il charge
  `loi-39/loi39.css`, `loi-39/loi39.js` et `loi-39/data.json`. Il **n'utilise pas** `style.css` (ses règles
  générales `button`, `header`, `input`… déformeraient la simulation). Le thème du site (classe `light` sur
  `<html>`) est recopié dans `data-theme`, que la simulation suit.
- Dépôt `Franky96/fveilleux` (public, déployé sur Hostinger à chaque push sur `master`) ; le dossier `loi-39/`
  garde le kit, ce LISEZMOI et `outils/`. Pas de page publique dans `loi-39/` : ne pas y laisser `index.html`,
  `exemple.html` ni la version autonome.
- Reconstruire depuis le dépôt :
  `cd loi-39/outils && LOI39_AUTONOME=/tmp/loi39-simulation.html ./reconstruire.sh && rm -f ../exemple.html`
  Si `fragment.html` a changé, recopier son contenu dans `loi39.html` (avec `data-src="loi-39/data.json"`),
  puis pousser sur `master`.

## 1. Contenu du dossier

```
loi39-site/
├── LISEZMOI.md          ce document
├── loi39.css            styles, TOUS limités au conteneur .loi39            ┐
├── loi39.js             simulation + carte + interface (module ES, d3 global) │ GÉNÉRÉS par
├── data.json            données chargées par loi39.js (≈ 510 Ko)            │ outils/build_site.py :
├── fragment.html        bloc HTML à coller dans une page                    │ ne pas modifier
├── exemple.html         page complète de démonstration                      ┘ à la main
└── outils/              TOUT ce qu'il faut pour reconstruire
    ├── page.author.html     ★ SOURCE UNIQUE de la page (CSS + HTML + JS non préfixés)
    ├── build_site.py        page.author.html → page.src.html (artifact), kit, version autonome
    ├── build_data80.py      assemble data.json
    ├── sim.py               correspondance circonscription → région + formule des diviseurs (Python)
    ├── sim80.py             simulation de référence en Python (doit donner les mêmes chiffres que la page)
    ├── scrape_qc125.py      télécharge les projections Qc125 → proj.json, ridings.tsv
    ├── reconstruire.sh      enchaîne tout (voir § 5)
    ├── preview.js           aperçu SVG d'une zone de la carte à 80 (contrôle visuel)
    ├── proj.json, ridings.tsv, elec_circ.csv   entrées (Qc125, électeurs inscrits)
    ├── m80/                 découpage hypothétique à 80
    │   ├── district2.py        algorithme de découpage
    │   ├── districts.json      résultat : composition, électeurs, nom de chaque circonscription
    │   ├── d80.json, r80.json  contours (80 circonscriptions, 17 régions)
    │   ├── assign.csv          section de vote → circonscription
    │   ├── sections_pts.csv, adj.json, land.json   intermédiaires
    └── brut/                texte de loi (PDF), simulation du gouvernement 2020 (PDF), téléchargements
```

**Règle d'or : on modifie seulement `outils/page.author.html`**, puis on lance `./reconstruire.sh`. Les fichiers du
kit sont réécrits à chaque fois.

---

## 2. Intégrer la page dans un site

1. Copier `loi39.css`, `loi39.js` et `data.json` sur le serveur (ex. `/assets/loi39/`).
2. Dans le `<head>` :
   ```html
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600;7..72,800&family=Public+Sans:wght@400;500;600;700&display=swap">
   <link rel="stylesheet" href="/assets/loi39/loi39.css">
   ```
3. À l'endroit voulu, coller `fragment.html` et ajuster le chemin du JSON :
   `<div class="loi39" data-src="/assets/loi39/data.json"> … </div>`
4. Avant `</body>`, dans cet ordre :
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
   <script type="module" src="/assets/loi39/loi39.js"></script>
   ```

Le JSON est lu avec `fetch` : il faut un serveur. Test local : `python3 -m http.server` dans `loi39-site/`, puis
http://localhost:8000/exemple.html.

**Ajustements :**
- **Colonne déjà centrée :** si le site en a une, mettre `.loi39 .wrap { max-width: none; padding-inline: 0 }`.
- **Charte graphique :** redéfinir les variables, par exemple `.loi39 { --sans: …; --bg: transparent; }`. Les
  variables sont `--bg --surface --ink --muted --rule --soft --water --serif --sans --pq --plq --caq --pcq --qs`.
- **Mode sombre :** il suit `prefers-color-scheme` et un attribut `data-theme="dark|light"` sur `<html>`. Si le
  site n'a pas de mode sombre, supprimer les deux blocs `dark` en tête de `loi39.css`.
- **Identifiants :** ils sont tous préfixés `l39-`. Une seule instance de la page par document.
- **Conflits possibles :** des règles très générales du site (`button {}`, `table {}`, `svg {}`) peuvent quand même
  s'appliquer au bloc.

**Autre option, l'iframe :** servir `loi39-simulation.html` et l'insérer avec
`<iframe src="…" style="width:100%;height:100vh;border:0" allow="fullscreen">`.

---

## 3. Méthode (ce que calcule la page)

### Règles du projet de loi 39 (texte : `outils/brut/projet-de-loi-39.pdf`)
| Article | Règle |
|---|---|
| 14 | 125 sièges = 80 de circonscription + 45 de région, dans 17 régions (≈ régions administratives, **limites de 2019** : Granby et Brome-Missisquoi sont en Montérégie). |
| 14.2 | Sièges de circonscription : 1 par région, + 1 pour la Gaspésie–Îles-de-la-Madeleine, puis 62 répartis selon les **électeurs** avec les diviseurs 1, 2, 3… (plus forts quotients). |
| 14.3 | Sièges de région : 1 par région sauf le Nord-du-Québec, puis 29 répartis de la même façon. |
| 17 + annexes II, III | Îles-de-la-Madeleine et Ungava (= Nord-du-Québec) sont des circonscriptions fixées par la loi. |
| 379.1 | Dans chaque région, quotient = votes de liste ÷ (1 + ⌈élus de circ. ÷ 2⌉ + sièges de région déjà obtenus) ; le plus haut quotient gagne chaque siège de région, tour par tour. |
| 379.2 | Seuil : 10 % des votes à l'échelle du Québec pour participer à la compensation. |

### Données
- **Projections :** Qc125 par circonscription (127 circonscriptions, carte 2026). La page utilise la valeur centrale,
  sans marge d'erreur.
- **Électeurs inscrits 2026 :** Élections Québec. Ils servent à répartir les sièges entre les régions (la loi parle
  d'électeurs, pas de population).
- **Région de chaque circonscription actuelle :** table `REGION_OF` dans `sim.py`. Cas incertains : Daniel-Johnson →
  Montérégie, Côte-du-Sud → Chaudière-Appalaches.

### La carte hypothétique à 80 (point le plus délicat)
Aucune carte officielle n'existe : la loi n'a jamais été adoptée. Ce qu'on sait :
- La **simulation du gouvernement (janvier 2020)** (`outils/brut/simulation-gouvernement-2020.pdf`) partait des 78
  circonscriptions fédérales, plus les Îles-de-la-Madeleine et l'Ungava. Elle les dit « légèrement modifiées »,
  sans préciser comment.
- La carte fédérale 2025 a été testée : elle **ne respecte pas** l'art. 14.2 avec les électeurs de 2026 (Montréal
  18 au lieu de 15, etc.). Elle n'a donc pas été retenue.
- Radio-Canada (2022) a fait une simulation, sans publier sa carte.

**Découpage construit (`m80/district2.py`) :**
1. **Nombre par région :** le nombre de circonscriptions de chaque région vient de l'art. 14.2, calculé avec les
   électeurs 2026. Résultat : Montréal 15, Montérégie 14, Capitale-Nationale 7, Laurentides 6, Lanaudière 5,
   Chaudière-Appalaches 5, Laval 4, Outaouais 4, etc.
2. **Unités :** les 16 951 **sections de vote 2026** d'Élections Québec, avec leur nombre d'électeurs. Leur
   voisinage vient des frontières communes (TopoJSON). Les îles sont reliées au plus proche voisin.
3. **Croissance :** chaque circonscription part d'un germe (k-moyennes pondérées), et la plus petite ajoute
   toujours la section voisine la moins coûteuse. Coût = distance au centre + pénalité si on franchit une limite de
   **municipalité** (`PEN_MUN`) ou de **circonscription actuelle** (`PEN_RID`). Résultat : des circonscriptions
   **d'un seul tenant** par construction.
4. **Équilibrage :** entre deux circonscriptions voisines déséquilibrées, on transfère des sections de bordure,
   **seulement si celle qui cède reste d'un seul tenant**. Cible : `TOL` = ±8 % de la moyenne régionale ; résultat
   ≤ 9 % partout. La Loi électorale permet ±25 %.
5. **Exceptions :** Îles-de-la-Madeleine (11 146 électeurs) et Ungava gardent leurs limites actuelles.
6. **Noms :** générés à partir des circonscriptions actuelles dominantes (« A » si ≥ 60 % des électeurs, sinon
   « A / B »).

⚠ Une première version sans contrainte de contiguïté donnait des circonscriptions en morceaux et des enclaves ;
Frank l'a rejetée comme irréaliste. **Toute modification de l'algorithme doit garder la contiguïté.** Vérifier
visuellement avec `node preview.js <lonmin> <latmin> <lonmax> <latmax> sortie.png` (écrit un SVG, puis le
convertir avec `magick`). Pour le Grand Montréal : `-74.1 45.35 -73.35 45.75`.

### Transposition des votes
- **Circonscription hypothétique :** son vote = moyenne des projections Qc125 des circonscriptions actuelles d'où
  viennent ses électeurs, pondérée par leur nombre (`districts[].comp`). Hypothèse : le vote est uniforme à
  l'intérieur d'une circonscription actuelle.
- **Vote de liste :** on suppose qu'il est égal au vote de circonscription. La loi prévoit pourtant deux bulletins.
- **Vote régional et vote national :** somme pondérée par les électeurs des 127 circonscriptions actuelles.
- **« Mode actuel » (hémicycle de gauche) :** gagnant de chacune des 127 circonscriptions Qc125. Égalités départagées
  selon l'ordre publié par Qc125 (`o`). Ça redonne exactement la projection de sièges de Qc125.

### Résultat de référence (projection Qc125 du 28 sept. 2026)
Vote : PQ 29,6 · PLQ 24,0 · CAQ 18,1 · PCQ 17,2 · QS 11,2 %.

| Parti | Mode actuel (127) | Circ. (80) | Région (45) | Total (125) |
|---|---|---|---|---|
| PQ | 67 | 45 | 9 | **54** |
| PLQ | 37 | 22 | 6 | **28** |
| PCQ | 15 | 10 | 10 | **20** |
| CAQ | 0 | 0 | 17 | **17** |
| QS | 8 | 3 | 3 | **6** |

`/usr/bin/python3 outils/sim80.py` doit donner ces chiffres, **et la page aussi**. Si les deux divergent, la page a
un bogue.

---

## 4. Architecture de la page (`outils/page.author.html`)

Un seul fichier : `<title>`, polices, `<style>`, balisage, `<script type="module">`.

**Structure de `data.json` :**
```js
{
  regions:   [{code:"06", name:"Montréal", electors:1311258}, …],           // 17, codes 01–17
  ridings:   [{n:"Acadie", id:"1003", r:"06", s:[PQ,PLQ,CAQ,PCQ,QS] (%), o:[ordre Qc125], e:électeurs}, …], // 127
  districts: [{id:1, name:"…", r:"01", e:électeurs, comp:[[indexRiding, électeurs], …]}, …], // 80
  districtGeo: GeoJSON (properties.DID), regionGeo: GeoJSON (properties.REG)
}
```

**JavaScript, dans l'ordre du fichier :**
- **Constantes :** `P` (partis), `PV` (couleurs = variables CSS), `SEAT_ORDER`.
- **`BASE` :** vote national pondéré par les électeurs.
- **`state` :** `{target, thr, mode, party, view, sel}`.
  - `sel` vaut `{type:"all"}` (par défaut), `{type:"reg", code}` ou `{type:"circ", id}`.
- **`highestQuotients`, `DIST`, `LIST` :** les art. 14.2 et 14.3.
- **`simulate()` :** tout le calcul. Il retourne `RES = {natShare, eligible, fptp, totD, totL, total, regions, byId, ridings}`.
  - Scénario : les parts de chaque circonscription sont multipliées par `target/BASE`, c'est-à-dire un changement
    proportionnel uniforme.
  - `regions[code]` contient `share`, `d`, `l`, `steps` (chaque tour avec **tous** les quotients),
    `ridings` et `districts`.
- **`hemicycle()` :** les deux hémicycles. Les sièges de région sont dessinés en anneaux.
- **Carte (d3-geo, projection conique conforme, `viewBox 600×704`) :**
  - Calques : `gRid` (80 circonscriptions), `gRegFill` (17 régions pleines, en vue Régions), `gReg` (contours
    des régions), `gSel` (sélection), `gLbl` (étiquettes).
  - Zoom `d3.zoom` 1–60×, avec les raccourcis `PRESETS` (Montréal, Québec, Sud).
  - Étiquettes des régions : « N circ. / N rég. » en mode « Parti en tête ».
  - `LABEL_AT` et `CALLOUT` : positions codées en dur, avec un trait qui relie les petites régions du sud à leur
    étiquette dans la bande du bas. **À revoir si la projection ou les contours des régions changent.**
  - Plein écran : API Fullscreen, avec repli sur une superposition fixe (`.fs`).
- **Panneaux :**
  - `renderAllPanel` : tout le Québec, et d'où viennent les 45 sièges de région.
  - `renderRegionPanel` + `compBlock` : l'explication en 4 étapes (principe, départ, tour par tour, résultat).
  - `renderRidingPanel` : composition d'une circonscription hypothétique, avec liens vers les fiches Qc125.
- **`render()` :** en-tête, barres « coup d'œil », hémicycles, tableaux. Ensuite viennent les contrôles (curseurs,
  seuil, modes).

**CSS :** les variables sont définies sur `:root` (clair) et redéfinies pour le mode sombre sous
`@media (prefers-color-scheme: dark)` et `[data-theme="dark"]`. Écrans larges :
- à partir de 1100 px, carte et détail côte à côte ;
- à partir de 1400 px, 3 colonnes : scénario | carte | détail ;
- les résultats (hémicycles + tableau) sont sur une ligne ;
- le tableau des régions et la méthode sont côte à côte.

**`build_site.py` transforme la source :**
- CSS : chaque règle est limitée à `.loi39` (`:root` et `body` → `.loi39`).
- Identifiants préfixés `l39-` (`id`, `for`, `aria-labelledby`, `getElementById`, `#map` …).
- JS : `ROOT = document.querySelector(".loi39")`, et `DATA = window.LOI39_DATA ?? fetch(ROOT.dataset.src)`.

Le script produit :
- `outils/page.src.html` : le fichier publié en artifact, qui charge `data.json` à côté de lui ;
- le kit (`loi39.css`, `loi39.js`, `fragment.html`, `exemple.html`, `data.json`) ;
- la version autonome `../../loi39-simulation.html`, avec les données intégrées.

Emplacements modifiables avec `LOI39_KIT` et `LOI39_AUTONOME`.

---

## 5. Reconstruire

```bash
cd ~/Downloads/loi39-site/outils
./reconstruire.sh            # page + kit à partir des fichiers présents (après une modif de page.author.html)
./reconstruire.sh qc125      # nouvelles projections Qc125 puis page + kit
./reconstruire.sh decoupage  # retélécharge Élections Québec, refait le découpage à 80 (≈ 2 min), page + kit
./reconstruire.sh tout
```

**Republier l'artifact** (depuis Claude Code) : outil Artifact, `file_path = outils/page.src.html`,
`url = https://claude.ai/artifact/Lk2rDb5hQE1AEMNAuwJsjz`, **et** `files = {"data.json": "outils/data.json"}`.
Sans `files`, l'artifact garde l'ancien `data.json`. C'est déjà arrivé une fois.

---

## 6. Pièges connus

- **`python3` :** celui de `mise` casse les outils système. Toujours utiliser **`/usr/bin/python3`**. Pas de
  `shapely` ni de `PIL` : la géométrie passe par `npx mapshaper`, les images par `magick`.
- **Qc125 répond 406 (mod_security)** sans en-têtes de navigateur complets. `scrape_qc125.py` s'en occupe. Si le
  site change de structure, la regex « Historique récent … N% ± » est à revoir.
- **d3 et le sens des polygones :** d3 veut les anneaux extérieurs en sens horaire. Sinon chaque région remplit
  tout le globe : c'est arrivé une fois, la carte entière était colorée. `build_data80.py` réoriente les anneaux,
  et la page revérifie avec `d3.geoArea > 2π`.
- **`CO_UNIQUE` n'est pas unique** dans les sections de vote : les territoires non habités « xxx999 » se répètent.
  On utilise `IDX` (le rang dans le shapefile) partout.
- **Correspondance des noms entre fichiers d'Élections Québec :** les tirets diffèrent, par exemple
  « Rivière-du-Loup-Témiscouata ». Faire la correspondance par **code de circonscription** (`CO_CEP`), pas par nom.
- **Limites de 2019 contre limites actuelles :** Élections Québec publie aussi des électeurs par région
  administrative *actuelle* (`electeur_region-adm.csv`). **Ne pas l'utiliser** : la loi utilise les limites de 2019.
  Les électeurs par région sont recalculés à partir des sections de vote.
- **Étiquettes du sud de la carte :** positions codées en dur (`LABEL_AT`). Il faut les revérifier sur une capture
  si les contours des régions changent. Pour une capture sans interface :
  `chromium --headless=new --window-size=1920,2400 --screenshot=x.png file://…/loi39-simulation.html`.

---

## 7. Préférences de Frank (historique des demandes)

- Pas de circonscriptions actuelles sur la carte : elle ne montre que des régions et des circonscriptions conformes
  à la loi.
- Circonscriptions réalistes, d'un seul tenant, qui respectent les municipalités.
- Vue par défaut : « Tout le Québec ». On revient à cette vue avec le bouton, en cliquant sur l'eau, ou avec le
  lien dans les panneaux.
- Un vrai usage des écrans larges : plus de colonnes, pas seulement un zoom.
- Explication pédagogique de la compensation, avec tous les quotients à chaque tour.

## Sources
- Qc125 (Philippe J. Fournier) : https://qc125.com/districts.htm
- Projet de loi n° 39, Assemblée nationale du Québec, 2019 : `outils/brut/projet-de-loi-39.pdf`
- Gouvernement du Québec, « Simulation — Mode de scrutin mixte avec compensation régionale », janvier 2020 : `outils/brut/simulation-gouvernement-2020.pdf`
- Élections Québec, données ouvertes (sections de vote 2026, électeurs inscrits, contours 2026) : https://www.dgeq.org/donnees.html
- Élections Canada, circonscriptions fédérales 2025 (testées, non retenues) : https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05
