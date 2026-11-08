# Installation de l'application OCR sur Windows, en une commande.
# A coller dans PowerShell :
#   irm https://raw.githubusercontent.com/NayerAli/v2-ocr/claude/local-deployment-db-migration-eb3dut/install.ps1 | iex
#
# 1. Verifie Docker Desktop (propose de l'installer si besoin, avec accord)
# 2. Si l'application est deja installee : la demarre simplement (et propose
#    une mise a jour seulement si une nouvelle version existe).
#    Si une installation a ete commencee : la reprend.
# 3. Sinon : demande le dossier, telecharge, propose des raccourcis
#    et lance l'assistant d'installation (Installer-OCR.bat).

$ErrorActionPreference = 'Stop'
$Branche = 'claude/local-deployment-db-migration-eb3dut'
$Depot = 'NayerAli/v2-ocr'
# Memorise le dossier choisi, pour le reproposer lors d'une mise a jour.
$Memoire = Join-Path $env:LOCALAPPDATA 'OCR-installation\dossier.txt'

function Titre($t) { Write-Host ''; Write-Host "  $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  $t" -ForegroundColor Green }
function Erreur($t) { Write-Host "  $t" -ForegroundColor Red }
function Fin($code) {
  Write-Host ''
  Read-Host '  Appuyez sur Entree pour fermer'
  exit $code
}
function OuiNon($question) {
  while ($true) {
    $r = (Read-Host "  $question (O/N)").Trim().ToLower()
    if ($r -in @('o', 'oui', 'y', 'yes')) { return $true }
    if ($r -in @('n', 'non', 'no')) { return $false }
    Write-Host '  Repondez O pour oui ou N pour non.'
  }
}

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host '     Installation de l''application OCR' -ForegroundColor Cyan
Write-Host '  ==========================================================' -ForegroundColor Cyan

# --- 1. Docker Desktop -------------------------------------------------------
Titre 'Etape 1 : Docker Desktop'
# Docker deja installe mais absent du PATH de cette fenetre : on le retrouve.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  foreach ($bin in @("$env:ProgramFiles\Docker\Docker\resources\bin", "$env:LOCALAPPDATA\Programs\Docker\Docker\resources\bin")) {
    if ($bin -and (Test-Path (Join-Path $bin 'docker.exe'))) { $env:Path = "$bin;$env:Path"; break }
  }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host '  L''application a besoin de Docker Desktop (logiciel gratuit),'
  Write-Host '  qui n''est pas installe sur cet ordinateur.'
  Write-Host '  Son installation prend environ 5 minutes et demande ensuite'
  Write-Host '  de redemarrer l''ordinateur.'
  Write-Host ''
  if (-not (OuiNon 'Voulez-vous installer Docker Desktop maintenant ?')) {
    Write-Host ''
    Write-Host '  D''accord, rien n''a ete installe.'
    Write-Host '  Vous pouvez aussi l''installer vous-meme depuis https://www.docker.com/products/docker-desktop/'
    Write-Host '  puis coller a nouveau la meme commande.'
    Fin 0
  }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Erreur 'Installation automatique impossible sur cet ordinateur.'
    Write-Host '  Installez Docker Desktop vous-meme (la page va s''ouvrir),'
    Write-Host '  redemarrez l''ordinateur, puis collez a nouveau la meme commande.'
    Start-Process 'https://www.docker.com/products/docker-desktop/'
    Fin 1
  }
  Write-Host '  Installation en cours... (Windows peut demander une autorisation : cliquez sur Oui.)'
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

# --- Outils ----------------------------------------------------------------------
# Dossier Documents de l'utilisateur (avec solutions de secours).
function DossierDocuments {
  $d = [Environment]::GetFolderPath('MyDocuments')
  if (-not $d) { $d = if ($env:USERPROFILE) { Join-Path $env:USERPROFILE 'Documents' } else { $HOME } }
  return $d
}

# Derniere version publiee (identifiant du commit), ou $null si GitHub ne repond pas.
function DerniereVersion {
  try {
    $r = Invoke-RestMethod -UseBasicParsing -TimeoutSec 15 -Headers @{ 'User-Agent' = 'ocr-installation' } `
      -Uri "https://api.github.com/repos/$Depot/commits/$Branche"
    return $r.sha
  } catch { return $null }
}

function VersionInstallee {
  $f = Join-Path $Dossier 'local\.version'
  if (Test-Path $f) { return (Get-Content $f -Raw).Trim() }
  return $null
}

# Telecharge l'application dans $Dossier. Les fichiers generes sur ce PC
# (mots de passe, donnees) ne sont pas dans le telechargement : ils sont conserves.
function Telecharger {
  Titre "Telechargement de l'application"
  $tmp = Join-Path $env:TEMP ('ocr-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $tmp 'ocr.zip'
    $ref = if ($Derniere) { $Derniere } else { "refs/heads/$Branche" }
    Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Depot/zip/$ref" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $source = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    Copy-Item -Path (Join-Path $source.FullName '*') -Destination $Dossier -Recurse -Force
    if ($Derniere) { Set-Content -Path (Join-Path $Dossier 'local\.version') -Value $Derniere }
  } catch {
    Erreur "Le telechargement a echoue : $($_.Exception.Message)"
    Write-Host '  Verifiez votre connexion Internet puis collez a nouveau la commande.'
    Fin 1
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
  Ok "Application telechargee dans $Dossier"
}

# Informations sur ce PC (reseau, VPN, IP...) pour le diagnostic en cas de probleme.
# Ecrites dans local\infos-pc.txt ; l'assistant les ajoute a son diagnostic.
function InfosPC {
  $l = New-Object System.Collections.Generic.List[string]
  function Ajouter($titre, $bloc) { try { $v = & $bloc | Out-String } catch { $v = "(indisponible : $($_.Exception.Message))" }; $l.Add("--- $titre"); $l.Add($v.Trim()) }
  $l.Add("Date (UTC)   : $((Get-Date).ToUniversalTime().ToString('s'))")
  $l.Add("PC           : $env:COMPUTERNAME   utilisateur : $env:USERNAME")
  Ajouter 'Windows' { (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture | Format-List | Out-String).Trim() }
  Ajouter 'IP publique vue par Cloudflare (depuis Windows)' {
    foreach ($u in @($script:AdresseServeur, 'https://www.cloudflare.com') | Where-Object { $_ }) {
      "[$u] " + (((Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "$u/cdn-cgi/trace").Content -split "`n" | Where-Object { $_ -match '^(ip|colo|loc|warp|gateway|http)=' }) -join ' ; ')
    }
  }
  Ajouter 'Cartes reseau actives (un VPN apparait ici)' { Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name, InterfaceDescription, LinkSpeed | Format-Table -AutoSize | Out-String -Width 200 }
  Ajouter 'Adresses IP locales' { Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object InterfaceAlias, IPAddress, PrefixLength | Format-Table -AutoSize | Out-String -Width 200 }
  Ajouter 'Route par defaut' { Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object InterfaceAlias, NextHop, RouteMetric | Format-Table -AutoSize | Out-String -Width 200 }
  Ajouter 'Serveurs DNS' { Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | Select-Object InterfaceAlias, ServerAddresses | Format-Table -AutoSize | Out-String -Width 200 }
  Ajouter 'Proxy Windows' { netsh winhttp show proxy }
  if ($script:AdresseServeur) {
    $h = ([uri]$script:AdresseServeur).Host
    Ajouter "Resolution DNS de $h" { Resolve-DnsName $h -Type A | Select-Object Name, IPAddress | Format-Table -AutoSize | Out-String }
    Ajouter "Test du serveur depuis Windows ($h)" {
      try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri "$($script:AdresseServeur)/auth/v1/health"; "HTTP $($r.StatusCode)" }
      catch {
        $rep = $_.Exception.Response
        if (-not $rep) { return "ECHEC : $($_.Exception.Message)" }
        # Windows PowerShell 5 et PowerShell 7 n'exposent pas les en-tetes de la meme facon
        $lire = { param($n) $v = $null; try { $v = $rep.Headers[$n] } catch { }; if (-not $v) { try { $v = ($rep.Headers.GetValues($n)) -join ',' } catch { } }; "$v" }
        "HTTP $([int]$rep.StatusCode) ; cf-ray=$(& $lire 'cf-ray') ; cf-mitigated=$(& $lire 'cf-mitigated') ; server=$(& $lire 'Server')"
      }
    }
  }
  Ajouter 'Docker' { docker version --format 'client {{.Client.Version}} / serveur {{.Server.Version}} ({{.Server.Os}})' }
  try { Set-Content -Path (Join-Path $Dossier 'local\infos-pc.txt') -Value ($l -join "`r`n") -Encoding UTF8 } catch { }
}

function LancerInstallation {
  Titre 'Installation et recuperation de vos donnees'
  $f = Join-Path $Dossier 'local\.adresse-serveur'
  $script:AdresseServeur = if (Test-Path $f) { (Get-Content $f -Raw).Trim() } else { $null }
  Write-Host '  Collecte des informations reseau de ce PC (pour le diagnostic)...'
  InfosPC
  Set-Location $Dossier
  & cmd.exe /c "`"$Dossier\Installer-OCR.bat`""
}

# Demarre une application deja installee et l'ouvre dans le navigateur.
function DemarrerApplication {
  Titre "Demarrage de l'application"
  docker compose -f (Join-Path $Dossier 'local\docker-compose.yml') up -d
  if ($LASTEXITCODE -ne 0) {
    Erreur 'Le demarrage a echoue. Faites une capture de cette fenetre et envoyez-la a votre prestataire.'
    Fin 1
  }
  Write-Host '  Ouverture de l''application (jusqu''a 1 minute)...'
  $limite = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $limite) {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri 'http://localhost:3000' | Out-Null; break } catch { Start-Sleep -Seconds 3 }
  }
  Start-Process 'http://localhost:3000'
  Ok 'L''application est ouverte dans votre navigateur : http://localhost:3000'
}

# --- 2. Installation deja presente ? ------------------------------------------------
$Dossier = $null
if (Test-Path $Memoire) {
  $p = (Get-Content $Memoire -Raw).Trim()
  if ($p -and (Test-Path (Join-Path $p 'Installer-OCR.bat'))) { $Dossier = $p }
}
if (-not $Dossier) {
  $p = Join-Path (DossierDocuments) 'OCR'
  if (Test-Path (Join-Path $p 'Installer-OCR.bat')) { $Dossier = $p }
}
$Derniere = DerniereVersion

if ($Dossier) {
  $installee = VersionInstallee
  $nouvelle = $Derniere -and ($Derniere -ne $installee)
  if (Test-Path (Join-Path $Dossier 'local\.migration-ok')) {
    Titre 'L''application est deja installee'
    Write-Host "  Dossier : $Dossier"
    if ($nouvelle -and (OuiNon 'Une nouvelle version est disponible. L''installer maintenant ?')) {
      Telecharger
      LancerInstallation
    } else {
      DemarrerApplication
      Fin 0
    }
  } else {
    Titre 'Reprise de l''installation'
    Write-Host "  Une installation commencee a ete trouvee dans $Dossier : elle reprend la ou elle s'etait arretee."
    if ($nouvelle -or -not $installee) { Telecharger }
    LancerInstallation
  }
  return
}

# --- 3. Premiere installation : choix du dossier ------------------------------------
Titre 'Dossier d''installation'
$propose = Join-Path (DossierDocuments) 'OCR'
Write-Host '  Dans quel dossier voulez-vous installer l''application ?'
Write-Host "  Appuyez simplement sur Entree pour choisir : $propose"
Write-Host '  Ou tapez (ou collez) un autre chemin, par exemple D:\Applications\OCR'

while ($true) {
  $saisie = (Read-Host '  Dossier').Trim().Trim('"').Trim("'")
  if (-not $saisie) { $saisie = $propose }
  $saisie = [Environment]::ExpandEnvironmentVariables($saisie)
  if (-not [IO.Path]::IsPathRooted($saisie)) {
    Write-Host '  Indiquez un chemin complet, qui commence par une lettre de disque (exemple : C:\OCR).'
    continue
  }
  $Dossier = [IO.Path]::GetFullPath($saisie)

  # Dossier deja rempli par autre chose : on installe dans un sous-dossier OCR.
  $dejaOcr = Test-Path (Join-Path $Dossier 'Installer-OCR.bat')
  $nonVide = (Test-Path $Dossier) -and (Get-ChildItem -Force $Dossier -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($nonVide -and -not $dejaOcr) {
    $Dossier = Join-Path $Dossier 'OCR'
    Write-Host "  Ce dossier contient deja d'autres fichiers : l'application ira dans $Dossier"
  }

  try {
    New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
    $test = Join-Path $Dossier 'test-ecriture.tmp'
    Set-Content -Path $test -Value 'ok' -Force
    Remove-Item $test -Force
  } catch {
    Erreur "Impossible d'ecrire dans ce dossier : $($_.Exception.Message)"
    Write-Host '  Choisissez un autre dossier.'
    continue
  }

  if (OuiNon "Installer l'application dans $Dossier ?") { break }
}
New-Item -ItemType Directory -Force -Path (Split-Path $Memoire) | Out-Null
Set-Content -Path $Memoire -Value $Dossier

Telecharger

# --- 4. Raccourcis sur le Bureau ---------------------------------------------
Titre 'Raccourcis'
if (OuiNon 'Voulez-vous un raccourci "Application OCR" (et "Dossier OCR") sur le Bureau ?') {
  try {
    $bureau = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    # Lien vers l'application dans le navigateur
    $r = $shell.CreateShortcut((Join-Path $bureau 'Application OCR.url'))
    $r.TargetPath = 'http://localhost:3000'
    $r.Save()
    $r = $shell.CreateShortcut((Join-Path $bureau 'Dossier OCR.lnk'))
    $r.TargetPath = $Dossier
    $r.Save()
    Ok 'Raccourcis crees sur le Bureau.'
  } catch {
    Erreur 'Les raccourcis n''ont pas pu etre crees (ce n''est pas grave).'
  }
} else {
  Write-Host "  Pas de raccourci. L'application sera dans : $Dossier"
}

LancerInstallation
