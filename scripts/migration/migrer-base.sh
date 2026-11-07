#!/usr/bin/env bash
# Copie la base Postgres de l'ancien Supabase (auto-hébergé) vers le nouveau
# projet Supabase du client : rôles, structure (tables, RLS, fonctions,
# triggers) et données (y compris les comptes utilisateurs et leurs mots de passe).
#
# Prérequis : Supabase CLI + Docker (pour "supabase db dump") et psql.
#
# Usage :
#   export ANCIENNE_DB_URL="postgresql://postgres:MOT_DE_PASSE@IP_SERVEUR:5432/postgres"
#   export NOUVELLE_DB_URL="postgresql://postgres.REF:MOT_DE_PASSE@aws-0-REGION.pooler.supabase.com:5432/postgres"
#   ./scripts/migration/migrer-base.sh
set -euo pipefail

: "${ANCIENNE_DB_URL:?Définir ANCIENNE_DB_URL}"
: "${NOUVELLE_DB_URL:?Définir NOUVELLE_DB_URL}"

DIR="${DUMP_DIR:-./migration-dump}"
mkdir -p "$DIR"

echo "1/4  Export des rôles..."
supabase db dump --db-url "$ANCIENNE_DB_URL" -f "$DIR/roles.sql" --role-only

echo "2/4  Export de la structure..."
supabase db dump --db-url "$ANCIENNE_DB_URL" -f "$DIR/schema.sql"

echo "3/4  Export des données..."
supabase db dump --db-url "$ANCIENNE_DB_URL" -f "$DIR/data.sql" --use-copy --data-only

echo "4/4  Import dans le nouveau projet..."
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$DIR/roles.sql" \
  --file "$DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$DIR/data.sql" \
  --dbname "$NOUVELLE_DB_URL"

echo "Base migrée. Lance maintenant : node scripts/migration/migrer-fichiers.mjs"
