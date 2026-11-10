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
$work = Join-Path $env:TEMP ('ocr-export-' + [guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
$branch = 'claude/local-deployment-db-migration-eb3dut'
$head = Invoke-RestMethod "https://api.github.com/repos/NayerAli/v2-ocr/commits/$branch" -Headers @{'User-Agent'='ocr-offline'}
Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/NayerAli/v2-ocr/zip/$($head.sha)" -OutFile "$work\source.zip"
Expand-Archive "$work\source.zip" "$work\source"
$source = (Get-ChildItem "$work\source" -Directory | Select-Object -First 1).FullName
$kit = Join-Path $work 'kit'
New-Item -ItemType Directory "$kit\local" | Out-Null
Copy-Item "$source\local\assistant" "$kit\local\assistant" -Recurse
Copy-Item "$source\local\docker-compose.yml" "$kit\compose-reference.yml"
Copy-Item "$source\importer-migration.ps1" "$kit\importer-migration.ps1"
Write-Host 'Preparation des outils hors ligne...'
DockerOk pull node:20-alpine
Write-Host 'Export des donnees : les informations demandees restent sur ce PC.'
try { DockerOk run --rm -it -v "${kit}:/projet" -w /projet/local/assistant node:20-alpine node archive.mjs export /projet/payload } finally {
  $diag = Join-Path $kit 'diagnostic-supabase.txt'
  if (Test-Path -LiteralPath $diag) { Copy-Item -LiteralPath $diag -Destination (Join-Path ([Environment]::GetFolderPath('Desktop')) 'diagnostic-supabase.txt') -Force; Write-Host 'Diagnostic copie sur le Bureau : diagnostic-supabase.txt' -ForegroundColor Yellow }
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
Write-Host 'Envoyez ce ZIP au destinataire. Il contient les comptes, donnees et documents : partagez-le uniquement avec lui.'
Write-Host "Dossier temporaire conserve : $work"
