# Le Col Roulé — site statique

Site vitrine d'une location de vacances à Valloire : https://www.lecolroule.fr/valloire/
Basé sur le thème « Dimension » de HTML5 UP (jQuery), hébergé sur bunny.net (Storage Zone + Pull Zone).

## Structure

- `valloire/indexfr.html`, `valloire/indexen.html` : **tout le contenu** du site, une page par langue,
  maintenue à la main (pas de template pour l'instant). Toute modification de contenu doit être faite
  dans les deux fichiers.
- `assets/` : CSS/JS/webfonts du thème. `assets/js/main.js` contient le routage côté client.
- `images/` : images référencées par les pages (`images/blog/` pour les billets, `images/favicon/`).
- `error.html` : page d'erreur (porte `<meta name="error" content="true">`, lu par main.js).
- `index.html` (racine) : fichier provisoire ; la racine est redirigée vers `/valloire/` par une edge rule.
- `robots.txt`, `sitemap.xml`, `favicon.ico`, `bimi.svg` : servis tels quels.
- `scripts/deploy.py` : déploiement vers bunny.net (voir plus bas).

## Fonctionnement (à ne pas casser)

- Chaque page contient plusieurs `<article id="…">`. `main.js` lit `location.pathname`, retire
  `/valloire/` puis un préfixe de langue `xx/`, et affiche l'article dont l'id correspond
  (ex. `/valloire/appartement`, `/valloire/en/apartment`). Les ids sont **traduits** :
  `appartement`↔`apartment`, `appartement-commerces`↔`apartment-shops`,
  `appartement-trajet`↔`apartment-route`, `appartement-ski`↔`ski-apartment`,
  `appartement-rando-velo`↔`biking-hiking-apartment`, `contact-reservation`↔`booking-contact`.
  Les liens internes sont relatifs (`./slug`) et doivent correspondre à un id d'article de la même page.
- Un id inconnu redirige vers `/404.html` (fichier volontairement inexistant). Toute 404 est servie
  par `/error.html`, via le réglage « 404 File path » de la Storage Zone bunny.net : ce fichier ne doit
  donc pas être renommé ni supprimé.
- Le mapping des URL (`/valloire/` → `indexfr.html`, `/valloire/en/*` → `indexen.html`, racine → `/valloire/`)
  est fait par des **edge rules de la Pull Zone bunny.net**, pas dans ce dépôt.

## Déploiement

Le dépôt contient uniquement des sources ; rien de généré n'est commité (`dist/` est ignoré).
Les fichiers sont déployés tels quels, au même chemin, sur la Storage Zone.

- `.github/workflows/deploy.yml` lance `scripts/deploy.py` :
  - sur push vers `main`, seulement si la variable de dépôt `DEPLOY_ENABLED` vaut `true` ;
  - manuellement (Actions → Deploy to bunny.net → Run workflow), en dry-run par défaut.
- Le script prend les fichiers suivis par git (moins `DEPLOY_EXCLUDE` : `.github/`, `scripts/`,
  `README.md`, `CLAUDE.md`…), n'envoie que ceux dont le SHA-256 diffère, supprime les fichiers distants absents
  du dépôt (sauf les motifs de `PROTECTED`, vide pour l'instant), puis purge la
  Pull Zone. Un garde-fou bloque si plus de 25 % des fichiers distants seraient supprimés.
- Secrets GitHub : `BUNNY_STORAGE_ZONE` (le **nom** de la zone, `le-col-roule`, pas son ID), `BUNNY_STORAGE_PASSWORD`, `BUNNY_STORAGE_ENDPOINT`
  (facultatif, défaut `https://storage.bunnycdn.com` = Frankfurt), `BUNNY_API_KEY`, `BUNNY_PULLZONE_ID`.
- En local : exporter les mêmes variables puis `python3 scripts/deploy.py --dry-run`.
- Python 3 standard uniquement, aucune dépendance (Node n'est pas installé sur le poste).

## Évolutions prévues

1. Faire le ménage des fichiers inutiles une fois le déploiement automatique validé.
2. Refonte : un seul template HTML + fichiers de traduction FR/EN, billets de blog en données,
   build vers `dist/` en CI.
3. SEO : une URL = un contenu propre (aujourd'hui chaque URL sert toute la page → duplicate content).
4. Rapatrier les edge rules bunny.net dans le dépôt/workflow ; vérifications sur PR
   (liens cassés, parité FR/EN).
5. Test automatique de la version déployée après chaque déploiement (smoke test : pages FR/EN,
   pages profondes, 404, assets) — aujourd'hui fait à la main.
6. Cache : ne purger que les URL modifiées (purge par URL plutôt que toute la Pull Zone), et
   versionner les assets (hash ou semver dans le chemin, ex. `main.3f2a1c.css`) pour ne plus
   avoir à les purger du tout ; seules les pages HTML resteraient à purger.
