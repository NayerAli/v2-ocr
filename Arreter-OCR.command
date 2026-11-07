#!/bin/bash
cd "$(dirname "$0")"
echo "  Arrêt de l'application OCR..."
docker compose --profile prod down
echo "  Application arrêtée. Vous pouvez fermer cette fenêtre."
