$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# Reprise de exporter-migration.ps1 a partir de l'archive filtree deja exportee et verifiee.
# Aucune question posee : ni selection des comptes, ni cle, ni suppression des identifiants.
function DockerOk { & docker @args; if ($LASTEXITCODE -ne 0) { throw "Docker a echoue : $($args[0])" } }
function TestDocker { $ErrorActionPreference = 'Continue'; & docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $env:Path = "$env:ProgramFiles\Docker\Docker\resources\bin;$env:Path"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop doit etre installe sur ce PC pour reprendre l export.' }
if (-not (TestDocker)) {
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
  $deadline = (Get-Date).AddMinutes(3)
  do { Start-Sleep 3; $ready = TestDocker } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw 'Ouvrez Docker Desktop et acceptez ses conditions, puis relancez cette commande.' }
}

$work = Join-Path $env:LOCALAPPDATA 'OCR-export'
if (-not (Test-Path -LiteralPath $work)) { throw 'Aucun export en cours sur ce PC. Lancez d abord exporter-migration.ps1.' }
$kit = Join-Path $work 'kit'
$exportDir = Join-Path $work 'export-filtre'
$payload = Join-Path $kit 'payload'
$branch = 'claude/local-deployment-db-migration-eb3dut'
New-Item -ItemType Directory "$kit\local" -Force | Out-Null

# Archive filtree : manifest.json present ET propriete "filtre" (il n'est ecrit qu'apres controle reussi).
function EstArchiveFiltree([string]$dossier) {
  $m = Join-Path $dossier 'manifest.json'
  if (-not (Test-Path -LiteralPath $m)) { return $false }
  try { return ((Get-Content -LiteralPath $m -Raw | ConvertFrom-Json).PSObject.Properties.Name -contains 'filtre') } catch { return $false }
}
# Ce qui reste a sa place est mis de cote, jamais supprime ni transmis.
function MettreDeCote([string]$dossier, [string]$nom) {
  $ecarte = Join-Path $work ($nom + '-ecarte-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Move-Item -LiteralPath $dossier -Destination $ecarte
  Write-Host "Contenu precedent mis de cote (non transmis) : $ecarte" -ForegroundColor Yellow
}

# 1. Trouver l'archive filtree deja verifiee.
if (EstArchiveFiltree $payload) {
  Write-Host 'Archive filtree deja prete dans le kit : rien a deplacer.'
} elseif (EstArchiveFiltree (Join-Path $exportDir 'payload')) {
  if (Test-Path -LiteralPath $payload) { MettreDeCote $payload 'payload' }
  Move-Item -LiteralPath (Join-Path $exportDir 'payload') -Destination $payload
} else {
  throw 'Aucune archive filtree verifiee a reprendre. Relancez exporter-migration.ps1.'
}
$manifest = Get-Content -LiteralPath (Join-Path $payload 'manifest.json') -Raw | ConvertFrom-Json
$nbComptes = $manifest.filtre.comptes
$nbFichiers = @($manifest.files.PSObject.Properties).Count
Write-Host "Archive verifiee trouvee : $nbComptes compte(s), $nbFichiers fichier(s) (export du $($manifest.created))" -ForegroundColor Cyan

# 2. Code de la branche (pour le kit), comme exporter-migration.ps1.
Write-Host 'Telechargement du code de la branche (pour le kit)...'
$head = Invoke-RestMethod "https://api.github.com/repos/NayerAli/v2-ocr/commits/$branch" -Headers @{'User-Agent'='ocr-offline'}
Remove-Item "$work\source" -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/NayerAli/v2-ocr/zip/$($head.sha)" -OutFile "$work\source.zip"
Expand-Archive "$work\source.zip" "$work\source" -Force
$source = (Get-ChildItem "$work\source" -Directory | Select-Object -First 1).FullName
$ancienAssistant = Join-Path $kit 'local\assistant\export-filtre.mjs'
$nouvelAssistant = Join-Path $source 'local\assistant\export-filtre.mjs'
if ((Test-Path -LiteralPath $ancienAssistant) -and (Test-Path -LiteralPath $nouvelAssistant) -and ((Get-FileHash -LiteralPath $ancienAssistant).Hash -ne (Get-FileHash -LiteralPath $nouvelAssistant).Hash)) {
  Write-Host "Attention : l assistant de la branche differe de celui qui a produit l archive. Verifiez le resultat avant de transmettre." -ForegroundColor Yellow
}
Remove-Item "$kit\local\assistant" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$source\local\assistant" "$kit\local\assistant" -Recurse
Copy-Item "$source\local\docker-compose.yml" "$kit\compose-reference.yml" -Force
Copy-Item "$source\importer-migration.ps1" "$kit\importer-migration.ps1" -Force
Remove-Item -LiteralPath "$kit\local\.adresse-serveur" -Force -ErrorAction SilentlyContinue

# 3. Images des services uniquement (pas d'image applicative : elle se construit chez le client).
Write-Host 'Preparation des images des services (plusieurs minutes)...'
DockerOk pull node:20-alpine
$images = @('node:20-alpine')
foreach ($line in Get-Content "$source\local\docker-compose.yml") {
  if ($line -match '^\s+image:\s*(\S+)\s*$') { $images += $Matches[1] }
}
$images = @($images | Select-Object -Unique)
foreach ($image in $images) { DockerOk pull $image }
DockerOk save -o "$kit\images.tar" @images

# Garde-fou : aucune configuration secrete (.env, .env.local...) ne doit partir chez le client.
if (Get-ChildItem -LiteralPath $kit -Recurse -File | Where-Object { $_.Name -match '^\.env(\..+)?$' }) { throw 'Fichier .env detecte dans le kit : reprise annulee.' }

# 4. Empreintes et kit.json.
$files = @{}
foreach ($file in Get-ChildItem $kit -Recurse -File) {
  $relative = $file.FullName.Substring($kit.Length + 1).Replace('\','/')
  $files[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
}
@{format='ocr-kit-1'; commit=$head.sha; files=$files} | ConvertTo-Json -Depth 5 | Set-Content "$kit\kit.json" -Encoding UTF8

# 5. ZIP sur le Bureau (ancien ZIP sauvegarde en .bak).
$desktop = [Environment]::GetFolderPath('Desktop')
$output = Join-Path $desktop 'supabase_migration.zip'
$partial = Join-Path $desktop ('supabase_migration-' + [guid]::NewGuid() + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($kit, $partial, [IO.Compression.CompressionLevel]::Fastest, $false)
if (Test-Path -LiteralPath $output) { Move-Item -LiteralPath $output -Destination ($output + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak') }
Move-Item -LiteralPath $partial -Destination $output
Write-Host "TERMINE : $output" -ForegroundColor Green
Write-Host 'Envoyez ce ZIP au destinataire. Il contient uniquement les comptes choisis, leurs donnees et documents : partagez-le uniquement avec lui.'
Write-Host "Rapport de filtrage (adresses e-mail : ne pas transmettre) : $(Join-Path $exportDir 'rapport-filtrage.txt')"
Write-Host "Dossier de travail conserve : $work"
