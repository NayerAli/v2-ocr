# Rapport d'exécution

14 novembre 2026, environnement Linux de travail.

| Vérification | Résultat |
| --- | --- |
| Tests Python de segmentation, reconstruction et signature RSA | 2 réussis |
| Tests Node de chiffrement, corruption et plages HTTP du Worker | 2 réussis |
| Tests Node du moteur d'archive existant avec source simulée | 2 réussis |
| Analyse syntaxique JavaScript, compilation Python, lecture YAML et analyse Bash | Exécutées avec succès |
| Création R2, déploiement du Worker et lecture d'un objet synthétique via l'API R2 | Réussis |
| Requêtes HTTPS vers le Worker déployé | HTTP 200 sur l'objet, 206 sur la reprise à l'octet 7, 416 sur une plage hors limites |
| Construction réelle des images et essai Docker | En attente de la CI Linux. Aucun démon Docker accessible dans l'environnement de travail. |
| Exécution Windows, prérequis, WSL2 et reprise après redémarrage | À exécuter sur une VM Windows avec Docker Desktop. |
| Export source, restauration réelle des comptes et documents, mise à jour et restauration après échec | À exécuter avec une archive autorisée dans la VM de recette. |
| Version R2 destinée au client | En attente de validation et de l'export filtré chiffré. |
