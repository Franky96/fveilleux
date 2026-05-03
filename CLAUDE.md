# Conventions du projet fveilleux

## CSDB — Bande de valeurs (banner)

Quand une adresse CSDB contient **plusieurs valeurs décodables** (ex : code ATC + altitude, fréquence active + standby, etc.), toutes les valeurs doivent apparaître dans la bande du haut (`banner-values`), en les ajoutant comme objets `{ label, value }` dans le tableau retourné par `getBannerValues()`.

Ordre d'affichage : valeur la plus "principale" à droite, valeurs secondaires à gauche (utiliser `unshift` pour insérer à gauche).

Exemple appliqué : adresse 0x1E affiche **CODE ALT** (gauche) et **CODE ATC** (droite).

## Git

- Développer sur `website-updating`, merger vers `master`, puis push les deux.
- Ne jamais pusher directement sur `master` sans passer par `website-updating`.
- **Toujours faire le merge et push après chaque modification.**
