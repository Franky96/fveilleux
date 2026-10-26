# Conventions du projet fveilleux

## CSDB — Bande de valeurs (banner)

Quand une adresse CSDB contient **plusieurs valeurs décodables** (ex : code ATC + altitude, fréquence active + standby, etc.), toutes les valeurs doivent apparaître dans la bande du haut (`banner-values`), en les ajoutant comme objets `{ label, value }` dans le tableau retourné par `getBannerValues()`.

Ordre d'affichage : valeur la plus "principale" à droite, valeurs secondaires à gauche (utiliser `unshift` pour insérer à gauche).

Exemple appliqué : adresse 0x1E affiche **CODE ALT** (gauche) et **CODE ATC** (droite).

## Git

- Travailler et pousser directement sur `master` : Hostinger déploie automatiquement `master` à chaque push.
- **Toujours commit et push sur `master` après chaque modification.**
- Ne jamais faire de push forcé sur `master` (ça casse le déploiement Hostinger) sans prévenir l'utilisateur au préalable.
- Ne jamais committer de manuels (PDF P&WC, etc.) ni d'identifiants : le dépôt est public.

## Simulateur PT6A-21

`pt6a21.html` charge ses modules (`pt6a21-eclate.js`, `-rgb.js`, `-turbines.js`, `-gg.js`) avec `?v=<empreinte>` (8 premiers caractères du sha256 du fichier) : sans ça, le navigateur garde l'ancien module après une mise à jour. Après toute modification d'un module, remettre l'empreinte à jour : `for m in eclate rgb turbines gg; do h=$(sha256sum pt6a21-$m.js | cut -c1-8); sed -i -E "s#pt6a21-$m\.js(\?v=[0-9a-f]+)?\"#pt6a21-$m.js?v=$h\"#" pt6a21.html; done`.

## Sécurité — scripts externes (CDN)

Chaque `<script src="https://…">` / `<link href="https://…">` vers un CDN porte un attribut `integrity="sha384-…"` et `crossorigin="anonymous"` (SRI). Pour changer de version d'une bibliothèque, recalculer l'empreinte :
`curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A` (préfixer par `sha384-`). Sans ça, le navigateur bloque le fichier.

## Documentation détaillée (`docs/`) — à lire seulement quand la tâche le demande

- `docs/DEMARRAGE.md` : **à lire au début d'une nouvelle conversation** (l'utilisateur, la façon de travailler, l'état du site, les tests, les pièges connus).
- `docs/site.md` : architecture (Hostinger, déploiement et workflow de secours, connexion, permissions, API PHP, ajout d'une page).
- `docs/intentions-de-vote.md` : section « Intentions de vote et simulations », avec tous les détails des pages et des données.
- `docs/en-direct.md` : soirées électorales en direct, archivage, **vérifications à faire le soir de chaque vote**.
- `docs/pt6a21.md` : simulateur PT6A-21 (modules, conventions, manuels, tests).
- `docs/information-monde.md` : page Information Monde (globe, drapeaux, statistiques), avec tous les détails.
- `docs/autres-pages.md` : RONA, CSDB, ARINC 429, moteurs, jeux et autres pages.

Garder ces documents à jour : quand une demande de l'utilisateur change une règle ou un comportement décrit, corriger le document concerné dans le même commit.

## Section « Intentions de vote et simulations » et « En direct » — règles essentielles

- Toutes les pages de la section, y compris les soirées En direct et les anciennes soirées, sortent du gabarit `votes-quebec/outils/pages.src.html`, transformé par `cd votes-quebec/outils && /usr/bin/python3 pages.py --bascule`. **Ne jamais modifier ces .html à la main.**
- `votes-quebec/loi39.js`, `loi39.css` et `fragment.html` sont générés depuis `outils/page.author.html` par `outils/build_site.py`.
- Onglets et cartes de l'accueil groupés par continent (Amérique du Nord : Québec, Alberta | Canada, États-Unis ; Europe : France, Allemagne, Suisse). Tout nouvel endroit va dans le groupe de son continent, avec un libellé court.
- **Ne plus modifier les hémicycles** (demande de l'utilisateur).
- **À garder sur toute nouvelle page ou carte de la section** (détails dans `docs/intentions-de-vote.md`) :
  - sur chaque graphique d'évolution : le bouton « ⓘ Moyenne lissée » (`lissage.js`) et le zoom vertical (`zoom-y.js`) ;
  - sur chaque carte : le plein écran avec « ⓘ Info » (`plein.js`), des contrôles uniformes, et les contrôles repliés sur téléphone ;
  - sur une carte de scrutin proportionnel par région : l'anneau des sièges ;
  - le fond en dégradé fixe ;
  - la bande « Partis en lice », avec chaque nouveau parti ajouté à `partis.js` à sa place sur l'axe.
- Soirées En direct de novembre 2026 : une page par soirée dans le sous-menu, cadre `gen`, `DIRECTS` et `PRETES` de pages.py ; voir `docs/en-direct.md`. **Page d'arrivée temporaire** : `ARRIVEE_EN_DIRECT = True` dans pages.py (le menu du site ouvre En direct) ; remettre `False` après la dernière soirée, avec l'accord de l'utilisateur.

## Information Monde — règles essentielles

Page `information-monde.html` (module `monde/monde.js`, permission `monde`). Tous les détails, et les nombreuses demandes de l'utilisateur sur le globe, les drapeaux et la fluidité, sont dans `docs/information-monde.md` : le lire avant toute modification de cette page. Test du rendu : `node monde/outils/essai_globe.mjs`.
