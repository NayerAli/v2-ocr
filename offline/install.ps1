# Windows PowerShell 5.1. The release builder supplies the channel URL and the RSA public key.
$installer = {
param([string]$SourceText)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ReleaseUrl = '__RELEASE_URL__'
$PublicModulus = '__RSA_MODULUS__'
$Root = Join-Path $env:LOCALAPPDATA 'V2-OCR'
$State = Join-Path $Root 'state'
$Bootstrap = Join-Path $Root 'install.ps1'
$Cache = Join-Path $Root 'downloads'
$Task = 'V2-OCR-reprise-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$User = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$AppUrl = 'http://localhost:3000'
$MigrationContainer = 'v2ocr-r2-migration'
$VolumeNames = @('ocr_r2_db-data', 'ocr_r2_db-config', 'ocr_r2_storage-data')
$Suffix = @{ runtime='tar.gz'; images='tar.gz'; migration='enc'; wsl='msi'; docker='exe' }

function Write-Atomic([string]$File, [string]$Value) {
    $temp = "$File.new"
    [IO.File]::WriteAllText($temp, $Value, (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $File) {
        $backup = "$File.previous"
        [IO.File]::Replace($temp, $File, $backup)
        Remove-Item -LiteralPath $backup -Force
    } else { [IO.File]::Move($temp, $File) }
}

function Read-Json([string]$File) {
    if (Test-Path -LiteralPath $File) { Get-Content -LiteralPath $File -Raw | ConvertFrom-Json }
}

function Open-PrivateDirectory([string]$Directory) {
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
    $acl = Get-Acl -LiteralPath $Directory
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    foreach ($sid in @($User, 'S-1-5-18')) {
        $access = New-Object Security.AccessControl.FileSystemAccessRule(
            (New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl',
            'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($access)
    }
    Set-Acl -LiteralPath $Directory -AclObject $acl
}

function Read-Manifest([string]$Envelope) {
    $document = $Envelope | ConvertFrom-Json
    $payload = [Convert]::FromBase64String($document.payload)
    $signature = [Convert]::FromBase64String($document.signature)
    $parameters = New-Object Security.Cryptography.RSAParameters
    $parameters.Modulus = [Convert]::FromBase64String($PublicModulus)
    $parameters.Exponent = [byte[]]@(1, 0, 1)
    $rsa = [Security.Cryptography.RSA]::Create()
    try {
        $rsa.ImportParameters($parameters)
        if (-not $rsa.VerifyData($payload, $signature, [Security.Cryptography.HashAlgorithmName]::SHA256,
                [Security.Cryptography.RSASignaturePadding]::Pkcs1)) { throw 'Signature du manifeste invalide.' }
    } finally { $rsa.Dispose() }
    $manifest = [Text.Encoding]::UTF8.GetString($payload) | ConvertFrom-Json
    if ($manifest.format -ne 1 -or $manifest.sequence -lt 1 -or
        $manifest.version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,63}$' -or
        $manifest.commit -notmatch '^[a-f0-9]{40}$' -or
        -not $manifest.archives.runtime -or -not $manifest.archives.images) { throw 'Manifeste incompatible.' }
    foreach ($item in $manifest.archives.PSObject.Properties) {
        $file = $item.Value
        if (-not $Suffix.ContainsKey($item.Name) -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or
            $file.size -le 0 -or -not $file.parts) { throw 'Archive invalide dans le manifeste.' }
        $size = [long]0
        foreach ($part in $file.parts) {
            if ($part.sha256 -notmatch '^[a-f0-9]{64}$' -or $part.key -cne "objects/$($part.sha256)" -or
                $part.size -le 0 -or $part.size -gt 64MB) { throw 'Segment invalide dans le manifeste.' }
            $size += [long]$part.size
        }
        if ($size -ne $file.size) { throw 'Taille incoherente dans le manifeste.' }
    }
    return $manifest
}

function Test-Hash([string]$File, $Entry) {
    return ((Test-Path -LiteralPath $File -PathType Leaf) -and
        (Get-Item -LiteralPath $File).Length -eq $Entry.size -and
        (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -eq $Entry.sha256)
}

function Get-Segment($Part) {
    $file = Join-Path $Cache $Part.sha256
    if (Test-Hash $file $Part) { return $file }
    $partial = "$file.part"
    $base = $ReleaseUrl.Substring(0, $ReleaseUrl.LastIndexOf('/'))
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        if (Test-Hash $partial $Part) {
            Move-Item -LiteralPath $partial -Destination $file -Force
            return $file
        }
        if ((Test-Path -LiteralPath $partial) -and (Get-Item -LiteralPath $partial).Length -ge $Part.size) {
            Remove-Item -LiteralPath $partial -Force
        }
        # curl keeps bytes already received and aborts stalled transfers, regardless of total duration.
        $prior = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & curl.exe -q --fail --silent --show-error --connect-timeout 20 --speed-limit 1 --speed-time 90 `
                --proto '=https' --continue-at - --output $partial "$base/$($Part.key)" 2>$null
            $code = $LASTEXITCODE
        } finally { $ErrorActionPreference = $prior }
        if (Test-Hash $partial $Part) {
            Move-Item -LiteralPath $partial -Destination $file -Force
            return $file
        }
        if ($code -in 33, 36) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
        if ($attempt -lt 8) {
            Write-Host "Connexion interrompue ou segment indisponible. Nouvelle tentative ($attempt/8)..."
            Start-Sleep -Seconds ([Math]::Min(30, [Math]::Pow(2, $attempt)))
        }
    }
    throw "Segment indisponible ou incorrect ($($Part.sha256.Substring(0,12))). Relancez avec la meme commande."
}

function Get-Archive([string]$Name, $Entry) {
    $archive = Join-Path $Cache "$($Entry.sha256).$($Suffix[$Name])"
    if (Test-Hash $archive $Entry) { return $archive }
    $temp = "$archive.part"
    Write-Host "Telechargement de $Name ($($Entry.parts.Count) segments)..."
    $count = 0
    $stream = [IO.File]::Open($temp, 'Create', 'Write', 'None')
    try {
        foreach ($part in $Entry.parts) {
            $count++
            if ($count -eq 1 -or $count % 8 -eq 0 -or $count -eq $Entry.parts.Count) {
                Write-Host "  $Name : segment $count / $($Entry.parts.Count)"
            }
            $file = Get-Segment $part
            $partStream = [IO.File]::OpenRead($file)
            try { $partStream.CopyTo($stream) } finally { $partStream.Dispose() }
        }
    } finally { $stream.Dispose() }
    if (-not (Test-Hash $temp $Entry)) { throw "Archive $Name incorrecte." }
    Move-Item -LiteralPath $temp -Destination $archive -Force
    return $archive
}

function Enable-Resume {
    if (Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue) { return }
    $exe = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $action = New-ScheduledTaskAction -Execute $exe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Bootstrap`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
    $principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Principal $principal `
        -Settings $settings -Force | Out-Null
}

function Invoke-Admin([string]$Command) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    $process = Start-Process "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Verb RunAs -ArgumentList "-NoProfile -EncodedCommand $encoded" -PassThru -Wait
    return $process.ExitCode
}

function Find-Desktop {
    @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
      "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
      "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker\Docker Desktop.exe") |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

function Read-WslVersion {
    $prior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $message = (& wsl.exe --version 2>$null | Out-String).Replace([string][char]0, '')
        $match = [regex]::Match($message, '\d+\.\d+\.\d+')
        if ($LASTEXITCODE -eq 0 -and $match.Success) { return [version]$match.Value }
    } finally { $ErrorActionPreference = $prior }
}

function Test-LinuxDocker {
    if (-not $script:V2OcrDockerExe) { return $false }
    $prior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $engine = & $script:V2OcrDockerExe --context desktop-linux info --format '{{.OSType}} {{.KernelVersion}}' 2>$null
        return ($LASTEXITCODE -eq 0 -and "$engine" -match '^linux .*microsoft.*WSL2')
    } finally { $ErrorActionPreference = $prior }
}

function Install-Prerequisites($Manifest) {
    $desktop = Find-Desktop
    $wsl = Read-WslVersion
    $features = @('VirtualMachinePlatform', 'Microsoft-Windows-Subsystem-Linux')
    $featuresReady = $true
    foreach ($name in $features) {
        $feature = Get-CimInstance -ClassName Win32_OptionalFeature -Filter "Name='$name'"
        if ($feature.InstallState -ne 1) { $featuresReady = $false }
    }
    if (-not $featuresReady) {
        Write-Host 'Autorisez Windows a activer WSL2.'
        $code = Invoke-Admin @'
foreach ($name in 'VirtualMachinePlatform','Microsoft-Windows-Subsystem-Linux') {
    & dism.exe /Online /Enable-Feature "/FeatureName:$name" /All /NoRestart
    if ($LASTEXITCODE -notin 0,3010) { exit $LASTEXITCODE }
}
exit 3010
'@
        if ($code -ne 3010) { throw "Activation WSL2 impossible (code $code). Verifiez la virtualisation du PC." }
        Write-Host 'Redemarrez le PC puis reconnectez-vous. V2 OCR reprendra automatiquement.'
        return $false
    }
    if (-not $wsl -or $wsl -lt [version]'2.1.5') {
        if (-not $Manifest.archives.wsl) { throw 'Le paquet WSL2 requis manque dans cette distribution.' }
        $msi = Get-Archive 'wsl' $Manifest.archives.wsl
        Assert-Vendor $msi 'Microsoft Corporation'
        $quoted = $msi.Replace("'", "''")
        $hash = $Manifest.archives.wsl.sha256
        $guard = "if ((Get-FileHash -LiteralPath '$quoted').Hash -ne '$hash') { exit 1 }; "
        $code = Invoke-Admin "${guard}exit (Start-Process msiexec.exe -ArgumentList '/i `"$quoted`" /qn /norestart' -Wait -PassThru).ExitCode"
        if ($code -in 1641, 3010) {
            Write-Host 'Redemarrez le PC puis reconnectez-vous. V2 OCR reprendra automatiquement.'
            return $false
        }
        if ($code -ne 0 -or (Read-WslVersion) -lt [version]'2.1.5') { throw "Installation WSL2 impossible (code $code)." }
    }
    if (-not $desktop) {
        if (-not $Manifest.archives.docker) { throw 'Le paquet Docker Desktop requis manque dans cette distribution.' }
        $exe = Get-Archive 'docker' $Manifest.archives.docker
        Assert-Vendor $exe 'Docker Inc'
        $quoted = $exe.Replace("'", "''")
        Write-Host 'Autorisez Windows a installer Docker Desktop.'
        $hash = $Manifest.archives.docker.sha256
        $guard = "if ((Get-FileHash -LiteralPath '$quoted').Hash -ne '$hash') { exit 1 }; "
        $code = Invoke-Admin "${guard}exit (Start-Process -FilePath '$quoted' -ArgumentList 'install --quiet --accept-license --backend=wsl-2' -Wait -PassThru).ExitCode"
        if ($code -in 1641, 3010) {
            Write-Host 'Redemarrez le PC puis reconnectez-vous. V2 OCR reprendra automatiquement.'
            return $false
        }
        $desktop = Find-Desktop
        if ($code -ne 0 -or -not $desktop) { throw "Installation de Docker Desktop impossible (code $code)." }
    }
    $script:V2OcrDockerExe = Join-Path (Split-Path $desktop) 'resources\bin\docker.exe'
    if (-not (Test-LinuxDocker)) {
        Write-Host 'Demarrage de Docker Desktop...'
        Start-Process -FilePath $desktop | Out-Null
        $deadline = (Get-Date).AddMinutes(5)
        while (-not (Test-LinuxDocker)) {
            if ((Get-Date) -ge $deadline) { throw 'Docker Desktop ne demarre pas en mode Linux WSL2. La reprise est conservee.' }
            Start-Sleep -Seconds 4
        }
    }
    $composeVersion = (& $script:V2OcrDockerExe --context desktop-linux compose version --short | Out-String).Trim()
    $versionMatch = [regex]::Match($composeVersion, '\d+\.\d+\.\d+')
    if ($LASTEXITCODE -ne 0 -or -not $versionMatch.Success -or [version]$versionMatch.Value -lt [version]'2.24.0') {
        throw 'La version de Docker Compose installee est incompatible avec cette distribution.'
    }
    return $true
}

function Assert-Vendor([string]$File, [string]$Publisher) {
    $signature = Get-AuthenticodeSignature -LiteralPath $File
    if ($signature.Status -ne 'Valid' -or
        $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false).Replace(',', '').TrimEnd('.') -ne $Publisher) {
        throw "Signature de l'installateur $Publisher invalide."
    }
}

function Docker {
    & $script:V2OcrDockerExe --context desktop-linux @args
    if ($LASTEXITCODE -ne 0) { throw "Docker : echec de $($args[0]) (code $LASTEXITCODE)." }
}

function Compose([string]$Release) {
    $env:OCR_STATE = $State
    Docker compose --project-name ocr_r2 --env-file (Join-Path $State 'local\.env') `
        -f (Join-Path $Release 'compose.yml') @args
}

function Untar([string]$File, [string]$Destination) {
    & tar.exe -xf $File -C $Destination
    if ($LASTEXITCODE -ne 0) { throw "Extraction impossible : $([IO.Path]::GetFileName($File))." }
}

function Expand-Release($Manifest) {
    $archive = Get-Archive 'runtime' $Manifest.archives.runtime
    $imagesArchive = Get-Archive 'images' $Manifest.archives.images
    $directory = Join-Path $Root "release-$($Manifest.archives.runtime.sha256)"
    if (-not (Test-Path -LiteralPath $directory)) {
        $temp = "$directory.part"
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
        New-Item -ItemType Directory -Path $temp | Out-Null
        Untar $archive $temp
        Move-Item -LiteralPath $temp -Destination $directory
    }
    $images = Read-Json (Join-Path $directory 'images.json')
    if (-not (Test-Images $images)) { Docker load -i $imagesArchive | Out-Host }
    if (-not (Test-Images $images)) { throw 'Empreinte des images Docker incorrecte.' }
    return $directory
}

function Test-Images($Images) {
    $prior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        foreach ($image in $Images.ids.PSObject.Properties) {
            $id = & $script:V2OcrDockerExe --context desktop-linux image inspect --format '{{.Id}}' $image.Name 2>$null
            if ($LASTEXITCODE -ne 0 -or $id -ne $image.Value) { return $false }
        }
        return $true
    } finally { $ErrorActionPreference = $prior }
}

function Set-LocalConfig([string]$Release) {
    foreach ($name in @('POSTGRES_PASSWORD', 'JWT_SECRET', 'ANON_KEY', 'SERVICE_ROLE_KEY',
        'PG_META_CRYPTO_KEY', 'DASHBOARD_USERNAME', 'DASHBOARD_PASSWORD', 'KONG_PORT')) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $State 'local') | Out-Null
    $helper = (Read-Json (Join-Path $Release 'images.json')).helper
    Docker run --rm --network none --pull never -e OCR_OFFLINE_INSTALL=1 `
        -v "${State}:/projet" -v "${Release}/assistant:/projet/local/assistant:ro" `
        $helper node /projet/local/assistant/assistant.mjs init | Out-Host
}

function Wait-Application {
    $deadline = (Get-Date).AddMinutes(3)
    do {
        & curl.exe -q --silent --fail --noproxy '*' --max-time 5 --output NUL "$AppUrl/auth/login"
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    throw "L'application ne repond pas."
}

function Start-App([string]$Release) {
    Compose $Release up -d --no-build --pull never --wait --wait-timeout 300
    Wait-Application
    $envFile = Join-Path $State 'local/.env'
    $anon = ((Get-Content -LiteralPath $envFile | Where-Object { $_ -like 'ANON_KEY=*' }) -split '=', 2)[1]
    if (-not $anon) { throw 'Cle locale Supabase absente.' }
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Headers @{apikey=$anon} `
        -Uri 'http://localhost:8000/auth/v1/health' | Out-Null
}

function Save-Volumes([string]$Release, [string]$Directory) {
    $helper = (Read-Json (Join-Path $Release 'images.json')).helper
    Compose $Release stop | Out-Host
    $hashes = @{}
    foreach ($volume in $VolumeNames) {
        Docker volume inspect $volume | Out-Null
        Docker run --rm --network none --pull never -v "${volume}:/data:ro" -v "${Directory}:/backup" `
            $helper tar -czf "/backup/$volume.tgz" -C /data . | Out-Host
        Docker run --rm --network none --pull never -v "${Directory}:/backup:ro" `
            $helper tar -tzf "/backup/$volume.tgz" | Out-Null
        $hashes[$volume] = (Get-FileHash -LiteralPath (Join-Path $Directory "$volume.tgz")).Hash
    }
    return $hashes
}

function Restore-Volumes($Journal) {
    $release = $Journal.baseline
    $helper = (Read-Json (Join-Path $release 'images.json')).helper
    foreach ($item in $Journal.hashes.PSObject.Properties) {
        if ((Get-FileHash -LiteralPath (Join-Path $Journal.backup "$($item.Name).tgz")).Hash -ne $item.Value) {
            throw "Sauvegarde endommagee. La restauration n'a pas commence."
        }
    }
    # The one-off import can survive a terminated PowerShell process.
    $runningImport = Docker ps -aq --filter "name=^/${MigrationContainer}$" --filter 'label=com.docker.compose.project=ocr_r2'
    if ($runningImport) { Docker rm -f $runningImport | Out-Null }
    Compose $Journal.target stop | Out-Host
    foreach ($item in $Journal.hashes.PSObject.Properties) {
        Docker volume inspect $item.Name | Out-Null
        Docker run --rm --network none --pull never -v "$($item.Name):/data" -v "$($Journal.backup):/backup:ro" `
            -e "ARCHIVE=$($item.Name).tgz" $helper sh -ec `
            'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf /backup/$ARCHIVE -C /data' | Out-Host
    }
    if ($Journal.previous) { Start-App $Journal.previous | Out-Host }
    else {
        foreach ($name in @('.migration-ok','.migration-etape1-ok')) {
            Remove-Item -LiteralPath (Join-Path $State "local/$name") -Force -ErrorAction SilentlyContinue
        }
    }
}

function Recover-Transaction {
    $journal = Read-Json "$Root\transaction.json"
    if (-not $journal) { return }
    $current = Read-Json "$Root\active.json"
    if (-not $current -or $current.sequence -ne $journal.sequence) {
        Write-Host 'Restauration de la sauvegarde avant reprise...'
        Restore-Volumes $journal
    }
    Remove-Item -LiteralPath "$Root\transaction.json"
}

function Read-Migration([string]$Release, [string]$Cipher, [string]$Directory) {
    if (Test-Path -LiteralPath $Directory) { Remove-Item -LiteralPath $Directory -Recurse -Force }
    New-Item -ItemType Directory -Path $Directory | Out-Null
    $helper = (Read-Json (Join-Path $Release 'images.json')).helper
    $secret = Read-Host -AsSecureString 'Code de migration fourni separement'
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $key | & $script:V2OcrDockerExe --context desktop-linux run --rm -i --network none --pull never `
            -v "${Cache}:/cache:ro" -v "${Directory}:/work" -v "${Release}:/release:ro" `
            $helper node /release/crypt.mjs decrypt "/cache/$([IO.Path]::GetFileName($Cipher))" /work/data.tar
        if ($LASTEXITCODE -ne 0) { throw 'Dechiffrement impossible. Verifiez votre code de migration.' }
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $key = $null
        $secret.Dispose()
    }
    $payload = Join-Path $Directory 'payload'
    New-Item -ItemType Directory -Path $payload | Out-Null
    Untar (Join-Path $Directory 'data.tar') $payload
    Remove-Item -LiteralPath (Join-Path $Directory 'data.tar')
    Compose $Release run --rm --no-deps --pull never -T -v "${payload}:/kit:ro" `
        assistant node archive.mjs verify /kit | Out-Host
    return $payload
}

function Apply-Release($Manifest, [string]$Release, $Previous, [string]$Cipher) {
    $work = Join-Path $Root 'migration-temp'
    try {
        $payload = if ($Cipher) { Read-Migration $Release $Cipher $work }
        $services = @('db','auth','rest','storage','meta','studio','kong')
        if (-not $Previous) {
            Compose $Release up -d --no-build --pull never --wait --wait-timeout 300 @services | Out-Host
        }
        $baseline = if ($Previous) { $Previous.directory } else { $Release }
        $backup = Join-Path $Root ("backup-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $backup | Out-Null
        try { $hashes = Save-Volumes $baseline $backup }
        catch {
            if ($Previous) { Start-App $baseline | Out-Host }
            throw
        }
        $journal = @{
            sequence=$Manifest.sequence; previous=$Previous.directory; target=$Release
            baseline=$baseline; backup=$backup; hashes=$hashes
        }
        Write-Atomic "$Root\transaction.json" ($journal | ConvertTo-Json -Depth 4)
        if ($payload) {
            Compose $Release up -d --no-build --pull never --wait --wait-timeout 300 @services | Out-Host
            Compose $Release run --rm --no-deps --pull never -T --name $MigrationContainer -v "${payload}:/kit:ro" `
                assistant node archive.mjs import /kit | Out-Host
        }
        Start-App $Release | Out-Host
        $active = @{ sequence=$Manifest.sequence; version=$Manifest.version; directory=$Release; manifest=$manifestHash
                     migration=if ($Previous) { $Previous.migration } elseif ($Cipher) { $Manifest.archives.migration.sha256 } }
        Write-Atomic "$Root\active.json" ($active | ConvertTo-Json)
        Remove-Item -LiteralPath "$Root\transaction.json"
    } catch {
        $failure = $_
        Recover-Transaction
        throw $failure
    } finally {
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    }
}

function Complete-Installation {
    Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$Root\pending.json" -Force -ErrorAction SilentlyContinue
    Write-Host 'V2 OCR est pret.' -ForegroundColor Green
    Start-Process $AppUrl
}

if ($env:OS -ne 'Windows_NT' -or [version]$PSVersionTable.PSVersion -lt [version]'5.1' -or
    -not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw 'Windows PowerShell 64 bits sur Windows x64 est requis.'
}
if ($ReleaseUrl.StartsWith('__')) { throw 'Cet installateur doit etre genere par le preparateur de distribution.' }
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue) -or -not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw 'Cette version de Windows ne contient pas curl.exe et tar.exe.'
}
$mutex = New-Object Threading.Mutex($false, "Local\$Task")
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { Write-Host 'Une installation V2 OCR est deja en cours.'; return }
    Open-PrivateDirectory $Root
    New-Item -ItemType Directory -Force -Path $State,$Cache | Out-Null
    if ($SourceText) { Write-Atomic $Bootstrap $SourceText }
    $active = Read-Json "$Root\active.json"
    $envelope = if (-not $SourceText -and (Test-Path -LiteralPath "$Root\pending.json")) {
        Get-Content -LiteralPath "$Root\pending.json" -Raw
    } else {
        $prior = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $remote = & curl.exe -q --silent --show-error --fail --proto '=https' --connect-timeout 15 `
                --max-time 45 --retry 2 --max-filesize 2097152 $ReleaseUrl
            $code = $LASTEXITCODE
        } finally { $ErrorActionPreference = $prior }
        if ($code -eq 0) { $remote -join "`n" }
        elseif (Test-Path -LiteralPath "$Root\pending.json") { Get-Content "$Root\pending.json" -Raw }
        elseif (Test-Path -LiteralPath "$Root\last-good.json") { Get-Content "$Root\last-good.json" -Raw }
        else { throw 'La distribution V2 OCR est indisponible. Relancez la commande apres avoir verifie la connexion.' }
    }
    $manifest = Read-Manifest $envelope
    if ([int](Get-CimInstance Win32_OperatingSystem).BuildNumber -lt 22631) {
        throw 'Windows 11 version 23H2 (build 22631) ou ulterieure est requis.'
    }
    if ($active -and $manifest.sequence -lt $active.sequence) { throw 'Version anterieure refusee.' }
    $manifestHash = $null
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $payload = [Convert]::FromBase64String(($envelope | ConvertFrom-Json).payload)
        $manifestHash = [BitConverter]::ToString($sha.ComputeHash($payload)).Replace('-', '').ToLowerInvariant()
    } finally { $sha.Dispose() }
    if ($active -and $manifest.sequence -eq $active.sequence -and $manifestHash -ne $active.manifest) {
        throw 'Numero de publication deja utilise.'
    }
    Write-Atomic "$Root\pending.json" $envelope
    Enable-Resume
    if (-not $active -or $manifest.sequence -gt $active.sequence) {
        if ($active -and $manifest.archives.migration -and $active.migration -ne $manifest.archives.migration.sha256) {
            throw 'La migration fournie remplacerait des donnees locales. Contactez votre prestataire.'
        }
        $need = @('runtime','images')
        if (-not $active -and $manifest.archives.migration) { $need += 'migration' }
        if (-not (Find-Desktop) -and $manifest.archives.docker) { $need += 'docker' }
        $wsl = Read-WslVersion
        if ((-not $wsl -or $wsl -lt [version]'2.1.5') -and $manifest.archives.wsl) { $need += 'wsl' }
        foreach ($name in $need) { Get-Archive $name $manifest.archives.$name | Out-Null }
    }
    if (-not (Install-Prerequisites $manifest)) { return }
    Recover-Transaction
    $stalePlaintext = Join-Path $Root 'migration-temp'
    if (Test-Path -LiteralPath $stalePlaintext) { Remove-Item -LiteralPath $stalePlaintext -Recurse -Force }
    if (-not $active -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'OCR-installation/dossier.txt'))) {
        throw 'Une ancienne installation OCR a ete detectee. Contactez votre prestataire pour la reprendre avec ses donnees.'
    }
    if ($active -and $manifest.sequence -eq $active.sequence) {
        Start-App $active.directory | Out-Host
    } else {
        Write-Host "Preparation de V2 OCR $($manifest.version)..."
        $cipher = $null
        if ($manifest.archives.migration) {
            if (-not $active) { $cipher = Get-Archive 'migration' $manifest.archives.migration }
        }
        $release = Expand-Release $manifest
        Set-LocalConfig $release
        Apply-Release $manifest $release $active $cipher
    }
    Write-Atomic "$Root\last-good.json" $envelope
    Complete-Installation
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    throw
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
}
& $installer -SourceText ('$installer = {' + $installer.ToString() + "`n}" + "`n" + '& $installer')
