#!/usr/bin/env bash
# Fabrique le zip à envoyer au client (code de l'app + installateur Windows).
# Le zip ne contient aucune clé ni mot de passe : l'installateur génère les
# siens sur le PC du client et demande au client sa clé service_role.
#
# Usage : ./scripts/preparer-livraison.sh   ->  ocr-client.zip
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Attention : des modifications non commitées ne seront PAS dans le zip."
fi

rm -f ocr-client.zip
git archive --format=zip --prefix=ocr-client/ -o ocr-client.zip HEAD

echo "Prêt : ocr-client.zip ($(du -h ocr-client.zip | cut -f1))"
echo "Envoie-le au client avec INSTALLATION-CLIENT.md (aussi inclus dans le zip)."
