# Installation Windows de V2 OCR depuis R2

Le client reçoit une commande et, pour une première migration, un code de déchiffrement transmis séparément. Il ouvre PowerShell dans sa session Windows habituelle, colle la commande et valide les demandes Windows. Si Windows demande un redémarrage, la reprise se fait à la prochaine ouverture de cette même session. V2 OCR s'ouvre ensuite à l'adresse http://localhost:3000.

```powershell
irm 'https://v2-ocr-distribution.nayer-v2-ocr.workers.dev/<canal-confidentiel>/install.ps1' | iex
```

Le lien ci-dessus décrit le format. Remplacez `<canal-confidentiel>` après la publication d'une version validée. Traitez le lien comme un secret. Le script initial est approuvé via HTTPS et contient la clé publique RSA qui vérifie toutes les versions du manifeste. Le bucket R2 reste privé.

## Préparer une version

Le poste de préparation est Linux x64 avec Docker et Compose, Python 3.12+, Node.js 20+, Git, OpenSSL et une version récente d'AWS CLI v2. Il doit accéder aux registres, à npm et aux ressources utilisées lors du build Next.js. Le poste client reçoit les images préparées et utilise Docker Desktop avec le moteur Linux WSL2. La première cible est Windows 11 x64 avec virtualisation activée.

1. Partir d'un checkout propre de cette branche. Vérifier les versions du serveur source en lecture seule. Relever le tag et l'identifiant de chaque image via `docker inspect` sur le serveur et comparer les schémas et versions de PostgreSQL, GoTrue, PostgREST et Storage. Un PostgreSQL majeur 17 est exigé par le préparateur. Cette vérification est un contrôle de compatibilité, les essais de restauration restent nécessaires.
2. Utiliser le filtre existant, en confirmant le périmètre compte par compte et les choix pour les tables globales, les lignes sans propriétaire et les paramètres sensibles. Employer un dossier dédié, protégé et hors synchronisation. Exporter pendant une période sans écriture côté source.

```bash
node local/assistant/export-filtre.mjs /chemin/prive/export
```

3. Résoudre les tags existants en digests, puis conserver le verrou avec les dossiers de version. Réutiliser ce verrou pour les builds suivants. Le fichier généré par la commande suivante doit être créé une fois par jeu de versions validé.

```bash
python3 offline/prepare.py lock-images /chemin/prive/images.lock.json
```

4. Créer et protéger une clé RSA de signature. Générer un canal aléatoire par client et un code de migration par export. Conserver ces fichiers avec des permissions restreintes et hors dépôt. Réutiliser la même clé de signature sur un canal. Pour la remplacer, créer un nouveau canal et fournir une nouvelle commande au client.

```bash
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out /chemin/prive/signature.pem
openssl rand -base64 32 > /chemin/prive/migration.key
channel="$(openssl rand -hex 32)"
host="https://v2-ocr-distribution.nayer-v2-ocr.workers.dev"
```

5. Préparer le paquet, puis exécuter le test Docker sur une machine dédiée. `--payload` désigne le sous-dossier contenant le manifeste de l'export filtré. Pour une mise à jour après migration, omettre `--payload` et `--migration-key`. Le script génère des alias Docker liés aux identifiants d'images et préserve les URLs locales. Il remplace uniquement le marqueur de clé publique Supabase dans la sortie Next.js avec la clé locale au démarrage.

```bash
python3 offline/prepare.py build \
  --lock /chemin/prive/images.lock.json \
  --output /chemin/prive/version-1 \
  --signing-key /chemin/prive/signature.pem \
  --channel-url "$host/$channel/manifest.json" --version 1.0.0 --sequence 1 \
  --payload /chemin/prive/export/payload --migration-key /chemin/prive/migration.key
bash offline/tests/docker-smoke.sh /chemin/prive/version-1
```

Les options `--wsl` et `--docker-desktop` acceptent des installeurs hors ligne officiels de versions précises, après validation de leur provenance, de leur signature et de leur compatibilité. La redistribution de Docker Desktop exige de vérifier les droits applicables à l'organisation et au client. Une version sans ces binaires vise un poste qui dispose déjà de prérequis compatibles.

6. Tester le paquet sur un poste Windows avec des données de recette. Après validation, publier avec un jeton S3 R2 limité au bucket. AWS CLI lit ses identifiants dans son profil ou l'environnement. `OCR_R2_S3_ENDPOINT` est l'endpoint S3 R2 du compte. Les objets sont mis en place avant le manifeste, qui est remplacé sous condition d'ETag. Chaque publication doit avoir une séquence croissante.

```bash
python3 offline/prepare.py publish /chemin/prive/version-1 --channel "$channel"
printf "irm '%s/%s/install.ps1' | iex\n" "$host" "$channel"
```

## Exploitation et reprise

La distribution utilise un Worker en lecture seule via la liaison R2 `RELEASES`. Il ne liste aucun objet et répond aux requêtes de plage HTTP. Les segments sont adressés par SHA-256. Windows conserve chaque segment vérifié et reprend le segment courant lorsque le serveur accepte `Range`. L'export est chiffré par AES-256-GCM avant découpage. La clé de déchiffrement n'est pas téléversée.

L'installation R2 utilise le projet Compose `ocr_r2` et ses volumes dédiés. Pour une installation historique `ocr`, prévoir une migration encadrée afin de conserver ses données. Les fichiers d'état et les sauvegardes sont sous `%LOCALAPPDATA%\V2-OCR` avec accès limité au compte et à SYSTEM. Prévoyez l'espace nécessaire pour les segments, les archives reconstituées, les données déchiffrées, Docker et les sauvegardes. Les sauvegardes de volumes contiennent les données de travail locales. Un poste chiffré avec BitLocker protège aussi ces données et les fichiers temporaires au repos.

Avant un import ou une mise à jour, le script arrête la pile concernée, sauvegarde les volumes et vérifie les archives. Le journal permet de restaurer les volumes et la version précédente si l'opération s'arrête avant validation. En cas de mise à jour, le même export n'est pas réimporté. Un export différent est refusé lorsque des données locales existent. Le mécanisme de mise à jour ne fabrique pas de migrations SQL, celles-ci doivent être livrées et testées quand l'application change de schéma.

Le traitement OCR peut nécessiter un accès aux fournisseurs configurés par l'application. L'installation, l'ouverture de l'application, les comptes et les documents restaurés sont les éléments couverts par le scénario hors connexion.

## Recette Windows

Utiliser une VM Windows x64 dédiée avec virtualisation imbriquée et un snapshot initial. Relever le commit, les digests, les versions de Windows, WSL, Docker et Compose, et la séquence du manifeste.

| Vérification | Résultat attendu |
| --- | --- |
| Machine vierge | La commande installe les prérequis approuvés, redémarre sur demande et ouvre V2 OCR. |
| Démarrage hors connexion | Après réception des archives, désactiver l'accès extérieur. Le démarrage utilise exclusivement les images chargées. |
| Coupure en cours de téléchargement | Interrompre la connexion pendant un segment. Vérifier que les segments déjà validés restent intacts et que le segment en cours reprend. |
| Segment absent ou corrompu | Vérifier le diagnostic, l'absence d'installation avec le mauvais fichier et la reprise après rétablissement de l'objet. |
| Redémarrage Windows | Redémarrer pendant le téléchargement puis pendant l'import de recette. Vérifier la reprise et la restauration préalable si le journal existe. |
| Comptes et documents | Se connecter avec un compte choisi, ouvrir les documents et vérifier leurs empreintes. Vérifier l'absence d'un compte de contrôle exclu. |
| Persistance et mise à jour | Créer un élément local, redémarrer Docker, installer une séquence suivante et retrouver l'élément. |
| Échec et restauration | Dans un paquet de recette, provoquer un échec d'import puis un échec de démarrage lors d'une mise à jour. Contrôler l'intégrité et l'accès aux données précédentes. |
