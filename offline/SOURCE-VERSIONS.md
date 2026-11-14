# Référence du serveur source

Constat sur l'historique Git, sans connexion ni commande sur le serveur.

Le dernier commit antérieur aux travaux de migration est `240f89b243d83e7c4460e7219872b7634369d164`, daté du **1er septembre 2025**. Cette date a été confirmée par le propriétaire comme référence du déploiement.

| Élément | Preuve dans ce commit | Ce que l'on peut conclure |
| --- | --- | --- |
| Application | `package.json`, `package-lock.json` | Next.js 14.2.17 ; dépendances applicatives verrouillées par le lockfile |
| Image Node de compilation | `Dockerfile`, `ARG NODE_IMAGE=node:20-alpine` | Famille Node 20 / Alpine, tag mutable ; ni patch Node, ni version Alpine, ni digest historique enregistré |
| Construction du déploiement | `.github/workflows/docker-deploy.yml`, `docker build --pull` | Le pipeline demandait bien la version disponible du tag Node lors de la construction |
| Application déployée | Même workflow : `rehanalimahomed/inoor-ocr:${VERSION}` | Le conteneur est lancé avec le tag du commit ; `latest` est également publié mais n'est pas utilisé par `docker run` |
| Docker Engine / Compose du serveur | Aucun installateur ou verrou de versions du moteur dans ces fichiers | Versions non déductibles. `docker build --pull` met à jour l'image de base, pas le moteur Docker du serveur |
| Services Supabase du serveur | Le Compose historique contient uniquement `app` et `dev` | Aucun tag ni digest de PostgreSQL, GoTrue, Storage ou PostgREST du serveur n'est documenté dans ce Compose |

Les tags de `local/docker-compose.yml` ont été ajoutés pendant les travaux de migration de novembre 2026. Ils décrivent la **cible locale**, pas le serveur de septembre 2025. En particulier, PostgreSQL 17.6.1.136, GoTrue v2.197.0 et Storage v1.89.12 ne sont pas présentés comme les versions source.

L'export relève `current_setting('server_version_num')` via la route SQL HTTP existante, en lecture seule, puis conserve la valeur dans le manifeste chiffré. L'export logique sélectionne les colonnes compatibles et utilise l'adaptation d'identités existante à l'import. La plage 14–17 autorisée est un garde-fou du convertisseur, **pas une certification de restauration de chaque combinaison Supabase**. L'essai de migration sur Windows reste à effectuer par le propriétaire.

Aucune mise à jour, installation ou création de fichier n'est demandée au serveur. Les seules ressources source utilisées sont celles des requêtes SQL et HTTP. Les lectures SQL sont limitées dans le temps ; six transferts Storage sont actifs au maximum par défaut. Une absence de route SQL autorisée est signalée et ne déclenche ni SSH ni création d'une route sur le serveur.
