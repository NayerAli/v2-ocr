# Transfert hors ligne vers le PC Windows deja initialise

Branche : `claude/local-deployment-db-migration-eb3dut`.

## Sur le PC qui peut acceder au serveur Supabase

Docker Desktop doit etre installe. Ouvrir PowerShell et coller :

```powershell
irm https://raw.githubusercontent.com/NayerAli/v2-ocr/claude/local-deployment-db-migration-eb3dut/exporter-migration.ps1 | iex
```

L'assistant demande l'adresse Supabase et la cle service_role. Il liste ensuite les
comptes du serveur : on tape leurs numeros (ex. `1,3`), et seuls ces comptes partent
dans le ZIP, avec leurs lignes liees, leurs fichiers Storage et leurs cles OCR. Les
comptes non choisis, les cles systeme et les lignes sans compte ne sont pas exportes
(sauf confirmation explicite). Le serveur n'est lu que par l'API (port 8000).

L'adresse et la cle `service_role` peuvent etre memorisees sur ce PC pour les relances
(fichier `%LOCALAPPDATA%\OCR-export\identifiants.clixml`, chiffre pour votre compte Windows,
jamais inclus dans le ZIP). Elles sont supprimees a la fin du ZIP, sauf refus explicite. Eviter toute utilisation
de l'application source pendant l'export : les lectures via l'API ne constituent
pas un instantane transactionnel global. Les changements de nombre de lignes ou
de liste de fichiers detectes interrompent l'export.

Le script prepare aussi les images Docker pour le destinataire, puis depose
`supabase_migration.zip` sur le Bureau. La premiere preparation peut etre longue
et le ZIP peut peser plusieurs Go. Prevoir de l'espace pour le kit, les images et
le ZIP. Envoyer le ZIP complet par un canal prive (par exemple WeTransfer).
Il contient les donnees personnelles et les empreintes des mots de passe des comptes.
Les identifiants de connexion au serveur source ne sont pas inclus.

## Sur le PC destinataire

Enregistrer le ZIP sous le nom exact `supabase_migration.zip` dans Telechargements.
Ouvrir PowerShell et coller cette unique ligne :

```powershell
$z=Join-Path $env:USERPROFILE 'Downloads\supabase_migration.zip'; $d=Join-Path $env:TEMP ('ocr-import-'+[guid]::NewGuid()); Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($z,$d); powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $d 'importer-migration.ps1')
```

Cette commande ne telecharge rien. Elle utilise Docker Desktop deja installe,
retrouve le dossier OCR memorise par l'installation et verifie chaque fichier.
Les configurations Docker source et cible doivent correspondre. Les images sont
chargees depuis le ZIP ; aucun acces au serveur Supabase ni a GitHub n'est requis.

L'import remplace les donnees locales : comptes utilisateurs et identites,
structure et donnees du schema public, buckets et documents Storage. Les secrets
de l'installation locale sont conserves. Les schemas supplementaires, tables
partitionnees et tables etrangeres font echouer l'export explicitement ; ce kit
n'est pas un export complet de toutes les bases PostgreSQL du serveur.

Avant modification, les services locaux sont arretes et les trois volumes Docker
(base, configuration PostgreSQL, fichiers) sont sauvegardes dans
`OCR\sauvegardes\avant-import-...`. En cas d'echec, ces volumes et les marqueurs de
migration sont restaures automatiquement. Si la restauration elle-meme echoue
(Docker arrete, disque plein), conserver ce dossier et son fichier
`restauration.json` pour recuperation. Ne pas supprimer les volumes Docker.

Apres controle des nombres de comptes, lignes et fichiers, l'application est
demarree et sa page ouverte. Les anciennes sauvegardes restent disponibles.
Le script peut etre relance avec le meme ZIP ; il remplace a nouveau les donnees
et cree une nouvelle sauvegarde.

## Export filtre par compte

Le conteneur de l'export est jetable (`--rm`) et ne parle qu'a l'API du serveur (port 8000) ; le port
PostgreSQL n'est pas utilise. L'export calcule les lignes liees (cles etrangeres) et les fichiers
Storage de chaque compte choisi, puis ecrit une archive `ocr-offline-1`. Les buckets Storage sont
toujours inclus. Les lignes sans compte ni fichier ne sont exportees qu'apres confirmation, et les
cles OCR hors compte demandent une confirmation explicite. Un controle refuse l'archive si une donnee
d'un compte non choisi s'y trouve.

Le rapport (`rapport-filtrage.txt`, dans `%LOCALAPPDATA%\OCR-export\export-filtre`) contient des
adresses e-mail : il n'est pas inclus dans le ZIP, ne pas le diffuser.

Un export sans filtre fait par une ancienne version est mis de cote et n'est jamais transmis.

## Verification du code

`node --test local/assistant/archive.test.mjs` teste la relecture hors ligne,
la preservation binaire des fichiers, le rejet des elements absents/corrompus
et l'absence de manifeste de succes apres un export interrompu.
Un essai complet sur une installation Docker de test reste necessaire avant
de considerer validee la restauration des volumes sur une machine donnee.
