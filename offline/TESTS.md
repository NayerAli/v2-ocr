# Contrôles du parcours Windows simplifié

14 novembre 2026. Cette révision ajoute le préparateur Windows en une commande et le canal réutilisable. À la demande du propriétaire, **aucun test de migration réelle ni de fonctionnement Docker complet n'a été relancé pour cette révision**.

| Contrôle exécuté | Résultat |
| --- | --- |
| Tests Node : archives, chiffrement, transport, préparateur et filtrage | 11 réussis sous Linux, dont génération complète d'un petit paquet synthétique, manifeste signé, scripts Windows embarqués et reprise avec un préparateur corrigé conservant le même export chiffré |
| Tests Python du préparateur existant | 2 réussis |
| Scripts PowerShell | Syntaxe analysée avec PowerShell 7.5.4 sous Linux ; tests exécutés d'isolation de l'environnement enfant, arrêt sur code non nul et arrêt d'un processus dépassant sa limite |
| Signature des requêtes R2 | Signature du code Node identique à celle de l'implémentation AWS botocore 1.35.99 pour la même requête fixe, avec identifiants fictifs ; aucun accès S3 réel dans ce test |
| Reprise du téléchargement PowerShell | Coupure réelle d'une réponse HTTPS locale à 400 000 octets, reprise Range et reconstruction depuis le cache sans nouvelle requête |
| Vérification du diff et syntaxe JavaScript | `git diff --check` et `node --check` réussis |
| Filtrage | Tests des prédicats excluant les tables partagées et de la détection des clés OCR des comptes ; pas de validation sur la base de production |
| Windows PowerShell 5.1 | Contrôles réussis dans le [run 43582168425](https://github.com/NayerAli/v2-ocr/actions/runs/43582168425), sous Windows PowerShell 5.1. Les tests Docker complets de ce run sont explicitement ignorés |

Les essais avec données synthétiques ne démontrent pas la restauration du compte réel. Restent à exécuter par le propriétaire : export réel filtré, compilation du paquet depuis son PC, publication S3 avec ses droits, installation Windows avec Docker Desktop, comparaison des comptes/documents, redémarrage, mise à jour et restauration après échec. Les limites de temps sont volontairement courtes ; une compilation silencieuse ou un disque particulièrement lent peut déclencher un arrêt et nécessiter un diagnostic.

Les résultats Docker ci-dessous sont **historiques** et concernent le code antérieur à ce nouveau préparateur.

## Vérifications historiques

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
| Téléchargeur PowerShell exécuté avec un serveur HTTPS local | Connexion interrompue à 400 000 octets, reprise effective via Range et reconstruction depuis le cache sans nouvelle requête. PowerShell 7.5 sous Linux. Rejouer avec `python3 offline/tests/powershell-resume.py`. |
| Requêtes HTTPS vers le Worker déployé | HTTP 200 sur l'objet, 206 sur la reprise à l'octet 7, 416 sur une plage hors limites |
| Construction, empaquetage et chargement Docker | Réussis dans [la première CI Linux](https://github.com/NayerAli/v2-ocr/actions/runs/43557187550). Le test s'est arrêté avant le démarrage des services, car les secrets créés dans le conteneur Linux appartenaient à root. Le test lance maintenant l'initialisation avec l'UID de l'opérateur. |
| Démarrage Docker et persistance | [CI Linux réussie](https://github.com/NayerAli/v2-ocr/actions/runs/43558494886). Démarrage avec `--no-build --pull never`, page de connexion, authentification Supabase et lecture du même fichier après arrêt et redémarrage des conteneurs. La connexion externe du runner n'a pas été bloquée. |
| Audit des dépendances applicatives héritées | `npm audit --omit=dev` a signalé 15 entrées, dont une critique agrégée pour Next.js 14.2.17. Les versions applicatives de référence sont conservées sur cette branche. |
| Paquet d’images précompilées de recette | [Artefact GitHub Actions](https://github.com/NayerAli/v2-ocr/actions/runs/43558494886/artifacts/14100145420), 1 622 610 794 octets. Signature et URL de test, sans données client. |
| Exécution Windows, prérequis, WSL2 et reprise après redémarrage | À exécuter sur une VM Windows avec Docker Desktop. |
| Export source, restauration réelle des comptes et documents, mise à jour et restauration après échec | À exécuter avec une archive autorisée dans la VM de recette. |
| Version R2 destinée au client | En attente de validation et de l'export filtré chiffré. |
