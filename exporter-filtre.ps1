# Export filtre par compte (Supabase auto-hebergé) depuis un conteneur Docker jetable.
# Le conteneur ne parle qu'a l'API du serveur (port 8000). Aucune commande n'est lancee sur le serveur.
# Non teste : l'environnement de developpement n'a ni Docker ni PowerShell.
$ErrorActionPreference = 'Stop'
$branch = 'claude/local-deployment-db-migration-eb3dut'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop doit etre installe et demarre sur ce PC.' }
$work = Join-Path $env:TEMP ('ocr-filtre-' + [guid]::NewGuid())
New-Item -ItemType Directory $work -Force | Out-Null
$head = Invoke-RestMethod "https://api.github.com/repos/NayerAli/v2-ocr/commits/$branch" -Headers @{'User-Agent' = 'ocr-offline'}
Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/NayerAli/v2-ocr/zip/$($head.sha)" -OutFile "$work\source.zip"
Expand-Archive "$work\source.zip" "$work\source" -Force
$source = (Get-ChildItem "$work\source" -Directory | Select-Object -First 1).FullName
$sortie = Join-Path $work 'sortie'
New-Item -ItemType Directory $sortie -Force | Out-Null
try {
  docker pull node:20-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Telechargement de node:20-alpine impossible.' }
  # Conteneur supprime a la fin (--rm). L'adresse du serveur et la cle service_role se saisissent dans le terminal.
  docker run --rm -it -v "$source\local\assistant:/projet/local/assistant:ro" -v "${sortie}:/sortie" -w /sortie node:20-alpine node /projet/local/assistant/export-filtre.mjs /sortie
  if ($LASTEXITCODE -ne 0) { throw 'Export filtre interrompu ou refuse (voir les messages ci-dessus).' }
  $payload = Join-Path $sortie 'payload'
  if (-not (Test-Path (Join-Path $payload 'manifest.json'))) { throw 'Aucune archive produite.' }
  # exporter-migration.ps1 saute son propre export si payload\manifest.json existe : on y depose l'archive filtree.
  $kit = Join-Path $env:LOCALAPPDATA 'OCR-export\kit'
  New-Item -ItemType Directory $kit -Force | Out-Null
  if (Test-Path (Join-Path $kit 'payload')) { throw "Un export existe deja dans $kit\payload : supprimez-le avant de relancer." }
  Copy-Item $payload (Join-Path $kit 'payload') -Recurse
  Write-Host ''
  Write-Host 'Archive filtree prete. Rapport : ' -NoNewline; Write-Host (Join-Path $sortie 'rapport-filtrage.txt')
  Write-Host 'Pour fabriquer le kit a transferer (images Docker incluses), lancez :'
  Write-Host "irm https://raw.githubusercontent.com/NayerAli/v2-ocr/$branch/exporter-migration.ps1 | iex"
} finally {
  # Nettoyage explicite : rien n'est supprime sans reponse. Copiez d'abord le rapport si vous le gardez.
  $rep = Read-Host "Supprimer le dossier temporaire $work (archive et rapport) ? (o/N)"
  if ($rep -match '^(o|oui)$') { Remove-Item $work -Recurse -Force }
  $rep = Read-Host 'Supprimer aussi l image Docker node:20-alpine ? (o/N)'
  if ($rep -match '^(o|oui)$') { docker image rm node:20-alpine }
}
