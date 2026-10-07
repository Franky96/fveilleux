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

## Sécurité — scripts externes (CDN)

Chaque `<script src="https://…">` / `<link href="https://…">` vers un CDN porte un attribut `integrity="sha384-…"` et `crossorigin="anonymous"` (SRI). Pour changer de version d'une bibliothèque, recalculer l'empreinte :
`curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A` (préfixer par `sha384-`). Sans ça, le navigateur bloque le fichier.

## Section « Intentions de vote et simulations » — cadre de base des pages d'intentions de vote

Toutes les pages de la section sortent d'un même gabarit : `votes-quebec/outils/pages.src.html`, transformé par
`votes-quebec/outils/pages.py --bascule` en `intentions-simulations.html` (accueil, `votes-quebec/accueil.js`), `votes-quebec.html`,
`loi39.html`, `votes-quebec-demo.html`, `votes-france.html`, `votes-canada.html` et `votes-usa.html`. **Ne jamais modifier ces .html à la main : modifier le gabarit
(ou pages.py) puis relancer le script.** Onglets : Accueil, puis une page par endroit (Votes Québec, Canada, États-Unis, France) ; les simulations d'un endroit vont dans
son sous-menu (ligne sous les onglets, ex. Votes Québec : Intentions de vote · Simulations : Loi 39) ; permission `votes-quebec`.

Cadre d'une page d'intentions de vote (modèle : Votes Québec, `votes-quebec/intentions.js`) :
1. en haut, côte à côte : l'Assemblée (plan ou hémicycle) dans son rectangle, et l'évolution des intentions de vote
   (graphique avec choix de période, tendance + points des sondages + losanges des élections) ;
2. carte des circonscriptions avec les fonctions de la « carte actuelle » de Loi 39 : Parti en tête / Meilleur deuxième /
   Vote (pastilles de parti, bouton « % Pourcentage »), zooms prédéfinis, plein écran, légende sous la carte ;
3. panneau à droite : tout le territoire (vote et sièges, sièges par région…) ou la circonscription cliquée.
Les mêmes identifiants `vi*` et classes CSS servent à toutes ces pages ; chaque pays a son module JS et ses données
(ex. `votes-france/france.js`, `votes-france/data.json`, `votes-france/sondages.json`, scripts dans `votes-france/outils/` ;
`votes-canada/canada.js` avec la projection Qc125 fédérale, `votes-canada/outils/` ; `votes-usa/usa.js`, consensus de 270toWin, `votes-usa/outils/`).
Boutons de la carte, de gauche à droite : futur (projection/intentions), présent (assemblée actuelle), passé (élections) ; un groupe sans données n'apparaît pas. Les années des résultats passés sont en pastille (`AN()`, classe `vf-an`).
