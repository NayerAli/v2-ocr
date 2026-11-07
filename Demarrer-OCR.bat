@echo off
chcp 65001 >nul
cd /d "%~dp0"
title OCR - Demarrage
echo.
echo  Demarrage de l'application OCR...
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo  [!] Docker Desktop n'est pas lance.
  echo      Ouvrez Docker Desktop, attendez qu'il soit pret, puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist ".env.local" (
  echo  [!] Le fichier .env.local est introuvable dans ce dossier.
  echo      Il vous a ete envoye par votre prestataire : placez-le ici.
  pause
  exit /b 1
)
echo  La premiere fois, cela peut prendre 5 a 10 minutes. Ne fermez pas cette fenetre.
echo.
docker compose --profile prod up -d --build
if errorlevel 1 (
  echo.
  echo  [!] Le demarrage a echoue. Faites une capture de cette fenetre et envoyez-la.
  pause
  exit /b 1
)
echo.
echo  C'est pret ! Ouverture de http://localhost:3000
timeout /t 5 >nul
start "" http://localhost:3000
echo.
echo  Vous pouvez fermer cette fenetre.
pause
