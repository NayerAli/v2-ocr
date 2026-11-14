# Removes only this V2 OCR installation. Docker Desktop and other projects are kept.
& {
$ErrorActionPreference = 'Stop'
# __WINDOWS_COMMON__
$root = Join-Path $env:LOCALAPPDATA 'V2-OCR'
if (-not (Test-Path "$root\trust.json")) { throw 'Aucune installation V2 OCR R2 identifiee.' }
$confirm = Read-Host 'Supprimer V2 OCR, ses donnees locales et ses sauvegardes ? Tapez SUPPRIMER'
if ($confirm -cne 'SUPPRIMER') { Write-Host 'Suppression annulee.'; return }
$docker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $docker) { $docker = "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe" }
$envBefore = [Environment]::GetEnvironmentVariable('OCR_STATE','Process')
try {
    $env:OCR_STATE = Join-Path $root 'state'
    $active = if (Test-Path "$root\active.json") { Get-Content "$root\active.json" -Raw | ConvertFrom-Json }
    $release = if ($active) { $active.directory } else { (Get-ChildItem $root -Directory -Filter 'release-*' | Select-Object -First 1).FullName }
    if ($release) {
        Invoke-Tool -Exe $docker -Arguments @('--context','desktop-linux','compose','--project-name','ocr_r2','--env-file',"$root\state\local\.env",'-f',"$release\compose.yml",'down','--volumes','--remove-orphans','--timeout','20') -Timeout 60
    }
    $task = 'V2-OCR-reprise-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'V2-OCR-reprise' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $root -Recurse -Force
    Write-Host 'V2 OCR et ses donnees locales ont ete supprimes. Docker Desktop est conserve.'
} finally { [Environment]::SetEnvironmentVariable('OCR_STATE',$envBefore,'Process') }
}
