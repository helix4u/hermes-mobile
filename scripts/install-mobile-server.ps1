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
$manager = Join-Path $PSScriptRoot 'manage-mobile-server.ps1'
$proxyScript = Join-Path $PSScriptRoot 'mobile_proxy.py'
if (-not (Test-Path -LiteralPath $runner)) {
    throw "Mobile server runner not found: $runner"
}
if (-not (Test-Path -LiteralPath $manager)) {
    throw "Mobile server manager not found: $manager"
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
$arguments = @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
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
    $arguments = "$arguments -TailnetHost `"$TailnetHost`""
}
if ($HermesExecutable) {
    $arguments = "$arguments -HermesExecutable `"$HermesExecutable`""
}
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
    $arguments = "$arguments -DesktopExecutable `"$desktopExecutable`""
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument $arguments `
    -WorkingDirectory $PSScriptRoot
$triggers = @()
if ($StartupMode -in @('desktop', 'persistent')) {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $identity
}
if ($StartupMode -eq 'desktop') {
    # A desktop-bound runner exits completely when Desktop closes, so no
    # listener or waiting wrapper survives. Task Scheduler's one-minute
    # recurring trigger is the plugin-owned launch seam when Desktop later
    # opens. MultipleInstances=IgnoreNew makes each tick a no-op while the
    # healthy runner is already supervising the backend and proxy.
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
