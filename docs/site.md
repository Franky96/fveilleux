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
- **Version affichée** : `SITE_VERSION` de `version.js` (« 2.0 » depuis le visuel 2.0 du 3 novembre 2026), en badge aux couleurs de la marque (dégradé bleu-vert foncé, « 2.0 » en noir, sans contour ; posé par version.js, rien dans style.css) : petit, en haut à gauche de chaque page (placé par version.js, sans bloquer les clics), visible des administrateurs seulement et masquable (menu du compte, « Badge version des pages ») ; et à côté du nom du site sur le tableau de bord (`data-version-place`), toujours affiché, pour tous (demande de l'utilisateur). La page de connexion affiche « Outils de Frank 2.0 ».
- **Service worker** : `sw.js` (`CACHE_NAME = 'jeux-v…'`) met en cache les jeux de société pour l'usage hors ligne. Changer `CACHE_NAME` quand on modifie ces fichiers.
- **`firebase-config.js`** n'est plus Firebase : c'est une couche de compatibilité qui garde l'interface de l'ancien SDK (`db`, `doc`, `getDoc`, `setDoc`, `onSnapshot`…) mais appelle `api/data.php`. Plusieurs pages (rona, films, liens, aviation, ena, jeux, admin…) l'importent encore ; on la garde. `firebase.json` est un reste sans usage.

## Connexion, rôles, permissions

- **Connexion** :
  - `index.html` et `auth.js` envoient la demande à `api/login.php`, qui vérifie un hachage bcrypt et freine les essais répétés par adresse IP.
  - **Page de connexion (visuel 2.0, 3 novembre 2026)** : fond en 4 diagonales, chacune un aperçu animé d'une page (PT6A-21, ARINC 429, Votes Québec, Hélice) : vidéos courtes en boucle de `connexion/` (WebM puis MP4 pour Safari ; affiche JPEG fixe). Les vidéos ne démarrent pas en mouvement réduit, en économie de données, avec peu de mémoire ou un processeur modeste, ni si iOS bloque la lecture ; si l'écran ne suit pas dans les 4 premières secondes, elles s'arrêtent et le navigateur s'en souvient (`localStorage.apercus`) ; bouton « Figer / Animer ». Thème clair ou sombre comme le reste du site. En thème clair, pas de voile blanc sur les aperçus (`.voile`), seulement un fondu léger en bas pour lire les étiquettes (aucun sur téléphone). Logo et favicon « OdF » sur fond dégradé aux quatre couleurs (`favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`). Couleurs des thèmes et de la marque (3 novembre 2026, choix de l'utilisateur) : les vraies couleurs foncées, les mêmes en clair et en sombre : bleu `#1e6585` (aviation, PT6A-21), vert `#23753f` (informatique, ARINC 429), violet `#45379e` (politique, Votes), brun orangé `#8f5a1a` (loisirs, Hélice), gris `#5f6d78` (travail). Elles servent aux pastilles, traits, bordures, fonds teintés, au dégradé du logo et du favicon (« OdF » en noir avec un fin contour gris `#a9b4bd` ; en thème clair, le logo des pages, pas le favicon, passe en blanc à contour noir, `html.light .logo span` : `-webkit-text-stroke` + `paint-order:stroke fill`) et aux boutons pleins (texte blanc) ; quand elles servent de texte sur fond sombre, on les éclaircit avec `color-mix(in srgb, couleur 55%, var(--text))`. Variables : `--pt6`… et `--m1`…`--m4` dans `index.html`, `--c-*` et `--m1`…`--m4` dans `dashboard.html`. Les vidéos ont été filmées image par image avec une horloge virtuelle (Playwright), hors du dépôt.
  - Le navigateur garde ensuite en `sessionStorage` : `loggedIn`, `userId`, `userName`, `userRole` (`admin`, `user` ou `guest`), `userPermissions` (tableau JSON) et `pageAccueil`.
  - Le serveur garde sa propre session PHP (`api/session.php` : `requireLogin()`, `requireAdmin()`, `getSession()`, `normaliserPermissions()`).
- **Bouton invité** : connexion `guest` avec les permissions accordées aux invités (`SECTIONS_INVITABLES` d'admin.js).
- **Chaque page** commence par un petit script qui renvoie à `index.html` ou à `dashboard.html` sans `loggedIn` ou sans la bonne permission ; l'administrateur passe partout. Ce n'est qu'un confort d'affichage : la vraie protection est dans chaque script PHP, qui revérifie la session et la permission.
- **Permissions** : `PERMS_STRUCTURE` d'`admin.js` donne la liste et la hiérarchie, par exemple Moteurs → PT6A-21, ou Informatique → CSDB. Les anciens noms sont convertis par `ANCIENNES_PERMISSIONS` côté PHP et l'équivalent côté JS.
  - Quelques clés : `votes-quebec` (section Intentions de vote et En direct), `pt6a21` ou `moteurs`, `monde`, `rona`.
- **Tableau de bord** (`dashboard.html`, `dashboard.js`, visuel 2.0 du 3 novembre 2026) : recherche (« / », Entrée ouvre le premier résultat), « Mes raccourcis », puis « Tout le site » en listes groupées par thème avec les sous-pages en pastilles (`GROUPES` de dashboard.js : page, permission, sous-pages et leurs permissions). Quand une page a beaucoup de sous-pages, on les range en groupes étiquetés `[['Étiquette', [[page, nom, permission], …]], …]` (ex. Intentions de vote : Soirées, Québec, Amérique, Europe ; Moteurs : Simulateurs, Aperçus, Connexe, comme moteurs.html) ; une liste simple reste sans étiquette. Étiquettes courtes (une dizaine de lettres au plus). Fond : bandes diagonales teintées aux couleurs des thèmes (`.fond`, fixe, rappel de la page de connexion), choisi parmi 3 essais le 3 novembre 2026 ; la barre du haut prend un voile flou seulement quand la page défile (`.haut.colle`). Une page s'affiche si la personne a sa permission ou celle d'une de ses sous-pages ; une sous-page, si elle a la permission de la page ou la sienne ; les sections archivées (`SECTIONS_ARCHIVABLES`, réglées dans admin) n'y sont pas et passent dans `archive.html`. **Toute nouvelle page va dans `GROUPES`.**
  - **Raccourcis** : propres à chaque compte, jusqu'à 8, « Personnaliser » (retirer, réordonner, ajouter parmi les pages permises), enregistrés sur le serveur par `api/prefs.php` (collection `_prefs`, un document par compte) ; par défaut PT6A-21, Votes Québec, ARINC 429, Hélice (celles que la personne peut voir). **Le compte invité n'a pas de raccourcis** (demande de l'utilisateur). Aperçus des tuiles dans `tableau/`.
  - **Notifications en haut à droite**, deux sortes (demande de l'utilisateur) : **événements** (`evenements.json`, public : soirées électorales, résultats officiels ; chacun avec sa permission `perm`, retirés 7 jours après la fin ; détail, « Ouvrir la page », « Ajouter à mon calendrier » en .ics) et **vérifications** (`api/notifs.php`, **administrateurs seulement**, refusé par le serveur aux autres : passage du pipeline d'après `votes-quebec/verif.json`, Loi 39, gouvernements actuels, sondages, dernière mise en ligne ; états ok / à surveiller / erreur).
  - Menu du compte (lettre du nom) : Administration (admin), Archives et Concept (pas l'invité), Webmail (admin ou permission `webmail`), Badge version (admin), Déconnexion.
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
  - `api/distant.php` : connexion à distance ;
  - `api/prefs.php` : raccourcis du tableau de bord de chaque compte (pas l'invité) ;
  - `api/notifs.php` : notifications de vérification du tableau de bord (administrateurs seulement) ;
  - `api/cadeaux.php` : listes de cadeaux (voir `docs/autres-pages.md`) ; seul script où un invité peut écrire, après le code d'accès de la page.
- **En-têtes de sécurité** : posés par `session.php` (HSTS, nosniff, X-Frame-Options DENY, envois limités à 2 Mo).

## Pipelines GitHub Actions (`.github/workflows/`)

- `votes-quebec-qc125.yml` (« Votes Québec · données Qc125 », toutes les 3 h) : sondages, projections, députés, gouvernement, données des pages d'intentions de vote. Écrit aussi `votes-verif.json` (heure de vérification affichée sur les pages).
- Un workflow par soirée électorale (`cb-`, `alberta-referendum`, `usa-`, `bg-`, `nz-`, `tw-`, `es-election.yml`) : copie de secours des résultats, active seulement autour de la soirée. Voir `docs/en-direct.md`.
- `deploy-hostinger.yml` : voir plus haut.
- Les scripts du pipeline n'utilisent que la bibliothèque standard de Python, sauf exception documentée (Bulgarie : Playwright). Les scripts de données fixes (`…_fixe.py`, `…_geo.py`, lancés à la main, hors pipeline) peuvent exiger `shapely` et `topojson` (`pip install shapely topojson`).

## Ajouter une page au site

1. Créer `ma-page.html` et son JS, en reprenant l'en-tête d'une page existante : script de permission, `version.js`, `theme-toggle.js`, `page-controls.js`, et le bandeau `.site-top` avec « ← Accueil ».
2. Ajouter la permission dans `PERMS_STRUCTURE` (admin.js), et dans les listes d'archives et d'invités si pertinent.
   **Et dans `PAGES` de `api/page.php`** (le serveur refuse sinon la page à tout le monde sauf l'admin).
3. Ajouter la page dans `GROUPES` de `dashboard.js`, et sa carte dans `archive.html` (même groupe que sur l'accueil ; `data-parent` pour une sous-page) ; une sous-page va aussi dans sa page de catégorie (voir plus bas). Au besoin, parmi les choix de page d'accueil d'admin.html.
4. Si la page enregistre des données : ajouter son document à `SECTIONS` dans `api/data.php`.
5. Pour une page de la section Intentions de vote ou En direct : passer par le gabarit (`docs/intentions-de-vote.md`).

## Contrôle des pages par le serveur (`api/page.php`)

Depuis le 3 novembre 2026 (demande de l'utilisateur), le serveur vérifie l'accès avant de servir une page : le `.htaccess` de la racine envoie chaque `.html` de la racine (et de `concept/`), sauf `index.html`, à `api/page.php?p=…`.
- Pas de session PHP → redirigé vers `index.html` ; session sans la permission → `dashboard.html` ; sinon la page est servie telle quelle (ETag, 304 si inchangée, `Cache-Control: private, no-cache`).
- Permissions de la session ouverte à la connexion (`api/login.php`), invité compris. Un changement de permissions dans admin compte à la prochaine connexion (comme pour `data.php`).
- `PAGES` : page → permissions qui l'ouvrent (une suffit ; la permission du groupe ouvre ses sous-pages ; `'connecte'`, `'pas-invite'`, `[]` = admin seulement). `MOTIFS` : toutes les pages Intentions de vote et En direct (`votes-*`, `en-direct*`, `election-*`, `referendum-*`, `loi39`, `intentions-simulations`) → `votes-quebec`, nouvelles soirées comprises. **Une page absente de `PAGES` n'est ouverte qu'à l'admin.**
- Les gardes JavaScript en tête de page restent (même règles, réponse immédiate).
- La session dure 30 jours, comme son témoin (`session.gc_maxlifetime` dans `session.php`).
- Le cache hors ligne des jeux (`sw.js`) ne garde pas une réponse redirigée.
- Test local : `php -S` avec un routeur qui imite la règle du `.htaccess` (voir les notes de test).
- **État : règle du `.htaccess` retirée le soir même** (3 novembre 2026) : l'hébergeur répondait souvent « 503 » sur tout ce qui passe par PHP (même `version.php`, et déjà avant le contrôle) ; avec le contrôle, les pages elles-mêmes tombaient en 503. `api/page.php` reste prêt : remettre le bloc `mod_rewrite` (voir l'historique git) quand le serveur suivra.
- `index.html` charge `auth.js?v=<empreinte>` (8 premiers caractères du sha256) : Safari sur iPhone gardait l'ancien script ; remettre l'empreinte à jour après toute modification d'auth.js (`h=$(sha256sum auth.js | cut -c1-8)`).
- La connexion (`auth.js`) réessaie 6 fois quand le serveur répond 503, puis affiche « Le serveur est occupé… » au lieu d'une erreur JSON. Les lectures et écritures de `firebase-config.js` (`fetchServeur`) réessaient aussi jusqu'à 5 fois sur un 503 : l'hébergeur le renvoie sans lancer PHP, la requête n'a donc rien fait.
- **Fiabilité, tout le site** : `version.js` (chargé par presque toutes les pages, avant leurs modules) remplace `fetch` : une requête vers `/api/` qui reçoit le 503 HTML de l'hébergeur est refaite jusqu'à 6 fois, avec de courtes pauses ; un 503 JSON de nos scripts n'est pas touché. `cadeaux.html` (sans version.js) le fait dans son `api()`.
- Connexion et invité (`login.php`) : session neuve sans relire l'ancienne (`unset($_COOKIE['fv_sess'])` avant `sessionInit()`) : une vieille session encore verrouillée faisait attendre la connexion jusqu'au 503 (iPhone).
- Charge PHP réduite le même soir : la session est relâchée dès qu'elle est lue (`requireLogin()`, `getSession()` ; `requireLogin(true)` pour garder la session ouverte, seulement `cadeaux.php` et `users.php`, qui y écrivent), et `onSnapshot` de `firebase-config.js` ne lit plus quand l'onglet est caché, une lecture à la fois.

## Pages de catégorie (visuel 2.0)

`moteurs.html`, `informatique.html`, `jeuxdesociete.html` et `archive.html` (3 novembre 2026) partagent `categorie.css` et `categorie.js` : la même barre du haut que le tableau de bord (logo et « Outils de Frank » qui ramènent à l'accueil, badge 2.0, « ← Accueil », thème, menu du compte), le même fond en diagonales, une tête (icône, titre, description), puis des groupes à intertitre (point de la couleur du thème, compteur, petite description) avec des cartes `<a class="carte" data-section="permission">`.
- Couleur : `style="--c:var(--c-avia|--c-info|--c-lois|--c-trav)"` sur `<body>` (ou sur un groupe, comme dans Archives).
- `<body data-parent="moteurs">` : une carte s'affiche pour l'admin, la permission du groupe ou la sienne, sauf section archivée (sauf si tout le groupe l'est). Un groupe sans carte visible est caché.
- `<body data-mode="archives">` : seulement les sections archivées auxquelles on a droit, groupées comme sur l'accueil ; ouvrir une carte ramène ensuite aux Archives (« ← Archives », voir version.js).
- Groupes : Moteurs (Simulateurs détaillés, Aperçus, Connexe), Informatique (Avionique, Réseau et transfert, Circuits), Jeux de société (Jeux, Outils), les mêmes que sur l'accueil.
- Pour ajouter une sous-page : une carte dans le bon groupe de sa page de catégorie et dans `archive.html`, la permission dans le garde en tête de page.
- Jeux de société reste dans le cache hors ligne (`sw.js`, avec `categorie.js`, `categorie.css`, `firebase-config.js`) : changer `CACHE_NAME` quand ces fichiers changent.

## Style commun

- `style.css`, thème clair ou sombre par `theme-toggle.js` (`localStorage.theme`).
- **Fond 2.0** (`fond.css`, 3 novembre 2026) : sur les pages pas encore en visuel 2.0, seulement le fond change (couleur de base et diagonales du tableau de bord ; `html`, `body` et `.dashboard-container` transparents par-dessus), rien d'autre (demande de l'utilisateur). Chargé en dernier dans `<head>`. Pas sur les pages archivées (Aviation, Aéronefs, ÉNA, Connexion à distance, OSINT, Films, Hockey, Bières, Science-fiction, Page de tests), ni sur Intentions de vote et En direct, ni sur concept.html. Toute nouvelle page qui n'est pas en 2.0 le reçoit aussi.
- Polices Google Fonts. Les bibliothèques passent par un CDN avec SRI (three.js 0.147, d3 7.9, topojson-client…).
- Les pages de la section Intentions de vote ont leur propre feuille de style, dans le gabarit.
