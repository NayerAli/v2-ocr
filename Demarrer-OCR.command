#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  Démarrage de l'application OCR..."
echo ""
if ! docker info >/dev/null 2>&1; then
  echo "  [!] Docker Desktop n'est pas lancé."
  echo "      Ouvrez Docker Desktop, attendez qu'il soit prêt, puis relancez ce fichier."
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer..."; exit 1
fi
if [ ! -f ".env.local" ]; then
  echo "  [!] Le fichier .env.local est introuvable dans ce dossier."
  echo "      Il vous a été envoyé par votre prestataire : placez-le ici."
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer..."; exit 1
fi
echo "  La première fois, cela peut prendre 5 à 10 minutes. Ne fermez pas cette fenêtre."
echo ""
if ! docker compose --profile prod up -d --build; then
  echo ""
  echo "  [!] Le démarrage a échoué. Faites une capture de cette fenêtre et envoyez-la."
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer..."; exit 1
fi
echo ""
echo "  C'est prêt ! Ouverture de http://localhost:3000"
sleep 5
open http://localhost:3000
echo "  Vous pouvez fermer cette fenêtre."
