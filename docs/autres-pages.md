# Autres pages du site

Pages plus simples, chacune avec son HTML, son JS et sa permission. Le schéma commun est décrit dans `docs/site.md`.

## RONA S&S (`rona.html`, `rona.js`, permission `rona`)

- **Usage** : inventaire des trousses de premiers soins par emplacement.
  - `ITEMS` : liste de référence de la trousse, avec les quantités petite, moyenne, grande et perso.
  - Pour chaque emplacement : articles manquants, articles complets, et dates d'expiration pour les articles de `ITEMS_AVEC_EXPIRY`.
- **Données** : document `donnees/rona_global`, lu par `firebase-config.js` puis `api/data.php`. La mise à jour se propage presque en direct : `onSnapshot` de `firebase-config.js` interroge `api/data.php` toutes les 4 secondes.
- **PDF (pdf-lib)** :
  - la liste est imprimée par-dessus le gabarit `liste_trousse.pdf` ;
  - puis viennent les pages « Dates d'expiration des articles » (`ajouterPagesDates()`).
  - Les articles y sont **dans l'ordre de la liste du site (`ITEMS`)**, demande de l'utilisateur du 25 octobre 2026. Rouge : expiré ; orange : expire dans moins de 2 mois.
- **Boutons** : marquer un emplacement complet, PDF d'un emplacement ou de plusieurs.

## Informatique (permission `informatique` et sous-permissions)

- **CSDB** (`csdb.html`, `csdb.js`, manuel `Manuel_CSDB.pdf`) : décodeur. Règle de la bande du haut (`getBannerValues()`) :
  - toutes les valeurs décodables d'une adresse y apparaissent ;
  - la plus importante est à droite (`unshift` pour ajouter à gauche) ;
  - exemple, adresse 0x1E : CODE ALT, puis CODE ATC. Voir CLAUDE.md.
- **ARINC 429** (`arinc429.html`, `arinc429.js`, `Manuel_Arinc_429.pdf`, `SSM_et_SDI_ARINC429.csv`) : décodeur de mots ARINC 429.
- **Autres outils** : convertisseur (`converter`), encodeur BNR (`crypteur`), TCP/IP (`tcpip`), QR Transfert (`qr-transfer`), Shape Transfert (`shape-transfer`), simulateurs de puces (`chips`), circuit logique (`circuit`).

## Moteurs (permission `moteurs` et sous-permissions)

- **PT6A-21** : voir `docs/pt6a21.md`.
- **Autres** : CFM56-7B (`turboreacteur`), PW1500G (`pw1500g`), O-320 (`o320`), engrenages planétaires (`planetaire`), pompe à engrenages (`pompe-engrenages`), hélice à vitesse constante (`helice`). La page d'index est `moteurs.html`.
- **Hélice à vitesse constante** (`helice.html`, fichier unique) : hélice Hartzell du PT6 et son régulateur, d'après la vidéo « PT6 Prop Governor Operation » de qp Aviation (sa transcription n'est pas dans le dépôt). Modèle : une tranche de pale à 0,75 R (angle équivalent décalé de 6° aux petits pas), théorie de Froude, régulateur primaire, OSG (104 %, 92 % en prop test), FTG (106 %, 95 % en inversion), drapeau automatique (400 et 200 ft-lb), soupape bêta, roulage d'un bimoteur de 4300 kg. Les situations (`CAS` dans le script, menu « Situation ») partent d'un état stabilisé 8 s. Disposition demandée par l'utilisateur (28 octobre 2026) : poste de pilotage, la vue à gauche (onglets « Hélice en 3D », three.js 0.147 comme `pt6a21.html`, et « Régulateur et moyeu », le schéma 2D), le pupitre collé à droite (manettes de puissance et d'hélice qu'on glisse, avec leurs portes ; vitesse ; cadrans Np et couple ; voyants ; systèmes ; pannes), et sous la vue la bande « ce qui se passe » (`expliquer()`), qui dit en mots simples ce que fait le régulateur. Sur téléphone, la vue 3D reste collée en haut pendant qu'on manœuvre.

## Jeux de société (`jeuxdesociete.html`, permission `jeuxdesociete`)

- **Jeux** : 7 Wonders, Qwirkle, Ticket to Ride (et version RS), Flip 7, La Dame de Pique, Compteur général (`cg-tournoi.js`).
- **Hors ligne** : mis en cache par le service worker `sw.js`. Changer `CACHE_NAME` après une modification.

## Autres sections

- **Divers** : ÉNA (`ena`), Aviation (`aviation`, avec Aéronefs), Bières, Sci-Fi, Hockey, Liens utiles, Films & Séries, OSINT Map, Connexion à distance (`distant`, `api/distant.php`), page de tests (`pageTest`).
- **Information Monde** : voir `docs/information-monde.md`.
- **Listes de cadeaux** (`cadeaux.html`, permission `cadeaux`, ouvrable aux invités, `api/cadeaux.php`) : demandée le 31 octobre 2026, pensée d'abord pour iPhone et iPad (un écran à la fois sur iPhone, personnes et liste côte à côte sur iPad). Une liste par personne, présentée en vraie liste (une ligne par cadeau : vignette, nom, prix, site, début des notes, bouton ↗ du lien ; toucher la ligne ouvre la fiche) ; chaque cadeau a un titre, un lien, un prix, des notes, un « coup de cœur » et jusqu'à 8 photos.
  - **Noms toujours en ordre alphabétique** (demande de l'utilisateur, 31 octobre 2026) : triés à l'affichage et gardés triés dans la base par `api/cadeaux.php` (sans tenir compte des accents ni des majuscules).
  - **La page est la même pour tout le monde** (demande de l'utilisateur) : tous ceux qui ont le code voient et modifient les mêmes listes.
  - **Code d'accès** : en plus de la permission, un code vérifié par le serveur (hachage bcrypt dans `_cadeaux/config`, 8 essais ratés par IP en 15 min). L'administrateur passe sans code et le choisit ou le change au bas de la page ; un nouveau code ferme les sessions ouvertes avec l'ancien.
  - **Stockage** : table `documents`, collections `_cadeaux` (`listes`, `config`) et `_cadeaux_photos` (photo de 1600 px et vignette de 480 px, réduites en JPEG dans le navigateur, servies par `api/cadeaux.php?photo=`). Les collections en `_` ne passent jamais par `data.php`. Les écritures se font sous verrou de fichier, action par action (deux personnes qui ajoutent en même temps ne s'écrasent pas) ; les photos retirées ou abandonnées sont effacées.
  - **Photo tirée du lien** (demande du 31 octobre 2026) : quand on colle un lien, `api/cadeaux.php` (action `apercu`) ouvre la page et prend l'image donnée pour les partages (`og:image`, `twitter:image`, JSON-LD `Product`, image principale d'Amazon `#main-image`/`#landingImage`), puis propose le nom et le prix s'ils sont vides. Garde-fous : http(s), ports 80 et 443, adresses publiques seulement (vérifiées à chaque redirection et imposées à curl), 8 s, 30 recherches par 10 min et par session. Testé le 31 octobre : Amazon, Costco.ca, Renaud-Bray, Wikipédia trouvent une image (Costco envoie de l'AVIF si on l'accepte, que GD ne lit pas : on demande WebP ou JPEG, et `agrandir()` passe ses images de 350 à 1200 px) ; Best Buy, LEGO, Simons bloquent, Canadian Tire n'en donne pas (page en JavaScript). On peut toujours retirer l'image ou ajouter la sienne. Depuis Hostinger, les résultats peuvent différer (certains sites bloquent les serveurs).
  - Les autres appareils voient les changements dans les 15 secondes. Test local : pas de PHP ni de MySQL dans `http.server` ; la session de travail du 31 octobre l'a testé avec `php -S` et une base SQLite de test (hors dépôt).
- **Heure d'été ou d'hiver** (`heure-ete-hiver.html`, permission `heure`, fichier unique) : comparaison des trois options pour le Québec (changement d'heure actuel, heure normale UTC−5 ou heure avancée UTC−4 toute l'année), demandée par l'utilisateur le 30 octobre 2026 pendant le débat sur l'abolition du changement d'heure. Levers, couchers, aube et crépuscule civils calculés dans le navigateur (équation du lever, J2000) pour 13 villes, jour par jour en 2027 ; horaire de l'utilisateur (départ, retour) gardé en `localStorage`. L'encadré « Où en est le débat » et les sources datent du 30 octobre 2026 : à mettre à jour quand le gouvernement choisira l'heure.
- **Intentions de vote et simulations** : voir `docs/intentions-de-vote.md` et `docs/en-direct.md`.
- `concept/` et `mgfitness/` : essais et images, à ne pas toucher sans demande.
