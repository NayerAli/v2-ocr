@echo off
cd /d "%~dp0"
title Installation de l'application OCR
echo.
echo  ==========================================================
echo     Installation de l'application OCR
echo  ==========================================================
echo.
docker info >nul 2>&1
if errorlevel 1 goto pas_docker

if not exist "local\.env" (
  echo  Preparation de la configuration...
  docker run --rm -v "%cd%:/projet" -w /projet/local/assistant node:20-alpine node assistant.mjs init
  if errorlevel 1 goto erreur
)

echo.
rem Base deja demarree (installation reprise) : on ne refait rien.
docker compose -f local\docker-compose.yml ps --services --status running 2>nul | findstr /x "kong" >nul
if not errorlevel 1 (
  echo  Etape 1/3 : la base de donnees tourne deja, rien a refaire.
  goto etape2
)
echo  Etape 1/3 : demarrage de la base de donnees.
echo  La premiere fois, le telechargement peut prendre 10 a 20 minutes.
echo  Ne fermez pas cette fenetre.
echo.
docker compose -f local\docker-compose.yml up -d --wait db auth rest storage meta studio kong
if errorlevel 1 goto erreur

:etape2

if not exist "local\.migration-ok" (
  echo.
  echo  Etape 2/3 : recuperation de vos donnees depuis le serveur actuel.
  docker compose -f local\docker-compose.yml run --rm assistant
  if errorlevel 1 goto erreur
)

echo.
echo  Etape 3/3 : construction de l'application (5 a 10 minutes la premiere fois).
echo.
docker compose -f local\docker-compose.yml up -d --build --remove-orphans app
if errorlevel 1 goto erreur

echo.
echo  ==========================================================
echo     Installation terminee !
echo  ==========================================================
echo.
echo  Application :  http://localhost:3000
echo  Vos acces sont notes dans le fichier MES-ACCES.txt de ce dossier.
echo.
timeout /t 5 >nul
start "" http://localhost:3000
start "" notepad "MES-ACCES.txt"
pause
exit /b 0

:pas_docker
echo  [!] Docker Desktop n'est pas lance.
echo      Ouvrez Docker Desktop, attendez que la baleine soit immobile,
echo      puis recollez la commande d'installation.
pause
exit /b 1

:erreur
echo.
echo  [!] L'installation s'est arretee a cause d'une erreur.
echo      Recollez la commande d'installation : elle reprendra la ou elle s'est arretee.
echo      Si l'erreur revient, faites une capture de cette fenetre
echo      et envoyez-la a votre prestataire.
pause
exit /b 1
