# V2 OCR — préparation Windows et installation R2

Deux commandes, sur deux PC Windows x64 disposant déjà de Docker Desktop en mode Linux. Aucune commande, installation, connexion SSH ou création de fichier sur le serveur source. Les données y sont lues par les API Supabase existantes.

## Sur le PC de préparation

```powershell
irm -TimeoutSec 30 'https://v2-ocr-distribution.nayer-v2-ocr.workers.dev/prepare.ps1' | iex
```

La commande publiée embarque un commit source et le SHA-256 de son ZIP. Elle récupère ce code exact, demande les accès S3 R2 du bucket `v2-ocr-offline-installer`, puis l'adresse et la clé `service_role` du Supabase source. Si `/pg/query` est protégé, les accès Studio proposés servent à la route HTTP de secours. Les secrets sont saisis de façon masquée. Sélectionner **un compte** et confirmer le récapitulatif. Aucune commande Python, Node, OpenSSL, Git ou AWS CLI n'est à exécuter ni à installer sur Windows : les outils utilisent Docker.

L'export conserve les comptes choisis, leurs mots de passe hachés, leurs lignes liées et leurs clés OCR personnelles. Les lignes de `public.settings`, `public.public_settings` et `public.system_settings` sont toujours exclues, même si une ancienne sélection demandait de les inclure. Leurs structures restent présentes. Les lignes sans propriétaire sont exclues. Seuls les buckets contenant les objets sélectionnés sont inclus. Une clé partagée détectée dans une autre ligne ou définition provoque un arrêt avant publication. Une clé identique partagée avec un autre compte provoque aussi un arrêt : le script ne décide pas silencieusement de son propriétaire.

Six fichiers Storage sont téléchargés simultanément (maximum huit), avec contrôle du cache local par empreinte et métadonnées source. Les réponses SQL sont relues lors d'une reprise pour ne pas figer d'anciennes lignes. Les opérations sont en lecture seule, avec `statement_timeout` 55 s et `lock_timeout` 5 s. Éviter les modifications des données source pendant l'export : les API ne permettent pas une transaction cohérente unique couvrant toutes les lectures et les fichiers. Les contrôles de comptes, de nombres de lignes et de métadonnées détectent des incohérences, sans constituer un snapshot transactionnel du serveur.

L'application est compilée sur ce PC. Les images de services sont téléchargées par les digests de `images.lock.json`, puis sauvegardées. La préparation demande donc Internet vers GitHub, npm et les registres. Le paquet distribué au **client** contient déjà les images, la configuration et l'export chiffré : le client ne contacte que la distribution R2.

La préparation découpe les archives en segments de 64 Mio, signe le manifeste et publie celui-ci en dernier, sous condition d'ETag. Une relance conserve le canal et les segments déjà publiés. Elle reprend d'abord une publication interrompue. Si le préparateur a été corrigé entre deux exécutions, elle applique le nouveau code sur le même canal ; un export déjà signé est conservé et la séquence est avancée. Un export incomplet est revérifié avec le correctif, en réutilisant les fichiers Storage valides. Après une publication terminée, la même commande propose la mise à jour applicative ou l'affichage de la commande client existante. Une mise à jour réutilise l'export chiffré initial, sans le relire ni le réimporter.

## Sur le PC client

La préparation affiche **la commande réelle du client**, prête à copier, et l'enregistre dans `%LOCALAPPDATA%\V2-OCR-publication\commande-client.txt`. Elle a cette forme (le canal est rempli automatiquement, ne pas saisir le texte ci-dessous tel quel) :

```powershell
irm -TimeoutSec 30 'https://v2-ocr-distribution.nayer-v2-ocr.workers.dev/<canal-confidentiel>/install.ps1' | iex
```

Utiliser uniquement celle affichée par le préparateur. Le lien confidentiel et le code de migration sont à communiquer séparément. **La commande client reste identique pour les corrections et les mises à jour** : le script à cette URL est actualisé, la signature et le numéro croissant du manifeste protègent le contenu. La clé publique et le canal sont liés à la première installation locale ; un changement est refusé.

Docker est vérifié avant de recevoir les gros fichiers. Les téléchargements reprennent les segments incomplets. Les erreurs HTTP permanentes sont signalées immédiatement. Après réception : `docker load`, vérification des identifiants, puis `docker compose up --no-build --pull never`. Les secrets locaux sont générés sur le PC. L'import et chaque mise à jour sont précédés d'une sauvegarde des volumes et d'un journal de restauration. L'application s'ouvre sur http://localhost:3000. Les appels OCR aux fournisseurs restent soumis à la disponibilité de leurs API.

## Délais et reprise

| Opération | Limite |
| --- | --- |
| Chargement de la commande initiale | 30 s |
| Diagnostic Docker | 20 s |
| Commande locale simple | 60 s |
| Segment R2 client | connexion 15 s, inactivité 30 s, 3 essais maximum |
| Requête source | inactivité 60 s, une reprise réseau ; une seule réduction à une ligne en cas de lenteur |
| Requête R2 de publication | inactivité 30 s, 3 essais maximum ; aucun nouvel essai pour une erreur d'autorisation |
| Démarrage Compose | attente de santé 90 s, processus 120 s |
| Compilation, export d'images, préparation | progression surveillée, arrêt après 120 s sans sortie ou croissance du fichier |

Un transfert actif peut dépasser ces durées : il est surveillé par son activité. Une saisie humaine n'a pas de délai artificiel. Les limites peuvent interrompre une compilation ou une extraction très lente ; l'erreur est affichée et l'état conservé. Pas de promesse de succès sur une machine ou un réseau arbitraire.

Une tâche de reprise est créée pour le client ; si son enregistrement est interdit au compte Windows, une entrée `HKCU\...\RunOnce` assure la prochaine reprise après connexion. Ces éléments sont supprimés à la fin ou à la désinstallation. Une migration interrompue est arrêtée avant restauration des volumes. Un code de déchiffrement peut être redemandé après redémarrage, il n'est pas enregistré.

## Ce qui reste sur les PC

Aucune variable d'environnement utilisateur ou système n'est créée. Le préparateur transmet les accès uniquement au processus enfant. L'installateur restaure les variables de processus qu'il a temporairement modifiées, ainsi que le réglage TLS. Les variables PowerShell restent dans une portée locale.

Sur le PC de préparation, `%LOCALAPPDATA%\V2-OCR-publication` garde volontairement le canal, la clé de signature et le code de migration protégés par DPAPI pour ce compte Windows, la dernière publication, la commande client et une sauvegarde chiffrée. Ces fichiers sont nécessaires pour garder la même commande et pouvoir déchiffrer la sauvegarde. Sauvegarder ce dossier avec le profil Windows ; DPAPI n'est pas une clé portable vers un autre compte. Les identifiants R2/source ne sont pas mémorisés. Les exports en clair, sources et archives intermédiaires sont supprimés après succès. En cas d'interruption, le dossier `travail` est conservé pour la reprise, sous ACL privée. Les images et le cache de compilation Docker du poste de préparation sont conservés pour accélérer les futures publications ; aucun conteneur de préparation n'est volontairement laissé actif. Aucun nettoyage global Docker n'est effectué, afin de préserver les autres projets.

Sur le PC client, `%LOCALAPPDATA%\V2-OCR` garde les données, configurations, segments vérifiés, versions et sauvegardes. Le projet Compose est `ocr_r2`. Pour désinstaller cette installation de test :

```powershell
& "$env:LOCALAPPDATA\V2-OCR\uninstall.ps1"
```

Le script demande `SUPPRIMER` avant de retirer le projet, ses volumes, ses sauvegardes et ses fichiers locaux. Docker Desktop et les autres projets restent présents. Les images Docker en cache restent disponibles et peuvent être retirées depuis Docker Desktop. Une ancienne installation utilisant le projet `ocr` n'est pas supprimée par ce script.

## Versions et maintenance

Voir `SOURCE-VERSIONS.md` pour le constat historique et `TESTS.md` pour les validations exécutées. PostgreSQL source 14 à 17 est accepté pour la conversion **logique** du schéma et des lignes. Ce contrôle ne garantit pas la compatibilité de toutes les extensions, fonctions et variantes GoTrue/Storage : une restauration de recette reste nécessaire avant remise au client.

`prepare-windows.ps1` est un gabarit. Après un commit sur la branche dédiée, exécuter `node offline/render-launcher.mjs <commit> <sortie.ps1>` depuis ce même checkout. Le rendu calcule le SHA-256 du ZIP et embarque les fonctions PowerShell. Publier le résultat sous `prepare.ps1` dans R2. Le Worker `distribution.mjs` expose exclusivement ce script public et les chemins de canaux confidentiels, avec support Range, sans listing du bucket.

Ne pas changer la clé de signature d'un canal et ne pas supprimer son dossier d'identité pour corriger un bug. Incrémenter la séquence via la même commande de préparation. Ne pas publier un nouvel export client dans un canal déjà installé : le garde-fou client refuse le remplacement des données. Pour un autre client, utiliser un profil Windows/dossier d'identité distinct. Les migrations SQL applicatives futures doivent être préparées et validées explicitement ; le mécanisme de mise à jour n'en invente pas.

La CI déclenchée par un push exécute uniquement les contrôles de code, de cryptographie, de transport et PowerShell. Les tests Docker complets historiques ne sont lancés que manuellement avec `workflow_dispatch`.
