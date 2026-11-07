@echo off
cd /d "%~dp0"
echo  Arret de l'application OCR...
docker compose -f local\docker-compose.yml stop
echo  Application arretee. Vos donnees sont conservees.
pause
