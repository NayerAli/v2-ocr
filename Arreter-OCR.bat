@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo  Arret de l'application OCR...
docker compose --profile prod down
echo  Application arretee.
pause
