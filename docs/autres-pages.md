# Autres pages du site

Pages plus simples, chacune avec son HTML, son JS et sa permission. Le schéma commun est décrit dans `docs/site.md`.

## RONA S&S (`rona.html`, `rona.js`, permission `rona`)

- **Usage** : inventaire des trousses de premiers soins par emplacement.
  - `ITEMS` : liste de référence de la trousse, avec les quantités petite, moyenne, grande et perso.
  - Pour chaque emplacement : articles manquants, articles complets, et dates d'expiration pour les articles de `ITEMS_AVEC_EXPIRY`.
- **Données** : document `donnees/rona_global`, lu par `firebase-config.js` puis `api/data.php`. La mise à jour se propage en direct (`onSnapshot`).
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
- **Autres** : CFM56-7B (`turboreacteur`), PW1500G (`pw1500g`), O-320 (`o320`), engrenages planétaires (`planetaire`), pompe à engrenages (`pompe-engrenages`). La page d'index est `moteurs.html`.

## Jeux de société (`jeuxdesociete.html`, permission `jeuxdesociete`)

- **Jeux** : 7 Wonders, Qwirkle, Ticket to Ride (et version RS), Flip 7, La Dame de Pique, Compteur général (`cg-tournoi.js`).
- **Hors ligne** : mis en cache par le service worker `sw.js`. Changer `CACHE_NAME` après une modification.

## Autres sections

- **Divers** : ÉNA (`ena`), Aviation (`aviation`, avec Aéronefs), Bières, Sci-Fi, Hockey, Liens utiles, Films & Séries, OSINT Map, Connexion à distance (`distant`, `api/distant.php`), page de tests (`pageTest`).
- **Information Monde** : voir `docs/information-monde.md`.
- **Intentions de vote et simulations** : voir `docs/intentions-de-vote.md` et `docs/en-direct.md`.
- `concept/` et `mgfitness/` : essais et images, à ne pas toucher sans demande.
