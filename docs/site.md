# Architecture générale du site fveilleux.com

## Hébergement et déploiement

- Site statique HTML/CSS/JS sans étape de compilation, avec des scripts PHP dans `api/` et une base MySQL. Hébergé chez **Hostinger**.
- **Déploiement** : Hostinger déploie `master` à chaque push, grâce au webhook du dépôt.
- **Secours** : `.github/workflows/deploy-hostinger.yml` vérifie après chaque push que fveilleux.com sert bien les fichiers modifiés.
  - Sinon, il appelle l'adresse de déploiement de Hostinger (secret `HOSTINGER_DEPLOY_URL`, à ne jamais afficher).
  - Il tourne aussi toutes les 30 min, et après chaque workflow de données (liste `workflow_run.workflows`).
  - **Tout nouveau workflow qui pousse des données doit être ajouté à cette liste**, car les commits des robots ne déclenchent pas `push`.
  - Le 22 octobre 2026, un incident GitHub a bloqué les webhooks ; ce workflow a été ajouté à ce moment.
- **Rechargement automatique** : `api/version.php` calcule une empreinte des `.html`, `.js` et `.css`. `version.js` l'interroge et recharge la page ouverte quand elle change.
- **Version affichée** : `SITE_VERSION` de `version.js`, en badge visible des administrateurs seulement.
- **Service worker** : `sw.js` (`CACHE_NAME = 'jeux-v…'`) met en cache les jeux de société pour l'usage hors ligne. Changer `CACHE_NAME` quand on modifie ces fichiers.
- **`firebase-config.js`** n'est plus Firebase : c'est une couche de compatibilité qui garde l'interface de l'ancien SDK (`db`, `doc`, `getDoc`, `setDoc`, `onSnapshot`…) mais appelle `api/data.php`. Plusieurs pages (rona, films, liens, aviation, ena, jeux, admin…) l'importent encore ; on la garde. `firebase.json` est un reste sans usage.

## Connexion, rôles, permissions

- **Connexion** :
  - `index.html` et `auth.js` envoient la demande à `api/login.php`, qui vérifie un hachage bcrypt et freine les essais répétés par adresse IP.
  - Le navigateur garde ensuite en `sessionStorage` : `loggedIn`, `userId`, `userName`, `userRole` (`admin`, `user` ou `guest`), `userPermissions` (tableau JSON) et `pageAccueil`.
  - Le serveur garde sa propre session PHP (`api/session.php` : `requireLogin()`, `requireAdmin()`, `getSession()`, `normaliserPermissions()`).
- **Bouton invité** : connexion `guest` avec les permissions accordées aux invités (`SECTIONS_INVITABLES` d'admin.js).
- **Chaque page** commence par un petit script qui renvoie à `index.html` ou à `dashboard.html` sans `loggedIn` ou sans la bonne permission ; l'administrateur passe partout. Ce n'est qu'un confort d'affichage : la vraie protection est dans chaque script PHP, qui revérifie la session et la permission.
- **Permissions** : `PERMS_STRUCTURE` d'`admin.js` donne la liste et la hiérarchie, par exemple Moteurs → PT6A-21, ou Informatique → CSDB. Les anciens noms sont convertis par `ANCIENNES_PERMISSIONS` côté PHP et l'équivalent côté JS.
  - Quelques clés : `votes-quebec` (section Intentions de vote et En direct), `pt6a21` ou `moteurs`, `monde`, `rona`.
- **Tableau de bord** : `dashboard.html` et `dashboard.js` montrent les cartes `.menu-card[data-section]` permises. Les sections archivées (`SECTIONS_ARCHIVABLES`, réglées dans admin) passent dans `archive.html`.
- **Administration** : `admin.html` et `admin.js`, avec `api/users.php`. On y gère les utilisateurs, les rôles, les permissions, la page d'accueil de chacun, les archives et les invités.
  - `api/coffre.php` gère le coffre des mots de passe (copie chiffrée AES-256-GCM) et la double authentification des administrateurs. La clé est hors du site.

## Données et API PHP

- **Base de données** : `api/db.php` lit les identifiants dans `config/fveilleux-db.php`, **hors de `public_html`**, jamais versionné.
- **Données des pages** : `api/data.php` lit et écrit des documents JSON par collection.
  - `SECTIONS` associe chaque document à la permission qui le protège, par exemple `donnees/rona_global` → `rona`.
  - Les collections qui commencent par `_` ne sont jamais servies.
  - Les écritures n'acceptent que du JSON (protection contre les formulaires d'autres sites).
- **Relais des résultats électoraux** : `api/cb.php`, `alberta.php`, `usa.php`, `direct-bg|nz|tw|es.php`, `live.php`. Ils suivent tous le même modèle :
  - session et permission `votes-quebec` vérifiées ;
  - seulement des hôtes officiels fixés dans le code, jamais une adresse fournie par le visiteur ;
  - cache de 30 à 45 s dans `sys_get_temp_dir()`, avec verrou ;
  - réponse JSON avec `disponible`, `maj` et `ageCache`.
- **Autres scripts** :
  - `api/suivis.php` : circonscriptions suivies, partagées entre appareils ;
  - `api/photo-depute.php` : photos officielles des députés de l'Assemblée nationale ;
  - `api/manuel.php` : manuels PDF hors du site, pour les utilisateurs connectés ;
  - `api/distant.php` : connexion à distance.
- **En-têtes de sécurité** : posés par `session.php` (HSTS, nosniff, X-Frame-Options DENY, envois limités à 2 Mo).

## Pipelines GitHub Actions (`.github/workflows/`)

- `votes-quebec-qc125.yml` (« Votes Québec · données Qc125 », toutes les 3 h) : sondages, projections, députés, gouvernement, données des pages d'intentions de vote. Écrit aussi `votes-verif.json` (heure de vérification affichée sur les pages).
- Un workflow par soirée électorale (`cb-`, `alberta-referendum`, `usa-`, `bg-`, `nz-`, `tw-`, `es-election.yml`) : copie de secours des résultats, active seulement autour de la soirée. Voir `docs/en-direct.md`.
- `deploy-hostinger.yml` : voir plus haut.
- Les scripts n'utilisent que la bibliothèque standard de Python, sauf exception documentée (Bulgarie : Playwright).

## Ajouter une page au site

1. Créer `ma-page.html` et son JS, en reprenant l'en-tête d'une page existante : script de permission, `version.js`, `theme-toggle.js`, `page-controls.js`, et le bandeau `.site-top` avec « ← Accueil ».
2. Ajouter la permission dans `PERMS_STRUCTURE` (admin.js), et dans les listes d'archives et d'invités si pertinent.
3. Ajouter la carte dans `dashboard.html` (`data-section`) et, si besoin, dans `archive.html` et parmi les choix de page d'accueil d'admin.html.
4. Si la page enregistre des données : ajouter son document à `SECTIONS` dans `api/data.php`.
5. Pour une page de la section Intentions de vote ou En direct : passer par le gabarit (`docs/intentions-de-vote.md`).

## Style commun

- `style.css`, thème clair ou sombre par `theme-toggle.js` (`localStorage.theme`).
- Polices Google Fonts. Les bibliothèques passent par un CDN avec SRI (three.js 0.147, d3 7.9, topojson-client…).
- Les pages de la section Intentions de vote ont leur propre feuille de style, dans le gabarit.
