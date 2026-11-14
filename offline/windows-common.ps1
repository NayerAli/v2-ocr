# Shared Windows PowerShell 5.1 helpers. Dot-source only in the caller's private scope.
function Write-Utf8([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}
function Protect-Directory([string]$Path) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    foreach ($id in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
            (New-Object Security.Principal.SecurityIdentifier($id)), 'FullControl',
            'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Unprotect-Text([Security.SecureString]$Secret) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Quote-Argument([string]$Value) {
    # CommandLineToArgvW quoting, including literal quotes and trailing backslashes.
    '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}
function Invoke-Tool {
    param([string]$Exe, [string[]]$Arguments, [int]$Timeout = 60, [int]$Idle = 0,
        [string]$ProgressFile, [string]$InputText, [hashtable]$Environment = @{},
        [switch]$Capture, [switch]$Interactive)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Exe
    $info.Arguments = ($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = -not $Interactive
    $info.RedirectStandardOutput = -not $Interactive
    $info.RedirectStandardError = -not $Interactive
    $info.RedirectStandardInput = -not $Interactive
    foreach ($name in $Environment.Keys) { $info.EnvironmentVariables[$name] = $Environment[$name] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $output = New-Object 'Collections.Generic.List[string]'
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $activity = [double]0
    $length = [long]-1
    try {
        if (-not $process.Start()) { throw "Impossible de lancer $Exe." }
        if (-not $Interactive) {
            if ($InputText) { $process.StandardInput.WriteLine($InputText) }
            $process.StandardInput.Close()
            $out = $process.StandardOutput.ReadLineAsync()
            $err = $process.StandardError.ReadLineAsync()
        }
        do {
            if (-not $Interactive) {
                foreach ($stream in @('out', 'err')) {
                    $read = Get-Variable $stream -ValueOnly
                    if ($read -and $read.IsCompleted) {
                        $line = $read.GetAwaiter().GetResult()
                        if ($null -ne $line) {
                            $activity = $clock.Elapsed.TotalSeconds
                            if ($Capture -and $stream -eq 'out') { $output.Add($line) }
                            else { Write-Host $line }
                            $reader = if ($stream -eq 'out') { $process.StandardOutput } else { $process.StandardError }
                            Set-Variable $stream ($reader.ReadLineAsync())
                        } else { Set-Variable $stream $null }
                    }
                }
            }
            if ($ProgressFile -and (Test-Path -LiteralPath $ProgressFile)) {
                $newLength = (Get-Item -LiteralPath $ProgressFile).Length
                if ($newLength -ne $length) { $activity = $clock.Elapsed.TotalSeconds; $length = $newLength }
            }
            if (($Timeout -gt 0 -and $clock.Elapsed.TotalSeconds -ge $Timeout) -or
                ($Idle -gt 0 -and $clock.Elapsed.TotalSeconds - $activity -ge $Idle)) {
                throw "Delai depasse : $([IO.Path]::GetFileName($Exe)) $($Arguments[0]) (limite ${Timeout}s, inactivite ${Idle}s)."
            }
            if ($process.HasExited -and ($Interactive -or (-not $out -and -not $err))) { break }
            Start-Sleep -Milliseconds 40
        } while ($true)
        if ($process.ExitCode -ne 0) { throw "Echec : $([IO.Path]::GetFileName($Exe)) $($Arguments[0]) (code $($process.ExitCode))." }
        if ($Capture) { return $output.ToArray() }
    } finally {
        if ($process.Id -and -not $process.HasExited) { $process.Kill(); [void]$process.WaitForExit(5000) }
        $process.Dispose()
    }
}
