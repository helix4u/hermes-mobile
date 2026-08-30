[CmdletBinding()]
param(
    [int]$Port = 9129,
    [int]$ProxyPort = 9130,
    [string]$TailnetHost = '',
    [string]$TaskName = 'Hermes_Mobile_Server',
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [string]$HermesExecutable = '',
    [ValidateSet('desktop', 'persistent', 'manual')]
    [string]$StartupMode = 'persistent'
)

$ErrorActionPreference = 'Stop'

if (-not $HermesExecutable) {
    $HermesExecutable = Join-Path $HermesHome 'hermes-agent\venv\Scripts\hermes.exe'
}
if (-not (Test-Path -LiteralPath $HermesExecutable)) {
    throw "Hermes executable not found: $HermesExecutable"
}

$runner = Join-Path $PSScriptRoot 'run-mobile-server.ps1'
$hiddenRunner = Join-Path $PSScriptRoot 'run-hidden.vbs'
$manager = Join-Path $PSScriptRoot 'manage-mobile-server.ps1'
$proxyScript = Join-Path $PSScriptRoot 'mobile_proxy.py'
$profilePluginLinker = Join-Path $PSScriptRoot 'link-profile-plugins.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
    throw "Mobile server runner not found: $runner"
}
if (-not (Test-Path -LiteralPath $manager)) {
    throw "Mobile server manager not found: $manager"
}
if (-not (Test-Path -LiteralPath $hiddenRunner)) {
    throw "Hidden process runner not found: $hiddenRunner"
}
if (-not (Test-Path -LiteralPath $profilePluginLinker)) {
    throw "Profile plugin linker not found: $profilePluginLinker"
}

$profiles = @('default')
$profilesRoot = Join-Path $HermesHome 'profiles'
if (Test-Path -LiteralPath $profilesRoot -PathType Container) {
    $profiles += @(
        Get-ChildItem -LiteralPath $profilesRoot -Directory |
            Where-Object { $_.Name -match '^[a-z0-9][a-z0-9_-]{0,63}$' } |
            Select-Object -ExpandProperty Name
    )
}
foreach ($profileName in ($profiles | Sort-Object -Unique)) {
    & $profilePluginLinker `
        -Profile $profileName `
        -HermesHome $HermesHome `
        -HermesExecutable $HermesExecutable
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    $existingActions = @($existing.Actions | ForEach-Object {
        "$($_.Execute) $($_.Arguments)"
    })
    if (-not ($existingActions -match [regex]::Escape($runner))) {
        throw "Refusing to replace unrelated scheduled task: $TaskName"
    }
}

& $manager -Action Stop -Port $Port -ProxyPort $ProxyPort -TaskName $TaskName -Runner $runner | Out-Null

$powerShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
if (-not (Test-Path -LiteralPath $wscript)) {
    throw "Windows Script Host executable not found: $wscript"
}
$powerShellArguments = @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    "`"$runner`"",
    '-Port',
    $Port.ToString(),
    '-ProxyPort',
    $ProxyPort.ToString(),
    '-HermesHome',
    "`"$HermesHome`""
) -join ' '
if ($TailnetHost) {
    $powerShellArguments = "$powerShellArguments -TailnetHost `"$TailnetHost`""
}
if ($HermesExecutable) {
    $powerShellArguments = "$powerShellArguments -HermesExecutable `"$HermesExecutable`""
}
$desktopIsRunning = $null
if ($StartupMode -eq 'desktop') {
    $agentRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $HermesExecutable))
    $runningDesktop = @(
        Get-CimInstance Win32_Process -Filter "Name = 'Hermes.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ExecutablePath -and
                ([string]$_.ExecutablePath).EndsWith(
                    'apps\desktop\release\win-unpacked\Hermes.exe',
                    [StringComparison]::OrdinalIgnoreCase
                )
            }
    ) | Select-Object -First 1
    $desktopExecutable = if ($runningDesktop) {
        [string]$runningDesktop.ExecutablePath
    } else {
        Join-Path $agentRoot 'apps\desktop\release\win-unpacked\Hermes.exe'
    }
    if (-not (Test-Path -LiteralPath $desktopExecutable)) {
        throw "Desktop-bound startup requires the packaged Desktop executable: $desktopExecutable"
    }
    $desktopIsRunning = [bool]$runningDesktop
    $powerShellArguments = "$powerShellArguments -DesktopExecutable `"$desktopExecutable`""
}

$arguments = "//B //NoLogo `"$hiddenRunner`" `"$powerShell`" $powerShellArguments"

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
    -Execute $wscript `
    -Argument $arguments `
    -WorkingDirectory $PSScriptRoot
$triggers = @()
if ($StartupMode -in @('desktop', 'persistent')) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $identity
}
if ($StartupMode -eq 'desktop') {
    # The desktop-bound runner keeps only one hidden idle supervisor while
    # Desktop is closed; both loopback listeners still retire. This recurring
    # trigger recovers the supervisor if it is killed independently.
    # MultipleInstances=IgnoreNew makes each tick a no-op while the healthy
    # runner is either idle or supervising the backend and proxy.
    $triggers += New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1)
}
$principal = New-ScheduledTaskPrincipal `
    -UserId $identity `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$register = @{
    TaskName = $TaskName
    Action = $action
    Principal = $principal
    Settings = $settings
    Description = "Hermes Mobile loopback backend. Startup mode: $StartupMode. Manage with scripts/mobile_host.py."
    Force = $true
}
if ($triggers.Count -gt 0) {
    $register.Trigger = $triggers
}
Register-ScheduledTask @register | Out-Null

Start-ScheduledTask -TaskName $TaskName

if ($StartupMode -eq 'desktop' -and -not $desktopIsRunning) {
    Write-Host "Hermes Mobile server is registered and waiting for packaged Desktop (startup: $StartupMode)"
    return
}

$deadline = [DateTimeOffset]::Now.AddSeconds(45)
do {
    $backendListener = Get-NetTCPConnection `
        -LocalAddress 127.0.0.1 `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue
    $proxyListener = Get-NetTCPConnection `
        -LocalAddress 127.0.0.1 `
        -LocalPort $ProxyPort `
        -State Listen `
        -ErrorAction SilentlyContinue
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($backendListener -and $proxyListener -and $task.State -eq 'Running') {
        break
    }
    Start-Sleep -Milliseconds 500
} while ([DateTimeOffset]::Now -lt $deadline)

if (-not $backendListener -or -not $proxyListener -or $task.State -ne 'Running') {
    $stateDirectory = Join-Path $HermesHome 'mobile-server'
    throw "Hermes Mobile server did not stabilize on ports $Port and $ProxyPort. Check $stateDirectory"
}

Write-Host "Hermes Mobile server is listening on 127.0.0.1:$Port with proxy 127.0.0.1:$ProxyPort (startup: $StartupMode)"
