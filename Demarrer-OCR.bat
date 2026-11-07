@echo off
cd /d "%~dp0"
title Application OCR
docker info >nul 2>&1
if errorlevel 1 (
  echo  [!] Docker Desktop n'est pas lance. Ouvrez-le puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist "local\.migration-ok" (
  echo  [!] L'application n'est pas encore installee : lancez d'abord Installer-OCR.
  pause
  exit /b 1
)
echo  Demarrage de l'application OCR...
docker compose -f local\docker-compose.yml up -d
if errorlevel 1 (
  echo  [!] Le demarrage a echoue. Faites une capture de cette fenetre et envoyez-la.
  pause
  exit /b 1
)
timeout /t 5 >nul
start "" http://localhost:3000
