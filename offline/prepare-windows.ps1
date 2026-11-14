# Published with an immutable source commit and archive hash. Windows PowerShell 5.1.
& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$oldTls = [Net.ServicePointManager]::SecurityProtocol
$lock = $null
$work = $null
$secrets = $null
$credentials = $null
$sourceKey = $null
$studioPassword = $null
$uploadKey = $null
$container = 'v2ocr-publication-' + [guid]::NewGuid().ToString('N')
$Ctx = @{ Docker = $null }
# __WINDOWS_COMMON__
$revision = '__SOURCE_COMMIT__'
$sourceHash = '__SOURCE_SHA256__'
$distribution = 'https://v2-ocr-distribution.nayer-v2-ocr.workers.dev'
function Run-Docker {
    param([string[]]$Arguments, [int]$Timeout = 60, [int]$Idle = 0, [string]$ProgressFile,
        [string]$InputText, [switch]$Capture, [switch]$Interactive)
    Invoke-Tool -Exe $Ctx.Docker -Arguments (@('--context','desktop-linux') + $Arguments) `
        -Timeout $Timeout -Idle $Idle -ProgressFile $ProgressFile -InputText $InputText -Capture:$Capture -Interactive:$Interactive
}
function Run-Helper([string]$Action, [string]$InputText) {
    $message = @{secrets=$secrets; credentials=if ($InputText) { $InputText | ConvertFrom-Json } else { $null }} | ConvertTo-Json -Depth 5 -Compress
    Run-Docker -Arguments @('run','--rm','-i','--name',$container,'--pull','never','--cpus','2','--memory','1g',
        '-v',"${source}:/source:ro",'-v',"${work}:/work",$node,'node','/source/offline/operator.mjs',$Action,'/source','/work') `
        -Timeout 0 -Idle 120 -InputText $message
}
function Save-Json([string]$Path, $Value) {
    Write-Utf8 "$Path.new" ($Value | ConvertTo-Json -Depth 30)
    Move-Item -LiteralPath "$Path.new" -Destination $Path -Force
}
function Show-Result {
    $command = "irm -TimeoutSec 30 '$distribution/$($channelState.channel)/install.ps1' | iex"
    Write-Utf8 (Join-Path $homeDir 'commande-client.txt') $command
    Write-Host "`nPublication terminee. Commande client permanente :" -ForegroundColor Green
    Write-Host $command
    Write-Host "`nCode de migration (a transmettre au client separement) :"
    Write-Host $secrets.migrationKey
    Write-Host "`nIdentite du canal et sauvegarde chiffree conserves dans : $homeDir"
}
try {
    if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'Ouvrez PowerShell 64 bits sur Windows x64.'
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Ctx.Docker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
    if (-not $Ctx.Docker) { $Ctx.Docker = "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe" }
    if (-not (Test-Path -LiteralPath $Ctx.Docker)) { throw 'Docker Desktop doit etre installe et demarre.' }
    $engine = Run-Docker -Arguments @('info','--format','{{.OSType}}/{{.Architecture}}') -Timeout 20 -Capture
    if ("$engine" -notmatch '^linux/(x86_64|amd64)$') { throw 'Docker Desktop doit utiliser les conteneurs Linux x64.' }
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'curl.exe est absent de Windows.' }
    $homeDir = Join-Path $env:LOCALAPPDATA 'V2-OCR-publication'
    Protect-Directory $homeDir
    $lock = [IO.File]::Open((Join-Path $homeDir 'publication.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $channelStateFile = Join-Path $homeDir 'canal.json'
    $secretFile = Join-Path $homeDir 'identite.clixml'
    $work = Join-Path $homeDir 'travail'
    Protect-Directory $work
    # Remove plaintext left after a terminated process; recover identity from DPAPI below.
    Remove-Item -LiteralPath (Join-Path $work 'secrets.json') -Force -ErrorAction SilentlyContinue
    $channelState = if (Test-Path -LiteralPath $channelStateFile) { Get-Content $channelStateFile -Raw | ConvertFrom-Json }
    $jobFile = Join-Path $work 'job.json'
    $job = if (Test-Path -LiteralPath $jobFile) { Get-Content $jobFile -Raw | ConvertFrom-Json }
    if ($channelState -and -not (Test-Path -LiteralPath $secretFile)) { throw 'Identite de signature absente. Restaurez identite.clixml depuis votre sauvegarde du poste.' }
    if ($job) {
        Write-Host "Reprise de la publication $($job.sequence)."
        if ($job.commit -cne $revision) {
            Write-Host 'Un correctif du preparateur est disponible : meme canal, donnees deja verifiees conservees.'
            $job.commit = $revision
            $job.sourceHash = $sourceHash
            $job.sequence = [long]$job.sequence + 1
            $job | Add-Member -NotePropertyName refreshRequired -NotePropertyValue $true -Force
            Save-Json $jobFile $job
        }
    }
    if ($revision -notmatch '^[a-f0-9]{40}$' -or $sourceHash -notmatch '^[a-f0-9]{64}$') { throw 'Preparateur non publie ou incomplet.' }
    $zip = Join-Path $work 'source.zip'
    $source = Join-Path $work "source\v2-ocr-$revision"
    if (-not (Test-Path -LiteralPath $zip) -or (Get-FileHash $zip).Hash -ne $sourceHash) {
        Write-Host 'Recuperation du code de preparation verifie...'
        Invoke-Tool -Exe 'curl.exe' -Arguments @('-q','--fail','--show-error','--location','--proto','=https',
            '--connect-timeout','15','--speed-time','30','--speed-limit','1','--retry','2','--retry-delay','2',
            '--output',"$zip.part","https://codeload.github.com/NayerAli/v2-ocr/zip/$revision") -Timeout 0 -Idle 60 -ProgressFile "$zip.part"
        if ((Get-FileHash "$zip.part").Hash -ne $sourceHash) { throw 'Empreinte du code source incorrecte.' }
        Move-Item -LiteralPath "$zip.part" -Destination $zip -Force
    }
    if (-not (Test-Path -LiteralPath "$source\offline\operator.mjs")) {
        Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $work 'source') -Force
    }
    $pins = Get-Content "$source\offline\images.lock.json" -Raw | ConvertFrom-Json
    $node = $pins.'node:20-alpine'
    # Pulls are only on the preparation PC. Client PCs load the resulting archives.
    Run-Docker -Arguments @('pull','--platform','linux/amd64',$node) -Timeout 0 -Idle 120
    if (-not $channelState) {
        if (Test-Path $secretFile) { throw 'Identite existante sans canal.json. Restaurer ce fichier avant de continuer.' }
        $identityJson = (Run-Docker -Arguments @('run','--rm','--network','none','--pull','never','--name',$container,
            '-v',"${source}:/source:ro",'-v',"${work}:/work",$node,'node','/source/offline/operator.mjs','identity','/source','/work') -Timeout 30 -Capture | Out-String)
        $secrets = $identityJson | ConvertFrom-Json
        ConvertTo-SecureString $identityJson -AsPlainText -Force | Export-Clixml -LiteralPath $secretFile
        $identityJson = $null
        $channelState = [pscustomobject]@{channel=$secrets.channel; sequence=0; migration=$null}
        Save-Json $channelStateFile $channelState
    } else {
        $protected = Import-Clixml -LiteralPath $secretFile
        try { $text = Unprotect-Text $protected; $secrets = $text | ConvertFrom-Json }
        finally { $text = $null; $protected.Dispose() }
    }
    if (-not $job) {
        if ($channelState.sequence -gt 0) {
            $action = Read-Host 'Publier la mise a jour sur le meme canal [Entree], ou afficher la commande et le code [A]'
            if ($action -match '^[aA]$') { Show-Result; return }
            if ($action) { throw 'Choix inconnu. Aucune publication effectuee.' }
        }
        $job = [pscustomobject]@{channel=$channelState.channel; sequence=([long]$channelState.sequence + 1);
            commit=$revision; sourceHash=$sourceHash; migration=$channelState.migration}
        Save-Json $jobFile $job
    }
    $access = (Read-Host 'R2 : Access Key ID (limite au bucket v2-ocr-offline-installer)').Trim()
    $uploadKey = Read-Host 'R2 : Secret Access Key (saisie masquee, non memorisee)' -AsSecureString
    $credentials = @{accessKeyId=$access; secretAccessKey=(Unprotect-Text $uploadKey)} | ConvertTo-Json -Compress
    Run-Helper 'check' $credentials
    if ($job.refreshRequired) {
        Run-Helper 'refresh' ''
        $job = Get-Content $jobFile -Raw | ConvertFrom-Json
    }
    if (-not $job.migration -and -not (Test-Path "$work\package\manifest.json")) {
        $export = Join-Path $work 'export'
        New-Item -ItemType Directory -Force -Path $export | Out-Null
        if (-not (Test-Path "$export\payload\manifest.json")) {
            $address = (Read-Host 'Adresse du Supabase source accessible depuis ce PC').Trim()
            $sourceKey = Read-Host 'Cle service_role du serveur source (saisie masquee, non memorisee)' -AsSecureString
            $studioUser = Read-Host 'Identifiant Studio si acces SQL protege (Entree si inutile)'
            if ($studioUser) { $studioPassword = Read-Host 'Mot de passe Studio (saisie masquee)' -AsSecureString }
            $childEnv = @{OCR_ADRESSE=$address; OCR_CLE=(Unprotect-Text $sourceKey); OCR_CLIENT_EXPORT='1'; OCR_PARALLELE='6'}
            if ($studioUser) { $childEnv.OCR_STUDIO_USER=$studioUser; $childEnv.OCR_STUDIO_PASSWORD=(Unprotect-Text $studioPassword) }
            $arguments = @('--context','desktop-linux','run','--rm','-it','--pull','never','--name',$container,'--cpus','2','--memory','2g',
                '-e','OCR_ADRESSE','-e','OCR_CLE','-e','OCR_CLIENT_EXPORT','-e','OCR_PARALLELE','-e','OCR_STUDIO_USER','-e','OCR_STUDIO_PASSWORD',
                '-v',"$source/local/assistant:/projet/local/assistant:ro",'-v',"${export}:/sortie",'-w','/sortie',
                $node,'node','/projet/local/assistant/export-filtre.mjs','/sortie','--ecrire-config','/sortie/selection.json')
            if (Test-Path "$export\selection.json") { $arguments += @('--config','/sortie/selection.json','--oui') }
            try {
                # Human selection can wait; all source HTTP operations have their own bounded deadlines.
                Invoke-Tool -Exe $Ctx.Docker -Arguments $arguments -Interactive -Timeout 0 -Environment $childEnv
            } finally { $childEnv.Clear(); $sourceKey.Dispose(); $sourceKey = $null }
            if (-not (Test-Path "$export\payload\manifest.json")) { throw 'Export annule ou incomplet. Relancez la meme commande.' }
        }
    }
    if (-not (Test-Path "$work\package\manifest.json")) {
        $mapping = @{}; $ids = @{}
        foreach ($entry in $pins.PSObject.Properties) {
            if ($entry.Value -notmatch '@sha256:[a-f0-9]{64}$') { throw 'Une image du verrou est mutable.' }
            Run-Docker -Arguments @('pull','--platform','linux/amd64',$entry.Value) -Timeout 0 -Idle 120
            $imageInfo = (Run-Docker -Arguments @('image','inspect',$entry.Value) -Capture | Out-String) | ConvertFrom-Json
            if ($imageInfo[0].Os -ne 'linux' -or $imageInfo[0].Architecture -ne 'amd64') { throw 'Architecture Docker incompatible.' }
            $id = $imageInfo[0].Id
            $alias = 'v2ocr-offline/service:' + $id.Replace('sha256:','')
            Run-Docker -Arguments @('tag',$entry.Value,$alias)
            $mapping[$entry.Name] = $alias; $ids[$alias] = $id
        }
        Write-Host 'Compilation locale de V2 OCR (progression affichee, arret apres 120 s sans sortie)...'
        $tag = "v2ocr-offline/build:$revision"
        Run-Docker -Arguments @('build','--progress','plain','--platform','linux/amd64','--target','prod',
            '--build-arg',"NODE_IMAGE=$node",'--build-arg',"BUILD_ID=$revision",'--build-arg','OCR_BUILD_SUPABASE_URL=http://localhost:8000',
            '--build-arg','OCR_BUILD_SUPABASE_ANON_KEY=V2OCR_PUBLIC_ANON_KEY_70E3788B645D','-t',$tag,$source) -Timeout 0 -Idle 120
        $appId = (Run-Docker -Arguments @('image','inspect','--format','{{.Id}}',$tag) -Capture | Out-String).Trim()
        $app = 'v2ocr-offline/app:' + $appId.Replace('sha256:','')
        Run-Docker -Arguments @('tag',$appId,$app)
        Run-Docker -Arguments @('run','--rm','--network','none','--pull','never','--name',$container,$app,'node','-e',
            "const fs=require('fs');const p='/opt/.next/static';if(!fs.readdirSync(p,{recursive:true}).some(n=>n.endsWith('.js')&&fs.readFileSync(p+'/'+n,'utf8').includes('V2OCR_PUBLIC_ANON_KEY_70E3788B645D')))process.exit(1)") -Timeout 30
        $ids[$app] = $appId
        Save-Json "$work\images.json" @{mapping=$mapping; app=$app; helper=$mapping['node:20-alpine']; ids=$ids; sources=$pins}
        Write-Host 'Sauvegarde locale des images Docker...'
        Run-Docker -Arguments (@('image','save','-o',"$work\images.tar") + @($ids.Keys | Sort-Object)) -Timeout 0 -Idle 120 -ProgressFile "$work\images.tar"
        Run-Helper 'package' ''
    }
    Run-Helper 'publish' $credentials
    $envelope = Get-Content "$work\package\manifest.json" -Raw | ConvertFrom-Json
    $manifest = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($envelope.payload)) | ConvertFrom-Json
    $channelState.sequence = $job.sequence
    $channelState.migration = $manifest.archives.migration
    Save-Json $channelStateFile $channelState
    Copy-Item "$work\package\manifest.json" "$homeDir\derniere-publication.json" -Force
    if (Test-Path "$work\migration.enc") { Move-Item "$work\migration.enc" "$homeDir\sauvegarde-client.enc" -Force }
    Show-Result
    # No plaintext export, source credential, temporary archive or container survives success.
    Remove-Item -LiteralPath $work -Recurse -Force
} catch {
    Write-Host ("ARRET : " + $_.Exception.Message) -ForegroundColor Red
    if ($work) { Write-Host "Reprise : relancez la meme commande. Fichiers partiels proteges dans $work" }
    throw
} finally {
    if ($Ctx.Docker) {
        try {
            $left = Run-Docker -Arguments @('ps','-aq','--filter',"name=^/${container}$") -Timeout 15 -Capture
            if ($left) { Run-Docker -Arguments @('rm','-f',$container) -Timeout 15 | Out-Null }
        } catch { }
    }
    if ($work) { Remove-Item -LiteralPath (Join-Path $work 'secrets.json') -Force -ErrorAction SilentlyContinue }
    if ($studioPassword) { $studioPassword.Dispose() }
    if ($sourceKey) { $sourceKey.Dispose() }; if ($uploadKey) { $uploadKey.Dispose() }
    $secrets = $null; $credentials = $null
    if ($lock) { $lock.Dispose() }
    [Net.ServicePointManager]::SecurityProtocol = $oldTls
}
}
