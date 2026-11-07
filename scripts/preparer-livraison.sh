#!/usr/bin/env bash
# Fabrique en une commande le zip à envoyer au client :
# code de l'app + .env.local déjà rempli avec les clés du projet Supabase du client.
#
# Usage :
#   1. Remplir .env.client (modèle : .env.client.example)
#   2. ./scripts/preparer-livraison.sh
#   3. Envoyer ocr-client.zip au client (canal sûr : il contient la clé service_role)
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="${1:-.env.client}"
SORTIE="ocr-client.zip"

[ -f "$SOURCE" ] || { echo "Fichier $SOURCE introuvable (copie .env.client.example)."; exit 1; }

for cle in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  valeur=$(grep -E "^${cle}=" "$SOURCE" | cut -d= -f2- || true)
  if [ -z "$valeur" ] || [[ "$valeur" == your_* ]]; then
    echo "La valeur $cle est vide dans $SOURCE."; exit 1
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "Attention : des modifications non commitées ne seront PAS dans le zip."
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$SOURCE" "$tmp/.env.local"

rm -f "$SORTIE"
git archive --format=zip --prefix=ocr-client/ --add-file="$tmp/.env.local" -o "$SORTIE" HEAD

echo "Prêt : $SORTIE ($(du -h "$SORTIE" | cut -f1))"
echo "Le client dézippe, puis double-clique sur Demarrer-OCR (.bat sous Windows, .command sous Mac)."
