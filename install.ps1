# Installation de l'application OCR sur Windows, en une commande.
# A coller dans PowerShell :
#   irm https://raw.githubusercontent.com/NayerAli/v2-ocr/claude/local-deployment-db-migration-eb3dut/install.ps1 | iex
#
# 1. Verifie Docker Desktop (et l'installe si besoin)
# 2. Telecharge l'application dans Documents\OCR (les donnees deja presentes sont gardees)
# 3. Cree un raccourci "Application OCR" sur le Bureau
# 4. Lance l'assistant d'installation (Installer-OCR.bat)

$ErrorActionPreference = 'Stop'
$Branche = 'claude/local-deployment-db-migration-eb3dut'
$Depot = 'NayerAli/v2-ocr'
$Dossier = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'OCR'

function Titre($t) { Write-Host ''; Write-Host "  $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  $t" -ForegroundColor Green }
function Erreur($t) { Write-Host "  $t" -ForegroundColor Red }
function Fin($code) {
  Write-Host ''
  Read-Host '  Appuyez sur Entree pour fermer'
  exit $code
}

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host '     Installation de l''application OCR' -ForegroundColor Cyan
Write-Host '  ==========================================================' -ForegroundColor Cyan

# --- 1. Docker Desktop -------------------------------------------------------
Titre 'Etape 1 : Docker Desktop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host '  Docker Desktop n''est pas installe. Installation en cours...'
  Write-Host '  (Windows peut vous demander une autorisation : cliquez sur Oui.)'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Erreur 'Installation automatique impossible sur cet ordinateur.'
    Write-Host '  Installez Docker Desktop vous-meme : https://www.docker.com/products/docker-desktop/'
    Write-Host '  Puis redemarrez l''ordinateur et collez a nouveau la meme commande.'
    Start-Process 'https://www.docker.com/products/docker-desktop/'
    Fin 1
  }
  winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Erreur 'L''installation de Docker Desktop a echoue.'
    Write-Host '  Installez-le vous-meme : https://www.docker.com/products/docker-desktop/'
    Fin 1
  }
  Ok 'Docker Desktop est installe.'
  Write-Host ''
  Write-Host '  Il reste 3 choses a faire :' -ForegroundColor Yellow
  Write-Host '   1. Redemarrez l''ordinateur.'
  Write-Host '   2. Ouvrez Docker Desktop (menu Demarrer) et acceptez les conditions'
  Write-Host '      ("Accept"). Vous pouvez passer la creation de compte ("Skip").'
  Write-Host '   3. Collez a nouveau la meme commande dans PowerShell.'
  Fin 0
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host '  Demarrage de Docker Desktop (jusqu''a 3 minutes)...'
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) { Start-Process $exe }
  $limite = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 5
    docker info *> $null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $limite)
  if ($LASTEXITCODE -ne 0) {
    Erreur 'Docker Desktop ne repond pas.'
    Write-Host '  Ouvrez Docker Desktop, acceptez les conditions si elles s''affichent,'
    Write-Host '  attendez que la baleine soit immobile, puis collez a nouveau la commande.'
    Fin 1
  }
}
Ok 'Docker Desktop fonctionne.'

# --- 2. Telechargement de l'application --------------------------------------
Titre "Etape 2 : telechargement de l'application dans $Dossier"
$tmp = Join-Path $env:TEMP ('ocr-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $zip = Join-Path $tmp 'ocr.zip'
  Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Depot/zip/refs/heads/$Branche" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $source = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
  # Les fichiers generes sur ce PC (mots de passe, donnees) ne sont pas dans le
  # telechargement : ils sont conserves.
  Copy-Item -Path (Join-Path $source.FullName '*') -Destination $Dossier -Recurse -Force
} catch {
  Erreur "Le telechargement a echoue : $($_.Exception.Message)"
  Write-Host '  Verifiez votre connexion Internet puis collez a nouveau la commande.'
  Fin 1
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Ok 'Application telechargee.'

# --- 3. Raccourcis sur le Bureau ---------------------------------------------
try {
  $bureau = [Environment]::GetFolderPath('Desktop')
  $shell = New-Object -ComObject WScript.Shell
  $r = $shell.CreateShortcut((Join-Path $bureau 'Application OCR.lnk'))
  $r.TargetPath = Join-Path $Dossier 'Demarrer-OCR.bat'
  $r.WorkingDirectory = $Dossier
  $r.Save()
  $r = $shell.CreateShortcut((Join-Path $bureau 'Dossier OCR.lnk'))
  $r.TargetPath = $Dossier
  $r.Save()
} catch { }

# --- 4. Assistant -------------------------------------------------------------
Titre 'Etape 3 : installation et recuperation de vos donnees'
Set-Location $Dossier
& cmd.exe /c "`"$Dossier\Installer-OCR.bat`""
