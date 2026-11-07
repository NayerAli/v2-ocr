#!/usr/bin/env bash
# Migration complète en une commande : base de données puis fichiers.
# Usage :
#   1. Remplir .env.migration (modèle : .env.migration.example)
#   2. ./scripts/migration/tout-migrer.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env.migration ] || { echo "Fichier .env.migration introuvable (copie .env.migration.example)."; exit 1; }
set -a; source .env.migration; set +a

./scripts/migration/migrer-base.sh
[ -d node_modules/@supabase/supabase-js ] || npm install --no-audit --no-fund
node scripts/migration/migrer-fichiers.mjs
echo "Migration terminée. Vérifie dans le dashboard Supabase du client."
