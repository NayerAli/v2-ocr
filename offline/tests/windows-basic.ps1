$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
foreach ($file in Get-ChildItem "$root/offline" -Filter '*.ps1') {
    $tokens=$null; $errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw ($errors | Out-String) }
    Write-Host "Syntaxe OK : $($file.Name)"
}
. "$root/offline/windows-common.ps1"
$exe = (Get-Process -Id $PID).Path
$program = '$ErrorActionPreference="Stop"; Write-Output $env:V2OCR_BASIC_ONLY; [Console]::Error.WriteLine("stderr visible"); exit 0'
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
$before = [Environment]::GetEnvironmentVariable('V2OCR_BASIC_ONLY','Process')
$got = Invoke-Tool -Exe $exe -Arguments @('-NoProfile','-EncodedCommand',$encoded) -Capture -Environment @{ V2OCR_BASIC_ONLY='temporary-child-value' }
if ($got -cne 'temporary-child-value' -or [Environment]::GetEnvironmentVariable('V2OCR_BASIC_ONLY','Process') -cne $before) { throw 'Fuite de variable dans la session appelante' }
try {
    Invoke-Tool -Exe $exe -Arguments @('-NoProfile','-Command','Start-Sleep -Seconds 10') -Timeout 1
    throw 'Delai non applique'
} catch { if ($_.Exception.Message -notlike 'Delai depasse*') { throw } }
try {
    Invoke-Tool -Exe $exe -Arguments @('-NoProfile','-Command','exit 7') -Timeout 10
    throw 'Erreur non remontee'
} catch { if ($_.Exception.Message -notlike 'Echec*code 7*') { throw } }
Write-Host 'Processus : isolation environnement, arret sur erreur, limite de temps OK.'
