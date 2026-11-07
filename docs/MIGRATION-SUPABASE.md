# Livrer l'app au client : migration Supabase + installation locale

Guide pour le développeur. Le client, lui, ne suit que `INSTALLATION-CLIENT.md`.

## Contexte

- Aujourd'hui : l'app (Docker) et Supabase **auto-hébergé** tournent sur ton serveur.
- Cible : l'app tourne sur l'ordinateur du client (Docker Desktop) et utilise
  **le projet Supabase du client** (supabase.com).
- Le dépôt ne contient **aucun script SQL** de création de la base (le README en parle
  mais il n'existe pas). On copie donc tout depuis ta base actuelle.

Ce qui doit être copié :

| Élément | Où | Comment |
|---|---|---|
| Tables `documents`, `ocr_results`, `user_settings`, `user_profiles`, `system_settings`, `system_metadata`, `metadata`, `thumbnails`… | Postgres `public` | `migrer-base.sh` |
| Politiques RLS, fonctions (`get_current_user_file_size`, `get_current_user_ocr_size`, `update_settings_direct`), triggers | Postgres | `migrer-base.sh` |
| Comptes utilisateurs + mots de passe (hachés) | Postgres `auth` | `migrer-base.sh` |
| Fichiers (bucket `ocr-documents`) | Storage | `migrer-fichiers.mjs` |
| Clés API OCR | table `system_settings` / `user_settings` | incluses dans la base |

## 0. Ce que tu demandes au client (le plus simple pour lui)

Le plus simple : qu'il **t'invite dans son organisation Supabase**
(Dashboard, Organization settings, Team, Invite, rôle *Developer* ou *Owner*).
Tu fais ensuite tout toi-même.

Sinon, il t'envoie (de façon sécurisée, pas par e-mail en clair) :
- Project Settings, API : **Project URL**, clé **anon / publishable**, clé **service_role / secret**.
- Le **mot de passe de la base** (Project Settings, Database ; il peut le réinitialiser).

## 1. Migrer la base

Prérequis sur ta machine ou ton serveur : [Supabase CLI](https://supabase.com/docs/guides/cli), Docker, `psql`.

```bash
# Ancienne base (ton Supabase auto-hébergé). Depuis le serveur lui-même :
#   - via Supavisor : postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@localhost:5432/postgres
#   - ou directement le conteneur "supabase-db" si son port est exposé.
export ANCIENNE_DB_URL="postgresql://postgres.xxx:MOTDEPASSE@localhost:5432/postgres"

# Nouvelle base : bouton "Connect" du projet du client, chaîne "Session pooler"
# (la connexion directe est en IPv6 uniquement, le pooler marche partout).
export NOUVELLE_DB_URL="postgresql://postgres.REF:MOTDEPASSE@aws-0-REGION.pooler.supabase.com:5432/postgres"

./scripts/migration/migrer-base.sh
```

Le script exporte les rôles, la structure puis les données dans `./migration-dump/`,
puis importe le tout dans une seule transaction : en cas d'erreur, rien n'est modifié
côté client et tu peux corriger puis relancer.

> `migration-dump/data.sql` contient les données des utilisateurs : supprime ce dossier
> une fois la migration validée.

## 2. Migrer les fichiers

À lancer depuis la racine du projet (après `npm install`) :

```bash
ANCIEN_SUPABASE_URL="https://ton-supabase.exemple.com" \
ANCIENNE_SERVICE_KEY="service_role de l'ancien" \
NOUVEAU_SUPABASE_URL="https://REF.supabase.co" \
NOUVELLE_SERVICE_KEY="service_role du client" \
node scripts/migration/migrer-fichiers.mjs
```

Le script parcourt tous les buckets, les crée si besoin, et copie chaque fichier
(en écrasant s'il existe déjà). On peut le relancer sans risque.

## 3. Vérifier dans le dashboard du client

- **Table Editor** : même nombre de lignes dans `documents` et `ocr_results` qu'avant.
- **Storage** : le bucket `ocr-documents` contient les fichiers.
- **Authentication, Users** : les comptes sont là.
- **Authentication, URL Configuration** : *Site URL* = `http://localhost:3000`.

Les utilisateurs devront se reconnecter une fois (nouveau projet = nouvelles sessions),
avec **le même mot de passe**.

## 4. Préparer le paquet pour le client

1. Crée `.env.local` avec les valeurs **du projet du client** :

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NODE_ENV=production
   ```

2. Teste chez toi : `docker compose --profile prod up -d --build`, puis http://localhost:3000.
   Connecte-toi, ouvre un document existant, lance un OCR.

3. Fabrique le zip (le code + ton `.env.local`) :

   ```bash
   git archive --format=zip --prefix=ocr-client/ -o ocr-client.zip HEAD
   mkdir -p /tmp/z/ocr-client && cp .env.local /tmp/z/ocr-client/
   (cd /tmp/z && zip -r "$OLDPWD/ocr-client.zip" ocr-client/.env.local)
   ```

4. Envoie `ocr-client.zip` + `INSTALLATION-CLIENT.md` (ou sa version PDF).
   Le zip contient la clé `service_role` : envoie-le par un canal sûr.

Les variables `NEXT_PUBLIC_*` sont intégrées au moment de la compilation : c'est pour
ça que le client compile l'image chez lui (le script `Demarrer-OCR` le fait). Ton image
Docker Hub actuelle pointe vers ton serveur et ne peut pas être réutilisée telle quelle.

## 5. Après la bascule

- Garde ton serveur allumé tant que le client n'a pas validé, puis arrête-le
  (sinon des documents ajoutés sur l'ancien ne seront pas sur le nouveau).
- Vérifie que l'image Docker Hub `rehanalimahomed/inoor-ocr` est **privée** :
  `.dockerignore` n'exclut pas `.env.local`, donc si ce fichier est présent au moment
  du build, tes clés (dont `service_role`) sont dans l'image.
- Pour remplacer le « script SQL fourni » absent du README, tu peux commiter
  `migration-dump/schema.sql` (structure seule, sans données) sous `supabase/schema.sql`.

## Mettre à jour l'app chez le client plus tard

Envoie un nouveau zip du code (en gardant son `.env.local`) ; il remplace le dossier
et relance `Demarrer-OCR`, qui recompile automatiquement.
