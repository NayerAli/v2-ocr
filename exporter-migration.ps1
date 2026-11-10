$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function DockerOk { & docker @args; if ($LASTEXITCODE -ne 0) { throw "Docker a echoue : $($args[0])" } }
function TestDocker { $ErrorActionPreference = 'Continue'; & docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $env:Path = "$env:ProgramFiles\Docker\Docker\resources\bin;$env:Path"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop doit etre installe sur ce PC pour preparer le kit hors ligne.' }
if (-not (TestDocker)) {
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
  $deadline = (Get-Date).AddMinutes(3)
  do { Start-Sleep 3; $ready = TestDocker } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw 'Ouvrez Docker Desktop et acceptez ses conditions, puis relancez cette commande.' }
}
# Dossier de travail stable : un export interrompu reprend la ou il s'est arrete.
$work = Join-Path $env:LOCALAPPDATA 'OCR-export'
New-Item -ItemType Directory $work -Force | Out-Null
$kit = Join-Path $work 'kit'
New-Item -ItemType Directory "$kit\local" -Force | Out-Null
$branch = 'claude/local-deployment-db-migration-eb3dut'
$head = Invoke-RestMethod "https://api.github.com/repos/NayerAli/v2-ocr/commits/$branch" -Headers @{'User-Agent'='ocr-offline'}
Remove-Item "$work\source" -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/NayerAli/v2-ocr/zip/$($head.sha)" -OutFile "$work\source.zip"
Expand-Archive "$work\source.zip" "$work\source" -Force
$source = (Get-ChildItem "$work\source" -Directory | Select-Object -First 1).FullName
Remove-Item "$kit\local\assistant" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$source\local\assistant" "$kit\local\assistant" -Recurse
Copy-Item "$source\local\docker-compose.yml" "$kit\compose-reference.yml" -Force
Copy-Item "$source\importer-migration.ps1" "$kit\importer-migration.ps1" -Force
Write-Host 'Preparation des outils hors ligne...'
DockerOk pull node:20-alpine
# Export filtre par compte. Seul l'export filtre peut partir chez le client.
$payload = Join-Path $kit 'payload'
$manifest = Join-Path $payload 'manifest.json'
if (Test-Path -LiteralPath $manifest) {
  $estFiltre = (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).PSObject.Properties.Name -contains 'filtre'
  if (-not $estFiltre) {
    # Export sans filtre (ancienne version) : il contient tous les comptes, il est mis de cote.
    $mis = Join-Path $work ('export-sans-filtre-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $payload -Destination $mis
    Write-Host "Export sans filtre mis de cote (il contient tous les comptes, il ne sera pas transmis) : $mis" -ForegroundColor Yellow
  }
}
# Dossier stable : un export interrompu reprend au meme endroit.
$exportDir = Join-Path $work 'export-filtre'
New-Item -ItemType Directory $exportDir -Force | Out-Null
if (Test-Path -LiteralPath $manifest) {
  Write-Host 'Export filtre deja termine : rien a recopier depuis le serveur.'
} else {
  Write-Host 'Choix des comptes a transmettre : seuls les comptes choisis, leurs donnees, documents et cles OCR sont exportes.'
  Write-Host 'Le serveur est seulement lu. Une ligne d etat s affiche toutes les 15 secondes.'
  Write-Host 'Si la copie s interrompt, relancez cette meme commande : elle reprend au meme endroit.'
  # Dossier de l assistant monte en lecture seule : aucune adresse de serveur n est ecrite dans le kit.
  DockerOk run --rm -it -v "$kit\local\assistant:/projet/local/assistant:ro" -v "${exportDir}:/sortie" -w /sortie node:20-alpine node /projet/local/assistant/export-filtre.mjs /sortie
  if (-not (Test-Path -LiteralPath (Join-Path $exportDir 'payload\manifest.json'))) { throw 'Aucune archive produite : export annule ou interrompu.' }
  Move-Item -LiteralPath (Join-Path $exportDir 'payload') -Destination $payload
  Write-Host "Rapport de filtrage (adresses e-mail : ne pas transmettre) : $(Join-Path $exportDir 'rapport-filtrage.txt')" -ForegroundColor Yellow
}
Write-Host 'Preparation de l application (plusieurs minutes)...'
$appTag = "ocr-offline-app:$($head.sha)"
DockerOk build --target prod -t $appTag $source
$images = @('node:20-alpine', $appTag)
foreach ($line in Get-Content "$source\local\docker-compose.yml") {
  if ($line -match '^\s+image:\s*(\S+)\s*$') { $images += $Matches[1] }
}
$images = @($images | Select-Object -Unique)
foreach ($image in $images) { if ($image -ne $appTag) { DockerOk pull $image } }
DockerOk save -o "$kit\images.tar" @images
Remove-Item -LiteralPath "$kit\local\.adresse-serveur" -Force -ErrorAction SilentlyContinue
$files = @{}
foreach ($file in Get-ChildItem $kit -Recurse -File) {
  $relative = $file.FullName.Substring($kit.Length + 1).Replace('\','/')
  $files[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
}
@{format='ocr-kit-1'; commit=$head.sha; appImage=$appTag; files=$files} | ConvertTo-Json -Depth 5 | Set-Content "$kit\kit.json" -Encoding UTF8
$desktop = [Environment]::GetFolderPath('Desktop')
$output = Join-Path $desktop 'supabase_migration.zip'
$partial = Join-Path $desktop ('supabase_migration-' + [guid]::NewGuid() + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($kit, $partial, [IO.Compression.CompressionLevel]::Fastest, $false)
if (Test-Path -LiteralPath $output) { Move-Item -LiteralPath $output -Destination ($output + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak') }
Move-Item -LiteralPath $partial -Destination $output
Write-Host "TERMINE : $output" -ForegroundColor Green
Write-Host 'Envoyez ce ZIP au destinataire. Il contient uniquement les comptes choisis, leurs donnees et documents : partagez-le uniquement avec lui.'
Write-Host "Dossier de travail conserve : $work (supprimez-le pour recommencer l export a zero)"
