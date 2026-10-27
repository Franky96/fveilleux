# Démarrage d'une nouvelle conversation — site fveilleux.com

À lire en premier. Ce document résume qui est l'utilisateur, comment on travaille et où en est le site.
Les détails par sujet sont dans les autres fichiers de `docs/`, à ouvrir **seulement quand la tâche le demande**.

## L'utilisateur et la façon de travailler

- **Frank** (Québec). Il écrit en français, souvent vite et sans accents : réponds en français québécois correct, clair et bref.
- Il fait évoluer son site personnel **fveilleux.com** par petites demandes successives (« rajoute », « enlève », « place »…).
  Fais ce qui est demandé, montre-le (capture si c'est visuel), commit, push, puis résume en quelques lignes.
- Il juge sur le rendu : vérifie visuellement avec Playwright avant de dire que c'est fait (voir « Tester » plus bas).
  S'il envoie une capture d'écran, regarde exactement ce qu'elle montre avant de corriger.
- Il préfère qu'on dise franchement ce qui n'est pas vérifié ou estimé, sans en faire trop.
- Quand il demande d'**enlever** ce qu'on vient de faire, on revient exactement à l'état d'avant.

## Règles absolues (aussi dans CLAUDE.md)

- **Toujours, et seulement, `master`** (demande de l'utilisateur, 27 octobre 2026) : commit et push sur `master` après chaque modification ; Hostinger le déploie automatiquement. Jamais de branche de travail.
  Jamais de push forcé sur `master` sans prévenir.
- **Dépôt public** : ne jamais committer de manuels (PDF P&WC…), d'identifiants, de clés, ni l'adresse de
  déploiement Hostinger (secret `HOSTINGER_DEPLOY_URL`). Ne jamais mettre le courriel de l'utilisateur dans une requête.
- `research_notes/`, `reports/` et `.claude/` ne se committent jamais.
- Scripts de CDN : toujours avec `integrity="sha384-…"` et `crossorigin="anonymous"`.
- **Pages générées** (section Intentions de vote, En direct) : ne jamais modifier les `.html` à la main ;
  modifier `votes-quebec/outils/pages.src.html` ou `pages.py` (ou `votes-<pays>/outils/page.py` pour les pages par pays : Allemagne, Suisse, Alberta, Royaume-Uni), puis `cd votes-quebec/outils && /usr/bin/python3 pages.py --bascule`.
- **PT6A-21** : après toute modification d'un module `pt6a21-*.js`, remettre à jour les empreintes `?v=` (commande dans CLAUDE.md).
- Messages de commit en français, descriptifs, avec les lignes d'attribution demandées par l'environnement ;
  la ligne d'attribution `Co-Authored-By` demandée par l'environnement (qui nomme le modèle) est acceptée ; aucun autre identifiant de modèle dans les commits.

## Où trouver quoi (`docs/`)

| Fichier | Quand l'ouvrir |
|---|---|
| `docs/site.md` | Architecture générale : hébergement, déploiement, connexion, permissions, API PHP, ajout d'une page |
| `docs/intentions-de-vote.md` | Section « Intentions de vote et simulations » (Votes Québec, Canada, É.-U., France, Allemagne, Suisse, Alberta, Loi 39) |
| `docs/en-direct.md` | Soirées électorales en direct (novembre 2026), anciennes soirées, **liste de vérifications pour chaque soirée** |
| `docs/pt6a21.md` | Simulateur 3D du turbopropulseur PT6A-21 |
| `docs/information-monde.md` | Page Information Monde (globe, drapeaux, statistiques) |
| `docs/autres-pages.md` | RONA, CSDB, ARINC 429, jeux de société et autres pages plus simples |

## État au 26 octobre 2026

**Soirées « En direct » de novembre 2026** (une page par soirée, sous-menu de l'onglet En direct). Elles sont prêtes,
mais leurs sources de résultats n'ont pas toutes été vues en vrai. **Le soir de chaque vote, suivre `docs/en-direct.md`.**

| Date (heure du Québec) | Soirée | Page | Point à surveiller |
|---|---|---|---|
| dim. 1er nov., 1 h → 13 h | Bulgarie, 2e tour présidentiel | `en-direct-bulgarie.html` | results.cik.bg derrière Cloudflare ; adresse du 2e tour à découvrir |
| mar. 3 nov., 18 h → 1 h | États-Unis, mi-mandat | `en-direct.html` | flux CNN `2026-SG` et `2026-GG` pas encore publiés |
| sam. 7 nov., 1 h | Nouvelle-Zélande | `en-direct-nouvelle-zelande.html` | flux XML derrière Cloudflare |
| sam. 28 nov., 3 h | Taïwan, élections locales | `en-direct-taiwan.html` | adresse des résultats de la CEC inconnue ; numéros de bulletin à remplir |
| dim. 29 nov., 14 h | Espagne | `en-direct-espagne.html` | site des résultats inconnu (`PLANTILLES`) ; sondages interdits dès le 24 nov. |

- **Colombie-Britannique (24 oct.)** : archivée dans « Anciennes élections » (`election-cb-2026.html`) ; la copie de secours
  se met à jour jusqu'aux résultats officiels du 18 novembre.
- **Référendum en Alberta (19 oct.)** : archivé ; la copie de secours (`alberta-referendum.yml`) tourne jusqu'au 30 octobre pour les résultats officiels du 29.

**Derniers travaux** :
- Votes Québec : carte actuelle avec députés et photos, « Gouvernement actuel », boutons « Moyenne lissée » ;
- PT6A-21 : vue en coupe pleine, puis collecteur carburant et adaptateurs d'injecteurs refaits d'après les
  manuels 73-10, avec jets de carburant ;
- RONA : dates d'expiration du PDF dans l'ordre de la liste du site.
- Votes Royaume-Uni : nouvelle page (Chambre des communes, 650 sièges, projection du site, sondages, partielles) ; détails dans `docs/intentions-de-vote.md`.

## Tester avant de dire « c'est fait »

- **Serveur local** : `cd /home/user/fveilleux && python3 -m http.server 8790` en arrière-plan. Il n'y a pas de PHP :
  les relais `api/*.php` ne répondent pas et les pages se rabattent sur leurs copies de secours.
- **Playwright** est préinstallé (`require('playwright')`, lancer node avec `NODE_PATH=$(npm root -g)`).
  - Lancer Chromium **sans option de proxy** : le proxy casse `localhost`.
  - Pages protégées : avant d'ouvrir la page, faire
    `context.addInitScript(() => { sessionStorage.setItem('loggedIn','1'); sessionStorage.setItem('userRole','admin'); sessionStorage.setItem('userPermissions','["votes-quebec","pt6a21"]'); })`.
  - 3D (PT6, globe) : ajouter `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']`, et prévoir des
    captures lentes (`timeout: 90000`).
- Vérifier aussi en largeur téléphone (390 px) : pas de défilement horizontal.
- Les captures temporaires vont dans le dossier de travail de la session, jamais dans le dépôt.

## Pièges déjà rencontrés

- `git add *.html` attrape `loi39-simulation.html`, qui est ignoré. Utiliser `git add $(git ls-files -m '*.html')`
  plus les nouveaux fichiers nommés.
- Des robots GitHub poussent souvent sur `master` (résultats des soirées, données Qc125 aux 3 h). Si le push est refusé,
  faire `git pull --rebase origin master` puis pousser de nouveau ; réessayer jusqu'à 4 fois en cas d'erreur réseau.
- Le crochet de fin de tour exige un dépôt propre. Le travail en cours d'agents peut être exclu temporairement dans
  `.git/info/exclude`, sans le committer.
- Le navigateur garde les anciens modules JS du PT6 si les empreintes `?v=` ne changent pas.
- d3 et les GeoJSON : un anneau à l'envers peint tout le globe. Remettre les anneaux dans le sens de d3,
  **polygone par polygone**.
- Agents parallèles : la limite d'utilisation peut les arrêter en route. On les relance avec SendMessage ; ils
  reprennent là où ils étaient.
- Le menu PT6 se mémorise (`localStorage['pt6a.menus']`) et couvre la vue 3D dans les captures : le fermer.

## Outils et données externes

- Accès GitHub par les outils MCP `mcp__github__*`, limités au dépôt `franky96/fveilleux` (pas de `gh`).
  Ils servent à lancer un workflow à la main (`actions_run_trigger`) et à lire ses journaux.
- Les manuels P&WC ne sont pas dans le dépôt. L'utilisateur les téléverse dans la conversation (ex. `PT6A-21_73-10.zip`
  avec AMM, IPC et OM 73-10). Une nouvelle conversation ne les a plus : les lui redemander au besoin.
  Sur le serveur, ils sont hors du site web et servis par `api/manuel.php` aux utilisateurs connectés.
