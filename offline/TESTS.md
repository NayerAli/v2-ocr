# Rapport d'exécution

14 novembre 2026, environnement Linux de travail.

| Vérification | Résultat |
| --- | --- |
| Tests Python de segmentation, reconstruction et signature RSA | 2 réussis |
| Tests Node de chiffrement, corruption et plages HTTP du Worker | 2 réussis |
| Tests Node du moteur d'archive existant avec source simulée | 2 réussis |
| Analyse syntaxique JavaScript, compilation Python, lecture YAML et analyse Bash | Exécutées avec succès |
| Compilation Next.js avec le marqueur Supabase | Réussie sous Linux. Le marqueur figure dans les bundles navigateur et serveur. |
| Vérification RSA et écriture atomique dans le script | Réussies avec PowerShell 7.5 sous Linux. Une signature altérée est rejetée. |
| Syntaxe de l'installateur | Analyse réussie par Windows PowerShell 5.1 dans [GitHub Actions](https://github.com/NayerAli/v2-ocr/actions/runs/43557187550). |
| Digests des huit images Compose | Relevés dans le registre Docker et consignés dans `offline/images.lock.json`. |
| Création R2, déploiement du Worker et lecture d'un objet synthétique via l'API R2 | Réussis |
| Téléchargeur PowerShell exécuté avec un serveur HTTPS local | Connexion interrompue à 400 000 octets, reprise effective via Range et reconstruction depuis le cache sans nouvelle requête. PowerShell 7.5 sous Linux. |
| Requêtes HTTPS vers le Worker déployé | HTTP 200 sur l'objet, 206 sur la reprise à l'octet 7, 416 sur une plage hors limites |
| Construction, empaquetage et chargement Docker | Réussis dans [la première CI Linux](https://github.com/NayerAli/v2-ocr/actions/runs/43557187550). Le test s'est arrêté avant le démarrage des services, car les secrets créés dans le conteneur Linux appartenaient à root. Le test lance maintenant l'initialisation avec l'UID de l'opérateur. |
| Exécution Windows, prérequis, WSL2 et reprise après redémarrage | À exécuter sur une VM Windows avec Docker Desktop. |
| Export source, restauration réelle des comptes et documents, mise à jour et restauration après échec | À exécuter avec une archive autorisée dans la VM de recette. |
| Version R2 destinée au client | En attente de validation et de l'export filtré chiffré. |
