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
