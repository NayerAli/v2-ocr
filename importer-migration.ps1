$ErrorActionPreference = 'Stop'
$kit = $PSScriptRoot
function DockerOk { $result = & docker @args; if ($LASTEXITCODE -ne 0) { throw "Docker a echoue : $($args[0])" }; return $result }
function TestDocker { $ErrorActionPreference = 'Continue'; & docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $env:Path = "$env:ProgramFiles\Docker\Docker\resources\bin;$env:Path" }
$memo = Join-Path $env:LOCALAPPDATA 'OCR-installation\dossier.txt'
$project = if (Test-Path $memo) { (Get-Content $memo -Raw).Trim() } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'OCR' }
$compose = Join-Path $project 'local\docker-compose.yml'
if (-not (Test-Path $compose) -or -not (Test-Path "$project\local\.env")) { throw 'Installation OCR introuvable. Executez d abord l installation initiale sur ce PC.' }
Write-Host 'Verification complete du ZIP...'
$manifest = Get-Content "$kit\kit.json" -Raw | ConvertFrom-Json
if ($manifest.format -ne 'ocr-kit-1' -or $manifest.appImage -notmatch '^ocr-offline-app:[a-f0-9]{40}$') { throw 'Format du kit invalide' }
foreach ($p in $manifest.files.PSObject.Properties) {
  $target = [IO.Path]::GetFullPath((Join-Path $kit $p.Name))
  if (-not $target.StartsWith($kit.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Chemin interdit dans le ZIP' }
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $p.Value) { throw "ZIP incomplet ou endommage : $($p.Name)" }
}
if ((Get-FileHash $compose).Hash -ne (Get-FileHash "$kit\compose-reference.yml").Hash) { throw 'La configuration Docker differe de celle du kit. Mettez l installation a jour avant de relancer.' }
if (-not (TestDocker)) {
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
  $deadline = (Get-Date).AddMinutes(3)
  do { Start-Sleep 3; $ready = TestDocker } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw 'Docker Desktop ne repond pas. Ouvrez-le puis relancez la commande.' }
}
DockerOk load -i "$kit\images.tar"
DockerOk run --rm --pull never -v "${kit}:/kit:ro" node:20-alpine node /kit/local/assistant/archive.mjs verify /kit/payload
$services = @('db','auth','rest','storage','meta','studio','kong')
$previous = @(DockerOk compose -f $compose ps --services --status running)
$dbId = (DockerOk compose -f $compose ps -a -q db | Select-Object -First 1)
$storageId = (DockerOk compose -f $compose ps -a -q storage | Select-Object -First 1)
if (-not $dbId -or -not $storageId) { throw 'La base et le stockage locaux doivent avoir ete initialises par l installation OCR.' }
$volumes = @()
foreach ($id in @($dbId,$storageId)) {
  $info = (DockerOk inspect $id | Out-String | ConvertFrom-Json)[0]
  $volumes += @($info.Mounts | Where-Object { $_.Type -eq 'volume' } | ForEach-Object { $_.Name })
}
$volumes = @($volumes | Select-Object -Unique)
if ($volumes.Count -ne 3) { throw 'Volumes Docker inattendus : aucune donnee modifiee.' }
$backup = Join-Path $project ('sauvegardes\avant-import-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory $backup -Force | Out-Null
$oldImage = $null
try { $oldImage = DockerOk image inspect ocr-app:latest --format '{{.Id}}' } catch { $oldImage = $null }
foreach ($name in @('.migration-ok','.migration-etape1-ok')) { if (Test-Path "$project\local\$name") { Copy-Item "$project\local\$name" "$backup\$name" } }
@{volumes=$volumes; services=$previous; compose=$compose; oldImage=$oldImage} | ConvertTo-Json -Depth 4 | Set-Content "$backup\restauration.json"
$saved = $false
$changed = $false
try {
  Write-Host 'Sauvegarde de la base et des fichiers locaux...'
  DockerOk compose -f $compose stop
  foreach ($volume in $volumes) {
    DockerOk run --rm --pull never -v "${volume}:/data:ro" -v "${backup}:/backup" node:20-alpine tar -czf "/backup/$volume.tgz" -C /data .
    DockerOk run --rm --pull never -v "${backup}:/backup:ro" node:20-alpine tar -tzf "/backup/$volume.tgz" | Out-Null
  }
  $saved = $true
  $changed = $true
  DockerOk tag $manifest.appImage ocr-app:latest
  # Storage API creates the physical objects again from the archive.
  # Database/schema replacement is transactional; volume backups cover API writes too.
  DockerOk compose -f $compose up -d --no-build --pull never --wait @services
  Write-Host 'Import hors ligne des donnees et documents...'
  DockerOk compose -f $compose run --rm --no-deps --pull never -T -v "${kit}:/kit:ro" -v "${kit}/local/assistant:/projet/local/assistant:ro" assistant node /projet/local/assistant/archive.mjs import /kit/payload
  DockerOk compose -f $compose up -d --no-build --pull never --wait app
  $ready = $false
  $deadline = (Get-Date).AddMinutes(2)
  do {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://localhost:3000' | Out-Null; $ready = $true } catch { Start-Sleep 3 }
  } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw 'L application ne repond pas apres l import.' }
  Write-Host "TERMINE. Sauvegarde conservee dans : $backup" -ForegroundColor Green
  Start-Process 'http://localhost:3000'
} catch {
  $failure = $_
  if ($saved -and $changed) {
    Write-Host 'Echec : restauration automatique de la sauvegarde...'
    DockerOk compose -f $compose stop
    foreach ($volume in $volumes) {
      DockerOk run --rm --pull never -v "${volume}:/data" -v "${backup}:/backup:ro" -e "ARCHIVE=$volume.tgz" node:20-alpine sh -ec 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf "/backup/$ARCHIVE" -C /data'
    }
    foreach ($name in @('.migration-ok','.migration-etape1-ok')) {
      if (Test-Path "$backup\$name") { Copy-Item "$backup\$name" "$project\local\$name" -Force }
      elseif (Test-Path "$project\local\$name") { Remove-Item -LiteralPath "$project\local\$name" }
    }
    if ($oldImage) { DockerOk tag $oldImage ocr-app:latest }
  }
  if ($previous.Count) { DockerOk compose -f $compose up -d --no-build --pull never @previous }
  throw "Import interrompu : $($failure.Exception.Message). Sauvegarde : $backup"
}
